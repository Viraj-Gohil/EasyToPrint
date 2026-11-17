import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useApp } from '../../lib/store';
import { ADMIN_DASHBOARD_PATH, isAdminRoutePath } from '../../lib/adminConfig';
import {
  Printer,
  Shield,
  Store,
  Menu,
  X,
  ArrowRight,
  ChevronDown,
  HelpCircle,
  BookOpen,
  Headphones,
  QrCode
} from 'lucide-react';

const HelpCenterModal = lazy(() =>
  import('./NavbarModals').then((m) => ({ default: m.HelpCenterModal }))
);
const ContactSupportModal = lazy(() =>
  import('./NavbarModals').then((m) => ({ default: m.ContactSupportModal }))
);

export const Navbar: React.FC = () => {
  const { currentUser, logout, currentPath, navigate, activeShop, setIsQrScannerOpen } = useApp();

  // Mobile menu & Dropdown states
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  // Lazy Modals
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  const [contactSupportOpen, setContactSupportOpen] = useState(false);

  // Active section spy
  const [activeSection, setActiveSection] = useState<string>('');

  const resourcesDropdownRef = useRef<HTMLDivElement>(null);

  // Detect customer flow route
  const isCustomerFlow =
    currentPath.startsWith('/s/') ||
    currentPath.startsWith('#s/') ||
    currentPath.startsWith('s/') ||
    currentPath.startsWith('/customer');

  // Close resources dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        resourcesDropdownRef.current &&
        !resourcesDropdownRef.current.contains(event.target as Node)
      ) {
        setResourcesOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Listen for Escape key to close dropdowns and modals
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setResourcesOpen(false);
        setHelpCenterOpen(false);
        setContactSupportOpen(false);
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Scroll spy to highlight active section
  useEffect(() => {
    const handleScroll = () => {
      if (currentPath === '/' || currentPath === '') {
        const sections = ['faq', 'pricing', 'features', 'how-it-works', 'platform'];
        const scrollPosition = window.scrollY + 160;

        for (const sectionId of sections) {
          const el = document.getElementById(sectionId);
          if (el) {
            const top = el.offsetTop;
            const height = el.offsetHeight;
            if (scrollPosition >= top && scrollPosition < top + height) {
              setActiveSection(sectionId);
              return;
            }
          }
        }
        if (window.scrollY < 200) {
          setActiveSection('');
        }
      } else if (currentPath === '/pricing' || currentPath.startsWith('/pricing')) {
        setActiveSection('pricing');
      } else {
        setActiveSection('');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [currentPath]);

  // Unified smooth scroll helper
  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    setResourcesOpen(false);

    if (currentPath !== '/') {
      navigate('/');
      setTimeout(() => {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 150);
    } else {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  return (
    <>
      {/* ========================================================================= */}
      {/* FLOATING PILL NAVBAR (MATCHING QWIKPRINT REFERENCE DESIGN)                 */}
      {/* ========================================================================= */}
      <header className="sticky top-3 sm:top-5 z-50 w-full px-4 sm:px-6 flex justify-center pointer-events-none font-['Manrope',sans-serif] mb-1">
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-full border border-[#E1E7E1] shadow-[0_10px_35px_-5px_rgba(0,0,0,0.07),0_2px_8px_-2px_rgba(0,0,0,0.04)] px-5 py-2.5 sm:px-7 sm:py-2.5 flex items-center justify-between gap-5 sm:gap-7 transition-all duration-300 max-w-5xl w-full sm:w-auto">
          
          {/* --------------------------------------------------------------------- */}
          {/* DESKTOP LEFT LINKS: About Us | Features | How It Works               */}
          {/* --------------------------------------------------------------------- */}
          {!isCustomerFlow && (
            <div className="hidden md:flex items-center gap-5 lg:gap-6 text-sm font-medium text-[#111111]">
              <a
                href="/about"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPath === '/') {
                    scrollToSection('platform');
                  } else {
                    navigate('/about');
                  }
                }}
                className={`transition-colors hover:text-[#00B32D] cursor-pointer whitespace-nowrap ${
                  activeSection === 'platform' || currentPath === '/about' ? 'text-[#00B32D] font-bold' : 'text-[#111111]'
                }`}
              >
                About Us
              </a>

              <a
                href="/features"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPath === '/') {
                    scrollToSection('features');
                  } else {
                    navigate('/features');
                  }
                }}
                className={`transition-colors hover:text-[#00B32D] cursor-pointer whitespace-nowrap ${
                  activeSection === 'features' || currentPath === '/features' ? 'text-[#00B32D] font-bold' : 'text-[#111111]'
                }`}
              >
                Features
              </a>

              <a
                href="/qr-print-ordering"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPath === '/') {
                    scrollToSection('how-it-works');
                  } else {
                    navigate('/qr-print-ordering');
                  }
                }}
                className={`transition-colors hover:text-[#00B32D] cursor-pointer whitespace-nowrap ${
                  activeSection === 'how-it-works' || currentPath === '/qr-print-ordering' ? 'text-[#00B32D] font-bold' : 'text-[#111111]'
                }`}
              >
                How It Works
              </a>
            </div>
          )}

          {/* --------------------------------------------------------------------- */}
          {/* CENTRE: BRAND LOGO (EXACTLY AS IN REFERENCE IMAGE)                   */}
          {/* --------------------------------------------------------------------- */}
          <div className="flex items-center gap-2.5 shrink-0 mx-auto md:mx-0 text-bold">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                if (currentPath !== '/') {
                  navigate('/');
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-2 text-left group focus:outline-hidden cursor-pointer shrink-0"
              title="EasyToPrint - Home"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center shrink-0 border border-[#A7F3D0]/70">
                <Printer className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-[#00B32D]" />
              </div>
              <span className="font-extrabold text-base sm:text-lg text-[#111111] tracking-tight font-['Manrope',sans-serif]">
                Easy<span className="text-[#00B32D]">To</span>Print
              </span>
            </a>

            {/* Context indicator if inside Customer or Console */}
            {isCustomerFlow && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-[#008F25] bg-[#E8F8EC] rounded-full border border-[#A7F3D0] max-w-[150px] truncate">
                <Store className="w-3 h-3 text-[#00B32D] shrink-0" />
                <span className="truncate">{activeShop.name}</span>
              </span>
            )}
            {currentPath.startsWith('/shop') && (
              <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-[#008F25] bg-[#E8F8EC] rounded-full border border-[#A7F3D0]">
                <Store className="w-3 h-3 text-[#00B32D]" />
                <span>Shop</span>
              </span>
            )}
            {isAdminRoutePath(currentPath) && currentUser?.role === 'ADMIN' && (
              <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-purple-700 bg-purple-50 rounded-full border border-purple-200">
                <Shield className="w-3 h-3 text-purple-600" />
                <span>Admin</span>
              </span>
            )}
          </div>

          {/* --------------------------------------------------------------------- */}
          {/* DESKTOP RIGHT LINKS & ACTIONS: Pricing | Contact Us | Login/CTA      */}
          {/* --------------------------------------------------------------------- */}
          {!isCustomerFlow && (
            <div className="hidden md:flex items-center gap-4 lg:gap-5 text-sm font-medium text-[#111111]">
              <a
                href="/pricing"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPath === '/') {
                    scrollToSection('pricing');
                  } else {
                    navigate('/pricing');
                  }
                }}
                className={`transition-colors hover:text-[#00B32D] cursor-pointer whitespace-nowrap ${
                  activeSection === 'pricing' || currentPath === '/pricing' ? 'text-[#00B32D] font-bold' : 'text-[#111111]'
                }`}
              >
                Pricing
              </a>

              {/* Resources dropdown trigger */}
              <div className="relative" ref={resourcesDropdownRef}>
                <button
                  type="button"
                  onClick={() => setResourcesOpen(!resourcesOpen)}
                  className={`inline-flex items-center gap-1 transition-colors hover:text-[#00B32D] cursor-pointer whitespace-nowrap ${
                    resourcesOpen || activeSection === 'faq' ? 'text-[#00B32D] font-bold' : 'text-[#111111]'
                  }`}
                >
                  <span>Resources</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      resourcesOpen ? 'rotate-180 text-[#00B32D]' : 'text-[#646B65]'
                    }`}
                  />
                </button>

                {/* Dropdown Menu */}
                {resourcesOpen && (
                  <div className="absolute right-0 mt-3 w-64 rounded-2xl bg-white border border-[#E1E7E1] shadow-xl p-2 z-50 etp-dropdown-enter">
                    <a
                      href="/how-it-works"
                      onClick={(e) => {
                        e.preventDefault();
                        setResourcesOpen(false);
                        navigate('/how-it-works');
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F7F8F7] text-left transition-colors cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#E8F8EC] text-[#00B32D] group-hover:bg-[#00B32D] group-hover:text-white transition-colors flex items-center justify-center shrink-0">
                        <Printer className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#111111] group-hover:text-[#00B32D] transition-colors">
                          How It Works
                        </div>
                        <p className="text-[11px] text-[#646B65]">QR scan to auto-print flow</p>
                      </div>
                    </a>

                    <a
                      href="/blog"
                      onClick={(e) => {
                        e.preventDefault();
                        setResourcesOpen(false);
                        navigate('/blog');
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F7F8F7] text-left transition-colors cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#E8F8EC] text-[#00B32D] group-hover:bg-[#00B32D] group-hover:text-white transition-colors flex items-center justify-center shrink-0">
                        <BookOpen className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#111111] group-hover:text-[#00B32D] transition-colors">
                          Guides &amp; Blog
                        </div>
                        <p className="text-[11px] text-[#646B65]">Print shop automation playbooks</p>
                      </div>
                    </a>

                    <a
                      href="/faq"
                      onClick={(e) => {
                        e.preventDefault();
                        setResourcesOpen(false);
                        if (currentPath === '/') {
                          scrollToSection('faq');
                        } else {
                          navigate('/faq');
                        }
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F7F8F7] text-left transition-colors cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#E8F8EC] text-[#00B32D] group-hover:bg-[#00B32D] group-hover:text-white transition-colors flex items-center justify-center shrink-0">
                        <HelpCircle className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#111111] group-hover:text-[#00B32D] transition-colors">
                          FAQ
                        </div>
                        <p className="text-[11px] text-[#646B65]">Frequently asked questions</p>
                      </div>
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        setResourcesOpen(false);
                        setHelpCenterOpen(true);
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F7F8F7] text-left transition-colors cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#E8F8EC] text-[#00B32D] group-hover:bg-[#00B32D] group-hover:text-white transition-colors flex items-center justify-center shrink-0">
                        <BookOpen className="w-4 h-4 stroke-[2.2]" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#111111] group-hover:text-[#008F25] transition-colors">
                          Help Center
                        </div>
                        <p className="text-[11px] text-[#646B65]">Guides &amp; printer manuals</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              {/* Direct Contact us action as in the reference image */}
              <a
                href="/contact"
                onClick={(e) => {
                  e.preventDefault();
                  setContactSupportOpen(true);
                }}
                className="transition-colors hover:text-[#00B32D] cursor-pointer whitespace-nowrap"
              >
                Contact us
              </a>

              {/* Separation divider */}
              <div className="h-4 w-px bg-[#E1E7E1] mx-0.5" />

              {!currentUser ? (
                <div className="flex items-center gap-3">
                  <a
                    href="/auth/login"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/auth/login');
                    }}
                    className="text-xs lg:text-sm font-semibold text-[#111111] hover:text-[#008F25] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Login
                  </a>

                  <a
                    href="/auth/register"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/auth/register');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs lg:text-sm font-bold text-white bg-[#00B32D] hover:bg-[#008F25] active:scale-[0.98] rounded-full transition-all shadow-xs cursor-pointer whitespace-nowrap"
                  >
                    <span>Get Started</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[2.4]" />
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(currentUser.role === 'ADMIN' ? ADMIN_DASHBOARD_PATH : '/shop/dashboard')
                    }
                    className="inline-flex items-center justify-center gap-1 px-3 py-1 text-xs font-bold text-white bg-[#00B32D] hover:bg-[#008F25] active:scale-[0.98] rounded-full transition-all shadow-xs cursor-pointer whitespace-nowrap"
                  >
                    <span>Console</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="text-xs font-medium text-[#646B65] hover:text-[#DC2626] transition-colors cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}

          {/* --------------------------------------------------------------------- */}
          {/* MOBILE TOGGLE BUTTON                                                  */}
          {/* --------------------------------------------------------------------- */}
          <div className="flex md:hidden items-center gap-2">
            <button
              type="button"
              onClick={() => setIsQrScannerOpen(true)}
              className="px-2.5 py-1 text-xs font-semibold text-white bg-[#00A61C] hover:bg-[#008F25] rounded-full transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 shadow-2xs"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Scan QR</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              className="p-1.5 rounded-full text-[#111111] hover:bg-[#F7F8F7] border border-[#E1E7E1] cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* MOBILE FLOATING MENU DROPDOWN                                          */}
        {/* ======================================================================= */}
        {mobileMenuOpen && (
          <div className="pointer-events-auto absolute top-16 left-4 right-4 sm:left-auto sm:right-auto sm:w-96 mx-auto rounded-3xl bg-white/98 backdrop-blur-md border border-[#E1E7E1] shadow-2xl p-5 space-y-3 font-['Manrope',sans-serif] z-50 etp-dropdown-enter">
            <div className="flex flex-col space-y-1 text-sm font-semibold text-[#111111]">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setIsQrScannerOpen(true);
                }}
                className="px-3.5 py-2.5 text-left rounded-xl bg-[#E8F8EC] hover:bg-[#d5f3dc] text-[#00A61C] flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-[#00A61C]" />
                  <span>Scan Counter QR</span>
                </div>
                <ArrowRight className="w-4 h-4 text-[#00A61C]" />
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('platform')}
                className="px-3.5 py-2.5 text-left rounded-xl hover:bg-[#F7F8F7] flex items-center justify-between"
              >
                <span>About Us</span>
                <ArrowRight className="w-4 h-4 text-[#646B65]" />
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('features')}
                className="px-3.5 py-2.5 text-left rounded-xl hover:bg-[#F7F8F7] flex items-center justify-between"
              >
                <span>Features</span>
                <ArrowRight className="w-4 h-4 text-[#646B65]" />
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('how-it-works')}
                className="px-3.5 py-2.5 text-left rounded-xl hover:bg-[#F7F8F7] flex items-center justify-between"
              >
                <span>How It Works</span>
                <ArrowRight className="w-4 h-4 text-[#646B65]" />
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('pricing')}
                className="px-3.5 py-2.5 text-left rounded-xl hover:bg-[#F7F8F7] flex items-center justify-between"
              >
                <span>Pricing</span>
                <ArrowRight className="w-4 h-4 text-[#646B65]" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setContactSupportOpen(true);
                }}
                className="px-3.5 py-2.5 text-left rounded-xl hover:bg-[#F7F8F7] flex items-center justify-between"
              >
                <span>Contact us</span>
                <Headphones className="w-4 h-4 text-[#00B32D]" />
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('faq')}
                className="px-3.5 py-2.5 text-left rounded-xl hover:bg-[#F7F8F7] flex items-center justify-between"
              >
                <span>FAQ</span>
                <HelpCircle className="w-4 h-4 text-[#646B65]" />
              </button>

              <a
                href="/blog"
                onClick={(e) => {
                  e.preventDefault();
                  setMobileMenuOpen(false);
                  navigate('/blog');
                }}
                className="px-3.5 py-2.5 text-left rounded-xl hover:bg-[#F7F8F7] flex items-center justify-between"
              >
                <span>Guides &amp; Blog</span>
                <BookOpen className="w-4 h-4 text-[#00B32D]" />
              </a>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setHelpCenterOpen(true);
                }}
                className="px-3.5 py-2.5 text-left rounded-xl hover:bg-[#F7F8F7] flex items-center justify-between"
              >
                <span>Help Center</span>
                <BookOpen className="w-4 h-4 text-[#646B65]" />
              </button>
            </div>

            {/* Mobile Actions */}
            <div className="pt-3 border-t border-[#E1E7E1] flex flex-col gap-2">
              {!currentUser ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate('/auth/login');
                    }}
                    className="w-full py-2.5 px-4 bg-[#F7F8F7] hover:bg-[#E1E7E1] text-[#111111] rounded-full text-sm font-semibold transition-colors text-center cursor-pointer"
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate('/auth/register');
                    }}
                    className="w-full py-2.5 px-4 bg-[#00B32D] hover:bg-[#008F25] text-white rounded-full text-sm font-bold transition-colors text-center shadow-xs cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Get Started</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.4]" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate(
                        currentUser.role === 'ADMIN' ? ADMIN_DASHBOARD_PATH : '/shop/dashboard'
                      );
                    }}
                    className="w-full py-2.5 px-4 bg-[#00B32D] hover:bg-[#008F25] text-white rounded-full text-sm font-semibold transition-colors text-center shadow-xs cursor-pointer"
                  >
                    {currentUser.role === 'ADMIN' ? 'Admin Console' : 'Shop Console'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                    className="w-full py-2 px-4 text-xs font-semibold text-[#DC2626] hover:bg-rose-50 rounded-full transition-colors text-center cursor-pointer"
                  >
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Lazy-Loaded Modals */}
      {helpCenterOpen && (
        <Suspense fallback={null}>
          <HelpCenterModal onClose={() => setHelpCenterOpen(false)} />
        </Suspense>
      )}
      {contactSupportOpen && (
        <Suspense fallback={null}>
          <ContactSupportModal onClose={() => setContactSupportOpen(false)} />
        </Suspense>
      )}
    </>
  );
};
