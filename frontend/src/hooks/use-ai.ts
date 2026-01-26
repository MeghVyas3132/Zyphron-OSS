'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

const API_URL = 'http://localhost:8000';

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
  const response = await fetch(\`\${API_URL}\${endpoint}\`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: \`Bearer \${token}\` }),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export interface SecurityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  file?: string;
  line?: number;
  recommendation?: string;
}

export interface PerformanceRecommendation {
  category: string;
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  impact?: string;
}

export interface ResourceRecommendation {
  tier: 'starter' | 'pro' | 'enterprise';
  cpu: string;
  memory: string;
  replicas: number;
  estimatedCost: number;
  reasoning: string;
}

export interface FrameworkDetection {
  framework: string;
  version?: string;
  confidence: number;
  language: string;
  buildTool?: string;
  packageManager?: string;
}

export interface AIAnalysisResult {
  projectId?: string;
  repoUrl?: string;
  analyzedAt: string;
  framework: FrameworkDetection;
  projectType: string;
  security: { score: number; issues: SecurityIssue[]; recommendations: string[] };
  performance: { score: number; recommendations: PerformanceRecommendation[] };
  buildOptimizations: { caching: string[]; parallelization: string[]; layerOptimization: string[] };
  resourceRecommendations: ResourceRecommendation;
  dockerfile?: { content: string; stages: string[]; optimizations: string[] };
}

export interface DockerfileGenerationResult {
  dockerfile: string;
  stages: string[];
  optimizations: string[];
  buildArgs?: Record<string, string>;
}

export interface PreviewEnvironment {
  id: string;
  projectId: string;
  pullRequestNumber: number;
  pullRequestTitle: string;
  branch: string;
  commitSha: string;
  url: string;
  status: 'pending' | 'building' | 'ready' | 'failed' | 'expired';
  createdAt: string;
  expiresAt: string;
}

export function useAIAnalysis() {
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);

  const analyzeProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiRequest<{ success: boolean; data: AIAnalysisResult }>(
        '/api/v1/ai/analyze',
        { method: 'POST', body: JSON.stringify({ projectId }) }
      );
      return response.data;
    },
    onSuccess: (data: AIAnalysisResult) => setAnalysisResult(data),
  });

  const analyzeRepoMutation = useMutation({
    mutationFn: async ({ repoUrl, branch }: { repoUrl: string; branch?: string }) => {
      const response = await apiRequest<{ success: boolean; data: AIAnalysisResult }>(
        '/api/v1/ai/analyze-repo',
        { method: 'POST', body: JSON.stringify({ repoUrl, branch }) }
      );
      return response.data;
    },
    onSuccess: (data: AIAnalysisResult) => setAnalysisResult(data),
  });

  const clearAnalysis = useCallback(() => setAnalysisResult(null), []);

  return {
    analysisResult,
    analyzeProject: analyzeProjectMutation.mutate,
    analyzeRepo: analyzeRepoMutation.mutate,
    isAnalyzing: analyzeProjectMutation.isPending || analyzeRepoMutation.isPending,
    error: analyzeProjectMutation.error || analyzeRepoMutation.error,
    clearAnalysis,
  };
}

export function useDockerfileGeneration() {
  const generateMutation = useMutation({
    mutationFn: async ({ projectId, repoUrl, options }: {
      projectId?: string;
      repoUrl?: string;
      options?: { multiStage?: boolean; includeDevDeps?: boolean; targetEnvironment?: 'development' | 'production' };
    }) => {
      const response = await apiRequest<{ success: boolean; data: DockerfileGenerationResult }>(
        '/api/v1/ai/dockerfile',
        { method: 'POST', body: JSON.stringify({ projectId, repoUrl, options }) }
      );
      return response.data;
    },
  });

  return {
    generateDockerfile: generateMutation.mutate,
    dockerfile: generateMutation.data,
    isGenerating: generateMutation.isPending,
    error: generateMutation.error,
  };
}

export function useResourceOptimization() {
  const optimizeMutation = useMutation({
    mutationFn: async ({ projectId, currentUsage }: { projectId: string; currentUsage?: { cpu: number; memory: number } }) => {
      const response = await apiRequest<{ success: boolean; data: ResourceRecommendation }>(
        '/api/v1/ai/resources',
        { method: 'POST', body: JSON.stringify({ projectId, currentUsage }) }
      );
      return response.data;
    },
  });

  return {
    optimize: optimizeMutation.mutate,
    recommendation: optimizeMutation.data,
    isOptimizing: optimizeMutation.isPending,
    error: optimizeMutation.error,
  };
}

export function usePreviewEnvironments(projectId: string) {
  const query = useQuery({
    queryKey: ['previews', projectId],
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; data: PreviewEnvironment[] }>(\`/api/v1/previews/\${projectId}\`);
      return response.data;
    },
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { pullRequestNumber: number; pullRequestTitle: string; branch: string; commitSha: string; headRef: string; baseRef: string }) => {
      const response = await apiRequest<{ success: boolean; data: PreviewEnvironment }>(
        \`/api/v1/previews/\${projectId}\`,
        { method: 'POST', body: JSON.stringify(data) }
      );
      return response.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (prNumber: number) => {
      await apiRequest(\`/api/v1/previews/\${projectId}/\${prNumber}\`, { method: 'DELETE' });
    },
  });

  return {
    previews: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    createPreview: createMutation.mutate,
    deletePreview: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    refetch: query.refetch,
  };
}

export function usePreviewStats(projectId: string) {
  return useQuery({
    queryKey: ['preview-stats', projectId],
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; data: { total: number; byStatus: Record<string, number>; activeDeployments: number } }>(\`/api/v1/previews/\${projectId}/stats\`);
      return response.data;
    },
    enabled: !!projectId,
  });
}
