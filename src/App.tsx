import React from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { AppProvider, useApp } from './lib/store';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { LandingPage } from './components/landing/LandingPage';
import { CustomerPrintFlow } from './components/customer/CustomerPrintFlow';
import { TrackPrintPage } from './components/customer/TrackPrintPage';
import { AuthPages } from './components/auth/AuthPages';
import { AdminLogin } from './components/admin/AdminLogin';
import { PricingPage } from './components/pricing/PricingPage';
import { ToastContainer } from './components/common/ToastContainer';
import { QrScannerModal } from './components/common/QrScannerModal';
import { SEOHead } from './components/common/SEOHead';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import {
  FeaturesSeoPage,
  QrOrderingSeoPage,
  PrintShopManagementSeoPage,
  PrintAgentSeoPage,
  AboutSeoPage,
  ContactSeoPage,
  FaqSeoPage,
  NotFoundPage
} from './components/public/PublicSeoPages';
import { normalizePathname } from './lib/seoConfig';
import { ShieldAlert, Shield, LogOut, Loader2, LayoutDashboard, AlertCircle } from 'lucide-react';

// Shop Owner Components & Layout
import { ShopLayout } from './components/shop/ShopLayout';
import { ShopDashboard } from './components/shop/ShopDashboard';
import { ShopPrintJobs } from './components/shop/ShopPrintJobs';
import { ShopPrinters } from './components/shop/ShopPrinters';
import { ShopQrCodes } from './components/shop/ShopQrCodes';
import { ShopPricing } from './components/shop/ShopPricing';
import { ShopPayments } from './components/shop/ShopPayments';
import { ShopSubscription } from './components/shop/ShopSubscription';
import { ShopAnalytics } from './components/shop/ShopAnalytics';
import { ShopPrintAgent } from './components/shop/ShopPrintAgent';
import { ShopSettings } from './components/shop/ShopSettings';

// Platform Admin Components & Layout
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminAnalytics } from './components/admin/AdminAnalytics';
import { AdminShops } from './components/admin/AdminShops';
import { AdminUsers } from './components/admin/AdminUsers';
import { AdminPrinters } from './components/admin/AdminPrinters';
import { AdminStorage } from './components/admin/AdminStorage';
import { AdminSubscriptions } from './components/admin/AdminSubscriptions';
import { AdminShopSubscriptions } from './components/admin/AdminShopSubscriptions';
import { AdminPayments } from './components/admin/AdminPayments';
import { AdminAuditLogs } from './components/admin/AdminAuditLogs';
import { AdminSystemHealth } from './components/admin/AdminSystemHealth';
import { AdminPlatformSettings } from './components/admin/AdminPlatformSettings';
import { AdminSupport } from './components/admin/AdminSupport';
import { AdminAgents } from './components/admin/AdminAgents';
import { AdminPrintJobs } from './components/admin/AdminPrintJobs';

const pageTransitionVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: 'easeOut' as const }
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.15, ease: 'easeIn' as const }
  }
};

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
  const rawSub = cleanPath.replace(/^\/admin\/?/, '').split('/')[0].toLowerCase();
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
    case 'users':
    case 'accounts':
    case 'members':
      return 'users';
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
  <div className="min-h-screen bg-[#F7F8F7] flex flex-col items-center justify-center p-4 font-['Manrope',sans-serif]">
    <div className="bg-white px-7 py-6 rounded-2xl border border-[#E1E7E1] shadow-xs flex flex-col items-center gap-3 text-center max-w-xs w-full">
      <div className="w-11 h-11 rounded-xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center border border-[#A7F3D0]">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold text-[#111111]">Loading EasyToPrint</p>
        <p className="text-xs text-[#646B65]">Verifying your session and workspace...</p>
      </div>
    </div>
  </div>
);

