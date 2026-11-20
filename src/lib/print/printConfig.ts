import type {
  FilePrintConfig,
  PageSelection,
  PaperSize,
  PrintColor,
  PrintMargins,
  PrintOrientation,
  PrintScaling,
  PrintSides,
} from '../../types';

export interface ShopPrintCapabilities {
  shopId: string;
  supportedPaperSizes: string[];
  supportsColor: boolean;
  supportsDuplex: boolean;
  hasOnlinePrinters: boolean;
  onlinePrinterCount: number;
  printers?: unknown[];
}

export type NormalizedOrientation = 'portrait' | 'landscape';
export type NormalizedColorMode = 'color' | 'grayscale';
export type NormalizedScaling = PrintScaling; // 'fit' | 'actual' | 'fill'
export type NormalizedMargins = PrintMargins; // 'default' | 'narrow' | 'none'
export type NormalizedPagesPerSheet = 1 | 2 | 4;

export type KnownPaperSize =
  | 'A4'
  | 'A3'
  | 'A5'
  | 'A6'
  | 'Letter'
  | 'Legal'
  | 'Executive'
  | 'A2'
  | 'A1'
  | 'A0';

export interface PaperDimensionSpec {
  id: KnownPaperSize;
  widthMm: number;
  heightMm: number;
  label: string;
  shortLabel: string;
}

export const PAPER_DIMENSIONS_MM: Record<KnownPaperSize, PaperDimensionSpec> = {
  A4: { id: 'A4', widthMm: 210, heightMm: 297, label: 'A4 (210 × 297 mm)', shortLabel: 'A4' },
  A3: { id: 'A3', widthMm: 297, heightMm: 420, label: 'A3 (297 × 420 mm)', shortLabel: 'A3' },
  A5: { id: 'A5', widthMm: 148, heightMm: 210, label: 'A5 (148 × 210 mm)', shortLabel: 'A5' },
  A6: { id: 'A6', widthMm: 105, heightMm: 148, label: 'A6 (105 × 148 mm)', shortLabel: 'A6' },
  Letter: { id: 'Letter', widthMm: 215.9, heightMm: 279.4, label: 'Letter (8.5 × 11 in)', shortLabel: 'Letter' },
  Legal: { id: 'Legal', widthMm: 215.9, heightMm: 355.6, label: 'Legal (8.5 × 14 in)', shortLabel: 'Legal' },
  Executive: { id: 'Executive', widthMm: 184.15, heightMm: 266.7, label: 'Executive (7.25 × 10.5 in)', shortLabel: 'Executive' },
  A2: { id: 'A2', widthMm: 420, heightMm: 594, label: 'A2 (420 × 594 mm)', shortLabel: 'A2' },
  A1: { id: 'A1', widthMm: 594, heightMm: 841, label: 'A1 (594 × 841 mm)', shortLabel: 'A1' },
  A0: { id: 'A0', widthMm: 841, heightMm: 1189, label: 'A0 (841 × 1189 mm)', shortLabel: 'A0' },
};

/**
 * Shared physical margin constants in millimeters.
 * Identical values are enforced in WindowsPrintEngine.ts so preview margins match physical spooling.
 */
export const MARGIN_PRESET_MM: Record<NormalizedMargins, number> = {
  default: 10,
  narrow: 5,
  none: 0,
};

export interface NormalizedPrintConfig {
  orientation: NormalizedOrientation;
  paperSize: KnownPaperSize;
  colorMode: NormalizedColorMode;
  copies: number;
  pageSelection: PageSelection;
  pageRange: string; // 'all' or sanitized custom range e.g. '1-5, 8'
  selectedPages: number[]; // 1-indexed ordered unique pages
  totalPages: number;
  scaling: NormalizedScaling;
  margins: NormalizedMargins;
  duplex: boolean;
  pagesPerSheet: NormalizedPagesPerSheet;
}

export interface ParsedPageRangeResult {
  pages: number[];
  isValid: boolean;
  error?: string;
  normalizedRange: string;
  label: string;
}

export interface SheetPlanItem {
  sheetIndex: number; // 0-based
  sheetNumber: number; // 1-based
  sourcePages: number[]; // 1-based page numbers placed onto this sheet
}

export interface SheetPlan {
  sheets: SheetPlanItem[];
  sheetCount: number;
  selectedPageCount: number;
  physicalSheetsPerCopy: number;
  totalPhysicalSheets: number;
}

