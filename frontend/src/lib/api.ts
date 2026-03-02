const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

export class ApiError extends Error {
  status: number;
  data?: unknown;
  response?: { status: number; data?: unknown };

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.response = { status, data };
  }
}

interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

async function request<T>(
  endpoint: string,
  config: RequestConfig = {}
): Promise<T> {
  const { params, ...init } = config;
  
  // Build URL with query params
  let url = `${API_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  // Get auth token from localStorage
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;

  // Set default headers
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...init.headers,
  };

  const response = await fetch(url, {
    ...init,
    headers,
  });

  // Parse response
  let data: unknown;
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  // Handle errors
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'message' in data
      ? String((data as { message: unknown }).message)
      : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

type ApiCompatResponse<T> = (T extends Record<string, unknown> ? T : Record<string, never>) & {
  data: T;
};

function withApiPrefix(endpoint: string): string {
  if (endpoint.startsWith('/api/')) {
    return endpoint;
  }
  return endpoint.startsWith('/api')
    ? endpoint
    : `/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

async function requestCompat<T>(endpoint: string, config: RequestConfig): Promise<ApiCompatResponse<T>> {
  const payload = await request<T>(withApiPrefix(endpoint), config);
  if (typeof payload === 'object' && payload !== null) {
    return { ...(payload as Record<string, unknown>), data: payload } as ApiCompatResponse<T>;
  }
  return { data: payload } as ApiCompatResponse<T>;
}

// API Response types
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Auth API
export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    request<ApiResponse<{ user: User; token: string }>>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<ApiResponse<{ user: User; token: string }>>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  me: () => request<ApiResponse<User>>('/api/v1/auth/me'),

  updateProfile: (data: { name?: string; email?: string }) =>
    request<ApiResponse<User>>('/api/v1/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth-token');
    }
  },
};

