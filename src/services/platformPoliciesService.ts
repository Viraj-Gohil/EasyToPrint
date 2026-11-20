import type { Pool } from 'pg';
import { isSharedPoolConfigured, requireSharedPool } from '../db/repositoryFactory.js';
import { logger, deepRedact } from '../lib/security.js';
import type { PlatformPolicies } from '../types/index.js';

export type OveragePolicy = 'BLOCK_PRINTS' | 'SOFT_WARNING';
export type CancellationPolicy = 'END_OF_CYCLE' | 'IMMEDIATE';

export interface PlatformPoliciesValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: PlatformPolicies;
}

export const DEFAULT_PLATFORM_POLICIES: PlatformPolicies = {
  defaultFileRetentionHours: 48,
  maxAllowedUploadSizeMb: 50,
  globalRateLimitPerMin: 300,
  trialDurationDays: 14,
  trialPerShopEligibility: true,
  failedPaymentGracePeriodDays: 3,
  warningThresholdPercent: 80,
  criticalThresholdPercent: 95,
  overagePolicy: 'BLOCK_PRINTS',
  cancellationPolicy: 'END_OF_CYCLE',
  updatedAt: new Date().toISOString(),
  updatedBy: 'System Default'
};

let cachedPolicies: PlatformPolicies = { ...DEFAULT_PLATFORM_POLICIES };
let cacheExpiresAt = 0;
let tableEnsured = false;

const CACHE_TTL_MS = 30_000;

export function getCachedPlatformPolicies(): PlatformPolicies {
  return { ...cachedPolicies };
}

export function validatePlatformPoliciesInput(
  input: Partial<PlatformPolicies>,
  base: PlatformPolicies = cachedPolicies
): PlatformPoliciesValidationResult {
  const merged = { ...base, ...input };

  const defaultFileRetentionHours = Number(merged.defaultFileRetentionHours);
  if (!Number.isFinite(defaultFileRetentionHours) || !Number.isInteger(defaultFileRetentionHours) || defaultFileRetentionHours < 1 || defaultFileRetentionHours > 720) {
    return { valid: false, error: 'Default File Retention (Hours) must be a whole number between 1 and 720.' };
  }

  const maxAllowedUploadSizeMb = Number(merged.maxAllowedUploadSizeMb);
  if (!Number.isFinite(maxAllowedUploadSizeMb) || !Number.isInteger(maxAllowedUploadSizeMb) || maxAllowedUploadSizeMb < 5 || maxAllowedUploadSizeMb > 500) {
    return { valid: false, error: 'Platform Max Upload Ceiling (MB) must be a whole number between 5 and 500.' };
  }

  const globalRateLimitPerMin = Number(merged.globalRateLimitPerMin);
  if (!Number.isFinite(globalRateLimitPerMin) || !Number.isInteger(globalRateLimitPerMin) || globalRateLimitPerMin < 30 || globalRateLimitPerMin > 1000) {
    return { valid: false, error: 'Global Rate Limit (Requests / Min) must be a whole number between 30 and 1000.' };
  }

  const trialDurationDays = Number(merged.trialDurationDays);
  if (!Number.isFinite(trialDurationDays) || !Number.isInteger(trialDurationDays) || trialDurationDays < 0 || trialDurationDays > 60) {
    return { valid: false, error: 'Default Trial Duration (Days) must be a whole number between 0 and 60.' };
  }

  const failedPaymentGracePeriodDays = Number(merged.failedPaymentGracePeriodDays);
  if (!Number.isFinite(failedPaymentGracePeriodDays) || !Number.isInteger(failedPaymentGracePeriodDays) || failedPaymentGracePeriodDays < 0 || failedPaymentGracePeriodDays > 30) {
    return { valid: false, error: 'Failed Payment Grace Period (Days) must be a whole number between 0 and 30.' };
  }

  const warningThresholdPercent = Number(merged.warningThresholdPercent);
  if (!Number.isFinite(warningThresholdPercent) || !Number.isInteger(warningThresholdPercent) || warningThresholdPercent < 50 || warningThresholdPercent > 95) {
    return { valid: false, error: 'Usage Warning Threshold (%) must be a whole number between 50 and 95.' };
  }

  const rawCritical = Number(merged.criticalThresholdPercent ?? 95);
  const criticalThresholdPercent = Number.isFinite(rawCritical)
    ? Math.max(warningThresholdPercent, Math.min(100, Math.round(rawCritical)))
    : Math.max(warningThresholdPercent, 95);

  const overagePolicy = merged.overagePolicy;
  if (overagePolicy !== 'BLOCK_PRINTS' && overagePolicy !== 'SOFT_WARNING') {
    return { valid: false, error: 'Quota Overage Policy must be BLOCK_PRINTS or SOFT_WARNING.' };
  }

  const cancellationPolicy = merged.cancellationPolicy;
  if (cancellationPolicy !== 'END_OF_CYCLE' && cancellationPolicy !== 'IMMEDIATE') {
    return { valid: false, error: 'Cancellation Policy must be END_OF_CYCLE or IMMEDIATE.' };
  }

  const trialPerShopEligibility =
    typeof merged.trialPerShopEligibility === 'boolean'
      ? merged.trialPerShopEligibility
      : base.trialPerShopEligibility ?? true;

  return {
    valid: true,
    sanitized: {
      defaultFileRetentionHours,
      maxAllowedUploadSizeMb,
      globalRateLimitPerMin,
      trialDurationDays,
      trialPerShopEligibility,
      failedPaymentGracePeriodDays,
      warningThresholdPercent,
      criticalThresholdPercent,
      overagePolicy,
      cancellationPolicy,
      updatedAt: merged.updatedAt || new Date().toISOString(),
      updatedBy: merged.updatedBy || base.updatedBy || 'Platform Super Admin'
    }
  };
}

