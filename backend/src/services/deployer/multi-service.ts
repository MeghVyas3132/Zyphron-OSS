// ===========================================
// MULTI-SERVICE DEPLOYER
// Orchestrates deployment of multiple services with dependency resolution
// ===========================================

import Docker from 'dockerode';
import { createLogger } from '../../lib/logger.js';
import { MultiServiceConfig, ServiceDefinition } from '../detector/multi-service.js';
import { BuilderService, getBuilderService } from '../builder/index.js';

const logger = createLogger('multi-service-deployer');

// ===========================================
// TYPES
// ===========================================

export interface MultiServiceDeployOptions {
  config: MultiServiceConfig;
  deploymentId: string;
  projectId: string;
  projectSlug: string;
  envVars?: Record<string, string>;
  onLog?: (log: string, level: string, service?: string) => void;
  onProgress?: (service: string, progress: number, message: string) => void;
}

export interface ServiceDeployResult {
  serviceName: string;
  success: boolean;
  containerId?: string;
  containerName?: string;
  internalUrl?: string;
  externalUrl?: string;
  port?: number;
  error?: string;
  duration: number;
}

export interface MultiServiceDeployResult {
  success: boolean;
  deploymentId: string;
  projectId: string;
  services: ServiceDeployResult[];
  networkName: string;
  totalDuration: number;
  error?: string;
}

// ===========================================
// MANAGED SERVICE IMAGES & CONFIG
// ===========================================

