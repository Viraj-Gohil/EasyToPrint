import React, { Suspense, lazy, useEffect } from 'react';
import { AppProvider, useApp } from './lib/store';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { LandingPage } from './components/landing/LandingPage';
import { ToastContainer } from './components/common/ToastContainer';
import { SEOHead } from './components/common/SEOHead';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { EasyToPrintLoader, TopRouteLoader } from './components/common/EasyToPrintLoader';
import { normalizePathname, getLegacyRedirectTarget } from './lib/seoConfig';
import { FEATURE_LANDING_PAGE_MAP } from './lib/featurePagesData';
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH, ADMIN_DASHBOARD_PATH, isAdminRoutePath } from './lib/adminConfig';
import { ShieldAlert, Shield, LogOut, LayoutDashboard, AlertCircle } from 'lucide-react';

// Lazy-loaded heavy routes to keep public landing page JS bundle lean for fast LCP & INP
const QrScannerModal = lazy(() =>
  import('./components/common/QrScannerModal').then((m) => ({ default: m.QrScannerModal }))
);
const CustomerPrintFlow = lazy(() =>
  import('./components/customer/CustomerPrintFlow').then((m) => ({ default: m.CustomerPrintFlow }))
);
const TrackPrintPage = lazy(() =>
  import('./components/customer/TrackPrintPage').then((m) => ({ default: m.TrackPrintPage }))
);
const AuthPages = lazy(() =>
  import('./components/auth/AuthPages').then((m) => ({ default: m.AuthPages }))
);
const AdminLogin = lazy(() =>
  import('./components/admin/AdminLogin').then((m) => ({ default: m.AdminLogin }))
);
const PricingPage = lazy(() =>
  import('./components/pricing/PricingPage').then((m) => ({ default: m.PricingPage }))
);
const FeaturesSeoPage = lazy(() =>
  import('./components/public/PublicSeoPages').then((m) => ({ default: m.FeaturesSeoPage }))
);
const HowItWorksSeoPage = lazy(() =>
  import('./components/public/PublicSeoPages').then((m) => ({ default: m.HowItWorksSeoPage }))
);
const FeatureLandingSeoPage = lazy(() =>
  import('./components/public/PublicSeoPages').then((m) => ({ default: m.FeatureLandingSeoPage }))
);
const AboutSeoPage = lazy(() =>
  import('./components/public/PublicSeoPages').then((m) => ({ default: m.AboutSeoPage }))
);
const ContactSeoPage = lazy(() =>
  import('./components/public/PublicSeoPages').then((m) => ({ default: m.ContactSeoPage }))
);
const FaqSeoPage = lazy(() =>
  import('./components/public/PublicSeoPages').then((m) => ({ default: m.FaqSeoPage }))
);
const BlogIndexSeoPage = lazy(() =>
  import('./components/public/PublicSeoPages').then((m) => ({ default: m.BlogIndexSeoPage }))
);
const BlogPostSeoPage = lazy(() =>
  import('./components/public/PublicSeoPages').then((m) => ({ default: m.BlogPostSeoPage }))
);
const PrivacyPolicySeoPage = lazy(() =>
  import('./components/public/PublicSeoPages').then((m) => ({ default: m.PrivacyPolicySeoPage }))
);
const TermsSeoPage = lazy(() =>
  import('./components/public/PublicSeoPages').then((m) => ({ default: m.TermsSeoPage }))
);
const RefundPolicySeoPage = lazy(() =>
  import('./components/public/PublicSeoPages').then((m) => ({ default: m.RefundPolicySeoPage }))
);
const NotFoundPage = lazy(() =>
  import('./components/public/PublicSeoPages').then((m) => ({ default: m.NotFoundPage }))
);

