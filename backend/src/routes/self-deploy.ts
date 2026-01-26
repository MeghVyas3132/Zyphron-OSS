import { FastifyPluginAsync } from 'fastify';
import { selfDeploymentService } from '../services/self-deploy/index.js';

interface DeployBody {
  version: string;
  environment?: 'production' | 'staging' | 'development';
  components?: {
    api?: boolean;
    worker?: boolean;
    frontend?: boolean;
  };
  strategy?: 'rolling' | 'blue-green' | 'canary';
  healthCheckUrl?: string;
  rollbackOnFailure?: boolean;
}

const selfDeployRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current Zyphron version and health
  fastify.get('/health', async () => {
    const health = await selfDeploymentService.getSystemHealth();
    return health;
  });

  // Get current version
  fastify.get('/version', async () => {
    const version = await selfDeploymentService.getCurrentVersion();
    return { version };
  });

  // Generate deployment manifest
  fastify.get<{ Querystring: { version: string } }>('/manifest', async (request) => {
    const { version } = request.query;
    const manifest = await selfDeploymentService.generateManifest(version || 'latest');
    return { manifest };
  });

  // Start self-deployment
  fastify.post<{ Body: DeployBody }>('/deploy', async (request) => {
    const {
      version,
      environment = 'production',
      components = { api: true, worker: true, frontend: true },
      strategy = 'rolling',
      healthCheckUrl = process.env.HEALTH_CHECK_URL || 'http://localhost:3000/health',
      rollbackOnFailure = true,
    } = request.body;

    const deployment = await selfDeploymentService.deploy({
      version,
      environment,
      components: {
        api: components.api ?? true,
        worker: components.worker ?? true,
        frontend: components.frontend ?? true,
      },
      strategy,
      healthCheckUrl,
      rollbackOnFailure,
    });

    return { deployment };
  });

  // Get deployment status
  fastify.get<{ Params: { deploymentId: string } }>('/deployments/:deploymentId', async (request) => {
    const { deploymentId } = request.params;
    const deployment = await selfDeploymentService.getDeploymentStatus(deploymentId);
    
    if (!deployment) {
      throw { statusCode: 404, message: 'Deployment not found' };
    }
    
    return { deployment };
  });

  // List all deployments
  fastify.get<{ Querystring: { limit?: number } }>('/deployments', async (request) => {
    const { limit = 10 } = request.query;
    const deployments = await selfDeploymentService.listDeployments(limit);
    return { deployments };
  });

  // Rollback deployment
  fastify.post<{ Params: { deploymentId: string } }>(
    '/deployments/:deploymentId/rollback',
    async (request) => {
      const { deploymentId } = request.params;
      const deployment = await selfDeploymentService.rollback(deploymentId);
      return { deployment };
    }
  );
};

export default selfDeployRoutes;
