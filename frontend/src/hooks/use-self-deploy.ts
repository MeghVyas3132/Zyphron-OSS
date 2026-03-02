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
  status:
    | 'pending'
    | 'deploying'
    | 'in-progress'
    | 'running'
    | 'completed'
    | 'failed'
    | 'rolled-back';
  version: string;
  previousVersion?: string;
  fromVersion?: string;
  toVersion?: string;
  strategy?: 'rolling' | 'blue-green' | 'canary';
  progress?: {
    phase?: string;
    currentPhase?: string;
    percentage: number;
  };
  startedAt: string;
  completedAt?: string;
  components:
    | {
        api: ComponentStatus;
        worker: ComponentStatus;
        frontend: ComponentStatus;
      }
    | string[];
  healthChecks: HealthCheckResult[];
  logs: string[];
}

export interface SystemHealth {
  status?: 'healthy' | 'degraded' | 'unhealthy';
  healthy: boolean;
  components: Record<
    string,
    {
      healthy?: boolean;
      latency?: number;
      status?: 'healthy' | 'degraded' | 'unhealthy';
      cpu?: string;
      memory?: string;
      version?: string;
    }
  >;
  version?: string;
  uptime?: string;
  containers?: {
    running: number;
    total: number;
  };
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
      if (response?.data && typeof response.data === 'object' && 'components' in response.data) {
        return response.data as SystemHealth;
      }
      return response as unknown as SystemHealth;
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
      if (typeof response.version === 'string') {
        return response.version;
      }
      if (response?.data && typeof response.data === 'object' && 'version' in response.data) {
        return String((response.data as { version: string }).version);
      }
      return '';
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
      if (response?.manifest && typeof response.manifest === 'object') {
        return response.manifest;
      }
      if (response?.data && typeof response.data === 'object' && 'manifest' in response.data) {
        return (response.data as { manifest: Record<string, unknown> }).manifest;
      }
      return {};
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
      if (response?.deployment) {
        return response.deployment;
      }
      if (response?.data && typeof response.data === 'object' && 'deployment' in response.data) {
        return (response.data as { deployment: DeploymentStatus }).deployment;
      }
      return response as unknown as DeploymentStatus;
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
      if (response?.deployment) {
        return response.deployment;
      }
      if (response?.data && typeof response.data === 'object' && 'deployment' in response.data) {
        return (response.data as { deployment: DeploymentStatus }).deployment;
      }
      return response as unknown as DeploymentStatus;
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
      if (Array.isArray(response?.deployments)) {
        return response.deployments;
      }
      if (response?.data && typeof response.data === 'object' && 'deployments' in response.data) {
        return (response.data as { deployments: DeploymentStatus[] }).deployments;
      }
      return [];
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
      if (response?.deployment) {
        return response.deployment;
      }
      if (response?.data && typeof response.data === 'object' && 'deployment' in response.data) {
        return (response.data as { deployment: DeploymentStatus }).deployment;
      }
      return response as unknown as DeploymentStatus;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['self-deploy'] });
    },
  });
}
