import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, shell, dialog, clipboard } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  loadBundledEnv,
  resolvePackagedAsset,
  writeCrashErrorLog,
  getErrorLogPath
} from './storage/AppPaths.js';

// Load bundled .env from process.resourcesPath (when packaged) or project root (in dev)
// with safe fallbacks so missing .env variables never crash the installed Windows .exe.
loadBundledEnv();

import { agentService } from './agent/PrintAgentService.js';
import { localVault } from './storage/LocalDataVault.js';
import { printerManager } from './printer/WindowsPrinterManager.js';
import { logger } from './logger/AgentLogger.js';
import { systemHealthManager } from './health/SystemHealthManager.js';
import { AgentConfig, AgentConnectionStatus } from '../renderer/types/agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let lastNotifiedStatus: AgentConnectionStatus | null = null;
const notifiedJobIds = new Set<string>();
let hasShownFatalDialog = false;

// Global crash & unhandled rejection handlers: log to userData/error.log and show readable Windows dialog
process.on('uncaughtException', (error: Error) => {
  const logFile = writeCrashErrorLog('uncaughtException', error);
  try {
    logger.error('AGENT', `Uncaught Exception: ${error?.message || String(error)}`, {
      stack: error?.stack,
      errorLogPath: logFile
    });
  } catch {}

  if (!hasShownFatalDialog && app.isReady()) {
    hasShownFatalDialog = true;
    try {
      dialog.showErrorBox(
        'Print Agent Error',
        `An unexpected error occurred in Print Agent:\n\n${error?.message || String(error)}\n\nDetails have been written to:\n${logFile || getErrorLogPath()}`
      );
    } catch {}
  }
});

process.on('unhandledRejection', (reason: unknown) => {
  const logFile = writeCrashErrorLog('unhandledRejection', reason);
  const message = reason instanceof Error ? reason.message : String(reason);
  try {
    logger.error('AGENT', `Unhandled Promise Rejection: ${message}`, {
      errorLogPath: logFile
    });
  } catch {}
});

// Configure Windows desktop application identity
try {
  app.setName('Print Agent');
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.printagent.app');
  }
} catch {}

function resolveAssetPath(...relativeCandidates: string[]): string | undefined {
  return resolvePackagedAsset(...relativeCandidates);
}

function getAppWindowIcon(): Electron.NativeImage | string | undefined {
  const iconFile = process.platform === 'win32'
    ? resolveAssetPath('build/icon.ico', 'public/assets/icon.ico', 'dist/renderer/assets/icon.ico', 'build/icon.png')
    : resolveAssetPath('build/icon.png', 'public/assets/icon.png', 'dist/renderer/assets/icon.png');
  return iconFile;
}

function getTrayNativeImage(): Electron.NativeImage {
  const trayFile = process.platform === 'win32'
    ? resolveAssetPath('build/tray-icon.ico', 'build/tray-icon.png', 'public/assets/tray-icon.png', 'build/icon.ico')
    : resolveAssetPath('build/tray-icon.png', 'public/assets/tray-icon.png', 'build/icon.png');
  if (trayFile) {
    const img = nativeImage.createFromPath(trayFile);
    if (!img.isEmpty()) {
      return process.platform === 'win32' ? img : img.resize({ width: 16, height: 16 });
    }
  }
  return nativeImage.createEmpty();
}

function showAgentNotification(title: string, body: string) {
  try {
    if (Notification && Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
        icon: getAppWindowIcon(),
        silent: true
      });
      notification.show();
    }
  } catch {}
}

