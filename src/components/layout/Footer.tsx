import React, { useState, Suspense, lazy } from 'react';
import { Printer, Shield, ArrowUpRight } from 'lucide-react';
import { useApp } from '../../lib/store';
import type { LegalModalType } from './FooterLegalModal';

const FooterLegalModal = lazy(() =>
  import('./FooterLegalModal').then((m) => ({ default: m.FooterLegalModal }))
);

export const Footer: React.FC = () => {
  const { navigate } = useApp();
  const [activeLegalModal, setActiveLegalModal] = useState<LegalModalType | null>(null);

  return (
    <footer className="bg-white border-t border-[#E1E7E1] text-[#646B65] text-sm font-['Manrope',sans-serif]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-10 md:gap-10 lg:gap-12">
          {/* Brand & Purpose (full width on mobile, 2 cols on md) */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center shrink-0 border border-[#A7F3D0]/70">
                <Printer className="w-4.5 h-4.5 text-[#00B32D]" />
              </div>
              <span className="font-extrabold text-lg text-[#111111] tracking-tight font-['Manrope',sans-serif]">
                Easy<span className="text-[#00B32D]">To</span>Print
              </span>
            </div>
            <p className="text-xs text-[#646B65] leading-relaxed max-w-sm">
              EasyToPrint helps printing businesses simplify shop operations, automate print workflows, and deliver a smarter printing experience through one connected platform.
            </p>
            <div className="pt-2 flex items-center gap-2 text-xs text-[#646B65]">
              <Shield className="w-3.5 h-3.5 text-[#00B32D]" />
              <span>Enterprise Grade Windows Agent &amp; Cloud Queue</span>
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-bold text-[#111111] uppercase tracking-wider">
              Product
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <a
                  href="/features"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/features');
                  }}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="/how-it-works"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/how-it-works');
                  }}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  How It Works
                </a>
              </li>
              <li>
                <a
                  href="/qr-print-ordering"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/qr-print-ordering');
                  }}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  QR Print Ordering
                </a>
              </li>
              <li>
                <a
                  href="/print-shop-management"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/print-shop-management');
                  }}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Print Shop Management
                </a>
              </li>
              <li>
                <a
                  href="/print-agent"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/print-agent');
                  }}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  EasyToPrint Agent
                </a>
              </li>
              <li>
                <a
                  href="/pricing"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/pricing');
                  }}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Pricing
                </a>
              </li>
            </ul>
          </div>

          {/* Company & Support */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-bold text-[#111111] uppercase tracking-wider">
              Company
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <a
                  href="/about"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/about');
                  }}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  About Us
                </a>
              </li>
              <li>
                <a
                  href="/blog"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/blog');
                  }}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Guides &amp; Blog
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/contact');
                  }}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Contact Us
                </a>
              </li>
              <li>
                <a
                  href="/faq"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/faq');
                  }}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  FAQs &amp; Help Center
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveLegalModal('contact')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left"
                >
                  Contact Support
                </button>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-bold text-[#111111] uppercase tracking-wider">
              Legal
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => setActiveLegalModal('privacy')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveLegalModal('terms')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left"
                >
                  Terms &amp; Conditions
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setActiveLegalModal('refund')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left"
                >
                  Refund Policy
                </button>
              </li>
              <li>
                <a
                  href="/track-print"
                  rel="nofollow"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/track-print');
                  }}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left flex items-center gap-1"
                >
                  <span>Track Customer Order</span>
                  <ArrowUpRight className="w-3 h-3 text-[#00B32D]" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-[#E1E7E1] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#646B65]">
          <p>© 2026 EasyToPrint. All rights reserved.</p>
          <div className="flex items-center gap-6 text-xs">
            <span className="text-[#111111] font-semibold">One Platform to Manage Your Entire Printing Business</span>
          </div>
        </div>
      </div>

      {/* Interactive Information & Legal Modals (Lazy-Loaded) */}
      {activeLegalModal && (
        <Suspense fallback={null}>
          <FooterLegalModal
            type={activeLegalModal}
            onClose={() => setActiveLegalModal(null)}
          />
        </Suspense>
      )}
    </footer>
  );
};
