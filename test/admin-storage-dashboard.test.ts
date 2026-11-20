import assert from 'node:assert/strict';
import 'dotenv/config';
import { MockStorageService, SupabaseStorageService } from '../src/lib/storage/supabaseStorage';
import {
  executeMidnightStorageCleanup,
  registerMidnightStorageCleanupCron,
  stopMidnightStorageCleanupCron,
  MIDNIGHT_CLEANUP_CRON_EXPRESSION,
  MIDNIGHT_CLEANUP_TIMEZONE
} from '../src/lib/storage/midnightCleanupJob';
import {
  getAdminStorageOverview,
  listAdminStorageFiles,
  listAdminCleanupHistory,
  getAdminStorageCronStatus,
  invalidateAdminStorageCache
} from '../src/services/adminStorageService';
import { initializePaymentTables, requirePostgresPool } from '../src/db/paymentStorage';

async function runTests() {
  console.log('Running Admin Storage Management Dashboard verification suite...');
  await initializePaymentTables();
  const pool = requirePostgresPool();
  const createdRunIds: string[] = [];

  try {
    // Prepare isolated MockStorageService using `print-documents` bucket
    const storage = new MockStorageService('print-documents');
    storage.putRawObject('print-documents', 'shops/shop-1/.emptyFolderPlaceholder', Buffer.alloc(0));
    storage.putRawObject(
      'print-documents',
      'shops/shop-1/jobs/job-done-1/files/f-alpha.pdf',
      Buffer.alloc(2048, 1),
      'application/pdf'
    );
    storage.putRawObject(
      'print-documents',
      'shops/shop-1/jobs/job-done-2/files/f-beta.jpg',
      Buffer.alloc(4096, 2),
      'image/jpeg'
    );
    storage.putRawObject(
      'print-documents',
      'shops/shop-1/jobs/job-done-3/files/f-gamma.png',
      Buffer.alloc(1024, 3),
      'image/png'
    );
    // Protected permanent asset (must never be counted as pending cleanup or deleted)
    storage.putRawObject(
      'print-documents',
      'logos/shop-1-brand.png',
      Buffer.alloc(512, 4),
      'image/png'
    );

    invalidateAdminStorageCache();

    // 1 & 2. Actual file count (excluding .emptyFolderPlaceholder) and exact storage byte sum
    const overviewBefore = await getAdminStorageOverview(pool, storage, { bucket: 'print-documents', refresh: true });
    assert.equal(overviewBefore.totalFiles, 4, 'Expected 4 real files (excluding .emptyFolderPlaceholder)');
    assert.equal(overviewBefore.totalStorageBytes, 2048 + 4096 + 1024 + 512, 'Exact byte sum must match live objects');
    assert.equal(overviewBefore.bucket.name, 'print-documents');
    assert.equal(overviewBefore.bucket.visibility, 'Private');
    assert.equal(overviewBefore.bucket.isPrivate, true);
    assert.equal(overviewBefore.bucket.status, 'Active');
    assert.equal(overviewBefore.pendingCleanup.fileCount, 3, '3 customer print files eligible for cleanup');
    assert.equal(overviewBefore.pendingCleanup.estimatedBytesToRecover, 2048 + 4096 + 1024);
    assert.equal(overviewBefore.pendingCleanup.protectedFileCount, 1, '1 permanent logo file protected');
    console.log('✓ 1 & 2. File count (excluding placeholder), exact storage sum, private bucket, and eligibility verified.');

    // 3. Storage files search, filter, sort, pagination, and zero URL leakage
    const allFiles = await listAdminStorageFiles(pool, storage, {
      bucket: 'print-documents',
      status: 'ACTIVE',
      sortBy: 'size',
      sortOrder: 'desc',
      page: 1,
      pageSize: 2
    });
    assert.equal(allFiles.totalCount, 4);
    assert.equal(allFiles.totalPages, 2);
    assert.equal(allFiles.items.length, 2);
    assert.equal(allFiles.items[0].fileSizeBytes, 4096, 'Descending size sort puts largest file first');
    assert.equal(allFiles.items[1].fileSizeBytes, 2048);

    // Strictly assert NO URL properties exist anywhere in returned file items
    for (const item of allFiles.items) {
      const serialized = JSON.stringify(item);
      assert.ok(!('signedUrl' in item), 'Must never expose signedUrl');
      assert.ok(!('publicUrl' in item), 'Must never expose publicUrl');
      assert.ok(!('downloadUrl' in item), 'Must never expose downloadUrl');
      assert.ok(!serialized.includes('token='), 'Must never leak signed tokens');
    }

    const pdfOnly = await listAdminStorageFiles(pool, storage, {
      bucket: 'print-documents',
      fileType: 'PDF',
      status: 'ACTIVE'
    });
    assert.equal(pdfOnly.totalCount, 1);
    assert.equal(pdfOnly.items[0].fileType, 'PDF');

    const searchMatch = await listAdminStorageFiles(pool, storage, {
      bucket: 'print-documents',
      search: 'gamma',
      status: 'ACTIVE'
    });
    assert.equal(searchMatch.totalCount, 1);
    assert.equal(searchMatch.items[0].fileName, 'f-gamma.png');
    console.log('✓ 3. Search, fileType filter, sort, pagination, and zero URL exposure verified.');

    // 4 & 8. Partial failure logging + real batch cleanup preserving protected files
    storage.simulateDeleteFailure('shops/shop-1/jobs/job-done-3/files/f-gamma.png', 'Simulated S3 500 error');

    const manualRun1 = await executeMidnightStorageCleanup({
      triggerSource: 'MANUAL_ADMIN',
      triggeredBy: 'admin-test@easytoprint.in',
      pool,
      storageProvider: storage,
      buckets: ['print-documents'],
      batchSize: 2
    });
    createdRunIds.push(manualRun1.runId);

    assert.equal(manualRun1.status, 'COMPLETED_WITH_ERRORS');
    assert.equal(manualRun1.executionType, 'MANUAL');
    assert.equal(manualRun1.triggeredBy, 'admin-test@easytoprint.in');
    assert.equal(manualRun1.totalDeleted, 2, '2 eligible files deleted despite 1 simulated failure');
    assert.equal(manualRun1.totalFailed, 1, '1 simulated failure recorded');
    assert.equal(manualRun1.reclaimedBytes, 2048 + 4096);
    assert.equal(storage.has('logos/shop-1-brand.png'), true, 'Protected permanent logo preserved');
    assert.equal(storage.has('shops/shop-1/jobs/job-done-1/files/f-alpha.pdf'), false, 'Deleted file removed');
    assert.equal(storage.has('shops/shop-1/jobs/job-done-3/files/f-gamma.png'), true, 'Failed file remains intact');

    // Clear fault injection and run second cleanup
    storage.clearSimulatedDeleteFailures();
    const manualRun2 = await executeMidnightStorageCleanup({
      triggerSource: 'MANUAL_ADMIN',
      triggeredBy: 'admin-test@easytoprint.in',
      pool,
      storageProvider: storage,
      buckets: ['print-documents']
    });
    createdRunIds.push(manualRun2.runId);
    assert.equal(manualRun2.status, 'COMPLETED');
    assert.equal(manualRun2.totalDeleted, 1);
    assert.equal(manualRun2.reclaimedBytes, 1024);

    // 8b. Failed cleanup when storage credentials are unconfigured is logged in history
    const unconfiguredStorage = new SupabaseStorageService('print-documents', '', '');
    const unconfiguredRun = await executeMidnightStorageCleanup({
      triggerSource: 'MANUAL_ADMIN',
      triggeredBy: 'admin-test@easytoprint.in',
      pool,
      storageProvider: unconfiguredStorage,
      buckets: ['print-documents']
    });
    createdRunIds.push(unconfiguredRun.runId);
    assert.equal(unconfiguredRun.status, 'SKIPPED_UNCONFIGURED');
    assert.ok(unconfiguredRun.error && unconfiguredRun.error.length > 0);
    console.log('✓ 4 & 8. Manual cleanup, batching, protected-file preservation, and failure logging verified.');

    // 9. Cache invalidation & overview refresh after cleanup
    invalidateAdminStorageCache();
    const overviewAfter = await getAdminStorageOverview(pool, storage, { bucket: 'print-documents', refresh: true });
    assert.equal(overviewAfter.totalFiles, 1, 'Only protected logo file remains');
    assert.equal(overviewAfter.totalStorageBytes, 512);
    assert.equal(overviewAfter.pendingCleanup.fileCount, 0);
    assert.equal(overviewAfter.pendingCleanup.estimatedBytesToRecover, 0);
    assert.ok(overviewAfter.lastCleanup !== null, 'Last cleanup must be populated');
    assert.equal(overviewAfter.lastCleanup?.runId, manualRun2.runId);
    assert.ok(overviewAfter.storageRecovered.totalBytesRecovered >= 2048 + 4096 + 1024);
    console.log('✓ 9. Post-cleanup overview refresh and reclaimed metrics verified.');

    // 6. Cron status verification
    registerMidnightStorageCleanupCron({ getPool: () => pool, getStorage: () => storage });
    const cronInfo = await getAdminStorageCronStatus(pool, storage);
    assert.equal(cronInfo.active, true, 'Active node-cron singleton verified');
    assert.equal(cronInfo.cronExpression, MIDNIGHT_CLEANUP_CRON_EXPRESSION);
    assert.equal(cronInfo.timezone, MIDNIGHT_CLEANUP_TIMEZONE);
    assert.equal(cronInfo.bucketName, 'print-documents');
    assert.equal(cronInfo.bucketVisibility, 'Private');
    assert.ok(cronInfo.nextScheduledExecutionIst.endsWith('00:00:00 IST'), 'Next run must be 00:00:00 IST');
    stopMidnightStorageCleanupCron();
    console.log('✓ 6. Automatic midnight IST cron status verification passed.');

    // 7. Cleanup history filtering (search, executionType, status, date range, pagination)
    const todayStr = new Date().toISOString().slice(0, 10);
    const historyManual = await listAdminCleanupHistory(pool, {
      executionType: 'MANUAL',
      search: 'admin-test@easytoprint.in',
      dateFrom: todayStr,
      dateTo: todayStr,
      page: 1,
      pageSize: 10
    });
    assert.ok(historyManual.totalCount >= 3, 'All 3 test runs found in persistent cleanup history');

    const historyPartial = await listAdminCleanupHistory(pool, {
      status: 'PARTIAL',
      search: manualRun1.runId
    });
    assert.equal(historyPartial.totalCount, 1);
    assert.equal(historyPartial.items[0].status, 'Partial');
    assert.ok(historyPartial.items[0].errorMessage?.includes('Simulated S3 500 error'));

    const historyFailed = await listAdminCleanupHistory(pool, {
      status: 'FAILED',
      search: unconfiguredRun.runId
    });
    assert.equal(historyFailed.totalCount, 1);
    assert.equal(historyFailed.items[0].status, 'Failed');
    console.log('✓ 7. Persistent cleanup history filters, date range, pagination, and error logs verified.');

    console.log('\nALL ADMIN STORAGE MANAGEMENT DASHBOARD TESTS PASSED!');
  } finally {
    // Clean up synthetic test audit rows so live admin history stays pristine
    if (createdRunIds.length > 0) {
      await pool.query('DELETE FROM public.storage_cleanup_runs WHERE id = ANY($1::uuid[])', [createdRunIds]);
    }
    stopMidnightStorageCleanupCron();
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error('Admin Storage Dashboard test failed:', err);
  process.exit(1);
});
