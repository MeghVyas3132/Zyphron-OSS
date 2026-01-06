'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { databasesApi, type DatabaseInstance, type CreateDatabaseInput } from '@/lib/api';

// Query keys
export const databaseKeys = {
  all: ['databases'] as const,
  lists: () => [...databaseKeys.all, 'list'] as const,
  list: (params?: { page?: number; limit?: number }) =>
    [...databaseKeys.lists(), params] as const,
  details: () => [...databaseKeys.all, 'detail'] as const,
  detail: (slug: string) => [...databaseKeys.details(), slug] as const,
};

// Hooks
export function useDatabases(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: databaseKeys.list(params),
    queryFn: () => databasesApi.list(params),
  });
}

export function useDatabase(slug: string) {
  return useQuery({
    queryKey: databaseKeys.detail(slug),
    queryFn: () => databasesApi.get(slug),
    enabled: !!slug,
  });
}

export function useCreateDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDatabaseInput) => databasesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: databaseKeys.lists() });
    },
  });
}

export function useDeleteDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slug: string) => databasesApi.delete(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: databaseKeys.lists() });
    },
  });
}

export function useDatabaseConnection(slug: string) {
  return useQuery({
    queryKey: [...databaseKeys.detail(slug), 'connection'],
    queryFn: () => databasesApi.getConnectionString(slug),
    enabled: !!slug,
  });
}
