// ===========================================
// MULTI-SERVICE DETECTOR
// Detects multiple services in monorepos, docker-compose, or microservice architectures
// ===========================================

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { createLogger } from '../../lib/logger.js';
import { DetectionResult, detectProject } from './index.js';

const logger = createLogger('multi-service-detector');

// ===========================================
// TYPES
// ===========================================

export interface ServiceDefinition {
  name: string;
  path: string;                    // Relative path within repo
  type: 'app' | 'managed' | 'custom';
  detection?: DetectionResult;     // Framework detection result
  
  // Docker/Build config
  dockerfile?: string;
  buildContext?: string;
  image?: string;                  // For managed services like redis:alpine
  
  // Runtime config
  port?: number;
  exposedPort?: number;            // External port for Traefik routing
  internalOnly?: boolean;          // Not exposed externally (like DB)
  
  // Dependencies
  dependsOn?: string[];            // Service names this depends on
  
  // Environment
  environment?: Record<string, string>;
  
  // Health check
  healthCheck?: {
    path?: string;
    command?: string[];
    interval?: number;
    timeout?: number;
    retries?: number;
  };
  
  // Resource limits
  resources?: {
    memory?: string;
    cpu?: string;
  };
  
  // Volumes
  volumes?: {
    name: string;
    path: string;
  }[];
}

export interface MultiServiceConfig {
  projectPath: string;
  detectionSource: 'docker-compose' | 'monorepo' | 'turbo' | 'nx' | 'lerna' | 'pnpm-workspace' | 'single';
  services: ServiceDefinition[];
  networks: string[];
  volumes: string[];
  managedServices: ManagedServiceRequest[];
}

export interface ManagedServiceRequest {
  type: 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'rabbitmq' | 'elasticsearch';
  name: string;
  version?: string;
  config?: Record<string, unknown>;
}

type ManagedServiceType = ManagedServiceRequest['type'];

// ===========================================
// MANAGED SERVICE DEFINITIONS
// ===========================================

const MANAGED_SERVICES: Record<ManagedServiceType, {
  image: string;
  defaultPort: number;
  envTemplate: Record<string, string>;
  healthCheck: { command: string[]; interval: number; timeout: number; retries: number };
  volumes: { name: string; path: string }[];
}> = {
  postgresql: {
    image: 'postgres:16-alpine',
    defaultPort: 5432,
    envTemplate: {
      POSTGRES_USER: '${DB_USER:-zyphron}',
      POSTGRES_PASSWORD: '${DB_PASSWORD:-zyphron_secret}',
      POSTGRES_DB: '${DB_NAME:-app}',
    },
    healthCheck: {
      command: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-zyphron}'],
      interval: 10,
      timeout: 5,
      retries: 5,
    },
    volumes: [{ name: 'postgres_data', path: '/var/lib/postgresql/data' }],
  },
  mysql: {
    image: 'mysql:8',
    defaultPort: 3306,
    envTemplate: {
      MYSQL_ROOT_PASSWORD: '${DB_ROOT_PASSWORD:-root_secret}',
      MYSQL_USER: '${DB_USER:-zyphron}',
      MYSQL_PASSWORD: '${DB_PASSWORD:-zyphron_secret}',
      MYSQL_DATABASE: '${DB_NAME:-app}',
    },
    healthCheck: {
      command: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
      interval: 10,
      timeout: 5,
      retries: 5,
    },
    volumes: [{ name: 'mysql_data', path: '/var/lib/mysql' }],
  },
  mongodb: {
    image: 'mongo:7',
    defaultPort: 27017,
    envTemplate: {
      MONGO_INITDB_ROOT_USERNAME: '${DB_USER:-zyphron}',
      MONGO_INITDB_ROOT_PASSWORD: '${DB_PASSWORD:-zyphron_secret}',
    },
    healthCheck: {
      command: ['CMD', 'mongosh', '--eval', "db.adminCommand('ping')"],
      interval: 10,
      timeout: 5,
      retries: 5,
    },
    volumes: [{ name: 'mongo_data', path: '/data/db' }],
  },
  redis: {
    image: 'redis:7-alpine',
    defaultPort: 6379,
    envTemplate: {},
    healthCheck: {
      command: ['CMD', 'redis-cli', 'ping'],
      interval: 10,
      timeout: 5,
      retries: 5,
    },
    volumes: [{ name: 'redis_data', path: '/data' }],
  },
  rabbitmq: {
    image: 'rabbitmq:3-management-alpine',
    defaultPort: 5672,
    envTemplate: {
      RABBITMQ_DEFAULT_USER: '${RABBITMQ_USER:-zyphron}',
      RABBITMQ_DEFAULT_PASS: '${RABBITMQ_PASSWORD:-zyphron_secret}',
    },
    healthCheck: {
      command: ['CMD', 'rabbitmq-diagnostics', 'check_running'],
      interval: 10,
      timeout: 5,
      retries: 5,
    },
    volumes: [{ name: 'rabbitmq_data', path: '/var/lib/rabbitmq' }],
  },
  elasticsearch: {
    image: 'elasticsearch:8.11.0',
    defaultPort: 9200,
    envTemplate: {
      'discovery.type': 'single-node',
      'xpack.security.enabled': 'false',
      ES_JAVA_OPTS: '-Xms512m -Xmx512m',
    },
    healthCheck: {
      command: ['CMD-SHELL', 'curl -s http://localhost:9200/_cluster/health | grep -vq "\"status\":\"red\""'],
      interval: 10,
      timeout: 5,
      retries: 10,
    },
    volumes: [{ name: 'elasticsearch_data', path: '/usr/share/elasticsearch/data' }],
  },
};