export interface RectPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CellPlacementResult {
  drawRect: RectPx;
  cellRect: RectPx;
  scaleFactor: number;
  isClipped: boolean;
  isCropped: boolean;
  clippingMessage?: string;
}

export interface SheetLayoutGeometry {
  sheetWidthMm: number;
  sheetHeightMm: number;
  sheetWidthPx: number;
  sheetHeightPx: number;
  aspectRatio: number;
  pxPerMm: number;
  marginMm: number;
  marginPx: number;
  printableRect: RectPx;
  gridCols: number;
  gridRows: number;
  cells: RectPx[];
}

export interface CapabilityWarning {
  field: 'paperSize' | 'colorMode' | 'duplex';
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

const PAPER_SIZE_LOOKUP: Record<string, KnownPaperSize> = {
  a4: 'A4',
  a3: 'A3',
  a5: 'A5',
  a6: 'A6',
  letter: 'Letter',
  legal: 'Legal',
  executive: 'Executive',
  a2: 'A2',
  a1: 'A1',
  a0: 'A0',
};

export function normalizePaperSize(raw?: PaperSize | string | null): KnownPaperSize {
  if (!raw || typeof raw !== 'string') return 'A4';
  const key = raw.trim().toLowerCase();
  return PAPER_SIZE_LOOKUP[key] || 'A4';
}

export function normalizeOrientation(raw?: PrintOrientation | NormalizedOrientation | string | null): NormalizedOrientation {
  if (!raw || typeof raw !== 'string') return 'portrait';
  return raw.trim().toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
}

export function toLegacyOrientation(orientation: NormalizedOrientation): PrintOrientation {
  return orientation === 'landscape' ? 'LANDSCAPE' : 'PORTRAIT';
}

export function normalizeColorMode(raw?: PrintColor | NormalizedColorMode | string | null): NormalizedColorMode {
  if (!raw || typeof raw !== 'string') return 'grayscale';
  const v = raw.trim().toLowerCase();
  if (v === 'color' || v === 'colour') return 'color';
  return 'grayscale';
}

export function toLegacyColorMode(colorMode: NormalizedColorMode): PrintColor {
  return colorMode === 'color' ? 'COLOR' : 'BW';
}

export function normalizeScaling(raw?: PrintScaling | string | null): NormalizedScaling {
  if (!raw || typeof raw !== 'string') return 'fit';
  const v = raw.trim().toLowerCase();
  if (v === 'actual' || v === 'actual_size' || v === 'noscale' || v === '100%') return 'actual';
  if (v === 'fill' || v === 'fill_page' || v === 'cover') return 'fill';
  return 'fit';
}

export function toAgentScalingMode(scaling: NormalizedScaling): 'FIT_TO_PAGE' | 'ACTUAL_SIZE' | 'FILL_PAGE' {
  if (scaling === 'actual') return 'ACTUAL_SIZE';
  if (scaling === 'fill') return 'FILL_PAGE';
  return 'FIT_TO_PAGE';
}

export function normalizeMargins(raw?: PrintMargins | string | null): NormalizedMargins {
  if (!raw || typeof raw !== 'string') return 'default';
  const v = raw.trim().toLowerCase();
  if (v === 'narrow' || v === 'small') return 'narrow';
  if (v === 'none' || v === 'borderless' || v === '0') return 'none';
  return 'default';
}

export function normalizePagesPerSheet(raw?: number | string | null): NormalizedPagesPerSheet {
  const n = Number(raw);
  if (n === 2) return 2;
  if (n === 4) return 4;
  return 1;
}

/**
 * Parses a customer page selection ('ALL' or 'CUSTOM' with e.g. '1-5, 8') into an ordered,
 * deduplicated list of 1-based page indices bounded by totalPages.
 */
export function parseSelectedPages(
  pageSelection: PageSelection | string | undefined,
  customRange: string | undefined,
  totalPagesRaw: number
): ParsedPageRangeResult {
  const totalPages = Math.max(1, Math.floor(Number(totalPagesRaw) || 1));
  const mode = String(pageSelection || 'ALL').toUpperCase();
  const trimmed = (customRange || '').trim();

  if (mode !== 'CUSTOM' || !trimmed || trimmed.toLowerCase() === 'all') {
    const allPages = Array.from({ length: totalPages }, (_, idx) => idx + 1);
    return {
      pages: allPages,
      isValid: true,
      normalizedRange: 'all',
      label: totalPages === 1 ? 'Page 1' : `All ${totalPages} pages`,
    };
  }

  const tokens = trimmed.split(',').map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) {
    const allPages = Array.from({ length: totalPages }, (_, idx) => idx + 1);
    return {
      pages: allPages,
      isValid: true,
      normalizedRange: 'all',
      label: totalPages === 1 ? 'Page 1' : `All ${totalPages} pages`,
    };
  }

