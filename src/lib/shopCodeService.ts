import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

/**
 * Generates a cryptographically secure 6-digit numeric string (000000 - 999999).
 * Preserves leading zeros (e.g. "042815").
 */
export function generateRandom6DigitCode(): string {
  const num = crypto.randomInt(0, 1_000_000);
  return num.toString().padStart(6, '0');
}

/**
 * Validates format of a 6-digit numeric shop code.
 * Rejects non-digits, too short, too long, null, or undefined.
 */
export function isValidShopCode(code?: string | null): boolean {
  if (!code || typeof code !== 'string') return false;
  return /^\d{6}$/.test(code.trim());
}

/**
 * Normalizes user input (strips spaces and dashes).
 */
export function normalizeShopCode(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/\D/g, '').slice(0, 6);
}

/**
 * Generates a collision-free 6-digit shop code against PostgreSQL database or check function.
 * Retries securely up to maxAttempts if a collision occurs.
 */
export async function generateUniqueShopCode(
  executor: Pool | PoolClient | { query: (text: string, params: any[]) => Promise<any> } | ((candidate: string) => Promise<boolean>),
  maxAttempts = 15
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = generateRandom6DigitCode();
    try {
      if (typeof executor === 'function') {
        const isTaken = await executor(candidate);
        if (!isTaken) {
          return candidate;
        }
      } else if (executor && typeof (executor as any).query === 'function') {
        const res = await (executor as any).query(
          'SELECT 1 FROM public.shops WHERE shop_code = $1 LIMIT 1',
          [candidate]
        );
        if (!res || res.rowCount === 0) {
          return candidate;
        }
      } else {
        return candidate;
      }
    } catch {
      // If table doesn't have shop_code yet during initial migrations, return candidate
      return candidate;
    }
  }
  throw new Error('Failed to generate a unique 6-digit shop code after maximum attempts.');
}
