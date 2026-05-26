'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Settings,
  GitBranch,
  Globe,
  Clock,
  ExternalLink,
  RefreshCw,
  Trash2,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Loader2,
  Activity,
  Terminal,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import { useProject, useDeleteProject } from '@/hooks/use-projects';
import { useDeployments, useDeploy } from '@/hooks/use-deployments';
import type { Project, Deployment } from '@/lib/api';

const statusConfig = {
  QUEUED: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Queued' },
  PENDING: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Pending' },
  BUILDING: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Building', animate: true },
  DEPLOYING: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Deploying', animate: true },
  LIVE: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Live' },
  READY: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Ready' },
  FAILED: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Failed' },
  CANCELLED: { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Cancelled' },
  ROLLING_BACK: { icon: Loader2, color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'Rolling Back', animate: true },
} as Record<string, { icon: React.ElementType; color: string; bg: string; label: string; animate?: boolean; spin?: boolean }>;

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [activeTab, setActiveTab] = useState<'deployments' | 'settings' | 'logs'>('deployments');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Use React Query hooks
  const { data: projectData, isLoading: projectLoading, isError: projectError, error: projectFetchError, refetch: refetchProject } = useProject(slug);
  const { data: deploymentsData, isLoading: deploymentsLoading, refetch: refetchDeployments } = useDeployments(slug);
  const deployMutation = useDeploy(slug);
  const deleteMutation = useDeleteProject();

  const project = projectData?.data as Project | undefined;
  const deployments = (deploymentsData as unknown as { data?: Deployment[] } | undefined)?.data ?? [];
  const isLoading = projectLoading || deploymentsLoading;

  // Auto-refresh when there's an active deployment
  const hasActiveDeployment = deployments.some(d =>
    d.status === 'QUEUED' || d.status === 'BUILDING' || d.status === 'DEPLOYING'
  );
  useEffect(() => {
    if (!hasActiveDeployment) return;
    const interval = setInterval(() => {
      refetchDeployments();
    }, 4000);
    return () => clearInterval(interval);
  }, [hasActiveDeployment, refetchDeployments]);

  // Scroll logs to bottom on new content
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [deployments]);

  const frameworkLabel = (project?.framework ?? 'unknown').toUpperCase();

  const handleDeploy = async () => {
    try {
      await deployMutation.mutateAsync({ branch: project?.defaultBranch || project?.branch || undefined });
      refetchDeployments();
    } catch (error) {
      console.error('Failed to deploy:', error);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    if (!confirm(`Are you sure you want to delete "${project.name}"? This cannot be undone.`)) return;

    try {
      await deleteMutation.mutateAsync(project.slug);
      router.push('/projects');
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">
          {projectFetchError instanceof Error ? projectFetchError.message : 'Failed to load project'}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => refetchProject()} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
          <Link href="/projects">
            <Button variant="ghost">Back to Projects</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Latest deployment for logs tab
  const latestDeployment = deployments[0] ?? null;
  // Use buildLogs if available, otherwise fall back to errorMessage so failures always show something
  const latestLogs = latestDeployment?.buildLogs ?? latestDeployment?.errorMessage ?? null;
  const latestIsActive = latestDeployment &&
    (latestDeployment.status === 'QUEUED' || latestDeployment.status === 'BUILDING' || latestDeployment.status === 'DEPLOYING');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <GitBranch className="h-4 w-4" />
                <span>{project.defaultBranch || project.branch || 'main'}</span>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">{frameworkLabel}</span>
              {project.productionUrl && (
                <a
                  href={project.productionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-primary"
                >
                  <Globe className="h-4 w-4" />
                  <span>{project.productionUrl.replace('https://', '').replace('http://', '')}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { refetchProject(); refetchDeployments(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
          <Button onClick={handleDeploy} disabled={deployMutation.isPending}>
            {deployMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Deploy
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('deployments')}
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'deployments'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Deployments
            {deployments.length > 0 && (
              <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded-full">{deployments.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'logs'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Logs
            {latestIsActive && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-blue-500">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                Live
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Deployments Tab */}
      {activeTab === 'deployments' && (
        <div className="space-y-4">
          {deployments.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center">
              <p className="text-muted-foreground mb-4">No deployments yet</p>
              <Button onClick={handleDeploy} disabled={deployMutation.isPending}>
                {deployMutation.isPending ? 'Deploying...' : 'Deploy Now'}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border divide-y">
              {deployments.map((deployment) => {
                const config = statusConfig[deployment.status] ?? statusConfig['FAILED'];
                const StatusIcon = config.icon;

                return (
                  <div key={deployment.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${config.bg}`}>
                          <StatusIcon
                            className={`h-4 w-4 ${config.color} ${
                              'animate' in config && config.animate ? 'animate-spin' : ''
                            }`}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{deployment.commitMessage || 'Manual deployment'}</p>
                            <span className={`text-xs px-2 py-0.5 rounded ${config.bg} ${config.color}`}>
                              {config.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <GitBranch className="h-3 w-3" />
                            <span>{deployment.branch || 'main'}</span>
                            {deployment.commitSha && (
                              <>
                                <span>·</span>
                                <span className="font-mono">{deployment.commitSha.slice(0, 7)}</span>
                              </>
                            )}
                            <span>·</span>
                            <Clock className="h-3 w-3" />
                            <span>{formatRelativeTime(deployment.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {deployment.url && (
                          <a
                            href={deployment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="outline" size="sm">
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Visit
                            </Button>
                          </a>
                        )}
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {deployment.status === 'FAILED' && (deployment.buildLogs || deployment.errorMessage) && (
                      <div className="mt-3 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                        <div className="flex items-center gap-2 text-red-500 text-sm font-medium mb-1">
                          <Terminal className="h-4 w-4" />
                          {deployment.buildLogs ? 'Build Error' : 'Deployment Error'}
                        </div>
                        <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap overflow-auto max-h-40">
                          {deployment.buildLogs
                            ? deployment.buildLogs.split('\n').slice(-20).join('\n')
                            : deployment.errorMessage}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Build Settings */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h3 className="font-semibold">Build Settings</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Framework</p>
                <p className="font-medium capitalize">{project.framework || 'Auto-detected'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Root Directory</p>
                <p className="font-medium">{project.rootDirectory || './'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Build Command</p>
                <p className="font-medium font-mono text-sm">{project.buildCommand || 'Auto-detected'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Output Directory</p>
                <p className="font-medium font-mono text-sm">{project.outputDirectory || 'Auto-detected'}</p>
              </div>
            </div>
          </div>

          {/* Git Settings */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h3 className="font-semibold">Git Repository</h3>
            <div className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Repository</p>
                <a
                  href={project.repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:text-primary flex items-center gap-1"
                >
                  {project.repositoryUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Production Branch</p>
                <p className="font-medium">{project.branch}</p>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 space-y-4">
            <h3 className="font-semibold text-red-500">Danger Zone</h3>
            <p className="text-sm text-muted-foreground">
              Once you delete a project, there is no going back. This action cannot be undone.
            </p>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Project'}
            </Button>
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Build Logs</h3>
              {latestDeployment && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Deployment from {formatRelativeTime(latestDeployment.createdAt)}
                  {latestDeployment.commitSha && (
                    <span className="ml-1 font-mono">· {latestDeployment.commitSha.slice(0, 7)}</span>
                  )}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {latestIsActive && (
                <span className="flex items-center gap-1.5 text-xs text-blue-500 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                  Live
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => refetchDeployments()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
          <div className="bg-black rounded-lg p-4 font-mono text-sm h-96 overflow-auto">
            {!latestDeployment ? (
              <p className="text-muted-foreground">No deployments yet. Deploy your project to see build logs.</p>
            ) : latestIsActive && !latestLogs ? (
              <div className="flex items-center gap-2 text-blue-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Connecting to build stream...</span>
              </div>
            ) : latestLogs ? (
              <>
                {latestLogs.split('\n').map((line, i) => {
                  const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('failed');
                  const isWarning = line.toLowerCase().includes('warn');
                  const isSuccess = line.toLowerCase().includes('success') || line.includes('[OK]') || line.includes('✓') || line.includes('✔');
                  return (
                    <p
                      key={i}
                      className={
                        isError ? 'text-red-400' :
                        isWarning ? 'text-yellow-400' :
                        isSuccess ? 'text-green-400' :
                        'text-green-300'
                      }
                    >
                      {line || ' '}
                    </p>
                  );
                })}
                <div ref={logsEndRef} />
              </>
            ) : (
              <p className="text-muted-foreground">
                {latestDeployment.status === 'FAILED'
                  ? 'Build failed — no logs captured.'
                  : latestDeployment.status === 'LIVE'
                  ? 'Deployment is live. No build logs available.'
                  : 'No logs available for this deployment.'}
              </p>
            )}
          </div>
          {deployments.length > 1 && (
            <p className="mt-2 text-xs text-muted-foreground text-right">
              Showing logs for the most recent deployment. {deployments.length} total deployments.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
