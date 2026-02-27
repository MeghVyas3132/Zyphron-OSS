// ===========================================
// ZYPHRON WORKER ENTRY POINT
// ===========================================

import { createLogger } from './lib/logger.js';
import { config } from './config/index.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { createConsumer, disconnectKafka, TOPICS } from './lib/kafka.js';
import { prisma } from './lib/prisma.js';
import { Consumer } from 'kafkajs';

// Import deployment services
import { detectProject } from './services/detector/index.js';
import { getGitService } from './services/git/index.js';
import { getBuilderService } from './services/builder/index.js';
import { getDeployerService } from './services/deployer/index.js';
import { getBuildLogPublisher } from './routes/ws.js';

// Multi-service deployment
import { getMultiServiceDetector, MultiServiceConfig } from './services/detector/multi-service.js';
import { ParallelMultiServiceDeployer } from './services/deployer/parallel.js';

const logger = createLogger('worker');

// Store consumers for cleanup
const consumers: Consumer[] = [];

// Initialize services
const gitService = getGitService('/tmp/zyphron/repos');
const builderService = getBuilderService(config.docker.registry || 'localhost:5000');
const deployerService = getDeployerService('zyphron-network', config.deployment.baseDomain || 'localhost');
const logPublisher = getBuildLogPublisher();

// Multi-service deployer
const multiServiceDetector = getMultiServiceDetector();
const parallelDeployer = new ParallelMultiServiceDeployer(
  'zyphron-network',
  config.deployment.baseDomain || 'localhost',
  config.docker.registry || 'localhost:5000'
);

// ===========================================
// DEPLOYMENT EVENT HANDLER
// ===========================================

interface DeploymentEvent {
  eventType: string;
  type?: string; // Legacy support
  deploymentId: string;
  buildId?: string;
  projectId?: string;
  userId?: string;
  environment?: string;
  branch?: string;
  commitSha?: string;
  timestamp: string;
  data?: {
    deploymentId: string;
    projectId: string;
    userId?: string;
    environment?: string;
    branch?: string;
    repositoryUrl?: string;
  };
}