// ===========================================
// MULTI-SERVICE DETECTOR CLASS
// ===========================================

export class MultiServiceDetector {
  
  // ===========================================
  // MAIN DETECTION METHOD
  // ===========================================
  
  async detect(projectPath: string): Promise<MultiServiceConfig> {
    logger.info({ projectPath }, 'Starting multi-service detection');
    
    // Priority order of detection
    // 1. docker-compose.yml (explicit service definitions)
    // 2. Turbo monorepo (turbo.json)
    // 3. Nx workspace (nx.json)
    // 4. Lerna monorepo (lerna.json)
    // 5. pnpm workspace (pnpm-workspace.yaml)
    // 6. Simple monorepo (apps/, packages/, services/ directories)
    // 7. Single service fallback
    
    const dockerComposePath = await this.findDockerCompose(projectPath);
    if (dockerComposePath) {
      logger.info({ dockerComposePath }, 'Found docker-compose.yml');
      return this.parseDockerCompose(projectPath, dockerComposePath);
    }
    
    const turboJson = path.join(projectPath, 'turbo.json');
    if (await this.fileExists(turboJson)) {
      logger.info('Found Turbo monorepo');
      return this.parseTurboMonorepo(projectPath);
    }
    
    const nxJson = path.join(projectPath, 'nx.json');
    if (await this.fileExists(nxJson)) {
      logger.info('Found Nx workspace');
      return this.parseNxWorkspace(projectPath);
    }
    
    const lernaJson = path.join(projectPath, 'lerna.json');
    if (await this.fileExists(lernaJson)) {
      logger.info('Found Lerna monorepo');
      return this.parseLernaMonorepo(projectPath);
    }
    
    const pnpmWorkspace = path.join(projectPath, 'pnpm-workspace.yaml');
    if (await this.fileExists(pnpmWorkspace)) {
      logger.info('Found pnpm workspace');
      return this.parsePnpmWorkspace(projectPath);
    }
    
    // Check for common monorepo directory structures
    const monorepoConfig = await this.detectMonorepoStructure(projectPath);
    if (monorepoConfig) {
      return monorepoConfig;
    }
    
    // Fall back to single service detection
    logger.info('No multi-service config found, falling back to single service');
    return this.detectSingleService(projectPath);
  }
  