  const seen = new Set<number>();
  const ordered: number[] = [];
  const normalizedTokens: string[] = [];

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const pageNum = parseInt(token, 10);
      if (pageNum < 1 || pageNum > totalPages) {
        return {
          pages: Array.from({ length: totalPages }, (_, idx) => idx + 1),
          isValid: false,
          error: `Page ${pageNum} is outside document range (1–${totalPages}).`,
          normalizedRange: trimmed,
          label: `Invalid (${trimmed})`,
        };
      }
      if (!seen.has(pageNum)) {
        seen.add(pageNum);
        ordered.push(pageNum);
      }
      normalizedTokens.push(String(pageNum));
      continue;
    }

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
        return {
          pages: Array.from({ length: totalPages }, (_, idx) => idx + 1),
          isValid: false,
          error: `Range ${start}-${end} exceeds document pages (1–${totalPages}).`,
          normalizedRange: trimmed,
          label: `Invalid (${trimmed})`,
        };
      }
      if (start > end) {
        return {
          pages: Array.from({ length: totalPages }, (_, idx) => idx + 1),
          isValid: false,
          error: `Invalid range ${start}-${end}: start page must be ≤ end page.`,
          normalizedRange: trimmed,
          label: `Invalid (${trimmed})`,
        };
      }
      for (let p = start; p <= end; p++) {
        if (!seen.has(p)) {
          seen.add(p);
          ordered.push(p);
        }
      }
      normalizedTokens.push(start === end ? String(start) : `${start}-${end}`);
      continue;
    }

    return {
      pages: Array.from({ length: totalPages }, (_, idx) => idx + 1),
      isValid: false,
      error: `Invalid page syntax "${token}". Use e.g. 1-5 or 1-3, 5.`,
      normalizedRange: trimmed,
      label: `Invalid (${trimmed})`,
    };
  }

  if (ordered.length === 0) {
    return {
      pages: [1],
      isValid: false,
      error: 'Select at least one page.',
      normalizedRange: trimmed,
      label: 'Invalid',
    };
  }

  const normalizedRange = normalizedTokens.join(', ');
  return {
    pages: ordered,
    isValid: true,
    normalizedRange,
    label: ordered.length === 1 ? `Page ${ordered[0]}` : `${ordered.length} pages (${normalizedRange})`,
  };
}

export interface NormalizePrintConfigInput {
  orientation?: PrintOrientation | NormalizedOrientation | string;
  paperSize?: PaperSize | string;
  colorMode?: PrintColor | NormalizedColorMode | string;
  color?: PrintColor | NormalizedColorMode | string;
  copies?: number;
  pageSelection?: PageSelection | string;
  customPageRange?: string;
  customRange?: string;
  pagesToPrint?: string;
  pageRange?: string;
  totalPages?: number;
  estimatedPages?: number;
  pageCount?: number;
  scaling?: PrintScaling | string;
  margins?: PrintMargins | string;
  sides?: PrintSides | string;
  duplex?: boolean;
  pagesPerSheet?: number;
}

/**
 * Single authoritative normalization entry point used by:
 * 1) CustomerPrintFlow UI
 * 2) LivePrintPreview canvas renderer
 * 3) Backend /api/customer/stage-order & print job payload
 * 4) Print Agent parity checks
 */
