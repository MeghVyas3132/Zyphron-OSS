// ===========================================
// ZYPHRON CLI - API CLIENT
// HTTP client for Zyphron API communication
// ===========================================

import axios, { AxiosInstance, AxiosError } from 'axios';
import { getEnvApiUrl, getEnvToken } from './config.js';

// ===========================================
// TYPES
// ===========================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  githubConnected: boolean;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  repositoryUrl: string;
  branch: string;
  framework: string | null;
  subdomain: string | null;
  customDomain: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  status: 'QUEUED' | 'PENDING' | 'BUILDING' | 'DEPLOYING' | 'LIVE' | 'FAILED' | 'CANCELLED';
  branch: string;
  commitSha: string | null;
  commitMessage: string | null;
  url: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface EnvVar {
  id: string;
  key: string;
  value: string;
  environment: string;
}

export interface Database {
  id: string;
  name: string;
  slug: string;
  type: 'POSTGRESQL' | 'MYSQL' | 'MONGODB' | 'REDIS';
  status: 'CREATING' | 'RUNNING' | 'STOPPED' | 'FAILED';
  host: string;
  port: number;
}

// ===========================================
// API CLIENT
// ===========================================

class ApiClient {
  private client: AxiosInstance;
  
  constructor() {
    this.client = axios.create({
      baseURL: getEnvApiUrl(),
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      const token = getEnvToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }
  
  // Recreate client with new base URL
  setBaseUrl(url: string): void {
    this.client.defaults.baseURL = url;
  }
  
  // ===========================================
  // AUTH
  // ===========================================
  
  async login(email: string, password: string): Promise<ApiResponse<{ user: User; token: string }>> {
    const response = await this.client.post('/api/v1/auth/login', { email, password });
    return response.data;
  }
  
  async register(name: string, email: string, password: string): Promise<ApiResponse<{ user: User; token: string }>> {
    const response = await this.client.post('/api/v1/auth/register', { name, email, password });
    return response.data;
  }
  
  async me(): Promise<ApiResponse<User>> {
    const response = await this.client.get('/api/v1/auth/me');
    return response.data;
  }
  
  // ===========================================
  // PROJECTS
  // ===========================================
  
  async listProjects(): Promise<ApiResponse<{ projects: Project[] }>> {
    const response = await this.client.get('/api/v1/projects');
    return response.data;
  }
  
  async getProject(slug: string): Promise<ApiResponse<Project>> {
    const response = await this.client.get(`/api/v1/projects/${slug}`);
    return response.data;
  }
  
  async createProject(data: {
    name: string;
    repositoryUrl?: string;
    branch?: string;
    rootDirectory?: string;
    slug?: string;
  }): Promise<ApiResponse<Project>> {
    const response = await this.client.post('/api/v1/projects', data);
    return response.data;
  }
  
  async deleteProject(slug: string): Promise<ApiResponse<void>> {
    const response = await this.client.delete(`/api/v1/projects/${slug}`);
    return response.data;
  }
  
  // ===========================================
  // DEPLOYMENTS
  // ===========================================
  
  async listDeployments(projectSlug: string): Promise<ApiResponse<{ deployments: Deployment[] }>> {
    const response = await this.client.get(`/api/v1/projects/${projectSlug}/deployments`);
    return response.data;
  }
  
  async getDeployment(projectSlug: string, deploymentId: string): Promise<ApiResponse<Deployment>> {
    const response = await this.client.get(`/api/v1/projects/${projectSlug}/deployments/${deploymentId}`);
    return response.data;
  }
  
  async deploy(projectSlug: string, branch?: string): Promise<ApiResponse<Deployment>> {
    const response = await this.client.post(`/api/v1/projects/${projectSlug}/deployments`, { branch });
    return response.data;
  }
  
  async cancelDeployment(projectSlug: string, deploymentId: string): Promise<ApiResponse<Deployment>> {
    const response = await this.client.post(`/api/v1/projects/${projectSlug}/deployments/${deploymentId}/cancel`);
    return response.data;
  }
  
  // ===========================================
  // ENVIRONMENT VARIABLES
  // ===========================================
  
  async listEnvVars(projectSlug: string): Promise<ApiResponse<EnvVar[]>> {
    const response = await this.client.get(`/api/v1/projects/${projectSlug}/env`);
    return response.data;
  }
  
  async setEnvVars(projectSlug: string, variables: { key: string; value: string }[]): Promise<ApiResponse<EnvVar[]>> {
    const response = await this.client.post(`/api/v1/projects/${projectSlug}/env`, { variables });
    return response.data;
  }
  
  async deleteEnvVar(projectSlug: string, key: string): Promise<ApiResponse<void>> {
    const response = await this.client.delete(`/api/v1/projects/${projectSlug}/env/${key}`);
    return response.data;
  }
  
  // ===========================================
  // DATABASES
  // ===========================================
  
  async listDatabases(): Promise<ApiResponse<Database[]>> {
    const response = await this.client.get('/api/v1/databases');
    return response.data;
  }
  
  async createDatabase(data: { name: string; type: string }): Promise<ApiResponse<Database>> {
    const response = await this.client.post('/api/v1/databases', data);
    return response.data;
  }
  
  async getConnectionString(slug: string): Promise<ApiResponse<{ connectionString: string }>> {
    const response = await this.client.get(`/api/v1/databases/${slug}/connection`);
    return response.data;
  }
  
  // ===========================================
  // DOMAINS
  // ===========================================
  
  async listDomains(projectSlug: string): Promise<ApiResponse<{ domains: { id: string; domain: string; verified: boolean }[] }>> {
    const response = await this.client.get(`/api/v1/projects/${projectSlug}/domains`);
    return response.data;
  }
  
  async addDomain(projectSlug: string, domain: string): Promise<ApiResponse<{ id: string; domain: string }>> {
    const response = await this.client.post(`/api/v1/projects/${projectSlug}/domains`, { domain });
    return response.data;
  }
  
  // ===========================================
  // LOGS (HTTP fallback - WebSocket preferred)
  // ===========================================
  
  async getLogs(projectSlug: string, deploymentId: string): Promise<ApiResponse<{ logs: string }>> {
    const response = await this.client.get(`/api/v1/projects/${projectSlug}/deployments/${deploymentId}/logs`);
    return response.data;
  }
}

// ===========================================
// ERROR HANDLING
// ===========================================

export function isApiError(error: unknown): error is AxiosError<ApiResponse<unknown>> {
  return axios.isAxiosError(error);
}

export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    const apiError = error.response?.data?.error;
    if (apiError?.message) {
      return apiError.message;
    }
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unknown error occurred';
}

// ===========================================
// SINGLETON EXPORT
// ===========================================

export const api = new ApiClient();

// ===========================================
// FACTORY — create a one-off axios client
// Used by deploy/status/logs/rollback/stress commands
// so each command can pass its own base URL + token.
// ===========================================

export interface SimpleApiClient {
  get<T>(path: string): Promise<{ data: T }>;
  post<T>(path: string, body?: unknown): Promise<{ data: T }>;
}

export function createApiClient(baseUrl: string, token: string): SimpleApiClient {
  const client = axios.create({
    baseURL: `${baseUrl}/api/v1`,
    timeout: 10 * 60 * 1000, // 10 min — stress tests take a while
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  return {
    get: <T>(path: string) => client.get<T>(path) as Promise<{ data: T }>,
    post: <T>(path: string, body?: unknown) => client.post<T>(path, body) as Promise<{ data: T }>,
  };
}