// Shop Owner Components & Layout (Lazy-loaded)
const ShopLayout = lazy(() =>
  import('./components/shop/ShopLayout').then((m) => ({ default: m.ShopLayout }))
);
const ShopDashboard = lazy(() =>
  import('./components/shop/ShopDashboard').then((m) => ({ default: m.ShopDashboard }))
);
const ShopPrintJobs = lazy(() =>
  import('./components/shop/ShopPrintJobs').then((m) => ({ default: m.ShopPrintJobs }))
);
const ShopPrinters = lazy(() =>
  import('./components/shop/ShopPrinters').then((m) => ({ default: m.ShopPrinters }))
);
const ShopQrCodes = lazy(() =>
  import('./components/shop/ShopQrCodes').then((m) => ({ default: m.ShopQrCodes }))
);
const ShopPricing = lazy(() =>
  import('./components/shop/ShopPricing').then((m) => ({ default: m.ShopPricing }))
);
const ShopPayments = lazy(() =>
  import('./components/shop/ShopPayments').then((m) => ({ default: m.ShopPayments }))
);
const ShopSubscription = lazy(() =>
  import('./components/shop/ShopSubscription').then((m) => ({ default: m.ShopSubscription }))
);
const ShopAnalytics = lazy(() =>
  import('./components/shop/ShopAnalytics').then((m) => ({ default: m.ShopAnalytics }))
);
const ShopPrintAgent = lazy(() =>
  import('./components/shop/ShopPrintAgent').then((m) => ({ default: m.ShopPrintAgent }))
);
const ShopSettings = lazy(() =>
  import('./components/shop/ShopSettings').then((m) => ({ default: m.ShopSettings }))
);

