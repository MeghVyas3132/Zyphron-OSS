'use client';

import Link from 'next/link';
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
  QUEUED: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  PENDING: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  BUILDING: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', animate: true },
  DEPLOYING: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', animate: true },
  LIVE: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
  READY: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
  FAILED: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  CANCELLED: { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-500/10' },
  ROLLING_BACK: { icon: Loader2, color: 'text-orange-500', bg: 'bg-orange-500/10', animate: true },
};

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Here's an overview of your projects.
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Projects"
          value={overview?.totalProjects || 0}
          icon={FolderKanban}
          href="/projects"
        />
        <StatCard
          title="Active Deployments"
          value={overview?.activeDeployments || 0}
          icon={Server}
        />
        <StatCard
          title="Databases"
          value={overview?.totalDatabases || 0}
          icon={Database}
          href="/databases"
        />
        <StatCard
          title="Success Rate"
          value={`${metrics?.deployments?.successRate?.toFixed(1) || 0}%`}
          icon={Activity}
        />
      </div>

      {/* Recent Deployments */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent Deployments</h2>
          <Link href="/projects">
            <Button variant="ghost" size="sm" className="gap-2">
              View All <ArrowUpRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="rounded-lg border bg-card">
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
                    className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${config.bg}`}>
                        <StatusIcon
                          className={`h-4 w-4 ${config.color} ${
                            config.animate ? 'animate-spin' : ''
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
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/projects/new">
            <div className="rounded-lg border bg-card p-6 hover:border-primary transition-colors cursor-pointer">
              <FolderKanban className="h-8 w-8 text-primary mb-4" />
              <h3 className="font-semibold">Create Project</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Deploy a new application from Git
              </p>
            </div>
          </Link>
          <Link href="/databases/new">
            <div className="rounded-lg border bg-card p-6 hover:border-primary transition-colors cursor-pointer">
              <Database className="h-8 w-8 text-primary mb-4" />
              <h3 className="font-semibold">Create Database</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Provision a managed database
              </p>
            </div>
          </Link>
          <Link href="/docs">
            <div className="rounded-lg border bg-card p-6 hover:border-primary transition-colors cursor-pointer">
              <Activity className="h-8 w-8 text-primary mb-4" />
              <h3 className="font-semibold">View Documentation</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Learn how to use Zyphron
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
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
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl font-bold">{value}</p>
        {trend && (
          <span
            className={`text-sm ${
              trend.positive ? 'text-green-500' : 'text-red-500'
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
