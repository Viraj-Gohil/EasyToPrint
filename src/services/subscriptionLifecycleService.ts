/**
 * EasyToPrint Authoritative Subscription Lifecycle, Revenue Analytics & History Service
 *
 * Single source of truth for:
 * - Atomic post-payment subscription activation (new purchase, renewal, upgrade, downgrade)
 * - Append-only subscription_history timeline (never overwrites history)
 * - Remaining days & effective status computation in Asia/Kolkata (IST)
 * - Authoritative revenue analytics (gross, refunds, net; zero double-counting)
 * - Admin subscription dashboard, shop detail view, filters, search, sort & pagination
 */

import type { Pool, PoolClient } from 'pg';
import { logger, deepRedact } from '../lib/security.js';
import {
  resolveShopOwnerContact,
  sendSubscriptionPurchaseConfirmationEmail,
  sendViaResendApi,
  type EmailTransportFn,
  type PurchaseConfirmationPayload,
  type QueryableDb
} from './subscriptionEmailService.js';

export type EffectiveSubscriptionStatus =
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'EXPIRING_TODAY'
  | 'EXPIRED'
  | 'TRIAL'
  | 'CANCELLED'
  | 'SUSPENDED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED';

export interface RemainingDaysComputation {
  remainingDays: number;
  totalDurationDays: number;
  effectiveStatus: EffectiveSubscriptionStatus;
}

const IST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/**
 * Extracts YYYY-MM-DD in Asia/Kolkata (IST) and returns UTC midnight Date for exact calendar-day diff.
 */
export function getIstDateMidnightMs(dateInput: Date | string): number {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return 0;
  const parts = IST_DATE_FORMATTER.formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')?.value || '1970');
  const month = Number(parts.find((p) => p.type === 'month')?.value || '01');
  const day = Number(parts.find((p) => p.type === 'day')?.value || '01');
  return Date.UTC(year, month - 1, day);
}

export function getIstDateString(dateInput: Date | string = new Date()): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return '';
  const parts = IST_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value || '1970';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

/**
 * Computes exact remaining calendar days (IST) and effective lifecycle status badge:
 * - remainingDays > 3 -> ACTIVE (or TRIAL if on trial)
 * - 1 <= remainingDays <= 3 -> EXPIRING_SOON
 * - remainingDays === 0 -> EXPIRING_TODAY
 * - remainingDays < 0 -> EXPIRED
 */
export function computeRemainingDaysAndStatus(params: {
  startDate?: Date | string | null;
  expiryDate?: Date | string | null;
  dbStatus?: string | null;
  paymentStatus?: string | null;
  now?: Date;
}): RemainingDaysComputation {
  const now = params.now || new Date();
  const normalizedDbStatus = String(params.dbStatus || '').trim().toUpperCase();
  const normalizedPaymentStatus = String(params.paymentStatus || '').trim().toUpperCase();

  let totalDurationDays = 30;
  if (params.startDate && params.expiryDate) {
    const startMs = new Date(params.startDate).getTime();
    const endMs = new Date(params.expiryDate).getTime();
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
      totalDurationDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000));
    }
  }

  let remainingDays = 0;
  if (params.expiryDate) {
    const expiryIstMidnight = getIstDateMidnightMs(params.expiryDate);
    const todayIstMidnight = getIstDateMidnightMs(now);
    remainingDays = Math.round((expiryIstMidnight - todayIstMidnight) / 86_400_000);
  }

  if (normalizedDbStatus === 'PAYMENT_FAILED' || (normalizedDbStatus === 'PENDING_PAYMENT' && normalizedPaymentStatus === 'FAILED')) {
    return { remainingDays, totalDurationDays, effectiveStatus: 'PAYMENT_FAILED' };
  }
  if (normalizedDbStatus === 'PENDING_PAYMENT') {
    return { remainingDays, totalDurationDays, effectiveStatus: 'PAYMENT_PENDING' };
  }
  if (normalizedDbStatus === 'CANCELLED') {
    return { remainingDays, totalDurationDays, effectiveStatus: 'CANCELLED' };
  }
  if (normalizedDbStatus === 'SUSPENDED') {
    return { remainingDays, totalDurationDays, effectiveStatus: 'SUSPENDED' };
  }
  if (normalizedDbStatus === 'EXPIRED' || (params.expiryDate && remainingDays < 0)) {
    return { remainingDays, totalDurationDays, effectiveStatus: 'EXPIRED' };
  }

  if (normalizedDbStatus === 'TRIAL' || normalizedDbStatus === 'TRIALING') {
    if (remainingDays === 0) return { remainingDays, totalDurationDays, effectiveStatus: 'EXPIRING_TODAY' };
    if (remainingDays > 0 && remainingDays <= 3) return { remainingDays, totalDurationDays, effectiveStatus: 'EXPIRING_SOON' };
    return { remainingDays, totalDurationDays, effectiveStatus: 'TRIAL' };
  }

  if (remainingDays === 0) {
    return { remainingDays, totalDurationDays, effectiveStatus: 'EXPIRING_TODAY' };
  }
  if (remainingDays > 0 && remainingDays <= 3) {
    return { remainingDays, totalDurationDays, effectiveStatus: 'EXPIRING_SOON' };
  }
  return { remainingDays, totalDurationDays, effectiveStatus: 'ACTIVE' };
}

export interface ActivateSubscriptionInput {
  shopId: string;
  planId: string;
  billingPeriod: 'MONTHLY' | 'YEARLY' | string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string | null;
  amountPaid: number;
  currency?: string;
  paymentMethod?: string | null;
  isIntroductory?: boolean;
  renewalPrice?: number | null;
  actorRole?: 'SHOP_OWNER' | 'ADMIN' | 'SYSTEM' | 'WEBHOOK';
  actorId?: string | null;
  periodStartOverride?: Date;
  periodEndOverride?: Date;
}

export interface ActivateSubscriptionResult {
  subscriptionId: string;
  paymentRecordId: string | null;
  shopId: string;
  planId: string;
  planName: string;
  eventAction: 'NEW_PURCHASE' | 'RENEWAL' | 'UPGRADE' | 'DOWNGRADE';
  amountPaid: number;
  startDateIso: string;
  expiryDateIso: string;
  totalDurationDays: number;
  alreadyActivated: boolean;
  emailPayload: PurchaseConfirmationPayload;
}

/**
 * Executes atomic database activation inside an existing PoolClient transaction
 * OR opens its own transaction on the provided Pool.
 *
 * Guarantees:
 * - Idempotent by razorpayPaymentId / razorpayOrderId
 * - Preserves all previous subscriptions (marks old is_current=false, status='SUPERSEDED', superseded_at=NOW())
 * - Cancels pending/failed expiry reminders on superseded subscriptions
 * - Inserts/updates subscription_payments with net_amount & payment_date
 * - Appends immutable record to subscription_history (FIRST_PURCHASE | RENEWAL | UPGRADE | DOWNGRADE)
 */
