// ===========================================
// DEPLOYER SERVICE
// Handles container deployment, networking, and reverse proxy configuration
// ===========================================

import Docker from 'dockerode';
import { createLogger } from '../../lib/logger.js';
import { DetectionResult } from '../detector/index.js';

const logger = createLogger('deployer');

// ===========================================
// TYPES
// ===========================================

export interface DeployOptions {
  deploymentId: string;
  projectId: string;
  projectSlug: string;
  imageName: string;
  imageTag: string;
  envVars?: Record<string, string>;
  port?: number;
  replicas?: number;
  memory?: string; // e.g., "512m"
  cpu?: string;    // e.g., "0.5"
  healthCheck?: HealthCheckConfig;
  detection?: DetectionResult;
}

export interface HealthCheckConfig {
  path: string;
  interval: number;     // seconds
  timeout: number;      // seconds
  retries: number;
  startPeriod: number;  // seconds
}

export interface DeployResult {
  success: boolean;
  containerId?: string;
  containerName: string;
  internalUrl?: string;
  externalUrl?: string;
  port?: number;
  error?: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: Array<{ internal: number; external?: number }>;
  created: Date;
  health?: string;
}

// ===========================================
// DEPLOYER SERVICE CLASS
// ===========================================

export class DeployerService {
  private docker: Docker;
  private network: string;
  private domain: string;

  constructor(
    network: string = 'zyphron-network',
    domain: string = 'localhost'
  ) {
    this.docker = new Docker();
    this.network = network;
    this.domain = domain;
  }

  // ===========================================
  // DEPLOY CONTAINER
  // ===========================================

