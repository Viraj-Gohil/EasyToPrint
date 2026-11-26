#!/usr/bin/env node
/**
 * Generates official EasyToPrint Agent icon assets from build/source-icon.png:
 * - build/icon.ico (Multi-resolution Windows ICO: 16, 24, 32, 48, 64, 128, 256 px)
 * - build/icon.png (256x256 main app icon)
 * - build/icon-{16,24,32,48,64,128,256}.png
 * - build/tray-icon.png (16x16 system tray icon)
 * - build/tray-icon@2x.png (32x32 high-DPI tray icon)
 * - build/tray-icon.ico (16, 24, 32 px tray ICO)
 * - public/assets/icon.png (512x512 HiDPI renderer UI icon)
 * - public/assets/icon.ico
 * - public/assets/tray-icon.png (32x32)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const publicAssetsDir = path.join(rootDir, 'public', 'assets');

fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(publicAssetsDir, { recursive: true });

const candidateSourcePaths = [
  path.join(buildDir, 'source-icon.png'),
  path.resolve(rootDir, '..', 'public', 'assets', 'aistudio', 'EasyToPrint_Mint_Wave_App_Icon_f82e7e8d.png')
];

const sourceIconPath = candidateSourcePaths.find((candidate) => fs.existsSync(candidate));
if (!sourceIconPath) {
  throw new Error(
    `[EasyToPrint Agent] Source icon not found. Checked: ${candidateSourcePaths.join(', ')}`
  );
}

// Keep build/source-icon.png synced when building from workspace fallback
const canonicalSourcePath = path.join(buildDir, 'source-icon.png');
if (path.resolve(sourceIconPath) !== path.resolve(canonicalSourcePath)) {
  fs.copyFileSync(sourceIconPath, canonicalSourcePath);
}

const sourceImage = await loadImage(sourceIconPath);

// Exact rounded squircle artwork bounds inside the 1254x1254 source asset (trimming outer white margin & drop shadow)
const isStandardMintWaveSource = sourceImage.width === 1254 && sourceImage.height === 1254;
const cropBox = isStandardMintWaveSource
  ? { sx: 86, sy: 98, sw: 1074, sh: 1068 }
  : { sx: 0, sy: 0, sw: sourceImage.width, sh: sourceImage.height };

function drawRoundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Renders the user-provided EasyToPrint Mint Wave icon at the requested pixel size
 * with transparent rounded corners and high-quality resampling.
 */
function renderAppIconPng(size, isTray = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const inset = isTray ? 0 : Math.max(0, Math.round(size * 0.02));
  const drawSize = size - inset * 2;
  const radius = drawSize * 0.225;

  ctx.save();
  drawRoundedRectPath(ctx, inset, inset, drawSize, drawSize, radius);
  ctx.clip();
  ctx.drawImage(
    sourceImage,
    cropBox.sx,
    cropBox.sy,
    cropBox.sw,
    cropBox.sh,
    inset,
    inset,
    drawSize,
    drawSize
  );
  ctx.restore();

  // Subtle crisp 1px edge ring so the white card reads cleanly on both light and dark Windows surfaces
  if (size >= 32) {
    ctx.save();
    const strokeWidth = Math.max(1, size / 128);
    const half = strokeWidth / 2;
    drawRoundedRectPath(
      ctx,
      inset + half,
      inset + half,
      drawSize - strokeWidth,
      drawSize - strokeWidth,
      Math.max(1, radius - half)
    );
    ctx.strokeStyle = 'rgba(17, 24, 39, 0.09)';
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

/**
 * Packs an array of { size, pngBuffer } into a standard multi-resolution Windows .ico file
 */
function buildIcoFile(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let dataOffset = 6 + count * 16;

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry[0] = img.size >= 256 ? 0 : img.size; // width (0 means 256)
    entry[1] = img.size >= 256 ? 0 : img.size; // height (0 means 256)
    entry[2] = 0; // palette colors
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(img.pngBuffer.length, 8); // byte size
    entry.writeUInt32LE(dataOffset, 12); // offset
    dirEntries.push(entry);
    dataOffset += img.pngBuffer.length;
  }

  return Buffer.concat([header, ...dirEntries, ...images.map((i) => i.pngBuffer)]);
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const appImages = sizes.map((size) => {
  const pngBuffer = renderAppIconPng(size, false);
  fs.writeFileSync(path.join(buildDir, `icon-${size}.png`), pngBuffer);
  return { size, pngBuffer };
});

// Write 256x256 main icon.png for Electron Linux/macOS and 512x512 HiDPI icon.png for renderer UI
const mainPng256 = appImages.find((i) => i.size === 256).pngBuffer;
const uiPng512 = renderAppIconPng(512, false);
fs.writeFileSync(path.join(buildDir, 'icon.png'), mainPng256);
fs.writeFileSync(path.join(publicAssetsDir, 'icon.png'), uiPng512);

const appIco = buildIcoFile(appImages);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), appIco);
fs.writeFileSync(path.join(publicAssetsDir, 'icon.ico'), appIco);

// Write tray icons (16, 24, 32)
const tray16 = renderAppIconPng(16, true);
const tray24 = renderAppIconPng(24, true);
const tray32 = renderAppIconPng(32, true);
fs.writeFileSync(path.join(buildDir, 'tray-icon.png'), tray16);
fs.writeFileSync(path.join(buildDir, 'tray-icon@2x.png'), tray32);
fs.writeFileSync(path.join(publicAssetsDir, 'tray-icon.png'), tray32);

const trayIco = buildIcoFile([
  { size: 16, pngBuffer: tray16 },
  { size: 24, pngBuffer: tray24 },
  { size: 32, pngBuffer: tray32 }
]);
fs.writeFileSync(path.join(buildDir, 'tray-icon.ico'), trayIco);

console.log('[EasyToPrint Agent] Generated official Mint Wave icons in build/ and public/assets/');
