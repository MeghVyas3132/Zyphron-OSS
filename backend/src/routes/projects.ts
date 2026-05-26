// ===========================================
// PROJECT ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { scanEnvVars } from '@/services/env-scanner/index.js';
import { scanComposeFile } from '@/services/compose-scanner/index.js';
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
  // Env vars to set immediately after project creation
  envVariables: z.array(z.object({
    key: z.string().min(1).max(200),
    value: z.string().max(10000),
    environment: z.enum(['PRODUCTION', 'PREVIEW', 'STAGING', 'DEVELOPMENT']).default('PRODUCTION'),
  })).optional(),
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

      // Store any env variables provided at creation time
      if (data.envVariables?.length) {
        await prisma.envVariable.createMany({
          data: data.envVariables
            .filter(v => v.key.trim() && v.value !== '')
            .map(v => ({
              key: v.key.trim().toUpperCase(),
              value: v.value,
              environment: v.environment || 'PRODUCTION',
              isSecret: true,
              projectId: project.id,
            })),
          skipDuplicates: true,
        });
        logger.info({ projectId: project.id, count: data.envVariables.length }, 'Env vars saved with project');
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
          ...project,
          url: `${protocol}://${subdomain}.${baseDomain}`,
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
      data: project,
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
      data: project,
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

  // ===========================================
  // SCAN DOCKER COMPOSE — detect services from a repo
  // ===========================================

  app.post('/scan-compose', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { repositoryUrl?: string; branch?: string };
    const { repositoryUrl, branch = 'main' } = body;

    if (!repositoryUrl) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'repositoryUrl is required' },
      });
    }

    if (!/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/.+/.test(repositoryUrl)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_URL', message: 'Only GitHub, GitLab and Bitbucket repos are supported' },
      });
    }

    try {
      const { config: appConfig } = await import('@/config/index.js');
      const tmpDir = `${appConfig.deployment.projectsDir}/compose-scan-${Date.now()}`;
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);

      await execFileAsync('git', ['clone', '--depth', '1', '--single-branch', '--branch', branch, repositoryUrl, tmpDir], {
        timeout: 60_000,
      });

      const result = await scanComposeFile(tmpDir);

      const { rm } = await import('node:fs/promises');
      await rm(tmpDir, { recursive: true, force: true });

      if (!result) {
        return reply.send({
          success: true,
          data: { hasCompose: false, services: [] },
        });
      }

      return reply.send({
        success: true,
        data: {
          hasCompose: true,
          composeFile: result.composeFile,
          services: result.services,
          appServices: result.appServices,
          managedServices: result.managedServices,
          networks: result.networks,
          hasEnvFile: result.hasEnvFile,
          serviceCount: result.services.length,
          appServiceCount: result.appServices.length,
          managedServiceCount: result.managedServices.length,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({
        success: false,
        error: { code: 'SCAN_FAILED', message: `Failed to scan repo: ${msg}` },
      });
    }
  });

  // ===========================================
  // DEPLOY COMPOSE STACK — create all services as linked projects
  // ===========================================

  const deployComposeSchema = z.object({
    name: z.string().min(1).max(100),
    repositoryUrl: z.string().url(),
    branch: z.string().default('main'),
    composeFile: z.string().default('docker-compose.yml'),
    teamId: z.string().uuid().optional(),
    services: z.array(z.object({
      name: z.string(),           // compose service key
      deploy: z.boolean().default(true),
      startCommand: z.string().optional(),
      buildContext: z.string().optional(),
      dockerfile: z.string().optional(),
      port: z.number().optional(),
      envVariables: z.array(z.object({
        key: z.string(),
        value: z.string(),
        environment: z.enum(['PRODUCTION', 'PREVIEW', 'STAGING', 'DEVELOPMENT']).default('PRODUCTION'),
      })).optional(),
    })),
    // Env vars applied to ALL app services
    sharedEnvVariables: z.array(z.object({
      key: z.string(),
      value: z.string(),
      environment: z.enum(['PRODUCTION', 'PREVIEW', 'STAGING', 'DEVELOPMENT']).default('PRODUCTION'),
    })).optional(),
    manifest: z.record(z.unknown()).optional(),
  });

  app.post('/deploy-compose', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const parseResult = deployComposeSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parseResult.error.flatten() },
      });
    }

    const data = parseResult.data;

    // Verify team access if provided
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
          error: { code: 'TEAM_ACCESS_DENIED', message: 'You do not have permission to create projects in this team' },
        });
      }
      teamId = team.id;
    }

    // Detect repository provider
    let repositoryProvider: 'GITHUB' | 'GITLAB' | 'BITBUCKET' = 'GITHUB';
    if (data.repositoryUrl.includes('gitlab.com')) repositoryProvider = 'GITLAB';
    else if (data.repositoryUrl.includes('bitbucket.org')) repositoryProvider = 'BITBUCKET';

    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const baseDomain = process.env.BASE_DOMAIN || 'localhost';

    try {
      // 1. Create the ComposeGroup
      const groupSlug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `stack-${nanoid(4)}`;

      const composeGroup = await prisma.composeGroup.create({
        data: {
          name: data.name,
          repositoryUrl: data.repositoryUrl,
          composeFile: data.composeFile,
          branch: data.branch,
          manifest: (data.manifest ?? {}) as import('@prisma/client').Prisma.InputJsonValue,
          userId,
          teamId,
        },
      });

      // 2. Create a project per app service
      const servicesToDeploy = data.services.filter(s => s.deploy !== false);
      const createdProjects: Array<{
        service: typeof servicesToDeploy[number];
        project: Awaited<ReturnType<typeof prisma.project.create>>;
        url: string;
      }> = [];

      for (const svc of servicesToDeploy) {
        const baseSlug = `${groupSlug}-${svc.name}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
        let slug = baseSlug;
        let subdomain = `${slug}-${nanoid(6)}`.toLowerCase();
        let project: Awaited<ReturnType<typeof prisma.project.create>> | null = null;

        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            project = await prisma.project.create({
              data: {
                name: `${data.name} — ${svc.name}`,
                slug,
                repositoryUrl: data.repositoryUrl,
                repositoryProvider,
                branch: data.branch,
                rootDirectory: svc.buildContext ?? null,
                startCommand: svc.startCommand ?? null,
                autoDeploy: true,
                subdomain,
                userId,
                teamId,
                isMultiService: true,
                serviceDetectionSource: 'docker-compose',
                projectType: 'MULTI_SERVICE',
                composeGroupId: composeGroup.id,
                composeServiceName: svc.name,
              },
            });
            break;
          } catch (err: unknown) {
            if ((err as { code?: string }).code !== 'P2002') throw err;
            slug = `${baseSlug}-${nanoid(4)}`;
            subdomain = `${slug}-${nanoid(6)}`.toLowerCase();
          }
        }

        if (!project) continue;

        // Store env vars for this service (shared + service-specific)
        const allEnv = [
          ...(data.sharedEnvVariables ?? []),
          ...(svc.envVariables ?? []),
        ];

        if (allEnv.length) {
          await prisma.envVariable.createMany({
            data: allEnv
              .filter(v => v.key.trim() && v.value !== '')
              .map(v => ({
                key: v.key.trim().toUpperCase(),
                value: v.value,
                environment: v.environment || 'PRODUCTION',
                isSecret: true,
                projectId: project!.id,
              })),
            skipDuplicates: true,
          });
        }

        const url = `${protocol}://${subdomain}.${baseDomain}`;
        createdProjects.push({ service: svc, project, url });
      }

      logger.info({ groupId: composeGroup.id, projectCount: createdProjects.length, userId }, 'Compose stack deployed');

      await createAuditLog({
        userId,
        action: 'compose.deploy',
        resourceType: 'compose_group',
        resourceId: composeGroup.id,
        metadata: {
          stackName: data.name,
          repositoryUrl: data.repositoryUrl,
          serviceCount: createdProjects.length,
          projectIds: createdProjects.map(p => p.project.id),
        },
        request,
      });

      return reply.status(201).send({
        success: true,
        data: {
          composeGroup,
          projects: createdProjects.map(({ service, project, url }) => ({
            ...project,
            url,
            serviceName: service.name,
          })),
          totalServices: createdProjects.length,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to deploy compose stack');
      throw error;
    }
  });

  // ===========================================
  // LIST COMPOSE GROUPS — for the stacks dashboard
  // ===========================================

  app.get('/compose-groups', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;

    const groups = await prisma.composeGroup.findMany({
      where: {
        OR: [
          { userId },
          { teamId: { not: null } }, // TODO: filter by team membership
        ],
        // Only groups owned by this user for now
        userId,
      },
      include: {
        projects: {
          select: {
            id: true,
            name: true,
            slug: true,
            subdomain: true,
            composeServiceName: true,
            deployments: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: { id: true, status: true, createdAt: true, url: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: { groups },
    });
  });
}
