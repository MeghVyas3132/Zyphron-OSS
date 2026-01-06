'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type EnvVar } from '@/lib/api';

// Query keys
export const envKeys = {
  all: ['env'] as const,
  lists: () => [...envKeys.all, 'list'] as const,
  list: (projectSlug: string) => [...envKeys.lists(), projectSlug] as const,
};

// Hooks
export function useEnvVars(projectSlug: string) {
  return useQuery({
    queryKey: envKeys.list(projectSlug),
    queryFn: () => projectsApi.getEnvVars(projectSlug),
    enabled: !!projectSlug,
  });
}

export function useSetEnvVars(projectSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { key: string; value: string; environment?: string }[]) =>
      projectsApi.setEnvVars(projectSlug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: envKeys.list(projectSlug) });
    },
  });
}

export function useDeleteEnvVar(projectSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (key: string) => projectsApi.deleteEnvVar(projectSlug, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: envKeys.list(projectSlug) });
    },
  });
}
