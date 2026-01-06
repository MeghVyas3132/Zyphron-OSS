// ===========================================
// PARALLEL MULTI-SERVICE DEPLOYER
// Builds and deploys services in parallel with worker pools
// All containers connected in a shared network (Kubernetes-style)
// ===========================================

import Docker from 'dockerode';
import { createLogger } from '../../lib/logger.js';
import { MultiServiceConfig, ServiceDefinition } from '../detector/multi-service.js';
import { BuilderService, getBuilderService, BuildResult } from '../builder/index.js';
import { validateAndFix } from '../validator/index.js';

const logger = createLogger('parallel-deployer');

// Type-safe event emitter interface
type EventCallback = (...args: unknown[]) => void;

class TypedEventEmitter {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, callback: EventCallback): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return this;
  }

  off(event: string, callback: EventCallback): this {
    this.listeners.get(event)?.delete(callback);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const callbacks = this.listeners.get(event);
    if (!callbacks || callbacks.size === 0) return false;
    callbacks.forEach(cb => cb(...args));
    return true;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}

// ===========================================
// TYPES
// ===========================================

export interface ParallelDeployOptions {
  config: MultiServiceConfig;
  deploymentId: string;
  projectId: string;
  projectSlug: string;
  envVars?: Record<string, string>;
  maxConcurrentBuilds?: number;  // Max parallel builds
  maxConcurrentDeploys?: number; // Max parallel container starts
}

