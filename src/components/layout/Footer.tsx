import React from 'react';
import { Printer, Shield, ArrowUpRight } from 'lucide-react';
import { useApp } from '../../lib/store';

export const Footer: React.FC = () => {
  const { navigate } = useApp();

  const handleLink = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    navigate(href);
  };

  return (
    <footer className="bg-white border-t border-[#E1E7E1] text-[#646B65] text-sm font-['Manrope',sans-serif]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-10 md:gap-10 lg:gap-12">
          {/* Brand & Purpose */}
          <div className="col-span-2 space-y-4">
            <a href="/" onClick={handleLink('/')} className="inline-flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center shrink-0 border border-[#A7F3D0]/70">
                <Printer className="w-4.5 h-4.5 text-[#00B32D]" />
              </div>
              <span className="font-extrabold text-lg text-[#111111] tracking-tight font-['Manrope',sans-serif]">
                Easy<span className="text-[#00B32D]">To</span>Print
              </span>
            </a>
            <p className="text-xs text-[#646B65] leading-relaxed max-w-sm">
              EasyToPrint helps printing and Xerox businesses in India manage QR-based print orders, accept instant UPI payments, and automate Windows desktop printing from one platform.
            </p>
            <div className="pt-2 flex items-center gap-2 text-xs text-[#646B65]">
              <Shield className="w-3.5 h-3.5 text-[#00B32D]" />
              <span>Windows Desktop Print Agent &amp; Cloud Order Queue</span>
            </div>
          </div>

          {/* Product & Solutions Links */}
          <div className="space-y-3.5">
            <h2 className="text-xs font-bold text-[#111111] uppercase tracking-wider">
              Solutions
            </h2>
            <ul className="space-y-2.5 text-xs">
              <li>
                <a
                  href="/print-shop-management-software"
                  onClick={handleLink('/print-shop-management-software')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Print Shop Software
                </a>
              </li>
              <li>
                <a
                  href="/xerox-shop-management-software"
                  onClick={handleLink('/xerox-shop-management-software')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Xerox Shop Software
                </a>
              </li>
              <li>
                <a
                  href="/qr-code-printing-orders"
                  onClick={handleLink('/qr-code-printing-orders')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  QR Code Printing Orders
                </a>
              </li>
              <li>
                <a
                  href="/online-print-order-management"
                  onClick={handleLink('/online-print-order-management')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Online Print Orders
                </a>
              </li>
              <li>
                <a
                  href="/print-job-automation"
                  onClick={handleLink('/print-job-automation')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Print Job Automation
                </a>
              </li>
              <li>
                <a
                  href="/print-agent-software"
                  onClick={handleLink('/print-agent-software')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Windows Print Agent
                </a>
              </li>
            </ul>
          </div>

          {/* Company & Resources */}
          <div className="space-y-3.5">
            <h2 className="text-xs font-bold text-[#111111] uppercase tracking-wider">
              Platform
            </h2>
            <ul className="space-y-2.5 text-xs">
              <li>
                <a
                  href="/features"
                  onClick={handleLink('/features')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  All Features
                </a>
              </li>
              <li>
                <a
                  href="/how-it-works"
                  onClick={handleLink('/how-it-works')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  How It Works
                </a>
              </li>
              <li>
                <a
                  href="/pricing"
                  onClick={handleLink('/pricing')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Pricing Plans
                </a>
              </li>
              <li>
                <a
                  href="/blog"
                  onClick={handleLink('/blog')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Print Shop Guides &amp; Blog
                </a>
              </li>
              <li>
                <a
                  href="/about"
                  onClick={handleLink('/about')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  About Us
                </a>
              </li>
              <li>
                <a
                  href="/faq"
                  onClick={handleLink('/faq')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  FAQs
                </a>
              </li>
            </ul>
          </div>

          {/* Legal & Support Links */}
          <div className="space-y-3.5">
            <h2 className="text-xs font-bold text-[#111111] uppercase tracking-wider">
              Legal &amp; Support
            </h2>
            <ul className="space-y-2.5 text-xs">
              <li>
                <a
                  href="/contact"
                  onClick={handleLink('/contact')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Contact Support
                </a>
              </li>
              <li>
                <a
                  href="/privacy"
                  onClick={handleLink('/privacy')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="/terms"
                  onClick={handleLink('/terms')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="/refund-policy"
                  onClick={handleLink('/refund-policy')}
                  className="hover:text-[#00B32D] transition-colors cursor-pointer text-left block"
                >
                  Refund Policy
                </a>
              </li>
              <li>
                <a
                  href="/track-print"
                  rel="nofollow"
                  onClick={handleLink('/track-print')}
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
            <span className="text-[#111111] font-semibold">Print Shop Management &amp; Automation Software for India</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
