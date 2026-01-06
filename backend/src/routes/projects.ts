// ===========================================
// PROJECT ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { nanoid } from 'nanoid';

const logger = createLogger('projects');

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  repositoryUrl: z.string().url(),
  branch: z.string().default('main'),
  rootDirectory: z.string().optional(),
  buildCommand: z.string().optional(),
  installCommand: z.string().optional(),
  startCommand: z.string().optional(),
  outputDirectory: z.string().optional(),
  autoDeploy: z.boolean().default(true),
  teamId: z.string().uuid().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  branch: z.string().optional(),
  rootDirectory: z.string().optional(),
  buildCommand: z.string().optional(),
  installCommand: z.string().optional(),
  startCommand: z.string().optional(),
  outputDirectory: z.string().optional(),
  autoDeploy: z.boolean().optional(),
  customDomain: z.string().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  teamId: z.string().uuid().optional(),
});

// ===========================================
// ROUTES
// ===========================================

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // List projects
  app.get('/', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const query = querySchema.parse(request.query);

    const where = {
      OR: [
        { userId },
        { team: { members: { some: { userId } } } },
      ],
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { subdomain: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
      ...(query.teamId && { teamId: query.teamId }),
    };

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: { deployments: true },
          },
          deployments: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.project.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: {
        projects: projects.map(p => ({
          ...p,
          deploymentCount: p._count.deployments,
          latestDeployment: p.deployments[0] || null,
        })),
      },
      meta: {
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
          hasNext: query.page * query.limit < total,
          hasPrev: query.page > 1,
        },
      },
    });
  });

  // Create project
  app.post('/', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const parseResult = createProjectSchema.safeParse(request.body);

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

    // Generate unique subdomain
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    const subdomain = `${slug}-${nanoid(6)}`.toLowerCase();

    // Detect repository provider
    let repositoryProvider: 'GITHUB' | 'GITLAB' | 'BITBUCKET' = 'GITHUB';
    if (data.repositoryUrl.includes('gitlab.com')) {
      repositoryProvider = 'GITLAB';
    } else if (data.repositoryUrl.includes('bitbucket.org')) {
      repositoryProvider = 'BITBUCKET';
    }

    try {
      const project = await prisma.project.create({
        data: {
          name: data.name,
          slug,
          repositoryUrl: data.repositoryUrl,
          repositoryProvider,
          branch: data.branch,
          rootDirectory: data.rootDirectory,
          buildCommand: data.buildCommand,
          installCommand: data.installCommand,
          startCommand: data.startCommand,
          outputDirectory: data.outputDirectory,
          autoDeploy: data.autoDeploy,
          subdomain,
          userId,
          teamId: data.teamId,
        },
      });

      logger.info({ projectId: project.id, userId }, 'Project created');

      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const baseDomain = process.env.BASE_DOMAIN || 'localhost';
      
      return reply.status(201).send({
        success: true,
        data: {
          project: {
            ...project,
            url: `${protocol}://${subdomain}.${baseDomain}`,
          },
        },
      });
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2002') {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'DUPLICATE_PROJECT',
            message: 'A project with this name already exists',
          },
        });
      }
      throw error;
    }
  });

  // Get single project
  app.get('/:projectId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId },
          { team: { members: { some: { userId } } } },
        ],
      },
      include: {
        deployments: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        envVariables: {
          select: {
            id: true,
            key: true,
            environment: true,
            isSecret: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        databases: true,
        team: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
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
      data: { project },
    });
  });

  // Update project
  app.put('/:projectId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;
    
    const parseResult = updateProjectSchema.safeParse(request.body);

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

    // Check access
    const existing = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId },
          { team: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
        ],
      },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found or you do not have permission to update',
        },
      });
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: parseResult.data,
    });

    logger.info({ projectId, userId }, 'Project updated');

    return reply.send({
      success: true,
      data: { project },
    });
  });

  // Delete project
  app.delete('/:projectId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;

    // Check access (only owner can delete)
    const existing = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId, // Only project owner can delete
      },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found or you do not have permission to delete',
        },
      });
    }

    // Delete project (cascade will handle related records)
    await prisma.project.delete({
      where: { id: projectId },
    });

    logger.info({ projectId, userId }, 'Project deleted');

    return reply.send({
      success: true,
      data: { message: 'Project deleted successfully' },
    });
  });
}
