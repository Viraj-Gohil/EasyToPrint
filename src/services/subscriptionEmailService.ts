/**
 * EasyToPrint Subscription Email Service (Resend API + Idempotent PostgreSQL Logs)
 *
 * Responsibilities:
 * - Send Subscription Purchase Confirmation emails (only after verified payment + DB activation)
 * - Send Subscription Expiry Reminder emails (3d, 2d, 1d, 0d)
 * - Persist every email attempt in `public.email_delivery_logs` with `idempotency_key`
 * - Prevent duplicate emails on retries / duplicate webhooks
 * - Support safe admin retries of failed emails
 */

import type { Pool, PoolClient } from 'pg';
import { logger, deepRedact } from '../lib/security.js';

export type SubscriptionEmailType =
  | 'PURCHASE_CONFIRMATION'
  | 'EXPIRY_REMINDER_3D'
  | 'EXPIRY_REMINDER_2D'
  | 'EXPIRY_REMINDER_1D'
  | 'EXPIRY_REMINDER_0D';

export interface QueryableDb {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface EmailTransportResult {
  delivered: boolean;
  providerMessageId: string | null;
  errorMessage: string | null;
  skippedSimulation?: boolean;
}

export type EmailTransportFn = (params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<EmailTransportResult>;

export interface PurchaseConfirmationPayload {
  shopId: string;
  subscriptionId: string;
  paymentOrderId?: string | null;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  shopName: string;
  ownerName: string;
  recipientEmail: string;
  planName: string;
  planPrice: number;
  billingPeriod: 'MONTHLY' | 'YEARLY' | string;
  paymentDateIso: string;
  startDateIso: string;
  expiryDateIso: string;
  totalDurationDays: number;
  features?: string[];
  limits?: {
    printerLimit?: number;
    printLimitMonthly?: number;
    storageLimitMb?: number;
  };
}

export interface ExpiryReminderPayload {
  shopId: string;
  subscriptionId: string;
  reminderType: '3_DAYS_BEFORE' | '2_DAYS_BEFORE' | '1_DAY_BEFORE' | 'EXPIRY_DAY';
  emailType: 'EXPIRY_REMINDER_3D' | 'EXPIRY_REMINDER_2D' | 'EXPIRY_REMINDER_1D' | 'EXPIRY_REMINDER_0D';
  shopName: string;
  ownerName: string;
  recipientEmail: string;
  planName: string;
  expiryDateIso: string;
  remainingDays: number;
  renewalAmount: number;
  billingPeriod: string;
}

export interface ShopOwnerContact {
  shopName: string;
  ownerName: string;
  ownerEmail: string | null;
}

const DEFAULT_SUPPORT_EMAIL = 'support@easytoprint.in';

export function formatIstDateTime(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return String(isoOrDate);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date) + ' IST';
}

export function formatIstDateOnly(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return String(isoOrDate);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

export function getAppBaseUrl(): string {
  const configured = (process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  return configured || 'https://easytoprint.devpixel.space';
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Resolves Shop Name, Owner Name, and Owner Email across `shops`, `printflow_users`,
 * `shop_members`, and `profiles`.
 */
export async function resolveShopOwnerContact(
  db: QueryableDb,
  shopId: string
): Promise<ShopOwnerContact> {
  try {
    const res = await db.query(
      `SELECT
         s.name AS shop_name,
         s.email AS shop_email,
         COALESCE(
           (
             SELECT u.full_name
             FROM public.printflow_users u
             LEFT JOIN public.printflow_shop_mappings m ON m.client_shop_id = u.shop_id
             WHERE (u.shop_id = s.id::text OR m.neon_shop_id = s.id::text)
               AND u.role = 'SHOP_OWNER'
             ORDER BY u.created_at ASC
             LIMIT 1
           ),
           (
             SELECT p.full_name
             FROM public.shop_members sm
             JOIN public.profiles p ON p.id = sm.user_id
             WHERE sm.shop_id = s.id AND sm.role = 'SHOP_OWNER'
             ORDER BY sm.created_at ASC
             LIMIT 1
           ),
           'Shop Owner'
         ) AS owner_name,
         COALESCE(
           NULLIF(TRIM((
             SELECT u.email
             FROM public.printflow_users u
             LEFT JOIN public.printflow_shop_mappings m ON m.client_shop_id = u.shop_id
             WHERE (u.shop_id = s.id::text OR m.neon_shop_id = s.id::text)
               AND u.role = 'SHOP_OWNER'
             ORDER BY u.created_at ASC
             LIMIT 1
           )), ''),
           NULLIF(TRIM((
             SELECT p.email
             FROM public.shop_members sm
             JOIN public.profiles p ON p.id = sm.user_id
             WHERE sm.shop_id = s.id AND sm.role = 'SHOP_OWNER'
             ORDER BY sm.created_at ASC
             LIMIT 1
           )), ''),
           NULLIF(TRIM(s.email), '')
         ) AS owner_email
       FROM public.shops s
       WHERE s.id::text = $1
       LIMIT 1`,
      [shopId]
    );

    if (res.rowCount && res.rows[0]) {
      const row = res.rows[0];
      return {
        shopName: String(row.shop_name || 'EasyToPrint Shop'),
        ownerName: String(row.owner_name || 'Shop Owner'),
        ownerEmail: row.owner_email ? String(row.owner_email).trim() : null
      };
    }
  } catch (err: any) {
    logger.warn('Failed to resolve shop owner contact from database', {
      shopId,
      error: deepRedact(err)
    });
  }

  return {
    shopName: 'EasyToPrint Shop',
    ownerName: 'Shop Owner',
    ownerEmail: null
  };
}

/**
 * Default Resend HTTP API transport using server environment variables only.
 */
export async function sendViaResendApi(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailTransportResult> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail =
    (process.env.EMAIL_FROM || '').trim() ||
    'EasyToPrint Support <support@update.devpixel.space>';

  if (!apiKey) {
    return {
      delivered: false,
      providerMessageId: null,
      errorMessage: 'RESEND_API_KEY is not configured on the server.'
    };
  }

  if (!params.to || !params.to.includes('@')) {
    return {
      delivered: false,
      providerMessageId: null,
      errorMessage: 'Valid shop owner recipient email is missing.'
    };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text
      })
    });

    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errMsg =
        data?.message ||
        data?.error?.message ||
        `Resend API rejected email (HTTP ${response.status})`;
      return {
        delivered: false,
        providerMessageId: null,
        errorMessage: errMsg
      };
    }