// Projects API
export const projectsApi = {
  list: (params?: { page?: number; limit?: number }) =>
    request<PaginatedResponse<Project>>('/api/v1/projects', { params }),

  get: (slug: string) =>
    request<ApiResponse<Project>>(`/api/v1/projects/${slug}`),

  create: (data: CreateProjectInput) =>
    request<ApiResponse<Project>>('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (slug: string, data: UpdateProjectInput) =>
    request<ApiResponse<Project>>(`/api/v1/projects/${slug}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (slug: string) =>
    request<ApiResponse<void>>(`/api/v1/projects/${slug}`, {
      method: 'DELETE',
    }),

  // Deployments
  getDeployments: (slug: string, params?: { page?: number; limit?: number }) =>
    request<PaginatedResponse<Deployment>>(`/api/v1/projects/${slug}/deployments`, { params }),

  deploy: (slug: string, data?: { branch?: string }) =>
    request<ApiResponse<Deployment>>(`/api/v1/projects/${slug}/deployments`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  getDeployment: (slug: string, deploymentId: string) =>
    request<ApiResponse<Deployment>>(`/api/v1/projects/${slug}/deployments/${deploymentId}`),

  cancelDeployment: (slug: string, deploymentId: string) =>
    request<ApiResponse<Deployment>>(`/api/v1/projects/${slug}/deployments/${deploymentId}/cancel`, {
      method: 'POST',
    }),

  // Environment Variables
  getEnvVars: (slug: string) =>
    request<ApiResponse<EnvVar[]>>(`/api/v1/projects/${slug}/env`),

  setEnvVars: (slug: string, data: { key: string; value: string; environment?: string }[]) =>
    request<ApiResponse<EnvVar[]>>(`/api/v1/projects/${slug}/env`, {
      method: 'POST',
      body: JSON.stringify({ variables: data }),
    }),

  deleteEnvVar: (slug: string, key: string) =>
    request<ApiResponse<void>>(`/api/v1/projects/${slug}/env/${key}`, {
      method: 'DELETE',
    }),
};

// Databases API
export const databasesApi = {
  list: (params?: { page?: number; limit?: number }) =>
    request<PaginatedResponse<DatabaseInstance>>('/api/v1/databases', { params }),

  get: (databaseId: string) =>
    request<ApiResponse<DatabaseInstance>>(`/api/v1/databases/${databaseId}`),

  create: (data: CreateDatabaseInput) =>
    request<ApiResponse<DatabaseInstance>>('/api/v1/databases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (databaseId: string) =>
    request<ApiResponse<void>>(`/api/v1/databases/${databaseId}`, {
      method: 'DELETE',
    }),

  getConnectionString: (databaseId: string) =>
    request<ApiResponse<{ connectionString: string }>>(`/api/v1/databases/${databaseId}/connection`),
};

// Dashboard API
export const dashboardApi = {
  getMetrics: () =>
    request<ApiResponse<DashboardMetrics>>('/api/v1/dashboard/metrics'),
};

// Type definitions
export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  githubConnected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  framework: string | null;
  repositoryUrl: string;
  branch: string;
  productionUrl: string | null;
  rootDirectory: string | null;
  buildCommand: string | null;
  outputDirectory: string | null;
  installCommand: string | null;
  startCommand: string | null;
  subdomain: string | null;
  customDomain: string | null;
  autoDeploy: boolean;
  createdAt: string;
  updatedAt: string;
  deploymentCount?: number;
  latestDeployment?: {
    id: string;
    status: string;
    createdAt: string;
  } | null;
  _count?: {
    deployments: number;
  };
  // Legacy aliases used by older dashboard pages.
  defaultBranch?: string | null;
  repoUrl?: string | null;
  rootDir?: string | null;
  outputDir?: string | null;
  lastDeployedAt?: string | null;
}

export interface CreateProjectInput {
  name: string;
  slug?: string;
  repositoryUrl: string;
  branch?: string;
  rootDirectory?: string;
  buildCommand?: string;
  installCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  autoDeploy?: boolean;
}

export interface UpdateProjectInput {
  name?: string;
  framework?: string;
  branch?: string;
  defaultBranch?: string;
  repoUrl?: string;
  repositoryUrl?: string;
  buildCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  outputDir?: string;
  installCommand?: string;
  rootDirectory?: string;
  rootDir?: string;
  autoDeploy?: boolean;
}

export interface Deployment {
  id: string;
  projectId: string;
  status: 'PENDING' | 'BUILDING' | 'DEPLOYING' | 'READY' | 'FAILED' | 'CANCELLED';
  branch: string;
  commitSha: string;
  commitMessage: string;
  url: string | null;
  logs: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface EnvVar {
  id: string;
  key: string;
  value: string;
  environment: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseInstance {
  id: string;
  name: string;
  slug?: string;
  type: 'POSTGRESQL' | 'MYSQL' | 'MONGODB' | 'REDIS';
  version: string;
  status: 'CREATING' | 'RUNNING' | 'STOPPED' | 'FAILED' | 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED' | 'ERROR';
  host?: string | null;
  port?: number | null;
  databaseName?: string;
  username?: string | null;
  projectId?: string;
  createdAt: string;
  storage?: {
    used: number;
    total: number;
  };
  storageGb?: number;
  connectionString?: string | null;
}

export interface CreateDatabaseInput {
  name: string;
  type: 'POSTGRESQL' | 'MYSQL' | 'MONGODB' | 'REDIS';
  version?: string;
}

export interface DashboardMetrics {
  period: string;
  since: string;
  overview: {
    totalProjects: number;
    activeDeployments: number;
    totalDatabases: number;
  };
  deployments: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  };
  recentActivity: {
    id: string;
    projectName: string;
    projectSlug: string;
    status: string;
    createdAt: string;
  }[];
}

// Export the base request function for custom endpoints
export { request };

// Backward-compatible axios-like API client used by legacy hooks.
export const api = {
  get: <T = any>(endpoint: string, config?: Omit<RequestConfig, 'method' | 'body'>) =>
    requestCompat<T>(endpoint, { ...(config || {}), method: 'GET' }),
  post: <T = any>(endpoint: string, body?: unknown, config?: Omit<RequestConfig, 'method' | 'body'>) =>
    requestCompat<T>(endpoint, {
      ...(config || {}),
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: <T = any>(endpoint: string, body?: unknown, config?: Omit<RequestConfig, 'method' | 'body'>) =>
    requestCompat<T>(endpoint, {
      ...(config || {}),
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T = any>(endpoint: string, body?: unknown, config?: Omit<RequestConfig, 'method' | 'body'>) =>
    requestCompat<T>(endpoint, {
      ...(config || {}),
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T = any>(endpoint: string, config?: Omit<RequestConfig, 'method' | 'body'>) =>
    requestCompat<T>(endpoint, { ...(config || {}), method: 'DELETE' }),
};
