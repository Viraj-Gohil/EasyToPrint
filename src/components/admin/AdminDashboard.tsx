import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../lib/store';
import {
  Store,
  Printer,
  CreditCard,
  Users,
  HardDrive,
  Crown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Hash,
  ExternalLink,
  DollarSign
} from 'lucide-react';
import { authenticatedFetch } from '../../lib/apiConfig';
import { adminPath } from '../../lib/adminConfig';
import { Button } from '../ui/Button';

interface DashboardStats {
  totalShops: number;
  activeShops: number;
  inactiveShops: number;
  totalUsers: number;
  totalJobs: number;
  pendingJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalRevenue: number;
  successfulPaymentsCount: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  registeredPrinters: number;
  onlinePrinters: number;
  offlinePrinters: number;
  storageUsage: {
    cloudBytesUsed: number;
    cloudFilesCount: number;
    agentDiskBytesUsed: number;
  };
}

interface RecentShop {
  id: string;
  name: string;
  slug: string;
  shopCode?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  address?: string | null;
  city?: string | null;
  status: string;
  planName?: string | null;
  createdAt?: string | null;
}

interface RecentPayment {
  id: string;
  shopId: string;
  shopName: string;
  purpose: string;
  provider: string;
  providerOrderId: string;
  amount: number;
  status: string;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const AdminDashboard: React.FC = () => {
  const { navigate } = useApp();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentShops, setRecentShops] = useState<RecentShop[]>([]);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchDashboardStats = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await authenticatedFetch('/api/admin/dashboard-stats');

