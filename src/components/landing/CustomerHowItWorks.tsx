import React, { useState } from 'react';
import {
  QrCode,
  Plus,
  Minus,
  ShieldCheck,
  HelpCircle,
  FileText,
  ArrowLeft,
  CheckCircle2,
  Share2,
  Printer,
  ArrowRight
} from 'lucide-react';

interface CustomerHowItWorksProps {
  onOpenQrScanner: () => void;
  onFindShop: () => void;
}

export const CustomerHowItWorks: React.FC<CustomerHowItWorksProps> = ({
  onOpenQrScanner,
  onFindShop
}) => {
  // Interactive mini-state for Step 3 mobile preview
  const [previewCopies, setPreviewCopies] = useState(1);
  const [previewColor, setPreviewColor] = useState<'bw' | 'color'>('bw');
  const [previewDuplex, setPreviewDuplex] = useState<'single' | 'double'>('double');

  return (
    <div className="space-y-8">
      {/* Sub-header for Customer Flow */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5 text-left">
          <p className="text-xs font-bold uppercase tracking-wider text-[#008F25]">
            For Customers · Scan &amp; Print in Seconds
          </p>
          <h3 className="text-xl sm:text-2xl font-extrabold text-[#111111] tracking-tight">
            How Customers Print Without Queues or WhatsApp
          </h3>
        </div>
        <button
          type="button"
          onClick={onOpenQrScanner}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#00A61C] hover:bg-[#008F25] text-white text-xs sm:text-sm font-bold shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <QrCode className="w-4 h-4" />
          <span>Try Scan QR Flow</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 4 Green Step Showcase Cards matching Reference Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
        {/* =============================================================== */}
        {/* STEP 1: SCAN THE SHOP QR                                        */}
        {/* =============================================================== */}
        <div className="rounded-2xl bg-[#009E22] text-white pt-6 px-5 pb-0 flex flex-col justify-between overflow-hidden shadow-md border border-[#00851B]">
          <div className="text-center space-y-2.5 mb-5">
            <span className="inline-block px-4 py-1 rounded-full bg-white text-[#008F1C] text-[11px] font-extrabold tracking-wider uppercase shadow-2xs">
              STEP 1
            </span>
            <h4 className="text-lg font-extrabold text-white tracking-tight text-balance">
              Scan the Shop QR
            </h4>
            <p className="text-xs text-white/90 leading-relaxed min-h-[54px]">
              Each EasyToPrint counter has its own unique QR &amp; 6-digit code — scan it using your mobile camera.
            </p>
          </div>

          {/* Phone Frame 1 */}
          <div className="mt-auto mx-auto w-full max-w-[236px]">
            <div className="rounded-t-[28px] bg-[#161816] p-[6px] pb-0 shadow-2xl border-2 border-[#2B302B] border-b-0">
              <div className="rounded-t-[22px] bg-white text-[#111111] overflow-hidden flex flex-col h-[268px]">
                {/* iOS Status Bar */}
                <div className="px-4 pt-2 pb-1.5 flex items-center justify-between text-[9px] font-bold text-[#111111]">
                  <span>9:41</span>
                  <span className="w-14 h-3 rounded-full bg-[#111111]" />
                  <span className="flex items-center gap-1 text-[8px] font-semibold">5G</span>
                </div>

                {/* App Header */}
                <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#EEF2EE]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-[#00A61C] text-white text-[9px] font-black flex items-center justify-center">
                      E
                    </span>
                    <span className="text-[11px] font-extrabold text-[#111111] tracking-tight">
                      EasyToPrint
                    </span>
                  </div>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F5F7F5] border border-[#E1E7E1] text-[8px] font-semibold text-[#555]">
                    <HelpCircle className="w-2.5 h-2.5" />
                    <span>Help</span>
                  </div>
                </div>

                {/* QR Scanner Viewfinder */}
                <div className="flex-1 p-3 flex flex-col items-center justify-between bg-[#F7FAF7]">
                  <div className="relative w-32 h-32 p-2.5 bg-white rounded-xl border border-[#E1E7E1] flex items-center justify-center shadow-2xs my-auto">
                    {/* 4 Green Viewfinder Brackets */}
                    <span className="absolute -top-1 -left-1 w-4 h-4 border-t-[3px] border-l-[3px] border-[#00A61C] rounded-tl-md" />
                    <span className="absolute -top-1 -right-1 w-4 h-4 border-t-[3px] border-r-[3px] border-[#00A61C] rounded-tr-md" />
                    <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-[3px] border-l-[3px] border-[#00A61C] rounded-bl-md" />
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-[3px] border-r-[3px] border-[#00A61C] rounded-br-md" />

                    {/* Crisp SVG QR Illustration */}
                    <svg
                      viewBox="0 0 36 36"
                      className="w-full h-full text-[#111111]"
                      aria-label="Shop QR Code Preview"
                    >
                      <rect x="2" y="2" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
                      <rect x="5" y="5" width="4" height="4" fill="currentColor" />
                      <rect x="24" y="2" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
                      <rect x="27" y="5" width="4" height="4" fill="currentColor" />
                      <rect x="2" y="24" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
                      <rect x="5" y="27" width="4" height="4" fill="currentColor" />
                      <path
                        d="M15 3h2v4h-2zm4 0h2v2h-2zm-4 6h4v2h-4zm6-3h2v6h-2zM3 15h4v2H3zm6 0h2v4H9zm4 0h4v2h-4zm6 0h2v2h-2zm4 0h4v4h-4zm6 0h4v2h-4zM15 19h4v4h-4zm6 2h2v4h-2zm4-2h4v2h-4zm6 2h2v6h-2zM15 26h2v4h-2zm4 2h4v2h-4zm6 0h2v6h-2zm-10 4h4v2h-4zm12 0h4v2h-4z"
                        fill="currentColor"
                      />
                    </svg>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenQrScanner}
                    className="w-full py-2 rounded-lg bg-[#009E22] hover:bg-[#00851B] text-white text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <QrCode className="w-3 h-3" />
                    <span>Scan QR</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* STEP 2: UPLOAD YOUR DOCUMENT                                    */}
        {/* =============================================================== */}
        <div className="rounded-2xl bg-[#009E22] text-white pt-6 px-5 pb-0 flex flex-col justify-between overflow-hidden shadow-md border border-[#00851B]">
          <div className="text-center space-y-2.5 mb-5">
            <span className="inline-block px-4 py-1 rounded-full bg-white text-[#008F1C] text-[11px] font-extrabold tracking-wider uppercase shadow-2xs">
              STEP 2
            </span>
            <h4 className="text-lg font-extrabold text-white tracking-tight text-balance">
              Upload Your Document
            </h4>
            <p className="text-xs text-white/90 leading-relaxed min-h-[54px]">
              Choose your required PDF or image files from your phone or laptop. No account or app required.
            </p>
          </div>

          {/* Phone Frame 2 */}
          <div className="mt-auto mx-auto w-full max-w-[236px]">
            <div className="rounded-t-[28px] bg-[#161816] p-[6px] pb-0 shadow-2xl border-2 border-[#2B302B] border-b-0">
              <div className="rounded-t-[22px] bg-white text-[#111111] overflow-hidden flex flex-col h-[268px]">
                {/* iOS Status Bar */}
                <div className="px-4 pt-2 pb-1.5 flex items-center justify-between text-[9px] font-bold text-[#111111]">
                  <span>9:41</span>
                  <span className="w-14 h-3 rounded-full bg-[#111111]" />
                  <span className="flex items-center gap-1 text-[8px] font-semibold">5G</span>
                </div>

                {/* Shop Bar */}
                <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#EEF2EE] bg-[#F4FAF4]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-4 h-4 rounded bg-[#00A61C] text-white text-[9px] font-black flex items-center justify-center shrink-0">
                      E
                    </span>
                    <div className="leading-tight truncate">
                      <div className="text-[9px] font-bold text-[#111111] truncate">Shop #100001</div>
                      <div className="text-[7px] text-[#646B65] truncate">Ready to Print</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-[#E1E7E1] text-[8px] font-semibold text-[#555] shrink-0">
                    <HelpCircle className="w-2.5 h-2.5" />
                    <span>Help</span>
                  </div>
                </div>

                {/* Upload Dropzone */}
                <div className="flex-1 p-2.5 flex flex-col gap-2 bg-[#F8FAF8]">
                  <div className="rounded-xl bg-white border border-[#E1E7E1] p-3 flex flex-col items-center justify-center gap-1.5 shadow-2xs">
                    <div className="w-7 h-7 rounded-md bg-[#00A61C] text-white flex items-center justify-center">
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <span className="text-[9px] font-bold text-[#111111]">Add files</span>
                    <span className="text-[7.5px] text-[#646B65]">Tap to select PDF or images</span>
                  </div>

                  {/* Privacy Guarantee Strip */}
                  <div className="rounded-lg bg-[#EBF7ED] border border-[#CBEBD0] px-2 py-1 flex items-center justify-center gap-1 text-[8px] font-semibold text-[#007A18]">
                    <ShieldCheck className="w-3 h-3 text-[#00A61C] shrink-0" />
                    <span>Files auto-deleted after printing</span>
                  </div>

                  <div className="text-[7px] text-center text-[#777777]">
                    Accepted: PDF, DOCX, JPG, PNG · Max 50MB
                  </div>

                  {/* Bottom Peeking Settings Preview */}
                  <div className="mt-auto rounded-t-lg bg-white border border-b-0 border-[#E1E7E1] p-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[8px] font-bold text-[#111111]">
                      <span>Number of Copies</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#F5F7F5] border border-[#E1E7E1] tabular-nums">
                        - 1 +
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[7.5px] font-semibold text-[#646B65]">
                      <div className="px-2 py-1 rounded border border-[#E1E7E1] bg-[#FAFAFA]">B/W</div>
                      <div className="px-2 py-1 rounded border border-[#E1E7E1] bg-[#FAFAFA]">Color</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* STEP 3: SET PRINT PREFERENCE                                    */}
        {/* =============================================================== */}
        <div className="rounded-2xl bg-[#009E22] text-white pt-6 px-5 pb-0 flex flex-col justify-between overflow-hidden shadow-md border border-[#00851B]">
          <div className="text-center space-y-2.5 mb-5">
            <span className="inline-block px-4 py-1 rounded-full bg-white text-[#008F1C] text-[11px] font-extrabold tracking-wider uppercase shadow-2xs">
              STEP 3
            </span>
            <h4 className="text-lg font-extrabold text-white tracking-tight text-balance">
              Set Print Preference
            </h4>
            <p className="text-xs text-white/90 leading-relaxed min-h-[54px]">
              Set number of copies, B&amp;W or Color, single/double-sided &amp; orientation with live price calculation.
            </p>
          </div>

          {/* Phone Frame 3 (Interactive Mini Preview) */}
          <div className="mt-auto mx-auto w-full max-w-[236px]">
            <div className="rounded-t-[28px] bg-[#161816] p-[6px] pb-0 shadow-2xl border-2 border-[#2B302B] border-b-0">
              <div className="rounded-t-[22px] bg-white text-[#111111] overflow-hidden flex flex-col h-[268px]">
                {/* iOS Status Bar */}
                <div className="px-4 pt-2 pb-1.5 flex items-center justify-between text-[9px] font-bold text-[#111111]">
                  <span>9:41</span>
                  <span className="w-14 h-3 rounded-full bg-[#111111]" />
                  <span className="flex items-center gap-1 text-[8px] font-semibold">5G</span>
                </div>

                {/* Shop Bar */}
                <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#EEF2EE] bg-[#F4FAF4]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-4 h-4 rounded bg-[#00A61C] text-white text-[9px] font-black flex items-center justify-center shrink-0">
                      E
                    </span>
                    <div className="leading-tight truncate">
                      <div className="text-[9px] font-bold text-[#111111] truncate">Shop #100001</div>
                      <div className="text-[7px] text-[#646B65] truncate">2 Pages · PDF</div>
                    </div>
                  </div>
                  <div className="text-[9px] font-extrabold text-[#008F25] tabular-nums shrink-0">
                    ₹{(previewColor === 'color' ? 10 : 2) * 2 * previewCopies}
                  </div>
                </div>

                {/* Interactive Print Controls */}
                <div className="flex-1 p-2.5 flex flex-col justify-between bg-white">
                  {/* Copies Stepper */}
                  <div className="flex items-center justify-between">
                    <span className="text-[8.5px] font-bold text-[#111111]">Number of Copies</span>
                    <div className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-[#EBF7ED] border border-[#CBEBD0] text-[9px] font-bold">
                      <button
                        type="button"
                        onClick={() => setPreviewCopies((c) => Math.max(1, c - 1))}
                        aria-label="Decrease copies"
                        className="text-[#008F25] hover:text-[#111111] cursor-pointer"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <span className="tabular-nums min-w-[10px] text-center">{previewCopies}</span>
                      <button
                        type="button"
                        onClick={() => setPreviewCopies((c) => Math.min(20, c + 1))}
                        aria-label="Increase copies"
                        className="text-[#008F25] hover:text-[#111111] cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>

                  {/* B/W vs Color Visual Swatches */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewColor('bw')}
                      className={`p-1.5 rounded-lg border text-left transition-colors cursor-pointer relative overflow-hidden h-[52px] ${
                        previewColor === 'bw'
                          ? 'border-[#00A61C] bg-[#F4FAF4]'
                          : 'border-[#E1E7E1] bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[8.5px] font-bold text-[#111111]">B/W</span>
                        <span
                          className={`w-2.5 h-2.5 rounded-full border ${
                            previewColor === 'bw' ? 'border-[#00A61C] bg-[#00A61C]' : 'border-[#CBD5E1]'
                          }`}
                        />
                      </div>
                      {/* Overlapping grayscale circles */}
                      <div className="absolute -bottom-2 right-1 flex">
                        <span className="w-5 h-5 rounded-full bg-[#D1D5DB]/80" />
                        <span className="w-5 h-5 rounded-full bg-[#4B5563]/80 -ml-2" />
                        <span className="w-5 h-5 rounded-full bg-[#111111]/85 -ml-2" />
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewColor('color')}
                      className={`p-1.5 rounded-lg border text-left transition-colors cursor-pointer relative overflow-hidden h-[52px] ${
                        previewColor === 'color'
                          ? 'border-[#00A61C] bg-[#F4FAF4]'
                          : 'border-[#E1E7E1] bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[8.5px] font-bold text-[#111111]">Color</span>
                        <span
                          className={`w-2.5 h-2.5 rounded-full border ${
                            previewColor === 'color' ? 'border-[#00A61C] bg-[#00A61C]' : 'border-[#CBD5E1]'
                          }`}
                        />
                      </div>
                      {/* Overlapping CMYK circles */}
                      <div className="absolute -bottom-2 right-1 flex">
                        <span className="w-5 h-5 rounded-full bg-[#FACC15]/85" />
                        <span className="w-5 h-5 rounded-full bg-[#EC4899]/80 -ml-2" />
                        <span className="w-5 h-5 rounded-full bg-[#06B6D4]/85 -ml-2" />
                      </div>
                    </button>
                  </div>

                  {/* Single vs Double-sided */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewDuplex('single')}
                      className={`px-2 py-1 rounded border text-[8px] font-semibold flex items-center justify-between cursor-pointer ${
                        previewDuplex === 'single'
                          ? 'border-[#00A61C] bg-[#F4FAF4] text-[#008F25]'
                          : 'border-[#E1E7E1] text-[#555]'
                      }`}
                    >
                      <span>Single-sided</span>
                      <FileText className="w-2.5 h-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDuplex('double')}
                      className={`px-2 py-1 rounded border text-[8px] font-semibold flex items-center justify-between cursor-pointer ${
                        previewDuplex === 'double'
                          ? 'border-[#00A61C] bg-[#F4FAF4] text-[#008F25]'
                          : 'border-[#E1E7E1] text-[#555]'
                      }`}
                    >
                      <span>Double-sided</span>
                      <FileText className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  {/* Orientation row */}
                  <div className="space-y-1">
                    <div className="text-[7.5px] font-bold text-[#555]">Orientation</div>
                    <div className="grid grid-cols-2 gap-1.5 text-[8px] font-semibold text-[#555]">
                      <div className="px-2 py-1 rounded border border-[#00A61C] bg-[#F4FAF4] text-[#008F25]">
                        Portrait
                      </div>
                      <div className="px-2 py-1 rounded border border-[#E1E7E1]">Landscape</div>
                    </div>
                  </div>

                  {/* Action bar */}
                  <button
                    type="button"
                    onClick={onFindShop}
                    className="w-full py-1.5 rounded-lg bg-[#009E22] hover:bg-[#00851B] text-white text-[9.5px] font-bold cursor-pointer transition-colors"
                  >
                    Upload &amp; Pay
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* STEP 4: PAY VIA UPI & COLLECT PRINTS                            */}
        {/* =============================================================== */}
        <div className="rounded-2xl bg-[#009E22] text-white pt-6 px-5 pb-0 flex flex-col justify-between overflow-hidden shadow-md border border-[#00851B]">
          <div className="text-center space-y-2.5 mb-5">
            <span className="inline-block px-4 py-1 rounded-full bg-white text-[#008F1C] text-[11px] font-extrabold tracking-wider uppercase shadow-2xs">
              STEP 4
            </span>
            <h4 className="text-lg font-extrabold text-white tracking-tight text-balance">
              Pay &amp; Collect Instantly
            </h4>
            <p className="text-xs text-white/90 leading-relaxed min-h-[54px]">
              Pay securely via UPI or card — printing starts automatically on the shop counter printer with live tracking.
            </p>
          </div>

          {/* Phone Frame 4 */}
          <div className="mt-auto mx-auto w-full max-w-[236px]">
            <div className="rounded-t-[28px] bg-[#161816] p-[6px] pb-0 shadow-2xl border-2 border-[#2B302B] border-b-0">
              <div className="rounded-t-[22px] bg-white text-[#111111] overflow-hidden flex flex-col h-[268px]">
                {/* iOS Status Bar */}
                <div className="px-4 pt-2 pb-1.5 flex items-center justify-between text-[9px] font-bold text-[#111111]">
                  <span>9:41</span>
                  <span className="w-14 h-3 rounded-full bg-[#111111]" />
                  <span className="flex items-center gap-1 text-[8px] font-semibold">5G</span>
                </div>

                {/* App Header */}
                <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#EEF2EE]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-[#00A61C] text-white text-[9px] font-black flex items-center justify-center">
                      E
                    </span>
                    <span className="text-[11px] font-extrabold text-[#111111] tracking-tight">
                      EasyToPrint
                    </span>
                  </div>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F5F7F5] border border-[#E1E7E1] text-[8px] font-semibold text-[#555]">
                    <HelpCircle className="w-2.5 h-2.5" />
                    <span>Help</span>
                  </div>
                </div>

                {/* Order Ready / Live Tracking Screen */}
                <div className="flex-1 p-2.5 flex flex-col justify-between bg-white">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[8px] font-semibold text-[#555]">
                      <ArrowLeft className="w-2.5 h-2.5" /> Back
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#00A61C] text-white text-[8px] font-bold">
                      <CheckCircle2 className="w-2.5 h-2.5" /> UPI Paid
                    </span>
                  </div>

                  <div className="text-center space-y-0.5">
                    <div className="text-[10.5px] font-extrabold text-[#111111]">
                      Your Print is Printing!
                    </div>
                    <div className="text-[7.5px] text-[#646B65]">
                      Order #ETP-4082 · Shop #100001
                    </div>
                  </div>

                  {/* Print Status + Pickup QR Box */}
                  <div className="mx-auto w-24 h-24 p-2 rounded-xl border border-[#E1E7E1] bg-[#F7FAF7] flex flex-col items-center justify-center gap-1">
                    <Printer className="w-6 h-6 text-[#00A61C]" />
                    <span className="text-[8.5px] font-extrabold text-[#111111] tabular-nums">
                      2 / 2 Pages
                    </span>
                    <span className="text-[7px] font-bold text-[#008F25]">
                      Ready at Counter
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={onFindShop}
                      className="w-full py-1.5 rounded-lg bg-[#009E22] hover:bg-[#00851B] text-white text-[9px] font-bold cursor-pointer transition-colors"
                    >
                      Start Your Print Order
                    </button>
                    <div className="grid grid-cols-2 gap-1.5 text-[8px] font-semibold text-[#008F25]">
                      <div className="py-1 rounded border border-[#CBEBD0] bg-[#F4FAF4] text-center">
                        Live Status
                      </div>
                      <div className="py-1 rounded border border-[#CBEBD0] bg-[#F4FAF4] flex items-center justify-center gap-1">
                        <Share2 className="w-2.5 h-2.5" />
                        <span>Share</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
