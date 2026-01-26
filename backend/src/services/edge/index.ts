// ===========================================
// EDGE FUNCTIONS SERVICE
// Serverless functions at the edge
// ===========================================

import { createLogger } from '../../lib/logger.js';
import { getRedisClient } from '../../lib/redis.js';
import crypto from 'crypto';

const logger = createLogger('edge-functions');

// ===========================================
// TYPES
// ===========================================

export type EdgeRuntime = 'v8' | 'deno' | 'node' | 'bun';
export type EdgeRegion = 'global' | 'us' | 'eu' | 'asia' | 'oceania';

export interface EdgeFunction {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  runtime: EdgeRuntime;
  entrypoint: string;
  code: string;
  compiledCode?: string;
  version: number;
  status: 'draft' | 'deployed' | 'disabled' | 'error';
  regions: EdgeRegion[];
  routes: EdgeRoute[];
  envVars: Record<string, string>;
  limits: EdgeLimits;
  metrics: EdgeMetrics;
  createdAt: Date;
  updatedAt: Date;
  deployedAt?: Date;
}

export interface EdgeRoute {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | '*';
  enabled: boolean;
}

export interface EdgeLimits {
  maxExecutionTime: number; // ms
  maxMemory: number; // MB
  maxRequestSize: number; // bytes
  maxResponseSize: number; // bytes
  rateLimit: number; // requests per minute
}

export interface EdgeMetrics {
  invocations: number;
  errors: number;
  avgDuration: number;
  p99Duration: number;
  lastInvoked?: Date;
}

export interface EdgeDeployment {
  functionId: string;
  version: number;
  regions: EdgeRegion[];
  status: 'deploying' | 'deployed' | 'failed';
  deployedAt: Date;
  rollbackTo?: number;
}

export interface EdgeInvocation {
  functionId: string;
  requestId: string;
  region: EdgeRegion;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  memoryUsed: number;
  coldStart: boolean;
  timestamp: Date;
}

// ===========================================
// EDGE LOCATIONS
// ===========================================

export const EDGE_LOCATIONS: Record<EdgeRegion, { name: string; locations: string[] }> = {
  global: {
    name: 'Global (All Regions)',
    locations: ['Deployed to all edge locations worldwide'],
  },
  us: {
    name: 'United States',
    locations: ['New York', 'San Francisco', 'Chicago', 'Dallas', 'Miami', 'Seattle'],
  },
  eu: {
    name: 'Europe',
    locations: ['London', 'Frankfurt', 'Amsterdam', 'Paris', 'Stockholm', 'Milan'],
  },
  asia: {
    name: 'Asia Pacific',
    locations: ['Tokyo', 'Singapore', 'Hong Kong', 'Sydney', 'Mumbai', 'Seoul'],
  },
  oceania: {
    name: 'Oceania',
    locations: ['Sydney', 'Melbourne', 'Auckland'],
  },
};

// ===========================================
// EDGE FUNCTIONS SERVICE
// ===========================================

export class EdgeFunctionsService {
  private redis = getRedisClient();
  private readonly DEFAULT_LIMITS: EdgeLimits = {
    maxExecutionTime: 10000, // 10 seconds
    maxMemory: 128, // 128 MB
    maxRequestSize: 1024 * 1024, // 1 MB
    maxResponseSize: 5 * 1024 * 1024, // 5 MB
    rateLimit: 1000, // 1000 req/min
  };