    return {
      delivered: true,
      providerMessageId: data?.id ? String(data.id) : null,
      errorMessage: null
    };
  } catch (err: any) {
    return {
      delivered: false,
      providerMessageId: null,
      errorMessage: err?.message || 'Network error calling Resend API'
    };
  }
}

export function buildPurchaseConfirmationEmail(payload: PurchaseConfirmationPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Your EasyToPrint Subscription is Activated Successfully!';
  const dashboardUrl = `${getAppBaseUrl()}/shop/subscription`;
  const supportEmail = (process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL).trim();

  const paymentDateIst = formatIstDateTime(payload.paymentDateIso);
  const startDateIst = formatIstDateOnly(payload.startDateIso);
  const expiryDateIst = formatIstDateOnly(payload.expiryDateIso);
  const formattedAmount = `₹${Number(payload.planPrice || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

  const featureItems = (payload.features && payload.features.length > 0
    ? payload.features.slice(0, 6)
    : [
        payload.limits?.printerLimit
          ? `Up to ${payload.limits.printerLimit} connected printer(s)`
          : 'Multi-printer shop automation',
        payload.limits?.printLimitMonthly
          ? `Up to ${payload.limits.printLimitMonthly.toLocaleString('en-IN')} print jobs per period`
          : 'Automated counter print queue',
        'QR code customer self-service ordering & UPI checkout'
      ]
  )
    .map(
      (feat) =>
        `<li style="margin-bottom:6px;color:#1e293b;font-size:13px;">&#10003; ${escapeHtml(feat)}</li>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#F7F8F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#080808;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #E1E7E1;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="background:#00B32D;padding:24px 28px;color:#ffffff;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <span style="display:inline-block;font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">EasyToPrint</span>
              <p style="margin:4px 0 0 0;font-size:12px;color:#E8F8EC;">Smartest Print Shop Automation</p>
            </td>
            <td align="right">
              <span style="display:inline-block;background:#008F25;color:#ffffff;font-size:11px;font-weight:700;padding:6px 12px;border-radius:8px;">SUBSCRIPTION ACTIVE</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:800;color:#080808;">Your subscription is active!</h1>
        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#475569;">
          Hello <strong>${escapeHtml(payload.ownerName)}</strong>, thank you for subscribing <strong>${escapeHtml(payload.shopName)}</strong> to EasyToPrint. Your plan is verified and active immediately.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F8F7;border:1px solid #E1E7E1;border-radius:12px;margin-bottom:18px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 10px 0;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#008F25;">Subscription Details</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="4" style="font-size:13px;">
                <tr><td style="color:#646B65;">Shop Name</td><td align="right" style="font-weight:700;color:#080808;">${escapeHtml(payload.shopName)}</td></tr>
                <tr><td style="color:#646B65;">Purchased Plan</td><td align="right" style="font-weight:700;color:#008F25;">${escapeHtml(payload.planName)} (${escapeHtml(payload.billingPeriod)})</td></tr>
                <tr><td style="color:#646B65;">Start Date</td><td align="right" style="font-family:monospace;color:#080808;">${escapeHtml(startDateIst)}</td></tr>
                <tr><td style="color:#646B65;">Expiry Date</td><td align="right" style="font-family:monospace;font-weight:700;color:#080808;">${escapeHtml(expiryDateIst)}</td></tr>
                <tr><td style="color:#646B65;">Total Duration</td><td align="right" style="font-weight:600;color:#080808;">${payload.totalDurationDays} days</td></tr>
              </table>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#E8F8EC;border:1px solid #A7F3D0;border-radius:12px;margin-bottom:20px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 10px 0;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#008F25;">Payment Receipt Summary</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="4" style="font-size:13px;">
                <tr><td style="color:#065F46;">Plan Price Paid</td><td align="right" style="font-family:monospace;font-size:15px;font-weight:800;color:#008F25;">${escapeHtml(formattedAmount)}</td></tr>
                <tr><td style="color:#065F46;">Payment Status</td><td align="right" style="font-weight:700;color:#008F25;">Successful</td></tr>
                <tr><td style="color:#065F46;">Payment Date</td><td align="right" style="font-family:monospace;color:#064E3B;">${escapeHtml(paymentDateIst)}</td></tr>
                <tr><td style="color:#065F46;">Razorpay Payment ID</td><td align="right" style="font-family:monospace;color:#064E3B;">${escapeHtml(payload.razorpayPaymentId)}</td></tr>
                <tr><td style="color:#065F46;">Transaction / Order ID</td><td align="right" style="font-family:monospace;color:#064E3B;">${escapeHtml(payload.razorpayOrderId)}</td></tr>
              </table>
            </td>
          </tr>
        </table>

        <div style="margin-bottom:24px;">
          <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;color:#080808;text-transform:uppercase;letter-spacing:0.04em;">Included Plan Features</p>
          <ul style="margin:0;padding-left:18px;">
            ${featureItems}
          </ul>
        </div>

        <div style="text-align:center;margin:24px 0 8px 0;">
          <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#00B32D;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 28px;border-radius:10px;">
            Go to EasyToPrint Dashboard
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;background:#F7F8F7;border-top:1px solid #E1E7E1;font-size:12px;color:#646B65;text-align:center;">
        Need billing assistance? Contact us at <a href="mailto:${escapeHtml(supportEmail)}" style="color:#008F25;font-weight:600;text-decoration:none;">${escapeHtml(supportEmail)}</a><br/>
        <span style="font-size:11px;color:#94A3B8;">EasyToPrint Cloud Platform &bull; Automated Print Shop Operations</span>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'Your EasyToPrint Subscription is Activated Successfully!',
    `Hello ${payload.ownerName},`,
    `Shop: ${payload.shopName}`,
    `Plan: ${payload.planName} (${payload.billingPeriod})`,
    `Amount Paid: ${formattedAmount} (Payment Status: Successful)`,
    `Payment Date: ${paymentDateIst}`,
    `Start Date: ${startDateIst}`,
    `Expiry Date: ${expiryDateIst}`,
    `Total Duration: ${payload.totalDurationDays} days`,
    `Razorpay Payment ID: ${payload.razorpayPaymentId}`,
    `Order Reference: ${payload.razorpayOrderId}`,
    `Manage Subscription: ${dashboardUrl}`,
    `Support: ${supportEmail}`
  ].join('\n');

  return { subject, html, text };
}

