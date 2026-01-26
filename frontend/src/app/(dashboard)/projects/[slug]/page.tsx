'use client';

import { useState } from 'react';
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
};

const frameworkIcons: Record<string, string> = {
  nextjs: '▲',
  react: '⚛️',
  vue: '💚',
  nuxt: '💚',
  svelte: '🔥',
  sveltekit: '🔥',
  angular: '🔺',
  express: '⚡',
  fastify: '⚡',
  nestjs: '🐱',
  flask: '🐍',
  django: '🐍',
  fastapi: '🐍',
  go: '🐹',
  rust: '🦀',
  static: '📄',
  docker: '🐳',
  unknown: '📦',
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  
  const [activeTab, setActiveTab] = useState<'deployments' | 'settings' | 'logs'>('deployments');
  
  // Use React Query hooks
  const { data: projectData, isLoading: projectLoading, isError: projectError, error: projectFetchError, refetch: refetchProject } = useProject(slug);
  const { data: deploymentsData, isLoading: deploymentsLoading, refetch: refetchDeployments } = useDeployments(slug);
  const deployMutation = useDeploy(slug);
  const deleteMutation = useDeleteProject();

  const project = projectData?.data;
  const deployments = deploymentsData?.data || [];
  const isLoading = projectLoading || deploymentsLoading;

  const frameworkIcon = frameworkIcons[project?.framework || 'unknown'] || '📦';

  const handleDeploy = async () => {
    try {
      await deployMutation.mutateAsync({ branch: project?.defaultBranch });
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
          <span className="text-3xl">{frameworkIcon}</span>
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <GitBranch className="h-4 w-4" />
                <span>{project.defaultBranch}</span>
              </div>
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
                const config = statusConfig[deployment.status];
                const StatusIcon = config.icon;

                return (
                  <div key={deployment.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${config.bg}`}>
                          <StatusIcon
                            className={`h-4 w-4 ${config.color} ${
                              config.animate ? 'animate-spin' : ''
                            }`}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{deployment.commitMessage}</p>
                            <span className={`text-xs px-2 py-0.5 rounded ${config.bg} ${config.color}`}>
                              {config.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <GitBranch className="h-3 w-3" />
                            <span>{deployment.branch}</span>
                            <span>·</span>
                            <span>{deployment.commitSha.slice(0, 7)}</span>
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
                    {deployment.logs && deployment.status === 'FAILED' && (
                      <div className="mt-3 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                        <div className="flex items-center gap-2 text-red-500 text-sm font-medium mb-1">
                          <Terminal className="h-4 w-4" />
                          Build Error
                        </div>
                        <p className="text-sm text-muted-foreground font-mono">{deployment.logs}</p>
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
            <h3 className="font-semibold">Live Logs</h3>
            <Button variant="outline" size="sm">
              <Activity className="h-4 w-4 mr-2" />
              Live
            </Button>
          </div>
          <div className="bg-black rounded-lg p-4 font-mono text-sm text-green-400 h-96 overflow-auto">
            <p>[2024-01-15 10:32:01] Cloning repository...</p>
            <p>[2024-01-15 10:32:03] Installing dependencies...</p>
            <p>[2024-01-15 10:32:15] Running build command...</p>
            <p>[2024-01-15 10:32:45] Build completed successfully</p>
            <p>[2024-01-15 10:32:46] Uploading artifacts...</p>
            <p>[2024-01-15 10:32:50] Deploying to edge network...</p>
            <p>[2024-01-15 10:32:55] ✓ Deployment ready</p>
            <p className="text-muted-foreground mt-4">No new logs...</p>
          </div>
        </div>
      )}
    </div>
  );
}
