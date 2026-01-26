// ===========================================
// OBSERVABILITY HOOKS
// React hooks for metrics, alerts, dashboards
// ===========================================

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ===========================================
// TYPES
// ===========================================

export interface Alert {
  id: string;
  name: string;
  projectId: string;
  condition: {
    metric: string;
    operator: string;
    threshold: number;
    duration: number;
    aggregation: string;
  };
  status: 'active' | 'firing' | 'resolved' | 'silenced';
  severity: 'critical' | 'warning' | 'info';
  lastFiredAt?: string;
}

export interface Dashboard {
  id: string;
  projectId: string;
  name: string;
  panels: DashboardPanel[];
  refreshInterval: number;
}

export interface DashboardPanel {
  id: string;
  title: string;
  type: 'graph' | 'stat' | 'table' | 'logs' | 'heatmap';
  query: string;
  position: { x: number; y: number; w: number; h: number };
}

export interface DeploymentMetrics {
  requests: number;
  errors: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  cpuUsage: number;
  memoryUsage: number;
  networkIn: number;
  networkOut: number;
}

// ===========================================
// API HELPER
// ===========================================

async function obsApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  const response = await fetch(`${API_URL}/api/v1/observability${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...options,
  });
  if (!response.ok) throw new Error('API request failed');
  return response.json();
}

// ===========================================
// METRICS HOOKS
// ===========================================

export function useDeploymentMetrics(deploymentId: string) {
  return useQuery({
    queryKey: ['observability', 'metrics', deploymentId],
    queryFn: async () => {
      return obsApi<DeploymentMetrics>(`/deployments/${deploymentId}/metrics`);
    },
    enabled: !!deploymentId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// Generic metrics hook for project-level metrics
export function useMetrics(params: { projectId: string; range?: string }) {
  return useQuery({
    queryKey: ['observability', 'metrics', 'project', params.projectId, params.range],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.range) searchParams.set('range', params.range);
      const data = await obsApi<{ metrics: DeploymentMetrics[] }>(
        `/projects/${params.projectId}/metrics?${searchParams.toString()}`
      );
      return data.metrics;
    },
    enabled: !!params.projectId,
    refetchInterval: 30000,
  });
}

// Traces hook
export function useTraces(params: { projectId: string; limit?: number }) {
  return useQuery({
    queryKey: ['observability', 'traces', params.projectId, params.limit],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.limit) searchParams.set('limit', String(params.limit));
      const data = await obsApi<{ traces: unknown[] }>(
        `/projects/${params.projectId}/traces?${searchParams.toString()}`
      );
      return data.traces;
    },
    enabled: !!params.projectId,
  });
}

// Alerts hook (alias for useProjectAlerts)
export function useAlerts(projectId: string) {
  return useQuery({
    queryKey: ['observability', 'alerts', projectId],
    queryFn: async () => {
      const data = await obsApi<{ alerts: Alert[] }>(`/projects/${projectId}/alerts`);
      return data.alerts;
    },
    enabled: !!projectId,
  });
}

// ===========================================
// ALERTS HOOKS
// ===========================================

export function useProjectAlerts(projectId: string) {
  return useQuery({
    queryKey: ['observability', 'alerts', projectId],
    queryFn: async () => {
      const data = await obsApi<{ alerts: Alert[] }>(`/projects/${projectId}/alerts`);
      return data.alerts;
    },
    enabled: !!projectId,
  });
}

export function useCreateAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      name: string;
      condition: Alert['condition'];
      channels: { type: string; config: Record<string, string>; enabled: boolean }[];
      severity: Alert['severity'];
    }) => {
      return obsApi<Alert>(`/projects/${params.projectId}/alerts`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['observability', 'alerts', data.projectId] });
    },
  });
}

export function useSilenceAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ alertId, duration }: { alertId: string; duration: number; projectId: string }) => {
      return obsApi<{ success: boolean }>(`/alerts/${alertId}/silence`, {
        method: 'POST',
        body: JSON.stringify({ duration }),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['observability', 'alerts', variables.projectId] });
    },
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ alertId, projectId }: { alertId: string; projectId: string }) => {
      return obsApi<{ success: boolean }>(`/alerts/${alertId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['observability', 'alerts', variables.projectId] });
    },
  });
}

// ===========================================
// DASHBOARD HOOKS
// ===========================================

export function useProjectDashboards(projectId: string) {
  return useQuery({
    queryKey: ['observability', 'dashboards', projectId],
    queryFn: async () => {
      const data = await obsApi<{ dashboards: Dashboard[] }>(`/projects/${projectId}/dashboards`);
      return data.dashboards;
    },
    enabled: !!projectId,
  });
}

export function useDashboard(dashboardId: string) {
  return useQuery({
    queryKey: ['observability', 'dashboard', dashboardId],
    queryFn: async () => {
      return obsApi<Dashboard>(`/dashboards/${dashboardId}`);
    },
    enabled: !!dashboardId,
  });
}

export function useDefaultDashboard(projectId: string) {
  return useQuery({
    queryKey: ['observability', 'dashboard', 'default', projectId],
    queryFn: async () => {
      return obsApi<Dashboard>(`/projects/${projectId}/dashboards/default`);
    },
    enabled: !!projectId,
  });
}

export function useCreateDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      name: string;
      panels?: DashboardPanel[];
      refreshInterval?: number;
    }) => {
      return obsApi<Dashboard>(`/projects/${params.projectId}/dashboards`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['observability', 'dashboards', data.projectId] });
    },
  });
}

export function useUpdateDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dashboardId,
      ...updates
    }: {
      dashboardId: string;
      name?: string;
      panels?: DashboardPanel[];
      refreshInterval?: number;
    }) => {
      return obsApi<Dashboard>(`/dashboards/${dashboardId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['observability', 'dashboard', data.id] });
      queryClient.invalidateQueries({ queryKey: ['observability', 'dashboards', data.projectId] });
    },
  });
}

export function useDeleteDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dashboardId, projectId }: { dashboardId: string; projectId: string }) => {
      return obsApi<{ success: boolean }>(`/dashboards/${dashboardId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['observability', 'dashboards', variables.projectId] });
    },
  });
}

// ===========================================
// LOGS HOOKS
// ===========================================

export function useLogs(params: {
  service?: string;
  level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  search?: string;
  traceId?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['observability', 'logs', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.service) searchParams.set('service', params.service);
      if (params.level) searchParams.set('level', params.level);
      if (params.search) searchParams.set('search', params.search);
      if (params.traceId) searchParams.set('traceId', params.traceId);
      if (params.limit) searchParams.set('limit', String(params.limit));

      const data = await obsApi<{ logs: unknown[] }>(`/logs?${searchParams.toString()}`);
      return data.logs;
    },
    refetchInterval: 5000, // Refresh every 5 seconds for live logs
  });
}
