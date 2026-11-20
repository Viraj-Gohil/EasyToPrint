import { execFile } from 'child_process';
import util from 'util';
import fs from 'fs';
import {
  PrintMargins,
  PrintOrientation,
  PrintScalingMode,
  UniversalErrorCode,
  UniversalPrintResult
} from '../types/printing.js';
import { logger } from '../../logger/AgentLogger.js';

const execFileAsync = util.promisify(execFile);

export interface NativePrintOptions {
  jobId: string;
  printerName: string;
  imagePaths: string[]; // 1 or more PNG/JPG/JPEG images (one image per page)
  copies?: number;
  paperSize?: string; // 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal'
  orientation?: PrintOrientation;
  colorMode?: 'BW' | 'COLOR';
  duplex?: boolean;
  scalingMode?: PrintScalingMode;
  margins?: PrintMargins;
  timeoutMs?: number;
}

export class WindowsPrintEngine {
  private static instance: WindowsPrintEngine;

  private constructor() {}

  public static getInstance(): WindowsPrintEngine {
    if (!WindowsPrintEngine.instance) {
      WindowsPrintEngine.instance = new WindowsPrintEngine();
    }
    return WindowsPrintEngine.instance;
  }

  /**
   * Generates a self-contained PowerShell 5.1 script using .NET System.Drawing.Printing.PrintDocument
   * to submit one or more page images to the specified physical printer.
   */
  public generatePowerShellScript(options: NativePrintOptions): string {
    const safePrinterName = options.printerName.replace(/'/g, "''");
    const safeJobId = (options.jobId || 'job').replace(/[^a-zA-Z0-9_-]/g, '_');
    const copies = Math.max(1, Math.min(options.copies || 1, 999));
    const isColor = options.colorMode === 'COLOR';
    const isDuplex = Boolean(options.duplex);
    const requestedPaper = (options.paperSize || 'A4').toUpperCase();
    const isLandscape = options.orientation === 'LANDSCAPE';
    const scaling = options.scalingMode || 'FIT_TO_PAGE';
    const margins = options.margins || 'default';
    // Shared millimeter margin table matching browser WYSIWYG preview (converted to 1/100th inch for .NET PrintDocument)
    // default = 10mm (39.37 -> 39), narrow = 5mm (19.68 -> 20), none = 0mm (0)
    const marginHundredthsInch = margins === 'none' ? 0 : margins === 'narrow' ? 20 : 39;

    // Format array of safe image paths for PowerShell
    const pathsArrayString = options.imagePaths
      .map((p) => `'${p.replace(/'/g, "''")}'`)
      .join(', ');

    return `
$ErrorActionPreference = 'Stop'
$submitted = $false
$totalPages = 0
$spoolerJobId = $null

try {
    Add-Type -AssemblyName System.Drawing

    $printerName = '${safePrinterName}'
    $docName = 'PrintFlow_${safeJobId}'
    $imagePaths = @(${pathsArrayString})
    $copies = ${copies}
    $isColor = ${isColor ? '$true' : '$false'}
    $isDuplex = ${isDuplex ? '$true' : '$false'}
    $requestedPaper = '${requestedPaper}'
    $isLandscape = ${isLandscape ? '$true' : '$false'}
    $scalingMode = '${scaling}'
    $marginPreset = '${margins}'
    $requestedMargin = ${marginHundredthsInch}

    # 1. Validate Printer Existence & State
    $printer = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq $printerName -or $_.Name.Trim().ToLower() -eq $printerName.Trim().ToLower() } |
        Select-Object -First 1

    if (-not $printer) {
        throw "PRINTER_NOT_FOUND: Printer '$printerName' is not installed or available on this system."
    }

    if ($printer.WorkOffline -or $printer.PrinterStatus -eq 7) {
        throw "PRINTER_NOT_READY: Printer '$printerName' is currently offline or disconnected."
    }

    if ($printer.DetectedErrorState -and @(4, 5, 8, 9, 11, 12) -contains [int]$printer.DetectedErrorState) {
        $errMap = @{ 4='Paper Low'; 5='Paper Out'; 8='Door Open'; 9='Paper Jam'; 11='User Intervention Required'; 12='Output Bin Full' }
        $msg = $errMap[[int]$printer.DetectedErrorState]
        if (-not $msg) { $msg = "Hardware error state $($printer.DetectedErrorState)" }
        throw "PRINTER_NOT_READY: Printer '$printerName' reported hardware issue: $msg."
    }

    # 2. Initialize PrintDocument
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.PrinterSettings.PrinterName = $printerName
    $doc.DocumentName = $docName

    if (-not $doc.PrinterSettings.IsValid) {
        throw "PRINTER_NOT_FOUND: Printer settings for '$printerName' are invalid in Windows Spooler."
    }

    # Apply Copies
    if ($doc.PrinterSettings.MaximumCopies -ge $copies) {
        $doc.PrinterSettings.Copies = [int16]$copies
    }

    # Apply Duplex
    if ($isDuplex -and $doc.PrinterSettings.CanDuplex) {
        $doc.PrinterSettings.Duplex = [System.Drawing.Printing.Duplex]::Vertical
    } else {
        $doc.PrinterSettings.Duplex = [System.Drawing.Printing.Duplex]::Simplex
    }

    # Apply Color
    if ($doc.PrinterSettings.SupportsColor) {
        $doc.DefaultPageSettings.Color = $isColor
    }

    # Apply Orientation
    $doc.DefaultPageSettings.Landscape = $isLandscape

    # Apply Requested Margins (in 1/100th inch, matching WYSIWYG preview default=10mm, narrow=5mm, none=0mm)
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins($requestedMargin, $requestedMargin, $requestedMargin, $requestedMargin)

    # Apply Paper Size
    foreach ($ps in $doc.PrinterSettings.PaperSizes) {
        if ($ps.PaperName.ToUpper().Contains($requestedPaper) -or $requestedPaper.Contains($ps.PaperName.ToUpper())) {
            $doc.DefaultPageSettings.PaperSize = $ps
            break
        }
    }

    # Prepare Rec. 601 luminance grayscale ColorMatrix when B&W mode is selected
    $grayscaleAttributes = $null
    if (-not $isColor) {
        $cm = New-Object System.Drawing.Imaging.ColorMatrix
        $cm.Matrix00 = 0.299; $cm.Matrix01 = 0.299; $cm.Matrix02 = 0.299; $cm.Matrix03 = 0; $cm.Matrix04 = 0
        $cm.Matrix10 = 0.587; $cm.Matrix11 = 0.587; $cm.Matrix12 = 0.587; $cm.Matrix13 = 0; $cm.Matrix14 = 0
        $cm.Matrix20 = 0.114; $cm.Matrix21 = 0.114; $cm.Matrix22 = 0.114; $cm.Matrix23 = 0; $cm.Matrix24 = 0
        $cm.Matrix30 = 0;     $cm.Matrix31 = 0;     $cm.Matrix32 = 0;     $cm.Matrix33 = 1; $cm.Matrix34 = 0
        $cm.Matrix40 = 0;     $cm.Matrix41 = 0;     $cm.Matrix42 = 0;     $cm.Matrix43 = 0; $cm.Matrix44 = 1
        $grayscaleAttributes = New-Object System.Drawing.Imaging.ImageAttributes
        $grayscaleAttributes.SetColorMatrix($cm)
    }

    # 3. Multi-Page Event Handler
    $script:currentPageIndex = 0
    $script:loadedImages = @()

    $doc.add_PrintPage({
        param($sender, $e)

        if ($script:currentPageIndex -ge $imagePaths.Count) {
            $e.HasMorePages = $false
            return
        }

        $imagePath = $imagePaths[$script:currentPageIndex]
        if (-not (Test-Path -LiteralPath $imagePath)) {
            throw "FILE_NOT_FOUND: Temporary rendered page file missing: $imagePath"
        }

        $img = [System.Drawing.Image]::FromFile($imagePath)
        $script:loadedImages += $img

        # Determine target printable area (matching requested margins while respecting hardware non-printable zone)
        $pageBounds = $e.PageBounds
        $hardX = [float]$e.PageSettings.HardMarginX
        $hardY = [float]$e.PageSettings.HardMarginY
        $effMarginX = [Math]::Max([float]$requestedMargin, $hardX)
        $effMarginY = [Math]::Max([float]$requestedMargin, $hardY)

        $targetX = $effMarginX
        $targetY = $effMarginY
        $targetWidth = [Math]::Max(50.0, [float]$pageBounds.Width - ($effMarginX * 2.0))
        $targetHeight = [Math]::Max(50.0, [float]$pageBounds.Height - ($effMarginY * 2.0))

        $srcWidth = [float]$img.Width
        $srcHeight = [float]$img.Height
        $imgDpiX = if ($img.HorizontalResolution -gt 0) { [float]$img.HorizontalResolution } else { 96.0 }
        $imgDpiY = if ($img.VerticalResolution -gt 0) { [float]$img.VerticalResolution } else { 96.0 }

        if ($scalingMode -eq 'ACTUAL_SIZE') {
            # Actual Size 100% physical scale (converted to 1/100th inch printer units, centered & clipped to printable box)
            $destWidth = ($srcWidth / $imgDpiX) * 100.0
            $destHeight = ($srcHeight / $imgDpiY) * 100.0
            $destX = $targetX + (($targetWidth - $destWidth) / 2.0)
            $destY = $targetY + (($targetHeight - $destHeight) / 2.0)
        } elseif ($scalingMode -eq 'FILL_PAGE') {
            # FILL_PAGE (Cover-crop preserving aspect ratio, clipped strictly to printable bounds)
            $scaleX = $targetWidth / $srcWidth
            $scaleY = $targetHeight / $srcHeight
            $scale = [Math]::Max($scaleX, $scaleY)

            $destWidth = $srcWidth * $scale
            $destHeight = $srcHeight * $scale
            $destX = $targetX + (($targetWidth - $destWidth) / 2.0)
            $destY = $targetY + (($targetHeight - $destHeight) / 2.0)
        } else {
            # FIT_TO_PAGE (Proportional scale with aspect ratio preservation and centering)
            $scaleX = $targetWidth / $srcWidth
            $scaleY = $targetHeight / $srcHeight
            $scale = [Math]::Min($scaleX, $scaleY)

            $destWidth = $srcWidth * $scale
            $destHeight = $srcHeight * $scale
            $destX = $targetX + (($targetWidth - $destWidth) / 2.0)
            $destY = $targetY + (($targetHeight - $destHeight) / 2.0)
        }

        # High Quality Render Hints & Strict Clipping to Printable Area
        $clipRect = New-Object System.Drawing.RectangleF($targetX, $targetY, $targetWidth, $targetHeight)
        $e.Graphics.SetClip($clipRect)
        $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $e.Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

        # Render image to printer graphics context (with true luminance grayscale ColorMatrix when B&W)
        if ($grayscaleAttributes -ne $null) {
            $destRectInt = New-Object System.Drawing.Rectangle([int][Math]::Round($destX), [int][Math]::Round($destY), [int][Math]::Round($destWidth), [int][Math]::Round($destHeight))
            $e.Graphics.DrawImage($img, $destRectInt, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel, $grayscaleAttributes)
        } else {
            $destRect = New-Object System.Drawing.RectangleF($destX, $destY, $destWidth, $destHeight)
            $e.Graphics.DrawImage($img, $destRect)
        }

        $script:currentPageIndex++
        $e.HasMorePages = ($script:currentPageIndex -lt $imagePaths.Count)
    })

    # 4. Submit Job to Windows Print Spooler
    $doc.Print()
    $submitted = $true
    $totalPages = $imagePaths.Count

    # Capture Spooler Job ID
    try {
        Start-Sleep -Milliseconds 150
        $spoolJob = Get-CimInstance Win32_PrintJob -ErrorAction SilentlyContinue |
            Where-Object { $_.Document -like "*$docName*" -or $_.Name -like "*$printerName*" } |
            Sort-Object TimeSubmitted -Descending |
            Select-Object -First 1
        if ($spoolJob) {
            $spoolerJobId = [string]$spoolJob.JobId
        }
    } catch {}

    # Dispose resources
    foreach ($img in $script:loadedImages) {
        if ($img) { $img.Dispose() }
    }
    if ($grayscaleAttributes) { $grayscaleAttributes.Dispose() }
    $doc.Dispose()

    [PSCustomObject]@{
        success = $true
        submitted = $true
        spoolerJobId = $spoolerJobId
        totalPages = $totalPages
        error = $null
    } | ConvertTo-Json -Compress
    exit 0
}
catch {
    # Clean up on failure
    if ($script:loadedImages) {
        foreach ($img in $script:loadedImages) {
            try { $img.Dispose() } catch {}
        }
    }
    if ($grayscaleAttributes) {
        try { $grayscaleAttributes.Dispose() } catch {}
    }
    if ($doc) {
        try { $doc.Dispose() } catch {}
    }

    [PSCustomObject]@{
        success = $false
        submitted = $submitted
        spoolerJobId = $spoolerJobId
        totalPages = $totalPages
        error = $_.Exception.Message
    } | ConvertTo-Json -Compress
    exit 1
}
`.trim();
  }

  /**
   * Executes Windows native printing by running the generated script with PowerShell via Base64 EncodedCommand.
   */
  public async executeNativePrint(options: NativePrintOptions): Promise<UniversalPrintResult> {
    const startTime = Date.now();
    const result: UniversalPrintResult = {
      success: false,
      submitted: false,
      jobId: options.jobId,
      printerName: options.printerName,
      format: 'UNKNOWN',
      totalPages: options.imagePaths.length,
      copies: options.copies || 1,
      executionDurationMs: 0,
      stageReached: 'VALIDATED'
    };

    if (process.platform !== 'win32') {
      result.errorCode = 'POWERSHELL_EXECUTION_FAILED';
      result.errorMessage = 'Windows native printing is supported only on Windows operating systems.';
      result.executionDurationMs = Date.now() - startTime;
      result.stageReached = 'FAILED';
      return result;
    }

    // Verify all page image files exist before passing to PowerShell
    for (const p of options.imagePaths) {
      if (!fs.existsSync(p)) {
        result.errorCode = 'FILE_NOT_FOUND';
        result.errorMessage = `Rendered page image not found on disk: ${p}`;
        result.executionDurationMs = Date.now() - startTime;
        result.stageReached = 'FAILED';
        return result;
      }
    }

    const script = this.generatePowerShellScript(options);
    // Encode script in UTF-16LE Base64 for PowerShell -EncodedCommand
    const base64Encoded = Buffer.from(script, 'utf16le').toString('base64');
    const effectiveTimeout = Math.max(30000, options.timeoutMs || 45000);

    logger.info('SPOOLER', `Dispatching ${options.imagePaths.length} page(s) to WindowsPrintEngine for "${options.printerName}" (Copies: ${options.copies || 1}, Duplex: ${Boolean(options.duplex)})`);

    try {
      const { stdout, stderr } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-STA', '-NonInteractive', '-EncodedCommand', base64Encoded],
        { timeout: effectiveTimeout }
      );

      const trimmed = (stdout || '').trim();
      let parsedOutput: { success?: boolean; submitted?: boolean; totalPages?: number; error?: string; spoolerJobId?: number } | null = null;

      const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          if (lines[i].startsWith('{') && lines[i].endsWith('}')) {
            parsedOutput = JSON.parse(lines[i]);
            break;
          }
        } catch {}
      }

