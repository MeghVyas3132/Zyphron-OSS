'use client';

import { useState } from 'react';
import { 
  Activity, 
  RefreshCw, 
  AlertTriangle,
  Bell,
  BarChart3,
  LineChart,
  Search,
  Filter,
  Plus,
  Settings,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  useMetrics,
  useTraces,
  useAlerts,
  useCreateAlert,
  useDashboards
} from '@/hooks/use-observability';

export default function ObservabilityPage() {
  const [timeRange, setTimeRange] = useState('1h');
  const [selectedProjectId] = useState('default');
  
  const { data: metrics, isLoading: loadingMetrics, refetch } = useMetrics({
    projectId: selectedProjectId,
    period: timeRange
  });
  const { data: traces } = useTraces({ projectId: selectedProjectId, limit: 10 });
  const { data: alerts } = useAlerts(selectedProjectId);
  const { data: dashboards } = useDashboards(selectedProjectId);

  if (loadingMetrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="h-8 w-8" />
            Observability
          </h1>
          <p className="text-muted-foreground mt-1">
            Metrics, traces, and alerts for your applications
          </p>
        </div>
        <div className="flex gap-2">
          <select 
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-background text-sm"
          >
            <option value="15m">Last 15 minutes</option>
            <option value="1h">Last hour</option>
            <option value="6h">Last 6 hours</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
          </select>
          <Button onClick={() => refetch()} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Request Rate</span>
            <LineChart className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">1.2K/s</p>
          <p className="text-xs text-green-500">↑ 12% from last hour</p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Error Rate</span>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">0.12%</p>
          <p className="text-xs text-green-500">↓ 0.05% from last hour</p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">P95 Latency</span>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">45ms</p>
          <p className="text-xs text-yellow-500">↑ 5ms from last hour</p>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Active Alerts</span>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{alerts?.filter(a => a.status === 'firing').length || 0}</p>
          <p className="text-xs text-muted-foreground">of {alerts?.length || 0} total</p>
        </div>
      </div>

      {/* Charts Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 border rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Request Volume</h3>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-48 flex items-center justify-center bg-muted/30 rounded-lg">
            <BarChart3 className="h-16 w-16 text-muted-foreground/50" />
          </div>
        </div>
        <div className="p-6 border rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Response Times</h3>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <div className="h-48 flex items-center justify-center bg-muted/30 rounded-lg">
            <LineChart className="h-16 w-16 text-muted-foreground/50" />
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alerts
          </h2>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Create Alert
          </Button>
        </div>
        <div className="space-y-2">
          {(alerts || [
            { id: '1', name: 'High Error Rate', status: 'firing', severity: 'critical', message: 'Error rate > 1%' },
            { id: '2', name: 'High Latency', status: 'resolved', severity: 'warning', message: 'P95 latency > 100ms' },
            { id: '3', name: 'Low Traffic', status: 'pending', severity: 'info', message: 'Traffic below threshold' },
          ]).map((alert) => (
            <div
              key={alert.id}
              className={`p-4 border rounded-lg flex items-center justify-between ${
                alert.status === 'firing' ? 'border-red-500/50 bg-red-500/5' :
                alert.status === 'resolved' ? 'border-green-500/50 bg-green-500/5' :
                ''
              }`}
            >
              <div className="flex items-center gap-3">
                {alert.status === 'firing' ? (
                  <XCircle className="h-5 w-5 text-red-500" />
                ) : alert.status === 'resolved' ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <Clock className="h-5 w-5 text-yellow-500" />
                )}
                <div>
                  <h4 className="font-medium">{alert.name}</h4>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  alert.severity === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                  alert.severity === 'warning' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                }`}>
                  {alert.severity}
                </span>
                <Button variant="ghost" size="sm">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Traces */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Traces</h2>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search traces..." className="pl-10 w-64" />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
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
              {(traces || [
                { id: 'abc123', service: 'api-gateway', operation: 'GET /api/users', duration: 45, status: 'ok', timestamp: '2 min ago' },
                { id: 'def456', service: 'user-service', operation: 'POST /api/auth', duration: 120, status: 'ok', timestamp: '5 min ago' },
                { id: 'ghi789', service: 'payment-service', operation: 'POST /api/charge', duration: 350, status: 'error', timestamp: '8 min ago' },
              ]).map((trace) => (
                <tr key={trace.id} className="border-t hover:bg-muted/30 cursor-pointer">
                  <td className="p-3 font-mono text-sm">{trace.id}</td>
                  <td className="p-3 text-sm">{trace.service}</td>
                  <td className="p-3 text-sm font-mono">{trace.operation}</td>
                  <td className="p-3 text-sm">{trace.duration}ms</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 text-xs ${
                      trace.status === 'ok' ? 'text-green-500' : 'text-red-500'
                    }`}>
                      <div className={`h-2 w-2 rounded-full ${
                        trace.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
                      }`} />
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