// Platform Admin Components & Layout (Lazy-loaded)
const AdminLayout = lazy(() =>
  import('./components/admin/AdminLayout').then((m) => ({ default: m.AdminLayout }))
);
const AdminDashboard = lazy(() =>
  import('./components/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const AdminAnalytics = lazy(() =>
  import('./components/admin/AdminAnalytics').then((m) => ({ default: m.AdminAnalytics }))
);
const AdminShops = lazy(() =>
  import('./components/admin/AdminShops').then((m) => ({ default: m.AdminShops }))
);
const AdminPrinters = lazy(() =>
  import('./components/admin/AdminPrinters').then((m) => ({ default: m.AdminPrinters }))
);
const AdminStorage = lazy(() =>
  import('./components/admin/AdminStorage').then((m) => ({ default: m.AdminStorage }))
);
const AdminSubscriptions = lazy(() =>
  import('./components/admin/AdminSubscriptions').then((m) => ({ default: m.AdminSubscriptions }))
);
const AdminShopSubscriptions = lazy(() =>
  import('./components/admin/AdminShopSubscriptions').then((m) => ({ default: m.AdminShopSubscriptions }))
);
const AdminPayments = lazy(() =>
  import('./components/admin/AdminPayments').then((m) => ({ default: m.AdminPayments }))
);
const AdminAuditLogs = lazy(() =>
  import('./components/admin/AdminAuditLogs').then((m) => ({ default: m.AdminAuditLogs }))
);
const AdminSystemHealth = lazy(() =>
  import('./components/admin/AdminSystemHealth').then((m) => ({ default: m.AdminSystemHealth }))
);
const AdminPlatformSettings = lazy(() =>
  import('./components/admin/AdminPlatformSettings').then((m) => ({ default: m.AdminPlatformSettings }))
);
const AdminSupport = lazy(() =>
  import('./components/admin/AdminSupport').then((m) => ({ default: m.AdminSupport }))
);
const AdminAgents = lazy(() =>
  import('./components/admin/AdminAgents').then((m) => ({ default: m.AdminAgents }))
);
const AdminPrintJobs = lazy(() =>
  import('./components/admin/AdminPrintJobs').then((m) => ({ default: m.AdminPrintJobs }))
);


function resolveShopTab(cleanPath: string): string | null {
  const rawSub = cleanPath.replace(/^\/shop\/?/, '').split('/')[0].toLowerCase();
  switch (rawSub) {
    case '':
    case 'dashboard':
    case 'overview':
    case 'home':
      return 'dashboard';
    case 'print-jobs':
    case 'jobs':
    case 'orders':
    case 'queue':
    case 'live-queue':
      return 'print-jobs';
    case 'printers':
    case 'hardware':
      return 'printers';
    case 'qr-codes':
    case 'qr':
    case 'counter-stand':
    case 'stand':
      return 'qr-codes';
    case 'pricing':
    case 'rates':
    case 'pricing-rules':
      return 'pricing';
    case 'payments':
    case 'transactions':
    case 'revenue':
    case 'billing':
      return 'payments';
    case 'subscription':
    case 'plan':
    case 'plans':
      return 'subscription';
    case 'analytics':
    case 'reports':
      return 'analytics';
    case 'print-agent':
    case 'agent':
    case 'desktop-agent':
      return 'print-agent';
    case 'settings':
    case 'profile':
    case 'shop-settings':
      return 'settings';
    default:
      return null;
  }
}

function resolveAdminTab(cleanPath: string): string | null {
  const escapedBase = ADMIN_BASE_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rawSub = cleanPath.replace(new RegExp(`^${escapedBase}/?`), '').split('/')[0].toLowerCase();
  switch (rawSub) {
    case '':
    case 'dashboard':
    case 'overview':
    case 'home':
      return 'dashboard';
    case 'analytics':
    case 'reports':
      return 'analytics';
    case 'shops':
    case 'stores':
    case 'tenants':
      return 'shops';
    case 'printers':
    case 'hardware':
      return 'printers';
    case 'plans':
    case 'saas-plans':
    case 'pricing':
      return 'plans';
    case 'subscriptions':
    case 'shop-subscriptions':
      return 'subscriptions';
    case 'payments':
    case 'transactions':
    case 'revenue':
      return 'payments';
    case 'storage':
    case 'files':
      return 'storage';
    case 'support':
    case 'tickets':
    case 'helpdesk':
      return 'support';
    case 'audit-logs':
    case 'logs':
    case 'security':
      return 'audit-logs';
    case 'health':
    case 'system-health':
    case 'status':
      return 'health';
    case 'platform-settings':
    case 'settings':
    case 'config':
      return 'platform-settings';
    case 'agents':
    case 'print-agents':
      return 'agents';
    case 'print-jobs':
    case 'jobs':
    case 'orders':
    case 'queue':
      return 'print-jobs';
    default:
      return null;
  }
}

const AuthInitializingScreen: React.FC = () => (
  <EasyToPrintLoader
    variant="fullscreen"
    title="EasyToPrint"
    subtitle="Verifying your session and workspace..."
  />
);

const AppRouter: React.FC = () => {
  const { currentPath, activeShop, currentUser, isAuthRestored, navigate, logout } = useApp();

  // Normalize path (handle both clean paths and legacy hash strings)
  const rawPath = currentPath || '/';
  const cleanRaw = rawPath.startsWith('#') ? rawPath.slice(1) : rawPath;
  const normalizedPath = normalizePathname(cleanRaw.startsWith('/') ? cleanRaw : `/${cleanRaw}`);
  const legacyRedirectTarget = getLegacyRedirectTarget(normalizedPath);
  const path = legacyRedirectTarget || normalizedPath;

  useEffect(() => {
    if (legacyRedirectTarget && typeof window !== 'undefined') {
      window.history.replaceState({}, '', legacyRedirectTarget);
      navigate(legacyRedirectTarget);
    }
  }, [legacyRedirectTarget, navigate]);

  // Dedicated Obscured Admin Login URL
  if (path === ADMIN_LOGIN_PATH || path.startsWith(`${ADMIN_LOGIN_PATH}/`)) {
    if (!isAuthRestored) {
      return <AuthInitializingScreen />;
    }
    return (
      <div className="min-h-screen bg-[#F7F8F7] flex flex-col">
        <Navbar />
        <main key="admin-login-page" className="flex-1 etp-page-enter">
          <AdminLogin />
        </main>
      </div>
    );
  }

  // 1. Customer QR Print Flow: /s/:shopSlug or /print/:shopSlug
  if (
    path.startsWith('/s/') ||
    path.startsWith('/print/') ||
    rawPath.startsWith('#s/') ||
    rawPath.startsWith('s/')
  ) {
    const slug =
      path
        .replace(/^\/(s|print)\//, '')
        .split('/')[0] ||
      rawPath.replace(/^[/#]*s\//, '').split('/')[0] ||
      activeShop.slug;
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <main key={`customer-flow-${slug}`} className="flex-1 etp-page-enter">
          <CustomerPrintFlow shopSlug={slug} />
        </main>
      </div>
    );
  }

  // 1.5. Track Print Page: /track-print
  if (path === '/track-print' || path.startsWith('/track-print')) {
    return (
      <div className="min-h-screen bg-[#F6F6F6] flex flex-col w-full overflow-x-hidden">
        <main key="track-print-page" className="flex-1 w-full etp-page-enter">
          <TrackPrintPage />
        </main>
      </div>
    );
  }

  // 1.8. Public SEO, Feature Landing, Blog & Legal Pages
  const publicPageMap: Record<string, React.ReactNode> = {
    '/pricing': <PricingPage />,
    '/features': <FeaturesSeoPage />,
    '/how-it-works': <HowItWorksSeoPage />,
    '/about': <AboutSeoPage />,
    '/contact': <ContactSeoPage />,
    '/faq': <FaqSeoPage />,
    '/blog': <BlogIndexSeoPage />,
    '/privacy': <PrivacyPolicySeoPage />,
    '/terms': <TermsSeoPage />,
    '/refund-policy': <RefundPolicySeoPage />
  };

  const featureLandingPage = FEATURE_LANDING_PAGE_MAP[path] ? <FeatureLandingSeoPage path={path} /> : null;
  const blogPostMatch = path.startsWith('/blog/') ? path.slice('/blog/'.length) : null;
  const resolvedPublicPage =
    publicPageMap[path] || featureLandingPage || (blogPostMatch ? <BlogPostSeoPage slug={blogPostMatch} /> : null);

  if (resolvedPublicPage) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <Navbar />
        <main key={`public-seo-${path}`} className="flex-1 etp-page-enter">
          {resolvedPublicPage}
        </main>
        <Footer />
      </div>
    );
  }

  // 2. Redirect /customer to QR ordering flow
  if (path.startsWith('/customer')) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <main key="customer-flow-redirect" className="flex-1 etp-page-enter">
          <CustomerPrintFlow shopSlug={activeShop.slug} />
        </main>
      </div>
    );
  }

  // 3. Authentication Routes (/auth/*, /login, /register, /signup, /forgot-password, /reset-password)
  if (
    path.startsWith('/auth') ||
    path === '/login' ||
    path === '/register' ||
    path === '/signup' ||
    path === '/forgot-password' ||
    path === '/reset-password'
  ) {
    if (!isAuthRestored) {
      return <AuthInitializingScreen />;
    }
    const isRegister = path.includes('register') || path === '/signup';
    const isForgot = path.includes('forgot') || path.includes('reset');
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <Navbar />
        <main
          key={`auth-${isRegister ? 'register' : isForgot ? 'forgot' : 'login'}`}
          className="flex-1 etp-page-enter"
        >
          <AuthPages initialView={isRegister ? 'register' : isForgot ? 'forgot' : 'login'} />
        </main>
      </div>
    );
  }

  // 3.5. Convenience /dashboard route -> routes to active role's console
  if (path === '/dashboard') {
    if (!isAuthRestored) {
      return <AuthInitializingScreen />;
    }
    if (currentUser?.role === 'ADMIN') {
      return (
        <div className="min-h-screen bg-[#F7F8F7] flex flex-col">
          <AdminLayout activeTab="dashboard">
            <AdminDashboard />
          </AdminLayout>
        </div>
      );
    }
    if (currentUser?.role === 'SHOP_OWNER' && currentUser.shopId) {
      return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col">
          <ShopLayout activeTab="dashboard">
            <ShopDashboard />
          </ShopLayout>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <Navbar />
        <main className="flex-1">
          <AuthPages initialView="login" />
        </main>
      </div>
    );
  }

  // 4. Shop Owner Panel (/shop/*)
  if (path.startsWith('/shop')) {
    if (!isAuthRestored) {
      return <AuthInitializingScreen />;
    }

    // Super Admin is explicitly prohibited from directly accessing Shop Portal
    if (currentUser?.role === 'ADMIN') {
      return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col">
          <Navbar />
          <main className="flex-1 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white p-7 sm:p-8 rounded-2xl border border-rose-200 shadow-sm text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200/60 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 tracking-wide uppercase">
                  RBAC Enforcement
                </span>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Access Denied: Super Admin Restricted</h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Super Admin accounts are strictly prohibited from directly accessing individual Shop Portals. Platform administration and shop oversight must be conducted through the Admin Panel.
                </p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => navigate(ADMIN_DASHBOARD_PATH)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm bg-[#00B52D] text-white hover:bg-[#008F25] active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                >
                  <Shield className="w-4 h-4" />
                  <span>Return to Admin Dashboard</span>
                </button>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-medium text-xs sm:text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </main>
        </div>
      );
    }

    // Require authenticated Shop Owner with an active shop membership
    if (!currentUser || currentUser.role !== 'SHOP_OWNER' || !currentUser.shopId) {
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('easytoprint_return_to', cleanRaw);
        } catch {}
      }
      return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col">
          <Navbar />
          <main key="auth-required-shop" className="flex-1 etp-page-enter">
            <AuthPages initialView="login" />
          </main>
        </div>
      );
    }

    const resolvedTab = resolveShopTab(path);
    const activeTab = resolvedTab || 'dashboard';

    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <ShopLayout activeTab={activeTab}>
          {resolvedTab === 'dashboard' && <ShopDashboard />}
          {resolvedTab === 'print-jobs' && <ShopPrintJobs />}
          {resolvedTab === 'printers' && <ShopPrinters />}
          {resolvedTab === 'qr-codes' && <ShopQrCodes />}
          {resolvedTab === 'pricing' && <ShopPricing />}
          {resolvedTab === 'payments' && <ShopPayments />}
          {resolvedTab === 'subscription' && <ShopSubscription />}
          {resolvedTab === 'analytics' && <ShopAnalytics />}
          {resolvedTab === 'print-agent' && <ShopPrintAgent />}
          {resolvedTab === 'settings' && <ShopSettings />}
          {resolvedTab === null && (
            <div className="max-w-lg mx-auto my-12 bg-white p-7 sm:p-8 rounded-2xl border border-slate-200 shadow-xs text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 uppercase tracking-wide">
                  404 • Shop Console
                </span>
                <h2 className="text-xl font-bold text-slate-900">Page Not Found in Shop Console</h2>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                  The shop route <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{path}</code> does not exist. Choose a section from the sidebar or return to your dashboard.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => navigate('/shop/dashboard')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm bg-[#00B32D] text-white hover:bg-[#008F25] transition-colors cursor-pointer shadow-xs"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Go to Shop Dashboard</span>
                </button>
              </div>
            </div>
          )}
        </ShopLayout>
      </div>
    );
  }

  // 5. Platform Admin Panel (Obscured ADMIN_BASE_PATH/*; legacy /admin returns 404)
  if (isAdminRoutePath(path)) {
    if (!isAuthRestored) {
      return <AuthInitializingScreen />;
    }

    // If logged in as non-admin (e.g. Shop Owner), block with Access Denied view
    if (currentUser && currentUser.role !== 'ADMIN') {
      return (
        <div className="min-h-screen bg-[#f8fafc] flex flex-col">
          <Navbar />
          <main className="flex-1 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white p-7 sm:p-8 rounded-2xl border border-amber-200 shadow-sm text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/60 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 tracking-wide uppercase">
                  Privileged Area
                </span>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Access Denied: Master Admin Required</h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Platform Master Admin privileges are required to access this administration console. Your current session is registered as a Shop Owner.
                </p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/shop/dashboard')}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm bg-[#00B52D] text-white hover:bg-[#008F25] active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                >
                  <span>Return to Shop Console</span>
                </button>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-medium text-xs sm:text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </main>
        </div>
      );
    }

    // If unauthenticated, save intended admin path and show Admin Login
    if (!currentUser) {
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('easytoprint_return_to', cleanRaw);
        } catch {}
      }
      return (
        <div className="min-h-screen bg-[#F7F8F7] flex flex-col">
          <Navbar />
          <main key="auth-required-admin" className="flex-1 etp-page-enter">
            <AdminLogin />
          </main>
        </div>
      );
    }

    const resolvedTab = resolveAdminTab(path);
    const activeTab = resolvedTab || 'dashboard';

    return (
      <div className="min-h-screen bg-[#F7F8F7] flex flex-col">
        <AdminLayout activeTab={activeTab}>
          {resolvedTab === 'dashboard' && <AdminDashboard />}
          {resolvedTab === 'analytics' && <AdminAnalytics />}
          {resolvedTab === 'shops' && <AdminShops />}
          {resolvedTab === 'printers' && <AdminPrinters />}
          {resolvedTab === 'plans' && <AdminSubscriptions />}
          {resolvedTab === 'subscriptions' && <AdminShopSubscriptions />}
          {resolvedTab === 'payments' && <AdminPayments />}
          {resolvedTab === 'storage' && <AdminStorage />}
          {resolvedTab === 'support' && <AdminSupport />}
          {resolvedTab === 'audit-logs' && <AdminAuditLogs />}
          {resolvedTab === 'health' && <AdminSystemHealth />}
          {resolvedTab === 'platform-settings' && <AdminPlatformSettings />}
          {resolvedTab === 'agents' && <AdminAgents />}
          {resolvedTab === 'print-jobs' && <AdminPrintJobs />}
          {resolvedTab === null && (
            <div className="max-w-lg mx-auto my-12 bg-white p-7 sm:p-8 rounded-2xl border border-[#E1E7E1] shadow-xs text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E8F8EC] text-[#008F25] uppercase tracking-wide">
                  404 • Admin Console
                </span>
                <h2 className="text-xl font-bold text-[#080808]">Page Not Found in Admin Console</h2>
                <p className="text-xs sm:text-sm text-[#777777] leading-relaxed">
                  The administration route <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{path}</code> does not exist. Select a valid module from the sidebar or return to the overview.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => navigate(ADMIN_DASHBOARD_PATH)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm bg-[#00B52D] text-white hover:bg-[#008F25] transition-colors cursor-pointer shadow-xs"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Go to Admin Dashboard</span>
                </button>
              </div>
            </div>
          )}
        </AdminLayout>
      </div>
    );
  }

  // 6. Homepage (exact /)
  if (path === '/' || path === '') {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <Navbar />
        <main key="landing-page" className="flex-1 etp-page-enter">
          <LandingPage />
        </main>
        <Footer />
      </div>
    );
  }

  // 7. Unknown route -> Custom 404 Page
  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      <Navbar />
      <main key="not-found-page" className="flex-1 etp-page-enter">
        <NotFoundPage />
      </main>
      <Footer />
    </div>
  );
};

const AppContent: React.FC = () => {
  const { currentPath, currentUser, isQrScannerOpen, setIsQrScannerOpen, isLoadingData, navigate } = useApp();

  const fallbackDashboardPath =
    currentUser?.role === 'ADMIN'
      ? ADMIN_DASHBOARD_PATH
      : currentUser?.role === 'SHOP_OWNER'
      ? '/shop/dashboard'
      : '/';

  return (
    <ErrorBoundary
      resetKey={currentPath}
      onNavigate={navigate}
      fallbackDashboardPath={fallbackDashboardPath}
    >
      <SEOHead currentPath={currentPath} />
      <TopRouteLoader active={isLoadingData} routeKey={currentPath} />
      <Suspense fallback={<TopRouteLoader active routeKey={currentPath} />}>
        <AppRouter />
        {isQrScannerOpen && (
          <QrScannerModal
            isOpen={isQrScannerOpen}
            onClose={() => setIsQrScannerOpen(false)}
            onSuccess={(shopSlug: string) => {
              setIsQrScannerOpen(false);
              navigate(`/s/${shopSlug}`);
            }}
          />
        )}
      </Suspense>
      <ToastContainer />
    </ErrorBoundary>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
