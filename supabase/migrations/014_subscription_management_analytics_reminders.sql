-- EasyToPrint Migration 014: Complete Subscription Management, Analytics, History, Emails & Daily Reminders
-- Strictly idempotent and preserves all existing production subscription and payment data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Extend public.subscriptions cleanly (preserve history via is_current + superseded references)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (
      status IN (
        'ACTIVE', 'EXPIRED', 'TRIAL', 'TRIALING', 'PAST_DUE', 'CANCELLED', 'SUSPENDED',
        'EXPIRING_SOON', 'EXPIRING_TODAY', 'PENDING_PAYMENT', 'PAYMENT_FAILED', 'SUPERSEDED',
        'active', 'trialing', 'past_due', 'cancelled', 'expired', 'suspended',
        'pending_payment', 'payment_failed', 'superseded'
      )
    );

    ALTER TABLE public.subscriptions
      ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
      ADD COLUMN IF NOT EXISTS total_duration_days INTEGER NOT NULL DEFAULT 30,
      ADD COLUMN IF NOT EXISTS event_action TEXT NOT NULL DEFAULT 'NEW_PURCHASE',
      ADD COLUMN IF NOT EXISTS previous_subscription_id UUID,
      ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS notes JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_shop_current_end
  ON public.subscriptions (shop_id, is_current, current_period_end DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_order
  ON public.subscriptions (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

-- Ensure only one is_current = true row per shop_id without deleting historical rows
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY shop_id
           ORDER BY
             CASE WHEN UPPER(status) IN ('ACTIVE','TRIAL','TRIALING') THEN 0 ELSE 1 END,
             created_at DESC,
             id DESC
         ) AS rn
  FROM public.subscriptions
  WHERE is_current = true
)
UPDATE public.subscriptions s
SET is_current = false,
    superseded_at = COALESCE(superseded_at, NOW()),
    status = CASE WHEN UPPER(s.status) IN ('ACTIVE','TRIAL','TRIALING') THEN 'SUPERSEDED' ELSE s.status END
FROM ranked r
WHERE s.id = r.id AND r.rn > 1;

-- 2. Extend public.subscription_payments for authoritative net revenue & refunds
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'PENDING',
  billing_period TEXT NOT NULL DEFAULT 'MONTHLY',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS subscription_id UUID,
  ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'PURCHASE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_payments_rzp_payment_id
  ON public.subscription_payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_payments_status_date
  ON public.subscription_payments (status, payment_date DESC, created_at DESC);