async function handleDeploymentEvent(topic: string, message: unknown): Promise<void> {
  const event = message as DeploymentEvent;
  const eventType = event.eventType || event.type; // Support both formats
  
  // Extract project info from nested data if present
  const projectId = event.projectId || event.data?.projectId;
  const deploymentId = event.deploymentId || event.data?.deploymentId;
  
  logger.info({
    topic,
    eventType,
    deploymentId,
    projectId,
  }, 'Processing deployment event');

  try {
    switch (eventType) {
      case 'DEPLOYMENT_CREATED':
        await handleDeploymentCreated(event);
        break;

      case 'DEPLOYMENT_CANCELLED':
        await handleDeploymentCancelled(event);
        break;

      case 'BUILD_COMPLETED':
        await handleBuildCompleted(event);
        break;

      case 'DEPLOYMENT_ROLLBACK':
        await handleDeploymentRollback(event);
        break;

      default:
        logger.warn({ eventType }, 'Unknown deployment event type');
    }
  } catch (error) {
    logger.error({ error, event }, 'Error processing deployment event');
    
    // Update deployment status to failed
    if (event.deploymentId) {
      await prisma.deployment.update({
        where: { id: event.deploymentId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      });
    }
  }
}

async function handleDeploymentCreated(event: DeploymentEvent): Promise<void> {
  // Extract values from event, supporting nested data structure
  const deploymentId = event.deploymentId || event.data?.deploymentId;
  const projectId = event.data?.projectId || (event as unknown as { projectId?: string }).projectId;
  const branch = event.data?.branch || (event as unknown as { branch?: string }).branch;
  
  if (!deploymentId || !projectId) {
    logger.error({ event }, 'Missing deploymentId or projectId in event');
    throw new Error('Missing deploymentId or projectId');
  }

  logger.info({ deploymentId, projectId }, 'Starting deployment build');

  const startTime = Date.now();

  // Helper to publish logs
  const publishLog = async (message: string, level: 'info' | 'warn' | 'error' = 'info', step?: string, progress?: number) => {
    await logPublisher.publishLog(deploymentId, { level, message, step, progress });
  };

  // Publish initial status
  await logPublisher.publishStatus(deploymentId, { status: 'BUILDING', message: 'Starting build...' });
  await publishLog('🚀 Deployment started', 'info', 'init', 0);

  // Update deployment status to BUILDING
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { 
      status: 'BUILDING',
      startedAt: new Date(),
    },
  });

  // Get project details
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      envVariables: true,
    },
  });

  if (!project) {
    await publishLog(`❌ Project ${projectId} not found`, 'error');
    throw new Error(`Project ${projectId} not found`);
  }

  // Prepare environment variables
  const envVars: Record<string, string> = {};
  for (const envVar of project.envVariables) {
    envVars[envVar.key] = envVar.value;
  }

  try {
    // =============================================
    // STEP 1: Clone Repository
    // =============================================
    await publishLog(`📦 Cloning repository: ${project.repositoryUrl}`, 'info', 'clone', 10);
    logger.info({ deploymentId, repoUrl: project.repositoryUrl }, 'Cloning repository');

    const cloneResult = await gitService.cloneRepository(
      project.repositoryUrl,
      deploymentId,
      branch || project.branch || 'main',
      undefined // TODO: Add git token support
    );

    if (!cloneResult.success) {
      await publishLog(`❌ Failed to clone: ${cloneResult.error}`, 'error', 'clone');
      throw new Error(`Failed to clone repository: ${cloneResult.error}`);
    }

    await publishLog(`✅ Cloned commit ${cloneResult.commitHash.substring(0, 7)} (${cloneResult.branch})`, 'info', 'clone', 20);

    logger.info({
      deploymentId,
      commitHash: cloneResult.commitHash.substring(0, 7),
      branch: cloneResult.branch,
    }, 'Repository cloned successfully');

    // Update deployment with commit info
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        commitSha: cloneResult.commitHash,
        commitMessage: cloneResult.commitMessage,
        commitAuthor: cloneResult.author,
        branch: cloneResult.branch,
      },
    });

    // =============================================
    // STEP 2: Detect Multi-Service Project
    // =============================================
    await publishLog('🔍 Analyzing project structure...', 'info', 'detect', 22);
    
    const multiServiceConfig = await multiServiceDetector.detect(cloneResult.path);
    
    // Check if this is a multi-service project (more than 1 service)
    const isMultiService = multiServiceConfig.services.length > 1 || 
                          multiServiceConfig.managedServices.length > 0 ||
                          multiServiceConfig.detectionSource !== 'single';
    
    if (isMultiService) {
      // Route to multi-service deployment
      await handleMultiServiceDeployment(
        event,
        project,
        cloneResult,
        multiServiceConfig,
        envVars,
        startTime,
        publishLog
      );
      return; // Multi-service handler takes over
    }

    // =============================================
    // STEP 3: Detect Project Framework (Single Service)
    // =============================================
    await publishLog('🔍 Detecting project framework...', 'info', 'detect', 25);
    logger.info({ deploymentId }, 'Detecting project framework');

    const detection = await detectProject(cloneResult.path);

    await publishLog(`✅ Detected: ${detection.framework} (${detection.language}) - confidence: ${detection.confidence}%`, 'info', 'detect', 30);

    logger.info({
      deploymentId,
      framework: detection.framework,
      language: detection.language,
      packageManager: detection.packageManager,
      confidence: detection.confidence,
    }, 'Project detected');

    // =============================================
    // STEP 3: Build Docker Image
    // =============================================
    await publishLog(`🔨 Building Docker image for ${detection.framework}...`, 'info', 'build', 35);
    logger.info({ deploymentId, framework: detection.framework }, 'Building Docker image');

    const buildLogs: string[] = [];
    const buildResult = await builderService.buildImage({
      projectPath: cloneResult.path,
      deploymentId,
      projectId,
      detection,
      envVars,
      onLog: async (log) => {
        buildLogs.push(log);
        await publishLog(log, 'info', 'build');
        logger.debug({ deploymentId, log }, 'Build log');
      },
    });

    if (!buildResult.success) {
      await publishLog(`❌ Build failed: ${buildResult.error}`, 'error', 'build');
      // Update deployment with build logs before failing
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          buildLogs: buildLogs.join('\n'),
        },
      });
      throw new Error(`Build failed: ${buildResult.error}`);
    }

    await publishLog(`✅ Build completed in ${Math.round(buildResult.duration / 1000)}s`, 'info', 'build', 70);

    logger.info({
      deploymentId,
      imageId: buildResult.imageId,
      duration: buildResult.duration,
    }, 'Docker image built successfully');

    // Update deployment with build info
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        imageTag: `${buildResult.imageName}:${buildResult.imageTag}`,
        buildLogs: buildResult.buildLogs.join('\n'),
        buildDuration: Math.round(buildResult.duration / 1000),
      },
    });

    // =============================================
    // STEP 4: Push Image to Registry
    // =============================================
    await publishLog('📤 Pushing image to registry...', 'info', 'push', 75);
    logger.info({ deploymentId }, 'Pushing image to registry');

    const pushResult = await builderService.pushImage(
      buildResult.imageName,
      buildResult.imageTag
    );

    if (!pushResult.success) {
      await publishLog(`⚠️ Push failed, using local image: ${pushResult.error}`, 'warn', 'push');
      logger.warn({ deploymentId, error: pushResult.error }, 'Failed to push image, continuing with local image');
    } else {
      await publishLog('✅ Image pushed to registry', 'info', 'push', 80);
    }

    // =============================================
    // STEP 5: Deploy Container
    // =============================================
    await publishLog('🚢 Deploying container...', 'info', 'deploy', 85);
    await logPublisher.publishStatus(deploymentId, { status: 'DEPLOYING', message: 'Starting container...' });
    
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'DEPLOYING' },
    });

    logger.info({ deploymentId }, 'Deploying container');

    const deployStartTime = Date.now();
    const deployResult = await deployerService.deploy({
      deploymentId,
      projectId,
      projectSlug: project.slug,
      imageName: buildResult.imageName,
      imageTag: buildResult.imageTag,
      envVars,
      port: detection.port,
      detection,
      healthCheck: {
        path: '/health',
        interval: 30,
        timeout: 10,
        retries: 3,
        startPeriod: 60,
      },
    });
    const deployDuration = Math.round((Date.now() - deployStartTime) / 1000);

    if (!deployResult.success) {
      await publishLog(`❌ Deployment failed: ${deployResult.error}`, 'error', 'deploy');
      throw new Error(`Deployment failed: ${deployResult.error}`);
    }

    await publishLog(`✅ Container deployed in ${deployDuration}s`, 'info', 'deploy', 95);

    logger.info({
      deploymentId,
      containerId: deployResult.containerId,
      internalUrl: deployResult.internalUrl,
      externalUrl: deployResult.externalUrl,
    }, 'Container deployed successfully');

    // =============================================
    // STEP 6: Cleanup and Finalize
    // =============================================
    await publishLog('🧹 Cleaning up...', 'info', 'cleanup', 98);

    // Cleanup cloned repository
    await gitService.cleanup(deploymentId);

    // Cleanup old deployments for this project (keep last 3)
    await deployerService.cleanupOldDeployments(projectId, 3);

    // Update deployment to LIVE
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'LIVE',
        url: deployResult.externalUrl,  // Update with actual deployed URL
        completedAt: new Date(),
        deployDuration,
        metadata: {
          containerId: deployResult.containerId,
          containerName: deployResult.containerName,
          internalUrl: deployResult.internalUrl,
          externalUrl: deployResult.externalUrl,
          port: deployResult.port,
          framework: detection.framework,
          language: detection.language,
        },
      },
    });

    const totalDuration = Date.now() - startTime;
    
    // Final success messages
    await publishLog(`🎉 Deployment complete! URL: ${deployResult.externalUrl}`, 'info', 'complete', 100);
    await logPublisher.publishStatus(deploymentId, {
      status: 'LIVE',
      message: 'Deployment successful',
      url: deployResult.externalUrl,
      containerId: deployResult.containerId,
    });
    await logPublisher.publishProjectEvent(projectId, {
      type: 'deployment_completed',
      deploymentId,
      message: `Deployment completed in ${Math.round(totalDuration / 1000)}s`,
      metadata: { url: deployResult.externalUrl },
    });

    logger.info({
      deploymentId,
      projectId,
      duration: totalDuration,
      url: deployResult.externalUrl,
    }, 'Deployment completed successfully');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error({
      deploymentId,
      projectId,
      error: errorMessage,
    }, 'Deployment failed');

    // Publish failure status
    await logPublisher.publishStatus(deploymentId, { status: 'FAILED', message: errorMessage });
    await logPublisher.publishProjectEvent(projectId, {
      type: 'deployment_failed',
      deploymentId,
      message: errorMessage,
    });

    // Update deployment status to FAILED
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage,
      },
    });

    // Cleanup cloned repository on failure
    await gitService.cleanup(deploymentId);

    throw error; // Re-throw to be handled by parent
  }
}

