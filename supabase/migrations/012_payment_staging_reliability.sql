-- Phase 9: Payment Lifecycle & Pre-Staging Reliability Hardening
-- Additive & idempotent migration: tracks per-checkout staged files in Supabase Storage,
-- isolates independent checkout sessions, and links payment_orders cleanly to staged print jobs.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Durable table for pre-uploaded customer print files scoped by checkoutSessionId & shopId
CREATE TABLE IF NOT EXISTS public.staged_checkout_files (
  id VARCHAR(64) PRIMARY KEY,
  checkout_session_id VARCHAR(128) NOT NULL,
  shop_id VARCHAR(128) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  sha256 VARCHAR(64) NOT NULL,
  verified_page_count INT NOT NULL DEFAULT 1 CHECK (verified_page_count > 0),
  storage_bucket VARCHAR(128) NOT NULL DEFAULT 'print-documents',
  object_path TEXT NOT NULL,
  storage_verified BOOLEAN NOT NULL DEFAULT false,
  upload_status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
  linked_job_id VARCHAR(64),
  file_data BYTEA,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staged_checkout_files_session
  ON public.staged_checkout_files (checkout_session_id, shop_id);

CREATE INDEX IF NOT EXISTS idx_staged_checkout_files_expires
  ON public.staged_checkout_files (expires_at)
  WHERE upload_status != 'DELETED';

-- 2. Add checkout_session_id and staging_status to print_agent_jobs for isolated lifecycle tracking
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'print_agent_jobs'
  ) THEN
    ALTER TABLE public.print_agent_jobs ADD COLUMN IF NOT EXISTS checkout_session_id VARCHAR(128);
    ALTER TABLE public.print_agent_jobs ADD COLUMN IF NOT EXISTS staging_status VARCHAR(32) DEFAULT 'READY';
    CREATE INDEX IF NOT EXISTS idx_print_agent_jobs_checkout_session
      ON public.print_agent_jobs (checkout_session_id)
      WHERE checkout_session_id IS NOT NULL;
  END IF;
END;
$$;

-- 3. Add checkout_session_id and staged_job_id to payment_orders for transactional correlation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_orders'
  ) THEN
    ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS checkout_session_id VARCHAR(128);
    ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS staged_job_id VARCHAR(64);
    CREATE INDEX IF NOT EXISTS idx_payment_orders_checkout_session
      ON public.payment_orders (checkout_session_id)
      WHERE checkout_session_id IS NOT NULL;
  END IF;
END;
$$;
