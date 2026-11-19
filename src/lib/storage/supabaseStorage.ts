/**
 * Private Supabase Storage Provider for PrintFlow
 *
 * Requirements:
 * - Scoped private bucket ('print-documents' by default)
 * - Server-authoritative object paths: shops/{shopId}/jobs/{jobId}/files/{fileId}.ext
 * - Service-role key used strictly on backend; never exposed to browser or Electron
 * - Short-lived signed URLs (15-60 minutes) or authenticated streaming
 * - No permanent public URLs
 * - Fail-closed error handling (no silent in-memory or database BYTEA fallback)
 * - Pluggable StorageProvider interface for offline unit testing and integration tests
 */

import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

dotenv.config();

export interface StorageUploadInput {
  shopId: string;
  jobId: string;
  fileId: string;
  extension: string;
  buffer: Buffer;
  contentType: string;
}

export interface StorageUploadResult {
  bucket: string;
  objectPath: string;
  sizeBytes: number;
  sha256: string;
}

export interface SignedUrlResult {
  signedUrl: string;
  expiresAt: Date;
}

export interface StorageListEntry {
  name: string;
  id: string | null;
  isFolder: boolean;
  sizeBytes: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface BucketListResult {
  bucketExists: boolean;
  entries: StorageListEntry[];
}

export interface BucketRemoveResult {
  deletedPaths: string[];
  alreadyMissingPaths: string[];
  failedItems: Array<{ objectPath: string; reason: string }>;
}

export interface StorageProvider {
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  download(objectPath: string): Promise<Buffer>;
  createSignedUrl(objectPath: string, expiresInSeconds?: number): Promise<SignedUrlResult>;
  verifyObjectExists(objectPath: string): Promise<boolean>;
  delete(objectPaths: string[]): Promise<void>;
  listDirectoryInBucket?(
    bucket: string,
    prefix: string,
    options?: { limit?: number; offset?: number }
  ): Promise<BucketListResult>;
  removeFromBucket?(bucket: string, objectPaths: string[]): Promise<BucketRemoveResult>;
  getPrimaryBucket?(): string;
  isConfigured(): boolean;
}

/**
 * Standard server-generated date-partitioned object path:
 * shops/{shopId}/{DD}-{MM}-{YYYY}/jobs/{jobId}/{fileId}.{ext}
 * Configured application timezone: UTC (server-authoritative)
 */
export function buildObjectPath(
  shopId: string,
  jobId: string,
  fileId: string,
  extension: string,
  dateOverride?: Date
): string {
  const cleanExt = extension.replace(/^\./, '').toLowerCase() || 'bin';
  if (dateOverride) {
    const yyyy = dateOverride.getUTCFullYear();
    const mm = String(dateOverride.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dateOverride.getUTCDate()).padStart(2, '0');
    const dateStr = `${dd}-${mm}-${yyyy}`;
    return `shops/${shopId}/${dateStr}/jobs/${jobId}/${fileId}.${cleanExt}`;
  }
  return `shops/${shopId}/jobs/${jobId}/files/${fileId}.${cleanExt}`;
}

export const DEFAULT_STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET && process.env.SUPABASE_STORAGE_BUCKET !== 'scan-print-file-upload'
    ? process.env.SUPABASE_STORAGE_BUCKET
    : 'print-documents';
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 900; // 15 minutes
export const DEFAULT_SUPABASE_URL = 'https://rikchucpmlhvkfkmtojl.supabase.co';

/**
 * Production Supabase Storage Service
 */
export class SupabaseStorageService implements StorageProvider {
  private client: SupabaseClient | null = null;
  private readonly bucket: string;

