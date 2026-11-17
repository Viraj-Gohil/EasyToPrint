import React, { useState } from 'react';
import {
  Printer,
  QrCode,
  FileText,
  CreditCard,
  Monitor,
  Check,
  ArrowRight,
  Shield,
  Zap,
  Layers,
  BarChart3,
  Smartphone,
  Mail,
  Phone,
  MapPin,
  Clock,
  HelpCircle,
  AlertCircle,
  Home,
  CheckCircle2,
  Cpu,
  Wifi,
  Settings,
  Building2,
  BookOpen,
  Calendar
} from 'lucide-react';
import { useApp } from '../../lib/store';
import { FaqAccordion } from '../landing/FaqAccordion';
import { BLOG_POSTS, getBlogPostBySlug } from '../../lib/blogData';

interface SpaLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
}

export const SpaLink: React.FC<SpaLinkProps> = ({ href, children, onClick, ...rest }) => {
  const { navigate } = useApp();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.altKey ||
      e.ctrlKey ||
      e.shiftKey ||
      href.startsWith('http') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:')
    ) {
      return;
    }
    e.preventDefault();
    navigate(href);
  };

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
};

const BreadcrumbBar: React.FC<{
  currentLabel: string;
  currentPath: string;
  parentLabel?: string;
  parentPath?: string;
}> = ({ currentLabel, currentPath, parentLabel, parentPath }) => (
  <nav aria-label="Breadcrumb" className="bg-[#F7F8F7] border-b border-[#E1E7E1]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-[#646B65] flex-wrap">
      <SpaLink href="/" className="hover:text-[#00B32D] font-medium transition-colors flex items-center gap-1">
        <Home className="w-3.5 h-3.5" />
        <span>Home</span>
      </SpaLink>
      {parentLabel && parentPath && (
        <>
          <span>/</span>
          <SpaLink href={parentPath} className="hover:text-[#00B32D] font-medium transition-colors">
            {parentLabel}
          </SpaLink>
        </>
      )}
      <span>/</span>
      <SpaLink href={currentPath} className="text-[#111111] font-bold truncate max-w-xs sm:max-w-md" aria-current="page">
        {currentLabel}
      </SpaLink>
    </div>
  </nav>
);

