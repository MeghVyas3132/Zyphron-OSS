'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { databasesApi, type DatabaseInstance, type CreateDatabaseInput } from '@/lib/api';

type DatabaseListResponse =
  | { success?: boolean; data?: DatabaseInstance[] }
  | { success?: boolean; data?: { databases?: DatabaseInstance[] } };

type DatabaseSingleResponse =
  | { success?: boolean; data?: DatabaseInstance }
  | { success?: boolean; data?: { database?: DatabaseInstance } };

function extractDatabaseList(response: DatabaseListResponse): DatabaseInstance[] {
  if (Array.isArray(response?.data)) {
    return response.data;
  }
  if (response?.data && typeof response.data === 'object' && Array.isArray((response.data as { databases?: DatabaseInstance[] }).databases)) {
    return (response.data as { databases: DatabaseInstance[] }).databases;
  }
  return [];
}

function extractDatabase(response: DatabaseSingleResponse): DatabaseInstance | null {
  if (response?.data && !Array.isArray(response.data) && 'id' in response.data) {
    return response.data as DatabaseInstance;
  }
  if (response?.data && typeof response.data === 'object' && 'database' in response.data) {
    return ((response.data as { database?: DatabaseInstance }).database ?? null);
  }
  return null;
}

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
    queryFn: async () => {
      const response = await databasesApi.list(params);
      return {
        success: true,
        data: extractDatabaseList(response as DatabaseListResponse),
      };
    },
  });
}

export function useDatabase(databaseId: string) {
  return useQuery({
    queryKey: databaseKeys.detail(databaseId),
    queryFn: async () => {
      const response = await databasesApi.get(databaseId);
      return {
        success: true,
        data: extractDatabase(response as DatabaseSingleResponse),
      };
    },
    enabled: !!databaseId,
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
    mutationFn: (databaseId: string) => databasesApi.delete(databaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: databaseKeys.lists() });
    },
  });
}

export function useDatabaseConnection(databaseId: string) {
  return useQuery({
    queryKey: [...databaseKeys.detail(databaseId), 'connection'],
    queryFn: () => databasesApi.getConnectionString(databaseId),
    enabled: !!databaseId,
  });
}
