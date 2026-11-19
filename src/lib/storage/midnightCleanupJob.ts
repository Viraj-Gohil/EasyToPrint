/**
 * EasyToPrint — Daily Midnight IST Supabase Storage Auto-Cleanup Engine
 *
 * Schedule Specification:
 * - Exactly ONE scheduled cron job.
 * - Cron expression: `0 0 * * *`
 * - Timezone: `Asia/Kolkata` (IST, UTC+05:30)
 * - Equivalent UTC execution time: 18:30 UTC on the previous day (`30 18 * * *` UTC)
 *
 * Safety & Consistency Guarantees:
 * 1. Scans designated temporary customer print buckets recursively with full pagination.
 * 2. Deletes ALL eligible customer-uploaded print files regardless of upload date (no 12h/24h filter).
 * 3. Strict Storage Safety: Never deletes assets, avatars/profiles, logos, invoices, receipts,
 *    backups, system files, templates, or any object outside designated customer print job paths.
 * 4. Print Job Safety: Queries PostgreSQL before deletion and preserves files needed by
 *    paid orders waiting for dispatch, queued/printing/spooler jobs, and active recovery/retry flows.
 *    Fails closed (deletes nothing) if PostgreSQL protection lookup fails.
 * 5. Database Consistency: Updates only file metadata (`uploaded_files`, `staged_checkout_files`)
 *    for confirmed deleted or already-missing objects; never marks failed deletions as deleted;
 *    never deletes or modifies orders, payments, invoices, or print job history.
 * 6. Overlap Prevention: Enforces both an in-process mutex and a PostgreSQL session advisory lock.
 */

import crypto from 'node:crypto';
import cron, { type ScheduledTask } from 'node-cron';
import type { Pool, PoolClient } from 'pg';
import {
  DEFAULT_STORAGE_BUCKET,
  getStorageProvider,
  type StorageProvider
} from './supabaseStorage';
import { logger, deepRedact } from '../security';

export const MIDNIGHT_CLEANUP_CRON_EXPRESSION = '0 0 * * *';
export const MIDNIGHT_CLEANUP_TIMEZONE = 'Asia/Kolkata';
export const MIDNIGHT_CLEANUP_UTC_EXPRESSION = '30 18 * * *';
export const MIDNIGHT_CLEANUP_UTC_LABEL = '18:30 UTC (previous day)';
export const MIDNIGHT_CLEANUP_ADVISORY_LOCK_KEY = 884210099;

export const ACTIVE_PROTECTED_PRINT_STATUSES = [
  'QUEUED',
  'ASSIGNED',
  'DOWNLOADING',
  'PRINTING',
  'SUBMITTED_TO_SPOOLER',
  'AWAITING_RECONCILIATION',
  'REQUIRES_ATTENTION',
  'PRINT_INTERRUPTED',
  'PAUSED'
] as const;

export const TERMINAL_PRINT_STATUSES = ['COMPLETED', 'CANCELLED'] as const;

const PROTECTED_PATH_SEGMENTS = new Set([
  'asset',
  'assets',
  'avatar',
  'avatars',
  'profile',
  'profiles',
  'logo',
  'logos',
  'brand',
  'branding',
  'invoice',
  'invoices',
  'receipt',
  'receipts',
  'backup',
  'backups',
  'db-backup',
  'db-backups',
  'database-backups',
  'system',
  'permanent',
  'static',
  'template',
  'templates',
  'public'
]);

/**
 * Valid customer-uploaded temporary print document path patterns:
 * - shops/{shopId}/jobs/{jobOrSessionId}/files/{fileId}.{ext}
 * - shops/{shopId}/{DD}-{MM}-{YYYY}/jobs/{jobOrSessionId}/{fileId}.{ext}
 */
const CUSTOMER_PRINT_PATH_REGEXES = [
  /^shops\/[^/]+\/jobs\/[^/]+\/.+$/i,
  /^shops\/[^/]+\/\d{2}-\d{2}-\d{4}\/jobs\/[^/]+\/.+$/i
];

export type CleanupTriggerSource = 'SCHEDULED_CRON' | 'AUTHENTICATED_CRON_HTTP' | 'MANUAL_ADMIN' | 'TEST';

export interface QueryablePool {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
  connect?: () => Promise<PoolClient>;
}