  /**
   * Create a new edge function
   */
  async createFunction(params: {
    projectId: string;
    name: string;
    code: string;
    runtime?: EdgeRuntime;
    routes?: EdgeRoute[];
    envVars?: Record<string, string>;
    regions?: EdgeRegion[];
  }): Promise<EdgeFunction> {
    const functionId = `ef-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slug = this.generateSlug(params.name);

    const edgeFunction: EdgeFunction = {
      id: functionId,
      projectId: params.projectId,
      name: params.name,
      slug,
      runtime: params.runtime || 'v8',
      entrypoint: 'index.js',
      code: params.code,
      version: 1,
      status: 'draft',
      regions: params.regions || ['global'],
      routes: params.routes || [{ path: '/*', method: '*', enabled: true }],
      envVars: params.envVars || {},
      limits: { ...this.DEFAULT_LIMITS },
      metrics: {
        invocations: 0,
        errors: 0,
        avgDuration: 0,
        p99Duration: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveFunction(edgeFunction);
    logger.info({ functionId, projectId: params.projectId }, 'Edge function created');

    return edgeFunction;
  }

  /**
   * Update function code
   */
  async updateFunction(
    functionId: string,
    updates: Partial<Pick<EdgeFunction, 'name' | 'code' | 'routes' | 'envVars' | 'regions' | 'limits'>>
  ): Promise<EdgeFunction | null> {
    const fn = await this.getFunction(functionId);
    if (!fn) return null;

    const updatedFn: EdgeFunction = {
      ...fn,
      ...updates,
      version: fn.version + 1,
      updatedAt: new Date(),
      status: 'draft', // Needs redeployment
    };

    if (updates.name) {
      updatedFn.slug = this.generateSlug(updates.name);
    }

    await this.saveFunction(updatedFn);
    logger.info({ functionId, version: updatedFn.version }, 'Edge function updated');

    return updatedFn;
  }

  /**
   * Get function by ID
   */
  async getFunction(functionId: string): Promise<EdgeFunction | null> {
    const data = await this.redis.get(`edge:function:${functionId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get all functions for a project
   */
  async getProjectFunctions(projectId: string): Promise<EdgeFunction[]> {
    const functionIds = await this.redis.smembers(`edge:functions:${projectId}`);
    const functions: EdgeFunction[] = [];

    for (const id of functionIds) {
      const fn = await this.getFunction(id);
      if (fn) functions.push(fn);
    }

    return functions;
  }

  /**
   * Deploy function to edge
   */
  async deployFunction(functionId: string, regions?: EdgeRegion[]): Promise<EdgeDeployment> {
    const fn = await this.getFunction(functionId);
    if (!fn) throw new Error('Function not found');

    logger.info({ functionId, regions: regions || fn.regions }, 'Deploying edge function');

    // Compile/bundle the code
    const compiledCode = await this.compileFunction(fn);

    // Create deployment record
    const deployment: EdgeDeployment = {
      functionId,
      version: fn.version,
      regions: regions || fn.regions,
      status: 'deploying',
      deployedAt: new Date(),
    };

    // Update function with compiled code and status
    fn.compiledCode = compiledCode;
    fn.status = 'deployed';
    fn.deployedAt = new Date();
    fn.regions = regions || fn.regions;
    await this.saveFunction(fn);

    // Store deployment
    await this.redis.lpush(`edge:deployments:${functionId}`, JSON.stringify(deployment));
    deployment.status = 'deployed';

    logger.info({ functionId, version: fn.version }, 'Edge function deployed');

    return deployment;
  }

  /**
   * Rollback to previous version
   */
  async rollbackFunction(functionId: string, targetVersion: number): Promise<EdgeFunction | null> {
    const history = await this.getFunctionHistory(functionId);
    const targetFn = history.find(h => h.version === targetVersion);

    if (!targetFn) {
      logger.warn({ functionId, targetVersion }, 'Rollback target version not found');
      return null;
    }

    // Restore the old version as a new version
    const currentFn = await this.getFunction(functionId);
    if (!currentFn) return null;

    const rolledBackFn: EdgeFunction = {
      ...targetFn,
      version: currentFn.version + 1,
      updatedAt: new Date(),
      status: 'deployed',
      deployedAt: new Date(),
    };

    await this.saveFunction(rolledBackFn);
    logger.info({ functionId, from: currentFn.version, to: targetVersion }, 'Edge function rolled back');

    return rolledBackFn;
  }

  /**
   * Delete function
   */
  async deleteFunction(functionId: string): Promise<boolean> {
    const fn = await this.getFunction(functionId);
    if (!fn) return false;

    await this.redis.del(`edge:function:${functionId}`);
    await this.redis.srem(`edge:functions:${fn.projectId}`, functionId);

    logger.info({ functionId, projectId: fn.projectId }, 'Edge function deleted');
    return true;
  }

  /**
   * Invoke function (simulation)
   */
  async invokeFunction(
    functionId: string,
    request: {
      method: string;
      path: string;
      headers: Record<string, string>;
      body?: unknown;
    }
  ): Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    metadata: EdgeInvocation;
  }> {
    const fn = await this.getFunction(functionId);
    if (!fn || fn.status !== 'deployed') {
      throw new Error('Function not deployed');
    }

    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    try {
      // Simulate function execution
      // In production, this would send to actual edge runtime
      const result = await this.executeFunction(fn, request);

      const invocation: EdgeInvocation = {
        functionId,
        requestId,
        region: 'us',
        method: request.method,
        path: request.path,
        statusCode: result.statusCode,
        duration: Date.now() - startTime,
        memoryUsed: Math.random() * fn.limits.maxMemory,
        coldStart: Math.random() > 0.8,
        timestamp: new Date(),
      };

      // Update metrics
      await this.recordInvocation(functionId, invocation);

      return {
        ...result,
        metadata: invocation,
      };
    } catch (error) {
      const invocation: EdgeInvocation = {
        functionId,
        requestId,
        region: 'us',
        method: request.method,
        path: request.path,
        statusCode: 500,
        duration: Date.now() - startTime,
        memoryUsed: 0,
        coldStart: false,
        timestamp: new Date(),
      };

      await this.recordInvocation(functionId, invocation, true);
      throw error;
    }
  }

  /**
   * Get function logs
   */
  async getFunctionLogs(functionId: string, options?: {
    limit?: number;
    startTime?: Date;
    endTime?: Date;
  }): Promise<{ timestamp: Date; level: string; message: string }[]> {
    const limit = options?.limit || 100;
    const logs = await this.redis.lrange(`edge:logs:${functionId}`, 0, limit - 1);

    return logs.map((log: string) => JSON.parse(log));
  }

  /**
   * Get function metrics
   */
  async getFunctionMetrics(functionId: string): Promise<EdgeMetrics> {
    const fn = await this.getFunction(functionId);
    return fn?.metrics || {
      invocations: 0,
      errors: 0,
      avgDuration: 0,
      p99Duration: 0,
    };
  }

  /**
   * Get supported runtimes
   */
  getSupportedRuntimes(): { id: EdgeRuntime; name: string; description: string }[] {
    return [
      {
        id: 'v8',
        name: 'V8 Isolates',
        description: 'Ultra-fast cold starts, Web API compatible. Best for most use cases.',
      },
      {
        id: 'deno',
        name: 'Deno',
        description: 'TypeScript native, secure by default. Great for TypeScript projects.',
      },
      {
        id: 'node',
        name: 'Node.js',
        description: 'Full Node.js compatibility. Best for existing Node.js code.',
      },
      {
        id: 'bun',
        name: 'Bun',
        description: 'Fast JavaScript runtime. Good for performance-critical functions.',
      },
    ];
  }

  /**
   * Generate function template
   */
  generateTemplate(type: 'hello-world' | 'api' | 'redirect' | 'auth'): string {
    const templates: Record<string, string> = {
      'hello-world': `
export default {
  async fetch(request, env, ctx) {
    return new Response('Hello from the edge!', {
      headers: { 'content-type': 'text/plain' },
    });
  },
};
`.trim(),

      api: `
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (request.method === 'GET' && url.pathname === '/api/data') {
      return Response.json({ message: 'Hello', timestamp: Date.now() });
    }
    
    if (request.method === 'POST' && url.pathname === '/api/data') {
      const body = await request.json();
      return Response.json({ received: body });
    }
    
    return new Response('Not Found', { status: 404 });
  },
};
`.trim(),

      redirect: `
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    const redirects = {
      '/old-page': '/new-page',
      '/blog': 'https://blog.example.com',
    };
    
    const redirect = redirects[url.pathname];
    if (redirect) {
      return Response.redirect(redirect, 301);
    }
    
    return fetch(request);
  },
};
`.trim(),

      auth: `
export default {
  async fetch(request, env, ctx) {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const token = authHeader.slice(7);
    
    // Validate token (simplified)
    if (!isValidToken(token)) {
      return new Response('Invalid token', { status: 403 });
    }
    
    // Forward request with user context
    const newHeaders = new Headers(request.headers);
    newHeaders.set('X-User-ID', 'extracted-user-id');
    
    return fetch(new Request(request, { headers: newHeaders }));
  },
};

function isValidToken(token) {
  // Add your token validation logic
  return token.length > 10;
}
`.trim(),
    };

    return templates[type] || templates['hello-world'];
  }

  // ===========================================
  // PRIVATE HELPERS
  // ===========================================

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async saveFunction(fn: EdgeFunction): Promise<void> {
    await this.redis.set(
      `edge:function:${fn.id}`,
      JSON.stringify(fn),
      'EX',
      86400 * 90 // 90 days TTL
    );
    await this.redis.sadd(`edge:functions:${fn.projectId}`, fn.id);

    // Store version in history
    await this.redis.lpush(`edge:history:${fn.id}`, JSON.stringify(fn));
    await this.redis.ltrim(`edge:history:${fn.id}`, 0, 49); // Keep last 50 versions
  }

  private async getFunctionHistory(functionId: string): Promise<EdgeFunction[]> {
    const history = await this.redis.lrange(`edge:history:${functionId}`, 0, -1);
    return history.map((h: string) => JSON.parse(h));
  }

  private async compileFunction(fn: EdgeFunction): Promise<string> {
    // In production, would use esbuild or similar to bundle
    // For now, return the code as-is
    return fn.code;
  }

  private async executeFunction(
    fn: EdgeFunction,
    request: { method: string; path: string; headers: Record<string, string>; body?: unknown }
  ): Promise<{ statusCode: number; headers: Record<string, string>; body: unknown }> {
    // Simulate execution
    // In production, would send to V8 isolate / edge runtime
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: {
        message: 'Function executed successfully',
        function: fn.name,
        path: request.path,
      },
    };
  }

  private async recordInvocation(
    functionId: string,
    invocation: EdgeInvocation,
    isError = false
  ): Promise<void> {
    const fn = await this.getFunction(functionId);
    if (!fn) return;

    // Update metrics
    fn.metrics.invocations++;
    if (isError) fn.metrics.errors++;

    // Update average duration (simple moving average)
    fn.metrics.avgDuration = (fn.metrics.avgDuration * (fn.metrics.invocations - 1) + invocation.duration) / fn.metrics.invocations;
    fn.metrics.p99Duration = Math.max(fn.metrics.p99Duration, invocation.duration);
    fn.metrics.lastInvoked = invocation.timestamp;

    await this.saveFunction(fn);

    // Log invocation
    await this.redis.lpush(`edge:invocations:${functionId}`, JSON.stringify(invocation));
    await this.redis.ltrim(`edge:invocations:${functionId}`, 0, 999); // Keep last 1000
  }
}

// ===========================================
// EXPORTS
// ===========================================

export const edgeFunctionsService = new EdgeFunctionsService();
