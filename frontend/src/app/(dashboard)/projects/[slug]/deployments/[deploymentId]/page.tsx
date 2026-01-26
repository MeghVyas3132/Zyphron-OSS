'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  GitBranch, 
  Clock,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  AlertCircle,
  RotateCcw,
  Copy,
  Check,
  Globe,
  Box
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import { useProject } from '@/hooks/use-projects';
import { useDeployment, useCancelDeployment, useRollback } from '@/hooks/use-deployments';

const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string; label: string; animate?: boolean }> = {
  QUEUED: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Queued' },
  PENDING: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Pending' },
  CLONING: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Cloning', animate: true },
  BUILDING: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Building', animate: true },
  DEPLOYING: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Deploying', animate: true },
  LIVE: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Live' },
  READY: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Ready' },
  FAILED: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Failed' },
  CANCELLED: { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Cancelled' },
  ROLLING_BACK: { icon: Loader2, color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'Rolling Back', animate: true },
};

interface LogLine {
  timestamp: string;
  message: string;
  level: 'info' | 'error' | 'warn' | 'success';
}

export default function DeploymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const deploymentId = params.deploymentId as string;
  
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  
  const { data: projectData, isLoading: projectLoading } = useProject(slug);
  const { data: deploymentData, isLoading: deploymentLoading, refetch } = useDeployment(slug, deploymentId);
  const cancelMutation = useCancelDeployment(slug);
  const rollbackMutation = useRollback(slug);

  const project = projectData?.data;
  const deployment = deploymentData?.data;
  const isLoading = projectLoading || deploymentLoading;

  const config = deployment ? (statusConfig[deployment.status] || statusConfig.PENDING) : statusConfig.PENDING;
  const StatusIcon = config.icon;
  const isActive = deployment && ['QUEUED', 'PENDING', 'CLONING', 'BUILDING', 'DEPLOYING'].includes(deployment.status);

  // WebSocket for real-time logs
  useEffect(() => {
    if (!deployment || !isActive) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
    const ws = new WebSocket(`${wsUrl}/ws/deployments/${deploymentId}/logs`);

    ws.onopen = () => {
      setWsConnected(true);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          setLogs((prev) => [...prev, {
            timestamp: data.timestamp || new Date().toISOString(),
            message: data.message,
            level: data.level || 'info',
          }]);
        } else if (data.type === 'status') {
          refetch();
        }
      } catch (e) {
        // Plain text log
        setLogs((prev) => [...prev, {
          timestamp: new Date().toISOString(),
          message: event.data,
          level: 'info',
        }]);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      console.log('WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, [deployment, deploymentId, isActive, refetch]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Parse existing logs if present
  useEffect(() => {
    if (deployment?.logs && logs.length === 0) {
      const existingLogs = deployment.logs.split('\n').filter(Boolean).map((line) => ({
        timestamp: new Date().toISOString(),
        message: line,
        level: 'info' as const,
      }));
      setLogs(existingLogs);
    }
  }, [deployment?.logs, logs.length]);

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this deployment?')) return;
    try {
      await cancelMutation.mutateAsync(deploymentId);
      refetch();
    } catch (error) {
      console.error('Failed to cancel:', error);
    }
  };

  const handleRollback = async () => {
    if (!confirm('Are you sure you want to rollback to this deployment?')) return;
    try {
      await rollbackMutation.mutateAsync(deploymentId);
      router.push(`/projects/${slug}`);
    } catch (error) {
      console.error('Failed to rollback:', error);
    }
  };

  const copyLogs = () => {
    const logText = logs.map((l) => `[${l.timestamp}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(logText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDuration = (start: string, end?: string | null) => {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diffMs = endDate.getTime() - startDate.getTime();
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!deployment || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">Deployment not found</p>
        <Link href={`/projects/${slug}`}>
          <Button variant="outline">Back to Project</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/projects/${slug}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
              {config.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            <div className="flex items-center gap-1">
              <GitBranch className="h-4 w-4" />
              <span>{deployment.branch}</span>
            </div>
            <span>·</span>
            <span className="font-mono">{deployment.commitSha?.slice(0, 7)}</span>
            <span>·</span>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{formatRelativeTime(deployment.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <Button 
              variant="outline" 
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel'}
            </Button>
          )}
          {deployment.status === 'READY' && (
            <Button 
              variant="outline" 
              onClick={handleRollback}
              disabled={rollbackMutation.isPending}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              {rollbackMutation.isPending ? 'Rolling back...' : 'Rollback to this'}
            </Button>
          )}
          {deployment.url && (
            <a href={deployment.url} target="_blank" rel="noopener noreferrer">
              <Button className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Visit
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Box className="h-4 w-4" />
            Status
          </div>
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-5 w-5 ${config.color} ${config.animate ? 'animate-spin' : ''}`} />
            <span className="font-semibold">{config.label}</span>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Clock className="h-4 w-4" />
            Duration
          </div>
          <div className="font-semibold">
            {formatDuration(deployment.createdAt, deployment.completedAt)}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <GitBranch className="h-4 w-4" />
            Branch
          </div>
          <div className="font-semibold">{deployment.branch}</div>
        </div>

        {deployment.url && (
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Globe className="h-4 w-4" />
              URL
            </div>
            <a 
              href={deployment.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline truncate block"
            >
              {deployment.url.replace('https://', '')}
            </a>
          </div>
        )}
      </div>

      {/* Commit Info */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold mb-2">Commit</h3>
        <p className="text-muted-foreground">{deployment.commitMessage || 'No commit message'}</p>
        <div className="mt-2 text-sm text-muted-foreground font-mono">
          {deployment.commitSha}
        </div>
      </div>

      {/* Build Logs */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <h3 className="font-semibold">Build Logs</h3>
            {wsConnected && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className={autoScroll ? 'text-primary' : ''}
            >
              Auto-scroll: {autoScroll ? 'On' : 'Off'}
            </Button>
            <Button variant="ghost" size="sm" onClick={copyLogs} className="gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div 
          ref={logContainerRef}
          className="bg-zinc-950 p-4 font-mono text-sm h-[500px] overflow-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            const isAtBottom = el.scrollHeight - el.scrollTop === el.clientHeight;
            setAutoScroll(isAtBottom);
          }}
        >
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {isActive ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for logs...
                </div>
              ) : (
                'No logs available'
              )}
            </div>
          ) : (
            logs.map((log, i) => (
              <div 
                key={i} 
                className={`py-0.5 ${
                  log.level === 'error' ? 'text-red-400' :
                  log.level === 'warn' ? 'text-yellow-400' :
                  log.level === 'success' ? 'text-green-400' :
                  'text-zinc-300'
                }`}
              >
                <span className="text-zinc-600 mr-2">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>
                {log.message}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Error Details */}
      {deployment.status === 'FAILED' && deployment.logs && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6">
          <div className="flex items-center gap-2 text-red-500 font-semibold mb-4">
            <XCircle className="h-5 w-5" />
            Deployment Failed
          </div>
          <p className="text-muted-foreground mb-4">
            The deployment failed. Check the logs above for more details.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/projects/${slug}`)}>
              Back to Project
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Deployment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