async function handleDeploymentCancelled(event: DeploymentEvent): Promise<void> {
  const { deploymentId } = event;

  logger.info({ deploymentId }, 'Processing deployment cancellation');

  // TODO: Implement actual cancellation logic
  // 1. Stop running build process
  // 2. Clean up any partial resources

  logger.info({ deploymentId }, 'Deployment cancellation processed');
}

// ===========================================
// MULTI-SERVICE DEPLOYMENT HANDLER
// ===========================================

interface CloneResult {
  success: boolean;
  path: string;
  commitHash: string;
  commitMessage: string;
  author: string;
  branch: string;
  error?: string;
}

interface ProjectWithEnv {
  id: string;
  slug: string;
  repositoryUrl: string;
  branch?: string | null;
  memoryLimit?: string | null;
  cpuLimit?: string | null;
  envVariables: Array<{ key: string; value: string }>;
}

async function handleMultiServiceDeployment(
  event: DeploymentEvent,
  project: ProjectWithEnv,
  _cloneResult: CloneResult, // Clone path used by detector
  multiServiceConfig: MultiServiceConfig,
  envVars: Record<string, string>,
  startTime: number,
  publishLog: (message: string, level?: 'info' | 'warn' | 'error', step?: string, progress?: number) => Promise<void>
): Promise<void> {
  const { deploymentId, projectId } = event;

  logger.info({
    deploymentId,
    projectId,
    services: multiServiceConfig.services.length,
    managedServices: multiServiceConfig.managedServices.length,
    detectionSource: multiServiceConfig.detectionSource,
  }, 'Starting multi-service deployment');

  await publishLog(
    `🎯 Detected multi-service project (${multiServiceConfig.detectionSource}): ${multiServiceConfig.services.length} app services, ${multiServiceConfig.managedServices.length} managed services`,
    'info',
    'detect',
    25
  );

  // Update project as multi-service
  await prisma.project.update({
    where: { id: projectId },
    data: {
      isMultiService: true,
      serviceDetectionSource: multiServiceConfig.detectionSource,
    },
  });

  // List all detected services
  for (const service of multiServiceConfig.services) {
    await publishLog(
      `  📦 ${service.name} (${service.type}) - port ${service.port || 'auto'}${service.dependsOn?.length ? ` → depends on: ${service.dependsOn.join(', ')}` : ''}`,
      'info',
      'detect'
    );
  }

  for (const managed of multiServiceConfig.managedServices) {
    await publishLog(`  🗄️ ${managed.name} (${managed.type})`, 'info', 'detect');
  }

  // Set up parallel deployer event listeners
  // Events emit objects with known properties
  parallelDeployer.on('phase', async (...args: unknown[]) => {
    const data = args[0] as { phase: string; message: string };
    await publishLog(`📍 ${data.message}`, 'info', data.phase);
  });

  parallelDeployer.on('service:build:start', async (...args: unknown[]) => {
    const data = args[0] as { service: string };
    await publishLog(`🔨 Building ${data.service}...`, 'info', 'build');
  });

  parallelDeployer.on('service:build:complete', async (...args: unknown[]) => {
    const data = args[0] as { service: string; duration: number };
    await publishLog(`✅ ${data.service} built in ${Math.round(data.duration / 1000)}s`, 'info', 'build');
  });

  parallelDeployer.on('service:build:failed', async (...args: unknown[]) => {
    const data = args[0] as { service: string; error: string };
    await publishLog(`❌ ${data.service} build failed: ${data.error}`, 'error', 'build');
  });

  parallelDeployer.on('service:deploy:start', async (...args: unknown[]) => {
    const data = args[0] as { service: string };
    await publishLog(`🚢 Deploying ${data.service}...`, 'info', 'deploy');
  });

  parallelDeployer.on('service:deploy:complete', async (...args: unknown[]) => {
    const data = args[0] as { service: string; externalUrl?: string };
    await publishLog(
      `✅ ${data.service} deployed${data.externalUrl ? `: ${data.externalUrl}` : ''}`,
      'info',
      'deploy'
    );
  });

  parallelDeployer.on('service:deploy:failed', async (...args: unknown[]) => {
    const data = args[0] as { service: string; error: string };
    await publishLog(`❌ ${data.service} deploy failed: ${data.error}`, 'error', 'deploy');
  });

  // Execute parallel deployment
  await publishLog('🚀 Starting parallel deployment...', 'info', 'deploy', 30);
  await logPublisher.publishStatus(deploymentId, {
    status: 'BUILDING',
    message: 'Building services in parallel...',
  });

  try {
    const result = await parallelDeployer.deploy({
      config: multiServiceConfig,
      deploymentId,
      projectId,
      projectSlug: project.slug,
      envVars,
      maxConcurrentBuilds: 4,  // Build up to 4 services in parallel
      maxConcurrentDeploys: 6, // Deploy up to 6 containers in parallel
    });

    if (!result.success) {
      const failedServices = result.services.filter(s => s.status === 'failed');
      const errorMsg = failedServices.map(s => `${s.name}: ${s.error}`).join('; ');
      throw new Error(`Multi-service deployment failed: ${errorMsg}`);
    }

    // Deployment succeeded - update database
    const totalDuration = Date.now() - startTime;

    // Find the primary service (first exposed service)
    const primaryService = result.services.find(s => s.externalUrl) || result.services[0];
    const primaryUrl = primaryService?.externalUrl || `http://${project.slug}.${config.deployment.baseDomain}`;

    // Update deployment status
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'LIVE',
        url: primaryUrl,
        completedAt: new Date(),
        buildDuration: Math.round(result.totalBuildTime / 1000),
        deployDuration: Math.round(result.totalDeployTime / 1000),
        metadata: {
          isMultiService: true,
          services: result.services.map(s => ({
            name: s.name,
            status: s.status,
            containerId: s.containerId,
            containerName: s.containerName,
            internalUrl: s.internalUrl,
            externalUrl: s.externalUrl,
            port: s.port,
            buildDuration: s.buildDuration,
            deployDuration: s.deployDuration,
          })),
          networkName: result.networkName,
          totalBuildTime: result.totalBuildTime,
          totalDeployTime: result.totalDeployTime,
        },
      },
    });

    // Create/update Service records in database
    for (const service of result.services) {
      // Generate slug from name
      const serviceSlug = service.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
      
      await prisma.service.upsert({
        where: {
          projectId_name: {
            projectId,
            name: service.name,
          },
        },
        create: {
          projectId,
          name: service.name,
          slug: serviceSlug,
          type: service.containerId ? 'APP' : 'MANAGED',
          status: service.status === 'running' ? 'RUNNING' : 'FAILED',
          port: service.port,
          containerId: service.containerId,
          containerName: service.containerName,
          internalUrl: service.internalUrl,
          externalUrl: service.externalUrl,
        },
        update: {
          status: service.status === 'running' ? 'RUNNING' : 'FAILED',
          containerId: service.containerId,
          containerName: service.containerName,
          internalUrl: service.internalUrl,
          externalUrl: service.externalUrl,
        },
      });
    }

    // Success messages
    await publishLog(
      `🎉 Multi-service deployment complete! ${result.services.length} services deployed in ${Math.round(totalDuration / 1000)}s`,
      'info',
      'complete',
      100
    );

    // Log all service URLs
    for (const service of result.services) {
      if (service.externalUrl) {
        await publishLog(`  🌐 ${service.name}: ${service.externalUrl}`, 'info', 'complete');
      } else if (service.internalUrl) {
        await publishLog(`  🔒 ${service.name}: ${service.internalUrl} (internal)`, 'info', 'complete');
      }
    }

    await logPublisher.publishStatus(deploymentId, {
      status: 'LIVE',
      message: 'Multi-service deployment successful',
      url: primaryUrl,
    });

    await logPublisher.publishProjectEvent(projectId, {
      type: 'deployment_completed',
      deploymentId,
      message: `Multi-service deployment completed: ${result.services.length} services in ${Math.round(totalDuration / 1000)}s`,
      metadata: {
        url: primaryUrl,
        services: result.services.map(s => s.name),
      },
    });

    logger.info({
      deploymentId,
      projectId,
      duration: totalDuration,
      services: result.services.length,
      buildTime: result.totalBuildTime,
      deployTime: result.totalDeployTime,
    }, 'Multi-service deployment completed successfully');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error({
      deploymentId,
      projectId,
      error: errorMessage,
    }, 'Multi-service deployment failed');

    await logPublisher.publishStatus(deploymentId, {
      status: 'FAILED',
      message: errorMessage,
    });

    await logPublisher.publishProjectEvent(projectId, {
      type: 'deployment_failed',
      deploymentId,
      message: errorMessage,
    });

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage,
      },
    });

    // Cleanup
    await gitService.cleanup(deploymentId);

    throw error;
  } finally {
    // Remove all event listeners to prevent memory leaks
    parallelDeployer.removeAllListeners();
    
    // Cleanup cloned repository
    await gitService.cleanup(deploymentId);
  }
}

