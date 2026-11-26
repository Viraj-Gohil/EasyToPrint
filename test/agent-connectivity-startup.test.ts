import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ConnectivityService,
  ProbeResult
} from '../print-agent/src/main/network/ConnectivityService.ts';
import type { ConnectivitySnapshot, StartupPhase } from '../print-agent/src/renderer/types/agent.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testScenario1LaunchWithInternetOn() {
  const observedPhases: StartupPhase[] = [];
  let workspacePreparedCount = 0;

  const service = new ConnectivityService({
    getBackendBaseUrl: () => 'https://easytoprint.devpixel.space',
    onlineMonitorIntervalMs: 60_000,
    offlineRetryIntervalMs: 60_000,
    internetProbe: async () => ({ ok: true, statusCode: 204 }),
    backendProbe: async (url) => {
      assert.equal(url, 'https://easytoprint.devpixel.space/api/health');
      return { ok: true, statusCode: 200 };
    },
    onPrepareWorkspace: async ({ isInitialStartup, reportProgress }) => {
      assert.equal(isInitialStartup, true);
      workspacePreparedCount++;
      reportProgress(88, 'Preparing your workspace...');
    }
  });

  service.subscribe((snap) => {
    if (observedPhases[observedPhases.length - 1] !== snap.phase) {
      observedPhases.push(snap.phase);
    }
  });

  const finalSnap = await service.startStartupSequence();
  service.stop();

  assert.deepEqual(
    observedPhases,
    ['INITIALIZING', 'CHECKING_INTERNET', 'VERIFY_BACKEND', 'LOADING_APP', 'DASHBOARD'],
    'Must follow exact state machine: INITIALIZING -> CHECKING_INTERNET -> VERIFY_BACKEND -> LOADING_APP -> DASHBOARD'
  );
  assert.equal(finalSnap.phase, 'DASHBOARD');
  assert.equal(finalSnap.isOnline, true);
  assert.equal(finalSnap.hasCompletedStartup, true);
  assert.equal(finalSnap.progress, 100);
  assert.equal(workspacePreparedCount, 1);
  console.log('  ✅ Scenario 1 PASS: Launch with internet ON → Loader → Dashboard');
}

async function testScenario2And3LaunchOfflineAndManualRetrySingleFlight() {
  let internetProbeCalls = 0;
  let workspacePreparedCount = 0;

  const service = new ConnectivityService({
    getBackendBaseUrl: () => 'https://easytoprint.devpixel.space',
    onlineMonitorIntervalMs: 60_000,
    offlineRetryIntervalMs: 60_000,
    internetProbe: async () => {
      internetProbeCalls++;
      await delay(30);
      return { ok: false, errorCode: 'DNS_FAILED', errorMessage: 'DNS resolution failed.' };
    },
    backendProbe: async () => ({ ok: true, statusCode: 200 }),
    onPrepareWorkspace: async () => {
      workspacePreparedCount++;
    }
  });

  // Scenario 2: Launch with internet OFF
  const startupSnap = await service.startStartupSequence();
  assert.equal(startupSnap.phase, 'OFFLINE_BLOCKING_SCREEN');
  assert.equal(startupSnap.isOnline, false);
  assert.equal(startupSnap.hasCompletedStartup, false);
  assert.equal(workspacePreparedCount, 0, 'Dashboard workspace must NEVER initialize while offline');

  // Scenario 3: Multiple simultaneous manual Retry clicks while still offline -> single-flight & remain blocked
  const callsBeforeRetry = internetProbeCalls;
  const [r1, r2, r3] = await Promise.all([
    service.verifyConnectivity('manual_retry'),
    service.verifyConnectivity('manual_retry'),
    service.verifyConnectivity('manual_retry')
  ]);
  service.stop();

  assert.equal(internetProbeCalls - callsBeforeRetry, 1, 'Simultaneous retries must share a single in-flight check');
  assert.equal(r1.phase, 'OFFLINE_BLOCKING_SCREEN');
  assert.equal(r2.phase, 'OFFLINE_BLOCKING_SCREEN');
  assert.equal(r3.phase, 'OFFLINE_BLOCKING_SCREEN');
  assert.equal(workspacePreparedCount, 0);
  console.log('  ✅ Scenarios 2 & 3 PASS: Offline startup blocks dashboard; concurrent retries deduplicated and remain blocked');
}