export interface ServiceBuildTask {
  service: ServiceDefinition;
  status: 'pending' | 'building' | 'built' | 'failed';
  buildResult?: BuildResult;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface ServiceDeployTask {
  service: ServiceDefinition;
  buildResult: BuildResult;
  status: 'pending' | 'deploying' | 'running' | 'failed';
  containerId?: string;
  containerName?: string;
  internalUrl?: string;
  externalUrl?: string;
  error?: string;
}

export interface ParallelDeployResult {
  success: boolean;
  deploymentId: string;
  projectId: string;
  networkName: string;
  services: {
    name: string;
    status: 'running' | 'failed';
    containerId?: string;
    containerName?: string;
    internalUrl?: string;
    externalUrl?: string;
    port?: number;
    buildDuration?: number;
    deployDuration?: number;
    error?: string;
  }[];
  totalBuildTime: number;
  totalDeployTime: number;
  totalDuration: number;
}

// ===========================================
// MANAGED SERVICE CONFIG
// ===========================================

const MANAGED_SERVICES: Record<string, {
  image: string;
  port: number;
  env: Record<string, string>;
  healthCheck: string[];
  readyLog?: string; // Log message indicating service is ready
  connectionEnv: Record<string, string>;
}> = {
  postgresql: {
    image: 'postgres:16-alpine',
    port: 5432,
    env: {
      POSTGRES_USER: 'zyphron',
      POSTGRES_PASSWORD: 'zyphron_${DEPLOY_ID}',
      POSTGRES_DB: 'app',
    },
    healthCheck: ['pg_isready', '-U', 'zyphron'],
    readyLog: 'database system is ready to accept connections',
    connectionEnv: {
      DATABASE_URL: 'postgresql://zyphron:zyphron_${DEPLOY_ID}@${SERVICE}:5432/app',
      DB_HOST: '${SERVICE}',
      DB_PORT: '5432',
      DB_USER: 'zyphron',
      DB_PASSWORD: 'zyphron_${DEPLOY_ID}',
      DB_NAME: 'app',
      POSTGRES_HOST: '${SERVICE}',
    },
  },
  mysql: {
    image: 'mysql:8',
    port: 3306,
    env: {
      MYSQL_ROOT_PASSWORD: 'root_${DEPLOY_ID}',
      MYSQL_USER: 'zyphron',
      MYSQL_PASSWORD: 'zyphron_${DEPLOY_ID}',
      MYSQL_DATABASE: 'app',
    },
    healthCheck: ['mysqladmin', 'ping', '-h', 'localhost'],
    connectionEnv: {
      DATABASE_URL: 'mysql://zyphron:zyphron_${DEPLOY_ID}@${SERVICE}:3306/app',
      DB_HOST: '${SERVICE}',
      DB_PORT: '3306',
    },
  },
  mongodb: {
    image: 'mongo:7',
    port: 27017,
    env: {
      MONGO_INITDB_ROOT_USERNAME: 'zyphron',
      MONGO_INITDB_ROOT_PASSWORD: 'zyphron_${DEPLOY_ID}',
    },
    healthCheck: ['mongosh', '--eval', "db.adminCommand('ping')"],
    connectionEnv: {
      MONGODB_URI: 'mongodb://zyphron:zyphron_${DEPLOY_ID}@${SERVICE}:27017/app?authSource=admin',
      MONGODB_URL: 'mongodb://zyphron:zyphron_${DEPLOY_ID}@${SERVICE}:27017/app?authSource=admin',
      MONGO_URL: 'mongodb://zyphron:zyphron_${DEPLOY_ID}@${SERVICE}:27017/app?authSource=admin',
      DATABASE_URL: 'mongodb://zyphron:zyphron_${DEPLOY_ID}@${SERVICE}:27017/app?authSource=admin',
    },
  },
  redis: {
    image: 'redis:7-alpine',
    port: 6379,
    env: {},
    healthCheck: ['redis-cli', 'ping'],
    readyLog: 'Ready to accept connections',
    connectionEnv: {
      REDIS_URL: 'redis://${SERVICE}:6379',
      REDIS_HOST: '${SERVICE}',
      REDIS_PORT: '6379',
    },
  },
  rabbitmq: {
    image: 'rabbitmq:3-management-alpine',
    port: 5672,
    env: {
      RABBITMQ_DEFAULT_USER: 'zyphron',
      RABBITMQ_DEFAULT_PASS: 'zyphron_${DEPLOY_ID}',
    },
    healthCheck: ['rabbitmq-diagnostics', 'check_running'],
    connectionEnv: {
      RABBITMQ_URL: 'amqp://zyphron:zyphron_${DEPLOY_ID}@${SERVICE}:5672',
      AMQP_URL: 'amqp://zyphron:zyphron_${DEPLOY_ID}@${SERVICE}:5672',
    },
  },
  elasticsearch: {
    image: 'elasticsearch:8.11.0',
    port: 9200,
    env: {
      'discovery.type': 'single-node',
      'xpack.security.enabled': 'false',
      ES_JAVA_OPTS: '-Xms512m -Xmx512m',
    },
    healthCheck: ['curl', '-f', 'http://localhost:9200/_cluster/health'],
    connectionEnv: {
      ELASTICSEARCH_URL: 'http://${SERVICE}:9200',
      ELASTIC_URL: 'http://${SERVICE}:9200',
    },
  },
};

// ===========================================
// PARALLEL DEPLOYER CLASS
// ===========================================

export class ParallelMultiServiceDeployer extends TypedEventEmitter {
  private docker: Docker;
  private builder: BuilderService;
  private network: string;
  private domain: string;

  constructor(
    network: string = 'zyphron-network',
    domain: string = 'localhost',
    registryUrl: string = 'localhost:5000'
  ) {
    super();
    this.docker = new Docker();
    this.builder = getBuilderService(registryUrl);
    this.network = network;
    this.domain = domain;
  }

  // ==========================================
  // MAIN PARALLEL DEPLOY METHOD
  // ===========================================

