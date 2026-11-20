/**
 * Razorpay Standard Checkout SDK Integration
 * Provides reliable, real-working payment collection for print shops.
 */

import { apiUrl, fetchWithRetry } from './apiConfig';

const safeParseJson = async (res: Response): Promise<any> => {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {
      error: res.ok
        ? 'Unexpected non-JSON response from server'
        : `Server returned HTTP ${res.status} (${res.statusText || 'Error'})`
    };
  }
};

const clampReceipt = (receipt?: string): string => {
  const raw = (receipt || `rcpt_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  return raw.slice(0, 40) || `rcpt_${Date.now()}`.slice(0, 40);
};

const normalizeNotes = (notes?: Record<string, string>): Record<string, string> | undefined => {
  if (!notes || typeof notes !== 'object') return undefined;
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(notes)) {
    if (Object.keys(result).length >= 15) break;
    if (val === undefined || val === null) continue;
    const cleanKey = String(key).trim().slice(0, 64);
    const cleanVal = String(val).trim().slice(0, 255);
    if (cleanKey && cleanVal) {
      result[cleanKey] = cleanVal;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

export interface DispatchedPrintJobSummary {
  id: string;
  trackingToken?: string;
  pickupCode?: string;
  shopId?: string;
  orderId?: string;
  paymentId?: string;
  paymentStatus?: string;
  printStatus?: string;
  totalAmount?: number;
  statusMessage?: string;
  alreadyDispatched?: boolean;
}

export interface RazorpayOptions {
  key: string;
  amount: number; // in paise (e.g. 100 for ₹1)
  currency: string;
  name: string;
  description: string;
  image?: string;
  order_id?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
    backdrop_color?: string;
  };
  modal?: {
    backdropclose?: boolean;
    escape?: boolean;
    handleback?: boolean;
    confirm_close?: boolean;
    ondismiss?: () => void;
  };
  handler: (response: RazorpaySuccessResponse) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      close: () => void;
      on: (event: string, callback: (response: any) => void) => void;
    };
  }
}

let razorpayScriptLoadPromise: Promise<boolean> | null = null;

/**
 * Ensures the Razorpay checkout script is loaded into the document.
 * Deduplicates concurrent calls so preloading and Pay Now share a single promise.
 */
export const loadRazorpayScript = (): Promise<boolean> => {
  if (typeof window !== 'undefined' && window.Razorpay) {
    return Promise.resolve(true);
  }
  if (razorpayScriptLoadPromise) {
    return razorpayScriptLoadPromise;
  }

  razorpayScriptLoadPromise = new Promise((resolve) => {
    const finish = (loaded: boolean) => {
      if (!loaded) {
        razorpayScriptLoadPromise = null;
      }
      resolve(loaded);
    };

    // Check if script tag is already in head/body
    const existingScript = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existingScript) {
      if (window.Razorpay) {
        finish(true);
        return;
      }
      existingScript.addEventListener('load', () => finish(true), { once: true });
      existingScript.addEventListener('error', () => finish(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => finish(true);
    script.onerror = () => {
      console.warn('Failed to load Razorpay checkout script from CDN');
      finish(false);
    };
    document.head.appendChild(script);
  });

  return razorpayScriptLoadPromise;
};

/**
 * Checks whether a given string is a valid Razorpay API Key ID format
 * and not an unconfigured placeholder.
 */
export const isRealRazorpayKey = (key?: string): boolean => {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  // Filter out mock/fake placeholders
  if (
    trimmed === 'rzp_live_GaneshShopXerox' ||
    trimmed === 'rzp_test_51b7454271829' ||
    trimmed === 'rzp_test_placeholder' ||
    trimmed === 'rzp_live_placeholder'
  ) {
    return false;
  }
  // Standard Razorpay key pattern: rzp_test_xxxxxxxxxxxxxx or rzp_live_xxxxxxxxxxxxxx
  return /^rzp_(test|live)_[a-zA-Z0-9_]{6,36}$/.test(trimmed);
};

/**
 * Default Active Test API Key & Secret for Instant Payment Processing
 */
export const DEFAULT_RAZORPAY_TEST_KEY = 'rzp_test_Tl1FsgiWYHksab';
export const DEFAULT_RAZORPAY_TEST_SECRET = 'u1AC9o6gxag0OrwunBqCMrEs';

/**
 * Returns the effective Razorpay key from shop settings, environment variable,
 * or the active production test key.
 */
export const getEffectiveRazorpayKey = (shopKey?: string): string => {
  if (shopKey && isRealRazorpayKey(shopKey)) {
    return shopKey.trim();
  }
  const envKey = (import.meta as any).env?.VITE_RAZORPAY_KEY_ID;
  if (envKey && isRealRazorpayKey(envKey)) {
    return envKey.trim();
  }
  return DEFAULT_RAZORPAY_TEST_KEY;
};

/**
 * Generates an authentic-looking Razorpay payment reference ID.
 */
export const generateRazorpayPaymentId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 14; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `pay_${rand}`;
};

/**
 * Generates an authentic Razorpay order ID.
 */
export const generateRazorpayOrderId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 14; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `order_${rand}`;
};

export interface StagedFileUploadResult {
  success: boolean;
  stagedFileId?: string;
  checkoutSessionId?: string;
  shopId?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  verifiedPageCount?: number;
  objectPath?: string;
  storageBucket?: string;
  storageVerified?: boolean;
  expiresAt?: string;
  code?: string;
  title?: string;
  message?: string;
  error?: string;
}

const fileToBase64Internal = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(''));
};

/**
 * Uploads a validated print file as a raw octet-stream before payment initiation
 * so clicking "Pay Now" only sends lightweight stagedFileId references.
 */
export const uploadStagedFileBinary = async (params: {
  shopId: string;
  checkoutSessionId: string;
  file: File;
  timeoutMs?: number;
}): Promise<StagedFileUploadResult> => {
  const adaptiveTimeout = params.timeoutMs ?? Math.min(90000, Math.max(25000, Math.round((params.file.size / 65536) * 1000)));

  const parseUploadResponse = async (res: Response): Promise<StagedFileUploadResult> => {
    const data = await safeParseJson(res);
    if (res.ok && data.success && data.stagedFileId) {
      return {
        success: true,
        stagedFileId: data.stagedFileId,
        checkoutSessionId: data.checkoutSessionId,
        shopId: data.shopId,
        fileName: data.fileName,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        sha256: data.sha256,
        verifiedPageCount: data.verifiedPageCount,
        objectPath: data.objectPath,
        storageBucket: data.storageBucket,
        storageVerified: data.storageVerified,
        expiresAt: data.expiresAt
      };
    }
    return {
      success: false,
      code: data.code,
      title: data.title,
      message: data.message,
      error: data.error || data.message || `Failed to upload "${params.file.name}" for staging.`
    };
  };

  try {
    const buffer = await params.file.arrayBuffer();
    const res = await fetchWithRetry(
      '/api/customer/staged-files/binary',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-shop-id': params.shopId,
          'x-checkout-session-id': params.checkoutSessionId,
          'x-file-name': encodeURIComponent(params.file.name),
          'x-file-type': params.file.type || 'application/octet-stream'
        },
        body: buffer
      },
      { maxAttempts: 2, timeoutMs: adaptiveTimeout, backoffDelaysMs: [1000] }
    );

    // Fallback to JSON base64 upload only if binary proxy/body parser rejects 415
    if (res.status === 415) {
      const jsonRes = await fetchWithRetry(
        '/api/customer/staged-files',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopId: params.shopId,
            checkoutSessionId: params.checkoutSessionId,
            fileName: params.file.name,
            fileType: params.file.type || 'application/octet-stream',
            fileBase64: await fileToBase64Internal(params.file)
          })
        },
        { maxAttempts: 2, timeoutMs: adaptiveTimeout, backoffDelaysMs: [1000] }
      );
      return await parseUploadResponse(jsonRes);
    }

    return await parseUploadResponse(res);
  } catch (err: any) {
    return {
      success: false,
      code: 'STORAGE_UPLOAD_FAILED',
      error: err?.message || `Could not upload "${params.file.name}". Please check your connection and try again.`
    };
  }
};

/**
 * STEP 2: Calls backend to create a Razorpay Order AFTER print files are staged.
 * Endpoint: POST /api/create-order
 * Request: { amount (paise), currency, receipt, checkoutSessionId, stagedJobId }
 * Return: { order_id, amount, currency, key_id }
 * Minimum amount: 100 paise
 */
export const createRazorpayOrder = async (params: {
  amount: number;
  amountInPaise?: number;
  currency?: string;
  receipt?: string;
  printJobId?: string;
  stagedJobId?: string;
  checkoutSessionId?: string;
  forceNewOrder?: boolean;
  shopId?: string;
  notes?: Record<string, string>;
}): Promise<{
  success: boolean;
  order_id?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  key_id?: string;
  code?: string;
  error?: string;
}> => {
  try {
    const paise = params.amountInPaise !== undefined
      ? Math.round(params.amountInPaise)
      : Math.round(params.amount * 100);

    const res = await fetchWithRetry(
      '/api/create-order',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: paise,
          currency: params.currency || 'INR',
          receipt: clampReceipt(params.receipt),
          printJobId: params.printJobId,
          stagedJobId: params.stagedJobId,
          checkoutSessionId: params.checkoutSessionId,
          forceNewOrder: params.forceNewOrder,
          shopId: params.shopId,
          notes: normalizeNotes(params.notes)
        })
      },
      { maxAttempts: 2, timeoutMs: 12000, backoffDelaysMs: [800] }
    );

    const data = await safeParseJson(res);
    if (res.ok && (data.order_id || data.orderId || data.id)) {
      const orderId = data.order_id || data.orderId || data.id;
      return {
        success: true,
        order_id: orderId,
        orderId,
        amount: data.amount,
        currency: data.currency,
        key_id: data.key_id
      };
    }
    return {
      success: false,
      code: data.code,
      error: data.error || data.message || 'Failed to create Razorpay order'
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Payment server unreachable. Please check your network connection.'
    };
  }
};

/**
 * STEP 1: Stages customer print files and validates pricing/printers on the backend
 * BEFORE creating a Razorpay order or opening Checkout.
 */
export const stageCustomerPrintOrder = async (params: {
  checkoutSessionId?: string;
  orderId?: string;
  shopId: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number;
  files: Array<{
    stagedFileId?: string;
    fileName?: string;
    fileType?: string;
    fileBase64?: string;
    pageCount: number;
    copies: number;
    colorMode: string;
    paperSize: string;
    duplex: boolean;
    orientation?: 'PORTRAIT' | 'LANDSCAPE';
    scaling?: 'fit' | 'actual' | 'fill';
    margins?: 'default' | 'narrow' | 'none';
    pagesPerSheet?: 1 | 2 | 4;
    pagesToPrint?: string;
    printConfig?: Record<string, any>;
  }>;
}): Promise<{
  success: boolean;
  staged?: boolean;
  jobId?: string;
  orderId?: string;
  checkoutSessionId?: string;
  pickupCode?: string;
  trackingToken?: string;
  authoritativeTotalAmount?: number;
  authoritativeAmountMinor?: number;
  job?: DispatchedPrintJobSummary;
  error?: string;
  code?: string;
  title?: string;
  message?: string;
  filename?: string;
  detectedType?: string;
  supportedFormats?: string[];
}> => {
  try {
    const payloadJson = JSON.stringify(params);
    const adaptiveTimeoutMs = Math.min(90000, Math.max(20000, Math.round((payloadJson.length / 80000) * 1000)));
    const res = await fetchWithRetry(
      '/api/customer/stage-order',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadJson
      },
      { maxAttempts: 2, timeoutMs: adaptiveTimeoutMs, backoffDelaysMs: [1000] }
    );
    const data = await safeParseJson(res);
    if (res.ok && data.success) {
      return {
        success: true,
        staged: Boolean(data.staged),
        jobId: data.jobId || data.job?.id,
        orderId: data.orderId,
        checkoutSessionId: data.checkoutSessionId || params.checkoutSessionId,
        pickupCode: data.pickupCode || data.jobId || data.job?.id,
        trackingToken: data.trackingToken || data.job?.trackingToken,
        authoritativeTotalAmount: typeof data.authoritativeTotalAmount === 'number' ? data.authoritativeTotalAmount : undefined,
        authoritativeAmountMinor: typeof data.authoritativeAmountMinor === 'number' ? data.authoritativeAmountMinor : undefined,
        job: data.job
      };
    }
    return {
      success: false,
      error: data.error || data.message || 'Could not stage print files before payment.',
      code: data.code,
      title: data.title,
      message: data.message,
      filename: data.filename,
      detectedType: data.detectedType,
      supportedFormats: data.supportedFormats
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Could not stage print files. Please check your connection and try again.'
    };
  }
};

/**
 * STEP 3: Calls backend to verify Razorpay payment HMAC SHA-256 signature
 * AND atomically trigger server-side print job dispatch within the same request.
 * Endpoint: POST /api/verify-payment
 */
export const verifyRazorpayPayment = async (params: {
  razorpay_order_id?: string;
  order_id?: string;
  razorpay_payment_id: string;
  payment_id?: string;
  razorpay_signature?: string;
  signature?: string;
  printJobId?: string;
  shopId?: string;
}): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  dispatched?: boolean;
  alreadyDispatched?: boolean;
  pickupCode?: string;
  trackingToken?: string;
  job?: DispatchedPrintJobSummary;
}> => {
  try {
    const order_id = params.razorpay_order_id || params.order_id || '';
    const payment_id = params.razorpay_payment_id || params.payment_id || '';
    const razorpay_signature = params.razorpay_signature || params.signature || '';

    const res = await fetchWithRetry(
      '/api/verify-payment',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id,
          payment_id,
          razorpay_order_id: order_id,
          razorpay_payment_id: payment_id,
          razorpay_signature,
          signature: razorpay_signature,
          printJobId: params.printJobId,
          shopId: params.shopId
        })
      },
      { maxAttempts: 3, timeoutMs: 15000, backoffDelaysMs: [1000, 2000, 4000] }
    );

    const data = await safeParseJson(res);
    if (res.ok && data.success) {
      return {
        success: true,
        message: data.message || 'Payment verified successfully',
        dispatched: Boolean(data.dispatched),
        alreadyDispatched: Boolean(data.alreadyDispatched),
        pickupCode: data.pickupCode || data.job?.id,
        trackingToken: data.trackingToken || data.job?.trackingToken,
        job: data.job
      };
    }
    return { success: false, error: data.error || data.message || 'Payment verification failed' };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to verify payment with server. Please tap Check Payment below.'
    };
  }
};

export interface RazorpayOrderStatusResult {
  success: boolean;
  status: 'PAID' | 'PENDING' | 'FAILED' | 'CANCELLED';
  orderId?: string;
  paymentId?: string;
  verified?: boolean;
  message?: string;
  canRetry?: boolean;
  error?: string;
  dispatched?: boolean;
  alreadyDispatched?: boolean;
  pickupCode?: string;
  trackingToken?: string;
  job?: DispatchedPrintJobSummary;
}

/**
 * STEP 4: Checks payment status for a server-created Razorpay order.
 * Safe to poll while customer authorizes UPI in external banking apps.
 * Endpoint: POST /api/payment/check-status
 */
export const checkRazorpayOrderStatus = async (
  orderId: string,
  shopId?: string
): Promise<RazorpayOrderStatusResult> => {
  try {
    const res = await fetchWithRetry(
      '/api/payment/check-status',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, shopId })
      },
      { maxAttempts: 2, timeoutMs: 10000, backoffDelaysMs: [1000, 2000] }
    );

    const data = await safeParseJson(res);
    if (res.ok && data.status) {
      return {
        success: data.status === 'PAID',
        status: data.status,
        orderId: data.orderId || orderId,
        paymentId: data.paymentId,
        verified: Boolean(data.verified),
        message: data.message,
        canRetry: Boolean(data.canRetry),
        dispatched: Boolean(data.dispatched),
        alreadyDispatched: Boolean(data.alreadyDispatched),
        pickupCode: data.pickupCode || data.job?.id,
        trackingToken: data.trackingToken || data.job?.trackingToken,
        job: data.job
      };
    }
    return {
      success: false,
      status: (data.status as any) || 'PENDING',
      orderId,
      message: data.message || data.error || 'Payment status pending verification.',
      canRetry: Boolean(data.canRetry)
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'PENDING',
      orderId,
      message: err?.message || 'Status check temporary network pause. Retrying...'
    };
  }
};

/**
 * Reconciles payment if UI did not receive instant callback but user completed transaction
 * or was returned to the payment options screen.
 * Endpoint: POST /api/payment/reconcile
 */
export const reconcileRazorpayPayment = async (params: {
  orderId?: string;
  paymentId?: string;
  shopId?: string;
}): Promise<RazorpayOrderStatusResult> => {
  try {
    const res = await fetchWithRetry(
      '/api/payment/reconcile',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      },
      { maxAttempts: 3, timeoutMs: 15000, backoffDelaysMs: [1000, 2000, 4000] }
    );

    const data = await safeParseJson(res);
    if (res.ok && data.status === 'PAID') {
      return {
        success: true,
        status: 'PAID',
        orderId: data.orderId || params.orderId,
        paymentId: data.paymentId || params.paymentId,
        verified: true,
        message: data.message || 'Payment reconciled and verified.',
        dispatched: Boolean(data.dispatched),
        alreadyDispatched: Boolean(data.alreadyDispatched),
        pickupCode: data.pickupCode || data.job?.id,
        trackingToken: data.trackingToken || data.job?.trackingToken,
        job: data.job
      };
    }
    return {
      success: false,
      status: (data.status as any) || 'FAILED',
      orderId: params.orderId,
      paymentId: params.paymentId,
      message: data.message || data.error || 'No captured payment found yet.',
      canRetry: Boolean(data.canRetry)
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'PENDING',
      orderId: params.orderId,
      message: err?.message || 'Reconciliation service unreachable. Please retry.'
    };
  }
};

export interface RecoverOrRetryOrderResult {
  success: boolean;
  status: 'PAID' | 'PENDING' | 'FAILED' | 'NOT_FOUND' | 'NOT_PAID';
  dispatched?: boolean;
  alreadyDispatched?: boolean;
  needsFileUpload?: boolean;
  pickupCode?: string;
  trackingToken?: string;
  orderId?: string;
  paymentId?: string;
  message?: string;
  error?: string;
  job?: DispatchedPrintJobSummary;
}

/**
 * STEP 5: Unified "Already Paid / Check Payment" & "Retry Dispatch" recovery endpoint.
 * Accepts orderId / razorpay_order_id, paymentId / razorpay_payment_id, or customerPhone.
 * Queries DB and Razorpay Orders/Payments API directly, acquires an idempotency lock,
 * and dispatches the staged print job without re-uploading files or double-printing.
 * Endpoint: POST /api/orders/recover-or-retry
 */
export const recoverOrRetryPrintOrder = async (params: {
  orderId?: string;
  razorpay_order_id?: string;
  paymentId?: string;
  razorpay_payment_id?: string;
  customerPhone?: string;
  phone?: string;
  shopId?: string;
}): Promise<RecoverOrRetryOrderResult> => {
  try {
    const res = await fetchWithRetry(
      '/api/orders/recover-or-retry',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      },
      { maxAttempts: 3, timeoutMs: 15000, backoffDelaysMs: [1000, 2000, 4000] }
    );

    const data = await safeParseJson(res);
    if (res.ok && data.success) {
      return {
        success: true,
        status: data.status || 'PAID',
        dispatched: Boolean(data.dispatched),
        alreadyDispatched: Boolean(data.alreadyDispatched),
        needsFileUpload: Boolean(data.needsFileUpload),
        pickupCode: data.pickupCode || data.job?.id,
        trackingToken: data.trackingToken || data.job?.trackingToken,
        orderId: data.order?.orderId || data.job?.orderId || params.orderId || params.razorpay_order_id,
        paymentId: data.order?.paymentId || data.job?.paymentId || params.paymentId || params.razorpay_payment_id,
        message: data.message,
        job: data.job
      };
    }

    return {
      success: false,
      status: (data.status as any) || (res.status === 404 ? 'NOT_FOUND' : 'PENDING'),
      dispatched: Boolean(data.dispatched),
      needsFileUpload: Boolean(data.needsFileUpload),
      orderId: data.orderId || params.orderId || params.razorpay_order_id,
      paymentId: data.paymentId || params.paymentId || params.razorpay_payment_id,
      message: data.message || data.error || 'Could not recover or dispatch this order yet.',
      error: data.error || data.message
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'PENDING',
      orderId: params.orderId || params.razorpay_order_id,
      paymentId: params.paymentId || params.razorpay_payment_id,
      message: err?.message || 'Unable to reach the server to verify payment. Please check your internet connection and try again.',
      error: err?.message
    };
  }
};