export function buildExpiryReminderEmail(payload: ExpiryReminderPayload): {
  subject: string;
  html: string;
  text: string;
} {
  const renewUrl = `${getAppBaseUrl()}/shop/subscription`;
  const supportEmail = (process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL).trim();
  const expiryDateIst = formatIstDateOnly(payload.expiryDateIso);
  const formattedRenewal = `₹${Number(payload.renewalAmount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

  const isToday = payload.reminderType === 'EXPIRY_DAY' || payload.remainingDays <= 0;
  const urgencyLabel = isToday
    ? 'EXPIRES TODAY'
    : payload.remainingDays === 1
      ? 'EXPIRES IN 1 DAY'
      : `EXPIRES IN ${payload.remainingDays} DAYS`;

  const subject = isToday
    ? `Action Required: Your EasyToPrint ${payload.planName} Subscription Expires Today (${payload.shopName})`
    : `Reminder: Your EasyToPrint ${payload.planName} Subscription Expires in ${payload.remainingDays} Day${payload.remainingDays === 1 ? '' : 's'}`;

  const headline = isToday
    ? 'Your EasyToPrint subscription expires today'
    : `Your subscription expires in ${payload.remainingDays} day${payload.remainingDays === 1 ? '' : 's'}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#F7F8F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#080808;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #E1E7E1;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="background:#00B32D;padding:24px 28px;color:#ffffff;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <span style="font-size:18px;font-weight:800;color:#ffffff;">EasyToPrint</span>
              <p style="margin:4px 0 0 0;font-size:12px;color:#E8F8EC;">Subscription Renewal Reminder</p>
            </td>
            <td align="right">
              <span style="display:inline-block;background:${isToday ? '#DC2626' : '#008F25'};color:#ffffff;font-size:11px;font-weight:700;padding:6px 12px;border-radius:8px;">${escapeHtml(urgencyLabel)}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:800;color:#080808;">${escapeHtml(headline)}</h1>
        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#475569;">
          Hello <strong>${escapeHtml(payload.ownerName)}</strong>, this is a renewal reminder for <strong>${escapeHtml(payload.shopName)}</strong>. Renew before expiry to ensure uninterrupted QR ordering, UPI checkout, and desktop printer auto-spooling.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F8F7;border:1px solid #E1E7E1;border-radius:12px;margin-bottom:22px;">
          <tr>
            <td style="padding:16px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="5" style="font-size:13px;">
                <tr><td style="color:#646B65;">Shop Name</td><td align="right" style="font-weight:700;color:#080808;">${escapeHtml(payload.shopName)}</td></tr>
                <tr><td style="color:#646B65;">Current Plan</td><td align="right" style="font-weight:700;color:#008F25;">${escapeHtml(payload.planName)} (${escapeHtml(payload.billingPeriod)})</td></tr>
                <tr><td style="color:#646B65;">Expiry Date</td><td align="right" style="font-family:monospace;font-weight:700;color:#080808;">${escapeHtml(expiryDateIst)}</td></tr>
                <tr><td style="color:#646B65;">Remaining Days</td><td align="right" style="font-family:monospace;font-weight:800;color:${isToday ? '#DC2626' : '#D97706'};">${Math.max(0, payload.remainingDays)} day${payload.remainingDays === 1 ? '' : 's'}</td></tr>
                <tr><td style="color:#646B65;">Renewal Amount</td><td align="right" style="font-family:monospace;font-weight:800;color:#080808;">${escapeHtml(formattedRenewal)}</td></tr>
              </table>
            </td>
          </tr>
        </table>

        <div style="text-align:center;margin:20px 0 8px 0;">
          <a href="${escapeHtml(renewUrl)}" style="display:inline-block;background:#00B32D;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 28px;border-radius:10px;">
            Renew Subscription Now
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;background:#F7F8F7;border-top:1px solid #E1E7E1;font-size:12px;color:#646B65;text-align:center;">
        Questions? Email <a href="mailto:${escapeHtml(supportEmail)}" style="color:#008F25;font-weight:600;text-decoration:none;">${escapeHtml(supportEmail)}</a><br/>
        <span style="font-size:11px;color:#94A3B8;">EasyToPrint Cloud Platform</span>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    `Hello ${payload.ownerName},`,
    `Shop: ${payload.shopName}`,
    `Current Plan: ${payload.planName} (${payload.billingPeriod})`,
    `Expiry Date: ${expiryDateIst}`,
    `Remaining Days: ${Math.max(0, payload.remainingDays)}`,
    `Renewal Amount: ${formattedRenewal}`,
    `Renew now: ${renewUrl}`,
    `Support: ${supportEmail}`
  ].join('\n');

  return { subject, html, text };
}

