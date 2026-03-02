// ===========================================
// WEBHOOK ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { sendDeploymentEvent } from '@/lib/kafka.js';
import { publishEvent } from '@/lib/redis.js';
import { TEAM_ROLES_MANAGE, projectWhereForUser } from '@/lib/project-access.js';
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import type { Project } from '@prisma/client';
import { createAuditLog } from '@/services/audit/index.js';

const logger = createLogger('webhooks');

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const createWebhookSchema = z.object({
  provider: z.enum(['GITHUB', 'GITLAB', 'BITBUCKET']),
  events: z.array(z.string()).min(1).default(['push']),
});

const updateWebhookSchema = z.object({
  events: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// GitHub webhook payload schemas
const githubPushEventSchema = z.object({
  ref: z.string(),
  before: z.string(),
  after: z.string(),
  repository: z.object({
    id: z.number(),
    full_name: z.string(),
    clone_url: z.string(),
    default_branch: z.string(),
  }),
  pusher: z.object({
    name: z.string(),
    email: z.string().optional(),
  }),
  head_commit: z.object({
    id: z.string(),
    message: z.string(),
    author: z.object({
      name: z.string(),
      email: z.string(),
    }),
  }).optional(),
  commits: z.array(z.object({
    id: z.string(),
    message: z.string(),
  })),
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }
  
  const expectedSig = 'sha256=' + createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

// ===========================================
// ROUTES
// ===========================================

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // List webhooks for a project
  app.get('/projects/:projectId/webhooks', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: projectWhereForUser(projectId, userId),
    });

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const webhooks = await prisma.webhook.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      webhooks: webhooks.map(w => ({
        ...w,
        secret: w.secret ? '••••••••' + w.secret.slice(-4) : null,
      })),
    });
  });

  // Create webhook for a project
  app.post('/projects/:projectId/webhooks', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId } = request.params;

    const parseResult = createWebhookSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ 
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: projectWhereForUser(projectId, userId, TEAM_ROLES_MANAGE),
    });

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    // Check for existing webhook with same provider
    const existingWebhook = await prisma.webhook.findFirst({
      where: { projectId: project.id, provider: data.provider },
    });

    if (existingWebhook) {
      return reply.code(409).send({ 
        error: 'Webhook already exists for this provider',
      });
    }

    const secret = generateWebhookSecret();
    const webhookId = `wh_${randomBytes(16).toString('hex')}`;

    const webhook = await prisma.webhook.create({
      data: {
        projectId: project.id,
        provider: data.provider,
        webhookId,
        secret,
        events: data.events,
        isActive: true,
      },
    });

    logger.info({ webhookId: webhook.id, projectId: project.id }, 'Webhook created');
    await createAuditLog({
      userId,
      action: 'webhook.create',
      resourceType: 'webhook',
      resourceId: webhook.id,
      metadata: {
        projectId: project.id,
        provider: webhook.provider,
        events: webhook.events,
      },
      request,
    });

    return reply.code(201).send({
      webhook: {
        ...webhook,
        webhookUrl: `${process.env.API_URL || 'http://api.localhost'}/api/v1/webhooks/github/${project.id}`,
      },
    });
  });

  // Update webhook
  app.put('/projects/:projectId/webhooks/:webhookId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string; webhookId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, webhookId } = request.params;

    const parseResult = updateWebhookSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
    }

    const data = parseResult.data;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: projectWhereForUser(projectId, userId, TEAM_ROLES_MANAGE),
    });

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, projectId: project.id },
    });

    if (!webhook) {
      return reply.code(404).send({ error: 'Webhook not found' });
    }

    const updatedWebhook = await prisma.webhook.update({
      where: { id: webhookId },
      data: {
        ...(data.events && { events: data.events }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    logger.info({ webhookId, projectId: project.id }, 'Webhook updated');
    await createAuditLog({
      userId,
      action: 'webhook.update',
      resourceType: 'webhook',
      resourceId: webhookId,
      metadata: {
        projectId: project.id,
        changedFields: Object.keys(data),
      },
      request,
    });

    return reply.send({
      webhook: {
        ...updatedWebhook,
        secret: updatedWebhook.secret ? '••••••••' + updatedWebhook.secret.slice(-4) : null,
      },
    });
  });

  // Delete webhook
  app.delete('/projects/:projectId/webhooks/:webhookId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string; webhookId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, webhookId } = request.params;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: projectWhereForUser(projectId, userId, TEAM_ROLES_MANAGE),
    });

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, projectId: project.id },
    });

    if (!webhook) {
      return reply.code(404).send({ error: 'Webhook not found' });
    }

    await prisma.webhook.delete({
      where: { id: webhookId },
    });

    logger.info({ webhookId, projectId: project.id }, 'Webhook deleted');
    await createAuditLog({
      userId,
      action: 'webhook.delete',
      resourceType: 'webhook',
      resourceId: webhookId,
      metadata: { projectId: project.id },
      request,
    });

    return reply.code(204).send();
  });

  // Regenerate webhook secret
  app.post('/projects/:projectId/webhooks/:webhookId/regenerate-secret', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { projectId: string; webhookId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { projectId, webhookId } = request.params;

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: projectWhereForUser(projectId, userId, TEAM_ROLES_MANAGE),
    });

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, projectId: project.id },
    });

    if (!webhook) {
      return reply.code(404).send({ error: 'Webhook not found' });
    }

    const newSecret = generateWebhookSecret();

    const updatedWebhook = await prisma.webhook.update({
      where: { id: webhookId },
      data: { secret: newSecret },
    });

    logger.info({ webhookId, projectId: project.id }, 'Webhook secret regenerated');
    await createAuditLog({
      userId,
      action: 'webhook.regenerate_secret',
      resourceType: 'webhook',
      resourceId: webhookId,
      metadata: { projectId: project.id },
      request,
    });

    return reply.send({
      webhook: {
        ...updatedWebhook,
        secret: newSecret, // Return full secret only on regeneration
      },
    });
  });

  // ===========================================
  // GITHUB WEBHOOK RECEIVER
  // ===========================================

  app.post('/webhooks/github/:projectId', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;
    const signature = request.headers['x-hub-signature-256'] as string;
    const event = request.headers['x-github-event'] as string;
    const deliveryId = request.headers['x-github-delivery'] as string;

    logger.info({ projectId, event, deliveryId }, 'Received GitHub webhook');

    // Find project
    const project = await prisma.project.findFirst({
      where: {
        OR: [
          { id: projectId },
          { slug: projectId },
          { subdomain: projectId },
        ],
      },
      include: {
        webhooks: {
          where: { provider: 'GITHUB', isActive: true },
        },
      },
    });

    if (!project) {
      logger.warn({ projectId }, 'Webhook received for unknown project');
      return reply.code(404).send({ error: 'Project not found' });
    }

    const webhook = project.webhooks[0];
    if (!webhook) {
      logger.warn({ projectId }, 'No active GitHub webhook configured');
      return reply.code(404).send({ error: 'Webhook not configured' });
    }

    // Verify signature
    const rawBody = JSON.stringify(request.body);
    if (!verifyGitHubSignature(rawBody, signature, webhook.secret)) {
      logger.warn({ projectId, deliveryId }, 'Invalid webhook signature');
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    // Handle different events
    switch (event) {
      case 'push':
        await handlePushEvent(project, request.body);
        break;
      case 'pull_request':
        await handlePullRequestEvent(project, request.body);
        break;
      case 'ping':
        logger.info({ projectId }, 'Received ping event');
        break;
      default:
        logger.info({ projectId, event }, 'Ignoring unhandled event type');
    }

    return reply.send({ received: true });
  });
}

