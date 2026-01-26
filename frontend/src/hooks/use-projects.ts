'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type Project, type CreateProjectInput, type UpdateProjectInput } from '@/lib/api';

// Query keys
export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (params?: { page?: number; limit?: number }) => [...projectKeys.lists(), params] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (slug: string) => [...projectKeys.details(), slug] as const,
};

// Hooks
export function useProjects(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: projectKeys.list(params),
    queryFn: () => projectsApi.list(params),
  });
}

export function useProject(slug: string) {
  return useQuery({
    queryKey: projectKeys.detail(slug),
    queryFn: () => projectsApi.get(slug),
    enabled: !!slug,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProjectInput) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useUpdateProject(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProjectInput) => projectsApi.update(slug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(slug) });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slug: string) => projectsApi.delete(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useDeployProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ slug, branch }: { slug: string; branch?: string }) => 
      projectsApi.deploy(slug, { branch }),
    onSuccess: (_, { slug }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(slug) });
    },
  });
}
