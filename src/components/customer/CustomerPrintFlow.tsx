import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp, EMPTY_SHOP } from '../../lib/store';
import { PaperSize, FilePrintConfig, PrintJob, PagesPerSheet, Shop, PricingRule } from '../../types/index';
import { resolveUnitPrice } from '../../lib/utils/pricing';
import {
  Upload,
  FileText,
  Trash2,
  Plus,
  ArrowRight,
  ArrowLeft,
  Check,
  Printer,
  ShieldCheck,
  RotateCw,
  ImageIcon,
  CheckCircle2,
  Lock,
  Copy,
  AlertCircle,
  AlertTriangle,
  Eye,
  Edit3,
  ChevronDown,
  ChevronUp,
  Minus,
  X,
  CreditCard,
  Layers,
  Camera,
  ExternalLink,
  Key,
  Zap,
  Search,
  Files,
  GripVertical,
  HelpCircle
} from 'lucide-react';
import { validatePhone, validatePageRange } from '../../lib/validation';
import { LivePrintPreview } from './LivePrintPreview';
import { ensurePdfWorkerConfigured } from '../../lib/print/previewRenderer';
import { buildBackendPrintSettings, type ShopPrintCapabilities } from '../../lib/print/printConfig';
import * as pdfjsLib from 'pdfjs-dist';

if (typeof window !== 'undefined') {
  ensurePdfWorkerConfigured();
}
import { PDFDocument } from 'pdf-lib';
import {
  loadRazorpayScript,
  DEFAULT_RAZORPAY_TEST_KEY,
  isRealRazorpayKey,
  getEffectiveRazorpayKey,
  generateRazorpayPaymentId,
  createRazorpayOrder,
  stageCustomerPrintOrder,
  uploadStagedFileBinary,
  verifyRazorpayPayment,
  checkRazorpayOrderStatus,
  reconcileRazorpayPayment,
  recoverOrRetryPrintOrder,
  DispatchedPrintJobSummary
} from '../../lib/razorpay';
import { apiUrl, fetchWithRetry } from '../../lib/apiConfig';
import { CustomerErrorModal } from './CustomerErrorModal';
import { validateClientDocument, DocumentValidationError } from '../../lib/validation/documentValidation';

export type CheckoutLifecycleStatus =
  | 'IDLE'
  | 'UPLOADING'
  | 'READY_FOR_PAYMENT'
  | 'STAGING_FILES'
  | 'CREATING_ORDER'
  | 'PAYMENT_CHECKOUT_OPEN'
  | 'PAYMENT_PROCESSING'
  | 'VERIFYING_PAYMENT'
  | 'PAID'
  | 'PAYMENT_FAILED'
  | 'STAGING_FAILED'
  | 'CANCELLED';

const createCheckoutSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `chk_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

interface CustomerPrintFlowProps {
  shopSlug: string;
}

interface UploadingItem {
  id: string;
  name: string;
  size: number;
  progress: number;
}

const fileToBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(''));
};

export const CustomerPrintFlow: React.FC<CustomerPrintFlowProps> = ({ shopSlug }) => {
  const { shops, activeShop, pricingRules, platformPolicies, createPrintJob, updateShopRazorpay, navigate, showToast } = useApp();
  const maxAllowedUploadMb = Math.max(5, Math.min(500, platformPolicies?.maxAllowedUploadSizeMb || 50));
  const maxPrintJobFileBytes = maxAllowedUploadMb * 1024 * 1024;

  const [remoteShop, setRemoteShop] = useState<Shop | null>(null);
  const [remotePricingRules, setRemotePricingRules] = useState<PricingRule[] | null>(null);
  const [isLoadingPublicShop, setIsLoadingPublicShop] = useState<boolean>(false);
  const [publicShopError, setPublicShopError] = useState<string | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState<{ enabled: boolean; message: string; scope: string } | null>(null);

  const [agentStatus, setAgentStatus] = useState<{
    isAvailable: boolean;
    reason: string;
    message: string;
    agentOnline: boolean;
    printerReady: boolean;
    readyPrintersCount?: number;
    readyPrinters?: string[];
  } | null>(null);
  const [isCheckingAgentStatus, setIsCheckingAgentStatus] = useState<boolean>(false);
  const [isManualCheckingStatus, setIsManualCheckingStatus] = useState<boolean>(false);
  const [alternativeShops, setAlternativeShops] = useState<Array<{ id: string; name: string; slug: string; isAvailable?: boolean }>>([]);

  const [customerErrorModal, setCustomerErrorModal] = useState<DocumentValidationError | null>(null);

  const [shopCapabilities, setShopCapabilities] = useState<{
    supportedPaperSizes: string[];
    effectivePaperSizes?: Array<{ name: string; widthMm?: number; heightMm?: number }>;
    hasColorPrinter: boolean;
    hasDuplexPrinter: boolean;
    hasMonochromePrinter: boolean;
    isReadyForPrinting: boolean;
    validCombinations?: Array<{
      paperSize: string;
      colorMode: 'BW' | 'COLOR';
      duplex: boolean;
    }>;
    options?: {
      color: { supported: boolean; reason?: string };
      duplex: { supported: boolean; reason?: string };
      paperSizes: Array<{ name: string; supported: boolean; reason?: string }>;
    };
  } | null>(null);

  const isCombinationValid = React.useCallback(
    (paperSize: string, colorMode: 'BW' | 'COLOR', duplex: boolean): { isValid: boolean; reason?: string } => {
      if (!shopCapabilities) return { isValid: true };
      if (!shopCapabilities.isReadyForPrinting) {
        return { isValid: false, reason: 'No registered online printers are currently available at this shop.' };
      }

      // 1. Check color support
      if (colorMode === 'COLOR' && !shopCapabilities.hasColorPrinter) {
        return { isValid: false, reason: 'Colour printing is currently unavailable at this shop.' };
      }

      // 2. Check duplex support
      if (duplex && !shopCapabilities.hasDuplexPrinter) {
        return { isValid: false, reason: 'Double-sided printing is currently unavailable at this shop.' };
      }

      // 3. Multi-printer combinations check
      if (Array.isArray(shopCapabilities.validCombinations) && shopCapabilities.validCombinations.length > 0) {
        const normSize = (paperSize || 'A4').toUpperCase();
        const matches = shopCapabilities.validCombinations.some(
          (c) => c.paperSize.toUpperCase() === normSize && c.colorMode === colorMode && c.duplex === duplex
        );
        if (!matches) {
          if (colorMode === 'COLOR') {
            return {
              isValid: false,
              reason: `Colour printing is not available for ${paperSize} with ${duplex ? 'double-sided' : 'single-sided'} mode.`
            };
          }
          if (duplex) {
            return {
              isValid: false,
              reason: `Double-sided printing is not available for ${paperSize} at this shop.`
            };
          }
          return {
            isValid: false,
            reason: `The option combination (${paperSize}, ${colorMode}, ${duplex ? 'Double-sided' : 'Single-sided'}) is not available on any online printer.`
          };
        }
      }

      return { isValid: true };
    },
    [shopCapabilities]
  );

  const shopQueryTargetRef = React.useRef<string>('');
  shopQueryTargetRef.current = shopSlug || remoteShop?.slug || activeShop?.slug || activeShop?.id || '';

  const agentStatusRef = React.useRef(agentStatus);
  agentStatusRef.current = agentStatus;

  const lastStatusFetchAtRef = React.useRef<number>(0);
  const lastAgentStatusKeyRef = React.useRef<string>('');
  const lastCapabilitiesKeyRef = React.useRef<string>('');
  const inFlightStatusPromiseRef = React.useRef<Promise<typeof agentStatus> | null>(null);
  const inFlightCapabilitiesPromiseRef = React.useRef<Promise<void> | null>(null);

  const fetchCapabilities = React.useCallback(async (targetSlugOrId?: string) => {
    const queryTarget = targetSlugOrId || shopQueryTargetRef.current;
    if (!queryTarget) return;
    if (inFlightCapabilitiesPromiseRef.current && !targetSlugOrId) {
      return inFlightCapabilitiesPromiseRef.current;
    }
    const task = (async () => {
      try {
        const res = await fetch(apiUrl(`/api/public/shops/${encodeURIComponent(queryTarget)}/capabilities`));
        const data = await res.json();
        if (data.success && data.capabilities) {
          const nextKey = JSON.stringify(data.capabilities);
          if (nextKey !== lastCapabilitiesKeyRef.current) {
            lastCapabilitiesKeyRef.current = nextKey;
            setShopCapabilities(data.capabilities);
          }
        }
      } catch {
        // Fail gracefully
      } finally {
        if (!targetSlugOrId) {
          inFlightCapabilitiesPromiseRef.current = null;
        }
      }
    })();
    if (!targetSlugOrId) {
      inFlightCapabilitiesPromiseRef.current = task;
    }
    return task;
  }, []);

  const checkAgentAvailability = React.useCallback(
    async (targetSlugOrId?: string, options?: { showSpinner?: boolean }) => {
      const queryTarget = targetSlugOrId || shopQueryTargetRef.current;
      if (!queryTarget) return null;

      if (inFlightStatusPromiseRef.current && !targetSlugOrId) {
        return inFlightStatusPromiseRef.current;
      }

      const showSpinner = Boolean(options?.showSpinner);
      if (showSpinner) {
        setIsCheckingAgentStatus(true);
      }

      const task = (async () => {
        try {
          void fetchCapabilities(queryTarget);
          const res = await fetch(apiUrl(`/api/public/shops/${encodeURIComponent(queryTarget)}/agent-status`));
          const data = await res.json();
          if (data.success && data.availability) {
            lastStatusFetchAtRef.current = Date.now();
            const nextKey = JSON.stringify(data.availability);
            if (nextKey !== lastAgentStatusKeyRef.current) {
              lastAgentStatusKeyRef.current = nextKey;
              agentStatusRef.current = data.availability;
              setAgentStatus(data.availability);
            }
            return data.availability;
          }
        } catch {
          // Fail gracefully
        } finally {
          if (showSpinner) {
            setIsCheckingAgentStatus(false);
          }
          if (!targetSlugOrId) {
            inFlightStatusPromiseRef.current = null;
          }
        }
        return agentStatusRef.current;
      })();

      if (!targetSlugOrId) {
        inFlightStatusPromiseRef.current = task;
      }
      return task;
    },
    [fetchCapabilities]
  );

  const refreshAgentAvailabilityIfStale = React.useCallback(
    (maxAgeMs = 8000) => {
      if (Date.now() - lastStatusFetchAtRef.current >= maxAgeMs) {
        void checkAgentAvailability(undefined, { showSpinner: false });
      }
    },
    [checkAgentAvailability]
  );

  const handleManualRefreshStatus = async () => {
    if (isManualCheckingStatus || isCheckingAgentStatus) return;
    setIsManualCheckingStatus(true);
    try {
      const minDelay = new Promise((resolve) => setTimeout(resolve, 250));
      const [freshStatus] = await Promise.all([
        checkAgentAvailability(undefined, { showSpinner: true }),
        minDelay
      ]);
      if (freshStatus && freshStatus.isAvailable) {
        showToast('Shop Online', 'This print shop is online and ready for printing.', 'success', 3000);
      }
    } catch {
      // Gracefully handled
    } finally {
      setIsManualCheckingStatus(false);
    }
  };

  useEffect(() => {
    lastStatusFetchAtRef.current = 0;
    void checkAgentAvailability(undefined, { showSpinner: false });
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void checkAgentAvailability(undefined, { showSpinner: false });
    }, 10000);
    return () => clearInterval(timer);
  }, [shopSlug, checkAgentAvailability]);

  // Load alternative online shops if current shop is offline
  useEffect(() => {
    if (agentStatus && !agentStatus.isAvailable) {
      fetch(apiUrl('/api/public/shops'))
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.shops)) {
            setAlternativeShops(
              data.shops.filter((s: any) => s.slug !== shopSlug && s.id !== remoteShop?.id && s.isAvailable)
            );
          }
        })
        .catch(() => {});
    } else {
      setAlternativeShops([]);
    }
  }, [agentStatus, shopSlug, remoteShop?.id]);

  useEffect(() => {
    fetch(apiUrl('/api/maintenance/status'))
      .then(res => res.json())
      .then(data => {
        if (data.success && data.maintenance && data.maintenance.enabled) {
          if (data.maintenance.scope === 'entire_application' || data.maintenance.scope === 'customer_facing') {
            setMaintenanceMode(data.maintenance);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPublicShopData() {
      if (!shopSlug) return;
      setIsLoadingPublicShop(true);
      setPublicShopError(null);
      try {
        const res = await fetch(apiUrl(`/api/public/shops/${encodeURIComponent(shopSlug)}`));
        const data = await res.json();
        if (!res.ok || !data.success || !data.shop) {
          throw new Error(data.error || 'Shop not found in database.');
        }
        if (cancelled) return;
        const fetchedShop = data.shop as Shop;
        setRemoteShop(fetchedShop);

        // Fetch pricing rules for this shop directly from Neon
        const rulesRes = await fetch(apiUrl(`/api/shops/${encodeURIComponent(fetchedShop.id)}/pricing`));
        const rulesData = await rulesRes.json();
        if (rulesRes.ok && rulesData.success && Array.isArray(rulesData.rules)) {
          if (!cancelled) {
            setRemotePricingRules(rulesData.rules.map((r: any) => ({
              id: r.id,
              shopId: fetchedShop.id,
              paperSize: r.paperSize,
              color: r.colorMode,
              sides: r.sides,
              pricePerPage: r.pricePerPageMinor / 100,
              currency: 'INR',
              isActive: r.isActive
            })));
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          console.warn('[CustomerPrintFlow] Public shop lookup notice:', err?.message);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPublicShop(false);
        }
      }
    }
    loadPublicShopData();
    return () => { cancelled = true; };
  }, [shopSlug]);

  const shop = remoteShop || shops.find((s) => s.slug === shopSlug) || shops[0] || activeShop || EMPTY_SHOP;
  const effectivePricingRules = remotePricingRules || pricingRules;

  // Dynamically derive active paper sizes configured for this shop
  const activeShopSizes = React.useMemo(() => {
    const targetShopId = shop?.id || activeShop?.id || EMPTY_SHOP.id;
    const shopActiveRules = effectivePricingRules.filter(
      (r) => (r.shopId === targetShopId || (remoteShop && r.shopId === remoteShop.id)) && (r.isActive ?? true)
    );
    const sizeSet = new Set<string>();
    shopActiveRules.forEach((r) => sizeSet.add(r.paperSize));
    // Always ensure A4 is in the list
    sizeSet.add('A4');

    if (shopCapabilities && Array.isArray(shopCapabilities.supportedPaperSizes) && shopCapabilities.supportedPaperSizes.length > 0) {
      const allowedUpper = shopCapabilities.supportedPaperSizes.map((s) => s.toUpperCase());
      const filtered = Array.from(sizeSet).filter((s) => allowedUpper.includes(s.toUpperCase()));
      return filtered.length > 0 ? filtered : ['A4'];
    }

    return Array.from(sizeSet);
  }, [effectivePricingRules, shop?.id, remoteShop, activeShop?.id, shopCapabilities]);

  // 3-step state: 1. Upload, 2. Review, 3. Pay, 4. Tracking
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [navigatingTargetStep, setNavigatingTargetStep] = useState<null | 2 | 3>(null);
  const navigatingStepRef = React.useRef<boolean>(false);
  const [files, setFiles] = useState<FilePrintConfig[]>([]);
  const sourceFilesRef = React.useRef(new Map<string, File>());
  const stagedFileMapRef = React.useRef(
    new Map<string, { stagedFileId: string; verifiedPageCount: number; shopId: string; sessionId: string }>()
  );
  const uploadPromisesRef = React.useRef(
    new Map<string, Promise<{ stagedFileId?: string; verifiedPageCount?: number; error?: string; code?: string }>>()
  );
  const stagedJobIdRef = React.useRef<string | null>(null);
  const preStagedOrderRef = React.useRef<{
    fingerprint: string;
    stageRes: Awaited<ReturnType<typeof stageCustomerPrintOrder>>;
  } | null>(null);
  const inFlightStageRef = React.useRef<{
    fingerprint: string;
    promise: Promise<Awaited<ReturnType<typeof stageCustomerPrintOrder>>>;
  } | null>(null);
  const dispatchingOrdersRef = React.useRef(new Set<string>());
  const completedOrdersRef = React.useRef(new Set<string>());
  const checkoutCompletedRef = React.useRef<boolean>(false);
  const payAttemptLockRef = React.useRef(false);

  const [checkoutSessionId, setCheckoutSessionId] = useState<string>(() => createCheckoutSessionId());
  const checkoutSessionIdRef = React.useRef<string>(checkoutSessionId);
  useEffect(() => {
    checkoutSessionIdRef.current = checkoutSessionId;
  }, [checkoutSessionId]);
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutLifecycleStatus>('IDLE');

  // Upload loading queue
  const [uploadingQueue, setUploadingQueue] = useState<UploadingItem[]>([]);

  // Expanded files state (which file accordions have settings open)
  const [expandedFileIds, setExpandedFileIds] = useState<Record<string, boolean>>({});

  // Document preview modal (tracks ID so live setting changes sync immediately)
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [inlinePreviewIds, setInlinePreviewIds] = useState<Record<string, boolean>>({});

  // Help modal
  const [helpOpen, setHelpOpen] = useState(false);

  // Validation & error states
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [phoneTouched, setPhoneTouched] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  // Payment processing & transaction state
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [paymentProcessingLabel, setPaymentProcessingLabel] = useState<string>('Preparing Secure Payment...');
  const [activeJob, setActiveJob] = useState<PrintJob | null>(null);
  const [stagingFailedState, setStagingFailedState] = useState<{
    title: string;
    message: string;
    code?: string;
  } | null>(null);
  const [paymentFailedState, setPaymentFailedState] = useState<{
    status: 'FAILED' | 'CANCELLED';
    message: string;
  } | null>(null);
  const [paymentPendingState, setPaymentPendingState] = useState<{
    status: 'PENDING';
    orderId: string;
    message: string;
    kind?: 'PAYMENT' | 'DISPATCH';
    paymentId?: string;
  } | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(false);
  const [checkingStatusLabel, setCheckingStatusLabel] = useState<string>('Verifying payment with Razorpay...');
  const [razorpayError, setRazorpayError] = useState<string | null>(null);
  const [showRecoveryInput, setShowRecoveryInput] = useState<boolean>(false);
  const [recoveryLookupInput, setRecoveryLookupInput] = useState<string>('');

  const orderSessionStorageKey = `easytoprint_order_session_${shopSlug || 'default'}`;

  const saveOrderSession = React.useCallback(
    (session: {
      orderId: string;
      checkoutSessionId?: string;
      status?: 'CREATED' | 'PENDING' | 'PAID' | 'FAILED';
      paymentId?: string;
      shopId: string;
      customerPhone?: string;
      totalAmount?: number;
      createdAt?: number;
    }) => {
      try {
        localStorage.setItem(
          orderSessionStorageKey,
          JSON.stringify({
            ...session,
            createdAt: session.createdAt || Date.now()
          })
        );
      } catch {}
    },
    [orderSessionStorageKey]
  );

  const loadOrderSession = React.useCallback((): {
    orderId: string;
    checkoutSessionId?: string;
    status?: string;
    paymentId?: string;
    shopId?: string;
    customerPhone?: string;
    totalAmount?: number;
    createdAt?: number;
  } | null => {
    try {
      const raw = localStorage.getItem(orderSessionStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.orderId !== 'string') return null;
      if (parsed.status === 'PAID') {
        localStorage.removeItem(orderSessionStorageKey);
        return null;
      }
      // Expire after 24 hours
      if (parsed.createdAt && Date.now() - Number(parsed.createdAt) > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(orderSessionStorageKey);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, [orderSessionStorageKey]);

  const clearOrderSession = React.useCallback(() => {
    try {
      localStorage.removeItem(orderSessionStorageKey);
    } catch {}
  }, [orderSessionStorageKey]);

  // Preload Razorpay script silently only after user advances past Step 1 (keeps landing page LCP untouched)
  useEffect(() => {
    if (currentStep >= 2 && currentStep <= 3) {
      void loadRazorpayScript();
    }
  }, [currentStep]);

  // Restore strictly unpaid incomplete session across full page refresh
  useEffect(() => {
    if (checkoutCompletedRef.current || activeJob || currentStep === 4) return;
    const saved = loadOrderSession();
    if (saved?.orderId && saved.status !== 'PAID' && !completedOrdersRef.current.has(saved.orderId) && !activeOrderId) {
      setActiveOrderId(saved.orderId);
      if (saved.checkoutSessionId) {
        checkoutSessionIdRef.current = saved.checkoutSessionId;
        setCheckoutSessionId(saved.checkoutSessionId);
      }
      if (saved.customerPhone && !customerPhone) {
        setCustomerPhone(saved.customerPhone);
      }
    }
  }, [loadOrderSession, activeOrderId, customerPhone, activeJob, currentStep]);

  const pollingTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const activeRzpInstanceRef = React.useRef<any>(null);

  const stopPolling = React.useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  useEffect(() => {
    if (
      !activeJob?.trackingToken ||
      ['COMPLETED', 'CANCELLED', 'REQUIRES_ATTENTION'].includes(activeJob.printStatus) ||
      (activeJob.printStatus === 'FAILED' && activeJob.retrySafe !== true)
    ) {
      return;
    }
    let cancelled = false;
    const refreshStatus = async () => {
      try {
        const response = await fetch(
          apiUrl(`/api/customer/print-jobs/${encodeURIComponent(activeJob.id)}/status`),
          { cache: 'no-store', headers: { 'x-print-tracking-token': activeJob.trackingToken } }
        );
        const data = await response.json() as {
          success?: boolean;
          job?: {
            printStatus?: PrintJob['printStatus'];
            updatedAt?: string;
            printerName?: string;
            errorMessage?: string;
            retrySafe?: boolean;
          };
        };
        if (!response.ok || !data.success || !data.job?.printStatus || cancelled) return;
        setActiveJob((previous) => previous?.id === activeJob.id
          ? {
              ...previous,
              printStatus: data.job!.printStatus!,
              updatedAt: data.job!.updatedAt || previous.updatedAt,
              assignedPrinterName: data.job!.printerName || previous.assignedPrinterName,
              notes: data.job!.errorMessage || previous.notes,
              retrySafe: data.job!.retrySafe
            }
          : previous);
      } catch {
        // Keep showing the last confirmed status while the backend is unreachable.
      }
    };
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeJob?.id, activeJob?.trackingToken, activeJob?.printStatus, activeJob?.retrySafe]);

  const fileInputId = 'customer-file-upload-input';

  const calculateUnitPrice = React.useCallback(
    (size: PaperSize, color: 'BW' | 'COLOR', sides: 'SINGLE' | 'DOUBLE') => {
      return resolveUnitPrice(effectivePricingRules, shop?.id || EMPTY_SHOP.id, size, color, sides);
    },
    [effectivePricingRules, shop?.id]
  );

  const countPages = React.useCallback((config: Partial<FilePrintConfig>) => {
    if (config.pageSelection === 'CUSTOM' && config.customRange) {
      const check = validatePageRange(config.customRange, config.estimatedPages || 1);
      if (check.isValid && check.parsedPages && check.parsedPages.length > 0) {
        return check.parsedPages.length;
      }
    }
    return config.estimatedPages || 1;
  }, []);

  const calculateFileTotal = React.useCallback(
    (config: Partial<FilePrintConfig>) => {
      const pages = countPages(config);
      const copies = config.copies || 1;
      const rate = config.unitPrice || 2.0;
      return Math.round(pages * copies * rate);
    },
    [countPages]
  );

  // Complete session reset for genuinely new uploads / checkouts (prevents old payment state from leaking)
  const resetForNewCheckout = React.useCallback(
    (options?: { preserveFiles?: boolean }) => {
      stopPolling();
      if (activeRzpInstanceRef.current) {
        try {
          activeRzpInstanceRef.current.close();
        } catch {}
        activeRzpInstanceRef.current = null;
      }
      const nextSessionId = createCheckoutSessionId();
      checkoutSessionIdRef.current = nextSessionId;
      setCheckoutSessionId(nextSessionId);

      checkoutCompletedRef.current = false;
      payAttemptLockRef.current = false;
      dispatchingOrdersRef.current.clear();
      stagedJobIdRef.current = null;
      preStagedOrderRef.current = null;
      inFlightStageRef.current = null;
      stagedFileMapRef.current.clear();
      uploadPromisesRef.current.clear();

      if (!options?.preserveFiles) {
        sourceFilesRef.current.clear();
        setFiles([]);
        setExpandedFileIds({});
        setUploadingQueue([]);
      }

      clearOrderSession();
      setActiveJob(null);
      setActiveOrderId(null);
      setPaymentPendingState(null);
      setPaymentFailedState(null);
      setStagingFailedState(null);
      setStepError(null);
      setRazorpayError(null);
      setIsProcessingPayment(false);
      setPaymentProcessingLabel('Preparing Secure Payment...');
      setIsCheckingStatus(false);
      setCheckingStatusLabel('Verifying payment with Razorpay...');
      setShowRecoveryInput(false);
      setRecoveryLookupInput('');
      setCheckoutStatus('IDLE');
    },
    [clearOrderSession, stopPolling]
  );

  // Reset checkout session automatically when switching shops
  const previousShopSlugRef = React.useRef<string>(shopSlug);
  useEffect(() => {
    if (previousShopSlugRef.current !== shopSlug) {
      previousShopSlugRef.current = shopSlug;
      resetForNewCheckout();
      setCurrentStep(1);
    }
  }, [shopSlug, resetForNewCheckout]);

  const invalidateUnpaidDraftOrder = React.useCallback(() => {
    if (checkoutCompletedRef.current) return;
    stagedJobIdRef.current = null;
    preStagedOrderRef.current = null;
    inFlightStageRef.current = null;
    setStagingFailedState(null);
    setPaymentFailedState(null);
    setPaymentPendingState(null);
    setActiveOrderId(null);
    clearOrderSession();
    setCheckoutStatus((prev) => (prev === 'UPLOADING' ? 'UPLOADING' : 'READY_FOR_PAYMENT'));
  }, [clearOrderSession]);

  const startBackgroundFilePreUpload = React.useCallback(
    (fileId: string, file: File, targetShopId: string, sessionId: string) => {
      if (!targetShopId || targetShopId === EMPTY_SHOP.id) return Promise.resolve({});
      const uploadTask = (async () => {
        const res = await uploadStagedFileBinary({
          shopId: targetShopId,
          checkoutSessionId: sessionId,
          file
        });
        if (
          res.success &&
          res.stagedFileId &&
          checkoutSessionIdRef.current === sessionId &&
          sourceFilesRef.current.has(fileId)
        ) {
          const verifiedPages = Number(res.verifiedPageCount) || 1;
          stagedFileMapRef.current.set(fileId, {
            stagedFileId: res.stagedFileId,
            verifiedPageCount: verifiedPages,
            shopId: targetShopId,
            sessionId
          });
          setFiles((prev) =>
            prev.map((item) => {
              if (item.id !== fileId) return item;
              if (item.estimatedPages === verifiedPages) return item;
              const effectivePages =
                item.pageSelection === 'CUSTOM' && item.customRange
                  ? (() => {
                      const check = validatePageRange(item.customRange, verifiedPages);
                      return check.isValid && check.parsedPages?.length ? check.parsedPages.length : verifiedPages;
                    })()
                  : verifiedPages;
              const rate = item.unitPrice || 2.0;
              return {
                ...item,
                estimatedPages: verifiedPages,
                totalPrice: Math.round(effectivePages * (item.copies || 1) * rate)
              };
            })
          );
          return { stagedFileId: res.stagedFileId, verifiedPageCount: verifiedPages };
        }
        return { error: res.error, code: res.code };
      })();

      uploadPromisesRef.current.set(fileId, uploadTask);
      return uploadTask;
    },
    []
  );

  // Selected documents are validated, page-counted, and streamed to pre-payment staging in background.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (maintenanceMode) {
      showToast('Maintenance Active', 'System is under maintenance. File uploads are disabled.', 'error', 4000);
      return;
    }
    if (agentStatus && !agentStatus.isAvailable) {
      showToast('Shop Offline', agentStatus.message || 'This print shop is currently offline. File uploads are disabled.', 'error', 5000);
      return;
    }
    setUploadError(null);
    setStepError(null);
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    // Bug B guarantee: If a previous order already completed, clear its completed state before adding new files
    if (checkoutCompletedRef.current || activeJob) {
      resetForNewCheckout();
    } else if (files.length === 0) {
      invalidateUnpaidDraftOrder();
    } else {
      stagedJobIdRef.current = null;
      setStagingFailedState(null);
      setPaymentFailedState(null);
      setActiveOrderId(null);
      clearOrderSession();
    }

    const selectedArray = Array.from(selectedFiles);
    const validationResults = await Promise.all(
      selectedArray.map(async (file) => ({
        file,
        validation: await validateClientDocument(file)
      }))
    );

    const validFiles: File[] = [];
    let firstValidationError: DocumentValidationError | null = null;
    for (const { file, validation } of validationResults) {
      if (!validation.isValid && validation.error) {
        if (!firstValidationError) {
          firstValidationError = validation.error;
        }
        continue;
      }
      validFiles.push(file);
    }
    if (firstValidationError) {
      setCustomerErrorModal(firstValidationError);
    }

    if (validFiles.length === 0) {
      e.target.value = '';
      return;
    }

    const activeSessionId = checkoutSessionIdRef.current;
    const targetShopId = shop.id;

    setCheckoutStatus('UPLOADING');
    const queueItems: UploadingItem[] = validFiles.map((file, i) => ({
      id: `up_${Date.now()}_${i}`,
      name: file.name,
      size: file.size,
      progress: 45
    }));
    setUploadingQueue(queueItems);

    let processingFinished = false;
    const progressTimer = setTimeout(() => {
      if (!processingFinished) {
        setUploadingQueue((prev) =>
          prev.map((item) => ({ ...item, progress: 85 }))
        );
      }
    }, 220);

    // Preload Razorpay SDK in the background as soon as customer selects files
    void loadRazorpayScript();

    (async () => {
      try {
        const processed = await Promise.all(
          validFiles.map(async (file, i) => {
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            let exactPages = 1;

            if (isPdf) {
              try {
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
                const pdfDoc = await loadingTask.promise;
                exactPages = pdfDoc.numPages || 1;
                void loadingTask.destroy();
              } catch (err) {
                console.error('Failed to parse PDF page count:', err);
                exactPages = 1;
              }
            }

            const fileId = `f_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
            sourceFilesRef.current.set(fileId, file);

            const unitPrice = calculateUnitPrice('A4', 'BW', 'SINGLE');
            const defaultConfig: FilePrintConfig = {
              id: fileId,
              fileName: file.name,
              fileSize: file.size,
              fileType: file.type || 'application/octet-stream',
              previewUrl: file.type.startsWith('image/') || isPdf ? URL.createObjectURL(file) : undefined,
              estimatedPages: exactPages,
              paperSize: 'A4',
              color: 'BW',
              sides: 'SINGLE',
              orientation: 'PORTRAIT',
              copies: 1,
              pageSelection: 'ALL',
              pagesPerSheet: 1,
              scaling: 'fit',
              margins: 'default',
              unitPrice,
              totalPrice: Math.round(exactPages * unitPrice)
            };

            // Kick off fast binary pre-upload in background so Step 3 & Pay Now are instant
            void startBackgroundFilePreUpload(fileId, file, targetShopId, activeSessionId);

            return defaultConfig;
          })
        );

        processingFinished = true;
        clearTimeout(progressTimer);
        setFiles((prev) => [...prev, ...processed]);
        setExpandedFileIds((prev) => {
          const next = { ...prev };
          for (const cfg of processed) {
            next[cfg.id] = true;
          }
          return next;
        });
        setInlinePreviewIds((prev) => {
          const next = { ...prev };
          if (processed[0] && Object.keys(prev).length === 0) {
            next[processed[0].id] = true;
          }
          return next;
        });
        setUploadingQueue([]);
        setCheckoutStatus('READY_FOR_PAYMENT');
      } finally {
        processingFinished = true;
        clearTimeout(progressTimer);
      }
    })();

    e.target.value = '';
  };


  const removeFile = (id: string) => {
    sourceFilesRef.current.delete(id);
    stagedFileMapRef.current.delete(id);
    uploadPromisesRef.current.delete(id);
    invalidateUnpaidDraftOrder();
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const toggleExpand = (id: string) => {
    setExpandedFileIds((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const updateFileConfig = (fileId: string, updates: Partial<FilePrintConfig>) => {
    invalidateUnpaidDraftOrder();
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id === fileId) {
          const merged = { ...f, ...updates };
          const unitPrice = calculateUnitPrice(merged.paperSize, merged.color || 'BW', merged.sides);
          const totalPrice = calculateFileTotal({ ...merged, unitPrice });
          return { ...merged, unitPrice, totalPrice };
        }
        return f;
      })
    );
  };

  // Memoized pricing breakdown: single source of truth aligned with server authoritative calculation
  const subtotal = React.useMemo(
    () => files.reduce((acc, f) => acc + f.totalPrice, 0),
    [files]
  );
  const serviceFee = 0;
  const shopMinimumOrderRupees = React.useMemo(() => {
    const raw = Number(shop?.minimumOrder ?? shop?.minOrderAmount ?? 0);
    return Number.isFinite(raw) && raw > 0 && raw <= 500 ? Math.round(raw) : 0;
  }, [shop?.minimumOrder, shop?.minOrderAmount]);
  const minOrderAdjustment =
    subtotal > 0 && shopMinimumOrderRupees > subtotal ? shopMinimumOrderRupees - subtotal : 0;
  const grandTotal = subtotal + minOrderAdjustment;

  // Live-derived active preview file & normalized shop capabilities for LivePrintPreview
  const previewFile = React.useMemo(
    () => (previewFileId ? files.find((f) => f.id === previewFileId) || null : null),
    [files, previewFileId]
  );

  const livePreviewCapabilities = React.useMemo<ShopPrintCapabilities | null>(() => {
    if (!shopCapabilities) return null;
    return {
      shopId: shop.id,
      supportedPaperSizes: shopCapabilities.supportedPaperSizes || [],
      supportsColor: Boolean(shopCapabilities.hasColorPrinter),
      supportsDuplex: Boolean(shopCapabilities.hasDuplexPrinter),
      hasOnlinePrinters: Boolean(shopCapabilities.isReadyForPrinting),
      onlinePrinterCount: shopCapabilities.isReadyForPrinting ? 1 : 0,
      printers: [],
    };
  }, [shopCapabilities, shop.id]);

  // Deterministic order fingerprint for deduplicated background pre-staging on Step 3
  const orderStageFingerprint = React.useMemo(() => {
    if (files.length === 0 || !shop?.id || shop.id === EMPTY_SHOP.id) return '';
    const filesSig = files
      .map(
        (f) =>
          `${f.id}:${f.estimatedPages}:${f.copies}:${f.color || 'BW'}:${f.paperSize}:${f.sides}:${f.orientation || 'PORTRAIT'}:${f.scaling || 'fit'}:${f.margins || 'default'}:${f.pagesPerSheet || 1}:${f.pageSelection}:${(f.customRange || f.customPageRange || '').trim()}`
      )
      .join('|');
    return `${shop.id}::${checkoutSessionId}::${customerPhone.trim()}::${filesSig}`;
  }, [shop?.id, checkoutSessionId, customerPhone, files]);

  // Shared deduplicated staging helper used by background Step 3 pre-staging AND handlePayNow
  const ensureStagedFileRefs = React.useCallback(
    async (activeSessionId: string, forceReupload = false): Promise<Array<{
      stagedFileId?: string;
      fileName: string;
      fileType: string;
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
    }>> => {
      const uploadedEntries = await Promise.all(
        files.map(async (file) => {
          const sourceFile = sourceFilesRef.current.get(file.id);
          if (!sourceFile) {
            throw Object.assign(
              new Error(`The original file for "${file.fileName}" is unavailable. Please re-upload it before paying.`),
              { stagingCode: 'SOURCE_FILE_MISSING', stagingTitle: 'File Missing From Browser' }
            );
          }

          const cached = !forceReupload ? stagedFileMapRef.current.get(file.id) : undefined;
          if (cached && cached.shopId === shop.id && cached.sessionId === activeSessionId) {
            return { file, sourceFile, stagedFileId: cached.stagedFileId, verifiedPages: cached.verifiedPageCount };
          }

          if (!forceReupload) {
            const inflight = uploadPromisesRef.current.get(file.id);
            if (inflight) {
              const inflightRes = await inflight;
              const resolvedCached = stagedFileMapRef.current.get(file.id);
              if (resolvedCached && resolvedCached.shopId === shop.id && resolvedCached.sessionId === activeSessionId) {
                return {
                  file,
                  sourceFile,
                  stagedFileId: resolvedCached.stagedFileId,
                  verifiedPages: resolvedCached.verifiedPageCount
                };
              }
              if (
                inflightRes?.code === 'STORAGE_QUOTA_EXCEEDED' ||
                inflightRes?.code === 'INVALID_FILE' ||
                inflightRes?.code === 'INVALID_CONTENT'
              ) {
                throw Object.assign(new Error(inflightRes.error || `Upload blocked for "${file.fileName}".`), {
                  stagingCode: inflightRes.code
                });
              }
            }
          }

          const uploadRes = await uploadStagedFileBinary({
            shopId: shop.id,
            checkoutSessionId: activeSessionId,
            file: sourceFile
          });
          if (!uploadRes.success || !uploadRes.stagedFileId) {
            throw Object.assign(new Error(uploadRes.error || `Could not upload "${file.fileName}" to staging storage.`), {
              stagingCode: uploadRes.code || 'STORAGE_UPLOAD_FAILED',
              stagingTitle: uploadRes.title || 'Unable to Prepare Your Files'
            });
          }

          const verifiedPages = Number(uploadRes.verifiedPageCount) || countPages(file);
          stagedFileMapRef.current.set(file.id, {
            stagedFileId: uploadRes.stagedFileId,
            verifiedPageCount: verifiedPages,
            shopId: shop.id,
            sessionId: activeSessionId
          });

          return {
            file,
            sourceFile,
            stagedFileId: uploadRes.stagedFileId,
            verifiedPages
          };
        })
      );

      return uploadedEntries.map(({ file, sourceFile, stagedFileId, verifiedPages }) => {
        const backendSettings = buildBackendPrintSettings({
          ...file,
          totalPages: verifiedPages || countPages(file),
        });
        return {
          stagedFileId,
          fileName: sourceFile.name,
          fileType: sourceFile.type || file.fileType || 'application/octet-stream',
          pageCount: verifiedPages || countPages(file),
          ...backendSettings,
        };
      });
    },
    [files, shop.id, countPages]
  );

  const stageOrderWithDeduplication = React.useCallback(
    async (
      activeSessionId: string,
      options?: { forceRestage?: boolean }
    ): Promise<Awaited<ReturnType<typeof stageCustomerPrintOrder>>> => {
      const filesSig = files
        .map(
          (f) =>
            `${f.id}:${f.estimatedPages}:${f.copies}:${f.color || 'BW'}:${f.paperSize}:${f.sides}:${f.orientation || 'PORTRAIT'}:${f.scaling || 'fit'}:${f.margins || 'default'}:${f.pagesPerSheet || 1}:${f.pageSelection}:${(f.customRange || f.customPageRange || '').trim()}`
        )
        .join('|');
      const fingerprint = `${shop.id}::${activeSessionId}::${customerPhone.trim()}::${filesSig}`;

      if (
        !options?.forceRestage &&
        preStagedOrderRef.current &&
        preStagedOrderRef.current.fingerprint === fingerprint &&
        preStagedOrderRef.current.stageRes.success &&
        preStagedOrderRef.current.stageRes.jobId
      ) {
        return preStagedOrderRef.current.stageRes;
      }

      if (
        !options?.forceRestage &&
        inFlightStageRef.current &&
        inFlightStageRef.current.fingerprint === fingerprint
      ) {
        return inFlightStageRef.current.promise;
      }

      const promise = (async () => {
        let stageInputs = await ensureStagedFileRefs(activeSessionId, Boolean(options?.forceRestage));
        let stageRes = await stageCustomerPrintOrder({
          checkoutSessionId: activeSessionId,
          shopId: shop.id,
          customerName: 'Counter Customer',
          customerPhone: customerPhone.trim(),
          totalAmount: grandTotal,
          files: stageInputs
        });

        // Automatically recover once if pre-uploaded reference expired or went missing
        if (
          !stageRes.success &&
          (stageRes.code === 'STAGED_FILE_MISSING' || stageRes.code === 'STAGED_FILE_EXPIRED')
        ) {
          stageInputs = await ensureStagedFileRefs(activeSessionId, true);
          stageRes = await stageCustomerPrintOrder({
            checkoutSessionId: activeSessionId,
            shopId: shop.id,
            customerName: 'Counter Customer',
            customerPhone: customerPhone.trim(),
            totalAmount: grandTotal,
            files: stageInputs
          });
        }

        if (stageRes.success && stageRes.jobId && checkoutSessionIdRef.current === activeSessionId) {
          stagedJobIdRef.current = stageRes.jobId;
          preStagedOrderRef.current = { fingerprint, stageRes };
        }
        return stageRes;
      })();

      inFlightStageRef.current = { fingerprint, promise };
      try {
        return await promise;
      } finally {
        if (inFlightStageRef.current?.promise === promise) {
          inFlightStageRef.current = null;
        }
      }
    },
    [files, shop.id, customerPhone, grandTotal, ensureStagedFileRefs]
  );

  // Silently pre-stage the print job as soon as customer enters Step 3 (Payment)
  // so clicking "Pay Now" skips staging latency and launches Razorpay Checkout immediately.
  // Never pre-creates a Razorpay order before clicking Pay Now (zero duplicate orders).
  const lastPreStagePhoneRef = React.useRef<string>(customerPhone.trim());
  useEffect(() => {
    if (
      currentStep !== 3 ||
      !orderStageFingerprint ||
      files.length === 0 ||
      !shop?.id ||
      shop.id === EMPTY_SHOP.id ||
      checkoutCompletedRef.current ||
      isProcessingPayment
    ) {
      return;
    }
    if (agentStatusRef.current && !agentStatusRef.current.isAvailable) {
      return;
    }
    const allReady = files.every(
      (f) =>
        sourceFilesRef.current.has(f.id) &&
        isCombinationValid(f.paperSize || 'A4', f.color || 'BW', f.sides === 'DOUBLE').isValid
    );
    if (!allReady) return;

    const trimmedPhone = customerPhone.trim();
    if (trimmedPhone && !validatePhone(trimmedPhone, false).isValid) {
      return;
    }

    const phoneChangedWhileOnPay = lastPreStagePhoneRef.current !== trimmedPhone;
    lastPreStagePhoneRef.current = trimmedPhone;
    const delayMs = phoneChangedWhileOnPay ? 350 : 0;

    const timer = window.setTimeout(() => {
      if (checkoutCompletedRef.current || payAttemptLockRef.current) return;
      const activeSessionId = checkoutSessionIdRef.current;
      if (!activeSessionId) return;
      void stageOrderWithDeduplication(activeSessionId).catch(() => {
        // Silent background warmup; any real staging error will be surfaced cleanly on Pay Now click.
      });
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [
    currentStep,
    orderStageFingerprint,
    files,
    shop?.id,
    customerPhone,
    isProcessingPayment,
    isCombinationValid,
    stageOrderWithDeduplication
  ]);

  const goToStepImmediate = React.useCallback((targetStep: number) => {
    setStepError(null);
    setCurrentStep(targetStep);
    window.scrollTo(0, 0);
  }, []);

  // Proceed from Upload (Step 1) to Review (Step 2) — instant single-click response
  const handleProceedToReview = async () => {
    if (navigatingStepRef.current) return;
    setStepError(null);
    if (files.length === 0) {
      setStepError('Please upload at least one file to continue.');
      return;
    }

    for (const f of files) {
      if (f.pageSelection === 'CUSTOM') {
        const check = validatePageRange(f.customRange || '', f.estimatedPages);
        if (!check.isValid) {
          setExpandedFileIds((prev) => ({ ...prev, [f.id]: true }));
          setStepError(`"${f.fileName}": ${check.error}`);
          return;
        }
      }
    }

    // Use already-known shop availability immediately (0ms); only await if initial fetch has not returned yet
    const knownStatus = agentStatusRef.current;
    if (knownStatus) {
      if (!knownStatus.isAvailable) {
        const offlineMsg = knownStatus.message || 'This print shop is currently offline. Please try again later or select another available shop.';
        setStepError(offlineMsg);
        showToast('Shop Offline', offlineMsg, 'error', 5000);
        return;
      }
      void loadRazorpayScript();
      refreshAgentAvailabilityIfStale(8000);
      setCurrentStep(2);
      window.scrollTo(0, 0);
      return;
    }

    navigatingStepRef.current = true;
    setNavigatingTargetStep(2);
    try {
      const freshStatus = await checkAgentAvailability(undefined, { showSpinner: false });
      if (freshStatus && !freshStatus.isAvailable) {
        const offlineMsg = freshStatus.message || 'This print shop is currently offline. Please try again later or select another available shop.';
        setStepError(offlineMsg);
        showToast('Shop Offline', offlineMsg, 'error', 5000);
        return;
      }
      void loadRazorpayScript();
      setCurrentStep(2);
      window.scrollTo(0, 0);
    } finally {
      navigatingStepRef.current = false;
      setNavigatingTargetStep(null);
    }
  };

  // Proceed from Review (Step 2) to Payment (Step 3) — instant single-click response
  const handleProceedToPayment = async () => {
    if (navigatingStepRef.current) return;
    setStepError(null);

    if (files.length === 0) {
      setStepError('Please upload at least one file to continue.');
      return;
    }

    const totalBytes = files.reduce((total, file) => {
      return total + (sourceFilesRef.current.get(file.id)?.size || 0);
    }, 0);
    if (files.some((file) => !sourceFilesRef.current.has(file.id))) {
      setStepError('Re-upload any merged or generated document as a PDF or image before continuing to payment.');
      return;
    }
    if (totalBytes > maxPrintJobFileBytes) {
      setStepError(`The combined size of your print files must be ${maxAllowedUploadMb} MB or less.`);
      return;
    }
    if (files.some((file) => !['A4', 'A3', 'A5', 'Letter', 'Legal'].includes(file.paperSize))) {
      setStepError('The selected paper size is not supported by the connected EasyToPrint printer agent.');
      return;
    }
    for (const f of files) {
      if (f.pageSelection === 'CUSTOM') {
        const check = validatePageRange(f.customRange || '', f.estimatedPages);
        if (!check.isValid) {
          setExpandedFileIds((prev) => ({ ...prev, [f.id]: true }));
          setStepError(`"${f.fileName}": ${check.error}`);
          return;
        }
      }
      const comboCheck = isCombinationValid(f.paperSize || 'A4', f.color || 'BW', f.sides === 'DOUBLE');
      if (!comboCheck.isValid) {
        setStepError(`"${f.fileName}": ${comboCheck.reason || 'Selected print option is unavailable at this shop.'}`);
        return;
      }
    }

    const finalizeMoveToPayment = () => {
      if (checkoutCompletedRef.current || activeJob) {
        resetForNewCheckout({ preserveFiles: true });
      }
      void loadRazorpayScript();
      setCurrentStep(3);
      window.scrollTo(0, 0);
    };

    const knownStatus = agentStatusRef.current;
    if (knownStatus) {
      if (!knownStatus.isAvailable) {
        const offlineMsg = knownStatus.message || 'This print shop is currently offline. Please try again later or select another available shop.';
        setStepError(offlineMsg);
        showToast('Shop Offline', offlineMsg, 'error', 5000);
        return;
      }
      refreshAgentAvailabilityIfStale(8000);
      finalizeMoveToPayment();
      return;
    }

    navigatingStepRef.current = true;
    setNavigatingTargetStep(3);
    try {
      const freshStatus = await checkAgentAvailability(undefined, { showSpinner: false });
      if (freshStatus && !freshStatus.isAvailable) {
        const offlineMsg = freshStatus.message || 'This print shop is currently offline. Please try again later or select another available shop.';
        setStepError(offlineMsg);
        showToast('Shop Offline', offlineMsg, 'error', 5000);
        return;
      }
      finalizeMoveToPayment();
    } finally {
      navigatingStepRef.current = false;
      setNavigatingTargetStep(null);
    }
  };

  const transitionToDispatchedConfirmation = React.useCallback(
    (params: {
      jobId: string;
      trackingToken?: string;
      orderId: string;
      paymentId: string;
      totalAmount?: number;
      statusMessage?: string;
    }) => {
      const job = createPrintJob({
        id: params.jobId,
        trackingToken: params.trackingToken,
        shopId: shop.id,
        customerName: 'Counter Customer',
        customerPhone: customerPhone.trim() || '',
        files,
        totalAmount: params.totalAmount ?? grandTotal,
        paymentMethod: 'Razorpay Online Payment',
        paymentStatus: 'SUCCESS',
        paymentId: params.paymentId
      });
      completedOrdersRef.current.add(params.orderId);
      checkoutCompletedRef.current = true;
      payAttemptLockRef.current = false;
      stagedJobIdRef.current = null;
      stagedFileMapRef.current.clear();
      uploadPromisesRef.current.clear();
      clearOrderSession();
      setActiveOrderId(null);
      setCheckoutStatus('PAID');
      setIsProcessingPayment(false);
      setPaymentPendingState(null);
      setPaymentFailedState(null);
      setStagingFailedState(null);
      setStepError(null);
      setRazorpayError(null);
      setActiveJob(job);
      setCurrentStep(4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast(
        'Payment Verified & Sent to Printer!',
        params.statusMessage || `Token #${params.jobId} confirmed. Order dispatched to ${shop.name} print queue.`,
        'success',
        5000
      );
    },
    [createPrintJob, shop.id, shop.name, customerPhone, files, grandTotal, clearOrderSession, showToast]
  );

  // Complete verified payment callback (ONLY invoked upon actual successful transaction)
  const onPaymentSuccess = async (
    paymentId: string,
    orderId: string,
    preDispatchedJob?: DispatchedPrintJobSummary
  ) => {
    if (!orderId || completedOrdersRef.current.has(orderId) || dispatchingOrdersRef.current.has(orderId)) return;

    saveOrderSession({
      orderId,
      paymentId,
      shopId: shop.id,
      customerPhone: customerPhone.trim() || undefined,
      totalAmount: grandTotal
    });

    // FAST PATH 1: Backend already atomically dispatched the print job during /api/verify-payment, /api/payment/check-status, or /api/payment/reconcile!
    if (preDispatchedJob?.id) {
      transitionToDispatchedConfirmation({
        jobId: preDispatchedJob.id,
        trackingToken: preDispatchedJob.trackingToken,
        orderId,
        paymentId,
        totalAmount: preDispatchedJob.totalAmount ?? grandTotal,
        statusMessage: preDispatchedJob.statusMessage
      });
      return;
    }

    dispatchingOrdersRef.current.add(orderId);
    setIsProcessingPayment(true);
    setPaymentProcessingLabel('Sending to printer...');
    setPaymentFailedState(null);
    setPaymentPendingState({
      status: 'PENDING',
      orderId,
      message: 'Payment verified. Sending your print job to the shop printer queue...',
      kind: 'DISPATCH',
      paymentId
    });

    try {
      // FAST PATH 2: Lightweight JSON recovery/dispatch call (does NOT re-upload raw PDF/image files!)
      const lightweightDispatch = await recoverOrRetryPrintOrder({
        orderId,
        paymentId,
        shopId: shop.id
      });

      if (lightweightDispatch.success && lightweightDispatch.job?.id) {
        transitionToDispatchedConfirmation({
          jobId: lightweightDispatch.job.id,
          trackingToken: lightweightDispatch.job.trackingToken || lightweightDispatch.trackingToken,
          orderId,
          paymentId: lightweightDispatch.paymentId || paymentId,
          totalAmount: lightweightDispatch.job.totalAmount ?? grandTotal,
          statusMessage: lightweightDispatch.message
        });
        return;
      }

      // FALLBACK PATH: Only upload files if pre-staging was skipped or server explicitly indicates needsFileUpload
      const payloadFiles = await Promise.all(files.map(async (file) => {
        const sourceFile = sourceFilesRef.current.get(file.id);
        if (!sourceFile) {
          throw new Error(
            lightweightDispatch.message ||
              `The original file for "${file.fileName}" is unavailable after page reload. Please re-select the file and tap "Already Paid / Check Payment" to dispatch without paying again.`
          );
        }
        return {
          fileName: sourceFile.name,
          fileType: sourceFile.type || file.fileType || 'application/octet-stream',
          fileBase64: await fileToBase64(sourceFile),
          pageCount: countPages(file),
          copies: file.copies,
          colorMode: file.color || 'BW',
          paperSize: file.paperSize,
          duplex: file.sides === 'DOUBLE',
          pagesToPrint:
            file.pageSelection === 'CUSTOM' && (file.customRange || file.customPageRange || '').trim()
              ? (file.customRange || file.customPageRange || '').trim()
              : undefined
        };
      }));

      const response = await fetchWithRetry(
        '/api/customer/print-jobs',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            paymentId,
            shopId: shop.id,
            customerName: 'Counter Customer',
            customerPhone: customerPhone.trim(),
            totalAmount: grandTotal,
            files: payloadFiles
          })
        },
        { maxAttempts: 2, timeoutMs: 60000, backoffDelaysMs: [1500] }
      );
      const rawResponseText = await response.text();
      const result = (() => {
        try {
          return rawResponseText ? JSON.parse(rawResponseText) : {};
        } catch {
          return { error: `Server returned HTTP ${response.status}` };
        }
      })() as {
        success?: boolean;
        code?: string;
        title?: string;
        message?: string;
        error?: string;
        filename?: string;
        detectedType?: string;
        supportedFormats?: string[];
        job?: { id?: string; trackingToken?: string };
        statusMessage?: string;
        agentOnline?: boolean;
      };
      if (!response.ok || !result.success || !result.job?.id) {
        if (result.code) {
          setCustomerErrorModal({
            isOpen: true,
            code: (result.code as any) || 'INVALID_CONTENT',
            title: result.title || 'Print Option Unavailable',
            message: result.message || result.error || 'Selected print settings are currently unavailable at this shop.',
            fileName: result.filename || 'Uploaded Document',
            detectedType: result.detectedType,
            supportedFormats: Array.isArray(result.supportedFormats) ? result.supportedFormats.join(', ') : undefined,
            actionText: 'Review Settings'
          });
        }
        throw new Error(result.error || result.message || `Could not dispatch the paid order (HTTP ${response.status}).`);
      }

      transitionToDispatchedConfirmation({
        jobId: result.job.id,
        trackingToken: result.job.trackingToken,
        orderId,
        paymentId,
        totalAmount: grandTotal,
        statusMessage: result.statusMessage
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Print job dispatch failed.';
      setPaymentPendingState({
        status: 'PENDING',
        orderId,
        message: `Payment is verified, but dispatch failed: ${message} Do not pay again; retry dispatch below.`,
        kind: 'DISPATCH',
        paymentId
      });
      showToast('Payment received; dispatch retry needed', message, 'error', 6000);
    } finally {
      dispatchingOrdersRef.current.delete(orderId);
      setIsProcessingPayment(false);
    }
  };

  // Pay Now stages print files cleanly FIRST, creates a fresh Razorpay order on the backend, and opens Checkout only after a valid order_id returns
  const handlePayNow = async () => {
    if (payAttemptLockRef.current || isProcessingPayment) return;
    payAttemptLockRef.current = true;

    const wasFailedOrCancelled =
      Boolean(paymentFailedState) ||
      checkoutStatus === 'PAYMENT_FAILED' ||
      checkoutStatus === 'CANCELLED';

    // Immediately show loading feedback & clear stale warnings before async steps
    setIsProcessingPayment(true);
    setPaymentProcessingLabel('Preparing Secure Payment...');
    setPaymentFailedState(null);
    setStagingFailedState(null);
    setPaymentPendingState(null);
    setStepError(null);
    setRazorpayError(null);
    stopPolling();

    let checkoutModalActive = false;
    let modalDismissedOrCompleted = false;
    let openWatchdog: NodeJS.Timeout | null = null;
    let failedDuringStaging = false;

    try {
      if (customerPhone.trim()) {
        setPhoneTouched(true);
        const phoneCheck = validatePhone(customerPhone, false);
        if (!phoneCheck.isValid) {
          setStepError(phoneCheck.error || 'Please enter a valid 10-digit mobile number.');
          return;
        }
      }

      if (files.length === 0) {
        setStepError('Please upload at least one print file before paying.');
        return;
      }

      // Pre-checkout memory & shop capability verification
      for (const file of files) {
        if (!sourceFilesRef.current.get(file.id)) {
          failedDuringStaging = true;
          setStagingFailedState({
            title: 'File Missing From Browser',
            message: `The original file for "${file.fileName}" is unavailable. Please re-upload it before paying.`
          });
          setCheckoutStatus('STAGING_FAILED');
          return;
        }
        const check = isCombinationValid(file.paperSize || 'A4', file.color || 'BW', file.sides === 'DOUBLE');
        if (!check.isValid) {
          failedDuringStaging = true;
          setCustomerErrorModal({
            isOpen: true,
            code: 'NO_COMPATIBLE_PRINTER',
            title: 'Print Option Unavailable',
            message: `The print settings for "${file.fileName}" are unavailable: ${check.reason || 'No compatible printer available at this shop'}. Please adjust your settings.`,
            fileName: file.fileName,
            actionText: 'Adjust Settings'
          });
          setStagingFailedState({
            title: 'Print Option Unavailable',
            message: `Print settings for "${file.fileName}" require adjustment: ${check.reason || 'Incompatible printer settings'}`,
            code: 'NO_COMPATIBLE_PRINTER'
          });
          setCheckoutStatus('STAGING_FAILED');
          return;
        }
      }

      // Guarantee a fresh session if retrying after a completed checkout or shop change
      let activeSessionId = checkoutSessionIdRef.current;
      if (checkoutCompletedRef.current || !activeSessionId) {
        activeSessionId = createCheckoutSessionId();
        checkoutSessionIdRef.current = activeSessionId;
        setCheckoutSessionId(activeSessionId);
        checkoutCompletedRef.current = false;
        stagedJobIdRef.current = null;
        preStagedOrderRef.current = null;
        inFlightStageRef.current = null;
      }

      // 1. Ensure Razorpay script is loaded in parallel (usually already cached from Step 1/2)
      const scriptPromise = loadRazorpayScript();

      // 2. Reuse already pre-staged order (0ms!) or join in-flight staging without duplicating requests
      const hasWarmStage =
        Boolean(preStagedOrderRef.current?.stageRes.success) &&
        Boolean(preStagedOrderRef.current?.stageRes.jobId) &&
        preStagedOrderRef.current?.fingerprint ===
          `${shop.id}::${activeSessionId}::${customerPhone.trim()}::${files
            .map(
              (f) =>
                `${f.id}:${f.estimatedPages}:${f.copies}:${f.color || 'BW'}:${f.paperSize}:${f.sides}:${f.pageSelection}:${(f.customRange || f.customPageRange || '').trim()}`
            )
            .join('|')}`;

      if (!hasWarmStage) {
        setCheckoutStatus('STAGING_FILES');
        setPaymentProcessingLabel('Preparing print files...');
      } else {
        setCheckoutStatus('CREATING_ORDER');
        setPaymentProcessingLabel('Opening Razorpay...');
      }

      const stageRes = await stageOrderWithDeduplication(activeSessionId);

      if (!stageRes.success || !stageRes.jobId) {
        failedDuringStaging = true;
        if (stageRes.code === 'PRINTERS_OFFLINE' || stageRes.code === 'NO_REGISTERED_PRINTERS') {
          void checkAgentAvailability(undefined, { showSpinner: false });
        }
        if (stageRes.code) {
          setCustomerErrorModal({
            isOpen: true,
            code: (stageRes.code as any) || 'INVALID_CONTENT',
            title: stageRes.title || 'Print Option Unavailable',
            message: stageRes.message || stageRes.error || 'Selected print settings are currently unavailable at this shop.',
            fileName: stageRes.filename || 'Uploaded Document',
            detectedType: stageRes.detectedType,
            supportedFormats: Array.isArray(stageRes.supportedFormats) ? stageRes.supportedFormats.join(', ') : undefined,
            actionText: 'Review Settings'
          });
        }
        const stagingErrMsg = stageRes.message || stageRes.error || 'Could not stage print files before payment. Please retry.';
        setStagingFailedState({
          title: stageRes.title || 'Unable to Prepare Your Files',
          message: stagingErrMsg,
          code: stageRes.code
        });
        setCheckoutStatus('STAGING_FAILED');
        showToast('Staging Failed', stagingErrMsg, 'error', 5000);
        return;
      }

      stagedJobIdRef.current = stageRes.jobId;

      // Single-source-of-truth paise conversion (INR -> paise strictly ONCE)
      const expectedAmountInPaise = Math.round(Number(grandTotal) * 100);
      if (!Number.isInteger(expectedAmountInPaise) || expectedAmountInPaise < 100) {
        throw new Error('Order total must be at least ₹1.00 before initiating payment.');
      }

      if (
        stageRes.authoritativeAmountMinor !== undefined &&
        Math.round(Number(stageRes.authoritativeAmountMinor)) !== expectedAmountInPaise
      ) {
        const serverRupees = (Number(stageRes.authoritativeAmountMinor) / 100).toFixed(2);
        throw new Error(
          `Order total mismatch detected (displayed ₹${grandTotal.toFixed(0)}, server calculated ₹${serverRupees}). Please review your order and try again.`
        );
      }

      // 3. Ensure Razorpay script loaded & ALWAYS create a fresh server-validated Razorpay Order
      setCheckoutStatus('CREATING_ORDER');
      setPaymentProcessingLabel('Opening Razorpay...');

      const [scriptLoaded, orderRes] = await Promise.all([
        scriptPromise,
        createRazorpayOrder({
          amount: grandTotal,
          amountInPaise: expectedAmountInPaise,
          checkoutSessionId: activeSessionId,
          stagedJobId: stageRes.jobId,
          forceNewOrder: true,
          shopId: shop.id,
          notes: {
            shopName: shop.name,
            documentsCount: files.length.toString(),
            checkoutSessionId: activeSessionId
          }
        })
      ]);

      if (!scriptLoaded) {
        throw new Error('Payment gateway SDK could not be loaded. Please check your internet connection.');
      }

      if (!orderRes.success || (!orderRes.order_id && !orderRes.orderId)) {
        throw new Error(orderRes.error || 'Payment gateway failed to initialize order. Please try again.');
      }

      const backendOrderId = orderRes.order_id || orderRes.orderId;
      if (!backendOrderId || !backendOrderId.startsWith('order_')) {
        throw new Error('Payment gateway did not return a valid order ID.');
      }

      // STRICT PRE-CHECKOUT PARITY ASSERTION: Never open Razorpay if backend amount != displayed total (paise)
      const returnedAmountInPaise = Number(orderRes.amount);
      if (
        !Number.isInteger(returnedAmountInPaise) ||
        returnedAmountInPaise < 100 ||
        returnedAmountInPaise !== expectedAmountInPaise
      ) {
        const returnedRupees = Number.isFinite(returnedAmountInPaise)
          ? (returnedAmountInPaise / 100).toFixed(2)
          : 'invalid';
        throw new Error(
          `Payment amount mismatch detected (Order Summary: ₹${grandTotal.toFixed(0)}, Payment Gateway: ₹${returnedRupees}). Checkout was blocked for your protection.`
        );
      }

      setActiveOrderId(backendOrderId);
      saveOrderSession({
        orderId: backendOrderId,
        checkoutSessionId: activeSessionId,
        status: 'CREATED',
        shopId: shop.id,
        customerPhone: customerPhone.trim() || undefined,
        totalAmount: returnedAmountInPaise / 100
      });

      setCheckoutStatus('PAYMENT_CHECKOUT_OPEN');
      setPaymentProcessingLabel('Opening Razorpay...');

      const configuredKey = shop.razorpaySettings?.keyId?.trim();
      const effectiveKey = getEffectiveRazorpayKey(configuredKey);
      const activeKey = orderRes.key_id && isRealRazorpayKey(orderRes.key_id)
        ? orderRes.key_id.trim()
        : effectiveKey;

      const amountInPaise = returnedAmountInPaise;
      const checkoutCurrency = orderRes.currency || 'INR';

      // Start background polling to reconcile UPI payments completed on external apps
      const startPolling = (orderIdToPoll: string) => {
        stopPolling();
        let pollCount = 0;
        const maxPolls = 40; // 40 * 2.5s = ~100s

        pollingTimerRef.current = setInterval(async () => {
          pollCount++;
          if (pollCount > maxPolls) {
            stopPolling();
            return;
          }

          try {
            const check = await checkRazorpayOrderStatus(orderIdToPoll, shop.id);
            if (check.status === 'PAID' && check.paymentId) {
              stopPolling();
              payAttemptLockRef.current = false;
              if (activeRzpInstanceRef.current) {
                try {
                  activeRzpInstanceRef.current.close();
                } catch (_) {}
              }
              setPaymentPendingState(null);
              setPaymentFailedState(null);
              void onPaymentSuccess(check.paymentId, orderIdToPoll, check.job);
            } else if (check.status === 'FAILED') {
              stopPolling();
              payAttemptLockRef.current = false;
              if (activeRzpInstanceRef.current) {
                try {
                  activeRzpInstanceRef.current.close();
                } catch (_) {}
              }
              setIsProcessingPayment(false);
              setCheckoutStatus('PAYMENT_FAILED');
              setPaymentPendingState(null);
              setPaymentFailedState({
                status: 'FAILED',
                message: check.message || 'Payment was declined or failed.'
              });
            }
          } catch (_) {
            // Silently ignore transient network pauses during polling
          }
        }, 2500);
      };

      startPolling(backendOrderId);

      // Watchdog timer: If Razorpay checkout iframe takes > 12s without mounting or callback, reset loading state
      openWatchdog = setTimeout(() => {
        if (!modalDismissedOrCompleted && !document.querySelector('iframe.razorpay-checkout-frame')) {
          payAttemptLockRef.current = false;
          setIsProcessingPayment(false);
          setCheckoutStatus('PAYMENT_FAILED');
          setPaymentFailedState({
            status: 'FAILED',
            message: 'Payment window did not open. Please verify popups/extensions are not blocking checkout, then tap Retry.'
          });
          showToast('Checkout Window Notice', 'Payment window did not open. Please tap Retry below.', 'error', 5000);
        }
      }, 12000);

      const options: any = {
        key: activeKey,
        amount: amountInPaise,
        currency: checkoutCurrency,
        name: shop.name,
        description: `Print Order (${files.length} document${files.length > 1 ? 's' : ''})`,
        image: shop.logoUrl || undefined,
        order_id: backendOrderId,
        prefill: {
          name: 'Counter Customer',
          contact: customerPhone.trim() || undefined
        },
        notes: {
          shopId: shop.id,
          shopName: shop.name,
          documentsCount: files.length.toString(),
          checkoutSessionId: activeSessionId
        },
        theme: {
          color: '#00B32D'
        },
        modal: {
          backdropclose: false,
          escape: true,
          handleback: true,
          confirm_close: true,
          ondismiss: async () => {
            modalDismissedOrCompleted = true;
            payAttemptLockRef.current = false;
            if (openWatchdog) clearTimeout(openWatchdog);

            // Reconcile status with backend before assuming cancellation
            try {
              const check = await checkRazorpayOrderStatus(backendOrderId, shop.id);
              if (check.status === 'PAID' && check.paymentId) {
                stopPolling();
                void onPaymentSuccess(check.paymentId, backendOrderId, check.job);
                return;
              }

              const recon = await reconcileRazorpayPayment({ orderId: backendOrderId, shopId: shop.id });
              if (recon.status === 'PAID' && recon.paymentId) {
                stopPolling();
                void onPaymentSuccess(recon.paymentId, backendOrderId, recon.job);
                return;
              }

              if (check.status === 'PENDING') {
                setIsProcessingPayment(false);
                setCheckoutStatus('PAYMENT_PROCESSING');
                saveOrderSession({
                  orderId: backendOrderId,
                  checkoutSessionId: activeSessionId,
                  status: 'PENDING',
                  shopId: shop.id,
                  customerPhone: customerPhone.trim() || undefined,
                  totalAmount: stageRes.authoritativeTotalAmount ?? grandTotal
                });
                setPaymentPendingState({
                  status: 'PENDING',
                  orderId: backendOrderId,
                  message: 'Payment processing. Please wait.'
                });
                showToast(
                  'Payment Processing',
                  'If you completed payment in your UPI app, tap "Refresh Status" below.',
                  'info',
                  5000
                );
                return;
              }

              if (check.status === 'FAILED') {
                stopPolling();
                setIsProcessingPayment(false);
                setCheckoutStatus('PAYMENT_FAILED');
                setPaymentFailedState({
                  status: 'FAILED',
                  message: check.message || 'Payment was declined or failed.'
                });
                return;
              }
            } catch (_) {
              // Fall through to cancellation notice
            }

            stopPolling();
            setIsProcessingPayment(false);
            setCheckoutStatus('CANCELLED');
            setPaymentFailedState({
              status: 'CANCELLED',
              message: 'Payment window was closed. If your money was deducted, tap "Already Paid / Check Payment" below to recover and print.'
            });
            showToast(
              'Payment Window Closed',
              'If your money was deducted, tap "Already Paid / Check Payment" below.',
              'info',
              4000
            );
          }
        },
        handler: async (response: any) => {
          modalDismissedOrCompleted = true;
          payAttemptLockRef.current = false;
          stopPolling();
          if (openWatchdog) clearTimeout(openWatchdog);

          // STRICT: Verify transaction on server before marking PAID
          if (!response || !response.razorpay_payment_id) {
            setIsProcessingPayment(false);
            setCheckoutStatus('PAYMENT_FAILED');
            setPaymentFailedState({
              status: 'FAILED',
              message: 'Payment verification failed: No payment ID returned by gateway. Order was not placed.'
            });
            showToast(
              'Payment Failed',
              'No payment ID returned by payment gateway. Order was not placed.',
              'error',
              6000
            );
            return;
          }

          const resolvedOrderId = response.razorpay_order_id || backendOrderId;
          saveOrderSession({
            orderId: resolvedOrderId,
            checkoutSessionId: activeSessionId,
            status: 'PENDING',
            paymentId: response.razorpay_payment_id,
            shopId: shop.id,
            customerPhone: customerPhone.trim() || undefined,
            totalAmount: stageRes.authoritativeTotalAmount ?? grandTotal
          });

          setCheckoutStatus('VERIFYING_PAYMENT');
          setPaymentProcessingLabel('Verifying payment & dispatching...');

          try {
            const verification = await verifyRazorpayPayment({
              razorpay_order_id: resolvedOrderId,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              shopId: shop.id
            });

            if (verification.success) {
              void onPaymentSuccess(
                response.razorpay_payment_id,
                resolvedOrderId,
                verification.job
              );
            } else {
              // Fallback to unified server recovery/reconciliation before declaring failure
              const recovered = await recoverOrRetryPrintOrder({
                orderId: resolvedOrderId,
                paymentId: response.razorpay_payment_id,
                shopId: shop.id
              });
              if (recovered.success) {
                void onPaymentSuccess(
                  recovered.paymentId || response.razorpay_payment_id,
                  recovered.orderId || resolvedOrderId,
                  recovered.job
                );
              } else {
                setIsProcessingPayment(false);
                setCheckoutStatus('PAYMENT_FAILED');
                const errMsg = verification.error || recovered.message || 'Payment verification failed. Tap "Already Paid / Check Payment" below to verify.';
                setPaymentFailedState({
                  status: 'FAILED',
                  message: errMsg
                });
                showToast('Payment Verification Notice', errMsg, 'error', 6000);
              }
            }
          } catch (verErr: any) {
            console.error('Payment verification error, attempting recovery:', verErr);
            const recovered = await recoverOrRetryPrintOrder({
              orderId: resolvedOrderId,
              paymentId: response.razorpay_payment_id,
              shopId: shop.id
            });
            if (recovered.success) {
              void onPaymentSuccess(
                recovered.paymentId || response.razorpay_payment_id,
                recovered.orderId || resolvedOrderId,
                recovered.job
              );
            } else {
              setIsProcessingPayment(false);
              setCheckoutStatus('PAYMENT_FAILED');
              const errMsg = verErr.message || 'Failed to verify payment with server. Tap "Already Paid / Check Payment" below.';
              setPaymentFailedState({
                status: 'FAILED',
                message: errMsg
              });
              showToast('Payment Verification Notice', errMsg, 'error', 6000);
            }
          }
        }
      };

      if (!window.Razorpay) {
        throw new Error('Payment gateway SDK object is not available on window.');
      }

      const rzpInstance = new window.Razorpay(options);
      activeRzpInstanceRef.current = rzpInstance;

      rzpInstance.on('payment.failed', (errResp: any) => {
        modalDismissedOrCompleted = true;
        payAttemptLockRef.current = false;
        stopPolling();
        if (openWatchdog) clearTimeout(openWatchdog);
        setIsProcessingPayment(false);
        setCheckoutStatus('PAYMENT_FAILED');
        console.warn('Payment failed:', errResp);
        const errMsg = errResp?.error?.description || 'Transaction declined or failed. Amount was not deducted. Order was not placed.';
        setPaymentFailedState({
          status: 'FAILED',
          message: errMsg
        });
        showToast('Payment Failed', errMsg, 'error', 6000);
      });

      rzpInstance.open();
      checkoutModalActive = true;
    } catch (err: any) {
      payAttemptLockRef.current = false;
      stopPolling();
      if (openWatchdog) clearTimeout(openWatchdog);
      setIsProcessingPayment(false);
      setPaymentPendingState(null);
      const errMsg = err.message || 'Could not initiate payment. Please try again.';
      if (failedDuringStaging || err?.stagingCode) {
        setCheckoutStatus('STAGING_FAILED');
        setStagingFailedState({
          title: err?.stagingTitle || 'Unable to Prepare Your Files',
          message: errMsg,
          code: err?.stagingCode
        });
        showToast('Staging Failed', errMsg, 'error', 5000);
      } else {
        setCheckoutStatus('PAYMENT_FAILED');
        setPaymentFailedState({
          status: 'FAILED',
          message: errMsg
        });
        showToast('Payment Error', errMsg, 'error', 6000);
      }
    } finally {
      if (!checkoutModalActive) {
        payAttemptLockRef.current = false;
        setIsProcessingPayment(false);
      }
    }
  };

  // Unified "Already Paid / Check Payment" & "Retry Dispatch" recovery handler
  const handleManualStatusCheck = async (targetOrderId?: string, customLookupInput?: string) => {
    const savedSession = loadOrderSession();
    const rawLookup = (customLookupInput ?? recoveryLookupInput ?? '').trim();

    let lookupOrderId = targetOrderId || activeOrderId || paymentPendingState?.orderId || savedSession?.orderId || '';
    let lookupPaymentId = paymentPendingState?.paymentId || savedSession?.paymentId || '';
    let lookupPhone = customerPhone.trim() || savedSession?.customerPhone || '';

    if (rawLookup) {
      if (rawLookup.startsWith('pay_')) {
        lookupPaymentId = rawLookup;
      } else if (rawLookup.startsWith('order_')) {
        lookupOrderId = rawLookup;
      } else if (/^\d{10}$/.test(rawLookup.replace(/\D/g, ''))) {
        lookupPhone = rawLookup.replace(/\D/g, '');
      } else {
        lookupOrderId = rawLookup;
      }
    }

    if (!lookupOrderId && !lookupPaymentId && !lookupPhone) {
      setShowRecoveryInput(true);
      setStepError('Enter your Razorpay Payment ID (e.g. pay_...), Order ID (order_...), or 10-digit mobile number below to verify and dispatch your paid order.');
      return;
    }

    setIsCheckingStatus(true);
    setCheckingStatusLabel(
      paymentPendingState?.kind === 'DISPATCH'
        ? 'Sending to printer...'
        : 'Verifying payment with Razorpay...'
    );
    setStepError(null);

    try {
      const recovery = await recoverOrRetryPrintOrder({
        orderId: lookupOrderId || undefined,
        paymentId: lookupPaymentId || undefined,
        customerPhone: lookupPhone || undefined,
        shopId: shop.id
      });

      if (recovery.success && recovery.job?.id) {
        stopPolling();
        if (activeRzpInstanceRef.current) {
          try {
            activeRzpInstanceRef.current.close();
          } catch (_) {}
        }
        transitionToDispatchedConfirmation({
          jobId: recovery.job.id,
          trackingToken: recovery.job.trackingToken || recovery.trackingToken,
          orderId: recovery.orderId || lookupOrderId || recovery.job.orderId || `order_recovered_${Date.now()}`,
          paymentId: recovery.paymentId || lookupPaymentId || recovery.job.paymentId || 'pay_verified',
          totalAmount: recovery.job.totalAmount ?? grandTotal,
          statusMessage: recovery.message
        });
        return;
      }

      if (recovery.status === 'PAID' && recovery.needsFileUpload && (recovery.paymentId || lookupPaymentId)) {
        setCheckingStatusLabel('Sending to printer...');
        void onPaymentSuccess(
          recovery.paymentId || lookupPaymentId,
          recovery.orderId || lookupOrderId
        );
        return;
      }

      if (recovery.status === 'NOT_FOUND') {
        setPaymentPendingState(null);
        setShowRecoveryInput(true);
        const msg = recovery.message || 'No matching order was found. Please enter your Razorpay Payment ID (pay_...) or Order ID (order_...) to check again.';
        setStepError(msg);
        showToast('Order Lookup', msg, 'error', 5000);
        return;
      }

      if (recovery.status === 'FAILED' || recovery.status === 'NOT_PAID') {
        setPaymentPendingState(null);
        if (recovery.status === 'NOT_PAID') {
          setShowRecoveryInput(true);
        }
        setPaymentFailedState({
          status: 'FAILED',
          message: recovery.message || 'No captured payment was found for this order. You can safely retry payment below.'
        });
        showToast('Payment Not Captured', recovery.message || 'No captured payment detected.', 'error', 4000);
      } else {
        setPaymentFailedState(null);
        setPaymentPendingState({
          status: 'PENDING',
          orderId: recovery.orderId || lookupOrderId,
          paymentId: recovery.paymentId || lookupPaymentId || undefined,
          kind: paymentPendingState?.kind || 'PAYMENT',
          message: recovery.message || 'Payment is still being confirmed by the bank. Please wait a moment and tap Check Payment again.'
        });
        showToast('Payment Check', recovery.message || 'Verifying payment status with Razorpay...', 'info', 4000);
      }
    } catch (err: any) {
      const exactError = err instanceof Error ? err.message : 'Could not verify payment status right now. Please try again.';
      setStepError(exactError);
      showToast('Status Check Error', exactError, 'error', 4000);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  return (
    <div className="min-h-screen customer-page text-[#111111] font-['Manrope',sans-serif] pb-24">
      {maintenanceMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-amber-900 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 sticky top-0 z-40 shadow-xs">
          <div className="flex items-center gap-2.5 max-w-7xl mx-auto w-full">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold block">Scheduled Maintenance Mode Active</span>
              <span>{maintenanceMode.message} File uploads and new orders are temporarily disabled.</span>
            </div>
          </div>
        </div>
      )}
      {/* 1. TOP HEADER (EasyToPrint Official Branding & Shop Identity) */}
      <header className="bg-white border-b border-[#E1E7E1] sticky top-0 z-30 shadow-2xs font-['Manrope',sans-serif]">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left Section: [Printer Icon] [Shop Name / EasyToPrint] */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            {/* 1. Printer Icon */}
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center shrink-0 border border-[#A7F3D0]/70">
              <Printer className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-[#00B32D]" />
            </div>

            {/* 2 & 3. Vertically Stacked: Dynamic Shop Name + EasyToPrint Brand */}
            <div className="min-w-0 flex-1">
              <span
                className="font-semibold text-xs sm:text-sm md:text-base text-[#111111] leading-tight block truncate"
                title={shop.name}
              >
                {shop.name}
              </span>
              <span className="text-[10px] sm:text-xs text-[#646B65] font-normal leading-tight block truncate">
                EasyToPrint
              </span>
            </div>
          </div>

          {/* Right Section: [Track] [?] */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* 1. Track Button (position it on the left of right section) */}
            <a
              href="#/track-print"
              className="h-8 sm:h-9 px-2.5 sm:px-3 bg-[#E8F8EC] hover:bg-[#d5f3dc] text-[#008F25] font-medium text-xs rounded-xl border border-[#A7F3D0] transition-colors flex items-center gap-1 sm:gap-1.5 shrink-0 shadow-2xs"
              title="Track Print Order"
            >
              <Search className="w-3.5 h-3.5 text-[#00B32D] shrink-0" />
              <span>Track</span>
            </a>

            {/* 2. Info Button (?) (position it at the extreme right) */}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="h-8 sm:h-9 w-8 sm:w-9 bg-white hover:bg-slate-50 text-[#646B65] font-medium text-xs rounded-xl border border-[#E1E7E1] transition-colors flex items-center justify-center shrink-0 shadow-2xs cursor-pointer"
              title="How to Print / Information"
              aria-label="Info"
            >
              <HelpCircle className="w-4 h-4 text-[#646B65] shrink-0" />
            </button>
          </div>
        </div>

        {/* 2. PROGRESS STEPPER (Only Upload, Review, Pay) */}
        {currentStep <= 3 && (
          <div className="border-t border-[#E1E7E1] bg-white py-3 px-4">
            <div className="max-w-md mx-auto flex items-center justify-between text-xs">
              {/* Step 1: Upload */}
              <button
                type="button"
                onClick={() => goToStepImmediate(1)}
                className="flex items-center gap-1.5 font-bold cursor-pointer touch-manipulation active:scale-95 transition-transform"
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    currentStep > 1
                      ? 'bg-[#00B32D] text-white'
                      : 'bg-[#00B32D] text-white ring-2 ring-[#00B32D]/20'
                  }`}
                >
                  {currentStep > 1 ? <Check className="w-3.5 h-3.5" /> : '1'}
                </div>
                <span className={currentStep >= 1 ? 'text-[#008F25]' : 'text-[#646B65]'}>Upload</span>
              </button>

              <div
                className={`h-0.5 flex-1 mx-3 sm:mx-4 transition-colors ${
                  currentStep >= 2 ? 'bg-[#00B32D]' : 'bg-[#E1E7E1]'
                }`}
              />

              {/* Step 2: Review */}
              <button
                type="button"
                onClick={() => {
                  if (files.length === 0 || currentStep === 2) return;
                  if (currentStep > 2) {
                    goToStepImmediate(2);
                  } else {
                    void handleProceedToReview();
                  }
                }}
                disabled={files.length === 0 || navigatingTargetStep !== null}
                className={`flex items-center gap-1.5 font-bold cursor-pointer touch-manipulation active:scale-95 transition-transform ${
                  files.length === 0 ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    currentStep > 2
                      ? 'bg-[#00B32D] text-white'
                      : currentStep === 2
                      ? 'bg-[#00B32D] text-white ring-2 ring-[#00B32D]/20'
                      : 'bg-[#F7F8F7] text-[#646B65] border border-[#E1E7E1]'
                  }`}
                >
                  {currentStep > 2 ? <Check className="w-3.5 h-3.5" /> : '2'}
                </div>
                <span className={currentStep >= 2 ? 'text-[#008F25]' : 'text-[#646B65]'}>Review</span>
              </button>

              <div
                className={`h-0.5 flex-1 mx-3 sm:mx-4 transition-colors ${
                  currentStep >= 3 ? 'bg-[#00B32D]' : 'bg-[#E1E7E1]'
                }`}
              />

              {/* Step 3: Pay */}
              <button
                type="button"
                onClick={() => {
                  if (files.length === 0 || currentStep === 3) return;
                  void handleProceedToPayment();
                }}
                disabled={files.length === 0 || navigatingTargetStep !== null}
                className={`flex items-center gap-1.5 font-bold cursor-pointer touch-manipulation active:scale-95 transition-transform ${
                  files.length === 0 ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    currentStep === 3
                      ? 'bg-[#00B32D] text-white ring-2 ring-[#00B32D]/20'
                      : 'bg-[#F7F8F7] text-[#646B65] border border-[#E1E7E1]'
                  }`}
                >
                  3
                </div>
                <span className={currentStep === 3 ? 'text-[#008F25]' : 'text-[#646B65]'}>Pay</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 3. MAIN WORKSPACE */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-8">
          {/* ========================================================================= */}
          {/* STEP 1: UPLOAD & CUSTOMIZE (3-STEP FLOW: UPLOAD -> REVIEW -> PAY)        */}
          {/* ========================================================================= */}
          {currentStep === 1 && (
            <div
              key="step-upload"
              className="max-w-3xl mx-auto space-y-3.5 sm:space-y-6 etp-page-enter"
            >
              {/* COMPACT OFFLINE STATUS BADGE */}
              {agentStatus && !agentStatus.isAvailable && (
                <div className="px-3 py-2 sm:px-4 sm:py-2.5 bg-rose-50 border border-rose-200 rounded-xl sm:rounded-2xl text-rose-950 shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium text-xs sm:text-sm text-rose-950">
                          {agentStatus.reason === 'PRINTER_UNAVAILABLE'
                            ? 'Print Agent Connected · No Printer Ready'
                            : 'Shop is currently offline'}
                        </span>
                        <span className="hidden sm:inline text-xs text-rose-700/80 font-normal">
                          · Uploads paused
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-black uppercase tracking-wide">
                        Offline
                      </span>
                      <button
                        type="button"
                        onClick={handleManualRefreshStatus}
                        disabled={isCheckingAgentStatus || isManualCheckingStatus}
                        className="px-2.5 py-1 bg-white hover:bg-rose-100/60 active:scale-95 text-rose-700 font-bold text-xs rounded-lg border border-rose-200 shadow-2xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Check shop availability"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${(isCheckingAgentStatus || isManualCheckingStatus) ? 'animate-spin' : ''}`} />
                        <span className="text-[11px]">Refresh</span>
                      </button>
                    </div>
                  </div>

                  {alternativeShops.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-rose-200/60 flex items-center justify-between text-xs">
                      <span className="text-[11px] font-medium text-rose-800 truncate">
                        Nearby online: <strong>{alternativeShops[0].name}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(`/print/${alternativeShops[0].slug}`)}
                        className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline flex items-center gap-0.5 ml-2 shrink-0"
                      >
                        Switch
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Upload Header Section */}
              <div className="text-center space-y-2 mb-6">
                <h1 className="text-2xl font-semibold text-[#111111]">Upload Your Documents</h1>
                <p className="text-sm font-normal text-[#646B65]">Upload your files for printing. PDF, JPG and PNG supported.</p>
              </div>

              {/* Standard Upload Box */}
              <div className="border-2 border-dashed border-[#E1E7E1] hover:border-[#00B32D] bg-white rounded-3xl p-6 sm:p-8 text-center shadow-xs transition-colors">
                <div className="w-12 h-12 rounded-2xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center mx-auto mb-3 shadow-2xs">
                  {uploadingQueue.length > 0 ? (
                    <RotateCw className="w-6 h-6 animate-spin text-[#00B32D]" />
                  ) : (
                    <Upload className="w-6 h-6" />
                  )}
                </div>
                <h2 className="text-base font-medium text-[#111111]">
                  {uploadingQueue.length > 0 ? 'Preparing documents...' : 'Click or Drag to Upload'}
                </h2>
                <p className="text-xs font-normal text-[#646B65] mt-0.5 mb-5">
                  Supported formats: PDF, JPG and PNG · Up to 50 MB each
                </p>

                <div className="flex items-center justify-center">
                  {(() => {
                    const isShopOffline = Boolean(agentStatus && !agentStatus.isAvailable);
                    const isDisabled = uploadingQueue.length > 0 || Boolean(maintenanceMode) || isShopOffline;
                    return (
                      <label
                        htmlFor={isDisabled ? undefined : fileInputId}
                        className={`h-11 px-6 font-medium text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all ${
                          maintenanceMode || isShopOffline
                            ? 'bg-slate-300 text-slate-600 cursor-not-allowed opacity-90'
                            : uploadingQueue.length > 0
                            ? 'bg-[#00B32D]/70 text-white cursor-wait opacity-80'
                            : 'bg-[#00B32D] hover:bg-[#008F25] active:scale-95 text-white cursor-pointer'
                        }`}
                      >
                        {maintenanceMode ? (
                          <>
                            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
                            <span>Maintenance (Uploads Disabled)</span>
                          </>
                        ) : isShopOffline ? (
                          <>
                            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                            <span>Shop Offline (Uploads Paused)</span>
                          </>
                        ) : uploadingQueue.length > 0 ? (
                          <>
                            <RotateCw className="w-4 h-4 animate-spin shrink-0" />
                            <span>Uploading files...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 shrink-0" />
                            <span>Choose Files</span>
                          </>
                        )}
                        <input
                          id={fileInputId}
                          type="file"
                          multiple
                          disabled={isDisabled}
                          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    );
                  })()}
                </div>

                <p className="text-[11px] font-normal text-[#646B65] mt-3">or drag and drop files here</p>
              </div>

                {/* Live Upload Loading Progress Status Card */}
                {uploadingQueue.length > 0 && (
                  <div className="space-y-2.5">
                    {uploadingQueue.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white rounded-2xl border border-[#A7F3D0] p-4 shadow-2xs space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center shrink-0">
                              <RotateCw className="w-4 h-4 animate-spin" />
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-[#111111] truncate block max-w-[200px] sm:max-w-md">
                                {item.name}
                              </span>
                              <span className="text-[11px] text-[#646B65]">
                                {(item.size / 1024 / 1024).toFixed(1)} MB · Uploading & processing pages...
                              </span>
                            </div>
                          </div>
                          <span className="font-mono font-bold text-[#008F25] text-xs shrink-0">
                            {item.progress}%
                          </span>
                        </div>

                        {/* Animated Progress Bar */}
                        <div className="w-full h-1.5 bg-[#F7F8F7] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#00B32D] rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {uploadError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {stepError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{stepError}</span>
                  </div>
                )}

                {/* Section Title: Your files + Add more files button */}
                {files.length > 0 && (
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-1.5">
                        <h2 className="text-base font-bold text-[#111111]">Your files</h2>
                        <span className="text-xs text-[#646B65] font-medium">
                          {files.length} document{files.length !== 1 ? 's' : ''} added
                        </span>
                      </div>

                      <label
                        htmlFor={fileInputId}
                        className="px-3.5 py-1.5 bg-white border border-[#E1E7E1] hover:bg-[#F7F8F7] text-[#111111] text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all hover:border-[#00B32D]/40 active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#00B32D]" />
                        <span>Add more files</span>
                      </label>
                    </div>

                    {/* Expandable File Cards List */}
                    <div className="space-y-4">
                      {files.map((file) => {
                        const isExpanded = expandedFileIds[file.id] ?? false;
                        const isPdf = file.fileType.includes('pdf') || file.fileName.endsWith('.pdf');

                        return (
                          <div
                            key={file.id}
                            className="bg-white rounded-2xl border border-[#E1E7E1] shadow-2xs overflow-hidden transition-all"
                          >
                            {/* Card Header Row */}
                            <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                                    isPdf ? 'bg-red-50 text-red-600' : 'bg-[#E8F8EC] text-[#00B32D]'
                                  }`}
                                >
                                  {isPdf ? (
                                    <FileText className="w-5 h-5 text-red-600" />
                                  ) : (
                                    <ImageIcon className="w-5 h-5 text-[#00B32D]" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <h3 className="text-sm font-bold text-[#111111] truncate max-w-[200px] sm:max-w-md">
                                    {file.fileName}
                                  </h3>
                                  <div className="flex items-center gap-2 text-xs text-[#646B65] mt-0.5 flex-wrap">
                                    <span>{(file.fileSize / 1024 / 1024).toFixed(1)} MB</span>
                                    <span>·</span>
                                    <span>{file.estimatedPages} page{file.estimatedPages > 1 ? 's' : ''}</span>
                                    <span>·</span>
                                    <span>{file.orientation === 'LANDSCAPE' ? 'Landscape' : 'Portrait'}</span>
                                  </div>
                                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#008F25] bg-[#E8F8EC] px-2 py-0.2 rounded-full border border-[#A7F3D0]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#00B32D]" />
                                      <span>Ready</span>
                                    </span>
                                    {file.isMerged && (
                                      <span className="px-2 py-0.5 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-[10px] font-bold inline-flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3 text-[#00B32D]" />
                                        <span>Merged Document</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={() => removeFile(file.id)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer shrink-0"
                                title="Delete file"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Action Bar: Live Preview (Left) & Hide settings / Configure (Right) */}
                            <div className="px-4 sm:px-5 py-2.5 bg-[#F7F8F7] border-t border-[#E1E7E1] flex items-center justify-between text-xs font-semibold">
                              <button
                                type="button"
                                onClick={() => setPreviewFileId(file.id)}
                                className="text-[#008F25] hover:text-[#00B32D] flex items-center gap-1.5 cursor-pointer font-bold"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Live Print Preview</span>
                              </button>

                              <button
                                onClick={() => toggleExpand(file.id)}
                                className="text-[#008F25] hover:text-[#00B32D] flex items-center gap-1 cursor-pointer font-bold"
                              >
                                <span>{isExpanded ? 'Hide settings' : 'Configure'}</span>
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>

                            {/* Collapsible Print Settings Area */}
                            {isExpanded && (
                              <div className="p-4 sm:p-5 border-t border-[#E1E7E1] space-y-4 bg-white">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-bold text-[#111111]">Print settings</h4>
                                  <span className="text-[10px] font-semibold text-[#008F25] bg-[#E8F8EC] px-2 py-0.5 rounded-full border border-[#A7F3D0]">
                                    For this file only
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                  {(() => {
                                    const isColorSupported = isCombinationValid(file.paperSize || 'A4', 'COLOR', file.sides === 'DOUBLE');
                                    const isDuplexSupported = isCombinationValid(file.paperSize || 'A4', file.color || 'BW', true);

                                    return (
                                      <>
                                        {/* 1. Print Type (B&W vs Colour) */}
                                        <div>
                                          <label className="text-xs font-bold text-[#111111] block mb-1.5">Print type</label>
                                          <div className="grid grid-cols-2 gap-1 p-1 bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl">
                                            <button
                                              type="button"
                                              onClick={() => updateFileConfig(file.id, { color: 'BW' })}
                                              className={`py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                                file.color === 'BW'
                                                  ? 'bg-[#E8F8EC] text-[#008F25] border border-[#00B32D] shadow-2xs font-extrabold'
                                                  : 'text-[#646B65] hover:text-[#111111]'
                                              }`}
                                            >
                                              B&W
                                            </button>
                                            <button
                                              type="button"
                                              disabled={!isColorSupported.isValid}
                                              onClick={() => isColorSupported.isValid && updateFileConfig(file.id, { color: 'COLOR' })}
                                              title={!isColorSupported.isValid ? isColorSupported.reason : 'Colour'}
                                              className={`py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all ${
                                                !isColorSupported.isValid
                                                  ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50'
                                                  : file.color === 'COLOR'
                                                    ? 'bg-[#E8F8EC] text-[#008F25] border border-[#00B32D] shadow-2xs cursor-pointer font-extrabold'
                                                    : 'text-[#646B65] hover:text-[#111111] cursor-pointer'
                                              }`}
                                            >
                                              Colour
                                            </button>
                                          </div>
                                          {!isColorSupported.isValid && (
                                            <p className="text-[10px] text-amber-700 mt-1 flex items-start gap-1 font-medium leading-tight">
                                              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                              <span>{isColorSupported.reason || 'Colour printing unavailable'}</span>
                                            </p>
                                          )}
                                        </div>

                                        {/* 2. Print Sides (Single vs Double) */}
                                        <div>
                                          <label className="text-xs font-bold text-[#111111] block mb-1.5">Print sides</label>
                                          <div className="grid grid-cols-2 gap-1 p-1 bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl">
                                            <button
                                              type="button"
                                              onClick={() => updateFileConfig(file.id, { sides: 'SINGLE' })}
                                              className={`py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer truncate px-0.5 ${
                                                file.sides === 'SINGLE'
                                                  ? 'bg-[#E8F8EC] text-[#008F25] border border-[#00B32D] shadow-2xs font-extrabold'
                                                  : 'text-[#646B65] hover:text-[#111111]'
                                              }`}
                                            >
                                              Single Side
                                            </button>
                                            <button
                                              type="button"
                                              disabled={!isDuplexSupported.isValid}
                                              onClick={() => isDuplexSupported.isValid && updateFileConfig(file.id, { sides: 'DOUBLE' })}
                                              title={!isDuplexSupported.isValid ? isDuplexSupported.reason : 'Double Side'}
                                              className={`py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all truncate px-0.5 ${
                                                !isDuplexSupported.isValid
                                                  ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50'
                                                  : file.sides === 'DOUBLE'
                                                    ? 'bg-[#E8F8EC] text-[#008F25] border border-[#00B32D] shadow-2xs cursor-pointer font-extrabold'
                                                    : 'text-[#646B65] hover:text-[#111111] cursor-pointer'
                                              }`}
                                            >
                                              Double Side
                                            </button>
                                          </div>
                                          {!isDuplexSupported.isValid && (
                                            <p className="text-[10px] text-amber-700 mt-1 flex items-start gap-1 font-medium leading-tight">
                                              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                              <span>{isDuplexSupported.reason || 'Double-sided printing unavailable'}</span>
                                            </p>
                                          )}
                                        </div>

                                        {/* 3. Paper Size Selection */}
                                        <div>
                                          <div className="flex items-center justify-between mb-1.5">
                                            <label className="text-xs font-bold text-[#111111] block">Paper size</label>
                                            <span className="text-[10px] text-[#008F25] font-bold">{file.paperSize || 'A4'}</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1 p-1 bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl">
                                            {activeShopSizes.map((sz) => {
                                              const isSelected = (file.paperSize || 'A4') === sz;
                                              const isSizeSupported = isCombinationValid(sz, file.color || 'BW', file.sides === 'DOUBLE');
                                              return (
                                                <button
                                                  key={sz}
                                                  type="button"
                                                  disabled={!isSizeSupported.isValid}
                                                  onClick={() => isSizeSupported.isValid && updateFileConfig(file.id, { paperSize: sz as PaperSize })}
                                                  className={`flex-1 min-w-[50px] py-1.5 px-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition-all text-center truncate ${
                                                    !isSizeSupported.isValid
                                                      ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50'
                                                      : isSelected
                                                        ? 'bg-[#E8F8EC] text-[#008F25] border border-[#00B32D] shadow-2xs font-extrabold cursor-pointer'
                                                        : 'text-[#646B65] hover:text-[#111111] cursor-pointer'
                                                  }`}
                                                  title={!isSizeSupported.isValid ? isSizeSupported.reason : sz}
                                                >
                                                  {sz}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </>
                                    );
                                  })()}

                                  {/* 4. Copies Counter [-] 1 [+] */}
                                  <div>
                                    <label className="text-xs font-bold text-[#111111] block mb-1.5">Copies</label>
                                    <div className="flex items-center justify-between p-1 bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl h-10 px-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateFileConfig(file.id, { copies: Math.max(1, (file.copies || 1) - 1) })
                                        }
                                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white hover:bg-[#E1E7E1] active:scale-95 flex items-center justify-center font-bold text-[#111111] cursor-pointer shadow-2xs border border-[#E1E7E1]"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <span className="font-extrabold text-sm font-mono text-[#111111]">
                                        {file.copies || 1}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateFileConfig(file.id, { copies: (file.copies || 1) + 1 })
                                        }
                                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white hover:bg-[#E1E7E1] active:scale-95 flex items-center justify-center font-bold text-[#111111] cursor-pointer shadow-2xs border border-[#E1E7E1]"
                                      >
                                        <Plus className="w-3.5 h-3.5 text-[#00B32D]" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* 5. Orientation */}
                                  <div>
                                    <label className="text-xs font-bold text-[#111111] block mb-1.5">Orientation</label>
                                    <div className="grid grid-cols-2 gap-1 p-1 bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl">
                                      <button
                                        type="button"
                                        onClick={() => updateFileConfig(file.id, { orientation: 'PORTRAIT' })}
                                        className={`py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                          (file.orientation || 'PORTRAIT') === 'PORTRAIT'
                                            ? 'bg-[#E8F8EC] text-[#008F25] border border-[#00B32D] shadow-2xs font-extrabold'
                                            : 'text-[#646B65] hover:text-[#111111]'
                                        }`}
                                      >
                                        Portrait
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateFileConfig(file.id, { orientation: 'LANDSCAPE' })}
                                        className={`py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                          file.orientation === 'LANDSCAPE'
                                            ? 'bg-[#E8F8EC] text-[#008F25] border border-[#00B32D] shadow-2xs font-extrabold'
                                            : 'text-[#646B65] hover:text-[#111111]'
                                        }`}
                                      >
                                        Landscape
                                      </button>
                                    </div>
                                  </div>

                                  {/* 6. Pages per sheet */}
                                  <div>
                                    <label className="text-xs font-bold text-[#111111] block mb-1.5">Pages per sheet</label>
                                    <select
                                      value={file.pagesPerSheet || 1}
                                      onChange={(e) =>
                                        updateFileConfig(file.id, { pagesPerSheet: Number(e.target.value) as PagesPerSheet })
                                      }
                                      className="w-full h-10 px-3 bg-[#F7F8F7] hover:bg-[#E1E7E1]/50 border border-[#E1E7E1] rounded-xl text-[11px] sm:text-xs font-bold text-[#111111] focus:outline-none focus:ring-1 focus:ring-[#00B32D] cursor-pointer transition-colors"
                                    >
                                      <option value={1}>1 page/sheet</option>
                                      <option value={2}>2 pages/sheet (N-up)</option>
                                      <option value={4}>4 pages/sheet</option>
                                    </select>
                                  </div>

                                  {/* 6b. Page Scaling */}
                                  <div>
                                    <label className="text-xs font-bold text-[#111111] block mb-1.5">Scaling</label>
                                    <select
                                      value={file.scaling || 'fit'}
                                      onChange={(e) =>
                                        updateFileConfig(file.id, { scaling: e.target.value as 'fit' | 'actual' | 'fill' })
                                      }
                                      className="w-full h-10 px-3 bg-[#F7F8F7] hover:bg-[#E1E7E1]/50 border border-[#E1E7E1] rounded-xl text-[11px] sm:text-xs font-bold text-[#111111] focus:outline-none focus:ring-1 focus:ring-[#00B32D] cursor-pointer transition-colors"
                                    >
                                      <option value="fit">Fit to Page</option>
                                      <option value="actual">Actual Size (100%)</option>
                                      <option value="fill">Fill Page</option>
                                    </select>
                                  </div>

                                  {/* 6c. Page Margins */}
                                  <div>
                                    <label className="text-xs font-bold text-[#111111] block mb-1.5">Margins</label>
                                    <select
                                      value={file.margins || 'default'}
                                      onChange={(e) =>
                                        updateFileConfig(file.id, { margins: e.target.value as 'default' | 'narrow' | 'none' })
                                      }
                                      className="w-full h-10 px-3 bg-[#F7F8F7] hover:bg-[#E1E7E1]/50 border border-[#E1E7E1] rounded-xl text-[11px] sm:text-xs font-bold text-[#111111] focus:outline-none focus:ring-1 focus:ring-[#00B32D] cursor-pointer transition-colors"
                                    >
                                      <option value="default">Default (10 mm)</option>
                                      <option value="narrow">Narrow (5 mm)</option>
                                      <option value="none">None (Borderless)</option>
                                    </select>
                                  </div>

                                  {/* 7. Pages to Print (Spans 2 columns) */}
                                  <div className="col-span-2 pt-1">
                                    <label className="text-xs font-bold text-[#111111] block mb-1.5">Pages to print</label>
                                    <div className="grid grid-cols-2 gap-1 p-1 bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl mb-2">
                                      <button
                                        type="button"
                                        onClick={() => updateFileConfig(file.id, { pageSelection: 'ALL' })}
                                        className={`py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                          file.pageSelection === 'ALL'
                                            ? 'bg-[#E8F8EC] text-[#008F25] border border-[#00B32D] shadow-2xs font-extrabold'
                                            : 'text-[#646B65] hover:text-[#111111]'
                                        }`}
                                      >
                                        All Pages
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateFileConfig(file.id, { pageSelection: 'CUSTOM' })}
                                        className={`py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                          file.pageSelection === 'CUSTOM'
                                            ? 'bg-[#E8F8EC] text-[#008F25] border border-[#00B32D] shadow-2xs font-extrabold'
                                            : 'text-[#646B65] hover:text-[#111111]'
                                        }`}
                                      >
                                        Custom Pages
                                      </button>
                                    </div>

                                    {file.pageSelection === 'CUSTOM' && (
                                      <div className="space-y-1">
                                        <input
                                          type="text"
                                          placeholder="e.g. 1-3, 5, 8"
                                          value={file.customRange || ''}
                                          onChange={(e) => updateFileConfig(file.id, { customRange: e.target.value })}
                                          className="w-full h-10 px-3.5 bg-white border border-[#E1E7E1] rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#00B32D]"
                                        />
                                        <p className="text-[10px] text-[#646B65]">
                                          Specify page ranges separated by commas. Live preview updates automatically.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Embedded Live WYSIWYG Print Preview Section */}
                                <div className="pt-3 border-t border-[#E1E7E1] space-y-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setInlinePreviewIds((prev) => ({ ...prev, [file.id]: !prev[file.id] }))
                                      }
                                      className="text-xs font-bold text-[#141715] hover:text-[#008F25] inline-flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-[#00B32D]" />
                                      <span>
                                        {inlinePreviewIds[file.id] ? 'Hide Live Print Preview' : 'Show Live Print Preview'}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPreviewFileId(file.id)}
                                      className="text-[11px] font-bold text-[#008F25] hover:text-[#00B32D] cursor-pointer"
                                    >
                                      Open Full Screen →
                                    </button>
                                  </div>

                                  {inlinePreviewIds[file.id] && (
                                    <LivePrintPreview
                                      variant="inline"
                                      inlineHeightClass="h-[300px] sm:h-[360px]"
                                      fileConfig={file}
                                      fileObject={sourceFilesRef.current.get(file.id) || null}
                                      activePaperSizes={activeShopSizes}
                                      shopCapabilities={livePreviewCapabilities}
                                    />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom Action Bar for Upload Step */}
                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3.5 bg-white p-5 rounded-3xl border border-[#E1E7E1] shadow-2xs">
                      <div>
                        <span className="text-xs font-semibold text-[#646B65] block">Ready to print</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-black font-mono text-[#111111]">
                            {files.length} Document{files.length > 1 ? 's' : ''}
                          </span>
                          <span className="text-xs text-[#646B65]">· Review details in next step</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleProceedToReview}
                        disabled={navigatingTargetStep !== null}
                        className="w-full sm:w-auto h-12 px-7 bg-[#00B32D] hover:bg-[#008F25] active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer touch-manipulation disabled:opacity-75 disabled:cursor-not-allowed"
                      >
                        {navigatingTargetStep === 2 ? (
                          <>
                            <RotateCw className="w-4 h-4 animate-spin" />
                            <span>Checking shop...</span>
                          </>
                        ) : (
                          <>
                            <span>Continue to Review</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: REVIEW YOUR PRINT ORDER (3-STEP FLOW: UPLOAD -> REVIEW -> PAY)    */}
          {/* ========================================================================= */}
          {currentStep === 2 && (
            <div
              key="step-review"
              className="max-w-xl mx-auto space-y-5 etp-page-enter"
            >
              {/* Top Navigation Row with Back Button */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => goToStepImmediate(1)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#111111] hover:text-black bg-white hover:bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl transition-all active:scale-95 shadow-2xs cursor-pointer touch-manipulation"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#646B65]" />
                  <span>Back to Upload</span>
                </button>
                <span className="text-[10px] font-bold tracking-widest text-[#008F25] uppercase font-mono">
                  STEP 2 OF 3
                </span>
              </div>

              <div className="text-center space-y-0.5">
                <h1 className="text-xl sm:text-2xl font-bold text-[#111111] tracking-tight">
                  Review your print order
                </h1>
                <p className="text-xs text-[#646B65]">
                  Check the details before continuing to payment.
                </p>
              </div>

              {/* Review File Cards */}
              <div className="space-y-3">
                {files.map((file) => {
                  const isPdf = file.fileType.includes('pdf') || file.fileName.endsWith('.pdf');
                  const pagesToPrint = countPages(file);

                  return (
                    <div
                      key={file.id}
                      className="bg-white rounded-2xl border border-[#E1E7E1] p-4 shadow-2xs space-y-3"
                    >
                      {/* Top Row: Icon + Title/Details + Price */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isPdf ? 'bg-red-50 text-red-600' : 'bg-[#E8F8EC] text-[#00B32D]'
                            }`}
                          >
                            {isPdf ? (
                              <FileText className="w-4 h-4 text-red-600" />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-[#00B32D]" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-xs sm:text-sm font-bold text-[#111111] truncate">
                              {file.fileName}
                            </h3>
                            <p className="text-[11px] text-[#646B65] mt-0.5">
                              {pagesToPrint} page{pagesToPrint > 1 ? 's' : ''} · {file.copies} cop{file.copies > 1 ? 'ies' : 'y'}
                            </p>
                          </div>
                        </div>

                        {/* Top-Right Price */}
                        <div className="shrink-0 text-right">
                          <span className="font-mono font-black text-base sm:text-lg text-[#111111]">
                            ₹{file.totalPrice.toFixed(0)}
                          </span>
                        </div>
                      </div>

                      {/* Middle Row: Pill Tags */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-[#111111]">
                        <span className="px-2 py-0.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-md">
                          {file.color === 'COLOR' ? 'Colour' : 'B&W'}
                        </span>
                        <span className="px-2 py-0.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-md">{file.paperSize}</span>
                        <span className="px-2 py-0.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-md">
                          {file.sides === 'DOUBLE' ? 'Double Side' : 'Single Side'}
                        </span>
                        <span className="px-2 py-0.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-md">
                          {file.pagesPerSheet || 1} page/sheet
                        </span>
                        <span className="px-2 py-0.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-md">
                          {file.orientation === 'LANDSCAPE' ? 'Landscape' : 'Portrait'}
                        </span>
                        <span className="px-2 py-0.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-md">
                          {file.scaling === 'actual' ? 'Actual Size' : file.scaling === 'fill' ? 'Fill Page' : 'Fit to Page'}
                        </span>
                        <span className="px-2 py-0.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-md">
                          {file.margins === 'narrow' ? 'Narrow Margins' : file.margins === 'none' ? 'No Margins' : 'Default Margins'}
                        </span>
                        {file.pageSelection === 'CUSTOM' && file.customRange && (
                          <span className="px-2 py-0.5 bg-[#E8F8EC] text-[#008F25] border border-[#A7F3D0] rounded-md font-mono">
                            Pages: {file.customRange}
                          </span>
                        )}
                      </div>

                      {/* Bottom Row: Actions */}
                      <div className="pt-2 border-t border-[#E1E7E1] flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#646B65] font-medium">Print specification</span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewFileId(file.id);
                            }}
                            className="h-8 px-3 bg-[#E8F8EC] hover:bg-[#d5f3dc] text-[#008F25] border border-[#A7F3D0] text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-2xs"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#00B32D]" />
                            <span>Live Preview</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setExpandedFileIds((p) => ({ ...p, [file.id]: true }));
                              goToStepImmediate(1);
                            }}
                            className="h-7 px-2.5 bg-[#F7F8F7] hover:bg-[#E1E7E1] text-[#111111] border border-[#E1E7E1] text-[11px] font-semibold rounded-lg flex items-center gap-1 cursor-pointer touch-manipulation transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#00B32D]" />
                            <span>Edit</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total Calculation Card */}
              <div className="bg-white rounded-2xl border border-[#E1E7E1] p-4 sm:p-5 shadow-2xs space-y-2 text-xs">
                <div className="flex items-center justify-between text-[#646B65]">
                  <span>Printing Charges</span>
                  <span className="font-mono font-bold text-[#111111]">₹{subtotal.toFixed(0)}</span>
                </div>

                <div className="pt-2 border-t border-dashed border-[#E1E7E1] flex items-baseline justify-between">
                  <span className="text-sm font-extrabold text-[#111111]">Total</span>
                  <span className="text-xl font-black font-mono text-[#008F25]">₹{grandTotal.toFixed(0)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={handleProceedToPayment}
                  disabled={navigatingTargetStep !== null}
                  className="w-full h-12 bg-[#00B32D] hover:bg-[#008F25] active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer touch-manipulation disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {navigatingTargetStep === 3 ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Checking shop...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue to Payment</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => goToStepImmediate(1)}
                  className="w-full py-2.5 text-xs font-semibold text-[#646B65] hover:text-[#111111] text-center transition-colors cursor-pointer touch-manipulation"
                >
                  ← Back to Upload
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3: PAYMENT (3-STEP FLOW: UPLOAD -> REVIEW -> PAY)                    */}
          {/* ========================================================================= */}
          {currentStep === 3 && (
            <div
              key="step-pay"
              className="max-w-md mx-auto space-y-5 etp-page-enter"
            >
              {/* Top Navigation Row with Back Button */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => goToStepImmediate(2)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#111111] hover:text-black bg-white hover:bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl transition-all active:scale-95 shadow-2xs cursor-pointer touch-manipulation"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#646B65]" />
                  <span>Back to Review</span>
                </button>
                <span className="text-[10px] font-bold tracking-widest text-[#008F25] uppercase font-mono">
                  STEP 3 OF 3
                </span>
              </div>

              <div className="text-center space-y-0.5">
                <h1 className="text-xl sm:text-2xl font-bold text-[#111111] tracking-tight">
                  Complete Payment
                </h1>
                <p className="text-xs text-[#646B65]">
                  Pay securely to dispatch your print order to <strong>{shop.name}</strong>
                </p>
              </div>

              {/* Payment Card: Clean, Modern & Direct */}
              <div className="bg-white rounded-3xl border border-[#E1E7E1] p-5 sm:p-7 shadow-sm space-y-5">
                {/* Header Price & Security Badge */}
                <div
                  data-testid="payment-summary-header"
                  className="flex flex-col min-[350px]:flex-row min-[350px]:flex-wrap min-[350px]:items-center min-[350px]:justify-between gap-x-2 min-[390px]:gap-x-3 gap-y-2.5 pb-4 border-b border-[#E1E7E1]"
                >
                  <div className="min-w-0 text-left">
                    <span className="block text-[9.5px] min-[375px]:text-[10px] sm:text-[11px] font-bold text-[#646B65] uppercase tracking-[0.02em] min-[375px]:tracking-wide sm:tracking-wider leading-tight whitespace-nowrap">
                      Total Payable Amount
                    </span>
                    <span className="block font-mono font-black text-2xl sm:text-3xl text-[#111111] tracking-tight leading-none mt-1 sm:mt-1.5 tabular-nums">
                      ₹{grandTotal.toFixed(0)}
                    </span>
                  </div>

                  <div className="flex flex-col items-start min-[350px]:items-center sm:items-end shrink-0 max-w-full">
                    <span className="inline-flex items-center gap-1 sm:gap-1.5 max-w-full text-[10px] min-[375px]:text-[10.5px] sm:text-xs font-bold text-[#008F25] bg-[#E8F8EC] px-2 py-0.5 sm:px-3 sm:py-1 rounded-full border border-[#A7F3D0] leading-snug whitespace-nowrap">
                      <ShieldCheck className="w-3 h-3 sm:w-4 sm:h-4 text-[#00B32D] shrink-0" aria-hidden="true" />
                      <span>100% Secure Payment</span>
                    </span>
                    <span className="block text-[9.5px] min-[375px]:text-[10px] text-[#646B65] font-mono leading-tight mt-1 whitespace-nowrap">
                      Official Payment Gateway
                    </span>
                  </div>
                </div>

                {/* Print Order Summary Card */}
                <div className="bg-[#F7F8F7] rounded-2xl border border-[#E1E7E1] p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between text-[#111111] font-bold">
                    <span className="uppercase tracking-wider text-[11px]">Order Summary</span>
                    <span className="text-[11px] text-[#646B65] font-normal">
                      {files.length} document{files.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {files.map((f, i) => (
                      <div key={f.id || i} className="p-2.5 bg-white rounded-xl border border-[#E1E7E1] space-y-1 text-left">
                        <div className="flex items-center justify-between font-bold text-[#111111]">
                          <span className="truncate max-w-[220px]">{f.fileName}</span>
                          <span className="font-mono">₹{f.totalPrice.toFixed(0)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#646B65]">
                          <span>{f.estimatedPages} {f.estimatedPages === 1 ? 'Page' : 'Pages'}</span>
                          <span>·</span>
                          <span>{f.color === 'COLOR' ? 'Color' : 'B&W'}</span>
                          <span>·</span>
                          <span>{f.sides === 'DOUBLE' ? 'Double Side' : 'Single Side'}</span>
                          <span>·</span>
                          <span>{f.paperSize}</span>
                          <span>·</span>
                          <span>{f.copies} {f.copies > 1 ? 'Copies' : 'Copy'}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-[#E1E7E1] space-y-1.5 text-[#646B65] text-left">
                    <div className="flex items-center justify-between">
                      <span>Printing Charges</span>
                      <span className="font-mono font-semibold text-[#111111]">₹{subtotal.toFixed(0)}</span>
                    </div>
                    {minOrderAdjustment > 0 && (
                      <div className="flex items-center justify-between text-[#646B65]">
                        <span>Minimum Order Adjustment</span>
                        <span className="font-mono font-semibold text-[#111111]">+₹{minOrderAdjustment.toFixed(0)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-[#E1E7E1] flex items-center justify-between font-bold text-[#111111] text-sm">
                      <span>Total Amount</span>
                      <span className="font-mono text-[#008F25] text-base font-extrabold">₹{grandTotal.toFixed(0)}</span>
                    </div>
                  </div>
                </div>

                {/* Optional Mobile Number for SMS Token */}
                <div className="text-left space-y-1.5">
                  <label className="text-xs font-bold text-[#111111] flex items-center justify-between">
                    <span>Mobile Number for SMS Token <span className="text-[10px] text-[#646B65] font-normal">(Optional)</span></span>
                    <span className="text-[10px] text-[#646B65] font-mono">10 digits</span>
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    maxLength={10}
                    placeholder="Enter mobile number for pickup code"
                    value={customerPhone}
                    onChange={(e) => {
                      setStepError(null);
                      setPaymentFailedState(null);
                      setCustomerPhone(e.target.value.replace(/\D/g, ''));
                    }}
                    onBlur={() => setPhoneTouched(true)}
                    className="w-full h-11 px-3.5 bg-white border border-[#E1E7E1] rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#00B32D] focus:border-[#00B32D]"
                  />
                  {phoneTouched && customerPhone.trim() && !validatePhone(customerPhone, false).isValid && (
                    <p className="text-[11px] text-red-600 font-medium">
                      {validatePhone(customerPhone, false).error}
                    </p>
                  )}
                </div>

                {/* PAYMENT PENDING BANNER (UPI AUTO-POLL & SAFE STATUS REFRESH) */}
                {paymentPendingState && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-2 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-amber-950">
                        <RotateCw className={`w-4 h-4 text-amber-600 shrink-0 ${isProcessingPayment || isCheckingStatus ? 'animate-spin' : ''}`} />
                        <span>{paymentPendingState.kind === 'DISPATCH' ? 'Payment verified; print dispatch pending.' : 'Payment processing. Please wait.'}</span>
                      </div>
                      {paymentPendingState.kind !== 'DISPATCH' && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-mono font-bold px-2 py-0.5 rounded-full">
                          UPI QR / APP
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-amber-800">
                      {paymentPendingState.kind === 'DISPATCH'
                        ? paymentPendingState.message
                        : 'If you scanned the QR code or authorized payment on your UPI app (Google Pay, PhonePe, Paytm, etc.), we are verifying the payment with the gateway.'}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleManualStatusCheck(paymentPendingState.orderId)}
                        disabled={isCheckingStatus || isProcessingPayment}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isCheckingStatus || isProcessingPayment ? (
                          <>
                            <RotateCw className="w-3.5 h-3.5 animate-spin" />
                            <span>{checkingStatusLabel}</span>
                          </>
                        ) : (
                          <>
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>{paymentPendingState.kind === 'DISPATCH' ? 'Retry Dispatch' : 'Refresh Status'}</span>
                          </>
                        )}
                      </button>
                      {paymentPendingState.kind !== 'DISPATCH' && (
                        <button
                          type="button"
                          onClick={() => {
                            resetForNewCheckout({ preserveFiles: true });
                            setCheckoutStatus('READY_FOR_PAYMENT');
                          }}
                          className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-800 font-medium text-xs rounded-xl border border-amber-300 transition-all cursor-pointer"
                        >
                          Cancel / Start Over
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* STAGING FAILED BANNER */}
                {stagingFailedState && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-2 text-left"
                  >
                    <div className="flex items-center gap-2 font-bold text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{stagingFailedState.title || 'Unable to Prepare Your Files'}</span>
                    </div>
                    <p className="text-[11px] text-amber-800 pl-6 break-words">
                      {stagingFailedState.message}
                    </p>
                    <div className="pl-6 pt-1 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePayNow}
                        disabled={isProcessingPayment || isCheckingStatus}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>Retry File Staging & Pay</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => goToStepImmediate(1)}
                        className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-semibold text-[11px] rounded-lg transition-all cursor-pointer touch-manipulation"
                      >
                        Edit Files
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* PAYMENT FAILED / CANCELLED STATE BANNER */}
                {paymentFailedState && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 space-y-2 text-left"
                  >
                    <div className="flex items-center gap-2 font-bold text-red-900">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>Payment Incomplete · Order Not Placed</span>
                    </div>
                    <p className="text-[11px] text-red-700 pl-6 break-words">
                      {paymentFailedState.message}
                    </p>
                    <div className="pl-6 pt-1 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleManualStatusCheck(activeOrderId || undefined)}
                        disabled={isCheckingStatus}
                        className="px-2.5 py-1 bg-white border border-red-300 hover:bg-red-100 text-red-800 font-bold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCw className={`w-3 h-3 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                        <span>{isCheckingStatus ? checkingStatusLabel : 'Already Paid / Check Payment'}</span>
                      </button>
                    </div>
                  </motion.div>
                )}

                {stepError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium text-left flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                    <span>{stepError}</span>
                  </div>
                )}

                {/* THE HERO "PAY NOW" BUTTON (OFFICIAL RAZORPAY CHECKOUT) */}
                <div className="pt-2 space-y-3">
                  <button
                    type="button"
                    disabled={isProcessingPayment || isCheckingStatus || paymentPendingState?.kind === 'DISPATCH'}
                    onClick={handlePayNow}
                    className="w-full h-14 bg-[#00B32D] hover:bg-[#008F25] active:scale-[0.99] text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-md transition-all flex items-center justify-center gap-2.5 cursor-pointer touch-manipulation disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    {isProcessingPayment ? (
                      <>
                        <RotateCw className="w-5 h-5 animate-spin" />
                        <span>{paymentProcessingLabel}</span>
                      </>
                    ) : isCheckingStatus ? (
                      <>
                        <RotateCw className="w-5 h-5 animate-spin" />
                        <span>{checkingStatusLabel}</span>
                      </>
                    ) : paymentPendingState?.kind === 'DISPATCH' ? (
                      <>
                        <RotateCw className="w-5 h-5" />
                        <span>Payment received · Retry dispatch above</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 text-emerald-100" />
                        <span>{paymentFailedState ? 'Retry Payment' : 'Pay Now'} · ₹{grandTotal.toFixed(0)}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {/* Always-Available "Already Paid / Check Payment" Recovery Action */}
                  <div className="pt-1 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                      <button
                        type="button"
                        onClick={() => handleManualStatusCheck(activeOrderId || undefined)}
                        disabled={isCheckingStatus || isProcessingPayment}
                        className="text-[11px] font-bold text-[#008F25] hover:text-[#00B32D] underline underline-offset-2 flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <RotateCw className={`w-3 h-3 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                        <span>
                          {isCheckingStatus
                            ? checkingStatusLabel
                            : 'Already Paid / Check Payment'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowRecoveryInput((prev) => !prev)}
                        className="text-[11px] font-medium text-[#646B65] hover:text-[#111111] underline underline-offset-2 cursor-pointer"
                      >
                        {showRecoveryInput ? 'Hide Lookup' : 'Enter Payment / Order ID'}
                      </button>
                    </div>

                    {showRecoveryInput && (
                      <div className="p-3.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-2xl space-y-2 text-left">
                        <label className="text-[11px] font-bold text-[#111111] block">
                          Recover Paid Order (Payment ID, Order ID, or 10-digit Mobile)
                        </label>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="text"
                            placeholder="pay_... or order_... or 10-digit phone"
                            value={recoveryLookupInput}
                            onChange={(e) => setRecoveryLookupInput(e.target.value)}
                            className="min-w-0 w-full flex-1 h-9 px-3 bg-white border border-[#E1E7E1] rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#00B32D]"
                          />
                          <button
                            type="button"
                            disabled={isCheckingStatus || isProcessingPayment}
                            onClick={() => handleManualStatusCheck(undefined, recoveryLookupInput)}
                            className="h-9 px-3.5 bg-[#00B32D] hover:bg-[#008F25] text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                          >
                            <RotateCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                            <span>Verify & Print</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-[#646B65]">
                          Checks Razorpay directly and dispatches your print job without charging you again.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Supported Payment Channels */}
                  <div className="pt-2 text-center space-y-2">
                    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-[#646B65] font-medium px-1">
                      <span className="shrink-0">Supported:</span>
                      <span className="font-bold text-[#111111] shrink-0">UPI</span>
                      <span className="text-[#E1E7E1]">·</span>
                      <span className="font-bold text-[#111111] shrink-0">Google Pay</span>
                      <span className="text-[#E1E7E1]">·</span>
                      <span className="font-bold text-[#111111] shrink-0">PhonePe</span>
                      <span className="text-[#E1E7E1]">·</span>
                      <span className="font-bold text-[#111111] shrink-0">Paytm</span>
                      <span className="text-[#E1E7E1]">·</span>
                      <span className="font-bold text-[#111111] shrink-0">Cards</span>
                      <span className="text-[#E1E7E1]">·</span>
                      <span className="font-bold text-[#111111] shrink-0">NetBanking</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-[#646B65] font-mono px-1">
                      <Lock className="w-3.5 h-3.5 text-[#00B32D] shrink-0" />
                      <span className="text-center">Razorpay Secure Checkout · Instant Printer Dispatch</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => goToStepImmediate(2)}
                  className="text-xs font-semibold text-[#646B65] hover:text-[#111111] transition-colors cursor-pointer touch-manipulation"
                >
                  ← Back to Order Review
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 4: ORDER TRACKING SCREEN WITH CODE COPY & STATUS                     */}
          {/* ========================================================================= */}
          {currentStep === 4 && activeJob && (
            <div
              key="step-tracking"
              className="max-w-md mx-auto space-y-6 etp-page-enter"
            >
              <div className="bg-white rounded-3xl border border-[#E1E7E1] p-6 sm:p-8 shadow-sm space-y-5 text-center">
                <div className="w-14 h-14 rounded-full bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center mx-auto shadow-2xs">
                  <CheckCircle2 className="w-7 h-7" />
                </div>

                <div>
                  <span className="text-[10px] font-bold text-[#008F25] uppercase tracking-widest font-mono">
                    Payment Confirmed · Order Dispatched
                  </span>
                  <h1 className="text-3xl sm:text-4xl font-black text-[#111111] mt-1 font-mono tracking-tight">
                    {activeJob.id}
                  </h1>
                  <div className="pt-2 flex items-center justify-center">
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(activeJob.id);
                        showToast('Token Copied!', `Order code #${activeJob.id} copied to clipboard`, 'info', 3000);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#F7F8F7] hover:bg-[#E1E7E1] active:scale-95 text-[#111111] border border-[#E1E7E1] text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#00B32D]" />
                      <span>Copy Order Token</span>
                    </button>
                  </div>
                  <p className="text-xs text-[#646B65] mt-2">
                    Show this token code at <strong>{shop.name}</strong> counter to collect your prints.
                  </p>
                </div>

                {/* Queue Status Box */}
                <div className="p-4 bg-[#F7F8F7] rounded-2xl text-left space-y-2 border border-[#E1E7E1]">
                  <span className="text-xs font-bold text-[#111111] block">Queue Status</span>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-[#008F25] font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#00B32D] shrink-0" />
                      <span>Payment Verified</span>
                    </div>
                    {(() => {
                      const status = activeJob.printStatus;
                      if (status === 'COMPLETED') {
                        return (
                          <div className="flex items-center gap-2 font-semibold text-[#008F25]">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#00B32D]" />
                            <span>Printed & Ready for Pickup</span>
                          </div>
                        );
                      }
                      if (status === 'SUBMITTED_TO_SPOOLER') {
                        return (
                          <div className="flex items-center gap-2 font-semibold text-emerald-700">
                            <RotateCw className="w-3.5 h-3.5 animate-spin text-[#00B32D] shrink-0" />
                            <span>Printer Processing Document</span>
                          </div>
                        );
                      }
                      if (status === 'AWAITING_RECONCILIATION' || status === 'REQUIRES_ATTENTION') {
                        return (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-semibold text-amber-800">
                              <Printer className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                              <span>Printing in Progress at Counter</span>
                            </div>
                            <p className="text-[11px] text-amber-700">
                              Your pages are queued at the shop counter. Please show your token #{activeJob.id} to collect them.
                            </p>
                          </div>
                        );
                      }
                      if (status === 'FAILED') {
                        return (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-semibold text-rose-700">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                              <span>Print Queue Notice</span>
                            </div>
                            <p className="text-[11px] text-slate-600">
                              Please ask the shop operator to release your print job or check printer paper.
                            </p>
                          </div>
                        );
                      }
                      return (
                        <div className="flex items-center gap-2 font-semibold text-[#008F25]">
                          <RotateCw className="w-3.5 h-3.5 animate-spin text-[#00B32D] shrink-0" />
                          <span>Preparing & Spooling Document...</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="pt-2 text-xs text-[#646B65] flex justify-between border-t border-[#E1E7E1]">
                  <span>Total Paid: ₹{activeJob.totalAmount.toFixed(0)}</span>
                  <span>{files.length} document(s)</span>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      resetForNewCheckout();
                      setCurrentStep(1);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="flex-1 h-11 bg-[#F7F8F7] hover:bg-[#E1E7E1] active:scale-95 text-[#111111] border border-[#E1E7E1] font-bold text-xs rounded-xl cursor-pointer transition-all"
                  >
                    Print More
                  </button>
                  <button
                    onClick={() => {
                      resetForNewCheckout();
                      navigate('/');
                    }}
                    className="flex-1 h-11 bg-[#00B32D] hover:bg-[#008F25] active:scale-95 text-white font-bold text-xs rounded-xl cursor-pointer transition-all shadow-xs"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
      </main>

      {/* 4. LIVE WYSIWYG PRINT PREVIEW MODAL */}
      {previewFile && (
        <LivePrintPreview
          variant="modal"
          fileConfig={previewFile}
          fileObject={sourceFilesRef.current.get(previewFile.id) || null}
          activePaperSizes={activeShopSizes}
          shopCapabilities={livePreviewCapabilities}
          onUpdateConfig={(updates) => updateFileConfig(previewFile.id, updates)}
          onClose={() => setPreviewFileId(null)}
        />
      )}

      {/* Customer Error Popup Modal */}
      <CustomerErrorModal
        error={customerErrorModal}
        onClose={() => setCustomerErrorModal(null)}
        onChooseAnother={() => {
          setCustomerErrorModal(null);
          const el = document.getElementById(fileInputId);
          if (el) el.click();
        }}
      />

      {/* Help Modal */}
      <AnimatePresence>
        {helpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-['Manrope',sans-serif]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#111111]/40 backdrop-blur-sm"
              onClick={() => setHelpOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden relative flex flex-col z-10 border border-[#E1E7E1]"
            >
              <div className="p-6 border-b border-[#E1E7E1] flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-[#111111]">How to Print</h2>
                <button onClick={() => setHelpOpen(false)} className="p-2 hover:bg-[#F7F8F7] rounded-full transition-colors cursor-pointer">
                  <X className="w-5 h-5 text-[#646B65]" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto space-y-6 bg-[#F7F8F7]/50">
                <p className="text-sm text-[#646B65]">Follow these simple steps to upload your documents and get your prints.</p>
                
                <div className="space-y-4">
                  {[
                    { icon: Upload, title: 'Upload Documents', desc: 'Choose PDF, JPG or PNG files from your device. You can upload multiple documents.' },
                    { icon: Edit3, title: 'Choose Print Settings', desc: 'Select your preferred print options, such as black & white or colour, paper size, number of copies and orientation.' },
                    { icon: Eye, title: 'Review Your Documents', desc: 'Check your document preview, selected print settings and estimated price before continuing.' },
                    { icon: CreditCard, title: 'Make Payment', desc: 'Complete your order payment using the available payment options.' },
                    { icon: Printer, title: 'Collect Your Prints', desc: 'Once your order is processed, visit the shop and collect your printed documents.' },
                  ].map((step, i) => (
                    <div key={i} className="flex gap-4 p-4 rounded-2xl bg-white border border-[#E1E7E1] shadow-2xs">
                      <div className="w-10 h-10 rounded-xl bg-[#E8F8EC] flex items-center justify-center shrink-0 border border-[#A7F3D0]">
                        <step.icon className="w-5 h-5 text-[#00B32D]" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-[#111111]">{i + 1}. {step.title}</h4>
                        <p className="text-xs text-[#646B65] mt-1 leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-[#E1E7E1] space-y-4">
                  <h3 className="text-sm font-bold text-[#111111]">Frequently Asked Questions</h3>
                  <div className="space-y-3">
                    {[
                      { q: 'Which file formats are supported?', a: 'PDF, JPG and PNG, subject to the displayed file size limit.' },
                      { q: 'Can I print multiple copies?', a: 'Yes. Select the required number of copies in Print Settings.' },
                      { q: 'Can I select specific pages?', a: 'Yes. Use Custom Pages in Print Settings.' },
                      { q: 'Why can\'t I upload documents?', a: 'Uploading may be paused when the print shop or its connected agent is offline. Try again when the shop is online.' },
                    ].map((faq, i) => (
                      <div key={i}>
                        <p className="text-xs font-bold text-[#111111]">{faq.q}</p>
                        <p className="text-xs text-[#646B65] mt-0.5 leading-relaxed">{faq.a}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Temporary Status Popup for Refresh Button Loading Feedback */}
      <AnimatePresence>
        {isManualCheckingStatus && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-white border border-[#E1E7E1] rounded-2xl shadow-xl text-[#111111] font-['Manrope',sans-serif] text-xs sm:text-sm font-medium pointer-events-none"
          >
            <RotateCw className="w-4 h-4 text-[#00B32D] animate-spin shrink-0" />
            <span>Checking shop status...</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