const InternalLinksFooterBlock: React.FC = () => (
  <section className="py-12 bg-[#F7F8F7] border-t border-[#E1E7E1]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <h2 className="text-lg font-extrabold text-[#111111] mb-4">
        Explore EasyToPrint Solutions for Indian Printing Businesses
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <SpaLink
          href="/how-it-works"
          className="p-4 rounded-2xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] transition-all group block"
        >
          <h3 className="text-sm font-bold text-[#111111] group-hover:text-[#00B32D] flex items-center justify-between">
            <span>How It Works</span>
            <ArrowRight className="w-4 h-4 text-[#00B32D]" />
          </h3>
          <p className="text-xs text-[#646B65] mt-1">
            Complete QR scan to automated printer dispatch workflow for counters.
          </p>
        </SpaLink>
        <SpaLink
          href="/qr-print-ordering"
          className="p-4 rounded-2xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] transition-all group block"
        >
          <h3 className="text-sm font-bold text-[#111111] group-hover:text-[#00B32D] flex items-center justify-between">
            <span>QR Print Ordering</span>
            <ArrowRight className="w-4 h-4 text-[#00B32D]" />
          </h3>
          <p className="text-xs text-[#646B65] mt-1">
            Touch-free smartphone PDF upload and instant print configuration for walk-ins.
          </p>
        </SpaLink>
        <SpaLink
          href="/print-shop-management"
          className="p-4 rounded-2xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] transition-all group block"
        >
          <h3 className="text-sm font-bold text-[#111111] group-hover:text-[#00B32D] flex items-center justify-between">
            <span>Shop Management</span>
            <ArrowRight className="w-4 h-4 text-[#00B32D]" />
          </h3>
          <p className="text-xs text-[#646B65] mt-1">
            Cloud dashboard for Xerox billing, pricing rules, and order queue control.
          </p>
        </SpaLink>
        <SpaLink
          href="/print-agent"
          className="p-4 rounded-2xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] transition-all group block"
        >
          <h3 className="text-sm font-bold text-[#111111] group-hover:text-[#00B32D] flex items-center justify-between">
            <span>Windows Agent</span>
            <ArrowRight className="w-4 h-4 text-[#00B32D]" />
          </h3>
          <p className="text-xs text-[#646B65] mt-1">
            Automated Win32 print spooling, multi-printer routing, and hardware status.
          </p>
        </SpaLink>
        <SpaLink
          href="/blog"
          className="p-4 rounded-2xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] transition-all group block"
        >
          <h3 className="text-sm font-bold text-[#111111] group-hover:text-[#00B32D] flex items-center justify-between">
            <span>Xerox Guides &amp; Blog</span>
            <ArrowRight className="w-4 h-4 text-[#00B32D]" />
          </h3>
          <p className="text-xs text-[#646B65] mt-1">
            Step-by-step playbooks on print shop automation and UPI counter workflows.
          </p>
        </SpaLink>
      </div>
    </div>
  </section>
);

// ============================================================================
// 1. /features – FEATURES PAGE
// ============================================================================
export const FeaturesSeoPage: React.FC = () => {
  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar currentLabel="Features" currentPath="/features" />

      <section className="py-14 sm:py-20 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
              Complete Print Shop Automation Platform
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111111] leading-tight">
              Everything Your Print Shop Needs in One Platform
            </h1>
            <p className="text-base sm:text-lg text-[#646B65] leading-relaxed">
              EasyToPrint combines QR-based customer document uploads, automatic page and color calculation, instant UPI checkout, and automated Windows desktop printing for Xerox and printing businesses across India.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <SpaLink
                href="/auth/register"
                className="px-6 py-3 rounded-xl bg-[#00B32D] hover:bg-[#008F25] text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all inline-flex items-center gap-2"
              >
                <span>Start Free Shop Setup</span>
                <ArrowRight className="w-4 h-4" />
              </SpaLink>
              <SpaLink
                href="/pricing"
                className="px-6 py-3 rounded-xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] text-[#111111] text-sm font-bold transition-all"
              >
                View Pricing Plans
              </SpaLink>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
        <div className="space-y-3">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">
            Core Capabilities Built for Xerox &amp; Reprography Counters
          </h2>
          <p className="text-sm sm:text-base text-[#646B65] max-w-3xl">
            Every module in EasyToPrint is engineered to eliminate manual file handling, prevent counter congestion during peak hours, and protect your shop computers from malware-infected USB drives.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: QrCode,
              title: 'QR-Based Online Print Ordering',
              desc: 'Each print shop receives a unique counter standee QR code. Walk-in customers scan with any smartphone camera and upload documents directly from Chrome or Safari without installing an app.',
              link: '/qr-print-ordering',
              linkText: 'Learn about QR ordering'
            },
            {
              icon: FileText,
              title: 'Automatic Page Count & Pricing Engine',
              desc: 'Our document parser inspects uploaded PDF files in real time, counts total pages accurately, and computes exact charges based on your shop’s B&W, color, single-sided, or duplex rates.',
              link: '/print-shop-management',
              linkText: 'Explore billing automation'
            },
            {
              icon: CreditCard,
              title: 'Instant UPI & Online Checkout',
              desc: 'Customers pay via Google Pay, PhonePe, Paytm, or BHIM UPI before printing begins. Zero unpaid printouts, zero loose change arguments, and automatic ledger entries.',
              link: '/print-shop-management',
              linkText: 'See payment settlement'
            },
            {
              icon: Monitor,
              title: 'EasyToPrint Windows Desktop Agent',
              desc: 'Lightweight native Windows application that pairs with your cloud dashboard and dispatches paid jobs directly to your physical printers via the Windows Print Spooler.',
              link: '/print-agent',
              linkText: 'Explore Windows Print Agent'
            },
            {
              icon: Layers,
              title: 'Multi-Printer Smart Routing',
              desc: 'Connect high-speed monochrome laser printers and color inkjets simultaneously. EasyToPrint routes monochrome jobs to laser printers and color jobs to photo printers automatically.',
              link: '/print-agent',
              linkText: 'See multi-printer routing'
            },
            {
              icon: BarChart3,
              title: 'Live Shop Analytics & Audit Logs',
              desc: 'Track daily print volume, paper consumption, online vs. counter revenue, and peak order hours from your web dashboard on mobile or desktop.',
              link: '/print-shop-management',
              linkText: 'View dashboard features'
            }
          ].map((item, idx) => (
            <div key={idx} className="p-6 rounded-2xl border border-[#E1E7E1] bg-white hover:border-[#00B32D] transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="w-11 h-11 rounded-xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center">
                  <item.icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-[#111111]">{item.title}</h3>
                <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">{item.desc}</p>
              </div>
              <SpaLink href={item.link} className="text-xs font-bold text-[#008F25] hover:text-[#00B32D] inline-flex items-center gap-1">
                <span>{item.linkText}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </SpaLink>
            </div>
          ))}
        </div>
      </section>

      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 2. /qr-print-ordering – QR CODE PRINT ORDERING SYSTEM