export function normalizePrintConfig(input: NormalizePrintConfigInput): NormalizedPrintConfig {
  const totalPages = Math.max(
    1,
    Math.floor(Number(input.totalPages ?? input.pageCount ?? input.estimatedPages) || 1)
  );
  const orientation = normalizeOrientation(input.orientation);
  const paperSize = normalizePaperSize(input.paperSize);
  const colorMode = normalizeColorMode(input.colorMode ?? input.color);
  const copies = Math.min(999, Math.max(1, Math.floor(Number(input.copies) || 1)));
  const scaling = normalizeScaling(input.scaling);
  const margins = normalizeMargins(input.margins);
  const pagesPerSheet = normalizePagesPerSheet(input.pagesPerSheet);

  const duplex =
    typeof input.duplex === 'boolean'
      ? input.duplex
      : String(input.sides || 'SINGLE').toUpperCase() === 'DOUBLE';

  const rawRange =
    input.customPageRange ??
    input.customRange ??
    input.pagesToPrint ??
    (input.pageRange && input.pageRange !== 'all' ? input.pageRange : undefined);

  const inferredSelection: PageSelection =
    input.pageSelection === 'CUSTOM' || (rawRange && rawRange.trim() && rawRange.trim().toLowerCase() !== 'all')
      ? 'CUSTOM'
      : 'ALL';

  const parsedRange = parseSelectedPages(inferredSelection, rawRange, totalPages);

  return {
    orientation,
    paperSize,
    colorMode,
    copies,
    pageSelection: inferredSelection,
    pageRange: parsedRange.isValid ? parsedRange.normalizedRange : 'all',
    selectedPages: parsedRange.pages,
    totalPages,
    scaling,
    margins,
    duplex,
    pagesPerSheet,
  };
}

/**
 * Returns physical paper dimensions in mm after applying selected print orientation.
 * Portrait keeps short edge horizontal; Landscape swaps width & height so long edge is horizontal.
 */
export function getOrientedPaperDimensionsMm(
  paperSize: KnownPaperSize | PaperSize,
  orientation: NormalizedOrientation | PrintOrientation
): { widthMm: number; heightMm: number; aspectRatio: number; spec: PaperDimensionSpec } {
  const canonical = normalizePaperSize(paperSize);
  const spec = PAPER_DIMENSIONS_MM[canonical] || PAPER_DIMENSIONS_MM.A4;
  const orient = normalizeOrientation(orientation);
  const shortEdge = Math.min(spec.widthMm, spec.heightMm);
  const longEdge = Math.max(spec.widthMm, spec.heightMm);

  const widthMm = orient === 'landscape' ? longEdge : shortEdge;
  const heightMm = orient === 'landscape' ? shortEdge : longEdge;
  return {
    widthMm,
    heightMm,
    aspectRatio: widthMm / heightMm,
    spec,
  };
}

/**
 * Builds the exact ordered list of preview sheets for the normalized print config.
 * Note: `copies` NEVER duplicates sheets in the preview plan; it updates `totalPhysicalSheets`
 * and is displayed in the preview summary bar.
 */
export function buildSheetPlan(config: NormalizedPrintConfig): SheetPlan {
  const pages = config.selectedPages.length > 0 ? config.selectedPages : [1];
  const nUp = config.pagesPerSheet;
  const sheets: SheetPlanItem[] = [];

  for (let i = 0; i < pages.length; i += nUp) {
    sheets.push({
      sheetIndex: sheets.length,
      sheetNumber: sheets.length + 1,
      sourcePages: pages.slice(i, i + nUp),
    });
  }

  const sheetCount = Math.max(1, sheets.length);
  const physicalSheetsPerCopy = config.duplex ? Math.ceil(sheetCount / 2) : sheetCount;

  return {
    sheets,
    sheetCount,
    selectedPageCount: pages.length,
    physicalSheetsPerCopy,
    totalPhysicalSheets: physicalSheetsPerCopy * config.copies,
  };
}

/**
 * Computes exact sheet canvas pixels, printable margin box, and N-up cell rectangles
 * for a requested target longest-edge or width in pixels.
 */
