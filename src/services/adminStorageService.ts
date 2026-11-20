/**
 * EasyToPrint — Supabase Storage Management Service (Admin Panel)
 *
 * Provides authoritative, real-time storage telemetry, paginated file inventory,
 * automatic midnight cron monitoring, and persistent cleanup history for the
 * Super Admin Storage Management dashboard.
 *
 * Security & Integrity Guarantees:
 * - Strictly server-side; never exposes SUPABASE_SERVICE_ROLE_KEY.
 * - Never generates or returns public URLs or signed URLs for customer files.
 * - Keeps the `print-documents` bucket private and never alters RLS/bucket visibility.
 * - Excludes Supabase `.emptyFolderPlaceholder` and dot-files from file counts & listings.
 * - Reuses the exact same `classifyStorageObjectForCleanup` + `loadProtectedPrintJobObjects`
 *   rules as the midnight cleanup engine so Pending Cleanup counts match deletion eligibility 1:1.
 */

import crypto from 'node:crypto';
import {
  DEFAULT_STORAGE_BUCKET,
  getStorageProvider,
  type BucketMetadataResult,
  type StorageProvider
} from '../lib/storage/supabaseStorage';
import {
  MIDNIGHT_CLEANUP_CRON_EXPRESSION,
  MIDNIGHT_CLEANUP_TIMEZONE,
  MIDNIGHT_CLEANUP_UTC_EXPRESSION,
  MIDNIGHT_CLEANUP_UTC_LABEL,
  classifyStorageObjectForCleanup,
  computeNextMidnightIstExecution,
  getMidnightCleanupCronStatus,
  loadProtectedPrintJobObjects,
  scanBucketFilesRecursively,
  type DiscoveredStorageObject,
  type ProtectedPrintJobContext,
  type QueryablePool
} from '../lib/storage/midnightCleanupJob';

export type NormalizedFileType = 'PDF' | 'JPG' | 'JPEG' | 'PNG' | 'WEBP' | 'OTHER';

export interface AdminStorageFileItem {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  fileType: NormalizedFileType;
  mimeType: string | null;
  uploadedAt: string | null;
  storagePath: string;
  status: 'Active' | 'Deleted';
  cleanupEligibility: 'Eligible' | 'Protected' | 'Deleted';
  protectionReason: string | null;
}