// ============================================================================
export const QrOrderingSeoPage: React.FC = () => {
  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar currentLabel="QR Print Ordering" currentPath="/qr-print-ordering" />

      <section className="py-14 sm:py-20 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
              QR Code Print Ordering System
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111111] leading-tight">
              QR-Based Online Print Ordering for Modern Xerox Counters
            </h1>
            <p className="text-base sm:text-lg text-[#646B65] leading-relaxed">
              Stop wasting counter time receiving files over WhatsApp Web, Bluetooth, email, or virus-prone USB pen drives. With EasyToPrint, customers scan your shop’s QR code, upload documents from their phone, configure print preferences, and pay instantly.
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <SpaLink
                href="/auth/register"
                className="px-6 py-3 rounded-xl bg-[#00B32D] hover:bg-[#008F25] text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all inline-flex items-center gap-2"
              >
                <span>Generate Your Shop QR Code</span>
                <ArrowRight className="w-4 h-4" />
              </SpaLink>
              <SpaLink
                href="/features"
                className="px-6 py-3 rounded-xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] text-[#111111] text-sm font-bold transition-all"
              >
                Explore All Features
              </SpaLink>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="p-6 rounded-3xl bg-white border-2 border-[#00B32D] shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#E1E7E1] pb-3">
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-[#00B32D]" />
                  <span className="text-sm font-bold text-[#111111]">4-Step Customer Self-Service Flow</span>
                </div>
                <span className="text-[11px] font-bold text-[#008F25] bg-[#E8F8EC] px-2.5 py-0.5 rounded-full">No App Required</span>
              </div>
              <ol className="space-y-3 text-xs sm:text-sm text-[#111111]">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#00B32D] text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <div>
                    <strong>Scan Counter QR Standee:</strong> Opens your branded print portal instantly in mobile Chrome or Safari.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#00B32D] text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <div>
                    <strong>Upload PDF Documents:</strong> Automatic page count verification and instant preview on the customer’s phone.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#00B32D] text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <div>
                    <strong>Choose Print Settings:</strong> Select Black &amp; White or Color, single or double-sided (duplex), page ranges, and copies.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#00B32D] text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">4</span>
                  <div>
                    <strong>Pay via UPI &amp; Collect Print:</strong> Instant payment triggers automated printing via the <SpaLink href="/print-agent" className="text-[#008F25] underline font-bold">EasyToPrint Agent</SpaLink>.
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="space-y-3">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">
            Why Indian Xerox Shops Are Switching from WhatsApp Web to QR Print Ordering
          </h2>
          <p className="text-sm sm:text-base text-[#646B65] max-w-3xl">
            In college reprography centres, district court complexes, and busy stationery stores, operators spend up to 60% of their time downloading attachments, opening PDFs, and asking customers how many copies they need.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] space-y-2">
            <h3 className="text-base font-bold text-[#111111]">Customer Privacy &amp; Zero Number Sharing</h3>
            <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
              Customers no longer need to share their personal phone numbers on a public counter register or send confidential Aadhaar, PAN, or legal PDFs over personal WhatsApp chats.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] space-y-2">
            <h3 className="text-base font-bold text-[#111111]">Handle 10+ Walk-In Customers Simultaneously</h3>
            <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
              During exam mornings or office rush hours, twenty students can scan your QR standee at the same time and submit orders concurrently while your printer runs non-stop.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] space-y-2">
            <h3 className="text-base font-bold text-[#111111]">Zero Miscommunication on Print Options</h3>
            <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
              Because customers choose single/double-sided, color mode, and copy count themselves before paying, wasted paper from operator misunderstandings drops to zero.
            </p>
          </div>
        </div>
      </section>

      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 3. /print-shop-management – PRINT SHOP MANAGEMENT SOFTWARE
