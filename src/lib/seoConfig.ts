export const CANONICAL_DOMAIN = 'https://easytoprint.devpixel.space';

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
  includeFaqSchema?: boolean;
  ssrSummary?: string;
}

export const PUBLIC_SEO_ROUTES: Record<string, RouteSeoMetadata> = {
  '/': {
    path: '/',
    title: 'EasyToPrint – Print Shop Management & Automation Software',
    description:
      'Simplify your printing business with EasyToPrint. Manage print orders, customer uploads, QR-based ordering, payments and automated printing from one platform.',
    canonical: `${CANONICAL_DOMAIN}/`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'Simplify Your Printing Business with EasyToPrint',
    includeSoftwareSchema: true,
    includeFaqSchema: true,
    ssrSummary:
      'EasyToPrint is a Print Shop Automation SaaS for Xerox and printing businesses in India. Automate QR code print ordering, customer PDF uploads, instant UPI billing, and desktop printer queues from one platform.'
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
    ssrSummary:
      'Complete feature breakdown of EasyToPrint print shop management software: QR code document upload, automatic PDF page detection, dynamic Xerox pricing rules, UPI checkout, and Windows print spooler automation.'
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
    ssrSummary:
      'Turn any Xerox counter into a self-service print kiosk using a dedicated shop QR code. Customers upload PDFs directly from Chrome or Safari without installing an app.'
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
    ssrSummary:
      'Centralized cloud dashboard for Indian printing shops, college reprography centres, and DTP studios to track live print orders, configure per-page pricing, and reconcile daily UPI settlements.'
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
    ssrSummary:
      'Native Windows desktop print automation agent for Xerox shops. Connects HP, Canon, Epson, Ricoh, Brother, and Konica Minolta printers to your cloud order queue.'
  },
  '/pricing': {
    path: '/pricing',
    title: 'Pricing Plans – Affordable Xerox & Print Shop Software India | EasyToPrint',
    description:
      'Transparent monthly and yearly subscription plans for printing businesses in India. Start automating your Xerox counter, QR ordering, and Windows printers today.',
    canonical: `${CANONICAL_DOMAIN}/pricing`,
    robots: 'index, follow',
    ogType: 'website',
    h1: 'Simple, Transparent Pricing for Printing Businesses of Every Size',
    breadcrumbs: [
      { name: 'Home', url: `${CANONICAL_DOMAIN}/` },
      { name: 'Pricing', url: `${CANONICAL_DOMAIN}/pricing` }
    ],
    includeSoftwareSchema: true,
    ssrSummary:
      'Compare EasyToPrint subscription plans for single-printer Xerox counters, multi-printer cyber cafes, and high-volume commercial reprography centres in India.'
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
    ssrSummary:
      'Reach the EasyToPrint onboarding and technical support team for help setting up your shop QR code, Razorpay UPI settlement, or Windows Desktop Print Agent.'
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
    ssrSummary:
      'Frequently asked questions covering how EasyToPrint works, supported laser and inkjet printers, customer QR uploads without an app, and instant UPI payments.'
  }
};

export const PRIVATE_NOINDEX_PREFIXES = [
  '/auth',
  '/login',
  '/register',
  '/signup',
  '/forgot-password',
  '/reset-password',
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

  if (isPrivateNoIndexPath(clean)) {
    let privateTitle = 'EasyToPrint – Print Shop Portal';
    if (clean === '/auth/login') privateTitle = 'Sign In – EasyToPrint Shop & Customer Portal';
    else if (clean === '/auth/register') privateTitle = 'Register Your Print Shop – EasyToPrint';
    else if (clean === '/auth/forgot-password') privateTitle = 'Reset Password – EasyToPrint';
    else if (clean.startsWith('/admin')) privateTitle = 'Admin Console – EasyToPrint';
    else if (clean.startsWith('/shop')) privateTitle = 'Shop Owner Dashboard – EasyToPrint';
    else if (clean === '/track-print') privateTitle = 'Track Print Order – EasyToPrint';
    else if (clean.startsWith('/s/')) privateTitle = 'Upload & Print Documents – EasyToPrint Counter Terminal';

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
    description: 'The requested page could not be found on EasyToPrint. Explore our print shop automation software, QR ordering, and pricing plans.',
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
        url: `${CANONICAL_DOMAIN}/assets/easytoprint-logo-light.png`
      },
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
    graph.push({
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
    });
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

  return {
    '@context': 'https://schema.org',
    '@graph': graph
  };
}
