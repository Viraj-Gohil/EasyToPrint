-- ============================================================================
-- Migration 013: Daily Midnight IST Supabase Storage Cleanup Audit Logs
-- ============================================================================
-- Tracks every daily 12:00 AM IST (18:30 UTC) midnight cleanup execution:
-- execution timestamp (IST), discovered/deleted/skipped/failed counts,
-- reclaimed bytes, duration, skipped protection reasons, and failure details.
-- Preserves all orders, payments, invoices, and print job history untouched.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.storage_cleanup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED_CRON',
  cron_expression VARCHAR(32) NOT NULL DEFAULT '0 0 * * *',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  executed_at_ist TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'RUNNING',
  buckets_scanned JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_discovered INTEGER NOT NULL DEFAULT 0,
  total_deleted INTEGER NOT NULL DEFAULT 0,
  total_skipped INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  reclaimed_bytes BIGINT NOT NULL DEFAULT 0,
  skip_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storage_cleanup_runs_started_at
  ON public.storage_cleanup_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_storage_cleanup_runs_status
  ON public.storage_cleanup_runs (status, started_at DESC);