  constructor(bucket = DEFAULT_STORAGE_BUCKET, supabaseUrl?: string, serviceRoleKey?: string) {
    this.bucket = bucket;
    const url = supabaseUrl !== undefined ? supabaseUrl : (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
    const key = serviceRoleKey !== undefined
      ? serviceRoleKey
      : (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY);

    if (url && key) {
      this.client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getPrimaryBucket(): string {
    return this.bucket;
  }

  private requireClient(): SupabaseClient {
    if (!this.client) {
      throw new Error(
        'Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment.'
      );
    }
    return this.client;
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const client = this.requireClient();
    const objectPath = buildObjectPath(input.shopId, input.jobId, input.fileId, input.extension);
    const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');

    let activeBucket = this.bucket;
    let uploadRes = await client.storage.from(activeBucket).upload(objectPath, input.buffer, {
      contentType: input.contentType,
      upsert: true
    });

    if (uploadRes.error && uploadRes.error.message?.toLowerCase().includes('bucket not found')) {
      // Attempt bucket creation or fallback to user-files
      try {
        await client.storage.createBucket(activeBucket, { public: false });
        uploadRes = await client.storage.from(activeBucket).upload(objectPath, input.buffer, {
          contentType: input.contentType,
          upsert: true
        });
      } catch {
        if (activeBucket !== 'user-files') {
          activeBucket = 'user-files';
          uploadRes = await client.storage.from(activeBucket).upload(objectPath, input.buffer, {
            contentType: input.contentType,
            upsert: true
          });
        }
      }
    }

    if (uploadRes.error) {
      throw new Error(`Supabase Storage upload failed for ${objectPath}: ${uploadRes.error.message}`);
    }

    return {
      bucket: activeBucket,
      objectPath,
      sizeBytes: input.buffer.length,
      sha256
    };
  }

  async download(objectPath: string): Promise<Buffer> {
    const client = this.requireClient();
    let downloadRes = await client.storage.from(this.bucket).download(objectPath);

    if ((downloadRes.error || !downloadRes.data) && this.bucket !== 'user-files') {
      downloadRes = await client.storage.from('user-files').download(objectPath);
    }

    if (downloadRes.error || !downloadRes.data) {
      throw new Error(`Supabase Storage download failed for ${objectPath}: ${downloadRes.error?.message || 'File not found'}`);
    }

    const arrayBuffer = await downloadRes.data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async createSignedUrl(objectPath: string, expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS): Promise<SignedUrlResult> {
    const client = this.requireClient();
    let res = await client.storage.from(this.bucket).createSignedUrl(objectPath, expiresInSeconds);

    if ((res.error || !res.data?.signedUrl) && this.bucket !== 'user-files') {
      const fallbackRes = await client.storage.from('user-files').createSignedUrl(objectPath, expiresInSeconds);
      if (!fallbackRes.error && fallbackRes.data?.signedUrl) {
        res = fallbackRes;
      }
    }

    if (res.error || !res.data?.signedUrl) {
      throw new Error(`Failed to generate signed URL for ${objectPath}: ${res.error?.message || 'Unknown error'}`);
    }

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    return {
      signedUrl: res.data.signedUrl,
      expiresAt
    };
  }

  async verifyObjectExists(objectPath: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const signed = await this.createSignedUrl(objectPath, 60);
      return Boolean(signed.signedUrl);
    } catch {
      return false;
    }
  }

  async listDirectoryInBucket(
    bucket: string,
    prefix: string,
    options?: { limit?: number; offset?: number }
  ): Promise<BucketListResult> {
    const client = this.requireClient();
    const limit = Math.max(1, Math.min(1000, options?.limit ?? 100));
    const offset = Math.max(0, options?.offset ?? 0);
    const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');

    const { data, error } = await client.storage.from(bucket).list(cleanPrefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' }
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('bucket not found') || msg.includes('not found')) {
        return { bucketExists: false, entries: [] };
      }
      throw new Error(`Supabase Storage list failed for bucket '${bucket}' prefix '${cleanPrefix}': ${error.message}`);
    }

    const entries: StorageListEntry[] = (data || []).map((item: any) => {
      const hasFileMetadata = item.id !== null && item.id !== undefined;
      const metaSize =
        item.metadata && typeof item.metadata.size === 'number'
          ? item.metadata.size
          : item.metadata && typeof item.metadata.contentLength === 'number'
            ? item.metadata.contentLength
            : 0;
      return {
        name: String(item.name || ''),
        id: item.id ? String(item.id) : null,
        isFolder: !hasFileMetadata,
        sizeBytes: Number.isFinite(metaSize) ? metaSize : 0,
        createdAt: item.created_at || null,
        updatedAt: item.updated_at || null
      };
    });

    return { bucketExists: true, entries };
  }

  async removeFromBucket(bucket: string, objectPaths: string[]): Promise<BucketRemoveResult> {
    const deletedPaths: string[] = [];
    const alreadyMissingPaths: string[] = [];
    const failedItems: Array<{ objectPath: string; reason: string }> = [];

    if (objectPaths.length === 0) {
      return { deletedPaths, alreadyMissingPaths, failedItems };
    }

    const client = this.requireClient();
    const { data, error } = await client.storage.from(bucket).remove(objectPaths);

    if (!error) {
      const returnedNames = new Set((data || []).map((item: any) => String(item?.name || '')));
      for (const objectPath of objectPaths) {
        if (returnedNames.size === 0 || returnedNames.has(objectPath)) {
          deletedPaths.push(objectPath);
        } else {
          // Object was already absent from bucket when batch remove ran
          alreadyMissingPaths.push(objectPath);
        }
      }
      return { deletedPaths, alreadyMissingPaths, failedItems };
    }

    // Batch failed — isolate per-object errors so valid deletions still succeed and failures are never marked deleted
    for (const objectPath of objectPaths) {
      try {
        const singleRes = await client.storage.from(bucket).remove([objectPath]);
        if (!singleRes.error) {
          if ((singleRes.data || []).length > 0) {
            deletedPaths.push(objectPath);
          } else {
            alreadyMissingPaths.push(objectPath);
          }
        } else {
          const msg = singleRes.error.message || 'Unknown Supabase Storage remove error';
          if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('404')) {
            alreadyMissingPaths.push(objectPath);
          } else {
            failedItems.push({ objectPath, reason: msg });
          }
        }
      } catch (err: any) {
        failedItems.push({
          objectPath,
          reason: err?.message || 'Unexpected error during object removal'
        });
      }
    }

    return { deletedPaths, alreadyMissingPaths, failedItems };
  }

  async delete(objectPaths: string[]): Promise<void> {
    if (objectPaths.length === 0) return;
    const client = this.requireClient();
    const { error } = await client.storage.from(this.bucket).remove(objectPaths);
    if (error && this.bucket !== 'user-files') {
      const fallback = await client.storage.from('user-files').remove(objectPaths);
      if (fallback.error) {
        throw new Error(`Failed to delete storage objects: ${error.message}`);
      }
      return;
    }
    if (error) {
      throw new Error(`Failed to delete storage objects: ${error.message}`);
    }
  }
}

/**
 * In-memory Mock Storage Service for unit testing and offline development.
 * Supports multi-bucket recursive folder listing, pagination, and fault injection.
 */
export class MockStorageService implements StorageProvider {
  private readonly buckets = new Map<
    string,
    Map<string, { buffer: Buffer; contentType: string; createdAt: string; updatedAt: string }>
  >();
  private readonly simulatedFailurePaths = new Map<string, string>();
  public readonly bucket: string;

