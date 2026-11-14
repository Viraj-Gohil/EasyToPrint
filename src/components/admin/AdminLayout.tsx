import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../lib/store';
import { adminPath } from '../../lib/adminConfig';
import {
  Shield,
  LayoutDashboard,
  BarChart3,
  Store,
  Printer,
  Users,
  HardDrive,
  Crown,
  Layers,
  CreditCard,
  LifeBuoy,
  ScrollText,
  Activity,
  Sliders,
  Menu,
  X,
  Search,
  ExternalLink,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight
} from 'lucide-react';
import { AdminCommandPalette } from './AdminCommandPalette';

interface AdminLayoutProps {
  children: React.ReactNode;
  activeTab: string;
}

interface NavSection {
  title: string;
  items: {
    id: string;
    label: string;
    icon: React.ElementType;
    path: string;
    badge?: number | string;
    badgeColor?: string;
  }[];
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children, activeTab }) => {
  const {
    currentUser,
    supportTickets,
    adminRazorpay,
    logout,
    navigate
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Persisted Collapsible Sidebar
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return (
        localStorage.getItem('easytoprint_admin_sidebar_collapsed') === 'true' ||
        localStorage.getItem('printflow_admin_sidebar_collapsed') === 'true'
      );
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem('easytoprint_admin_sidebar_collapsed', String(next));
    } catch {}
  };

  // Keyboard shortcut for Command Palette (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Real-time Badge Computations
  const openTicketsCount = (supportTickets || []).filter(
    (t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED'
  ).length;

  // Organized Navigation Sections (Global Print Queue & Electron Agent Fleet removed per user instruction)
  const navSections: NavSection[] = [
    {
      title: 'OVERVIEW',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          path: adminPath('dashboard')
        },
        {
          id: 'analytics',
          label: 'Analytics',
          icon: BarChart3,
          path: adminPath('analytics')
        }
      ]
    },
    {
      title: 'TEAMS & HARDWARE',
      items: [
        {
          id: 'shops',
          label: 'Shops Management',
          icon: Store,
          path: adminPath('shops')
        },
        {
          id: 'users',
          label: 'Users Management',
          icon: Users,
          path: adminPath('users')
        },
        {
          id: 'printers',
          label: 'Printers',
          icon: Printer,
          path: adminPath('printers')
        }
      ]
    },
    {
      title: 'BILLING & STORAGE',
      items: [
        {
          id: 'plans',
          label: 'Subscriptions & Plans',
          icon: Crown,
          path: adminPath('plans')
        },
        {
          id: 'payments',
          label: 'Payments & Revenue',
          icon: CreditCard,
          path: adminPath('payments')
        },
        {
          id: 'storage',
          label: 'Storage Management',
          icon: HardDrive,
          path: adminPath('storage')
        }
      ]
    },
    {
      title: 'SUPPORT & SECURITY',
      items: [
        {
          id: 'support',
          label: 'Support Tickets',
          icon: LifeBuoy,
          path: adminPath('support'),
          badge: openTicketsCount > 0 ? openTicketsCount : undefined,
          badgeColor: 'bg-emerald-50 text-[#00B52D] font-bold border border-emerald-200'
        },
        {
          id: 'audit-logs',
          label: 'Audit Logs',
          icon: ScrollText,
          path: adminPath('audit-logs')
        },
        {
          id: 'health',
          label: 'System Health',
          icon: Activity,
          path: adminPath('health')
        }
      ]
    },
    {
      title: 'CONFIGURATION',
      items: [
        {
          id: 'platform-settings',
          label: 'Platform Settings',
          icon: Sliders,
          path: adminPath('platform-settings')
        }
      ]
    }
  ];

  const isTabActive = (itemId: string) => {
    if (activeTab === itemId) return true;
    if (itemId === 'plans' && (activeTab === 'plans' || activeTab === 'saas-plans' || activeTab === 'subscriptions')) return true;
    if (itemId === 'health' && (activeTab === 'health' || activeTab === 'system-health')) return true;
    if (itemId === 'platform-settings' && (activeTab === 'platform-settings' || activeTab === 'settings')) return true;
    return false;
  };

  const getPageTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard': return 'Dashboard Overview';
      case 'shops': return 'Shops Management';
      case 'users': return 'Users Management';
      case 'printers': return 'Printers Management';
      case 'plans':
      case 'saas-plans':
      case 'subscriptions': return 'Subscriptions & Plans';
      case 'payments': return 'Payments & Revenue';
      case 'storage': return 'Storage Management';
      case 'analytics': return 'Platform Analytics';
      case 'support': return 'Support Tickets';
      case 'audit-logs': return 'Security & Audit Logs';
      case 'health':
      case 'system-health': return 'System Health';
      case 'platform-settings':
      case 'settings': return 'Platform Settings';
      default: return 'Admin Console';
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7] text-[#080808] flex flex-col lg:flex-row font-sans">
      {/* Mobile Top Bar */}
      <div className="lg:hidden bg-white text-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#00B52D] text-white flex items-center justify-center shadow-xs">
            <Printer className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-xs text-[#080808] block">EasyToPrint Admin</span>
            <span className="text-[10px] text-[#00B52D] font-semibold">Master Control</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
            title="Quick Search (Cmd+K)"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 transition-opacity"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-white text-slate-700 flex flex-col justify-between transform transition-all duration-200 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen border-r border-slate-200 shadow-xl lg:shadow-none overflow-hidden ${
          mobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        {/* Top Header & EasyToPrint Branding */}
        <div className="p-3.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-[#00B52D] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <Printer className="w-4 h-4 stroke-[2.2]" />
            </div>
            {!isCollapsed && (
              <div className="truncate">
                <span className="text-xs font-extrabold text-[#080808] block truncate tracking-tight">
                  Easy<span className="text-[#00B52D]">To</span>Print
                </span>
                <span className="text-[10px] text-[#777777] font-semibold tracking-wide block uppercase">
                  Super Admin
                </span>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            onClick={toggleCollapse}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1 rounded-lg text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Command Palette Trigger Button */}
        <div className="p-2.5 shrink-0">
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs bg-slate-50 hover:bg-emerald-50/60 text-slate-600 hover:text-[#00B52D] border border-slate-200 hover:border-emerald-200 transition-colors cursor-pointer ${
              isCollapsed ? 'justify-center' : 'justify-between'
            }`}
            title="Search & Quick Jump (⌘K)"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#00B52D]" />
              {!isCollapsed && <span className="text-[11px] text-[#777777] font-medium">Quick Nav...</span>}
            </div>
            {!isCollapsed && (
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-200 rounded text-slate-400 shadow-2xs">
                ⌘K
              </kbd>
            )}
          </button>
        </div>

        {/* Navigation Scrollable Body */}
        <div className="px-2.5 py-2 space-y-4 overflow-y-auto flex-1 min-h-0 scrollbar-thin">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              {/* Section Header */}
              {!isCollapsed ? (
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#777777]">
                  {section.title}
                </div>
              ) : (
                <div className="h-2 flex items-center justify-center">
                  <div className="w-4 border-t border-slate-200" />
                </div>
              )}

              {/* Items */}
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isTabActive(item.id);

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      navigate(item.path);
                      setMobileMenuOpen(false);
                    }}
                    title={`${item.label} (${section.title})`}
                    className={`w-full group relative flex items-center rounded-xl transition-all cursor-pointer text-left ${
                      isCollapsed
                        ? 'justify-center p-2'
                        : 'px-2.5 py-1.5 gap-2.5 text-xs'
                    } ${
                      active
                        ? 'text-[#080808] font-bold bg-emerald-50 border border-emerald-200 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        active ? 'text-[#00B52D]' : 'text-slate-400 group-hover:text-slate-700'
                      }`}
                    />

                    {!isCollapsed && (
                      <span className="truncate flex-1 text-xs">
                        {item.label}
                      </span>
                    )}

                    {/* Badge */}
                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-bold rounded-full transition-all ${
                          isCollapsed
                            ? 'absolute top-1 right-1 w-2 h-2 p-0 bg-[#00B52D]'
                            : `px-1.5 py-0.5 ${item.badgeColor || 'bg-emerald-50 text-[#00B52D]'}`
                        }`}
                      >
                        {!isCollapsed && item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* User Profile & Footer Area */}
        <div className="shrink-0 p-3 border-t border-slate-200 bg-slate-50/80 space-y-2">
          {/* Gateway Status Pill */}
          {!isCollapsed ? (
            <div className="flex items-center justify-between text-[11px] px-2 py-1 bg-white rounded-lg border border-slate-200">
              <span className="text-[#777777] font-medium flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${adminRazorpay.keyId ? 'bg-[#00B52D]' : 'bg-amber-500'}`} />
                Gateway
              </span>
              <span className="font-bold text-slate-800">
                {adminRazorpay.isTestMode ? 'Test Mode' : 'Live'}
              </span>
            </div>
          ) : (
            <div className="flex justify-center" title={`Gateway: ${adminRazorpay.isTestMode ? 'Test' : 'Live'}`}>
              <span className={`w-2 h-2 rounded-full ${adminRazorpay.keyId ? 'bg-[#00B52D]' : 'bg-amber-500'}`} />
            </div>
          )}

          {/* Admin Profile & Actions */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-emerald-50 text-[#00B52D] flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-200">
                AD
              </div>
              {!isCollapsed && (
                <div className="truncate">
                  <span className="text-xs font-bold text-[#080808] block truncate">
                    {currentUser?.fullName || 'Platform Admin'}
                  </span>
                  <span className="text-[10px] text-[#777777] font-mono block truncate">
                    {currentUser?.email || 'Authorized Session'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Logout */}
              <button
                onClick={() => logout()}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white transition-colors cursor-pointer"
                title="Sign out of Admin"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen overflow-x-hidden bg-[#F7F8F7] relative">
        {/* Subtle Architectural Grid matching Main Page */}
        <div
          className="fixed inset-0 pointer-events-none z-0 opacity-[0.35]"
          style={{
            backgroundImage: `linear-gradient(to right, #E1E7E1 1px, transparent 1px), linear-gradient(to bottom, #E1E7E1 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />

        {/* Top Breadcrumb & Page Context Bar */}
        <header className="bg-white/95 backdrop-blur-md border-b border-[#E1E7E1] px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2 text-xs text-[#777777]">
            <span className="font-semibold text-slate-500">Admin</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-bold text-[#080808]">{getPageTitle(activeTab)}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCommandPaletteOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 bg-[#F7F8F7] border border-[#E1E7E1] rounded-lg hover:border-[#00B52D]/50 hover:text-[#00B52D] transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-[#00B52D]" />
              <span>Search</span>
              <kbd className="px-1 text-[10px] font-mono bg-white border border-slate-200 rounded">⌘K</kbd>
            </button>
          </div>
        </header>

        {/* Content Area with Animation */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto relative z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Global Command Palette */}
      <AdminCommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </div>
  );
};
