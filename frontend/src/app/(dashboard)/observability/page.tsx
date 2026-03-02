'use client';

import { useState } from 'react';
import {
  Activity,
  RefreshCw,
  Bell,
  BarChart3,
  LineChart,
  Search,
  Filter,
  Plus,
  Settings,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMetrics, useTraces, useAlerts, useCreateAlert } from '@/hooks/use-observability';
import { useProjects } from '@/hooks/use-projects';
import type { Project } from '@/lib/api';

type TraceRow = {
  id: string;
  service: string;
  operation: string;
  duration: number;
  status: 'ok' | 'error';
  timestamp: string;
};

const fallbackAlerts = [
  { id: '1', name: 'High Error Rate', status: 'firing', severity: 'critical', message: 'Error rate > 1%' },
  { id: '2', name: 'High Latency', status: 'resolved', severity: 'warning', message: 'P95 latency > 100ms' },
  { id: '3', name: 'Low Traffic', status: 'pending', severity: 'info', message: 'Traffic below threshold' },
];

const fallbackTraces: TraceRow[] = [
  { id: 'abc123', service: 'api-gateway', operation: 'GET /api/users', duration: 45, status: 'ok', timestamp: '2 min ago' },
  { id: 'def456', service: 'user-service', operation: 'POST /api/auth', duration: 120, status: 'ok', timestamp: '5 min ago' },
  { id: 'ghi789', service: 'payment-service', operation: 'POST /api/charge', duration: 350, status: 'error', timestamp: '8 min ago' },
];

export default function ObservabilityPage() {
  const [timeRange, setTimeRange] = useState('1h');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const { data: projectResponse } = useProjects({ page: 1, limit: 100 });
  const createAlert = useCreateAlert();

  const projectsPayload = projectResponse?.data as unknown;
  const projects: Project[] = Array.isArray(projectsPayload)
    ? projectsPayload
    : projectsPayload && typeof projectsPayload === 'object' && 'projects' in projectsPayload
      ? ((projectsPayload as { projects?: Project[] }).projects || [])
      : [];

  const effectiveProjectId = selectedProjectId || projects[0]?.id || '';

  const { isLoading: loadingMetrics, refetch } = useMetrics({
    projectId: effectiveProjectId,
    period: timeRange,
  });
  const { data: traces } = useTraces({ projectId: effectiveProjectId, limit: 10 });
  const { data: alerts } = useAlerts(effectiveProjectId);

  if (loadingMetrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const alertRows = alerts || fallbackAlerts;
  const traceRows = (traces as TraceRow[] | undefined) || fallbackTraces;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between stagger-in">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-3 mono-text-gradient">
            <Activity className="h-8 w-8" />
            Observability
          </h1>
          <p className="text-muted-foreground mt-1">
            Metrics, traces, and alerting telemetry across your services.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-2">
            <select
              value={effectiveProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="px-3 py-2 border border-input rounded-xl bg-card text-sm min-w-[180px]"
            >
              {projects.length === 0 && <option value="">No projects</option>}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-3 py-2 border border-input rounded-xl bg-card text-sm"
            >
              <option value="15m">Last 15 minutes</option>
              <option value="1h">Last hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Request Rate" value="1.2K/s" change="↑ 12% from last hour" icon={LineChart} />
        <MetricCard title="Error Rate" value="0.12%" change="↓ 0.05% from last hour" icon={Activity} />
        <MetricCard title="P95 Latency" value="45ms" change="↑ 5ms from last hour" icon={Clock} />
        <MetricCard title="Active Alerts" value={String(alertRows.filter((a) => a.status === 'firing').length)} change={`of ${alertRows.length} total`} icon={Bell} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="premium-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Request Volume</h3>
            <Button variant="ghost" size="sm" onClick={() => toast.info('Chart configuration is not exposed yet.')}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-48 flex items-center justify-center rounded-xl border border-border/60 bg-muted/25">
            <BarChart3 className="h-16 w-16 text-muted-foreground/45" />
          </div>
        </div>

        <div className="premium-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Response Times</h3>
            <Button variant="ghost" size="sm" onClick={() => toast.info('Chart configuration is not exposed yet.')}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-48 flex items-center justify-center rounded-xl border border-border/60 bg-muted/25">
            <LineChart className="h-16 w-16 text-muted-foreground/45" />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alerts
          </h2>
          <Button
            size="sm"
            onClick={async () => {
              if (!effectiveProjectId) {
                toast.error('Select a project first.');
                return;
              }
              try {
                await createAlert.mutateAsync({
                  projectId: effectiveProjectId,
                  name: `Latency alert ${new Date().toISOString().slice(11, 19)}`,
                  severity: 'warning',
                  condition: {
                    metric: 'latency',
                    operator: '>',
                    threshold: 1000,
                    duration: 60,
                    aggregation: 'p95',
                  },
                  channels: [{ type: 'in-app', config: {}, enabled: true }],
                });
                toast.success('Alert created.');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Failed to create alert.');
              }
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Alert
          </Button>
        </div>
        <div className="space-y-2">
          {alertRows.map((alert) => (
            <div key={alert.id} className="premium-panel p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {alert.status === 'firing' ? (
                  <XCircle className="h-5 w-5 text-foreground" />
                ) : alert.status === 'resolved' ? (
                  <CheckCircle className="h-5 w-5 text-foreground/80" />
                ) : (
                  <Clock className="h-5 w-5 text-foreground/65" />
                )}
                <div>
                  <h4 className="font-medium">{alert.name}</h4>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded text-xs font-medium bg-foreground/10 text-foreground/80">
                  {alert.severity}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toast.info('Alert settings editor is not wired yet.')}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Traces</h2>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search traces..." className="pl-10 w-64 h-10 rounded-xl" />
            </div>
            <Button variant="outline" size="icon" onClick={() => toast.info('Trace filters are not wired yet.')}>
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="premium-panel overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/35">
              <tr>
                <th className="text-left p-3 text-sm font-medium">Trace ID</th>
                <th className="text-left p-3 text-sm font-medium">Service</th>
                <th className="text-left p-3 text-sm font-medium">Operation</th>
                <th className="text-left p-3 text-sm font-medium">Duration</th>
                <th className="text-left p-3 text-sm font-medium">Status</th>
                <th className="text-left p-3 text-sm font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {traceRows.map((trace) => (
                <tr key={trace.id} className="border-t border-border/55 hover:bg-muted/25 cursor-pointer">
                  <td className="p-3 font-mono text-sm">{trace.id}</td>
                  <td className="p-3 text-sm">{trace.service}</td>
                  <td className="p-3 text-sm font-mono">{trace.operation}</td>
                  <td className="p-3 text-sm">{trace.duration}ms</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 text-xs">
                      <div className={`h-2 w-2 rounded-full ${trace.status === 'ok' ? 'bg-foreground' : 'bg-foreground/60'}`} />
                      {trace.status}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{trace.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  change,
  icon: Icon,
}: {
  title: string;
  value: string;
  change: string;
  icon: React.ElementType;
}) {
  return (
    <div className="premium-panel premium-card-hover p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{change}</p>
    </div>
  );
}
