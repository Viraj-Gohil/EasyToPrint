import http from 'http';
import https from 'https';
import {
  ConnectivityErrorCode,
  ConnectivitySnapshot,
  StartupPhase
} from '../../renderer/types/agent.js';

export interface ProbeResult {
  ok: boolean;
  statusCode?: number;
  errorCode?: ConnectivityErrorCode;
  errorMessage?: string;
  endpoint?: string;
}

export type ConnectivityReason = 'startup' | 'manual_retry' | 'network_event' | 'runtime_probe';

export interface ConnectivityServiceOptions {
  /** Returns the configured EasyToPrint server base URL (e.g. https://easytoprint.devpixel.space) */
  getBackendBaseUrl: () => string;
  /** Optional explicit health check URL override (e.g. from AGENT_HEALTH_CHECK_URL env) */
  healthCheckUrlOverride?: string;
  /** Per-request HTTPS probe timeout in ms (default: 4500ms) */
  probeTimeoutMs?: number;
  /** Continuous runtime health check interval when online in ms (default: 12000ms) */
  onlineMonitorIntervalMs?: number;
  /** Automatic network restoration polling interval when offline in ms (default: 4000ms) */
  offlineRetryIntervalMs?: number;
  /** Optional hook called during LOADING_APP before entering DASHBOARD (starts or resumes agent services) */
  onPrepareWorkspace?: (context: { isInitialStartup: boolean; reportProgress: (progress: number, message: string) => void }) => Promise<void>;
  /** Optional hook called when runtime connectivity transitions from online -> offline */
  onRuntimeOffline?: () => void;
  /** Optional custom logger callback */
  onLog?: (level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: Record<string, unknown>) => void;
  /** Injectable internet probe for deterministic testing */
  internetProbe?: (signal: AbortSignal) => Promise<ProbeResult>;
  /** Injectable backend probe for deterministic testing */
  backendProbe?: (healthUrl: string, signal: AbortSignal) => Promise<ProbeResult>;
}

const DEFAULT_PUBLIC_HTTPS_PROBES = [
  'https://www.gstatic.com/generate_204',
  'https://1.1.1.1/cdn-cgi/trace',
  'https://clients3.google.com/generate_204'
];

function classifyNetworkError(err: any): { errorCode: ConnectivityErrorCode; errorMessage: string } {
  const code = String(err?.code || err?.cause?.code || '').toUpperCase();
  const msg = String(err?.message || '').toLowerCase();

  if (code === 'ABORT_ERR' || code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || msg.includes('timeout') || msg.includes('timed out')) {
    return {
      errorCode: 'TIMEOUT',
      errorMessage: 'Connection timed out while checking internet access.'
    };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_FAIL' || code === 'EAI_NONAME' || msg.includes('enotfound')) {
    return {
      errorCode: 'DNS_FAILED',
      errorMessage: 'Unable to resolve server address. Please check your internet connection.'
    };
  }
  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'ENETDOWN' || code === 'ECONNRESET') {
    return {
      errorCode: 'OFFLINE',
      errorMessage: 'No active internet connection detected.'
    };
  }
  if (code === 'ECONNREFUSED') {
    return {
      errorCode: 'CONNECTION_REFUSED',
      errorMessage: 'Unable to reach EasyToPrint servers.'
    };
  }
  if (code.includes('CERT') || code.includes('TLS') || code.includes('SSL') || msg.includes('certificate')) {
    return {
      errorCode: 'TLS_ERROR',
      errorMessage: 'Secure HTTPS connection could not be established.'
    };
  }

  return {
    errorCode: 'OFFLINE',
    errorMessage: 'Unable to verify internet connection.'
  };
}

/**
 * Performs a non-blocking HTTP(S) probe with strict timeout and AbortSignal cancellation.
 * Never exposes sensitive headers or credentials.
 */