export interface AdminStorageBucketInfo {
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

export interface AdminStorageOverview {
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

export interface AdminStorageFilesQuery {
  search?: string;
  fileType?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  pageSize?: number;
  refresh?: boolean;
  bucket?: string;
}

export interface AdminStorageFilesResponse {
  items: AdminStorageFileItem[];
  totalCount: number;
  activeCount: number;
  deletedCount: number;
  bucket: string;
  page: number;
  pageSize: number;
  totalPages: number;
  refreshedAtIso: string;
}

export interface AdminCleanupHistoryItem {
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

export interface AdminCleanupHistoryQuery {
  search?: string;
  executionType?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminCleanupHistoryResponse {
  items: AdminCleanupHistoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminStorageCronStatus {
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

interface CachedInventoryEntry {
  fetchedAtMs: number;
  bucketInfo: AdminStorageBucketInfo;
  activeFiles: AdminStorageFileItem[];
  eligibleCount: number;
  eligibleBytes: number;
  protectedCount: number;
  protectedBytes: number;
  protectionCheckDegraded: boolean;
  refreshedAtIso: string;
}

const INVENTORY_CACHE_TTL_MS = 15_000;
const inventoryCache = new Map<string, CachedInventoryEntry>();

export function invalidateAdminStorageCache(bucket?: string): void {
  if (bucket) {
    inventoryCache.delete(bucket);
  } else {
    inventoryCache.clear();
  }
}

export function isPlaceholderOrSystemFile(objectPath: string): boolean {
  const normalized = String(objectPath || '').trim().replace(/^\/+/, '');
  if (!normalized) return true;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return true;
  const baseName = segments[segments.length - 1];
  return baseName === '.emptyFolderPlaceholder' || baseName.startsWith('.');
}

export function detectNormalizedFileType(fileNameOrPath: string, mimeType?: string | null): NormalizedFileType {
  const extMatch = String(fileNameOrPath || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'jpg') return 'JPG';
  if (ext === 'jpeg') return 'JPEG';
  if (ext === 'png') return 'PNG';
  if (ext === 'webp') return 'WEBP';

  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return 'PDF';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'JPEG';
  if (mime === 'image/png') return 'PNG';
  if (mime === 'image/webp') return 'WEBP';
  return 'OTHER';
}

export function mapRawCleanupStatus(rawStatus: string): 'Success' | 'Failed' | 'Partial' | 'Skipped' {
  const upper = String(rawStatus || '').toUpperCase();
  if (upper === 'COMPLETED') return 'Success';
  if (upper === 'COMPLETED_WITH_ERRORS') return 'Partial';
  if (upper === 'SKIPPED_OVERLAP') return 'Skipped';
  return 'Failed';
}

function mapRawExecutionType(rawType?: string | null, triggerSource?: string | null): 'Automatic' | 'Manual' {
  const upperType = String(rawType || '').toUpperCase();
  if (upperType === 'MANUAL') return 'Manual';
  if (upperType === 'AUTOMATIC') return 'Automatic';
  return String(triggerSource || '').toUpperCase() === 'MANUAL_ADMIN' ? 'Manual' : 'Automatic';
}

function resolveConfiguredStorageQuota(): { bytes: number | null; source: 'ENV_CONFIGURED' | null } {
  const bytesRaw = Number(process.env.SUPABASE_STORAGE_QUOTA_BYTES || '');
  if (Number.isFinite(bytesRaw) && bytesRaw > 0) {
    return { bytes: Math.floor(bytesRaw), source: 'ENV_CONFIGURED' };
  }
  const mbRaw = Number(process.env.SUPABASE_STORAGE_QUOTA_MB || '');
  if (Number.isFinite(mbRaw) && mbRaw > 0) {
    return { bytes: Math.floor(mbRaw * 1024 * 1024), source: 'ENV_CONFIGURED' };
  }
  return { bytes: null, source: null };
}

function isUndefinedTableOrColumnError(err: any): boolean {
  const code = String(err?.code || '');
  return code === '42P01' || code === '42703' || code === '3F000';
}

async function fetchBucketMetadataFromPostgres(pool: QueryablePool | null, bucket: string): Promise<BucketMetadataResult> {
  if (!pool) {
    return {
      exists: false,
      name: bucket,
      isPublic: null,
      fileSizeLimitBytes: null,
      allowedMimeTypes: null,
      createdAt: null,
      error: 'Database connection unavailable.'
    };
  }
  try {
    const res = await pool.query(
      `SELECT id, name, public, file_size_limit, allowed_mime_types, created_at
       FROM storage.buckets
       WHERE id = $1 OR name = $1
       LIMIT 1`,
      [bucket]
    );
    const row = res.rows?.[0];
    if (!row) {
      return {
        exists: false,
        name: bucket,
        isPublic: null,
        fileSizeLimitBytes: null,
        allowedMimeTypes: null,
        createdAt: null,
        error: `Bucket '${bucket}' not found in Supabase Storage.`
      };
    }
    return {
      exists: true,
      name: String(row.name || row.id || bucket),
      isPublic: Boolean(row.public),
      fileSizeLimitBytes: row.file_size_limit !== null && row.file_size_limit !== undefined ? Number(row.file_size_limit) : null,
      allowedMimeTypes: Array.isArray(row.allowed_mime_types) ? row.allowed_mime_types : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
    };
  } catch (err: any) {
    return {
      exists: false,
      name: bucket,
      isPublic: null,
      fileSizeLimitBytes: null,
      allowedMimeTypes: null,
      createdAt: null,
      error: err?.message || 'Failed to read Supabase storage.buckets metadata.'
    };
  }
}

async function listBucketObjectsFromPostgres(
  pool: QueryablePool | null,
  bucket: string
): Promise<Array<DiscoveredStorageObject & { mimeType: string | null; id: string | null }>> {
  if (!pool) return [];
  const results: Array<DiscoveredStorageObject & { mimeType: string | null; id: string | null }> = [];
  const pageSize = 500;
  let offset = 0;

  try {
    while (true) {
      const res = await pool.query(
        `SELECT id::text AS id,
                name AS object_path,
                COALESCE(NULLIF(metadata->>'size', '')::bigint, NULLIF(metadata->>'contentLength', '')::bigint, 0) AS size_bytes,
                metadata->>'mimetype' AS mime_type,
                created_at,
                updated_at
         FROM storage.objects
         WHERE bucket_id = $1
         ORDER BY created_at DESC NULLS LAST, name ASC
         LIMIT $2 OFFSET $3`,
        [bucket, pageSize, offset]
      );
      const rows = res.rows || [];
      for (const row of rows) {
        const objectPath = String(row.object_path || '').replace(/^\/+/, '');
        if (!objectPath) continue;
        results.push({
          id: row.id ? String(row.id) : null,
          bucket,
          objectPath,
          sizeBytes: Number(row.size_bytes) || 0,
          mimeType: row.mime_type ? String(row.mime_type) : null,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
        });
      }
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
  } catch (err: any) {
    if (!isUndefinedTableOrColumnError(err)) {
      throw err;
    }
  }

  return results;
}

interface DbFileMetadataEnrichment {
  originalName: string | null;
  mimeType: string | null;
  uploadedAt: string | null;
  sizeBytes: number | null;
}

async function loadDbFileEnrichmentMap(
  pool: QueryablePool | null,
  objectPaths: string[]
): Promise<Map<string, DbFileMetadataEnrichment>> {
  const map = new Map<string, DbFileMetadataEnrichment>();
  if (!pool || objectPaths.length === 0) return map;

  const chunkSize = 250;
  for (let i = 0; i < objectPaths.length; i += chunkSize) {
    const chunk = objectPaths.slice(i, i + chunkSize);

    try {
      const upRes = await pool.query(
        `SELECT object_path, original_name, mime_type, size_bytes, created_at
         FROM public.uploaded_files
         WHERE object_path = ANY($1::text[])`,
        [chunk]
      );
      for (const row of upRes.rows || []) {
        const pathKey = String(row.object_path || '').replace(/^\/+/, '');
        if (!pathKey) continue;
        map.set(pathKey, {
          originalName: row.original_name ? String(row.original_name) : null,
          mimeType: row.mime_type ? String(row.mime_type) : null,
          uploadedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
          sizeBytes: row.size_bytes !== null && row.size_bytes !== undefined ? Number(row.size_bytes) : null
        });
      }
    } catch (err: any) {
      if (!isUndefinedTableOrColumnError(err)) {
        // Non-fatal metadata enrichment failure
      }
    }

    try {
      const stRes = await pool.query(
        `SELECT object_path, original_name, mime_type, size_bytes, created_at
         FROM public.staged_checkout_files
         WHERE object_path = ANY($1::text[])`,
        [chunk]
      );
      for (const row of stRes.rows || []) {
        const pathKey = String(row.object_path || '').replace(/^\/+/, '');
        if (!pathKey || map.has(pathKey)) continue;
        map.set(pathKey, {
          originalName: row.original_name ? String(row.original_name) : null,
          mimeType: row.mime_type ? String(row.mime_type) : null,
          uploadedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
          sizeBytes: row.size_bytes !== null && row.size_bytes !== undefined ? Number(row.size_bytes) : null
        });
      }
    } catch (err: any) {
      if (!isUndefinedTableOrColumnError(err)) {
        // Non-fatal metadata enrichment failure
      }
    }
  }

  return map;
}

function resolveProtectionReasonForFile(
  objectPath: string,
  protectedCtx: ProtectedPrintJobContext | null,
  protectionCheckDegraded: boolean
): { eligible: boolean; reason: string | null } {
  const classification = classifyStorageObjectForCleanup(objectPath);
  if (!classification.eligible) {
    return { eligible: false, reason: classification.reason };
  }

  if (protectionCheckDegraded || !protectedCtx) {
    return { eligible: false, reason: 'PROTECTION_CHECK_UNAVAILABLE' };
  }

  const normalized = objectPath.replace(/^\/+/, '');
  const exactReason = protectedCtx.protectedPaths.get(normalized);
  if (exactReason) {
    return { eligible: false, reason: exactReason };
  }

  if (classification.extractedJobId && protectedCtx.protectedJobIds.has(classification.extractedJobId)) {
    return {
      eligible: false,
      reason: protectedCtx.protectedJobReasons.get(classification.extractedJobId) || 'ACTIVE_PRINT_JOB_PROTECTED'
    };
  }

  if (classification.extractedFileId && protectedCtx.protectedFileIds.has(classification.extractedFileId)) {
    return {
      eligible: false,
      reason: protectedCtx.protectedFileReasons.get(classification.extractedFileId) || 'ACTIVE_PRINT_FILE_PROTECTED'
    };
  }

  return { eligible: true, reason: null };
}

/**
 * Fetches live bucket metadata and complete recursive object inventory for `print-documents`.
 * Uses Supabase Storage API when service-role credentials are configured, and seamlessly falls
 * back to querying Supabase's authoritative `storage.buckets` + `storage.objects` schema when
 * service-role credentials are absent in local dev environments.
 */
export async function getLiveBucketInventory(
  pool: QueryablePool | null,
  storageProvider: StorageProvider = getStorageProvider(),
  options?: { bucket?: string; refresh?: boolean }
): Promise<CachedInventoryEntry> {
  const bucket = (options?.bucket || storageProvider.getPrimaryBucket?.() || DEFAULT_STORAGE_BUCKET || 'print-documents').trim();
  const cached = inventoryCache.get(bucket);
  if (!options?.refresh && cached && Date.now() - cached.fetchedAtMs < INVENTORY_CACHE_TTL_MS) {
    return cached;
  }

  const serviceRoleConfigured = storageProvider.isConfigured();
  let bucketMeta: BucketMetadataResult;
  let rawObjects: Array<DiscoveredStorageObject & { mimeType?: string | null; id?: string | null }> = [];
  let inventorySource: 'SUPABASE_STORAGE_API' | 'SUPABASE_POSTGRES_STORAGE_SCHEMA' = 'SUPABASE_STORAGE_API';

  if (serviceRoleConfigured) {
    inventorySource = 'SUPABASE_STORAGE_API';
    if (typeof storageProvider.getBucketMetadata === 'function') {
      bucketMeta = await storageProvider.getBucketMetadata(bucket);
    } else {
      bucketMeta = await fetchBucketMetadataFromPostgres(pool, bucket);
    }

    const scanRes = await scanBucketFilesRecursively(storageProvider, bucket, 100);
    if (!bucketMeta.exists && scanRes.bucketExists) {
      bucketMeta = {
        ...bucketMeta,
        exists: true,
        isPublic: bucketMeta.isPublic ?? false,
        error: undefined
      };
    }
    rawObjects = scanRes.files;
  } else {
    inventorySource = 'SUPABASE_POSTGRES_STORAGE_SCHEMA';
    bucketMeta = await fetchBucketMetadataFromPostgres(pool, bucket);
    if (bucketMeta.exists) {
      rawObjects = await listBucketObjectsFromPostgres(pool, bucket);
    }
  }

  const realObjects = rawObjects.filter((obj) => !isPlaceholderOrSystemFile(obj.objectPath));

  // Load DB enrichment & active print-job protection context in parallel
  let protectedCtx: ProtectedPrintJobContext | null = null;
  let protectionCheckDegraded = false;

  const [enrichmentMap] = await Promise.all([
    loadDbFileEnrichmentMap(
      pool,
      realObjects.map((o) => o.objectPath)
    ),
    (async () => {
      if (!pool) {
        protectionCheckDegraded = true;
        return;
      }
      try {
        protectedCtx = await loadProtectedPrintJobObjects(pool);
      } catch {
        protectionCheckDegraded = true;
      }
    })()
  ]);

  let eligibleCount = 0;
  let eligibleBytes = 0;
  let protectedCount = 0;
  let protectedBytes = 0;

  const activeFiles: AdminStorageFileItem[] = realObjects.map((obj) => {
    const normalizedPath = obj.objectPath.replace(/^\/+/, '');
    const enriched = enrichmentMap.get(normalizedPath);
    const pathBaseName = normalizedPath.split('/').pop() || normalizedPath;
    const displayFileName = enriched?.originalName || pathBaseName;
    const sizeBytes = obj.sizeBytes > 0 ? obj.sizeBytes : (enriched?.sizeBytes || 0);
    const mimeType = obj.mimeType || enriched?.mimeType || null;
    const uploadedAt = obj.createdAt || enriched?.uploadedAt || obj.updatedAt || null;

    const protection = resolveProtectionReasonForFile(normalizedPath, protectedCtx, protectionCheckDegraded);
    if (protection.eligible) {
      eligibleCount += 1;
      eligibleBytes += sizeBytes;
    } else {
      protectedCount += 1;
      protectedBytes += sizeBytes;
    }

    const stableId =
      obj.id ||
      `obj_${crypto.createHash('sha1').update(`${bucket}/${normalizedPath}`).digest('hex').slice(0, 16)}`;

    return {
      id: stableId,
      fileName: displayFileName,
      fileSizeBytes: sizeBytes,
      fileType: detectNormalizedFileType(displayFileName || pathBaseName, mimeType),
      mimeType,
      uploadedAt,
      storagePath: normalizedPath,
      status: 'Active',
      cleanupEligibility: protection.eligible ? 'Eligible' : 'Protected',
      protectionReason: protection.reason
    };
  });

  const isPrivate = bucketMeta.isPublic === null ? null : !bucketMeta.isPublic;
  const visibility: 'Private' | 'Public' | 'Unknown' =
    isPrivate === true ? 'Private' : isPrivate === false ? 'Public' : 'Unknown';

  const bucketInfo: AdminStorageBucketInfo = {
    name: bucketMeta.name || bucket,
    visibility,
    isPrivate,
    exists: bucketMeta.exists,
    status: bucketMeta.exists ? 'Active' : bucketMeta.error ? 'Error' : 'Not Found',
    serviceRoleConfigured,
    inventorySource,
    fileSizeLimitBytes: bucketMeta.fileSizeLimitBytes,
    allowedMimeTypes: bucketMeta.allowedMimeTypes,
    createdAt: bucketMeta.createdAt,
    ...(bucketMeta.error ? { error: bucketMeta.error } : {})
  };

  const entry: CachedInventoryEntry = {
    fetchedAtMs: Date.now(),
    bucketInfo,
    activeFiles,
    eligibleCount,
    eligibleBytes,
    protectedCount,
    protectedBytes,
    protectionCheckDegraded,
    refreshedAtIso: new Date().toISOString()
  };

  inventoryCache.set(bucket, entry);
  return entry;
}

/**
 * Returns the 6 real-time KPI statistics cards for the Admin Storage Management dashboard.
 */
export async function getAdminStorageOverview(
  pool: QueryablePool | null,
  storageProvider: StorageProvider = getStorageProvider(),
  options?: { bucket?: string; refresh?: boolean }
): Promise<AdminStorageOverview> {
  const inventory = await getLiveBucketInventory(pool, storageProvider, options);
  const totalFiles = inventory.activeFiles.length;
  const totalStorageBytes = inventory.activeFiles.reduce((sum, f) => sum + (Number(f.fileSizeBytes) || 0), 0);
  const quota = resolveConfiguredStorageQuota();

  let lastCleanup: AdminStorageOverview['lastCleanup'] = null;
  let storageRecovered: AdminStorageOverview['storageRecovered'] = {
    totalBytesRecovered: 0,
    totalFilesDeleted: 0,
    totalCleanupRuns: 0,
    successfulRuns: 0,
    failedRuns: 0
  };

  if (pool) {
    try {
      const [aggRes, lastRes] = await Promise.all([
        pool.query(`
          SELECT
            COALESCE(SUM(reclaimed_bytes), 0)::bigint AS total_bytes_recovered,
            COALESCE(SUM(total_deleted), 0)::bigint AS total_files_deleted,
            COUNT(*)::int AS total_runs,
            COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'COMPLETED_WITH_ERRORS'))::int AS successful_runs,
            COUNT(*) FILTER (WHERE status IN ('FAILED', 'SKIPPED_UNCONFIGURED'))::int AS failed_runs
          FROM public.storage_cleanup_runs
        `),
        pool.query(`
          SELECT id::text AS id,
                 trigger_source,
                 execution_type,
                 triggered_by,
                 executed_at_ist,
                 started_at,
                 completed_at,
                 status,
                 total_deleted,
                 reclaimed_bytes
          FROM public.storage_cleanup_runs
          WHERE status IN ('COMPLETED', 'COMPLETED_WITH_ERRORS')
          ORDER BY COALESCE(completed_at, started_at) DESC
          LIMIT 1
        `)
      ]);

      const agg = aggRes.rows?.[0];
      if (agg) {
        storageRecovered = {
          totalBytesRecovered: Number(agg.total_bytes_recovered) || 0,
          totalFilesDeleted: Number(agg.total_files_deleted) || 0,
          totalCleanupRuns: Number(agg.total_runs) || 0,
          successfulRuns: Number(agg.successful_runs) || 0,
          failedRuns: Number(agg.failed_runs) || 0
        };
      }

      const lastRow = lastRes.rows?.[0];
      if (lastRow) {
        const executedAt = lastRow.completed_at || lastRow.started_at;
        lastCleanup = {
          runId: String(lastRow.id),
          executedAt: executedAt ? new Date(executedAt).toISOString() : new Date().toISOString(),
          executedAtIst: lastRow.executed_at_ist ? String(lastRow.executed_at_ist) : null,
          filesDeleted: Number(lastRow.total_deleted) || 0,
          bytesRecovered: Number(lastRow.reclaimed_bytes) || 0,
          status: mapRawCleanupStatus(lastRow.status),
          executionType: mapRawExecutionType(lastRow.execution_type, lastRow.trigger_source),
          triggeredBy: String(lastRow.triggered_by || (lastRow.trigger_source === 'MANUAL_ADMIN' ? 'Admin' : 'Cron'))
        };
      }
    } catch (err: any) {
      if (!isUndefinedTableOrColumnError(err)) {
        throw err;
      }
    }
  }

  return {
    totalFiles,
    totalStorageBytes,
    configuredQuotaBytes: quota.bytes,
    configuredQuotaSource: quota.source,
    bucket: inventory.bucketInfo,
    lastCleanup,
    pendingCleanup: {
      fileCount: inventory.eligibleCount,
      estimatedBytesToRecover: inventory.eligibleBytes,
      protectedFileCount: inventory.protectedCount,
      protectedBytes: inventory.protectedBytes,
      protectionCheckDegraded: inventory.protectionCheckDegraded
    },
    storageRecovered,
    refreshedAtIso: inventory.refreshedAtIso
  };
}

async function listDeletedFileRecords(
  pool: QueryablePool | null,
  activePathsSet: Set<string>
): Promise<AdminStorageFileItem[]> {
  if (!pool) return [];
  const byPath = new Map<string, AdminStorageFileItem>();

  try {
    const upRes = await pool.query(`
      SELECT id::text AS id, original_name, mime_type, size_bytes, object_path, created_at
      FROM public.uploaded_files
      WHERE upload_state = 'DELETED'
        AND object_path IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 500
    `);
    for (const row of upRes.rows || []) {
      const storagePath = String(row.object_path || '').replace(/^\/+/, '');
      if (!storagePath || activePathsSet.has(storagePath) || isPlaceholderOrSystemFile(storagePath)) continue;
      const baseName = storagePath.split('/').pop() || storagePath;
      const fileName = row.original_name ? String(row.original_name) : baseName;
      const mimeType = row.mime_type ? String(row.mime_type) : null;
      byPath.set(storagePath, {
        id: `del_up_${row.id}`,
        fileName,
        fileSizeBytes: Number(row.size_bytes) || 0,
        fileType: detectNormalizedFileType(fileName, mimeType),
        mimeType,
        uploadedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        storagePath,
        status: 'Deleted',
        cleanupEligibility: 'Deleted',
        protectionReason: null
      });
    }
  } catch (err: any) {
    if (!isUndefinedTableOrColumnError(err)) {
      throw err;
    }
  }

  try {
    const stRes = await pool.query(`
      SELECT id::text AS id, original_name, mime_type, size_bytes, object_path, created_at
      FROM public.staged_checkout_files
      WHERE upload_status = 'DELETED'
        AND object_path IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 500
    `);
    for (const row of stRes.rows || []) {
      const storagePath = String(row.object_path || '').replace(/^\/+/, '');
      if (!storagePath || activePathsSet.has(storagePath) || byPath.has(storagePath) || isPlaceholderOrSystemFile(storagePath)) {
        continue;
      }
      const baseName = storagePath.split('/').pop() || storagePath;
      const fileName = row.original_name ? String(row.original_name) : baseName;
      const mimeType = row.mime_type ? String(row.mime_type) : null;
      byPath.set(storagePath, {
        id: `del_st_${row.id}`,
        fileName,
        fileSizeBytes: Number(row.size_bytes) || 0,
        fileType: detectNormalizedFileType(fileName, mimeType),
        mimeType,
        uploadedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        storagePath,
        status: 'Deleted',
        cleanupEligibility: 'Deleted',
        protectionReason: null
      });
    }
  } catch (err: any) {
    if (!isUndefinedTableOrColumnError(err)) {
      throw err;
    }
  }

  return Array.from(byPath.values());
}

/**
 * Lists files in `print-documents` with search, file type filter, status filter,
 * sorting by upload date / file size / file name, and server-side pagination.
 * Strictly never exposes public URLs or signed URLs.
 */
export async function listAdminStorageFiles(
  pool: QueryablePool | null,
  storageProvider: StorageProvider = getStorageProvider(),
  query: AdminStorageFilesQuery = {}
): Promise<AdminStorageFilesResponse> {
  const inventory = await getLiveBucketInventory(pool, storageProvider, {
    bucket: query.bucket,
    refresh: query.refresh
  });

  const statusFilter = String(query.status || 'ACTIVE').toUpperCase();
  const activePathsSet = new Set(inventory.activeFiles.map((f) => f.storagePath));
  const deletedFiles =
    statusFilter === 'DELETED' || statusFilter === 'ALL'
      ? await listDeletedFileRecords(pool, activePathsSet)
      : [];

  let combined: AdminStorageFileItem[];
  if (statusFilter === 'DELETED') {
    combined = [...deletedFiles];
  } else if (statusFilter === 'ALL') {
    combined = [...inventory.activeFiles, ...deletedFiles];
  } else {
    combined = [...inventory.activeFiles];
  }

  const search = String(query.search || '').trim().toLowerCase();
  if (search) {
    combined = combined.filter(
      (item) =>
        item.fileName.toLowerCase().includes(search) ||
        item.storagePath.toLowerCase().includes(search)
    );
  }

  const fileTypeFilter = String(query.fileType || 'ALL').trim().toUpperCase();
  if (fileTypeFilter && fileTypeFilter !== 'ALL') {
    combined = combined.filter((item) => {
      if (fileTypeFilter === 'JPG' || fileTypeFilter === 'JPEG') {
        return item.fileType === 'JPG' || item.fileType === 'JPEG';
      }
      return item.fileType === fileTypeFilter;
    });
  }

  const sortBy = String(query.sortBy || 'uploaded_at').toLowerCase();
  const sortOrder = String(query.sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1;

  combined.sort((a, b) => {
    if (sortBy === 'size' || sortBy === 'file_size') {
      return (a.fileSizeBytes - b.fileSizeBytes) * sortOrder;
    }
    if (sortBy === 'name' || sortBy === 'file_name') {
      return a.fileName.localeCompare(b.fileName) * sortOrder;
    }
    const timeA = a.uploadedAt ? Date.parse(a.uploadedAt) || 0 : 0;
    const timeB = b.uploadedAt ? Date.parse(b.uploadedAt) || 0 : 0;
    return (timeA - timeB) * sortOrder;
  });

  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(query.pageSize) || 20)));
  const totalCount = combined.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.max(1, Math.min(totalPages, Math.floor(Number(query.page) || 1)));
  const startIdx = (page - 1) * pageSize;

  return {
    items: combined.slice(startIdx, startIdx + pageSize),
    totalCount,
    activeCount: inventory.activeFiles.length,
    deletedCount: deletedFiles.length,
    bucket: inventory.bucketInfo.name,
    page,
    pageSize,
    totalPages,
    refreshedAtIso: inventory.refreshedAtIso
  };
}

function parseIsoOrDateInput(raw?: string): string | null {
  const val = String(raw || '').trim();
  if (!val) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val;
  }
  const parsed = Date.parse(val);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

/**
 * Lists persistent cleanup history from `public.storage_cleanup_runs` with
 * parameterized filtering (date range, search, execution type, status) and pagination.
 */
export async function listAdminCleanupHistory(
  pool: QueryablePool | null,
  query: AdminCleanupHistoryQuery = {}
): Promise<AdminCleanupHistoryResponse> {
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(query.pageSize) || 15)));
  const requestedPage = Math.max(1, Math.floor(Number(query.page) || 1));