  // ===========================================
  // DOCKER COMPOSE PARSING
  // ===========================================
  
  private async findDockerCompose(projectPath: string): Promise<string | null> {
    const candidates = [
      'docker-compose.yml',
      'docker-compose.yaml',
      'compose.yml',
      'compose.yaml',
      'docker-compose.prod.yml',
      'docker-compose.production.yml',
    ];
    
    for (const candidate of candidates) {
      const fullPath = path.join(projectPath, candidate);
      if (await this.fileExists(fullPath)) {
        return fullPath;
      }
    }
    
    return null;
  }
  
  private async parseDockerCompose(projectPath: string, composePath: string): Promise<MultiServiceConfig> {
    const content = await fs.readFile(composePath, 'utf-8');
    const compose = yaml.parse(content);
    
    const services: ServiceDefinition[] = [];
    const managedServices: ManagedServiceRequest[] = [];
    const networks: string[] = [];
    const volumes: string[] = [];
    
    // Parse networks
    if (compose.networks) {
      networks.push(...Object.keys(compose.networks));
    }
    
    // Parse volumes
    if (compose.volumes) {
      volumes.push(...Object.keys(compose.volumes));
    }
    
    // Parse services
    for (const [serviceName, serviceConfig] of Object.entries(compose.services || {})) {
      const config = serviceConfig as Record<string, unknown>;
      
      // Check if it's a managed service (uses standard image)
      const managedType = this.detectManagedService(config.image as string);
      
      if (managedType && !config.build) {
        // It's a managed service
        managedServices.push({
          type: managedType,
          name: serviceName,
          version: this.extractImageVersion(config.image as string),
        });
        
        services.push({
          name: serviceName,
          path: '.',
          type: 'managed',
          image: config.image as string,
          port: MANAGED_SERVICES[managedType]?.defaultPort,
          internalOnly: true,
          dependsOn: (config.depends_on as string[]) || [],
          environment: this.parseEnvironment(config.environment),
          volumes: this.parseVolumes(config.volumes as string[]),
        });
      } else {
        // It's an app service
        const buildConfig = config.build as Record<string, string> | string;
        const buildContext = typeof buildConfig === 'string' 
          ? buildConfig 
          : buildConfig?.context || '.';
        const dockerfile = typeof buildConfig === 'object' 
          ? buildConfig?.dockerfile 
          : undefined;
        
        // Detect the framework for this service
        const servicePath = path.join(projectPath, buildContext);
        let detection: DetectionResult | undefined;
        
        try {
          if (await this.fileExists(servicePath)) {
            detection = await detectProject(servicePath);
          }
        } catch (error) {
          logger.warn({ serviceName, error }, 'Failed to detect framework for service');
        }
        
        const ports = this.parsePorts(config.ports as string[]);
        
        services.push({
          name: serviceName,
          path: buildContext,
          type: dockerfile ? 'custom' : 'app',
          detection,
          dockerfile,
          buildContext,
          port: detection?.port || ports.internal || 3000,
          exposedPort: ports.external,
          internalOnly: !ports.external,
          dependsOn: (config.depends_on as string[]) || [],
          environment: this.parseEnvironment(config.environment),
          healthCheck: this.parseHealthCheck(config.healthcheck as Record<string, unknown>),
          resources: this.parseResources(config.deploy as Record<string, unknown>),
          volumes: this.parseVolumes(config.volumes as string[]),
        });
      }
    }
    
    // Build dependency graph and validate
    this.validateDependencies(services);
    
    return {
      projectPath,
      detectionSource: 'docker-compose',
      services: this.sortByDependencies(services),
      networks: networks.length > 0 ? networks : ['default'],
      volumes,
      managedServices,
    };
  }
  
  // ===========================================
  // TURBO MONOREPO PARSING
  // ===========================================
  