  async deploy(options: ParallelDeployOptions): Promise<ParallelDeployResult> {
    const {
      config,
      deploymentId,
      projectId,
      projectSlug,
      envVars = {},
      maxConcurrentBuilds = 4,
      maxConcurrentDeploys = 8,
    } = options;

    const startTime = Date.now();
    const deployIdShort = deploymentId.substring(0, 8);

    this.emit('start', { deploymentId, serviceCount: config.services.length });
    logger.info({ 
      deploymentId, 
      serviceCount: config.services.length,
      maxConcurrentBuilds,
    }, 'Starting parallel multi-service deployment');

    try {
      // ===========================================
      // PHASE 1: Create shared deployment network
      // ===========================================
      this.emit('phase', { phase: 'network', message: 'Creating deployment network' });
      
      const networkName = await this.createDeploymentNetwork(deploymentId, projectSlug);
      
      // Also ensure containers can reach the main Traefik network
      await this.ensureMainNetwork();

      logger.info({ networkName }, 'Deployment network created');

      // ===========================================
      // PHASE 2: Separate managed services from app services
      // ===========================================
      const managedServices = config.services.filter(s => s.type === 'managed');
      const appServices = config.services.filter(s => s.type !== 'managed');

      // ===========================================
      // PHASE 3: Start managed services FIRST (in parallel)
      // These need to be running before app services can connect
      // ===========================================
      this.emit('phase', { phase: 'managed', message: `Starting ${managedServices.length} managed services` });

      const managedResults = await this.deployManagedServicesParallel(
        managedServices,
        deploymentId,
        projectId,
        projectSlug,
        networkName,
        maxConcurrentDeploys
      );

      // Build connection environment from managed services
      const connectionEnv = this.buildConnectionEnvironment(managedResults, deployIdShort);
      
      logger.info({ 
        managedCount: managedServices.length,
        connectionEnvKeys: Object.keys(connectionEnv),
      }, 'Managed services started');

      // ===========================================
      // PHASE 4: Build all app services in PARALLEL
      // ===========================================
      this.emit('phase', { phase: 'build', message: `Building ${appServices.length} services in parallel` });
      
      const buildStartTime = Date.now();
      
      const buildResults = await this.buildServicesParallel(
        appServices,
        deploymentId,
        projectId,
        config.projectPath,
        { ...envVars, ...connectionEnv },
        maxConcurrentBuilds
      );

      const buildDuration = Date.now() - buildStartTime;
      
      logger.info({ 
        buildDuration,
        successCount: buildResults.filter(r => r.buildResult?.success).length,
        failCount: buildResults.filter(r => !r.buildResult?.success).length,
      }, 'Parallel build phase completed');

      // ===========================================
      // PHASE 5: Deploy all app containers in PARALLEL
      // ===========================================
      this.emit('phase', { phase: 'deploy', message: `Deploying ${appServices.length} containers in parallel` });
      
      const deployStartTime = Date.now();

      const deployResults = await this.deployServicesParallel(
        buildResults.filter(r => r.buildResult?.success),
        deploymentId,
        projectId,
        projectSlug,
        networkName,
        { ...envVars, ...connectionEnv },
        maxConcurrentDeploys
      );

      const deployDuration = Date.now() - deployStartTime;

      // ===========================================
      // PHASE 6: Connect all containers to main network for Traefik
      // ===========================================
      this.emit('phase', { phase: 'network', message: 'Connecting services to routing network' });
      
      await this.connectToMainNetwork([...managedResults, ...deployResults]);

      // ===========================================
      // PHASE 7: Wait for all services to be healthy
      // ===========================================
      this.emit('phase', { phase: 'health', message: 'Waiting for health checks' });
      
      await this.waitForAllHealthy([...managedResults, ...deployResults]);

      // ===========================================
      // Compile results
      // ===========================================
      const totalDuration = Date.now() - startTime;
      const allResults = [...managedResults, ...deployResults];
      const allSuccess = allResults.every(r => r.status === 'running');

      const result: ParallelDeployResult = {
        success: allSuccess,
        deploymentId,
        projectId,
        networkName,
        services: allResults.map(r => ({
          name: r.service.name,
          status: r.status === 'running' ? 'running' : 'failed',
          containerId: r.containerId,
          containerName: r.containerName,
          internalUrl: r.internalUrl,
          externalUrl: r.externalUrl,
          port: r.service.port,
          error: r.error,
        })),
        totalBuildTime: buildDuration,
        totalDeployTime: deployDuration,
        totalDuration,
      };

      this.emit('complete', result);

      logger.info({
        deploymentId,
        totalDuration,
        buildDuration,
        deployDuration,
        serviceCount: allResults.length,
        successCount: allResults.filter(r => r.status === 'running').length,
      }, 'Parallel deployment completed');

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.emit('error', { deploymentId, error: errorMessage });
      logger.error({ deploymentId, error: errorMessage }, 'Parallel deployment failed');

      throw error;
    }
  }

