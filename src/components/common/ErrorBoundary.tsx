import React from 'react';
import { AlertTriangle, RefreshCw, LayoutDashboard, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  resetKey?: string;
  onNavigate?: (path: string) => void;
  fallbackDashboardPath?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: ''
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : 'An unexpected rendering error occurred.';
    return {
      hasError: true,
      errorMessage: message
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    console.error('[EasyToPrint ErrorBoundary] Caught runtime error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  handleGoToDashboard = (): void => {
    const targetPath = this.props.fallbackDashboardPath || '/';
    this.setState({ hasError: false, errorMessage: '' });
    if (this.props.onNavigate) {
      this.props.onNavigate(targetPath);
    } else if (typeof window !== 'undefined') {
      window.location.href = targetPath;
    }
  };

  handleGoHome = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    if (this.props.onNavigate) {
      this.props.onNavigate('/');
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const dashboardPath = this.props.fallbackDashboardPath || '/shop/dashboard';
      return (
        <div className="min-h-screen bg-[#F7F8F7] text-[#111111] flex items-center justify-center p-4 font-['Manrope',sans-serif]">
          <div className="max-w-md w-full bg-white p-7 sm:p-8 rounded-2xl border border-[#E1E7E1] shadow-sm text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E8F8EC] text-[#008F25] tracking-wide uppercase">
                EasyToPrint Recovery
              </span>
              <h1 className="text-xl font-extrabold text-[#111111] tracking-tight">
                Something went wrong
              </h1>
              <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
                We encountered an unexpected issue while loading this page. Your session and data remain safe.
              </p>
              {this.state.errorMessage && (
                <p className="text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-words">
                  {this.state.errorMessage}
                </p>
              )}
            </div>

            <div className="pt-1 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={this.handleRetry}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-[#00B32D] text-white hover:bg-[#008F25] active:scale-[0.98] transition-all cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoToDashboard}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm bg-white text-[#111111] border border-[#E1E7E1] hover:bg-[#F7F8F7] transition-colors cursor-pointer"
              >
                <LayoutDashboard className="w-4 h-4 text-[#00B32D]" />
                <span>Go to Dashboard</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl font-medium text-xs text-[#646B65] hover:text-[#111111] transition-colors cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Back to Homepage</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