  private async parseTurboMonorepo(projectPath: string): Promise<MultiServiceConfig> {
    const services: ServiceDefinition[] = [];
    const managedServices: ManagedServiceRequest[] = [];
    
    // Read turbo.json for pipeline configuration
    await fs.readFile(path.join(projectPath, 'turbo.json'), 'utf-8');
    
    // Read package.json for workspace configuration
    const packageJson = JSON.parse(await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8'));
    const workspaces = packageJson.workspaces || [];
    
    // Expand workspace globs
    const servicePaths = await this.expandWorkspaceGlobs(projectPath, workspaces);
    
    for (const servicePath of servicePaths) {
      const fullPath = path.join(projectPath, servicePath);
      
      if (!await this.fileExists(path.join(fullPath, 'package.json'))) {
        continue;
      }
      
      const servicePackageJson = JSON.parse(await fs.readFile(path.join(fullPath, 'package.json'), 'utf-8'));
      const serviceName = servicePackageJson.name?.replace(/^@[^/]+\//, '') || path.basename(servicePath);
      
      // Skip non-deployable packages (shared libraries)
      if (this.isSharedPackage(servicePath, servicePackageJson)) {
        logger.debug({ serviceName }, 'Skipping shared package');
        continue;
      }
      
      // Detect framework
      const detection = await detectProject(fullPath);
      
      services.push({
        name: serviceName,
        path: servicePath,
        type: 'app',
        detection,
        buildContext: servicePath,
        port: detection.port,
        exposedPort: detection.port,
        internalOnly: this.isBackendService(serviceName, detection),
        dependsOn: this.inferDependencies(servicePackageJson, services),
        environment: {},
      });
    }
    
    // Detect managed service needs from dependencies
    managedServices.push(...this.detectManagedServiceNeeds(projectPath, services));
    
    return {
      projectPath,
      detectionSource: 'turbo',
      services: this.sortByDependencies(services),
      networks: ['default'],
      volumes: [],
      managedServices,
    };
  }
  
  // ===========================================
  // NX WORKSPACE PARSING
  // ===========================================
  
  private async parseNxWorkspace(projectPath: string): Promise<MultiServiceConfig> {
    const services: ServiceDefinition[] = [];
    const managedServices: ManagedServiceRequest[] = [];
    
    // Try to read workspace.json or project.json files
    let projects: Record<string, { root: string; projectType?: string }> = {};
    
    const workspaceJsonPath = path.join(projectPath, 'workspace.json');
    if (await this.fileExists(workspaceJsonPath)) {
      const workspace = JSON.parse(await fs.readFile(workspaceJsonPath, 'utf-8'));
      projects = workspace.projects || {};
    } else {
      // Scan for project.json files
      projects = await this.scanNxProjects(projectPath);
    }
    
    for (const [projectName, projectConfig] of Object.entries(projects)) {
      const projectRoot = typeof projectConfig === 'string' ? projectConfig : projectConfig.root;
      const fullPath = path.join(projectPath, projectRoot);
      
      // Skip libraries
      if (typeof projectConfig !== 'string' && projectConfig.projectType === 'library') {
        continue;
      }
      
      // Detect framework
      const detection = await detectProject(fullPath);
      
      services.push({
        name: projectName,
        path: projectRoot,
        type: 'app',
        detection,
        buildContext: projectRoot,
        port: detection.port,
        exposedPort: detection.port,
        internalOnly: this.isBackendService(projectName, detection),
        dependsOn: [],
        environment: {},
      });
    }
    
    // Detect managed service needs
    managedServices.push(...this.detectManagedServiceNeeds(projectPath, services));
    
    return {
      projectPath,
      detectionSource: 'nx',
      services: this.sortByDependencies(services),
      networks: ['default'],
      volumes: [],
      managedServices,
    };
  }
  
  // ===========================================
  // LERNA MONOREPO PARSING
  // ===========================================
  
  private async parseLernaMonorepo(projectPath: string): Promise<MultiServiceConfig> {
    const lernaJson = JSON.parse(await fs.readFile(path.join(projectPath, 'lerna.json'), 'utf-8'));
    const packages = lernaJson.packages || ['packages/*'];
    
    return this.parseWorkspacePackages(projectPath, packages, 'lerna');
  }
  
  // ===========================================
  // PNPM WORKSPACE PARSING
  // ===========================================
  
  private async parsePnpmWorkspace(projectPath: string): Promise<MultiServiceConfig> {
    const content = await fs.readFile(path.join(projectPath, 'pnpm-workspace.yaml'), 'utf-8');
    const workspace = yaml.parse(content);
    const packages = workspace.packages || [];
    
    return this.parseWorkspacePackages(projectPath, packages, 'pnpm-workspace');
  }
  
  // ===========================================
  // GENERIC WORKSPACE PARSING
  // ===========================================
  
  private async parseWorkspacePackages(
    projectPath: string, 
    patterns: string[], 
    source: 'lerna' | 'pnpm-workspace'
  ): Promise<MultiServiceConfig> {
    const services: ServiceDefinition[] = [];
    const managedServices: ManagedServiceRequest[] = [];
    
    const servicePaths = await this.expandWorkspaceGlobs(projectPath, patterns);
    
    for (const servicePath of servicePaths) {
      const fullPath = path.join(projectPath, servicePath);
      
      if (!await this.fileExists(path.join(fullPath, 'package.json'))) {
        continue;
      }
      
      const packageJson = JSON.parse(await fs.readFile(path.join(fullPath, 'package.json'), 'utf-8'));
      const serviceName = packageJson.name?.replace(/^@[^/]+\//, '') || path.basename(servicePath);
      
      if (this.isSharedPackage(servicePath, packageJson)) {
        continue;
      }
      
      const detection = await detectProject(fullPath);
      
      services.push({
        name: serviceName,
        path: servicePath,
        type: 'app',
        detection,
        buildContext: servicePath,
        port: detection.port,
        exposedPort: detection.port,
        internalOnly: this.isBackendService(serviceName, detection),
        dependsOn: this.inferDependencies(packageJson, services),
        environment: {},
      });
    }
    
    managedServices.push(...this.detectManagedServiceNeeds(projectPath, services));
    
    return {
      projectPath,
      detectionSource: source,
      services: this.sortByDependencies(services),
      networks: ['default'],
      volumes: [],
      managedServices,
    };
  }
  
  // ===========================================
  // SIMPLE MONOREPO STRUCTURE DETECTION
  // ===========================================
  
  private async detectMonorepoStructure(projectPath: string): Promise<MultiServiceConfig | null> {
    const commonDirs = ['apps', 'packages', 'services', 'microservices', 'modules'];
    const services: ServiceDefinition[] = [];
    const managedServices: ManagedServiceRequest[] = [];
    
    for (const dir of commonDirs) {
      const dirPath = path.join(projectPath, dir);
      
      if (!await this.fileExists(dirPath)) {
        continue;
      }
      
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const servicePath = path.join(dir, entry.name);
        const fullPath = path.join(projectPath, servicePath);
        
        // Check if it's a deployable service
        const hasPackageJson = await this.fileExists(path.join(fullPath, 'package.json'));
        const hasDockerfile = await this.fileExists(path.join(fullPath, 'Dockerfile'));
        const hasRequirements = await this.fileExists(path.join(fullPath, 'requirements.txt'));
        const hasGoMod = await this.fileExists(path.join(fullPath, 'go.mod'));
        
        if (!hasPackageJson && !hasDockerfile && !hasRequirements && !hasGoMod) {
          continue;
        }
        
        const detection = await detectProject(fullPath);
        const serviceName = entry.name;
        
        services.push({
          name: serviceName,
          path: servicePath,
          type: hasDockerfile ? 'custom' : 'app',
          detection,
          dockerfile: hasDockerfile ? 'Dockerfile' : undefined,
          buildContext: servicePath,
          port: detection.port,
          exposedPort: detection.port,
          internalOnly: this.isBackendService(serviceName, detection),
          dependsOn: [],
          environment: {},
        });
      }
    }
    
    if (services.length === 0) {
      return null;
    }
    
    // Also check root for a main app
    const rootDetection = await detectProject(projectPath);
    if (rootDetection.framework !== 'unknown' && services.length > 0) {
      // There's both a root app and subdirectory apps
      // This might be a Next.js app with API routes, etc.
    }
    
    managedServices.push(...this.detectManagedServiceNeeds(projectPath, services));
    
    return {
      projectPath,
      detectionSource: 'monorepo',
      services: this.sortByDependencies(services),
      networks: ['default'],
      volumes: [],
      managedServices,
    };
  }
  
  // ===========================================
  // SINGLE SERVICE FALLBACK
  // ===========================================
  
  private async detectSingleService(projectPath: string): Promise<MultiServiceConfig> {
    const detection = await detectProject(projectPath);
    const managedServices: ManagedServiceRequest[] = [];
    
    // Check for database/cache dependencies
    managedServices.push(...this.detectManagedServiceNeeds(projectPath, []));
    
    const service: ServiceDefinition = {
      name: 'app',
      path: '.',
      type: await this.fileExists(path.join(projectPath, 'Dockerfile')) ? 'custom' : 'app',
      detection,
      buildContext: '.',
      port: detection.port,
      exposedPort: detection.port,
      internalOnly: false,
      dependsOn: managedServices.map(s => s.name),
      environment: {},
    };
    
    return {
      projectPath,
      detectionSource: 'single',
      services: [service],
      networks: ['default'],
      volumes: [],
      managedServices,
    };
  }
  
  // ===========================================
  // HELPER METHODS
  // ===========================================
  
  private detectManagedService(image?: string): keyof typeof MANAGED_SERVICES | null {
    if (!image) return null;
    
    const imageLower = image.toLowerCase();
    
    if (imageLower.includes('postgres')) return 'postgresql';
    if (imageLower.includes('mysql') || imageLower.includes('mariadb')) return 'mysql';
    if (imageLower.includes('mongo')) return 'mongodb';
    if (imageLower.includes('redis')) return 'redis';
    if (imageLower.includes('rabbitmq')) return 'rabbitmq';
    if (imageLower.includes('elasticsearch') || imageLower.includes('elastic')) return 'elasticsearch';
    
    return null;
  }
  
  private extractImageVersion(image: string): string | undefined {
    const parts = image.split(':');
    return parts.length > 1 ? parts[1] : undefined;
  }
  
  private parseEnvironment(env: unknown): Record<string, string> {
    if (!env) return {};
    
    if (Array.isArray(env)) {
      const result: Record<string, string> = {};
      for (const item of env) {
        if (typeof item === 'string' && item.includes('=')) {
          const [key, ...valueParts] = item.split('=');
          result[key] = valueParts.join('=');
        }
      }
      return result;
    }
    
    if (typeof env === 'object') {
      return env as Record<string, string>;
    }
    
    return {};
  }
  
  private parsePorts(ports?: string[]): { internal?: number; external?: number } {
    if (!ports || ports.length === 0) return {};
    
    const firstPort = ports[0];
    if (typeof firstPort !== 'string') return {};
    
    const parts = firstPort.split(':');
    
    if (parts.length === 1) {
      const port = parseInt(parts[0]);
      return { internal: port, external: port };
    }
    
    return {
      external: parseInt(parts[0]),
      internal: parseInt(parts[1]),
    };
  }
  
  private parseHealthCheck(healthcheck?: Record<string, unknown>): ServiceDefinition['healthCheck'] {
    if (!healthcheck) return undefined;
    
    return {
      command: healthcheck.test as string[],
      interval: this.parseDuration(healthcheck.interval as string),
      timeout: this.parseDuration(healthcheck.timeout as string),
      retries: healthcheck.retries as number,
    };
  }
  
  private parseDuration(duration?: string): number | undefined {
    if (!duration) return undefined;
    
    const match = duration.match(/^(\d+)(s|m|h)?$/);
    if (!match) return undefined;
    
    const value = parseInt(match[1]);
    const unit = match[2] || 's';
    
    switch (unit) {
      case 'm': return value * 60;
      case 'h': return value * 3600;
      default: return value;
    }
  }
  
  private parseResources(deploy?: Record<string, unknown>): ServiceDefinition['resources'] {
    if (!deploy?.resources) return undefined;
    
    const resources = deploy.resources as Record<string, Record<string, string>>;
    
    return {
      memory: resources.limits?.memory || resources.reservations?.memory,
      cpu: resources.limits?.cpus || resources.reservations?.cpus,
    };
  }
  
  private parseVolumes(volumes?: string[]): ServiceDefinition['volumes'] {
    if (!volumes) return undefined;
    
    return volumes
      .filter(v => typeof v === 'string')
      .map(v => {
        const parts = v.split(':');
        return {
          name: parts[0],
          path: parts[1] || parts[0],
        };
      });
  }
  
  private async expandWorkspaceGlobs(projectPath: string, patterns: string[]): Promise<string[]> {
    const results: string[] = [];
    
    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        // Simple glob expansion
        const base = pattern.replace(/\/\*.*$/, '');
        const basePath = path.join(projectPath, base);
        
        if (await this.fileExists(basePath)) {
          const entries = await fs.readdir(basePath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              results.push(path.join(base, entry.name));
            }
          }
        }
      } else {
        results.push(pattern);
      }
    }
    
