// ===========================================
// EMAIL SERVICE — Resend with key rotation
// ===========================================

import { Resend } from 'resend';
import { resendRotator } from '@/lib/key-rotator.js';
import { createLogger } from '@/lib/logger.js';
import { config } from '@/config/index.js';
import * as T from './templates.js';

const logger = createLogger('email');

interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
}

async function send(
  to: string,
  subject: string,
  html: string
): Promise<SendResult> {
  if (!resendRotator.available) {
    logger.warn({ to, subject }, 'Resend not configured — email skipped');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const result = await resendRotator.withRotation(async (key) => {
      const resend = new Resend(key);
      return resend.emails.send({
        from: config.resend.from,
        replyTo: config.resend.replyTo,
        to,
        subject,
        html,
      });
    });

    if (result.error) {
      logger.error({ to, error: result.error }, 'Resend send failed');
      return { success: false, error: result.error.message };
    }

    logger.info({ to, subject, id: result.data?.id }, 'Email sent');
    return { success: true, id: result.data?.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ to, subject, error: msg }, 'Email send error');
    return { success: false, error: msg };
  }
}

const appUrl = () => `https://app.${config.deployment.baseDomain}`;
const dashUrl = (path = '') => `${appUrl()}${path}`;

// ===========================================
// PUBLIC API
// ===========================================

export const emailService = {
  async sendWelcome(to: string, name: string) {
    const t = T.welcomeEmail(name, dashUrl());
    return send(to, t.subject, t.html);
  },

  async sendEmailVerification(to: string, name: string, otp: string) {
    const t = T.emailVerificationEmail(name, otp);
    return send(to, t.subject, t.html);
  },

  async sendPasswordReset(to: string, name: string, token: string) {
    const resetUrl = `${dashUrl('/reset-password')}?token=${token}`;
    const t = T.passwordResetEmail(name, resetUrl);
    return send(to, t.subject, t.html);
  },

  async sendDeploymentStarted(
    to: string,
    name: string,
    projectName: string,
    repoUrl: string,
    deploymentId: string
  ) {
    const t = T.deploymentStartedEmail(
      name,
      projectName,
      repoUrl,
      deploymentId,
      dashUrl(`/projects?deploy=${deploymentId}`)
    );
    return send(to, t.subject, t.html);
  },

  async sendDeploymentSuccess(
    to: string,
    name: string,
    projectName: string,
    liveUrl: string,
    duration: string
  ) {
    const t = T.deploymentSuccessEmail(name, projectName, liveUrl, duration, dashUrl('/projects'));
    return send(to, t.subject, t.html);
  },

  async sendDeploymentFailed(
    to: string,
    name: string,
    projectName: string,
    errorSummary: string,
    aiSuggestion: string,
    deploymentId: string
  ) {
    const t = T.deploymentFailedEmail(
      name,
      projectName,
      errorSummary,
      aiSuggestion,
      dashUrl(`/projects?deploy=${deploymentId}`)
    );
    return send(to, t.subject, t.html);
  },

  async sendTrafficSpike(
    to: string,
    name: string,
    projectName: string,
    currentRps: number,
    p95: number,
    projectId: string
  ) {
    const t = T.trafficSpikeEmail(
      name,
      projectName,
      currentRps,
      p95,
      dashUrl(`/observability?project=${projectId}`)
    );
    return send(to, t.subject, t.html);
  },

  async sendAccessRevoked(to: string, name: string) {
    const t = T.accessRevokedEmail(name);
    return send(to, t.subject, t.html);
  },

  async sendRollback(
    to: string,
    name: string,
    projectName: string,
    reason: string,
    deploymentId: string
  ) {
    const t = T.rollbackEmail(
      name,
      projectName,
      reason,
      dashUrl(`/projects?deploy=${deploymentId}`)
    );
    return send(to, t.subject, t.html);
  },
};