      if (!parsedOutput) {
        const errorDetail = stderr?.trim() || stdout?.trim() || 'PowerShell process did not return structured output';
        logger.error('SPOOLER', `WindowsPrintEngine execution output unparseable for "${options.printerName}": ${errorDetail}`);
        result.errorCode = 'POWERSHELL_EXECUTION_FAILED';
        result.errorMessage = `Print execution failed: ${errorDetail}`;
        result.executionDurationMs = Date.now() - startTime;
        result.stageReached = 'FAILED';
        return result;
      }

      if (!parsedOutput.success) {
        const err = parsedOutput.error || 'Windows PrintDocument submission rejected.';
        let code: UniversalErrorCode = 'PRINT_SUBMISSION_FAILED';
        if (err.includes('PRINTER_NOT_FOUND')) code = 'PRINTER_NOT_FOUND';
        else if (err.includes('PRINTER_NOT_READY')) code = 'PRINTER_NOT_READY';
        else if (err.includes('FILE_NOT_FOUND')) code = 'FILE_NOT_FOUND';

        logger.warn('SPOOLER', `WindowsPrintEngine reported submission failure on "${options.printerName}": ${err}`);
        result.errorCode = code;
        result.errorMessage = err;
        result.submitted = Boolean(parsedOutput.submitted);
        result.executionDurationMs = Date.now() - startTime;
        result.stageReached = result.submitted ? 'SUBMITTED' : 'FAILED';
        return result;
      }

