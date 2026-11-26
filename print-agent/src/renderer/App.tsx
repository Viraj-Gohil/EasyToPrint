import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AgentConfig,
  AgentConnectionStatus,
  ConnectivitySnapshot,
  DiscoveredPrinter,
  PrintJobItem,
  AgentLogEntry,
  QueueMetrics,
  TestPrintResult,
  PlanEntitlements
} from './types/agent';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { QueueView } from './components/QueueView';
import { PrintersView } from './components/PrintersView';
import { LogsView } from './components/LogsView';
import { HealthView } from './components/HealthView';
import { SettingsModal } from './components/SettingsModal';
import { LoginScreen } from './components/LoginScreen';
import { AboutView } from './components/AboutView';
import { DevicePreferencesView } from './components/DevicePages';
import { StartupLoaderScreen } from './components/StartupLoaderScreen';
import { OfflineBlockingScreen } from './components/OfflineBlockingScreen';
import { filterPhysicalPrinters } from './utils/printerFilter';
import {
  Activity,
  CircleHelp,
  LayoutDashboard,
  ListOrdered,
  Printer,
  SlidersHorizontal,
  Terminal,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  ShieldCheck
} from 'lucide-react';

type AgentPage = 'DASHBOARD' | 'HEALTH' | 'QUEUE' | 'PRINTERS' | 'LOGS' | 'DEVICE_PREFERENCES' | 'ABOUT';

