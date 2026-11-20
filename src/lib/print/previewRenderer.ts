import * as pdfjsLib from 'pdfjs-dist';
import {
  applyLuminanceGrayscale,
  buildPreviewConfigSignature,
  buildSheetPlan,
  computeCellPlacement,
  computeSheetLayoutGeometry,
  type NormalizedPrintConfig,
  type SheetLayoutGeometry,
} from './printConfig';

// Use locally bundled PDF.js worker via Vite asset URL — zero external CDN dependency or version drift
let workerInitialized = false;
export function ensurePdfWorkerConfigured(): void {
  if (workerInitialized) return;
  workerInitialized = true;
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
}

export type PreviewDocumentKind = 'pdf' | 'image';

export interface PreviewRenderResult {
  canvas: HTMLCanvasElement;
  geometry: SheetLayoutGeometry;
  sheetIndex: number;
  sheetNumber: number;
  totalSheets: number;
  sourcePages: number[];
  isClipped: boolean;
  isCropped: boolean;
  clippingMessage?: string;
  sourceNaturalSizeMm: { widthMm: number; heightMm: number };
  fromCache: boolean;
}

interface CacheEntry {
  canvas: HTMLCanvasElement;
  geometry: SheetLayoutGeometry;
  isClipped: boolean;
  isCropped: boolean;
  clippingMessage?: string;
  sourceNaturalSizeMm: { widthMm: number; heightMm: number };
  sourcePages: number[];
}

const MAX_CACHE_ENTRIES = 12;
const PDF_POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;
// Standard screen image physical DPI baseline for "Actual Size" mode (96 DPI CSS/Windows standard)
const IMAGE_DEFAULT_DPI = 96;

/**
 * Dedicated WYSIWYG Print Preview Document Session.
 *
 * Maintains separate rendering pipelines for PDFs (pdfjs-dist) and Images (HTML5 Canvas / ImageBitmap),
 * bounded LRU sheet render cache, cancellation of obsolete renders on rapid config switches,
 * and clean resource disposal on unmount.
 */
export class PrintPreviewSession {
  public readonly kind: PreviewDocumentKind;
  public readonly docKey: string;
  private readonly source: File | string;
  private pdfLoadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
  private pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  private loadedImage: HTMLImageElement | null = null;
  private objectUrlToRevoke: string | null = null;
  private pageCount = 1;
  private disposed = false;
  private activePdfRenderTasks = new Set<pdfjsLib.RenderTask>();
  private lruCache = new Map<string, CacheEntry>();

  constructor(params: {
    docKey: string;
    kind: PreviewDocumentKind;
    source: File | string;
  }) {
    this.docKey = params.docKey;
    this.kind = params.kind;
    this.source = params.source;
  }

  public getPageCount(): number {
    return this.pageCount;
  }

  public getCacheSize(): number {
    return this.lruCache.size;
  }

