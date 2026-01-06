// ===========================================
// SERVICE ROUTES
// API endpoints for multi-service project management
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { getMultiServiceDetector } from '@/services/detector/multi-service.js';

const logger = createLogger('services');

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const createServiceSchema = z.object({
  name: z.string().min(1).max(50),
  path: z.string().default('.'),
  type: z.enum(['APP', 'MANAGED', 'CUSTOM']).default('APP'),
  dockerfile: z.string().optional(),
  image: z.string().optional(),
  port: z.number().min(1).max(65535).default(3000),
  internalOnly: z.boolean().default(false),
  dependsOn: z.array(z.string()).default([]),
  buildCommand: z.string().optional(),
  installCommand: z.string().optional(),
  startCommand: z.string().optional(),
  cpuLimit: z.string().default('0.5'),
  memoryLimit: z.string().default('512m'),
  healthCheckPath: z.string().optional(),
});

const updateServiceSchema = createServiceSchema.partial();

const detectServicesSchema = z.object({
  force: z.boolean().default(false),
});

// ===========================================
// ROUTES
// ===========================================

export async function serviceRoutes(app: FastifyInstance): Promise<void> {
  const multiServiceDetector = getMultiServiceDetector();

  // ===========================================
  // LIST SERVICES FOR A PROJECT
  // ===========================================
  app.get('/projects/:projectId/services', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;

    // Check project access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId },
          { team: { members: { some: { userId } } } },
        ],
      },
      include: {
        services: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!project) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found or you do not have access',
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        services: project.services,
        isMultiService: project.isMultiService,
        detectionSource: project.serviceDetectionSource,
      },
    });
  });

  // ===========================================
  // DETECT SERVICES IN REPOSITORY
  // ===========================================
  app.post('/projects/:projectId/services/detect', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;
    
    const parseResult = detectServicesSchema.safeParse(request.body || {});
    const { force } = parseResult.success ? parseResult.data : { force: false };

    // Check project access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId },
          { team: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN', 'DEVELOPER'] } } } } },
        ],
      },
      include: {
        services: true,
      },
    });

    if (!project) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found or you do not have permission',
        },
      });
    }

    // Check if services already detected
    if (project.services.length > 0 && !force) {
      return reply.send({
        success: true,
        data: {
          services: project.services,
          isMultiService: project.isMultiService,
          detectionSource: project.serviceDetectionSource,
          cached: true,
        },
      });
    }

    try {
      // Clone repo and detect services
      // For now, we'll return a placeholder - actual implementation needs git clone
      const projectPath = `/var/www/projects/${projectId}`;
      
      // This would normally be called after cloning
      // const config = await multiServiceDetector.detect(projectPath);
      
      // For API purposes, return what we can detect from existing data
      logger.info({ projectId, userId }, 'Service detection requested');

      return reply.send({
        success: true,
        data: {
          message: 'Service detection requires repository clone. Trigger a deployment to detect services automatically.',
          services: project.services,
          isMultiService: project.isMultiService,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Detection failed';
      logger.error({ projectId, error: errorMessage }, 'Service detection failed');

      return reply.status(500).send({
        success: false,
        error: {
          code: 'DETECTION_FAILED',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================
  // GET SINGLE SERVICE
  // ===========================================
  app.get('/projects/:projectId/services/:serviceId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string; serviceId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, serviceId } = request.params;

    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        projectId,
        project: {
          OR: [
            { userId },
            { team: { members: { some: { userId } } } },
          ],
        },
      },
      include: {
        serviceDeployments: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!service) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'SERVICE_NOT_FOUND',
          message: 'Service not found',
        },
      });
    }

    return reply.send({
      success: true,
      data: { service },
    });
  });

  // ===========================================
  // CREATE SERVICE (Manual)
  // ===========================================
  app.post('/projects/:projectId/services', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;

    const parseResult = createServiceSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
      });
    }

    const data = parseResult.data;

    // Check project access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId },
          { team: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
        ],
      },
    });

    if (!project) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found or you do not have permission',
        },
      });
    }

    // Generate slug
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    try {
      const service = await prisma.service.create({
        data: {
          projectId,
          name: data.name,
          slug,
          path: data.path,
          type: data.type,
          dockerfile: data.dockerfile,
          image: data.image,
          port: data.port,
          internalOnly: data.internalOnly,
          dependsOn: data.dependsOn,
          buildCommand: data.buildCommand,
          installCommand: data.installCommand,
          startCommand: data.startCommand,
          cpuLimit: data.cpuLimit,
          memoryLimit: data.memoryLimit,
          healthCheckPath: data.healthCheckPath,
        },
      });

      // Update project to multi-service if not already
      if (!project.isMultiService) {
        await prisma.project.update({
          where: { id: projectId },
          data: { 
            isMultiService: true,
            serviceDetectionSource: 'manual',
          },
        });
      }

      logger.info({ projectId, serviceId: service.id, serviceName: data.name }, 'Service created');

      return reply.status(201).send({
        success: true,
        data: { service },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'DUPLICATE_SERVICE',
            message: 'A service with this name already exists in this project',
          },
        });
      }
      throw error;
    }
  });

  // ===========================================
  // UPDATE SERVICE
  // ===========================================
  app.patch('/projects/:projectId/services/:serviceId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string; serviceId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, serviceId } = request.params;

    const parseResult = updateServiceSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
      });
    }

    const data = parseResult.data;

    // Check access
    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        projectId,
        project: {
          OR: [
            { userId },
            { team: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
          ],
        },
      },
    });

    if (!service) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'SERVICE_NOT_FOUND',
          message: 'Service not found or you do not have permission',
        },
      });
    }

    const updateData: Record<string, unknown> = { ...data };
    if (data.name) {
      updateData.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    const updatedService = await prisma.service.update({
      where: { id: serviceId },
      data: updateData,
    });

    logger.info({ projectId, serviceId }, 'Service updated');

    return reply.send({
      success: true,
      data: { service: updatedService },
    });
  });

  // ===========================================
  // DELETE SERVICE
  // ===========================================
  app.delete('/projects/:projectId/services/:serviceId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string; serviceId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, serviceId } = request.params;

    // Check access
    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        projectId,
        project: {
          OR: [
            { userId },
            { team: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
          ],
        },
      },
    });

    if (!service) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'SERVICE_NOT_FOUND',
          message: 'Service not found or you do not have permission',
        },
      });
    }

    await prisma.service.delete({
      where: { id: serviceId },
    });

    // Check if any services remain
    const remainingServices = await prisma.service.count({
      where: { projectId },
    });

    if (remainingServices === 0) {
      await prisma.project.update({
        where: { id: projectId },
        data: { 
          isMultiService: false,
          serviceDetectionSource: null,
        },
      });
    }

    logger.info({ projectId, serviceId }, 'Service deleted');

    return reply.send({
      success: true,
      message: 'Service deleted successfully',
    });
  });

  // ===========================================
  // GET SERVICE LOGS
  // ===========================================
  app.get('/projects/:projectId/services/:serviceId/logs', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ 
    Params: { projectId: string; serviceId: string };
    Querystring: { deploymentId?: string; lines?: string };
  }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, serviceId } = request.params;
    const { deploymentId, lines = '100' } = request.query;

    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        projectId,
        project: {
          OR: [
            { userId },
            { team: { members: { some: { userId } } } },
          ],
        },
      },
    });

    if (!service) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'SERVICE_NOT_FOUND',
          message: 'Service not found',
        },
      });
    }

    // If container is running, could fetch live logs here
    // For now, return deployment logs from database
    const deployment = deploymentId 
      ? await prisma.serviceDeployment.findFirst({
          where: { serviceId, deploymentId },
        })
      : await prisma.serviceDeployment.findFirst({
          where: { serviceId },
          orderBy: { createdAt: 'desc' },
        });

    return reply.send({
      success: true,
      data: {
        service: {
          id: service.id,
          name: service.name,
          containerId: service.containerId,
          status: service.status,
        },
        deployment: deployment ? {
          id: deployment.id,
          status: deployment.status,
          containerId: deployment.containerId,
        } : null,
        logs: [], // Would be populated with actual container logs
        message: 'Live log streaming available via WebSocket at /ws/services/:serviceId/logs',
      },
    });
  });

  // ===========================================
  // ADD MANAGED SERVICE
  // ===========================================
  app.post('/projects/:projectId/services/managed', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;

    const schema = z.object({
      type: z.enum(['postgresql', 'mysql', 'mongodb', 'redis', 'rabbitmq', 'elasticsearch']),
      name: z.string().optional(),
      version: z.string().optional(),
    });

    const parseResult = schema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
      });
    }

    const data = parseResult.data;

    // Check project access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId },
          { team: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
        ],
      },
    });

    if (!project) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found or you do not have permission',
        },
      });
    }

    // Default names and images for managed services
    const managedDefaults: Record<string, { name: string; image: string; port: number }> = {
      postgresql: { name: 'postgres', image: `postgres:${data.version || '16-alpine'}`, port: 5432 },
      mysql: { name: 'mysql', image: `mysql:${data.version || '8'}`, port: 3306 },
      mongodb: { name: 'mongodb', image: `mongo:${data.version || '7'}`, port: 27017 },
      redis: { name: 'redis', image: `redis:${data.version || '7-alpine'}`, port: 6379 },
      rabbitmq: { name: 'rabbitmq', image: `rabbitmq:${data.version || '3-management-alpine'}`, port: 5672 },
      elasticsearch: { name: 'elasticsearch', image: `elasticsearch:${data.version || '8.11.0'}`, port: 9200 },
    };

    const defaults = managedDefaults[data.type];
    const serviceName = data.name || defaults.name;
    const slug = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    try {
      const service = await prisma.service.create({
        data: {
          projectId,
          name: serviceName,
          slug,
          path: '.',
          type: 'MANAGED',
          image: defaults.image,
          port: defaults.port,
          internalOnly: true,
          dependsOn: [],
        },
      });

      // Update project to multi-service
      if (!project.isMultiService) {
        await prisma.project.update({
          where: { id: projectId },
          data: { 
            isMultiService: true,
            serviceDetectionSource: project.serviceDetectionSource || 'manual',
          },
        });
      }

      logger.info({ projectId, serviceId: service.id, type: data.type }, 'Managed service added');

      return reply.status(201).send({
        success: true,
        data: { 
          service,
          connectionInfo: {
            note: 'Connection details will be available after deployment',
            envVars: data.type === 'postgresql' 
              ? ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
              : data.type === 'redis'
              ? ['REDIS_URL', 'REDIS_HOST', 'REDIS_PORT']
              : data.type === 'mongodb'
              ? ['MONGODB_URI', 'MONGO_URL', 'DB_HOST', 'DB_PORT']
              : [],
          },
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'DUPLICATE_SERVICE',
            message: 'A service with this name already exists in this project',
          },
        });
      }
      throw error;
    }
  });
}

export default serviceRoutes;