const MANAGED_SERVICE_CONFIG: Record<string, {
  image: string;
  port: number;
  envVars: Record<string, string>;
  healthCheck: {
    test: string[];
    interval: number;
    timeout: number;
    retries: number;
    startPeriod: number;
  };
  volumes: { name: string; path: string }[];
  connectionEnvTemplate: Record<string, string>;  // Env vars to inject into dependent services
}> = {
  postgresql: {
    image: 'postgres:16-alpine',
    port: 5432,
    envVars: {
      POSTGRES_USER: 'zyphron',
      POSTGRES_PASSWORD: 'zyphron_secret_${DEPLOYMENT_ID}',
      POSTGRES_DB: 'app',
    },
    healthCheck: {
      test: ['CMD-SHELL', 'pg_isready -U zyphron'],
      interval: 10,
      timeout: 5,
      retries: 5,
      startPeriod: 30,
    },
    volumes: [{ name: 'postgres_data', path: '/var/lib/postgresql/data' }],
    connectionEnvTemplate: {
      DATABASE_URL: 'postgresql://zyphron:zyphron_secret_${DEPLOYMENT_ID}@${SERVICE_NAME}:5432/app',
      DB_HOST: '${SERVICE_NAME}',
      DB_PORT: '5432',
      DB_USER: 'zyphron',
      DB_PASSWORD: 'zyphron_secret_${DEPLOYMENT_ID}',
      DB_NAME: 'app',
    },
  },
  mysql: {
    image: 'mysql:8',
    port: 3306,
    envVars: {
      MYSQL_ROOT_PASSWORD: 'root_secret_${DEPLOYMENT_ID}',
      MYSQL_USER: 'zyphron',
      MYSQL_PASSWORD: 'zyphron_secret_${DEPLOYMENT_ID}',
      MYSQL_DATABASE: 'app',
    },
    healthCheck: {
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
      interval: 10,
      timeout: 5,
      retries: 5,
      startPeriod: 60,
    },
    volumes: [{ name: 'mysql_data', path: '/var/lib/mysql' }],
    connectionEnvTemplate: {
      DATABASE_URL: 'mysql://zyphron:zyphron_secret_${DEPLOYMENT_ID}@${SERVICE_NAME}:3306/app',
      DB_HOST: '${SERVICE_NAME}',
      DB_PORT: '3306',
      DB_USER: 'zyphron',
      DB_PASSWORD: 'zyphron_secret_${DEPLOYMENT_ID}',
      DB_NAME: 'app',
    },
  },
  mongodb: {
    image: 'mongo:7',
    port: 27017,
    envVars: {
      MONGO_INITDB_ROOT_USERNAME: 'zyphron',
      MONGO_INITDB_ROOT_PASSWORD: 'zyphron_secret_${DEPLOYMENT_ID}',
    },
    healthCheck: {
      test: ['CMD', 'mongosh', '--eval', "db.adminCommand('ping')"],
      interval: 10,
      timeout: 5,
      retries: 5,
      startPeriod: 30,
    },
    volumes: [{ name: 'mongo_data', path: '/data/db' }],
    connectionEnvTemplate: {
      MONGODB_URI: 'mongodb://zyphron:zyphron_secret_${DEPLOYMENT_ID}@${SERVICE_NAME}:27017/app?authSource=admin',
      MONGO_URL: 'mongodb://zyphron:zyphron_secret_${DEPLOYMENT_ID}@${SERVICE_NAME}:27017/app?authSource=admin',
      DB_HOST: '${SERVICE_NAME}',
      DB_PORT: '27017',
    },
  },
  redis: {
    image: 'redis:7-alpine',
    port: 6379,
    envVars: {},
    healthCheck: {
      test: ['CMD', 'redis-cli', 'ping'],
      interval: 10,
      timeout: 5,
      retries: 5,
      startPeriod: 10,
    },
    volumes: [{ name: 'redis_data', path: '/data' }],
    connectionEnvTemplate: {
      REDIS_URL: 'redis://${SERVICE_NAME}:6379',
      REDIS_HOST: '${SERVICE_NAME}',
      REDIS_PORT: '6379',
    },
  },
  rabbitmq: {
    image: 'rabbitmq:3-management-alpine',
    port: 5672,
    envVars: {
      RABBITMQ_DEFAULT_USER: 'zyphron',
      RABBITMQ_DEFAULT_PASS: 'zyphron_secret_${DEPLOYMENT_ID}',
    },
    healthCheck: {
      test: ['CMD', 'rabbitmq-diagnostics', 'check_running'],
      interval: 10,
      timeout: 5,
      retries: 5,
      startPeriod: 30,
    },
    volumes: [{ name: 'rabbitmq_data', path: '/var/lib/rabbitmq' }],
    connectionEnvTemplate: {
      RABBITMQ_URL: 'amqp://zyphron:zyphron_secret_${DEPLOYMENT_ID}@${SERVICE_NAME}:5672',
      AMQP_URL: 'amqp://zyphron:zyphron_secret_${DEPLOYMENT_ID}@${SERVICE_NAME}:5672',
    },
  },
  elasticsearch: {
    image: 'elasticsearch:8.11.0',
    port: 9200,
    envVars: {
      'discovery.type': 'single-node',
      'xpack.security.enabled': 'false',
      ES_JAVA_OPTS: '-Xms512m -Xmx512m',
    },
    healthCheck: {
      test: ['CMD-SHELL', 'curl -s http://localhost:9200/_cluster/health | grep -vq "\"status\":\"red\""'],
      interval: 10,
      timeout: 5,
      retries: 10,
      startPeriod: 60,
    },
    volumes: [{ name: 'elasticsearch_data', path: '/usr/share/elasticsearch/data' }],
    connectionEnvTemplate: {
      ELASTICSEARCH_URL: 'http://${SERVICE_NAME}:9200',
      ELASTIC_URL: 'http://${SERVICE_NAME}:9200',
    },
  },
};

// ── Name / image → config key aliases ───────────────────────
// docker-compose service names and image base names often differ
// from our MANAGED_SERVICE_CONFIG keys (e.g. "postgres" vs "postgresql").
const MANAGED_SERVICE_ALIASES: Record<string, string> = {
  // PostgreSQL
  postgres:   'postgresql',
  pg:         'postgresql',
  // MySQL / MariaDB
  mariadb:    'mysql',
  // MongoDB
  mongo:      'mongodb',
};

function resolveManagedConfig(service: ServiceDefinition) {
  // Try exact key first
  if (MANAGED_SERVICE_CONFIG[service.name]) return MANAGED_SERVICE_CONFIG[service.name];
  // Try alias on name
  const aliasedName = MANAGED_SERVICE_ALIASES[service.name.toLowerCase()];
  if (aliasedName && MANAGED_SERVICE_CONFIG[aliasedName]) return MANAGED_SERVICE_CONFIG[aliasedName];
  // Try image base name (e.g. "postgres:16-alpine" → "postgres" → alias → "postgresql")
  if (service.image) {
    const imageBase = service.image.split(':')[0].split('/').pop()?.toLowerCase() ?? '';
    if (MANAGED_SERVICE_CONFIG[imageBase]) return MANAGED_SERVICE_CONFIG[imageBase];
    const aliasedImage = MANAGED_SERVICE_ALIASES[imageBase];
    if (aliasedImage && MANAGED_SERVICE_CONFIG[aliasedImage]) return MANAGED_SERVICE_CONFIG[aliasedImage];
    // partial match (e.g. "postgres" starts with "postgres")
    for (const [key, cfg] of Object.entries(MANAGED_SERVICE_CONFIG)) {
      if (imageBase.startsWith(key) || key.startsWith(imageBase)) return cfg;
    }
  }
  return undefined;
}