export function computeSheetLayoutGeometry(
  config: NormalizedPrintConfig,
  targetCanvasLongEdgePx: number
): SheetLayoutGeometry {
  const { widthMm, heightMm, aspectRatio } = getOrientedPaperDimensionsMm(
    config.paperSize,
    config.orientation
  );

  const longEdgeMm = Math.max(widthMm, heightMm);
  const pxPerMm = Math.max(1, targetCanvasLongEdgePx) / longEdgeMm;
  const sheetWidthPx = Math.round(widthMm * pxPerMm);
  const sheetHeightPx = Math.round(heightMm * pxPerMm);

  const marginMm = MARGIN_PRESET_MM[config.margins] ?? MARGIN_PRESET_MM.default;
  const marginPx = marginMm * pxPerMm;

  const printableRect: RectPx = {
    x: marginPx,
    y: marginPx,
    width: Math.max(1, sheetWidthPx - marginPx * 2),
    height: Math.max(1, sheetHeightPx - marginPx * 2),
  };

  let gridCols = 1;
  let gridRows = 1;
  if (config.pagesPerSheet === 2) {
    if (config.orientation === 'landscape') {
      gridCols = 2;
      gridRows = 1;
    } else {
      gridCols = 1;
      gridRows = 2;
    }
  } else if (config.pagesPerSheet === 4) {
    gridCols = 2;
    gridRows = 2;
  }

  const gutterPx = config.pagesPerSheet > 1 ? Math.round(4 * pxPerMm) : 0;
  const cellWidth = (printableRect.width - gutterPx * (gridCols - 1)) / gridCols;
  const cellHeight = (printableRect.height - gutterPx * (gridRows - 1)) / gridRows;

  const cells: RectPx[] = [];
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      cells.push({
        x: printableRect.x + col * (cellWidth + gutterPx),
        y: printableRect.y + row * (cellHeight + gutterPx),
        width: Math.max(1, cellWidth),
        height: Math.max(1, cellHeight),
      });
    }
  }

  return {
    sheetWidthMm: widthMm,
    sheetHeightMm: heightMm,
    sheetWidthPx,
    sheetHeightPx,
    aspectRatio,
    pxPerMm,
    marginMm,
    marginPx,
    printableRect,
    gridCols,
    gridRows,
    cells,
  };
}

/**
 * Computes exact content draw rectangle inside a printable cell for Fit, Actual Size, or Fill,
 * preserving aspect ratio with zero stretching and flagging clipping/cropping accurately.
 */
export function computeCellPlacement(params: {
  cellRect: RectPx;
  contentWidthMm: number;
  contentHeightMm: number;
  pxPerMm: number;
  scaling: NormalizedScaling;
}): CellPlacementResult {
  const { cellRect, pxPerMm, scaling } = params;
  const safeContentW = Math.max(1, params.contentWidthMm);
  const safeContentH = Math.max(1, params.contentHeightMm);

  const naturalWidthPx = safeContentW * pxPerMm;
  const naturalHeightPx = safeContentH * pxPerMm;

  let scaleFactor = 1;
  let drawWidth = naturalWidthPx;
  let drawHeight = naturalHeightPx;
  let isClipped = false;
  let isCropped = false;
  let clippingMessage: string | undefined;

  if (scaling === 'fit') {
    scaleFactor = Math.min(cellRect.width / naturalWidthPx, cellRect.height / naturalHeightPx);
    drawWidth = naturalWidthPx * scaleFactor;
    drawHeight = naturalHeightPx * scaleFactor;
  } else if (scaling === 'fill') {
    scaleFactor = Math.max(cellRect.width / naturalWidthPx, cellRect.height / naturalHeightPx);
    drawWidth = naturalWidthPx * scaleFactor;
    drawHeight = naturalHeightPx * scaleFactor;
    if (drawWidth > cellRect.width + 1.5 || drawHeight > cellRect.height + 1.5) {
      isCropped = true;
      clippingMessage = 'Fill Page crops outer edges to cover the printable area without borders.';
    }
  } else {
    // 'actual': 100% physical size relative to selected paper mm
    scaleFactor = 1;
    drawWidth = naturalWidthPx;
    drawHeight = naturalHeightPx;
    if (drawWidth > cellRect.width + 1.5 || drawHeight > cellRect.height + 1.5) {
      isClipped = true;
      clippingMessage = 'Actual Size (100%) exceeds the printable area on this paper size — edges will be clipped. Switch to "Fit to Page" to prevent clipping.';
    }
  }

  const drawRect: RectPx = {
    x: cellRect.x + (cellRect.width - drawWidth) / 2,
    y: cellRect.y + (cellRect.height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };

  return {
    drawRect,
    cellRect,
    scaleFactor,
    isClipped,
    isCropped,
    clippingMessage,
  };
}

/**
 * True pixel-level luminance grayscale conversion (Rec. 601 / Print Luminance standard).
 * Matches WindowsPrintEngine ColorMatrix (0.299R + 0.587G + 0.114B) while preserving
 * pure white paper and sharp dark text contrast without any dark overlay.
 */
export function applyLuminanceGrayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Fast skip for already neutral pixels (e.g., white paper canvas)
    if (r === g && g === b) continue;
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    data[i] = lum;
    data[i + 1] = lum;
    data[i + 2] = lum;
  }
}

