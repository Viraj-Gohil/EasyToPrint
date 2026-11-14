import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Filter,
  RefreshCw,
  Mail,
  Phone,
  Store,
  Shield,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Hash
} from 'lucide-react';
import { authenticatedFetch } from '../../lib/apiConfig';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '../ui/Table';

interface AdminUserRecord {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: 'ADMIN' | 'SHOP_OWNER' | 'STAFF' | 'CUSTOMER';
  shopId: string;
  shopName: string;
  shopCode?: string | null;
  isEmailVerified: boolean;
  accountStatus: string;
  createdAt: string;
  updatedAt: string;
}

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await authenticatedFetch('/api/admin/users');

      if (!res.ok) {
        throw new Error(`Failed to load users (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users);
      } else {
        throw new Error(data.error || 'Failed to parse users data.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to load data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.phone || '').includes(searchQuery) ||
      (u.shopName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.shopCode || '').includes(searchQuery);

    if (!matchesSearch) return false;
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredUsers.length / pageSize) || 1;
  const paginatedUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#080808]">
              Users Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-[#00B52D] border border-emerald-200">
              Live Database
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#777777] mt-0.5 leading-relaxed">
            Registered accounts, platform roles, and tenant associations fetched directly from PostgreSQL.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            disabled={isLoading}
            className="border-slate-200 hover:border-slate-300 text-slate-700 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#00B52D] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
          <div className="text-xs font-semibold text-slate-600 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs">
            Total Users: <strong className="text-slate-900">{users.length}</strong>
          </div>
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
            onClick={fetchUsers}
            className="border-rose-300 bg-white hover:bg-rose-100 text-rose-800 font-semibold shrink-0"
          >
            Retry
          </Button>
        </div>
      )}

      {/* 3. TOOLBAR (SEARCH & FILTER) */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search users by name, email, phone, shop code..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3.5 h-9 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00B52D]/20 focus:border-[#00B52D] transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Role:</span>
          </div>
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#00B52D]/20 focus:border-[#00B52D]"
          >
            <option value="ALL">All Roles</option>
            <option value="ADMIN">Master Admin</option>
            <option value="SHOP_OWNER">Shop Owner</option>
            <option value="STAFF">Counter Staff</option>
          </select>
        </div>
      </div>

      {/* 4. TABLE VIEW */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F7F7] border-b border-slate-200">
              <TableHead className="font-bold text-[#080808]">User Name</TableHead>
              <TableHead className="font-bold text-[#080808]">Email & Phone</TableHead>
              <TableHead className="font-bold text-[#080808]">Role</TableHead>
              <TableHead className="font-bold text-[#080808]">Associated Shop</TableHead>
              <TableHead className="font-bold text-[#080808]">Account Status</TableHead>
              <TableHead className="font-bold text-[#080808] text-right">Registration Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // SKELETON LOADING
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell><div className="h-4 w-32 bg-slate-100 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-40 bg-slate-100 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-5 w-20 bg-slate-100 rounded-full animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-28 bg-slate-100 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-5 w-16 bg-slate-100 rounded-full animate-pulse" /></TableCell>
                  <TableCell className="text-right"><div className="h-4 w-24 bg-slate-100 rounded ml-auto animate-pulse" /></TableCell>
                </TableRow>
              ))
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center text-slate-400">
                  <div className="max-w-xs mx-auto space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                      <Users className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#080808]">No data available yet.</p>
                      <p className="text-[11px] text-[#777777] mt-0.5">
                        No registered user accounts match your current search or filter criteria.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedUsers.map((u) => (
                <TableRow key={u.id} className="hover:bg-slate-50/60 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#00B52D] font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-200">
                        {u.fullName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block text-xs">{u.fullName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {u.id.slice(0, 10)}...</span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-800">
                        <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px]">{u.email}</span>
                      </div>
                      {u.phone && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{u.phone}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        u.role === 'ADMIN'
                          ? 'bg-[#080808] text-white border-[#080808]'
                          : u.role === 'SHOP_OWNER'
                          ? 'bg-emerald-50 text-[#00B52D] border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {u.role === 'ADMIN' ? 'Master Admin' : u.role === 'SHOP_OWNER' ? 'Shop Owner' : u.role}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-0.5">
                      <span className="font-semibold text-slate-900 block text-xs">
                        {u.shopName || 'Platform'}
                      </span>
                      {u.shopCode && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-[#00B52D] bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          <Hash className="w-2.5 h-2.5" />
                          {u.shopCode}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Chip
                      variant={u.accountStatus === 'ACTIVE' ? 'success' : 'danger'}
                      size="sm"
                      dot
                    >
                      {u.accountStatus || 'ACTIVE'}
                    </Chip>
                  </TableCell>

                  <TableCell className="text-right text-xs text-slate-600 font-mono">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    }) : 'N/A'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* PAGINATION CONTROLS */}
        {!isLoading && filteredUsers.length > pageSize && (
          <div className="p-3.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-[#F7F7F7]">
            <span>
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredUsers.length)} of {filteredUsers.length} users
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="px-2 font-mono font-bold text-slate-700">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="xs"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
