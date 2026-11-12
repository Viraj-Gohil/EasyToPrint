#!/usr/bin/env node
/**
 * Generates official EasyToPrint Agent icon & logo assets:
 * - build/icon.ico (Multi-resolution Windows ICO: 16, 24, 32, 48, 64, 128, 256 px)
 * - build/icon.png (256x256 main app icon)
 * - build/icon-{16,24,32,48,64,128,256}.png
 * - build/tray-icon.png (16x16 simplified high-contrast tray icon)
 * - build/tray-icon@2x.png (32x32 high-DPI tray icon)
 * - build/tray-icon.ico (16, 24, 32 px tray ICO)
 * - public/assets/easytoprint-logo.svg
 * - public/assets/easytoprint-mark.svg
 * - public/assets/icon.png
 * - public/assets/tray-icon.png
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const publicAssetsDir = path.join(rootDir, 'public', 'assets');

fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(publicAssetsDir, { recursive: true });

// CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodeRgbaToPng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Filter rows (0 = None)
  const stride = width * 4;
  const rawData = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (stride + 1)] = 0;
    rgba.copy(rawData, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  return Buffer.concat([
    signature,
    createPngChunk('IHDR', ihdr),
    createPngChunk('IDAT', compressed),
    createPngChunk('IEND', Buffer.alloc(0))
  ]);
}

// Signed distance helper for anti-aliased rounded rectangles
function sdRoundedBox(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - halfW + r;
  const qy = Math.abs(py - cy) - halfH + r;
  const outDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inDist = Math.min(Math.max(qx, qy), 0);
  return outDist + inDist - r;
}

function blendPixel(buf, idx, r, g, b, alpha) {
  if (alpha <= 0) return;
  const a = Math.min(1, Math.max(0, alpha));
  const dstR = buf[idx];
  const dstG = buf[idx + 1];
  const dstB = buf[idx + 2];
  const dstA = buf[idx + 3] / 255;

  const outA = a + dstA * (1 - a);
  if (outA <= 0) return;
  buf[idx] = Math.round((r * a + dstR * dstA * (1 - a)) / outA);
  buf[idx + 1] = Math.round((g * a + dstG * dstA * (1 - a)) / outA);
  buf[idx + 2] = Math.round((b * a + dstB * dstA * (1 - a)) / outA);
  buf[idx + 3] = Math.round(outA * 255);
}

/**
 * Renders the official EasyToPrint Printer Icon at arbitrary pixel size with 4x supersampled SDF anti-aliasing.
 * Colors:
 * - Primary Green: #00B52D (0, 181, 45)
 * - Dark Chassis:  #080808 (8, 8, 8)
 * - White Paper:   #FFFFFF (255, 255, 255)
 * - Soft Badge BG: #E8F8EC (232, 248, 236)
 */
function renderEasyToPrintIcon(size, isTray = false) {
  const rgba = Buffer.alloc(size * size * 4, 0);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // Normalize coordinates to [0, 100] space
      const nx = ((x + 0.5) / size) * 100;
      const ny = ((y + 0.5) / size) * 100;
      const aaWidth = 100 / size;

      const fillShape = (dist, r, g, b, opacity = 1) => {
        const cov = Math.min(1, Math.max(0, 0.5 - dist / aaWidth));
        if (cov > 0) blendPixel(rgba, idx, r, g, b, cov * opacity);
      };

      if (!isTray) {
        // 1. Rounded App Container Badge (#00B52D border + #E8F8EC fill)
        const outerDist = sdRoundedBox(nx, ny, 50, 50, 46, 46, 22);
        fillShape(outerDist, 0, 181, 45, 1); // #00B52D outer border
        const innerDist = sdRoundedBox(nx, ny, 50, 50, 42.5, 42.5, 19);
        fillShape(innerDist, 232, 248, 236, 1); // #E8F8EC fill

        // 2. Top Paper Feed (#00B52D)
        const topPaperDist = sdRoundedBox(nx, ny, 50, 27, 17, 10, 3.5);
        fillShape(topPaperDist, 0, 181, 45, 1);

        // Inner white sheet inside top feed
        const topSheetDist = sdRoundedBox(nx, ny, 50, 28, 12.5, 7, 2);
        fillShape(topSheetDist, 255, 255, 255, 1);

        // 3. Main Printer Body (#080808)
        const bodyDist = sdRoundedBox(nx, ny, 50, 51, 31, 17, 7);
        fillShape(bodyDist, 8, 8, 8, 1);

        // 4. Green Status LED on Printer Body (#00B52D)
        const ledDist = Math.hypot(nx - 69, ny - 43) - 3.2;
        fillShape(ledDist, 0, 181, 45, 1);

        // 5. Output Paper Tray (#FFFFFF with #00B52D border)
        const outBorderDist = sdRoundedBox(nx, ny, 50, 68, 20, 13, 4);
        fillShape(outBorderDist, 0, 181, 45, 1);
        const outFillDist = sdRoundedBox(nx, ny, 50, 68, 17.5, 10.5, 2.5);
        fillShape(outFillDist, 255, 255, 255, 1);

        // 6. Printed Green Lines on Output Paper (#00B52D)
        const line1Dist = sdRoundedBox(nx, ny, 50, 65, 11, 1.8, 0.9);
        fillShape(line1Dist, 0, 181, 45, 1);
        const line2Dist = sdRoundedBox(nx, ny, 47, 71, 8, 1.8, 0.9);
        fillShape(line2Dist, 0, 181, 45, 1);
      } else {
        // Simplified high-contrast System Tray mark (optimized for 16px - 32px)
        const badgeDist = sdRoundedBox(nx, ny, 50, 50, 47, 47, 20);
        fillShape(badgeDist, 0, 181, 45, 1); // #00B52D vibrant green badge

        // Top paper sheet (#FFFFFF)
        const topDist = sdRoundedBox(nx, ny, 50, 24, 20, 10, 3);
        fillShape(topDist, 255, 255, 255, 1);

        // Printer chassis (#080808)
        const bodyDist = sdRoundedBox(nx, ny, 50, 52, 34, 18, 6);
        fillShape(bodyDist, 8, 8, 8, 1);

        // Green LED dot (#00B52D)
        const ledDist = Math.hypot(nx - 71, ny - 45) - 4;
        fillShape(ledDist, 0, 181, 45, 1);

        // Output paper (#FFFFFF)
        const outDist = sdRoundedBox(nx, ny, 50, 71, 21, 13, 3);
        fillShape(outDist, 255, 255, 255, 1);
      }
    }
  }

  return encodeRgbaToPng(size, size, rgba);
}