    return results;
  }
  
  private isSharedPackage(servicePath: string, packageJson: Record<string, unknown>): boolean {
    // Skip packages that are clearly shared libraries
    const pathParts = servicePath.toLowerCase().split('/');
    const sharedIndicators = ['shared', 'common', 'utils', 'lib', 'config', 'types', 'ui'];
    
    if (pathParts.some(part => sharedIndicators.includes(part))) {
      return true;
    }
    
    // Skip if no entry point for running
    const scripts = (packageJson.scripts as Record<string, unknown> | undefined) || {};
    if (!packageJson.main && !scripts.start && !scripts.dev) {
      return true;
    }
    
    return false;
  }
  
  private isBackendService(name: string, detection: DetectionResult): boolean {
    const backendIndicators = ['api', 'backend', 'server', 'service', 'worker', 'gateway'];
    const nameLower = name.toLowerCase();
    
    if (backendIndicators.some(indicator => nameLower.includes(indicator))) {
      return true;
    }
    
    // Backend frameworks
    const backendFrameworks = ['express', 'fastify', 'nestjs', 'koa', 'hapi', 'fastapi', 'flask', 'django', 'gin', 'echo'];
    if (backendFrameworks.includes(detection.framework)) {
      return true;
    }
    
    return false;
  }
  
  private inferDependencies(packageJson: Record<string, unknown>, existingServices: ServiceDefinition[]): string[] {
    const deps: string[] = [];
    const allDeps = {
      ...(packageJson.dependencies as Record<string, string> || {}),
      ...(packageJson.devDependencies as Record<string, string> || {}),
    };
    
    // Check for database clients
    if (allDeps['pg'] || allDeps['postgres'] || allDeps['@prisma/client'] || allDeps['typeorm']) {
      deps.push('postgresql');
    }
    if (allDeps['mysql'] || allDeps['mysql2']) {
      deps.push('mysql');
    }
    if (allDeps['mongodb'] || allDeps['mongoose']) {
      deps.push('mongodb');
    }
    if (allDeps['redis'] || allDeps['ioredis']) {
      deps.push('redis');
    }
    if (allDeps['amqplib'] || allDeps['amqp-connection-manager']) {
      deps.push('rabbitmq');
    }
    
    // Check for internal package dependencies
    const scope = (packageJson.name as string)?.match(/^@([^/]+)/)?.[1];
    if (scope) {
      for (const [depName] of Object.entries(allDeps)) {
        if (depName.startsWith(`@${scope}/`)) {
          const internalName = depName.replace(`@${scope}/`, '');
          const matchingService = existingServices.find(s => s.name === internalName);
          if (matchingService) {
            deps.push(internalName);
          }
        }
      }
    }
    
    return [...new Set(deps)];
  }
  
  private detectManagedServiceNeeds(_projectPath: string, services: ServiceDefinition[]): ManagedServiceRequest[] {
    const needs: ManagedServiceRequest[] = [];
    const existingManaged = new Set(services.filter(s => s.type === 'managed').map(s => s.name));
    
    // Collect all dependencies from all services
    const allDependencies = new Set<string>();
    for (const service of services) {
      for (const dep of service.dependsOn || []) {
        allDependencies.add(dep);
      }
    }
    
    // Add managed services for unresolved dependencies
    for (const dep of allDependencies) {
      if (existingManaged.has(dep)) continue;
      if (services.some(s => s.name === dep)) continue;
      
      // Check if it's a managed service type
      if (MANAGED_SERVICES[dep as ManagedServiceType]) {
        needs.push({
          type: dep as ManagedServiceType,
          name: dep,
        });
      }
    }
    
    return needs;
  }
  
  private validateDependencies(services: ServiceDefinition[]): void {
    const serviceNames = new Set(services.map(s => s.name));
    
    for (const service of services) {
      for (const dep of service.dependsOn || []) {
        if (!serviceNames.has(dep) && !MANAGED_SERVICES[dep as ManagedServiceType]) {
          logger.warn({ service: service.name, dependency: dep }, 'Unknown dependency');
        }
      }
    }
  }
  
  private sortByDependencies(services: ServiceDefinition[]): ServiceDefinition[] {
    const sorted: ServiceDefinition[] = [];
    const visited = new Set<string>();
    const serviceMap = new Map(services.map(s => [s.name, s]));
    
    const visit = (service: ServiceDefinition): void => {
      if (visited.has(service.name)) return;
      visited.add(service.name);
      
      for (const dep of service.dependsOn || []) {
        const depService = serviceMap.get(dep);
        if (depService) {
          visit(depService);
        }
      }
      
      sorted.push(service);
    };
    
    // Visit all managed services first
    for (const service of services) {
      if (service.type === 'managed') {
        visit(service);
      }
    }
    
    // Then visit all other services
    for (const service of services) {
      visit(service);
    }
    
    return sorted;
  }
  
  private async scanNxProjects(projectPath: string): Promise<Record<string, { root: string; projectType?: string }>> {
    const projects: Record<string, { root: string; projectType?: string }> = {};
    
    const scanDir = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        
        const fullPath = path.join(dir, entry.name);
        const projectJsonPath = path.join(fullPath, 'project.json');
        
        if (await this.fileExists(projectJsonPath)) {
          const projectJson = JSON.parse(await fs.readFile(projectJsonPath, 'utf-8'));
          const relativePath = path.relative(projectPath, fullPath);
          projects[projectJson.name || entry.name] = {
            root: relativePath,
            projectType: projectJson.projectType,
          };
        } else {
          // Recursively scan subdirectories
          await scanDir(fullPath);
        }
      }
    };
    
    await scanDir(projectPath);
    return projects;
  }
  
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// ===========================================
// SINGLETON EXPORT
// ===========================================

let multiServiceDetector: MultiServiceDetector | null = null;

export function getMultiServiceDetector(): MultiServiceDetector {
  if (!multiServiceDetector) {
    multiServiceDetector = new MultiServiceDetector();
  }
  return multiServiceDetector;
}

export default MultiServiceDetector;
