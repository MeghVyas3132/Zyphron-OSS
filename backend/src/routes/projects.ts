// ===========================================
// PROJECT ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { scanEnvVars } from '@/services/env-scanner/index.js';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { TEAM_ROLES_MANAGE, projectWhereForUser } from '@/lib/project-access.js';
import { nanoid } from 'nanoid';
import { createAuditLog } from '@/services/audit/index.js';

const logger = createLogger('projects');

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/).optional(),
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
      AND: [
        {
          OR: [
            { userId },
            { team: { members: { some: { userId } } } },
          ],
        },
        ...(query.search ? [{
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { subdomain: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }] : []),
        ...(query.teamId ? [{ teamId: query.teamId }] : []),
      ],
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
    let teamId: string | undefined;

    if (data.teamId) {
      const team = await prisma.team.findFirst({
        where: {
          id: data.teamId,
          OR: [
            { ownerId: userId },
            { members: { some: { userId, role: { in: TEAM_ROLES_MANAGE } } } },
          ],
        },
        select: { id: true },
      });

      if (!team) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'TEAM_ACCESS_DENIED',
            message: 'You do not have permission to create projects in this team',
          },
        });
      }

      teamId = team.id;
    }

    const baseSlug = (data.slug || data.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `project-${nanoid(4)}`;

    // Detect repository provider
    let repositoryProvider: 'GITHUB' | 'GITLAB' | 'BITBUCKET' = 'GITHUB';
    if (data.repositoryUrl.includes('gitlab.com')) {
      repositoryProvider = 'GITLAB';
    } else if (data.repositoryUrl.includes('bitbucket.org')) {
      repositoryProvider = 'BITBUCKET';
    }

    try {
      let project: Awaited<ReturnType<typeof prisma.project.create>> | null = null;
      let slug = baseSlug;
      let subdomain = `${slug}-${nanoid(6)}`.toLowerCase();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          project = await prisma.project.create({
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
              teamId,
            },
          });
          break;
        } catch (error: unknown) {
          if ((error as { code?: string }).code !== 'P2002') {
            throw error;
          }
          slug = `${baseSlug}-${nanoid(4)}`;
          subdomain = `${slug}-${nanoid(6)}`.toLowerCase();
        }
      }

      if (!project) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'DUPLICATE_PROJECT',
            message: 'A unique project slug could not be generated. Try a different name.',
          },
        });
      }

      logger.info({ projectId: project.id, userId }, 'Project created');
      await createAuditLog({
        userId,
        action: 'project.create',
        resourceType: 'project',
        resourceId: project.id,
        metadata: {
          projectName: project.name,
          slug: project.slug,
          teamId: project.teamId,
        },
        request,
      });

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
      where: projectWhereForUser(projectId, userId),
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
      where: projectWhereForUser(projectId, userId, ['OWNER', 'ADMIN']),
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
      where: { id: existing.id },
      data: parseResult.data,
    });

    logger.info({ projectId: existing.id, userId }, 'Project updated');
    await createAuditLog({
      userId,
      action: 'project.update',
      resourceType: 'project',
      resourceId: existing.id,
      metadata: {
        changedFields: Object.keys(parseResult.data),
      },
      request,
    });

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
        AND: [
          { userId }, // Only project owner can delete
          {
            OR: [
              { id: projectId },
              { slug: projectId },
              { subdomain: projectId },
            ],
          },
        ],
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
      where: { id: existing.id },
    });

    logger.info({ projectId: existing.id, userId }, 'Project deleted');
    await createAuditLog({
      userId,
      action: 'project.delete',
      resourceType: 'project',
      resourceId: existing.id,
      request,
    });

    return reply.send({
      success: true,
      data: { message: 'Project deleted successfully' },
    });
  });

  // ===========================================
  // SCAN ENV VARS — detect required env vars from a public repo
  // ===========================================

  app.post('/scan-env', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { repositoryUrl?: string };
    const { repositoryUrl } = body;

    if (!repositoryUrl) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'repositoryUrl is required' },
      });
    }

    // Validate it looks like a public git URL
    if (!/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/.+/.test(repositoryUrl)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_URL', message: 'Only GitHub, GitLab and Bitbucket public repos are supported' },
      });
    }

    try {
      const { config: appConfig } = await import('@/config/index.js');
      const tmpDir = `${appConfig.deployment.projectsDir}/scan-${Date.now()}`;
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);

      // Shallow clone just enough to scan
      await execFileAsync('git', ['clone', '--depth', '1', '--single-branch', repositoryUrl, tmpDir], {
        timeout: 60_000,
      });

      const scanResult = await scanEnvVars(tmpDir);

      // Cleanup clone
      const { rm } = await import('node:fs/promises');
      await rm(tmpDir, { recursive: true, force: true });

      return reply.send({
        success: true,
        data: scanResult,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'SCAN_FAILED', message: `Failed to scan repo: ${msg}` },
      });
    }
  });
}
