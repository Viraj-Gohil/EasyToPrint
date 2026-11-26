#!/usr/bin/env node
/**
 * Generates optimized WebP + JPG visual assets for EasyToPrint public SEO pages
 * and blog articles using @napi-rs/canvas (zero external CLI dependencies).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const optimizedDir = path.join(rootDir, 'public', 'assets', 'optimized');
const imagesDir = path.join(rootDir, 'public', 'assets', 'images');

fs.mkdirSync(optimizedDir, { recursive: true });

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

async function convertExistingPhoto(srcName, outBaseName, targetW, targetH) {
  const srcPath = path.join(imagesDir, srcName);
  if (!fs.existsSync(srcPath)) return;
  const img = await loadImage(srcPath);
  const canvas = createCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Cover-fit crop
  const srcRatio = img.width / img.height;
  const dstRatio = targetW / targetH;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (srcRatio > dstRatio) {
    sw = img.height * dstRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / dstRatio;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  const webpBuf = await canvas.encode('webp', 80);
  const jpgBuf = await canvas.encode('jpeg', 82);
  fs.writeFileSync(path.join(optimizedDir, `${outBaseName}.webp`), webpBuf);
  fs.writeFileSync(path.join(optimizedDir, `${outBaseName}.jpg`), jpgBuf);
  console.log(`[SEO Assets] ${outBaseName}: webp=${(webpBuf.length / 1024).toFixed(1)}KB, jpg=${(jpgBuf.length / 1024).toFixed(1)}KB`);
}

async function renderDiagramGraphic({ fileName, badge, title, subtitle, steps, footerNote }) {
  const W = 960;
  const H = 540;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Clean light background with subtle green architectural grid
  ctx.fillStyle = '#F7FBF8';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(0, 179, 45, 0.065)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Soft top-right radial glow
  const glow = ctx.createRadialGradient(W - 120, 80, 10, W - 120, 80, 340);
  glow.addColorStop(0, 'rgba(0, 179, 45, 0.14)');
  glow.addColorStop(1, 'rgba(0, 179, 45, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Outer card frame
  drawRoundedRect(ctx, 32, 32, W - 64, H - 64, 24);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#DCE6DE';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Brand top row
  drawRoundedRect(ctx, 64, 62, 196, 32, 16);
  ctx.fillStyle = '#E8F8EC';
  ctx.fill();
  ctx.strokeStyle = '#A7F3D0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#008F25';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(badge.toUpperCase(), 80, 83);

  // EasyToPrint brand mark on top right
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.fillText('Easy', W - 188, 84);
  ctx.fillStyle = '#00B32D';
  ctx.fillText('To', W - 142, 84);
  ctx.fillStyle = '#111111';
  ctx.fillText('Print', W - 118, 84);

  // Title & subtitle
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 31px sans-serif';
  ctx.fillText(title, 64, 142);

  ctx.fillStyle = '#525B54';
  ctx.font = '16px sans-serif';
  ctx.fillText(subtitle, 64, 174);

  // Flow cards row
  const count = steps.length;
  const totalInnerW = W - 128;
  const gap = 22;
  const cardW = (totalInnerW - gap * (count - 1)) / count;
  const cardY = 212;
  const cardH = 216;

  steps.forEach((step, idx) => {
    const cx = 64 + idx * (cardW + gap);

    // Connector arrow between cards
    if (idx < count - 1) {
      const arrowX = cx + cardW + 4;
      const arrowY = cardY + cardH / 2;
      ctx.strokeStyle = '#00B32D';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX + gap - 10, arrowY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(arrowX + gap - 16, arrowY - 6);
      ctx.lineTo(arrowX + gap - 8, arrowY);
      ctx.lineTo(arrowX + gap - 16, arrowY + 6);
      ctx.stroke();
    }

    drawRoundedRect(ctx, cx, cardY, cardW, cardH, 18);
    ctx.fillStyle = idx === steps.length - 1 ? '#E8F8EC' : '#F8FAF8';
    ctx.fill();
    ctx.strokeStyle = idx === steps.length - 1 ? '#00B32D' : '#E1E7E1';
    ctx.lineWidth = idx === steps.length - 1 ? 2 : 1.5;
    ctx.stroke();

    // Step number pill
    drawRoundedRect(ctx, cx + 18, cardY + 18, 40, 28, 8);
    ctx.fillStyle = '#00B32D';
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`0${idx + 1}`, cx + 29, cardY + 37);

    // Step label
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(step.heading, cx + 18, cardY + 78);

    // Wrapped description lines
    ctx.fillStyle = '#525B54';
    ctx.font = '13.5px sans-serif';
    const words = step.body.split(' ');
    let line = '';
    let lineY = cardY + 106;
    const maxW = cardW - 36;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW) {
        ctx.fillText(line, cx + 18, lineY);
        line = word;
        lineY += 20;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx + 18, lineY);

    // Bottom status chip
    ctx.fillStyle = '#008F25';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(step.tag, cx + 18, cardY + cardH - 20);
  });

  // Bottom bar
  ctx.strokeStyle = '#E8EFE9';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, H - 76);
  ctx.lineTo(W - 64, H - 76);
  ctx.stroke();

  ctx.fillStyle = '#646B65';
  ctx.font = '13px sans-serif';
  ctx.fillText(footerNote, 64, H - 52);

  ctx.fillStyle = '#008F25';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('easytoprint.devpixel.space', W - 268, H - 52);

  const webpBuf = await canvas.encode('webp', 84);
  const jpgBuf = await canvas.encode('jpeg', 85);
  fs.writeFileSync(path.join(optimizedDir, `${fileName}.webp`), webpBuf);
  fs.writeFileSync(path.join(optimizedDir, `${fileName}.jpg`), jpgBuf);
  console.log(`[SEO Assets] ${fileName}: webp=${(webpBuf.length / 1024).toFixed(1)}KB, jpg=${(jpgBuf.length / 1024).toFixed(1)}KB`);
}

await convertExistingPhoto('cta_print_shop_owner.jpg', 'cta-print-shop-owner', 960, 540);
await convertExistingPhoto('ecosystem_3d_print_automation_1793949545166.jpg', 'ecosystem-print-automation', 960, 540);

await renderDiagramGraphic({
  fileName: 'seo-qr-ordering-flow',
  badge: 'QR Ordering System',
  title: 'Touch-Free QR Code Print Ordering Flow',
  subtitle: 'Replace WhatsApp Web and USB pen drives with instant mobile counter self-service',
  steps: [
    { heading: 'Scan Counter QR', body: 'Customers scan your shop standee QR in Chrome or Safari. No app install required.', tag: 'ZERO APP INSTALL' },
    { heading: 'Upload & Preview', body: 'Upload PDF, JPG, or PNG files with automatic page count and live WYSIWYG preview.', tag: 'AUTO PAGE COUNT' },
    { heading: 'Pay via UPI', body: 'Exact rate calculated from your shop price card. Paid upfront via Razorpay UPI.', tag: 'PREPAID ORDERS' },
    { heading: 'Auto-Print', body: 'Paid jobs dispatch straight to your Windows printer queue with live pickup tracking.', tag: 'WIN32 SPOOLER' }
  ],
  footerNote: 'Built for Indian Xerox shops, college reprography centres, and commercial print counters'
});

await renderDiagramGraphic({
  fileName: 'seo-multi-printer-routing',
  badge: 'Windows Print Agent',
  title: 'Smart Multi-Printer Capability Routing',
  subtitle: 'Connect HP, Canon, Epson, Brother, Ricoh & Konica Minolta printers on one Windows PC',
  steps: [
    { heading: 'Detect Drivers', body: 'Windows Agent inspects installed USB and LAN printers for color, duplex & tray sizes.', tag: 'AUTO DISCOVERY' },
    { heading: 'Match Print Job', body: 'B&W bulk notes route to high-speed laser; color resumes route to photo inkjet.', tag: 'SMART ROUTING' },
    { heading: 'Parallel Queues', body: 'Independent printer queues run concurrently without blocking other counter devices.', tag: 'CONCURRENT PRINT' },
    { heading: 'Health Monitor', body: 'Tracks paper jams, offline status, and recovers queued jobs safely after reconnect.', tag: 'DPAPI SECURED' }
  ],
  footerNote: 'Native Windows 10 & Windows 11 Desktop Print Agent with encrypted cloud synchronization'
});

await renderDiagramGraphic({
  fileName: 'seo-upi-payment-automation',
  badge: 'Online Billing & UPI',
  title: 'Automated Print Pricing & UPI Settlement',
  subtitle: 'Server-verified per-page calculations eliminate manual billing errors and unpaid printouts',
  steps: [
    { heading: 'Set Rate Card', body: 'Configure custom INR rates for A4, Legal, B&W, Color, Single-Sided & Duplex.', tag: 'CUSTOM RATES' },
    { heading: 'Inspect PDF', body: 'System reads exact page count, copy count, and print mode before checkout opens.', tag: 'ZERO GUESSWORK' },
    { heading: 'Verify UPI', body: 'Accept GPay, PhonePe, Paytm & cards via Razorpay with instant webhook validation.', tag: 'VERIFIED PAY' },
    { heading: 'Daily Ledger', body: 'Reconcile counter revenue, job counts, and completed orders from one dashboard.', tag: 'LIVE ANALYTICS' }
  ],
  footerNote: 'Jobs enter the physical printer spooler only after cryptographic payment confirmation'
});

await renderDiagramGraphic({
  fileName: 'seo-print-shop-automation',
  badge: 'Shop Automation',
  title: 'Complete Print Shop Automation Architecture',
  subtitle: 'Unify walk-in QR ordering, cloud queue management, and automated Windows printing',
  steps: [
    { heading: 'Customer Mobile', body: 'Walk-in or remote customers submit print-ready PDFs and track order status live.', tag: 'SELF-SERVICE' },
    { heading: 'Shop Dashboard', body: 'Monitor live orders, manage pricing, download QR standees, and review earnings.', tag: 'CLOUD CONSOLE' },
    { heading: 'Windows Agent', body: 'Silently spools paid jobs to connected printers with auto-delete file privacy.', tag: 'HANDS-FREE' }
  ],
  footerNote: 'Designed for Indian Xerox counters, stationery stores, cyber cafes, and digital presses'
});

console.log('[SEO Assets] All optimized WebP + JPG visual assets generated successfully.');