export function executeHttpProbe(
  targetUrl: string,
  timeoutMs: number,
  signal: AbortSignal,
  method: 'HEAD' | 'GET' = 'GET'
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve({ ok: false, errorCode: 'OFFLINE', errorMessage: 'Connectivity check cancelled.' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      resolve({ ok: false, errorCode: 'UNKNOWN', errorMessage: 'Invalid connectivity check endpoint.' });
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (!isHttps && !(parsed.protocol === 'http:' && isLocalhost)) {
      resolve({ ok: false, errorCode: 'TLS_ERROR', errorMessage: 'Only HTTPS connectivity endpoints are permitted.' });
      return;
    }

    let settled = false;
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const transport = isHttps ? https : http;
    const req = transport.request(
      parsed,
      {
        method,
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'EasyToPrint-Agent-Connectivity/1.4',
          'Cache-Control': 'no-cache, no-store',
          Pragma: 'no-cache',
          Connection: 'close'
        }
      },
      (res) => {
        // Drain response body so the underlying socket closes cleanly without leaking handles
        res.resume();
        const statusCode = res.statusCode ?? 0;
        // 2xx/3xx/4xx proves genuine TCP + TLS + HTTP roundtrip; 503 on /api/health still proves reachable host
        const ok = statusCode >= 200 && statusCode < 500;
        finish({
          ok,
          statusCode,
          endpoint: parsed.origin,
          ...(ok
            ? {}
            : {
                errorCode: 'BACKEND_UNREACHABLE',
                errorMessage: `Server returned status ${statusCode}.`
              })
        });
      }
    );

    const onAbort = () => {
      try {
        req.destroy(new Error('Aborted'));
      } catch {}
      finish({ ok: false, errorCode: 'OFFLINE', errorMessage: 'Connectivity check cancelled.' });
    };

    signal.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      try {
        req.destroy(Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' }));
      } catch {}
      finish({
        ok: false,
        errorCode: 'TIMEOUT',
        errorMessage: 'Connection timed out while checking internet access.'
      });
    }, timeoutMs);
    if (timer.unref) timer.unref();

    req.on('error', (err) => {
      const classified = classifyNetworkError(err);
      finish({
        ok: false,
        errorCode: classified.errorCode,
        errorMessage: classified.errorMessage,
        endpoint: parsed.origin
      });
    });

    req.end();
  });
}

/**
 * Main-process connectivity verification and startup state machine.
 *
 * State Machine:
 *   INITIALIZING
 *       ↓
 *   CHECKING_INTERNET
 *       ↓
 *   CONNECTED?
 *     ├── YES → VERIFY_BACKEND → LOADING_APP → DASHBOARD
 *     └── NO  → OFFLINE_BLOCKING_SCREEN
 *                   ↓ (Manual Retry or Automatic Restoration)
 *               CHECKING_INTERNET → VERIFY_BACKEND → LOADING_APP → DASHBOARD
 */
export class ConnectivityService {
  private readonly options: ConnectivityServiceOptions;
  private readonly probeTimeoutMs: number;
  private readonly onlineMonitorIntervalMs: number;
  private readonly offlineRetryIntervalMs: number;

  private listeners = new Set<(snapshot: ConnectivitySnapshot) => void>();
  private inFlightCheck: Promise<ConnectivitySnapshot> | null = null;
  private activeAbortController: AbortController | null = null;
  private monitorTimer: NodeJS.Timeout | null = null;
  private disposed = false;
  private consecutiveOnlineFailures = 0;

  private state: ConnectivitySnapshot = {
    phase: 'INITIALIZING',
    isOnline: false,
    internetVerified: false,
    backendVerified: false,
    isChecking: true,
    hasCompletedStartup: false,
    progress: 12,
    statusMessage: 'Initializing EasyToPrint...',
    errorCode: null,
    errorMessage: null,
    lastCheckedAt: null,
    lastVerifiedAt: null,
    retryCount: 0,
    runtimeDisconnected: false
  };

  constructor(options: ConnectivityServiceOptions) {
    this.options = options;
    this.probeTimeoutMs = options.probeTimeoutMs ?? 4500;
    this.onlineMonitorIntervalMs = options.onlineMonitorIntervalMs ?? 12000;
    this.offlineRetryIntervalMs = options.offlineRetryIntervalMs ?? 4000;
  }

  public getSnapshot(): ConnectivitySnapshot {
    return { ...this.state };
  }

  public isOnline(): boolean {
    return this.state.isOnline && this.state.phase === 'DASHBOARD';
  }

  public subscribe(listener: (snapshot: ConnectivitySnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(patch: Partial<ConnectivitySnapshot>): ConnectivitySnapshot {
    this.state = { ...this.state, ...patch };
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Isolate subscriber errors
      }
    }
    return snapshot;
  }

  private log(level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: Record<string, unknown>): void {
    if (this.options.onLog) {
      try {
        this.options.onLog(level, message, details);
      } catch {}
    }
  }