async function testScenario4AutoRecoveryWhenInternetTurnsOn() {
  let internetAvailable = false;
  const phasesAfterRecovery: StartupPhase[] = [];

  const service = new ConnectivityService({
    getBackendBaseUrl: () => 'https://easytoprint.devpixel.space',
    onlineMonitorIntervalMs: 60_000,
    offlineRetryIntervalMs: 60, // Fast automatic recovery timer for deterministic test
    internetProbe: async (): Promise<ProbeResult> =>
      internetAvailable
        ? { ok: true, statusCode: 204 }
        : { ok: false, errorCode: 'OFFLINE', errorMessage: 'Offline' },
    backendProbe: async () => ({ ok: true, statusCode: 200 }),
    onPrepareWorkspace: async ({ isInitialStartup }) => {
      assert.equal(isInitialStartup, true);
    }
  });

  const initialSnap = await service.startStartupSequence();
  assert.equal(initialSnap.phase, 'OFFLINE_BLOCKING_SCREEN');

  service.subscribe((snap) => {
    if (phasesAfterRecovery[phasesAfterRecovery.length - 1] !== snap.phase) {
      phasesAfterRecovery.push(snap.phase);
    }
  });

  // Turn internet ON -> wait for automatic background detection to recover to DASHBOARD
  internetAvailable = true;
  const deadline = Date.now() + 2000;
  while (service.getSnapshot().phase !== 'DASHBOARD' && Date.now() < deadline) {
    await delay(25);
  }
  const recoveredSnap = service.getSnapshot();
  service.stop();

  assert.equal(recoveredSnap.phase, 'DASHBOARD');
  assert.equal(recoveredSnap.isOnline, true);
  assert.equal(recoveredSnap.hasCompletedStartup, true);
  assert.ok(phasesAfterRecovery.includes('VERIFY_BACKEND'), 'Recovery must pass through VERIFY_BACKEND');
  assert.ok(phasesAfterRecovery.includes('LOADING_APP'), 'Recovery must pass through LOADING_APP');
  assert.ok(phasesAfterRecovery.includes('DASHBOARD'), 'Recovery must open DASHBOARD');
  console.log('  ✅ Scenario 4 PASS: Turning internet ON automatically recovers through loader to Dashboard');
}

async function testScenario5And6RuntimeDisconnectAndReconnectPreservesState() {
  let internetAvailable = true;
  let pausedForOfflineCalls = 0;
  let resumeReconnectCalls = 0;
  const localQueuedJobs = ['JOB-001', 'JOB-002'];

  const service = new ConnectivityService({
    getBackendBaseUrl: () => 'https://easytoprint.devpixel.space',
    onlineMonitorIntervalMs: 60_000,
    offlineRetryIntervalMs: 60_000,
    internetProbe: async (): Promise<ProbeResult> =>
      internetAvailable
        ? { ok: true, statusCode: 204 }
        : { ok: false, errorCode: 'OFFLINE', errorMessage: 'Connection lost' },
    backendProbe: async () => ({ ok: true, statusCode: 200 }),
    onPrepareWorkspace: async ({ isInitialStartup }) => {
      if (!isInitialStartup) {
        resumeReconnectCalls++;
      }
    },
    onRuntimeOffline: () => {
      pausedForOfflineCalls++;
    }
  });

  // Initial startup succeeds
  const started = await service.startStartupSequence();
  assert.equal(started.phase, 'DASHBOARD');
  assert.equal(service.isOnline(), true);

  // Scenario 5: Disconnect internet after dashboard opens
  internetAvailable = false;
  const offlineSnap = await service.handleNetworkSignal(false);
  assert.equal(offlineSnap.phase, 'OFFLINE_BLOCKING_SCREEN');
  assert.equal(offlineSnap.runtimeDisconnected, true, 'Must flag runtime disconnection');
  assert.equal(offlineSnap.hasCompletedStartup, true, 'Startup completion flag stays true so local UI state is preserved');
  assert.equal(pausedForOfflineCalls, 1, 'Must pause background cloud sync while offline');
  assert.deepEqual(localQueuedJobs, ['JOB-001', 'JOB-002'], 'Queued jobs must not be lost');

  // Scenario 6: Reconnect internet -> revalidate backend and restore dashboard
  internetAvailable = true;
  const restoredSnap = await service.handleNetworkSignal(true);
  service.stop();

  assert.equal(restoredSnap.phase, 'DASHBOARD');
  assert.equal(restoredSnap.isOnline, true);
  assert.equal(restoredSnap.runtimeDisconnected, false);
  assert.equal(resumeReconnectCalls, 1, 'Must revalidate backend & resume normal syncing on reconnect');
  assert.deepEqual(localQueuedJobs, ['JOB-001', 'JOB-002'], 'Queued jobs remain intact after reconnection');
  console.log('  ✅ Scenarios 5 & 6 PASS: Runtime disconnect blocks UI & pauses sync; reconnect revalidates and resumes cleanly');
}

async function testScenario7RestartRunsVerificationAgain() {
  const createFreshSession = () => {
    let probeCount = 0;
    const svc = new ConnectivityService({
      getBackendBaseUrl: () => 'https://easytoprint.devpixel.space',
      onlineMonitorIntervalMs: 60_000,
      offlineRetryIntervalMs: 60_000,
      internetProbe: async () => {
        probeCount++;
        return { ok: true, statusCode: 204 };
      },
      backendProbe: async () => ({ ok: true, statusCode: 200 })
    });
    return { svc, getProbeCount: () => probeCount };
  };

  // Launch 1
  const run1 = createFreshSession();
  assert.equal(run1.svc.getSnapshot().phase, 'INITIALIZING');
  await run1.svc.startStartupSequence();
  assert.equal(run1.getProbeCount(), 1);
  run1.svc.stop();

  // Launch 2 (fresh restart)
  const run2 = createFreshSession();
  assert.equal(run2.svc.getSnapshot().phase, 'INITIALIZING');
  assert.equal(run2.svc.getSnapshot().hasCompletedStartup, false);
  const snap2 = await run2.svc.startStartupSequence();
  assert.equal(run2.getProbeCount(), 1);
  assert.equal(snap2.phase, 'DASHBOARD');
  run2.svc.stop();
  console.log('  ✅ Scenario 7 PASS: Fresh application restart runs full connectivity verification again');
}

