'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Webhook {
  id: string;
  projectId: string;
  provider: 'GITHUB' | 'GITLAB' | 'BITBUCKET';
  webhookId: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  webhookUrl?: string;
}

interface WebhooksResponse {
  webhooks: Webhook[];
}

async function fetchWebhooks(projectId: string): Promise<WebhooksResponse> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/webhooks`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  return response.json();
}

async function createWebhook(projectId: string, data: { provider: string; events: string[] }) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(data),
  });
  return response.json();
}

async function deleteWebhook(projectId: string, webhookId: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/webhooks/${webhookId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  return response.json();
}

async function regenerateSecret(projectId: string, webhookId: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/webhooks/${webhookId}/regenerate-secret`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  return response.json();
}

// Query keys
export const webhookKeys = {
  all: ['webhooks'] as const,
  lists: () => [...webhookKeys.all, 'list'] as const,
  list: (projectId: string) => [...webhookKeys.lists(), projectId] as const,
};

// Hooks
export function useWebhooks(projectId: string) {
  return useQuery({
    queryKey: webhookKeys.list(projectId),
    queryFn: () => fetchWebhooks(projectId),
    enabled: !!projectId,
  });
}

export function useCreateWebhook(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { provider: string; events: string[] }) => createWebhook(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.list(projectId) });
    },
  });
}

export function useDeleteWebhook(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (webhookId: string) => deleteWebhook(projectId, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.list(projectId) });
    },
  });
}

export function useRegenerateWebhookSecret(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (webhookId: string) => regenerateSecret(projectId, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.list(projectId) });
    },
  });
}