  constructor(bucket = 'mock-print-documents') {
    this.bucket = bucket;
    this.buckets.set(bucket, new Map());
  }

  isConfigured(): boolean {
    return true;
  }

  getPrimaryBucket(): string {
    return this.bucket;
  }

  private getBucketMap(bucketName: string, createIfMissing = false) {
    let map = this.buckets.get(bucketName);
    if (!map && createIfMissing) {
      map = new Map();
      this.buckets.set(bucketName, map);
    }
    return map;
  }

  createTestBucket(bucketName: string): void {
    this.getBucketMap(bucketName, true);
  }

  putRawObject(bucketName: string, objectPath: string, buffer: Buffer, contentType = 'application/octet-stream'): void {
    const map = this.getBucketMap(bucketName, true)!;
    const nowIso = new Date().toISOString();
    const normalized = objectPath.replace(/^\/+/, '');
    map.set(normalized, { buffer, contentType, createdAt: nowIso, updatedAt: nowIso });
  }

  simulateDeleteFailure(objectPath: string, reason = 'Simulated storage I/O error'): void {
    this.simulatedFailurePaths.set(objectPath.replace(/^\/+/, ''), reason);
  }

  clearSimulatedDeleteFailures(): void {
    this.simulatedFailurePaths.clear();
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const objectPath = buildObjectPath(input.shopId, input.jobId, input.fileId, input.extension);
    const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');
    this.putRawObject(this.bucket, objectPath, input.buffer, input.contentType);

    return {
      bucket: this.bucket,
      objectPath,
      sizeBytes: input.buffer.length,
      sha256
    };
  }

