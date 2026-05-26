'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users, Zap, Shield, Search, RefreshCw,
  Activity, TrendingUp, Server, Database,
  Ban, CheckCircle2, XCircle, Crown,
  Eye, MoreHorizontal, AlertTriangle,
  GitBranch, Clock, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';

// ─── Types ──────────────────────────────────────────────────

interface PlatformMetrics {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  totalDeployments: number;
  activeDeployments: number;
  failedDeployments: number;
  successRate: number;
  avgBuildTime?: number;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'USER';
  isActive: boolean;
  createdAt: string;
  _count?: { projects: number; deployments: number };
}

interface Deployment {
  id: string;
  status: string;
  environment: string;
  createdAt: string;
  buildDuration?: number;
  project?: { name: string; slug: string };
  user?: { email: string; name: string | null };
}

// ─── API helpers ────────────────────────────────────────────

function getToken(): string {
  return typeof window !== 'undefined' ? (localStorage.getItem('auth-token') ?? '') : '';
}

async function adminFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/api/v1/admin${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function adminPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api/v1/admin${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function adminPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}/api/v1/admin${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

// ─── Stat Card ──────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, color = 'text-primary',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card/60 backdrop-blur-sm p-6 flex items-start gap-4 hover:shadow-lg transition-shadow">
      <div className={`p-3 rounded-xl bg-foreground/5 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Status badge ────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    LIVE:      'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
    BUILDING:  'bg-blue-500/15 text-blue-400 border border-blue-500/20',
    DEPLOYING: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
    FAILED:    'bg-red-500/15 text-red-400 border border-red-500/20',
    QUEUED:    'bg-gray-500/15 text-gray-400 border border-gray-500/20',
    CANCELLED: 'bg-gray-500/15 text-gray-400 border border-gray-500/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-500/15 text-gray-400'}`}>
      {status}
    </span>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function AdminPage() {
  const qc = useQueryClient();
  const [userSearch, setUserSearch] = useState('');
  const [deploySearch, setDeploySearch] = useState('');
  const [tab, setTab] = useState<'users' | 'deployments' | 'activity'>('users');

  // Metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: () => adminFetch<PlatformMetrics>('/metrics'),
    refetchInterval: 30_000,
  });

  // Users
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['admin-users', userSearch],
    queryFn: () => adminFetch<{ users: User[]; total: number }>(
      `/users?limit=50${userSearch ? `&search=${encodeURIComponent(userSearch)}` : ''}`
    ),
  });

  // Deployments
  const { data: deploysData, isLoading: deploysLoading, refetch: refetchDeploys } = useQuery({
    queryKey: ['admin-deployments', deploySearch],
    queryFn: () => adminFetch<{ deployments: Deployment[]; total: number }>(
      `/deployments?limit=50${deploySearch ? `&status=${encodeURIComponent(deploySearch)}` : ''}`
    ),
  });

  // Activity
  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['admin-activity'],
    queryFn: () => adminFetch<{ logs: any[]; total: number }>('/activity?limit=30'),
    refetchInterval: 15_000,
  });

  // Mutations
  const setRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'ADMIN' | 'USER' }) =>
      adminPatch(`/users/${userId}/role`, { role }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-users'] }); },
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      adminPatch(`/users/${userId}/status`, { isActive }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-users'] }); },
  });

  const killDeployMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      adminPost(`/deployments/${deploymentId}/cancel`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-deployments'] }); },
  });

  const users = usersData?.users ?? [];
  const deployments = deploysData?.deployments ?? [];
  const activityLogs = activityData?.logs ?? [];

  return (
    <div className="min-h-screen p-6 lg:p-10 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
          <Crown className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-0.5">Platform health, users, and deployments</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-2"
          onClick={() => {
            void qc.invalidateQueries({ queryKey: ['admin-metrics'] });
            void qc.invalidateQueries({ queryKey: ['admin-users'] });
            void qc.invalidateQueries({ queryKey: ['admin-deployments'] });
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </motion.div>

      {/* Metric Cards */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
      >
        <StatCard icon={Users}        label="Total Users"         value={metrics?.totalUsers ?? '—'}        color="text-blue-400" />
        <StatCard icon={Activity}     label="Active Users"        value={metrics?.activeUsers ?? '—'}       color="text-emerald-400" />
        <StatCard icon={Server}       label="Total Projects"      value={metrics?.totalProjects ?? '—'}     color="text-purple-400" />
        <StatCard icon={GitBranch}    label="Total Deployments"   value={metrics?.totalDeployments ?? '—'}  color="text-cyan-400" />
        <StatCard icon={CheckCircle2} label="Active Now"          value={metrics?.activeDeployments ?? '—'} color="text-emerald-400" />
        <StatCard
          icon={TrendingUp}
          label="Success Rate"
          value={metrics?.successRate !== undefined ? `${metrics.successRate.toFixed(1)}%` : '—'}
          color={
            (metrics?.successRate ?? 100) >= 95 ? 'text-emerald-400'
            : (metrics?.successRate ?? 100) >= 80 ? 'text-yellow-400'
            : 'text-red-400'
          }
        />
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-accent/40 p-1 w-fit">
        {(['users', 'deployments', 'activity'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              tab === t
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── USERS TAB ─────────────────────────────────────────── */}
      {tab === 'users' && (
        <motion.div
          key="users"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {usersData?.total ?? 0} users total
            </span>
          </div>

          <div className="rounded-2xl border overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 border-b bg-accent/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span>User</span>
              <span>Role</span>
              <span>Status</span>
              <span>Projects</span>
              <span>Actions</span>
            </div>

            {usersLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No users found</div>
            ) : (
              users.map((user) => (
                <div
                  key={user.id}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 px-5 py-4 border-b last:border-0 hover:bg-accent/20 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{user.name ?? user.email}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                    <p className="text-xs text-muted-foreground/60">Joined {formatRelativeTime(user.createdAt)}</p>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    user.role === 'ADMIN'
                      ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                      : 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                  }`}>
                    {user.role}
                  </span>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    user.isActive
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/15 text-red-400 border border-red-500/20'
                  }`}>
                    {user.isActive ? 'Active' : 'Disabled'}
                  </span>

                  <span className="text-sm text-center text-muted-foreground">
                    {user._count?.projects ?? 0}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => setRoleMutation.mutate({
                        userId: user.id,
                        role: user.role === 'ADMIN' ? 'USER' : 'ADMIN',
                      })}
                      title={user.role === 'ADMIN' ? 'Demote to User' : 'Promote to Admin'}
                    >
                      <Crown className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 px-2 text-xs gap-1 ${user.isActive ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                      onClick={() => setStatusMutation.mutate({
                        userId: user.id,
                        isActive: !user.isActive,
                      })}
                      title={user.isActive ? 'Disable user' : 'Enable user'}
                    >
                      {user.isActive ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}

      {/* ── DEPLOYMENTS TAB ───────────────────────────────────── */}
      {tab === 'deployments' && (
        <motion.div
          key="deployments"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex gap-2 flex-wrap">
              {['', 'LIVE', 'BUILDING', 'FAILED', 'QUEUED'].map((s) => (
                <button
                  key={s || 'all'}
                  onClick={() => setDeploySearch(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    deploySearch === s
                      ? 'bg-foreground text-background border-transparent'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s || 'All'}
                </button>
              ))}
            </div>
            <span className="text-sm text-muted-foreground ml-auto">
              {deploysData?.total ?? 0} total
            </span>
          </div>

          <div className="rounded-2xl border overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 border-b bg-accent/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span>Project</span>
              <span>Status</span>
              <span>Env</span>
              <span>Time</span>
              <span>Actions</span>
            </div>

            {deploysLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
              </div>
            ) : deployments.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No deployments found</div>
            ) : (
              deployments.map((dep) => (
                <div
                  key={dep.id}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 px-5 py-4 border-b last:border-0 hover:bg-accent/20 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{dep.project?.name ?? dep.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{dep.user?.email ?? ''}</p>
                  </div>
                  <StatusBadge status={dep.status} />
                  <span className="text-xs text-muted-foreground uppercase">{dep.environment}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(dep.createdAt)}</span>
                  <div className="flex items-center gap-1.5">
                    {(dep.status === 'BUILDING' || dep.status === 'DEPLOYING' || dep.status === 'QUEUED') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                        onClick={() => killDeployMutation.mutate(dep.id)}
                        title="Cancel deployment"
                      >
                        <XCircle className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}

      {/* ── ACTIVITY TAB ─────────────────────────────────────── */}
      {tab === 'activity' && (
        <motion.div
          key="activity"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <p className="text-sm text-muted-foreground">Last 30 platform events (auto-refreshes every 15s)</p>
          <div className="rounded-2xl border overflow-hidden divide-y divide-border/50">
            {activityLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No activity yet</div>
            ) : (
              activityLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-accent/20 transition-colors">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary mt-0.5">
                    <Activity className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">{log.action}</span>
                      <span className="text-xs text-muted-foreground/60">•</span>
                      <span className="text-xs text-muted-foreground truncate">{log.userEmail ?? log.userId?.slice(0, 8)}</span>
                    </div>
                    {log.resourceType && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {log.resourceType}
                        {log.resourceId ? ` · ${log.resourceId.slice(0, 8)}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground/60 whitespace-nowrap flex-shrink-0">
                    {formatRelativeTime(log.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
