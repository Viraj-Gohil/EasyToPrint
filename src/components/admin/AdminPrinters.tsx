import React, { useState, useEffect, useCallback } from 'react';
import {
  Printer,
  Search,
  Filter,
  RefreshCw,
  Store,
  Cpu,
  Clock,
  CheckCircle2,
  AlertCircle,
  Wifi,
  WifiOff
} from 'lucide-react';
import { apiUrl } from '../../lib/apiConfig';
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

interface AdminPrinterRecord {
  id: string;
  name: string;
  model: string | null;
  shopId: string;
  shopName: string;
  agentId: string | null;
  agentName: string;
  status: string;
  capabilities: {
    color?: boolean;
    duplex?: boolean;
    paperSizes?: string[];
  } | null;
  connectionType: string | null;
  isRegistered: boolean;
  isDefault: boolean;
  lastSeen: string | null;
  createdAt: string;
}

export const AdminPrinters: React.FC = () => {
  const [printers, setPrinters] = useState<AdminPrinterRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  const fetchPrinters = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('easytoprint_access_token') || localStorage.getItem('printflow_access_token')
        : null;

      const res = await fetch(apiUrl('/api/admin/printers'), {
        headers: {
          'Content-Type': 'application/json',
          'x-admin-dev-role': 'ADMIN',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'same-origin'
      });

      if (!res.ok) {
        throw new Error(`Failed to load printers (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.printers)) {
        setPrinters(data.printers);
      } else {
        throw new Error(data.error || 'Failed to parse printers data.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to load data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrinters();
  }, [fetchPrinters]);

  const filteredPrinters = printers.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.model || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.shopName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.agentName.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredPrinters.length / pageSize) || 1;
  const paginatedPrinters = filteredPrinters.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#080808]">
              Printers Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-[#00B52D] border border-emerald-200">
              Live Hardware Registry
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#777777] mt-0.5 leading-relaxed">
            Real hardware discovered and registered across shop counters by the EasyToPrint Desktop Agent.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPrinters}
            disabled={isLoading}
            className="border-slate-200 hover:border-slate-300 text-slate-700 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#00B52D] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
          <div className="text-xs font-semibold text-slate-600 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs">
            Registered: <strong className="text-slate-900">{printers.filter(p => p.isRegistered).length}</strong> / {printers.length}
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
            onClick={fetchPrinters}
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
            placeholder="Search printers by name, model, shop, or agent..."
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
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#00B52D]/20 focus:border-[#00B52D]"
          >
            <option value="ALL">All Statuses</option>
            <option value="ONLINE">Online</option>
            <option value="OFFLINE">Offline</option>
            <option value="BUSY">Busy</option>
          </select>
        </div>
      </div>

      {/* 4. TABLE VIEW */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F7F7F7] border-b border-slate-200">
              <TableHead className="font-bold text-[#080808]">Printer Name & Model</TableHead>
              <TableHead className="font-bold text-[#080808]">Associated Shop</TableHead>
              <TableHead className="font-bold text-[#080808]">Desktop Agent</TableHead>
              <TableHead className="font-bold text-[#080808]">Capabilities</TableHead>
              <TableHead className="font-bold text-[#080808]">Current Status</TableHead>
              <TableHead className="font-bold text-[#080808] text-right">Last Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`skeleton-p-${i}`}>
                  <TableCell><div className="h-4 w-36 bg-slate-100 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-28 bg-slate-100 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-24 bg-slate-100 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-32 bg-slate-100 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-5 w-16 bg-slate-100 rounded-full animate-pulse" /></TableCell>
                  <TableCell className="text-right"><div className="h-4 w-20 bg-slate-100 rounded ml-auto animate-pulse" /></TableCell>
                </TableRow>
              ))
            ) : filteredPrinters.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center text-slate-400">
                  <div className="max-w-xs mx-auto space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                      <Printer className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#080808]">No data available yet.</p>
                      <p className="text-[11px] text-[#777777] mt-0.5">
                        No registered printers match your search or filter criteria.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedPrinters.map((p) => {
                const isOnline = p.status === 'ONLINE';
                return (
                  <TableRow key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                          isOnline ? 'bg-emerald-50 text-[#00B52D] border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'
                        }`}>
                          <Printer className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-xs block">{p.name}</span>
                            {p.isDefault && (
                              <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[9px] font-semibold border border-slate-200">
                                Default
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {p.model || p.connectionType || 'USB / Local Driver'}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-0.5">
                        <span className="font-semibold text-slate-900 block text-xs">{p.shopName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {p.shopId.slice(0, 10)}...</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-slate-700">
                        <Cpu className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px]">{p.agentName || 'Counter Agent'}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        {p.capabilities?.color && (
                          <span className="px-1.5 py-0.5 rounded bg-[#E8F8EC] text-[#008F25] border border-[#A7F3D0] text-[10px] font-bold">
                            Color
                          </span>
                        )}
                        {p.capabilities?.duplex && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-[#00B52D] border border-emerald-200 text-[10px] font-bold">
                            2-Sided
                          </span>
                        )}
                        {Array.isArray(p.capabilities?.paperSizes) && p.capabilities.paperSizes.slice(0, 2).map((s) => (
                          <span key={s} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono">
                            {s}
                          </span>
                        ))}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Chip
                        variant={isOnline ? 'success' : 'muted'}
                        size="sm"
                        dot
                      >
                        {p.status || 'OFFLINE'}
                      </Chip>
                    </TableCell>

                    <TableCell className="text-right text-xs text-slate-500 font-mono">
                      {p.lastSeen ? new Date(p.lastSeen).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : 'Not Reported'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* PAGINATION CONTROLS */}
        {!isLoading && filteredPrinters.length > pageSize && (
          <div className="p-3.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-[#F7F7F7]">
            <span>
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredPrinters.length)} of {filteredPrinters.length} printers
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