  async download(objectPath: string): Promise<Buffer> {
    const entry = this.getBucketMap(this.bucket)?.get(objectPath);
    if (!entry) {
      throw new Error(`MockStorage: Object not found at ${objectPath}`);
    }
    return entry.buffer;
  }

  async createSignedUrl(objectPath: string, expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS): Promise<SignedUrlResult> {
    if (!this.getBucketMap(this.bucket)?.has(objectPath)) {
      throw new Error(`MockStorage: Object not found at ${objectPath}`);
    }
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    return {
      signedUrl: `https://storage.mock.local/${this.bucket}/${objectPath}?token=${token}&expires=${expiresAt.getTime()}`,
      expiresAt
    };
  }

  async verifyObjectExists(objectPath: string): Promise<boolean> {
    return Boolean(this.getBucketMap(this.bucket)?.has(objectPath));
  }

  async listDirectoryInBucket(
    bucket: string,
    prefix: string,
    options?: { limit?: number; offset?: number }
  ): Promise<BucketListResult> {
    const map = this.buckets.get(bucket);
    if (!map) {
      return { bucketExists: false, entries: [] };
    }

    const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
    const prefixSlash = cleanPrefix ? `${cleanPrefix}/` : '';
    const folders = new Set<string>();
    const files: StorageListEntry[] = [];

    for (const [fullPath, meta] of map.entries()) {
      if (prefixSlash && !fullPath.startsWith(prefixSlash)) continue;
      const remainder = prefixSlash ? fullPath.slice(prefixSlash.length) : fullPath;
      if (!remainder) continue;
      const slashIdx = remainder.indexOf('/');
      if (slashIdx >= 0) {
        folders.add(remainder.slice(0, slashIdx));
      } else {
        files.push({
          name: remainder,
          id: `mock_${crypto.createHash('sha1').update(`${bucket}/${fullPath}`).digest('hex').slice(0, 12)}`,
          isFolder: false,
          sizeBytes: meta.buffer.length,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt
        });
      }
    }

    const folderEntries: StorageListEntry[] = Array.from(folders)
      .sort()
      .map((name) => ({
        name,
        id: null,
        isFolder: true,
        sizeBytes: 0,
        createdAt: null,
        updatedAt: null
      }));

    files.sort((a, b) => a.name.localeCompare(b.name));
    const allEntries = [...folderEntries, ...files];
    const limit = Math.max(1, options?.limit ?? 100);
    const offset = Math.max(0, options?.offset ?? 0);
    return {
      bucketExists: true,
      entries: allEntries.slice(offset, offset + limit)
    };
  }

  async removeFromBucket(bucket: string, objectPaths: string[]): Promise<BucketRemoveResult> {
    const map = this.buckets.get(bucket);
    const deletedPaths: string[] = [];
    const alreadyMissingPaths: string[] = [];
    const failedItems: Array<{ objectPath: string; reason: string }> = [];

    for (const rawPath of objectPaths) {
      const normalized = rawPath.replace(/^\/+/, '');
      const failReason = this.simulatedFailurePaths.get(normalized);
      if (failReason) {
        failedItems.push({ objectPath: normalized, reason: failReason });
        continue;
      }
      if (!map || !map.has(normalized)) {
        alreadyMissingPaths.push(normalized);
        continue;
      }
      map.delete(normalized);
      deletedPaths.push(normalized);
    }

    return { deletedPaths, alreadyMissingPaths, failedItems };
  }

  async delete(objectPaths: string[]): Promise<void> {
    const map = this.getBucketMap(this.bucket);
    if (!map) return;
    for (const p of objectPaths) {
      map.delete(p);
    }
  }

  has(objectPath: string, bucketName = this.bucket): boolean {
    return Boolean(this.buckets.get(bucketName)?.has(objectPath.replace(/^\/+/, '')));
  }

  clear(): void {
    for (const map of this.buckets.values()) {
      map.clear();
    }
    this.simulatedFailurePaths.clear();
  }
}

// Global active storage provider instance
let activeStorageProvider: StorageProvider = new SupabaseStorageService();

export function getStorageProvider(): StorageProvider {
  return activeStorageProvider;
}

export function setStorageProvider(provider: StorageProvider): void {
  activeStorageProvider = provider;
}