  // ===========================================
  // PARALLEL BUILD IMPLEMENTATION
  // ===========================================

  private async buildServicesParallel(
    services: ServiceDefinition[],
    deploymentId: string,
    projectId: string,
    projectPath: string,
    envVars: Record<string, string>,
    maxConcurrent: number
  ): Promise<ServiceBuildTask[]> {
    const tasks: ServiceBuildTask[] = services.map(service => ({
      service,
      status: 'pending' as const,
    }));

    // Use a semaphore pattern for concurrency control
    const semaphore = new Semaphore(maxConcurrent);
    
    const buildPromises = tasks.map(async (task) => {
      await semaphore.acquire();
      
      try {
        task.status = 'building';
        task.startTime = Date.now();
        
        this.emit('service:build:start', { 
          service: task.service.name,
          deploymentId,
        });

        const servicePath = `${projectPath}/${task.service.path}`.replace(/\/\.$/, '');
        
        // Validate and auto-fix project structure before building
        if (task.service.detection) {
          try {
            const validation = await validateAndFix(servicePath, task.service.detection);
            
            if (validation.fixes.length > 0) {
              logger.info({
                service: task.service.name,
                fixes: validation.fixes.map(f => f.description),
              }, 'Auto-fixed project issues');
              
              this.emit('service:validation:fixed', {
                service: task.service.name,
                fixes: validation.fixes,
              });
            }
            
            if (!validation.valid) {
              const errors = validation.issues
                .filter(i => i.type === 'error' && !i.autoFixable)
                .map(i => i.message);
                
              if (errors.length > 0) {
                logger.warn({
                  service: task.service.name,
                  errors,
                }, 'Project has validation errors that could not be auto-fixed');
                
                this.emit('service:validation:warning', {
                  service: task.service.name,
                  errors,
                });
              }
            }
          } catch (validationError) {
            logger.warn({ service: task.service.name, error: validationError }, 'Validation failed, proceeding with build');
          }
        }
        
        logger.info({ 
          service: task.service.name, 
          path: servicePath,
        }, 'Building service');

        const buildResult = await this.builder.buildImage({
          projectPath: servicePath,
          deploymentId: `${deploymentId}-${task.service.name}`,
          projectId: `${projectId}-${task.service.name}`,
          detection: task.service.detection!,
          envVars,
          onLog: (log) => {
            this.emit('service:build:log', {
              service: task.service.name,
              log,
            });
          },
        });

        task.buildResult = buildResult;
        task.endTime = Date.now();

        if (buildResult.success) {
          task.status = 'built';
          
          // Push to registry in parallel
          this.builder.pushImage(buildResult.imageName, buildResult.imageTag).catch(err => {
            logger.warn({ service: task.service.name, error: err }, 'Failed to push to registry');
          });
          
          this.emit('service:build:complete', {
            service: task.service.name,
            duration: task.endTime - task.startTime!,
            imageId: buildResult.imageId,
          });
        } else {
          task.status = 'failed';
          task.error = buildResult.error;
          
          this.emit('service:build:failed', {
            service: task.service.name,
            error: buildResult.error,
          });
        }
      } catch (error) {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : 'Build failed';
        task.endTime = Date.now();
        
        this.emit('service:build:failed', {
          service: task.service.name,
          error: task.error,
        });
      } finally {
        semaphore.release();
      }
      
      return task;
    });

    return Promise.all(buildPromises);
  }

  // ===========================================
  // PARALLEL MANAGED SERVICE DEPLOYMENT
  // ===========================================