// ============================================================================
export const PrintShopManagementSeoPage: React.FC = () => {
  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar currentLabel="Print Shop Management" currentPath="/print-shop-management" />

      <section className="py-14 sm:py-20 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
            Printing Shop Software India
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111111] max-w-4xl leading-tight">
            Manage Print Orders, Billing &amp; Shop Operations from One Dashboard
          </h1>
          <p className="text-base sm:text-lg text-[#646B65] max-w-3xl leading-relaxed">
            EasyToPrint gives Xerox shop owners, DTP operators, and commercial printing businesses complete visibility over incoming print orders, custom per-page rate cards, printer queues, and daily UPI collections.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <SpaLink
              href="/auth/register"
              className="px-6 py-3 rounded-xl bg-[#00B32D] hover:bg-[#008F25] text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all inline-flex items-center gap-2"
            >
              <span>Create Your Shop Account</span>
              <ArrowRight className="w-4 h-4" />
            </SpaLink>
            <SpaLink
              href="/print-agent"
              className="px-6 py-3 rounded-xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] text-[#111111] text-sm font-bold transition-all"
            >
              See Desktop Print Agent
            </SpaLink>
          </div>
        </div>
      </section>

      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-7 rounded-3xl border border-[#E1E7E1] bg-white space-y-3">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#111111]">
              Real-Time Order Queue &amp; Job Lifecycle Control
            </h2>
            <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
              Every customer order progresses transparently from <strong>Uploaded &rarr; Paid &rarr; Queued &rarr; Printing &rarr; Completed</strong>. Shop operators can inspect job parameters, pause or prioritize urgent print runs, or trigger a manual reprint with one click.
            </p>
            <ul className="space-y-2 pt-2 text-xs sm:text-sm text-[#111111]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#00B32D]" />
                <span>Instant sound and visual alerts for new paid orders</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#00B32D]" />
                <span>Automatic pickup token numbers for walk-in customers</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#00B32D]" />
                <span>Auto-cleanup of customer files after completion</span>
              </li>
            </ul>
          </div>

          <div className="p-7 rounded-3xl border border-[#E1E7E1] bg-white space-y-3">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#111111]">
              Flexible Xerox Pricing &amp; Billing Management
            </h2>
            <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
              Configure your exact shop rate card in seconds. Set distinct prices for A4 Black &amp; White single-sided, A4 duplex, color documents, and bulk page discounts. EasyToPrint calculates the customer’s bill before checkout.
            </p>
            <ul className="space-y-2 pt-2 text-xs sm:text-sm text-[#111111]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#00B32D]" />
                <span>Custom per-page rates for B&amp;W, Color, Duplex, and Paper Size</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#00B32D]" />
                <span>Automated Razorpay &amp; UPI payment verification</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#00B32D]" />
                <span>Downloadable daily and monthly revenue reports</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 4. /print-agent – EASYTOPRINT WINDOWS DESKTOP PRINT AGENT
// ============================================================================
export const PrintAgentSeoPage: React.FC = () => {
  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar currentLabel="Desktop Print Agent" currentPath="/print-agent" />

      <section className="py-14 sm:py-20 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
            EasyToPrint Agent for Windows 10 &amp; 11
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111111] max-w-4xl leading-tight">
            Automate Printing with EasyToPrint Desktop Print Agent
          </h1>
          <p className="text-base sm:text-lg text-[#646B65] max-w-3xl leading-relaxed">
            Bridge your cloud order queue directly to your physical USB and network printers. The EasyToPrint Agent runs silently on your shop’s Windows PC, detects installed printers, and dispatches paid jobs automatically without opening PDF viewers or print dialogs.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <SpaLink
              href="/auth/register"
              className="px-6 py-3 rounded-xl bg-[#00B32D] hover:bg-[#008F25] text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all inline-flex items-center gap-2"
            >
              <span>Register Shop &amp; Download Agent</span>
              <ArrowRight className="w-4 h-4" />
            </SpaLink>
            <SpaLink
              href="/faq"
              className="px-6 py-3 rounded-xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] text-[#111111] text-sm font-bold transition-all"
            >
              Read Hardware Compatibility FAQ
            </SpaLink>
          </div>
        </div>
      </section>

      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="space-y-3">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">
            Engineered for High-Volume Counter Reliability
          </h2>
          <p className="text-sm sm:text-base text-[#646B65] max-w-3xl">
            Whether you operate a single HP LaserJet P1007 or a bank of Canon, Epson, Brother, Ricoh, and Konica Minolta production machines, EasyToPrint Agent integrates natively with the Windows Win32 Print Spooler.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl border border-[#E1E7E1] bg-white space-y-2">
            <Cpu className="w-6 h-6 text-[#00B32D]" />
            <h3 className="text-base font-bold text-[#111111]">Automatic Printer Capability Detection</h3>
            <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
              Queries Windows printer drivers to detect color support, duplex hardware units, supported paper trays (A4, A3, Legal), and live toner/error states.
            </p>
          </div>
          <div className="p-6 rounded-2xl border border-[#E1E7E1] bg-white space-y-2">
            <Wifi className="w-6 h-6 text-[#00B32D]" />
            <h3 className="text-base font-bold text-[#111111]">Resilient Queue Sync &amp; Crash Recovery</h3>
            <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
              Maintains a persistent, encrypted connection to your EasyToPrint shop account. If internet connectivity flickers or a paper jam occurs, jobs remain safely queued without duplicate charges.
            </p>
          </div>
          <div className="p-6 rounded-2xl border border-[#E1E7E1] bg-white space-y-2">
            <Settings className="w-6 h-6 text-[#00B32D]" />
            <h3 className="text-base font-bold text-[#111111]">Auto-Print or Operator Approval Mode</h3>
            <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
              Run in 100% hands-free Auto-Print mode for standard A4 jobs, or require one-click counter confirmation for specialty paper and binding orders.
            </p>
          </div>
        </div>
      </section>

      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 5. /about – ABOUT EASYTOPRINT
// ============================================================================
export const AboutSeoPage: React.FC = () => {
  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar currentLabel="About EasyToPrint" currentPath="/about" />

      <section className="py-14 sm:py-20 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
            About EasyToPrint
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111111] leading-tight">
            Designed for Xerox and Printing Businesses Across India
          </h1>
          <p className="text-base sm:text-lg text-[#646B65] leading-relaxed">
            EasyToPrint is a dedicated Print Shop Automation SaaS built to modernize how everyday Xerox shops, stationery stores, college reprography centres, and commercial digital printing counters operate.
          </p>
        </div>
      </section>

      <section className="py-16 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="space-y-3">
          <h2 className="text-2xl font-extrabold text-[#111111]">Our Mission: Eliminate Counter Chaos</h2>
          <p className="text-sm sm:text-base text-[#646B65] leading-relaxed">
            Across India, thousands of Xerox and printing businesses lose hours every day to manual file transfers over WhatsApp Web, slow Bluetooth pairing, infected USB pen drives, and manual page counting. EasyToPrint replaces this fragmented workflow with a unified cloud-to-printer pipeline.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-extrabold text-[#111111]">Who Uses EasyToPrint?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                title: 'Xerox & Photocopy Shops',
                desc: 'Automate everyday A4 B&W and color document printing for walk-in customers with instant QR ordering.'
              },
              {
                title: 'College & University Print Centres',
                desc: 'Handle peak student queues for thesis, lab manuals, and assignment PDFs without counter crowding.'
              },
              {
                title: 'Stationery & Cyber Cafes',
                desc: 'Let customers print Aadhaar, resume, and government portal documents quickly without tying up operator PCs.'
              },
              {
                title: 'Commercial Digital Presses',
                desc: 'Centralize multi-printer job routing across laser and inkjet hardware with full revenue reconciliation.'
              }
            ].map((segment, i) => (
              <div key={i} className="p-5 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] space-y-1.5">
                <h3 className="text-base font-bold text-[#111111]">{segment.title}</h3>
                <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">{segment.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 6. /contact – CONTACT PAGE
// ============================================================================
export const ContactSeoPage: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar currentLabel="Contact Us" currentPath="/contact" />

      <section className="py-14 sm:py-20 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-6 space-y-6">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
              Sales &amp; Technical Onboarding
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111111] leading-tight">
              Contact EasyToPrint Support &amp; Onboarding Team
            </h1>
            <p className="text-sm sm:text-base text-[#646B65] leading-relaxed">
              Need help setting up your shop QR standee, configuring multi-printer routing on Windows, or choosing the right plan for your printing business? Reach out to our team.
            </p>

            <div className="space-y-4 pt-2">
              <div className="p-4 rounded-2xl bg-white border border-[#E1E7E1] flex items-start gap-3.5">
                <Mail className="w-5 h-5 text-[#00B32D] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-[#111111]">Email Support &amp; Onboarding</h2>
                  <a href="mailto:support@easytoprint.in" className="text-xs sm:text-sm text-[#008F25] font-semibold hover:underline">
                    support@easytoprint.in
                  </a>
                  <p className="text-xs text-[#646B65] mt-0.5">Responses within 2 business hours (Mon–Sat, 9 AM – 8 PM IST)</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#E1E7E1] flex items-start gap-3.5">
                <Monitor className="w-5 h-5 text-[#00B32D] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-[#111111]">Windows Print Agent Setup Assistance</h2>
                  <p className="text-xs sm:text-sm text-[#646B65] mt-0.5">
                    Our technical engineers assist partner shops with remote printer driver verification and multi-printer queue setup.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="p-6 sm:p-8 rounded-3xl bg-white border border-[#E1E7E1] shadow-sm">
              <h2 className="text-xl font-bold text-[#111111] mb-2">Request a Shop Onboarding Callback</h2>
              <p className="text-xs text-[#646B65] mb-6">
                Fill in your print shop details and our onboarding specialist will reach out to help you get started.
              </p>

              {submitted ? (
                <div className="p-6 rounded-2xl bg-[#E8F8EC] border border-[#A7F3D0] text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-[#00B32D] mx-auto" />
                  <h3 className="text-base font-bold text-[#111111]">Thank You for Contacting EasyToPrint</h3>
                  <p className="text-xs text-[#646B65]">
                    We have received your inquiry. Our onboarding team will contact you shortly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#111111] mb-1">Your Name / Shop Owner Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rajesh Sharma"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E7E1] text-sm focus:outline-hidden focus:border-[#00B32D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#111111] mb-1">Print Shop Name &amp; City</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sri Sai Xerox & Digital Prints, Pune"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E7E1] text-sm focus:outline-hidden focus:border-[#00B32D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#111111] mb-1">Business Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="you@yourprintshop.in"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E7E1] text-sm focus:outline-hidden focus:border-[#00B32D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#111111] mb-1">How Can We Help?</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Tell us how many printers you operate and any questions about EasyToPrint..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E7E1] text-sm focus:outline-hidden focus:border-[#00B32D]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-[#00B32D] hover:bg-[#008F25] text-white text-sm font-bold transition-colors cursor-pointer"
                  >
                    Send Inquiry
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 7. /faq – DEDICATED FAQ PAGE
// ============================================================================
export const FaqSeoPage: React.FC = () => {
  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar currentLabel="FAQ" currentPath="/faq" />

      <section className="py-12 border-b border-[#E1E7E1] bg-[#F7F8F7]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#111111]">
            Frequently Asked Questions About EasyToPrint
          </h1>
          <p className="text-sm sm:text-base text-[#646B65] max-w-2xl mx-auto">
            Find clear answers on QR code print ordering, Windows Print Agent hardware compatibility, multi-printer routing, and instant UPI payments.
          </p>
        </div>
      </section>

      <FaqAccordion />
      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 8. /how-it-works – END-TO-END WORKFLOW GUIDE
// ============================================================================
export const HowItWorksSeoPage: React.FC = () => {
  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar currentLabel="How It Works" currentPath="/how-it-works" />

      <section className="py-14 sm:py-20 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
            End-to-End Online Printing Automation
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111111] max-w-4xl leading-tight">
            How EasyToPrint Automates Customer Orders and Shop Printing
          </h1>
          <p className="text-base sm:text-lg text-[#646B65] max-w-3xl leading-relaxed">
            From the moment a student or walk-in customer scans your counter QR code to the second your Windows printer spits out crisp copies, every step runs cleanly without WhatsApp chats or pen drives.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <SpaLink
              href="/auth/register"
              className="px-6 py-3 rounded-xl bg-[#00B32D] hover:bg-[#008F25] text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all inline-flex items-center gap-2"
            >
              <span>Create Free Shop Account</span>
              <ArrowRight className="w-4 h-4" />
            </SpaLink>
            <SpaLink
              href="/pricing"
              className="px-6 py-3 rounded-xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] text-[#111111] text-sm font-bold transition-all"
            >
              Compare Plans
            </SpaLink>
          </div>
        </div>
      </section>

      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
        <div className="space-y-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">
            Part 1: Customer Self-Service Workflow (Zero App Needed)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                step: '01',
                title: 'Scan Shop Counter QR',
                desc: 'Customer points their smartphone camera at your counter standee QR code or enters your 6-digit shop code.'
              },
              {
                step: '02',
                title: 'Upload PDF or Image',
                desc: 'Customer selects PDF, JPG, or PNG documents from mobile storage. Page count is automatically inspected in seconds.'
              },
              {
                step: '03',
                title: 'Select Print Options & Pay',
                desc: 'Customer chooses B&W or Color, single or double-sided, paper size, and copies, then pays instantly via UPI or card.'
              },
              {
                step: '04',
                title: 'Track Status & Collect',
                desc: 'Customer receives a live order tracking screen (Queued → Printing → Completed) and collects prints at the counter.'
              }
            ].map((item) => (
              <div key={item.step} className="p-6 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] space-y-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-[#00B32D] text-white text-xs font-extrabold">
                  {item.step}
                </span>
                <h3 className="text-base font-bold text-[#111111]">{item.title}</h3>
                <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6 pt-4 border-t border-[#E1E7E1]">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">
            Part 2: Shop Owner &amp; Windows Print Agent Pipeline
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl border border-[#E1E7E1] bg-white space-y-2">
              <Zap className="w-6 h-6 text-[#00B32D]" />
              <h3 className="text-base font-bold text-[#111111]">Payment-Verified Dispatch</h3>
              <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
                Unpaid uploads never trigger physical prints. Only after Razorpay confirms payment via webhook or signature check does the job enter the active queue.
              </p>
            </div>
            <div className="p-6 rounded-2xl border border-[#E1E7E1] bg-white space-y-2">
              <Monitor className="w-6 h-6 text-[#00B32D]" />
              <h3 className="text-base font-bold text-[#111111]">Automatic Win32 Spooling</h3>
              <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
                The EasyToPrint Windows Agent pulls paid jobs securely and dispatches them straight to the matching USB or LAN printer without manual print dialogs.
              </p>
            </div>
            <div className="p-6 rounded-2xl border border-[#E1E7E1] bg-white space-y-2">
              <Shield className="w-6 h-6 text-[#00B32D]" />
              <h3 className="text-base font-bold text-[#111111]">Auto-Purge Document Privacy</h3>
              <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
                Customer documents stay encrypted in transit and are automatically cleaned up according to your shop retention policy after printing finishes.
              </p>
            </div>
          </div>
        </div>
      </section>

      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 9. /blog – EDUCATIONAL GUIDES INDEX
// ============================================================================
export const BlogIndexSeoPage: React.FC = () => {
  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar currentLabel="Blog & Guides" currentPath="/blog" />

      <section className="py-14 sm:py-18 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
            <BookOpen className="w-3.5 h-3.5" />
            <span>EasyToPrint Knowledge Hub</span>
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111111] max-w-4xl leading-tight">
            EasyToPrint Guides for Indian Xerox &amp; Print Shop Owners
          </h1>
          <p className="text-base sm:text-lg text-[#646B65] max-w-3xl leading-relaxed">
            Practical, no-fluff playbooks on replacing WhatsApp Web queues, accepting online UPI print orders, and automating multi-printer counters on Windows.
          </p>
        </div>
      </section>

      <section className="py-14 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {BLOG_POSTS.map((post) => (
            <article
              key={post.slug}
              className="p-6 sm:p-7 rounded-3xl border border-[#E1E7E1] bg-white hover:border-[#00B32D] transition-all flex flex-col justify-between space-y-5 shadow-2xs"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#E8F8EC] text-[#008F25] font-bold">
                    {post.category}
                  </span>
                  <span className="text-[#646B65] flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {post.readTime}
                  </span>
                  <span className="text-[#646B65] flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {post.updatedAt}
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-[#111111] leading-snug">
                  <SpaLink href={`/blog/${post.slug}`} className="hover:text-[#00B32D] transition-colors">
                    {post.title}
                  </SpaLink>
                </h2>
                <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">{post.excerpt}</p>
              </div>
              <div>
                <SpaLink
                  href={`/blog/${post.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#008F25] hover:text-[#00B32D]"
                >
                  <span>Read Full Guide</span>
                  <ArrowRight className="w-4 h-4" />
                </SpaLink>
              </div>
            </article>
          ))}
        </div>
      </section>

      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 10. /blog/:slug – INDIVIDUAL GUIDE ARTICLE PAGE
// ============================================================================
export const BlogPostSeoPage: React.FC<{ slug: string }> = ({ slug }) => {
  const post = getBlogPostBySlug(slug);

  if (!post) {
    return <NotFoundPage />;
  }

  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar
        currentLabel={post.title}
        currentPath={`/blog/${post.slug}`}
        parentLabel="Blog"
        parentPath="/blog"
      />

      <article className="py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <header className="space-y-4 pb-6 border-b border-[#E1E7E1]">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] font-bold">
                {post.category}
              </span>
              <span className="text-[#646B65] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {post.readTime}
              </span>
              <span className="text-[#646B65]">Updated {post.updatedAt}</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-[#111111] leading-tight">
              {post.title}
            </h1>

            <p className="text-base text-[#646B65] leading-relaxed">{post.excerpt}</p>
          </header>

          <div className="space-y-8">
            {post.sections.map((section, idx) => (
              <section key={idx} className="space-y-3">
                <h2 className="text-xl sm:text-2xl font-extrabold text-[#111111]">
                  {section.heading}
                </h2>
                {section.paragraphs.map((para, pIdx) => (
                  <p key={pIdx} className="text-sm sm:text-base text-[#646B65] leading-relaxed">
                    {para}
                  </p>
                ))}
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="space-y-2 pt-1">
                    {section.bullets.map((bullet, bIdx) => (
                      <li key={bIdx} className="flex items-start gap-2.5 text-sm text-[#111111]">
                        <Check className="w-4 h-4 text-[#00B32D] shrink-0 mt-1" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <aside className="p-6 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] space-y-4">
            <h2 className="text-base font-extrabold text-[#111111]">Related EasyToPrint Resources</h2>
            <div className="flex flex-wrap gap-3">
              {post.relatedLinks.map((link) => (
                <SpaLink
                  key={link.href}
                  href={link.href}
                  className="px-4 py-2 rounded-xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] text-xs font-bold text-[#008F25] inline-flex items-center gap-1.5"
                >
                  <span>{link.label}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </SpaLink>
              ))}
            </div>
          </aside>
        </div>
      </article>

      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 11. CUSTOM 404 NOT FOUND PAGE
// ============================================================================
export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] bg-[#F7F8F7] flex items-center justify-center px-4 py-16 font-['Manrope',sans-serif]">
      <div className="max-w-xl w-full bg-white rounded-3xl border border-[#E1E7E1] p-8 sm:p-10 text-center space-y-6 shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center mx-auto">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#008F25]">HTTP 404 — Page Not Found</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">
            We Couldn’t Find That Page
          </h1>
          <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">
            The URL you requested does not exist or may have moved. Use the links below to explore EasyToPrint’s print shop management software and QR ordering solutions.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <SpaLink
            href="/"
            className="px-5 py-2.5 rounded-xl bg-[#00B32D] hover:bg-[#008F25] text-white text-xs sm:text-sm font-bold transition-all inline-flex items-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>Back to Homepage</span>
          </SpaLink>
          <SpaLink
            href="/features"
            className="px-5 py-2.5 rounded-xl bg-[#F7F8F7] hover:bg-[#E1E7E1] text-[#111111] border border-[#E1E7E1] text-xs sm:text-sm font-bold transition-all"
          >
            Explore Features
          </SpaLink>
          <SpaLink
            href="/pricing"
            className="px-5 py-2.5 rounded-xl bg-[#F7F8F7] hover:bg-[#E1E7E1] text-[#111111] border border-[#E1E7E1] text-xs sm:text-sm font-bold transition-all"
          >
            View Pricing
          </SpaLink>
        </div>
      </div>
    </div>
  );
};
