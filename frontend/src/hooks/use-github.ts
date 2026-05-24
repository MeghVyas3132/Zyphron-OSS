'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '@/lib/api';

// Types
export interface GitHubAccount {
  connected: boolean;
  username: string | null;
  avatarUrl: string | null;
  name: string | null;
  profileUrl: string | null;
}

export interface GitHubRepo {
  id: string;
  name: string;
  fullName: string;
  private: boolean;
  url: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  updatedAt: string;
  pushedAt: string;
  language: string | null;
  description: string | null;
  stars: number;
  forks: number;
}

export interface GitHubBranch {
  name: string;
  sha: string;
  protected: boolean;
}

export interface RepoAnalysis {
  repository: {
    id: string;
    name: string;
    fullName: string;
    private: boolean;
    url: string;
    cloneUrl: string;
    defaultBranch: string;
    language: string | null;
    description: string | null;
  };
  detection: {
    framework: string;
    language: string;
    buildCommand: string | null;
    installCommand: string | null;
    startCommand: string | null;
    outputDirectory: string | null;
    port: number;
  };
  suggestedConfig: {
    name: string;
    slug: string;
    branch: string;
    rootDirectory: string;
    framework: string;
    buildCommand: string | null;
    installCommand: string | null;
    startCommand: string | null;
    outputDirectory: string | null;
  };
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface PaginatedReposResponse {
  success: boolean;
  data: GitHubRepo[];
  pagination: {
    page: number;
    perPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// Query keys
export const githubKeys = {
  account: ['github', 'account'] as const,
  repos: (page: number) => ['github', 'repos', page] as const,
  reposSearch: (query: string) => ['github', 'repos', 'search', query] as const,
  branches: (owner: string, repo: string) => ['github', 'branches', owner, repo] as const,
  analyze: (owner: string, repo: string, branch?: string) => ['github', 'analyze', owner, repo, branch] as const,
};

// API functions
const githubApi = {
  getAccount: () =>
    request<ApiResponse<GitHubAccount>>('/api/v1/github/account'),

  getRepos: (page = 1, perPage = 30) =>
    request<PaginatedReposResponse>('/api/v1/github/repos', {
      params: { page, per_page: perPage },
    }),

  searchRepos: (query: string, page = 1) =>
    request<PaginatedReposResponse>('/api/v1/github/repos/search', {
      params: { q: query, page },
    }),

  getBranches: (owner: string, repo: string) =>
    request<ApiResponse<GitHubBranch[]>>(`/api/v1/github/repos/${owner}/${repo}/branches`),

  analyzeRepo: (owner: string, repo: string, branch?: string) =>
    request<ApiResponse<RepoAnalysis>>(`/api/v1/github/repos/${owner}/${repo}/analyze`, {
      params: branch ? { branch } : undefined,
    }),

  initiateOAuth: () =>
    request<ApiResponse<{ redirectUrl: string; state: string }>>('/api/v1/auth/github'),
};

// Hooks
export function useGitHubAccount() {
  return useQuery({
    queryKey: githubKeys.account,
    queryFn: () => githubApi.getAccount(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useGitHubRepos(page = 1, enabled = true) {
  return useQuery({
    queryKey: githubKeys.repos(page),
    queryFn: () => githubApi.getRepos(page),
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}

export function useSearchGitHubRepos(query: string, enabled = true) {
  return useQuery({
    queryKey: githubKeys.reposSearch(query),
    queryFn: () => githubApi.searchRepos(query),
    enabled: query.length > 0 && enabled,
    staleTime: 2 * 60 * 1000,
  });
}

export function useGitHubBranches(owner: string, repo: string, enabled = true) {
  return useQuery({
    queryKey: githubKeys.branches(owner, repo),
    queryFn: () => githubApi.getBranches(owner, repo),
    enabled: !!owner && !!repo && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAnalyzeRepo(owner: string, repo: string, branch?: string, enabled = true) {
  return useQuery({
    queryKey: githubKeys.analyze(owner, repo, branch),
    queryFn: () => githubApi.analyzeRepo(owner, repo, branch),
    enabled: !!owner && !!repo && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInitiateGitHubOAuth() {
  return useMutation({
    mutationFn: () => githubApi.initiateOAuth(),
    onSuccess: (data) => {
      // Store state for verification
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('github_oauth_state', data.data.state);
        // Redirect to GitHub
        window.location.href = data.data.redirectUrl;
      }
    },
  });
}

export function useGitHubOAuthCallback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ code, state }: { code: string; state: string }) => {
      // Verify state
      const storedState = sessionStorage.getItem('github_oauth_state');
      if (storedState !== state) {
        throw new Error('Invalid OAuth state');
      }

      return request<ApiResponse<{ token: string; user: unknown }>>('/api/v1/auth/github/callback', {
        method: 'POST',
        body: JSON.stringify({ code, state }),
      });
    },
    onSuccess: (response) => {
      // Clear OAuth state
      sessionStorage.removeItem('github_oauth_state');
      
      // Store token
      if (typeof window !== 'undefined' && response.data.token) {
        localStorage.setItem('auth-token', response.data.token);
      }
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: githubKeys.account });
    },
  });
}