-- 3. Complete append-only Shop Subscription History timeline
CREATE TABLE IF NOT EXISTS public.subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id TEXT NOT NULL,
  subscription_id UUID,
  payment_id UUID,
  event_type TEXT NOT NULL,
  previous_plan_id TEXT,
  previous_plan_name TEXT,
  new_plan_id TEXT,
  new_plan_name TEXT,
  amount NUMERIC(10,2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'INFO',
  description TEXT NOT NULL,
  actor_role TEXT NOT NULL DEFAULT 'SYSTEM',
  actor_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_history_shop_created
  ON public.subscription_history (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_history_sub_created
  ON public.subscription_history (subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_history_event_type
  ON public.subscription_history (event_type, created_at DESC);

-- 4. Authoritative Email Delivery Logs with Idempotency & Retry Support
CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id TEXT,
  subscription_id UUID,
  payment_order_id TEXT,
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL CHECK (
    email_type IN (
      'PURCHASE_CONFIRMATION',
      'EXPIRY_REMINDER_3D',
      'EXPIRY_REMINDER_2D',
      'EXPIRY_REMINDER_1D',
      'EXPIRY_REMINDER_0D'
    )
  ),
  idempotency_key TEXT UNIQUE,
  subject TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'RETRYING')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_shop
  ON public.email_delivery_logs (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_status_retry
  ON public.email_delivery_logs (status, next_retry_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_type_status
  ON public.email_delivery_logs (email_type, status);

-- 5. Automated Daily Subscription Expiry Reminders Deduplication Ledger
CREATE TABLE IF NOT EXISTS public.subscription_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL,
  shop_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL CHECK (
    reminder_type IN ('3_DAYS_BEFORE', '2_DAYS_BEFORE', '1_DAY_BEFORE', 'EXPIRY_DAY')
  ),
  target_expiry_date DATE NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED_RENEWED', 'CANCELLED')
  ),
  email_log_id UUID,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscription_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_subscription_reminders_shop_created
  ON public.subscription_reminders (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_reminders_status_date
  ON public.subscription_reminders (status, target_expiry_date);

-- 6. Safe Idempotent Backfill for Existing Live Subscription Payments & History
INSERT INTO public.subscription_payments (
  shop_id,
  plan_id,
  subscription_id,
  razorpay_order_id,
  razorpay_payment_id,
  amount,
  net_amount,
  currency,
  status,
  billing_period,
  payment_method,
  payment_date,
  event_type,
  metadata,
  created_at,
  updated_at
)
SELECT
  po.shop_id::text,
  COALESCE(po.metadata->>'planId', po.metadata->'notes'->>'planId', 'plan_growth'),
  (
    SELECT s.id
    FROM public.subscriptions s
    WHERE s.shop_id = po.shop_id
      AND (s.razorpay_order_id = po.provider_order_id OR s.payment_id = pt.provider_payment_id)
    ORDER BY s.created_at DESC
    LIMIT 1
  ),
  po.provider_order_id,
  pt.provider_payment_id,
  ROUND((po.amount_minor::numeric / 100.0), 2),
  ROUND((po.amount_minor::numeric / 100.0), 2),
  COALESCE(po.currency, 'INR'),
  CASE
    WHEN UPPER(po.status) IN ('PAID', 'CAPTURED', 'SUCCESS', 'SETTLED') THEN 'SUCCESS'
    WHEN UPPER(po.status) = 'FAILED' THEN 'FAILED'
    WHEN UPPER(po.status) = 'REFUNDED' THEN 'REFUNDED'
    ELSE 'PENDING'
  END,
  UPPER(COALESCE(po.metadata->>'billingPeriod', po.metadata->'notes'->>'billingPeriod', 'MONTHLY')),
  NULL,
  COALESCE(pt.verified_at, po.updated_at, po.created_at),
  'PURCHASE',
  COALESCE(po.metadata, '{}'::jsonb),
  po.created_at,
  po.updated_at
FROM public.payment_orders po
LEFT JOIN public.payment_transactions pt
  ON pt.payment_order_id = po.id
  AND UPPER(pt.status) IN ('CAPTURED', 'PAID', 'SUCCESS')
WHERE po.purpose = 'SUBSCRIPTION'
ON CONFLICT (razorpay_order_id) DO UPDATE SET
  razorpay_payment_id = COALESCE(public.subscription_payments.razorpay_payment_id, EXCLUDED.razorpay_payment_id),
  subscription_id = COALESCE(public.subscription_payments.subscription_id, EXCLUDED.subscription_id),
  status = CASE WHEN public.subscription_payments.status = 'PENDING' AND EXCLUDED.status = 'SUCCESS' THEN 'SUCCESS' ELSE public.subscription_payments.status END,
  payment_date = COALESCE(public.subscription_payments.payment_date, EXCLUDED.payment_date),
  net_amount = COALESCE(public.subscription_payments.net_amount, EXCLUDED.net_amount),
  updated_at = NOW();

-- Backfill razorpay_order_id and total_duration_days on subscriptions where missing
UPDATE public.subscriptions s
SET
  razorpay_order_id = COALESCE(
    s.razorpay_order_id,
    (
      SELECT sp.razorpay_order_id
      FROM public.subscription_payments sp
      WHERE sp.razorpay_payment_id = COALESCE(s.razorpay_payment_id, s.payment_id)
         OR sp.subscription_id = s.id
      ORDER BY sp.created_at DESC
      LIMIT 1
    )
  ),
  total_duration_days = CASE
    WHEN COALESCE(s.total_duration_days, 30) <= 0 OR s.total_duration_days = 30
    THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (s.current_period_end - s.current_period_start)) / 86400.0)::int)
    ELSE s.total_duration_days
  END
WHERE s.razorpay_order_id IS NULL OR s.total_duration_days = 30;

-- Backfill initial FIRST_PURCHASE history record for existing subscriptions lacking history
INSERT INTO public.subscription_history (
  shop_id,
  subscription_id,
  payment_id,
  event_type,
  new_plan_id,
  new_plan_name,
  amount,
  currency,
  payment_reference,
  status,
  description,
  actor_role,
  metadata,
  created_at
)
SELECT
  s.shop_id::text,
  s.id,
  sp.id,
  'FIRST_PURCHASE',
  s.plan_id,
  COALESCE(p.name, s.plan_id),
  COALESCE(s.amount_paid, 0),
  'INR',
  COALESCE(s.razorpay_payment_id, s.payment_id, s.razorpay_order_id),
  CASE WHEN UPPER(s.status) IN ('ACTIVE','TRIAL','TRIALING') THEN 'SUCCESS' ELSE UPPER(s.status) END,
  'Subscription activated for plan ' || COALESCE(p.name, s.plan_id),
  'SYSTEM',
  jsonb_build_object(
    'billingPeriod', s.billing_period,
    'razorpayOrderId', s.razorpay_order_id,
    'razorpayPaymentId', COALESCE(s.razorpay_payment_id, s.payment_id),
    'backfilled', true
  ),
  s.created_at
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id::text = s.plan_id::text
LEFT JOIN public.subscription_payments sp ON (sp.subscription_id = s.id OR sp.razorpay_payment_id = COALESCE(s.razorpay_payment_id, s.payment_id))
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscription_history h
  WHERE h.subscription_id = s.id AND h.event_type IN ('FIRST_PURCHASE', 'RENEWAL', 'UPGRADE', 'DOWNGRADE')
);