  public async load(): Promise<{ pageCount: number; widthMm: number; heightMm: number }> {
    if (this.disposed) {
      throw new Error('Preview session has been disposed.');
    }

    if (this.kind === 'pdf') {
      ensurePdfWorkerConfigured();
      if (!this.pdfDoc) {
        let taskInput: any;
        if (typeof this.source === 'string') {
          taskInput = { url: this.source };
        } else {
          const bytes = new Uint8Array(await this.source.arrayBuffer());
          taskInput = { data: bytes };
        }
        const loadingTask = pdfjsLib.getDocument(taskInput);
        this.pdfLoadingTask = loadingTask;
        this.pdfDoc = await loadingTask.promise;
        if (this.disposed) {
          await this.pdfDoc.cleanup().catch(() => {});
          await loadingTask.destroy().catch(() => {});
          this.pdfDoc = null;
          this.pdfLoadingTask = null;
          throw new Error('Preview session disposed during PDF load.');
        }
        this.pageCount = Math.max(1, this.pdfDoc.numPages || 1);
      }

      const firstPage = await this.pdfDoc.getPage(1);
      const vp = firstPage.getViewport({ scale: 1 });
      return {
        pageCount: this.pageCount,
        widthMm: (vp.width / PDF_POINTS_PER_INCH) * MM_PER_INCH,
        heightMm: (vp.height / PDF_POINTS_PER_INCH) * MM_PER_INCH,
      };
    }

    // Dedicated Image Pipeline (JPG / JPEG / PNG / WEBP)
    if (!this.loadedImage) {
      let srcUrl: string;
      if (typeof this.source === 'string') {
        srcUrl = this.source;
      } else {
        srcUrl = URL.createObjectURL(this.source);
        this.objectUrlToRevoke = srcUrl;
      }

      this.loadedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not decode image for print preview.'));
        img.src = srcUrl;
      });
      if (this.disposed) {
        this.loadedImage = null;
        throw new Error('Preview session disposed during image load.');
      }
      this.pageCount = 1;
    }

    const naturalW = Math.max(1, this.loadedImage.naturalWidth || this.loadedImage.width || 1);
    const naturalH = Math.max(1, this.loadedImage.naturalHeight || this.loadedImage.height || 1);
    return {
      pageCount: 1,
      widthMm: (naturalW / IMAGE_DEFAULT_DPI) * MM_PER_INCH,
      heightMm: (naturalH / IMAGE_DEFAULT_DPI) * MM_PER_INCH,
    };
  }

  /**
   * Cancels any currently running PDF.js render tasks so rapid Portrait <-> Landscape
   * or Color <-> B&W switching never races or paints stale frames.
   */
  public cancelActiveRenders(): void {
    for (const task of this.activePdfRenderTasks) {
      try {
        task.cancel();
      } catch {
        // Ignore already-completed tasks
      }
    }
    this.activePdfRenderTasks.clear();
  }

  /**
   * Renders a single print sheet onto a crisp high-DPI canvas at exact physical paper
   * proportions, applying orientation, margins, scaling, N-up layout, and pixel-level
   * luminance grayscale conversion for B&W mode.
   */
  public async renderSheet(params: {
    sheetIndex: number;
    config: NormalizedPrintConfig;
    targetLongEdgePx: number;
    showMarginGuides?: boolean;
    signal?: AbortSignal;
  }): Promise<PreviewRenderResult> {
    const { config, targetLongEdgePx, signal } = params;
    if (this.disposed || signal?.aborted) {
      throw new DOMException('Render aborted', 'AbortError');
    }

    await this.load();
    if (this.disposed || signal?.aborted) {
      throw new DOMException('Render aborted', 'AbortError');
    }

    const effectiveConfig: NormalizedPrintConfig = {
      ...config,
      totalPages: this.pageCount,
    };
    const plan = buildSheetPlan(effectiveConfig);
    const clampedSheetIndex = Math.max(0, Math.min(plan.sheetCount - 1, params.sheetIndex));
    const sheetItem = plan.sheets[clampedSheetIndex] || {
      sheetIndex: 0,
      sheetNumber: 1,
      sourcePages: [1],
    };

    // Quantize render resolution to 64px buckets so minor viewport resizes hit the cache
    const quantizedLongEdge = Math.max(480, Math.min(2200, Math.ceil(targetLongEdgePx / 64) * 64));
    const configSig = buildPreviewConfigSignature(effectiveConfig);
    const cacheKey = `${this.docKey}::${clampedSheetIndex}::${configSig}::${quantizedLongEdge}`;

    const cached = this.lruCache.get(cacheKey);
    if (cached) {
      // Refresh LRU position
      this.lruCache.delete(cacheKey);
      this.lruCache.set(cacheKey, cached);
      return {
        canvas: cached.canvas,
        geometry: cached.geometry,
        sheetIndex: clampedSheetIndex,
        sheetNumber: sheetItem.sheetNumber,
        totalSheets: plan.sheetCount,
        sourcePages: cached.sourcePages,
        isClipped: cached.isClipped,
        isCropped: cached.isCropped,
        clippingMessage: cached.clippingMessage,
        sourceNaturalSizeMm: cached.sourceNaturalSizeMm,
        fromCache: true,
      };
    }

    const geometry = computeSheetLayoutGeometry(effectiveConfig, quantizedLongEdge);
    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = geometry.sheetWidthPx;
    sheetCanvas.height = geometry.sheetHeightPx;
    const ctx = sheetCanvas.getContext('2d', { willReadFrequently: effectiveConfig.colorMode === 'grayscale' });
    if (!ctx) {
      throw new Error('Could not initialize 2D canvas context for print preview.');
    }

    // 1. Crisp white paper sheet background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);

    let anyClipped = false;
    let anyCropped = false;
    let clippingMessage: string | undefined;
    let firstSourceNaturalSizeMm = { widthMm: geometry.sheetWidthMm, heightMm: geometry.sheetHeightMm };

    // 2. Render each source page onto its designated printable cell
    for (let cellIdx = 0; cellIdx < sheetItem.sourcePages.length; cellIdx++) {
      if (this.disposed || signal?.aborted) {
        throw new DOMException('Render aborted', 'AbortError');
      }

      const sourcePageNumber = sheetItem.sourcePages[cellIdx];
      const cellRect = geometry.cells[cellIdx];
      if (!cellRect) break;

      if (this.kind === 'pdf') {
        if (!this.pdfDoc) throw new Error('PDF document not loaded.');
        const safePage = Math.max(1, Math.min(this.pageCount, sourcePageNumber));
        const pdfPage = await this.pdfDoc.getPage(safePage);
        if (this.disposed || signal?.aborted) {
          throw new DOMException('Render aborted', 'AbortError');
        }

        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const contentWidthMm = (baseViewport.width / PDF_POINTS_PER_INCH) * MM_PER_INCH;
        const contentHeightMm = (baseViewport.height / PDF_POINTS_PER_INCH) * MM_PER_INCH;
        if (cellIdx === 0) {
          firstSourceNaturalSizeMm = { widthMm: contentWidthMm, heightMm: contentHeightMm };
        }

        const placement = computeCellPlacement({
          cellRect,
          contentWidthMm,
          contentHeightMm,
          pxPerMm: geometry.pxPerMm,
          scaling: effectiveConfig.scaling,
        });

        if (placement.isClipped) {
          anyClipped = true;
          clippingMessage = placement.clippingMessage;
        }
        if (placement.isCropped) {
          anyCropped = true;
          clippingMessage = clippingMessage || placement.clippingMessage;
        }

        // Render PDF page onto offscreen canvas at exact target draw pixel resolution (capped safely)
        const desiredScale = placement.drawRect.width / Math.max(1, baseViewport.width);
        const clampedScale = Math.max(0.25, Math.min(4.0, desiredScale));
        const renderViewport = pdfPage.getViewport({ scale: clampedScale });

        const offscreen = document.createElement('canvas');
        offscreen.width = Math.max(1, Math.round(renderViewport.width));
        offscreen.height = Math.max(1, Math.round(renderViewport.height));
        const offCtx = offscreen.getContext('2d');
        if (!offCtx) throw new Error('Could not initialize offscreen PDF canvas.');

        offCtx.fillStyle = '#FFFFFF';
        offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

        const renderTask = pdfPage.render({
          canvasContext: offCtx,
          viewport: renderViewport,
          canvas: offscreen,
        });
        this.activePdfRenderTasks.add(renderTask);

        const onAbort = () => {
          try {
            renderTask.cancel();
          } catch {
            // Ignore
          }
        };
        signal?.addEventListener('abort', onAbort, { once: true });

        try {
          await renderTask.promise;
        } catch (err: any) {
          if (err?.name === 'RenderingCancelledException' || signal?.aborted) {
            throw new DOMException('Render aborted', 'AbortError');
          }
          throw err;
        } finally {
          signal?.removeEventListener('abort', onAbort);
          this.activePdfRenderTasks.delete(renderTask);
        }

        if (this.disposed || signal?.aborted) {
          throw new DOMException('Render aborted', 'AbortError');
        }

        // Composite PDF page into printable cell with strict clipping to margin boundaries
        ctx.save();
        ctx.beginPath();
        ctx.rect(cellRect.x, cellRect.y, cellRect.width, cellRect.height);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          offscreen,
          placement.drawRect.x,
          placement.drawRect.y,
          placement.drawRect.width,
          placement.drawRect.height
        );
        ctx.restore();

        // Release offscreen backing store promptly
        offscreen.width = 0;
        offscreen.height = 0;
      } else {
        // Dedicated Image Pipeline (JPG / JPEG / PNG)
        if (!this.loadedImage) throw new Error('Image not loaded.');
        const naturalW = Math.max(1, this.loadedImage.naturalWidth || this.loadedImage.width);
        const naturalH = Math.max(1, this.loadedImage.naturalHeight || this.loadedImage.height);
        const contentWidthMm = (naturalW / IMAGE_DEFAULT_DPI) * MM_PER_INCH;
        const contentHeightMm = (naturalH / IMAGE_DEFAULT_DPI) * MM_PER_INCH;

        if (cellIdx === 0) {
          firstSourceNaturalSizeMm = { widthMm: contentWidthMm, heightMm: contentHeightMm };
        }

        const placement = computeCellPlacement({
          cellRect,
          contentWidthMm,
          contentHeightMm,
          pxPerMm: geometry.pxPerMm,
          scaling: effectiveConfig.scaling,
        });

        if (placement.isClipped) {
          anyClipped = true;
          clippingMessage = placement.clippingMessage;
        }
        if (placement.isCropped) {
          anyCropped = true;
          clippingMessage = clippingMessage || placement.clippingMessage;
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(cellRect.x, cellRect.y, cellRect.width, cellRect.height);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          this.loadedImage,
          placement.drawRect.x,
          placement.drawRect.y,
          placement.drawRect.width,
          placement.drawRect.height
        );
        ctx.restore();
      }
    }

    // 3. Pixel-level luminance grayscale conversion for Black & White print mode
    // (Matches WindowsPrintEngine ColorMatrix; crisp whites & readable dark contrast — NOT a dark overlay)
    if (effectiveConfig.colorMode === 'grayscale') {
      try {
        const imgData = ctx.getImageData(0, 0, sheetCanvas.width, sheetCanvas.height);
        applyLuminanceGrayscale(imgData.data);
        ctx.putImageData(imgData, 0, 0);
      } catch {
        // Fallback if a cross-origin tainted image ever occurs (never happens for local File blobs)
      }
    }

    // Store in bounded LRU cache
    if (this.lruCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.lruCache.keys().next().value;
      if (oldestKey) {
        const old = this.lruCache.get(oldestKey);
        if (old) {
          old.canvas.width = 0;
          old.canvas.height = 0;
        }
        this.lruCache.delete(oldestKey);
      }
    }

    const entry: CacheEntry = {
      canvas: sheetCanvas,
      geometry,
      isClipped: anyClipped,
      isCropped: anyCropped,
      clippingMessage,
      sourceNaturalSizeMm: firstSourceNaturalSizeMm,
      sourcePages: sheetItem.sourcePages,
    };
    this.lruCache.set(cacheKey, entry);

    return {
      canvas: sheetCanvas,
      geometry,
      sheetIndex: clampedSheetIndex,
      sheetNumber: sheetItem.sheetNumber,
      totalSheets: plan.sheetCount,
      sourcePages: sheetItem.sourcePages,
      isClipped: anyClipped,
      isCropped: anyCropped,
      clippingMessage,
      sourceNaturalSizeMm: firstSourceNaturalSizeMm,
      fromCache: false,
    };
  }

  public clearCache(): void {
    for (const entry of this.lruCache.values()) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    }
    this.lruCache.clear();
  }

  public dispose(): void {
    this.disposed = true;
    this.cancelActiveRenders();
    this.clearCache();
    if (this.pdfDoc) {
      void this.pdfDoc.cleanup().catch(() => {});
      this.pdfDoc = null;
    }
    if (this.pdfLoadingTask) {
      void this.pdfLoadingTask.destroy().catch(() => {});
      this.pdfLoadingTask = null;
    }
    this.loadedImage = null;
    if (this.objectUrlToRevoke) {
      try {
        URL.revokeObjectURL(this.objectUrlToRevoke);
      } catch {
        // Ignore
      }
      this.objectUrlToRevoke = null;
    }
  }
}

export function detectPreviewDocumentKind(fileName: string, fileType?: string): PreviewDocumentKind {
  const mime = (fileType || '').toLowerCase();
  const lowerName = (fileName || '').toLowerCase();
  if (mime.includes('pdf') || lowerName.endsWith('.pdf')) {
    return 'pdf';
  }
  return 'image';
}
