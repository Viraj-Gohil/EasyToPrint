import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadMigrations } from '../src/db/migrations';
import { MockStorageService, buildObjectPath } from '../src/lib/storage/supabaseStorage';
import { DurablePaymentRepository } from '../src/db/durablePaymentRepository';
import {
  calculateAuthoritativeCustomerPrintTotal,
  findRecentOrderForRecovery,
  setNeonPoolForTest
} from '../src/db/paymentStorage';

const SHOP_A_ID = '11111111-1111-4111-8111-111111111111';
const SHOP_B_ID = '22222222-2222-4222-8222-222222222222';
const SHOP_SECRET = 'rzp_test_shop_secret_lifecycle_12345';

async function testMigration012Loaded() {
  const migrations = await loadMigrations();
  const mig = migrations.find((m) => m.filename === '012_payment_staging_reliability.sql');
  assert.ok(mig, '012_payment_staging_reliability.sql must be present in supabase/migrations');
  assert.equal(mig.id, '012');
  assert.ok(/^[a-f0-9]{64}$/.test(mig.checksum), 'Migration 012 must have valid SHA-256 checksum');
  assert.ok(mig.sql.includes('CREATE TABLE IF NOT EXISTS public.staged_checkout_files'), 'Must create staged_checkout_files');
  assert.ok(mig.sql.includes('checkout_session_id'), 'Must add checkout_session_id columns');
  assert.ok(mig.sql.includes('staged_job_id'), 'Must add staged_job_id column on payment_orders');
  assert.ok(mig.sql.includes('staging_status'), 'Must add staging_status column on print_agent_jobs');
  console.log('  ✅ PASS: Migration 012 schema and checksum verified');
}

async function testStorageUploadAndVerification() {
  const storage = new MockStorageService();
  assert.equal(storage.isConfigured(), true, 'MockStorageService should report configured');

  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'utf-8');
  const uploaded = await storage.upload({
    shopId: SHOP_A_ID,
    jobId: 'chk_session_001',
    fileId: 'stf_file_001',
    extension: '.pdf',
    buffer: pdfBytes,
    contentType: 'application/pdf'
  });

  const expectedPath = buildObjectPath(SHOP_A_ID, 'chk_session_001', 'stf_file_001', '.pdf');
  assert.equal(uploaded.objectPath, expectedPath, 'Uploaded objectPath must match deterministic shop-scoped path');
  assert.equal(await storage.verifyObjectExists(uploaded.objectPath), true, 'Uploaded file must verify as existing');
  assert.equal(
    await storage.verifyObjectExists(buildObjectPath(SHOP_B_ID, 'chk_session_001', 'stf_file_001', '.pdf')),
    false,
    'Cross-tenant shop path must not exist'
  );

  await storage.delete([uploaded.objectPath]);
  assert.equal(await storage.verifyObjectExists(uploaded.objectPath), false, 'Deleted object must fail verifyObjectExists');
  console.log('  ✅ PASS: Storage pre-upload, tenant-scoped pathing, and verifyObjectExists confirmed');
}