export async function activateSubscriptionInTransaction(
  clientOrPool: PoolClient | Pool,
  input: ActivateSubscriptionInput
): Promise<ActivateSubscriptionResult> {
  const isClient = typeof (clientOrPool as any).release === 'function' && !(clientOrPool as any).totalCount;
  const ownsTransaction = !isClient;
  const client: PoolClient = isClient
    ? (clientOrPool as PoolClient)
    : await (clientOrPool as Pool).connect();

  try {
    if (ownsTransaction) {
      await client.query('BEGIN');
    }

    const billingPeriodUpper = String(input.billingPeriod || 'MONTHLY').toUpperCase() === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
    const durationDays = billingPeriodUpper === 'YEARLY' ? 365 : 30;
    const currency = String(input.currency || 'INR').toUpperCase();

    // 1. Resolve authoritative plan from public.plans
    const planRes = await client.query(
      `SELECT id::text, name, slug, price_monthly::float AS price_monthly, price_yearly::float AS price_yearly,
              features, limits, renewal_price::float AS renewal_price
       FROM public.plans
       WHERE id::text = $1 OR LOWER(slug) = LOWER($1)
       LIMIT 1`,
      [input.planId]
    );

    const planRow = planRes.rows?.[0];
    const resolvedPlanId = planRow?.id || input.planId;
    const resolvedPlanName = planRow?.name || input.planId;
    const planPriceMonthly = Number(planRow?.price_monthly ?? 0);
    const planPriceYearly = Number(planRow?.price_yearly ?? 0);
    const planFeatures = Array.isArray(planRow?.features) ? planRow.features : [];
    const planLimits = typeof planRow?.limits === 'object' && planRow?.limits !== null ? planRow.limits : {};

    // 2. Idempotency check: did we already activate this payment or order?
    const existingSubByPay = await client.query(
      `SELECT id::text, shop_id::text, plan_id, amount_paid::float AS amount_paid,
              current_period_start, current_period_end, total_duration_days, event_action
       FROM public.subscriptions
       WHERE razorpay_payment_id = $1 OR payment_id = $1 OR ($2 <> '' AND razorpay_order_id = $2)
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.razorpayPaymentId, input.razorpayOrderId || '']
    );

    if (existingSubByPay.rowCount && existingSubByPay.rows[0]) {
      const ex = existingSubByPay.rows[0];
      // Ensure subscription_payments row exists & is synced
      const payUpsert = await client.query(
        `INSERT INTO public.subscription_payments (
           shop_id, plan_id, subscription_id, razorpay_order_id, razorpay_payment_id, razorpay_signature,
           amount, net_amount, currency, status, billing_period, payment_method, payment_date, event_type
         )
         VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $7, $8, 'SUCCESS', $9, $10, NOW(), $11)
         ON CONFLICT (razorpay_order_id) DO UPDATE SET
           subscription_id = COALESCE(public.subscription_payments.subscription_id, EXCLUDED.subscription_id),
           razorpay_payment_id = COALESCE(public.subscription_payments.razorpay_payment_id, EXCLUDED.razorpay_payment_id),
           status = CASE WHEN public.subscription_payments.status IN ('PENDING','FAILED') THEN 'SUCCESS' ELSE public.subscription_payments.status END,
           net_amount = COALESCE(public.subscription_payments.net_amount, EXCLUDED.net_amount),
           payment_date = COALESCE(public.subscription_payments.payment_date, NOW()),
           updated_at = NOW()
         RETURNING id::text`,
        [
          input.shopId,
          resolvedPlanId,
          ex.id,
          input.razorpayOrderId,
          input.razorpayPaymentId,
          input.razorpaySignature || null,
          input.amountPaid,
          currency,
          billingPeriodUpper,
          input.paymentMethod || null,
          ex.event_action || 'NEW_PURCHASE'
        ]
      );

      const contact = await resolveShopOwnerContact(client, input.shopId);
      if (ownsTransaction) await client.query('COMMIT');

      const startIso = new Date(ex.current_period_start).toISOString();
      const endIso = new Date(ex.current_period_end).toISOString();
      return {
        subscriptionId: ex.id,
        paymentRecordId: payUpsert.rows[0]?.id || null,
        shopId: input.shopId,
        planId: resolvedPlanId,
        planName: resolvedPlanName,
        eventAction: (ex.event_action || 'NEW_PURCHASE') as any,
        amountPaid: Number(ex.amount_paid ?? input.amountPaid),
        startDateIso: startIso,
        expiryDateIso: endIso,
        totalDurationDays: Number(ex.total_duration_days || durationDays),
        alreadyActivated: true,
        emailPayload: {
          shopId: input.shopId,
          subscriptionId: ex.id,
          razorpayOrderId: input.razorpayOrderId,
          razorpayPaymentId: input.razorpayPaymentId,
          shopName: contact.shopName,
          ownerName: contact.ownerName,
          recipientEmail: contact.ownerEmail || '',
          planName: resolvedPlanName,
          planPrice: Number(ex.amount_paid ?? input.amountPaid),
          billingPeriod: billingPeriodUpper,
          paymentDateIso: new Date().toISOString(),
          startDateIso: startIso,
          expiryDateIso: endIso,
          totalDurationDays: Number(ex.total_duration_days || durationDays),
          features: planFeatures,
          limits: planLimits
        }
      };
    }

    // 3. Lock & inspect any current subscription for this shop to determine NEW_PURCHASE vs RENEWAL vs UPGRADE vs DOWNGRADE
    const prevSubRes = await client.query(
      `SELECT s.id::text, s.plan_id, s.status, s.current_period_end,
              p.name AS plan_name, p.price_monthly::float AS price_monthly
       FROM public.subscriptions s
       LEFT JOIN public.plans p ON p.id::text = s.plan_id::text
       WHERE s.shop_id::text = $1 AND s.is_current = true
       ORDER BY s.created_at DESC
       LIMIT 1
       FOR UPDATE OF s`,
      [input.shopId]
    );

    const prevSub = prevSubRes.rows?.[0] || null;
    let eventAction: 'NEW_PURCHASE' | 'RENEWAL' | 'UPGRADE' | 'DOWNGRADE' = 'NEW_PURCHASE';
    let historyEventType = 'FIRST_PURCHASE';

    if (prevSub) {
      const prevStatusUpper = String(prevSub.status || '').toUpperCase();
      if (prevStatusUpper === 'TRIAL' || prevStatusUpper === 'TRIALING') {
        eventAction = 'UPGRADE';
        historyEventType = 'UPGRADE';
      } else if (prevSub.plan_id === resolvedPlanId) {
        eventAction = 'RENEWAL';
        historyEventType = 'RENEWAL';
      } else if (planPriceMonthly >= Number(prevSub.price_monthly || 0)) {
        eventAction = 'UPGRADE';
        historyEventType = 'UPGRADE';
      } else {
        eventAction = 'DOWNGRADE';
        historyEventType = 'DOWNGRADE';
      }
    } else {
      // Check if shop had any prior paid subscriptions in history
      const priorPaid = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM public.subscriptions WHERE shop_id::text = $1 AND amount_paid > 0`,
        [input.shopId]
      );
      if (Number(priorPaid.rows[0]?.cnt || 0) > 0) {
        eventAction = 'RENEWAL';
        historyEventType = 'RENEWAL';
      }
    }

    // 4. Mark prior current subscription rows for this shop as SUPERSEDED (without overwriting or deleting them!)
    if (prevSub) {
      await client.query(
        `UPDATE public.subscriptions
         SET is_current = false,
             superseded_at = NOW(),
             auto_renew = false,
             status = CASE
               WHEN UPPER(status) IN ('ACTIVE', 'TRIAL', 'TRIALING', 'EXPIRING_SOON', 'EXPIRING_TODAY') THEN 'SUPERSEDED'
               ELSE status
             END,
             updated_at = NOW()
         WHERE shop_id::text = $1 AND is_current = true`,
        [input.shopId]
      );

      // Stop future reminders for superseded subscriptions
      await client.query(
        `UPDATE public.subscription_reminders
         SET status = 'SKIPPED_RENEWED', updated_at = NOW()
         WHERE shop_id = $1 AND status IN ('PENDING', 'FAILED')`,
        [input.shopId]
      );
    }

    // 5. Compute start & expiry timestamps cleanly
    const now = new Date();
    const startDate = input.periodStartOverride || now;
    // Note: if renewing an active non-expired same/higher plan before expiry? Standard EasyToPrint starts new cycle from payment/now unless specified,
    // keeping startDate = now and expiryDate = startDate + durationDays so Admin start/expiry/remainingDays match totalDurationDays cleanly.
    const expiryDate = input.periodEndOverride || new Date(startDate.getTime() + durationDays * 86_400_000);
    const computedDurationDays = Math.max(1, Math.round((expiryDate.getTime() - startDate.getTime()) / 86_400_000));

    // 6. Insert new authoritative active subscription row
    const insertSubRes = await client.query(
      `INSERT INTO public.subscriptions (
         shop_id, plan_id, status, billing_period,
         current_period_start, current_period_end,
         amount_paid, payment_id, razorpay_payment_id, razorpay_order_id,
         auto_renew, is_introductory_pricing, renewal_price,
         total_duration_days, event_action, previous_subscription_id,
         is_current, notes, updated_at
       )
       VALUES (
         $1::uuid, $2, 'ACTIVE', $3,
         $4::timestamptz, $5::timestamptz,
         $6, $7, $7, $8,
         true, $9, $10,
         $11, $12, $13,
         true, $14::jsonb, NOW()
       )
       RETURNING id::text, current_period_start, current_period_end`,
      [
        input.shopId,
        resolvedPlanId,
        billingPeriodUpper,
        startDate.toISOString(),
        expiryDate.toISOString(),
        input.amountPaid,
        input.razorpayPaymentId,
        input.razorpayOrderId,
        Boolean(input.isIntroductory),
        input.renewalPrice ?? (billingPeriodUpper === 'YEARLY' ? planPriceYearly : planPriceMonthly),
        computedDurationDays,
        eventAction,
        prevSub?.id || null,
        JSON.stringify({
          planName: resolvedPlanName,
          paymentMethod: input.paymentMethod || 'razorpay',
          actorRole: input.actorRole || 'SYSTEM',
          actorId: input.actorId || null
        })
      ]
    );

    const newSubId = insertSubRes.rows[0].id;
    const startIso = new Date(insertSubRes.rows[0].current_period_start).toISOString();
    const expiryIso = new Date(insertSubRes.rows[0].current_period_end).toISOString();

    // 7. Upsert authoritative subscription_payments record (zero duplicates!)
    const payRes = await client.query(
      `INSERT INTO public.subscription_payments (
         shop_id, plan_id, subscription_id, razorpay_order_id, razorpay_payment_id, razorpay_signature,
         amount, refunded_amount, net_amount, refund_status, currency, status,
         billing_period, payment_method, payment_date, event_type, metadata, created_at, updated_at
       )
       VALUES (
         $1, $2, $3::uuid, $4, $5, $6,
         $7, 0, $7, 'NONE', $8, 'SUCCESS',
         $9, $10, NOW(), $11, $12::jsonb, NOW(), NOW()
       )
       ON CONFLICT (razorpay_order_id) DO UPDATE SET
         subscription_id = EXCLUDED.subscription_id,
         razorpay_payment_id = COALESCE(public.subscription_payments.razorpay_payment_id, EXCLUDED.razorpay_payment_id),
         razorpay_signature = COALESCE(public.subscription_payments.razorpay_signature, EXCLUDED.razorpay_signature),
         amount = EXCLUDED.amount,
         net_amount = GREATEST(0, EXCLUDED.amount - COALESCE(public.subscription_payments.refunded_amount, 0)),
         status = 'SUCCESS',
         payment_method = COALESCE(EXCLUDED.payment_method, public.subscription_payments.payment_method),
         payment_date = COALESCE(public.subscription_payments.payment_date, NOW()),
         event_type = EXCLUDED.event_type,
         updated_at = NOW()
       RETURNING id::text`,
      [
        input.shopId,
        resolvedPlanId,
        newSubId,
        input.razorpayOrderId,
        input.razorpayPaymentId,
        input.razorpaySignature || null,
        input.amountPaid,
        currency,
        billingPeriodUpper,
        input.paymentMethod || 'upi',
        eventAction,
        JSON.stringify({
          planName: resolvedPlanName,
          billingPeriod: billingPeriodUpper,
          isIntroductory: Boolean(input.isIntroductory)
        })
      ]
    );
    const paymentRecordId = payRes.rows[0]?.id || null;

    // 8. Reset/Initialize billing-period usage_records cleanly
    await client.query(
      `INSERT INTO public.usage_records
         (shop_id, subscription_id, billing_period_start, billing_period_end, print_jobs_used, printer_connections_used)
       VALUES
         ($1, $2::uuid, $3::timestamptz, $4::timestamptz, 0, 0)
       ON CONFLICT (shop_id, billing_period_start) DO UPDATE SET
         subscription_id = EXCLUDED.subscription_id,
         print_jobs_used = 0,
         updated_at = NOW()`,
      [input.shopId, newSubId, startIso, expiryIso]
    ).catch(() => {});

    // 9. Update shops.current_plan_id
    await client.query(
      `UPDATE public.shops SET current_plan_id = $1, updated_at = NOW() WHERE id::text = $2`,
      [resolvedPlanId, input.shopId]
    );

    // 10. Append immutable event to subscription_history & legacy subscription_events
    const description = prevSub
      ? `${eventAction === 'RENEWAL' ? 'Renewed' : eventAction === 'UPGRADE' ? 'Upgraded' : 'Switched'} from ${prevSub.plan_name || prevSub.plan_id} to ${resolvedPlanName} (${billingPeriodUpper})`
      : `First subscription purchase activated: ${resolvedPlanName} (${billingPeriodUpper})`;

    await client.query(
      `INSERT INTO public.subscription_history (
         shop_id, subscription_id, payment_id, event_type,
         previous_plan_id, previous_plan_name, new_plan_id, new_plan_name,
         amount, currency, payment_reference, status, description, actor_role, actor_id, metadata
       )
       VALUES (
         $1, $2::uuid, $3::uuid, $4,
         $5, $6, $7, $8,
         $9, $10, $11, 'SUCCESS', $12, $13, $14, $15::jsonb
       )`,
      [
        input.shopId,
        newSubId,
        paymentRecordId,
        historyEventType,
        prevSub?.plan_id || null,
        prevSub?.plan_name || null,
        resolvedPlanId,
        resolvedPlanName,
        input.amountPaid,
        currency,
        input.razorpayPaymentId,
        description,
        input.actorRole || 'SHOP_OWNER',
        input.actorId || null,
        JSON.stringify({
          razorpayOrderId: input.razorpayOrderId,
          razorpayPaymentId: input.razorpayPaymentId,
          billingPeriod: billingPeriodUpper,
          previousSubscriptionId: prevSub?.id || null
        })
      ]
    );

    await client.query(
      `INSERT INTO public.subscription_events (subscription_id, shop_id, event_type, metadata)
       VALUES ($1::uuid, $2, $3, $4::jsonb)`,
      [
        newSubId,
        input.shopId,
        historyEventType,
        JSON.stringify({
          planId: resolvedPlanId,
          planName: resolvedPlanName,
          amount: input.amountPaid,
          billingPeriod: billingPeriodUpper,
          paymentId: input.razorpayPaymentId,
          orderId: input.razorpayOrderId
        })
      ]
    ).catch(() => {});

    const contact = await resolveShopOwnerContact(client, input.shopId);

    if (ownsTransaction) {
      await client.query('COMMIT');
    }

    return {
      subscriptionId: newSubId,
      paymentRecordId,
      shopId: input.shopId,
      planId: resolvedPlanId,
      planName: resolvedPlanName,
      eventAction,
      amountPaid: input.amountPaid,
      startDateIso: startIso,
      expiryDateIso: expiryIso,
      totalDurationDays: computedDurationDays,
      alreadyActivated: false,
      emailPayload: {
        shopId: input.shopId,
        subscriptionId: newSubId,
        paymentOrderId: paymentRecordId,
        razorpayOrderId: input.razorpayOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
        shopName: contact.shopName,
        ownerName: contact.ownerName,
        recipientEmail: contact.ownerEmail || '',
        planName: resolvedPlanName,
        planPrice: input.amountPaid,
        billingPeriod: billingPeriodUpper,
        paymentDateIso: new Date().toISOString(),
        startDateIso: startIso,
        expiryDateIso: expiryIso,
        totalDurationDays: computedDurationDays,
        features: planFeatures,
        limits: planLimits
      }
    };
  } catch (err) {
    if (ownsTransaction) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw err;
  } finally {
    if (!isClient) {
      client.release();
    }
  }
}