// 1. Single Instance Lock — prevent multiple instances of Print Agent from running simultaneously
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      localVault.reloadConfig();
      createMainWindow();
      createSystemTray();

      // Configure Windows startup auto-launch safely when packaged
      try {
        const shouldOpenAtLogin = localVault.getConfig().autoStartOnBoot ?? true;
        if (process.platform === 'win32' && app.isPackaged) {
          app.setLoginItemSettings({
            openAtLogin: shouldOpenAtLogin,
            path: process.execPath
          });
        } else {
          app.setLoginItemSettings({ openAtLogin: shouldOpenAtLogin });
        }
      } catch (loginErr: any) {
        logger.warn('AGENT', `Could not set Windows login item settings: ${loginErr?.message || loginErr}`);
      }

      // Wire up logger broadcast to renderer
      logger.setBroadcastListener((entry) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('event:log-added', entry);
        }
      });

      // Wire up agent service listeners
      agentService.setMainWindow(mainWindow);
      agentService.setOnStatusChangeListener((status) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('event:status-changed', status);
        }
        updateTrayMenu();

        if (status !== lastNotifiedStatus) {
          if (status === 'ONLINE' || status === 'CONNECTED') {
            showAgentNotification('EasyToPrint Agent – Connected', 'Your counter PC is online and ready to process print jobs.');
          } else if (lastNotifiedStatus === 'ONLINE' && (status === 'ERROR' || status === 'OFFLINE' || status === 'DISCONNECTED')) {
            showAgentNotification('EasyToPrint Agent – Disconnected', 'Connection to EasyToPrint Cloud was interrupted. Reconnecting in background...');
          }
          lastNotifiedStatus = status;
        }
      });

      agentService.setOnJobUpdateListener((job) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('event:job-updated', job);
        }
        if (job.printStatus === 'COMPLETED' && !notifiedJobIds.has(`${job.id}:COMPLETED`)) {
          notifiedJobIds.add(`${job.id}:COMPLETED`);
          showAgentNotification(
            'EasyToPrint Agent – Print Job Completed',
            `Order ${job.id} (${job.files?.[0]?.fileName || 'Document'}) printed on ${job.printerName || 'default printer'}.`
          );
        } else if (
          (job.printStatus === 'FAILED' || job.printStatus === 'MANUAL_ATTENTION' || job.printStatus === 'REQUIRES_ATTENTION') &&
          !notifiedJobIds.has(`${job.id}:ERROR`)
        ) {
          notifiedJobIds.add(`${job.id}:ERROR`);
          showAgentNotification(
            'EasyToPrint Agent – Printer Attention Required',
            job.errorMessage || `Order ${job.id} requires operator review.`
          );
        }
      });

      agentService.setOnQueueStateChangeListener((queues) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('event:queue-state-changed', queues);
        }
      });

      // Start background agent service
      await agentService.start();
    } catch (startupError: any) {
      const logFile = writeCrashErrorLog('startupException', startupError);
      dialog.showErrorBox(
        'Print Agent Startup Error',
        `Print Agent encountered an error during startup:\n\n${startupError?.message || String(startupError)}\n\nError log saved to:\n${logFile}`
      );
    }
  });
}

// Allow local ES module asset loading across file:// protocol
app.commandLine.appendSwitch('allow-file-access-from-files');