  async deploy(options: DeployOptions): Promise<DeployResult> {
    const {
      deploymentId,
      projectId,
      projectSlug,
      imageName,
      imageTag,
      envVars = {},
      port = 3000,
      memory = '512m',
      cpu = '0.5',
      healthCheck,
    } = options;

    const containerName = `zyphron-${projectSlug}-${deploymentId.substring(0, 8)}`;
    const fullImageName = `${imageName}:${imageTag}`;

    logger.info({
      deploymentId,
      containerName,
      imageName: fullImageName,
    }, 'Starting deployment');

    try {
      // Ensure network exists
      await this.ensureNetwork();

      // Stop and remove any existing container with same name
      await this.removeContainer(containerName);

      // Prepare environment variables
      const env = Object.entries({
        ...envVars,
        NODE_ENV: 'production',
        PORT: port.toString(),
        ZYPHRON_DEPLOYMENT_ID: deploymentId,
        ZYPHRON_PROJECT_ID: projectId,
      }).map(([k, v]) => `${k}=${v}`);

      // Health check configuration
      const healthCheckConfig = healthCheck ? {
        Test: ['CMD', 'curl', '-f', `http://localhost:${port}${healthCheck.path}`],
        Interval: healthCheck.interval * 1_000_000_000,  // nanoseconds
        Timeout: healthCheck.timeout * 1_000_000_000,
        Retries: healthCheck.retries,
        StartPeriod: healthCheck.startPeriod * 1_000_000_000,
      } : undefined;

      // Create container
      const container = await this.docker.createContainer({
        name: containerName,
        Image: fullImageName,
        Env: env,
        ExposedPorts: {
          [`${port}/tcp`]: {},
        },
        HostConfig: {
          NetworkMode: this.network,
          RestartPolicy: {
            Name: 'unless-stopped',
          },
          Memory: this.parseMemory(memory),
          NanoCpus: this.parseCPU(cpu),
          PortBindings: {
            [`${port}/tcp`]: [{ HostPort: '0' }], // Dynamic port assignment
          },
        },
        Healthcheck: healthCheckConfig,
        Labels: {
          'zyphron.managed': 'true',
          'zyphron.project.id': projectId,
          'zyphron.project.slug': projectSlug,
          'zyphron.deployment.id': deploymentId,
          // Traefik labels for reverse proxy
          'traefik.enable': 'true',
          [`traefik.http.routers.${containerName}.rule`]: `Host(\`${projectSlug}.${this.domain}\`)`,
          [`traefik.http.routers.${containerName}.entrypoints`]: 'web',
          [`traefik.http.routers.${containerName}.service`]: containerName,
          [`traefik.http.services.${containerName}.loadbalancer.server.port`]: port.toString(),
        },
      });

      // Start the container
      await container.start();

      // Get container info for the assigned port
      const containerInfo = await container.inspect();
      const assignedPort = this.getAssignedPort(containerInfo, port);

      const internalUrl = `http://${containerName}:${port}`;
      const externalUrl = `http://${projectSlug}.${this.domain}`;

      logger.info({
        deploymentId,
        containerId: container.id,
        containerName,
        internalUrl,
        externalUrl,
        assignedPort,
      }, 'Deployment successful');

      return {
        success: true,
        containerId: container.id,
        containerName,
        internalUrl,
        externalUrl,
        port: assignedPort,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown deployment error';
      
      logger.error({
        deploymentId,
        containerName,
        error: errorMessage,
      }, 'Deployment failed');

      return {
        success: false,
        containerName,
        error: errorMessage,
      };
    }
  }

  // ===========================================
  // STOP DEPLOYMENT
  // ===========================================

  async stop(containerNameOrId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerNameOrId);
      await container.stop({ t: 10 }); // 10 second timeout
      logger.info({ container: containerNameOrId }, 'Container stopped');
      return true;
    } catch (error) {
      logger.warn({ container: containerNameOrId, error }, 'Failed to stop container');
      return false;
    }
  }

  // ===========================================
  // REMOVE CONTAINER
  // ===========================================

  async removeContainer(containerNameOrId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerNameOrId);
      
      // Try to stop first
      try {
        await container.stop({ t: 5 });
      } catch {
        // Container might already be stopped
      }

      await container.remove({ force: true, v: true });
      logger.info({ container: containerNameOrId }, 'Container removed');
      return true;
    } catch (error) {
      // Container doesn't exist, that's fine
      return false;
    }
  }

  // ===========================================
  // RESTART CONTAINER
  // ===========================================

  async restart(containerNameOrId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(containerNameOrId);
      await container.restart({ t: 10 });
      logger.info({ container: containerNameOrId }, 'Container restarted');
      return true;
    } catch (error) {
      logger.error({ container: containerNameOrId, error }, 'Failed to restart container');
      return false;
    }
  }

  // ===========================================
  // GET CONTAINER LOGS
  // ===========================================

  async getLogs(
    containerNameOrId: string,
    options: { tail?: number; since?: number; follow?: boolean } = {}
  ): Promise<string> {
    try {
      const container = this.docker.getContainer(containerNameOrId);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: options.tail || 100,
        since: options.since || 0,
        follow: false, // Always false for this method
      });

      // Convert buffer to string
      if (Buffer.isBuffer(logs)) {
        return logs.toString('utf-8');
      }
      return logs as unknown as string;
    } catch (error) {
      logger.error({ container: containerNameOrId, error }, 'Failed to get logs');
      return '';
    }
  }

  // ===========================================
  // STREAM CONTAINER LOGS
  // ===========================================

  async streamLogs(
    containerNameOrId: string,
    onLog: (log: string) => void
  ): Promise<() => void> {
    try {
      const container = this.docker.getContainer(containerNameOrId);
      const stream = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        tail: 100,
      }) as NodeJS.ReadableStream;

      stream.on('data', (chunk: Buffer) => {
        // Docker stream has 8-byte header, skip it for each log entry
        const log = chunk.toString('utf-8').substring(8);
        if (log.trim()) {
          onLog(log);
        }
      });

      return () => {
        stream.destroy();
      };
    } catch (error) {
      logger.error({ container: containerNameOrId, error }, 'Failed to stream logs');
      return () => {};
    }
  }

  // ===========================================
  // LIST CONTAINERS
  // ===========================================

  async listContainers(projectId?: string): Promise<ContainerInfo[]> {
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          label: projectId 
            ? [`zyphron.project.id=${projectId}`]
            : ['zyphron.managed=true'],
        },
      });

      return containers.map((c): ContainerInfo => ({
        id: c.Id,
        name: c.Names[0]?.replace(/^\//, '') || '',
        image: c.Image,
        status: c.Status,
        state: c.State,
        ports: c.Ports.map(p => ({
          internal: p.PrivatePort,
          external: p.PublicPort,
        })),
        created: new Date(c.Created * 1000),
        health: c.Status.includes('healthy') ? 'healthy' 
              : c.Status.includes('unhealthy') ? 'unhealthy'
              : c.Status.includes('starting') ? 'starting'
              : undefined,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to list containers');
      return [];
    }
  }

  // ===========================================
  // GET CONTAINER INFO
  // ===========================================

  async getContainerInfo(containerNameOrId: string): Promise<ContainerInfo | null> {
    try {
      const container = this.docker.getContainer(containerNameOrId);
      const info = await container.inspect();

      return {
        id: info.Id,
        name: info.Name.replace(/^\//, ''),
        image: info.Config.Image,
        status: info.State.Status,
        state: info.State.Running ? 'running' : 'stopped',
        ports: Object.entries(info.NetworkSettings.Ports || {}).map(([port, bindings]) => ({
          internal: parseInt(port.split('/')[0]),
          external: bindings?.[0]?.HostPort ? parseInt(bindings[0].HostPort) : undefined,
        })),
        created: new Date(info.Created),
        health: info.State.Health?.Status,
      };
    } catch (error) {
      logger.error({ container: containerNameOrId, error }, 'Failed to get container info');
      return null;
    }
  }

  // ===========================================
  // GET CONTAINER STATS
  // ===========================================

  async getContainerStats(containerNameOrId: string): Promise<{
    cpu: number;
    memory: { used: number; limit: number; percent: number };
  } | null> {
    try {
      const container = this.docker.getContainer(containerNameOrId);
      const stats = await container.stats({ stream: false });

      // Calculate CPU percentage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

      // Calculate memory
      const memUsed = stats.memory_stats.usage || 0;
      const memLimit = stats.memory_stats.limit || 0;
      const memPercent = memLimit > 0 ? (memUsed / memLimit) * 100 : 0;

      return {
        cpu: Math.round(cpuPercent * 100) / 100,
        memory: {
          used: memUsed,
          limit: memLimit,
          percent: Math.round(memPercent * 100) / 100,
        },
      };
    } catch (error) {
      logger.error({ container: containerNameOrId, error }, 'Failed to get container stats');
      return null;
    }
  }

  // ===========================================
  // EXECUTE COMMAND IN CONTAINER
  // ===========================================

  async exec(
    containerNameOrId: string,
    command: string[]
  ): Promise<{ exitCode: number; output: string }> {
    try {
      const container = this.docker.getContainer(containerNameOrId);
      
      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });
      
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf-8');
      });

      await new Promise((resolve) => stream.on('end', resolve));

      const inspect = await exec.inspect();

      return {
        exitCode: inspect.ExitCode || 0,
        output: output.trim(),
      };
    } catch (error) {
      logger.error({ container: containerNameOrId, command, error }, 'Failed to exec');
      return {
        exitCode: 1,
        output: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================
  // SCALE DEPLOYMENT
  // ===========================================

  async scale(
    projectSlug: string,
    replicas: number,
    options: Omit<DeployOptions, 'deploymentId'>
  ): Promise<string[]> {
    const containerIds: string[] = [];

    // For now, just deploy multiple containers with different names
    // In production, you'd use Docker Swarm or Kubernetes
    for (let i = 0; i < replicas; i++) {
      const result = await this.deploy({
        ...options,
        deploymentId: `${options.projectId}-replica-${i}`,
        projectSlug: `${projectSlug}-${i}`,
      });

      if (result.success && result.containerId) {
        containerIds.push(result.containerId);
      }
    }

    return containerIds;
  }

  // ===========================================
  // PRIVATE HELPERS
  // ===========================================

  private async ensureNetwork(): Promise<void> {
    try {
      await this.docker.getNetwork(this.network).inspect();
    } catch {
      // Network doesn't exist, create it
      logger.info({ network: this.network }, 'Creating network');
      await this.docker.createNetwork({
        Name: this.network,
        Driver: 'bridge',
        CheckDuplicate: true,
      });
    }
  }

  private parseMemory(memory: string): number {
    const match = memory.match(/^(\d+)([gmk]?)$/i);
    if (!match) return 512 * 1024 * 1024; // Default 512MB

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'g': return value * 1024 * 1024 * 1024;
      case 'm': return value * 1024 * 1024;
      case 'k': return value * 1024;
      default: return value;
    }
  }

  private parseCPU(cpu: string): number {
    const value = parseFloat(cpu);
    return Math.floor(value * 1_000_000_000); // Convert to nanoseconds
  }

  private getAssignedPort(containerInfo: Docker.ContainerInspectInfo, internalPort: number): number | undefined {
    const portKey = `${internalPort}/tcp`;
    const bindings = containerInfo.NetworkSettings.Ports[portKey];
    
    if (bindings && bindings.length > 0) {
      return parseInt(bindings[0].HostPort);
    }
    
    return undefined;
  }

  // ===========================================
  // CLEANUP OLD DEPLOYMENTS
  // ===========================================

  async cleanupOldDeployments(projectId: string, keepLast: number = 3): Promise<number> {
    const containers = await this.listContainers(projectId);
    
    // Sort by creation date, newest first
    const sorted = containers.sort((a, b) => b.created.getTime() - a.created.getTime());
    
    // Remove old containers
    const toRemove = sorted.slice(keepLast);
    let removed = 0;

    for (const container of toRemove) {
      if (await this.removeContainer(container.id)) {
        removed++;
      }
    }

    if (removed > 0) {
      logger.info({ projectId, removed }, 'Cleaned up old deployments');
    }

    return removed;
  }
}

// ===========================================
// SINGLETON
// ===========================================

let deployerServiceInstance: DeployerService | null = null;

export function getDeployerService(network?: string, domain?: string): DeployerService {
  if (!deployerServiceInstance) {
    deployerServiceInstance = new DeployerService(network, domain);
  }
  return deployerServiceInstance;
}

export default DeployerService;
