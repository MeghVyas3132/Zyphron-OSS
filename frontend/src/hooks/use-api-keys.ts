'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';

// ===========================================
// TYPES
// ===========================================

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  isExpired?: boolean;
}

export interface CreateApiKeyInput {
  name: string;
  expiresInDays?: number;
}

export interface CreatedApiKey extends ApiKey {
  key: string; // Full key only shown on creation
}

// ===========================================
// LIST API KEYS
// ===========================================

export function useApiKeys(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['api-keys', page, limit],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/api-keys?page=${page}&limit=${limit}`);
      return data.data;
    },
  });
}

// ===========================================
// GET API KEY DETAILS
// ===========================================

export function useApiKey(keyId: string) {
  return useQuery({
    queryKey: ['api-keys', keyId],
    queryFn: async () => {
      const { data } = await api.get(`/api/v1/api-keys/${keyId}`);
      return data.data as ApiKey;
    },
    enabled: !!keyId,
  });
}

// ===========================================
// CREATE API KEY
// ===========================================

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateApiKeyInput) => {
      const { data } = await api.post('/api/v1/api-keys', input);
      return data.data as CreatedApiKey;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      // Don't show toast here - component will handle showing the key
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to create API key');
    },
  });
}

// ===========================================
// UPDATE API KEY NAME
// ===========================================

export function useUpdateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ keyId, name }: { keyId: string; name: string }) => {
      const { data } = await api.patch(`/api/v1/api-keys/${keyId}`, { name });
      return data.data as ApiKey;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys', variables.keyId] });
      toast.success('API key renamed');
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update API key');
    },
  });
}

// ===========================================
// DELETE API KEY
// ===========================================

export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (keyId: string) => {
      await api.delete(`/api/v1/api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key deleted');
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to delete API key');
    },
  });
}
