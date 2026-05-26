'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  GitBranch,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Activity,
  Server,
  Database,
  FolderKanban,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import { useDashboardMetrics } from '@/hooks/use-dashboard';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.19, 1, 0.22, 1] as const } },
};

interface RecentDeployment {
  id: string;
  projectName: string;
  projectSlug: string;
  status: 'QUEUED' | 'PENDING' | 'BUILDING' | 'DEPLOYING' | 'LIVE' | 'READY' | 'FAILED' | 'CANCELLED' | 'ROLLING_BACK';
  createdAt: string;
  branch?: string;
  commitSha?: string;
}

const statusConfig: Record<RecentDeployment['status'], { icon: React.ElementType; label: string; dot: string; spin?: boolean }> = {
  QUEUED:       { icon: Clock,         label: 'Queued',       dot: 'bg-white/20' },
  PENDING:      { icon: Clock,         label: 'Pending',      dot: 'bg-white/20' },
  BUILDING:     { icon: Loader2,       label: 'Building',     dot: 'bg-white/50', spin: true },
  DEPLOYING:    { icon: Loader2,       label: 'Deploying',    dot: 'bg-white/50', spin: true },
  LIVE:         { icon: CheckCircle2,  label: 'Live',         dot: 'bg-white/80' },
  READY:        { icon: CheckCircle2,  label: 'Ready',        dot: 'bg-white/80' },
  FAILED:       { icon: XCircle,       label: 'Failed',       dot: 'bg-white/25' },
  CANCELLED:    { icon: XCircle,       label: 'Cancelled',    dot: 'bg-white/15' },
  ROLLING_BACK: { icon: Loader2,       label: 'Rolling back', dot: 'bg-white/40', spin: true },
};

export default function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useDashboardMetrics();

  const metrics = data?.data;
  const overview = metrics?.overview;
  const recentActivity = (metrics?.recentActivity || []) as RecentDeployment[];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="h-6 w-6 rounded-full border border-white/20 border-t-white/60 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-8 w-8 text-white/30" />
        <p className="font-mono-ui text-[11px] uppercase tracking-[0.2em] text-white/35">
          {error instanceof Error ? error.message : 'Failed to load dashboard'}
        </p>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-white/45 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-8">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <div className="font-mono-ui text-[9px] uppercase tracking-[0.35em] text-white/25 mb-2">
            // live.operating.view
          </div>
          <h1 className="font-mono-ui text-2xl font-light text-white/90 tracking-tight">Dashboard</h1>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded border border-white/[0.07] bg-white/[0.02] p-2 text-white/25 hover:text-white/55 hover:bg-white/[0.04] transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </motion.div>

      {/* Stats */}
      <motion.div variants={containerVariants} className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Projects',      value: overview?.totalProjects ?? 0,          icon: FolderKanban, href: '/projects' },
          { label: 'Active Deployments',  value: overview?.activeDeployments ?? 0,       icon: Server },
          { label: 'Databases',           value: overview?.totalDatabases ?? 0,          icon: Database, href: '/databases' },
          { label: 'Success Rate',        value: `${(metrics?.deployments?.successRate ?? 0).toFixed(1)}%`, icon: Activity },
        ].map(({ label, value, icon: Icon, href }) => {
          const card = (
            <motion.div key={label} variants={itemVariants} className="zy-stat group cursor-default">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono-ui text-[9px] uppercase tracking-[0.3em] text-white/25">{label}</span>
                <Icon className="h-3.5 w-3.5 text-white/15 group-hover:text-white/30 transition-colors" />
              </div>
              <span className="font-mono-ui text-2xl font-light text-white/85">{value}</span>
            </motion.div>
          );
          return href ? <Link key={label} href={href}>{card}</Link> : card;
        })}
      </motion.div>

      {/* Recent Deployments */}
      <motion.div variants={itemVariants} className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono-ui text-[10px] uppercase tracking-[0.3em] text-white/40">Recent Deployments</span>
          <Link href="/projects">
            <button className="flex items-center gap-1.5 font-mono-ui text-[9px] uppercase tracking-[0.25em] text-white/25 hover:text-white/55 transition-colors">
              View All <ArrowUpRight className="h-3 w-3" />
            </button>
          </Link>
        </div>

        <div className="zy-panel divide-y divide-white/[0.04]">
          {recentActivity.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-mono-ui text-[10px] uppercase tracking-[0.25em] text-white/25 mb-6">
                No deployments yet
              </p>
              <Link href="/projects/new">
                <button className="rounded border border-white/[0.07] bg-white/[0.02] px-4 py-2 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-white/55 hover:bg-white/[0.05] hover:text-white/80 transition-colors">
                  Create first project
                </button>
              </Link>
            </div>
          ) : (
            recentActivity.map((d) => {
              const cfg = statusConfig[d.status] ?? statusConfig.PENDING;
              const StatusIcon = cfg.icon;
              return (
                <Link
                  key={d.id}
                  href={`/projects/${d.projectSlug}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <div>
                      <p className="font-mono-ui text-[11px] text-white/75">{d.projectName}</p>
                      {d.branch && (
                        <div className="flex items-center gap-2 mt-0.5 font-mono-ui text-[9px] text-white/25">
                          <GitBranch className="h-2.5 w-2.5" />
                          <span>{d.branch}</span>
                          {d.commitSha && <><span>·</span><span>{d.commitSha.slice(0, 7)}</span></>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono-ui text-[9px] uppercase tracking-[0.2em] text-white/25">{cfg.label}</span>
                    <StatusIcon className={`h-3 w-3 text-white/30 ${cfg.spin ? 'animate-spin' : ''}`} />
                    <span className="font-mono-ui text-[9px] text-white/20">{formatRelativeTime(d.createdAt)}</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={itemVariants} className="space-y-3">
        <span className="font-mono-ui text-[10px] uppercase tracking-[0.3em] text-white/40">Quick Actions</span>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { href: '/projects/new',   icon: FolderKanban, title: 'Create Project',   sub: 'Deploy from Git or directory' },
            { href: '/databases?new=1',icon: Database,      title: 'Create Database',  sub: 'Provision a managed database' },
            { href: '/docs',           icon: Activity,      title: 'Documentation',    sub: 'Learn how to use Zyphron' },
          ].map(({ href, icon: Icon, title, sub }) => (
            <Link key={href} href={href}>
              <div className="zy-panel zy-panel-hover p-6 cursor-pointer">
                <Icon className="h-5 w-5 text-white/25 mb-5" />
                <p className="font-mono-ui text-[11px] uppercase tracking-[0.2em] text-white/70 mb-1">{title}</p>
                <p className="font-mono-ui text-[10px] text-white/25">{sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