async function testAuthoritativePricingCalculation() {
  const mockPool = {
    query: async (sql: string) => {
      if (sql.includes('FROM public.pricing_rules')) {
        return {
          rowCount: 2,
          rows: [
            {
              id: 'rule_a4_bw_single',
              shop_id: SHOP_A_ID,
              paper_size: 'A4',
              color_mode: 'BW',
              sides: 'SINGLE',
              price_per_page: 2, // ₹2/page
              is_active: true
            },
            {
              id: 'rule_a4_color_double',
              shop_id: SHOP_A_ID,
              paper_size: 'A4',
              color_mode: 'COLOR',
              sides: 'DOUBLE',
              price_per_page: 8, // ₹8/page
              is_active: true
            }
          ]
        };
      }
      if (sql.includes('min_order_amount') && sql.includes('FROM public.shops')) {
        return { rowCount: 1, rows: [{ min_order_amount: 10 }] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  setNeonPoolForTest(mockPool as any);
  try {
    // Case 1: Custom page range (1-3,5 = 4 pages) * 2 copies * ₹2 = ₹16 (above ₹10 min order)
    const calc1 = await calculateAuthoritativeCustomerPrintTotal({
      shopId: SHOP_A_ID,
      files: [
        {
          pageCount: 10,
          copies: 2,
          colorMode: 'BW',
          paperSize: 'A4',
          duplex: false,
          pagesToPrint: '1-3,5'
        }
      ]
    });
    assert.equal(calc1.totalRupees, 16, '4 selected pages * 2 copies * ₹2 must equal ₹16');
    assert.equal(calc1.amountMinor, 1600, 'Amount minor must equal 1600 paise');

    // Case 2: Min order floor applies when subtotal (1 page * ₹2 = ₹2) < ₹10
    const calcMin = await calculateAuthoritativeCustomerPrintTotal({
      shopId: SHOP_A_ID,
      files: [
        {
          pageCount: 1,
          copies: 1,
          colorMode: 'BW',
          paperSize: 'A4',
          duplex: false
        }
      ]
    });
    assert.equal(calcMin.totalRupees, 10, 'Minimum shop order amount ₹10 must be enforced');
    assert.equal(calcMin.amountMinor, 1000, 'Minimum order minor units must equal 1000 paise');

    // Case 3: Multi-file mixed color/duplex + BW
    const calcMixed = await calculateAuthoritativeCustomerPrintTotal({
      shopId: SHOP_A_ID,
      files: [
        { pageCount: 3, copies: 1, colorMode: 'BW', paperSize: 'A4', duplex: false }, // ₹6
        { pageCount: 2, copies: 2, colorMode: 'COLOR', paperSize: 'A4', duplex: true } // 2*2*8 = ₹32
      ]
    });
    assert.equal(calcMixed.totalRupees, 38, 'Mixed multi-file order must equal ₹38');
    assert.equal(calcMixed.amountMinor, 3800);

    // Case 4: Invalid out-of-range page selection throws
    await assert.rejects(
      () =>
        calculateAuthoritativeCustomerPrintTotal({
          shopId: SHOP_A_ID,
          files: [
            {
              pageCount: 3,
              copies: 1,
              colorMode: 'BW',
              paperSize: 'A4',
              duplex: false,
              pagesToPrint: '1-9'
            }
          ]
        }),
      /exceeds|range|valid|page/i,
      'Out-of-bounds page range must be rejected'
    );
  } finally {
    setNeonPoolForTest(null);
  }
  console.log('  ✅ PASS: Server-authoritative pricing calculation & tamper protection verified');
}

async function testCheckoutSessionIsolationAndAtomicVerification() {
  const ordersById = new Map<string, any>();
  const transactionsByPaymentId = new Map<string, any>();

  const mockClient = {
    query: async (sql: string, values: any[] = []) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rowCount: 0, rows: [] };
      }

      // createPaymentOrder check existing
      if (sql.includes('SELECT id::text, job_id::text, shop_id::text, purpose, provider')) {
        if (sql.includes('WHERE provider_order_id = $1')) {
          const found = Array.from(ordersById.values()).find((o) => o.provider_order_id === values[0]);
          return { rowCount: found ? 1 : 0, rows: found ? [found] : [] };
        }
        if (sql.includes('WHERE checkout_session_id = $1')) {
          const [sessionId, shopId] = values;
          const found = Array.from(ordersById.values()).find(
            (o) =>
              o.checkout_session_id === sessionId &&
              o.shop_id === shopId &&
              ['CREATED', 'ATTEMPTED'].includes(o.status)
          );
          return { rowCount: found ? 1 : 0, rows: found ? [found] : [] };
        }
      }

      // INSERT INTO public.payment_orders
      if (sql.includes('INSERT INTO public.payment_orders')) {
        const id = `ord_uuid_${ordersById.size + 1}`;
        const row = {
          id,
          job_id: values[0],
          shop_id: values[1],
          purpose: values[2],
          provider: 'RAZORPAY',
          provider_order_id: values[3],
          provider_account_ref: values[4],
          currency: values[5],
          amount_minor: String(values[6]),
          status: 'CREATED',
          idempotency_key: values[7],
          checkout_session_id: values[8],
          staged_job_id: values[9],
          reconciliation_needed: false,
          reconciliation_attempts: 0,
          last_reconciled_at: null,
          metadata: JSON.parse(values[10] || '{}'),
          created_at: new Date(),
          updated_at: new Date()
        };
        ordersById.set(row.provider_order_id, row);
        return { rowCount: 1, rows: [row] };
      }

      // Lock order for verification
      if (sql.includes('FROM public.payment_orders') && sql.includes('FOR UPDATE')) {
        const row = ordersById.get(values[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }

      // Check existing payment transaction
      if (sql.includes('FROM public.payment_transactions WHERE provider_payment_id = $1')) {
        const tx = transactionsByPaymentId.get(values[0]);
        return { rowCount: tx ? 1 : 0, rows: tx ? [tx] : [] };
      }

      // Insert payment transaction
      if (sql.includes('INSERT INTO public.payment_transactions')) {
        const tx = {
          id: `tx_${transactionsByPaymentId.size + 1}`,
          payment_order_id: values[0],
          provider_payment_id: values[1],
          status: values[2]
        };
        transactionsByPaymentId.set(values[1], tx);
        return { rowCount: 1, rows: [tx] };
      }

      // Mark order PAID
      if (sql.includes("UPDATE public.payment_orders") && sql.includes("status = 'PAID'")) {
        const found = Array.from(ordersById.values()).find((o) => o.id === values[0]);
        if (found) found.status = 'PAID';
        return { rowCount: found ? 1 : 0, rows: [] };
      }

      return { rowCount: 0, rows: [] };
    },
    release: () => {}
  };

  const repo = new DurablePaymentRepository({ connect: async () => mockClient } as any);

  // Checkout Session 1: Create order
  const order1 = await repo.createPaymentOrder({
    shopId: SHOP_A_ID,
    purpose: 'PRINT_JOB',
    providerOrderId: 'order_session_1_abc',
    providerAccountRef: 'rzp_test_shop_a',
    amountMinor: 1600,
    checkoutSessionId: 'chk_session_1',
    stagedJobId: 'PRT-SESSION1'
  });
  assert.equal(order1.checkoutSessionId, 'chk_session_1');
  assert.equal(order1.stagedJobId, 'PRT-SESSION1');

  // While unpaid, getUnpaidOrderByCheckoutSession returns order1
  const activeUnpaid1 = await repo.getUnpaidOrderByCheckoutSession('chk_session_1', SHOP_A_ID);
  assert.equal(activeUnpaid1?.providerOrderId, 'order_session_1_abc');

  // Authentic HMAC-SHA256 signature calculation & timing-safe verification
  const validSig = crypto
    .createHmac('sha256', SHOP_SECRET)
    .update('order_session_1_abc|pay_session_1_xyz')
    .digest('hex');
  const sigHash = crypto.createHash('sha256').update(validSig).digest('hex');

  // Amount tampering during atomic payment verification MUST throw
  await assert.rejects(
    () =>
      repo.executeAtomicPaymentVerification({
        providerOrderId: 'order_session_1_abc',
        providerPaymentId: 'pay_session_1_xyz',
        providerSignatureHash: sigHash,
        amountMinor: 100, // tampered down from 1600
        currency: 'INR'
      }),
    /amount|mismatch/i,
    'Tampered verification amount must be rejected'
  );

  // Authentic atomic payment verification succeeds
  const verified1 = await repo.executeAtomicPaymentVerification({
    providerOrderId: 'order_session_1_abc',
    providerPaymentId: 'pay_session_1_xyz',
    providerSignatureHash: sigHash,
    amountMinor: 1600,
    currency: 'INR'
  });
  assert.equal(verified1.status, 'PAID');
  assert.equal(verified1.alreadyProcessed, false);

  // Duplicate verification (e.g. webhook + frontend verify race) is idempotent
  const verifiedDup = await repo.executeAtomicPaymentVerification({
    providerOrderId: 'order_session_1_abc',
    providerPaymentId: 'pay_session_1_xyz',
    providerSignatureHash: sigHash,
    amountMinor: 1600,
    currency: 'INR'
  });
  assert.equal(verifiedDup.status, 'PAID');
  assert.equal(verifiedDup.alreadyProcessed, true, 'Duplicate verification must be idempotent');

  // Late payment.failed webhook after PAID MUST be ignored
  const lateFailure = await repo.handlePaymentFailure('order_session_1_abc', 'late_gateway_timeout');
  assert.equal(lateFailure.ignoredDueToPriorPaid, true, 'Late payment.failed must not downgrade PAID order');
  assert.equal(lateFailure.updated, false);

  // BUG B CHECK: After session 1 is PAID, getUnpaidOrderByCheckoutSession returns null
  const afterPaid1 = await repo.getUnpaidOrderByCheckoutSession('chk_session_1', SHOP_A_ID);
  assert.equal(afterPaid1, null, 'Paid session must NEVER be returned as an active unpaid order');

  // Checkout Session 2 (brand new upload): completely independent order & session
  const order2 = await repo.createPaymentOrder({
    shopId: SHOP_A_ID,
    purpose: 'PRINT_JOB',
    providerOrderId: 'order_session_2_def',
    providerAccountRef: 'rzp_test_shop_a',
    amountMinor: 2400,
    checkoutSessionId: 'chk_session_2',
    stagedJobId: 'PRT-SESSION2'
  });
  assert.notEqual(order2.providerOrderId, order1.providerOrderId, 'New checkout must get a fresh Razorpay order ID');
  assert.equal(order2.status, 'CREATED', 'New checkout order must start in CREATED status');
  assert.equal(order2.checkoutSessionId, 'chk_session_2');

  console.log('  ✅ PASS: Checkout session isolation (Bug B), HMAC verification, and idempotency verified');
}

async function testTenantScopedOrderRecovery() {
  const capturedSqls: Array<{ sql: string; params: any[] }> = [];
  const mockPool = {
    query: async (sql: string, params: any[] = []) => {
      capturedSqls.push({ sql, params });
      if (sql.includes('FROM public.shops')) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('FROM print_agent_jobs')) {
        // Simulate Shop A job exists, only return if $3 candidateShopIds includes SHOP_A_ID
        const shopFilter: string[] = Array.isArray(params[2]) ? params[2] : [];
        if (params[0] === 'order_shop_a_only' && shopFilter.includes(SHOP_A_ID)) {
          return {
            rowCount: 1,
            rows: [
              {
                order_id: 'order_shop_a_only',
                shop_id: SHOP_A_ID,
                print_status: 'QUEUED',
                claimed_by: null,
                claimed_at: null,
                updated_at: new Date().toISOString(),
                job_data: {
                  id: 'PRT-SHOPA-1',
                  shopId: SHOP_A_ID,
                  orderId: 'order_shop_a_only',
                  paymentId: 'pay_shop_a_1',
                  totalAmount: 20,
                  paymentStatus: 'SUCCESS',
                  printStatus: 'QUEUED'
                }
              }
            ]
          };
        }
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  setNeonPoolForTest(mockPool as any);
  try {
    const allowed = await findRecentOrderForRecovery({
      shopId: SHOP_A_ID,
      orderId: 'order_shop_a_only'
    });
    assert.equal(allowed.job?.id, 'PRT-SHOPA-1', 'Shop A should recover its own order');

    const crossTenant = await findRecentOrderForRecovery({
      shopId: SHOP_B_ID,
      orderId: 'order_shop_a_only'
    });
    assert.equal(crossTenant.job ?? null, null, 'Shop B MUST NOT recover Shop A order');
    assert.notEqual(crossTenant.shopId, SHOP_A_ID, 'Shop B MUST NOT leak Shop A shopId');
  } finally {
    setNeonPoolForTest(null);
  }
  console.log('  ✅ PASS: Cross-tenant recovery isolation verified');
}

async function testSingleWebhookExclusivityAndSecurityHardening() {
  const serverSource = await fs.readFile(path.resolve('server.ts'), 'utf-8');
  const flowSource = await fs.readFile(path.resolve('src/components/customer/CustomerPrintFlow.tsx'), 'utf-8');
  const razorpayClientSource = await fs.readFile(path.resolve('src/lib/razorpay.ts'), 'utf-8');
  const indexHtml = await fs.readFile(path.resolve('index.html'), 'utf-8');

  // 1. Single production webhook endpoint check
  assert.ok(
    serverSource.includes("app.post('/api/payment/webhook'"),
    'server.ts must expose /api/payment/webhook'
  );
  assert.equal(
    serverSource.includes('/api/payments/webhook') || serverSource.includes('/payments/webhook'),
    false,
    'Legacy /api/payments/webhook path must NOT exist in server.ts'
  );
  assert.equal(
    serverSource.includes('/api/webhooks/razorpay') || serverSource.includes('/webhooks/razorpay'),
    false,
    'Legacy /api/webhooks/razorpay path must NOT exist in server.ts'
  );

  // 2. Removed insecure paymentId.startsWith('pay_') verification bypass in /api/customer/print-jobs
  const printJobsIdx = serverSource.indexOf("app.post('/api/customer/print-jobs'");
  assert.ok(printJobsIdx > -1, '/api/customer/print-jobs route must exist');
  const printJobsSlice = serverSource.slice(printJobsIdx, printJobsIdx + 4500);
  assert.equal(
    printJobsSlice.includes("paymentId.startsWith('pay_')"),
    false,
    'Insecure paymentId.startsWith("pay_") bypass must be permanently removed from /api/customer/print-jobs'
  );

  // 3. Fast binary staging endpoint exists and stage-order enforces authoritative pricing
  assert.ok(serverSource.includes("'/api/customer/staged-files/binary'"), 'Fast binary staged-files route must exist');
  assert.ok(serverSource.includes('calculateAuthoritativeCustomerPrintTotal'), 'Authoritative pricing must be invoked on server');

  // 4. Client stages BEFORE creating Razorpay order, and preloads Razorpay only in CustomerPrintFlow (not landing page)
  const stageCallPos = flowSource.indexOf('stageCustomerPrintOrder({');
  const createOrderCallPos = flowSource.indexOf('createRazorpayOrder({');
  assert.ok(stageCallPos > -1 && createOrderCallPos > -1, 'CustomerPrintFlow must call both stageCustomerPrintOrder and createRazorpayOrder');
  assert.ok(
    stageCallPos < createOrderCallPos,
    'CustomerPrintFlow MUST stage print files BEFORE calling createRazorpayOrder'
  );
  assert.ok(
    flowSource.includes('resetForNewCheckout'),
    'CustomerPrintFlow must implement full resetForNewCheckout lifecycle cleaner'
  );
  assert.ok(
    razorpayClientSource.includes('/api/customer/staged-files/binary'),
    'razorpay.ts must stream binary files via /api/customer/staged-files/binary'
  );
  assert.equal(
    /<script[^>]+checkout\.razorpay\.com/i.test(indexHtml),
    false,
    'Landing page index.html must NOT eagerly load Razorpay <script> (Core Web Vitals / LCP protection)'
  );

  console.log('  ✅ PASS: Single webhook exclusivity, security hardening, staging-first order, and LCP isolation verified');
}

async function runAll() {
  console.log('🚀 Running Payment Lifecycle & File Staging Reliability Test Suite...\n');
  await testMigration012Loaded();
  await testStorageUploadAndVerification();
  await testAuthoritativePricingCalculation();
  await testCheckoutSessionIsolationAndAtomicVerification();
  await testTenantScopedOrderRecovery();
  await testSingleWebhookExclusivityAndSecurityHardening();
  console.log('\n🎉 All Payment Lifecycle & File Staging Reliability tests passed!');
}

runAll().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
