/**
 * Self-Deployment Service
 * 
 * Enables Zyphron to deploy and manage itself - the "Zyphron on Zyphron" capability.
 * This allows the platform to be self-hosted and self-updated.
 */

import { redis, logger, prisma } from '../../lib/index.js';

// Use redis client directly for full functionality
const redisClient = redis.client;

interface SelfDeployConfig {
  version: string;
  environment: 'production' | 'staging' | 'development';
  components: {
    api: boolean;
    worker: boolean;
    frontend: boolean;
  };
  strategy: 'rolling' | 'blue-green' | 'canary';
  healthCheckUrl: string;
  rollbackOnFailure: boolean;
}

interface DeploymentStatus {
  id: string;
  status: 'pending' | 'deploying' | 'running' | 'failed' | 'rolled-back';
  version: string;
  previousVersion?: string;
  startedAt: Date;
  completedAt?: Date;
  components: {
    api: ComponentStatus;
    worker: ComponentStatus;
    frontend: ComponentStatus;
  };
  healthChecks: HealthCheckResult[];
  logs: string[];
}

interface ComponentStatus {
  status: 'pending' | 'deploying' | 'running' | 'failed';
  replicas: { ready: number; desired: number };
  version: string;
  lastUpdated: Date;
}

interface HealthCheckResult {
  component: string;
  healthy: boolean;
  responseTime: number;
  timestamp: Date;
  error?: string;
}

interface ZyphronManifest {
  version: string;
  components: {
    api: {
      image: string;
      replicas: number;
      resources: { cpu: string; memory: string };
      env: Record<string, string>;
    };
    worker: {
      image: string;
      replicas: number;
      resources: { cpu: string; memory: string };
      env: Record<string, string>;
    };
    frontend: {
      image: string;
      replicas: number;
      resources: { cpu: string; memory: string };
      env: Record<string, string>;
    };
  };
  dependencies: {
    postgres: { version: string; required: boolean };
    redis: { version: string; required: boolean };
    kafka: { version: string; required: boolean };
  };
}

export class SelfDeploymentService {
  private readonly cacheKeyPrefix = 'zyphron:self-deploy';

  /**
   * Get the current Zyphron version
   */
  async getCurrentVersion(): Promise<string> {
    const cached = await redisClient.get(`${this.cacheKeyPrefix}:version`);
    if (cached) return cached;

    // Read from environment or package.json
    const version = process.env.ZYPHRON_VERSION || '1.0.0';
    await redisClient.set(`${this.cacheKeyPrefix}:version`, version, 'EX', 3600);
    return version;
  }

  /**
   * Generate deployment manifest for Zyphron
   */
  async generateManifest(targetVersion: string): Promise<ZyphronManifest> {
    const registry = process.env.CONTAINER_REGISTRY || 'ghcr.io/zyphron';
    
    return {
      version: targetVersion,
      components: {
        api: {
          image: `${registry}/zyphron-api:${targetVersion}`,
          replicas: parseInt(process.env.API_REPLICAS || '3'),
          resources: {
            cpu: process.env.API_CPU || '500m',
            memory: process.env.API_MEMORY || '512Mi',
          },
          env: {
            NODE_ENV: 'production',
            DATABASE_URL: '${DATABASE_URL}',
            REDIS_URL: '${REDIS_URL}',
            KAFKA_BROKERS: '${KAFKA_BROKERS}',
          },
        },
        worker: {
          image: `${registry}/zyphron-worker:${targetVersion}`,
          replicas: parseInt(process.env.WORKER_REPLICAS || '2'),
          resources: {
            cpu: process.env.WORKER_CPU || '1000m',
            memory: process.env.WORKER_MEMORY || '1Gi',
          },
          env: {
            NODE_ENV: 'production',
            DATABASE_URL: '${DATABASE_URL}',
            REDIS_URL: '${REDIS_URL}',
            KAFKA_BROKERS: '${KAFKA_BROKERS}',
          },
        },
        frontend: {
          image: `${registry}/zyphron-frontend:${targetVersion}`,
          replicas: parseInt(process.env.FRONTEND_REPLICAS || '2'),
          resources: {
            cpu: process.env.FRONTEND_CPU || '200m',
            memory: process.env.FRONTEND_MEMORY || '256Mi',
          },
          env: {
            NEXT_PUBLIC_API_URL: '${API_URL}',
          },
        },
      },
      dependencies: {
        postgres: { version: '15', required: true },
        redis: { version: '7', required: true },
        kafka: { version: '3.5', required: false },
      },
    };
  }