      if (!res.ok) {
        throw new Error(`Failed to load dashboard metrics (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data.success && data.stats) {
        setStats(data.stats);
        setRecentShops(Array.isArray(data.recentShops) ? data.recentShops : []);
        setRecentPayments(Array.isArray(data.recentPayments) ? data.recentPayments : []);
      } else {
        throw new Error(data.error || 'Failed to parse dashboard data.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to load data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboardStats();
  }, [fetchDashboardStats]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* 1. COMPACT PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#080808]">
              Platform Overview
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-[#00B52D] border border-emerald-200">
              Live Database
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#777777] mt-0.5 leading-relaxed">
            Real-time multi-tenant operations, financial settlements, and infrastructure health.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardStats}
            disabled={isLoading}
            className="border-slate-200 hover:border-slate-300 text-slate-700 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#00B52D] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* 2. ERROR STATE WITH RETRY */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-800">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <p className="font-bold">Unable to load data. Please try again.</p>
              <p className="text-[11px] text-rose-600 mt-0.5">{errorMessage}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardStats}
            className="border-rose-300 bg-white hover:bg-rose-100 text-rose-800 font-semibold shrink-0"
          >
            Retry
          </Button>
        </div>
      )}

      {/* 3. AUTHORITATIVE KPI CARDS (CLEAN EASYTOPRINT THEME) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Registered Shops */}
        <div
          onClick={() => navigate(adminPath('shops'))}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:border-[#00B52D]/50 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-[#777777] group-hover:text-[#080808] transition-colors">Total Shops</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#00B52D] flex items-center justify-center border border-emerald-200">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#080808] font-mono">
            {isLoading ? '...' : stats?.totalShops ?? 0}
          </p>
          <span className="text-[11px] text-[#00B52D] font-medium flex items-center gap-1 mt-1">
            <CheckCircle2 className="w-3 h-3" />
            {stats?.activeShops ?? 0} active SaaS tenants
          </span>
        </div>

        {/* Total Registered Users */}
        <div
          onClick={() => navigate(adminPath('users'))}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:border-[#00B52D]/50 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-[#777777] group-hover:text-[#080808] transition-colors">Registered Users</span>
            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#080808] font-mono">
            {isLoading ? '...' : stats?.totalUsers ?? 0}
          </p>
          <span className="text-[11px] text-[#777777] font-medium mt-1 block">
            Admins, owners & counter staff
          </span>
        </div>

        {/* Gross Revenue (Successful Only) */}
        <div
          onClick={() => navigate(adminPath('payments'))}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:border-[#00B52D]/50 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-[#777777] group-hover:text-[#080808] transition-colors">Gross Revenue (₹)</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#00B52D] flex items-center justify-center border border-emerald-200">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#080808] font-mono">
            ₹{isLoading ? '...' : (stats?.totalRevenue ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] text-[#00B52D] font-medium mt-1 block">
            {stats?.successfulPaymentsCount ?? 0} successful settlements
          </span>
        </div>

        {/* Registered Hardware Printers */}
        <div
          onClick={() => navigate(adminPath('printers'))}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs hover:border-[#00B52D]/50 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-[#777777] group-hover:text-[#080808] transition-colors">Printers Hardware</span>
            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200">
              <Printer className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#080808] font-mono">
            {isLoading ? '...' : `${stats?.onlinePrinters ?? 0} / ${stats?.registeredPrinters ?? 0}`}
          </p>
          <span className="text-[11px] text-[#777777] font-medium mt-1 block">
            Online / registered devices
          </span>
        </div>
      </div>

      {/* 4. SECONDARY METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Active Subscriptions */}
        <div
          onClick={() => navigate(adminPath('plans'))}
          className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between cursor-pointer hover:border-slate-300 transition-colors"
        >
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-[#777777]">SaaS Subscriptions</span>
            <p className="text-xl font-bold font-mono text-[#080808]">
              {isLoading ? '...' : stats?.activeSubscriptions ?? 0} active
            </p>
            <span className="text-[10px] text-slate-500">{stats?.expiredSubscriptions ?? 0} expired or trialing</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-[#E8F8EC] text-[#008F25] flex items-center justify-center border border-[#A7F3D0]">
            <Crown className="w-4 h-4" />
          </div>
        </div>

        {/* Cloud Document Storage */}
        <div
          onClick={() => navigate(adminPath('storage'))}
          className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between cursor-pointer hover:border-slate-300 transition-colors"
        >
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-[#777777]">Cloud Storage</span>
            <p className="text-xl font-bold font-mono text-[#080808]">
              {isLoading ? '...' : formatBytes(stats?.storageUsage?.cloudBytesUsed ?? 0)}
            </p>
            <span className="text-[10px] text-slate-500">{stats?.storageUsage?.cloudFilesCount ?? 0} retained artifacts</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#00B52D] flex items-center justify-center border border-emerald-200">
            <HardDrive className="w-4 h-4" />
          </div>
        </div>

        {/* Total Platform Print Jobs */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-[#777777]">Print Job Volume</span>
            <p className="text-xl font-bold font-mono text-[#080808]">
              {isLoading ? '...' : stats?.totalJobs ?? 0} jobs
            </p>
            <span className="text-[10px] text-emerald-600 font-medium">
              {stats?.completedJobs ?? 0} completed • {stats?.pendingJobs ?? 0} in queue
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#00B52D] flex items-center justify-center border border-emerald-200">
            <Printer className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 5. REGISTERED XEROX SHOPS TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-[#F7F7F7]">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#080808]">Registered Xerox Shops</h2>
            <p className="text-xs text-[#777777]">Tenants operating on the EasyToPrint network with 6-digit shop codes</p>
          </div>
          <button
            onClick={() => navigate(adminPath('shops'))}
            className="text-xs font-bold text-[#00B52D] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>View All Shops</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F7F7] text-[#080808] font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Shop Name</th>
                <th className="py-3 px-4">6-Digit Shop Code</th>
                <th className="py-3 px-4">Owner Email</th>
                <th className="py-3 px-4">SaaS Plan</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={`skel-s-${i}`}>
                    <td className="py-3 px-4"><div className="h-4 w-32 bg-slate-100 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-16 bg-slate-100 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-28 bg-slate-100 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-20 bg-slate-100 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-12 bg-slate-100 rounded animate-pulse" /></td>
                    <td className="py-3 px-4 text-right"><div className="h-4 w-16 bg-slate-100 rounded ml-auto animate-pulse" /></td>
                  </tr>
                ))
              ) : recentShops.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <p className="text-xs font-bold text-[#080808]">No data available yet.</p>
                    <p className="text-[11px] text-[#777777] mt-0.5">No shops registered in the database.</p>
                  </td>
                </tr>
              ) : (
                recentShops.map((shop) => (
                  <tr key={shop.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 block">{shop.name}</span>
                      <button
                        type="button"
                        onClick={() => navigate(`/s/${shop.slug}`)}
                        className="text-[11px] text-[#00B52D] hover:underline flex items-center gap-1 font-mono cursor-pointer mt-0.5"
                      >
                        <span>/s/{shop.slug}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    </td>
                    <td className="py-3.5 px-4">
                      {shop.shopCode ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#00B52D] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <Hash className="w-3 h-3" />
                          {shop.shopCode}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="text-slate-800 text-xs font-mono">{shop.ownerEmail || 'No email provided'}</p>
                      {shop.city && <p className="text-[11px] text-slate-400">{shop.city}</p>}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[#008F25]">
                      {shop.planName || 'Growth Plan'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          shop.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-[#00B52D]'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {shop.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => navigate(`/s/${shop.slug}`)}
                        className="px-2.5 py-1 text-slate-700 hover:bg-slate-100 rounded-lg text-[11px] font-semibold cursor-pointer border border-slate-200"
                      >
                        View Shop
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. RECENT PLATFORM PAYMENTS TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-[#F7F7F7]">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#080808]">Recent Platform Payments</h2>
            <p className="text-xs text-[#777777]">Actual payment orders processed through the integrated gateway</p>
          </div>
          <button
            onClick={() => navigate(adminPath('payments'))}
            className="text-xs font-bold text-[#00B52D] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>View All Payments</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F7F7F7] text-[#080808] font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Order Reference</th>
                <th className="py-3 px-4">Associated Shop</th>
                <th className="py-3 px-4">Purpose</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={`skel-pay-${i}`}>
                    <td className="py-3 px-4"><div className="h-4 w-24 bg-slate-100 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-28 bg-slate-100 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-16 bg-slate-100 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-16 bg-slate-100 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-12 bg-slate-100 rounded animate-pulse" /></td>
                    <td className="py-3 px-4 text-right"><div className="h-4 w-20 bg-slate-100 rounded ml-auto animate-pulse" /></td>
                  </tr>
                ))
              ) : recentPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    <p className="text-xs font-bold text-[#080808]">No data available yet.</p>
                    <p className="text-[11px] text-[#777777] mt-0.5">No payments have been processed yet.</p>
                  </td>
                </tr>
              ) : (
                recentPayments.map((p) => {
                  const isSuccess = ['PAID', 'SUCCESS', 'SETTLED', 'CAPTURED'].includes(p.status);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900">
                        {p.providerOrderId ? p.providerOrderId.slice(0, 16) : p.id.slice(0, 12)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {p.shopName}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                        {p.purpose || 'PRINT_JOB'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        ₹{(p.amount || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isSuccess ? 'bg-emerald-50 text-[#00B52D]' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-500">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : 'N/A'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