  private async deployManagedServicesParallel(
    services: ServiceDefinition[],
    deploymentId: string,
    projectId: string,
    projectSlug: string,
    networkName: string,
    maxConcurrent: number
  ): Promise<ServiceDeployTask[]> {
    if (services.length === 0) return [];

    const semaphore = new Semaphore(maxConcurrent);
    const tasks: ServiceDeployTask[] = [];

    const deployPromises = services.map(async (service) => {
      await semaphore.acquire();

      const task: ServiceDeployTask = {
        service,
        buildResult: {} as BuildResult,
        status: 'pending',
      };
      tasks.push(task);

      try {
        task.status = 'deploying';
        
        const managedConfig = MANAGED_SERVICES[service.name];
        if (!managedConfig) {
          throw new Error(`Unknown managed service: ${service.name}`);
        }

        const containerName = `zyphron-${projectSlug}-${service.name}-${deploymentId.substring(0, 8)}`;
        const deployIdShort = deploymentId.substring(0, 8);

        this.emit('service:deploy:start', { service: service.name, type: 'managed' });

        // Pull image
        await this.pullImage(managedConfig.image);

        // Prepare environment
        const env = Object.entries(managedConfig.env).map(([k, v]) => 
          `${k}=${v.replace(/\${DEPLOY_ID}/g, deployIdShort)}`
        );

        // Create container
        const container = await this.docker.createContainer({
          name: containerName,
          Image: managedConfig.image,
          Env: env,
          ExposedPorts: { [`${managedConfig.port}/tcp`]: {} },
          HostConfig: {
            NetworkMode: networkName,
            RestartPolicy: { Name: 'unless-stopped' },
          },
          Healthcheck: {
            Test: ['CMD', ...managedConfig.healthCheck],
            Interval: 5_000_000_000,
            Timeout: 3_000_000_000,
            Retries: 10,
            StartPeriod: 10_000_000_000,
          },
          Labels: {
            'zyphron.managed': 'true',
            'zyphron.project.id': projectId,
            'zyphron.project.slug': projectSlug,
            'zyphron.deployment.id': deploymentId,
            'zyphron.service.name': service.name,
            'zyphron.service.type': 'managed',
          },
        });

        await container.start();

        task.containerId = container.id;
        task.containerName = containerName;
        task.internalUrl = `${containerName}:${managedConfig.port}`;
        task.status = 'running';

        this.emit('service:deploy:complete', { 
          service: service.name, 
          containerId: container.id,
        });

        logger.info({ service: service.name, containerId: container.id }, 'Managed service started');

      } catch (error) {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : 'Deploy failed';
        
        this.emit('service:deploy:failed', { service: service.name, error: task.error });
      } finally {
        semaphore.release();
      }

      return task;
    });

    await Promise.all(deployPromises);
    return tasks;
  }

  // ===========================================
  // PARALLEL APP SERVICE DEPLOYMENT
  // ===========================================

