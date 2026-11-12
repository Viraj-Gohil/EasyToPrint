import React from 'react';
import { AgentConfig, AgentConnectionStatus } from '../types/agent';
import { AgentStatusBadge } from './StatusBadge';
import { Printer, RefreshCw, Settings, Minus, Sun, Moon, Store, Laptop } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import packageMetadata from '../../../package.json';

interface HeaderProps {
  status: AgentConnectionStatus;
  lastHeartbeat: string | null;
  config: AgentConfig;
  isPolling: boolean;
  onPollNow: () => void;
  onOpenSettings: () => void;
  onMinimizeToTray: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  lastHeartbeat,
  config,
  isPolling,
  onPollNow,
  onOpenSettings,
  onMinimizeToTray
}) => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <header className="agent-topbar px-6 py-3 flex items-center justify-between border-b border-[#E1E7E1] dark:border-slate-800 bg-white dark:bg-[#131D33] transition-colors">
      {/* Brand & Terminal Meta */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-[#E8F8EC] dark:bg-emerald-950/60 border border-[#00B52D]/30 flex items-center justify-center shadow-xs shrink-0 overflow-hidden">
          <svg viewBox="0 0 64 64" className="w-7 h-7" fill="none" aria-hidden="true">
            <path d="M21 15C21 13.8954 21.8954 13 23 13H41C42.1046 13 43 13.8954 43 15V24H21V15Z" fill="#00B52D" />
            <rect x="24" y="16" width="16" height="8" rx="1" fill="#FFFFFF" />
            <rect x="12" y="24" width="40" height="20" rx="5" fill="#080808" />
            <circle cx="45" cy="30" r="2.2" fill="#00B52D" />
            <rect x="19" y="38" width="26" height="14" rx="2.5" fill="#FFFFFF" stroke="#00B52D" strokeWidth="2" />
            <line x1="24" y1="43" x2="40" y2="43" stroke="#00B52D" strokeWidth="2" strokeLinecap="round" />
            <line x1="24" y1="47" x2="35" y2="47" stroke="#00B52D" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-extrabold text-[#080808] dark:text-white tracking-tight">
              Easy<span className="text-[#00B52D]">To</span>Print <span className="font-semibold text-[#00B52D] dark:text-emerald-400">Agent</span>
            </span>
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-md bg-[#F0F4F1] dark:bg-slate-800 text-[#646B65] dark:text-slate-400 border border-[#E1E7E1] dark:border-slate-700">
              v{packageMetadata.version}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11.5px] text-[#646B65] dark:text-slate-400 mt-0.5 min-w-0">
            <span className="inline-flex items-center gap-1 font-medium text-[#111111] dark:text-slate-300 truncate">
              <Store className="w-3 h-3 text-[#848D86] shrink-0" />
              {config.shopDetails?.shopName || config.shopSlug || config.shopId || 'Unlinked Shop'}
            </span>
            <span className="text-[#E1E7E1] dark:text-slate-700">•</span>
            <span className="inline-flex items-center gap-1 font-mono text-[#646B65] dark:text-slate-400 truncate">
              <Laptop className="w-3 h-3 text-[#848D86] shrink-0" />
              {config.deviceName || 'Desktop PC'}
            </span>
            {lastHeartbeat && (
              <>
                <span className="hidden sm:inline text-[#E1E7E1] dark:text-slate-700">•</span>
                <span
                  className="hidden sm:inline text-[11px] text-[#848D86] dark:text-slate-500"
                  title={`Last successful heartbeat: ${new Date(lastHeartbeat).toLocaleString()}`}
                >
                  Heartbeat {new Date(lastHeartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Status & Global Controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        <AgentStatusBadge status={status} />

        {/* Manual Poll Button */}
        <button
          type="button"
          onClick={onPollNow}
          disabled={isPolling}
          className="secondary-button !min-h-[32px] !py-1 !px-2.5 text-xs font-semibold"
          title="Force poll cloud queue immediately"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#00B32D] dark:text-emerald-400 ${isPolling ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline font-medium text-[#111111] dark:text-slate-200">
            {isPolling ? 'Checking...' : 'Check Jobs'}
          </span>
        </button>

        {/* Theme Selector */}
        <div
          role="group"
          aria-label="Appearance Mode"
          className="flex items-center p-0.5 rounded-lg border border-[#E1E7E1] dark:border-slate-800 bg-[#F0F4F1] dark:bg-slate-900"
        >
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`p-1 rounded-md transition-colors ${
              theme === 'light'
                ? 'bg-white text-amber-500 shadow-xs'
                : 'text-[#848D86] hover:text-[#111111] dark:hover:text-white'
            }`}
            title="Light Theme"
            aria-pressed={theme === 'light'}
            aria-label="Light Theme"
          >
            <Sun className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`p-1 rounded-md transition-colors ${
              theme === 'dark'
                ? 'bg-[#131D33] text-emerald-400 shadow-xs'
                : 'text-[#848D86] hover:text-[#111111] dark:hover:text-white'
            }`}
            title="Dark Theme"
            aria-pressed={theme === 'dark'}
            aria-label="Dark Theme"
          >
            <Moon className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setTheme('system')}
            className={`p-1 rounded-md transition-colors ${
              theme === 'system'
                ? 'bg-white dark:bg-[#131D33] text-[#00B32D] shadow-xs'
                : 'text-[#848D86] hover:text-[#111111] dark:hover:text-white'
            }`}
            title={`System Theme (${resolvedTheme === 'dark' ? 'Dark OS' : 'Light OS'})`}
            aria-pressed={theme === 'system'}
            aria-label="System Theme"
          >
            <Laptop className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Settings Button */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg border border-[#E1E7E1] dark:border-slate-800 bg-white dark:bg-[#131D33] text-[#646B65] hover:text-[#111111] dark:text-slate-400 dark:hover:text-white hover:bg-[#E8F8EC] dark:hover:bg-slate-800 transition-colors"
          title="Agent Setup & Connection"
          aria-label="Agent Setup & Connection"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Minimize to Tray */}
        <button
          type="button"
          onClick={onMinimizeToTray}
          className="p-1.5 rounded-lg text-[#848D86] hover:text-[#111111] dark:hover:text-white hover:bg-[#E8F8EC] dark:hover:bg-slate-800 transition-colors"
          title="Minimize to System Tray"
          aria-label="Minimize to System Tray"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
