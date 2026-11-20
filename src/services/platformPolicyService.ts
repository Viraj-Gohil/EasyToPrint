import type { Pool } from 'pg';
import { isSharedPoolConfigured, requireSharedPool } from '../db/repositoryFactory';
import type { PlatformPolicies } from '../types';

export interface PlatformPoliciesConfig extends PlatformPolicies {
  defaultFileRetentionHours: number;
  maxAllowedUploadSizeMb: number;
  globalRateLimitPerMin: number;
  trialDurationDays: number;
  trialPerShopEligibility: boolean;
  failedPaymentGracePeriodDays: number;
  warningThresholdPercent: number;
  criticalThresholdPercent: number;
  overagePolicy: 'BLOCK_PRINTS' | 'SOFT_WARNING';
  cancellationPolicy: 'END_OF_CYCLE' | 'IMMEDIATE';
  updatedAt: string;
  updatedBy: string;
}

export const DEFAULT_PLATFORM_POLICIES_CONFIG: PlatformPoliciesConfig = {
  defaultFileRetentionHours: 48,
  maxAllowedUploadSizeMb: 50,
  globalRateLimitPerMin: 300,
  trialDurationDays: 7,
  trialPerShopEligibility: true,
  failedPaymentGracePeriodDays: 5,
  warningThresholdPercent: 80,
  criticalThresholdPercent: 95,
  overagePolicy: 'BLOCK_PRINTS',
  cancellationPolicy: 'END_OF_CYCLE',
  updatedAt: new Date(0).toISOString(),
  updatedBy: 'System Default'
};

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
  sanitized: Partial<PlatformPoliciesConfig>;
}

const CACHE_TTL_MS = 30_000;
let cachedPolicies: PlatformPoliciesConfig = { ...DEFAULT_PLATFORM_POLICIES_CONFIG };
let cacheLoadedAt = 0;
let tableEnsured = false;

function toFiniteInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num);
}

/**
 * Validates and normalizes incoming Global Quota & Subscription Policies.
 */