/**
 * Idempotently sends a Subscription Purchase Confirmation email after successful DB activation.
 * Never throws outward to break payment activation; logs `SENT` or `FAILED` into `email_delivery_logs`
 * and records an audit event into `subscription_history`.
 */
export async function sendSubscriptionPurchaseConfirmationEmail(
  db: QueryableDb,
  payload: PurchaseConfirmationPayload,
  transport: EmailTransportFn = sendViaResendApi
): Promise<{ emailLogId: string | null; status: 'SENT' | 'FAILED' | 'ALREADY_SENT'; errorMessage?: string | null }> {
  const idempotencyKey = `purchase:${payload.razorpayOrderId || payload.subscriptionId}`;
  const content = buildPurchaseConfirmationEmail(payload);

  try {
    // Atomic idempotency check/insert
    const existingRes = await db.query(
      `SELECT id, status, attempt_count
       FROM public.email_delivery_logs
       WHERE idempotency_key = $1
       LIMIT 1`,
      [idempotencyKey]
    );

    let logId: string;
    let attemptCount = 0;

    if (existingRes.rowCount && existingRes.rows[0]) {
      const existing = existingRes.rows[0];
      if (existing.status === 'SENT') {
        return { emailLogId: existing.id, status: 'ALREADY_SENT', errorMessage: null };
      }
      logId = existing.id;
      attemptCount = Number(existing.attempt_count || 0);
    } else {
      const insertRes = await db.query(
        `INSERT INTO public.email_delivery_logs (
           shop_id, subscription_id, payment_order_id, recipient_email, email_type,
           idempotency_key, subject, provider, status, attempt_count, payload_json
         )
         VALUES ($1, $2::uuid, $3, $4, 'PURCHASE_CONFIRMATION', $5, $6, 'resend', 'PENDING', 0, $7::jsonb)
         ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
         RETURNING id, status, attempt_count`,
        [
          payload.shopId,
          payload.subscriptionId,
          payload.razorpayOrderId,
          payload.recipientEmail || 'missing-email@invalid.local',
          idempotencyKey,
          content.subject,
          JSON.stringify(payload)
        ]
      );
      logId = insertRes.rows[0].id;
      attemptCount = Number(insertRes.rows[0].attempt_count || 0);
      if (insertRes.rows[0].status === 'SENT') {
        return { emailLogId: logId, status: 'ALREADY_SENT', errorMessage: null };
      }
    }

    if (!payload.recipientEmail || !payload.recipientEmail.includes('@')) {
      const errMsg = 'Shop owner email address is missing or invalid; confirmation email skipped.';
      await db.query(
        `UPDATE public.email_delivery_logs
         SET status = 'FAILED', attempt_count = $2, last_error = $3, last_attempt_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [logId, attemptCount + 1, errMsg]
      );
      return { emailLogId: logId, status: 'FAILED', errorMessage: errMsg };
    }

    const sendRes = await transport({
      to: payload.recipientEmail,
      subject: content.subject,
      html: content.html,
      text: content.text
    });

    if (sendRes.delivered) {
      await db.query(
        `UPDATE public.email_delivery_logs
         SET status = 'SENT',
             provider_message_id = $2,
             attempt_count = $3,
             last_error = NULL,
             sent_at = NOW(),
             last_attempt_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [logId, sendRes.providerMessageId, attemptCount + 1]
      );

      await db.query(
        `INSERT INTO public.subscription_history (
           shop_id, subscription_id, event_type, new_plan_name, amount,
           payment_reference, status, description, actor_role, metadata
         )
         VALUES ($1, $2::uuid, 'CONFIRMATION_EMAIL_SENT', $3, $4, $5, 'SENT', $6, 'SYSTEM', $7::jsonb)`,
        [
          payload.shopId,
          payload.subscriptionId,
          payload.planName,
          payload.planPrice,
          payload.razorpayPaymentId,
          `Purchase confirmation email sent to ${payload.recipientEmail}`,
          JSON.stringify({ emailLogId: logId, providerMessageId: sendRes.providerMessageId })
        ]
      );

      return { emailLogId: logId, status: 'SENT', errorMessage: null };
    }

    const failErr = sendRes.errorMessage || 'Email delivery failed';
    await db.query(
      `UPDATE public.email_delivery_logs
       SET status = 'FAILED',
           attempt_count = $2,
           last_error = $3,
           last_attempt_at = NOW(),
           next_retry_at = NOW() + INTERVAL '30 minutes',
           updated_at = NOW()
       WHERE id = $1`,
      [logId, attemptCount + 1, failErr]
    );

    await db.query(
      `INSERT INTO public.subscription_history (
         shop_id, subscription_id, event_type, new_plan_name, amount,
         payment_reference, status, description, actor_role, metadata
       )
       VALUES ($1, $2::uuid, 'EMAIL_FAILED', $3, $4, $5, 'FAILED', $6, 'SYSTEM', $7::jsonb)`,
      [
        payload.shopId,
        payload.subscriptionId,
        payload.planName,
        payload.planPrice,
        payload.razorpayPaymentId,
        `Purchase confirmation email failed for ${payload.recipientEmail}: ${failErr}`,
        JSON.stringify({ emailLogId: logId, error: failErr })
      ]
    );

    return { emailLogId: logId, status: 'FAILED', errorMessage: failErr };
  } catch (err: any) {
    logger.warn('Unexpected error recording/sending subscription purchase confirmation email', {
      shopId: payload.shopId,
      subscriptionId: payload.subscriptionId,
      error: deepRedact(err)
    });
    return { emailLogId: null, status: 'FAILED', errorMessage: err?.message || 'Unexpected email error' };
  }
}

