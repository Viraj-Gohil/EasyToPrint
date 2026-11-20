-- ============================================================================
-- Migration 015: Storage Cleanup History Extensions (Admin Dashboard)
-- ============================================================================
-- Extends `public.storage_cleanup_runs` with explicit execution_type
-- (AUTOMATIC / MANUAL), triggered_by (Admin identity or Cron), and top-level
-- error_message for clear filtering, searching, and audit observability in the
-- EasyToPrint Admin Supabase Storage Management dashboard.
-- ============================================================================

ALTER TABLE public.storage_cleanup_runs
  ADD COLUMN IF NOT EXISTS execution_type VARCHAR(24) NOT NULL DEFAULT 'AUTOMATIC',
  ADD COLUMN IF NOT EXISTS triggered_by VARCHAR(160) NOT NULL DEFAULT 'Cron',
  ADD COLUMN IF NOT EXISTS error_message TEXT;

UPDATE public.storage_cleanup_runs
SET
  execution_type = CASE
    WHEN UPPER(COALESCE(trigger_source, '')) = 'MANUAL_ADMIN' THEN 'MANUAL'
    ELSE 'AUTOMATIC'
  END,
  triggered_by = CASE
    WHEN UPPER(COALESCE(trigger_source, '')) = 'MANUAL_ADMIN' THEN 'Admin'
    WHEN UPPER(COALESCE(trigger_source, '')) = 'AUTHENTICATED_CRON_HTTP' THEN 'Cron (HTTP)'
    ELSE 'Cron'
  END
WHERE execution_type IS NULL
   OR triggered_by IS NULL
   OR (execution_type = 'AUTOMATIC' AND UPPER(COALESCE(trigger_source, '')) = 'MANUAL_ADMIN');

CREATE INDEX IF NOT EXISTS idx_storage_cleanup_runs_execution_type
  ON public.storage_cleanup_runs (execution_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_storage_cleanup_runs_triggered_by
  ON public.storage_cleanup_runs (triggered_by, started_at DESC);