  public resolveBackendHealthUrl(): string {
    const envOverride = (this.options.healthCheckUrlOverride || process.env.AGENT_HEALTH_CHECK_URL || '').trim();
    if (envOverride) {
      try {
        const parsed = new URL(envOverride);
        const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
        if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocalhost)) {
          return parsed.toString();
        }
      } catch {
        // Fall through to configured serverUrl
      }
    }

    const rawBase = (this.options.getBackendBaseUrl() || 'https://easytoprint.devpixel.space')
      .trim()
      .replace(/\/+$/, '');
    const normalizedBase = /^https?:\/\/printflow\.devpixel\.space$/i.test(rawBase)
      ? 'https://easytoprint.devpixel.space'
      : rawBase;

    try {
      const base = new URL(normalizedBase);
      return `${base.origin}/api/health`;
    } catch {
      return 'https://easytoprint.devpixel.space/api/health';
    }
  }

  private async runInternetProbe(signal: AbortSignal): Promise<ProbeResult> {
    if (this.options.internetProbe) {
      return this.options.internetProbe(signal);
    }

    // Check reliable HTTPS internet endpoints with fallback so a single CDN blip doesn't cause false offline
    let lastResult: ProbeResult = {
      ok: false,
      errorCode: 'OFFLINE',
      errorMessage: 'No active internet connection detected.'
    };

    for (const endpoint of DEFAULT_PUBLIC_HTTPS_PROBES) {
      if (signal.aborted) {
        return { ok: false, errorCode: 'OFFLINE', errorMessage: 'Connectivity check cancelled.' };
      }
      const res = await executeHttpProbe(endpoint, this.probeTimeoutMs, signal, 'HEAD');
      if (res.ok) {
        return res;
      }
      lastResult = res;
    }

    // Final fallback: try the configured HTTPS EasyToPrint backend directly in case corporate firewalls
    // block Google/Cloudflare generate_204 endpoints while allowing easytoprint.devpixel.space
    const healthUrl = this.resolveBackendHealthUrl();
    if (healthUrl.startsWith('https://')) {
      const backendDirect = await executeHttpProbe(healthUrl, this.probeTimeoutMs, signal, 'GET');
      if (backendDirect.ok || (backendDirect.statusCode && backendDirect.statusCode >= 200 && backendDirect.statusCode < 600)) {
        return { ok: true, statusCode: backendDirect.statusCode, endpoint: backendDirect.endpoint };
      }
    }

    return lastResult;
  }

  private async runBackendProbe(signal: AbortSignal): Promise<ProbeResult> {
    const healthUrl = this.resolveBackendHealthUrl();
    if (this.options.backendProbe) {
      return this.options.backendProbe(healthUrl, signal);
    }

    const res = await executeHttpProbe(healthUrl, this.probeTimeoutMs, signal, 'GET');
    // 200 or 503 (e.g., degraded DB) from /api/health still indicates the EasyToPrint backend server is reachable
    if (res.ok || res.statusCode === 503) {
      return { ok: true, statusCode: res.statusCode, endpoint: res.endpoint };
    }
    return {
      ok: false,
      statusCode: res.statusCode,
      errorCode: res.errorCode || 'BACKEND_UNREACHABLE',
      errorMessage: res.errorMessage || 'Unable to verify secure connection to EasyToPrint servers.'
    };
  }

  /**
   * Starts the mandatory startup verification sequence on application launch.
   */
  public async startStartupSequence(): Promise<ConnectivitySnapshot> {
    if (this.disposed) return this.getSnapshot();
    this.emit({
      phase: 'INITIALIZING',
      isChecking: true,
      progress: 14,
      statusMessage: 'Initializing EasyToPrint...',
      errorCode: null,
      errorMessage: null
    });
    return this.verifyConnectivity('startup');
  }

  /**
   * Single-flight connectivity verification used across startup, manual retries,
   * automatic network recovery, and runtime background monitoring.
   */
  public async verifyConnectivity(reason: ConnectivityReason = 'manual_retry'): Promise<ConnectivitySnapshot> {
    if (this.disposed) return this.getSnapshot();

    // Prevent multiple simultaneous connectivity checks
    if (this.inFlightCheck) {
      return this.inFlightCheck;
    }

    this.inFlightCheck = this.executeVerificationFlow(reason).finally(() => {
      this.inFlightCheck = null;
      this.activeAbortController = null;
      if (!this.disposed) {
        this.scheduleNextMonitor();
      }
    });

    return this.inFlightCheck;
  }

  private async executeVerificationFlow(reason: ConnectivityReason): Promise<ConnectivitySnapshot> {
    this.clearMonitorTimer();
    const controller = new AbortController();
    this.activeAbortController = controller;
    const { signal } = controller;

    const wasOnDashboard = this.state.phase === 'DASHBOARD';
    const isQuietRuntimeCheck = reason === 'runtime_probe' && wasOnDashboard;
    const isManualRetry = reason === 'manual_retry';
    const isFromOfflineScreen = this.state.phase === 'OFFLINE_BLOCKING_SCREEN';

    if (isQuietRuntimeCheck) {
      // Quietly verify connectivity in the background without disturbing the active dashboard
      const internetRes = await this.runInternetProbe(signal);
      if (this.disposed || signal.aborted) return this.getSnapshot();

      if (internetRes.ok) {
        this.consecutiveOnlineFailures = 0;
        return this.emit({
          isOnline: true,
          internetVerified: true,
          backendVerified: true,
          isChecking: false,
          errorCode: null,
          errorMessage: null,
          lastCheckedAt: new Date().toISOString(),
          lastVerifiedAt: new Date().toISOString()
        });
      }

      // Confirm once immediately before declaring runtime offline to avoid transient 1-packet drops
      const confirmRes = await this.runInternetProbe(signal);
      if (this.disposed || signal.aborted) return this.getSnapshot();

      if (confirmRes.ok) {
        this.consecutiveOnlineFailures = 0;
        return this.emit({
          isOnline: true,
          internetVerified: true,
          isChecking: false,
          lastCheckedAt: new Date().toISOString(),
          lastVerifiedAt: new Date().toISOString()
        });
      }

      this.consecutiveOnlineFailures += 1;
      return this.transitionToOffline(confirmRes.errorCode || 'OFFLINE', confirmRes.errorMessage || 'Internet connection lost.', true);
    }

    // Full Startup / Recovery / Manual Retry State Machine
    if (isFromOfflineScreen) {
      // Keep the blocking screen showing animated "Checking connection..." while probing
      this.emit({
        isChecking: true,
        retryCount: isManualRetry ? this.state.retryCount + 1 : this.state.retryCount,
        statusMessage: 'Checking your internet connection...'
      });
    } else {
      this.emit({
        phase: 'CHECKING_INTERNET',
        isChecking: true,
        progress: 34,
        statusMessage: 'Checking your internet connection...',
        errorCode: null,
        errorMessage: null
      });
    }

    this.log('INFO', `Running internet connectivity verification (reason=${reason})`);

    const internetResult = await this.runInternetProbe(signal);
    if (this.disposed || signal.aborted) return this.getSnapshot();

    if (!internetResult.ok) {
      this.log('WARN', `Internet verification failed: ${internetResult.errorCode} - ${internetResult.errorMessage}`);
      return this.transitionToOffline(
        internetResult.errorCode || 'OFFLINE',
        internetResult.errorMessage || 'No active internet connection detected.',
        this.state.hasCompletedStartup
      );
    }

    // Internet confirmed! If we were on the offline blocking screen, switch back to the EasyToPrint loader
    this.emit({
      phase: 'VERIFY_BACKEND',
      isOnline: false,
      internetVerified: true,
      backendVerified: false,
      isChecking: true,
      progress: 64,
      statusMessage: 'Verifying secure connection...',
      errorCode: null,
      errorMessage: null,
      lastCheckedAt: new Date().toISOString()
    });

    const backendResult = await this.runBackendProbe(signal);
    if (this.disposed || signal.aborted) return this.getSnapshot();

    if (!backendResult.ok) {
      this.log('WARN', `Backend connectivity check failed: ${backendResult.errorCode} - ${backendResult.errorMessage}`);
      return this.transitionToOffline(
        backendResult.errorCode || 'BACKEND_UNREACHABLE',
        backendResult.errorMessage || 'Unable to verify secure connection to EasyToPrint.',
        this.state.hasCompletedStartup
      );
    }

    // Backend verified! Now run real application startup / workspace preparation tasks
    const isInitialStartup = !this.state.hasCompletedStartup;
    this.emit({
      phase: 'LOADING_APP',
      isOnline: true,
      internetVerified: true,
      backendVerified: true,
      isChecking: true,
      progress: 80,
      statusMessage: 'Preparing your workspace...',
      errorCode: null,
      errorMessage: null,
      lastCheckedAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString()
    });

    if (this.options.onPrepareWorkspace) {
      try {
        await this.options.onPrepareWorkspace({
          isInitialStartup,
          reportProgress: (progress: number, message: string) => {
            if (this.disposed || signal.aborted) return;
            const clamped = Math.max(80, Math.min(98, Math.round(progress)));
            this.emit({
              phase: 'LOADING_APP',
              progress: clamped,
              statusMessage: message
            });
          }
        });
      } catch (prepErr: any) {
        this.log('WARN', `Workspace preparation completed with notice: ${prepErr?.message || prepErr}`);
      }
    }

    if (this.disposed || signal.aborted) return this.getSnapshot();

    this.emit({
      phase: 'LOADING_APP',
      progress: 96,
      statusMessage: 'Almost ready...'
    });

    this.consecutiveOnlineFailures = 0;
    const now = new Date().toISOString();
    this.log('INFO', isInitialStartup ? 'Startup connectivity verified. Opening dashboard.' : 'Internet restored and backend revalidated.');

    return this.emit({
      phase: 'DASHBOARD',
      isOnline: true,
      internetVerified: true,
      backendVerified: true,
      isChecking: false,
      hasCompletedStartup: true,
      progress: 100,
      statusMessage: 'Connected to EasyToPrint',
      errorCode: null,
      errorMessage: null,
      lastCheckedAt: now,
      lastVerifiedAt: now,
      retryCount: 0,
      runtimeDisconnected: false
    });
  }

  private transitionToOffline(
    errorCode: ConnectivityErrorCode,
    errorMessage: string,
    wasPreviouslyStarted: boolean
  ): ConnectivitySnapshot {
    const previouslyOnline = this.state.isOnline || this.state.phase === 'DASHBOARD';
    const nextSnapshot = this.emit({
      phase: 'OFFLINE_BLOCKING_SCREEN',
      isOnline: false,
      internetVerified: false,
      backendVerified: false,
      isChecking: false,
      progress: 0,
      statusMessage: 'No internet connection',
      errorCode,
      errorMessage,
      lastCheckedAt: new Date().toISOString(),
      runtimeDisconnected: wasPreviouslyStarted
    });

    if (previouslyOnline && this.options.onRuntimeOffline) {
      try {
        this.options.onRuntimeOffline();
      } catch {}
    }

    return nextSnapshot;
  }

  /**
   * Called when renderer reports a browser online/offline event hint or when
   * an API call fails at the network layer. Always runs a real main-process HTTPS check.
   */
  public async handleNetworkSignal(onlineHint: boolean): Promise<ConnectivitySnapshot> {
    if (this.disposed) return this.getSnapshot();
    this.log('INFO', `Received network signal hint (onlineHint=${onlineHint}, currentPhase=${this.state.phase})`);

    if (!onlineHint && this.state.phase === 'DASHBOARD') {
      // Immediately verify via real main-process HTTPS probe (never trust hint blindly, but react immediately)
      return this.verifyConnectivity('runtime_probe');
    }
    if (onlineHint && this.state.phase === 'OFFLINE_BLOCKING_SCREEN') {
      // Immediately attempt restoration through the full startup verification pipeline
      return this.verifyConnectivity('network_event');
    }
    return this.getSnapshot();
  }

  /**
   * Called by PrintAgentService when a heartbeat/poll encounters a network-level error.
   */
  public notifyApiNetworkError(): void {
    if (this.disposed || this.state.phase !== 'DASHBOARD' || this.inFlightCheck) return;
    void this.verifyConnectivity('runtime_probe');
  }

  private clearMonitorTimer(): void {
    if (this.monitorTimer) {
      clearTimeout(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  private scheduleNextMonitor(): void {
    if (this.disposed) return;
    this.clearMonitorTimer();

    if (this.state.phase === 'DASHBOARD') {
      this.monitorTimer = setTimeout(() => {
        if (!this.disposed && this.state.phase === 'DASHBOARD') {
          void this.verifyConnectivity('runtime_probe');
        }
      }, this.onlineMonitorIntervalMs);
      if (this.monitorTimer.unref) this.monitorTimer.unref();
    } else if (this.state.phase === 'OFFLINE_BLOCKING_SCREEN') {
      // Gently back off automatic offline checks between 4s and 8s to avoid excessive polling
      const delay = Math.min(8000, this.offlineRetryIntervalMs + Math.min(this.state.retryCount, 4) * 1000);
      this.monitorTimer = setTimeout(() => {
        if (!this.disposed && this.state.phase === 'OFFLINE_BLOCKING_SCREEN') {
          void this.verifyConnectivity('network_event');
        }
      }, delay);
      if (this.monitorTimer.unref) this.monitorTimer.unref();
    }
  }

  /**
   * Cleanly aborts in-flight probes, clears timers, and releases listeners on app shutdown.
   */
  public stop(): void {
    this.disposed = true;
    this.clearMonitorTimer();
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {}
      this.activeAbortController = null;
    }
    this.listeners.clear();
  }
}
