import React from 'react';
import { Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { ConnectivitySnapshot } from '../types/agent';

interface OfflineBlockingScreenProps {
  snapshot: ConnectivitySnapshot;
  onRetry: () => void;
  onQuit?: () => void;
}

export const OfflineBlockingScreen: React.FC<OfflineBlockingScreenProps> = ({
  snapshot,
  onRetry,
  onQuit
}) => {
  const isChecking = snapshot.isChecking;
  const isRuntimeDisconnect = snapshot.runtimeDisconnected;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-blocking-title"
      aria-describedby="offline-blocking-desc"
      data-testid="offline-blocking-screen"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#FFFFFF] text-[#111111] px-6 select-none"
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 34%, rgba(254, 242, 242, 0.72) 0%, rgba(255, 255, 255, 1) 56%)'
      }}
    >
      <div className="w-full max-w-[440px] flex flex-col items-center text-center">
        {/* Quiet EasyToPrint Brand Header */}
        <div className="mb-8 flex items-center gap-2.5">
          <img
            src="./assets/icon.png"
            alt="EasyToPrint Agent"
            className="w-7 h-7 rounded-lg object-contain shrink-0"
          />
          <span className="text-[15px] font-extrabold tracking-[-0.02em] text-[#111111]">
            Easy<span className="text-[#00B32D]">To</span>Print
          </span>
        </div>

        {/* Network Disconnected Emblem */}
        <div className="mb-5 w-20 h-20 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center shadow-[0_8px_24px_rgba(220,38,38,0.08)]">
          <WifiOff className="w-9 h-9 text-[#DC2626] stroke-[2]" aria-hidden="true" />
        </div>

        {/* Explicit Connection Status Indicator (Icon + Semantic Color + Text) */}
        <div className="mb-3 flex items-center justify-center gap-2 text-[12.5px] font-semibold">
          {isChecking ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-[#EA580C] animate-spin" aria-hidden="true" />
              <span className="text-[#C2410C]">Checking connection...</span>
            </>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full bg-[#DC2626] shrink-0"
              />
              <span className="text-[#B91C1C]">Connection Offline</span>
            </>
          )}
        </div>

        {/* Required Title & Description */}
        <h1
          id="offline-blocking-title"
          className="text-[24px] font-extrabold tracking-[-0.025em] text-[#111111] m-0"
          style={{ textWrap: 'balance' }}
        >
          No Internet Connection
        </h1>

        <p
          id="offline-blocking-desc"
          className="mt-3 text-[14px] leading-relaxed text-[#525B54] max-w-[390px]"
        >
          EasyToPrint needs an active internet connection to start. Please connect your device to the internet and try again.
        </p>

        {/* Runtime Disconnect Reassurance (Queued jobs & local state preserved) */}
        {isRuntimeDisconnect && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-[#525B54] bg-[#F7FBF8] border border-[#E1E7E1] rounded-xl px-4 py-2.5">
            Cloud print synchronization is temporarily paused. Your queued print jobs and local settings are safely preserved and will resume automatically once internet is restored.
          </p>
        )}

        {/* Primary Action: Retry Connection */}
        <div className="mt-7 w-full max-w-[260px] flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            disabled={isChecking}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[#00B32D] hover:bg-[#008F25] active:bg-[#00731E] text-[#FFFFFF] text-[14px] font-bold inline-flex items-center justify-center gap-2 transition-colors duration-150 shadow-[0_4px_14px_rgba(0,179,45,0.22)] disabled:opacity-75 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isChecking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                <span>Checking connection...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Retry Connection</span>
              </>
            )}
          </button>

          <p className="text-[12px] text-[#646B65]">
            Monitoring automatically · Reconnects as soon as internet returns
          </p>

          {onQuit && (
            <button
              type="button"
              onClick={onQuit}
              className="mt-1 text-[12px] font-medium text-[#646B65] hover:text-[#111111] underline underline-offset-4 transition-colors"
            >
              Close EasyToPrint Agent
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
