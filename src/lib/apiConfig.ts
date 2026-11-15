/**
 * Frontend API Base URL Configuration & Resilient Network Fetch Helper
 *
 * Guarantees:
 * 1. Prevents Mixed-Content ("Failed to fetch") by never allowing an `http://` API URL
 *    when the frontend is served over `https://`, and never calling `localhost` / `127.0.0.1`
 *    from a deployed production hostname.
 * 2. Supports VITE_API_BASE_URL, VITE_API_URL, and NEXT_PUBLIC_API_URL, defaulting to
 *    same-origin relative `/api/...` paths.
 * 3. Provides `fetchWithRetry` with a 15-second AbortController timeout and 3-attempt
 *    exponential backoff (1s, 2s, 4s) plus automatic same-origin fallback.
 */

export function getApiBaseUrl(): string {
  try {
    const metaEnv = (import.meta as any)?.env || {};
    const rawEnvUrl =
      metaEnv.VITE_API_BASE_URL ||
      metaEnv.VITE_API_URL ||
      metaEnv.NEXT_PUBLIC_API_URL ||
      '';

    if (typeof rawEnvUrl !== 'string' || !rawEnvUrl.trim()) {
      return '';
    }

    const candidate = rawEnvUrl.trim().replace(/\/+$/, '');

    // If running in browser, guard against Mixed Content, localhost leaks, and retired domains
    if (typeof window !== 'undefined' && window.location) {
      const pageProtocol = window.location.protocol;
      const pageHost = window.location.hostname;
      const isPageLocal =
        pageHost === 'localhost' ||
        pageHost === '127.0.0.1' ||
        pageHost === '0.0.0.0';

      try {
        const parsed = new URL(candidate, window.location.origin);

        // 1. Block retired printflow domain or same-host redundant absolute URL
        if (
          parsed.hostname === 'printflow.devpixel.space' ||
          parsed.host === window.location.host
        ) {
          return '';
        }

        // 2. Block calling localhost / private IP from a public deployed domain
        const isTargetLocalOrPrivate =
          parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname === '0.0.0.0' ||
          /^192\.168\./.test(parsed.hostname) ||
          /^10\./.test(parsed.hostname) ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(parsed.hostname);

        if (!isPageLocal && isTargetLocalOrPrivate) {
          return '';
        }

        // 3. Prevent Mixed Content (http:// API called from https:// page)
        if (pageProtocol === 'https:' && parsed.protocol === 'http:') {
          if (isTargetLocalOrPrivate) {
            return '';
          }
          parsed.protocol = 'https:';
          return parsed.origin.replace(/\/+$/, '');
        }
      } catch {
        return '';
      }
    }

    return candidate;
  } catch {
    // Non-Vite or node environments
  }
  return '';
}

export function apiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${getApiBaseUrl()}${cleanEndpoint}`;
}

export interface RetryFetchOptions {
  retries?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  initialBackoffMs?: number;
  backoffDelaysMs?: number[];
  onRetry?: (attempt: number, errorMessage: string) => void;
}

/**
 * Resilient fetch wrapper with 15-second AbortController timeout,
 * 3-attempt exponential backoff (1s, 2s, 4s), and automatic same-origin fallback.
 */
export async function fetchWithRetry(
  endpoint: string,
  options: RequestInit = {},
  retryConfig: RetryFetchOptions = {}
): Promise<Response> {
  const maxAttempts = Math.max(1, retryConfig.maxAttempts ?? retryConfig.retries ?? 3);
  const timeoutMs = retryConfig.timeoutMs ?? 15000;
  const initialBackoffMs = retryConfig.initialBackoffMs ?? 1000;
  const backoffDelays = retryConfig.backoffDelaysMs;

  const cleanEndpoint = endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : endpoint.startsWith('/')
      ? endpoint
      : `/${endpoint}`;

  const primaryUrl = endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : apiUrl(cleanEndpoint);

  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If a configured external base URL failed with network error on attempt 1, fall back to same-origin relative path
    const targetUrl =
      attempt > 1 && primaryUrl !== cleanEndpoint && cleanEndpoint.startsWith('/')
        ? cleanEndpoint
        : primaryUrl;

    try {
      const response = await fetch(targetUrl, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // Retry on transient gateway errors (502, 503, 504) if attempts remain
      if ([502, 503, 504].includes(response.status) && attempt < maxAttempts) {
        const delayMs = backoffDelays?.[attempt - 1] ?? (initialBackoffMs * Math.pow(2, attempt - 1));
        retryConfig.onRetry?.(attempt, `Server temporarily busy (HTTP ${response.status}). Retrying...`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;

      if (attempt < maxAttempts) {
        const delayMs = backoffDelays?.[attempt - 1] ?? (initialBackoffMs * Math.pow(2, attempt - 1)); // 1000ms, 2000ms, 4000ms
        const reason = err?.name === 'AbortError'
          ? 'Request timed out'
          : 'Network connection interrupted';
        retryConfig.onRetry?.(attempt, `${reason}. Retrying (${attempt}/${maxAttempts - 1})...`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new Error(`Server request timed out after ${Math.round(timeoutMs / 1000)}s. Please check your internet connection and tap Retry.`);
  }
  const rawMsg = String(lastError?.message || '');
  if (/failed to fetch|networkerror|load failed/i.test(rawMsg)) {
    throw new Error('Network connection interrupted while contacting the print server. Your payment is safe — please tap Retry below.');
  }
  throw lastError instanceof Error ? lastError : new Error('Could not reach print server. Please tap Retry.');
}

export function getAuthToken(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('printflow_access_token');
    }
  } catch {
    // Restricted storage contexts
  }
  return null;
}

export async function authenticatedFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = apiUrl(endpoint);
  const token = getAuthToken();

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: options.credentials || 'include'
  };

  return fetch(url, fetchOptions);
}

export async function safeJsonFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  try {
    const response = await authenticatedFetch(endpoint, options);
    const contentType = response.headers.get('content-type') || '';
    if (contentType.toLowerCase().includes('application/json')) {
      try {
        const data = await response.json();
        return {
          ok: response.ok,
          status: response.status,
          data,
          error: !response.ok ? (data?.error || `Request failed with status ${response.status}`) : undefined
        };
      } catch {
        return {
          ok: false,
          status: response.status,
          data: {} as T,
          error: `Server returned invalid JSON response (Status ${response.status}).`
        };
      }
    } else {
      return {
        ok: false,
        status: response.status,
        data: {} as T,
        error: response.ok
          ? `Server returned non-JSON response.`
          : `Server returned error status ${response.status}.`
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: {} as T,
      error: err?.message || 'Network connection failure.'
    };
  }
}

