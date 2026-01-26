import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types
export interface ComponentStatus {
  status: 'pending' | 'deploying' | 'running' | 'failed';
  replicas: { ready: number; desired: number };
  version: string;
  lastUpdated: string;
}

export interface HealthCheckResult {
  component: string;
  healthy: boolean;
  responseTime: number;
  timestamp: string;
  error?: string;
}

export interface DeploymentStatus {
  id: string;
  status: 'pending' | 'deploying' | 'running' | 'failed' | 'rolled-back';
  version: string;
  previousVersion?: string;
  startedAt: string;
  completedAt?: string;
  components: {
    api: ComponentStatus;
    worker: ComponentStatus;
    frontend: ComponentStatus;
  };
  healthChecks: HealthCheckResult[];
  logs: string[];
}

export interface SystemHealth {
  healthy: boolean;
  components: Record<string, { healthy: boolean; latency: number }>;
  version: string;
}

export interface DeployInput {
  version: string;
  environment?: 'production' | 'staging' | 'development';
  components?: {
    api?: boolean;
    worker?: boolean;
    frontend?: boolean;
  };
  strategy?: 'rolling' | 'blue-green' | 'canary';
  healthCheckUrl?: string;
  rollbackOnFailure?: boolean;
}

// Hooks

// Get system health
export function useSystemHealth() {
  return useQuery({
    queryKey: ['self-deploy', 'health'],
    queryFn: async () => {
      const response = await api.get<SystemHealth>('/self-deploy/health');
      return response;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// Get current version
export function useCurrentVersion() {
  return useQuery({
    queryKey: ['self-deploy', 'version'],
    queryFn: async () => {
      const response = await api.get<{ version: string }>('/self-deploy/version');
      return response.version;
    },
    staleTime: 60000, // 1 minute
  });
}

// Get deployment manifest
export function useDeploymentManifest(version?: string) {
  return useQuery({
    queryKey: ['self-deploy', 'manifest', version],
    queryFn: async () => {
      const url = version 
        ? `/self-deploy/manifest?version=${version}`
        : '/self-deploy/manifest';
      const response = await api.get<{ manifest: Record<string, unknown> }>(url);
      return response.manifest;
    },
  });
}

// Start self-deployment
export function useSelfDeploy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DeployInput) => {
      const response = await api.post<{ deployment: DeploymentStatus }>(
        '/self-deploy/deploy',
        input
      );
      return response.deployment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['self-deploy', 'deployments'] });
      queryClient.invalidateQueries({ queryKey: ['self-deploy', 'health'] });
      queryClient.invalidateQueries({ queryKey: ['self-deploy', 'version'] });
    },
  });
}

// Get deployment status
export function useDeploymentStatus(deploymentId: string) {
  return useQuery({
    queryKey: ['self-deploy', 'deployment', deploymentId],
    queryFn: async () => {
      const response = await api.get<{ deployment: DeploymentStatus }>(
        `/self-deploy/deployments/${deploymentId}`
      );
      return response.deployment;
    },
    enabled: !!deploymentId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 'deploying' || data?.status === 'pending') {
        return 3000; // Poll every 3 seconds when deploying
      }
      return false;
    },
  });
}

// List all deployments
export function useSelfDeployments(limit = 10) {
  return useQuery({
    queryKey: ['self-deploy', 'deployments', limit],
    queryFn: async () => {
      const response = await api.get<{ deployments: DeploymentStatus[] }>(
        `/self-deploy/deployments?limit=${limit}`
      );
      return response.deployments;
    },
  });
}

// Rollback deployment
export function useRollbackDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deploymentId: string) => {
      const response = await api.post<{ deployment: DeploymentStatus }>(
        `/self-deploy/deployments/${deploymentId}/rollback`
      );
      return response.deployment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['self-deploy'] });
    },
  });
}