/**
 * Generates a deterministic cache key for a sheet + normalized config.
 */
export function buildPreviewConfigSignature(config: NormalizedPrintConfig): string {
  return [
    config.paperSize,
    config.orientation,
    config.colorMode,
    config.scaling,
    config.margins,
    config.pagesPerSheet,
    config.pageSelection,
    config.pageRange,
  ].join('|');
}

/**
 * Validates a normalized print configuration against shop printer capabilities so unsupported
 * paper sizes, color modes, or duplex settings are surfaced explicitly.
 */
export function validateConfigAgainstShopCapabilities(
  config: NormalizedPrintConfig,
  capabilities: ShopPrintCapabilities | null | undefined,
  activePaperSizes?: string[]
): CapabilityWarning[] {
  const warnings: CapabilityWarning[] = [];

  const supportedSizesRaw: string[] =
    activePaperSizes && activePaperSizes.length > 0
      ? activePaperSizes
      : capabilities?.supportedPaperSizes || [];

  if (supportedSizesRaw.length > 0) {
    const normalizedSupported = supportedSizesRaw.map((s: string) => normalizePaperSize(s));
    if (!normalizedSupported.includes(config.paperSize)) {
      warnings.push({
        field: 'paperSize',
        code: 'UNSUPPORTED_PAPER_SIZE',
        severity: 'error',
        message: `Paper size ${config.paperSize} is not supported by this shop's printers (available: ${Array.from(new Set(normalizedSupported)).join(', ')}).`,
      });
    }
  }

  if (capabilities && capabilities.hasOnlinePrinters) {
    if (config.colorMode === 'color' && !capabilities.supportsColor) {
      warnings.push({
        field: 'colorMode',
        code: 'COLOR_NOT_SUPPORTED',
        severity: 'error',
        message: 'This shop currently only has Black & White printers available.',
      });
    }
    if (config.duplex && !capabilities.supportsDuplex) {
      warnings.push({
        field: 'duplex',
        code: 'DUPLEX_NOT_SUPPORTED',
        severity: 'warning',
        message: 'Automatic double-sided printing is not supported by this shop’s online printers.',
      });
    }
  }

  return warnings;
}

/**
 * Builds the canonical payload object sent to `/api/customer/stage-order` and propagated
 * to the Electron Print Agent so previewed settings match printed settings 1:1.
 */
export function buildBackendPrintSettings(fileConfig: Partial<FilePrintConfig> & { totalPages?: number }) {
  const normalized = normalizePrintConfig({
    orientation: fileConfig.orientation,
    paperSize: fileConfig.paperSize,
    colorMode: fileConfig.colorMode ?? fileConfig.color,
    copies: fileConfig.copies,
    pageSelection: fileConfig.pageSelection,
    customPageRange: fileConfig.customPageRange ?? fileConfig.customRange,
    totalPages: fileConfig.totalPages ?? fileConfig.estimatedPages ?? fileConfig.pageCount ?? 1,
    scaling: fileConfig.scaling,
    margins: fileConfig.margins,
    sides: fileConfig.sides,
    pagesPerSheet: fileConfig.pagesPerSheet,
  });

  return {
    copies: normalized.copies,
    colorMode: toLegacyColorMode(normalized.colorMode),
    paperSize: normalized.paperSize,
    duplex: normalized.duplex,
    orientation: toLegacyOrientation(normalized.orientation),
    scaling: normalized.scaling,
    margins: normalized.margins,
    pagesPerSheet: normalized.pagesPerSheet,
    pagesToPrint:
      normalized.pageSelection === 'CUSTOM' && normalized.pageRange !== 'all'
        ? normalized.pageRange
        : undefined,
    printConfig: {
      orientation: normalized.orientation,
      paperSize: normalized.paperSize,
      colorMode: normalized.colorMode,
      copies: normalized.copies,
      pageRange: normalized.pageRange,
      scaling: normalized.scaling,
      margins: normalized.margins,
      duplex: normalized.duplex,
      pagesPerSheet: normalized.pagesPerSheet,
    },
  };
}
