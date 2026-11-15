import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

let electronApp: { isPackaged?: boolean; getPath?: (name: string) => string; getAppPath?: () => string } | undefined;
try {
  const electron = require('electron');
  electronApp = electron?.app;
} catch {
  electronApp = undefined;
}

function getProcessResourcesPath(): string {
  const proc = process as NodeJS.Process & { resourcesPath?: string };
  return typeof proc.resourcesPath === 'string' ? proc.resourcesPath : '';
}

export const SAFE_ENV_DEFAULTS: Record<string, string> = {
  AGENT_DEFAULT_SERVER_URL: 'https://easytoprint.devpixel.space',
  AGENT_POLL_INTERVAL_MS: '5000',
  AGENT_SPOOLER_TIMEOUT_MS: '30000',
  AGENT_AUTO_START_ON_BOOT: 'true',
  AGENT_LOG_LEVEL: 'INFO'
};

/**
 * Loads bundled .env (or config.env) safely in both development and packaged Windows .exe mode.
 * When app.isPackaged === true, reads from process.resourcesPath first.
 * Never throws if .env is missing; always populates SAFE_ENV_DEFAULTS as fallbacks.
 */
export function loadBundledEnv(): { loadedFrom: string | null } {
  const isPackaged = Boolean(electronApp?.isPackaged);
  const resourcesPath = getProcessResourcesPath();

  const envCandidates = isPackaged
    ? [
        path.join(resourcesPath, '.env'),
        path.join(resourcesPath, 'config.env'),
        path.join(resourcesPath, 'app.asar.unpacked', '.env'),
        path.resolve(__dirname, '../../.env'),
        path.resolve(__dirname, '../../../.env')
      ]
    : [
        path.resolve(__dirname, '../../.env'),
        path.resolve(__dirname, '../../../.env'),
        path.join(process.cwd(), '.env')
      ];

  let loadedFrom: string | null = null;

  try {
    // Optional dotenv require if installed in node_modules
    try {
      const dotenv = require('dotenv');
      for (const candidate of envCandidates) {
        if (candidate && fs.existsSync(candidate)) {
          dotenv.config({ path: candidate });
          loadedFrom = candidate;
          break;
        }
      }
    } catch {
      // Built-in zero-dependency .env parser fallback
      for (const candidate of envCandidates) {
        if (candidate && fs.existsSync(candidate)) {
          const raw = fs.readFileSync(candidate, 'utf8');
          for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx <= 0) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (key && process.env[key] === undefined) {
              process.env[key] = val;
            }
          }
          loadedFrom = candidate;
          break;
        }
      }
    }
  } catch {
    // Non-fatal: fall through to safe defaults
  }

  for (const [key, fallbackValue] of Object.entries(SAFE_ENV_DEFAULTS)) {
    if (!process.env[key] || !String(process.env[key]).trim()) {
      process.env[key] = fallbackValue;
    }
  }

  return { loadedFrom };
}

/**
 * Returns a guaranteed writable userData directory (%APPDATA%\Print Agent on Windows).
 * Never returns process.cwd() or __dirname so installed Windows .exe inside C:\Program Files
 * never encounters EPERM / Access Denied errors.
 */
export function getUserDataDir(): string {
  let basePath = '';
  try {
    if (electronApp && typeof electronApp.getPath === 'function') {
      basePath = electronApp.getPath('userData');
    }
  } catch {
    basePath = '';
  }

  if (!basePath) {
    const appDataRoot =
      process.env.APPDATA ||
      (process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Roaming')
        : path.join(os.homedir(), '.config'));
    basePath = path.join(appDataRoot, 'Print Agent');
  }

  try {
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
    }
  } catch {
    // Fallback to OS temp dir if APPDATA is somehow restricted
    basePath = path.join(os.tmpdir(), 'PrintAgent_UserData');
    try {
      fs.mkdirSync(basePath, { recursive: true });
    } catch {}
  }

  return basePath;
}

/**
 * Returns the OS/Electron writable temporary directory.
 */
export function getWritableTempRoot(): string {
  try {
    if (electronApp && typeof electronApp.getPath === 'function') {
      const electronTemp = electronApp.getPath('temp');
      if (electronTemp) return electronTemp;
    }
  } catch {}
  return os.tmpdir();
}

/**
 * Returns the isolated temporary print spool directory inside %TEMP%.
 */
export function getTempSpoolDir(): string {
  const dir = path.join(getWritableTempRoot(), 'PrintFlow_Spool');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  } catch {}
  return dir;
}

/**
 * Returns the isolated temporary PDF page render cache directory inside %TEMP%.
 */
export function getTempPdfCacheDir(): string {
  const dir = path.join(getWritableTempRoot(), 'PrintFlow_Cache', 'pdf_pages');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  } catch {}
  return dir;
}

/**
 * Returns the writable logs directory inside userData (%APPDATA%\Print Agent\logs).
 */
export function getLogsDir(): string {
  const dir = path.join(getUserDataDir(), 'logs');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {}
  return dir;
}

/**
 * Returns the path to error.log inside userData (%APPDATA%\Print Agent\error.log).
 */
export function getErrorLogPath(): string {
  return path.join(getUserDataDir(), 'error.log');
}

/**
 * Writes uncaughtException / unhandledRejection or startup crash details to %APPDATA%\Print Agent\error.log.
 */
export function writeCrashErrorLog(context: string, err: unknown): string {
  const timestamp = new Date().toISOString();
  const errorMessage = err instanceof Error ? err.message : String(err);
  const errorStack = err instanceof Error && err.stack ? err.stack : errorMessage;
  const errorLogFile = getErrorLogPath();

  const logEntry = [
    `================================================================================`,
    `[${timestamp}] [${context}]`,
    `Platform: ${process.platform} (${os.release()}) ${process.arch}`,
    `Electron: ${process.versions.electron || 'N/A'} | Node: ${process.versions.node}`,
    `Packaged: ${Boolean(electronApp?.isPackaged)} | ResourcesPath: ${getProcessResourcesPath() || 'N/A'}`,
    `UserData: ${getUserDataDir()}`,
    `Message: ${errorMessage}`,
    `Stack: ${errorStack}`,
    ``
  ].join('\n');

  try {
    fs.appendFileSync(errorLogFile, logEntry, 'utf8');
  } catch {
    // Ignore disk write failure
  }

  return errorLogFile;
}

/**
 * Resolves static/bundled assets (icons, preload, extraResources) cleanly across dev and packaged builds.
 */
export function resolvePackagedAsset(...relativeCandidates: string[]): string | undefined {
  const isPackaged = Boolean(electronApp?.isPackaged);
  const resourcesPath = getProcessResourcesPath();
  let appPath = '';
  try {
    appPath = electronApp?.getAppPath?.() || '';
  } catch {
    appPath = '';
  }

  const searchRoots = isPackaged
    ? [
        resourcesPath,
        path.join(resourcesPath, 'app.asar.unpacked'),
        appPath,
        path.join(resourcesPath, 'app.asar'),
        path.resolve(__dirname, '../..'),
        path.resolve(__dirname, '../../..')
      ].filter(Boolean)
    : [
        path.resolve(__dirname, '../..'),
        path.resolve(__dirname, '../../..'),
        appPath,
        process.cwd(),
        resourcesPath
      ].filter(Boolean);

  for (const root of searchRoots) {
    for (const rel of relativeCandidates) {
      const candidate = path.join(root, rel);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}