const AppRouter: React.FC = () => {
  const { currentPath, activeShop, currentUser, isAuthRestored, navigate, logout } = useApp();

  // Normalize path (handle both clean paths and legacy hash strings)
  const rawPath = currentPath || '/';
  const cleanRaw = rawPath.startsWith('#') ? rawPath.slice(1) : rawPath;
  const path = normalizePathname(cleanRaw.startsWith('/') ? cleanRaw : `/${cleanRaw}`);

  // Dedicated Fixed Admin Login URL: /admin/login
  if (path === '/admin/login' || path.startsWith('/admin/login')) {
    if (!isAuthRestored) {
      return <AuthInitializingScreen />;
    }
    return (
      <div className="min-h-screen bg-[#F7F8F7] flex flex-col">
        <Navbar />
        <AnimatePresence mode="wait">
          <motion.main
            key="admin-login-page"
            variants={pageTransitionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1"
          >
            <AdminLogin />
          </motion.main>
        </AnimatePresence>
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
        <AnimatePresence mode="wait">
          <motion.main
            key={`customer-flow-${slug}`}
            variants={pageTransitionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1"
          >
            <CustomerPrintFlow shopSlug={slug} />
          </motion.main>
        </AnimatePresence>
      </div>
    );
  }

  // 1.5. Track Print Page: /track-print
  if (path === '/track-print' || path.startsWith('/track-print')) {
    return (
      <div className="min-h-screen bg-[#F6F6F6] flex flex-col w-full overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.main
            key="track-print-page"
            variants={pageTransitionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 w-full"
          >
            <TrackPrintPage />
          </motion.main>
        </AnimatePresence>
      </div>
    );
  }

  // 1.8. Public SEO & Marketing Pages
  const publicPageMap: Record<string, React.ReactNode> = {
    '/pricing': <PricingPage />,
    '/features': <FeaturesSeoPage />,
    '/qr-print-ordering': <QrOrderingSeoPage />,
    '/print-shop-management': <PrintShopManagementSeoPage />,
    '/print-agent': <PrintAgentSeoPage />,
    '/about': <AboutSeoPage />,
    '/contact': <ContactSeoPage />,
    '/faq': <FaqSeoPage />
  };

  if (publicPageMap[path]) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <Navbar />
        <AnimatePresence mode="wait">
          <motion.main
            key={`public-seo-${path}`}
            variants={pageTransitionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1"
          >
            {publicPageMap[path]}
          </motion.main>
        </AnimatePresence>
        <Footer />
      </div>
    );
  }

  // 2. Redirect /customer to QR ordering flow
  if (path.startsWith('/customer')) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <AnimatePresence mode="wait">
          <motion.main
            key="customer-flow-redirect"
            variants={pageTransitionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1"
          >
            <CustomerPrintFlow shopSlug={activeShop.slug} />
          </motion.main>
        </AnimatePresence>
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
        <AnimatePresence mode="wait">
          <motion.main
            key={`auth-${isRegister ? 'register' : isForgot ? 'forgot' : 'login'}`}
            variants={pageTransitionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1"
          >
            <AuthPages initialView={isRegister ? 'register' : isForgot ? 'forgot' : 'login'} />
          </motion.main>
        </AnimatePresence>
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
                  onClick={() => navigate('/admin/dashboard')}
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
          <AnimatePresence mode="wait">
            <motion.main
              key="auth-required-shop"
              variants={pageTransitionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex-1"
            >
              <AuthPages initialView="login" />
            </motion.main>
          </AnimatePresence>
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

  // 5. Platform Admin Panel (/admin/*)
  if (path.startsWith('/admin')) {
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
          <AnimatePresence mode="wait">
            <motion.main
              key="auth-required-admin"
              variants={pageTransitionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex-1"
            >
              <AdminLogin />
            </motion.main>
          </AnimatePresence>
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
          {resolvedTab === 'users' && <AdminUsers />}
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
                  onClick={() => navigate('/admin/dashboard')}
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
        <AnimatePresence mode="wait">
          <motion.main
            key="landing-page"
            variants={pageTransitionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1"
          >
            <LandingPage />
          </motion.main>
        </AnimatePresence>
        <Footer />
      </div>
    );
  }

  // 7. Unknown route -> Custom 404 Page
  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      <Navbar />
      <AnimatePresence mode="wait">
        <motion.main
          key="not-found-page"
          variants={pageTransitionVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex-1"
        >
          <NotFoundPage />
        </motion.main>
      </AnimatePresence>
      <Footer />
    </div>
  );
};

const AppContent: React.FC = () => {
  const { currentPath, currentUser, isQrScannerOpen, setIsQrScannerOpen, navigate } = useApp();
  const fallbackDashboardPath =
    currentUser?.role === 'ADMIN'
      ? '/admin/dashboard'
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
      <AppRouter />
      <QrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onSuccess={(shopSlug: string) => {
          setIsQrScannerOpen(false);
          navigate(`/s/${shopSlug}`);
        }}
      />
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
