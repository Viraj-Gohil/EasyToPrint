import { ADMIN_BASE_PATH } from './adminConfig.js';
import { BLOG_POSTS, BlogPost, getBlogPostBySlug } from './blogData.js';

export const CANONICAL_DOMAIN = 'https://easytoprint.devpixel.space';
export const OG_IMAGE_URL = `${CANONICAL_DOMAIN}/assets/easytoprint-og-card.png`;
export const LOGO_IMAGE_URL = `${CANONICAL_DOMAIN}/assets/easytoprint-logo.png`;

export interface RouteSeoMetadata {
  path: string;
  title: string;
  description: string;
  canonical: string;
  robots: 'index, follow' | 'noindex, nofollow';
  ogType?: 'website' | 'article';
  h1?: string;
  breadcrumbs?: Array<{ name: string; url: string }>;
  includeSoftwareSchema?: boolean;
  includePricingOffers?: boolean;
  includeFaqSchema?: boolean;
  articleMeta?: {
    headline: string;
    datePublished: string;
    dateModified: string;
    author: string;
    section: string;
  };
  ssrSummary?: string;
  ssrBullets?: string[];
  lastmod?: string;
  changefreq?: 'daily' | 'weekly' | 'monthly';
  priority?: string;
}

const CORE_PUBLIC_ROUTES: Record<string, RouteSeoMetadata> = {
  '/': {
    path: '/',
    title: 'EasyToPrint – Print Shop Management & Automation Software',
    description:
      'Simplify your Xerox and printing business in India with EasyToPrint. Automate QR code print ordering, PDF uploads, UPI payments, and Windows desktop printing.',
    canonical: `${CANONICAL_DOMAIN}/`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'Run Your Xerox Shop on Autopilot with EasyToPrint',
    includeSoftwareSchema: true,
    includePricingOffers: true,
    includeFaqSchema: true,
    lastmod: '2026-04-02',
    changefreq: 'weekly',
    priority: '1.0',
    ssrSummary:
      'EasyToPrint is a Print Shop Automation SaaS built for Indian Xerox shops, college reprography centres, and commercial print counters. Replace WhatsApp Web and USB pen drives with touch-free QR ordering, automatic PDF page counting, instant UPI payments, and automated Windows desktop printing.',
    ssrBullets: [
      'Counter QR code self-service ordering with zero mobile app download required',
      'Automatic PDF page count inspection and per-page rate calculation in INR',
      'Instant UPI checkout via Google Pay, PhonePe, Paytm, and Razorpay before printing',
      'Windows Desktop Print Agent with multi-printer capability detection and auto-spooling'
    ]
  },
  '/features': {
    path: '/features',
    title: 'Print Shop Automation Features – QR Ordering, Billing & Queue | EasyToPrint',
    description:
      'Explore EasyToPrint features for Xerox and printing shops in India: touch-free QR file uploads, automated page counting, instant UPI checkout, and multi-printer routing.',
    canonical: `${CANONICAL_DOMAIN}/features`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'Everything Your Print Shop Needs in One Platform',
    breadcrumbs: [
      { name: 'Home', url: `${CANONICAL_DOMAIN}/` },
      { name: 'Features', url: `${CANONICAL_DOMAIN}/features` }
    ],
    includeSoftwareSchema: true,
    lastmod: '2026-04-02',
    changefreq: 'weekly',
    priority: '0.9',
    ssrSummary:
      'Complete feature breakdown of EasyToPrint print shop management software: QR code document upload, automatic PDF page detection, dynamic Xerox pricing rules, UPI checkout, and Windows print spooler automation.',
    ssrBullets: [
      'QR-Based Online Print Ordering for walk-in counter customers',
      'Real-time PDF Page Count & Per-Page Pricing Engine',
      'Instant UPI & Razorpay Checkout with automatic payment verification',
      'EasyToPrint Windows Desktop Agent with Multi-Printer Smart Routing & Live Analytics'
    ]
  },
  '/how-it-works': {
    path: '/how-it-works',
    title: 'How EasyToPrint Works – Online Document Printing & Auto-Print Workflow',
    description:
      'See how customers scan a QR code, upload PDFs, and pay via UPI while EasyToPrint automatically routes paid jobs to your shop’s Windows printers in seconds.',
    canonical: `${CANONICAL_DOMAIN}/how-it-works`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'How EasyToPrint Automates Customer Orders and Shop Printing',
    breadcrumbs: [
      { name: 'Home', url: `${CANONICAL_DOMAIN}/` },
      { name: 'How It Works', url: `${CANONICAL_DOMAIN}/how-it-works` }
    ],
    includeSoftwareSchema: true,
    lastmod: '2026-04-02',
    changefreq: 'weekly',
    priority: '0.9',
    ssrSummary:
      'Step-by-step workflow of EasyToPrint for both customers and Xerox shop owners: 1) Scan shop QR code, 2) Upload PDF or image, 3) Choose B&W/Color, duplex & copies, 4) Pay via UPI, 5) Windows Print Agent dispatches directly to the physical printer, 6) Customer tracks live status and collects prints.',
    ssrBullets: [
      'Customer Flow: Scan QR -> Upload Document -> Select Options -> Pay via UPI -> Collect Print',
      'Shop Owner Flow: Create Shop Account -> Set Rate Card -> Pair Windows Agent -> Print Counter QR',
      'Zero WhatsApp Web file clutter, zero infected USB pen drives, and automatic post-print cleanup'
    ]
  },
  '/qr-print-ordering': {
    path: '/qr-print-ordering',
    title: 'QR Code Print Ordering System for Xerox & Printing Shops | EasyToPrint',
    description:
      'Eliminate WhatsApp forwarding and infected USB drives with EasyToPrint QR code print ordering. Customers scan, upload PDFs, select print settings, and pay via UPI.',
    canonical: `${CANONICAL_DOMAIN}/qr-print-ordering`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'QR-Based Online Print Ordering for Modern Xerox Counters',
    breadcrumbs: [
      { name: 'Home', url: `${CANONICAL_DOMAIN}/` },
      { name: 'QR Print Ordering', url: `${CANONICAL_DOMAIN}/qr-print-ordering` }
    ],
    includeSoftwareSchema: true,
    lastmod: '2026-04-02',
    changefreq: 'weekly',
    priority: '0.9',
    ssrSummary:
      'Turn any Xerox counter into a self-service print kiosk using a dedicated shop QR code. Customers upload PDFs directly from Chrome or Safari without installing an app.',
    ssrBullets: [
      'Protect customer privacy with zero personal phone number or WhatsApp contact sharing',
      'Serve 10+ walk-in students or customers concurrently during peak counter hours',
      'Instant PDF preview and self-selected B&W/Color/Duplex preferences eliminate mistakes'
    ]
  },
  '/print-shop-management': {
    path: '/print-shop-management',
    title: 'Print Shop Management & Billing Software India | EasyToPrint',
    description:
      'Manage daily print orders, counter billing, customer queues, multi-printer routing, and UPI revenue reconciliation with EasyToPrint printing shop software.',
    canonical: `${CANONICAL_DOMAIN}/print-shop-management`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'Manage Print Orders, Billing & Shop Operations from One Dashboard',
    breadcrumbs: [
      { name: 'Home', url: `${CANONICAL_DOMAIN}/` },
      { name: 'Print Shop Management', url: `${CANONICAL_DOMAIN}/print-shop-management` }
    ],
    includeSoftwareSchema: true,
    lastmod: '2026-04-02',
    changefreq: 'weekly',
    priority: '0.9',
    ssrSummary:
      'Centralized cloud dashboard for Indian printing shops, college reprography centres, and DTP studios to track live print orders, configure per-page pricing, and reconcile daily UPI settlements.',
    ssrBullets: [
      'Real-time order queue lifecycle: Uploaded -> Paid -> Queued -> Printing -> Completed',
      'Custom per-page rates for A4, Legal, B&W, Color, and Duplex jobs',
      'Automated Razorpay & UPI payment verification with daily revenue reporting'
    ]
  },
  '/print-agent': {
    path: '/print-agent',
    title: 'EasyToPrint Agent – Automated Windows Desktop Print Spooler Software',
    description:
      'Automate physical printers with EasyToPrint Agent for Windows. Detect printer capabilities, route B&W and color jobs automatically, and print paid orders hands-free.',
    canonical: `${CANONICAL_DOMAIN}/print-agent`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'Automate Printing with EasyToPrint Desktop Print Agent',
    breadcrumbs: [
      { name: 'Home', url: `${CANONICAL_DOMAIN}/` },
      { name: 'Desktop Print Agent', url: `${CANONICAL_DOMAIN}/print-agent` }
    ],
    includeSoftwareSchema: true,
    lastmod: '2026-04-02',
    changefreq: 'weekly',
    priority: '0.9',
    ssrSummary:
      'Native Windows desktop print automation agent for Xerox shops. Connects HP, Canon, Epson, Ricoh, Brother, and Konica Minolta printers to your cloud order queue.',
    ssrBullets: [
      'Automatic Windows Print Spooler discovery for USB and local LAN network printers',
      'Driver capability detection for A4, A3, Legal, Color, Monochrome, and Duplex units',
      'Encrypted cloud pairing using Windows DPAPI credential storage and automatic job recovery'
    ]
  },
  '/pricing': {
    path: '/pricing',
    title: 'Pricing Plans – Affordable Xerox & Print Shop Software India | EasyToPrint',
    description:
      'Transparent monthly and yearly subscription plans starting at ₹399/mo with a 7-day free trial. Automate your Xerox counter, QR ordering, and Windows printers.',
    canonical: `${CANONICAL_DOMAIN}/pricing`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'Simple, Transparent Pricing for Printing Businesses of Every Size',
    breadcrumbs: [
      { name: 'Home', url: `${CANONICAL_DOMAIN}/` },
      { name: 'Pricing', url: `${CANONICAL_DOMAIN}/pricing` }
    ],
    includeSoftwareSchema: true,
    includePricingOffers: true,
    lastmod: '2026-04-02',
    changefreq: 'weekly',
    priority: '0.8',
    ssrSummary:
      'Compare EasyToPrint subscription plans in INR: Starter (₹399/mo with 7-day free trial, 1 printer, 500 jobs/mo), Growth (₹699/mo, up to 5 printers, 2,000 jobs/mo), and Business (₹1,199/mo launch offer, up to 10 printers, 5,000 jobs/mo).',
    ssrBullets: [
      'Starter Plan: ₹399/month (7-Day Free Trial, 1 Windows printer, 500 jobs/month)',
      'Growth Plan: ₹699/month (Up to 5 Windows printers, 2,000 jobs/month, Smart Capability Routing)',
      'Business Plan: ₹1,199/month launch offer (Reg. ₹1,499/mo, up to 10 printers, 5,000 jobs/month, Dynamic Load Balancing)'
    ]
  },
  '/about': {
    path: '/about',
    title: 'About EasyToPrint – Print Shop Automation SaaS for Indian Xerox Shops',
    description:
      'Learn how EasyToPrint is modernizing Indian Xerox shops, stationery stores, and document printing centres with cloud order management and desktop print automation.',
    canonical: `${CANONICAL_DOMAIN}/about`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'Designed for Xerox and Printing Businesses Across India',
    breadcrumbs: [
      { name: 'Home', url: `${CANONICAL_DOMAIN}/` },
      { name: 'About EasyToPrint', url: `${CANONICAL_DOMAIN}/about` }
    ],
    lastmod: '2026-04-02',
    changefreq: 'monthly',
    priority: '0.7',
    ssrSummary:
      'EasyToPrint builds software tailored for Indian Xerox shops, campus print centres, cyber cafes, and commercial digital presses to eliminate counter bottlenecks.'
  },
  '/contact': {
    path: '/contact',
    title: 'Contact EasyToPrint – Sales, Onboarding & Printer Setup Support',
    description:
      'Get in touch with EasyToPrint for print shop onboarding, Windows Print Agent setup assistance, multi-printer configuration, and enterprise inquiries in India.',
    canonical: `${CANONICAL_DOMAIN}/contact`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'Contact EasyToPrint Support & Onboarding Team',
    breadcrumbs: [
      { name: 'Home', url: `${CANONICAL_DOMAIN}/` },
      { name: 'Contact Us', url: `${CANONICAL_DOMAIN}/contact` }
    ],
    lastmod: '2026-04-02',
    changefreq: 'monthly',
    priority: '0.7',
    ssrSummary:
      'Reach the EasyToPrint onboarding and technical support team at support@easytoprint.in for help setting up your shop QR code, Razorpay UPI settlement, or Windows Desktop Print Agent.'
  },
  '/faq': {
    path: '/faq',
    title: 'Frequently Asked Questions – EasyToPrint Xerox & Print Shop Software',
    description:
      'Answers to common questions about EasyToPrint QR ordering, supported Windows printers, instant UPI payments, multi-printer routing, and shop setup.',
    canonical: `${CANONICAL_DOMAIN}/faq`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'Frequently Asked Questions About EasyToPrint',
    breadcrumbs: [
      { name: 'Home', url: `${CANONICAL_DOMAIN}/` },
      { name: 'FAQ', url: `${CANONICAL_DOMAIN}/faq` }
    ],
    includeFaqSchema: true,
    lastmod: '2026-04-02',
    changefreq: 'monthly',
    priority: '0.7',
    ssrSummary:
      'Frequently asked questions covering how EasyToPrint works, supported laser and inkjet printers, customer QR uploads without an app, and instant UPI payments.'
  },
  '/blog': {
    path: '/blog',
    title: 'EasyToPrint Blog – Xerox Shop Automation & Online Printing Guides India',
    description:
      'Practical guides for Indian Xerox shop owners and print centres on QR print ordering, UPI payment automation, Windows Print Agent setup, and queue management.',
    canonical: `${CANONICAL_DOMAIN}/blog`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'EasyToPrint Guides for Indian Xerox & Print Shop Owners',
    breadcrumbs: [
      { name: 'Home', url: `${CANONICAL_DOMAIN}/` },
      { name: 'Blog', url: `${CANONICAL_DOMAIN}/blog` }
    ],
    lastmod: '2026-04-02',
    changefreq: 'weekly',
    priority: '0.8',
    ssrSummary:
      'In-depth operational guides for Indian photocopy shops, cyber cafes, and reprography centres covering QR code print ordering, UPI checkout, and multi-printer routing.',
    ssrBullets: BLOG_POSTS.map((post) => `${post.title} — ${post.excerpt}`)
  }
};

