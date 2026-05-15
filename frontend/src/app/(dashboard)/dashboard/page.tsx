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
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import { useDashboardMetrics } from '@/hooks/use-dashboard';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.09 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.19, 1, 0.22, 1] as const } },
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

const statusConfig = {
  QUEUED: { icon: Clock, color: 'text-foreground/70', bg: 'bg-foreground/5' },
  PENDING: { icon: Clock, color: 'text-foreground/70', bg: 'bg-foreground/5' },
  BUILDING: { icon: Loader2, color: 'text-foreground/80', bg: 'bg-foreground/10', animate: true },
  DEPLOYING: { icon: Loader2, color: 'text-foreground/80', bg: 'bg-foreground/10', animate: true },
  LIVE: { icon: CheckCircle2, color: 'text-foreground', bg: 'bg-foreground/15' },
  READY: { icon: CheckCircle2, color: 'text-foreground', bg: 'bg-foreground/15' },
  FAILED: { icon: XCircle, color: 'text-foreground/60', bg: 'bg-foreground/5' },
  CANCELLED: { icon: XCircle, color: 'text-foreground/60', bg: 'bg-foreground/5' },
  ROLLING_BACK: { icon: Loader2, color: 'text-foreground/80', bg: 'bg-foreground/10', animate: true },
} satisfies Record<
  RecentDeployment['status'],
  { icon: React.ElementType; color: string; bg: string; animate?: boolean }
>;

export default function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useDashboardMetrics();

  const metrics = data?.data;
  const overview = metrics?.overview;
  const recentActivity = (metrics?.recentActivity || []) as RecentDeployment[];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">
          {error instanceof Error ? error.message : 'Failed to load dashboard'}
        </p>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-8">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mono-text-gradient">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Live operating view across your deployment system.
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={containerVariants} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div variants={itemVariants}>
          <StatCard title="Total Projects" value={overview?.totalProjects || 0} icon={FolderKanban} href="/projects" />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard title="Active Deployments" value={overview?.activeDeployments || 0} icon={Server} />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard title="Databases" value={overview?.totalDatabases || 0} icon={Database} href="/databases" />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard title="Success Rate" value={`${metrics?.deployments?.successRate?.toFixed(1) || 0}%`} icon={Activity} />
        </motion.div>
      </motion.div>

      {/* Recent Deployments */}
      <motion.div variants={itemVariants} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent Deployments</h2>
          <Link href="/projects">
            <Button variant="ghost" size="sm" className="gap-2">
              View All <ArrowUpRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="premium-panel">
          {recentActivity.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No deployments yet</p>
              <Link href="/projects/new">
                <Button className="mt-4">Create Your First Project</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {recentActivity.map((deployment) => {
                const config = statusConfig[deployment.status] || statusConfig.PENDING;
                const StatusIcon = config.icon;

                return (
                  <Link
                    key={deployment.id}
                    href={`/projects/${deployment.projectSlug}`}
                    className="flex items-center justify-between p-4 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${config.bg}`}>
                        <StatusIcon
                          className={`h-4 w-4 ${config.color} ${
                            'animate' in config && config.animate ? 'animate-spin' : ''
                          }`}
                        />
                      </div>
                      <div>
                        <p className="font-medium">{deployment.projectName}</p>
                        {deployment.branch && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <GitBranch className="h-3 w-3" />
                            <span>{deployment.branch}</span>
                            {deployment.commitSha && (
                              <>
                                <span>·</span>
                                <span>{deployment.commitSha.slice(0, 7)}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatRelativeTime(deployment.createdAt)}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={itemVariants} className="space-y-4">
        <h2 className="text-xl font-semibold">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/projects/new">
            <div className="premium-panel premium-card-hover p-6 cursor-pointer">
              <FolderKanban className="h-8 w-8 text-foreground mb-4" />
              <h3 className="font-semibold">Create Project</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Deploy a new application from Git
              </p>
            </div>
          </Link>
          <Link href="/databases?new=1">
            <div className="premium-panel premium-card-hover p-6 cursor-pointer">
              <Database className="h-8 w-8 text-foreground mb-4" />
              <h3 className="font-semibold">Create Database</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Provision a managed database
              </p>
            </div>
          </Link>
          <Link href="/docs">
            <div className="premium-panel premium-card-hover p-6 cursor-pointer">
              <Activity className="h-8 w-8 text-foreground mb-4" />
              <h3 className="font-semibold">View Documentation</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Learn how to use Zyphron
              </p>
            </div>
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  href,
  trend,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  href?: string;
  trend?: { value: number; positive: boolean };
}) {
  const content = (
    <div className="premium-panel premium-card-hover p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <Icon className="h-5 w-5 text-foreground/70" />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl font-semibold">{value}</p>
        {trend && (
          <span
            className={`text-sm ${
              trend.positive ? 'text-foreground' : 'text-foreground/70'
            }`}
          >
            {trend.positive ? '+' : '-'}{trend.value}%
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
