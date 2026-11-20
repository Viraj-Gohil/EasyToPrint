import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  Files,
  Lock,
  Clock,
  Trash2,
  RotateCcw,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  CalendarClock,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  Info
} from 'lucide-react';
import { authenticatedFetch } from '../../lib/apiConfig';
import { Button } from '../ui/Button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '../ui/Table';

interface AdminStorageBucketInfo {
  name: string;
  visibility: 'Private' | 'Public' | 'Unknown';
  isPrivate: boolean | null;
  exists: boolean;
  status: 'Active' | 'Not Found' | 'Error';
  serviceRoleConfigured: boolean;
  inventorySource: 'SUPABASE_STORAGE_API' | 'SUPABASE_POSTGRES_STORAGE_SCHEMA';
  fileSizeLimitBytes: number | null;
  allowedMimeTypes: string[] | null;
  createdAt: string | null;
  error?: string;
}

interface AdminStorageOverview {
  totalFiles: number;
  totalStorageBytes: number;
  configuredQuotaBytes: number | null;
  configuredQuotaSource: 'ENV_CONFIGURED' | null;
  bucket: AdminStorageBucketInfo;
  lastCleanup: {
    runId: string;
    executedAt: string;
    executedAtIst: string | null;
    filesDeleted: number;
    bytesRecovered: number;
    status: 'Success' | 'Partial' | 'Failed' | 'Skipped';
    executionType: 'Automatic' | 'Manual';
    triggeredBy: string;
  } | null;
  pendingCleanup: {
    fileCount: number;
    estimatedBytesToRecover: number;
    protectedFileCount: number;
    protectedBytes: number;
    protectionCheckDegraded: boolean;
  };
  storageRecovered: {
    totalBytesRecovered: number;
    totalFilesDeleted: number;
    totalCleanupRuns: number;
    successfulRuns: number;
    failedRuns: number;
  };
  refreshedAtIso: string;
}

interface AdminStorageFileItem {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  fileType: 'PDF' | 'JPG' | 'JPEG' | 'PNG' | 'WEBP' | 'OTHER';
  mimeType: string | null;
  uploadedAt: string | null;
  storagePath: string;
  status: 'Active' | 'Deleted';
  cleanupEligibility: 'Eligible' | 'Protected' | 'Deleted';
  protectionReason: string | null;
}

interface AdminCleanupHistoryItem {
  id: string;
  executionType: 'Automatic' | 'Manual';
  triggerSource: string;
  startedAt: string;
  completedAt: string | null;
  executedAtIst: string | null;
  durationMs: number;
  filesDeleted: number;
  bytesRecovered: number;
  status: 'Success' | 'Failed' | 'Partial' | 'Skipped';
  rawStatus: string;
  triggeredBy: string;
  errorMessage: string | null;
  totalDiscovered: number;
  totalSkipped: number;
  totalFailed: number;
  bucketsScanned: string[];
  skipSummary: Record<string, number>;
  failureReasons: Array<{ bucket?: string; objectPath?: string; reason?: string }>;
}

interface AdminStorageCronStatus {
  active: boolean;
  verificationSource: 'NODE_CRON_SINGLETON' | 'SUPABASE_PG_CRON' | 'BOTH' | 'INACTIVE';
  cronExpression: string;
  timezone: string;
  utcCronExpression: string;
  utcEquivalent: string;
  scheduledTimeLabel: string;
  registeredAtIso: string | null;
  nextScheduledExecutionIso: string;
  nextScheduledExecutionIst: string;
  currentlyRunning: boolean;
  serviceRoleConfigured: boolean;
  bucketName: string;
  bucketVisibility: 'Private' | 'Public' | 'Unknown';
  warning: string | null;
  lastExecution: {
    runId: string;
    startedAt: string;
    completedAt: string | null;
    executedAtIst: string | null;
    status: 'Success' | 'Failed' | 'Partial' | 'Skipped';
    rawStatus: string;
    filesDeleted: number;
    bytesRecovered: number;
    totalDiscovered: number;
    totalSkipped: number;
    totalFailed: number;
    errorMessage: string | null;
    triggeredBy: string;
    executionType: 'Automatic' | 'Manual';
  } | null;
  pgCronAvailable: boolean;
  pgCronJobs: Array<{
    jobId: number;
    jobName: string | null;
    schedule: string;
    active: boolean;
  }>;
}

interface ToastState {
  type: 'success' | 'error' | 'warning';
  title: string;
  description: string;
}

function formatBytes(bytes: number): string {
  const safe = Number(bytes) || 0;
  if (safe <= 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(safe) / Math.log(k)));
  const value = safe / Math.pow(k, i);
  const decimals = i === 0 ? 0 : value >= 100 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[i]}`;
}

function formatStorageCardBytes(bytes: number): string {
  const safe = Number(bytes) || 0;
  if (safe <= 0) return '0 MB';
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  if (safe >= gb) {
    return `${(safe / gb).toFixed(2)} GB`;
  }
  if (safe >= mb) {
    return `${(safe / mb).toFixed(2)} MB`;
  }
  return formatBytes(safe);
}

function formatIstDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })} IST`;
}

function formatDuration(ms: number): string {
  const safe = Number(ms) || 0;
  if (safe < 1000) return `${safe} ms`;
  return `${(safe / 1000).toFixed(2)} s`;
}

function formatVerificationSource(source: AdminStorageCronStatus['verificationSource']): string {
  if (source === 'BOTH') return 'App Scheduler & pg_cron';
  if (source === 'NODE_CRON_SINGLETON') return 'Server Cron Scheduler';
  if (source === 'SUPABASE_PG_CRON') return 'Supabase pg_cron';
  return 'Not Scheduled';
}

