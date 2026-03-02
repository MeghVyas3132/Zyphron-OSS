// ===========================================
// ZYPHRON TYPE DEFINITIONS
// ===========================================

// ===========================================
// API TYPES
// ===========================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ===========================================
// AUTH TYPES
// ===========================================

export interface JwtPayload {
  sub: string;
  email: string;
  role?: 'ADMIN' | 'USER';
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  role: 'ADMIN' | 'USER';
  isActive: boolean;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: AuthUser;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

// ===========================================
// PROJECT TYPES
// ===========================================

export interface CreateProjectInput {
  name: string;
  repositoryUrl: string;
  branch?: string;
  rootDirectory?: string;
  buildCommand?: string;
  installCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  autoDeploy?: boolean;
  teamId?: string;
}

export interface UpdateProjectInput {
  name?: string;
  branch?: string;
  rootDirectory?: string;
  buildCommand?: string;
  installCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  autoDeploy?: boolean;
  customDomain?: string;
}

export interface ProjectDetectionResult {
  framework: string | null;
  language: string | null;
  projectType: 'STATIC' | 'BACKEND' | 'FULLSTACK' | 'UNKNOWN';
  buildCommand: string | null;
  installCommand: string | null;
  startCommand: string | null;
  outputDirectory: string | null;
  dockerfile: string | null;
  port: number | null;
}

// ===========================================
// DEPLOYMENT TYPES
// ===========================================

export interface TriggerDeploymentInput {
  branch?: string;
  commitSha?: string;
}

export interface DeploymentConfig {
  projectId: string;
  projectSlug: string;
  subdomain: string;
  repositoryUrl: string;
  branch: string;
  commitSha?: string;
  rootDirectory?: string;
  buildCommand?: string;
  installCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  envVariables: Record<string, string>;
  cpuLimit: string;
  memoryLimit: string;
}

export interface BuildResult {
  success: boolean;
  imageTag?: string;
  logs: string[];
  duration: number;
  error?: string;
}

export interface DeployResult {
  success: boolean;
  url?: string;
  duration: number;
  error?: string;
}

// ===========================================
// ENVIRONMENT VARIABLE TYPES
// ===========================================

export interface CreateEnvVariableInput {
  key: string;
  value: string;
  environment?: 'DEVELOPMENT' | 'PREVIEW' | 'STAGING' | 'PRODUCTION';
  isSecret?: boolean;
}

export interface UpdateEnvVariableInput {
  value?: string;
  environment?: 'DEVELOPMENT' | 'PREVIEW' | 'STAGING' | 'PRODUCTION';
  isSecret?: boolean;
}

// ===========================================
// DATABASE TYPES
// ===========================================

export interface CreateDatabaseInput {
  name: string;
  type: 'POSTGRESQL' | 'MYSQL' | 'MONGODB' | 'REDIS';
  version?: string;
}

export interface DatabaseCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  connectionString: string;
}

// ===========================================
// TEAM TYPES
// ===========================================

export interface CreateTeamInput {
  name: string;
  description?: string;
}

export interface InviteTeamMemberInput {
  email: string;
  role: 'ADMIN' | 'DEVELOPER' | 'VIEWER';
}

// ===========================================
// WEBHOOK TYPES
// ===========================================

export interface GitHubWebhookPayload {
  action?: string;
  ref?: string;
  before?: string;
  after?: string;
  repository: {
    id: number;
    name: string;
    full_name: string;
    clone_url: string;
  };
  sender: {
    id: number;
    login: string;
  };
  head_commit?: {
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
  };
  pull_request?: {
    id: number;
    number: number;
    state: string;
    title: string;
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
    };
  };
}

// ===========================================
// QUEUE TYPES
// ===========================================

export interface BuildJobData {
  deploymentId: string;
  config: DeploymentConfig;
}

export interface BuildJobResult {
  success: boolean;
  imageTag?: string;
  logs: string;
  duration: number;
  error?: string;
}

// ===========================================
// DOCKER TYPES
// ===========================================

export interface DockerBuildOptions {
  context: string;
  dockerfile?: string;
  tags: string[];
  buildArgs?: Record<string, string>;
  target?: string;
  noCache?: boolean;
}

export interface ContainerConfig {
  image: string;
  name: string;
  env: Record<string, string>;
  ports: { container: number; host?: number }[];
  volumes?: { source: string; target: string }[];
  cpuLimit?: string;
  memoryLimit?: string;
  restart?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  network?: string;
  labels?: Record<string, string>;
}

// ===========================================
// METRICS TYPES
// ===========================================

export interface DeploymentMetrics {
  cpuUsage: number;
  memoryUsage: number;
  networkIn: number;
  networkOut: number;
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
}

// ===========================================
// EVENT TYPES
// ===========================================

export type EventType = 
  | 'deployment.created'
  | 'deployment.building'
  | 'deployment.deploying'
  | 'deployment.completed'
  | 'deployment.failed'
  | 'deployment.cancelled'
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'database.provisioned'
  | 'database.deleted';

export interface ZyphronEvent<T = unknown> {
  id: string;
  type: EventType;
  timestamp: string;
  data: T;
  metadata?: Record<string, unknown>;
}

// ===========================================
// CONFIG TYPES
// ===========================================

export interface AppConfig {
  env: 'development' | 'staging' | 'production';
  port: number;
  host: string;
  
  database: {
    url: string;
  };
  
  redis: {
    url: string;
  };
  
  kafka: {
    brokers: string[];
    clientId: string;
  };
  
  jwt: {
    secret: string;
    expiresIn: string;
  };
  
  github: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
  
  docker: {
    socketPath?: string;
    host?: string;
    registry: string;
  };
  
  deployment: {
    projectsDir: string;
    baseDomain: string;
    maxConcurrentBuilds: number;
    buildTimeout: number;
  };
  
  storage: {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
  };
}