  private async deployServicesParallel(
    buildTasks: ServiceBuildTask[],
    deploymentId: string,
    projectId: string,
    projectSlug: string,
    networkName: string,
    envVars: Record<string, string>,
    maxConcurrent: number
  ): Promise<ServiceDeployTask[]> {
    const semaphore = new Semaphore(maxConcurrent);
    const tasks: ServiceDeployTask[] = [];

    // Build service discovery URLs for inter-service communication
    // This allows frontend to know the backend URL, etc.
    const serviceDiscoveryEnv = this.buildServiceDiscoveryEnv(buildTasks, projectSlug, deploymentId);

    const deployPromises = buildTasks.map(async (buildTask) => {
      await semaphore.acquire();

      const service = buildTask.service;
      
      const task: ServiceDeployTask = {
        service: buildTask.service,
        buildResult: buildTask.buildResult!,
        status: 'pending',
      };
      tasks.push(task);

      try {
        task.status = 'deploying';
        
        const containerName = `zyphron-${projectSlug}-${service.name}-${deploymentId.substring(0, 8)}`;
        const port = service.port || service.detection?.port || 3000;
        const fullImageName = `${buildTask.buildResult!.imageName}:${buildTask.buildResult!.imageTag}`;

        this.emit('service:deploy:start', { service: service.name, type: 'app' });

        // Generate deployment-specific secrets
        const deploySecret = `zyphron_${deploymentId.substring(0, 8)}_${Date.now().toString(36)}`;

        // Prepare environment - include connection to other services, service discovery, and auto-generated secrets
        const env = Object.entries({
          ...envVars,
          ...serviceDiscoveryEnv,
          NODE_ENV: 'production',
          PORT: port.toString(),
          ZYPHRON_DEPLOYMENT_ID: deploymentId,
          ZYPHRON_PROJECT_ID: projectId,
          ZYPHRON_SERVICE_NAME: service.name,
          // Auto-generated secrets for common frameworks
          JWT_SECRET: envVars.JWT_SECRET || deploySecret,
          JWT_ACCESS_SECRET: envVars.JWT_ACCESS_SECRET || deploySecret,
          JWT_REFRESH_SECRET: envVars.JWT_REFRESH_SECRET || `${deploySecret}_refresh`,
          SESSION_SECRET: envVars.SESSION_SECRET || deploySecret,
          SECRET_KEY: envVars.SECRET_KEY || deploySecret,
          APP_SECRET: envVars.APP_SECRET || deploySecret,
          // Common JWT expiration defaults
          JWT_ACCESS_EXPIRATION_MINUTES: envVars.JWT_ACCESS_EXPIRATION_MINUTES || '30',
          JWT_REFRESH_EXPIRATION_DAYS: envVars.JWT_REFRESH_EXPIRATION_DAYS || '30',
        }).map(([k, v]) => `${k}=${v}`);

        // Traefik labels for external routing
        const traefikLabels: Record<string, string> = service.internalOnly ? {} : {
          'traefik.enable': 'true',
          [`traefik.http.routers.${containerName}.rule`]: `Host(\`${projectSlug}-${service.name}.${this.domain}\`)`,
          [`traefik.http.routers.${containerName}.entrypoints`]: 'web',
          [`traefik.http.routers.${containerName}.service`]: containerName,
          [`traefik.http.services.${containerName}.loadbalancer.server.port`]: port.toString(),
        };

        // Create container
        const container = await this.docker.createContainer({
          name: containerName,
          Image: fullImageName,
          Env: env,
          ExposedPorts: { [`${port}/tcp`]: {} },
          HostConfig: {
            NetworkMode: networkName,
            RestartPolicy: { Name: 'unless-stopped' },
            Memory: this.parseMemory(service.resources?.memory || '512m'),
            NanoCpus: this.parseCPU(service.resources?.cpu || '0.5'),
          },
          Healthcheck: service.healthCheck?.path ? {
            Test: ['CMD', 'curl', '-f', `http://localhost:${port}${service.healthCheck.path}`],
            Interval: 10_000_000_000,
            Timeout: 5_000_000_000,
            Retries: 3,
            StartPeriod: 30_000_000_000,
          } : undefined,
          Labels: {
            'zyphron.managed': 'true',
            'zyphron.project.id': projectId,
            'zyphron.project.slug': projectSlug,
            'zyphron.deployment.id': deploymentId,
            'zyphron.service.name': service.name,
            'zyphron.service.type': 'app',
            ...traefikLabels,
          },
        });

        await container.start();

        task.containerId = container.id;
        task.containerName = containerName;
        task.internalUrl = `http://${containerName}:${port}`;
        task.externalUrl = service.internalOnly ? undefined : `http://${projectSlug}-${service.name}.${this.domain}`;
        task.status = 'running';

        this.emit('service:deploy:complete', { 
          service: service.name, 
          containerId: container.id,
          externalUrl: task.externalUrl,
        });

        logger.info({ 
          service: service.name, 
          containerId: container.id,
          externalUrl: task.externalUrl,
        }, 'App service deployed');

      } catch (error) {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : 'Deploy failed';
        
        this.emit('service:deploy:failed', { service: service.name, error: task.error });
      } finally {
        semaphore.release();
      }

      return task;
    });

    await Promise.all(deployPromises);
    return tasks;
  }

  // ===========================================
  // NETWORK MANAGEMENT
  // ===========================================

  private async createDeploymentNetwork(deploymentId: string, projectSlug: string): Promise<string> {
    const networkName = `zyphron-${projectSlug}-${deploymentId.substring(0, 8)}`;

    try {
      await this.docker.getNetwork(networkName).inspect();
      logger.debug({ networkName }, 'Network already exists');
    } catch {
      await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        Labels: {
          'zyphron.managed': 'true',
          'zyphron.deployment.id': deploymentId,
          'zyphron.project.slug': projectSlug,
        },
        Options: {
          'com.docker.network.bridge.enable_icc': 'true', // Inter-container communication
        },
      });
      logger.info({ networkName }, 'Created deployment network');
    }