function getStatusBadgeClasses(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === 'ACTIVE' || normalized === 'SUCCESS') {
    return 'bg-[#E8F8EC] text-[#008F25] border-[#BBEBC6]';
  }
  if (normalized === 'PARTIAL' || normalized === 'SKIPPED') {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  if (normalized === 'DELETED' || normalized === 'INACTIVE') {
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

export const AdminStorage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'files' | 'history'>('files');

  // Overview & Cron state
  const [overview, setOverview] = useState<AdminStorageOverview | null>(null);
  const [cronStatus, setCronStatus] = useState<AdminStorageCronStatus | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Storage Files table state
  const [files, setFiles] = useState<AdminStorageFileItem[]>([]);
  const [filesTotal, setFilesTotal] = useState(0);
  const [filesPage, setFilesPage] = useState(1);
  const [filesTotalPages, setFilesTotalPages] = useState(1);
  const [fileSearch, setFileSearch] = useState('');
  const [debouncedFileSearch, setDebouncedFileSearch] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('ALL');
  const [fileStatusFilter, setFileStatusFilter] = useState('ACTIVE');
  const [fileSortBy, setFileSortBy] = useState<'uploaded_at' | 'size' | 'name'>('uploaded_at');
  const [fileSortOrder, setFileSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);

  // Cleanup History table state
  const [historyItems, setHistoryItems] = useState<AdminCleanupHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [debouncedHistorySearch, setDebouncedHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('ALL');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Modals & action state
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<AdminCleanupHistoryItem | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFileSearch(fileSearch.trim());
      setFilesPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [fileSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedHistorySearch(historySearch.trim());
      setHistoryPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [historySearch]);

  const fetchOverviewAndCron = useCallback(async (forceRefresh = false) => {
    setIsLoadingOverview(true);
    setOverviewError(null);
    try {
      const qs = forceRefresh ? '?refresh=true' : '';
      const [overviewRes, cronRes] = await Promise.all([
        authenticatedFetch(`/api/admin/storage/overview${qs}`),
        authenticatedFetch('/api/admin/storage/cron-status')
      ]);

      if (!overviewRes.ok) {
        const errBody = await overviewRes.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed to load storage overview (HTTP ${overviewRes.status})`);
      }

      const overviewJson = await overviewRes.json();
      if (overviewJson.success && overviewJson.overview) {
        setOverview(overviewJson.overview);
      } else {
        throw new Error(overviewJson.error || 'Unable to parse storage overview response.');
      }

      if (cronRes.ok) {
        const cronJson = await cronRes.json();
        if (cronJson.success && cronJson.cron) {
          setCronStatus(cronJson.cron);
        }
      }
    } catch (err: any) {
      setOverviewError(err?.message || 'Unable to load Supabase Storage telemetry.');
    } finally {
      setIsLoadingOverview(false);
    }
  }, []);

  const fetchFiles = useCallback(
    async (forceRefresh = false) => {
      setIsLoadingFiles(true);
      setFilesError(null);
      try {
        const params = new URLSearchParams({
          page: String(filesPage),
          pageSize: '20',
          sortBy: fileSortBy,
          sortOrder: fileSortOrder,
          status: fileStatusFilter,
          fileType: fileTypeFilter
        });
        if (debouncedFileSearch) params.set('search', debouncedFileSearch);
        if (forceRefresh) params.set('refresh', 'true');

        const res = await authenticatedFetch(`/api/admin/storage/files?${params.toString()}`);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Failed to load storage files (HTTP ${res.status})`);
        }
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error || 'Failed to load storage files.');
        }
        setFiles(Array.isArray(json.items) ? json.items : []);
        setFilesTotal(Number(json.totalCount) || 0);
        setFilesTotalPages(Math.max(1, Number(json.totalPages) || 1));
      } catch (err: any) {
        setFilesError(err?.message || 'Failed to load storage files.');
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [filesPage, fileSortBy, fileSortOrder, fileStatusFilter, fileTypeFilter, debouncedFileSearch]
  );

  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams({
        page: String(historyPage),
        pageSize: '15',
        executionType: historyTypeFilter,
        status: historyStatusFilter
      });
      if (debouncedHistorySearch) params.set('search', debouncedHistorySearch);
      if (historyDateFrom) params.set('dateFrom', historyDateFrom);
      if (historyDateTo) params.set('dateTo', historyDateTo);

      const res = await authenticatedFetch(`/api/admin/storage/cleanup-history?${params.toString()}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed to load cleanup history (HTTP ${res.status})`);
      }
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to load cleanup history.');
      }
      setHistoryItems(Array.isArray(json.items) ? json.items : []);
      setHistoryTotal(Number(json.totalCount) || 0);
      setHistoryTotalPages(Math.max(1, Number(json.totalPages) || 1));
    } catch (err: any) {
      setHistoryError(err?.message || 'Failed to load cleanup history.');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [historyPage, historyTypeFilter, historyStatusFilter, debouncedHistorySearch, historyDateFrom, historyDateTo]);

  useEffect(() => {
    void fetchOverviewAndCron(false);
  }, [fetchOverviewAndCron]);

  useEffect(() => {
    void fetchFiles(false);
  }, [fetchFiles]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const handleRefreshAll = useCallback(async () => {
    setIsRefreshingAll(true);
    try {
      await Promise.all([fetchOverviewAndCron(true), fetchFiles(true), fetchHistory()]);
    } finally {
      setIsRefreshingAll(false);
    }
  }, [fetchOverviewAndCron, fetchFiles, fetchHistory]);

  const handleManualCleanupConfirm = async () => {
    if (isRunningCleanup) return;
    setIsRunningCleanup(true);
    setToast(null);
    try {
      const res = await authenticatedFetch('/api/admin/storage/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setToast({
          type: 'warning',
          title: 'Cleanup Already In Progress',
          description: data.error || 'Another storage cleanup run is currently executing.'
        });
        setShowCleanupModal(false);
        return;
      }

      if (!res.ok || !data.success) {
        setToast({
          type: 'error',
          title: 'Storage Cleanup Failed',
          description: data.error || data?.result?.error || `Cleanup returned HTTP ${res.status}.`
        });
        setShowCleanupModal(false);
        await Promise.all([fetchOverviewAndCron(true), fetchFiles(true), fetchHistory()]);
        return;
      }

      const deletedCount = Number(data?.result?.totalDeleted ?? data?.purgedCount ?? 0);
      const recovered = Number(data?.result?.reclaimedBytes ?? data?.reclaimedBytes ?? 0);
      const failedCount = Number(data?.result?.totalFailed ?? 0);

      setToast({
        type: failedCount > 0 ? 'warning' : 'success',
        title: failedCount > 0 ? 'Cleanup Completed With Partial Errors' : 'Storage Cleanup Completed',
        description:
          deletedCount > 0
            ? `Permanently deleted ${deletedCount} file${deletedCount === 1 ? '' : 's'} and recovered ${formatBytes(recovered)}.${
                failedCount > 0 ? ` ${failedCount} item(s) could not be removed.` : ''
              }`
            : 'No eligible files needed deletion. All active print job files remain protected.'
      });

      setShowCleanupModal(false);
      await Promise.all([fetchOverviewAndCron(true), fetchFiles(true), fetchHistory()]);
    } catch (err: any) {
      setToast({
        type: 'error',
        title: 'Cleanup Request Failed',
        description: err?.message || 'Unable to execute storage cleanup. Please try again.'
      });
      setShowCleanupModal(false);
    } finally {
      setIsRunningCleanup(false);
    }
  };

  const quotaPercent =
    overview?.configuredQuotaBytes && overview.configuredQuotaBytes > 0
      ? Math.min(100, (overview.totalStorageBytes / overview.configuredQuotaBytes) * 100)
      : null;

  const hasActiveHistoryFilters =
    Boolean(historySearch.trim()) ||
    historyTypeFilter !== 'ALL' ||
    historyStatusFilter !== 'ALL' ||
    Boolean(historyDateFrom) ||
    Boolean(historyDateTo);

  const fileRangeStart = filesTotal === 0 ? 0 : (filesPage - 1) * 20 + 1;
  const fileRangeEnd = Math.min(filesTotal, filesPage * 20);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#080808]">
            Storage Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Real-time Supabase Storage telemetry, file inspection, and automated midnight IST cleanup for the{' '}
            <span className="font-mono font-semibold text-slate-800">
              {overview?.bucket?.name || 'print-documents'}
            </span>{' '}
            bucket.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRefreshAll()}
            disabled={isRefreshingAll || isLoadingOverview}
            className="border-slate-200 hover:border-slate-300 text-slate-700 bg-white gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#00B32D] ${isRefreshingAll ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setShowCleanupModal(true)}
            disabled={isRunningCleanup || cronStatus?.currentlyRunning}
            className="bg-[#00B32D] hover:bg-[#008F25] text-white font-semibold gap-1.5 shadow-2xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isRunningCleanup || cronStatus?.currentlyRunning ? 'Cleanup Running…' : 'Clean Storage Now'}</span>
          </Button>
        </div>
      </div>

      {/* TOAST / ACTION FEEDBACK */}
      {toast && (
        <div
          role="status"
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs ${
            toast.type === 'success'
              ? 'bg-[#E8F8EC] border-[#BBEBC6] text-[#006B1B]'
              : toast.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#008F25] shrink-0 mt-0.5" />
            ) : toast.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">{toast.title}</p>
              <p className="mt-0.5 opacity-90">{toast.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 rounded-md hover:bg-black/5 transition-colors shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* OVERVIEW ERROR STATE */}
      {overviewError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-800">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <div>
              <p className="font-bold">Unable to load Supabase Storage metrics</p>
              <p className="text-[11px] text-rose-700 mt-0.5">{overviewError}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRefreshAll()}
            className="border-rose-300 bg-white hover:bg-rose-100 text-rose-800 font-semibold shrink-0"
          >
            Retry
          </Button>
        </div>
      )}

      {/* 2. SIX REAL-TIME STATISTICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Card 1: Total Files */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Total Files</span>
            <div className="w-8 h-8 rounded-lg bg-[#E8F8EC] text-[#008F25] flex items-center justify-center border border-[#CBEFD3]">
              <Files className="w-4 h-4" />
            </div>
          </div>
          {isLoadingOverview && !overview ? (
            <div className="h-8 w-24 bg-slate-100 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-[#080808] tabular-nums">
              {(overview?.totalFiles ?? 0).toLocaleString('en-IN')}
            </p>
          )}
          <p className="text-xs text-slate-500">
            Active customer files stored in{' '}
            <span className="font-mono text-slate-700">{overview?.bucket?.name || 'print-documents'}</span>
          </p>
        </div>

        {/* Card 2: Total Storage Used */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Total Storage Used</span>
            <div className="w-8 h-8 rounded-lg bg-[#E8F8EC] text-[#008F25] flex items-center justify-center border border-[#CBEFD3]">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          {isLoadingOverview && !overview ? (
            <div className="h-8 w-28 bg-slate-100 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-[#080808] tabular-nums">
              {formatStorageCardBytes(overview?.totalStorageBytes ?? 0)}
            </p>
          )}
          {quotaPercent !== null && overview?.configuredQuotaBytes ? (
            <div className="space-y-1.5">
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#00B32D] h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(quotaPercent > 0 ? 2 : 0, quotaPercent)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 tabular-nums">
                <span>Actual usage: {quotaPercent.toFixed(1)}%</span>
                <span>Configured quota: {formatStorageCardBytes(overview.configuredQuotaBytes)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 tabular-nums">
              Actual bucket usage ({formatBytes(overview?.totalStorageBytes ?? 0)}) · No quota cap configured
            </p>
          )}
        </div>

        {/* Card 3: Storage Bucket */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Storage Bucket</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
              <Lock className="w-4 h-4" />
            </div>
          </div>
          {isLoadingOverview && !overview ? (
            <div className="h-8 w-36 bg-slate-100 rounded animate-pulse" />
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg sm:text-xl font-bold font-mono text-[#080808] truncate">
                {overview?.bucket?.name || 'print-documents'}
              </p>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold shrink-0 ${getStatusBadgeClasses(
                  overview?.bucket?.status || 'Error'
                )}`}
              >
                {overview?.bucket?.status || 'Unknown'}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Visibility:{' '}
              <strong className="font-semibold text-slate-800">{overview?.bucket?.visibility || 'Private'}</strong>
            </span>
            {overview?.bucket?.fileSizeLimitBytes ? (
              <span className="tabular-nums">Max {formatBytes(overview.bucket.fileSizeLimitBytes)}/file</span>
            ) : null}
          </div>
        </div>

        {/* Card 4: Last Cleanup */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Last Cleanup</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          {isLoadingOverview && !overview ? (
            <div className="h-7 w-40 bg-slate-100 rounded animate-pulse" />
          ) : overview?.lastCleanup ? (
            <>
              <p className="text-base sm:text-lg font-bold text-[#080808] tabular-nums leading-snug">
                {formatIstDateTime(overview.lastCleanup.executedAt)}
              </p>
              <p className="text-xs text-slate-500 tabular-nums">
                {overview.lastCleanup.filesDeleted.toLocaleString('en-IN')} file
                {overview.lastCleanup.filesDeleted === 1 ? '' : 's'} deleted ·{' '}
                {formatBytes(overview.lastCleanup.bytesRecovered)} recovered ({overview.lastCleanup.executionType})
              </p>
            </>
          ) : (
            <>
              <p className="text-base sm:text-lg font-bold text-slate-700">No cleanup yet</p>
              <p className="text-xs text-slate-500">No successful cleanup runs recorded in database</p>
            </>
          )}
        </div>

        {/* Card 5: Pending Cleanup */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Pending Cleanup</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
              <Trash2 className="w-4 h-4" />
            </div>
          </div>
          {isLoadingOverview && !overview ? (
            <div className="h-8 w-24 bg-slate-100 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-[#080808] tabular-nums">
              {(overview?.pendingCleanup?.fileCount ?? 0).toLocaleString('en-IN')}
            </p>
          )}
          <p className="text-xs text-slate-500 tabular-nums">
            Est. recoverable: {formatBytes(overview?.pendingCleanup?.estimatedBytesToRecover ?? 0)}
            {(overview?.pendingCleanup?.protectedFileCount ?? 0) > 0
              ? ` · ${overview!.pendingCleanup.protectedFileCount} active print file(s) protected`
              : ''}
          </p>
        </div>

        {/* Card 6: Storage Recovered */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Storage Recovered</span>
            <div className="w-8 h-8 rounded-lg bg-[#E8F8EC] text-[#008F25] flex items-center justify-center border border-[#CBEFD3]">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          {isLoadingOverview && !overview ? (
            <div className="h-8 w-28 bg-slate-100 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-[#080808] tabular-nums">
              {formatBytes(overview?.storageRecovered?.totalBytesRecovered ?? 0)}
            </p>
          )}
          <p className="text-xs text-slate-500 tabular-nums">
            {(overview?.storageRecovered?.totalFilesDeleted ?? 0).toLocaleString('en-IN')} files purged across{' '}
            {(overview?.storageRecovered?.totalCleanupRuns ?? 0).toLocaleString('en-IN')} recorded runs
          </p>
        </div>
      </div>

      {/* 3. AUTOMATIC CLEANUP MONITORING SECTION */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-[#F7F8F7] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="w-4 h-4 text-[#008F25] shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-[#080808]">Automatic Cleanup Monitoring</h2>
              <p className="text-xs text-slate-600">
                Daily midnight cleanup policy (`0 0 * * *` · Asia/Kolkata) for private{' '}
                <span className="font-mono">{cronStatus?.bucketName || 'print-documents'}</span> bucket
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-semibold ${getStatusBadgeClasses(
                cronStatus?.active ? 'Active' : 'Inactive'
              )}`}
            >
              Cron: {cronStatus?.active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-3.5 rounded-lg bg-[#F7F8F7] border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Scheduled Time</p>
              <p className="text-sm font-bold text-[#080808] mt-1">
                {cronStatus?.scheduledTimeLabel || 'Daily at 12:00 AM IST (18:30 UTC)'}
              </p>
              <p className="text-[11px] text-slate-500 font-mono mt-1">
                {cronStatus?.cronExpression || '0 0 * * *'} · {formatVerificationSource(cronStatus?.verificationSource || 'INACTIVE')}
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-[#F7F8F7] border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Next Scheduled Run</p>
              <p className="text-sm font-bold text-[#080808] mt-1 tabular-nums">
                {cronStatus?.nextScheduledExecutionIso
                  ? formatIstDateTime(cronStatus.nextScheduledExecutionIso)
                  : '—'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                No age filter · Active print jobs preserved
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-[#F7F8F7] border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Last Automatic Run</p>
              {cronStatus?.lastExecution ? (
                <>
                  <p className="text-sm font-bold text-[#080808] mt-1 tabular-nums">
                    {formatIstDateTime(cronStatus.lastExecution.startedAt)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getStatusBadgeClasses(
                        cronStatus.lastExecution.status
                      )}`}
                    >
                      {cronStatus.lastExecution.status}
                    </span>
                    <span className="text-[11px] text-slate-500 truncate">{cronStatus.lastExecution.triggeredBy}</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-slate-700 mt-1">Not executed yet</p>
                  <p className="text-[11px] text-slate-500 mt-1">Awaiting next midnight schedule</p>
                </>
              )}
            </div>

            <div className="p-3.5 rounded-lg bg-[#F7F8F7] border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Last Run Impact</p>
              {cronStatus?.lastExecution ? (
                <>
                  <p className="text-sm font-bold text-[#080808] mt-1 tabular-nums">
                    {cronStatus.lastExecution.filesDeleted.toLocaleString('en-IN')} deleted ·{' '}
                    {formatBytes(cronStatus.lastExecution.bytesRecovered)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                    {cronStatus.lastExecution.totalDiscovered} scanned · {cronStatus.lastExecution.totalSkipped} protected
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-slate-700 mt-1 tabular-nums">0 deleted · 0 B</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Credentials: {cronStatus?.serviceRoleConfigured ? 'Configured' : 'Missing Service Role Key'}
                  </p>
                </>
              )}
            </div>
          </div>

          {cronStatus?.warning && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Automatic Cleanup Notice</p>
                <p className="mt-0.5 text-amber-800">{cronStatus.warning}</p>
              </div>
            </div>
          )}

          {cronStatus?.lastExecution?.errorMessage && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-900">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Last Automatic Execution Error Details</p>
                <p className="mt-0.5 font-mono text-[11px] break-all text-rose-800">
                  {cronStatus.lastExecution.errorMessage}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 4. SEGMENTED TAB SWITCHER */}
      <div className="border-b border-slate-200 flex items-center gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('files')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'files'
              ? 'border-[#00B32D] text-[#080808]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Storage Files</span>
          <span className="text-xs font-mono text-slate-500 tabular-nums">({filesTotal.toLocaleString('en-IN')})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-[#00B32D] text-[#080808]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Cleanup History</span>
          <span className="text-xs font-mono text-slate-500 tabular-nums">({historyTotal.toLocaleString('en-IN')})</span>
        </button>
      </div>

      {/* 5. STORAGE FILES MANAGEMENT TABLE */}
      {activeTab === 'files' && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 bg-[#F7F8F7] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#080808]">Storage Files Management</h2>
                <p className="text-xs text-slate-600">
                  Private object metadata in <span className="font-mono">print-documents</span> · Public and signed download URLs are never exposed.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 tabular-nums">
                <span>
                  {filesTotal === 0
                    ? '0 files'
                    : `Showing ${fileRangeStart}–${fileRangeEnd} of ${filesTotal.toLocaleString('en-IN')} files`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchFiles(true)}
                  disabled={isLoadingFiles}
                  className="bg-white border-slate-200 text-slate-700 h-8 px-2.5 gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#00B32D] ${isLoadingFiles ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
              {/* Search by file name */}
              <div className="relative lg:col-span-4">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  placeholder="Search by file name or path..."
                  aria-label="Search storage files"
                  className="w-full pl-9 pr-3 h-9 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00B32D]/20 focus:border-[#00B32D]"
                />
              </div>

              {/* Filter by file type */}
              <div className="lg:col-span-2">
                <select
                  value={fileTypeFilter}
                  onChange={(e) => {
                    setFileTypeFilter(e.target.value);
                    setFilesPage(1);
                  }}
                  aria-label="Filter by file type"
                  className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00B32D]/20 focus:border-[#00B32D]"
                >
                  <option value="ALL">All Types</option>
                  <option value="PDF">PDF</option>
                  <option value="JPG">JPG</option>
                  <option value="JPEG">JPEG</option>
                  <option value="PNG">PNG</option>
                  <option value="WEBP">WEBP</option>
                </select>
              </div>

              {/* Filter by status */}
              <div className="lg:col-span-2">
                <select
                  value={fileStatusFilter}
                  onChange={(e) => {
                    setFileStatusFilter(e.target.value);
                    setFilesPage(1);
                  }}
                  aria-label="Filter by file status"
                  className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00B32D]/20 focus:border-[#00B32D]"
                >
                  <option value="ACTIVE">Status: Active</option>
                  <option value="DELETED">Status: Deleted</option>
                  <option value="ALL">Status: All</option>
                </select>
              </div>

              {/* Sort by */}
              <div className="lg:col-span-2">
                <select
                  value={fileSortBy}
                  onChange={(e) => {
                    setFileSortBy(e.target.value as 'uploaded_at' | 'size' | 'name');
                    setFilesPage(1);
                  }}
                  aria-label="Sort files by"
                  className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00B32D]/20 focus:border-[#00B32D]"
                >
                  <option value="uploaded_at">Sort: Upload Date</option>
                  <option value="size">Sort: File Size</option>
                  <option value="name">Sort: File Name</option>
                </select>
              </div>

              {/* Sort order toggle */}
              <div className="lg:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setFileSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                    setFilesPage(1);
                  }}
                  className="w-full h-9 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                  <span>{fileSortOrder === 'desc' ? 'Descending' : 'Ascending'}</span>
                </button>
              </div>
            </div>
          </div>

          {filesError ? (
            <div className="p-8 text-center space-y-3">
              <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">Unable to load storage files</p>
              <p className="text-xs text-slate-600">{filesError}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchFiles(true)}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-200 bg-white">
                    <TableHead className="font-semibold text-slate-800">File Name</TableHead>
                    <TableHead className="font-semibold text-slate-800">File Size</TableHead>
                    <TableHead className="font-semibold text-slate-800">File Type</TableHead>
                    <TableHead className="font-semibold text-slate-800">Uploaded At</TableHead>
                    <TableHead className="font-semibold text-slate-800">Storage Path</TableHead>
                    <TableHead className="font-semibold text-slate-800 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingFiles ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={`file-skel-${i}`}>
                        <TableCell><div className="h-4 w-44 bg-slate-100 rounded animate-pulse" /></TableCell>
                        <TableCell><div className="h-4 w-16 bg-slate-100 rounded animate-pulse" /></TableCell>
                        <TableCell><div className="h-4 w-12 bg-slate-100 rounded animate-pulse" /></TableCell>
                        <TableCell><div className="h-4 w-32 bg-slate-100 rounded animate-pulse" /></TableCell>
                        <TableCell><div className="h-4 w-56 bg-slate-100 rounded animate-pulse" /></TableCell>
                        <TableCell className="text-right"><div className="h-4 w-16 bg-slate-100 rounded ml-auto animate-pulse" /></TableCell>
                      </TableRow>
                    ))
                  ) : files.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center">
                        <div className="max-w-sm mx-auto space-y-1.5">
                          <Files className="w-6 h-6 text-slate-300 mx-auto" />
                          <p className="text-sm font-semibold text-slate-800">No storage files found</p>
                          <p className="text-xs text-slate-500">
                            {debouncedFileSearch || fileTypeFilter !== 'ALL' || fileStatusFilter !== 'ACTIVE'
                              ? 'Try adjusting your search or filter criteria.'
                              : 'The print-documents bucket currently has no active customer print files.'}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    files.map((file) => (
                      <TableRow key={file.id} className="hover:bg-slate-50/70 transition-colors">
                        <TableCell>
                          <div className="max-w-[260px]">
                            <p className="text-xs font-semibold text-slate-900 truncate" title={file.fileName}>
                              {file.fileName}
                            </p>
                            {file.cleanupEligibility === 'Protected' && (
                              <p className="text-[11px] text-amber-700 mt-0.5 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 shrink-0" />
                                <span className="truncate">Protected from cleanup</span>
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-800 tabular-nums whitespace-nowrap">
                          {formatBytes(file.fileSizeBytes)}
                        </TableCell>
                        <TableCell className="text-xs font-mono font-semibold text-slate-700 whitespace-nowrap">
                          {file.fileType}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {formatIstDateTime(file.uploadedAt)}
                        </TableCell>
                        <TableCell>
                          <p
                            className="text-xs font-mono text-slate-600 max-w-[300px] truncate"
                            title={file.storagePath}
                          >
                            {file.storagePath}
                          </p>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md border text-[11px] font-semibold ${getStatusBadgeClasses(
                              file.status
                            )}`}
                          >
                            {file.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {!filesError && filesTotal > 0 && (
            <div className="px-5 py-3 border-t border-slate-200 bg-[#F7F8F7] flex items-center justify-between text-xs text-slate-600">
              <span className="tabular-nums">
                Page {filesPage} of {filesTotalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilesPage((p) => Math.max(1, p - 1))}
                  disabled={filesPage <= 1 || isLoadingFiles}
                  className="bg-white border-slate-200 h-8 px-2.5 gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilesPage((p) => Math.min(filesTotalPages, p + 1))}
                  disabled={filesPage >= filesTotalPages || isLoadingFiles}
                  className="bg-white border-slate-200 h-8 px-2.5 gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 6. CLEANUP HISTORY SECTION */}
      {activeTab === 'history' && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 bg-[#F7F8F7] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#080808]">Cleanup Execution History</h2>
                <p className="text-xs text-slate-600">
                  Persistent audit log of all automatic midnight IST and manual admin storage cleanups.
                </p>
              </div>
              {hasActiveHistoryFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setHistorySearch('');
                    setHistoryTypeFilter('ALL');
                    setHistoryStatusFilter('ALL');
                    setHistoryDateFrom('');
                    setHistoryDateTo('');
                    setHistoryPage(1);
                  }}
                  className="text-xs font-semibold text-[#008F25] hover:underline self-start sm:self-auto"
                >
                  Clear filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
              <div className="relative lg:col-span-4">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search ID, triggered by, or error..."
                  aria-label="Search cleanup history"
                  className="w-full pl-9 pr-3 h-9 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00B32D]/20 focus:border-[#00B32D]"
                />
              </div>

              <div className="lg:col-span-2">
                <select
                  value={historyTypeFilter}
                  onChange={(e) => {
                    setHistoryTypeFilter(e.target.value);
                    setHistoryPage(1);
                  }}
                  aria-label="Filter by execution type"
                  className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00B32D]/20 focus:border-[#00B32D]"
                >
                  <option value="ALL">All Types</option>
                  <option value="AUTOMATIC">Automatic</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <select
                  value={historyStatusFilter}
                  onChange={(e) => {
                    setHistoryStatusFilter(e.target.value);
                    setHistoryPage(1);
                  }}
                  aria-label="Filter by cleanup status"
                  className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00B32D]/20 focus:border-[#00B32D]"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SUCCESS">Success</option>
                  <option value="PARTIAL">Partial</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <input
                  type="date"
                  value={historyDateFrom}
                  onChange={(e) => {
                    setHistoryDateFrom(e.target.value);
                    setHistoryPage(1);
                  }}
                  aria-label="Filter from date"
                  className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00B32D]/20 focus:border-[#00B32D]"
                />
              </div>

              <div className="lg:col-span-2">
                <input
                  type="date"
                  value={historyDateTo}
                  onChange={(e) => {
                    setHistoryDateTo(e.target.value);
                    setHistoryPage(1);
                  }}
                  aria-label="Filter to date"
                  className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00B32D]/20 focus:border-[#00B32D]"
                />
              </div>
            </div>
          </div>

          {historyError ? (
            <div className="p-8 text-center space-y-3">
              <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">Unable to load cleanup history</p>
              <p className="text-xs text-slate-600">{historyError}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchHistory()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-200 bg-white">
                    <TableHead className="font-semibold text-slate-800">Execution ID</TableHead>
                    <TableHead className="font-semibold text-slate-800">Execution Type</TableHead>
                    <TableHead className="font-semibold text-slate-800">Started At</TableHead>
                    <TableHead className="font-semibold text-slate-800">Completed At</TableHead>
                    <TableHead className="font-semibold text-slate-800">Files Deleted</TableHead>
                    <TableHead className="font-semibold text-slate-800">Space Recovered</TableHead>
                    <TableHead className="font-semibold text-slate-800">Status</TableHead>
                    <TableHead className="font-semibold text-slate-800">Triggered By</TableHead>
                    <TableHead className="font-semibold text-slate-800 text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingHistory ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={`hist-skel-${i}`}>
                        {Array.from({ length: 9 }).map((__, colIdx) => (
                          <TableCell key={colIdx}>
                            <div className="h-4 w-20 bg-slate-100 rounded animate-pulse" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : historyItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center">
                        <div className="max-w-sm mx-auto space-y-1.5">
                          <Clock className="w-6 h-6 text-slate-300 mx-auto" />
                          <p className="text-sm font-semibold text-slate-800">No cleanup history yet</p>
                          <p className="text-xs text-slate-500">
                            {hasActiveHistoryFilters
                              ? 'No cleanup executions match the selected filters.'
                              : 'Cleanup executions will appear here once an automatic midnight run or manual cleanup completes.'}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    historyItems.map((run) => (
                      <TableRow key={run.id} className="hover:bg-slate-50/70 transition-colors">
                        <TableCell className="font-mono text-xs text-slate-800 whitespace-nowrap" title={run.id}>
                          {run.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-slate-800 whitespace-nowrap">
                          {run.executionType}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {formatIstDateTime(run.startedAt)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {formatIstDateTime(run.completedAt)}
                        </TableCell>
                        <TableCell className="text-xs font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {run.filesDeleted.toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-800 tabular-nums whitespace-nowrap">
                          {formatBytes(run.bytesRecovered)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md border text-[11px] font-semibold ${getStatusBadgeClasses(
                              run.status
                            )}`}
                          >
                            {run.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 max-w-[160px] truncate" title={run.triggeredBy}>
                          {run.triggeredBy}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedExecution(run)}
                            className="text-xs font-semibold text-[#008F25] hover:text-[#006B1B] hover:underline"
                          >
                            View
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {!historyError && historyTotal > 0 && (
            <div className="px-5 py-3 border-t border-slate-200 bg-[#F7F8F7] flex items-center justify-between text-xs text-slate-600">
              <span className="tabular-nums">
                Page {historyPage} of {historyTotalPages} ({historyTotal.toLocaleString('en-IN')} total runs)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage <= 1 || isLoadingHistory}
                  className="bg-white border-slate-200 h-8 px-2.5 gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                  disabled={historyPage >= historyTotalPages || isLoadingHistory}
                  className="bg-white border-slate-200 h-8 px-2.5 gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 7. MANUAL CLEANUP CONFIRMATION MODAL */}
      {showCleanupModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cleanup-modal-title"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-lg max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <h3 id="cleanup-modal-title" className="text-base font-bold text-[#080808]">
                  Clean Supabase Storage Now
                </h3>
              </div>
              <button
                type="button"
                disabled={isRunningCleanup}
                onClick={() => setShowCleanupModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                Are you sure you want to clean Supabase Storage? This operation will permanently delete all eligible
                files from the <span className="font-mono font-semibold">print-documents</span> bucket.
              </p>

              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-[#F7F8F7] border border-slate-200">
                <div>
                  <p className="text-[11px] font-medium text-slate-500">Files to Delete</p>
                  <p className="text-lg font-bold text-[#080808] tabular-nums mt-0.5">
                    {(overview?.pendingCleanup?.fileCount ?? 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500">Est. Space to Recover</p>
                  <p className="text-lg font-bold text-[#008F25] tabular-nums mt-0.5">
                    {formatBytes(overview?.pendingCleanup?.estimatedBytesToRecover ?? 0)}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#E8F8EC] border border-[#BBEBC6] text-xs text-[#006B1B] flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#008F25]" />
                <span>
                  Active paid, queued, and printing job files ({overview?.pendingCleanup?.protectedFileCount ?? 0} currently
                  protected) are automatically skipped to prevent disrupting live counter prints.
                </span>
              </div>

              {overview && !overview.bucket.serviceRoleConfigured && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Server-side <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> is currently unset; cleanup
                    execution will fail and log an unconfigured error until configured.
                  </span>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-[#F7F8F7] flex items-center justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                disabled={isRunningCleanup}
                onClick={() => setShowCleanupModal(false)}
                className="bg-white border-slate-200 text-slate-700"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isRunningCleanup}
                onClick={() => void handleManualCleanupConfirm()}
                className="bg-[#00B32D] hover:bg-[#008F25] text-white font-semibold gap-1.5"
              >
                {isRunningCleanup && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isRunningCleanup ? 'Cleaning Storage…' : 'Confirm & Clean Storage'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 8. EXECUTION DETAILS MODAL */}
      {selectedExecution && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="execution-detail-title"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-lg max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#008F25]" />
                <h3 id="execution-detail-title" className="text-base font-bold text-[#080808]">
                  Cleanup Execution Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExecution(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
                aria-label="Close execution details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[#F7F8F7] border border-slate-200/80">
                  <p className="text-[11px] text-slate-500">Execution ID</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5 break-all">{selectedExecution.id}</p>
                </div>
                <div className="p-3 rounded-lg bg-[#F7F8F7] border border-slate-200/80">
                  <p className="text-[11px] text-slate-500">Status & Type</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-md border text-[11px] font-semibold ${getStatusBadgeClasses(
                        selectedExecution.status
                      )}`}
                    >
                      {selectedExecution.status}
                    </span>
                    <span className="font-semibold text-slate-800">{selectedExecution.executionType}</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#F7F8F7] border border-slate-200/80">
                  <p className="text-[11px] text-slate-500">Started At</p>
                  <p className="font-semibold text-slate-900 mt-0.5 tabular-nums">
                    {formatIstDateTime(selectedExecution.startedAt)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-[#F7F8F7] border border-slate-200/80">
                  <p className="text-[11px] text-slate-500">Completed At & Duration</p>
                  <p className="font-semibold text-slate-900 mt-0.5 tabular-nums">
                    {formatIstDateTime(selectedExecution.completedAt)} ({formatDuration(selectedExecution.durationMs)})
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-[#F7F8F7] border border-slate-200/80">
                  <p className="text-[11px] text-slate-500">Triggered By</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{selectedExecution.triggeredBy}</p>
                </div>
                <div className="p-3 rounded-lg bg-[#F7F8F7] border border-slate-200/80">
                  <p className="text-[11px] text-slate-500">Buckets Scanned</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">
                    {selectedExecution.bucketsScanned.length > 0 ? selectedExecution.bucketsScanned.join(', ') : 'None'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="p-3 rounded-lg border border-slate-200">
                  <p className="text-[11px] text-slate-500">Discovered</p>
                  <p className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
                    {selectedExecution.totalDiscovered.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-200">
                  <p className="text-[11px] text-slate-500">Deleted</p>
                  <p className="text-base font-bold text-[#008F25] tabular-nums mt-0.5">
                    {selectedExecution.filesDeleted.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-200">
                  <p className="text-[11px] text-slate-500">Protected / Skipped</p>
                  <p className="text-base font-bold text-slate-800 tabular-nums mt-0.5">
                    {selectedExecution.totalSkipped.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-3 rounded-lg border border-slate-200">
                  <p className="text-[11px] text-slate-500">Space Recovered</p>
                  <p className="text-base font-bold text-[#008F25] tabular-nums mt-0.5">
                    {formatBytes(selectedExecution.bytesRecovered)}
                  </p>
                </div>
              </div>

              {selectedExecution.errorMessage && (
                <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 space-y-1">
                  <p className="font-semibold text-rose-900">Error Log</p>
                  <p className="font-mono text-[11px] text-rose-800 break-all">{selectedExecution.errorMessage}</p>
                </div>
              )}

              {Object.keys(selectedExecution.skipSummary || {}).length > 0 && (
                <div className="p-3.5 rounded-lg bg-[#F7F8F7] border border-slate-200 space-y-2">
                  <p className="font-semibold text-slate-800">Protected / Skipped Summary</p>
                  <div className="space-y-1">
                    {Object.entries(selectedExecution.skipSummary).map(([reason, count]) => (
                      <div key={reason} className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-slate-600">{reason}</span>
                        <span className="font-semibold text-slate-900 tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedExecution.failureReasons.length > 0 && (
                <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 space-y-2">
                  <p className="font-semibold text-rose-900">
                    Per-Object Failure Details ({selectedExecution.failureReasons.length})
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {selectedExecution.failureReasons.map((fail, idx) => (
                      <div key={idx} className="font-mono text-[11px] text-rose-800 break-all">
                        <span className="font-semibold">{fail.objectPath || 'object'}:</span> {fail.reason || 'Failed'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-[#F7F8F7] flex justify-end shrink-0">
              <Button variant="outline" size="sm" onClick={() => setSelectedExecution(null)} className="bg-white">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
