// ===========================================
// CHAOS ENGINEERING HOOKS
// React hooks for chaos experiments
// ===========================================

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ===========================================
// TYPES
// ===========================================

export type ExperimentType =
  | 'pod-failure'
  | 'network-latency'
  | 'network-partition'
  | 'cpu-stress'
  | 'memory-stress'
  | 'disk-stress'
  | 'dns-failure'
  | 'http-error'
  | 'time-skew';

export type ExperimentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted';

export interface ChaosExperiment {
  id: string;
  projectId: string;
  name: string;
  description: string;
  type: ExperimentType;
  status: ExperimentStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  results?: {
    success: boolean;
    affectedTargets: number;
    recommendations: string[];
  };
}

export interface ResilienceScore {
  score: number;
  breakdown: {
    category: string;
    score: number;
    tested: boolean;
    lastTested?: string;
  }[];
  recommendations: string[];
}

export interface GamedayScenario {
  name: string;
  description: string;
  experiments: { type: ExperimentType; delay: number }[];
  estimatedDuration: number;
}

// ===========================================
// API HELPER
// ===========================================

async function chaosApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  const response = await fetch(`${API_URL}/api/v1/chaos${endpoint}`, {
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

export function useExperimentTypes() {
  return useQuery({
    queryKey: ['chaos', 'types'],
    queryFn: async () => {
      const data = await chaosApi<{
        types: { type: ExperimentType; name: string; description: string }[];
      }>('/experiments/types');
      return data.types;
    },
  });
}

export function useGamedayScenarios() {
  return useQuery({
    queryKey: ['chaos', 'gamedays'],
    queryFn: async () => {
      const data = await chaosApi<{ scenarios: GamedayScenario[] }>('/experiments/gamedays');
      return data.scenarios;
    },
  });
}

export function useProjectExperiments(projectId: string) {
  return useQuery({
    queryKey: ['chaos', 'experiments', projectId],
    queryFn: async () => {
      const data = await chaosApi<{ experiments: ChaosExperiment[] }>(
        `/projects/${projectId}/experiments`
      );
      return data.experiments;
    },
    enabled: !!projectId,
  });
}

export function useExperiment(experimentId: string) {
  return useQuery({
    queryKey: ['chaos', 'experiment', experimentId],
    queryFn: async () => {
      return chaosApi<ChaosExperiment>(`/experiments/${experimentId}`);
    },
    enabled: !!experimentId,
    refetchInterval: (data) =>
      data?.status === 'running' ? 2000 : false, // Poll while running
  });
}

export function useResilienceScore(projectId: string) {
  return useQuery({
    queryKey: ['chaos', 'resilience', projectId],
    queryFn: async () => {
      return chaosApi<ResilienceScore>(`/projects/${projectId}/resilience`);
    },
    enabled: !!projectId,
  });
}

export function useCreateExperiment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      name: string;
      description?: string;
      type: ExperimentType;
      config?: {
        duration?: number;
        intensity?: 'low' | 'medium' | 'high';
        parameters?: Record<string, unknown>;
      };
      target: {
        type: 'deployment' | 'service' | 'pod' | 'namespace';
        selector: Record<string, string>;
        percentage?: number;
      };
      createdBy: string;
    }) => {
      return chaosApi<ChaosExperiment>(`/projects/${params.projectId}/experiments`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
    onSuccess: (data: ChaosExperiment) => {
      queryClient.invalidateQueries({ queryKey: ['chaos', 'experiments', data.projectId] });
    },
  });
}

export function useRunExperiment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ experimentId }: { experimentId: string; projectId: string }) => {
      return chaosApi<ChaosExperiment>(`/experiments/${experimentId}/run`, {
        method: 'POST',
      });
    },
    onSuccess: (data: ChaosExperiment, variables: { experimentId: string; projectId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['chaos', 'experiment', variables.experimentId] });
      queryClient.invalidateQueries({ queryKey: ['chaos', 'experiments', variables.projectId] });
    },
  });
}

export function useAbortExperiment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ experimentId }: { experimentId: string; projectId: string }) => {
      return chaosApi<ChaosExperiment>(`/experiments/${experimentId}/abort`, {
        method: 'POST',
      });
    },
    onSuccess: (data: ChaosExperiment, variables: { experimentId: string; projectId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['chaos', 'experiment', variables.experimentId] });
      queryClient.invalidateQueries({ queryKey: ['chaos', 'experiments', variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['chaos', 'resilience', variables.projectId] });
    },
  });
}

export function useDeleteExperiment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ experimentId }: { experimentId: string; projectId: string }) => {
      return chaosApi<{ success: boolean }>(`/experiments/${experimentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_data: { success: boolean }, variables: { experimentId: string; projectId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['chaos', 'experiments', variables.projectId] });
    },
  });
}

export function useExperimentHistory(projectId: string, limit = 20) {
  return useQuery({
    queryKey: ['chaos', 'history', projectId, limit],
    queryFn: async () => {
      const data = await chaosApi<{
        history: { experiment: ChaosExperiment; success: boolean; duration: number }[];
      }>(`/projects/${projectId}/experiments/history?limit=${limit}`);
      return data.history;
    },
    enabled: !!projectId,
  });
}
