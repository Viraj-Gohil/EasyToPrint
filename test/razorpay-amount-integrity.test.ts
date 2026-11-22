import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NeonBusinessRepository } from '../src/db/neonRepositories';
import {
  calculateAuthoritativeCustomerPrintTotal,
  setNeonPoolForTest
} from '../src/db/paymentStorage';

const SHOP_ID = 'a001a111-0000-0000-0000-000000000001';

async function testNeonRepositoryDoesNotMultiplyMinOrderBy100() {
  const capturedQueries: string[] = [];
  const fakeClient = {
    query: async (sql: string) => {
      capturedQueries.push(sql);
      return {
        rowCount: 1,
        rows: [
          {
            id: SHOP_ID,
            slug: 'printflow-counter',
            name: 'EasyToPrint Counter',
            status: 'ACTIVE',
            isOpen: true,
            minOrderAmount: 2,
            autoAccept: true
          }
        ]
      };
    },
    release: () => undefined
  };

  const repo = new NeonBusinessRepository({ connect: async () => fakeClient } as any);
  await repo.findActiveShopBySlug('printflow-counter');
  await repo.findActiveShopByCode('123456');
  await repo.findShopById(SHOP_ID);
  await repo.listAllShops('ACTIVE');

  assert.equal(capturedQueries.length, 4, 'All 4 shop SELECT queries should execute');
  for (const sql of capturedQueries) {
    assert.ok(
      !sql.includes('min_order_amount::float * 100'),
      `SQL must NOT multiply min_order_amount by 100: ${sql}`
    );
    assert.ok(
      sql.includes('min_order_amount::float AS "minOrderAmount"'),
      `SQL must return min_order_amount directly in INR Rupees: ${sql}`
    );
  }
  console.log('  ✅ PASS: NeonBusinessRepository returns min_order_amount in INR Rupees (zero ×100 compounding)');
}

async function testFourRupeeOrderCalculatesExactly400Paise() {
  const mockPool = {
    query: async (sql: string) => {
      if (sql.includes('FROM public.pricing_rules')) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('FROM public.printflow_app_state')) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('min_order_amount') && sql.includes('FROM public.shops')) {
        return { rowCount: 1, rows: [{ min_order_amount: 2 }] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  setNeonPoolForTest(mockPool as any);
  try {
    // Exact scenario from bug report: 1 page, B&W, Single Side, A4, 2 copies @ ₹2/page = ₹4 (400 paise)
    const calc = await calculateAuthoritativeCustomerPrintTotal({
      shopId: SHOP_ID,
      files: [
        {
          pageCount: 1,
          copies: 2,
          colorMode: 'BW',
          paperSize: 'A4',
          duplex: false
        }
      ]
    });

    assert.equal(calc.totalRupees, 4, 'Total must be exactly ₹4');
    assert.equal(calc.amountMinor, 400, 'Razorpay amount must be exactly 400 paise (never 2000000)');
    assert.equal(calc.minOrderAmount, 2, 'Shop min order must remain ₹2');
  } finally {
    setNeonPoolForTest(null);
  }
  console.log('  ✅ PASS: 1 page × 2 copies × ₹2 (A4 B&W Single Side) = ₹4 = 400 paise');
}

async function testCorruptedLegacyMinOrderCannotInflateCheckoutTo20000() {
  const mockPool = {
    query: async (sql: string) => {
      if (sql.includes('FROM public.pricing_rules')) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('FROM public.printflow_app_state')) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('min_order_amount') && sql.includes('FROM public.shops')) {
        // Simulate legacy corrupted DB row (20000.00)
        return { rowCount: 1, rows: [{ min_order_amount: 20000 }] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  setNeonPoolForTest(mockPool as any);
  try {
    const calc = await calculateAuthoritativeCustomerPrintTotal({
      shopId: SHOP_ID,
      files: [
        {
          pageCount: 1,
          copies: 2,
          colorMode: 'BW',
          paperSize: 'A4',
          duplex: false
        }
      ]
    });

    assert.equal(calc.totalRupees, 4, 'Corrupted min_order_amount (20000) must be ignored; total must stay ₹4');
    assert.equal(calc.amountMinor, 400, 'Amount minor must stay 400 paise');
  } finally {
    setNeonPoolForTest(null);
  }
  console.log('  ✅ PASS: Legacy corrupted min_order_amount > ₹500 cannot silently inflate ₹4 to ₹20,000');
}

async function testStaticPaymentIntegrityGuards() {
  const serverCode = fs.readFileSync(path.resolve('server.ts'), 'utf8');
  const flowCode = fs.readFileSync(path.resolve('src/components/customer/CustomerPrintFlow.tsx'), 'utf8');

  // 1. Server must enforce 0-paise exact equality on /api/create-order
  assert.ok(
    serverCode.includes('if (amountInPaise > 0 && amountInPaise !== authoritativeAmountInPaise)'),
    'server.ts must enforce exact 0-paise match between submitted amount and authoritative total'
  );
  // 2. Server must NOT silently auto-multiply <100 amounts in /payment/create-order
  assert.ok(
    !serverCode.includes("numericAmount < 100 && req.path.includes('/payment/create-order')"),
    'server.ts must not contain heuristic double-conversion logic'
  );
  // 3. Server /api/verify-payment must NOT fabricate fake ₹1 orders with || 100 fallback
  assert.ok(
    !serverCode.includes('createdOnDemandDuringVerification: true'),
    'server.ts /api/verify-payment must fail-closed if durable payment_order does not exist'
  );
  // 4. CustomerPrintFlow must always request fresh order and assert exact paise parity before opening Razorpay
  assert.ok(
    flowCode.includes('forceNewOrder: true'),
    'CustomerPrintFlow must always create a fresh Razorpay order on Pay click'
  );
  assert.ok(
    flowCode.includes('returnedAmountInPaise !== expectedAmountInPaise'),
    'CustomerPrintFlow must assert backend amount === Math.round(grandTotal * 100) before opening Razorpay Checkout'
  );

  console.log('  ✅ PASS: All backend & frontend single-source-of-truth payment integrity guards verified');
}

async function run() {
  console.log('\n========================================');
  console.log('Running Razorpay Amount Integrity Tests');
  console.log('========================================\n');

  await testNeonRepositoryDoesNotMultiplyMinOrderBy100();
  await testFourRupeeOrderCalculatesExactly400Paise();
  await testCorruptedLegacyMinOrderCannotInflateCheckoutTo20000();
  await testStaticPaymentIntegrityGuards();

  console.log('\n========================================');
  console.log('All Razorpay Amount Integrity Tests PASSED');
  console.log('========================================\n');
}

run().catch((err) => {
  console.error('\n❌ Razorpay Amount Integrity Test FAILED:', err);
  process.exit(1);
});