  if (!pool) {
    return { items: [], totalCount: 0, page: 1, pageSize, totalPages: 1 };
  }

  const conditions: string[] = [];
  const params: any[] = [];

  const executionType = String(query.executionType || 'ALL').trim().toUpperCase();
  if (executionType === 'MANUAL') {
    conditions.push(`COALESCE(execution_type, CASE WHEN trigger_source = 'MANUAL_ADMIN' THEN 'MANUAL' ELSE 'AUTOMATIC' END) = 'MANUAL'`);
  } else if (executionType === 'AUTOMATIC') {
    conditions.push(`COALESCE(execution_type, CASE WHEN trigger_source = 'MANUAL_ADMIN' THEN 'MANUAL' ELSE 'AUTOMATIC' END) = 'AUTOMATIC'`);
  }

  const statusFilter = String(query.status || 'ALL').trim().toUpperCase();
  if (statusFilter === 'SUCCESS') {
    conditions.push(`status = 'COMPLETED'`);
  } else if (statusFilter === 'PARTIAL') {
    conditions.push(`status = 'COMPLETED_WITH_ERRORS'`);
  } else if (statusFilter === 'FAILED') {
    conditions.push(`status IN ('FAILED', 'SKIPPED_UNCONFIGURED')`);
  } else if (statusFilter === 'SKIPPED') {
    conditions.push(`status = 'SKIPPED_OVERLAP'`);
  }