/**
 * Safely retries a FAILED / PENDING / RETRYING email log entry without duplicating already-SENT emails.
 */
export async function retrySubscriptionEmailLog(
  db: QueryableDb,
  emailLogId: string,
  actorId = 'admin',
  transport: EmailTransportFn = sendViaResendApi
): Promise<{
  success: boolean;
  alreadySent?: boolean;
  status: string;
  emailLogId: string;
  errorMessage?: string | null;
}> {
  const res = await db.query(
    `SELECT * FROM public.email_delivery_logs WHERE id::text = $1 LIMIT 1`,
    [emailLogId]
  );

  if (!res.rowCount || !res.rows[0]) {
    throw new Error('Email delivery log record not found.');
  }

  const logRow = res.rows[0];
  if (logRow.status === 'SENT') {
    return {
      success: true,
      alreadySent: true,
      status: 'SENT',
      emailLogId: logRow.id
    };
  }

  // Verify reminder hasn't been superseded if it's an expiry reminder
  if (String(logRow.email_type).startsWith('EXPIRY_REMINDER_') && logRow.subscription_id) {
    const subCheck = await db.query(
      `SELECT id, is_current, status FROM public.subscriptions WHERE id = $1 LIMIT 1`,
      [logRow.subscription_id]
    );
    const subRow = subCheck.rows?.[0];
    if (
      !subRow ||
      subRow.is_current === false ||
      ['CANCELLED', 'SUPERSEDED', 'EXPIRED'].includes(String(subRow.status || '').toUpperCase())
    ) {
      await db.query(
        `UPDATE public.subscription_reminders
         SET status = 'SKIPPED_RENEWED', updated_at = NOW()
         WHERE email_log_id = $1`,
        [logRow.id]
      ).catch(() => {});
      return {
        success: false,
        status: logRow.status,
        emailLogId: logRow.id,
        errorMessage: 'Subscription was already renewed, cancelled, or expired; reminder retry skipped.'
      };
    }
  }

  const payload = typeof logRow.payload_json === 'string'
    ? JSON.parse(logRow.payload_json)
    : (logRow.payload_json || {});

  // Resolve latest owner email if missing before
  let recipientEmail = String(logRow.recipient_email || '').trim();
  if (!recipientEmail || recipientEmail === 'missing-email@invalid.local') {
    if (logRow.shop_id) {
      const contact = await resolveShopOwnerContact(db, String(logRow.shop_id));
      if (contact.ownerEmail) recipientEmail = contact.ownerEmail;
    }
  }

  if (!recipientEmail || !recipientEmail.includes('@')) {
    const errMsg = 'Cannot retry: valid shop owner recipient email is still missing.';
    await db.query(
      `UPDATE public.email_delivery_logs
       SET status = 'FAILED', attempt_count = attempt_count + 1, last_error = $2, last_attempt_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [logRow.id, errMsg]
    );
    return { success: false, status: 'FAILED', emailLogId: logRow.id, errorMessage: errMsg };
  }

  await db.query(
    `UPDATE public.email_delivery_logs SET status = 'RETRYING', recipient_email = $2, updated_at = NOW() WHERE id = $1`,
    [logRow.id, recipientEmail]
  );

  const built =
    logRow.email_type === 'PURCHASE_CONFIRMATION'
      ? buildPurchaseConfirmationEmail({ ...payload, recipientEmail })
      : buildExpiryReminderEmail({ ...payload, recipientEmail });

  const transportResult = await transport({
    to: recipientEmail,
    subject: built.subject,
    html: built.html,
    text: built.text
  });

  if (transportResult.delivered) {
    await db.query(
      `UPDATE public.email_delivery_logs
       SET status = 'SENT',
           provider_message_id = $2,
           attempt_count = attempt_count + 1,
           last_error = NULL,
           sent_at = NOW(),
           last_attempt_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [logRow.id, transportResult.providerMessageId]
    );

    await db.query(
      `UPDATE public.subscription_reminders
       SET status = 'SENT', sent_at = NOW(), error_message = NULL, retry_count = retry_count + 1, updated_at = NOW()
       WHERE email_log_id = $1`,
      [logRow.id]
    );

    if (logRow.shop_id) {
      await db.query(
        `INSERT INTO public.subscription_history (
           shop_id, subscription_id, event_type, status, description, actor_role, actor_id, metadata
         )
         VALUES ($1, $2, $3, 'SENT', $4, 'ADMIN', $5, $6::jsonb)`,
        [
          String(logRow.shop_id),
          logRow.subscription_id || null,
          logRow.email_type === 'PURCHASE_CONFIRMATION' ? 'CONFIRMATION_EMAIL_SENT' : 'REMINDER_SENT',
          `Admin retried ${logRow.email_type} email — delivered to ${recipientEmail}`,
          actorId,
          JSON.stringify({ emailLogId: logRow.id, providerMessageId: transportResult.providerMessageId })
        ]
      );
    }

    return {
      success: true,
      status: 'SENT',
      emailLogId: logRow.id
    };
  }

  const errMsg = transportResult.errorMessage || 'Email delivery failed on retry';
  await db.query(
    `UPDATE public.email_delivery_logs
     SET status = 'FAILED',
         attempt_count = attempt_count + 1,
         last_error = $2,
         last_attempt_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [logRow.id, errMsg]
  );

  await db.query(
    `UPDATE public.subscription_reminders
     SET status = 'FAILED', error_message = $2, retry_count = retry_count + 1, updated_at = NOW()
     WHERE email_log_id = $1`,
    [logRow.id, errMsg]
  );

  return {
    success: false,
    status: 'FAILED',
    emailLogId: logRow.id,
    errorMessage: errMsg
  };
}