    return networkName;
  }

  private async ensureMainNetwork(): Promise<void> {
    try {
      await this.docker.getNetwork(this.network).inspect();
    } catch {
      await this.docker.createNetwork({
        Name: this.network,
        Driver: 'bridge',
      });
    }
  }

  private async connectToMainNetwork(tasks: ServiceDeployTask[]): Promise<void> {
    const mainNetwork = this.docker.getNetwork(this.network);

    const connectPromises = tasks
      .filter(t => t.containerId && !t.service.internalOnly)
      .map(async (task) => {
        try {
          await mainNetwork.connect({ Container: task.containerId! });
          logger.debug({ service: task.service.name }, 'Connected to main network');
        } catch (error) {
          // Might already be connected
          logger.debug({ service: task.service.name }, 'Already connected or failed to connect');
        }
      });

    await Promise.all(connectPromises);
  }

  // ===========================================
  // HEALTH CHECK MANAGEMENT
  // ===========================================

  private async waitForAllHealthy(tasks: ServiceDeployTask[]): Promise<void> {
    const healthPromises = tasks
      .filter(t => t.containerId && t.status === 'running')
      .map(async (task) => {
        await this.waitForHealthy(task.containerId!, task.service.name, 60);
      });

    await Promise.allSettled(healthPromises);
  }

  private async waitForHealthy(containerId: string, serviceName: string, timeoutSeconds: number): Promise<void> {
    const startTime = Date.now();
    const timeout = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeout) {
      try {
        const container = this.docker.getContainer(containerId);
        const info = await container.inspect();

        if (!info.State.Health) {
          // No health check, assume healthy
          return;
        }

        if (info.State.Health.Status === 'healthy') {
          this.emit('service:healthy', { service: serviceName });
          logger.info({ service: serviceName }, 'Service is healthy');
          return;
        }

        if (info.State.Health.Status === 'unhealthy') {
          throw new Error(`Service ${serviceName} is unhealthy`);
        }
      } catch (error) {
        if ((error as Error).message?.includes('unhealthy')) {
          throw error;
        }
      }

      await this.sleep(2000);
    }

    logger.warn({ service: serviceName }, 'Health check timed out');
  }

  // ===========================================
  // ENVIRONMENT BUILDING
  // ===========================================

  private buildConnectionEnvironment(
    managedTasks: ServiceDeployTask[],
    deployIdShort: string
  ): Record<string, string> {
    const env: Record<string, string> = {};

    for (const task of managedTasks) {
      if (task.status !== 'running' || !task.containerName) continue;

      const config = MANAGED_SERVICES[task.service.name];
      if (!config) continue;

      for (const [key, template] of Object.entries(config.connectionEnv)) {
        env[key] = template
          .replace(/\${SERVICE}/g, task.containerName)
          .replace(/\${DEPLOY_ID}/g, deployIdShort);
      }
    }

    return env;
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  private async pullImage(imageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(imageName, (err: Error | null, stream: unknown) => {
        if (err) {
          reject(err);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.docker.modem.followProgress(stream as any, (err: Error | null) => {
          err ? reject(err) : resolve();
        });
      });
    });
  }

  private parseMemory(memory: string): number {
    const match = memory.match(/^(\d+)(k|m|g)?$/i);
    if (!match) return 512 * 1024 * 1024;
    const value = parseInt(match[1]);
    const unit = (match[2] || 'm').toLowerCase();
    switch (unit) {
      case 'k': return value * 1024;
      case 'm': return value * 1024 * 1024;
      case 'g': return value * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  private parseCPU(cpu: string): number {
    return Math.round(parseFloat(cpu) * 1_000_000_000);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => (globalThis as any).setTimeout(resolve, ms));
  }

  // ===========================================
  // SERVICE DISCOVERY ENVIRONMENT BUILDER
  // Injects URLs for inter-service communication
  // ===========================================

  private buildServiceDiscoveryEnv(
    buildTasks: ServiceBuildTask[],
    projectSlug: string,
    _deploymentId: string
  ): Record<string, string> {
    const env: Record<string, string> = {};

    // Create URL patterns for each service
    for (const task of buildTasks) {
      const serviceName = task.service.name;
      const servicePort = task.service.port || task.service.detection?.port || 3000;
      
      // External URL (via Traefik/public)
      const externalUrl = `http://${projectSlug}-${serviceName}.${this.domain}`;
      
      // Internal URL (container-to-container in same network)
      // This will be the container name once deployed
      // For now we use external URL since containers aren't created yet
      
      // Generate various env var patterns for service discovery
      const upperName = serviceName.toUpperCase().replace(/-/g, '_');
      
      // Standard patterns used by various frameworks
      env[`${upperName}_URL`] = externalUrl;
      env[`${upperName}_SERVICE_URL`] = externalUrl;
      env[`${upperName}_HOST`] = `${projectSlug}-${serviceName}.${this.domain}`;
      env[`${upperName}_PORT`] = servicePort.toString();
      
      // Common API URL patterns (for frontend services)
      if (serviceName === 'backend' || serviceName === 'api' || serviceName === 'server') {
        env['API_URL'] = externalUrl;
        env['REACT_APP_API_URL'] = externalUrl;  // Create React App
        env['NEXT_PUBLIC_API_URL'] = externalUrl;  // Next.js
        env['VITE_API_URL'] = externalUrl;  // Vite
        env['VUE_APP_API_URL'] = externalUrl;  // Vue CLI
        env['NUXT_PUBLIC_API_URL'] = externalUrl;  // Nuxt 3
        env['PUBLIC_API_URL'] = externalUrl;  // SvelteKit
        env['BACKEND_URL'] = externalUrl;
        env['SERVER_URL'] = externalUrl;
      }
      
      // If this is a frontend service, mark it
      if (serviceName === 'frontend' || serviceName === 'web' || serviceName === 'client' || serviceName === 'app') {
        env['FRONTEND_URL'] = externalUrl;
        env['WEB_URL'] = externalUrl;
        env['CLIENT_URL'] = externalUrl;
      }
    }

    logger.info({
      serviceCount: buildTasks.length,
      discoveryEnvKeys: Object.keys(env),
    }, 'Built service discovery environment');

    return env;
  }

  // ===========================================
  // CLEANUP
  // ===========================================

  async cleanup(deploymentId: string, projectSlug: string): Promise<void> {
    const prefix = `zyphron-${projectSlug}-`;
    const networkName = `${prefix}${deploymentId.substring(0, 8)}`;

    logger.info({ deploymentId, networkName }, 'Cleaning up deployment');

    // Find and remove containers
    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: [`zyphron.deployment.id=${deploymentId}`] },
    });

    await Promise.all(containers.map(async (c: Docker.ContainerInfo) => {
      try {
        const container = this.docker.getContainer(c.Id);
        await container.stop().catch(() => {});
        await container.remove();
      } catch (error) {
        logger.warn({ containerId: c.Id }, 'Failed to remove container');
      }
    }));

    // Remove network
    try {
      await this.docker.getNetwork(networkName).remove();
    } catch (error) {
      logger.warn({ networkName }, 'Failed to remove network');
    }
  }
}

// ===========================================
// SEMAPHORE FOR CONCURRENCY CONTROL
// ===========================================

class Semaphore {
  private permits: number;
  private waiting: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.waiting.length > 0 && this.permits > 0) {
      this.permits--;
      const next = this.waiting.shift();
      next?.();
    }
  }
}

// ===========================================
// SINGLETON EXPORT
// ===========================================

let parallelDeployer: ParallelMultiServiceDeployer | null = null;

export function getParallelDeployer(
  network?: string,
  domain?: string,
  registryUrl?: string
): ParallelMultiServiceDeployer {
  if (!parallelDeployer) {
    parallelDeployer = new ParallelMultiServiceDeployer(network, domain, registryUrl);
  }
  return parallelDeployer;
}

export default ParallelMultiServiceDeployer;