/**
 * Triggers confirmation email safely after transaction commit (idempotent across duplicate calls/webhooks).
 */
export async function dispatchConfirmationEmailPostCommit(
  db: QueryableDb,
  activation: ActivateSubscriptionResult,
  transport: EmailTransportFn = sendViaResendApi
) {
  try {
    return await sendSubscriptionPurchaseConfirmationEmail(db, activation.emailPayload, transport);
  } catch (err: any) {
    logger.warn('Post-commit purchase confirmation email failed safely', {
      subscriptionId: activation.subscriptionId,
      error: deepRedact(err)
    });
    return { emailLogId: null, status: 'FAILED' as const, errorMessage: err?.message || 'Email error' };
  }
}

/**
 * Records a subscription payment failure in `subscription_payments` + `subscription_history`.
 * NEVER activates or alters an existing active subscription.
 */
export async function recordSubscriptionPaymentFailure(
  db: QueryableDb,
  params: {
    shopId?: string | null;
    planId?: string | null;
    razorpayOrderId: string;
    razorpayPaymentId?: string | null;
    amountPaid?: number;
    billingPeriod?: string;
    reason?: string;
    actorRole?: string;
  }
): Promise<void> {
  try {
    // Check existing order metadata for shop/plan if not explicitly provided
    const payCheck = await db.query(
      `SELECT id::text, shop_id, plan_id, amount::float AS amount, status, billing_period
       FROM public.subscription_payments
       WHERE razorpay_order_id = $1
       LIMIT 1`,
      [params.razorpayOrderId]
    );

    const existing = payCheck.rows?.[0];
    // Never downgrade a verified paid payment!
    if (existing && ['SUCCESS', 'PAID', 'CAPTURED'].includes(String(existing.status).toUpperCase())) {
      return;
    }

    let resolvedShopId = existing?.shop_id || params.shopId || null;
    let resolvedPlanId = existing?.plan_id || params.planId || 'plan_growth';
    let resolvedAmount = existing?.amount ?? params.amountPaid ?? 0;
    let resolvedPeriod = existing?.billing_period || params.billingPeriod || 'MONTHLY';

    if (!resolvedShopId) {
      const poRes = await db.query(
        `SELECT shop_id::text, amount_minor::float / 100 AS amount, metadata
         FROM public.payment_orders
         WHERE provider_order_id = $1 AND purpose = 'SUBSCRIPTION'
         LIMIT 1`,
        [params.razorpayOrderId]
      );
      if (poRes.rows?.[0]) {
        resolvedShopId = poRes.rows[0].shop_id;
        resolvedPlanId = poRes.rows[0].metadata?.planId || resolvedPlanId;
        resolvedAmount = Number(poRes.rows[0].amount || resolvedAmount);
        resolvedPeriod = poRes.rows[0].metadata?.billingPeriod || resolvedPeriod;
      }
    }

    if (!resolvedShopId || resolvedShopId === 'platform') return;

    const failReason = params.reason || 'Payment failed at Razorpay gateway';

    const upRes = await db.query(
      `INSERT INTO public.subscription_payments (
         shop_id, plan_id, razorpay_order_id, razorpay_payment_id, amount, net_amount,
         currency, status, billing_period, failure_reason, event_type, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 0, 'INR', 'FAILED', $6, $7, 'PURCHASE', NOW())
       ON CONFLICT (razorpay_order_id) DO UPDATE SET
         status = CASE
           WHEN public.subscription_payments.status IN ('SUCCESS','PAID','CAPTURED') THEN public.subscription_payments.status
           ELSE 'FAILED'
         END,
         net_amount = CASE
           WHEN public.subscription_payments.status IN ('SUCCESS','PAID','CAPTURED') THEN public.subscription_payments.net_amount
           ELSE 0
         END,
         razorpay_payment_id = COALESCE(public.subscription_payments.razorpay_payment_id, EXCLUDED.razorpay_payment_id),
         failure_reason = EXCLUDED.failure_reason,
         updated_at = NOW()
       RETURNING id::text`,
      [resolvedShopId, resolvedPlanId, params.razorpayOrderId, params.razorpayPaymentId || null, resolvedAmount, resolvedPeriod, failReason]
    );

    await db.query(
      `INSERT INTO public.subscription_history (
         shop_id, payment_id, event_type, new_plan_id, amount,
         payment_reference, status, description, actor_role, metadata
       )
       VALUES ($1, $2::uuid, 'PAYMENT_FAILED', $3, $4, $5, 'FAILED', $6, $7, $8::jsonb)`,
      [
        resolvedShopId,
        upRes.rows[0]?.id || null,
        resolvedPlanId,
        resolvedAmount,
        params.razorpayPaymentId || params.razorpayOrderId,
        `Subscription payment failed: ${failReason}`,
        params.actorRole || 'WEBHOOK',
        JSON.stringify({ razorpayOrderId: params.razorpayOrderId, reason: failReason })
      ]
    );
  } catch (err: any) {
    logger.warn('Failed to record subscription payment failure cleanly', {
      orderId: params.razorpayOrderId,
      error: deepRedact(err)
    });
  }
}