export interface DiscoveredStorageObject {
  bucket: string;
  objectPath: string;
  sizeBytes: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProtectedPrintJobContext {
  protectedPaths: Map<string, string>;
  protectedJobIds: Set<string>;
  protectedJobReasons: Map<string, string>;
  protectedFileIds: Set<string>;
  protectedFileReasons: Map<string, string>;
}

export interface StorageClassificationResult {
  eligible: boolean;
  reason: string;
  extractedJobId?: string;
  extractedFileId?: string;
}

export interface SkippedObjectDetail {
  bucket: string;
  objectPath: string;
  reason: string;
}

export interface CleanupFailureDetail {
  bucket: string;
  objectPath: string;
  reason: string;
}

export interface MidnightCleanupExecutionResult {
  runId: string;
  triggerSource: CleanupTriggerSource;
  cronExpression: string;
  timezone: string;
  utcEquivalent: string;
  status: 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'SKIPPED_OVERLAP' | 'SKIPPED_UNCONFIGURED' | 'FAILED';
  executedAtIst: string;
  startedAtIso: string;
  completedAtIso: string;
  durationMs: number;
  bucketsScanned: string[];
  bucketsSkippedMissing: string[];
  totalDiscovered: number;
  totalEligible: number;
  totalDeleted: number;
  totalAlreadyMissing: number;
  totalSkipped: number;
  totalFailed: number;
  reclaimedBytes: number;
  dbUploadedFilesUpdated: number;
  dbStagedFilesUpdated: number;
  skipSummary: Record<string, number>;
  skippedSamples: SkippedObjectDetail[];
  failureReasons: CleanupFailureDetail[];
  error?: string;
}

export interface ExecuteMidnightCleanupOptions {
  triggerSource?: CleanupTriggerSource;
  storageProvider?: StorageProvider;
  pool?: QueryablePool | null;
  buckets?: string[];
  pageSize?: number;
  batchSize?: number;
  /**
   * Used only by unit tests that explicitly inject a custom protected context without a live DB.
   * Production code always queries PostgreSQL and fails closed on DB error.
   */
  protectedContextOverride?: ProtectedPrintJobContext;
  /**
   * When true, skips PostgreSQL advisory lock & DB queries (only for offline storage-only unit tests
   * that supply `protectedContextOverride`). Defaults to false.
   */
  allowNoDatabase?: boolean;
}

export interface CronRegistrationResult {
  registered: boolean;
  alreadyRegistered: boolean;
  cronExpression: string;
  timezone: string;
  utcEquivalent: string;
}

let inProcessCleanupRunning = false;
let singletonMidnightCronTask: ScheduledTask | null = null;
let singletonCronRegisteredAtIso: string | null = null;
let lastCleanupSummary: MidnightCleanupExecutionResult | null = null;

/**
 * Formats a Date into an unambiguous Asia/Kolkata (IST) timestamp: `YYYY-MM-DD HH:mm:ss IST`.
 */
export function formatIstTimestamp(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: MIDNIGHT_CLEANUP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const hourRaw = get('hour');
  const hour = hourRaw === '24' ? '00' : hourRaw;
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')} IST`;
}

/**
 * Resolves the explicit list of Supabase Storage buckets designated for temporary
 * customer-uploaded print files. Never scans arbitrary unknown buckets.
 */
export function getDesignatedPrintCleanupBuckets(storageProvider?: StorageProvider): string[] {
  const configuredEnv = (process.env.SUPABASE_CLEANUP_BUCKETS || '').trim();
  if (configuredEnv) {
    const parsed = configuredEnv
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (parsed.length > 0) {
      return Array.from(new Set(parsed));
    }
  }

  const primary = storageProvider?.getPrimaryBucket?.() || DEFAULT_STORAGE_BUCKET || 'print-documents';
  // Include legacy fallback bucket ('user-files') used by earlier PrintFlow uploads if it exists.
  return Array.from(new Set([primary, 'user-files'].filter(Boolean)));
}

/**
 * Extracts job/session ID and file ID stem from a valid customer print upload path.
 */
export function extractPrintPathIdentifiers(objectPath: string): { jobId?: string; fileId?: string } {
  const normalized = objectPath.replace(/^\/+/, '');
  // Pattern 1: shops/{shopId}/jobs/{jobId}/files/{fileId}.{ext}
  const modernMatch = normalized.match(/^shops\/[^/]+\/jobs\/([^/]+)\/files\/([^/]+)$/i);
  if (modernMatch) {
    const rawFile = modernMatch[2];
    const fileId = rawFile.replace(/\.[^.]+$/, '');
    return { jobId: modernMatch[1], fileId };
  }

  // Pattern 2: shops/{shopId}/{DD}-{MM}-{YYYY}/jobs/{jobId}/{fileId}.{ext}
  const datedMatch = normalized.match(/^shops\/[^/]+\/\d{2}-\d{2}-\d{4}\/jobs\/([^/]+)\/([^/]+)$/i);
  if (datedMatch) {
    const rawFile = datedMatch[2];
    const fileId = rawFile.replace(/\.[^.]+$/, '');
    return { jobId: datedMatch[1], fileId };
  }

  // Fallback for deeper nested files inside a job folder: shops/{shopId}/.../jobs/{jobId}/.../{fileName}
  const genericJobMatch = normalized.match(/^shops\/[^/]+(?:\/\d{2}-\d{2}-\d{4})?\/jobs\/([^/]+)\/(.+)$/i);
  if (genericJobMatch) {
    const tail = genericJobMatch[2].split('/').pop() || '';
    const fileId = tail.replace(/\.[^.]+$/, '');
    return { jobId: genericJobMatch[1], fileId: fileId || undefined };
  }

  return {};
}

/**
 * Strict Storage Safety Classifier.
 * Only customer-uploaded temporary print documents under designated `shops/.../jobs/...`
 * paths are eligible. Permanent assets, avatars, logos, invoices, receipts, backups,
 * templates, and system files are strictly excluded.
 */
export function classifyStorageObjectForCleanup(objectPath: string): StorageClassificationResult {
  const raw = String(objectPath || '').trim();
  if (!raw) {
    return { eligible: false, reason: 'PROTECTED_EMPTY_PATH' };
  }

  const normalized = raw.replace(/^\/+/, '');
  if (normalized.includes('..') || normalized.includes('\\')) {
    return { eligible: false, reason: 'PROTECTED_INVALID_PATH' };
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) {
    return { eligible: false, reason: 'PROTECTED_EMPTY_PATH' };
  }

  const fileName = segments[segments.length - 1];
  if (fileName === '.emptyFolderPlaceholder' || fileName.startsWith('.')) {
    return { eligible: false, reason: 'PROTECTED_SYSTEM_PLACEHOLDER' };
  }

  // Defense-in-depth: block any protected segment anywhere in the path
  for (let i = 0; i < segments.length; i++) {
    const lowerSeg = segments[i].toLowerCase();
    if (PROTECTED_PATH_SEGMENTS.has(lowerSeg)) {
      return { eligible: false, reason: `PROTECTED_STORAGE_ASSET_${lowerSeg.toUpperCase()}` };
    }
  }

  // Strict allowlist: must match customer temporary print upload directory layout
  const matchesAllowedPrefix = CUSTOMER_PRINT_PATH_REGEXES.some((regex) => regex.test(normalized));
  if (!matchesAllowedPrefix) {
    return { eligible: false, reason: 'PROTECTED_NON_PRINT_DOCUMENT_PATH' };
  }

  const { jobId, fileId } = extractPrintPathIdentifiers(normalized);
  return {
    eligible: true,
    reason: 'ELIGIBLE_CUSTOMER_PRINT_FILE',
    extractedJobId: jobId,
    extractedFileId: fileId
  };
}

/**
 * Recursively scans an entire Supabase Storage bucket across all folders and nested
 * directories using full pagination so no files are ever missed.
 */
export async function scanBucketFilesRecursively(
  storageProvider: StorageProvider,
  bucket: string,
  pageSize = 100
): Promise<{ bucketExists: boolean; files: DiscoveredStorageObject[] }> {
  if (typeof storageProvider.listDirectoryInBucket !== 'function') {
    throw new Error('Configured StorageProvider does not support paginated bucket listing (listDirectoryInBucket).');
  }

  const safePageSize = Math.max(1, Math.min(1000, Math.floor(pageSize)));
  const files: DiscoveredStorageObject[] = [];
  const folderQueue: string[] = [''];
  const visitedFolders = new Set<string>();
  let bucketExists = true;

  while (folderQueue.length > 0) {
    const currentPrefix = folderQueue.shift()!;
    if (visitedFolders.has(currentPrefix)) {
      continue;
    }
    visitedFolders.add(currentPrefix);

    let offset = 0;
    while (true) {
      const page = await storageProvider.listDirectoryInBucket(bucket, currentPrefix, {
        limit: safePageSize,
        offset
      });

      if (!page.bucketExists) {
        bucketExists = false;
        return { bucketExists: false, files: [] };
      }

      const entries = page.entries || [];
      for (const entry of entries) {
        if (!entry || !entry.name) continue;
        const fullPath = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;

        if (entry.isFolder) {
          if (!visitedFolders.has(fullPath)) {
            folderQueue.push(fullPath);
          }
        } else {
          files.push({
            bucket,
            objectPath: fullPath,
            sizeBytes: Number(entry.sizeBytes) || 0,
            createdAt: entry.createdAt ?? null,
            updatedAt: entry.updatedAt ?? null
          });
        }
      }

      if (entries.length < safePageSize) {
        break;
      }
      offset += safePageSize;
    }
  }

  return { bucketExists, files };
}

function isUndefinedTableOrColumnError(err: any): boolean {
  const code = String(err?.code || '');
  // 42P01 = undefined_table, 42703 = undefined_column
  return code === '42P01' || code === '42703';
}

function addProtectedPath(ctx: ProtectedPrintJobContext, rawPath: unknown, reason: string) {
  const normalized = String(rawPath || '').trim().replace(/^\/+/, '');
  if (!normalized) return;
  if (!ctx.protectedPaths.has(normalized)) {
    ctx.protectedPaths.set(normalized, reason);
  }
}

function addProtectedJob(ctx: ProtectedPrintJobContext, rawJobId: unknown, reason: string) {
  const id = String(rawJobId || '').trim();
  if (!id) return;
  ctx.protectedJobIds.add(id);
  if (!ctx.protectedJobReasons.has(id)) {
    ctx.protectedJobReasons.set(id, reason);
  }
}

function addProtectedFile(ctx: ProtectedPrintJobContext, rawFileId: unknown, reason: string) {
  const id = String(rawFileId || '').trim();
  if (!id) return;
  ctx.protectedFileIds.add(id);
  if (!ctx.protectedFileReasons.has(id)) {
    ctx.protectedFileReasons.set(id, reason);
  }
}

/**
 * Queries PostgreSQL to identify all files currently required by:
 * - Paid orders waiting for dispatch
 * - Queued, assigned, downloading, printing, spooler, or interrupted jobs
 * - Active payment/print recovery or reconciliation/retry flows
 *
 * Fails CLOSED: any unexpected DB connection/query error throws so cleanup aborts safely.
 */
export async function loadProtectedPrintJobObjects(pool: QueryablePool): Promise<ProtectedPrintJobContext> {
  const ctx: ProtectedPrintJobContext = {
    protectedPaths: new Map<string, string>(),
    protectedJobIds: new Set<string>(),
    protectedJobReasons: new Map<string, string>(),
    protectedFileIds: new Set<string>(),
    protectedFileReasons: new Map<string, string>()
  };

  const activeStatuses = Array.from(ACTIVE_PROTECTED_PRINT_STATUSES);
  const terminalStatuses = Array.from(TERMINAL_PRINT_STATUSES);

  // 1. Active or paid-undispatched jobs in `public.print_agent_jobs`
  try {
    const agentJobsRes = await pool.query(
      `SELECT job_id, order_id, print_status, checkout_session_id, job_data
       FROM public.print_agent_jobs
       WHERE print_status = ANY($1::text[])
          OR (
            COALESCE(job_data->>'paymentStatus', '') = 'SUCCESS'
            AND print_status <> ALL($2::text[])
          )`,
      [activeStatuses, terminalStatuses]
    );

    for (const row of agentJobsRes.rows || []) {
      const status = String(row.print_status || 'ACTIVE').toUpperCase();
      const jobData = typeof row.job_data === 'string' ? JSON.parse(row.job_data) : (row.job_data || {});
      const paymentStatus = String(jobData?.paymentStatus || '').toUpperCase();
      const reason = paymentStatus === 'SUCCESS' && !activeStatuses.includes(status as any)
        ? `ACTIVE_PAID_ORDER_WAITING_DISPATCH_${status}`
        : `ACTIVE_PRINT_JOB_${status}`;

      addProtectedJob(ctx, row.job_id, reason);
      addProtectedJob(ctx, row.checkout_session_id, reason);
      addProtectedJob(ctx, jobData?.id, reason);
      addProtectedJob(ctx, jobData?.printJobId, reason);
      addProtectedJob(ctx, jobData?.checkoutSessionId, reason);

      if (Array.isArray(jobData?.files)) {
        for (const f of jobData.files) {
          addProtectedPath(ctx, f?.objectPath, reason);
          addProtectedFile(ctx, f?.id, reason);
        }
      }
    }
  } catch (err: any) {
    if (!isUndefinedTableOrColumnError(err)) {
      throw new Error(`Print-job safety check failed on print_agent_jobs: ${err?.message || err}`);
    }
  }

  // 2. Active, paid-undispatched, or reconciliation-pending durable jobs in `public.uploaded_files` + `public.print_jobs` + `public.payment_orders`
  try {
    const durableFilesRes = await pool.query(
      `SELECT f.id::text AS file_id,
              f.job_id::text AS job_id,
              f.object_path,
              pj.print_status,
              pj.payment_status,
              po.status AS payment_order_status,
              COALESCE(po.reconciliation_needed, false) AS reconciliation_needed
       FROM public.uploaded_files f
       JOIN public.print_jobs pj ON pj.id = f.job_id
       LEFT JOIN public.payment_orders po ON po.job_id = pj.id
       WHERE f.upload_state != 'DELETED'
         AND (
           pj.print_status = ANY($1::text[])
           OR (pj.payment_status = 'SUCCESS' AND pj.print_status <> ALL($2::text[]))
           OR (po.status = 'PAID' AND pj.print_status <> ALL($2::text[]))
           OR (COALESCE(po.reconciliation_needed, false) = true AND pj.print_status <> ALL($2::text[]))
         )`,
      [activeStatuses, terminalStatuses]
    );

    for (const row of durableFilesRes.rows || []) {
      const status = String(row.print_status || 'ACTIVE').toUpperCase();
      let reason = `ACTIVE_PRINT_JOB_${status}`;
      if (row.reconciliation_needed) {
        reason = 'ACTIVE_PAYMENT_RECONCILIATION_RECOVERY';
      } else if (
        (String(row.payment_status || '').toUpperCase() === 'SUCCESS' ||
          String(row.payment_order_status || '').toUpperCase() === 'PAID') &&
        !activeStatuses.includes(status as any)
      ) {
        reason = `ACTIVE_PAID_ORDER_WAITING_DISPATCH_${status}`;
      }

      addProtectedPath(ctx, row.object_path, reason);
      addProtectedJob(ctx, row.job_id, reason);
      addProtectedFile(ctx, row.file_id, reason);
    }
  } catch (err: any) {
    if (!isUndefinedTableOrColumnError(err)) {
      throw new Error(`Print-job safety check failed on uploaded_files/print_jobs: ${err?.message || err}`);
    }
  }

  // 3. Staged checkout files linked to paid orders, active reconciliation, or active print_agent_jobs
  try {
    const stagedFilesRes = await pool.query(
      `SELECT sf.id::text AS file_id,
              sf.checkout_session_id,
              sf.linked_job_id,
              sf.object_path,
              paj.print_status AS agent_print_status,
              COALESCE(paj.job_data->>'paymentStatus', '') AS agent_payment_status,
              po.status AS payment_order_status,
              COALESCE(po.reconciliation_needed, false) AS reconciliation_needed
       FROM public.staged_checkout_files sf
       LEFT JOIN public.print_agent_jobs paj
         ON (paj.job_id = sf.linked_job_id OR paj.checkout_session_id = sf.checkout_session_id)
       LEFT JOIN public.payment_orders po
         ON (po.checkout_session_id IS NOT NULL AND po.checkout_session_id = sf.checkout_session_id)
       WHERE sf.upload_status != 'DELETED'
         AND (
           paj.print_status = ANY($1::text[])
           OR (
             COALESCE(paj.job_data->>'paymentStatus', '') = 'SUCCESS'
             AND COALESCE(paj.print_status, '') <> ALL($2::text[])
           )
           OR (
             po.status = 'PAID'
             AND COALESCE(paj.print_status, '') <> ALL($2::text[])
           )
           OR (
             COALESCE(po.reconciliation_needed, false) = true
             AND COALESCE(paj.print_status, '') <> ALL($2::text[])
           )
         )`,
      [activeStatuses, terminalStatuses]
    );

    for (const row of stagedFilesRes.rows || []) {
      const status = String(row.agent_print_status || 'STAGED').toUpperCase();
      let reason = `ACTIVE_STAGED_PRINT_JOB_${status}`;
      if (row.reconciliation_needed) {
        reason = 'ACTIVE_PAYMENT_RECONCILIATION_RECOVERY';
      } else if (
        String(row.payment_order_status || '').toUpperCase() === 'PAID' ||
        String(row.agent_payment_status || '').toUpperCase() === 'SUCCESS'
      ) {
        reason = `ACTIVE_PAID_ORDER_WAITING_DISPATCH_${status}`;
      }

      addProtectedPath(ctx, row.object_path, reason);
      addProtectedJob(ctx, row.checkout_session_id, reason);
      addProtectedJob(ctx, row.linked_job_id, reason);
      addProtectedFile(ctx, row.file_id, reason);
    }
  } catch (err: any) {
    if (!isUndefinedTableOrColumnError(err)) {
      throw new Error(`Print-job safety check failed on staged_checkout_files: ${err?.message || err}`);
    }
  }

  return ctx;
}

/**
 * Checks whether an eligible customer print file must be preserved due to an active print job
 * or paid/reconciling order.
 */
function resolveActiveJobProtectionReason(
  objectPath: string,
  classification: StorageClassificationResult,
  protectedCtx: ProtectedPrintJobContext
): string | null {
  const normalized = objectPath.replace(/^\/+/, '');
  const exactReason = protectedCtx.protectedPaths.get(normalized);
  if (exactReason) {
    return exactReason;
  }

  if (classification.extractedJobId && protectedCtx.protectedJobIds.has(classification.extractedJobId)) {
    return protectedCtx.protectedJobReasons.get(classification.extractedJobId) || 'ACTIVE_PRINT_JOB_PROTECTED';
  }

  if (classification.extractedFileId && protectedCtx.protectedFileIds.has(classification.extractedFileId)) {
    return protectedCtx.protectedFileReasons.get(classification.extractedFileId) || 'ACTIVE_PRINT_FILE_PROTECTED';
  }

  return null;
}

/**
 * Updates ONLY file metadata tables (`uploaded_files`, `staged_checkout_files`) for paths
 * confirmed deleted (or already missing) from Supabase Storage.
 * Never updates failed paths. Never deletes or alters order, payment, invoice, or print-job rows.
 */
async function reconcileDeletedFileMetadataInDb(
  pool: QueryablePool,
  confirmedRemovedPaths: string[]
): Promise<{ uploadedFilesUpdated: number; stagedFilesUpdated: number }> {
  if (confirmedRemovedPaths.length === 0) {
    return { uploadedFilesUpdated: 0, stagedFilesUpdated: 0 };
  }

  let uploadedFilesUpdated = 0;
  let stagedFilesUpdated = 0;

  // Batch DB updates in chunks of 200 paths
  const chunkSize = 200;
  for (let i = 0; i < confirmedRemovedPaths.length; i += chunkSize) {
    const chunk = confirmedRemovedPaths.slice(i, i + chunkSize);

    try {
      const upRes = await pool.query(
        `UPDATE public.uploaded_files
         SET upload_state = 'DELETED'
         WHERE object_path = ANY($1::text[])
           AND upload_state != 'DELETED'`,
        [chunk]
      );
      uploadedFilesUpdated += Number(upRes.rowCount || 0);
    } catch (err: any) {
      if (!isUndefinedTableOrColumnError(err)) {
        logger.warn('Failed to reconcile deleted object paths in public.uploaded_files', {
          count: chunk.length,
          error: deepRedact(err)
        });
      }
    }

    try {
      const stagedRes = await pool.query(
        `UPDATE public.staged_checkout_files
         SET upload_status = 'DELETED',
             storage_verified = false,
             updated_at = NOW()
         WHERE object_path = ANY($1::text[])
           AND upload_status != 'DELETED'`,
        [chunk]
      );
      stagedFilesUpdated += Number(stagedRes.rowCount || 0);
    } catch (err: any) {
      if (!isUndefinedTableOrColumnError(err)) {
        logger.warn('Failed to reconcile deleted object paths in public.staged_checkout_files', {
          count: chunk.length,
          error: deepRedact(err)
        });
      }
    }
  }

  return { uploadedFilesUpdated, stagedFilesUpdated };
}

/**
 * Persists a structured cleanup execution record into `public.storage_cleanup_runs`.
 */
async function persistCleanupRunLog(
  pool: QueryablePool | null,
  result: MidnightCleanupExecutionResult
): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO public.storage_cleanup_runs (
         id, trigger_source, cron_expression, timezone, executed_at_ist,
         started_at, completed_at, duration_ms, status, buckets_scanned,
         total_discovered, total_deleted, total_skipped, total_failed,
         reclaimed_bytes, skip_summary, failure_reasons
       )
       VALUES (
         $1::uuid, $2, $3, $4, $5,
         $6::timestamptz, $7::timestamptz, $8, $9, $10::jsonb,
         $11, $12, $13, $14,
         $15, $16::jsonb, $17::jsonb
       )`,
      [
        result.runId,
        result.triggerSource,
        result.cronExpression,
        result.timezone,
        result.executedAtIst,
        result.startedAtIso,
        result.completedAtIso,
        result.durationMs,
        result.status,
        JSON.stringify(result.bucketsScanned),
        result.totalDiscovered,
        result.totalDeleted,
        result.totalSkipped,
        result.totalFailed,
        result.reclaimedBytes,
        JSON.stringify(result.skipSummary),
        JSON.stringify(result.failureReasons.slice(0, 100))
      ]
    );
  } catch (err: any) {
    if (!isUndefinedTableOrColumnError(err)) {
      logger.warn('Failed to persist midnight storage cleanup audit log row', {
        runId: result.runId,
        error: deepRedact(err)
      });
    }
  }
}

/**
 * Fetches recent cleanup run logs from PostgreSQL for admin observability.
 */
export async function listRecentCleanupRuns(pool: QueryablePool, limit = 30): Promise<any[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  try {
    const res = await pool.query(
      `SELECT id, trigger_source, cron_expression, timezone, executed_at_ist,
              started_at, completed_at, duration_ms, status, buckets_scanned,
              total_discovered, total_deleted, total_skipped, total_failed,
              reclaimed_bytes, skip_summary, failure_reasons, created_at
       FROM public.storage_cleanup_runs
       ORDER BY started_at DESC
       LIMIT $1`,
      [safeLimit]
    );
    return res.rows || [];
  } catch (err: any) {
    if (isUndefinedTableOrColumnError(err)) {
      return [];
    }
    throw err;
  }
}

/**
 * Executes the daily midnight IST Supabase Storage cleanup run.
 * Safe against concurrent overlaps, pagination limits, partial deletion failures,
 * protected permanent files, and active paid/printing jobs.
 */
export async function executeMidnightStorageCleanup(
  options: ExecuteMidnightCleanupOptions = {}
): Promise<MidnightCleanupExecutionResult> {
  const runId = crypto.randomUUID();
  const triggerSource: CleanupTriggerSource = options.triggerSource || 'SCHEDULED_CRON';
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();
  const executedAtIst = formatIstTimestamp(startedAt);
  const startHr = Date.now();

  const makeResult = (
    overrides: Partial<MidnightCleanupExecutionResult>
  ): MidnightCleanupExecutionResult => {
    const completedAt = new Date();
    return {
      runId,
      triggerSource,
      cronExpression: MIDNIGHT_CLEANUP_CRON_EXPRESSION,
      timezone: MIDNIGHT_CLEANUP_TIMEZONE,
      utcEquivalent: MIDNIGHT_CLEANUP_UTC_LABEL,
      status: 'COMPLETED',
      executedAtIst,
      startedAtIso,
      completedAtIso: completedAt.toISOString(),
      durationMs: Math.max(0, Date.now() - startHr),
      bucketsScanned: [],
      bucketsSkippedMissing: [],
      totalDiscovered: 0,
      totalEligible: 0,
      totalDeleted: 0,
      totalAlreadyMissing: 0,
      totalSkipped: 0,
      totalFailed: 0,
      reclaimedBytes: 0,
      dbUploadedFilesUpdated: 0,
      dbStagedFilesUpdated: 0,
      skipSummary: {},
      skippedSamples: [],
      failureReasons: [],
      ...overrides
    };
  };

  // 1. In-process overlap guard
  if (inProcessCleanupRunning) {
    const overlapResult = makeResult({
      status: 'SKIPPED_OVERLAP',
      error: 'Midnight storage cleanup job is already running in this process.'
    });
    logger.warn('Midnight IST storage cleanup skipped due to overlapping execution', {
      runId,
      triggerSource,
      executedAtIst
    });
    return overlapResult;
  }

  inProcessCleanupRunning = true;
  let advisoryLockClient: PoolClient | null = null;
  let acquiredAdvisoryLock = false;
  const pool = options.pool ?? null;

  try {
    const storageProvider = options.storageProvider || getStorageProvider();
    if (!storageProvider.isConfigured()) {
      const unconfigured = makeResult({
        status: 'SKIPPED_UNCONFIGURED',
        error: 'Supabase Storage service-role credentials are not configured.'
      });
      logger.warn('Midnight IST storage cleanup skipped: Supabase Storage not configured', {
        runId,
        triggerSource,
        executedAtIst
      });
      await persistCleanupRunLog(pool, unconfigured);
      lastCleanupSummary = unconfigured;
      return unconfigured;
    }

    // 2. Distributed PostgreSQL advisory lock (prevents multi-instance overlap)
    if (pool) {
      try {
        if (typeof pool.connect === 'function') {
          advisoryLockClient = await pool.connect();
          const lockRes = await advisoryLockClient.query(
            'SELECT pg_try_advisory_lock($1) AS locked',
            [MIDNIGHT_CLEANUP_ADVISORY_LOCK_KEY]
          );
          acquiredAdvisoryLock = Boolean(lockRes.rows?.[0]?.locked);
        } else {
          const lockRes = await pool.query(
            'SELECT pg_try_advisory_lock($1) AS locked',
            [MIDNIGHT_CLEANUP_ADVISORY_LOCK_KEY]
          );
          acquiredAdvisoryLock = lockRes.rows?.[0]?.locked !== false;
        }
      } catch (lockErr: any) {
        if (advisoryLockClient) {
          advisoryLockClient.release();
          advisoryLockClient = null;
        }
        const failLockResult = makeResult({
          status: 'FAILED',
          error: `Failed to acquire PostgreSQL cleanup advisory lock: ${lockErr?.message || lockErr}`
        });
        logger.error('Midnight IST storage cleanup aborted: advisory lock error', {
          runId,
          triggerSource,
          executedAtIst,
          error: deepRedact(lockErr)
        });
        lastCleanupSummary = failLockResult;
        return failLockResult;
      }

      if (!acquiredAdvisoryLock) {
        const overlapResult = makeResult({
          status: 'SKIPPED_OVERLAP',
          error: 'Another server instance already holds the midnight storage cleanup advisory lock.'
        });
        logger.warn('Midnight IST storage cleanup skipped: PostgreSQL advisory lock held by another worker', {
          runId,
          triggerSource,
          executedAtIst
        });
        await persistCleanupRunLog(pool, overlapResult);
        lastCleanupSummary = overlapResult;
        return overlapResult;
      }
    } else if (!options.allowNoDatabase) {
      const noDbResult = makeResult({
        status: 'FAILED',
        error: 'PostgreSQL connection unavailable; aborting cleanup (fail-closed) to protect active print jobs.'
      });
      logger.error('Midnight IST storage cleanup aborted: database pool unavailable (fail-closed)', {
        runId,
        triggerSource,
        executedAtIst
      });
      lastCleanupSummary = noDbResult;
      return noDbResult;
    }

    // 3. Print Job Safety Check (fail-closed)
    let protectedCtx: ProtectedPrintJobContext;
    if (options.protectedContextOverride) {
      protectedCtx = options.protectedContextOverride;
    } else if (pool) {
      try {
        protectedCtx = await loadProtectedPrintJobObjects(pool);
      } catch (safetyErr: any) {
        const failResult = makeResult({
          status: 'FAILED',
          error: safetyErr?.message || 'Print-job safety lookup failed; aborting deletion.'
        });
        logger.error('Midnight IST storage cleanup aborted (fail-closed): print-job safety check failed', {
          runId,
          triggerSource,
          executedAtIst,
          error: deepRedact(safetyErr)
        });
        await persistCleanupRunLog(pool, failResult);
        lastCleanupSummary = failResult;
        return failResult;
      }
    } else {
      protectedCtx = {
        protectedPaths: new Map(),
        protectedJobIds: new Set(),
        protectedJobReasons: new Map(),
        protectedFileIds: new Set(),
        protectedFileReasons: new Map()
      };
    }

    // 4. Scan designated customer print buckets recursively with pagination
    const targetBuckets = options.buckets && options.buckets.length > 0
      ? Array.from(new Set(options.buckets.map((b) => b.trim()).filter(Boolean)))
      : getDesignatedPrintCleanupBuckets(storageProvider);
    const pageSize = Math.max(1, Math.min(1000, Math.floor(options.pageSize || 100)));
    const batchSize = Math.max(1, Math.min(500, Math.floor(options.batchSize || 100)));

    const bucketsScanned: string[] = [];
    const bucketsSkippedMissing: string[] = [];
    const skipSummary: Record<string, number> = {};
    const skippedSamples: SkippedObjectDetail[] = [];
    const failureReasons: CleanupFailureDetail[] = [];

    let totalDiscovered = 0;
    let totalEligible = 0;
    let totalDeleted = 0;
    let totalAlreadyMissing = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let reclaimedBytes = 0;
    const confirmedRemovedPaths: string[] = [];

    const recordSkip = (bucket: string, objectPath: string, reason: string) => {
      totalSkipped += 1;
      skipSummary[reason] = (skipSummary[reason] || 0) + 1;
      if (skippedSamples.length < 50) {
        skippedSamples.push({ bucket, objectPath, reason });
      }
    };

    for (const bucket of targetBuckets) {
      let scanResult: { bucketExists: boolean; files: DiscoveredStorageObject[] };
      try {
        scanResult = await scanBucketFilesRecursively(storageProvider, bucket, pageSize);
      } catch (scanErr: any) {
        totalFailed += 1;
        failureReasons.push({
          bucket,
          objectPath: '*',
          reason: `Bucket scan failed: ${scanErr?.message || scanErr}`
        });
        logger.error('Failed to scan Supabase Storage bucket during midnight cleanup', {
          runId,
          bucket,
          error: deepRedact(scanErr)
        });
        continue;
      }

      if (!scanResult.bucketExists) {
        bucketsSkippedMissing.push(bucket);
        continue;
      }

      bucketsScanned.push(bucket);
      totalDiscovered += scanResult.files.length;

      // Classify every discovered file — NO upload-date / 12-hour / 24-hour filter
      const eligibleObjects: DiscoveredStorageObject[] = [];
      const sizeByPath = new Map<string, number>();

      for (const file of scanResult.files) {
        const classification = classifyStorageObjectForCleanup(file.objectPath);
        if (!classification.eligible) {
          recordSkip(bucket, file.objectPath, classification.reason);
          continue;
        }

        const activeProtectionReason = resolveActiveJobProtectionReason(
          file.objectPath,
          classification,
          protectedCtx
        );
        if (activeProtectionReason) {
          recordSkip(bucket, file.objectPath, activeProtectionReason);
          continue;
        }

        eligibleObjects.push(file);
        sizeByPath.set(file.objectPath, file.sizeBytes);
      }

      totalEligible += eligibleObjects.length;

      // 5. Batch delete eligible files from Supabase Storage
      if (typeof storageProvider.removeFromBucket !== 'function') {
        throw new Error('Configured StorageProvider does not support bucket-scoped batch removal (removeFromBucket).');
      }

      for (let i = 0; i < eligibleObjects.length; i += batchSize) {
        const batch = eligibleObjects.slice(i, i + batchSize);
        const batchPaths = batch.map((obj) => obj.objectPath);

        try {
          const removeRes = await storageProvider.removeFromBucket(bucket, batchPaths);

          for (const deletedPath of removeRes.deletedPaths) {
            totalDeleted += 1;
            reclaimedBytes += sizeByPath.get(deletedPath) || 0;
            confirmedRemovedPaths.push(deletedPath);
          }

          for (const missingPath of removeRes.alreadyMissingPaths) {
            totalAlreadyMissing += 1;
            confirmedRemovedPaths.push(missingPath);
          }

          for (const failedItem of removeRes.failedItems) {
            totalFailed += 1;
            failureReasons.push({
              bucket,
              objectPath: failedItem.objectPath,
              reason: failedItem.reason
            });
          }
        } catch (batchErr: any) {
          for (const p of batchPaths) {
            totalFailed += 1;
            failureReasons.push({
              bucket,
              objectPath: p,
              reason: batchErr?.message || 'Batch deletion failed'
            });
          }
        }
      }
    }

    // 6. Reconcile ONLY confirmed deleted / already-missing file metadata in PostgreSQL
    let dbUploadedFilesUpdated = 0;
    let dbStagedFilesUpdated = 0;
    if (pool && confirmedRemovedPaths.length > 0) {
      const dbSync = await reconcileDeletedFileMetadataInDb(pool, confirmedRemovedPaths);
      dbUploadedFilesUpdated = dbSync.uploadedFilesUpdated;
      dbStagedFilesUpdated = dbSync.stagedFilesUpdated;
    }

    const status = totalFailed > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
    const finalResult = makeResult({
      status,
      bucketsScanned,
      bucketsSkippedMissing,
      totalDiscovered,
      totalEligible,
      totalDeleted,
      totalAlreadyMissing,
      totalSkipped,
      totalFailed,
      reclaimedBytes,
      dbUploadedFilesUpdated,
      dbStagedFilesUpdated,
      skipSummary,
      skippedSamples,
      failureReasons
    });

    await persistCleanupRunLog(pool, finalResult);
    lastCleanupSummary = finalResult;

    logger.info('Midnight IST Supabase Storage cleanup run finished', {
      runId: finalResult.runId,
      triggerSource: finalResult.triggerSource,
      executedAtIst: finalResult.executedAtIst,
      status: finalResult.status,
      bucketsScanned: finalResult.bucketsScanned,
      totalDiscovered: finalResult.totalDiscovered,
      totalDeleted: finalResult.totalDeleted,
      totalAlreadyMissing: finalResult.totalAlreadyMissing,
      totalSkipped: finalResult.totalSkipped,
      totalFailed: finalResult.totalFailed,
      reclaimedBytes: finalResult.reclaimedBytes,
      durationMs: finalResult.durationMs,
      skipSummary: finalResult.skipSummary,
      failureCount: finalResult.failureReasons.length
    });

    return finalResult;
  } catch (err: any) {
    const failedResult = makeResult({
      status: 'FAILED',
      error: err?.message || 'Unexpected error during midnight storage cleanup'
    });
    logger.error('Midnight IST Supabase Storage cleanup failed unexpectedly', {
      runId,
      triggerSource,
      executedAtIst,
      error: deepRedact(err)
    });
    await persistCleanupRunLog(pool, failedResult);
    lastCleanupSummary = failedResult;
    return failedResult;
  } finally {
    if (acquiredAdvisoryLock) {
      try {
        if (advisoryLockClient) {
          await advisoryLockClient.query('SELECT pg_advisory_unlock($1)', [MIDNIGHT_CLEANUP_ADVISORY_LOCK_KEY]);
        } else if (pool) {
          await pool.query('SELECT pg_advisory_unlock($1)', [MIDNIGHT_CLEANUP_ADVISORY_LOCK_KEY]);
        }
      } catch (unlockErr) {
        logger.warn('Failed to release PostgreSQL cleanup advisory lock', {
          runId,
          error: deepRedact(unlockErr)
        });
      }
    }
    if (advisoryLockClient) {
      advisoryLockClient.release();
      advisoryLockClient = null;
    }
    inProcessCleanupRunning = false;
  }
}

/**
 * Registers the SINGLE daily midnight IST (`0 0 * * *` Asia/Kolkata) cron job.
 * Calling this function multiple times is idempotent and will never register a duplicate job.
 */
export function registerMidnightStorageCleanupCron(options: {
  getPool: () => QueryablePool | null;
  getStorage?: () => StorageProvider;
}): CronRegistrationResult {
  if (singletonMidnightCronTask) {
    return {
      registered: true,
      alreadyRegistered: true,
      cronExpression: MIDNIGHT_CLEANUP_CRON_EXPRESSION,
      timezone: MIDNIGHT_CLEANUP_TIMEZONE,
      utcEquivalent: MIDNIGHT_CLEANUP_UTC_LABEL
    };
  }

  if (!cron.validate(MIDNIGHT_CLEANUP_CRON_EXPRESSION)) {
    throw new Error(`Invalid midnight cleanup cron expression: ${MIDNIGHT_CLEANUP_CRON_EXPRESSION}`);
  }

  singletonMidnightCronTask = cron.schedule(
    MIDNIGHT_CLEANUP_CRON_EXPRESSION,
    async () => {
      await executeMidnightStorageCleanup({
        triggerSource: 'SCHEDULED_CRON',
        pool: options.getPool(),
        storageProvider: options.getStorage ? options.getStorage() : getStorageProvider()
      });
    },
    {
      timezone: MIDNIGHT_CLEANUP_TIMEZONE
    }
  );
  singletonCronRegisteredAtIso = new Date().toISOString();

  logger.info('Registered SINGLE daily midnight IST Supabase Storage auto-cleanup cron job', {
    cronExpression: MIDNIGHT_CLEANUP_CRON_EXPRESSION,
    timezone: MIDNIGHT_CLEANUP_TIMEZONE,
    utcEquivalent: MIDNIGHT_CLEANUP_UTC_LABEL,
    designatedBuckets: getDesignatedPrintCleanupBuckets(options.getStorage ? options.getStorage() : undefined)
  });

  return {
    registered: true,
    alreadyRegistered: false,
    cronExpression: MIDNIGHT_CLEANUP_CRON_EXPRESSION,
    timezone: MIDNIGHT_CLEANUP_TIMEZONE,
    utcEquivalent: MIDNIGHT_CLEANUP_UTC_LABEL
  };
}

/**
 * Stops and unregisters the singleton cron job (used for graceful shutdown or tests).
 */
export function stopMidnightStorageCleanupCron(): void {
  if (singletonMidnightCronTask) {
    singletonMidnightCronTask.stop();
    singletonMidnightCronTask.destroy?.();
    singletonMidnightCronTask = null;
    singletonCronRegisteredAtIso = null;
  }
}

/**
 * Returns live status & schedule metadata for the single midnight cleanup cron job.
 */
export function getMidnightCleanupCronStatus() {
  return {
    active: Boolean(singletonMidnightCronTask),
    registeredAtIso: singletonCronRegisteredAtIso,
    cronExpression: MIDNIGHT_CLEANUP_CRON_EXPRESSION,
    timezone: MIDNIGHT_CLEANUP_TIMEZONE,
    utcCronExpression: MIDNIGHT_CLEANUP_UTC_EXPRESSION,
    utcEquivalent: MIDNIGHT_CLEANUP_UTC_LABEL,
    currentlyRunning: inProcessCleanupRunning,
    designatedBuckets: getDesignatedPrintCleanupBuckets(),
    lastRun: lastCleanupSummary
  };
}