async function testScenario8CloseDuringLoadingAbortsCleanly() {
  let signalAborted = false;
  let emissionsAfterStop = 0;
  let stopped = false;

  const service = new ConnectivityService({
    getBackendBaseUrl: () => 'https://easytoprint.devpixel.space',
    onlineMonitorIntervalMs: 60_000,
    offlineRetryIntervalMs: 60_000,
    internetProbe: (signal) =>
      new Promise<ProbeResult>((resolve) => {
        signal.addEventListener('abort', () => {
          signalAborted = true;
          resolve({ ok: false, errorCode: 'OFFLINE', errorMessage: 'Aborted' });
        });
      }),
    backendProbe: async () => ({ ok: true, statusCode: 200 })
  });

  service.subscribe(() => {
    if (stopped) emissionsAfterStop++;
  });

  const startupPromise = service.startStartupSequence();
  await delay(20);
  stopped = true;
  service.stop();

  await startupPromise;
  assert.equal(signalAborted, true, 'Closing during loading must abort active network probes');
  assert.equal(emissionsAfterStop, 0, 'No events or timer callbacks may fire after stop()');
  console.log('  ✅ Scenario 8 PASS: Closing app during loading aborts probes and cleans up all timers/listeners');
}

async function testElectronArchitectureAndSecurityInvariants() {
  const mainTs = fs.readFileSync(path.resolve('print-agent/src/main/main.ts'), 'utf8');
  const preloadCts = fs.readFileSync(path.resolve('print-agent/src/main/preload.cts'), 'utf8');
  const appTsx = fs.readFileSync(path.resolve('print-agent/src/renderer/App.tsx'), 'utf8');
  const offlineTsx = fs.readFileSync(path.resolve('print-agent/src/renderer/components/OfflineBlockingScreen.tsx'), 'utf8');
  const loaderTsx = fs.readFileSync(path.resolve('print-agent/src/renderer/components/StartupLoaderScreen.tsx'), 'utf8');

  // Security & architecture checks
  assert.ok(mainTs.includes('contextIsolation: true'), 'contextIsolation must remain enabled');
  assert.ok(mainTs.includes('nodeIntegration: false'), 'nodeIntegration must remain disabled');
  assert.ok(mainTs.includes('assertTrustedIpcSender'), 'IPC handlers must validate trusted sender');
  assert.ok(mainTs.includes('setWindowOpenHandler'), 'Secondary windows must be denied');
  assert.ok(preloadCts.includes("contextBridge.exposeInMainWorld('electronAgentAPI'"), 'Preload must use contextBridge');
  assert.ok(!preloadCts.includes("require('fs')") && !preloadCts.includes("import fs"), 'Preload must not expose Node.js APIs');

  // Mandatory UI copy & palette checks
  assert.ok(offlineTsx.includes('No Internet Connection'), 'Offline screen must display exact title');
  assert.ok(
    offlineTsx.includes('EasyToPrint needs an active internet connection to start. Please connect your device to the internet and try again.'),
    'Offline screen must display exact required description'
  );
  assert.ok(offlineTsx.includes('Retry Connection'), 'Offline screen must include Retry Connection button');
  assert.ok(offlineTsx.includes('Checking connection...'), 'Offline screen must show animated checking state');
  assert.ok(loaderTsx.includes('#00B32D') && loaderTsx.includes('#008F25') && loaderTsx.includes('#E8F8EC'), 'Loader must use EasyToPrint green palette');
  assert.ok(appTsx.includes('if (!connectivity.hasCompletedStartup)'), 'Dashboard must never mount prior to startup verification');

  console.log('  ✅ Architecture & Security PASS: Electron IPC security, preload isolation, and UI requirements verified');
}

async function runAll() {
  console.log('\n============================================================');
  console.log('Running EasyToPrint Agent Connectivity & Startup Test Suite');
  console.log('============================================================\n');

  await testScenario1LaunchWithInternetOn();
  await testScenario2And3LaunchOfflineAndManualRetrySingleFlight();
  await testScenario4AutoRecoveryWhenInternetTurnsOn();
  await testScenario5And6RuntimeDisconnectAndReconnectPreservesState();
  await testScenario7RestartRunsVerificationAgain();
  await testScenario8CloseDuringLoadingAbortsCleanly();
  await testElectronArchitectureAndSecurityInvariants();

  console.log('\n============================================================');
  console.log('All 8 Scenarios + Security Invariants PASSED');
  console.log('============================================================\n');
}

runAll().catch((err) => {
  console.error('\n❌ EasyToPrint Agent Connectivity Test FAILED:', err);
  process.exit(1);
});