  /**
   * Start self-deployment process
   */
  async deploy(config: SelfDeployConfig): Promise<DeploymentStatus> {
    const deploymentId = `self-deploy-${Date.now()}`;
    const currentVersion = await this.getCurrentVersion();

    logger.info('Starting Zyphron self-deployment', {
      deploymentId,
      targetVersion: config.version,
      currentVersion,
      strategy: config.strategy,
    });

    const status: DeploymentStatus = {
      id: deploymentId,
      status: 'pending',
      version: config.version,
      previousVersion: currentVersion,
      startedAt: new Date(),
      components: {
        api: {
          status: 'pending',
          replicas: { ready: 0, desired: 3 },
          version: currentVersion,
          lastUpdated: new Date(),
        },
        worker: {
          status: 'pending',
          replicas: { ready: 0, desired: 2 },
          version: currentVersion,
          lastUpdated: new Date(),
        },
        frontend: {
          status: 'pending',
          replicas: { ready: 0, desired: 2 },
          version: currentVersion,
          lastUpdated: new Date(),
        },
      },
      healthChecks: [],
      logs: [`[${new Date().toISOString()}] Deployment initiated`],
    };

    await this.saveDeploymentStatus(status);

    // Start async deployment process
    this.executeDeployment(config, status).catch((error: Error) => {
      logger.error('Self-deployment failed', { error: error.message, deploymentId });
    });

    return status;
  }

  /**
   * Execute the deployment based on strategy
   */
  private async executeDeployment(
    config: SelfDeployConfig,
    status: DeploymentStatus
  ): Promise<void> {
    try {
      status.status = 'deploying';
      await this.saveDeploymentStatus(status);

      const manifest = await this.generateManifest(config.version);

      switch (config.strategy) {
        case 'rolling':
          await this.executeRollingDeploy(config, status, manifest);
          break;
        case 'blue-green':
          await this.executeBlueGreenDeploy(config, status, manifest);
          break;
        case 'canary':
          await this.executeCanaryDeploy(config, status, manifest);
          break;
      }

      // Final health check
      const healthy = await this.performHealthCheck(config.healthCheckUrl, status);
      
      if (!healthy && config.rollbackOnFailure) {
        await this.rollback(status.id);
        return;
      }

      status.status = 'running';
      status.completedAt = new Date();
      status.logs.push(`[${new Date().toISOString()}] Deployment completed successfully`);
      
      // Update current version
      await redisClient.set(`${this.cacheKeyPrefix}:version`, config.version);
      await this.saveDeploymentStatus(status);

      logger.info('Self-deployment completed', {
        deploymentId: status.id,
        version: config.version,
        duration: status.completedAt.getTime() - status.startedAt.getTime(),
      });
    } catch (error) {
      status.status = 'failed';
      status.logs.push(`[${new Date().toISOString()}] Deployment failed: ${(error as Error).message}`);
      await this.saveDeploymentStatus(status);

      if (config.rollbackOnFailure) {
        await this.rollback(status.id);
      }

      throw error;
    }
  }

  /**
   * Rolling deployment - update one component at a time
   */
  private async executeRollingDeploy(
    config: SelfDeployConfig,
    status: DeploymentStatus,
    manifest: ZyphronManifest
  ): Promise<void> {
    const components = ['worker', 'api', 'frontend'] as const;

    for (const component of components) {
      if (!config.components[component]) continue;

      status.logs.push(`[${new Date().toISOString()}] Starting ${component} rolling update`);
      status.components[component].status = 'deploying';
      await this.saveDeploymentStatus(status);

      // Simulate rolling update (in production, this would call Kubernetes API)
      await this.simulateComponentDeploy(component, manifest.components[component], status);

      // Wait for component to be healthy
      await this.waitForComponentHealth(component, config.healthCheckUrl, status);

      status.components[component].status = 'running';
      status.components[component].version = config.version;
      status.components[component].replicas.ready = status.components[component].replicas.desired;
      status.logs.push(`[${new Date().toISOString()}] ${component} update completed`);
      await this.saveDeploymentStatus(status);
    }
  }

