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
  Mail,
  Clock,
  AlertCircle,
  Home,
  CheckCircle2,
  BookOpen,
  Calendar,
  ChevronDown,
  Lock,
  FileCheck2,
  RefreshCcw,
  User
} from 'lucide-react';
import { useApp } from '../../lib/store';
import { FaqAccordion } from '../landing/FaqAccordion';
import { BLOG_POSTS, getBlogPostBySlug } from '../../lib/blogData';
import { FEATURE_LANDING_PAGES, getFeatureLandingPageByPath } from '../../lib/featurePagesData';

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
          <span aria-hidden="true">/</span>
          <SpaLink href={parentPath} className="hover:text-[#00B32D] font-medium transition-colors">
            {parentLabel}
          </SpaLink>
        </>
      )}
      <span aria-hidden="true">/</span>
      <SpaLink href={currentPath} className="text-[#111111] font-bold truncate max-w-xs sm:max-w-md" aria-current="page">
        {currentLabel}
      </SpaLink>
    </div>
  </nav>
);

const OptimizedPicture: React.FC<{
  webpSrc: string;
  fallbackSrc: string;
  alt: string;
  width: number;
  height: number;
  eager?: boolean;
  className?: string;
}> = ({ webpSrc, fallbackSrc, alt, width, height, eager = false, className = '' }) => (
  <picture>
    <source srcSet={webpSrc} type="image/webp" />
    <img
      src={fallbackSrc}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={className}
    />
  </picture>
);

