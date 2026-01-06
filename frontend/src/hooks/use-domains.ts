'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Domain {
  id: string;
  domain: string;
  verified: boolean;
  verificationToken: string;
  verificationMethod: 'dns_txt' | 'cname';
  sslStatus: 'pending' | 'provisioning' | 'active' | 'failed';
  createdAt: string;
  verifiedAt: string | null;
}

interface DomainsResponse {
  success: boolean;
  data: {
    domains: Domain[];
    primaryDomain: string | null;
    subdomain: string;
  };
}

async function fetchDomains(projectId: string): Promise<DomainsResponse> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/domains`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  return response.json();
}

async function addDomain(projectId: string, domain: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/domains`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ domain }),
  });
  return response.json();
}

async function deleteDomain(projectId: string, domainId: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/domains/${domainId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  return response.json();
}

async function verifyDomain(projectId: string, domainId: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  const response = await fetch(`${API_URL}/api/v1/projects/${projectId}/domains/${domainId}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  return response.json();
}

// Query keys
export const domainKeys = {
  all: ['domains'] as const,
  lists: () => [...domainKeys.all, 'list'] as const,
  list: (projectId: string) => [...domainKeys.lists(), projectId] as const,
};

// Hooks
export function useDomains(projectId: string) {
  return useQuery({
    queryKey: domainKeys.list(projectId),
    queryFn: () => fetchDomains(projectId),
    enabled: !!projectId,
  });
}

export function useAddDomain(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domain: string) => addDomain(projectId, domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: domainKeys.list(projectId) });
    },
  });
}

export function useDeleteDomain(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domainId: string) => deleteDomain(projectId, domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: domainKeys.list(projectId) });
    },
  });
}

export function useVerifyDomain(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domainId: string) => verifyDomain(projectId, domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: domainKeys.list(projectId) });
    },
  });
}