function resolvePreloadPath(): string {
  const candidates = app.isPackaged
    ? [
        path.join(__dirname, 'preload.cjs'),
        path.join(app.getAppPath(), 'dist', 'main', 'preload.cjs'),
        path.join(process.resourcesPath, 'app.asar', 'dist', 'main', 'preload.cjs')
      ]
    : [
        path.join(__dirname, 'preload.cjs'),
        path.resolve(__dirname, '../../dist/main/preload.cjs')
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(__dirname, 'preload.cjs');
}

function createMainWindow() {
  const windowIcon = getAppWindowIcon();
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 740,
    minWidth: 860,
    minHeight: 600,
    title: 'Print Agent – EasyToPrint',
    icon: windowIcon,
    backgroundColor: '#F7F7F7',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      devTools: true
    }
  });

  // Diagnostics: Wire renderer console and loading events to agent logger
  mainWindow.webContents.on('console-message', (event) => {
    if (event.level >= 2) {
      logger.warn('AGENT', `[RENDERER-CONSOLE] [Level ${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error('AGENT', `[WINDOW] Failed to load renderer: ${errorDescription} (${errorCode}) at ${validatedURL}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    const errMsg = `Renderer process gone: reason=${details.reason}, exitCode=${details.exitCode}`;
    logger.error('AGENT', `[RENDERER-CRASH] ${errMsg}`);
    writeCrashErrorLog('render-process-gone', new Error(errMsg));
  });

  // Enable F12 and Ctrl+Shift+I to toggle DevTools for troubleshooting
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.key === 'F12' && input.type === 'keyDown') ||
        (input.control && input.shift && input.key.toLowerCase() === 'i' && input.type === 'keyDown')) {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  const loadLocalBundle = () => {
    const bundleCandidates = app.isPackaged
      ? [
          path.join(__dirname, '../renderer/index.html'),
          path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'),
          path.join(process.resourcesPath, 'app.asar', 'dist', 'renderer', 'index.html')
        ]
      : [
          path.join(__dirname, '../renderer/index.html'),
          path.resolve(__dirname, '../../dist/renderer/index.html')
        ];

    const resolvedBundle = bundleCandidates.find((candidate) => fs.existsSync(candidate));
    if (resolvedBundle) {
      mainWindow?.loadFile(resolvedBundle).catch((err) => {
        logger.error('AGENT', `[WINDOW] Failed to load renderer bundle (${resolvedBundle}): ${err.message}`);
      });
    } else {
      const msg = `No built renderer bundle found. Searched: ${bundleCandidates.join(', ')}`;
      logger.error('AGENT', `[WINDOW] ${msg}`);
      writeCrashErrorLog('missingRendererBundle', new Error(msg));
    }
  };

  const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL).catch((err) => {
      logger.warn('AGENT', `[WINDOW] Could not connect to dev server (${process.env.VITE_DEV_SERVER_URL}): ${err.message}. Loading local bundle...`);
      loadLocalBundle();
    });
  } else {
    loadLocalBundle();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createSystemTray() {
  const icon = getTrayNativeImage();
  tray = new Tray(icon);
  tray.setToolTip('EasyToPrint Agent – Connected');
  updateTrayMenu();

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const status = agentService.getStatus().status;
  const config = localVault.getConfig();
  const printers = printerManager.getCachedPrinters();
  const hasOfflineRegisteredPrinter = printers.some(
    (p) => (config.registeredPrinterNames || []).includes(p.name) && !p.isOnline
  );

  const tooltipStatus =
    status === 'ONLINE' || status === 'CONNECTED'
      ? hasOfflineRegisteredPrinter
        ? 'EasyToPrint Agent – Printer Offline'
        : 'EasyToPrint Agent – Connected'
      : status === 'CONNECTING'
      ? 'EasyToPrint Agent – Connecting...'
      : status === 'RESTRICTED'
      ? 'EasyToPrint Agent – Account Restricted'
      : 'EasyToPrint Agent – Offline';

  tray.setToolTip(tooltipStatus);

  const contextMenu = Menu.buildFromTemplate([
    { label: `EasyToPrint Agent: ${config.shopDetails?.shopName || config.shopSlug || 'Counter'}`, enabled: false },
    { label: tooltipStatus, enabled: false },
    { type: 'separator' },
    {
      label: 'Open EasyToPrint Agent',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    {
      label: 'Check for Jobs Now',
      click: async () => {
        await agentService.pollPendingJobs();
      }
    },
    {
      label: 'Rescan Printers',
      click: async () => {
        await agentService.rescanPrinters();
      }
    },
    { type: 'separator' },
    {
      label: 'Exit EasyToPrint Agent',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// ============================================================================
// IPC MAIN HANDLERS
// ============================================================================

ipcMain.handle('system:get-hostname', () => {
  return os.hostname();
});

ipcMain.handle('agent:get-config', () => {
  return localVault.getPublicConfig();
});

ipcMain.handle('agent:save-config', (_event, partial: unknown) => {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial) || 'authToken' in partial) {
    return { success: false, error: 'Invalid settings payload.' };
  }
  const settings = partial as Record<string, unknown>;
  const allowedKeys = new Set([
    'deviceName',
    'pollIntervalMs',
    'autoStartOnBoot',
    'selectedPrinterName',
    'disabledPrinterNames',
    'allowColorFallback',
    'spoolerTimeoutMs'
  ]);
  if (Object.keys(settings).some((key) => !allowedKeys.has(key))) {
    return { success: false, error: 'Unsupported agent setting.' };
  }
  if (
    (settings.deviceName !== undefined && (typeof settings.deviceName !== 'string' || settings.deviceName.length > 100)) ||
    (settings.pollIntervalMs !== undefined &&
      (typeof settings.pollIntervalMs !== 'number' ||
        !Number.isInteger(settings.pollIntervalMs) ||
        settings.pollIntervalMs < 3000 ||
        settings.pollIntervalMs > 10000)) ||
    (settings.autoStartOnBoot !== undefined && typeof settings.autoStartOnBoot !== 'boolean') ||
    (settings.disabledPrinterNames !== undefined &&
      (!Array.isArray(settings.disabledPrinterNames) ||
        settings.disabledPrinterNames.length > 256 ||
        settings.disabledPrinterNames.some((name) => typeof name !== 'string' || name.length > 256))) ||
    (settings.allowColorFallback !== undefined && typeof settings.allowColorFallback !== 'boolean') ||
    (settings.spoolerTimeoutMs !== undefined &&
      (typeof settings.spoolerTimeoutMs !== 'number' ||
        !Number.isInteger(settings.spoolerTimeoutMs) ||
        settings.spoolerTimeoutMs < 5000 ||
        settings.spoolerTimeoutMs > 120000)) ||
    (settings.selectedPrinterName !== undefined &&
      (typeof settings.selectedPrinterName !== 'string' ||
        (settings.selectedPrinterName !== '' &&
          !printerManager.getCachedPrinters().some((printer) => printer.name === settings.selectedPrinterName))))
  ) {
    return { success: false, error: 'Invalid queue or printer settings.' };
  }
  const result = agentService.updateConfig(partial as Partial<AgentConfig>);
  if (result.success && settings.autoStartOnBoot !== undefined) {
    app.setLoginItemSettings({ openAtLogin: settings.autoStartOnBoot as boolean });
  }
  return result;
});

ipcMain.handle('agent:pair-device', async (_event, pairingData: unknown) => {
  if (!pairingData || typeof pairingData !== 'object' || Array.isArray(pairingData)) {
    return { success: false, error: 'Enter the backend URL, shop ID, token, and device name.' };
  }
  const data = pairingData as Record<string, unknown>;
  if (
    typeof data.serverUrl !== 'string' ||
    typeof data.shopId !== 'string' ||
    typeof data.authToken !== 'string' ||
    typeof data.deviceName !== 'string' ||
    !data.serverUrl.trim() ||
    data.serverUrl.length > 2048 ||
    !data.shopId.trim() ||
    data.shopId.length > 200 ||
    !data.authToken ||
    data.authToken.length > 4096 ||
    !data.deviceName.trim() ||
    data.deviceName.length > 100
  ) return { success: false, error: 'Enter the backend URL, shop ID, token, and device name.' };
  return agentService.pairDevice({
    serverUrl: data.serverUrl,
    shopId: data.shopId,
    authToken: data.authToken,
    deviceName: data.deviceName
  });
});

ipcMain.handle('agent:disconnect-device', async () => {
  const result = await agentService.disconnectDevice();
  if (result.success) {
    app.setLoginItemSettings({ openAtLogin: false });
  }
  return result;
});

ipcMain.handle('agent:get-status', () => {
  return agentService.getStatus();
});

ipcMain.handle('agent:get-shop-info', async () => {
  return agentService.getShopInfo();
});

ipcMain.handle('agent:get-entitlements', () => {
  return agentService.getEntitlements();
});

ipcMain.handle('agent:test-connection', async () => agentService.testConnection());

ipcMain.handle('agent:reset-config', () => {
  const result = agentService.resetConfig();
  if (result.success) app.setLoginItemSettings({ openAtLogin: false });
  return result;
});

ipcMain.handle('agent:get-metrics', () => {
  return localVault.getMetrics();
});

ipcMain.handle('printer:get-list', () => {
  return printerManager.getCachedPrinters();
});

ipcMain.handle('printer:is-scanning', () => {
  return agentService.getIsScanningPrinters();
});

ipcMain.handle('printer:rescan', async () => {
  const printers = await agentService.rescanPrinters();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('event:printers-updated', printers);
  }
  return printers;
});

ipcMain.handle('printer:set-registered', async (_event, printerName: unknown, registered: unknown) => {
  if (typeof printerName !== 'string' || !printerName.trim() || typeof registered !== 'boolean') {
    return { success: false, error: 'Select a valid printer registration action.' };
  }
  return agentService.setPrinterRegistered(printerName, registered);
});

ipcMain.handle('printer:set-enabled', async (_event, printerName: unknown, enabled: unknown) => {
  if (typeof printerName !== 'string' || !printerName.trim() || typeof enabled !== 'boolean') {
    return { success: false, error: 'Select a valid printer enablement action.' };
  }
  return agentService.setPrinterEnabled(printerName, enabled);
});

ipcMain.handle('printer:test-print', async (_event, printerName: unknown) => {
  if (typeof printerName !== 'string' || !printerName.trim()) {
    return { success: false, printerName: '', message: 'Select a valid installed printer.' };
  }
  return agentService.testPrint(printerName);
});

ipcMain.handle('printer:get-configs', () => {
  return localVault.getAllPrinterConfigs();
});

ipcMain.handle('printer:save-owner-config', async (_event, printerName: unknown, config: unknown) => {
  if (typeof printerName !== 'string' || !printerName.trim() || typeof config !== 'object' || !config) {
    return { success: false, error: 'Valid printer name and configuration object required.' };
  }
  return agentService.savePrinterOwnerConfig(printerName, config as any);
});

ipcMain.handle('printer:reset-config', async (_event, printerName: unknown) => {
  if (typeof printerName !== 'string' || !printerName.trim()) {
    return { success: false, error: 'Valid printer name required.' };
  }
  return agentService.resetPrinterConfig(printerName);
});

ipcMain.handle('printer:get-detection-details', (_event, printerName: unknown) => {
  if (typeof printerName !== 'string' || !printerName.trim()) {
    return { success: false, error: 'Valid printer name required.' };
  }
  const cfg = localVault.getPrinterConfig(printerName);
  return { success: Boolean(cfg), hardware: cfg?.hardware };
});

ipcMain.handle('printer:get-driver-status', async () => {
  return printerManager.checkDriverStatus();
});

ipcMain.handle('jobs:get-list', () => {
  return localVault.getAllJobs();
});

ipcMain.handle('queue:get-printer-queues', () => {
  return agentService.getPrinterQueues();
});

ipcMain.handle('queue:pause-printer', (_event, printerName: unknown) => {
  if (typeof printerName !== 'string' || !printerName.trim()) {
    return { success: false, error: 'Valid printer name required.' };
  }
  const result = agentService.pausePrinterQueue(printerName);
  return { success: result };
});

ipcMain.handle('queue:resume-printer', (_event, printerName: unknown) => {
  if (typeof printerName !== 'string' || !printerName.trim()) {
    return { success: false, error: 'Valid printer name required.' };
  }
  const result = agentService.resumePrinterQueue(printerName);
  return { success: result };
});

ipcMain.handle('jobs:poll-now', async () => {
  return agentService.pollPendingJobs();
});

ipcMain.handle('jobs:reprint', async (_event, jobId: unknown) => {
  if (typeof jobId !== 'string' || !jobId.trim()) return { success: false, error: 'Invalid job ID.' };
  return agentService.reprintJob(jobId);
});

ipcMain.handle('jobs:cancel', (_event, jobId: unknown) => {
  if (typeof jobId !== 'string' || !jobId.trim()) return { success: false, error: 'Invalid job ID.' };
  return agentService.cancelJob(jobId);
});

ipcMain.handle('jobs:clear-completed', () => {
  localVault.clearCompletedJobs();
  return true;
});

ipcMain.handle('logs:get-list', () => {
  return logger.getRecentLogs();
});

ipcMain.handle('logs:clear', () => {
  logger.clear();
  return true;
});

ipcMain.handle('logs:export', async () => {
  const options = {
    title: 'Export sanitized EasyToPrint Agent logs',
    defaultPath: `easytoprint-agent-logs-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  };
  const result: any = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { success: false };
  fs.writeFileSync(result.filePath, logger.getSanitizedExport(), 'utf8');
  return { success: true, filePath: result.filePath };
});

ipcMain.handle('health:get-system-health', async () => {
  return systemHealthManager.getSystemHealth();
});

ipcMain.handle('health:run-cleanup', async () => {
  return systemHealthManager.runStorageCleanup();
});

ipcMain.handle('window:copy-text', (_event, value: unknown) => {
  if (typeof value !== 'string' || value.length > 500) return false;
  clipboard.writeText(value);
  return true;
});
ipcMain.handle('window:open-external', async (_event, url: unknown) => {
  if (typeof url !== 'string') throw new Error('Invalid external URL.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Only HTTP(S) URLs are allowed.');
  await shell.openExternal(parsed.toString());
});

ipcMain.on('window:minimize-to-tray', () => {
  mainWindow?.hide();
});

ipcMain.on('window:quit-app', () => {
  isQuitting = true;
  app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  agentService.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep agent running in background tray unless explicitly quit
  }
});