function blogPostToSeo(post: BlogPost): RouteSeoMetadata {
  const path = `/blog/${post.slug}`;
  return {
    path,
    title: post.seoTitle,
    description: post.description,
    canonical: `${CANONICAL_DOMAIN}${path}`,
    robots: 'index, follow',
    ogType: 'article',
    h1: post.title,
    breadcrumbs: [
      { name: 'Home', url: `${CANONICAL_DOMAIN}/` },
      { name: 'Blog', url: `${CANONICAL_DOMAIN}/blog` },
      { name: post.title, url: `${CANONICAL_DOMAIN}${path}` }
    ],
    articleMeta: {
      headline: post.title,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      author: post.author,
      section: post.category
    },
    lastmod: post.updatedAt,
    changefreq: 'monthly',
    priority: '0.7',
    ssrSummary: post.excerpt,
    ssrBullets: post.sections.map((s) => `${s.heading}: ${s.paragraphs[0] || ''}`)
  };
}

export const PUBLIC_SEO_ROUTES: Record<string, RouteSeoMetadata> = {
  ...CORE_PUBLIC_ROUTES,
  ...Object.fromEntries(BLOG_POSTS.map((post) => [`/blog/${post.slug}`, blogPostToSeo(post)]))
};

export const PRIVATE_NOINDEX_PREFIXES = [
  '/auth',
  '/login',
  '/register',
  '/signup',
  '/forgot-password',
  '/reset-password',
  ADMIN_BASE_PATH,
  '/admin',
  '/shop',
  '/dashboard',
  '/customer',
  '/track-print',
  '/s/',
  '/print/'
];

