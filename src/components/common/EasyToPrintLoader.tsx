import React, { useEffect, useState } from 'react';

interface EasyToPrintLoaderProps {
  variant?: 'fullscreen' | 'card' | 'inline';
  title?: string;
  subtitle?: string;
  showProgressBar?: boolean;
  className?: string;
}

/**
 * Creative, print-domain-authentic EasyToPrint loader:
 * Renders a sleek print-head housing, an animated emerging document sheet
 * with progressive printed lines, a precision #00B32D laser sweep, and a smooth progress bar.
 */
export const EasyToPrintLoader: React.FC<EasyToPrintLoaderProps> = ({
  variant = 'fullscreen',
  title = 'EasyToPrint',
  subtitle = 'Preparing your print workspace...',
  showProgressBar = true,
  className = ''
}) => {
  const isFullscreen = variant === 'fullscreen';
  const isInline = variant === 'inline';

  const emblem = (
    <div className="relative flex flex-col items-center select-none" aria-hidden="true">
      {/* Subtle outer precision halo */}
      <div className="relative w-20 h-20 rounded-2xl bg-[#F4FAF5] border border-[#CBEBD0] flex flex-col items-center justify-start pt-2.5 overflow-hidden shadow-xs">
        {/* Top Printer Housing Bar */}
        <div className="w-13 h-3.5 rounded-md bg-[#111111] flex items-center justify-between px-1.5 z-10 shadow-2xs">
          <span className="w-4 h-0.5 rounded-full bg-white/40" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#00B32D]" />
        </div>

        {/* Printer Feed Slot */}
        <div className="w-10 h-1 bg-[#1F2937] rounded-b-sm z-10" />

        {/* Emerging Printed Sheet */}
        <div className="relative w-9 h-11 -mt-0.5 rounded-b-md bg-white border border-[#D4DFD5] shadow-sm px-1.5 pt-2 pb-1.5 flex flex-col gap-1 etp-sheet-feed">
          {/* Printed Document Lines */}
          <span className="block h-1 w-full rounded-full bg-[#00B32D] etp-line-reveal" />
          <span
            className="block h-1 w-4/5 rounded-full bg-[#111111]/75 etp-line-reveal"
            style={{ animationDelay: '0.12s' }}
          />
          <span
            className="block h-1 w-full rounded-full bg-[#111111]/35 etp-line-reveal"
            style={{ animationDelay: '0.24s' }}
          />
          <span
            className="block h-1 w-3/5 rounded-full bg-[#00B32D]/60 etp-line-reveal"
            style={{ animationDelay: '0.36s' }}
          />
        </div>

        {/* Precision Laser Scan Beam */}
        <div className="absolute inset-x-3 top-6 h-0.5 rounded-full bg-[#00B32D] shadow-[0_0_8px_2px_rgba(0,179,45,0.55)] etp-laser-beam pointer-events-none z-20" />
      </div>
    </div>
  );

  if (isInline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex flex-col items-center justify-center py-6 px-4 text-center font-['Manrope',sans-serif] ${className}`}
      >
        {emblem}
        <div className="mt-4 space-y-1 max-w-xs">
          <p className="text-sm font-bold text-[#111111] tracking-tight">{title}</p>
          {subtitle && <p className="text-xs text-[#646B65]">{subtitle}</p>}
        </div>
        {showProgressBar && (
          <div className="mt-3.5 w-36 h-1 rounded-full bg-[#E8F8EC] overflow-hidden border border-[#CBEBD0]/60">
            <div className="h-full w-2/5 rounded-full bg-linear-to-r from-[#008F25] via-[#00B32D] to-[#22C55E] etp-progress-sweep" />
          </div>
        )}
      </div>
    );
  }

  const cardContent = (
    <div className="relative bg-white/95 backdrop-blur-md px-8 py-7 rounded-2xl border border-[#E1E7E1] shadow-xl flex flex-col items-center text-center max-w-xs w-full">
      {emblem}

      {/* Brand Wordmark & Status */}
      <div className="mt-5 space-y-1">
        <div className="text-lg font-extrabold tracking-tight text-[#111111]">
          {title === 'EasyToPrint' ? (
            <>
              Easy<span className="text-[#00B32D]">To</span>Print
            </>
          ) : (
            title
          )}
        </div>
        {subtitle && (
          <p className="text-xs font-medium text-[#646B65] leading-relaxed">{subtitle}</p>
        )}
      </div>

      {/* Sleek Sweeping Progress Track */}
      {showProgressBar && (
        <div className="mt-5 w-full h-1.5 rounded-full bg-[#E8F8EC] overflow-hidden border border-[#CBEBD0]/60">
          <div className="h-full w-2/5 rounded-full bg-linear-to-r from-[#008F25] via-[#00B32D] to-[#22C55E] etp-progress-sweep" />
        </div>
      )}
    </div>
  );

  if (!isFullscreen) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center justify-center p-4 font-['Manrope',sans-serif] ${className}`}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={title}
      className={`fixed inset-0 z-[100] bg-[#F7F8F7] flex flex-col items-center justify-center p-4 font-['Manrope',sans-serif] ${className}`}
    >
      {/* Subtle Blueprint Grid Background matching EasyToPrint aesthetic */}
      <div
        className="absolute inset-0 pointer-events-none opacity-45"
        style={{
          backgroundImage: `
            linear-gradient(to right, #E1E7E1 1px, transparent 1px),
            linear-gradient(to bottom, #E1E7E1 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px'
        }}
      />
      <div className="relative z-10 w-full flex justify-center">{cardContent}</div>
    </div>
  );
};

interface TopRouteLoaderProps {
  active?: boolean;
  routeKey: string;
}

/**
 * Sleek top-edge progress bar that sweeps across smoothly on route changes and background fetches.
 */
export const TopRouteLoader: React.FC<TopRouteLoaderProps> = ({ active = false, routeKey }) => {
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setNavigating(true);
    const timer = window.setTimeout(() => {
      setNavigating(false);
    }, 360);
    return () => window.clearTimeout(timer);
  }, [routeKey]);

  const isVisible = active || navigating;

  return isVisible ? (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[90] h-[3px] bg-[#E8F8EC]/80 pointer-events-none overflow-hidden transition-opacity duration-150"
    >
      <div className="h-full w-1/3 rounded-r-full bg-linear-to-r from-[#008F25] via-[#00B32D] to-[#4ADE80] shadow-[0_0_8px_rgba(0,179,45,0.6)] etp-progress-sweep" />
    </div>
  ) : null;
};