/**
 * Packs an array of { size, pngBuffer } into a standard Windows .ico file
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
  const pngBuffer = renderEasyToPrintIcon(size, false);
  fs.writeFileSync(path.join(buildDir, `icon-${size}.png`), pngBuffer);
  return { size, pngBuffer };
});

// Write main 256x256 icon.png and multi-size icon.ico
const mainPng256 = appImages.find((i) => i.size === 256).pngBuffer;
fs.writeFileSync(path.join(buildDir, 'icon.png'), mainPng256);
fs.writeFileSync(path.join(publicAssetsDir, 'icon.png'), mainPng256);

const appIco = buildIcoFile(appImages);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), appIco);
fs.writeFileSync(path.join(publicAssetsDir, 'icon.ico'), appIco);

// Write tray icons (16, 24, 32)
const tray16 = renderEasyToPrintIcon(16, true);
const tray24 = renderEasyToPrintIcon(24, true);
const tray32 = renderEasyToPrintIcon(32, true);
fs.writeFileSync(path.join(buildDir, 'tray-icon.png'), tray16);
fs.writeFileSync(path.join(buildDir, 'tray-icon@2x.png'), tray32);
fs.writeFileSync(path.join(publicAssetsDir, 'tray-icon.png'), tray32);

const trayIco = buildIcoFile([
  { size: 16, pngBuffer: tray16 },
  { size: 24, pngBuffer: tray24 },
  { size: 32, pngBuffer: tray32 }
]);
fs.writeFileSync(path.join(buildDir, 'tray-icon.ico'), trayIco);

// Write official SVG brand assets to public/assets
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect x="4" y="4" width="56" height="56" rx="16" fill="#E8F8EC" stroke="#00B52D" stroke-width="2.5"/>
  <path d="M21 15C21 13.8954 21.8954 13 23 13H41C42.1046 13 43 13.8954 43 15V24H21V15Z" fill="#00B52D"/>
  <rect x="24" y="16" width="16" height="8" rx="1" fill="#FFFFFF"/>
  <rect x="12" y="24" width="40" height="20" rx="5" fill="#080808"/>
  <circle cx="45" cy="30" r="2.2" fill="#00B52D"/>
  <rect x="19" y="38" width="26" height="14" rx="2.5" fill="#FFFFFF" stroke="#00B52D" stroke-width="2"/>
  <line x1="24" y1="43" x2="40" y2="43" stroke="#00B52D" stroke-width="2" stroke-linecap="round"/>
  <line x1="24" y1="47" x2="35" y2="47" stroke="#00B52D" stroke-width="2" stroke-linecap="round"/>
</svg>
`;

const fullLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 64" fill="none">
  <rect x="4" y="4" width="56" height="56" rx="16" fill="#E8F8EC" stroke="#00B52D" stroke-width="2.5"/>
  <path d="M21 15C21 13.8954 21.8954 13 23 13H41C42.1046 13 43 13.8954 43 15V24H21V15Z" fill="#00B52D"/>
  <rect x="24" y="16" width="16" height="8" rx="1" fill="#FFFFFF"/>
  <rect x="12" y="24" width="40" height="20" rx="5" fill="#080808"/>
  <circle cx="45" cy="30" r="2.2" fill="#00B52D"/>
  <rect x="19" y="38" width="26" height="14" rx="2.5" fill="#FFFFFF" stroke="#00B52D" stroke-width="2"/>
  <line x1="24" y1="43" x2="40" y2="43" stroke="#00B52D" stroke-width="2" stroke-linecap="round"/>
  <line x1="24" y1="47" x2="35" y2="47" stroke="#00B52D" stroke-width="2" stroke-linecap="round"/>
  <text x="74" y="42" font-family="'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="800" letter-spacing="-0.5">
    <tspan fill="#080808">Easy</tspan><tspan fill="#00B52D">To</tspan><tspan fill="#080808">Print</tspan>
  </text>
</svg>
`;

fs.writeFileSync(path.join(publicAssetsDir, 'easytoprint-mark.svg'), markSvg, 'utf8');
fs.writeFileSync(path.join(publicAssetsDir, 'easytoprint-logo.svg'), fullLogoSvg, 'utf8');
fs.writeFileSync(path.join(buildDir, 'easytoprint-mark.svg'), markSvg, 'utf8');
fs.writeFileSync(path.join(buildDir, 'easytoprint-logo.svg'), fullLogoSvg, 'utf8');

console.log('[EasyToPrint Agent] Generated icons and brand assets in build/ and public/assets/');
