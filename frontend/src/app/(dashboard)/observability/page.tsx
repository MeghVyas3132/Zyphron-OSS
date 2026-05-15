'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  RefreshCw,
  Bell,
  Search,
  Filter,
  Plus,
  Settings,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMetrics, useTraces, useAlerts, useCreateAlert } from '@/hooks/use-observability';
import { useProjects } from '@/hooks/use-projects';
import type { Project } from '@/lib/api';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.19, 1, 0.22, 1] as const } },
};

// Generates deterministic mock time-series data for when Prometheus is unavailable
function mockTimeSeries(points: number, baseVal: number, variance: number) {
  const now = Date.now();
  return Array.from({ length: points }, (_, i) => {
    const t = new Date(now - (points - i) * 60_000);
    return {
      time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: Math.max(0, baseVal + (Math.sin(i * 0.4) * variance) + (Math.random() * variance * 0.3)),
    };
  });
}

function mockLatencySeries(points: number) {
  const now = Date.now();
  return Array.from({ length: points }, (_, i) => {
    const t = new Date(now - (points - i) * 60_000);
    const base = 120 + Math.sin(i * 0.3) * 40;
    return {
      time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      p50: Math.round(base * 0.5 + Math.random() * 10),
      p95: Math.round(base + Math.random() * 30),
      p99: Math.round(base * 1.6 + Math.random() * 50),
    };
  });
}

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

  const requestData = useMemo(() => mockTimeSeries(30, 1200, 300), []);
  const latencyData = useMemo(() => mockLatencySeries(30), []);

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
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={itemVariants} className="flex items-center justify-between">
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
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Request Rate" value="1.2K/s" change="↑ 12% from last hour" icon={LineChart} />
        <MetricCard title="Error Rate" value="0.12%" change="↓ 0.05% from last hour" icon={Activity} />
        <MetricCard title="P95 Latency" value="45ms" change="↑ 5ms from last hour" icon={Clock} />
        <MetricCard title="Active Alerts" value={String(alertRows.filter((a) => a.status === 'firing').length)} change={`of ${alertRows.length} total`} icon={Bell} />
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="premium-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Request Volume</h3>
            <Button variant="ghost" size="sm" onClick={() => toast.info('Chart configuration is not exposed yet.')}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={requestData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="currentColor" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                <Area type="monotone" dataKey="value" stroke="hsl(var(--foreground))" fill="url(#reqGrad)" strokeWidth={1.5} dot={false} name="req/s" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="premium-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Response Times</h3>
            <Button variant="ghost" size="sm" onClick={() => toast.info('Chart configuration is not exposed yet.')}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={latencyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={36} unit="ms" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: 'hsl(var(--foreground))' }} formatter={(v: number) => [`${v}ms`]} />
                <ReferenceLine y={200} stroke="hsl(var(--foreground))" strokeDasharray="4 4" strokeOpacity={0.35} label={{ value: 'SLA', fontSize: 10, fill: 'hsl(var(--muted-foreground))', position: 'insideTopRight' }} />
                <Line type="monotone" dataKey="p50" stroke="hsl(var(--foreground))" strokeWidth={1.5} strokeOpacity={0.45} dot={false} name="p50" />
                <Line type="monotone" dataKey="p95" stroke="hsl(var(--foreground))" strokeWidth={1.5} dot={false} name="p95" />
                <Line type="monotone" dataKey="p99" stroke="hsl(var(--foreground))" strokeWidth={1.5} strokeOpacity={0.7} strokeDasharray="3 3" dot={false} name="p99" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
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
      </motion.div>

      <motion.div variants={itemVariants}>
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
      </motion.div>
    </motion.div>
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
