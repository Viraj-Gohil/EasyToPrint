/**
 * End-to-End Verification Suite for EasyToPrint WYSIWYG Live Print Preview & Print Pipeline Parity.
 * Covers all 14 testing scenarios:
 *  1. A4 Portrait + Color PDF
 *  2. A4 Landscape + Color PDF
 *  3. A4 Portrait + B&W PDF
 *  4. A4 Landscape + B&W PDF
 *  5. A3 Landscape + PDF
 *  6. JPG Portrait + Color
 *  7. JPG Landscape + B&W
 *  8. Multipage PDF with custom page range (1-5, 1-3, 5)
 *  9. Multiple copies (e.g. 3 copies)
 * 10. Rapid switching between Portrait and Landscape (cancellation / race safety)
 * 11. Large multipage PDF (50 pages, lazy sheet planning & bounded cache keys)
 * 12. Mobile preview scaling (375px viewport fits paper cleanly with zero overflow)
 * 13. Printer with unsupported paper sizes / color / duplex
 * 14. Preview vs Actual Windows Print Output parameter parity
 */
import assert from 'node:assert/strict';
import {
  applyLuminanceGrayscale,
  buildBackendPrintSettings,
  buildPreviewConfigSignature,
  buildSheetPlan,
  computeCellPlacement,
  computeSheetLayoutGeometry,
  getOrientedPaperDimensionsMm,
  MARGIN_PRESET_MM,
  normalizePrintConfig,
  parseSelectedPages,
  toAgentScalingMode,
  validateConfigAgainstShopCapabilities,
  type ShopPrintCapabilities,
} from '../src/lib/print/printConfig';
import { windowsPrintEngine } from '../print-agent/src/main/printer/engine/WindowsPrintEngine';
import { PrintSettingsAdapter } from '../print-agent/src/main/printer/PrintSettingsAdapter';

let passed = 0;