export async function ensurePlatformPoliciesTable(pool: Pool): Promise<void> {
  if (tableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.platform_policies (
      id VARCHAR(32) PRIMARY KEY,
      default_file_retention_hours INTEGER NOT NULL DEFAULT 48,
      max_allowed_upload_size_mb INTEGER NOT NULL DEFAULT 50,
      global_rate_limit_per_min INTEGER NOT NULL DEFAULT 300,
      trial_duration_days INTEGER NOT NULL DEFAULT 14,
      trial_per_shop_eligibility BOOLEAN NOT NULL DEFAULT true,
      failed_payment_grace_period_days INTEGER NOT NULL DEFAULT 3,
      warning_threshold_percent INTEGER NOT NULL DEFAULT 80,
      critical_threshold_percent INTEGER NOT NULL DEFAULT 95,
      overage_policy VARCHAR(32) NOT NULL DEFAULT 'BLOCK_PRINTS',
      cancellation_policy VARCHAR(32) NOT NULL DEFAULT 'END_OF_CYCLE',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by VARCHAR(160) NOT NULL DEFAULT 'System Default'
    );
  `);
  tableEnsured = true;
}

function rowToPolicies(row: any): PlatformPolicies {
  const validated = validatePlatformPoliciesInput(
    {
      defaultFileRetentionHours: Number(row.default_file_retention_hours),
      maxAllowedUploadSizeMb: Number(row.max_allowed_upload_size_mb),
      globalRateLimitPerMin: Number(row.global_rate_limit_per_min),
      trialDurationDays: Number(row.trial_duration_days),
      trialPerShopEligibility: Boolean(row.trial_per_shop_eligibility),
      failedPaymentGracePeriodDays: Number(row.failed_payment_grace_period_days),
      warningThresholdPercent: Number(row.warning_threshold_percent),
      criticalThresholdPercent: Number(row.critical_threshold_percent),
      overagePolicy: row.overage_policy,
      cancellationPolicy: row.cancellation_policy,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      updatedBy: row.updated_by || 'Platform Super Admin'
    },
    DEFAULT_PLATFORM_POLICIES
  );
  return validated.sanitized || { ...DEFAULT_PLATFORM_POLICIES };
}

export async function getPlatformPolicies(options?: { forceRefresh?: boolean; pool?: Pool | null }): Promise<PlatformPolicies> {
  const now = Date.now();
  if (!options?.forceRefresh && now < cacheExpiresAt) {
    return { ...cachedPolicies };
  }

  const pool = options?.pool ?? (isSharedPoolConfigured() ? requireSharedPool() : null);
  if (!pool) {
    cacheExpiresAt = now + CACHE_TTL_MS;
    return { ...cachedPolicies };
  }

  try {
    await ensurePlatformPoliciesTable(pool);
    const res = await pool.query(`
      SELECT
        default_file_retention_hours,
        max_allowed_upload_size_mb,
        global_rate_limit_per_min,
        trial_duration_days,
        trial_per_shop_eligibility,
        failed_payment_grace_period_days,
        warning_threshold_percent,
        critical_threshold_percent,
        overage_policy,
        cancellation_policy,
        updated_at,
        updated_by
      FROM public.platform_policies
      WHERE id = 'current'
      LIMIT 1
    `);

    if ((res.rowCount ?? 0) > 0) {
      cachedPolicies = rowToPolicies(res.rows[0]);
      cacheExpiresAt = now + CACHE_TTL_MS;
      return { ...cachedPolicies };
    }

    // Check legacy printflow_app_state record if present, otherwise seed defaults
    let seed = { ...DEFAULT_PLATFORM_POLICIES };
    try {
      const legacyRes = await pool.query(
        `SELECT payload FROM public.printflow_app_state WHERE key = 'platform_policies' LIMIT 1`
      );
      if ((legacyRes.rowCount ?? 0) > 0 && legacyRes.rows[0]?.payload) {
        const parsed = validatePlatformPoliciesInput(legacyRes.rows[0].payload, DEFAULT_PLATFORM_POLICIES);
        if (parsed.valid && parsed.sanitized) {
          seed = parsed.sanitized;
        }
      }
    } catch {
      // printflow_app_state may not exist yet — safe to ignore
    }

    await pool.query(
      `
      INSERT INTO public.platform_policies (
        id,
        default_file_retention_hours,
        max_allowed_upload_size_mb,
        global_rate_limit_per_min,
        trial_duration_days,
        trial_per_shop_eligibility,
        failed_payment_grace_period_days,
        warning_threshold_percent,
        critical_threshold_percent,
        overage_policy,
        cancellation_policy,
        updated_at,
        updated_by
      )
      VALUES ('current', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        seed.defaultFileRetentionHours,
        seed.maxAllowedUploadSizeMb,
        seed.globalRateLimitPerMin,
        seed.trialDurationDays,
        seed.trialPerShopEligibility,
        seed.failedPaymentGracePeriodDays,
        seed.warningThresholdPercent,
        seed.criticalThresholdPercent,
        seed.overagePolicy,
        seed.cancellationPolicy,
        seed.updatedBy || 'System Default'
      ]
    );

    cachedPolicies = seed;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return { ...cachedPolicies };
  } catch (error: any) {
    logger.warn('Failed to fetch platform_policies from DB; using cached defaults', {
      error: deepRedact(error)
    });
    cacheExpiresAt = now + 10_000;
    return { ...cachedPolicies };
  }
}