export function normalizePathname(rawPath: string): string {
  const withoutQuery = (rawPath || '/').split('?')[0].split('#')[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery || '/';
}

export function isPrivateNoIndexPath(pathname: string): boolean {
  const clean = normalizePathname(pathname);
  return PRIVATE_NOINDEX_PREFIXES.some(
    (prefix) => clean === prefix || clean.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`) || clean.startsWith(prefix)
  );
}

export function getSeoForPath(pathname: string): RouteSeoMetadata & { isNotFound?: boolean } {
  const clean = normalizePathname(pathname);

  if (PUBLIC_SEO_ROUTES[clean]) {
    return PUBLIC_SEO_ROUTES[clean];
  }

  if (clean.startsWith('/blog/')) {
    const slug = clean.slice('/blog/'.length);
    const post = getBlogPostBySlug(slug);
    if (post) {
      return blogPostToSeo(post);
    }
  }

  if (isPrivateNoIndexPath(clean)) {
    let privateTitle = 'EasyToPrint – Print Shop Portal';
    if (clean === '/auth/login' || clean === '/login') privateTitle = 'Sign In – EasyToPrint Shop & Customer Portal';
    else if (clean === '/auth/register' || clean === '/register' || clean === '/signup')
      privateTitle = 'Register Your Print Shop – EasyToPrint';
    else if (clean === '/auth/forgot-password' || clean === '/forgot-password' || clean === '/reset-password')
      privateTitle = 'Reset Password – EasyToPrint';
    else if (clean.startsWith(ADMIN_BASE_PATH)) privateTitle = 'Admin Console – EasyToPrint';
    else if (clean.startsWith('/shop')) privateTitle = 'Shop Owner Dashboard – EasyToPrint';
    else if (clean === '/track-print') privateTitle = 'Track Print Order – EasyToPrint';
    else if (clean.startsWith('/s/') || clean.startsWith('/print/'))
      privateTitle = 'Upload & Print Documents – EasyToPrint Counter Terminal';

    return {
      path: clean,
      title: privateTitle,
      description: 'Secure application portal for EasyToPrint users and partner printing shops.',
      canonical: `${CANONICAL_DOMAIN}${clean}`,
      robots: 'noindex, nofollow',
      ogType: 'website'
    };
  }

  return {
    path: clean,
    title: 'Page Not Found (404) – EasyToPrint',
    description:
      'The requested page could not be found on EasyToPrint. Explore our print shop automation software, QR ordering, and pricing plans.',
    canonical: `${CANONICAL_DOMAIN}${clean}`,
    robots: 'noindex, nofollow',
    ogType: 'website',
    isNotFound: true
  };
}

export const STRUCTURED_DATA_FAQ_ITEMS = [
  {
    question: 'What is EasyToPrint?',
    answer:
      'EasyToPrint is an all-in-one print shop management and printing automation platform. It bridges QR-based customer self-ordering, online UPI payments, and an automated Windows desktop Print Agent to eliminate counter chaos and automate printing workflows for Xerox shops and cyber centres.'
  },
  {
    question: 'How does EasyToPrint work?',
    answer:
      'Customers scan your counter QR code on their smartphone, upload PDF documents, choose print settings (color/B&W, copies, duplex), and complete an instant UPI payment. The EasyToPrint Windows Agent immediately receives the paid order and automatically streams it to your connected printer without USB drives or manual intervention.'
  },
  {
    question: 'What is the EasyToPrint Windows Agent?',
    answer:
      'The Windows Agent is a lightweight, secure desktop software running on your shop PC. It monitors your physical printers, connects via TLS 1.3 to your cloud queue, and silently dispatches print jobs through the native Win32 Print Spooler with DPAPI vault protection.'
  },
  {
    question: 'Which printers are supported?',
    answer:
      'EasyToPrint supports all major desktop and commercial printers with Windows drivers—including HP, Canon, Epson, Brother, Ricoh, Konica Minolta, Kyocera, and Xerox. Both USB and local network printers are supported without requiring special hardware.'
  },
  {
    question: 'Can I connect multiple printers?',
    answer:
      'Yes. You can connect and manage multiple physical printers simultaneously (such as a dedicated black-and-white high-speed laser printer and a high-resolution color photo inkjet). The platform automatically detects capabilities and routes customer orders to the correct device.'
  },
  {
    question: 'Do customers need to install an application?',
    answer:
      'No. Customers do not need to download or install any app. The entire upload, customization, and payment process runs seamlessly in their mobile browser (Chrome, Safari, Firefox) within seconds of scanning your counter QR code.'
  },
  {
    question: 'How do customer payments work?',
    answer:
      'Customers pay directly online using instant UPI (Google Pay, PhonePe, Paytm, BHIM) or cards powered by secure payment gateways like Razorpay. Print jobs are only dispatched to the printer queue after successful payment confirmation, eliminating unpaid prints and change calculation.'
  }
];

export function buildJsonLdGraph(seo: RouteSeoMetadata): Record<string, unknown> {
  const graph: Array<Record<string, unknown>> = [
    {
      '@type': 'Organization',
      '@id': `${CANONICAL_DOMAIN}/#organization`,
      name: 'EasyToPrint',
      url: `${CANONICAL_DOMAIN}/`,
      logo: {
        '@type': 'ImageObject',
        url: LOGO_IMAGE_URL,
        width: 480,
        height: 120
      },
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: 'support@easytoprint.in',
          areaServed: 'IN',
          availableLanguage: ['English', 'Hindi']
        }
      ],
      description:
        'Print Shop Automation SaaS for Xerox and Printing Businesses in India. Manage QR-based print ordering, customer file uploads, UPI payments, and automated Windows printing.'
    },
    {
      '@type': 'WebSite',
      '@id': `${CANONICAL_DOMAIN}/#website`,
      url: `${CANONICAL_DOMAIN}/`,
      name: 'EasyToPrint',
      inLanguage: 'en-IN',
      publisher: {
        '@id': `${CANONICAL_DOMAIN}/#organization`
      }
    }
  ];

  if (seo.includeSoftwareSchema) {
    const softwareNode: Record<string, unknown> = {
      '@type': 'SoftwareApplication',
      '@id': `${CANONICAL_DOMAIN}/#software`,
      name: 'EasyToPrint',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web Browser, Windows 10, Windows 11',
      description:
        'Print shop management and automation software for Xerox businesses, printing shops, and reprography centres in India.',
      url: `${CANONICAL_DOMAIN}/`,
      publisher: {
        '@id': `${CANONICAL_DOMAIN}/#organization`
      },
      featureList: [
        'QR-Based Online Print Ordering',
        'Customer PDF Upload & Automatic Page Counting',
        'Instant UPI Payment Integration',
        'Centralized Print Shop Management Dashboard',
        'Automated Windows Desktop Print Agent (Win32 Spooler)',
        'Multi-Printer Capability Detection & Smart Queue Routing'
      ]
    };

    if (seo.includePricingOffers) {
      softwareNode.offers = [
        {
          '@type': 'Offer',
          name: 'Starter Plan',
          price: '399',
          priceCurrency: 'INR',
          url: `${CANONICAL_DOMAIN}/pricing`,
          availability: 'https://schema.org/InStock',
          description: '500 print jobs/month, 1 registered Windows printer, 7-day free trial.'
        },
        {
          '@type': 'Offer',
          name: 'Growth Plan',
          price: '699',
          priceCurrency: 'INR',
          url: `${CANONICAL_DOMAIN}/pricing`,
          availability: 'https://schema.org/InStock',
          description: '2,000 print jobs/month, up to 5 Windows printers, smart capability routing.'
        },
        {
          '@type': 'Offer',
          name: 'Business Plan',
          price: '1199',
          priceCurrency: 'INR',
          url: `${CANONICAL_DOMAIN}/pricing`,
          availability: 'https://schema.org/InStock',
          description: '5,000 print jobs/month, up to 10 Windows printers, dynamic load balancing.'
        }
      ];
    }

    graph.push(softwareNode);
  }

  if (seo.breadcrumbs && seo.breadcrumbs.length > 0) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: seo.breadcrumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: crumb.url
      }))
    });
  }

  if (seo.includeFaqSchema) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: STRUCTURED_DATA_FAQ_ITEMS.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer
        }
      }))
    });
  }

  if (seo.articleMeta) {
    graph.push({
      '@type': 'Article',
      headline: seo.articleMeta.headline,
      description: seo.description,
      image: [OG_IMAGE_URL],
      datePublished: seo.articleMeta.datePublished,
      dateModified: seo.articleMeta.dateModified,
      articleSection: seo.articleMeta.section,
      inLanguage: 'en-IN',
      author: {
        '@type': 'Organization',
        name: seo.articleMeta.author,
        url: `${CANONICAL_DOMAIN}/`
      },
      publisher: {
        '@id': `${CANONICAL_DOMAIN}/#organization`
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': seo.canonical
      }
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph
  };
}

export function buildSitemapXml(todayDate?: string): string {
  const fallbackDate = todayDate || new Date().toISOString().slice(0, 10);
  const urls = Object.values(PUBLIC_SEO_ROUTES)
    .filter((r) => r.robots === 'index, follow')
    .map(
      (r) =>
        `  <url>\n    <loc>${r.canonical}</loc>\n    <lastmod>${r.lastmod || fallbackDate}</lastmod>\n    <changefreq>${r.changefreq || 'weekly'}</changefreq>\n    <priority>${r.priority || (r.path === '/' ? '1.0' : '0.8')}</priority>\n  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildRobotsTxt(): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Allow: /features',
    'Allow: /how-it-works',
    'Allow: /qr-print-ordering',
    'Allow: /print-shop-management',
    'Allow: /print-agent',
    'Allow: /pricing',
    'Allow: /about',
    'Allow: /contact',
    'Allow: /faq',
    'Allow: /blog',
    'Allow: /blog/',
    'Allow: /assets/',
    '',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /shop',
    'Disallow: /shop/',
    'Disallow: /dashboard',
    'Disallow: /dashboard/',
    'Disallow: /auth',
    'Disallow: /auth/',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /signup',
    'Disallow: /forgot-password',
    'Disallow: /reset-password',
    'Disallow: /customer',
    'Disallow: /customer/',
    'Disallow: /track-print',
    'Disallow: /s/',
    'Disallow: /print/',
    'Disallow: /api/',
    '',
    `Sitemap: ${CANONICAL_DOMAIN}/sitemap.xml`,
    ''
  ].join('\n');
}