  /**
   * Blue-green deployment - deploy new version alongside old, then switch
   */
  private async executeBlueGreenDeploy(
    config: SelfDeployConfig,
    status: DeploymentStatus,
    manifest: ZyphronManifest
  ): Promise<void> {
    status.logs.push(`[${new Date().toISOString()}] Creating green environment`);

    // Deploy all components to green environment
    for (const component of ['api', 'worker', 'frontend'] as const) {
      if (!config.components[component]) continue;

      status.components[component].status = 'deploying';
      await this.simulateComponentDeploy(
        `${component}-green`,
        manifest.components[component],
        status
      );
    }

    // Health check green environment
    status.logs.push(`[${new Date().toISOString()}] Testing green environment`);
    const greenHealthy = await this.performHealthCheck(
      config.healthCheckUrl.replace('blue', 'green'),
      status
    );

    if (!greenHealthy) {
      throw new Error('Green environment health check failed');
    }

    // Switch traffic to green
    status.logs.push(`[${new Date().toISOString()}] Switching traffic to green`);
    await this.switchTrafficToGreen(status);

    // Update component statuses
    for (const component of ['api', 'worker', 'frontend'] as const) {
      if (!config.components[component]) continue;
      status.components[component].status = 'running';
      status.components[component].version = config.version;
    }

    // Cleanup blue environment
    status.logs.push(`[${new Date().toISOString()}] Cleaning up blue environment`);
    await this.cleanupBlueEnvironment();
  }