// ===========================================
// EVENT HANDLERS
// ===========================================

async function handlePushEvent(project: Project, payload: unknown): Promise<void> {
  const parseResult = githubPushEventSchema.safeParse(payload);
  
  if (!parseResult.success) {
    logger.warn({ projectId: project.id }, 'Invalid push event payload');
    return;
  }

  const data = parseResult.data;
  
  // Extract branch name from ref (refs/heads/main -> main)
  const branch = data.ref.replace('refs/heads/', '');
  
  logger.info({
    projectId: project.id,
    branch,
    commits: data.commits.length,
    pusher: data.pusher.name,
  }, 'Processing push event');

  // Check if push is to the project's configured branch
  if (branch !== project.branch) {
    logger.info({ projectId: project.id, branch, configuredBranch: project.branch }, 'Push to non-configured branch, skipping');
    return;
  }

  // Check if auto-deploy is enabled
  if (!project.autoDeploy) {
    logger.info({ projectId: project.id }, 'Auto-deploy disabled, skipping');
    return;
  }

  // Create deployment
  const deployment = await prisma.deployment.create({
    data: {
      projectId: project.id,
      userId: project.userId,
      branch,
      commitSha: data.after,
      commitMessage: data.head_commit?.message || data.commits[0]?.message || 'No commit message',
      environment: 'PRODUCTION',
      status: 'QUEUED',
      trigger: 'GIT_PUSH',
    },
  });

  // Create build job
  await prisma.buildJob.create({
    data: {
      deploymentId: deployment.id,
      status: 'PENDING',
    },
  });

  // Send to Kafka for worker processing
  await sendDeploymentEvent(deployment.id, 'DEPLOYMENT_CREATED', {
    projectId: project.id,
    branch,
    commitSha: data.after,
    trigger: 'GIT_PUSH',
    pusher: data.pusher.name,
  });

  // Publish real-time update
  await publishEvent('deployments', {
    type: 'DEPLOYMENT_STARTED',
    deploymentId: deployment.id,
    projectId: project.id,
  });

  logger.info({
    deploymentId: deployment.id,
    projectId: project.id,
    commitSha: data.after,
  }, 'Deployment triggered from GitHub push');
}

