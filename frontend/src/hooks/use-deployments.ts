'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type Deployment } from '@/lib/api';

// Query keys
export const deploymentKeys = {
  all: ['deployments'] as const,
  lists: () => [...deploymentKeys.all, 'list'] as const,
  list: (projectSlug: string, params?: { page?: number; limit?: number }) => 
    [...deploymentKeys.lists(), projectSlug, params] as const,
  details: () => [...deploymentKeys.all, 'detail'] as const,
  detail: (projectSlug: string, deploymentId: string) => 
    [...deploymentKeys.details(), projectSlug, deploymentId] as const,
};

// Hooks
export function useDeployments(
  projectSlug: string,
  params?: { page?: number; limit?: number }
) {
  return useQuery({
    queryKey: deploymentKeys.list(projectSlug, params),
    queryFn: () => projectsApi.getDeployments(projectSlug, params),
    enabled: !!projectSlug,
  });
}

export function useDeployment(projectSlug: string, deploymentId: string) {
  return useQuery({
    queryKey: deploymentKeys.detail(projectSlug, deploymentId),
    queryFn: () => projectsApi.getDeployment(projectSlug, deploymentId),
    enabled: !!projectSlug && !!deploymentId,
    // Poll for updates while building or deploying
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.data?.status === 'BUILDING' || data?.data?.status === 'DEPLOYING') {
        return 3000; // Poll every 3 seconds
      }
      return false;
    },
  });
}

export function useDeploy(projectSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data?: { branch?: string }) => projectsApi.deploy(projectSlug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deploymentKeys.list(projectSlug) });
    },
  });
}

export function useCancelDeployment(projectSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (deploymentId: string) => projectsApi.cancelDeployment(projectSlug, deploymentId),
    onSuccess: (_, deploymentId) => {
      queryClient.invalidateQueries({ queryKey: deploymentKeys.detail(projectSlug, deploymentId) });
      queryClient.invalidateQueries({ queryKey: deploymentKeys.list(projectSlug) });
    },
  });
}

export function useRollback(projectSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deploymentId: string) => {
      // Rollback creates a new deployment from a previous one
      const deployment = await projectsApi.getDeployment(projectSlug, deploymentId);
      return projectsApi.deploy(projectSlug, { 
        branch: deployment.data.branch,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deploymentKeys.list(projectSlug) });
    },
  });
}