  const dateFrom = parseIsoOrDateInput(query.dateFrom);
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`started_at >= $${params.length}::timestamptz`);
  }

  const dateTo = parseIsoOrDateInput(query.dateTo);
  if (dateTo) {
    params.push(dateTo);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      conditions.push(`started_at < ($${params.length}::date + INTERVAL '1 day')`);
    } else {
      conditions.push(`started_at <= $${params.length}::timestamptz`);
    }
  }

  const search = String(query.search || '').trim();
  if (search) {
    params.push(`%${search}%`);
    const p = `$${params.length}`;
    conditions.push(
      `(id::text ILIKE ${p} OR COALESCE(triggered_by, '') ILIKE ${p} OR COALESCE(trigger_source, '') ILIKE ${p} OR COALESCE(executed_at_ist, '') ILIKE ${p} OR COALESCE(error_message, '') ILIKE ${p} OR status ILIKE ${p})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM public.storage_cleanup_runs ${whereClause}`,
      params
    );
    const totalCount = Number(countRes.rows?.[0]?.total) || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;

    const listParams = [...params, pageSize, offset];
    const rowsRes = await pool.query(
      `SELECT id::text AS id,
              trigger_source,
              COALESCE(execution_type, CASE WHEN trigger_source = 'MANUAL_ADMIN' THEN 'MANUAL' ELSE 'AUTOMATIC' END) AS execution_type,
              COALESCE(triggered_by, CASE WHEN trigger_source = 'MANUAL_ADMIN' THEN 'Admin' WHEN trigger_source = 'AUTHENTICATED_CRON_HTTP' THEN 'Cron (HTTP)' ELSE 'Cron' END) AS triggered_by,
              executed_at_ist,
              started_at,
              completed_at,
              duration_ms,
              status,
              buckets_scanned,
              total_discovered,
              total_deleted,
              total_skipped,
              total_failed,
              reclaimed_bytes,
              skip_summary,
              failure_reasons,
              error_message
       FROM public.storage_cleanup_runs
       ${whereClause}
       ORDER BY started_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );

    const items: AdminCleanupHistoryItem[] = (rowsRes.rows || []).map((row: any) => {
      const failureReasons = Array.isArray(row.failure_reasons) ? row.failure_reasons : [];
      const derivedError =
        row.error_message ||
        (failureReasons.length > 0
          ? failureReasons
              .slice(0, 3)
              .map((f: any) => `${f.objectPath || 'object'}: ${f.reason || 'Failed'}`)
              .join(' | ')
          : null);

      return {
        id: String(row.id),
        executionType: mapRawExecutionType(row.execution_type, row.trigger_source),
        triggerSource: String(row.trigger_source || 'SCHEDULED_CRON'),
        startedAt: row.started_at ? new Date(row.started_at).toISOString() : new Date().toISOString(),
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
        executedAtIst: row.executed_at_ist ? String(row.executed_at_ist) : null,
        durationMs: Number(row.duration_ms) || 0,
        filesDeleted: Number(row.total_deleted) || 0,
        bytesRecovered: Number(row.reclaimed_bytes) || 0,
        status: mapRawCleanupStatus(row.status),
        rawStatus: String(row.status || 'UNKNOWN'),
        triggeredBy: String(row.triggered_by || 'Cron'),
        errorMessage: derivedError ? String(derivedError) : null,
        totalDiscovered: Number(row.total_discovered) || 0,
        totalSkipped: Number(row.total_skipped) || 0,
        totalFailed: Number(row.total_failed) || 0,
        bucketsScanned: Array.isArray(row.buckets_scanned) ? row.buckets_scanned.map(String) : [],
        skipSummary: row.skip_summary && typeof row.skip_summary === 'object' ? row.skip_summary : {},
        failureReasons
      };
    });

    return {
      items,
      totalCount,
      page,
      pageSize,
      totalPages
    };
  } catch (err: any) {
    if (isUndefinedTableOrColumnError(err)) {
      return { items: [], totalCount: 0, page: 1, pageSize, totalPages: 1 };
    }
    throw err;
  }
}

/**
 * Verifies the actual automatic midnight IST cleanup cron configuration,
 * checks both the singleton in-process node-cron task and Supabase pg_cron (if enabled),
 * and loads the latest automatic execution record from PostgreSQL.
 */
export async function getAdminStorageCronStatus(
  pool: QueryablePool | null,
  storageProvider: StorageProvider = getStorageProvider()
): Promise<AdminStorageCronStatus> {
  const inProcessCron = getMidnightCleanupCronStatus();
  const nextRun = computeNextMidnightIstExecution();
  const bucketName = storageProvider.getPrimaryBucket?.() || DEFAULT_STORAGE_BUCKET || 'print-documents';
  const serviceRoleConfigured = storageProvider.isConfigured();

  let bucketVisibility: 'Private' | 'Public' | 'Unknown' = 'Unknown';
  try {
    const meta = serviceRoleConfigured && typeof storageProvider.getBucketMetadata === 'function'
      ? await storageProvider.getBucketMetadata(bucketName)
      : await fetchBucketMetadataFromPostgres(pool, bucketName);
    if (meta.isPublic === false) bucketVisibility = 'Private';
    else if (meta.isPublic === true) bucketVisibility = 'Public';
  } catch {
    bucketVisibility = 'Unknown';
  }

  let pgCronAvailable = false;
  const pgCronJobs: AdminStorageCronStatus['pgCronJobs'] = [];
  if (pool) {
    try {
      const pgCronRes = await pool.query(`
        SELECT jobid, jobname, schedule, active
        FROM cron.job
        WHERE command ILIKE '%storage%' OR jobname ILIKE '%cleanup%' OR jobname ILIKE '%storage%'
        ORDER BY jobid ASC
      `);
      pgCronAvailable = true;
      for (const row of pgCronRes.rows || []) {
        pgCronJobs.push({
          jobId: Number(row.jobid),
          jobName: row.jobname ? String(row.jobname) : null,
          schedule: String(row.schedule || ''),
          active: Boolean(row.active)
        });
      }
    } catch {
      pgCronAvailable = false;
    }
  }

  const hasActivePgCron = pgCronJobs.some((j) => j.active);
  const active = Boolean(inProcessCron.active) || hasActivePgCron;
  const verificationSource: AdminStorageCronStatus['verificationSource'] =
    inProcessCron.active && hasActivePgCron
      ? 'BOTH'
      : inProcessCron.active
        ? 'NODE_CRON_SINGLETON'
        : hasActivePgCron
          ? 'SUPABASE_PG_CRON'
          : 'INACTIVE';

  let lastExecution: AdminStorageCronStatus['lastExecution'] = null;
  if (pool) {
    try {
      const lastAutoRes = await pool.query(`
        SELECT id::text AS id,
               trigger_source,
               COALESCE(execution_type, CASE WHEN trigger_source = 'MANUAL_ADMIN' THEN 'MANUAL' ELSE 'AUTOMATIC' END) AS execution_type,
               COALESCE(triggered_by, CASE WHEN trigger_source = 'MANUAL_ADMIN' THEN 'Admin' WHEN trigger_source = 'AUTHENTICATED_CRON_HTTP' THEN 'Cron (HTTP)' ELSE 'Cron' END) AS triggered_by,
               executed_at_ist,
               started_at,
               completed_at,
               status,
               total_discovered,
               total_deleted,
               total_skipped,
               total_failed,
               reclaimed_bytes,
               failure_reasons,
               error_message
        FROM public.storage_cleanup_runs
        WHERE COALESCE(execution_type, CASE WHEN trigger_source = 'MANUAL_ADMIN' THEN 'MANUAL' ELSE 'AUTOMATIC' END) = 'AUTOMATIC'
        ORDER BY started_at DESC
        LIMIT 1
      `);
      const row = lastAutoRes.rows?.[0];
      if (row) {
        const failureReasons = Array.isArray(row.failure_reasons) ? row.failure_reasons : [];
        const derivedError =
          row.error_message ||
          (failureReasons.length > 0
            ? failureReasons.slice(0, 3).map((f: any) => `${f.objectPath || 'object'}: ${f.reason || 'Failed'}`).join(' | ')
            : null);

        lastExecution = {
          runId: String(row.id),
          startedAt: row.started_at ? new Date(row.started_at).toISOString() : new Date().toISOString(),
          completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
          executedAtIst: row.executed_at_ist ? String(row.executed_at_ist) : null,
          status: mapRawCleanupStatus(row.status),
          rawStatus: String(row.status),
          filesDeleted: Number(row.total_deleted) || 0,
          bytesRecovered: Number(row.reclaimed_bytes) || 0,
          totalDiscovered: Number(row.total_discovered) || 0,
          totalSkipped: Number(row.total_skipped) || 0,
          totalFailed: Number(row.total_failed) || 0,
          errorMessage: derivedError ? String(derivedError) : null,
          triggeredBy: String(row.triggered_by || 'Cron'),
          executionType: 'Automatic'
        };
      }
    } catch (err: any) {
      if (!isUndefinedTableOrColumnError(err)) {
        throw err;
      }
    }
  }

  let warning: string | null = null;
  if (!serviceRoleConfigured) {
    warning =
      'SUPABASE_SERVICE_ROLE_KEY is not configured in the server environment. Scheduled and manual deletions require server-side service-role credentials.';
  } else if (!active) {
    warning = 'Automatic midnight cleanup scheduler is currently inactive.';
  } else if (lastExecution && lastExecution.status === 'Failed') {
    warning = lastExecution.errorMessage || 'The most recent automatic cleanup run failed.';
  }

  return {
    active,
    verificationSource,
    cronExpression: inProcessCron.cronExpression || MIDNIGHT_CLEANUP_CRON_EXPRESSION,
    timezone: inProcessCron.timezone || MIDNIGHT_CLEANUP_TIMEZONE,
    utcCronExpression: inProcessCron.utcCronExpression || MIDNIGHT_CLEANUP_UTC_EXPRESSION,
    utcEquivalent: inProcessCron.utcEquivalent || MIDNIGHT_CLEANUP_UTC_LABEL,
    scheduledTimeLabel: 'Daily at 12:00 AM IST (18:30 UTC)',
    registeredAtIso: inProcessCron.registeredAtIso || null,
    nextScheduledExecutionIso: nextRun.iso,
    nextScheduledExecutionIst: nextRun.ist,
    currentlyRunning: Boolean(inProcessCron.currentlyRunning),
    serviceRoleConfigured,
    bucketName,
    bucketVisibility,
    warning,
    lastExecution,
    pgCronAvailable,
    pgCronJobs
  };
}