/**
 * Records a full or partial subscription refund so net revenue and history remain exact.
 */
export async function recordSubscriptionRefund(
  db: QueryableDb,
  params: {
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
    refundAmount: number;
    providerRefundId?: string | null;
    reason?: string;
    actorRole?: 'ADMIN' | 'WEBHOOK' | 'SYSTEM';
    actorId?: string | null;
  }
): Promise<{ updated: boolean; refundStatus: 'PARTIAL' | 'FULL' | 'NONE'; netAmount: number }> {
  const payRes = await db.query(
    `SELECT * FROM public.subscription_payments
     WHERE ($1 <> '' AND razorpay_payment_id = $1)
        OR ($2 <> '' AND razorpay_order_id = $2)
     ORDER BY created_at DESC
     LIMIT 1`,
    [params.razorpayPaymentId || '', params.razorpayOrderId || '']
  );

  if (!payRes.rowCount || !payRes.rows[0]) {
    return { updated: false, refundStatus: 'NONE', netAmount: 0 };
  }

  const pay = payRes.rows[0];
  const gross = Number(pay.amount || 0);
  const currentRefunded = Number(pay.refunded_amount || 0);
  const nextRefunded = Math.min(gross, Math.max(0, currentRefunded + Number(params.refundAmount || 0)));
  const netAmount = Math.max(0, Number((gross - nextRefunded).toFixed(2)));
  const isFullRefund = nextRefunded >= gross && gross > 0;
  const refundStatus: 'PARTIAL' | 'FULL' | 'NONE' =
    nextRefunded <= 0 ? 'NONE' : isFullRefund ? 'FULL' : 'PARTIAL';
  const nextPayStatus = isFullRefund ? 'REFUNDED' : nextRefunded > 0 ? 'PARTIAL_REFUND' : pay.status;

  await db.query(
    `UPDATE public.subscription_payments
     SET refunded_amount = $2,
         net_amount = $3,
         refund_status = $4,
         status = $5,
         metadata = COALESCE(metadata, '{}'::jsonb) || $6::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [
      pay.id,
      nextRefunded,
      netAmount,
      refundStatus,
      nextPayStatus,
      JSON.stringify({
        lastRefundId: params.providerRefundId || null,
        lastRefundAmount: params.refundAmount,
        refundReason: params.reason || 'Refund processed'
      })
    ]
  );

  await db.query(
    `INSERT INTO public.subscription_history (
       shop_id, subscription_id, payment_id, event_type,
       new_plan_id, amount, payment_reference, status, description, actor_role, actor_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
    [
      pay.shop_id,
      pay.subscription_id || null,
      pay.id,
      isFullRefund ? 'REFUND_FULL' : 'REFUND_PARTIAL',
      pay.plan_id,
      Number(params.refundAmount || 0),
      params.providerRefundId || pay.razorpay_payment_id || pay.razorpay_order_id,
      isFullRefund ? 'REFUNDED' : 'PARTIAL_REFUND',
      `${isFullRefund ? 'Full' : 'Partial'} refund of ₹${Number(params.refundAmount || 0).toFixed(2)} processed (${params.reason || 'Refund'})`,
      params.actorRole || 'WEBHOOK',
      params.actorId || null,
      JSON.stringify({
        grossAmount: gross,
        totalRefunded: nextRefunded,
        netAmount,
        providerRefundId: params.providerRefundId || null
      })
    ]
  );

  // If fully refunded, mark linked active subscription CANCELLED & stop reminders
  if (isFullRefund && pay.subscription_id) {
    await db.query(
      `UPDATE public.subscriptions
       SET status = 'CANCELLED', cancelled_at = NOW(), auto_renew = false, updated_at = NOW()
       WHERE id = $1 AND UPPER(status) IN ('ACTIVE','TRIAL','TRIALING')`,
      [pay.subscription_id]
    ).catch(() => {});

    await db.query(
      `UPDATE public.subscription_reminders
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE subscription_id = $1 AND status IN ('PENDING', 'FAILED')`,
      [pay.subscription_id]
    ).catch(() => {});
  }

  return { updated: true, refundStatus, netAmount };
}

/**
 * Computes all 8 Admin Summary KPI Cards + Authoritative Revenue Analytics
 * from verified `subscription_payments` & `subscriptions` in PostgreSQL.
 */
export async function getAdminSubscriptionsOverview(db: QueryableDb) {
  // 1. Current per-shop subscription statuses computed in IST calendar days
  const subsRes = await db.query(`
    WITH latest_sub AS (
      SELECT DISTINCT ON (s.shop_id)
        s.id::text AS subscription_id,
        s.shop_id::text AS shop_id,
        s.plan_id,
        s.status,
        s.current_period_start,
        s.current_period_end,
        s.amount_paid::float AS amount_paid
      FROM public.subscriptions s
      ORDER BY s.shop_id, s.is_current DESC, s.created_at DESC
    )
    SELECT ls.*,
           (
             SELECT sp.status
             FROM public.subscription_payments sp
             WHERE sp.shop_id = ls.shop_id
             ORDER BY sp.created_at DESC
             LIMIT 1
           ) AS latest_payment_status
    FROM latest_sub ls
  `);

  let totalActive = 0;
  let totalExpired = 0;
  let expiringSoon = 0;
  let expiringToday = 0;
  let trialSubscriptions = 0;
  let cancelledSubscriptions = 0;

  const now = new Date();
  for (const row of subsRes.rows || []) {
    const computed = computeRemainingDaysAndStatus({
      startDate: row.current_period_start,
      expiryDate: row.current_period_end,
      dbStatus: row.status,
      paymentStatus: row.latest_payment_status,
      now
    });

    if (computed.effectiveStatus === 'ACTIVE') {
      totalActive += 1;
    } else if (computed.effectiveStatus === 'EXPIRING_SOON') {
      totalActive += 1; // Still active until expiry
      expiringSoon += 1;
    } else if (computed.effectiveStatus === 'EXPIRING_TODAY') {
      totalActive += 1;
      expiringSoon += 1;
      expiringToday += 1;
    } else if (computed.effectiveStatus === 'TRIAL') {
      trialSubscriptions += 1;
    } else if (computed.effectiveStatus === 'EXPIRED') {
      totalExpired += 1;
    } else if (computed.effectiveStatus === 'CANCELLED') {
      cancelledSubscriptions += 1;
    }
  }

  // 2. Authoritative Subscription Payments Aggregation (captured/paid only, never double-counted, net of refunds)
  const revenueAggRes = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN amount ELSE 0 END), 0)::float AS gross_lifetime,
      COALESCE(SUM(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN COALESCE(refunded_amount, 0) ELSE 0 END), 0)::float AS total_refunds,
      COALESCE(SUM(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN COALESCE(net_amount, GREATEST(0, amount - COALESCE(refunded_amount, 0))) ELSE 0 END), 0)::float AS net_lifetime,
      COALESCE(SUM(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED')
        AND DATE_TRUNC('month', COALESCE(payment_date, created_at) AT TIME ZONE 'Asia/Kolkata') = DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Kolkata')
        THEN COALESCE(net_amount, GREATEST(0, amount - COALESCE(refunded_amount, 0))) ELSE 0 END), 0)::float AS revenue_this_month,
      COALESCE(SUM(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED')
        AND DATE_TRUNC('year', COALESCE(payment_date, created_at) AT TIME ZONE 'Asia/Kolkata') = DATE_TRUNC('year', NOW() AT TIME ZONE 'Asia/Kolkata')
        THEN COALESCE(net_amount, GREATEST(0, amount - COALESCE(refunded_amount, 0))) ELSE 0 END), 0)::float AS revenue_this_year,
      COUNT(DISTINCT CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND') AND COALESCE(net_amount, amount) > 0 THEN shop_id END)::int AS total_paid_shops,
      COUNT(CASE WHEN UPPER(status) IN ('PENDING','FAILED') THEN 1 END)::int AS pending_or_failed_payments,
      COUNT(CASE WHEN UPPER(status) = 'PENDING' THEN 1 END)::int AS pending_payments,
      COUNT(CASE WHEN UPPER(status) = 'FAILED' THEN 1 END)::int AS failed_payments,
      COUNT(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND') THEN 1 END)::int AS successful_transactions
    FROM public.subscription_payments
  `);
  const revRow = revenueAggRes.rows[0] || {};

  // 3. Revenue Breakdown By Plan
  const byPlanRes = await db.query(`
    SELECT
      sp.plan_id,
      COALESCE(p.name, sp.plan_id) AS plan_name,
      COUNT(CASE WHEN UPPER(sp.status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN 1 END)::int AS purchase_count,
      COUNT(DISTINCT CASE WHEN UPPER(sp.status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND') THEN sp.shop_id END)::int AS unique_shops,
      COALESCE(SUM(CASE WHEN UPPER(sp.status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN sp.amount ELSE 0 END), 0)::float AS gross_revenue,
      COALESCE(SUM(CASE WHEN UPPER(sp.status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN COALESCE(sp.refunded_amount, 0) ELSE 0 END), 0)::float AS refunds,
      COALESCE(SUM(CASE WHEN UPPER(sp.status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN COALESCE(sp.net_amount, GREATEST(0, sp.amount - COALESCE(sp.refunded_amount, 0))) ELSE 0 END), 0)::float AS net_revenue
    FROM public.subscription_payments sp
    LEFT JOIN public.plans p ON p.id::text = sp.plan_id::text
    GROUP BY sp.plan_id, p.name
    ORDER BY net_revenue DESC, purchase_count DESC
  `);

  // 4. Revenue Breakdown By Shop
  const byShopRes = await db.query(`
    SELECT
      sp.shop_id,
      COALESCE(s.name, 'Shop ' || LEFT(sp.shop_id, 8)) AS shop_name,
      s.email AS shop_email,
      COUNT(CASE WHEN UPPER(sp.status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN 1 END)::int AS transactions_count,
      COALESCE(SUM(CASE WHEN UPPER(sp.status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN sp.amount ELSE 0 END), 0)::float AS gross_revenue,
      COALESCE(SUM(CASE WHEN UPPER(sp.status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN COALESCE(sp.refunded_amount, 0) ELSE 0 END), 0)::float AS refunds,
      COALESCE(SUM(CASE WHEN UPPER(sp.status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN COALESCE(sp.net_amount, GREATEST(0, sp.amount - COALESCE(sp.refunded_amount, 0))) ELSE 0 END), 0)::float AS net_revenue,
      MAX(COALESCE(sp.payment_date, sp.created_at)) AS last_payment_at
    FROM public.subscription_payments sp
    LEFT JOIN public.shops s ON s.id::text = sp.shop_id
    GROUP BY sp.shop_id, s.name, s.email
    ORDER BY net_revenue DESC, last_payment_at DESC
    LIMIT 50
  `);

  // 5. Monthly Revenue Chart & Purchase Trends (last 12 months in IST)
  const monthlyChartRes = await db.query(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', COALESCE(payment_date, created_at) AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month_key,
      TO_CHAR(DATE_TRUNC('month', COALESCE(payment_date, created_at) AT TIME ZONE 'Asia/Kolkata'), 'Mon YYYY') AS month_label,
      COALESCE(SUM(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN amount ELSE 0 END), 0)::float AS gross_revenue,
      COALESCE(SUM(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN COALESCE(refunded_amount, 0) ELSE 0 END), 0)::float AS refunds,
      COALESCE(SUM(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND','REFUNDED') THEN COALESCE(net_amount, GREATEST(0, amount - COALESCE(refunded_amount, 0))) ELSE 0 END), 0)::float AS net_revenue,
      COUNT(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND') THEN 1 END)::int AS successful_purchases,
      COUNT(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND') AND event_type IN ('NEW_PURCHASE','PURCHASE','FIRST_PURCHASE') THEN 1 END)::int AS new_purchases,
      COUNT(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND') AND event_type = 'RENEWAL' THEN 1 END)::int AS renewals,
      COUNT(CASE WHEN UPPER(status) IN ('SUCCESS','CAPTURED','PAID','PARTIAL_REFUND') AND event_type = 'UPGRADE' THEN 1 END)::int AS upgrades
    FROM public.subscription_payments
    WHERE COALESCE(payment_date, created_at) >= NOW() - INTERVAL '12 months'
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `);

  // 6. Email delivery summary counts
  const emailSummaryRes = await db.query(`
    SELECT
      COUNT(*)::int AS total_emails,
      COUNT(CASE WHEN status = 'SENT' THEN 1 END)::int AS sent_count,
      COUNT(CASE WHEN status = 'FAILED' THEN 1 END)::int AS failed_count,
      COUNT(CASE WHEN status IN ('PENDING','RETRYING') THEN 1 END)::int AS pending_count
    FROM public.email_delivery_logs
  `);
  const emailSummary = emailSummaryRes.rows[0] || {
    total_emails: 0,
    sent_count: 0,
    failed_count: 0,
    pending_count: 0
  };

  return {
    cards: {
      totalActiveSubscriptions: totalActive,
      totalExpiredSubscriptions: totalExpired,
      expiringSoonCount: expiringSoon,
      expiringTodayCount: expiringToday,
      totalSubscriptionRevenue: Number(revRow.net_lifetime || 0),
      grossSubscriptionRevenue: Number(revRow.gross_lifetime || 0),
      totalRefunds: Number(revRow.total_refunds || 0),
      thisMonthSubscriptionRevenue: Number(revRow.revenue_this_month || 0),
      totalPaidShops: Number(revRow.total_paid_shops || 0),
      trialSubscriptions,
      cancelledSubscriptions,
      pendingOrFailedPayments: Number(revRow.pending_or_failed_payments || 0),
      pendingPayments: Number(revRow.pending_payments || 0),
      failedPayments: Number(revRow.failed_payments || 0),
      successfulTransactions: Number(revRow.successful_transactions || 0)
    },
    analytics: {
      lifetimeGrossRevenue: Number(revRow.gross_lifetime || 0),
      totalRefunds: Number(revRow.total_refunds || 0),
      lifetimeNetRevenue: Number(revRow.net_lifetime || 0),
      revenueThisMonth: Number(revRow.revenue_this_month || 0),
      revenueThisYear: Number(revRow.revenue_this_year || 0),
      revenueByPlan: (byPlanRes.rows || []).map((r) => ({
        planId: r.plan_id,
        planName: r.plan_name,
        purchaseCount: Number(r.purchase_count || 0),
        uniqueShops: Number(r.unique_shops || 0),
        grossRevenue: Number(r.gross_revenue || 0),
        refunds: Number(r.refunds || 0),
        netRevenue: Number(r.net_revenue || 0)
      })),
      revenueByShop: (byShopRes.rows || []).map((r) => ({
        shopId: r.shop_id,
        shopName: r.shop_name,
        shopEmail: r.shop_email,
        transactionsCount: Number(r.transactions_count || 0),
        grossRevenue: Number(r.gross_revenue || 0),
        refunds: Number(r.refunds || 0),
        netRevenue: Number(r.net_revenue || 0),
        lastPaymentAt: r.last_payment_at
      })),
      monthlyRevenueChart: (monthlyChartRes.rows || []).map((r) => ({
        monthKey: r.month_key,
        monthLabel: r.month_label,
        grossRevenue: Number(r.gross_revenue || 0),
        refunds: Number(r.refunds || 0),
        netRevenue: Number(r.net_revenue || 0),
        successfulPurchases: Number(r.successful_purchases || 0),
        newPurchases: Number(r.new_purchases || 0),
        renewals: Number(r.renewals || 0),
        upgrades: Number(r.upgrades || 0)
      })),
      emailStats: {
        totalEmails: Number(emailSummary.total_emails || 0),
        sentCount: Number(emailSummary.sent_count || 0),
        failedCount: Number(emailSummary.failed_count || 0),
        pendingCount: Number(emailSummary.pending_count || 0)
      }
    }
  };
}

export interface ListSubscriptionsQuery {
  status?: string;
  planId?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  sortBy?: 'expiry_asc' | 'expiry_desc' | 'created_desc' | 'amount_desc';
  page?: number;
  limit?: number;
}

/**
 * Lists all shop subscriptions from PostgreSQL with live remaining days calculation,
 * search, status filters, plan filter, date range, expiry sorting, and pagination.
 */
export async function listAdminShopSubscriptions(db: QueryableDb, query: ListSubscriptionsQuery = {}) {
  const res = await db.query(`
    WITH ranked_subs AS (
      SELECT DISTINCT ON (s.shop_id)
        s.id::text AS subscription_id,
        s.shop_id::text AS shop_id,
        s.plan_id,
        s.status AS db_status,
        s.billing_period,
        s.current_period_start,
        s.current_period_end,
        s.amount_paid::float AS amount_paid,
        COALESCE(s.razorpay_payment_id, s.payment_id) AS razorpay_payment_id,
        s.razorpay_order_id,
        s.total_duration_days,
        s.auto_renew,
        s.event_action,
        s.created_at,
        s.updated_at
      FROM public.subscriptions s
      ORDER BY s.shop_id, s.is_current DESC, s.created_at DESC
    )
    SELECT
      rs.*,
      sh.name AS shop_name,
      sh.slug AS shop_slug,
      sh.shop_code,
      sh.email AS shop_email,
      sh.city AS shop_city,
      COALESCE(p.name, rs.plan_id) AS plan_name,
      p.price_monthly::float AS plan_price_monthly,
      p.price_yearly::float AS plan_price_yearly,
      COALESCE(
        NULLIF(TRIM((
          SELECT u.full_name FROM public.printflow_users u
          LEFT JOIN public.printflow_shop_mappings m ON m.client_shop_id = u.shop_id
          WHERE (u.shop_id = sh.id::text OR m.neon_shop_id = sh.id::text) AND u.role = 'SHOP_OWNER'
          ORDER BY u.created_at ASC LIMIT 1
        )), ''),
        NULLIF(TRIM((
          SELECT pr.full_name FROM public.shop_members sm
          JOIN public.profiles pr ON pr.id = sm.user_id
          WHERE sm.shop_id = sh.id AND sm.role = 'SHOP_OWNER'
          ORDER BY sm.created_at ASC LIMIT 1
        )), ''),
        'Shop Owner'
      ) AS owner_name,
      COALESCE(
        NULLIF(TRIM((
          SELECT u.email FROM public.printflow_users u
          LEFT JOIN public.printflow_shop_mappings m ON m.client_shop_id = u.shop_id
          WHERE (u.shop_id = sh.id::text OR m.neon_shop_id = sh.id::text) AND u.role = 'SHOP_OWNER'
          ORDER BY u.created_at ASC LIMIT 1
        )), ''),
        NULLIF(TRIM((
          SELECT pr.email FROM public.shop_members sm
          JOIN public.profiles pr ON pr.id = sm.user_id
          WHERE sm.shop_id = sh.id AND sm.role = 'SHOP_OWNER'
          ORDER BY sm.created_at ASC LIMIT 1
        )), ''),
        sh.email
      ) AS owner_email,
      lp.id::text AS latest_payment_record_id,
      lp.status AS latest_payment_status,
      lp.amount::float AS latest_payment_amount,
      lp.net_amount::float AS latest_payment_net_amount,
      lp.refunded_amount::float AS latest_payment_refunded_amount,
      lp.refund_status AS latest_refund_status,
      lp.razorpay_order_id AS latest_razorpay_order_id,
      lp.razorpay_payment_id AS latest_razorpay_payment_id,
      COALESCE(lp.payment_date, lp.created_at) AS last_payment_date,
      le.id::text AS last_email_log_id,
      le.email_type AS last_email_type,
      le.status AS last_email_status,
      le.sent_at AS last_email_sent_at,
      le.last_error AS last_email_error,
      (
        SELECT COALESCE(json_agg(sr.reminder_type ORDER BY sr.created_at ASC) FILTER (WHERE sr.status = 'SENT'), '[]'::json)
        FROM public.subscription_reminders sr
        WHERE sr.subscription_id::text = rs.subscription_id
      ) AS reminders_sent
    FROM ranked_subs rs
    LEFT JOIN public.shops sh ON sh.id::text = rs.shop_id
    LEFT JOIN public.plans p ON p.id::text = rs.plan_id::text
    LEFT JOIN LATERAL (
      SELECT *
      FROM public.subscription_payments sp
      WHERE sp.shop_id = rs.shop_id
      ORDER BY sp.created_at DESC
      LIMIT 1
    ) lp ON true
    LEFT JOIN LATERAL (
      SELECT *
      FROM public.email_delivery_logs edl
      WHERE edl.shop_id = rs.shop_id
      ORDER BY edl.created_at DESC
      LIMIT 1
    ) le ON true
  `);

  const now = new Date();
  let items = (res.rows || []).map((row) => {
    const computed = computeRemainingDaysAndStatus({
      startDate: row.current_period_start,
      expiryDate: row.current_period_end,
      dbStatus: row.db_status,
      paymentStatus: row.latest_payment_status,
      now
    });

    const planPrice =
      Number(row.amount_paid) > 0
        ? Number(row.amount_paid)
        : String(row.billing_period || 'MONTHLY').toUpperCase() === 'YEARLY'
          ? Number(row.plan_price_yearly || 0)
          : Number(row.plan_price_monthly || 0);

    return {
      subscriptionId: row.subscription_id,
      shopId: row.shop_id,
      shopName: row.shop_name || `Shop ${String(row.shop_id).slice(0, 8)}`,
      shopSlug: row.shop_slug || '',
      shopCode: row.shop_code || null,
      shopCity: row.shop_city || '',
      ownerName: row.owner_name || 'Shop Owner',
      ownerEmail: row.owner_email || row.shop_email || '',
      planId: row.plan_id,
      planName: row.plan_name || row.plan_id,
      planPrice,
      billingPeriod: String(row.billing_period || 'MONTHLY').toUpperCase(),
      startDate: new Date(row.current_period_start).toISOString(),
      expiryDate: new Date(row.current_period_end).toISOString(),
      totalDurationDays: row.total_duration_days || computed.totalDurationDays,
      remainingDays: computed.remainingDays,
      subscriptionStatus: computed.effectiveStatus,
      rawDbStatus: row.db_status,
      paymentStatus:
        row.latest_payment_status ||
        (row.razorpay_payment_id || Number(row.amount_paid) > 0 ? 'SUCCESS' : 'FREE'),
      refundStatus: row.latest_refund_status || 'NONE',
      refundedAmount: Number(row.latest_payment_refunded_amount || 0),
      netPaidAmount: Number(row.latest_payment_net_amount ?? row.amount_paid ?? 0),
      razorpayPaymentId: row.razorpay_payment_id || row.latest_razorpay_payment_id || null,
      razorpayOrderId: row.razorpay_order_id || row.latest_razorpay_order_id || null,
      lastPaymentDate: row.last_payment_date ? new Date(row.last_payment_date).toISOString() : null,
      nextRenewalDate: row.auto_renew && !['EXPIRED', 'CANCELLED'].includes(computed.effectiveStatus)
        ? new Date(row.current_period_end).toISOString()
        : null,
      autoRenew: Boolean(row.auto_renew),
      eventAction: row.event_action || 'NEW_PURCHASE',
      emailStatus: row.last_email_status || 'NOT_SENT',
      lastEmailLogId: row.last_email_log_id || null,
      lastEmailType: row.last_email_type || null,
      lastEmailSentAt: row.last_email_sent_at ? new Date(row.last_email_sent_at).toISOString() : null,
      lastEmailError: row.last_email_error || null,
      remindersSent: Array.isArray(row.reminders_sent) ? row.reminders_sent : [],
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at || row.created_at).toISOString()
    };
  });

  // Also include shops that have failed/pending subscription payments with NO subscription row yet
  const existingShopIds = new Set(items.map((i) => i.shopId));
  const orphanPayRes = await db.query(`
    SELECT DISTINCT ON (sp.shop_id)
      sp.id::text AS payment_id,
      sp.shop_id,
      sp.plan_id,
      sp.razorpay_order_id,
      sp.razorpay_payment_id,
      sp.amount::float AS amount,
      sp.status AS payment_status,
      sp.billing_period,
      sp.failure_reason,
      sp.created_at,
      sh.name AS shop_name,
      sh.email AS shop_email,
      COALESCE(p.name, sp.plan_id) AS plan_name
    FROM public.subscription_payments sp
    LEFT JOIN public.shops sh ON sh.id::text = sp.shop_id
    LEFT JOIN public.plans p ON p.id::text = sp.plan_id::text
    WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.shop_id::text = sp.shop_id)
    ORDER BY sp.shop_id, sp.created_at DESC
  `);

  for (const orph of orphanPayRes.rows || []) {
    if (existingShopIds.has(orph.shop_id)) continue;
    const pStat = String(orph.payment_status || 'PENDING').toUpperCase();
    items.push({
      subscriptionId: `pay_${orph.payment_id}`,
      shopId: orph.shop_id,
      shopName: orph.shop_name || `Shop ${String(orph.shop_id).slice(0, 8)}`,
      shopSlug: '',
      shopCode: null,
      shopCity: '',
      ownerName: 'Shop Owner',
      ownerEmail: orph.shop_email || '',
      planId: orph.plan_id,
      planName: orph.plan_name,
      planPrice: Number(orph.amount || 0),
      billingPeriod: String(orph.billing_period || 'MONTHLY').toUpperCase(),
      startDate: new Date(orph.created_at).toISOString(),
      expiryDate: new Date(orph.created_at).toISOString(),
      totalDurationDays: 0,
      remainingDays: 0,
      subscriptionStatus: pStat === 'FAILED' ? 'PAYMENT_FAILED' : 'PAYMENT_PENDING',
      rawDbStatus: pStat,
      paymentStatus: pStat,
      refundStatus: 'NONE',
      refundedAmount: 0,
      netPaidAmount: 0,
      razorpayPaymentId: orph.razorpay_payment_id || null,
      razorpayOrderId: orph.razorpay_order_id || null,
      lastPaymentDate: new Date(orph.created_at).toISOString(),
      nextRenewalDate: null,
      autoRenew: false,
      eventAction: 'PENDING_ORDER',
      emailStatus: 'NOT_SENT',
      lastEmailLogId: null,
      lastEmailType: null,
      lastEmailSentAt: null,
      lastEmailError: null,
      remindersSent: [],
      createdAt: new Date(orph.created_at).toISOString(),
      updatedAt: new Date(orph.created_at).toISOString()
    });
  }

  // Filters
  const statusFilter = String(query.status || 'ALL').toUpperCase();
  if (statusFilter && statusFilter !== 'ALL') {
    items = items.filter((item) => {
      if (statusFilter === 'EXPIRING_SOON') {
        return item.subscriptionStatus === 'EXPIRING_SOON' || item.subscriptionStatus === 'EXPIRING_TODAY';
      }
      if (statusFilter === 'PAYMENT_PENDING') {
        return item.subscriptionStatus === 'PAYMENT_PENDING' || item.paymentStatus === 'PENDING';
      }
      if (statusFilter === 'PAYMENT_FAILED') {
        return item.subscriptionStatus === 'PAYMENT_FAILED' || item.paymentStatus === 'FAILED';
      }
      return item.subscriptionStatus === statusFilter;
    });
  }

  if (query.planId && query.planId !== 'ALL') {
    items = items.filter((item) => item.planId === query.planId);
  }

  if (query.search && query.search.trim()) {
    const q = query.search.trim().toLowerCase();
    items = items.filter((item) =>
      item.shopName.toLowerCase().includes(q) ||
      item.ownerEmail.toLowerCase().includes(q) ||
      item.ownerName.toLowerCase().includes(q) ||
      item.shopId.toLowerCase().includes(q) ||
      item.planName.toLowerCase().includes(q) ||
      (item.razorpayPaymentId || '').toLowerCase().includes(q) ||
      (item.razorpayOrderId || '').toLowerCase().includes(q)
    );
  }

  if (query.fromDate) {
    const fromMs = new Date(query.fromDate).getTime();
    if (!Number.isNaN(fromMs)) {
      items = items.filter((item) => new Date(item.startDate).getTime() >= fromMs);
    }
  }

  if (query.toDate) {
    const toMs = new Date(query.toDate).getTime() + 86_400_000;
    if (!Number.isNaN(toMs)) {
      items = items.filter((item) => new Date(item.startDate).getTime() <= toMs);
    }
  }

  // Sort
  const sortBy = query.sortBy || 'expiry_asc';
  items.sort((a, b) => {
    if (sortBy === 'expiry_asc') {
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    }
    if (sortBy === 'expiry_desc') {
      return new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime();
    }
    if (sortBy === 'amount_desc') {
      return b.planPrice - a.planPrice;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const total = items.length;
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;
  const paginatedItems = items.slice(offset, offset + limit);

  return {
    items: paginatedItems,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
}

/**
 * Retrieves full Shop Subscription Details: shop metadata, current subscription,
 * all historical subscription periods, all payment records, full chronological history, and email logs.
 */
export async function getAdminShopSubscriptionDetails(db: QueryableDb, shopId: string) {
  const contact = await resolveShopOwnerContact(db, shopId);

  const shopRes = await db.query(
    `SELECT id::text, name, slug, shop_code, email, phone, address, city, status, current_plan_id, created_at
     FROM public.shops
     WHERE id::text = $1
     LIMIT 1`,
    [shopId]
  );
  const shopRow = shopRes.rows?.[0] || null;

  const subsRes = await db.query(
    `SELECT s.*,
            COALESCE(p.name, s.plan_id) AS plan_name,
            p.price_monthly::float AS plan_price_monthly,
            p.price_yearly::float AS plan_price_yearly
     FROM public.subscriptions s
     LEFT JOIN public.plans p ON p.id::text = s.plan_id::text
     WHERE s.shop_id::text = $1
     ORDER BY s.is_current DESC, s.created_at DESC`,
    [shopId]
  );

  const paymentsRes = await db.query(
    `SELECT sp.*,
            COALESCE(p.name, sp.plan_id) AS plan_name
     FROM public.subscription_payments sp
     LEFT JOIN public.plans p ON p.id::text = sp.plan_id::text
     WHERE sp.shop_id = $1
     ORDER BY COALESCE(sp.payment_date, sp.created_at) DESC`,
    [shopId]
  );

  const historyRes = await db.query(
    `SELECT *
     FROM public.subscription_history
     WHERE shop_id = $1
     ORDER BY created_at DESC`,
    [shopId]
  );

  const emailLogsRes = await db.query(
    `SELECT id::text, shop_id, subscription_id::text, payment_order_id, recipient_email, email_type,
            subject, provider, provider_message_id, status, attempt_count, last_error,
            sent_at, last_attempt_at, created_at
     FROM public.email_delivery_logs
     WHERE shop_id = $1
     ORDER BY created_at DESC`,
    [shopId]
  );

  const remindersRes = await db.query(
    `SELECT *
     FROM public.subscription_reminders
     WHERE shop_id = $1
     ORDER BY created_at DESC`,
    [shopId]
  );

  const now = new Date();
  const formattedSubs = (subsRes.rows || []).map((row) => {
    const computed = computeRemainingDaysAndStatus({
      startDate: row.current_period_start,
      expiryDate: row.current_period_end,
      dbStatus: row.status,
      now
    });
    return {
      id: row.id,
      shopId: row.shop_id,
      planId: row.plan_id,
      planName: row.plan_name,
      dbStatus: row.status,
      effectiveStatus: row.is_current === false && String(row.status).toUpperCase() === 'SUPERSEDED'
        ? 'SUPERSEDED'
        : computed.effectiveStatus,
      billingPeriod: row.billing_period,
      startDate: row.current_period_start,
      expiryDate: row.current_period_end,
      totalDurationDays: row.total_duration_days || computed.totalDurationDays,
      remainingDays: computed.remainingDays,
      amountPaid: Number(row.amount_paid || 0),
      razorpayPaymentId: row.razorpay_payment_id || row.payment_id || null,
      razorpayOrderId: row.razorpay_order_id || null,
      autoRenew: Boolean(row.auto_renew),
      isCurrent: Boolean(row.is_current),
      eventAction: row.event_action || 'NEW_PURCHASE',
      supersededAt: row.superseded_at || null,
      cancelledAt: row.cancelled_at || null,
      createdAt: row.created_at
    };
  });

  const currentSubscription = formattedSubs.find((s) => s.isCurrent) || formattedSubs[0] || null;

  return {
    shop: {
      id: shopId,
      name: shopRow?.name || contact.shopName,
      slug: shopRow?.slug || '',
      shopCode: shopRow?.shop_code || null,
      ownerName: contact.ownerName,
      ownerEmail: contact.ownerEmail || shopRow?.email || '',
      phone: shopRow?.phone || null,
      city: shopRow?.city || null,
      status: shopRow?.status || 'ACTIVE'
    },
    currentSubscription,
    subscriptionPeriods: formattedSubs,
    payments: (paymentsRes.rows || []).map((p) => ({
      id: p.id,
      planId: p.plan_id,
      planName: p.plan_name,
      razorpayOrderId: p.razorpay_order_id,
      razorpayPaymentId: p.razorpay_payment_id,
      amount: Number(p.amount || 0),
      refundedAmount: Number(p.refunded_amount || 0),
      netAmount: Number(p.net_amount ?? Math.max(0, Number(p.amount || 0) - Number(p.refunded_amount || 0))),
      refundStatus: p.refund_status || 'NONE',
      status: p.status,
      billingPeriod: p.billing_period,
      paymentMethod: p.payment_method,
      failureReason: p.failure_reason,
      paymentDate: p.payment_date || p.created_at,
      createdAt: p.created_at
    })),
    history: (historyRes.rows || []).map((h) => ({
      id: h.id,
      subscriptionId: h.subscription_id,
      paymentId: h.payment_id,
      eventType: h.event_type,
      previousPlanName: h.previous_plan_name,
      newPlanName: h.new_plan_name,
      amount: Number(h.amount || 0),
      currency: h.currency,
      paymentReference: h.payment_reference,
      status: h.status,
      description: h.description,
      actorRole: h.actor_role,
      actorId: h.actor_id,
      metadata: h.metadata,
      createdAt: h.created_at
    })),
    emailLogs: emailLogsRes.rows || [],
    reminders: remindersRes.rows || []
  };
}

/**
 * Lists all email delivery logs + reminders for Admin Monitoring, including shops
 * that have active paid subscriptions with missing confirmation emails.
 */
export async function listAdminSubscriptionEmailsAndReminders(
  db: QueryableDb,
  filters: {
    status?: string;
    emailType?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}
) {
  const logsRes = await db.query(`
    SELECT
      edl.id::text,
      edl.shop_id,
      COALESCE(s.name, 'Shop ' || LEFT(COALESCE(edl.shop_id, ''), 8)) AS shop_name,
      edl.subscription_id::text,
      edl.payment_order_id,
      edl.recipient_email,
      edl.email_type,
      edl.subject,
      edl.provider,
      edl.provider_message_id,
      edl.status,
      edl.attempt_count,
      edl.last_error,
      edl.sent_at,
      edl.last_attempt_at,
      edl.created_at,
      sr.reminder_type,
      sr.target_expiry_date,
      sr.status AS reminder_status
    FROM public.email_delivery_logs edl
    LEFT JOIN public.shops s ON s.id::text = edl.shop_id
    LEFT JOIN public.subscription_reminders sr ON sr.email_log_id = edl.id
    ORDER BY edl.created_at DESC
    LIMIT 300
  `);

  let logs = logsRes.rows || [];
  if (filters.status && filters.status !== 'ALL') {
    const st = filters.status.toUpperCase();
    logs = logs.filter((l) => String(l.status).toUpperCase() === st);
  }
  if (filters.emailType && filters.emailType !== 'ALL') {
    logs = logs.filter((l) => String(l.email_type).toUpperCase() === filters.emailType!.toUpperCase());
  }
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    logs = logs.filter(
      (l) =>
        String(l.shop_name || '').toLowerCase().includes(q) ||
        String(l.recipient_email || '').toLowerCase().includes(q) ||
        String(l.subject || '').toLowerCase().includes(q)
    );
  }

  // Also detect paid subscriptions missing a SENT confirmation email so Admin can see them
  const missingConfirmationRes = await db.query(`
    SELECT s.id::text AS subscription_id, s.shop_id::text AS shop_id,
           sh.name AS shop_name, sh.email AS shop_email,
           COALESCE(p.name, s.plan_id) AS plan_name,
           s.amount_paid::float AS amount_paid, s.razorpay_order_id, COALESCE(s.razorpay_payment_id, s.payment_id) AS razorpay_payment_id,
           s.created_at
    FROM public.subscriptions s
    LEFT JOIN public.shops sh ON sh.id = s.shop_id
    LEFT JOIN public.plans p ON p.id::text = s.plan_id::text
    WHERE s.amount_paid > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.email_delivery_logs edl
        WHERE edl.subscription_id = s.id
          AND edl.email_type = 'PURCHASE_CONFIRMATION'
          AND edl.status = 'SENT'
      )
    ORDER BY s.created_at DESC
    LIMIT 50
  `);

  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.min(100, Math.max(1, Number(filters.limit || 25)));
  const total = logs.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const items = logs.slice((page - 1) * limit, page * limit);

  return {
    items,
    missingConfirmationEmails: missingConfirmationRes.rows || [],
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
}
