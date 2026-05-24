import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types
export interface EdgeFunction {
  id: string;
  name: string;
  projectId: string;
  code: string;
  routes: string[];
  regions: string[];
  runtime: 'v8-isolate' | 'node' | 'deno';
  timeout: number;
  memoryLimit: number;
  envVars: Record<string, string>;
  version: number;
  status: 'active' | 'inactive' | 'deploying' | 'error';
  lastDeployedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EdgeFunctionMetrics {
  invocations: number;
  errors: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  coldStarts: number;
  avgColdStartTime: number;
  memoryUsage: {
    avg: number;
    peak: number;
  };
  byRegion: Record<string, {
    invocations: number;
    avgLatency: number;
  }>;
}

export interface EdgeFunctionLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  requestId?: string;
  region?: string;
  duration?: number;
}

export interface CreateEdgeFunctionInput {
  name: string;
  projectId: string;
  code: string;
  routes: string[];
  regions?: string[];
  runtime?: 'v8-isolate' | 'node' | 'deno';
  timeout?: number;
  memoryLimit?: number;
  envVars?: Record<string, string>;
}

export interface UpdateEdgeFunctionInput {
  code?: string;
  routes?: string[];
  regions?: string[];
  timeout?: number;
  memoryLimit?: number;
  envVars?: Record<string, string>;
}

export interface InvokeFunctionInput {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function unwrap<T>(response: unknown, key?: string): T {
  const record = response as Record<string, unknown>;
  if (key && record[key] !== undefined) return record[key] as T;
  if (record.data && typeof record.data === 'object') {
    const dataRecord = record.data as Record<string, unknown>;
    if (key && dataRecord[key] !== undefined) return dataRecord[key] as T;
    return record.data as T;
  }
  return response as T;
}

// Hooks

// Get all edge functions for a project
export function useEdgeFunctions(projectId: string) {
  return useQuery({
    queryKey: ['edge-functions', projectId],
    queryFn: async () => {
      const response = await api.get<{ functions: EdgeFunction[] }>(
        `/edge/projects/${projectId}/functions`
      );
      return unwrap<EdgeFunction[]>(response, 'functions') || [];
    },
    enabled: !!projectId,
  });
}

// Get a single edge function
export function useEdgeFunction(functionId: string) {
  return useQuery({
    queryKey: ['edge-function', functionId],
    queryFn: async () => {
      const response = await api.get<EdgeFunction>(
        `/edge/functions/${functionId}`
      );
      return unwrap<EdgeFunction>(response);
    },
    enabled: !!functionId,
  });
}

// Create edge function
export function useCreateEdgeFunction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEdgeFunctionInput) => {
      const response = await api.post<EdgeFunction>(
        `/edge/projects/${input.projectId}/functions`,
        input
      );
      return unwrap<EdgeFunction>(response);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['edge-functions', data.projectId] });
    },
  });
}

// Update edge function
export function useUpdateEdgeFunction(functionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateEdgeFunctionInput) => {
      const response = await api.patch<EdgeFunction>(
        `/edge/functions/${functionId}`,
        input
      );
      return unwrap<EdgeFunction>(response);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['edge-function', functionId] });
      queryClient.invalidateQueries({ queryKey: ['edge-functions', data.projectId] });
    },
  });
}

// Delete edge function
export function useDeleteEdgeFunction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ functionId, projectId }: { functionId: string; projectId: string }) => {
      await api.delete(`/edge/functions/${functionId}`);
      return { functionId, projectId };
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['edge-functions', projectId] });
    },
  });
}

// Deploy edge function
export function useDeployEdgeFunction(functionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<EdgeFunction>(
        `/edge/functions/${functionId}/deploy`
      );
      return unwrap<EdgeFunction>(response);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['edge-function', functionId] });
      queryClient.invalidateQueries({ queryKey: ['edge-functions', data.projectId] });
    },
  });
}

// Invoke edge function (for testing)
export function useInvokeEdgeFunction(functionId: string) {
  return useMutation({
    mutationFn: async (input: InvokeFunctionInput) => {
      const response = await api.post<{
        statusCode: number;
        headers: Record<string, string>;
        body: unknown;
        duration: number;
        region: string;
      }>(`/edge/functions/${functionId}/invoke`, input);
      return response;
    },
  });
}

// Get edge function metrics
export function useEdgeFunctionMetrics(
  functionId: string,
  options?: { period?: string; startTime?: string; endTime?: string }
) {
  return useQuery({
    queryKey: ['edge-function-metrics', functionId, options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.period) params.append('period', options.period);
      if (options?.startTime) params.append('startTime', options.startTime);
      if (options?.endTime) params.append('endTime', options.endTime);
      
      const response = await api.get<{ metrics: EdgeFunctionMetrics }>(
        `/edge/functions/${functionId}/metrics?${params.toString()}`
      );
      return unwrap<EdgeFunctionMetrics>(response, 'metrics');
    },
    enabled: !!functionId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// Get edge function logs
export function useEdgeFunctionLogs(
  functionId: string,
  options?: { 
    limit?: number; 
    startTime?: string; 
    endTime?: string;
    level?: 'info' | 'warn' | 'error' | 'debug';
    requestId?: string;
  }
) {
  return useQuery({
    queryKey: ['edge-function-logs', functionId, options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.startTime) params.append('startTime', options.startTime);
      if (options?.endTime) params.append('endTime', options.endTime);
      if (options?.level) params.append('level', options.level);
      if (options?.requestId) params.append('requestId', options.requestId);
      
      const response = await api.get<{ logs: EdgeFunctionLog[] }>(
        `/edge/functions/${functionId}/logs?${params.toString()}`
      );
      return unwrap<EdgeFunctionLog[]>(response, 'logs') || [];
    },
    enabled: !!functionId,
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

// Rollback edge function to previous version
export function useRollbackEdgeFunction(functionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (version: number) => {
      const response = await api.post<EdgeFunction>(
        `/edge/functions/${functionId}/rollback`,
        { version }
      );
      return unwrap<EdgeFunction>(response);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['edge-function', functionId] });
      queryClient.invalidateQueries({ queryKey: ['edge-functions', data.projectId] });
    },
  });
}

// Get available regions for edge deployment
export function useEdgeRegions() {
  return useQuery({
    queryKey: ['edge-regions'],
    queryFn: async () => [
      { id: 'iad1', name: 'Washington, D.C.', location: 'US East' },
      { id: 'sfo1', name: 'San Francisco', location: 'US West' },
      { id: 'lhr1', name: 'London', location: 'Europe' },
      { id: 'fra1', name: 'Frankfurt', location: 'Europe' },
      { id: 'sin1', name: 'Singapore', location: 'Asia' },
      { id: 'hnd1', name: 'Tokyo', location: 'Asia' },
    ],
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });
}