async function handlePullRequestEvent(project: Project, payload: unknown): Promise<void> {
  const pr = payload as { 
    action: string; 
    number: number; 
    pull_request: { 
      head: { sha: string; ref: string }; 
      title: string;
    };
  };
  
  logger.info({
    projectId: project.id,
    action: pr.action,
    prNumber: pr.number,
  }, 'Processing pull request event');

  // Only handle opened/synchronize for preview deployments
  if (!['opened', 'synchronize', 'reopened'].includes(pr.action)) {
    return;
  }

  // Create preview deployment
  const deployment = await prisma.deployment.create({
    data: {
      projectId: project.id,
      userId: project.userId,
      branch: pr.pull_request.head.ref,
      commitSha: pr.pull_request.head.sha,
      commitMessage: pr.pull_request.title,
      environment: 'PREVIEW',
      status: 'QUEUED',
      trigger: 'GIT_PUSH',
    },
  });

  // Create build job
  await prisma.buildJob.create({
    data: {
      deploymentId: deployment.id,
      status: 'PENDING',
    },
  });

  // Send to Kafka for worker processing
  await sendDeploymentEvent(deployment.id, 'DEPLOYMENT_CREATED', {
    projectId: project.id,
    branch: pr.pull_request.head.ref,
    commitSha: pr.pull_request.head.sha,
    trigger: 'GIT_PUSH',
    prNumber: pr.number,
  });

  // Publish real-time update
  await publishEvent('deployments', {
    type: 'DEPLOYMENT_STARTED',
    deploymentId: deployment.id,
    projectId: project.id,
  });

  logger.info({
    deploymentId: deployment.id,
    projectId: project.id,
    prNumber: pr.number,
  }, 'Preview deployment triggered from PR');
}
