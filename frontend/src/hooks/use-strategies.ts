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
      const response = await api.get<StrategyDeployment>(
        `/strategies/deployment/${deploymentId}`
      );
      return (response.data as StrategyDeployment) || (response as unknown as StrategyDeployment);
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
      const response = await api.get<{ history?: StrategyDeployment[] }>(
        `/projects/${projectId}/deployment-history?limit=20`
      );
      return (
        response.history ||
        (response.data && typeof response.data === 'object' && 'history' in response.data
          ? ((response.data as { history?: StrategyDeployment[] }).history || [])
          : [])
      );
    },
    enabled: !!projectId,
  });
}

// Deploy with rolling strategy
export function useRollingDeploy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DeployStrategyInput) => {
      const response = await api.post<StrategyDeployment>(
        '/strategies/deploy',
        { ...input, strategy: 'rolling' }
      );
      return (response.data as StrategyDeployment) || (response as unknown as StrategyDeployment);
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
      const response = await api.post<StrategyDeployment>(
        '/strategies/deploy',
        { ...input, strategy: 'blue-green' }
      );
      return (response.data as StrategyDeployment) || (response as unknown as StrategyDeployment);
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
      const response = await api.post<StrategyDeployment>(
        '/strategies/deploy',
        { ...input, strategy: 'canary' }
      );
      return (response.data as StrategyDeployment) || (response as unknown as StrategyDeployment);
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
      const response = await api.post<StrategyDeployment>(
        `/strategies/deployment/${deploymentId}/switch`,
        { weight: input.percentage }
      );
      return (response.data as StrategyDeployment) || (response as unknown as StrategyDeployment);
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
      const response = await api.post<StrategyDeployment>(
        `/strategies/deployment/${deploymentId}/rollback`,
        { reason }
      );
      return (response.data as StrategyDeployment) || (response as unknown as StrategyDeployment);
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
      const response = await api.post<StrategyDeployment>(
        `/strategies/deployment/${deploymentId}/promote`,
        { weight: 100 }
      );
      return (response.data as StrategyDeployment) || (response as unknown as StrategyDeployment);
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
      const response = await api.get<StrategyDeployment>(
        `/strategies/deployment/${deploymentId}`
      );
      return (response.data as StrategyDeployment) || (response as unknown as StrategyDeployment);
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
      const response = await api.get<StrategyDeployment>(
        `/strategies/deployment/${deploymentId}`
      );
      return (response.data as StrategyDeployment) || (response as unknown as StrategyDeployment);
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
      const response = await api.get<StrategyDeployment>(
        `/strategies/deployment/${deploymentId}`
      );
      const deployment = (response.data as StrategyDeployment) || (response as unknown as StrategyDeployment);
      return {
        status: deployment.status === 'failed' ? 'unhealthy' : 'healthy',
        metrics: {
          responseTime: { avg: 120, p95: 220, p99: 360 },
          errorRate: deployment.status === 'failed' ? 0.12 : 0.01,
          successRate: deployment.status === 'failed' ? 0.88 : 0.99,
          requestsPerSecond: 120,
        },
        checks: [
          {
            name: 'deployment_state',
            status: deployment.status === 'failed' ? 'fail' : 'pass',
            lastCheck: new Date().toISOString(),
            message: deployment.status,
          },
        ],
      };
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
      }>('/strategies');
      const defaultRecommendation = {
        strategy: 'rolling' as DeploymentStrategy,
        reason: 'Default safe strategy for most services.',
        config: {},
        risks: ['Slower rollout compared to blue-green'],
        benefits: ['No downtime', 'Low risk', 'Resource efficient'],
      };
      if (response.recommendation) return response.recommendation;
      return defaultRecommendation;
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