// ===========================================
// MULTI-SERVICE DEPLOYER CLASS
// ===========================================

export class MultiServiceDeployer {
  private docker: Docker;
  private builder: BuilderService;
  private network: string;
  private domain: string;

  constructor(
    network: string = 'zyphron-network',
    domain: string = 'localhost',
    registryUrl: string = 'localhost:5000'
  ) {
    this.docker = new Docker();
    this.builder = getBuilderService(registryUrl);
    this.network = network;
    this.domain = domain;
  }

  // ===========================================
  // MAIN DEPLOY METHOD
  // ===========================================

  async deploy(options: MultiServiceDeployOptions): Promise<MultiServiceDeployResult> {
    const { config, deploymentId, projectId, projectSlug, envVars = {}, onLog, onProgress } = options;
    const startTime = Date.now();
    const results: ServiceDeployResult[] = [];

    const log = (message: string, level: string = 'info', service?: string) => {
      logger.info({ deploymentId, service, message }, message);
      onLog?.(message, level, service);
    };

    try {
      log(`Launch Starting multi-service deployment with ${config.services.length} services`, 'info');

      // Create deployment network
      const networkName = await this.createDeploymentNetwork(deploymentId, projectSlug);
      log(`Network Created network: ${networkName}`, 'info');

      // Build service connection map for environment injection
      const serviceContainerMap: Record<string, string> = {};
      const serviceEnvMap: Record<string, Record<string, string>> = {};

      // Deploy services in dependency order
      for (let i = 0; i < config.services.length; i++) {
        const service = config.services[i];
        const progress = Math.round(((i + 1) / config.services.length) * 100);
        
        onProgress?.(service.name, progress, `Deploying ${service.name}...`);
        log(`Package [${i + 1}/${config.services.length}] Deploying service: ${service.name}`, 'info', service.name);

        const serviceStartTime = Date.now();

        try {
          // Build environment for this service (inject dependencies)
          const serviceEnv = this.buildServiceEnvironment(
            service,
            envVars,
            serviceContainerMap,
            serviceEnvMap
          );

          let result: ServiceDeployResult;

          if (service.type === 'managed') {
            // Deploy managed service (PostgreSQL, Redis, etc.)
            result = await this.deployManagedService(
              service,
              deploymentId,
              projectId,
              projectSlug,
              networkName,
              serviceEnv,
              log
            );
          } else {
            // Build and deploy app service
            result = await this.deployAppService(
              service,
              deploymentId,
              projectId,
              projectSlug,
              networkName,
              serviceEnv,
              config.projectPath,
              log
            );
          }

          result.duration = Date.now() - serviceStartTime;
          results.push(result);

          if (result.success) {
            // Track container name for dependency injection
            serviceContainerMap[service.name] = result.containerName || service.name;
            
            // Track environment variables this service provides
            if (service.type === 'managed') {
              const managedConfig = resolveManagedConfig(service);
              if (managedConfig) {
                serviceEnvMap[service.name] = this.generateConnectionEnv(
                  managedConfig.connectionEnvTemplate,
                  result.containerName || service.name,
                  deploymentId
                );
              }
            }

            log(`Success Service ${service.name} deployed successfully`, 'info', service.name);
            
            // Wait for service to be healthy before proceeding
            if (result.containerId) {
              await this.waitForHealthy(result.containerId, service.name, log);
            }
          } else {
            log(`Error Service ${service.name} failed: ${result.error}`, 'error', service.name);
            
            // Don't fail entire deployment for non-critical services
            if (this.isCriticalService(service, config.services)) {
              throw new Error(`Critical service ${service.name} failed: ${result.error}`);
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.push({
            serviceName: service.name,
            success: false,
            error: errorMessage,
            duration: Date.now() - serviceStartTime,
          });
          
          if (this.isCriticalService(service, config.services)) {
            throw error;
          }
        }
      }

      const totalDuration = Date.now() - startTime;
      const allSuccess = results.every(r => r.success);

      log(`Done Multi-service deployment ${allSuccess ? 'completed' : 'partially completed'} in ${Math.round(totalDuration / 1000)}s`, 'info');

      return {
        success: allSuccess,
        deploymentId,
        projectId,
        services: results,
        networkName,
        totalDuration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown deployment error';
      
      logger.error({ deploymentId, error: errorMessage }, 'Multi-service deployment failed');

      return {
        success: false,
        deploymentId,
        projectId,
        services: results,
        networkName: `zyphron-${projectSlug}-${deploymentId.substring(0, 8)}`,
        totalDuration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  // ===========================================
  // DEPLOY MANAGED SERVICE
  // ===========================================

  private async deployManagedService(
    service: ServiceDefinition,
    deploymentId: string,
    projectId: string,
    projectSlug: string,
    networkName: string,
    envVars: Record<string, string>,
    log: (msg: string, level: string, service?: string) => void
  ): Promise<ServiceDeployResult> {
    const config = resolveManagedConfig(service);

    if (!config) {
      return {
        serviceName: service.name,
        success: false,
        error: `Unknown managed service type: "${service.name}" (image: ${service.image ?? 'none'}). Supported: postgresql, mysql, mongodb, redis, rabbitmq, elasticsearch.`,
        duration: 0,
      };
    }

    const containerName = `zyphron-${projectSlug}-${service.name}-${deploymentId.substring(0, 8)}`;
    const volumePrefix = `zyphron-${projectSlug}-${deploymentId.substring(0, 8)}`;

    log(`Docker Pulling image: ${config.image}`, 'info', service.name);

    try {
      // Pull image
      await this.pullImage(config.image);

      // Prepare environment
      const env = Object.entries({
        ...config.envVars,
        ...envVars,
      }).map(([k, v]) => {
        // Replace placeholders
        const value = v
          .replace(/\${DEPLOYMENT_ID}/g, deploymentId.substring(0, 8))
          .replace(/\${SERVICE_NAME}/g, containerName);
        return `${k}=${value}`;
      });

      // Prepare volumes
      const binds = config.volumes.map(v => 
        `${volumePrefix}-${v.name}:${v.path}`
      );

      // Create container
      const container = await this.docker.createContainer({
        name: containerName,
        Image: config.image,
        Env: env,
        ExposedPorts: {
          [`${config.port}/tcp`]: {},
        },
        HostConfig: {
          NetworkMode: networkName,
          RestartPolicy: { Name: 'unless-stopped' },
          Binds: binds,
        },
        Healthcheck: {
          Test: config.healthCheck.test,
          Interval: config.healthCheck.interval * 1_000_000_000,
          Timeout: config.healthCheck.timeout * 1_000_000_000,
          Retries: config.healthCheck.retries,
          StartPeriod: config.healthCheck.startPeriod * 1_000_000_000,
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

      // Start container
      await container.start();

      log(`Success Managed service ${service.name} started`, 'info', service.name);

      return {
        serviceName: service.name,
        success: true,
        containerId: container.id,
        containerName,
        internalUrl: `${containerName}:${config.port}`,
        port: config.port,
        duration: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        serviceName: service.name,
        success: false,
        error: errorMessage,
        duration: 0,
      };
    }
  }

  // ===========================================
  // DEPLOY APP SERVICE
  // ===========================================

  private async deployAppService(
    service: ServiceDefinition,
    deploymentId: string,
    projectId: string,
    projectSlug: string,
    networkName: string,
    envVars: Record<string, string>,
    projectPath: string,
    log: (msg: string, level: string, service?: string) => void
  ): Promise<ServiceDeployResult> {
    const servicePath = `${projectPath}/${service.path}`.replace(/\/\.$/, '');
    const containerName = `zyphron-${projectSlug}-${service.name}-${deploymentId.substring(0, 8)}`;
    const port = service.port || service.detection?.port || 3000;

    try {
      // Build image
      log(`Build Building image for ${service.name}...`, 'info', service.name);
      
      const buildResult = await this.builder.buildImage({
        projectPath: servicePath,
        deploymentId: `${deploymentId}-${service.name}`,
        projectId: `${projectId}-${service.name}`,
        detection: service.detection!,
        envVars,
        onLog: (msg) => log(msg, 'debug', service.name),
      });

      if (!buildResult.success) {
        return {
          serviceName: service.name,
          success: false,
          error: `Build failed: ${buildResult.error}`,
          duration: buildResult.duration,
        };
      }

      log(`Success Image built: ${buildResult.imageName}:${buildResult.imageTag}`, 'info', service.name);

      // Push to registry
      log(`Push Pushing image to registry...`, 'info', service.name);
      
      const pushResult = await this.builder.pushImage(buildResult.imageName, buildResult.imageTag);
      
      if (!pushResult.success) {
        log(`[WARN] Push failed, using local image: ${pushResult.error}`, 'warn', service.name);
      }

      // Deploy container
      log(`Deploy Deploying container...`, 'info', service.name);

      const fullImageName = `${buildResult.imageName}:${buildResult.imageTag}`;
      
      // Prepare environment
      const env = Object.entries({
        ...envVars,
        NODE_ENV: 'production',
        PORT: port.toString(),
        ZYPHRON_DEPLOYMENT_ID: deploymentId,
        ZYPHRON_PROJECT_ID: projectId,
        ZYPHRON_SERVICE_NAME: service.name,
      }).map(([k, v]) => `${k}=${v}`);

      // Traefik labels for routing
      const traefikLabels: Record<string, string> = {
        'traefik.enable': 'true',
        [`traefik.http.routers.${containerName}.rule`]: 
          service.internalOnly 
            ? `Host(\`${service.name}.internal\`)` 
            : `Host(\`${projectSlug}-${service.name}.${this.domain}\`)`,
        [`traefik.http.routers.${containerName}.entrypoints`]: 'web',
        [`traefik.http.routers.${containerName}.service`]: containerName,
        [`traefik.http.services.${containerName}.loadbalancer.server.port`]: port.toString(),
      };

      // Create container
      const container = await this.docker.createContainer({
        name: containerName,
        Image: fullImageName,
        Env: env,
        ExposedPorts: {
          [`${port}/tcp`]: {},
        },
        HostConfig: {
          NetworkMode: networkName,
          RestartPolicy: { Name: 'unless-stopped' },
          Memory: this.parseMemory(service.resources?.memory || '512m'),
          NanoCpus: this.parseCPU(service.resources?.cpu || '0.5'),
        },
        Healthcheck: service.healthCheck ? {
          Test: ['CMD', 'curl', '-f', `http://localhost:${port}${service.healthCheck.path || '/health'}`],
          Interval: (service.healthCheck.interval || 30) * 1_000_000_000,
          Timeout: (service.healthCheck.timeout || 10) * 1_000_000_000,
          Retries: service.healthCheck.retries || 3,
          StartPeriod: 60_000_000_000,
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

      // Start container
      await container.start();

      const externalUrl = service.internalOnly 
        ? undefined 
        : `http://${projectSlug}-${service.name}.${this.domain}`;
      const internalUrl = `http://${containerName}:${port}`;

      return {
        serviceName: service.name,
        success: true,
        containerId: container.id,
        containerName,
        internalUrl,
        externalUrl,
        port,
        duration: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        serviceName: service.name,
        success: false,
        error: errorMessage,
        duration: 0,
      };
    }
  }

  // ===========================================
  // HELPER METHODS
  // ===========================================

  private async createDeploymentNetwork(deploymentId: string, projectSlug: string): Promise<string> {
    const networkName = `zyphron-${projectSlug}-${deploymentId.substring(0, 8)}`;

    try {
      // Check if network exists
      await this.docker.getNetwork(networkName).inspect();
      logger.debug({ networkName }, 'Network already exists');
    } catch {
      // Create network
      await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        Labels: {
          'zyphron.managed': 'true',
          'zyphron.deployment.id': deploymentId,
        },
      });
      logger.info({ networkName }, 'Created deployment network');
    }

    // Also connect to main zyphron network for Traefik access
    try {
      await this.docker.getNetwork(this.network);
      // We'll connect containers individually after creation
    } catch {
      logger.warn('Main zyphron network not found, containers may not be accessible via Traefik');
    }

    return networkName;
  }

  private buildServiceEnvironment(
    service: ServiceDefinition,
    baseEnvVars: Record<string, string>,
    serviceContainerMap: Record<string, string>,
    serviceEnvMap: Record<string, Record<string, string>>
  ): Record<string, string> {
    const env: Record<string, string> = { ...baseEnvVars };

    // Inject environment from dependencies
    for (const dep of service.dependsOn || []) {
      const depEnv = serviceEnvMap[dep];
      if (depEnv) {
        Object.assign(env, depEnv);
      }

      // Also set SERVICE_NAME variables
      const containerName = serviceContainerMap[dep];
      if (containerName) {
        const upperDep = dep.toUpperCase().replace(/-/g, '_');
        env[`${upperDep}_HOST`] = containerName;
      }
    }

    // Add service-specific environment
    if (service.environment) {
      Object.assign(env, service.environment);
    }

    return env;
  }

  private generateConnectionEnv(
    template: Record<string, string>,
    containerName: string,
    deploymentId: string
  ): Record<string, string> {
    const env: Record<string, string> = {};

    for (const [key, value] of Object.entries(template)) {
      env[key] = value
        .replace(/\${SERVICE_NAME}/g, containerName)
        .replace(/\${DEPLOYMENT_ID}/g, deploymentId.substring(0, 8));
    }

    return env;
  }

  private async pullImage(imageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          reject(err);
          return;
        }

        this.docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  private async waitForHealthy(containerId: string, serviceName: string, log: (msg: string, level: string, service?: string) => void): Promise<void> {
    const maxAttempts = 30;
    const interval = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const container = this.docker.getContainer(containerId);
        const info = await container.inspect();

        const health = info.State.Health;
        if (!health) {
          // No health check configured, assume healthy
          return;
        }

        if (health.Status === 'healthy') {
          log(`Vue Service ${serviceName} is healthy`, 'info', serviceName);
          return;
        }

        if (health.Status === 'unhealthy') {
          throw new Error(`Service ${serviceName} is unhealthy`);
        }

        // Still starting, wait
        await this.sleep(interval);
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        await this.sleep(interval);
      }
    }

    log(`[WARN] Service ${serviceName} health check timed out, continuing anyway`, 'warn', serviceName);
  }

  private isCriticalService(service: ServiceDefinition, allServices: ServiceDefinition[]): boolean {
    // A service is critical if other services depend on it
    return allServices.some(s => s.dependsOn?.includes(service.name));
  }

  private parseMemory(memory: string): number {
    const match = memory.match(/^(\d+)(m|g|k)?$/i);
    if (!match) return 512 * 1024 * 1024; // Default 512MB

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
    const value = parseFloat(cpu);
    return Math.round(value * 1_000_000_000); // Convert to NanoCPUs
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===========================================
  // CLEANUP
  // ===========================================

  async cleanupDeployment(deploymentId: string, projectSlug: string): Promise<void> {
    const prefix = `zyphron-${projectSlug}`;
    const networkName = `${prefix}-${deploymentId.substring(0, 8)}`;

    try {
      // List all containers with this deployment ID
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          label: [`zyphron.deployment.id=${deploymentId}`],
        },
      });

      // Stop and remove containers
      for (const containerInfo of containers) {
        try {
          const container = this.docker.getContainer(containerInfo.Id);
          await container.stop().catch(() => {});
          await container.remove();
          logger.info({ containerId: containerInfo.Id }, 'Removed container');
        } catch (error) {
          logger.warn({ containerId: containerInfo.Id, error }, 'Failed to remove container');
        }
      }

      // Remove network
      try {
        const network = this.docker.getNetwork(networkName);
        await network.remove();
        logger.info({ networkName }, 'Removed network');
      } catch (error) {
        logger.warn({ networkName, error }, 'Failed to remove network');
      }

      // Remove volumes (optional - might want to keep data)
      const volumes = await this.docker.listVolumes({
        filters: {
          name: [`${prefix}-${deploymentId.substring(0, 8)}`],
        },
      });

      for (const volume of volumes.Volumes || []) {
        try {
          await this.docker.getVolume(volume.Name).remove();
          logger.info({ volume: volume.Name }, 'Removed volume');
        } catch (error) {
          logger.warn({ volume: volume.Name, error }, 'Failed to remove volume');
        }
      }
    } catch (error) {
      logger.error({ deploymentId, error }, 'Failed to cleanup deployment');
      throw error;
    }
  }
}

// ===========================================
// SINGLETON EXPORT
// ===========================================

let multiServiceDeployer: MultiServiceDeployer | null = null;

export function getMultiServiceDeployer(
  network?: string,
  domain?: string,
  registryUrl?: string
): MultiServiceDeployer {
  if (!multiServiceDeployer) {
    multiServiceDeployer = new MultiServiceDeployer(network, domain, registryUrl);
  }
  return multiServiceDeployer;
}

export default MultiServiceDeployer;
