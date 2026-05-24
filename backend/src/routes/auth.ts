// ===========================================
// AUTHENTICATION ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { config } from '@/config/index.js';
import { storeGitHubToken } from '@/lib/github-token.js';
import { createAuditLog } from '@/services/audit/index.js';
import { emailService } from '@/services/email/index.js';

const logger = createLogger('auth');

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8),
});

const githubCallbackSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
});

// ===========================================
// ROUTES
// ===========================================

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const isBootstrapAdminEmail = (email: string): boolean =>
    config.auth.bootstrapAdminEmails.includes(email.toLowerCase());
  
  // ===========================================
  // EMAIL/PASSWORD AUTHENTICATION
  // ===========================================
  
  // Register new user
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = registerSchema.safeParse(request.body);
    
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

    const { email, name, password } = parseResult.data;

    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'USER_EXISTS',
            message: 'A user with this email already exists',
          },
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          role: isBootstrapAdminEmail(email) ? 'ADMIN' : 'USER',
          lastLoginAt: new Date(),
        },
      });

      // Generate JWT
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days
      });

      await createAuditLog({
        userId: user.id,
        action: 'user.register',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { email: user.email, role: user.role },
        request,
      });

      logger.info({ userId: user.id, email }, 'New user registered');

      // Send welcome email (non-blocking)
      void emailService.sendWelcome(email, name);

      return reply.status(201).send({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            role: user.role,
            isActive: user.isActive,
          },
        },
      });
    } catch (error) {
      logger.error({ error }, 'Registration error');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'REGISTRATION_ERROR',
          message: 'Failed to register user',
        },
      });
    }
  });

  // Login with email/password
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = loginSchema.safeParse(request.body);
    
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

    const { email, password } = parseResult.data;

    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || !user.password) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }

      if (!user.isActive) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Account is disabled',
          },
        });
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate JWT
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days
      });

      await createAuditLog({
        userId: user.id,
        action: 'user.login',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { email: user.email, role: user.role },
        request,
      });

      logger.info({ userId: user.id, email }, 'User logged in');

      return reply.send({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            role: user.role,
            isActive: user.isActive,
          },
        },
      });
    } catch (error) {
      logger.error({ error }, 'Login error');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'LOGIN_ERROR',
          message: 'Failed to login',
        },
      });
    }
  });

  // ===========================================
  // GITHUB OAUTH
  // ===========================================
  
  // GitHub OAuth initiation
  app.get('/github', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!config.github.clientId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'GITHUB_NOT_CONFIGURED',
          message: 'GitHub OAuth is not configured',
        },
      });
    }

    const state = crypto.randomUUID();
    const redirectUrl = new URL('https://github.com/login/oauth/authorize');
    redirectUrl.searchParams.set('client_id', config.github.clientId);
    redirectUrl.searchParams.set('redirect_uri', config.github.callbackUrl || '');
    redirectUrl.searchParams.set('scope', 'user:email read:user repo');
    redirectUrl.searchParams.set('state', state);

    return reply.send({
      success: true,
      data: {
        redirectUrl: redirectUrl.toString(),
        state,
      },
    });
  });

  // GitHub OAuth callback
  app.post('/github/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = githubCallbackSchema.safeParse(request.body);
    
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

    const { code } = parseResult.data;

    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: config.github.clientId,
          client_secret: config.github.clientSecret,
          code,
        }),
      });

      const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };

      if (tokenData.error || !tokenData.access_token) {
        logger.error({ error: tokenData.error }, 'GitHub token exchange failed');
        return reply.status(400).send({
          success: false,
          error: {
            code: 'GITHUB_AUTH_FAILED',
            message: 'Failed to authenticate with GitHub',
          },
        });
      }

      // Get user info from GitHub
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      const githubUser = await userResponse.json() as {
        id: number;
        login: string;
        email: string | null;
        name: string | null;
        avatar_url: string;
      };

      // Get user email if not public
      let email = githubUser.email;
      if (!email) {
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        });
        const emails = await emailsResponse.json() as { email: string; primary: boolean }[];
        const primaryEmail = emails.find(e => e.primary);
        email = primaryEmail?.email || emails[0]?.email;
      }

      if (!email) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'NO_EMAIL',
            message: 'Could not retrieve email from GitHub account',
          },
        });
      }

      // Find or create user
      let user = await prisma.user.findFirst({
        where: {
          OR: [
            { githubId: String(githubUser.id) },
            { email },
          ],
        },
      });

      if (user) {
        // Update existing user
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            githubId: String(githubUser.id),
            avatarUrl: githubUser.avatar_url,
            role: isBootstrapAdminEmail(email) ? 'ADMIN' : user.role,
            lastLoginAt: new Date(),
          },
        });
      } else {
        // Create new user
        user = await prisma.user.create({
          data: {
            email,
            name: githubUser.name || githubUser.login,
            githubId: String(githubUser.id),
            avatarUrl: githubUser.avatar_url,
            role: isBootstrapAdminEmail(email) ? 'ADMIN' : 'USER',
            lastLoginAt: new Date(),
          },
        });
        // Send welcome email for new GitHub users (non-blocking)
        void emailService.sendWelcome(email, user.name || githubUser.login);
      }

      // Generate JWT
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days
      });

      // Store GitHub access token for repo access
      await storeGitHubToken(user.id, tokenData.access_token);
      await createAuditLog({
        userId: user.id,
        action: 'user.login',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { provider: 'github', role: user.role },
        request,
      });

      logger.info({ userId: user.id }, 'User authenticated via GitHub');

      return reply.send({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            role: user.role,
            isActive: user.isActive,
          },
        },
      });
    } catch (error) {
      logger.error({ error }, 'GitHub authentication error');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication failed',
        },
      });
    }
  });

  // Get current user
  app.get('/me', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            projects: true,
            teamMembers: true,
          },
        },
      },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        user: {
          ...user,
          projectCount: user._count.projects,
          teamCount: user._count.teamMembers,
        },
      },
    });
  });

  // Update current user profile
  app.put('/profile', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const parseResult = updateProfileSchema.safeParse(request.body);

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
    if (!data.name && !data.email) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one field is required',
        },
      });
    }

    const nextEmail = data.email?.toLowerCase();

    if (nextEmail) {
      const conflict = await prisma.user.findFirst({
        where: {
          email: nextEmail,
          id: { not: userId },
        },
        select: { id: true },
      });

      if (conflict) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'EMAIL_IN_USE',
            message: 'This email is already in use',
          },
        });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(nextEmail !== undefined ? { email: nextEmail } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        isActive: true,
      },
    });

    await createAuditLog({
      userId,
      action: 'user.profile.update',
      resourceType: 'user',
      resourceId: userId,
      metadata: {
        updatedFields: Object.keys(data),
      },
      request,
    });

    return reply.send({
      success: true,
      data: {
        user: updatedUser,
      },
    });
  });

  // Refresh token
  app.post('/refresh', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const email = request.user?.email as string;

    const token = app.jwt.sign({
      sub: userId,
      email,
      role: request.user?.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // 7 days
    });

    return reply.send({
      success: true,
      data: { token },
    });
  });

  // Logout (invalidate token - handled client-side mostly)
  app.post('/logout', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    await createAuditLog({
      userId: request.user?.id,
      action: 'user.logout',
      resourceType: 'user',
      resourceId: request.user?.id,
      request,
    });

    return reply.send({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  });

  // ===========================================
  // GITHUB OAUTH CALLBACK (GET — browser redirect from GitHub)
  // ===========================================

  app.get('/github/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const proto = config.deployment.useHttps ? 'https' : 'http';
    const frontendUrl = `${proto}://${config.deployment.baseDomain}`;

    const { code, error: oauthError } = request.query as { code?: string; error?: string };

    if (oauthError || !code) {
      return reply.redirect(`${frontendUrl}/login?error=github_denied`);
    }

    try {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          client_id: config.github.clientId,
          client_secret: config.github.clientSecret,
          code,
        }),
      });

      const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };

      if (tokenData.error || !tokenData.access_token) {
        return reply.redirect(`${frontendUrl}/login?error=github_token_failed`);
      }

      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      const githubUser = await userResponse.json() as {
        id: number; login: string; email: string | null;
        name: string | null; avatar_url: string;
      };

      let email = githubUser.email;
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Accept': 'application/vnd.github.v3+json' },
        });
        const emails = await emailsRes.json() as { email: string; primary: boolean }[];
        email = emails.find(e => e.primary)?.email || emails[0]?.email;
      }

      if (!email) {
        return reply.redirect(`${frontendUrl}/login?error=github_no_email`);
      }

      let user = await prisma.user.findFirst({
        where: { OR: [{ githubId: String(githubUser.id) }, { email }] },
      });

      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { githubId: String(githubUser.id), avatarUrl: githubUser.avatar_url, role: isBootstrapAdminEmail(email) ? 'ADMIN' : user.role, lastLoginAt: new Date() },
        });
      } else {
        user = await prisma.user.create({
          data: { email, name: githubUser.name || githubUser.login, githubId: String(githubUser.id), avatarUrl: githubUser.avatar_url, role: isBootstrapAdminEmail(email) ? 'ADMIN' : 'USER', lastLoginAt: new Date() },
        });
        void emailService.sendWelcome(email, user.name || githubUser.login);
      }

      await storeGitHubToken(user.id, tokenData.access_token);
      await createAuditLog({ userId: user.id, action: 'user.login', resourceType: 'user', resourceId: user.id, metadata: { provider: 'github', role: user.role }, request });

      const token = app.jwt.sign({
        sub: user.id, email: user.email, role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7),
      });

      logger.info({ userId: user.id }, 'User authenticated via GitHub (callback)');
      return reply.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}`);
    } catch (error) {
      logger.error({ error }, 'GitHub callback error');
      return reply.redirect(`${frontendUrl}/login?error=github_failed`);
    }
  });

  // ===========================================
  // GOOGLE OAUTH
  // ===========================================

  app.get('/google', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!config.google.clientId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'GOOGLE_NOT_CONFIGURED', message: 'Google OAuth is not configured' },
      });
    }

    const client = new OAuth2Client(
      config.google.clientId,
      config.google.clientSecret,
      config.google.callbackUrl
    );

    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
    });

    return reply.send({ success: true, data: { redirectUrl: url } });
  });

  app.post('/google/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { code?: string; credential?: string };

    if (!config.google.clientId || !config.google.clientSecret) {
      return reply.status(400).send({
        success: false,
        error: { code: 'GOOGLE_NOT_CONFIGURED', message: 'Google OAuth is not configured' },
      });
    }

    try {
      const client = new OAuth2Client(
        config.google.clientId,
        config.google.clientSecret,
        config.google.callbackUrl
      );

      let googleEmail: string;
      let googleName: string;
      let googleAvatarUrl: string;

      if (body.credential) {
        // ID token flow (Google One Tap)
        const ticket = await client.verifyIdToken({
          idToken: body.credential,
          audience: config.google.clientId,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
          return reply.status(400).send({
            success: false,
            error: { code: 'GOOGLE_AUTH_FAILED', message: 'Invalid Google credential' },
          });
        }
        googleEmail = payload.email;
        googleName = payload.name || payload.email.split('@')[0];
        googleAvatarUrl = payload.picture || '';
        void payload.sub; // Google sub not stored yet — user identified by email
      } else if (body.code) {
        // Authorization code flow
        const { tokens } = await client.getToken(body.code);
        client.setCredentials(tokens);

        if (!tokens.id_token) {
          return reply.status(400).send({
            success: false,
            error: { code: 'GOOGLE_AUTH_FAILED', message: 'No ID token received from Google' },
          });
        }

        const ticket = await client.verifyIdToken({
          idToken: tokens.id_token,
          audience: config.google.clientId,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
          return reply.status(400).send({
            success: false,
            error: { code: 'GOOGLE_AUTH_FAILED', message: 'Could not get email from Google' },
          });
        }
        googleEmail = payload.email;
        googleName = payload.name || payload.email.split('@')[0];
        googleAvatarUrl = payload.picture || '';
        void payload.sub; // Google sub not stored yet — user identified by email
      } else {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'code or credential is required' },
        });
      }

      // Find or create user
      let user = await prisma.user.findFirst({
        where: { OR: [{ email: googleEmail }] },
      });

      const isNew = !user;

      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            avatarUrl: googleAvatarUrl || user.avatarUrl,
            role: isBootstrapAdminEmail(googleEmail) ? 'ADMIN' : user.role,
            lastLoginAt: new Date(),
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email: googleEmail,
            name: googleName,
            avatarUrl: googleAvatarUrl,
            role: isBootstrapAdminEmail(googleEmail) ? 'ADMIN' : 'USER',
            lastLoginAt: new Date(),
          },
        });
      }

      if (isNew) void emailService.sendWelcome(googleEmail, googleName);

      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7),
      });

      await createAuditLog({
        userId: user.id,
        action: 'user.login',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { provider: 'google' },
        request,
      });

      logger.info({ userId: user.id }, 'User authenticated via Google');

      return reply.send({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            role: user.role,
            isActive: user.isActive,
          },
        },
      });
    } catch (error) {
      logger.error({ error }, 'Google authentication error');
      return reply.status(500).send({
        success: false,
        error: { code: 'AUTH_ERROR', message: 'Google authentication failed' },
      });
    }
  });

  // ===========================================
  // GOOGLE OAUTH CALLBACK (GET — browser redirect from Google)
  // ===========================================

  app.get('/google/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const proto = config.deployment.useHttps ? 'https' : 'http';
    const frontendUrl = `${proto}://${config.deployment.baseDomain}`;

    const { code, error: oauthError } = request.query as { code?: string; error?: string };

    if (oauthError || !code) {
      return reply.redirect(`${frontendUrl}/login?error=google_denied`);
    }

    if (!config.google.clientId || !config.google.clientSecret) {
      return reply.redirect(`${frontendUrl}/login?error=google_not_configured`);
    }

    try {
      const client = new OAuth2Client(config.google.clientId, config.google.clientSecret, config.google.callbackUrl);
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      if (!tokens.id_token) {
        return reply.redirect(`${frontendUrl}/login?error=google_no_id_token`);
      }

      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.google.clientId });
      const payload = ticket.getPayload();
      if (!payload?.email) {
        return reply.redirect(`${frontendUrl}/login?error=google_no_email`);
      }

      const googleEmail = payload.email;
      const googleName = payload.name || googleEmail.split('@')[0];
      const googleAvatarUrl = payload.picture || '';

      let user = await prisma.user.findFirst({ where: { email: googleEmail } });
      const isNew = !user;

      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: googleAvatarUrl || user.avatarUrl, role: isBootstrapAdminEmail(googleEmail) ? 'ADMIN' : user.role, lastLoginAt: new Date() },
        });
      } else {
        user = await prisma.user.create({
          data: { email: googleEmail, name: googleName, avatarUrl: googleAvatarUrl, role: isBootstrapAdminEmail(googleEmail) ? 'ADMIN' : 'USER', lastLoginAt: new Date() },
        });
      }

      if (isNew) void emailService.sendWelcome(googleEmail, googleName);

      await createAuditLog({ userId: user.id, action: 'user.login', resourceType: 'user', resourceId: user.id, metadata: { provider: 'google' }, request });

      const token = app.jwt.sign({
        sub: user.id, email: user.email, role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7),
      });

      logger.info({ userId: user.id }, 'User authenticated via Google (callback)');
      return reply.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}`);
    } catch (error) {
      logger.error({ error }, 'Google callback error');
      return reply.redirect(`${frontendUrl}/login?error=google_failed`);
    }
  });
}
