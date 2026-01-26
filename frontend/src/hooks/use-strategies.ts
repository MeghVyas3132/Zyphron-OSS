import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types
export type DeploymentStrategy = 'rolling' | 'blue-green' | 'canary';

export interface StrategyConfig {
  rolling?: {
    maxSurge: number;
    maxUnavailable: number;
    batchSize: number;
    waitTime: number;
  };
  blueGreen?: {
    previewDuration: number;
    autoSwitch: boolean;
    keepOldVersion: boolean;
  };
  canary?: {
    initialPercentage: number;
    incrementPercentage: number;
    incrementInterval: number;
    successThreshold: number;
    errorThreshold: number;
  };
}

export interface StrategyDeployment {
  id: string;
  projectId: string;
  deploymentId: string;
  strategy: DeploymentStrategy;
  config: StrategyConfig;
  status: 'pending' | 'in-progress' | 'switching' | 'completed' | 'failed' | 'rolled-back';
  progress: {
    currentStep: number;
    totalSteps: number;
    percentage: number;
    currentPhase: string;
  };
  versions: {
    current: string;
    new: string;
  };
  trafficSplit: {
    current: number;
    new: number;
  };
  healthChecks: {
    passed: number;
    failed: number;
    lastCheck: string;
  };
  startedAt: string;
  completedAt?: string;
  rollbackReason?: string;
}

export interface DeployStrategyInput {
  projectId: string;
  deploymentId: string;
  strategy: DeploymentStrategy;
  config?: StrategyConfig;
  healthCheckUrl?: string;
  healthCheckInterval?: number;
  rollbackOnFailure?: boolean;
}

export interface SwitchTrafficInput {
  percentage: number;
  target: 'new' | 'current';
}

// Hooks

// Get strategy deployment status
export function useStrategyDeployment(deploymentId: string) {
  return useQuery({
    queryKey: ['strategy-deployment', deploymentId],
    queryFn: async () => {
      const response = await api.get<{ deployment: StrategyDeployment }>(
        `/strategies/deployments/${deploymentId}`
      );
      return response.deployment;
    },
    enabled: !!deploymentId,
    refetchInterval: (query) => {
      // Poll more frequently when deployment is in progress
      const data = query.state.data;
      if (data?.status === 'in-progress' || data?.status === 'switching') {
        return 3000; // 3 seconds
      }
      return false;
    },
  });
}

// Get all strategy deployments for a project
export function useStrategyDeployments(projectId: string) {
  return useQuery({
    queryKey: ['strategy-deployments', projectId],
    queryFn: async () => {
      const response = await api.get<{ deployments: StrategyDeployment[] }>(
        `/strategies/deployments?projectId=${projectId}`
      );
      return response.deployments;
    },
    enabled: !!projectId,
  });
}

// Deploy with rolling strategy
export function useRollingDeploy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DeployStrategyInput) => {
      const response = await api.post<{ deployment: StrategyDeployment }>(
        '/strategies/rolling',
        input
      );
      return response.deployment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['strategy-deployments', data.projectId] });
      queryClient.invalidateQueries({ queryKey: ['deployments', data.projectId] });
    },
  });
}

// Deploy with blue-green strategy
export function useBlueGreenDeploy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DeployStrategyInput) => {
      const response = await api.post<{ deployment: StrategyDeployment }>(
        '/strategies/blue-green',
        input
      );
      return response.deployment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['strategy-deployments', data.projectId] });
      queryClient.invalidateQueries({ queryKey: ['deployments', data.projectId] });
    },
  });
}

// Deploy with canary strategy
export function useCanaryDeploy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DeployStrategyInput) => {
      const response = await api.post<{ deployment: StrategyDeployment }>(
        '/strategies/canary',
        input
      );
      return response.deployment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['strategy-deployments', data.projectId] });
      queryClient.invalidateQueries({ queryKey: ['deployments', data.projectId] });
    },
  });
}

// Switch traffic between versions
export function useSwitchTraffic(deploymentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SwitchTrafficInput) => {
      const response = await api.post<{ deployment: StrategyDeployment }>(
        `/strategies/deployments/${deploymentId}/switch`,
        input
      );
      return response.deployment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['strategy-deployment', deploymentId] });
      queryClient.invalidateQueries({ queryKey: ['strategy-deployments', data.projectId] });
    },
  });
}

// Rollback strategy deployment
export function useRollbackStrategyDeployment(deploymentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reason?: string) => {
      const response = await api.post<{ deployment: StrategyDeployment }>(
        `/strategies/deployments/${deploymentId}/rollback`,
        { reason }
      );
      return response.deployment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['strategy-deployment', deploymentId] });
      queryClient.invalidateQueries({ queryKey: ['strategy-deployments', data.projectId] });
      queryClient.invalidateQueries({ queryKey: ['deployments', data.projectId] });
    },
  });
}

// Complete/Promote strategy deployment
export function usePromoteStrategyDeployment(deploymentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ deployment: StrategyDeployment }>(
        `/strategies/deployments/${deploymentId}/promote`
      );
      return response.deployment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['strategy-deployment', deploymentId] });
      queryClient.invalidateQueries({ queryKey: ['strategy-deployments', data.projectId] });
      queryClient.invalidateQueries({ queryKey: ['deployments', data.projectId] });
    },
  });
}

// Pause strategy deployment
export function usePauseStrategyDeployment(deploymentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ deployment: StrategyDeployment }>(
        `/strategies/deployments/${deploymentId}/pause`
      );
      return response.deployment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy-deployment', deploymentId] });
    },
  });
}

// Resume strategy deployment
export function useResumeStrategyDeployment(deploymentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ deployment: StrategyDeployment }>(
        `/strategies/deployments/${deploymentId}/resume`
      );
      return response.deployment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy-deployment', deploymentId] });
    },
  });
}

// Get deployment health metrics
export function useStrategyDeploymentHealth(deploymentId: string) {
  return useQuery({
    queryKey: ['strategy-deployment-health', deploymentId],
    queryFn: async () => {
      const response = await api.get<{
        health: {
          status: 'healthy' | 'degraded' | 'unhealthy';
          metrics: {
            responseTime: { avg: number; p95: number; p99: number };
            errorRate: number;
            successRate: number;
            requestsPerSecond: number;
          };
          checks: Array<{
            name: string;
            status: 'pass' | 'fail';
            lastCheck: string;
            message?: string;
          }>;
        };
      }>(`/strategies/deployments/${deploymentId}/health`);
      return response.health;
    },
    enabled: !!deploymentId,
    refetchInterval: 10000, // 10 seconds
  });
}

// Get strategy recommendations based on project
export function useStrategyRecommendation(projectId: string) {
  return useQuery({
    queryKey: ['strategy-recommendation', projectId],
    queryFn: async () => {
      const response = await api.get<{
        recommendation: {
          strategy: DeploymentStrategy;
          reason: string;
          config: StrategyConfig;
          risks: string[];
          benefits: string[];
        };
      }>(`/strategies/recommend?projectId=${projectId}`);
      return response.recommendation;
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
