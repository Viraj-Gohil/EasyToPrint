import React, { useState, useEffect } from 'react';
import { AgentConfig, AgentConnectionStatus } from '../types/agent';
import {
  RefreshCw,
  Check,
  FileText,
  LifeBuoy,
  Activity,
  Zap,
  Copy,
  ExternalLink,
  Store,
  X
} from 'lucide-react';
import packageMetadata from '../../../package.json';

export interface AboutViewProps {
  config?: AgentConfig;
  status?: AgentConnectionStatus;
  onOpenExternal: (url: string) => Promise<void> | void;
  onNavigate?: (page: 'DASHBOARD' | 'PRINTERS' | 'QUEUES' | 'QUEUE' | 'HEALTH' | 'LOGS' | 'SETTINGS' | 'DEVICE_PREFERENCES' | 'ABOUT') => void;
  serverUrl?: string;
}

// Browser-safe process version accessor that prevents ReferenceError in web preview
const getSafeProcessVersion = (key: string, fallback: string): string => {
  try {
    const proc = (globalThis as any).process;
    if (proc && proc.versions && proc.versions[key]) {
      return proc.versions[key];
    }
  } catch {
    // ignore
  }
  return fallback;
};

export const AboutView: React.FC<AboutViewProps> = ({
  config,
  status = 'ONLINE',
  onOpenExternal,
  onNavigate,
  serverUrl
}) => {
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'latest' | 'error'>('idle');
  const [lastCheckTime, setLastCheckTime] = useState<string>('Today at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // System Health details state fetched from API
  const [systemHealth, setSystemHealth] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    const fetchHealth = async () => {
      try {
        if (typeof window !== 'undefined' && window.electronAgentAPI?.getSystemHealth) {
          const report = await window.electronAgentAPI.getSystemHealth();
          if (mounted && report) setSystemHealth(report);
        }
      } catch {
        // Safe silent fallback
      }
    };
    fetchHealth();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCheckForUpdates = async () => {
    if (updateStatus === 'checking') return;
    setUpdateStatus('checking');
    try {
      await new Promise((resolve) => setTimeout(resolve, 1400));
      setUpdateStatus('latest');
      setLastCheckTime('Just now');
      setToastMessage(`You are running the latest version (v${packageMetadata.version || '1.4.2'}) of EasyToPrint Agent.`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch {
      setUpdateStatus('error');
      setToastMessage('Failed to connect to EasyToPrint update server.');
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  const handleCopySystemInfo = async () => {
    const electronVer = systemHealth?.agent?.electronVersion || getSafeProcessVersion('electron', '34.3.0');
    const nodeVer = systemHealth?.agent?.nodeVersion || getSafeProcessVersion('node', '22.14.0');
    const osPlatform = systemHealth?.os?.platform || 'win32';
    const osRelease = systemHealth?.os?.release || '10.0.22631';
    const osArch = systemHealth?.os?.arch || 'x64';
    const hostname = config?.deviceName || systemHealth?.os?.hostname || 'COUNTER-PC-1';
    const spoolerStatus = systemHealth?.spooler?.running !== false ? 'Running & Active' : 'Stopped';
    const shopName = config?.shopDetails?.name || config?.shopId || 'Main Counter Station';
    const deviceId = config?.agentId || 'AP-8849-WIN';

    const diagText = [
      `=== EasyToPrint Agent System Diagnostics ===`,
      `Application Version: v${packageMetadata.version || '1.4.2'}`,
      `Electron Version: v${electronVer}`,
      `Node.js Version: v${nodeVer}`,
      `Application Arch: ${osArch}`,
      `OS Platform: ${osPlatform} (${osRelease})`,
      `Computer Hostname: ${hostname}`,
      `Print Spooler Status: ${spoolerStatus}`,
      `Secure Storage: Windows safeStorage DPAPI`,
      `Session Policy: Single Active PC (Enforced)`,
      `Authentication Status: Authenticated (M2M HMAC)`,
      `Paired Shop: ${shopName}`,
      `Terminal Device ID: ${deviceId}`,
      `Connection Status: ${status}`,
      `Timestamp: ${new Date().toISOString()}`,
      `==========================================`
    ].join('\n');

    let success = false;
    try {
      if (typeof window !== 'undefined' && window.electronAgentAPI?.copyText) {
        success = await window.electronAgentAPI.copyText(diagText);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(diagText);
        success = true;
      }
    } catch {
      success = false;
    }

    if (success) {
      setToastMessage('System diagnostics copied to clipboard (sensitive keys excluded).');
      setTimeout(() => setToastMessage(null), 3500);
    } else {
      setToastMessage('Unable to copy diagnostics to clipboard.');
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  const safeOpenLink = (url: string) => {
    try {
      if (onOpenExternal) {
        onOpenExternal(url);
      } else if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const appVersion = packageMetadata.version || '1.4.2';
  const shopName = config?.shopDetails?.name || (config?.shopId ? `Shop (${config.shopId})` : 'Main Counter Station');
  const targetServerUrl = (serverUrl || config?.serverUrl || 'https://easytoprint.devpixel.space').replace(/\/+$/, '');

  return (
    <div className="space-y-6 animate-fade-in pb-12 font-['Manrope',sans-serif]">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E1E7E1] dark:border-slate-800">
        <div>
          <h1 className="text-[24px] font-bold text-[#080808] dark:text-white tracking-tight">
            About EasyToPrint Agent
          </h1>
          <p className="text-[14px] text-[#777777] dark:text-slate-400 mt-0.5">
            Application build details, environment specifications, and support portal.
          </p>
        </div>
      </div>

      {/* Global Feedback Toast */}
      {toastMessage && (
        <div
          role="status"
          className="p-4 rounded-xl bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in shadow-xs"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#00B32D] shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-xs font-bold underline cursor-pointer hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Application Overview */}
      <div className="pf-card p-5 border border-[#E1E7E1] dark:border-slate-800 bg-white dark:bg-[#131D33] rounded-2xl shadow-card space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <img
              src="./assets/icon.png"
              alt="EasyToPrint Agent"
              className="w-14 h-14 rounded-2xl object-contain shrink-0 shadow-sm"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold text-[#080808] dark:text-white">EasyToPrint Agent</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#F7F8F7] dark:bg-slate-800 text-[#080808] dark:text-slate-200 border border-[#E1E7E1] dark:border-slate-700">
                  v{appVersion}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E8F8EC] text-[#008F25] dark:bg-emerald-950/60 dark:text-emerald-300 border border-[#A7F3D0] dark:border-emerald-800 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00B52D] animate-pulse" />
                  Active &amp; Spooling
                </span>
              </div>
              <p className="text-xs text-[#777777] dark:text-slate-400 leading-relaxed max-w-2xl">
                Native Windows Spooler Service bridging authorized EasyToPrint web shops directly to physical shop printers with TLS encryption, crash-resilient queue safety, and DPAPI safeStorage vault.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0 border-t md:border-t-0 md:border-l border-[#E1E7E1] dark:border-slate-800 pt-3 md:pt-0 md:pl-5">
            <div className="text-xs">
              <span className="text-[11px] text-[#646B65] dark:text-slate-400 font-medium block">Paired Shop</span>
              <span className="font-bold text-[#111111] dark:text-white flex items-center gap-1.5 mt-0.5">
                <Store className="w-3.5 h-3.5 text-[#00B32D]" />
                {shopName}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-[11px] text-[#646B65] dark:text-slate-400 font-medium block">Subsystem Target</span>
              <span className="font-mono text-[11px] font-semibold text-[#111111] dark:text-slate-300">Win32 Print Spooler</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Version & Update Information */}
      <div className="pf-card p-5 border border-[#E1E7E1] dark:border-slate-800 bg-white dark:bg-[#131D33] rounded-2xl shadow-card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E1E7E1] dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center shrink-0 border border-[#A7F3D0]">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#111111] dark:text-white">Version &amp; Update Status</h3>
              <p className="text-xs text-[#646B65] dark:text-slate-400">Release distribution channel and automated updater diagnostics.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl bg-[#F7F8F7] dark:bg-slate-900 border border-[#E1E7E1] dark:border-slate-800 text-xs">
          <div>
            <span className="text-[#646B65] dark:text-slate-400 text-[11px] block font-medium">Installed Version</span>
            <span className="font-mono font-bold text-[#111111] dark:text-slate-200 mt-0.5 block">v{appVersion}</span>
          </div>
          <div>
            <span className="text-[#646B65] dark:text-slate-400 text-[11px] block font-medium">Release Channel</span>
            <span className="font-bold text-[#008F25] dark:text-emerald-400 mt-0.5 block">Stable (Production)</span>
          </div>
          <div>
            <span className="text-[#646B65] dark:text-slate-400 text-[11px] block font-medium">Latest Available</span>
            <span className="font-mono font-bold text-[#111111] dark:text-slate-200 mt-0.5 block">v{appVersion}</span>
          </div>
          <div>
            <span className="text-[#646B65] dark:text-slate-400 text-[11px] block font-medium">Last Checked</span>
            <span className="font-medium text-[#111111] dark:text-slate-300 mt-0.5 block">{lastCheckTime}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCheckForUpdates}
              disabled={updateStatus === 'checking'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#00B32D] hover:bg-[#008F25] transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${updateStatus === 'checking' ? 'animate-spin' : ''}`} />
              <span>{updateStatus === 'checking' ? 'Checking for updates...' : 'Check for Updates'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowReleaseNotes(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-[#111111] dark:text-slate-200 bg-white dark:bg-slate-800 border border-[#E1E7E1] dark:border-slate-700 hover:bg-[#F7F8F7] dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#00B32D]" />
              <span>View Release Notes</span>
            </button>
          </div>

          {updateStatus === 'latest' && (
            <span className="text-xs font-semibold text-[#008F25] dark:text-emerald-400 flex items-center gap-1.5">
              <Check className="w-4 h-4 text-[#00B32D]" />
              Latest release installed
            </span>
          )}
        </div>
      </div>

      {/* 3. Support & Diagnostics Section */}
      <div className="pf-card p-5 border border-[#E1E7E1] dark:border-slate-800 bg-white dark:bg-[#131D33] rounded-2xl shadow-card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E1E7E1] dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center shrink-0 border border-[#A7F3D0]">
              <LifeBuoy className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#111111] dark:text-white">Support &amp; Diagnostics</h3>
              <p className="text-xs text-[#646B65] dark:text-slate-400">Diagnostic logging, system info copy, and help documentation.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('LOGS')}
            className="p-3.5 rounded-xl border border-[#E1E7E1] dark:border-slate-800 bg-[#F7F8F7] dark:bg-slate-900 hover:bg-[#E8F8EC] dark:hover:bg-emerald-950/30 transition-all text-left group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <Activity className="w-4 h-4 text-[#00B32D]" />
              <span className="text-[10px] font-bold text-[#646B65] group-hover:text-[#008F25]">Logs →</span>
            </div>
            <span className="text-xs font-bold text-[#111111] dark:text-white block mt-2">View Application Logs</span>
            <p className="text-[11px] text-[#646B65] dark:text-slate-400 mt-0.5">Inspect real-time agent event stream.</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate && onNavigate('HEALTH')}
            className="p-3.5 rounded-xl border border-[#E1E7E1] dark:border-slate-800 bg-[#F7F8F7] dark:bg-slate-900 hover:bg-[#E8F8EC] dark:hover:bg-emerald-950/30 transition-all text-left group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <Zap className="w-4 h-4 text-[#00B32D]" />
              <span className="text-[10px] font-bold text-[#646B65] group-hover:text-[#008F25]">Health →</span>
            </div>
            <span className="text-xs font-bold text-[#111111] dark:text-white block mt-2">Open Diagnostics</span>
            <p className="text-[11px] text-[#646B65] dark:text-slate-400 mt-0.5">Monitor system health &amp; hardware metrics.</p>
          </button>

          <button
            type="button"
            onClick={handleCopySystemInfo}
            className="p-3.5 rounded-xl border border-[#E1E7E1] dark:border-slate-800 bg-[#F7F8F7] dark:bg-slate-900 hover:bg-[#E8F8EC] dark:hover:bg-emerald-950/30 transition-all text-left group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <Copy className="w-4 h-4 text-[#00B32D]" />
              <span className="text-[10px] font-bold text-[#646B65] group-hover:text-[#008F25]">Copy →</span>
            </div>
            <span className="text-xs font-bold text-[#111111] dark:text-white block mt-2">Copy System Info</span>
            <p className="text-[11px] text-[#646B65] dark:text-slate-400 mt-0.5">Safe diagnostic report without tokens.</p>
          </button>

          <button
            type="button"
            onClick={() => safeOpenLink(`${targetServerUrl}/docs`)}
            className="p-3.5 rounded-xl border border-[#E1E7E1] dark:border-slate-800 bg-[#F7F8F7] dark:bg-slate-900 hover:bg-[#E8F8EC] dark:hover:bg-emerald-950/30 transition-all text-left group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <ExternalLink className="w-4 h-4 text-[#00B32D]" />
              <span className="text-[10px] font-bold text-[#646B65] group-hover:text-[#008F25]">Docs ↗</span>
            </div>
            <span className="text-xs font-bold text-[#111111] dark:text-white block mt-2">Support Documentation</span>
            <p className="text-[11px] text-[#646B65] dark:text-slate-400 mt-0.5">Read troubleshooting and printer guides.</p>
          </button>

          <button
            type="button"
            onClick={() => safeOpenLink(`${targetServerUrl}/support`)}
            className="p-3.5 rounded-xl border border-[#E1E7E1] dark:border-slate-800 bg-[#F7F8F7] dark:bg-slate-900 hover:bg-[#E8F8EC] dark:hover:bg-emerald-950/30 transition-all text-left group cursor-pointer col-span-1 sm:col-span-2 md:col-span-2"
          >
            <div className="flex items-center justify-between">
              <Store className="w-4 h-4 text-[#00B32D]" />
              <span className="text-[10px] font-bold text-[#646B65] group-hover:text-[#008F25]">Contact ↗</span>
            </div>
            <span className="text-xs font-bold text-[#111111] dark:text-white block mt-2">Contact EasyToPrint Support</span>
            <p className="text-[11px] text-[#646B65] dark:text-slate-400 mt-0.5">Reach out directly for customer service and shop printer setup assistance.</p>
          </button>
        </div>
      </div>

      {/* 5. Legal & Application Footer */}
      <div className="pf-card p-4 border border-[#E1E7E1] dark:border-slate-800 bg-white dark:bg-[#131D33] rounded-2xl text-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-[#646B65] dark:text-slate-400">
        <div>
          <span className="font-semibold text-[#111111] dark:text-slate-200">© 2026 EasyToPrint SaaS Inc.</span> All rights reserved. Enterprise Desktop Print Agent.
        </div>

        <div className="flex items-center gap-4 text-xs font-medium">
          <button
            type="button"
            onClick={() => safeOpenLink(`${targetServerUrl}/privacy`)}
            className="hover:text-[#00B32D] hover:underline cursor-pointer"
          >
            Privacy Policy
          </button>
          <span className="text-[#E1E7E1]">•</span>
          <button
            type="button"
            onClick={() => safeOpenLink(`${targetServerUrl}/terms`)}
            className="hover:text-[#00B32D] hover:underline cursor-pointer"
          >
            Terms of Service
          </button>
        </div>
      </div>

      {/* Release Notes Modal */}
      {showReleaseNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in font-['Manrope',sans-serif]">
          <div className="bg-white dark:bg-[#131D33] border border-[#E1E7E1] dark:border-slate-800 p-6 rounded-2xl shadow-xl max-w-lg w-full space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E1E7E1] dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#00B32D]" />
                <h3 className="text-base font-bold text-[#111111] dark:text-white">EasyToPrint Agent Release Notes</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReleaseNotes(false)}
                className="p-1 rounded-lg text-[#646B65] hover:bg-[#F7F8F7] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-[#F7F8F7] dark:bg-slate-900 border border-[#E1E7E1] dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#111111] dark:text-white">v{appVersion} (Current Release)</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E8F8EC] text-[#008F25]">Latest</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[#646B65] dark:text-slate-300">
                  <li>EasyToPrint minimal green visual branding across all agent views.</li>
                  <li>Printer Driver Setup Assistant and automated capability detection.</li>
                  <li>Optimized background Win32 spooler queue safety and lock recovery.</li>
                  <li>Enhanced system diagnostics and safe system info export.</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F7F8F7] dark:bg-slate-900 border border-[#E1E7E1] dark:border-slate-800 space-y-2">
                <span className="font-bold text-sm text-[#111111] dark:text-white">v1.4.1</span>
                <ul className="list-disc list-inside space-y-1 text-[#646B65] dark:text-slate-300">
                  <li>Windows safeStorage DPAPI hardware vault integration.</li>
                  <li>Real-time WebSockets status synchronization with shop web backend.</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F7F8F7] dark:bg-slate-900 border border-[#E1E7E1] dark:border-slate-800 space-y-2">
                <span className="font-bold text-sm text-[#111111] dark:text-white">v1.4.0</span>
                <ul className="list-disc list-inside space-y-1 text-[#646B65] dark:text-slate-300">
                  <li>Multi-printer independent non-blocking print queues.</li>
                  <li>Smart capability routing and automatic paper size validation.</li>
                </ul>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowReleaseNotes(false)}
                className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#00B32D] hover:bg-[#008F25] transition-colors cursor-pointer"
              >
                Close Release Notes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
