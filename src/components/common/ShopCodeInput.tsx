import React, { useState, useRef, useEffect } from 'react';
import { Loader2, ArrowRight, AlertCircle, CheckCircle2, Shield } from 'lucide-react';
import { apiUrl } from '../../lib/apiConfig';
import { useApp } from '../../lib/store';

interface ShopCodeInputProps {
  onSuccess?: (resolved: { redirectUrl: string; shopSlug: string; shopName: string }) => void;
  className?: string;
  autoFocusFirst?: boolean;
  hideCardContainer?: boolean;
  onCancelOrBack?: () => void;
}

export const ShopCodeInput: React.FC<ShopCodeInputProps> = ({
  onSuccess,
  className = '',
  autoFocusFirst = false,
  hideCardContainer = false,
  onCancelOrBack
}) => {
  const { navigate, showToast } = useApp();

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ shopName: string; redirectUrl: string } | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocusFirst && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocusFirst]);

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    setErrorMessage(null);

    // If empty
    if (!rawVal) {
      const nextDigits = [...digits];
      nextDigits[index] = '';
      setDigits(nextDigits);
      return;
    }

    // Keep only numeric characters
    const numericOnly = rawVal.replace(/\D/g, '');
    if (!numericOnly) {
      return;
    }

    // If single digit entered into current box
    if (numericOnly.length === 1) {
      const nextDigits = [...digits];
      nextDigits[index] = numericOnly;
      setDigits(nextDigits);

      // Advance focus to next input if available
      if (index < 5 && inputRefs.current[index + 1]) {
        inputRefs.current[index + 1]?.focus();
      }
    } else {
      // If user typed or auto-filled multiple characters into one box, distribute
      handleMultiDigitFill(numericOnly, index);
    }
  };

  const handleMultiDigitFill = (numericStr: string, startIndex: number = 0) => {
    const slice = numericStr.slice(0, 6);
    const nextDigits = [...digits];

    for (let i = 0; i < slice.length && (startIndex + i) < 6; i++) {
      nextDigits[startIndex + i] = slice[i];
    }
    setDigits(nextDigits);

    // Focus the box following the last pasted digit
    const focusTarget = Math.min(startIndex + slice.length, 5);
    inputRefs.current[focusTarget]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Move to previous box and clear it
        e.preventDefault();
        const nextDigits = [...digits];
        nextDigits[index - 1] = '';
        setDigits(nextDigits);
        inputRefs.current[index - 1]?.focus();
      } else if (digits[index]) {
        // Clear current box
        const nextDigits = [...digits];
        nextDigits[index] = '';
        setDigits(nextDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter') {
      const fullCode = digits.join('');
      if (fullCode.length === 6) {
        e.preventDefault();
        handleResolve(fullCode);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    const pastedText = e.clipboardData.getData('text');
    const numericOnly = pastedText.replace(/\D/g, '');

    if (!numericOnly) return;

    const sixDigits = numericOnly.slice(0, 6);
    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < sixDigits.length; i++) {
      newDigits[i] = sixDigits[i];
    }
    setDigits(newDigits);

    const focusIndex = Math.min(sixDigits.length, 5);
    inputRefs.current[focusIndex]?.focus();

    // Auto submit if exact 6 digits were pasted
    if (sixDigits.length === 6) {
      handleResolve(sixDigits);
    }
  };

  const handleResolve = async (codeToSubmit?: string) => {
    const code = codeToSubmit || digits.join('');
    setErrorMessage(null);

    if (!/^\d{6}$/.test(code)) {
      setErrorMessage('Please enter all 6 numeric digits.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/shop-access/resolve'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        const errorMsg = data?.error || 'Shop not found. Please check the code and try again.';
        setErrorMessage(errorMsg);
        showToast('Shop Access Failed', errorMsg, 'error');
        setIsLoading(false);
        return;
      }

      setSuccessInfo({
        shopName: data.shopName,
        redirectUrl: data.redirectUrl
      });

      if (onSuccess) {
        onSuccess({
          redirectUrl: data.redirectUrl,
          shopSlug: data.shopSlug,
          shopName: data.shopName
        });
      }

      showToast('Shop Found', `Redirecting to ${data.shopName}...`, 'success', 2000);

      // Smooth redirection to shop upload portal
      setTimeout(() => {
        if (data.redirectUrl.startsWith('/')) {
          navigate(data.redirectUrl);
        } else {
          window.location.href = data.redirectUrl;
        }
      }, 600);
    } catch (err) {
      console.error('[ShopCodeInput] Network error resolving code:', err);
      setErrorMessage('Unable to connect to server. Please check your internet connection.');
      showToast('Network Error', 'Unable to verify shop code. Please try again.', 'error');
      setIsLoading(false);
    }
  };

  const isComplete = digits.every((d) => d.length === 1);

  const handleReset = () => {
    setDigits(['', '', '', '', '', '']);
    setErrorMessage(null);
    setSuccessInfo(null);
    inputRefs.current[0]?.focus();
  };

  return (
    <div className={`w-full max-w-md mx-auto text-left font-['Manrope',sans-serif] ${className}`}>
      <div className={hideCardContainer ? "p-2 sm:p-3 text-center" : "bg-white rounded-2xl border border-[#E1E7E1] p-6 shadow-sm"}>
        {/* Title & Prompt */}
        <div className="space-y-1 mb-5 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F8EC] text-[#008F25] text-xs font-bold mb-1">
            <Shield className="w-3.5 h-3.5 text-[#00B32D]" />
            <span>Manual Counter Access</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-[#111111] tracking-tight">
            Can't scan the QR code?
          </h3>
          <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
            Enter the 6-digit shop code to continue.
          </p>
        </div>

        {/* 6 Digit Input Group */}
        <div className="flex justify-center items-center gap-2 sm:gap-2.5 mb-4" onPaste={handlePaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              disabled={isLoading || Boolean(successInfo)}
              onChange={(e) => handleChange(index, e)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-extrabold font-mono rounded-xl border transition-all duration-150 outline-none select-all ${
                errorMessage
                  ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200'
                  : successInfo
                  ? 'border-emerald-500 bg-emerald-50/50 text-[#008F25]'
                  : digit
                  ? 'border-[#00B32D] bg-[#F7FBF8] text-[#111111] shadow-xs'
                  : 'border-[#D1D5DB] bg-white text-[#111111] hover:border-slate-400 focus:border-[#00B32D] focus:ring-2 focus:ring-[#00B32D]/20'
              }`}
              placeholder="•"
              aria-label={`Digit ${index + 1} of 6-digit shop code`}
              autoComplete="off"
            />
          ))}
        </div>

        {/* Validation or Error Message */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Success Redirect Feedback */}
        {successInfo && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="flex-1">
              <span className="font-bold">{successInfo.shopName}</span> found! Redirecting to upload portal...
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="space-y-2">
          <button
            type="button"
            disabled={!isComplete || isLoading || Boolean(successInfo)}
            onClick={() => handleResolve()}
            className={`w-full py-3.5 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer shadow-sm ${
              !isComplete || isLoading || Boolean(successInfo)
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                : 'bg-[#00A61C] hover:bg-[#008F25] text-white shadow-[#00A61C]/20 active:scale-[0.99]'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Checking shop code...</span>
              </>
            ) : successInfo ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Redirecting...</span>
              </>
            ) : (
              <>
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Quick Clear option if user entered digits and wants to reset */}
          {digits.some((d) => d !== '') && !isLoading && !successInfo && (
            <button
              type="button"
              onClick={handleReset}
              className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 py-1 transition-colors cursor-pointer"
            >
              Clear code
            </button>
          )}

          {/* Back option if onCancelOrBack provided */}
          {onCancelOrBack && (
            <button
              type="button"
              onClick={onCancelOrBack}
              className="w-full text-center text-xs font-semibold text-[#00A61C] hover:text-[#008F25] py-1 transition-colors cursor-pointer"
            >
              Back to Camera Scanner
            </button>
          )}
        </div>

        {/* Helper Note */}
        <p className="mt-4 text-[11px] text-center text-slate-400 leading-normal">
          No sign up or login required. You will be taken directly to the document upload screen.
        </p>
      </div>
    </div>
  );
};
