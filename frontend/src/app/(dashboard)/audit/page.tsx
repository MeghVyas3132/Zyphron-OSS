'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Shield, Search, Filter, RefreshCw, Download, User, Zap, Database, Key, Settings, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';

// ─── Types ───────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface AuditResponse {
  data: AuditEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ─── Action → icon/color mapping ─────────────────────────────

const ACTION_META: Record<string, { icon: typeof Shield; color: string; group: string }> = {
  'user.login':       { icon: User,     color: 'text-blue-400',   group: 'Auth' },
  'user.logout':      { icon: User,     color: 'text-muted-foreground', group: 'Auth' },
  'user.register':    { icon: User,     color: 'text-green-400',  group: 'Auth' },
  'project.create':   { icon: Zap,      color: 'text-green-400',  group: 'Projects' },
  'project.delete':   { icon: Zap,      color: 'text-red-400',    group: 'Projects' },
  'project.update':   { icon: Zap,      color: 'text-yellow-400', group: 'Projects' },
  'deployment.trigger':{ icon: Zap,     color: 'text-blue-400',   group: 'Deployments' },
  'deployment.cancel':{ icon: Zap,      color: 'text-orange-400', group: 'Deployments' },
  'deployment.rollback':{ icon: Zap,    color: 'text-purple-400', group: 'Deployments' },
  'database.create':  { icon: Database, color: 'text-green-400',  group: 'Databases' },
  'database.delete':  { icon: Database, color: 'text-red-400',    group: 'Databases' },
  'api_key.create':   { icon: Key,      color: 'text-yellow-400', group: 'API Keys' },
  'api_key.delete':   { icon: Key,      color: 'text-red-400',    group: 'API Keys' },
  'env.create':       { icon: Settings, color: 'text-green-400',  group: 'Env Vars' },
  'env.delete':       { icon: Settings, color: 'text-red-400',    group: 'Env Vars' },
  'domain.add':       { icon: Globe,    color: 'text-blue-400',   group: 'Domains' },
  'domain.remove':    { icon: Globe,    color: 'text-red-400',    group: 'Domains' },
};

function getActionMeta(action: string) {
  return ACTION_META[action] ?? { icon: Shield, color: 'text-muted-foreground', group: 'Other' };
}

// ─── Fetch ───────────────────────────────────────────────────

async function fetchAuditLogs(params: {
  page: number; limit: number; action?: string; resourceType?: string; search?: string;
}): Promise<AuditResponse> {
  const token = localStorage.getItem('auth-token');
  const q = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    ...(params.action ? { action: params.action } : {}),
    ...(params.resourceType ? { resourceType: params.resourceType } : {}),
  });
  const res = await fetch(`${API}/api/v1/audit?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  return res.json() as Promise<AuditResponse>;
}

// ─── Animations ──────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.19, 1, 0.22, 1] as const } },
};

const RESOURCE_TYPES = ['', 'project', 'deployment', 'database', 'api_key', 'env', 'domain', 'user', 'team'];

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [search, setSearch] = useState('');
  const limit = 50;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit', page, actionFilter, resourceFilter],
    queryFn: () => fetchAuditLogs({ page, limit, action: actionFilter || undefined, resourceType: resourceFilter || undefined }),
    refetchInterval: 10_000,  // auto-refresh every 10s
  });

  const downloadCSV = useCallback(() => {
    if (!data?.data) return;
    const header = 'timestamp,action,resource,user,ip\n';
    const rows = data.data.map(e =>
      `${e.createdAt},${e.action},${e.resourceType}/${e.resourceId ?? ''},${e.userEmail ?? e.userId},${e.ipAddress ?? ''}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'audit-logs.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const filtered = data?.data?.filter(e =>
    !search || [e.action, e.userEmail, e.resourceType, e.resourceName].some(f => f?.toLowerCase().includes(search.toLowerCase()))
  ) ?? [];

  const total = data?.pagination?.total ?? 0;
  const totalPages = data?.pagination?.totalPages ?? 1;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mono-text-gradient">Audit Logs</h1>
          <p className="text-muted-foreground mt-1">
            Every action across the platform — immutable, real-time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={downloadCSV}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </motion.div>

      {/* Stats row */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Events', value: total.toLocaleString() },
          { label: 'This Page', value: filtered.length.toString() },
          { label: 'Auto-refresh', value: '10s' },
          { label: 'Retention', value: '90 days' },
        ].map((s) => (
          <div key={s.label} className="premium-panel premium-card-hover p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-xl font-semibold">{s.value}</p>
          </div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="premium-panel p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actions, users, resources…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={resourceFilter}
            onChange={(e) => { setResourceFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Resources</option>
            {RESOURCE_TYPES.filter(Boolean).map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
      </motion.div>

      {/* Logs table */}
      <motion.div variants={itemVariants} className="premium-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-card/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Resource</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">IP</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Time</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/20">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-foreground/5 rounded animate-pulse" style={{ width: `${[70, 55, 65, 40, 50][j]}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    No audit events found
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => {
                  const meta = getActionMeta(entry.action);
                  const Icon = meta.icon;
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-border/20 hover:bg-foreground/2 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.color}`} />
                          <span className="font-mono text-xs">{entry.action}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-muted-foreground">
                          {entry.resourceType}
                          {entry.resourceName ? ` / ${entry.resourceName}` : entry.resourceId ? ` / ${entry.resourceId.slice(0, 8)}…` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs">{entry.userEmail ?? entry.userId.slice(0, 8)}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-muted-foreground font-mono">{entry.ipAddress ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-muted-foreground">{formatRelativeTime(entry.createdAt)}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total.toLocaleString()} events
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline" size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
