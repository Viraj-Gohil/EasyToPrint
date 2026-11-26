import React from 'react';
import { Check } from 'lucide-react';
import { ConnectivitySnapshot, StartupPhase } from '../types/agent';

interface StartupLoaderScreenProps {
  snapshot: ConnectivitySnapshot;
  isCompleting?: boolean;
}

type StepStatus = 'pending' | 'active' | 'done';

function resolveStepStates(phase: StartupPhase, isCompleting: boolean): {
  internet: StepStatus;
  backend: StepStatus;
  workspace: StepStatus;
} {
  if (isCompleting || phase === 'DASHBOARD') {
    return { internet: 'done', backend: 'done', workspace: 'done' };
  }
  switch (phase) {
    case 'INITIALIZING':
      return { internet: 'pending', backend: 'pending', workspace: 'pending' };
    case 'CHECKING_INTERNET':
      return { internet: 'active', backend: 'pending', workspace: 'pending' };
    case 'VERIFY_BACKEND':
      return { internet: 'done', backend: 'active', workspace: 'pending' };
    case 'LOADING_APP':
      return { internet: 'done', backend: 'done', workspace: 'active' };
    default:
      return { internet: 'pending', backend: 'pending', workspace: 'pending' };
  }
}

export const StartupLoaderScreen: React.FC<StartupLoaderScreenProps> = ({
  snapshot,
  isCompleting = false
}) => {
  const progress = isCompleting ? 100 : Math.max(8, Math.min(100, snapshot.progress || 12));
  const statusText = isCompleting
    ? 'Almost ready...'
    : snapshot.statusMessage || 'Initializing EasyToPrint...';
  const steps = resolveStepStates(snapshot.phase, isCompleting);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!isCompleting}
      data-testid="startup-loader-screen"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#FFFFFF] text-[#111111] select-none px-6 transition-all duration-300 ${
        isCompleting ? 'etp-loader-exit' : ''
      }`}
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 38%, rgba(232, 248, 236, 0.85) 0%, rgba(255, 255, 255, 1) 58%)'
      }}
    >
      <div className="w-full max-w-[380px] flex flex-col items-center text-center">
        {/* Brand Mark with Subtle Scale/Pulse Animation */}
        <div className="relative mb-6 flex items-center justify-center">
          <div
            aria-hidden="true"
            className={`absolute inset-0 rounded-2xl bg-[#E8F8EC] ${
              isCompleting ? 'scale-110 opacity-0 transition-all duration-300' : 'etp-logo-halo'
            }`}
          />
          <div
            className={`relative w-20 h-20 rounded-2xl bg-[#FFFFFF] border border-[#00B32D]/25 flex items-center justify-center overflow-hidden shadow-[0_10px_28px_rgba(0,179,45,0.14)] ${
              isCompleting ? 'scale-105 transition-transform duration-300' : 'etp-logo-breathe'
            }`}
          >
            {isCompleting ? (
              <div className="w-11 h-11 rounded-xl bg-[#00B32D] text-[#FFFFFF] flex items-center justify-center animate-scale-in">
                <Check className="w-6 h-6 stroke-[2.75]" aria-hidden="true" />
              </div>
            ) : (
              <img
                src="./assets/icon.png"
                alt="EasyToPrint Agent"
                className="w-full h-full object-contain"
              />
            )}
          </div>
        </div>

        {/* Prominent Brand Wordmark */}
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em] leading-tight text-[#111111] m-0">
          Easy<span className="text-[#00B32D]">To</span>Print
        </h1>
        <p className="mt-1.5 text-[13px] font-medium text-[#525B54]">
          Windows Desktop Print Agent
        </p>

        {/* Smooth Animated Green Progress Bar */}
        <div className="mt-8 w-full">
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Startup progress"
            className="relative h-2 w-full overflow-hidden rounded-full bg-[#E8F8EC]"
          >
            <div
              className="h-full w-full origin-left rounded-full bg-gradient-to-r from-[#00B32D] to-[#008F25] transition-transform duration-300 ease-out"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
            {!isCompleting && (
              <div
                aria-hidden="true"
                className="etp-progress-sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-white/55 to-transparent"
              />
            )}
          </div>

          {/* Dynamic Status Message & Tabular Percentage */}
          <div className="mt-3.5 flex items-center justify-between gap-3 text-[13px]">
            <span className="font-semibold text-[#111111] truncate">{statusText}</span>
            <span className="font-mono text-[12px] font-semibold text-[#008F25] tabular-nums shrink-0">
              {progress}%
            </span>
          </div>
        </div>

        {/* Clean Unboxed Milestone Stepper */}
        <div
          aria-label="Startup verification milestones"
          className="mt-6 flex items-center justify-center gap-2.5 text-[12px] font-medium"
        >
          <span
            className={
              steps.internet === 'done'
                ? 'text-[#008F25] font-semibold'
                : steps.internet === 'active'
                ? 'text-[#111111] font-semibold'
                : 'text-[#848D86]'
            }
          >
            Internet
          </span>
          <span aria-hidden="true" className="text-[#C8D1C8]">
            ·
          </span>
          <span
            className={
              steps.backend === 'done'
                ? 'text-[#008F25] font-semibold'
                : steps.backend === 'active'
                ? 'text-[#111111] font-semibold'
                : 'text-[#848D86]'
            }
          >
            Secure Server
          </span>
          <span aria-hidden="true" className="text-[#C8D1C8]">
            ·
          </span>
          <span
            className={
              steps.workspace === 'done'
                ? 'text-[#008F25] font-semibold'
                : steps.workspace === 'active'
                ? 'text-[#111111] font-semibold'
                : 'text-[#848D86]'
            }
          >
            Workspace
          </span>
        </div>
      </div>
    </div>
  );
};
