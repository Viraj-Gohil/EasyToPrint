/**
 * Comprehensive Automated Verification Suite:
 * EasyToPrint Daily Midnight IST Supabase Storage Auto-Cleanup
 *
 * Uses a dedicated isolated test bucket (`easytoprint-cleanup-test-bucket`)
 * on MockStorageService + an in-memory PostgreSQL query harness.
 * Zero destructive operations are ever executed against real production buckets.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { MockStorageService } from '../src/lib/storage/supabaseStorage';
import {
  MIDNIGHT_CLEANUP_CRON_EXPRESSION,
  MIDNIGHT_CLEANUP_TIMEZONE,
  MIDNIGHT_CLEANUP_UTC_EXPRESSION,
  MIDNIGHT_CLEANUP_UTC_LABEL,
  formatIstTimestamp,
  classifyStorageObjectForCleanup,
  executeMidnightStorageCleanup,
  registerMidnightStorageCleanupCron,
  stopMidnightStorageCleanupCron,
  getMidnightCleanupCronStatus,
  type QueryablePool
} from '../src/lib/storage/midnightCleanupJob';

interface MockDbState {
  advisoryLockAvailable: boolean;
  advisoryLockHeld: boolean;
  failSafetyQuery: boolean;
  printAgentJobs: Array<{
    job_id: string;
    order_id: string;
    print_status: string;
    checkout_session_id: string | null;
    job_data: any;
  }>;
  uploadedFiles: Array<{
    id: string;
    job_id: string;
    object_path: string;
    upload_state: string;
    print_status: string;
    payment_status: string;
    payment_order_status: string | null;
    reconciliation_needed: boolean;
  }>;
  stagedCheckoutFiles: Array<{
    id: string;
    checkout_session_id: string;
    linked_job_id: string | null;
    object_path: string;
    upload_status: string;
    storage_verified: boolean;
    agent_print_status: string | null;
    agent_payment_status: string | null;
    payment_order_status: string | null;
    reconciliation_needed: boolean;
  }>;
  paymentOrders: Array<{ id: string; status: string; amount_minor: number }>;
  cleanupRuns: any[];
}

function createMockQueryablePool(state: MockDbState): QueryablePool {
  return {
    async query(sql: string, params: any[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (normalized.startsWith('SELECT pg_try_advisory_lock')) {
        if (!state.advisoryLockAvailable || state.advisoryLockHeld) {
          return { rows: [{ locked: false }], rowCount: 1 };
        }
        state.advisoryLockHeld = true;
        return { rows: [{ locked: true }], rowCount: 1 };
      }

      if (normalized.startsWith('SELECT pg_advisory_unlock')) {
        state.advisoryLockHeld = false;
        return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
      }

      if (normalized.includes('FROM public.print_agent_jobs')) {
        if (state.failSafetyQuery) {
          throw new Error('Simulated PostgreSQL connection drop during print-job safety check');
        }
        const activeStatuses: string[] = params[0] || [];
        const terminalStatuses: string[] = params[1] || [];
        const rows = state.printAgentJobs.filter((j) => {
          const isActiveStatus = activeStatuses.includes(j.print_status);
          const isPaidUndispatched =
            String(j.job_data?.paymentStatus || '') === 'SUCCESS' &&
            !terminalStatuses.includes(j.print_status);
          return isActiveStatus || isPaidUndispatched;
        });
        return { rows, rowCount: rows.length };
      }

      if (normalized.includes('FROM public.uploaded_files f')) {
        if (state.failSafetyQuery) {
          throw new Error('Simulated PostgreSQL error on uploaded_files');
        }
        const activeStatuses: string[] = params[0] || [];
        const terminalStatuses: string[] = params[1] || [];
        const rows = state.uploadedFiles
          .filter((f) => {
            if (f.upload_state === 'DELETED') return false;
            const notTerminal = !terminalStatuses.includes(f.print_status);
            return (
              activeStatuses.includes(f.print_status) ||
              (f.payment_status === 'SUCCESS' && notTerminal) ||
              (f.payment_order_status === 'PAID' && notTerminal) ||
              (f.reconciliation_needed && notTerminal)
            );
          })
          .map((f) => ({
            file_id: f.id,
            job_id: f.job_id,
            object_path: f.object_path,
            print_status: f.print_status,
            payment_status: f.payment_status,
            payment_order_status: f.payment_order_status,
            reconciliation_needed: f.reconciliation_needed
          }));
        return { rows, rowCount: rows.length };
      }

      if (normalized.includes('FROM public.staged_checkout_files sf')) {
        const activeStatuses: string[] = params[0] || [];
        const terminalStatuses: string[] = params[1] || [];
        const rows = state.stagedCheckoutFiles
          .filter((sf) => {
            if (sf.upload_status === 'DELETED') return false;
            const notTerminal = !terminalStatuses.includes(sf.agent_print_status || '');
            return (
              (sf.agent_print_status && activeStatuses.includes(sf.agent_print_status)) ||
              (sf.agent_payment_status === 'SUCCESS' && notTerminal) ||
              (sf.payment_order_status === 'PAID' && notTerminal) ||
              (sf.reconciliation_needed && notTerminal)
            );
          })
          .map((sf) => ({
            file_id: sf.id,
            checkout_session_id: sf.checkout_session_id,
            linked_job_id: sf.linked_job_id,
            object_path: sf.object_path,
            agent_print_status: sf.agent_print_status,
            agent_payment_status: sf.agent_payment_status,
            payment_order_status: sf.payment_order_status,
            reconciliation_needed: sf.reconciliation_needed
          }));
        return { rows, rowCount: rows.length };
      }

      if (normalized.startsWith('UPDATE public.uploaded_files')) {
        const paths: string[] = params[0] || [];
        let updated = 0;
        for (const f of state.uploadedFiles) {
          if (paths.includes(f.object_path) && f.upload_state !== 'DELETED') {
            f.upload_state = 'DELETED';
            updated++;
          }
        }
        return { rows: [], rowCount: updated };
      }

      if (normalized.startsWith('UPDATE public.staged_checkout_files')) {
        const paths: string[] = params[0] || [];
        let updated = 0;
        for (const sf of state.stagedCheckoutFiles) {
          if (paths.includes(sf.object_path) && sf.upload_status !== 'DELETED') {
            sf.upload_status = 'DELETED';
            sf.storage_verified = false;
            updated++;
          }
        }
        return { rows: [], rowCount: updated };
      }

      if (normalized.startsWith('INSERT INTO public.storage_cleanup_runs')) {
        const colMatch = normalized.match(/\(([^)]+)\)\s*VALUES/i);
        const cols = colMatch ? colMatch[1].split(',').map((c) => c.trim()) : [];
        const record: Record<string, any> = {};
        cols.forEach((col, idx) => {
          record[col] = params[idx];
        });
        state.cleanupRuns.push(record);
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }
  };
}

async function runCleanupTests() {
  console.log('🧪 Running EasyToPrint Daily Midnight IST Storage Cleanup Test Suite...\n');
  let passed = 0;
  let failed = 0;

  async function runTest(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err?.stack || err?.message || err}`);
      failed++;
    }
  }

  // Test 1: Midnight IST schedule constants & UTC-to-IST conversion accuracy
  await runTest('1. Cron schedule is strictly 0 0 * * * in Asia/Kolkata (18:30 UTC previous day)', () => {
    assert.strictEqual(MIDNIGHT_CLEANUP_CRON_EXPRESSION, '0 0 * * *');
    assert.strictEqual(MIDNIGHT_CLEANUP_TIMEZONE, 'Asia/Kolkata');
    assert.strictEqual(MIDNIGHT_CLEANUP_UTC_EXPRESSION, '30 18 * * *');
    assert.ok(MIDNIGHT_CLEANUP_UTC_LABEL.includes('18:30 UTC'));

    // 18:30:00 UTC on 2026-11-18 MUST equal 00:00:00 IST on 2026-11-19
    const midnightIstAsUtc = new Date('2026-11-18T18:30:00.000Z');
    assert.strictEqual(formatIstTimestamp(midnightIstAsUtc), '2026-11-19 00:00:00 IST');
  });

  // Test 2: Strict storage safety classifier (assets, logos, avatars, invoices, backups excluded)
  await runTest('2. Strict storage safety protects permanent/non-print files & allows only customer print paths', () => {
    const protectedPaths = [
      'assets/landing-hero.webp',
      'logos/shop-alpha.png',
      'avatars/user-99.jpg',
      'profiles/owner-1.png',
      'invoices/2026/inv-1001.pdf',
      'receipts/rcpt-2026.pdf',
      'backups/postgres-nightly.sql.gz',
      'system/maintenance.json',
      'templates/print-header.html',
      'shops/shop-1/logos/brand.png',
      'shops/shop-1/invoices/inv-55.pdf',
      'shops/shop-1/jobs/job-1/.emptyFolderPlaceholder',
      '../etc/passwd',
      'random-root-file.pdf'
    ];
    for (const p of protectedPaths) {
      const res = classifyStorageObjectForCleanup(p);
      assert.strictEqual(res.eligible, false, `Expected "${p}" to be protected, got eligible`);
    }

    const eligiblePaths = [
      'shops/shop-1/jobs/job-123/files/doc-1.pdf',
      'shops/shop-1/jobs/chk_session_abc/files/photo.jpg',
      'shops/shop-2/18-11-2026/jobs/job-456/file-9.pdf'
    ];
    for (const p of eligiblePaths) {
      const res = classifyStorageObjectForCleanup(p);
      assert.strictEqual(res.eligible, true, `Expected "${p}" to be eligible, got ${res.reason}`);
    }
  });

  // Test 3: Dedicated test bucket full lifecycle — multi-file, nested folders, pagination,
  // zero age filter, protected non-print files, active print jobs, partial delete failure, DB consistency
  await runTest('3. Dedicated test bucket: recursive scan, pagination (pageSize=3), batch delete, job safety, partial failure, DB consistency', async () => {
    const TEST_BUCKET = 'easytoprint-cleanup-test-bucket';
    const storage = new MockStorageService(TEST_BUCKET);
    storage.createTestBucket(TEST_BUCKET);

    // 14 eligible customer print files across nested shops, dated folders, and brand-new timestamps (no 12h/24h filter!)
    const eligibleFiles: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const p = `shops/shop-alpha/jobs/completed-job-${i}/files/doc-${i}.pdf`;
      eligibleFiles.push(p);
      storage.putRawObject(TEST_BUCKET, p, Buffer.from(`completed-pdf-${i}-payload`), 'application/pdf');
    }
    for (let i = 1; i <= 5; i++) {
      const p = `shops/shop-beta/18-11-2026/jobs/dated-job-${i}/scan-${i}.png`;
      eligibleFiles.push(p);
      storage.putRawObject(TEST_BUCKET, p, Buffer.from(`dated-scan-${i}-payload`), 'image/png');
    }
    // Brand-new abandoned/unpaid checkout uploaded 1 second ago — MUST still be deleted at midnight
    const brandNewAbandoned = 'shops/shop-gamma/jobs/chk_brand_new_unpaid/files/fresh-upload.pdf';
    eligibleFiles.push(brandNewAbandoned);
    storage.putRawObject(TEST_BUCKET, brandNewAbandoned, Buffer.from('uploaded-1-second-ago'), 'application/pdf');

    // One eligible file configured to fail storage deletion (verifies DB is NOT marked deleted on failure)
    const failingDeletePath = 'shops/shop-gamma/jobs/completed-fail-delete/files/locked-file.pdf';
    storage.putRawObject(TEST_BUCKET, failingDeletePath, Buffer.from('transient-storage-error'), 'application/pdf');
    storage.simulateDeleteFailure(failingDeletePath, 'Simulated Supabase 503 transient failure');

    // 4 files belonging to active / paid-undispatched / printing / reconciling print jobs — MUST be preserved!
    const paidUndispatchedPath = 'shops/shop-alpha/jobs/job-paid-waiting/files/paid-doc.pdf';
    const queuedJobPath = 'shops/shop-alpha/jobs/job-queued-1/files/queued-doc.pdf';
    const printingJobPath = 'shops/shop-beta/jobs/job-printing-1/files/printing-doc.pdf';
    const reconcilingPath = 'shops/shop-gamma/jobs/chk_reconcile_1/files/recovery-doc.pdf';
    const activeJobFiles = [paidUndispatchedPath, queuedJobPath, printingJobPath, reconcilingPath];
    for (const p of activeJobFiles) {
      storage.putRawObject(TEST_BUCKET, p, Buffer.from('active-job-must-keep'), 'application/pdf');
    }

    // 7 protected non-print files — MUST remain completely untouched!
    const protectedNonPrintFiles = [
      'assets/easytoprint-banner.webp',
      'logos/shop-alpha.png',
      'avatars/admin-avatar.jpg',
      'invoices/2026/inv-9001.pdf',
      'receipts/rcpt-9001.pdf',
      'backups/db-snapshot.sql',
      'shops/shop-alpha/logos/header-logo.png'
    ];
    for (const p of protectedNonPrintFiles) {
      storage.putRawObject(TEST_BUCKET, p, Buffer.from('permanent-protected-file'), 'application/octet-stream');
    }

    const dbState: MockDbState = {
      advisoryLockAvailable: true,
      advisoryLockHeld: false,
      failSafetyQuery: false,
      printAgentJobs: [
        {
          job_id: 'job-paid-waiting',
          order_id: 'order_paid_waiting',
          print_status: 'READY',
          checkout_session_id: 'chk_paid_waiting',
          job_data: {
            paymentStatus: 'SUCCESS',
            files: [{ id: 'paid-doc', objectPath: paidUndispatchedPath }]
          }
        },
        {
          job_id: 'job-printing-1',
          order_id: 'order_printing_1',
          print_status: 'PRINTING',
          checkout_session_id: null,
          job_data: {
            paymentStatus: 'SUCCESS',
            files: [{ id: 'printing-doc', objectPath: printingJobPath }]
          }
        },
        {
          job_id: 'completed-job-1',
          order_id: 'order_completed_1',
          print_status: 'COMPLETED',
          checkout_session_id: null,
          job_data: {
            paymentStatus: 'SUCCESS',
            files: [{ id: 'doc-1', objectPath: eligibleFiles[0] }]
          }
        }
      ],
      uploadedFiles: [
        {
          id: 'uf-completed-1',
          job_id: 'completed-job-1',
          object_path: eligibleFiles[0],
          upload_state: 'VERIFIED',
          print_status: 'COMPLETED',
          payment_status: 'SUCCESS',
          payment_order_status: 'PAID',
          reconciliation_needed: false
        },
        {
          id: 'uf-fail-delete',
          job_id: 'completed-fail-delete',
          object_path: failingDeletePath,
          upload_state: 'VERIFIED',
          print_status: 'COMPLETED',
          payment_status: 'SUCCESS',
          payment_order_status: 'PAID',
          reconciliation_needed: false
        },
        {
          id: 'uf-queued-1',
          job_id: 'job-queued-1',
          object_path: queuedJobPath,
          upload_state: 'VERIFIED',
          print_status: 'QUEUED',
          payment_status: 'SUCCESS',
          payment_order_status: 'PAID',
          reconciliation_needed: false
        }
      ],
      stagedCheckoutFiles: [
        {
          id: 'sf-abandoned',
          checkout_session_id: 'chk_brand_new_unpaid',
          linked_job_id: null,
          object_path: brandNewAbandoned,
          upload_status: 'UPLOADED',
          storage_verified: true,
          agent_print_status: null,
          agent_payment_status: null,
          payment_order_status: 'CREATED',
          reconciliation_needed: false
        },
        {
          id: 'sf-reconcile',
          checkout_session_id: 'chk_reconcile_1',
          linked_job_id: null,
          object_path: reconcilingPath,
          upload_status: 'LINKED',
          storage_verified: true,
          agent_print_status: 'STAGED',
          agent_payment_status: 'PENDING',
          payment_order_status: 'CREATED',
          reconciliation_needed: true
        }
      ],
      paymentOrders: [
        { id: 'po-1', status: 'PAID', amount_minor: 5000 },
        { id: 'po-2', status: 'PAID', amount_minor: 2500 }
      ],
      cleanupRuns: []
    };

    const pool = createMockQueryablePool(dbState);

    const result = await executeMidnightStorageCleanup({
      triggerSource: 'TEST',
      storageProvider: storage,
      pool,
      buckets: [TEST_BUCKET, 'non-existent-optional-bucket'],
      pageSize: 3, // Forces multi-page recursive traversal across all folders
      batchSize: 4 // Forces multiple batch delete calls
    });

    // Verify execution status & counts
    assert.strictEqual(result.status, 'COMPLETED_WITH_ERRORS');
    assert.deepStrictEqual(result.bucketsScanned, [TEST_BUCKET]);
    assert.deepStrictEqual(result.bucketsSkippedMissing, ['non-existent-optional-bucket']);
    assert.strictEqual(result.totalDiscovered, eligibleFiles.length + 1 + activeJobFiles.length + protectedNonPrintFiles.length);
    assert.strictEqual(result.totalDeleted, eligibleFiles.length, 'All 13 non-failing eligible customer print files deleted');
    assert.strictEqual(result.totalFailed, 1, 'Exactly 1 simulated failure recorded');
    assert.strictEqual(result.totalSkipped, activeJobFiles.length + protectedNonPrintFiles.length);
    assert.ok(result.reclaimedBytes > 0, 'Reclaimed bytes tracked');
    assert.strictEqual(result.failureReasons.length, 1);
    assert.strictEqual(result.failureReasons[0].objectPath, failingDeletePath);
    assert.strictEqual(dbState.advisoryLockHeld, false, 'Advisory lock released in finally');

    // Verify ALL eligible non-failing customer print files were removed (including brand-new upload)
    for (const p of eligibleFiles) {
      assert.strictEqual(storage.has(p, TEST_BUCKET), false, `Expected eligible file "${p}" to be deleted`);
    }

    // Verify failing delete file still exists in storage
    assert.strictEqual(storage.has(failingDeletePath, TEST_BUCKET), true, 'Failed delete object must remain in storage');

    // Verify ALL active print job files were preserved
    for (const p of activeJobFiles) {
      assert.strictEqual(storage.has(p, TEST_BUCKET), true, `Expected active job file "${p}" to be preserved`);
    }

    // Verify ALL protected non-print files were untouched
    for (const p of protectedNonPrintFiles) {
      assert.strictEqual(storage.has(p, TEST_BUCKET), true, `Expected protected file "${p}" to be untouched`);
    }

    // Verify DB consistency:
    // - Confirmed deleted uploaded_file marked DELETED
    assert.strictEqual(dbState.uploadedFiles.find((f) => f.id === 'uf-completed-1')?.upload_state, 'DELETED');
    // - Failed deletion NOT marked DELETED
    assert.strictEqual(dbState.uploadedFiles.find((f) => f.id === 'uf-fail-delete')?.upload_state, 'VERIFIED');
    // - Active queued job NOT marked DELETED
    assert.strictEqual(dbState.uploadedFiles.find((f) => f.id === 'uf-queued-1')?.upload_state, 'VERIFIED');
    // - Abandoned staged file marked DELETED & storage_verified=false
    const abandonedStaged = dbState.stagedCheckoutFiles.find((sf) => sf.id === 'sf-abandoned');
    assert.strictEqual(abandonedStaged?.upload_status, 'DELETED');
    assert.strictEqual(abandonedStaged?.storage_verified, false);
    // - Reconciling staged file preserved
    assert.strictEqual(dbState.stagedCheckoutFiles.find((sf) => sf.id === 'sf-reconcile')?.upload_status, 'LINKED');
    // - Payment history & print jobs completely preserved
    assert.strictEqual(dbState.paymentOrders.length, 2);
    assert.strictEqual(dbState.printAgentJobs.length, 3);
    // - Audit log row persisted
    assert.strictEqual(dbState.cleanupRuns.length, 1);
    assert.strictEqual(dbState.cleanupRuns[0].total_deleted, eligibleFiles.length);
  });

  // Test 4: Fail-closed behavior when PostgreSQL safety lookup throws an error
  await runTest('4. Fail-closed: deletes ZERO files if PostgreSQL print-job safety query fails', async () => {
    const TEST_BUCKET = 'easytoprint-failclosed-bucket';
    const storage = new MockStorageService(TEST_BUCKET);
    storage.createTestBucket(TEST_BUCKET);
    const samplePath = 'shops/shop-1/jobs/job-1/files/a.pdf';
    storage.putRawObject(TEST_BUCKET, samplePath, Buffer.from('must-not-delete-on-db-outage'), 'application/pdf');

    const dbState: MockDbState = {
      advisoryLockAvailable: true,
      advisoryLockHeld: false,
      failSafetyQuery: true,
      printAgentJobs: [],
      uploadedFiles: [],
      stagedCheckoutFiles: [],
      paymentOrders: [],
      cleanupRuns: []
    };

    const result = await executeMidnightStorageCleanup({
      triggerSource: 'TEST',
      storageProvider: storage,
      pool: createMockQueryablePool(dbState),
      buckets: [TEST_BUCKET]
    });

    assert.strictEqual(result.status, 'FAILED');
    assert.strictEqual(result.totalDeleted, 0);
    assert.strictEqual(storage.has(samplePath, TEST_BUCKET), true, 'File must remain untouched on DB error');
    assert.strictEqual(dbState.advisoryLockHeld, false, 'Advisory lock released even on failure');
  });

  // Test 5: Overlap prevention via PostgreSQL advisory lock
  await runTest('5. Overlap prevention skips run cleanly when advisory lock is already held', async () => {
    const TEST_BUCKET = 'easytoprint-overlap-bucket';
    const storage = new MockStorageService(TEST_BUCKET);
    storage.createTestBucket(TEST_BUCKET);
    storage.putRawObject(TEST_BUCKET, 'shops/shop-1/jobs/job-1/files/a.pdf', Buffer.from('overlap-test'), 'application/pdf');

    const dbState: MockDbState = {
      advisoryLockAvailable: false,
      advisoryLockHeld: true,
      failSafetyQuery: false,
      printAgentJobs: [],
      uploadedFiles: [],
      stagedCheckoutFiles: [],
      paymentOrders: [],
      cleanupRuns: []
    };

    const result = await executeMidnightStorageCleanup({
      triggerSource: 'SCHEDULED_CRON',
      storageProvider: storage,
      pool: createMockQueryablePool(dbState),
      buckets: [TEST_BUCKET]
    });

    assert.strictEqual(result.status, 'SKIPPED_OVERLAP');
    assert.strictEqual(result.totalDeleted, 0);
    assert.strictEqual(storage.has('shops/shop-1/jobs/job-1/files/a.pdf', TEST_BUCKET), true);
  });

  // Test 6: Singleton cron registration ensures ONLY ONE scheduled cleanup cron job exists
  await runTest('6. Singleton cron registration prevents duplicate cleanup schedules', () => {
    stopMidnightStorageCleanupCron();
    const first = registerMidnightStorageCleanupCron({
      getPool: () => null,
      getStorage: () => new MockStorageService('print-documents')
    });
    const second = registerMidnightStorageCleanupCron({
      getPool: () => null,
      getStorage: () => new MockStorageService('print-documents')
    });

    assert.strictEqual(first.registered, true);
    assert.strictEqual(first.alreadyRegistered, false);
    assert.strictEqual(first.cronExpression, '0 0 * * *');
    assert.strictEqual(first.timezone, 'Asia/Kolkata');

    assert.strictEqual(second.registered, true);
    assert.strictEqual(second.alreadyRegistered, true, 'Second call must NOT create a duplicate cron job');

    const status = getMidnightCleanupCronStatus();
    assert.strictEqual(status.active, true);
    assert.strictEqual(status.cronExpression, '0 0 * * *');
    assert.strictEqual(status.timezone, 'Asia/Kolkata');
    assert.strictEqual(status.utcCronExpression, '30 18 * * *');

    stopMidnightStorageCleanupCron();
    assert.strictEqual(getMidnightCleanupCronStatus().active, false);
  });

  // Test 7: Static codebase verification on server.ts — confirms ONLY ONE cleanup cron remains
  await runTest('7. server.ts contains ONLY the single midnight IST cleanup cron (no legacy 5-min or setTimeout workers)', () => {
    const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

    const registrationMatches = serverSource.match(/^\s*registerMidnightStorageCleanupCron\(/gm) || [];
    assert.strictEqual(registrationMatches.length, 1, 'Expected exactly 1 registerMidnightStorageCleanupCron() call in server.ts');

    assert.ok(
      !serverSource.includes('runAutomaticDocumentRetentionCleanup'),
      'Legacy 5-minute runAutomaticDocumentRetentionCleanup must be completely removed'
    );
    assert.ok(
      !serverSource.includes('getMsUntilNextMidnightIST'),
      'Legacy setTimeout-based getMsUntilNextMidnightIST must be completely removed'
    );
    assert.ok(
      !serverSource.includes('runMidnightIstStorageCleanupJob'),
      'Legacy runMidnightIstStorageCleanupJob must be completely removed'
    );
    assert.ok(
      !/\b5 \* 60 \* 1000\b/.test(serverSource),
      'Legacy 5-minute cleanup interval must not exist in server.ts'
    );
    assert.ok(
      !/setInterval\([^)]*(cleanup|retention|storage)/i.test(serverSource),
      'No secondary setInterval storage/retention cleanup worker may exist in server.ts'
    );
    assert.ok(
      serverSource.includes('/api/internal/cron/midnight-storage-cleanup'),
      'Authenticated internal cron endpoint must be registered'
    );
  });

  console.log('\n========================================');
  console.log(`Midnight Storage Cleanup Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCleanupTests().catch((err) => {
  console.error('Storage cleanup test execution failed:', err);
  process.exit(1);
});