async function handleBuildCompleted(event: DeploymentEvent): Promise<void> {
  const { deploymentId, buildId } = event;

  logger.info({ deploymentId, buildId }, 'Processing build completion');

  // TODO: Implement post-build logic
  // 1. Start container deployment
  // 2. Update DNS/routing
  // 3. Health checks

  logger.info({ deploymentId, buildId }, 'Build completion processed');
}

async function handleDeploymentRollback(event: DeploymentEvent): Promise<void> {
  const { deploymentId, projectId, imageTag } = event as DeploymentEvent & { imageTag: string };

  logger.info({ deploymentId, projectId, imageTag }, 'Processing deployment rollback');

  const startTime = Date.now();

  // Helper to publish logs
  const publishLog = async (message: string, level: 'info' | 'warn' | 'error' = 'info', step?: string, progress?: number) => {
    await logPublisher.publishLog(deploymentId, { level, message, step, progress });
  };

  await logPublisher.publishStatus(deploymentId, { status: 'DEPLOYING', message: 'Starting rollback...' });
  await publishLog('⏪ Rollback initiated', 'info', 'init', 0);

  try {
    // Get project details
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { envVariables: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    await publishLog(`Rolling back to image: ${imageTag}`, 'info', 'deploy', 20);

    // Deploy the existing image (skip build entirely)
    await publishLog('Deploying container with existing image...', 'info', 'deploy', 50);

    const deployResult = await deployerService.deploy({
      projectId,
      deploymentId,
      projectSlug: project.slug,
      imageName: `${config.docker.registry}/${project.slug}`,
      imageTag,
      port: 3000,
      envVars: project.envVariables.reduce((acc: Record<string, string>, v: { key: string; value: string }) => {
        acc[v.key] = v.value;
        return acc;
      }, {}),
      memory: project.memoryLimit,
      cpu: project.cpuLimit,
    });

    if (!deployResult.success) {
      throw new Error(deployResult.error || 'Deployment failed');
    }

    await publishLog('Container deployed successfully!', 'info', 'deploy', 80);

    // Update deployment status
    const duration = Date.now() - startTime;
    
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'LIVE',
        completedAt: new Date(),
        url: `https://${project.subdomain}.${config.deployment.baseDomain}`,
      },
    });

    await publishLog(`✅ Rollback complete in ${(duration / 1000).toFixed(2)}s`, 'info', 'complete', 100);
    await logPublisher.publishStatus(deploymentId, { status: 'LIVE', message: 'Rollback complete!' });
    await logPublisher.publishComplete(deploymentId, {
      status: 'success',
      duration,
      url: `https://${project.subdomain}.${config.deployment.baseDomain}`,
      imageTag,
    });

    logger.info({
      deploymentId,
      projectId,
      imageTag,
      duration,
    }, 'Rollback deployment completed successfully');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await publishLog(`❌ Rollback failed: ${errorMessage}`, 'error', 'error', 100);
    await logPublisher.publishStatus(deploymentId, { status: 'FAILED', message: errorMessage });
    await logPublisher.publishComplete(deploymentId, {
      status: 'failed',
      duration: Date.now() - startTime,
      error: errorMessage,
    });

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage,
      },
    });

    throw error;
  }
}