export function validatePlatformPoliciesInput(
  input: Record<string, unknown>,
  base: PlatformPoliciesConfig = cachedPolicies
): PolicyValidationResult {
  const errors: string[] = [];
  const sanitized: Partial<PlatformPoliciesConfig> = {};

  if (input.defaultFileRetentionHours !== undefined) {
    const val = toFiniteInt(input.defaultFileRetentionHours);
    if (val === null || val < 1 || val > 720) {
      errors.push('Default File Retention (Hours) must be an integer between 1 and 720.');
    } else {
      sanitized.defaultFileRetentionHours = val;
    }
  }

  if (input.maxAllowedUploadSizeMb !== undefined) {
    const val = toFiniteInt(input.maxAllowedUploadSizeMb);
    if (val === null || val < 5 || val > 500) {
      errors.push('Platform Max Upload Ceiling (MB) must be an integer between 5 and 500.');
    } else {
      sanitized.maxAllowedUploadSizeMb = val;
    }
  }

  if (input.globalRateLimitPerMin !== undefined) {
    const val = toFiniteInt(input.globalRateLimitPerMin);
    if (val === null || val < 30 || val > 1000) {
      errors.push('Global Rate Limit (Requests / Min) must be an integer between 30 and 1000.');
    } else {
      sanitized.globalRateLimitPerMin = val;
    }
  }

  if (input.trialDurationDays !== undefined) {
    const val = toFiniteInt(input.trialDurationDays);
    if (val === null || val < 0 || val > 60) {
      errors.push('Default Trial Duration (Days) must be an integer between 0 and 60.');
    } else {
      sanitized.trialDurationDays = val;
    }
  }

  if (input.trialPerShopEligibility !== undefined) {
    if (typeof input.trialPerShopEligibility !== 'boolean') {
      errors.push('trialPerShopEligibility must be a boolean.');
    } else {
      sanitized.trialPerShopEligibility = input.trialPerShopEligibility;
    }
  }

  if (input.failedPaymentGracePeriodDays !== undefined) {
    const val = toFiniteInt(input.failedPaymentGracePeriodDays);
    if (val === null || val < 0 || val > 30) {
      errors.push('Failed Payment Grace Period (Days) must be an integer between 0 and 30.');
    } else {
      sanitized.failedPaymentGracePeriodDays = val;
    }
  }

  if (input.warningThresholdPercent !== undefined) {
    const val = toFiniteInt(input.warningThresholdPercent);
    if (val === null || val < 50 || val > 95) {
      errors.push('Usage Warning Threshold (%) must be an integer between 50 and 95.');
    } else {
      sanitized.warningThresholdPercent = val;
    }
  }

  if (input.criticalThresholdPercent !== undefined) {
    const val = toFiniteInt(input.criticalThresholdPercent);
    const effectiveWarning = sanitized.warningThresholdPercent ?? base.warningThresholdPercent;
    if (val === null || val < 60 || val > 100) {
      errors.push('Critical Threshold (%) must be an integer between 60 and 100.');
    } else {
      sanitized.criticalThresholdPercent = Math.max(val, Math.min(100, effectiveWarning + 5));
    }
  } else if (sanitized.warningThresholdPercent !== undefined) {
    sanitized.criticalThresholdPercent = Math.max(
      base.criticalThresholdPercent,
      Math.min(100, sanitized.warningThresholdPercent + 5)
    );
  }

  if (input.overagePolicy !== undefined) {
    if (input.overagePolicy !== 'BLOCK_PRINTS' && input.overagePolicy !== 'SOFT_WARNING') {
      errors.push('Quota Overage Policy must be either BLOCK_PRINTS or SOFT_WARNING.');
    } else {
      sanitized.overagePolicy = input.overagePolicy;
    }
  }

  if (input.cancellationPolicy !== undefined) {
    if (input.cancellationPolicy !== 'END_OF_CYCLE' && input.cancellationPolicy !== 'IMMEDIATE') {
      errors.push('Cancellation Policy must be either END_OF_CYCLE or IMMEDIATE.');
    } else {
      sanitized.cancellationPolicy = input.cancellationPolicy;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

function mergeWithDefaults(raw: Partial<PlatformPoliciesConfig> | null | undefined, updatedAt?: string, updatedBy?: string): PlatformPoliciesConfig {
  const src = raw && typeof raw === 'object' ? raw : {};
  const validated = validatePlatformPoliciesInput(src as Record<string, unknown>, DEFAULT_PLATFORM_POLICIES_CONFIG);
  return {
    ...DEFAULT_PLATFORM_POLICIES_CONFIG,
    ...validated.sanitized,
    updatedAt: updatedAt || (typeof src.updatedAt === 'string' && src.updatedAt ? src.updatedAt : new Date().toISOString()),
    updatedBy: updatedBy || (typeof src.updatedBy === 'string' && src.updatedBy ? src.updatedBy : 'System Default')
  };
}

export async function ensurePlatformPoliciesTable(pool: Pool): Promise<void> {
  if (tableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.platform_policies (
      id TEXT PRIMARY KEY,
      config JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT NOT NULL DEFAULT 'System Default'
    );
  `);
  tableEnsured = true;
}

/**
 * Synchronous cached accessor used by hot paths (global rate limiter, upload validators, warning thresholds).
 */
export function getCachedPlatformPoliciesSync(): PlatformPoliciesConfig {
  return { ...cachedPolicies };
}

/**
 * Returns the effective single-file / print-job upload size ceiling in bytes,
 * always enforcing the global platform hard ceiling.
 */
export function getEffectiveUploadMaxBytes(planMaxMb?: number | null): number {
  const platformMaxMb = Math.max(5, Math.min(500, cachedPolicies.maxAllowedUploadSizeMb || 50));
  const resolvedMb =
    typeof planMaxMb === 'number' && Number.isFinite(planMaxMb) && planMaxMb > 0
      ? Math.min(planMaxMb, platformMaxMb)
      : platformMaxMb;
  return Math.round(resolvedMb * 1024 * 1024);
}

/**
 * Loads the authoritative Global Quota & Subscription Policies from PostgreSQL.
 */
export async function getPlatformPolicies(options?: { bypassCache?: boolean; pool?: Pool }): Promise<PlatformPoliciesConfig> {
  const now = Date.now();
  if (!options?.bypassCache && cacheLoadedAt > 0 && now - cacheLoadedAt < CACHE_TTL_MS) {
    return { ...cachedPolicies };
  }

  const pool = options?.pool || (isSharedPoolConfigured() ? requireSharedPool() : null);
  if (!pool) {
    cacheLoadedAt = now;
    return { ...cachedPolicies };
  }

  try {
    await ensurePlatformPoliciesTable(pool);
    const res = await pool.query<{
      config: Partial<PlatformPoliciesConfig>;
      updated_at: Date;
      updated_by: string;
    }>(
      `SELECT config, updated_at, updated_by
       FROM public.platform_policies
       WHERE id = 'global'
       LIMIT 1`
    );

    if ((res.rowCount ?? 0) > 0 && res.rows[0]) {
      const row = res.rows[0];
      cachedPolicies = mergeWithDefaults(
        row.config,
        row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
        row.updated_by || 'Platform Super Admin'
      );
      cacheLoadedAt = now;
      return { ...cachedPolicies };
    }

    // Legacy fallback: check if printflow_app_state already had saved platform_policies
    try {
      const legacy = await pool.query<{ value: Partial<PlatformPoliciesConfig>; updated_at: Date }>(
        `SELECT value, updated_at
         FROM public.printflow_app_state
         WHERE key = 'platform_policies'
         LIMIT 1`
      );
      if ((legacy.rowCount ?? 0) > 0 && legacy.rows[0]?.value) {
        const migrated = mergeWithDefaults(
          legacy.rows[0].value,
          legacy.rows[0].updated_at ? new Date(legacy.rows[0].updated_at).toISOString() : undefined,
          legacy.rows[0].value.updatedBy || 'Platform Super Admin'
        );
        await pool.query(
          `INSERT INTO public.platform_policies (id, config, updated_at, updated_by)
           VALUES ('global', $1::jsonb, NOW(), $2)
           ON CONFLICT (id) DO NOTHING`,
          [JSON.stringify(migrated), migrated.updatedBy]
        );
        cachedPolicies = migrated;
        cacheLoadedAt = now;
        return { ...cachedPolicies };
      }
    } catch {
      // printflow_app_state table may not exist in fresh DBs; seed defaults below
    }

    // Seed initial authoritative row
    const seeded: PlatformPoliciesConfig = {
      ...DEFAULT_PLATFORM_POLICIES_CONFIG,
      updatedAt: new Date().toISOString(),
      updatedBy: 'System Default'
    };
    await pool.query(
      `INSERT INTO public.platform_policies (id, config, updated_at, updated_by)
       VALUES ('global', $1::jsonb, NOW(), $2)
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(seeded), seeded.updatedBy]
    );
    cachedPolicies = seeded;
    cacheLoadedAt = now;
    return { ...cachedPolicies };
  } catch {
    return { ...cachedPolicies };
  }
}

/**
 * Validates and persists Global Quota & Subscription Policies to PostgreSQL,
 * updates the in-process runtime cache immediately, and syncs legacy app-state KV if present.
 */
export async function updatePlatformPoliciesInDb(
  patch: Record<string, unknown>,
  actorName = 'Platform Super Admin',
  poolOverride?: Pool
): Promise<PlatformPoliciesConfig> {
  const current = await getPlatformPolicies({ bypassCache: true, pool: poolOverride });
  const validation = validatePlatformPoliciesInput(patch, current);
  if (!validation.valid) {
    const err = new Error(validation.errors.join(' '));
    (err as any).statusCode = 400;
    (err as any).validationErrors = validation.errors;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const next: PlatformPoliciesConfig = {
    ...current,
    ...validation.sanitized,
    updatedAt: nowIso,
    updatedBy: actorName || 'Platform Super Admin'
  };

  const pool = poolOverride || (isSharedPoolConfigured() ? requireSharedPool() : null);
  if (pool) {
    await ensurePlatformPoliciesTable(pool);
    await pool.query(
      `INSERT INTO public.platform_policies (id, config, updated_at, updated_by)
       VALUES ('global', $1::jsonb, $2::timestamptz, $3)
       ON CONFLICT (id) DO UPDATE SET
         config = EXCLUDED.config,
         updated_at = EXCLUDED.updated_at,
         updated_by = EXCLUDED.updated_by`,
      [JSON.stringify(next), nowIso, next.updatedBy]
    );

    // Best-effort sync to legacy KV store so store hydration stays aligned
    try {
      await pool.query(
        `INSERT INTO public.printflow_app_state (key, value, updated_at)
         VALUES ('platform_policies', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(next)]
      );
    } catch {
      // Non-fatal if printflow_app_state does not exist
    }
  }

  cachedPolicies = { ...next };
  cacheLoadedAt = Date.now();
  return { ...next };
}

/**
 * Safe public projection for customer upload flows and shop owner dashboards.
 */
export function toPublicPlatformPolicies(policies: PlatformPoliciesConfig) {
  return {
    defaultFileRetentionHours: policies.defaultFileRetentionHours,
    maxAllowedUploadSizeMb: policies.maxAllowedUploadSizeMb,
    trialDurationDays: policies.trialDurationDays,
    trialPerShopEligibility: policies.trialPerShopEligibility,
    failedPaymentGracePeriodDays: policies.failedPaymentGracePeriodDays,
    warningThresholdPercent: policies.warningThresholdPercent,
    criticalThresholdPercent: policies.criticalThresholdPercent,
    overagePolicy: policies.overagePolicy,
    cancellationPolicy: policies.cancellationPolicy,
    updatedAt: policies.updatedAt
  };
}

/**
 * Test helper to reset in-memory policy cache explicitly.
 */
export function __setCachedPlatformPoliciesForTest(policies: Partial<PlatformPoliciesConfig>): void {
  cachedPolicies = mergeWithDefaults(policies);
  cacheLoadedAt = Date.now();
}