const InternalLinksFooterBlock: React.FC = () => (
  <section className="py-12 bg-[#F7F8F7] border-t border-[#E1E7E1]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
      <h2 className="text-lg font-extrabold text-[#111111]">
        Explore EasyToPrint Solutions for Indian Printing &amp; Xerox Businesses
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURE_LANDING_PAGES.map((item) => (
          <SpaLink
            key={item.path}
            href={item.path}
            className="p-4 rounded-2xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] transition-all group block"
          >
            <h3 className="text-sm font-bold text-[#111111] group-hover:text-[#00B32D] flex items-center justify-between gap-2">
              <span>{item.breadcrumbLabel}</span>
              <ArrowRight className="w-4 h-4 text-[#00B32D] shrink-0" />
            </h3>
            <p className="text-xs text-[#646B65] mt-1 line-clamp-2">{item.description}</p>
          </SpaLink>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-bold text-[#008F25]">
        <SpaLink href="/how-it-works" className="hover:text-[#00B32D] underline underline-offset-4">
          See End-to-End Printing Workflow
        </SpaLink>
        <span aria-hidden="true" className="text-[#CBD5E1]">•</span>
        <SpaLink href="/pricing" className="hover:text-[#00B32D] underline underline-offset-4">
          Compare Print Shop Plans in INR
        </SpaLink>
        <span aria-hidden="true" className="text-[#CBD5E1]">•</span>
        <SpaLink href="/blog" className="hover:text-[#00B32D] underline underline-offset-4">
          Read 10 Xerox &amp; Print Shop Guides
        </SpaLink>
        <span aria-hidden="true" className="text-[#CBD5E1]">•</span>
        <SpaLink href="/faq" className="hover:text-[#00B32D] underline underline-offset-4">
          Hardware &amp; Payment FAQs
        </SpaLink>
      </div>
    </div>
  </section>
);

// ============================================================================
// 0. REUSABLE SEO LANDING PAGE FOR ALL 6 CANONICAL FEATURE ROUTES
// ============================================================================
export const FeatureLandingSeoPage: React.FC<{ path: string }> = ({ path }) => {
  const page = getFeatureLandingPageByPath(path);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  if (!page) {
    return <NotFoundPage />;
  }

  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar
        currentLabel={page.breadcrumbLabel}
        currentPath={page.path}
        parentLabel="Features"
        parentPath="/features"
      />

      {/* Hero Section */}
      <section className="py-12 sm:py-18 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-5">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
              {page.badge}
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight text-[#111111] leading-tight">
              {page.h1}
            </h1>
            <p className="text-base sm:text-lg text-[#646B65] leading-relaxed">
              {page.heroSubtitle}
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <SpaLink
                href="/auth/register"
                className="px-6 py-3 rounded-xl bg-[#00B32D] hover:bg-[#008F25] text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all inline-flex items-center gap-2"
              >
                <span>{page.ctaLabel}</span>
                <ArrowRight className="w-4 h-4" />
              </SpaLink>
              <SpaLink
                href={page.secondaryCtaHref}
                className="px-6 py-3 rounded-xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] text-[#111111] text-sm font-bold transition-all"
              >
                {page.secondaryCtaLabel}
              </SpaLink>
            </div>
          </div>

          <div className="lg:col-span-6">
            <figure className="rounded-3xl border border-[#E1E7E1] bg-white overflow-hidden shadow-lg">
              <OptimizedPicture
                webpSrc={page.imageWebp}
                fallbackSrc={page.imageJpg}
                alt={page.imageAlt}
                width={page.imageWidth}
                height={page.imageHeight}
                eager
                className="w-full h-auto block object-cover"
              />
              <figcaption className="px-5 py-3 text-xs text-[#646B65] bg-[#F7F8F7] border-t border-[#E1E7E1]">
                {page.imageCaption}
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-14 sm:py-16 border-b border-[#E1E7E1] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#008F25]">
              Operational Bottlenecks Solved
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111111] leading-tight">
              {page.problemTitle}
            </h2>
            <p className="text-sm sm:text-base text-[#646B65] leading-relaxed">{page.problemIntro}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {page.problemPoints.map((pt, idx) => (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] space-y-2.5"
              >
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-[#E1E7E1] text-xs font-extrabold text-[#111111]">
                  0{idx + 1}
                </span>
                <h3 className="text-base font-bold text-[#111111]">{pt.title}</h3>
                <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">{pt.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-14 sm:py-16 border-b border-[#E1E7E1] bg-[#F7F8F7]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#008F25]">
              How EasyToPrint Works for Your Shop
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111111] leading-tight">
              {page.solutionTitle}
            </h2>
            <p className="text-sm sm:text-base text-[#646B65] leading-relaxed">{page.solutionIntro}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {page.solutionPillars.map((pillar, idx) => (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-white border border-[#E1E7E1] hover:border-[#00B32D] transition-colors space-y-2.5 shadow-2xs"
              >
                <div className="w-9 h-9 rounded-xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[#111111]">{pillar.title}</h3>
                <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">{pillar.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4-Step Workflow */}
      <section className="py-14 sm:py-16 border-b border-[#E1E7E1] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="max-w-3xl space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#008F25]">
              Step-by-Step Workflow
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111111] leading-tight">
              {page.workflowTitle}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {page.workflowSteps.map((ws) => (
              <div
                key={ws.step}
                className="p-6 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] space-y-3"
              >
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-[#00B32D] text-white text-xs font-extrabold">
                  {ws.step}
                </span>
                <h3 className="text-base font-bold text-[#111111]">{ws.title}</h3>
                <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">{ws.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Benefits Checklist */}
      <section className="py-14 sm:py-16 border-b border-[#E1E7E1] bg-[#F7F8F7]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">{page.benefitsTitle}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {page.benefits.map((benefit, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-white border border-[#E1E7E1] flex items-start gap-3"
              >
                <div className="w-6 h-6 rounded-full bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
                <p className="text-xs sm:text-sm font-medium text-[#111111] leading-relaxed">{benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Page-Specific FAQ Accordion (matches FAQPage JSON-LD 1:1) */}
      <section className="py-14 sm:py-16 border-b border-[#E1E7E1] bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="space-y-2 text-center">
            <span className="text-xs font-bold text-[#008F25] bg-[#E8F8EC] px-3 py-1 rounded-full border border-[#A7F3D0]">
              Common Questions
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">
              Frequently Asked Questions About {page.breadcrumbLabel}
            </h2>
          </div>

          <div className="space-y-3">
            {page.faqs.map((faq, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-[#E1E7E1] bg-[#F7F8F7]/60 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <h3 className="text-sm sm:text-base font-bold text-[#111111]">{faq.question}</h3>
                    <ChevronDown
                      className={`w-4 h-4 text-[#00B32D] shrink-0 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-xs sm:text-sm text-[#646B65] leading-relaxed border-t border-[#E1E7E1]/70 pt-3 bg-white">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contextual Related Resources & CTA */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#111111]">
              Related EasyToPrint Guides &amp; Modules
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {page.relatedLinks.map((rl) => (
                <SpaLink
                  key={rl.href}
                  href={rl.href}
                  className="p-5 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] hover:border-[#00B32D] transition-all group block space-y-2"
                >
                  <h3 className="text-sm font-bold text-[#111111] group-hover:text-[#00B32D] flex items-center justify-between gap-2">
                    <span>{rl.label}</span>
                    <ArrowRight className="w-4 h-4 text-[#00B32D] shrink-0" />
                  </h3>
                  <p className="text-xs text-[#646B65] leading-relaxed">{rl.description}</p>
                </SpaLink>
              ))}
            </div>
          </div>

          <div className="p-8 sm:p-10 rounded-3xl bg-[#E8F8EC] border border-[#A7F3D0] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-2xl font-extrabold text-[#111111]">
                Ready to Automate Your Print Counter with EasyToPrint?
              </h2>
              <p className="text-sm text-[#374151]">
                Create your shop account, pair the Windows Print Agent, and print your counter QR standee in under 10 minutes with a 7-day Starter free trial.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <SpaLink
                href="/auth/register"
                className="px-6 py-3 rounded-xl bg-[#00B32D] hover:bg-[#008F25] text-white text-sm font-bold shadow-sm inline-flex items-center gap-2"
              >
                <span>Start 7-Day Free Trial</span>
                <ArrowRight className="w-4 h-4" />
              </SpaLink>
              <SpaLink
                href="/contact"
                className="px-5 py-3 rounded-xl bg-white border border-[#A7F3D0] hover:border-[#008F25] text-[#111111] text-sm font-bold"
              >
                Talk to Onboarding
              </SpaLink>
            </div>
          </div>
        </div>
      </section>

      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 1. /features – FEATURES OVERVIEW PAGE
// ============================================================================
export const FeaturesSeoPage: React.FC = () => {
  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar currentLabel="Features" currentPath="/features" />

      <section className="py-14 sm:py-20 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
              Complete Print Shop Automation Platform
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111111] leading-tight">
              Everything Your Print Shop Needs in One Platform
            </h1>
            <p className="text-base sm:text-lg text-[#646B65] leading-relaxed">
              EasyToPrint combines QR-based customer document uploads, live WYSIWYG print previews, automatic page and color calculation, instant UPI checkout, and automated Windows desktop printing for Xerox and printing businesses across India.
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
          <div className="lg:col-span-5">
            <div className="rounded-3xl border border-[#E1E7E1] overflow-hidden bg-white shadow-md">
              <OptimizedPicture
                webpSrc="/assets/optimized/ecosystem-print-automation.webp"
                fallbackSrc="/assets/optimized/ecosystem-print-automation.jpg"
                alt="EasyToPrint connected printing ecosystem linking smartphones, cloud queue, and Windows printers"
                width={960}
                height={640}
                eager
                className="w-full h-auto block object-cover"
              />
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
              title: 'QR Code Printing Orders',
              desc: 'Each print shop receives a unique counter standee QR code. Walk-in customers scan with any smartphone camera and upload documents directly from Chrome or Safari without installing an app.',
              link: '/qr-code-printing-orders',
              linkText: 'Explore QR code printing orders'
            },
            {
              icon: FileText,
              title: 'Online Print Order Management',
              desc: 'Our document parser inspects uploaded PDF files in real time, shows an accurate print preview, counts total pages, and computes exact charges based on your shop’s B&W, color, single-sided, or duplex rates.',
              link: '/online-print-order-management',
              linkText: 'Explore online print order management'
            },
            {
              icon: CreditCard,
              title: 'Print Shop Management Software',
              desc: 'Manage custom per-page rate cards, verified UPI checkout via Razorpay, pickup tokens, and clean daily revenue logs from a single web dashboard.',
              link: '/print-shop-management-software',
              linkText: 'Explore print shop management software'
            },
            {
              icon: Printer,
              title: 'Xerox Shop Management Software',
              desc: 'Built specifically for Indian photocopy shops, college reprography counters, and court print stalls handling high-volume A4 and Legal document queues.',
              link: '/xerox-shop-management-software',
              linkText: 'Explore Xerox shop management software'
            },
            {
              icon: Layers,
              title: 'Print Job Automation & Smart Routing',
              desc: 'Connect high-speed monochrome laser printers and color inkjets simultaneously. EasyToPrint routes monochrome jobs to laser printers and color jobs to photo printers automatically.',
              link: '/print-job-automation',
              linkText: 'Explore print job automation'
            },
            {
              icon: Monitor,
              title: 'Windows Print Agent Software',
              desc: 'Lightweight native Windows application that pairs with your cloud dashboard, encrypts credentials with Windows DPAPI, and dispatches paid jobs directly to the Win32 Print Spooler.',
              link: '/print-agent-software',
              linkText: 'Explore Windows Print Agent software'
            }
          ].map((item, idx) => (
            <div
              key={idx}
              className="p-6 rounded-2xl border border-[#E1E7E1] bg-white hover:border-[#00B32D] transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="w-11 h-11 rounded-xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center">
                  <item.icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-[#111111]">{item.title}</h3>
                <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">{item.desc}</p>
              </div>
              <SpaLink
                href={item.link}
                className="text-xs font-bold text-[#008F25] hover:text-[#00B32D] inline-flex items-center gap-1"
              >
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
// 2. /about – ABOUT EASYTOPRINT
// ============================================================================
export const AboutSeoPage: React.FC = () => {
  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar currentLabel="About EasyToPrint" currentPath="/about" />

      <section className="py-14 sm:py-20 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
              About EasyToPrint
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111111] leading-tight">
              Designed for Xerox and Printing Businesses Across India
            </h1>
            <p className="text-base sm:text-lg text-[#646B65] leading-relaxed">
              EasyToPrint is a dedicated Print Shop Management Software platform built to modernize how everyday Xerox shops, stationery stores, college reprography centres, and commercial digital printing counters operate.
            </p>
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-3xl border border-[#E1E7E1] overflow-hidden bg-white shadow-md">
              <OptimizedPicture
                webpSrc="/assets/optimized/cta-print-shop-owner.webp"
                fallbackSrc="/assets/optimized/cta-print-shop-owner.jpg"
                alt="Print shop owner managing digital print orders with EasyToPrint"
                width={960}
                height={640}
                eager
                className="w-full h-auto block object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="space-y-3">
          <h2 className="text-2xl font-extrabold text-[#111111]">Our Mission: Eliminate Counter Chaos</h2>
          <p className="text-sm sm:text-base text-[#646B65] leading-relaxed">
            Across India, local Xerox and printing businesses lose hours every day to manual file transfers over WhatsApp Web, slow Bluetooth pairing, virus-prone USB pen drives, and manual page counting. EasyToPrint replaces this fragmented workflow with a unified cloud-to-printer pipeline so operators can serve more customers accurately with less stress.
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
                desc: 'Centralize multi-printer job routing across laser and inkjet hardware with full UPI revenue reconciliation.'
              }
            ].map((segment, i) => (
              <div key={i} className="p-5 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] space-y-1.5">
                <h3 className="text-base font-bold text-[#111111]">{segment.title}</h3>
                <p className="text-xs sm:text-sm text-[#646B65] leading-relaxed">{segment.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-[#E1E7E1]">
          <h2 className="text-2xl font-extrabold text-[#111111]">Security, Privacy &amp; Transparency</h2>
          <p className="text-sm sm:text-base text-[#646B65] leading-relaxed">
            Customer documents often include exam admit cards, PAN cards, legal affidavits, and financial forms. EasyToPrint transfers files over HTTPS/TLS, stores temporary print payloads in private storage buckets, purges completed documents automatically, and protects Windows Agent tokens via Windows DPAPI encryption.
          </p>
          <div className="flex flex-wrap gap-3 pt-1 text-xs font-bold">
            <SpaLink
              href="/privacy"
              className="px-4 py-2 rounded-xl bg-[#F7F8F7] border border-[#E1E7E1] hover:border-[#00B32D] text-[#008F25]"
            >
              Read Privacy Policy
            </SpaLink>
            <SpaLink
              href="/terms"
              className="px-4 py-2 rounded-xl bg-[#F7F8F7] border border-[#E1E7E1] hover:border-[#00B32D] text-[#008F25]"
            >
              Read Terms of Service
            </SpaLink>
            <SpaLink
              href="/refund-policy"
              className="px-4 py-2 rounded-xl bg-[#F7F8F7] border border-[#E1E7E1] hover:border-[#00B32D] text-[#008F25]"
            >
              Read Refund Policy
            </SpaLink>
          </div>
        </div>
      </section>

      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 3. /contact – CONTACT PAGE
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
              Need help setting up your shop QR standee, configuring multi-printer routing on Windows, or choosing the right plan for your printing business? Reach out to our onboarding team.
            </p>

            <div className="space-y-4 pt-2">
              <div className="p-4 rounded-2xl bg-white border border-[#E1E7E1] flex items-start gap-3.5">
                <Mail className="w-5 h-5 text-[#00B32D] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-[#111111]">Email Support &amp; Onboarding</h2>
                  <a
                    href="mailto:support@easytoprint.in"
                    className="text-xs sm:text-sm text-[#008F25] font-semibold hover:underline"
                  >
                    support@easytoprint.in
                  </a>
                  <p className="text-xs text-[#646B65] mt-0.5">
                    Mon–Sat, 9 AM – 8 PM IST for shop onboarding, billing, and printer setup queries.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#E1E7E1] flex items-start gap-3.5">
                <Monitor className="w-5 h-5 text-[#00B32D] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-[#111111]">Windows Print Agent Setup Assistance</h2>
                  <p className="text-xs sm:text-sm text-[#646B65] mt-0.5">
                    Our technical team assists partner shops with printer driver verification, capability detection, and multi-printer queue setup on Windows 10 and Windows 11.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] space-y-2">
                <h2 className="text-sm font-bold text-[#111111]">Helpful Policies &amp; Quick Answers</h2>
                <div className="flex flex-wrap gap-3 text-xs font-semibold text-[#008F25]">
                  <SpaLink href="/faq" className="hover:underline">
                    Read FAQs
                  </SpaLink>
                  <SpaLink href="/privacy" className="hover:underline">
                    Privacy Policy
                  </SpaLink>
                  <SpaLink href="/terms" className="hover:underline">
                    Terms of Service
                  </SpaLink>
                  <SpaLink href="/refund-policy" className="hover:underline">
                    Refund Policy
                  </SpaLink>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="p-6 sm:p-8 rounded-3xl bg-white border border-[#E1E7E1] shadow-sm">
              <h2 className="text-xl font-bold text-[#111111] mb-2">Request a Shop Onboarding Callback</h2>
              <p className="text-xs text-[#646B65] mb-6">
                Fill in your print shop details and our onboarding team will reply via email to help you get started.
              </p>

              {submitted ? (
                <div className="p-6 rounded-2xl bg-[#E8F8EC] border border-[#A7F3D0] text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-[#00B32D] mx-auto" />
                  <h3 className="text-base font-bold text-[#111111]">Thank You for Contacting EasyToPrint</h3>
                  <p className="text-xs text-[#646B65]">
                    We have noted your inquiry. You can also write directly to support@easytoprint.in for immediate assistance.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="contact-owner" className="block text-xs font-bold text-[#111111] mb-1">
                      Your Name / Shop Owner Name
                    </label>
                    <input
                      id="contact-owner"
                      type="text"
                      required
                      placeholder="e.g. Rajesh Sharma"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E7E1] text-sm focus:outline-hidden focus:border-[#00B32D]"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-shop" className="block text-xs font-bold text-[#111111] mb-1">
                      Print Shop Name &amp; City
                    </label>
                    <input
                      id="contact-shop"
                      type="text"
                      required
                      placeholder="e.g. Sri Sai Xerox & Digital Prints, Pune"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E7E1] text-sm focus:outline-hidden focus:border-[#00B32D]"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-xs font-bold text-[#111111] mb-1">
                      Business Email Address
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      placeholder="you@yourprintshop.in"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E1E7E1] text-sm focus:outline-hidden focus:border-[#00B32D]"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-message" className="block text-xs font-bold text-[#111111] mb-1">
                      How Can We Help?
                    </label>
                    <textarea
                      id="contact-message"
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
// 4. /faq – DEDICATED FAQ PAGE
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
// 5. /how-it-works – END-TO-END WORKFLOW GUIDE
// ============================================================================
export const HowItWorksSeoPage: React.FC = () => {
  return (
    <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
      <BreadcrumbBar currentLabel="How It Works" currentPath="/how-it-works" />

      <section className="py-14 sm:py-20 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
              End-to-End Online Printing Automation
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111111] leading-tight">
              How EasyToPrint Automates Customer Orders and Shop Printing
            </h1>
            <p className="text-base sm:text-lg text-[#646B65] leading-relaxed">
              From the moment a student or walk-in customer scans your counter QR code to the second your Windows printer produces crisp copies, every step runs cleanly without WhatsApp chats or pen drives.
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

          <div className="lg:col-span-6">
            <div className="rounded-3xl border border-[#E1E7E1] overflow-hidden bg-white shadow-lg">
              <OptimizedPicture
                webpSrc="/assets/optimized/seo-qr-ordering-flow.webp"
                fallbackSrc="/assets/optimized/seo-qr-ordering-flow.jpg"
                alt="QR code print ordering workflow from smartphone scan and UPI payment to automatic Windows printing"
                width={960}
                height={540}
                eager
                className="w-full h-auto block object-cover"
              />
            </div>
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
                desc: 'Customer points their smartphone camera at your counter standee QR code or enters your shop code.'
              },
              {
                step: '02',
                title: 'Upload PDF or Image',
                desc: 'Customer selects PDF, JPG, or PNG documents from mobile storage. Page count is automatically inspected in seconds.'
              },
              {
                step: '03',
                title: 'Select Print Options & Pay',
                desc: 'Customer previews Portrait/Landscape and B&W/Color output, sets copies and duplex, and pays instantly via UPI.'
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
                The <SpaLink href="/print-agent-software" className="text-[#008F25] font-semibold hover:underline">EasyToPrint Windows Agent</SpaLink> pulls paid jobs securely and dispatches them straight to the matching USB or LAN printer without manual print dialogs.
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
// 6. /blog – EDUCATIONAL GUIDES INDEX (10 SEO ARTICLES + CATEGORY FILTER)
// ============================================================================
export const BlogIndexSeoPage: React.FC = () => {
  const categories = ['All Guides', ...Array.from(new Set(BLOG_POSTS.map((p) => p.category)))];
  const [selectedCategory, setSelectedCategory] = useState<string>('All Guides');

  const visiblePosts =
    selectedCategory === 'All Guides'
      ? BLOG_POSTS
      : BLOG_POSTS.filter((p) => p.category === selectedCategory);

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
            Practical, experience-backed guides on print shop management software, QR code printing orders, online UPI checkout, and multi-printer Windows automation.
          </p>

          {/* Category Filter Bar */}
          <div className="pt-3 flex flex-wrap gap-2" role="tablist" aria-label="Filter articles by category">
            {categories.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer border ${
                    active
                      ? 'bg-[#00B32D] text-white border-[#00B32D]'
                      : 'bg-white text-[#646B65] border-[#E1E7E1] hover:border-[#00B32D] hover:text-[#111111]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-14 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
          {visiblePosts.map((post) => (
            <article
              key={post.slug}
              className="rounded-3xl border border-[#E1E7E1] bg-white hover:border-[#00B32D] transition-all flex flex-col justify-between overflow-hidden shadow-2xs group"
            >
              <div>
                <SpaLink href={`/blog/${post.slug}`} className="block overflow-hidden border-b border-[#E1E7E1] bg-[#F7F8F7]">
                  <OptimizedPicture
                    webpSrc={post.imageWebp}
                    fallbackSrc={post.imageJpg}
                    alt={post.imageAlt}
                    width={post.imageWidth}
                    height={post.imageHeight}
                    className="w-full h-48 sm:h-52 object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                </SpaLink>

                <div className="p-6 space-y-3">
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
              </div>

              <div className="px-6 pb-6 pt-1">
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
// 7. /blog/:slug – INDIVIDUAL GUIDE ARTICLE PAGE (WITH H2/H3 & WEBP HERO)
// ============================================================================
export const BlogPostSeoPage: React.FC<{ slug: string }> = ({ slug }) => {
  const post = getBlogPostBySlug(slug);

  if (!post) {
    return <NotFoundPage />;
  }

  const otherGuides = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);

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
              <span className="text-[#646B65] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Updated {post.updatedAt}
              </span>
              <span className="text-[#646B65] flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {post.author}
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-[#111111] leading-tight">
              {post.title}
            </h1>

            <p className="text-base text-[#646B65] leading-relaxed">{post.excerpt}</p>

            <figure className="pt-2 rounded-2xl overflow-hidden border border-[#E1E7E1] bg-[#F7F8F7]">
              <OptimizedPicture
                webpSrc={post.imageWebp}
                fallbackSrc={post.imageJpg}
                alt={post.imageAlt}
                width={post.imageWidth}
                height={post.imageHeight}
                eager
                className="w-full h-auto block object-cover"
              />
            </figure>
          </header>

          <div className="space-y-10">
            {post.sections.map((section, idx) => (
              <section key={idx} className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-extrabold text-[#111111] leading-snug">
                  {section.heading}
                </h2>
                {section.paragraphs.map((para, pIdx) => (
                  <p key={pIdx} className="text-sm sm:text-base text-[#4B5563] leading-relaxed">
                    {para}
                  </p>
                ))}
                {section.subsections && section.subsections.length > 0 && (
                  <div className="space-y-5 pt-2">
                    {section.subsections.map((sub, sIdx) => (
                      <div
                        key={sIdx}
                        className="p-5 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] space-y-2"
                      >
                        <h3 className="text-base sm:text-lg font-bold text-[#111111]">
                          {sub.subheading}
                        </h3>
                        {sub.paragraphs.map((subP, spIdx) => (
                          <p key={spIdx} className="text-xs sm:text-sm text-[#4B5563] leading-relaxed">
                            {subP}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="space-y-2.5 pt-1">
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

          <aside className="p-6 rounded-2xl bg-[#E8F8EC] border border-[#A7F3D0] space-y-4">
            <h2 className="text-base font-extrabold text-[#111111]">Related EasyToPrint Modules &amp; Links</h2>
            <div className="flex flex-wrap gap-3">
              {post.relatedLinks.map((link) => (
                <SpaLink
                  key={link.href}
                  href={link.href}
                  className="px-4 py-2 rounded-xl bg-white border border-[#A7F3D0] hover:border-[#008F25] text-xs font-bold text-[#008F25] inline-flex items-center gap-1.5"
                >
                  <span>{link.label}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </SpaLink>
              ))}
            </div>
          </aside>

          <section className="pt-6 border-t border-[#E1E7E1] space-y-4">
            <h2 className="text-lg font-extrabold text-[#111111]">More Print Shop Automation Guides</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {otherGuides.map((g) => (
                <SpaLink
                  key={g.slug}
                  href={`/blog/${g.slug}`}
                  className="p-4 rounded-2xl bg-[#F7F8F7] border border-[#E1E7E1] hover:border-[#00B32D] transition-colors block space-y-1.5"
                >
                  <span className="text-[11px] font-bold text-[#008F25]">{g.category}</span>
                  <h3 className="text-sm font-bold text-[#111111] leading-snug line-clamp-2">{g.title}</h3>
                </SpaLink>
              ))}
            </div>
          </section>
        </div>
      </article>

      <InternalLinksFooterBlock />
    </div>
  );
};

// ============================================================================
// 8. /privacy – CRAWLABLE PRIVACY POLICY PAGE
// ============================================================================
export const PrivacyPolicySeoPage: React.FC = () => (
  <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
    <BreadcrumbBar currentLabel="Privacy Policy" currentPath="/privacy" />

    <section className="py-14 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
          <Lock className="w-3.5 h-3.5" />
          <span>Data Protection &amp; Document Privacy</span>
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#111111]">
          Privacy Policy &amp; Customer Document Protection
        </h1>
        <p className="text-sm sm:text-base text-[#646B65]">
          Last updated: April 2026. This policy explains how EasyToPrint handles customer print files, shop owner account information, and payment metadata across our web application and Windows Print Agent.
        </p>
      </div>
    </section>

    <section className="py-12 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-sm sm:text-base text-[#4B5563] leading-relaxed">
      <div className="space-y-2.5">
        <h2 className="text-xl font-extrabold text-[#111111]">1. Customer Document Uploads &amp; Temporary Storage</h2>
        <p>
          When a walk-in customer scans a shop QR code and uploads a PDF or image file for printing, the document is transmitted over encrypted HTTPS/TLS connections and stored temporarily inside a private storage bucket (<code>print-documents</code>) accessible only through authenticated server-signed URLs.
        </p>
        <p>
          Customer files are never made publicly indexable, never sold, and never used for advertising. Completed print job files are scheduled for automatic post-print cleanup according to platform retention rules to minimize exposure of sensitive documents such as identity proofs, resumes, and legal forms.
        </p>
      </div>

      <div className="space-y-2.5">
        <h2 className="text-xl font-extrabold text-[#111111]">2. Shop Owner Account &amp; Desktop Agent Security</h2>
        <p>
          Shop owner registration stores business profile details (shop name, email, rate card configuration, and registered printer capabilities) required to operate your print counter console. On Windows 10 and Windows 11 shop PCs, the EasyToPrint Desktop Print Agent encrypts authentication credentials locally using Windows DPAPI safe storage.
        </p>
      </div>

      <div className="space-y-2.5">
        <h2 className="text-xl font-extrabold text-[#111111]">3. Payment Information Handling</h2>
        <p>
          Online UPI, card, and subscription payments are processed through Razorpay. EasyToPrint does not store raw UPI PINs, CVV numbers, or full credit/debit card numbers on its servers; only transaction references, order IDs, and payment verification status are stored for order dispatch and shop reconciliation.
        </p>
      </div>

      <div className="space-y-2.5">
        <h2 className="text-xl font-extrabold text-[#111111]">4. Privacy Inquiries &amp; Data Deletion Requests</h2>
        <p>
          If you are a customer or shop owner with questions regarding document cleanup, account deletion, or data handling, email us at{' '}
          <a href="mailto:support@easytoprint.in" className="text-[#008F25] font-bold hover:underline">
            support@easytoprint.in
          </a>{' '}
          or visit our{' '}
          <SpaLink href="/contact" className="text-[#008F25] font-bold hover:underline">
            Contact Us page
          </SpaLink>.
        </p>
      </div>
    </section>

    <InternalLinksFooterBlock />
  </div>
);

// ============================================================================
// 9. /terms – CRAWLABLE TERMS OF SERVICE PAGE
// ============================================================================
export const TermsSeoPage: React.FC = () => (
  <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
    <BreadcrumbBar currentLabel="Terms of Service" currentPath="/terms" />

    <section className="py-14 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
          <FileCheck2 className="w-3.5 h-3.5" />
          <span>Service Agreement</span>
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#111111]">EasyToPrint Terms of Service</h1>
        <p className="text-sm sm:text-base text-[#646B65]">
          Last updated: April 2026. These terms govern use of the EasyToPrint cloud dashboard, customer QR ordering portal, and EasyToPrint Windows Desktop Print Agent.
        </p>
      </div>
    </section>

    <section className="py-12 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-sm sm:text-base text-[#4B5563] leading-relaxed">
      <div className="space-y-2.5">
        <h2 className="text-xl font-extrabold text-[#111111]">1. Platform Scope</h2>
        <p>
          EasyToPrint provides SaaS tools enabling independent printing shops and Xerox businesses to accept QR-based print orders, calculate per-page charges, verify online payments, and dispatch jobs to local Windows printers. Each participating print shop is independently responsible for physical paper quality, hardware maintenance, and handing over completed printouts to walk-in customers.
        </p>
      </div>

      <div className="space-y-2.5">
        <h2 className="text-xl font-extrabold text-[#111111]">2. Subscription Plans &amp; Fair Quotas</h2>
        <p>
          Shop accounts operate under the printer connection and monthly job limits specified on the{' '}
          <SpaLink href="/pricing" className="text-[#008F25] font-bold hover:underline">
            EasyToPrint Pricing page
          </SpaLink>
          . Attempting to bypass quota controls, reverse engineer authentication tokens, or upload malicious executables is prohibited.
        </p>
      </div>

      <div className="space-y-2.5">
        <h2 className="text-xl font-extrabold text-[#111111]">3. Acceptable Document Uploads</h2>
        <p>
          Customers are solely responsible for ensuring they hold the legal right to print uploaded documents and that files do not violate applicable Indian copyright or privacy laws.
        </p>
      </div>

      <div className="space-y-2.5">
        <h2 className="text-xl font-extrabold text-[#111111]">4. Support &amp; Policy Updates</h2>
        <p>
          For account or compliance inquiries, reach our support team at{' '}
          <a href="mailto:support@easytoprint.in" className="text-[#008F25] font-bold hover:underline">
            support@easytoprint.in
          </a>
          . Related policies:{' '}
          <SpaLink href="/privacy" className="text-[#008F25] font-bold hover:underline">
            Privacy Policy
          </SpaLink>{' '}
          and{' '}
          <SpaLink href="/refund-policy" className="text-[#008F25] font-bold hover:underline">
            Refund Policy
          </SpaLink>
          .
        </p>
      </div>
    </section>

    <InternalLinksFooterBlock />
  </div>
);

// ============================================================================
// 10. /refund-policy – CRAWLABLE REFUND & CANCELLATION POLICY PAGE
// ============================================================================
export const RefundPolicySeoPage: React.FC = () => (
  <div className="bg-white text-[#111111] font-['Manrope',sans-serif]">
    <BreadcrumbBar currentLabel="Refund Policy" currentPath="/refund-policy" />

    <section className="py-14 border-b border-[#E1E7E1] bg-linear-to-b from-[#F7F8F7] to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F8EC] border border-[#A7F3D0] text-[#008F25] text-xs font-bold">
          <RefreshCcw className="w-3.5 h-3.5" />
          <span>Billing &amp; Refund Clarity</span>
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#111111]">Refund &amp; Cancellation Policy</h1>
        <p className="text-sm sm:text-base text-[#646B65]">
          Last updated: April 2026. Transparent cancellation and refund rules for EasyToPrint shop subscriptions and customer print orders.
        </p>
      </div>
    </section>

    <section className="py-12 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 text-sm sm:text-base text-[#4B5563] leading-relaxed">
      <div className="space-y-2.5">
        <h2 className="text-xl font-extrabold text-[#111111]">1. Shop Owner SaaS Subscriptions &amp; Free Trial</h2>
        <p>
          New shops can test the full QR ordering and Windows Print Agent workflow using the 7-day Starter free trial before committing to a paid monthly or yearly plan. You may cancel renewal at any time from your Shop Console before the next billing cycle.
        </p>
        <p>
          If a newly subscribed shop encounters an unresolvable Windows printer compatibility issue within 7 days of initial paid onboarding, contact{' '}
          <a href="mailto:support@easytoprint.in" className="text-[#008F25] font-bold hover:underline">
            support@easytoprint.in
          </a>{' '}
          with your shop email and payment reference for onboarding resolution or a refund review.
        </p>
      </div>

      <div className="space-y-2.5">
        <h2 className="text-xl font-extrabold text-[#111111]">2. Walk-In Customer Print Orders</h2>
        <p>
          Because print jobs enter the physical printer queue immediately upon UPI payment confirmation, completed printouts are non-refundable. If a paper jam, empty toner cartridge, or printer hardware issue interrupts a paid print job, the shop operator can trigger an instant reprint from the Shop Console at no extra charge to the customer or settle a counter refund directly.
        </p>
      </div>

      <div className="space-y-2.5">
        <h2 className="text-xl font-extrabold text-[#111111]">3. Failed or Duplicate Gateway Debits</h2>
        <p>
          If a UPI payment is debited from a customer’s bank account without generating a confirmed print order due to network interruption, Razorpay’s standard banking auto-reversal timeline applies (typically 3–5 business days). For help tracing a transaction ID, write to{' '}
          <a href="mailto:support@easytoprint.in" className="text-[#008F25] font-bold hover:underline">
            support@easytoprint.in
          </a>
          .
        </p>
      </div>
    </section>

    <InternalLinksFooterBlock />
  </div>
);

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
            href="/print-shop-management-software"
            className="px-5 py-2.5 rounded-xl bg-[#F7F8F7] hover:bg-[#E1E7E1] text-[#111111] border border-[#E1E7E1] text-xs sm:text-sm font-bold transition-all"
          >
            Print Shop Software
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