      logger.info('SPOOLER', `WindowsPrintEngine successfully submitted ${parsedOutput.totalPages || options.imagePaths.length} page(s) to Windows Spooler for "${options.printerName}" (Spooler Job ID: ${parsedOutput.spoolerJobId || 'assigned'}).`);
      result.success = true;
      result.submitted = true;
      result.spoolerJobId = parsedOutput.spoolerJobId;
      result.totalPages = parsedOutput.totalPages || options.imagePaths.length;
      result.executionDurationMs = Date.now() - startTime;
      result.stageReached = 'SUBMITTED';
      return result;
    } catch (err: any) {
      const errDetail = err.stderr?.trim() || err.stdout?.trim() || err.message || '';
      logger.error('SPOOLER', `WindowsPrintEngine process error for "${options.printerName}": ${errDetail}`);

      result.errorCode = err.killed ? 'PRINT_TIMEOUT' : 'POWERSHELL_EXECUTION_FAILED';
      result.errorMessage = err.killed
        ? `Printing timed out after ${Math.round(effectiveTimeout / 1000)} seconds for printer "${options.printerName}".`
        : `PowerShell printing error: ${errDetail}`;
      result.executionDurationMs = Date.now() - startTime;
      result.stageReached = 'FAILED';
      return result;
    }
  }
}

export const windowsPrintEngine = WindowsPrintEngine.getInstance();
