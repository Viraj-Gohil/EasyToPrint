import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  Cloud,
  Cpu,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowUpRight
} from 'lucide-react';
import { authenticatedFetch } from '../../lib/apiConfig';
import { Button } from '../ui/Button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '../ui/Table';

interface ShopStorageRow {
  shopId: string;
  shopName: string;
  shopSlug: string;
  bytesUsed: number;
  fileCount: number;
  allocatedBytes: number;
  lastUpdated: string | null;
}

interface AgentStorageRow {
  agentId: string;
  deviceName: string;
  shopName: string;
  localStorageBytes: number;
  status: string;
  lastHeartbeat: string | null;
}

interface StorageData {
  projectLevel: {
    totalCloudBytes: number;
    totalCloudFiles: number;
    totalAllocatedBytes: number;
    remainingCloudBytes: number;
  };
  shops: ShopStorageRow[];
  agents: AgentStorageRow[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export const AdminStorage: React.FC = () => {
  const [data, setData] = useState<StorageData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchStorage = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await authenticatedFetch('/api/admin/storage');

      if (!res.ok) {
        throw new Error(`Failed to load storage telemetry (HTTP ${res.status})`);
      }

      const resData = await res.json();
      if (resData.success && resData.storage) {
        setData(resData.storage);
      } else {
        throw new Error(resData.error || 'Failed to parse storage metrics.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to load data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStorage();
  }, [fetchStorage]);

  const filteredShops = (data?.shops || []).filter((s) => {
    return (
      s.shopName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.shopSlug.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const cloudBytes = data?.projectLevel?.totalCloudBytes || 0;
  const allocatedBytes = data?.projectLevel?.totalAllocatedBytes || 0;
  const cloudUsagePercent = allocatedBytes > 0 ? ((cloudBytes / allocatedBytes) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#080808]">
              Storage Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-[#00B52D] border border-emerald-200">
              Live Storage Telemetry
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#777777] mt-0.5 leading-relaxed">
            Monitor authoritative cloud storage buckets alongside reported local Windows agent spool storage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStorage}
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
            onClick={fetchStorage}
            className="border-rose-300 bg-white hover:bg-rose-100 text-rose-800 font-semibold shrink-0"
          >
            Retry
          </Button>
        </div>
      )}

      {/* 3. STORAGE ARCHITECTURE DISTINCTION KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Project Cloud Storage */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold text-[#777777]">Cloud Document Storage</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#00B52D] flex items-center justify-center border border-emerald-200">
              <Cloud className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#080808] font-mono">
            {formatBytes(cloudBytes)}
          </p>
          <div className="space-y-1">
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#00B52D] h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(1, Number(cloudUsagePercent)))}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#777777]">
              <span>Used: {cloudUsagePercent}%</span>
              <span>Quota: {formatBytes(allocatedBytes)}</span>
            </div>
          </div>
        </div>

        {/* Cloud Files Count */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold text-[#777777]">Uploaded Print Artifacts</span>
            <div className="w-8 h-8 rounded-lg bg-[#E8F8EC] text-[#00B52D] flex items-center justify-center border border-[#A7F3D0]">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#080808] font-mono">
            {data?.projectLevel?.totalCloudFiles || 0}
          </p>
          <span className="text-[11px] text-[#777777] block">
            Retained documents subject to shop lifecycle policy
          </span>
        </div>

        {/* Local Agent Disk Spool */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold text-[#777777]">Agent Local Temp Spool</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#080808] font-mono">
            {formatBytes(
              (data?.agents || []).reduce((acc, a) => acc + (Number(a.localStorageBytes) || 0), 0)
            )}
          </p>
          <span className="text-[11px] text-[#777777] block">
            Reported by connected Windows spoolers (not cloud storage)
          </span>
        </div>
      </div>

      {/* 4. SHOP-LEVEL STORAGE BREAKDOWN */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F7F7F7]">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#080808]">Tenant Storage Usage & Quota</h2>
            <p className="text-xs text-[#777777]">Individual storage consumption tracked by authoritative database tables</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter by shop name or slug..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 h-8.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00B52D]/20 focus:border-[#00B52D]"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-200">
              <TableHead className="font-bold text-[#080808]">Shop Name</TableHead>
              <TableHead className="font-bold text-[#080808]">Cloud Used</TableHead>
              <TableHead className="font-bold text-[#080808]">Allocated Quota</TableHead>
              <TableHead className="font-bold text-[#080808]">Stored Files</TableHead>
              <TableHead className="font-bold text-[#080808] text-right">Quota Utilization</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={`skeleton-st-${i}`}>
                  <TableCell><div className="h-4 w-32 bg-slate-100 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-20 bg-slate-100 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-24 bg-slate-100 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-4 w-16 bg-slate-100 rounded animate-pulse" /></TableCell>
                  <TableCell className="text-right"><div className="h-4 w-20 bg-slate-100 rounded ml-auto animate-pulse" /></TableCell>
                </TableRow>
              ))
            ) : filteredShops.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-slate-400">
                  <div className="max-w-xs mx-auto space-y-2">
                    <HardDrive className="w-6 h-6 text-slate-300 mx-auto" />
                    <p className="text-xs font-bold text-[#080808]">No data available yet.</p>
                    <p className="text-[11px] text-[#777777]">No shop storage records found in the database.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredShops.map((s) => {
                const percent = s.allocatedBytes > 0 ? ((s.bytesUsed / s.allocatedBytes) * 100).toFixed(1) : '0';
                return (
                  <TableRow key={s.shopId} className="hover:bg-slate-50/60 transition-colors">
                    <TableCell>
                      <span className="font-bold text-slate-900 block text-xs">{s.shopName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">/s/{s.shopSlug}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-slate-800">
                      {formatBytes(s.bytesUsed)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {formatBytes(s.allocatedBytes)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700 font-mono">
                      {s.fileCount} files
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs font-bold font-mono text-slate-800">{percent}%</span>
                        <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-[#00B52D] h-full rounded-full"
                            style={{ width: `${Math.min(100, Number(percent))}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* 5. AGENT LOCAL DISK SPACES (CLEARLY DISTINGUISHED) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-[#F7F7F7]">
          <h2 className="text-sm sm:text-base font-bold text-[#080808]">Local Agent Spool Disk Health</h2>
          <p className="text-xs text-[#777777]">Physical counter PC disk storage telemetry reported during periodic heartbeat</p>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-200">
              <TableHead className="font-bold text-[#080808]">Device Name</TableHead>
              <TableHead className="font-bold text-[#080808]">Associated Shop</TableHead>
              <TableHead className="font-bold text-[#080808]">Agent Local Storage</TableHead>
              <TableHead className="font-bold text-[#080808]">Agent Status</TableHead>
              <TableHead className="font-bold text-[#080808] text-right">Heartbeat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.agents || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-slate-400">
                  <p className="text-xs font-semibold text-slate-600">No agent hardware metrics reported yet.</p>
                </TableCell>
              </TableRow>
            ) : (
              (data?.agents || []).map((ag) => (
                <TableRow key={ag.agentId}>
                  <TableCell className="font-mono text-xs font-bold text-slate-900">
                    {ag.deviceName || ag.agentId.slice(0, 12)}
                  </TableCell>
                  <TableCell className="text-xs text-slate-700">
                    {ag.shopName}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-semibold text-slate-800">
                    {ag.localStorageBytes ? formatBytes(ag.localStorageBytes) : 'Not Available'}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      ag.status === 'ONLINE' ? 'bg-emerald-50 text-[#00B52D]' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {ag.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs text-slate-500 font-mono">
                    {ag.lastHeartbeat ? new Date(ag.lastHeartbeat).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : 'Not Reported'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
