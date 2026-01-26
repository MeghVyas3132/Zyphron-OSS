// ===========================================
// MULTI-CLOUD HOOKS
// React hooks for multi-cloud features
// ===========================================

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ===========================================
// TYPES
// ===========================================

export type CloudProvider = 'aws' | 'gcp' | 'azure' | 'oracle' | 'digitalocean' | 'linode';

export interface CloudRegion {
  id: string;
  name: string;
  provider: CloudProvider;
  location: string;
  available: boolean;
}

export interface CloudResource {
  id: string;
  type: 'container' | 'function' | 'database' | 'storage' | 'cdn';
  provider: CloudProvider;
  region: string;
  status: string;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface CostEstimate {
  estimated: number;
  currency: string;
  breakdown: { item: string; cost: number }[];
}

// ===========================================
// API HELPER
// ===========================================

async function cloudApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  const response = await fetch(`${API_URL}/api/v1/cloud${endpoint}`, {
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
// HOOKS
// ===========================================

export function useCloudProviders() {
  return useQuery({
    queryKey: ['cloud', 'providers'],
    queryFn: async () => {
      const data = await cloudApi<{ providers: { id: CloudProvider; name: string; available: boolean }[] }>('/providers');
      return data.providers;
    },
  });
}

export function useCloudRegions(provider?: CloudProvider) {
  return useQuery({
    queryKey: ['cloud', 'regions', provider],
    queryFn: async () => {
      if (provider) {
        const data = await cloudApi<{ regions: CloudRegion[] }>(`/providers/${provider}/regions`);
        return data.regions;
      }
      const data = await cloudApi<{ regions: CloudRegion[] }>('/regions');
      return data.regions;
    },
  });
}

export function useCloudResources(projectId: string) {
  return useQuery({
    queryKey: ['cloud', 'resources', projectId],
    queryFn: async () => {
      const data = await cloudApi<{ resources: CloudResource[] }>(`/resources/${projectId}`);
      return data.resources;
    },
    enabled: !!projectId,
  });
}

// Cloud deployments hook
export function useCloudDeployments() {
  return useQuery({
    queryKey: ['cloud', 'deployments'],
    queryFn: async () => {
      const data = await cloudApi<{ deployments: CloudResource[] }>('/deployments');
      return data.deployments;
    },
  });
}

// Deploy to cloud mutation
export function useDeployToCloud() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      image: string;
      provider: CloudProvider;
      region: string;
      resources: { cpu: string; memory: string; replicas?: number };
      env?: Record<string, string>;
    }) => {
      return cloudApi<{ success: boolean; resource: CloudResource }>('/deploy', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cloud', 'resources', variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['cloud', 'deployments'] });
    },
  });
}

// Scale deployment mutation
export function useScaleDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      deploymentId: string;
      replicas: number;
    }) => {
      return cloudApi<{ success: boolean }>(`/deployments/${params.deploymentId}/scale`, {
        method: 'POST',
        body: JSON.stringify({ replicas: params.replicas }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud', 'deployments'] });
    },
  });
}

export function useCloudDeploy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      image: string;
      provider: CloudProvider;
      region: string;
      resources: { cpu: string; memory: string; replicas?: number };
      env?: Record<string, string>;
    }) => {
      return cloudApi<{ success: boolean; resource: CloudResource }>('/deploy', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cloud', 'resources', variables.projectId] });
    },
  });
}

export function useMultiCloudDeploy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      image: string;
      targets: { provider: CloudProvider; region: string }[];
      resources: { cpu: string; memory: string };
      env?: Record<string, string>;
      strategy?: 'primary-backup' | 'active-active' | 'geo-distributed';
    }) => {
      return cloudApi<{ success: boolean; deployment: unknown }>('/deploy/multi', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cloud', 'resources', variables.projectId] });
    },
  });
}

export function useCostEstimate() {
  return useMutation({
    mutationFn: async (params: {
      provider: CloudProvider;
      region: string;
      cpu: string;
      memory: string;
      hoursPerMonth?: number;
    }) => {
      return cloudApi<CostEstimate>('/estimate', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
  });
}

export function useCostComparison() {
  return useMutation({
    mutationFn: async (params: {
      cpu: string;
      memory: string;
      hoursPerMonth?: number;
    }) => {
      return cloudApi<{
        comparison: (CostEstimate & { provider: CloudProvider })[];
        cheapest: CloudProvider;
        mostExpensive: CloudProvider;
      }>('/estimate/compare', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
  });
}

export function useDeleteCloudResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, resourceId }: { projectId: string; resourceId: string }) => {
      return cloudApi<{ success: boolean }>(`/resources/${projectId}/${resourceId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cloud', 'resources', variables.projectId] });
    },
  });
}