const INITIAL_CONNECTIVITY_SNAPSHOT: ConnectivitySnapshot = {
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

const DEFAULT_CONFIG: AgentConfig = {
  serverUrl: 'https://easytoprint.devpixel.space',
  shopId: '',
  shopSlug: '',
  agentId: '',
  authToken: '',
  deviceName: '',
  pollIntervalMs: 5000,
  autoStartOnBoot: false,
  allowColorFallback: true,
  spoolerTimeoutMs: 30000,
  themePreference: 'system'
};

const PAGE_DETAILS: Record<AgentPage, { title: string; description: string; icon: React.ReactNode }> = {
  DASHBOARD: {
    title: 'Dashboard Overview',
    description: 'Real-time telemetry, queue metrics, and printer hardware status for this counter station.',
    icon: <LayoutDashboard className="w-5 h-5 text-[#00B32D]" />
  },
  HEALTH: {
    title: 'System Health & Telemetry',
    description: 'Hardware resource utilization, Windows Print Spooler status, SQLite storage, and network health.',
    icon: <Activity className="w-5 h-5 text-[#00B32D]" />
  },
  QUEUE: {
    title: 'Print Job Queue',
    description: 'Monitor incoming customer orders, active spooling progress, and safe retries.',
    icon: <ListOrdered className="w-5 h-5 text-[#00B32D]" />
  },
  PRINTERS: {
    title: 'Printer Management',
    description: 'Installed local & network printers detected via Windows Win32 Print Spooler.',
    icon: <Printer className="w-5 h-5 text-[#00B32D]" />
  },
  LOGS: {
    title: 'Activity Logs',
    description: 'Diagnostic event logs, print spooler handshakes, and network telemetry.',
    icon: <Terminal className="w-5 h-5 text-[#00B32D]" />
  },
  DEVICE_PREFERENCES: {
    title: 'Settings',
    description: 'Device identity, queue polling interval, autostart, and print behavior.',
    icon: <SlidersHorizontal className="w-5 h-5 text-[#00B32D]" />
  },
  ABOUT: {
    title: 'About & System Information',
    description: 'Application build details, environment specifications, and support portal.',
    icon: <CircleHelp className="w-5 h-5 text-[#00B32D]" />
  }
};

const NAVIGATION: Array<{ id: AgentPage; label: string; icon: React.ReactNode }> = [
  { id: 'DASHBOARD', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4 shrink-0" /> },
  { id: 'HEALTH', label: 'System Health', icon: <Activity className="w-4 h-4 shrink-0" /> },
  { id: 'QUEUE', label: 'Print Queue', icon: <ListOrdered className="w-4 h-4 shrink-0" /> },
  { id: 'PRINTERS', label: 'Printers', icon: <Printer className="w-4 h-4 shrink-0" /> },
  { id: 'LOGS', label: 'Activity Logs', icon: <Terminal className="w-4 h-4 shrink-0" /> },
  { id: 'DEVICE_PREFERENCES', label: 'Settings', icon: <SlidersHorizontal className="w-4 h-4 shrink-0" /> },
  { id: 'ABOUT', label: 'About', icon: <CircleHelp className="w-4 h-4 shrink-0" /> }
];

export const App: React.FC = () => {
  const [activePage, setActivePage] = useState<AgentPage>('DASHBOARD');
  const [status, setStatus] = useState<AgentConnectionStatus>('CONNECTING');
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [metrics, setMetrics] = useState<QueueMetrics>({
    totalJobs: 0,
    queuedJobs: 0,
    printingJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    manualAttentionJobs: 0,
    uptimeSeconds: 0,
    lastSyncAt: null
  });
  const [printers, setPrinters] = useState<DiscoveredPrinter[]>([]);
  const [jobs, setJobs] = useState<PrintJobItem[]>([]);
  const [logs, setLogs] = useState<AgentLogEntry[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [connectivity, setConnectivity] = useState<ConnectivitySnapshot>(INITIAL_CONNECTIVITY_SNAPSHOT);
  const [isLoaderCompleting, setIsLoaderCompleting] = useState(false);
  const [hasRevealedWorkspace, setHasRevealedWorkspace] = useState(false);
  const completionTimerRef = useRef<number | null>(null);
  const prevPhaseRef = useRef<ConnectivitySnapshot['phase']>('INITIALIZING');

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [entitlements, setEntitlements] = useState<PlanEntitlements | null>(null);

  const applyConnectivitySnapshot = useCallback((nextSnapshot: ConnectivitySnapshot) => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = nextSnapshot.phase;

    setConnectivity(nextSnapshot);

    if (nextSnapshot.phase === 'DASHBOARD' && prevPhase !== 'DASHBOARD') {
      // Smooth loader completion animation before revealing the dashboard
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
      }
      setIsLoaderCompleting(true);
      completionTimerRef.current = window.setTimeout(() => {
        setIsLoaderCompleting(false);
        setHasRevealedWorkspace(true);
        completionTimerRef.current = null;
      }, 320);
    } else if (nextSnapshot.phase === 'OFFLINE_BLOCKING_SCREEN') {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      setIsLoaderCompleting(false);
    }
  }, []);

  // 1. Mandatory Startup & Runtime Connectivity Verification Listener
  useEffect(() => {
    const api = window.electronAgentAPI;
    let active = true;

    if (!api?.getConnectivityState || !api?.onConnectivityChanged) {
      // Safe non-Electron browser fallback: verify actual backend reachability via fetch
      const checkBrowserFallback = async () => {
        try {
          const controller = new AbortController();
          const timer = window.setTimeout(() => controller.abort(), 4500);
          const res = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
          window.clearTimeout(timer);
          if (!active) return;
          if (res.ok || res.status === 503) {
            applyConnectivitySnapshot({
              ...INITIAL_CONNECTIVITY_SNAPSHOT,
              phase: 'DASHBOARD',
              isOnline: true,
              internetVerified: true,
              backendVerified: true,
              isChecking: false,
              hasCompletedStartup: true,
              progress: 100,
              statusMessage: 'Connected to EasyToPrint',
              lastCheckedAt: new Date().toISOString(),
              lastVerifiedAt: new Date().toISOString()
            });
          } else {
            throw new Error('Offline');
          }
        } catch {
          if (!active) return;
          applyConnectivitySnapshot({
            ...INITIAL_CONNECTIVITY_SNAPSHOT,
            phase: 'OFFLINE_BLOCKING_SCREEN',
            isOnline: false,
            isChecking: false,
            progress: 0,
            statusMessage: 'No internet connection',
            errorCode: 'OFFLINE',
            errorMessage: 'No active internet connection detected.',
            lastCheckedAt: new Date().toISOString()
          });
        }
      };
      void checkBrowserFallback();
      return () => {
        active = false;
      };
    }

    const unsubConnectivity = api.onConnectivityChanged((snapshot) => {
      if (active) {
        applyConnectivitySnapshot(snapshot);
      }
    });

    void api
      .getConnectivityState()
      .then((initialSnapshot) => {
        if (active && initialSnapshot) {
          applyConnectivitySnapshot(initialSnapshot);
        }
      })
      .catch(() => {
        if (active) {
          applyConnectivitySnapshot({
            ...INITIAL_CONNECTIVITY_SNAPSHOT,
            phase: 'OFFLINE_BLOCKING_SCREEN',
            isOnline: false,
            isChecking: false,
            progress: 0,
            statusMessage: 'No internet connection',
            errorCode: 'OFFLINE',
            errorMessage: 'Unable to verify internet connectivity.',
            lastCheckedAt: new Date().toISOString()
          });
        }
      });

    // Forward OS/browser online & offline events strictly as hints to trigger main-process HTTPS verification
    const handleOnlineHint = () => {
      void api.reportNetworkHint?.(true).catch(() => undefined);
    };
    const handleOfflineHint = () => {
      void api.reportNetworkHint?.(false).catch(() => undefined);
    };

    window.addEventListener('online', handleOnlineHint);
    window.addEventListener('offline', handleOfflineHint);

    return () => {
      active = false;
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      unsubConnectivity();
      window.removeEventListener('online', handleOnlineHint);
      window.removeEventListener('offline', handleOfflineHint);
    };
  }, [applyConnectivitySnapshot]);

  // 2. Hydrate Agent Workspace ONLY after startup connectivity has been verified
  useEffect(() => {
    if (!connectivity.hasCompletedStartup) return;
    const api = window.electronAgentAPI;
    if (!api) return;
    let active = true;

    const hydrateWorkspace = () => {
      void Promise.all([
        api.getConfig(),
        api.getStatus(),
        api.getMetrics(),
        api.getPrinters(),
        api.getJobs(),
        api.getLogs(),
        api.getIsScanning ? api.getIsScanning() : Promise.resolve(false),
        api.getEntitlements ? api.getEntitlements() : Promise.resolve(null)
      ])
        .then(([loadedConfig, loadedStatus, loadedMetrics, loadedPrinters, loadedJobs, loadedLogs, scanningState, loadedEntitlements]) => {
          if (!active) return;
          setConfig(loadedConfig);
          setStatus(loadedStatus.status);
          setLastHeartbeat(loadedStatus.lastHeartbeat);
          setMetrics(loadedMetrics);
          setPrinters(filterPhysicalPrinters(loadedPrinters));
          setJobs(loadedJobs);
          setLogs(loadedLogs);
          setIsScanning(Boolean(scanningState));
          if (loadedEntitlements) {
            setEntitlements(loadedEntitlements);
          }
        })
        .catch((error: unknown) => {
          if (!active) return;
          setInitializationError(error instanceof Error ? error.message : 'Could not initialize agent environment.');
          setStatus('ERROR');
        });
    };

    hydrateWorkspace();

    const unsubStatus = api.onStatusChanged((newStatus) => {
      setStatus(newStatus);
      void Promise.all([api.getStatus(), api.getConfig(), api.getEntitlements ? api.getEntitlements() : Promise.resolve(null)])
        .then(([newDetails, freshConfig, freshEntitlements]) => {
          if (active) {
            setLastHeartbeat(newDetails.lastHeartbeat);
            setConfig(freshConfig);
            if (freshEntitlements) setEntitlements(freshEntitlements);
          }
        })
        .catch(() => undefined);
    });

    const unsubJob = api.onJobUpdated((updatedJob) => {
      setJobs((previous) => {
        const index = previous.findIndex((job) => job.id === updatedJob.id);
        if (index < 0) return [updatedJob, ...previous];
        const next = [...previous];
        next[index] = updatedJob;
        return next;
      });
      void api
        .getMetrics()
        .then((nextMetrics) => {
          if (active) setMetrics(nextMetrics);
        })
        .catch(() => undefined);
    });

    const unsubLog = api.onLogAdded((newLog) =>
      setLogs((previous) => [newLog, ...previous.slice(0, 199)])
    );

    const unsubPrinters = api.onPrintersUpdated((updatedPrinters) => {
      setPrinters(filterPhysicalPrinters(updatedPrinters));
    });

    const unsubScanning = api.onPrinterScanningChanged
      ? api.onPrinterScanningChanged((scanning) => {
          setIsScanning(scanning);
        })
      : () => {};

    const unsubEntitlements = api.onEntitlementsChanged
      ? api.onEntitlementsChanged((nextEntitlements) => {
          if (active && nextEntitlements) setEntitlements(nextEntitlements);
        })
      : () => {};

    return () => {
      active = false;
      unsubStatus();
      unsubJob();
      unsubLog();
      unsubPrinters();
      unsubScanning();
      unsubEntitlements();
    };
  }, [connectivity.hasCompletedStartup]);

  // Re-sync jobs, status, and metrics immediately when returning to DASHBOARD after runtime reconnect
  useEffect(() => {
    if (!connectivity.hasCompletedStartup || connectivity.phase !== 'DASHBOARD') return;
    const api = window.electronAgentAPI;
    if (!api) return;
    let active = true;
    void Promise.all([api.getStatus(), api.getJobs(), api.getMetrics(), api.getPrinters()])
      .then(([loadedStatus, loadedJobs, loadedMetrics, loadedPrinters]) => {
        if (!active) return;
        setStatus(loadedStatus.status);
        setLastHeartbeat(loadedStatus.lastHeartbeat);
        setJobs(loadedJobs);
        setMetrics(loadedMetrics);
        setPrinters(filterPhysicalPrinters(loadedPrinters));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [connectivity.hasCompletedStartup, connectivity.phase]);

  const handleRetryConnectivity = useCallback(() => {
    const api = window.electronAgentAPI;
    if (api?.checkConnectivity) {
      void api.checkConnectivity({ reason: 'manual_retry' }).catch(() => undefined);
    }
  }, []);

  const handlePollNow = async () => {
    if (isPolling) return;
    setIsPolling(true);
    try {
      const api = window.electronAgentAPI;
      if (!api) throw new Error('EasyToPrint Agent must run within the Electron desktop runtime.');
      const result = await api.pollNow();
      if (!result.success) throw new Error(result.error || 'Cloud synchronization failed.');
      const [updatedJobs, updatedMetrics] = await Promise.all([api.getJobs(), api.getMetrics()]);
      setJobs(updatedJobs);
      setMetrics(updatedMetrics);
      setInitializationError(null);
    } catch (error) {
      setInitializationError(error instanceof Error ? error.message : 'Could not synchronize cloud queue.');
    } finally {
      setIsPolling(false);
    }
  };

  const handleRescanPrinters = async () => {
    setIsScanning(true);
    try {
      const api = window.electronAgentAPI;
      if (!api) throw new Error('EasyToPrint Agent must run within the Electron desktop runtime.');
      setPrinters(filterPhysicalPrinters(await api.rescanPrinters()));
      setInitializationError(null);
    } catch (error) {
      setInitializationError(error instanceof Error ? error.message : 'Could not query installed Windows printers.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleTestPrint = async (printerName: string): Promise<TestPrintResult> => {
    const api = window.electronAgentAPI;
    if (api) return api.testPrint(printerName);
    return { success: false, printerName, message: 'EasyToPrint Agent must run within the Electron runtime.' };
  };

  const handleReprintJob = async (jobId: string) => {
    const api = window.electronAgentAPI;
    if (!api) return;
    const result = await api.reprintJob(jobId);
    if (!result.success) setInitializationError(result.error || 'This job cannot be safely re-printed.');
    else setInitializationError(null);
    setJobs(await api.getJobs());
  };

  const handleCancelJob = async (jobId: string) => {
    const api = window.electronAgentAPI;
    if (!api) return;
    const result = await api.cancelJob(jobId);
    if (!result.success) setInitializationError(result.error || 'Could not cancel the print job.');
    else setInitializationError(null);
    setJobs(await api.getJobs());
  };

  const handleClearCompleted = async () => {
    const api = window.electronAgentAPI;
    if (!api) return;
    await api.clearCompletedJobs();
    setJobs(await api.getJobs());
  };

  const handleSaveConfig = async (partial: Partial<AgentConfig>) => {
    const api = window.electronAgentAPI;
    if (!api) return { success: false, error: 'EasyToPrint Agent must run within the Electron desktop runtime.' };
    const result = await api.saveConfig(partial);
    if (result.success) {
      const [savedConfig, savedMetrics] = await Promise.all([api.getConfig(), api.getMetrics()]);
      setConfig(savedConfig);
      setMetrics(savedMetrics);
      setInitializationError(null);
    } else {
      setInitializationError(result.error || 'Could not save agent configuration.');
    }
    return result;
  };

  const handlePairDevice = async (data: {
    serverUrl: string;
    shopId: string;
    authToken: string;
    deviceName?: string;
  }) => {
    const api = window.electronAgentAPI;
    if (!api) return { success: false, error: 'EasyToPrint Agent must run within the Electron desktop runtime.' };
    const result = await api.pairDevice(data);
    if (result.success) {
      // Delay state update briefly so the LoginScreen can display the successful connection card
      await new Promise((resolve) => setTimeout(resolve, 1400));
    }
    const [savedConfig, connection, savedMetrics] = await Promise.all([
      api.getConfig(),
      api.getStatus(),
      api.getMetrics()
    ]);
    setConfig(savedConfig);
    setStatus(connection.status);
    setLastHeartbeat(connection.lastHeartbeat);
    setMetrics(savedMetrics);
    setInitializationError(result.success ? null : result.error || 'Device pairing failed.');
    return result;
  };

  const handleTestConnection = async () => {
    const api = window.electronAgentAPI;
    if (!api) return { success: false, error: 'EasyToPrint Agent must run within the Electron desktop runtime.' };
    const result = await api.testConnection();
    const currentStatus = await api.getStatus();
    setStatus(currentStatus.status);
    setLastHeartbeat(currentStatus.lastHeartbeat);
    return result;
  };

  const handleDisconnectDevice = async () => {
    const api = window.electronAgentAPI;
    if (!api) return { success: false, error: 'EasyToPrint Agent must run within the Electron desktop runtime.' };
    const result = await api.disconnectDevice();
    const [savedConfig, connection, savedMetrics] = await Promise.all([
      api.getConfig(),
      api.getStatus(),
      api.getMetrics()
    ]);
    setConfig(savedConfig);
    setStatus(connection.status);
    setLastHeartbeat(connection.lastHeartbeat);
    setMetrics(savedMetrics);
    setIsSettingsOpen(false);
    return result;
  };

  const handleResetConfig = async () => {
    const api = window.electronAgentAPI;
    if (!api) return { success: false, error: 'EasyToPrint Agent must run within the Electron desktop runtime.' };
    const result = await api.resetConfig();
    if (result.success) {
      setConfig(await api.getConfig());
      setStatus('OFFLINE');
      setLastHeartbeat(null);
      setIsSettingsOpen(false);
    }
    return result;
  };

  const configured = Boolean(config.agentId && config.hasStoredCredentials && status !== 'DISCONNECTED' && status !== 'REVOKED');
  const currentPage = PAGE_DETAILS[activePage];

  // =========================================================================
  // MANDATORY STARTUP GATE: Dashboard & Login MUST NEVER mount before connectivity is verified
  // =========================================================================
  const isShowingOfflineBlocking = connectivity.phase === 'OFFLINE_BLOCKING_SCREEN';
  const isShowingStartupLoader =
    !isShowingOfflineBlocking &&
    (connectivity.phase !== 'DASHBOARD' || isLoaderCompleting || !hasRevealedWorkspace);

  if (!connectivity.hasCompletedStartup) {
    if (isShowingOfflineBlocking) {
      return (
        <OfflineBlockingScreen
          snapshot={connectivity}
          onRetry={handleRetryConnectivity}
          onQuit={window.electronAgentAPI ? () => window.electronAgentAPI?.quitApp() : undefined}
        />
      );
    }
    return (
      <StartupLoaderScreen
        snapshot={connectivity}
        isCompleting={isLoaderCompleting}
      />
    );
  }

  // Runtime connectivity overlay (preserves mounted React state & print queue while blocking UI)
  const runtimeOverlay = isShowingOfflineBlocking ? (
    <OfflineBlockingScreen
      snapshot={connectivity}
      onRetry={handleRetryConnectivity}
      onQuit={window.electronAgentAPI ? () => window.electronAgentAPI?.quitApp() : undefined}
    />
  ) : isShowingStartupLoader ? (
    <StartupLoaderScreen
      snapshot={connectivity}
      isCompleting={isLoaderCompleting}
    />
  ) : null;

  // =========================================================================
  // Unpaired / Setup State Screen (Centered Login Card)
  // =========================================================================
  if (!configured) {
    return (
      <>
        <div
          aria-hidden={Boolean(runtimeOverlay)}
          inert={Boolean(runtimeOverlay) || undefined}
          className={runtimeOverlay ? 'pointer-events-none select-none' : undefined}
        >
          <LoginScreen
            onPair={handlePairDevice}
            defaultShopId={config.shopId}
            serverUrl={config.serverUrl}
          />
        </div>
        {runtimeOverlay}
      </>
    );
  }

  // =========================================================================
  // Main Application Shell
  // =========================================================================
  return (
    <>
    <div
      className={`agent-app ${runtimeOverlay ? 'pointer-events-none select-none' : ''}`}
      aria-hidden={Boolean(runtimeOverlay)}
      inert={Boolean(runtimeOverlay) || undefined}
    >
      <Header
        status={status}
        lastHeartbeat={lastHeartbeat}
        config={config}
        isPolling={isPolling}
        onPollNow={handlePollNow}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onMinimizeToTray={() => window.electronAgentAPI?.minimizeToTray()}
      />

      <div className="agent-layout">
        {/* Navigation Sidebar */}
        <nav
          aria-label="Primary navigation"
          className={`agent-sidebar transition-all duration-200 ${isSidebarCollapsed ? '!w-16' : '!w-56'}`}
        >
          <div className="flex items-center justify-between px-2.5 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            {!isSidebarCollapsed && <span>Navigation</span>}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className="p-1 rounded-md text-[var(--text-faint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors ml-auto"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {NAVIGATION.map((item) => {
              const isActive = activePage === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setActivePage(item.id)}
                  title={isSidebarCollapsed ? item.label : undefined}
                  className={`flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#00B32D] text-white shadow-xs font-bold'
                      : 'text-[#646B65] dark:text-slate-300 hover:bg-[#E8F8EC] dark:hover:bg-slate-800 hover:text-[#111111] dark:hover:text-white'
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
                  {item.id === 'QUEUE' && metrics.queuedJobs > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono font-bold ${
                        isActive
                          ? 'bg-white text-[#00B32D]'
                          : 'bg-[#E6A000] text-white'
                      } ${isSidebarCollapsed ? 'ml-0' : 'ml-auto'}`}
                    >
                      {metrics.queuedJobs}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {!isSidebarCollapsed && (
            <div className="mt-4 pt-3 border-t border-[#E1E7E1] dark:border-slate-800 px-2 text-[11px] text-[#646B65] dark:text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 font-medium">
                <Printer className="h-3.5 w-3.5 text-[#00B32D]" />
                <span>
                  {printers.length} Installed Printer{printers.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          )}
        </nav>

        {/* Main Content Area */}
        <main className="agent-main">
          {/* Page Heading Bar */}
          <div className="agent-page-heading flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#E8F8EC] text-[#00B32D] dark:bg-emerald-950/40 dark:text-emerald-400 border border-[#BCEAC4] dark:border-emerald-800 shrink-0 shadow-xs">
                {currentPage.icon}
              </span>
              <div>
                <h1 className="text-base font-bold text-[#111111] dark:text-white tracking-tight">
                  {currentPage.title}
                </h1>
                <p className="text-xs text-[#646B65] dark:text-slate-400 mt-0.5">{currentPage.description}</p>
              </div>
            </div>

            {activePage === 'DEVICE_PREFERENCES' && (
              <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-[#F0F4F1] text-[#646B65] dark:bg-slate-800 dark:text-slate-300 border border-[#E1E7E1] dark:border-slate-700 self-start sm:self-auto shadow-xs">
                {config.deviceName || config.agentId || 'Terminal'}
              </span>
            )}
          </div>

          {/* Dismissible Error Alert */}
          {initializationError && (
            <div
              role="alert"
              className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] dark:border-red-800 dark:bg-red-950/40 px-4 py-3 text-xs text-[#991B1B] dark:text-red-300 animate-fade-in shadow-xs"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#DC2626]" />
                <span className="font-medium">{initializationError}</span>
              </div>
              <button
                type="button"
                onClick={() => setInitializationError(null)}
                className="text-[#991B1B] dark:text-red-400 hover:text-[#7F1D1D] dark:hover:text-red-200 cursor-pointer"
                title="Dismiss error banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Tab Views */}
          <div key={activePage} className="animate-fade-in">
            {activePage === 'DASHBOARD' && (
              <Dashboard
                status={status}
                lastHeartbeat={lastHeartbeat}
                config={config}
                metrics={metrics}
                printers={printers}
                jobs={jobs}
                entitlements={entitlements}
                onNavigateTab={(page) => setActivePage(page)}
                onPollNow={handlePollNow}
              />
            )}
            {activePage === 'HEALTH' && <HealthView onNavigateQueue={() => setActivePage('QUEUE')} />}
            {activePage === 'QUEUE' && (
              <QueueView
                jobs={jobs}
                printers={printers}
                entitlements={entitlements}
                config={config}
                onReprintJob={handleReprintJob}
                onCancelJob={handleCancelJob}
                onClearCompleted={handleClearCompleted}
                onPollNow={handlePollNow}
              />
            )}
            {activePage === 'PRINTERS' && (
              <PrintersView
                printers={printers}
                config={config}
                isScanning={isScanning}
                entitlements={entitlements}
                onRescan={handleRescanPrinters}
                onTestPrint={handleTestPrint}
                onSelectPrinter={(name) => void handleSaveConfig({ selectedPrinterName: name })}
                onSetPrinterEnabled={(name, enabled) => {
                  const disabledPrinterNames = new Set(config.disabledPrinterNames || []);
                  if (enabled) disabledPrinterNames.delete(name);
                  else disabledPrinterNames.add(name);
                  void handleSaveConfig({ disabledPrinterNames: [...disabledPrinterNames] });
                }}
                onSetPrinterRegistered={async (name, registered) => {
                  const api = window.electronAgentAPI;
                  if (!api) return;
                  const result = await api.setPrinterRegistered(name, registered);
                  if (!result.success) {
                    setInitializationError(result.error || 'Could not update shop printer registration.');
                    return;
                  }
                  setConfig(await api.getConfig());
                  setInitializationError(null);
                }}
              />
            )}
            {activePage === 'LOGS' && (
              <LogsView
                logs={logs}
                onClearLogs={async () => {
                  const api = window.electronAgentAPI;
                  if (api && (await api.clearLogs())) setLogs([]);
                }}
                onExportLogs={async () => {
                  const api = window.electronAgentAPI;
                  if (!api) return { success: false };
                  return api.exportLogs();
                }}
              />
            )}
            {activePage === 'DEVICE_PREFERENCES' && (
              <DevicePreferencesView
                config={config}
                status={status}
                lastHeartbeat={lastHeartbeat}
                printers={printers}
                entitlements={entitlements}
                onSave={handleSaveConfig}
                onTestConnection={handleTestConnection}
                onReset={handleResetConfig}
                onDisconnect={handleDisconnectDevice}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onOpenLogs={() => setActivePage('LOGS')}
                onNavigatePrinters={() => setActivePage('PRINTERS')}
                onCopyDeviceId={(deviceId) => window.electronAgentAPI?.copyText(deviceId) || Promise.resolve(false)}
              />
            )}
            {activePage === 'ABOUT' && (
              <AboutView
                config={config}
                status={status}
                onOpenExternal={async (url) => {
                  try {
                    const api = window.electronAgentAPI;
                    if (api?.openExternal) {
                      await api.openExternal(url);
                    } else if (typeof window !== 'undefined') {
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }
                  } catch {
                    if (typeof window !== 'undefined') {
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }
                  }
                }}
                onNavigate={(page) => {
                  const targetPage = page === 'QUEUES' ? 'QUEUE' : page === 'SETTINGS' ? 'DEVICE_PREFERENCES' : page;
                  setActivePage(targetPage as AgentPage);
                }}
              />
            )}
          </div>
        </main>
      </div>

      {/* On-demand Settings Dialog */}
      <SettingsModal
        config={config}
        status={status}
        lastHeartbeat={lastHeartbeat}
        printers={printers}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveConfig}
        onPair={handlePairDevice}
        onDisconnect={handleDisconnectDevice}
      />
    </div>
    {runtimeOverlay}
    </>
  );
};
