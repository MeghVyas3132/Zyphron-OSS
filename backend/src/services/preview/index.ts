// ===========================================
// PREVIEW ENVIRONMENT SERVICE
// Manages preview deployments for pull requests
// ===========================================

import { createLogger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { getRedisClient } from '../../lib/redis.js';
import { getGitHubToken } from '../../lib/github-token.js';

const logger = createLogger('preview-service');

// ===========================================
// TYPES
// ===========================================

export interface PreviewEnvironment {
  id: string;
  projectId: string;
  pullRequestNumber: number;
  pullRequestTitle: string;
  branch: string;
  commitSha: string;
  url: string;
  status: 'pending' | 'building' | 'ready' | 'failed' | 'expired';
  deploymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface CreatePreviewInput {
  projectId: string;
  pullRequestNumber: number;
  pullRequestTitle: string;
  branch: string;
  commitSha: string;
  headRef: string;
  baseRef: string;
}

export interface PullRequestEvent {
  action: 'opened' | 'synchronize' | 'closed' | 'reopened';
  number: number;
  title: string;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
  repository: {
    full_name: string;
    clone_url: string;
  };
}

// ===========================================
// PREVIEW ENVIRONMENT SERVICE
// ===========================================

export class PreviewEnvironmentService {
  private redis = getRedisClient();

  /**
   * Handle a pull request webhook event
   */
  async handlePullRequestEvent(
    projectId: string,
    event: PullRequestEvent
  ): Promise<PreviewEnvironment | null> {
    logger.info({ projectId, action: event.action, pr: event.number }, 'Handling PR event');

    switch (event.action) {
      case 'opened':
      case 'reopened':
        return this.createPreviewEnvironment({
          projectId,
          pullRequestNumber: event.number,
          pullRequestTitle: event.title,
          branch: event.head.ref,
          commitSha: event.head.sha,
          headRef: event.head.ref,
          baseRef: event.base.ref,
        });

      case 'synchronize':
        return this.updatePreviewEnvironment(projectId, event.number, event.head.sha);

      case 'closed':
        await this.deletePreviewEnvironment(projectId, event.number);
        return null;

      default:
        return null;
    }
  }

  /**
   * Create a new preview environment for a PR
   */
  async createPreviewEnvironment(input: CreatePreviewInput): Promise<PreviewEnvironment> {
    logger.info({ projectId: input.projectId, pr: input.pullRequestNumber }, 'Creating preview environment');

    // Get project
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Generate unique subdomain for preview
    const previewSubdomain = this.generatePreviewSubdomain(
      project.slug,
      input.pullRequestNumber
    );

    // Check if preview already exists
    const existingPreview = await this.getPreviewByPR(input.projectId, input.pullRequestNumber);
    if (existingPreview) {
      // Update existing preview
      return this.updatePreviewEnvironment(
        input.projectId,
        input.pullRequestNumber,
        input.commitSha
      );
    }

    // Create deployment for preview
    const deployment = await prisma.deployment.create({
      data: {
        projectId: input.projectId,
        branch: input.branch,
        commitSha: input.commitSha,
        commitMessage: `Preview for PR #${input.pullRequestNumber}: ${input.pullRequestTitle}`,
        status: 'QUEUED',
        trigger: 'WEBHOOK',
        environment: 'PREVIEW',
        metadata: {
          isPreview: true,
          pullRequestNumber: input.pullRequestNumber,
        },
      },
    });

    // Calculate expiration (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store preview environment info
    const preview: PreviewEnvironment = {
      id: `preview_${input.projectId}_${input.pullRequestNumber}`,
      projectId: input.projectId,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestTitle: input.pullRequestTitle,
      branch: input.branch,
      commitSha: input.commitSha,
      url: `https://${previewSubdomain}`,
      status: 'pending',
      deploymentId: deployment.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt,
    };

    // Store in Redis
    await this.redis.setex(
      `preview:${input.projectId}:${input.pullRequestNumber}`,
      7 * 24 * 60 * 60, // 7 days TTL
      JSON.stringify(preview)
    );

    // Add to project's preview list
    await this.redis.sadd(`project:${input.projectId}:previews`, String(input.pullRequestNumber));

    // Trigger deployment (would normally queue this)
    await this.triggerPreviewDeployment(deployment.id, project, input);

    logger.info({ previewId: preview.id, url: preview.url }, 'Preview environment created');

    return preview;
  }

  /**
   * Update an existing preview environment
   */
  async updatePreviewEnvironment(
    projectId: string,
    pullRequestNumber: number,
    newCommitSha: string
  ): Promise<PreviewEnvironment> {
    logger.info({ projectId, pr: pullRequestNumber }, 'Updating preview environment');

    const existing = await this.getPreviewByPR(projectId, pullRequestNumber);
    if (!existing) {
      throw new Error('Preview environment not found');
    }

    // Create new deployment
    const deployment = await prisma.deployment.create({
      data: {
        projectId,
        branch: existing.branch,
        commitSha: newCommitSha,
        commitMessage: `Update preview for PR #${pullRequestNumber}`,
        status: 'QUEUED',
        trigger: 'WEBHOOK',
        environment: 'PREVIEW',
        metadata: {
          isPreview: true,
          pullRequestNumber,
        },
      },
    });

    // Update preview
    const updated: PreviewEnvironment = {
      ...existing,
      commitSha: newCommitSha,
      status: 'building',
      deploymentId: deployment.id,
      updatedAt: new Date(),
    };

    await this.redis.setex(
      `preview:${projectId}:${pullRequestNumber}`,
      7 * 24 * 60 * 60,
      JSON.stringify(updated)
    );

    return updated;
  }

  /**
   * Delete a preview environment
   */
  async deletePreviewEnvironment(projectId: string, pullRequestNumber: number): Promise<void> {
    logger.info({ projectId, pr: pullRequestNumber }, 'Deleting preview environment');

    const preview = await this.getPreviewByPR(projectId, pullRequestNumber);
    if (!preview) {
      return;
    }

    // Cancel any running deployments
    if (preview.deploymentId) {
      await prisma.deployment.update({
        where: { id: preview.deploymentId },
        data: { status: 'CANCELLED' },
      });
    }

    // Delete preview container/resources (would be handled by deployer)
    // await this.deployer.deletePreview(preview);

    // Remove from Redis
    await this.redis.del(`preview:${projectId}:${pullRequestNumber}`);
    await this.redis.srem(`project:${projectId}:previews`, String(pullRequestNumber));

    logger.info({ projectId, pr: pullRequestNumber }, 'Preview environment deleted');
  }

  /**
   * Get a preview environment by PR number
   */
  async getPreviewByPR(projectId: string, pullRequestNumber: number): Promise<PreviewEnvironment | null> {
    const data = await this.redis.get(`preview:${projectId}:${pullRequestNumber}`);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Get all preview environments for a project
   */
  async getProjectPreviews(projectId: string): Promise<PreviewEnvironment[]> {
    const prNumbers = await this.redis.smembers(`project:${projectId}:previews`);
    const previews: PreviewEnvironment[] = [];

    for (const prNumber of prNumbers) {
      const preview = await this.getPreviewByPR(projectId, parseInt(prNumber));
      if (preview) {
        previews.push(preview);
      }
    }

    return previews.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Update preview status
   */
  async updatePreviewStatus(
    projectId: string,
    pullRequestNumber: number,
    status: PreviewEnvironment['status']
  ): Promise<void> {
    const preview = await this.getPreviewByPR(projectId, pullRequestNumber);
    if (!preview) return;

    preview.status = status;
    preview.updatedAt = new Date();

    await this.redis.setex(
      `preview:${projectId}:${pullRequestNumber}`,
      7 * 24 * 60 * 60,
      JSON.stringify(preview)
    );

    // Post status to GitHub PR
    await this.postGitHubStatus(projectId, preview);
  }

  /**
   * Clean up expired preview environments
   */
  async cleanupExpiredPreviews(): Promise<number> {
    logger.info('Cleaning up expired preview environments');

    const projects = await prisma.project.findMany({
      select: { id: true },
    });

    let cleaned = 0;

    for (const project of projects) {
      const previews = await this.getProjectPreviews(project.id);
      const now = new Date();

      for (const preview of previews) {
        if (new Date(preview.expiresAt) < now) {
          await this.deletePreviewEnvironment(project.id, preview.pullRequestNumber);
          cleaned++;
        }
      }
    }

    logger.info({ cleaned }, 'Expired previews cleaned up');
    return cleaned;
  }

  // ===========================================
  // HELPER METHODS
  // ===========================================

  /**
   * Generate a unique subdomain for preview
   */
  private generatePreviewSubdomain(projectSlug: string, prNumber: number): string {
    const baseDomain = process.env.PREVIEW_DOMAIN || 'preview.zyphron.dev';
    return `${projectSlug}-pr-${prNumber}.${baseDomain}`;
  }

  /**
   * Trigger the deployment for a preview environment
   */
  private async triggerPreviewDeployment(
    deploymentId: string,
    project: { id: string; slug: string; repositoryUrl: string },
    input: CreatePreviewInput
  ): Promise<void> {
    // Update deployment to building status
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'BUILDING', startedAt: new Date() },
    });

    // In a real implementation, this would queue a build job
    // For now, we'll just update the status
    logger.info({ deploymentId, projectId: project.id }, 'Preview deployment triggered');

    // Queue build job (via Kafka or BullMQ)
    const { getRedisClient } = await import('../../lib/redis.js');
    const redis = getRedisClient();
    
    await redis.lpush('build:queue', JSON.stringify({
      type: 'preview',
      deploymentId,
      projectId: project.id,
      projectSlug: project.slug,
      repoUrl: project.repositoryUrl,
      branch: input.branch,
      commitSha: input.commitSha,
      pullRequestNumber: input.pullRequestNumber,
    }));
  }

  /**
   * Post deployment status to GitHub PR
   */
  private async postGitHubStatus(projectId: string, preview: PreviewEnvironment): Promise<void> {
    try {
      // Get GitHub token for project
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { user: true },
      });

      if (!project) return;

      const token = await getGitHubToken(project.userId);
      if (!token) return;

      // Parse repo info from URL
      const match = project.repositoryUrl?.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) return;

      const [, repoOwner, repo] = match;
      const repoName = repo.replace('.git', '');

      // Determine status
      const state = {
        pending: 'pending',
        building: 'pending',
        ready: 'success',
        failed: 'failure',
        expired: 'failure',
      }[preview.status] as 'pending' | 'success' | 'failure';

      const description = {
        pending: 'Preview deployment pending...',
        building: 'Building preview deployment...',
        ready: 'Preview deployment ready!',
        failed: 'Preview deployment failed',
        expired: 'Preview deployment expired',
      }[preview.status];

      // Post commit status
      await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/statuses/${preview.commitSha}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Zyphron-Deploy',
          },
          body: JSON.stringify({
            state,
            target_url: preview.url,
            description,
            context: 'Zyphron Preview',
          }),
        }
      );

      // Post comment on PR if ready
      if (preview.status === 'ready') {
        await fetch(
          `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${preview.pullRequestNumber}/comments`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Zyphron-Deploy',
            },
            body: JSON.stringify({
              body: `## 🚀 Preview Deployment Ready\n\n` +
                `| Name | Link |\n` +
                `| --- | --- |\n` +
                `| 🔗 Preview URL | [${preview.url}](${preview.url}) |\n` +
                `| 📦 Commit | \`${preview.commitSha.slice(0, 7)}\` |\n` +
                `| ⏰ Expires | ${new Date(preview.expiresAt).toLocaleDateString()} |\n\n` +
                `---\n` +
                `*Deployed by [Zyphron](https://zyphron.dev)*`,
            }),
          }
        );
      }

      logger.debug({ projectId, pr: preview.pullRequestNumber }, 'GitHub status posted');
    } catch (error) {
      logger.error({ error, projectId }, 'Failed to post GitHub status');
    }
  }
}

// Export singleton
export const previewService = new PreviewEnvironmentService();
