import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../lib/store';
import QRCode from 'qrcode';
import {
  Download,
  Printer,
  Copy,
  ExternalLink,
  Check,
  AlertCircle,
  QrCode,
  FileText,
  Loader2
} from 'lucide-react';
import { apiUrl } from '../../lib/apiConfig';
import { generateStandPdf, generateStandPngDataUrl } from '../../lib/counterStandGenerator';

export const ShopQrCodes: React.FC = () => {
  const { activeShop, showToast } = useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrError, setQrError] = useState(false);

  // Dynamic authoritative shop code
  const [shopCode, setShopCode] = useState<string>(activeShop.shopCode || '');

  // Generation loading states
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingPng, setIsGeneratingPng] = useState(false);

  // Stand customization controls
  const [format, setFormat] = useState<'A5' | 'A4'>('A5');
  const [orientation, setOrientation] = useState<'PORTRAIT' | 'LANDSCAPE'>('PORTRAIT');
  const [styleMode, setStyleMode] = useState<'STANDARD' | 'MINIMAL' | 'DARK'>('STANDARD');

  // Customer portal URL
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://printflow.in';
  const shopUrl = `${origin}/s/${activeShop.slug || 'shop'}`;

  // Fetch authoritative permanent 6-digit Shop Code from database/API
  useEffect(() => {
    if (!activeShop?.id) return;
    let cancelled = false;

    async function fetchAuthoritativeCode() {
      try {
        const res = await fetch(apiUrl(`/api/shops/${encodeURIComponent(activeShop.id)}/access-code`), {
          headers: {
            'Authorization': 'Bearer admin_token_active',
            'X-Shop-Id': activeShop.id,
            'X-User-Role': 'SHOP_OWNER'
          }
        });
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data.success && data.shopCode) {
            setShopCode(data.shopCode);
          }
        }
      } catch (err) {
        console.warn('Could not fetch authoritative shop code:', err);
      }
    }

    if (!shopCode) {
      fetchAuthoritativeCode();
    }
    return () => {
      cancelled = true;
    };
  }, [activeShop?.id, shopCode]);

  const currentShopCode = shopCode || activeShop.shopCode || '100001';

  // Generate QR on canvas whenever shopUrl, orientation, or styleMode changes
  useEffect(() => {
    if (!canvasRef.current || !shopUrl) return;

    setQrError(false);
    const canvas = canvasRef.current;
    const targetWidth = orientation === 'LANDSCAPE' ? 200 : 236;

    QRCode.toCanvas(
      canvas,
      shopUrl,
      {
        width: targetWidth,
        margin: 2,
        color: {
          dark: '#111111',
          light: '#FFFFFF'
        }
      },
      (error) => {
        if (error) {
          console.error('Failed to generate QR code canvas:', error);
          setQrError(true);
        } else {
          setQrLoaded(true);
        }
      }
    );
  }, [shopUrl, orientation, styleMode]);

  // Copy customer URL
  const copyShopUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shopUrl);
      } else {
        const input = document.createElement('input');
        input.value = shopUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopiedLink(true);
      showToast('Customer Link Copied', 'Shop ordering link copied to clipboard.', 'success', 2200);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      showToast('Copy Failed', 'Please manually select and copy the URL.', 'error');
    }
  };

  // Copy permanent 6-digit Shop Code
  const copyShopCode = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentShopCode);
      } else {
        const input = document.createElement('input');
        input.value = currentShopCode;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopiedCode(true);
      showToast('Shop Code Copied', `Code ${currentShopCode} copied to clipboard.`, 'success', 2200);
      setTimeout(() => setCopiedCode(false), 2200);
    } catch {
      showToast('Copy Failed', 'Unable to copy shop code.', 'error');
    }
  };

  // Download print-ready vector Counter Stand PDF
  const downloadStandPdf = async () => {
    setIsGeneratingPdf(true);
    showToast('Generating PDF', 'Preparing vector print-ready counter stand PDF...', 'info');
    try {
      const pdfBytes = await generateStandPdf({
        shopName: activeShop.name,
        shopSlug: activeShop.slug,
        shopCode: currentShopCode,
        location: activeShop.city || activeShop.address || 'Smart Counter Station',
        format,
        orientation,
        styleMode,
        shopUrl
      });
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${activeShop.slug || 'shop'}-counter-stand-${format.toLowerCase()}-${orientation.toLowerCase()}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast('PDF Downloaded', 'Print-ready Counter Stand PDF saved to your device.', 'success');
    } catch (err) {
      console.error('Failed to generate stand PDF:', err);
      showToast('PDF Generation Failed', 'Could not compile stand PDF. Please try again.', 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Download 300-DPI high-res Stand PNG
  const downloadStandPng = async () => {
    setIsGeneratingPng(true);
    showToast('Generating PNG', 'Rendering 300-DPI tabletop stand graphic...', 'info');
    try {
      const pngDataUrl = await generateStandPngDataUrl({
        shopName: activeShop.name,
        shopSlug: activeShop.slug,
        shopCode: currentShopCode,
        location: activeShop.city || activeShop.address || 'Smart Counter Station',
        format,
        orientation,
        styleMode,
        shopUrl
      });
      const link = document.createElement('a');
      link.href = pngDataUrl;
      link.download = `${activeShop.slug || 'shop'}-counter-stand-${format.toLowerCase()}-${orientation.toLowerCase()}.png`;
      link.click();
      showToast('PNG Downloaded', 'High-resolution Stand PNG saved to your device.', 'success');
    } catch (err) {
      console.error('Failed to generate stand PNG:', err);
      showToast('PNG Generation Failed', 'Could not render stand PNG. Please try again.', 'error');
    } finally {
      setIsGeneratingPng(false);
    }
  };

  // Download standalone bare QR code PNG
  const downloadQrCode = () => {
    QRCode.toDataURL(
      shopUrl,
      {
        width: 1400,
        margin: 2,
        color: {
          dark: '#111111',
          light: '#FFFFFF'
        }
      },
      (err, url) => {
        if (err || !url) {
          showToast('Download Failed', 'Unable to render high-resolution QR image.', 'error');
          return;
        }
        const link = document.createElement('a');
        link.download = `${activeShop.slug || 'shop'}-qr-code.png`;
        link.href = url;
        link.click();
        showToast('QR Code Downloaded', 'High-resolution QR code image saved to your device.', 'success');
      }
    );
  };

  // Print counter flyer / stand
  const triggerBrowserPrint = () => {
    showToast('Opening Print Dialog', 'Preparing print-ready tabletop stand layout...', 'info');
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10 font-['Manrope',sans-serif] text-[#111111]">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111111]">
            QR Counter Stands
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-relaxed">
            Generate, customize, and print your shop counter stand (A5 Portrait — 148 × 210 mm).
          </p>
        </div>
      </div>

      {/* 2. TWO-COLUMN CLEAN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ================= LEFT COLUMN: SHOP QR INFORMATION & ACTIONS ================= */}
        <div className="no-print lg:col-span-5 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center font-bold">
                  <QrCode className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#111111]">Your Shop QR Code</h2>
                  <p className="text-xs text-slate-500 truncate max-w-[200px]">{activeShop.name}</p>
                </div>
              </div>

              {/* Customer Portal Status */}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  activeShop.isOpen
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    activeShop.isOpen ? 'bg-[#00B32D] animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span>{activeShop.isOpen ? 'Active' : 'Inactive'}</span>
              </span>
            </div>

            {/* Permanent 6-Digit Shop Code (Prominent & Read-Only) */}
            <div className="p-4 bg-[#F8FAF9] border border-[#E1E8E3] rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Permanent Shop Code
                </span>
                <span className="text-[10px] font-semibold text-[#008F25] bg-[#E8F8EC] px-2 py-0.5 rounded border border-[#A7F3D0]">
                  Read Only
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 pt-0.5">
                <span className="text-2xl sm:text-3xl font-extrabold tracking-wider text-[#111111] select-all">
                  #{currentShopCode}
                </span>

                <button
                  type="button"
                  onClick={copyShopCode}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs shrink-0"
                  title="Copy 6-digit Shop Code"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-[#00B32D]" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 leading-normal">
                Customers can manually enter this 6-digit code if unable to scan the QR code.
              </p>
            </div>

            {/* Customer URL Box */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Customer Ordering Link
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shopUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none select-all cursor-text shadow-2xs truncate"
                />
                <button
                  type="button"
                  onClick={copyShopUrl}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs"
                  title="Copy customer link"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-[#00B32D]" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                </button>
              </div>

              <a
                href={`/s/${activeShop.slug || 'shop'}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 bg-[#F0FDF4] hover:bg-[#DCFCE7] text-[#008F25] border border-[#BBF7D0] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#00B32D]" />
                <span>Open Customer View ↗</span>
              </a>
            </div>

            {/* Essential Actions */}
            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Stand Actions
              </span>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={downloadStandPdf}
                  disabled={isGeneratingPdf}
                  className="px-3 py-2.5 bg-[#00B32D] hover:bg-[#008F25] text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-60"
                  title="Download vector print-ready PDF"
                >
                  {isGeneratingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  <span>Download PDF</span>
                </button>

                <button
                  type="button"
                  onClick={downloadStandPng}
                  disabled={isGeneratingPng}
                  className="px-3 py-2.5 bg-[#111111] hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-60"
                  title="Download 300-DPI high-res Stand PNG"
                >
                  {isGeneratingPng ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Download PNG</span>
                </button>

                <button
                  type="button"
                  onClick={triggerBrowserPrint}
                  className="px-3 py-2.5 bg-white hover:bg-slate-50 text-[#111111] border border-slate-200 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
                  title="Print directly to your connected printer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span>Print QR Stand</span>
                </button>

                <button
                  type="button"
                  onClick={downloadQrCode}
                  className="px-3 py-2.5 bg-white hover:bg-slate-50 text-[#111111] border border-slate-200 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
                  title="Download bare QR code image only"
                >
                  <QrCode className="w-3.5 h-3.5 text-slate-600" />
                  <span>Download QR Only</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: COUNTER STAND PREVIEW & CONTROLS ================= */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-5">
            {/* Live Stand Preview Canvas Container */}
            <div className="p-4 sm:p-8 bg-[#F7F8F7] rounded-2xl border border-slate-200/80 flex flex-col items-center justify-center overflow-hidden">
              {/* Counter Stand Card Frame (Exact A5 Portrait 148:210 aspect ratio on Portrait) */}
              <div
                id="printable-qr-stand"
                className={`bg-white border border-[#E5E7EB] text-[#111111] font-['Manrope',sans-serif] transition-all duration-200 relative text-center shadow-sm ${
                  orientation === 'LANDSCAPE'
                    ? 'w-full max-w-2xl aspect-[210/148] p-6 sm:p-8 flex flex-col justify-between rounded-xl'
                    : 'w-full max-w-[390px] aspect-[148/210] px-6 py-7 sm:px-8 sm:py-8 flex flex-col justify-between rounded-xl'
                }`}
              >
                {orientation === 'LANDSCAPE' ? (
                  /* ================= LANDSCAPE MINIMAL LAYOUT ================= */
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center my-auto text-left">
                    {/* Left Column: Branding, Heading, Steps, Footer */}
                    <div className="sm:col-span-7 flex flex-col justify-between space-y-4">
                      {/* 1. Top: Small EasyToPrint logo and brand name */}
                      <div className="flex items-center gap-2">
                        <img
                          src="/assets/easytoprint-logo.svg"
                          alt="EasyToPrint"
                          className="w-5 h-5 object-contain"
                        />
                        <span className="text-sm font-bold tracking-tight text-[#111111]">
                          Easy<span className="text-[#00B32D]">To</span>Print
                        </span>
                      </div>

                      {/* 2 & 3. Main Heading & Subtitle */}
                      <div className="space-y-1">
                        <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111111] leading-tight">
                          Printing Made Easy.
                        </h3>
                        <p className="text-sm font-semibold text-[#00B32D]">
                          Scan. Upload. Pay. Collect.
                        </p>
                      </div>

                      {/* 7. Three simple steps in one horizontal row */}
                      <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-[#ECEFEC]">
                        <div>
                          <div className="text-xs font-bold text-[#111111]">
                            <span className="text-[#00B32D] mr-1">01</span>Scan
                          </div>
                          <p className="text-[11px] text-[#555555] leading-snug mt-0.5">
                            Scan the QR code.
                          </p>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[#111111]">
                            <span className="text-[#00B32D] mr-1">02</span>Upload
                          </div>
                          <p className="text-[11px] text-[#555555] leading-snug mt-0.5">
                            Select your document.
                          </p>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[#111111]">
                            <span className="text-[#00B32D] mr-1">03</span>Collect
                          </div>
                          <p className="text-[11px] text-[#555555] leading-snug mt-0.5">
                            Pick up your prints.
                          </p>
                        </div>
                      </div>

                      {/* 8. Bottom */}
                      <div className="pt-2 border-t border-[#ECEFEC] flex items-center justify-between text-[11px]">
                        <span className="font-medium text-[#111111]">
                          Your documents, printed with ease.
                        </span>
                        <span className="font-semibold text-[#00B32D]">
                          Powered by EasyToPrint
                        </span>
                      </div>
                    </div>

                    {/* Right Column: Prominent QR Code + Manual Shop Code */}
                    <div className="sm:col-span-5 flex flex-col items-center justify-center space-y-3 text-center">
                      <div className="p-3 bg-white border border-[#E5E7EB] rounded-xl inline-block">
                        {qrError ? (
                          <div className="w-40 h-40 flex flex-col items-center justify-center text-center p-2 text-rose-600">
                            <AlertCircle className="w-6 h-6 mb-1" />
                            <span className="text-xs font-bold">Unable to render QR</span>
                          </div>
                        ) : (
                          <canvas ref={canvasRef} className="block mx-auto max-w-full" />
                        )}
                      </div>

                      <div className="space-y-1.5 w-full">
                        <p className="text-[11px] font-medium text-[#555555]">
                          Can&apos;t scan? Enter your shop code manually.
                        </p>
                        <div className="inline-block px-4 py-1 rounded-lg bg-[#F5FBF6] border border-[#CDEED5]">
                          <span className="text-lg font-extrabold tracking-wider text-[#111111]">
                            #{currentShopCode}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ================= A5 PORTRAIT MINIMAL & PROFESSIONAL LAYOUT ================= */
                  <>
                    {/* 1–3. Top Section: Small Logo + Brand Name, Main Heading, Subtitle */}
                    <div className="space-y-2.5">
                      {/* 1. Top: Small EasyToPrint logo and brand name */}
                      <div className="flex items-center justify-center gap-2">
                        <img
                          src="/assets/easytoprint-logo.svg"
                          alt="EasyToPrint"
                          className="w-5 h-5 object-contain"
                        />
                        <span className="text-sm font-bold tracking-tight text-[#111111]">
                          Easy<span className="text-[#00B32D]">To</span>Print
                        </span>
                      </div>

                      {/* 2. Main heading & 3. Subtitle */}
                      <div className="space-y-1 pt-0.5">
                        <h3 className="text-[26px] sm:text-[28px] font-extrabold tracking-tight text-[#111111] leading-tight">
                          Printing Made Easy.
                        </h3>
                        <p className="text-sm sm:text-[15px] font-semibold text-[#00B32D] tracking-normal">
                          Scan. Upload. Pay. Collect.
                        </p>
                      </div>
                    </div>

                    {/* 4–6. Center Section: Prominent QR Code + Manual Shop Code */}
                    <div className="flex flex-col items-center justify-center space-y-3 my-1">
                      {/* 4. Center: Large, clearly visible QR code with sufficient white space around it */}
                      <div className="p-3.5 sm:p-4 bg-white border border-[#E5E7EB] rounded-2xl inline-block">
                        {qrError ? (
                          <div className="w-52 h-52 flex flex-col items-center justify-center text-center p-2 text-rose-600">
                            <AlertCircle className="w-6 h-6 mb-1" />
                            <span className="text-xs font-bold">Unable to render QR</span>
                          </div>
                        ) : (
                          <canvas ref={canvasRef} className="block mx-auto max-w-full" />
                        )}
                      </div>

                      {/* 5. Below QR & 6. Shop Code */}
                      <div className="space-y-1.5 pt-0.5">
                        <p className="text-xs font-medium text-[#555555]">
                          Can&apos;t scan? Enter your shop code manually.
                        </p>
                        <div className="inline-block px-5 py-1.5 rounded-lg bg-[#F5FBF6] border border-[#CDEED5]">
                          <span className="text-xl sm:text-2xl font-extrabold tracking-wider text-[#111111] select-all">
                            #{currentShopCode}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 7–8. Bottom Section: 3 Horizontal Steps + Footer */}
                    <div className="space-y-3.5">
                      {/* 7. Three simple steps in one horizontal row */}
                      <div className="grid grid-cols-3 gap-2.5 pt-3.5 border-t border-[#ECEFEC] text-left">
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-[#111111]">
                            <span className="text-[#00B32D] font-extrabold mr-1">01</span>
                            <span>Scan</span>
                          </div>
                          <p className="text-[11px] text-[#555555] leading-snug">
                            Scan the QR code.
                          </p>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-[#111111]">
                            <span className="text-[#00B32D] font-extrabold mr-1">02</span>
                            <span>Upload</span>
                          </div>
                          <p className="text-[11px] text-[#555555] leading-snug">
                            Select your document.
                          </p>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-[#111111]">
                            <span className="text-[#00B32D] font-extrabold mr-1">03</span>
                            <span>Collect</span>
                          </div>
                          <p className="text-[11px] text-[#555555] leading-snug">
                            Pick up your prints.
                          </p>
                        </div>
                      </div>

                      {/* 8. Bottom */}
                      <div className="pt-2.5 border-t border-[#ECEFEC] space-y-0.5 text-center">
                        <p className="text-xs font-medium text-[#111111]">
                          Your documents, printed with ease.
                        </p>
                        <p className="text-[11px] font-semibold text-[#00B32D]">
                          Powered by EasyToPrint
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 3. ESSENTIAL CUSTOMIZATION CONTROLS */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Format Control */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Format
                </span>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFormat('A5')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      format === 'A5'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    A5 Desk Stand
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat('A4')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      format === 'A4'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    A4 Full Sheet
                  </button>
                </div>
              </div>

              {/* Orientation Control */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Orientation
                </span>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setOrientation('PORTRAIT')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      orientation === 'PORTRAIT'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Portrait
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientation('LANDSCAPE')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      orientation === 'LANDSCAPE'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Landscape
                  </button>
                </div>
              </div>

              {/* Print Specification Readout */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Print Dimensions
                </span>
                <div className="px-3 py-2 bg-slate-100 rounded-xl text-xs font-bold text-[#111111] text-center">
                  {format === 'A5'
                    ? orientation === 'PORTRAIT'
                      ? '148 × 210 mm (A5)'
                      : '210 × 148 mm (A5)'
                    : orientation === 'PORTRAIT'
                    ? '210 × 297 mm (A4)'
                    : '297 × 210 mm (A4)'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
