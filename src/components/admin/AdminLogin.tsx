import React, { useState } from 'react';
import { useApp } from '../../lib/store';
import { Shield, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { validateEmail, validatePassword } from '../../lib/validation';
import { ADMIN_DASHBOARD_PATH } from '../../lib/adminConfig';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';

export const AdminLogin: React.FC = () => {
  const { adminLogin, navigate, currentUser } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in as admin, offer to jump directly
  if (currentUser?.role === 'ADMIN') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4 bg-[#F7F8F7]">
        <div className="max-w-md w-full bg-white p-7 sm:p-8 rounded-2xl border border-[#E1E7E1] shadow-2xs text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#E8F8EC] text-[#008F25] flex items-center justify-center mx-auto border border-[#A7F3D0]">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#080808]">Already Authenticated as Admin</h2>
            <p className="text-xs sm:text-sm text-[#777777] mt-1">
              You are currently signed in as <strong className="text-[#080808]">{currentUser.fullName}</strong> ({currentUser.email}).
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <Button
              variant="solid"
              size="md"
              onClick={() => navigate(ADMIN_DASHBOARD_PATH)}
              className="w-full bg-[#00B52D] hover:bg-[#008F25] focus-visible:ring-[#00B52D]"
            >
              Go to Admin Console
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={() => navigate('/')}
              className="w-full"
            >
              Back to Homepage
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const emailError = touched.email ? validateEmail(email).error : undefined;
  const passwordError = touched.password ? (!password.trim() ? 'Password is required.' : undefined) : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setTouched({ email: true, password: true });

    const emailCheck = validateEmail(email);
    if (!emailCheck.isValid) {
      setError(emailCheck.error || 'Please enter a valid admin email.');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your administrator password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await adminLogin(email, password);
      setIsSubmitting(false);
      if (!res.success) {
        setError(res.message || 'Invalid administrator credentials.');
      }
    } catch {
      setIsSubmitting(false);
      setError('Could not connect to authentication service. Please check your connection.');
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-10 px-4 sm:px-6 lg:px-8 bg-[#F7F8F7] relative">
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.4]"
        style={{
          backgroundImage: `linear-gradient(to right, #E1E7E1 1px, transparent 1px), linear-gradient(to bottom, #E1E7E1 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />
      <div className="max-w-[420px] w-full space-y-5 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-11 h-11 rounded-xl bg-[#00B52D] text-white flex items-center justify-center mx-auto shadow-2xs">
            <Shield className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#008F25] bg-[#E8F8EC] px-2.5 py-0.5 rounded-full border border-[#A7F3D0] inline-block">
              Restricted Gateway • Authorized Access Only
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#080808] mt-1">
              Platform Master Admin
            </h1>
            <p className="text-xs sm:text-sm text-[#777777] max-w-sm mx-auto leading-relaxed">
              Restricted access for platform administrators, multi-tenant governance, and billing.
            </p>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200/80 rounded-xl text-xs text-red-700 font-medium flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
            <div className="flex-1 leading-relaxed">{error}</div>
          </div>
        )}

        {/* Login Form Card */}
        <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Admin Email */}
            <div className="space-y-1.5">
              <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-800">
                Admin Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Enter authorized administrator email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? 'admin-email-error' : undefined}
                  disabled={isSubmitting}
                  className={`w-full pl-9 pr-3.5 h-10 sm:h-11 bg-white border rounded-xl text-xs sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
                    emailError
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20 bg-red-50/20'
                      : 'border-slate-200 focus:border-[#00B52D] focus:ring-[#00B52D]/20'
                  }`}
                />
              </div>
              {emailError && (
                <p id="admin-email-error" role="alert" className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{emailError}</span>
                </p>
              )}
            </div>

            {/* Master Password */}
            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-800">
                Master Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="admin-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter administrator password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                  aria-invalid={!!passwordError}
                  aria-describedby={passwordError ? 'admin-password-error' : undefined}
                  disabled={isSubmitting}
                  className={`w-full pl-9 pr-10 h-10 sm:h-11 bg-white border rounded-xl text-xs sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
                    passwordError
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20 bg-red-50/20'
                      : 'border-slate-200 focus:border-[#00B52D] focus:ring-[#00B52D]/20'
                  }`}
                />
                <button
                  type="button"
                  tabIndex={0}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordError && (
                <p id="admin-password-error" role="alert" className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{passwordError}</span>
                </p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              variant="solid"
              size="lg"
              disabled={isSubmitting}
              className="w-full mt-1 bg-[#00B52D] hover:bg-[#008F25] active:bg-[#007A20] focus-visible:ring-[#00B52D]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Super Admin</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Navigation Links */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/auth/login')}
              className="font-semibold text-[#00B52D] hover:text-[#008F25] hover:underline cursor-pointer"
            >
              Shop Owner Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