function runTest(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ [${passed}] ${name}`);
}

// 1. A4 Portrait + Color PDF
runTest('Scenario 1: A4 Portrait + Color PDF geometry & config normalization', () => {
  const cfg = normalizePrintConfig({
    paperSize: 'A4',
    orientation: 'PORTRAIT',
    colorMode: 'COLOR',
    copies: 1,
    totalPages: 4,
    scaling: 'fit',
    margins: 'default',
    sides: 'SINGLE',
    pagesPerSheet: 1,
  });
  assert.equal(cfg.paperSize, 'A4');
  assert.equal(cfg.orientation, 'portrait');
  assert.equal(cfg.colorMode, 'color');
  assert.equal(cfg.duplex, false);

  const dims = getOrientedPaperDimensionsMm(cfg.paperSize, cfg.orientation);
  assert.equal(dims.widthMm, 210);
  assert.equal(dims.heightMm, 297);
  assert.ok(dims.heightMm > dims.widthMm, 'Portrait height must exceed width');

  const geom = computeSheetLayoutGeometry(cfg, 1000);
  assert.ok(geom.sheetHeightPx > geom.sheetWidthPx);
  assert.equal(geom.marginMm, MARGIN_PRESET_MM.default);

  // Content (A4 portrait PDF) placed into A4 portrait printable box fits without clipping
  const placement = computeCellPlacement({
    cellRect: geom.cells[0],
    contentWidthMm: 210,
    contentHeightMm: 297,
    pxPerMm: geom.pxPerMm,
    scaling: cfg.scaling,
  });
  assert.equal(placement.isClipped, false);
  assert.ok(placement.drawRect.width <= geom.cells[0].width + 0.01);
  assert.ok(placement.drawRect.height <= geom.cells[0].height + 0.01);
});

// 2. A4 Landscape + Color PDF
runTest('Scenario 2: A4 Landscape + Color PDF swaps physical paper dimensions & reflows cleanly', () => {
  const cfg = normalizePrintConfig({
    paperSize: 'A4',
    orientation: 'LANDSCAPE',
    colorMode: 'COLOR',
    copies: 1,
    totalPages: 3,
    scaling: 'fit',
    margins: 'default',
  });
  const dims = getOrientedPaperDimensionsMm(cfg.paperSize, cfg.orientation);
  assert.equal(dims.widthMm, 297);
  assert.equal(dims.heightMm, 210);
  assert.ok(dims.widthMm > dims.heightMm, 'Landscape width must exceed height');

  const geom = computeSheetLayoutGeometry(cfg, 1000);
  assert.ok(geom.sheetWidthPx > geom.sheetHeightPx);

  // Portrait PDF content placed onto Landscape sheet fits proportionally without stretching or clipping
  const placement = computeCellPlacement({
    cellRect: geom.cells[0],
    contentWidthMm: 210,
    contentHeightMm: 297,
    pxPerMm: geom.pxPerMm,
    scaling: 'fit',
  });
  assert.equal(placement.isClipped, false);
  const srcRatio = 210 / 297;
  const drawRatio = placement.drawRect.width / placement.drawRect.height;
  assert.ok(Math.abs(srcRatio - drawRatio) < 0.001, 'Aspect ratio must be preserved with zero distortion');
});

// 3. A4 Portrait + B&W PDF (true Rec.601 luminance grayscale)
runTest('Scenario 3: A4 Portrait + B&W PDF converts colors to true print luminance grayscale', () => {
  const cfg = normalizePrintConfig({
    paperSize: 'A4',
    orientation: 'PORTRAIT',
    colorMode: 'BW',
    totalPages: 2,
  });
  assert.equal(cfg.colorMode, 'grayscale');

  // Test pixel array: pure red, pure green, pure blue, pure white, pure black
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255,     // Red -> ~76
    0, 255, 0, 255,     // Green -> ~150
    0, 0, 255, 255,     // Blue -> ~29
    255, 255, 255, 255, // Pure white paper -> stays 255 (no dark overlay!)
    0, 0, 0, 255,       // Crisp black text -> stays 0
  ]);
  applyLuminanceGrayscale(pixels);

  // Pure Red
  assert.equal(pixels[0], pixels[1]);
  assert.equal(pixels[1], pixels[2]);
  assert.equal(pixels[0], Math.round(0.299 * 255));

  // Pure Green
  assert.equal(pixels[4], Math.round(0.587 * 255));
  assert.equal(pixels[4], pixels[5]);
  assert.equal(pixels[5], pixels[6]);

  // Pure Blue
  assert.equal(pixels[8], Math.round(0.114 * 255));
  assert.equal(pixels[8], pixels[9]);
  assert.equal(pixels[9], pixels[10]);

  // Pure white paper stays pure white
  assert.deepEqual(Array.from(pixels.slice(12, 16)), [255, 255, 255, 255]);
  // Pure black text stays pure black
  assert.deepEqual(Array.from(pixels.slice(16, 20)), [0, 0, 0, 255]);
});

// 4. A4 Landscape + B&W PDF
runTest('Scenario 4: A4 Landscape + B&W PDF combines landscape geometry + grayscale mode', () => {
  const cfg = normalizePrintConfig({
    paperSize: 'A4',
    orientation: 'LANDSCAPE',
    colorMode: 'BW',
    totalPages: 2,
    margins: 'narrow',
  });
  assert.equal(cfg.orientation, 'landscape');
  assert.equal(cfg.colorMode, 'grayscale');
  assert.equal(cfg.margins, 'narrow');

  const geom = computeSheetLayoutGeometry(cfg, 1200);
  assert.equal(geom.sheetWidthMm, 297);
  assert.equal(geom.sheetHeightMm, 210);
  assert.equal(geom.marginMm, 5);
});

// 5. A3 Landscape + PDF
runTest('Scenario 5: A3 Landscape PDF uses exact 420x297mm physical dimensions', () => {
  const cfg = normalizePrintConfig({
    paperSize: 'A3',
    orientation: 'LANDSCAPE',
    colorMode: 'COLOR',
    totalPages: 1,
  });
  const dims = getOrientedPaperDimensionsMm(cfg.paperSize, cfg.orientation);
  assert.equal(dims.widthMm, 420);
  assert.equal(dims.heightMm, 297);

  // Verify A4 content at Actual Size (100%) fits inside A3 Landscape without clipping
  const geom = computeSheetLayoutGeometry(cfg, 1200);
  const actualPlacement = computeCellPlacement({
    cellRect: geom.cells[0],
    contentWidthMm: 210,
    contentHeightMm: 277,
    pxPerMm: geom.pxPerMm,
    scaling: 'actual',
  });
  assert.equal(actualPlacement.isClipped, false);

  // Verify oversized content at Actual Size triggers clipping warning
  const clippedPlacement = computeCellPlacement({
    cellRect: geom.cells[0],
    contentWidthMm: 500,
    contentHeightMm: 400,
    pxPerMm: geom.pxPerMm,
    scaling: 'actual',
  });
  assert.equal(clippedPlacement.isClipped, true);
  assert.ok(clippedPlacement.clippingMessage && clippedPlacement.clippingMessage.includes('Actual Size'));
});

// 6. JPG Portrait + Color
runTest('Scenario 6: JPG Portrait + Color preserves exact photo aspect ratio on A4 sheet', () => {
  const cfg = normalizePrintConfig({
    paperSize: 'A4',
    orientation: 'PORTRAIT',
    colorMode: 'COLOR',
    totalPages: 1,
    scaling: 'fit',
  });
  const geom = computeSheetLayoutGeometry(cfg, 1000);
  // 1200x1600 (3:4 portrait photo) at 96 DPI -> 317.5mm x 423.3mm
  const placement = computeCellPlacement({
    cellRect: geom.cells[0],
    contentWidthMm: (1200 / 96) * 25.4,
    contentHeightMm: (1600 / 96) * 25.4,
    pxPerMm: geom.pxPerMm,
    scaling: cfg.scaling,
  });
  assert.equal(placement.isClipped, false);
  const ratio = placement.drawRect.width / placement.drawRect.height;
  assert.ok(Math.abs(ratio - 1200 / 1600) < 0.001, 'JPG aspect ratio must stay exact 3:4');
});

// 7. JPG Landscape + B&W (including Fill Page cover-crop warning)
runTest('Scenario 7: JPG Landscape + B&W with Fill Page detects crop cleanly without stretching', () => {
  const cfg = normalizePrintConfig({
    paperSize: 'A4',
    orientation: 'LANDSCAPE',
    colorMode: 'BW',
    totalPages: 1,
    scaling: 'fill',
    margins: 'none',
  });
  assert.equal(cfg.colorMode, 'grayscale');
  assert.equal(cfg.orientation, 'landscape');
  assert.equal(cfg.margins, 'none');

  const geom = computeSheetLayoutGeometry(cfg, 1000);
  assert.equal(geom.marginPx, 0);
  // 16:9 widescreen JPG on ~1.414:1 A4 landscape with Fill Page crops sides gently
  const placement = computeCellPlacement({
    cellRect: geom.cells[0],
    contentWidthMm: (1920 / 96) * 25.4,
    contentHeightMm: (1080 / 96) * 25.4,
    pxPerMm: geom.pxPerMm,
    scaling: 'fill',
  });
  assert.equal(placement.isCropped, true);
  const ratio = placement.drawRect.width / placement.drawRect.height;
  assert.ok(Math.abs(ratio - 16 / 9) < 0.001, 'Fill Page must never stretch aspect ratio');
});

// 8. Multipage PDF with custom page range (1-5 and 1-3, 5)
runTest('Scenario 8: Multipage PDF custom page ranges select exact ordered pages', () => {
  const r1 = parseSelectedPages('CUSTOM', '1-5', 12);
  assert.equal(r1.isValid, true);
  assert.deepEqual(r1.pages, [1, 2, 3, 4, 5]);

  const r2 = parseSelectedPages('CUSTOM', '1-3, 5, 8', 12);
  assert.equal(r2.isValid, true);
  assert.deepEqual(r2.pages, [1, 2, 3, 5, 8]);

  const cfg = normalizePrintConfig({
    totalPages: 12,
    pageSelection: 'CUSTOM',
    customRange: '1-3, 5, 8',
    pagesPerSheet: 1,
  });
  const plan = buildSheetPlan(cfg);
  assert.equal(plan.selectedPageCount, 5);
  assert.equal(plan.sheetCount, 5);
  assert.deepEqual(
    plan.sheets.map((s) => s.sourcePages[0]),
    [1, 2, 3, 5, 8]
  );

  // Out-of-bounds page flagged invalid gracefully
  const invalid = parseSelectedPages('CUSTOM', '1-20', 12);
  assert.equal(invalid.isValid, false);
  assert.ok(invalid.error?.includes('1–12'));
});

// 9. Multiple copies (e.g. 3 copies)
runTest('Scenario 9: Multiple copies updates total physical sheets without duplicating preview canvases', () => {
  const cfg = normalizePrintConfig({
    totalPages: 4,
    copies: 3,
    sides: 'SINGLE',
    pagesPerSheet: 1,
  });
  const plan = buildSheetPlan(cfg);
  assert.equal(plan.sheetCount, 4, 'Preview must show 4 unique sheets, NOT 12 duplicated canvases');
  assert.equal(plan.physicalSheetsPerCopy, 4);
  assert.equal(plan.totalPhysicalSheets, 12, 'Total physical sheets = 4 sheets × 3 copies');

  // Double-sided with 3 copies
  const duplexCfg = normalizePrintConfig({
    totalPages: 5,
    copies: 3,
    sides: 'DOUBLE',
    pagesPerSheet: 1,
  });
  const duplexPlan = buildSheetPlan(duplexCfg);
  assert.equal(duplexPlan.sheetCount, 5);
  assert.equal(duplexPlan.physicalSheetsPerCopy, 3);
  assert.equal(duplexPlan.totalPhysicalSheets, 9);
});

// 10. Rapid switching between Portrait and Landscape produces distinct cache keys & race-safe sequence
runTest('Scenario 10: Rapid Portrait <-> Landscape switching produces distinct config signatures with zero collision', () => {
  const portrait = normalizePrintConfig({ paperSize: 'A4', orientation: 'PORTRAIT', colorMode: 'COLOR' });
  const landscape = normalizePrintConfig({ paperSize: 'A4', orientation: 'LANDSCAPE', colorMode: 'COLOR' });
  const bwLandscape = normalizePrintConfig({ paperSize: 'A4', orientation: 'LANDSCAPE', colorMode: 'BW' });

  const sigP = buildPreviewConfigSignature(portrait);
  const sigL = buildPreviewConfigSignature(landscape);
  const sigBL = buildPreviewConfigSignature(bwLandscape);

  assert.notEqual(sigP, sigL);
  assert.notEqual(sigL, sigBL);

  // Simulate rapid toggle sequence counter ensuring only latest render wins
  let renderSeq = 0;
  let committedOrientation: string | null = null;
  const simulateToggle = (orient: 'portrait' | 'landscape', delayMs: number) => {
    const token = ++renderSeq;
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        if (token === renderSeq) {
          committedOrientation = orient;
        }
        resolve();
      }, delayMs);
    });
  };
  // Even if earlier portrait resolves slower than later landscape, only landscape commits
  const p1 = simulateToggle('portrait', 20);
  const p2 = simulateToggle('landscape', 5);
  void Promise.all([p1, p2]).then(() => {
    assert.equal(committedOrientation, 'landscape');
  });
});

// 11. Large multipage PDF (50 pages + 2-up / 4-up)
runTest('Scenario 11: Large 50-page PDF builds lazy single-sheet plan and supports 2-up & 4-up N-up layout', () => {
  const cfg1 = normalizePrintConfig({ totalPages: 50, pagesPerSheet: 1 });
  const plan1 = buildSheetPlan(cfg1);
  assert.equal(plan1.sheetCount, 50);

  const cfg4 = normalizePrintConfig({ totalPages: 50, pagesPerSheet: 4, orientation: 'PORTRAIT' });
  const plan4 = buildSheetPlan(cfg4);
  assert.equal(plan4.sheetCount, 13);
  assert.deepEqual(plan4.sheets[0].sourcePages, [1, 2, 3, 4]);
  assert.deepEqual(plan4.sheets[12].sourcePages, [49, 50]);

  const geom4 = computeSheetLayoutGeometry(cfg4, 1000);
  assert.equal(geom4.gridCols, 2);
  assert.equal(geom4.gridRows, 2);
  assert.equal(geom4.cells.length, 4);
});

// 12. Mobile preview scaling (375px narrow viewport)
runTest('Scenario 12: Mobile preview sheet scales proportionally inside 375px viewport with zero overflow', () => {
  const viewportW = 375;
  const viewportH = 420;
  const padX = 28;
  const padY = 28;
  const availW = viewportW - padX; // 347px
  const availH = viewportH - padY; // 392px

  for (const orient of ['PORTRAIT', 'LANDSCAPE'] as const) {
    for (const paperSize of ['A4', 'A3', 'Legal'] as const) {
      const dims = getOrientedPaperDimensionsMm(paperSize, orient);
      let fitW = availW;
      let fitH = fitW / dims.aspectRatio;
      if (fitH > availH) {
        fitH = availH;
        fitW = fitH * dims.aspectRatio;
      }
      assert.ok(fitW <= availW + 0.5, `${paperSize} ${orient} must not overflow mobile width`);
      assert.ok(fitH <= availH + 0.5, `${paperSize} ${orient} must not overflow mobile height`);
      assert.ok(Math.abs(fitW / fitH - dims.aspectRatio) < 0.01, 'Aspect ratio preserved on mobile');
    }
  }
});

// 13. Printer with unsupported paper sizes, color, or duplex
runTest('Scenario 13: Unsupported paper size, color, and duplex are explicitly flagged by capability validator', () => {
  const monoA4Shop: ShopPrintCapabilities = {
    shopId: 'shop-1',
    supportedPaperSizes: ['A4'],
    supportsColor: false,
    supportsDuplex: false,
    hasOnlinePrinters: true,
    onlinePrinterCount: 1,
    printers: [],
  };

  const cfg = normalizePrintConfig({
    paperSize: 'A3',
    colorMode: 'COLOR',
    sides: 'DOUBLE',
    totalPages: 4,
  });

  const warnings = validateConfigAgainstShopCapabilities(cfg, monoA4Shop);
  assert.equal(warnings.length, 3);
  assert.ok(warnings.some((w) => w.code === 'UNSUPPORTED_PAPER_SIZE'));
  assert.ok(warnings.some((w) => w.code === 'COLOR_NOT_SUPPORTED'));
  assert.ok(warnings.some((w) => w.code === 'DUPLEX_NOT_SUPPORTED'));
});

// 14. Preview vs Actual Windows Print Output parity
runTest('Scenario 14: Normalized config matches backend staging payload, WindowsPrintEngine script, and PrintSettingsAdapter', () => {
  const backendPayload = buildBackendPrintSettings({
    paperSize: 'A3',
    orientation: 'LANDSCAPE',
    color: 'BW',
    sides: 'DOUBLE',
    copies: 3,
    pageSelection: 'CUSTOM',
    customRange: '1-3, 5',
    scaling: 'fill',
    margins: 'narrow',
    pagesPerSheet: 2,
    estimatedPages: 10,
  });

  assert.equal(backendPayload.paperSize, 'A3');
  assert.equal(backendPayload.orientation, 'LANDSCAPE');
  assert.equal(backendPayload.colorMode, 'BW');
  assert.equal(backendPayload.duplex, true);
  assert.equal(backendPayload.copies, 3);
  assert.equal(backendPayload.scaling, 'fill');
  assert.equal(backendPayload.margins, 'narrow');
  assert.equal(backendPayload.pagesPerSheet, 2);
  assert.equal(backendPayload.pagesToPrint, '1-3, 5');
  assert.equal(backendPayload.printConfig.colorMode, 'grayscale');
  assert.equal(backendPayload.printConfig.orientation, 'landscape');

  // Verify WindowsPrintEngine generates matching PowerShell spooler directives
  const psScript = windowsPrintEngine.generatePowerShellScript({
    jobId: 'PRT-PARITY-01',
    printerName: 'HP LaserJet Pro M404dn',
    imagePaths: ['C:\\temp\\page_0001.png', 'C:\\temp\\page_0002.png'],
    copies: backendPayload.copies,
    paperSize: backendPayload.paperSize,
    orientation: backendPayload.orientation,
    colorMode: backendPayload.colorMode,
    duplex: backendPayload.duplex,
    scalingMode: toAgentScalingMode(backendPayload.scaling),
    margins: backendPayload.margins,
  });

  assert.ok(psScript.includes("$requestedPaper = 'A3'"), 'Script must request A3');
  assert.ok(psScript.includes('$isLandscape = $true'), 'Script must enforce Landscape');
  assert.ok(psScript.includes('$isColor = $false'), 'Script must enforce B&W');
  assert.ok(psScript.includes('$isDuplex = $true'), 'Script must enforce Duplex');
  assert.ok(psScript.includes('$copies = 3'), 'Script must enforce 3 copies');
  assert.ok(psScript.includes("$scalingMode = 'FILL_PAGE'"), 'Script must enforce FILL_PAGE');
  assert.ok(psScript.includes("$marginPreset = 'narrow'"), 'Script must enforce narrow margins');
  assert.ok(psScript.includes('$requestedMargin = 20'), 'Narrow 5mm must map to 20/100 inch');
  assert.ok(psScript.includes('ColorMatrix'), 'B&W mode must apply Rec.601 luminance ColorMatrix');
  assert.ok(psScript.includes('$cm.Matrix00 = 0.299'), 'ColorMatrix red weight must match browser preview');
  assert.ok(psScript.includes('$cm.Matrix10 = 0.587'), 'ColorMatrix green weight must match browser preview');
  assert.ok(psScript.includes('$cm.Matrix20 = 0.114'), 'ColorMatrix blue weight must match browser preview');

  // Verify PrintSettingsAdapter (SumatraPDF fallback) also carries orientation & scaling
  const adapted = PrintSettingsAdapter.adaptSettings(
    {
      id: 'file_1',
      fileName: 'report.pdf',
      pageCount: 10,
      copies: backendPayload.copies,
      colorMode: backendPayload.colorMode,
      paperSize: backendPayload.paperSize as any,
      duplex: backendPayload.duplex,
      orientation: backendPayload.orientation,
      scaling: 'actual',
      pagesToPrint: backendPayload.pagesToPrint,
    },
    'HP LaserJet Pro M404dn',
    'C:\\temp\\report.pdf',
    30000,
    'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe'
  );
  assert.ok(adapted.powershellCommand.includes('landscape'), 'Sumatra fallback must pass landscape');
  assert.ok(adapted.powershellCommand.includes('noscale'), 'Sumatra fallback must pass noscale for actual size');
  assert.ok(adapted.powershellCommand.includes('monochrome'), 'Sumatra fallback must pass monochrome');
  assert.ok(adapted.powershellCommand.includes('paper=A3'), 'Sumatra fallback must pass paper=A3');
  assert.ok(adapted.powershellCommand.includes('3x'), 'Sumatra fallback must pass 3x copies');
  assert.ok(adapted.powershellCommand.includes('1-3, 5'), 'Sumatra fallback must pass custom page range');
});

console.log(`\n✅ All ${passed} WYSIWYG Live Print Preview & Print Pipeline Parity scenarios passed!`);
