import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCw,
  SlidersHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  FilePrintConfig,
  PaperSize,
  PrintMargins,
  PrintScaling,
} from '../../types';
import {
  buildSheetPlan,
  getOrientedPaperDimensionsMm,
  MARGIN_PRESET_MM,
  normalizePaperSize,
  normalizePrintConfig,
  parseSelectedPages,
  validateConfigAgainstShopCapabilities,
  type ShopPrintCapabilities,
} from '../../lib/print/printConfig';
import {
  detectPreviewDocumentKind,
  PrintPreviewSession,
  type PreviewRenderResult,
} from '../../lib/print/previewRenderer';

export interface LivePrintPreviewProps {
  fileConfig: FilePrintConfig;
  fileObject?: File | null;
  activePaperSizes?: PaperSize[];
  shopCapabilities?: ShopPrintCapabilities | null;
  onUpdateConfig?: (updates: Partial<FilePrintConfig>) => void;
  onClose?: () => void;
  /** 'modal' renders full-screen/dialog preview; 'inline' renders embedded live preview card */
  variant?: 'modal' | 'inline';
  /** Compact inline preview height when embedded */
  inlineHeightClass?: string;
}

type ZoomMode = 'fit-screen' | 'fit-width' | 'manual';

export const LivePrintPreview: React.FC<LivePrintPreviewProps> = ({
  fileConfig,
  fileObject,
  activePaperSizes,
  shopCapabilities,
  onUpdateConfig,
  onClose,
  variant = 'modal',
  inlineHeightClass = 'h-[340px] sm:h-[400px]',
}) => {
  const [detectedPageCount, setDetectedPageCount] = useState<number>(
    Math.max(1, fileConfig.estimatedPages || fileConfig.pageCount || 1)
  );
  const [sheetIndex, setSheetIndex] = useState<number>(0);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-screen');
  const [manualZoom, setManualZoom] = useState<number>(1);
  const [showMarginGuides, setShowMarginGuides] = useState<boolean>(true);
  const [showControlsDrawer, setShowControlsDrawer] = useState<boolean>(variant === 'modal');
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(true);
  const [isRenderingSheet, setIsRenderingSheet] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderMeta, setRenderMeta] = useState<{
    isClipped: boolean;
    isCropped: boolean;
    clippingMessage?: string;
    sourcePages: number[];
    sheetNumber: number;
    totalSheets: number;
    sheetWidthPx: number;
    sheetHeightPx: number;
    marginPx: number;
  } | null>(null);

  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<PrintPreviewSession | null>(null);
  const renderSequenceRef = useRef<number>(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 640,
    height: 560,
  });

  const docKind = useMemo(
    () => detectPreviewDocumentKind(fileConfig.fileName, fileConfig.fileType),
    [fileConfig.fileName, fileConfig.fileType]
  );

  const normalizedConfig = useMemo(
    () =>
      normalizePrintConfig({
        orientation: fileConfig.orientation,
        paperSize: fileConfig.paperSize,
        colorMode: fileConfig.colorMode ?? fileConfig.color,
        copies: fileConfig.copies,
        pageSelection: fileConfig.pageSelection,
        customPageRange: fileConfig.customPageRange ?? fileConfig.customRange,
        totalPages: detectedPageCount,
        scaling: fileConfig.scaling,
        margins: fileConfig.margins,
        sides: fileConfig.sides,
        pagesPerSheet: fileConfig.pagesPerSheet,
      }),
    [
      fileConfig.orientation,
      fileConfig.paperSize,
      fileConfig.colorMode,
      fileConfig.color,
      fileConfig.copies,
      fileConfig.pageSelection,
      fileConfig.customPageRange,
      fileConfig.customRange,
      fileConfig.scaling,
      fileConfig.margins,
      fileConfig.sides,
      fileConfig.pagesPerSheet,
      detectedPageCount,
    ]
  );

  const pageRangeInfo = useMemo(
    () =>
      parseSelectedPages(
        fileConfig.pageSelection,
        fileConfig.customPageRange ?? fileConfig.customRange,
        detectedPageCount
      ),
    [fileConfig.pageSelection, fileConfig.customPageRange, fileConfig.customRange, detectedPageCount]
  );

  const sheetPlan = useMemo(() => buildSheetPlan(normalizedConfig), [normalizedConfig]);

  const paperDims = useMemo(
    () => getOrientedPaperDimensionsMm(normalizedConfig.paperSize, normalizedConfig.orientation),
    [normalizedConfig.paperSize, normalizedConfig.orientation]
  );

  const capabilityWarnings = useMemo(
    () => validateConfigAgainstShopCapabilities(normalizedConfig, shopCapabilities, activePaperSizes),
    [normalizedConfig, shopCapabilities, activePaperSizes]
  );

  // Clamp sheetIndex whenever page selection or N-up layout reduces total sheets
  useEffect(() => {
    setSheetIndex((prev) => Math.max(0, Math.min(sheetPlan.sheetCount - 1, prev)));
  }, [sheetPlan.sheetCount]);

  // Observe preview stage dimensions for automatic responsive Fit-to-Screen / Fit-Width scaling
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Create & dispose PrintPreviewSession when source file changes (zero duplicate Supabase uploads!)
  useEffect(() => {
    const source: File | string | null = fileObject || fileConfig.previewUrl || null;
    if (!source) {
      setIsLoadingDoc(false);
      setRenderError('Document preview is unavailable. Please re-select the file.');
      return;
    }

    let cancelled = false;
    setIsLoadingDoc(true);
    setRenderError(null);
    setSheetIndex(0);

    const session = new PrintPreviewSession({
      docKey: `${fileConfig.id}:${fileConfig.fileName}:${fileConfig.fileSize}`,
      kind: docKind,
      source,
    });
    sessionRef.current = session;

    session
      .load()
      .then(({ pageCount }) => {
        if (cancelled) return;
        setDetectedPageCount(Math.max(1, pageCount));
        setIsLoadingDoc(false);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setRenderError(err?.message || 'Unable to load document for live preview.');
        setIsLoadingDoc(false);
      });

    return () => {
      cancelled = true;
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
        activeAbortRef.current = null;
      }
      session.dispose();
      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
    };
  }, [fileConfig.id, fileConfig.fileName, fileConfig.fileSize, fileConfig.previewUrl, fileObject, docKind]);

  // Compute CSS display dimensions for the white paper sheet inside the stage viewport
  const paperDisplaySize = useMemo(() => {
    const padX = variant === 'modal' ? (viewportSize.width < 640 ? 28 : 56) : 24;
    const padY = variant === 'modal' ? (viewportSize.width < 640 ? 28 : 48) : 24;
    const availW = Math.max(180, viewportSize.width - padX);
    const availH = Math.max(200, viewportSize.height - padY);
    const ratio = paperDims.aspectRatio; // width / height

    let fitW = availW;
    let fitH = fitW / ratio;
    if (fitH > availH) {
      fitH = availH;
      fitW = fitH * ratio;
    }

    if (zoomMode === 'fit-screen') {
      return {
        width: Math.max(120, Math.round(fitW)),
        height: Math.max(120, Math.round(fitH)),
        effectiveScalePercent: Math.round((fitW / Math.max(1, fitW)) * 100),
      };
    }

    if (zoomMode === 'fit-width') {
      const w = availW;
      const h = w / ratio;
      return {
        width: Math.max(120, Math.round(w)),
        height: Math.max(120, Math.round(h)),
        effectiveScalePercent: Math.round((w / Math.max(1, fitW)) * 100),
      };
    }

    // Manual zoom relative to fit-screen baseline
    const w = Math.max(120, Math.round(fitW * manualZoom));
    const h = Math.max(120, Math.round(fitH * manualZoom));
    return {
      width: w,
      height: h,
      effectiveScalePercent: Math.round(manualZoom * 100),
    };
  }, [viewportSize, paperDims.aspectRatio, zoomMode, manualZoom, variant]);

  // Debounced, race-safe WYSIWYG canvas rendering
  useEffect(() => {
    const session = sessionRef.current;
    if (!session || isLoadingDoc || renderError) return;

    // Cancel any in-flight render immediately so rapid Portrait <-> Landscape never flickers stale output
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    session.cancelActiveRenders();

    const controller = new AbortController();
    activeAbortRef.current = controller;
    const mySeq = ++renderSequenceRef.current;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const desiredLongEdge = Math.max(
      640,
      Math.min(2048, Math.round(Math.max(paperDisplaySize.width, paperDisplaySize.height) * dpr))
    );

    setIsRenderingSheet(true);

    const timer = window.setTimeout(() => {
      session
        .renderSheet({
          sheetIndex,
          config: normalizedConfig,
          targetLongEdgePx: desiredLongEdge,
          signal: controller.signal,
        })
        .then((result: PreviewRenderResult) => {
          if (controller.signal.aborted || mySeq !== renderSequenceRef.current) return;
          const targetCanvas = displayCanvasRef.current;
          if (targetCanvas) {
            targetCanvas.width = result.canvas.width;
            targetCanvas.height = result.canvas.height;
            const ctx = targetCanvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
              ctx.drawImage(result.canvas, 0, 0);
            }
          }
          setRenderMeta({
            isClipped: result.isClipped,
            isCropped: result.isCropped,
            clippingMessage: result.clippingMessage,
            sourcePages: result.sourcePages,
            sheetNumber: result.sheetNumber,
            totalSheets: result.totalSheets,
            sheetWidthPx: result.geometry.sheetWidthPx,
            sheetHeightPx: result.geometry.sheetHeightPx,
            marginPx: result.geometry.marginPx,
          });
          setIsRenderingSheet(false);
        })
        .catch((err: any) => {
          if (err?.name === 'AbortError' || controller.signal.aborted || mySeq !== renderSequenceRef.current) {
            return;
          }
          setRenderError(err?.message || 'Failed to render sheet preview.');
          setIsRenderingSheet(false);
        });
    }, 55);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    isLoadingDoc,
    renderError,
    sheetIndex,
    normalizedConfig,
    paperDisplaySize.width,
    paperDisplaySize.height,
  ]);

  // Keyboard navigation in modal mode (Left/Right arrows, Escape to close)
  useEffect(() => {
    if (variant !== 'modal') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape' && onClose) {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        setSheetIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setSheetIndex((prev) => Math.min(sheetPlan.sheetCount - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [variant, onClose, sheetPlan.sheetCount]);

  const handleZoomIn = useCallback(() => {
    setZoomMode('manual');
    setManualZoom((z) => Math.min(2.4, Number((z + 0.25).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomMode('manual');
    setManualZoom((z) => Math.max(0.6, Number((z - 0.25).toFixed(2))));
  }, []);

  const handleFitScreen = useCallback(() => {
    setZoomMode('fit-screen');
    setManualZoom(1);
  }, []);

  const handleFitWidth = useCallback(() => {
    setZoomMode('fit-width');
    setManualZoom(1);
  }, []);

  const availableSizes = useMemo<PaperSize[]>(() => {
    const fallback: PaperSize[] = ['A4', 'A3', 'A5', 'Letter', 'Legal'];
    if (activePaperSizes && activePaperSizes.length > 0) return activePaperSizes;
    if (shopCapabilities?.supportedPaperSizes && shopCapabilities.supportedPaperSizes.length > 0) {
      return shopCapabilities.supportedPaperSizes;
    }
    return fallback;
  }, [activePaperSizes, shopCapabilities]);

  const canSelectColor = !shopCapabilities?.hasOnlinePrinters || shopCapabilities.supportsColor;
  const marginPctX = renderMeta
    ? (renderMeta.marginPx / Math.max(1, renderMeta.sheetWidthPx)) * 100
    : (MARGIN_PRESET_MM[normalizedConfig.margins] / Math.max(1, paperDims.widthMm)) * 100;
  const marginPctY = renderMeta
    ? (renderMeta.marginPx / Math.max(1, renderMeta.sheetHeightPx)) * 100
    : (MARGIN_PRESET_MM[normalizedConfig.margins] / Math.max(1, paperDims.heightMm)) * 100;

  const currentSheet = sheetPlan.sheets[sheetIndex] || { sheetNumber: 1, sourcePages: [1] };
  const pagesLabelForCurrentSheet =
    currentSheet.sourcePages.length > 1
      ? `Pages ${currentSheet.sourcePages.join(', ')}`
      : `Page ${currentSheet.sourcePages[0]}`;

  const colorLabel = normalizedConfig.colorMode === 'color' ? 'Colour' : 'Black & White';
  const orientationLabel = normalizedConfig.orientation === 'landscape' ? 'Landscape' : 'Portrait';
  const scalingLabel =
    normalizedConfig.scaling === 'actual'
      ? 'Actual Size'
      : normalizedConfig.scaling === 'fill'
        ? 'Fill Page'
        : 'Fit to Page';
  const marginsLabel =
    normalizedConfig.margins === 'narrow'
      ? 'Narrow (5 mm)'
      : normalizedConfig.margins === 'none'
        ? 'None (0 mm)'
        : 'Default (10 mm)';

  const containerShell =
    variant === 'modal'
      ? 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-0 sm:p-4'
      : 'w-full rounded-xl border border-[#DCE5DE] bg-white overflow-hidden';

  const cardShell =
    variant === 'modal'
      ? 'bg-white w-full h-full sm:h-[92vh] sm:max-w-5xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[#DCE5DE]'
      : 'flex flex-col w-full';

  return (
    <div className={containerShell} role={variant === 'modal' ? 'dialog' : undefined} aria-modal={variant === 'modal' ? true : undefined} aria-label="Live WYSIWYG Print Preview">
      <div className={cardShell}>
        {/* 1. Preview Header */}
        <header className="shrink-0 bg-white border-b border-[#E4EAE5] px-4 py-3 flex items-start sm:items-center justify-between gap-3">
          <div className="min-w-0 flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#E8F8EC] text-[#008F25] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              {docKind === 'pdf' ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-[#141715] truncate">
                  {fileConfig.fileName}
                </h3>
              </div>
              <p className="text-xs text-[#4F5D52] mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 tabular-nums">
                <span>{detectedPageCount} {detectedPageCount === 1 ? 'total page' : 'total pages'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-[#141715]">
                  {sheetPlan.selectedPageCount} selected
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-[#008F25]">{colorLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{normalizedConfig.paperSize}</span>
                <span aria-hidden="true">·</span>
                <span>{orientationLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onUpdateConfig && (
              <button
                type="button"
                onClick={() => setShowControlsDrawer((v) => !v)}
                className={`min-h-[40px] px-3 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  showControlsDrawer
                    ? 'bg-[#E8F8EC] border-[#00B32D]/40 text-[#008F25]'
                    : 'bg-white border-[#DCE5DE] text-[#2F3B32] hover:bg-[#F4F7F5]'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Adjust Print Settings</span>
                <span className="sm:hidden">Settings</span>
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close print preview"
                className="w-10 h-10 rounded-lg border border-[#DCE5DE] text-[#3F4D42] hover:bg-[#F4F7F5] hover:text-[#141715] flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        {/* 2. Interactive Live Settings Bar (updates preview in real time!) */}
        {onUpdateConfig && showControlsDrawer && (
          <div className="shrink-0 bg-[#F8FAF8] border-b border-[#E4EAE5] px-4 py-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {/* Orientation */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5B685E]">
                  Orientation
                </label>
                <div className="grid grid-cols-2 rounded-lg bg-white border border-[#DCE5DE] p-0.5">
                  <button
                    type="button"
                    onClick={() => onUpdateConfig({ orientation: 'PORTRAIT' })}
                    className={`min-h-[34px] text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      normalizedConfig.orientation === 'portrait'
                        ? 'bg-[#00B32D] text-white'
                        : 'text-[#3F4D42] hover:bg-[#F2F5F3]'
                    }`}
                  >
                    Portrait
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateConfig({ orientation: 'LANDSCAPE' })}
                    className={`min-h-[34px] text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      normalizedConfig.orientation === 'landscape'
                        ? 'bg-[#00B32D] text-white'
                        : 'text-[#3F4D42] hover:bg-[#F2F5F3]'
                    }`}
                  >
                    Landscape
                  </button>
                </div>
              </div>

              {/* Color Mode */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5B685E]">
                  Print Mode
                </label>
                <div className="grid grid-cols-2 rounded-lg bg-white border border-[#DCE5DE] p-0.5">
                  <button
                    type="button"
                    onClick={() => onUpdateConfig({ colorMode: 'BW', color: 'BW' })}
                    className={`min-h-[34px] text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      normalizedConfig.colorMode === 'grayscale'
                        ? 'bg-[#141715] text-white'
                        : 'text-[#3F4D42] hover:bg-[#F2F5F3]'
                    }`}
                  >
                    B&amp;W
                  </button>
                  <button
                    type="button"
                    disabled={!canSelectColor}
                    onClick={() => onUpdateConfig({ colorMode: 'COLOR', color: 'COLOR' })}
                    title={!canSelectColor ? 'Color printer unavailable at this shop' : 'Full color output'}
                    className={`min-h-[34px] text-xs font-semibold rounded-md transition-colors ${
                      normalizedConfig.colorMode === 'color'
                        ? 'bg-[#00B32D] text-white'
                        : canSelectColor
                          ? 'text-[#3F4D42] hover:bg-[#F2F5F3] cursor-pointer'
                          : 'text-[#9AA89D] cursor-not-allowed opacity-60'
                    }`}
                  >
                    Colour
                  </button>
                </div>
              </div>

              {/* Paper Size */}
              <div className="flex flex-col gap-1">
                <label htmlFor={`preview-paper-${fileConfig.id}`} className="text-[10px] font-bold uppercase tracking-wider text-[#5B685E]">
                  Paper Size
                </label>
                <select
                  id={`preview-paper-${fileConfig.id}`}
                  value={normalizePaperSize(fileConfig.paperSize)}
                  onChange={(e) => onUpdateConfig({ paperSize: e.target.value as PaperSize })}
                  className="min-h-[38px] rounded-lg bg-white border border-[#DCE5DE] px-2.5 text-xs font-semibold text-[#141715] focus:outline-none focus:ring-2 focus:ring-[#00B32D]/30"
                >
                  {availableSizes.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scaling */}
              <div className="flex flex-col gap-1">
                <label htmlFor={`preview-scale-${fileConfig.id}`} className="text-[10px] font-bold uppercase tracking-wider text-[#5B685E]">
                  Scaling
                </label>
                <select
                  id={`preview-scale-${fileConfig.id}`}
                  value={normalizedConfig.scaling}
                  onChange={(e) => onUpdateConfig({ scaling: e.target.value as PrintScaling })}
                  className="min-h-[38px] rounded-lg bg-white border border-[#DCE5DE] px-2.5 text-xs font-semibold text-[#141715] focus:outline-none focus:ring-2 focus:ring-[#00B32D]/30"
                >
                  <option value="fit">Fit to Page</option>
                  <option value="actual">Actual Size (100%)</option>
                  <option value="fill">Fill Page</option>
                </select>
              </div>

              {/* Margins */}
              <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                <label htmlFor={`preview-margins-${fileConfig.id}`} className="text-[10px] font-bold uppercase tracking-wider text-[#5B685E]">
                  Margins
                </label>
                <select
                  id={`preview-margins-${fileConfig.id}`}
                  value={normalizedConfig.margins}
                  onChange={(e) => onUpdateConfig({ margins: e.target.value as PrintMargins })}
                  className="min-h-[38px] rounded-lg bg-white border border-[#DCE5DE] px-2.5 text-xs font-semibold text-[#141715] focus:outline-none focus:ring-2 focus:ring-[#00B32D]/30"
                >
                  <option value="default">Default (10 mm)</option>
                  <option value="narrow">Narrow (5 mm)</option>
                  <option value="none">None (0 mm)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* 3. Warnings Banner (Invalid page range, Clipping/Cropping, or Printer Capabilities) */}
        {(!pageRangeInfo.isValid ||
          renderMeta?.isClipped ||
          renderMeta?.isCropped ||
          capabilityWarnings.length > 0) && (
          <div className="shrink-0 px-4 py-2 bg-[#FFFBEB] border-b border-[#F5E0A3] space-y-1">
            {!pageRangeInfo.isValid && (
              <div className="flex items-start gap-2 text-xs text-[#92400E] font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#D97706]" />
                <span>{pageRangeInfo.error} Showing all pages until corrected.</span>
              </div>
            )}
            {renderMeta?.clippingMessage && (
              <div className="flex items-start gap-2 text-xs text-[#92400E] font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#D97706]" />
                <span>{renderMeta.clippingMessage}</span>
              </div>
            )}
            {capabilityWarnings.map((warn) => (
              <div key={warn.code} className="flex items-start gap-2 text-xs text-[#991B1B] font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#DC2626]" />
                <span>{warn.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* 4. Zoom & Sheet Toolbar */}
        <div className="shrink-0 bg-white border-b border-[#E4EAE5] px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          {/* Page Navigation */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={sheetIndex <= 0}
              onClick={() => setSheetIndex((prev) => Math.max(0, prev - 1))}
              aria-label="Previous page"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-[#DCE5DE] bg-white text-[#141715] hover:bg-[#F4F7F5] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-2 text-xs font-semibold text-[#141715] tabular-nums whitespace-nowrap">
              {sheetPlan.sheetCount > 1 ? (
                <>
                  Sheet {currentSheet.sheetNumber} of {sheetPlan.sheetCount}
                  <span className="hidden sm:inline text-[#5B685E] font-normal">
                    {' '}({pagesLabelForCurrentSheet})
                  </span>
                </>
              ) : (
                <>
                  Page {currentSheet.sourcePages[0]} of {sheetPlan.selectedPageCount}
                </>
              )}
            </div>
            <button
              type="button"
              disabled={sheetIndex >= sheetPlan.sheetCount - 1}
              onClick={() => setSheetIndex((prev) => Math.min(sheetPlan.sheetCount - 1, prev + 1))}
              aria-label="Next page"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-[#DCE5DE] bg-white text-[#141715] hover:bg-[#F4F7F5] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom & Guide Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowMarginGuides((v) => !v)}
              className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer hidden md:inline-flex items-center gap-1 ${
                showMarginGuides
                  ? 'border-[#00B32D]/40 bg-[#E8F8EC] text-[#008F25]'
                  : 'border-[#DCE5DE] bg-white text-[#4F5D52] hover:bg-[#F4F7F5]'
              }`}
              title="Toggle printable margin guides"
            >
              <Eye className="w-3.5 h-3.5" />
              Margins
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              aria-label="Zoom out"
              className="w-9 h-9 rounded-lg border border-[#DCE5DE] bg-white text-[#141715] hover:bg-[#F4F7F5] flex items-center justify-center transition-colors cursor-pointer"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="min-w-[44px] text-center text-xs font-bold text-[#141715] tabular-nums">
              {paperDisplaySize.effectiveScalePercent}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              aria-label="Zoom in"
              className="w-9 h-9 rounded-lg border border-[#DCE5DE] bg-white text-[#141715] hover:bg-[#F4F7F5] flex items-center justify-center transition-colors cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={zoomMode === 'fit-screen' ? handleFitWidth : handleFitScreen}
              className="min-h-[36px] px-2.5 rounded-lg border border-[#DCE5DE] bg-white text-xs font-semibold text-[#2F3B32] hover:bg-[#F4F7F5] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {zoomMode === 'fit-screen' ? (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Fit Width</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Fit Screen</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 5. Print Studio Canvas Area — Realistic White Paper on Neutral Grey Backdrop */}
        <div
          ref={stageContainerRef}
          className={`relative flex-1 overflow-auto bg-[#E6EBE7] flex items-center justify-center p-4 sm:p-6 ${
            variant === 'inline' ? inlineHeightClass : 'min-h-[280px]'
          }`}
        >
          {isLoadingDoc ? (
            <div className="flex flex-col items-center justify-center gap-2.5 text-[#3F4D42] py-12">
              <Loader2 className="w-7 h-7 animate-spin text-[#00B32D]" />
              <p className="text-xs font-semibold">Preparing WYSIWYG print sheet…</p>
            </div>
          ) : renderError ? (
            <div className="max-w-sm text-center bg-white border border-[#DCE5DE] rounded-xl p-5 shadow-sm">
              <AlertTriangle className="w-7 h-7 text-amber-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-[#141715]">Preview unavailable</p>
              <p className="text-xs text-[#4F5D52] mt-1">{renderError}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center m-auto">
              {/* Sheet Dimensions Caption */}
              <div className="mb-2 text-[11px] font-semibold text-[#4F5D52] tabular-nums flex items-center gap-2">
                <span>
                  {normalizedConfig.paperSize} {orientationLabel} ({Math.round(paperDims.widthMm)} × {Math.round(paperDims.heightMm)} mm)
                </span>
                {normalizedConfig.pagesPerSheet > 1 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{normalizedConfig.pagesPerSheet} pages per sheet</span>
                  </>
                )}
              </div>

              {/* Crisp White Paper Sheet Frame — NO CSS rotation; canvas natively matches oriented paper ratio */}
              <div
                className="relative bg-white transition-[width,height] duration-150 ease-out"
                style={{
                  width: `${paperDisplaySize.width}px`,
                  height: `${paperDisplaySize.height}px`,
                  boxShadow:
                    '0 14px 36px -10px rgba(15, 23, 42, 0.22), 0 2px 8px rgba(15, 23, 42, 0.08)',
                }}
              >
                <canvas
                  ref={displayCanvasRef}
                  aria-label={`Print preview of ${fileConfig.fileName}, ${normalizedConfig.paperSize} ${orientationLabel}, ${colorLabel}`}
                  className="block w-full h-full"
                />

                {/* Optional Hairline Printable Margin Guide */}
                {showMarginGuides && normalizedConfig.margins !== 'none' && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute border border-dashed border-[#008F25]/35"
                    style={{
                      left: `${marginPctX}%`,
                      right: `${marginPctX}%`,
                      top: `${marginPctY}%`,
                      bottom: `${marginPctY}%`,
                    }}
                  />
                )}

                {/* Subtle Non-blocking Render Spinner while switching config */}
                {isRenderingSheet && (
                  <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                    <div className="bg-white/95 border border-[#DCE5DE] rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-2 text-xs font-semibold text-[#141715]">
                      <RotateCw className="w-3.5 h-3.5 animate-spin text-[#00B32D]" />
                      Updating layout…
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 6. Configuration Summary & Print Fidelity Disclosure */}
        <footer className="shrink-0 bg-white border-t border-[#E4EAE5] px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#2F3B32] tabular-nums">
              <span>
                <strong className="text-[#141715]">Paper:</strong> {normalizedConfig.paperSize} {orientationLabel}
              </span>
              <span className="text-[#C4D0C7]" aria-hidden="true">|</span>
              <span>
                <strong className="text-[#141715]">Mode:</strong> {colorLabel}
              </span>
              <span className="text-[#C4D0C7]" aria-hidden="true">|</span>
              <span>
                <strong className="text-[#141715]">Copies:</strong> {normalizedConfig.copies}
                {normalizedConfig.copies > 1 && (
                  <span className="text-[#5B685E]">
                    {' '}({sheetPlan.totalPhysicalSheets} total {sheetPlan.totalPhysicalSheets === 1 ? 'sheet' : 'sheets'})
                  </span>
                )}
              </span>
              <span className="text-[#C4D0C7]" aria-hidden="true">|</span>
              <span>
                <strong className="text-[#141715]">Pages:</strong> {pageRangeInfo.label}
              </span>
              <span className="text-[#C4D0C7]" aria-hidden="true">|</span>
              <span>
                <strong className="text-[#141715]">Layout:</strong> {scalingLabel}, {marginsLabel},{' '}
                {normalizedConfig.duplex ? 'Double-Sided' : 'Single-Sided'}
              </span>
            </div>

            {onClose && variant === 'modal' && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 rounded-lg bg-[#00B32D] hover:bg-[#008F25] text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                Done Previewing
              </button>
            )}
          </div>

          <p className="text-[11px] text-[#5B685E] flex items-start gap-1.5 leading-snug">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#7A8A7E]" />
            <span>
              Live WYSIWYG preview reflects your exact paper size, orientation, margins, scaling, page selection, and grayscale conversion. Physical printer hardware margins and driver color calibration may vary slightly.
            </span>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default LivePrintPreview;