// ===========================================
// BUILD LOG HANDLER
// =========================================== 

interface BuildLogMessage {
  deploymentId: string;
  line: string;
  stream: 'stdout' | 'stderr';
  timestamp: string;
}

async function handleBuildLog(topic: string, message: unknown): Promise<void> {
  const log = message as BuildLogMessage;
  
  // Store log in Redis for real-time streaming
  // This is handled elsewhere, but could be processed here too
  
  logger.debug({
    topic,
    deploymentId: log.deploymentId,
    stream: log.stream,
  }, 'Build log received');
}

// ===========================================
// GRACEFUL SHUTDOWN
// ===========================================

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

  const shutdownTimeout = setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);

  try {
    // Disconnect consumers
    for (const consumer of consumers) {
      await consumer.disconnect();
    }
    logger.info('Kafka consumers disconnected');

    // Disconnect from databases
    await prisma.$disconnect();
    logger.info('Prisma disconnected');

    // Disconnect from Redis
    await disconnectRedis();
    logger.info('Redis disconnected');

    // Disconnect from Kafka
    await disconnectKafka();
    logger.info('Kafka disconnected');

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

// ===========================================
// MAIN
// ===========================================

async function main(): Promise<void> {
  try {
    logger.info({
      env: config.env,
      nodeEnv: process.env.NODE_ENV,
    }, 'Starting Zyphron Worker');

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected');

    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connected');

    // Create deployment events consumer
    const deploymentConsumer = await createConsumer(
      'zyphron-deployment-workers',
      [TOPICS.DEPLOYMENTS],
      handleDeploymentEvent
    );
    consumers.push(deploymentConsumer);
    logger.info('Deployment events consumer started');

    // Create build logs consumer
    const buildLogsConsumer = await createConsumer(
      'zyphron-build-log-workers',
      [TOPICS.BUILD_LOGS],
      handleBuildLog
    );
    consumers.push(buildLogsConsumer);
    logger.info('Build logs consumer started');

    logger.info('Zyphron Worker started and listening for events');

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.fatal({ error }, 'Failed to start worker');
    process.exit(1);
  }
}

// Run the worker
main();