export async function savePlatformPolicies(
  input: Partial<PlatformPolicies>,
  updatedBy: string = 'Platform Super Admin',
  poolOverride?: Pool | null
): Promise<PlatformPoliciesValidationResult> {
  const current = await getPlatformPolicies({ pool: poolOverride });
  const validated = validatePlatformPoliciesInput(
    {
      ...input,
      updatedAt: new Date().toISOString(),
      updatedBy
    },
    current
  );

  if (!validated.valid || !validated.sanitized) {
    return validated;
  }

  const next = validated.sanitized;
  const pool = poolOverride ?? (isSharedPoolConfigured() ? requireSharedPool() : null);

  if (pool) {
    await ensurePlatformPoliciesTable(pool);
    const res = await pool.query(
      `
      INSERT INTO public.platform_policies (
        id,
        default_file_retention_hours,
        max_allowed_upload_size_mb,
        global_rate_limit_per_min,
        trial_duration_days,
        trial_per_shop_eligibility,
        failed_payment_grace_period_days,
        warning_threshold_percent,
        critical_threshold_percent,
        overage_policy,
        cancellation_policy,
        updated_at,
        updated_by
      )
      VALUES ('current', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
      ON CONFLICT (id) DO UPDATE SET
        default_file_retention_hours = EXCLUDED.default_file_retention_hours,
        max_allowed_upload_size_mb = EXCLUDED.max_allowed_upload_size_mb,
        global_rate_limit_per_min = EXCLUDED.global_rate_limit_per_min,
        trial_duration_days = EXCLUDED.trial_duration_days,
        trial_per_shop_eligibility = EXCLUDED.trial_per_shop_eligibility,
        failed_payment_grace_period_days = EXCLUDED.failed_payment_grace_period_days,
        warning_threshold_percent = EXCLUDED.warning_threshold_percent,
        critical_threshold_percent = EXCLUDED.critical_threshold_percent,
        overage_policy = EXCLUDED.overage_policy,
        cancellation_policy = EXCLUDED.cancellation_policy,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
      RETURNING *
      `,
      [
        next.defaultFileRetentionHours,
        next.maxAllowedUploadSizeMb,
        next.globalRateLimitPerMin,
        next.trialDurationDays,
        next.trialPerShopEligibility,
        next.failedPaymentGracePeriodDays,
        next.warningThresholdPercent,
        next.criticalThresholdPercent,
        next.overagePolicy,
        next.cancellationPolicy,
        updatedBy
      ]
    );

    const saved = (res.rowCount ?? 0) > 0 ? rowToPolicies(res.rows[0]) : next;

    // Also mirror into printflow_app_state so any legacy state sync reads the exact same authoritative values
    try {
      await pool.query(
        `
        INSERT INTO public.printflow_app_state (key, payload, updated_at)
        VALUES ('platform_policies', $1::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
        `,
        [JSON.stringify(saved)]
      );
    } catch {
      // Optional mirror if printflow_app_state is present
    }

    cachedPolicies = saved;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return { valid: true, sanitized: { ...saved } };
  }

  cachedPolicies = next;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return { valid: true, sanitized: { ...next } };
}

export function getPublicPlatformPolicies(policies: PlatformPolicies = cachedPolicies) {
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