  /**
   * Canary deployment - gradually shift traffic to new version
   */
  private async executeCanaryDeploy(
    config: SelfDeployConfig,
    status: DeploymentStatus,
    manifest: ZyphronManifest
  ): Promise<void> {
    const trafficSteps = [5, 10, 25, 50, 75, 100];

    status.logs.push(`[${new Date().toISOString()}] Starting canary deployment`);

    // Deploy canary instance
    for (const component of ['api', 'worker', 'frontend'] as const) {
      if (!config.components[component]) continue;
      await this.simulateComponentDeploy(
        `${component}-canary`,
        { ...manifest.components[component], replicas: 1 },
        status
      );
    }

    // Gradually increase traffic
    for (const percentage of trafficSteps) {
      status.logs.push(`[${new Date().toISOString()}] Shifting ${percentage}% traffic to canary`);
      await this.shiftTrafficToCanary(percentage);

      // Monitor for errors
      const metrics = await this.getCanaryMetrics();
      if (metrics.errorRate > 0.01) {
        throw new Error(`Canary error rate too high: ${metrics.errorRate * 100}%`);
      }

      // Wait before next step
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    // Promote canary to stable
    status.logs.push(`[${new Date().toISOString()}] Promoting canary to stable`);
    await this.promoteCanary(manifest, status);
  }

  /**
   * Rollback to previous version
   */
  async rollback(deploymentId: string): Promise<DeploymentStatus> {
    const status = await this.getDeploymentStatus(deploymentId);
    if (!status) {
      throw new Error('Deployment not found');
    }

    if (!status.previousVersion) {
      throw new Error('No previous version to rollback to');
    }

    logger.info('Rolling back deployment', {
      deploymentId,
      from: status.version,
      to: status.previousVersion,
    });

    status.status = 'deploying';
    status.logs.push(`[${new Date().toISOString()}] Rolling back to ${status.previousVersion}`);
    await this.saveDeploymentStatus(status);

    // Perform rollback
    const manifest = await this.generateManifest(status.previousVersion);
    await this.executeRollingDeploy(
      {
        version: status.previousVersion,
        environment: 'production',
        components: { api: true, worker: true, frontend: true },
        strategy: 'rolling',
        healthCheckUrl: process.env.HEALTH_CHECK_URL || 'http://localhost:3000/health',
        rollbackOnFailure: false,
      },
      status,
      manifest
    );

    status.status = 'rolled-back';
    status.logs.push(`[${new Date().toISOString()}] Rollback completed`);
    await this.saveDeploymentStatus(status);

    return status;
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus | null> {
    const cached = await redisClient.get(`${this.cacheKeyPrefix}:deployment:${deploymentId}`);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  }

  /**
   * List all deployments
   */
  async listDeployments(limit = 10): Promise<DeploymentStatus[]> {
    const keys = await redisClient.keys(`${this.cacheKeyPrefix}:deployment:*`);
    const deployments: DeploymentStatus[] = [];

    for (const key of keys.slice(0, limit)) {
      const data = await redisClient.get(key);
      if (data) {
        deployments.push(JSON.parse(data));
      }
    }

    return deployments.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  /**
   * Get system health
   */
  async getSystemHealth(): Promise<{
    healthy: boolean;
    components: Record<string, { healthy: boolean; latency: number }>;
    version: string;
  }> {
    const version = await this.getCurrentVersion();
    const components: Record<string, { healthy: boolean; latency: number }> = {};

    // Check API health
    const apiStart = Date.now();
    try {
      // In production, this would make actual HTTP requests
      components.api = { healthy: true, latency: Date.now() - apiStart };
    } catch {
      components.api = { healthy: false, latency: Date.now() - apiStart };
    }

    // Check database health
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      components.database = { healthy: true, latency: Date.now() - dbStart };
    } catch {
      components.database = { healthy: false, latency: Date.now() - dbStart };
    }

    // Check Redis health
    const redisStart = Date.now();
    try {
      await redisClient.ping();
      components.redis = { healthy: true, latency: Date.now() - redisStart };
    } catch {
      components.redis = { healthy: false, latency: Date.now() - redisStart };
    }

    const healthy = Object.values(components).every(c => c.healthy);

    return { healthy, components, version };
  }

  // Helper methods

  private async saveDeploymentStatus(status: DeploymentStatus): Promise<void> {
    await redisClient.set(
      `${this.cacheKeyPrefix}:deployment:${status.id}`,
      JSON.stringify(status),
      'EX',
      86400 * 7 // 7 days
    );
  }

  private async simulateComponentDeploy(
    component: string,
    config: { image: string; replicas: number; resources: { cpu: string; memory: string } },
    status: DeploymentStatus
  ): Promise<void> {
    // In production, this would call Kubernetes API
    status.logs.push(
      `[${new Date().toISOString()}] Deploying ${component}: ${config.image} (${config.replicas} replicas)`
    );
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private async waitForComponentHealth(
    component: string,
    _healthCheckUrl: string,
    status: DeploymentStatus
  ): Promise<void> {
    // Simulate waiting for health
    await new Promise(resolve => setTimeout(resolve, 3000));
    status.healthChecks.push({
      component,
      healthy: true,
      responseTime: 50,
      timestamp: new Date(),
    });
  }

  private async performHealthCheck(
    _url: string,
    status: DeploymentStatus
  ): Promise<boolean> {
    // In production, this would make actual HTTP requests
    status.healthChecks.push({
      component: 'system',
      healthy: true,
      responseTime: 100,
      timestamp: new Date(),
    });
    return true;
  }

  private async switchTrafficToGreen(status: DeploymentStatus): Promise<void> {
    status.logs.push(`[${new Date().toISOString()}] Traffic switched to green environment`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async cleanupBlueEnvironment(): Promise<void> {
    // In production, this would remove old deployment
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async shiftTrafficToCanary(_percentage: number): Promise<void> {
    // In production, this would update load balancer weights
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  private async getCanaryMetrics(): Promise<{ errorRate: number; latency: number }> {
    return { errorRate: 0.001, latency: 45 };
  }

  private async promoteCanary(
    manifest: ZyphronManifest,
    status: DeploymentStatus
  ): Promise<void> {
    for (const component of ['api', 'worker', 'frontend'] as const) {
      status.components[component].status = 'running';
      status.components[component].version = manifest.version;
      status.components[component].replicas.ready = status.components[component].replicas.desired;
    }
    await this.saveDeploymentStatus(status);
  }
}

export const selfDeploymentService = new SelfDeploymentService();
