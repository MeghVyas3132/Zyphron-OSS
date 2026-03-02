// ===========================================
// WEBSOCKET ROUTES
// Real-time build logs and deployment updates
// ===========================================

import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getRedisClient, getSubscriberClient } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('websocket');
type WsSocket = import('ws').WebSocket;

// ===========================================
// TYPES
// ===========================================

interface WsClient {
  ws: WsSocket;
  userId: string;
  deploymentId?: string;
  projectId?: string;
  subscriptions: Set<string>;
}

interface WsMessage {
  type: string;
  payload: unknown;
}

// Channel prefixes
const CHANNELS = {
  BUILD_LOGS: 'build:logs:',       // build:logs:{deploymentId}
  DEPLOYMENT_STATUS: 'deploy:status:', // deploy:status:{deploymentId}
  PROJECT_EVENTS: 'project:events:',   // project:events:{projectId}
} as const;

// Active WebSocket connections
const clients = new Map<string, WsClient>();

// ===========================================
// MESSAGE SCHEMAS
// ===========================================

const subscribeSchema = z.object({
  type: z.literal('subscribe'),
  payload: z.object({
    channel: z.enum(['build_logs', 'deployment_status', 'project_events']),
    deploymentId: z.string().optional(),
    projectId: z.string().optional(),
  }),
});

const unsubscribeSchema = z.object({
  type: z.literal('unsubscribe'),
  payload: z.object({
    channel: z.string(),
  }),
});

// ===========================================
// WEBSOCKET PLUGIN
// ===========================================

export async function websocketRoutes(app: FastifyInstance) {
  const redis = getRedisClient();
  const subscriber = getSubscriberClient();

  // Pattern subscription for all build logs
  await subscriber.psubscribe(`${CHANNELS.BUILD_LOGS}*`);
  await subscriber.psubscribe(`${CHANNELS.DEPLOYMENT_STATUS}*`);
  await subscriber.psubscribe(`${CHANNELS.PROJECT_EVENTS}*`);

  // Handle incoming Redis messages
  subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    try {
      const data = JSON.parse(message);
      broadcastToSubscribers(channel, data);
    } catch (error) {
      logger.error({ error, channel }, 'Failed to parse Redis message');
    }
  });

  // ===========================================
  // BUILD LOGS WEBSOCKET
  // ===========================================

  app.get('/ws/builds/:deploymentId', { websocket: true }, async (connection, req) => {
    const socket = connection.socket as unknown as WsSocket;
    const { deploymentId } = req.params as { deploymentId: string };
    const clientId = generateClientId();

    logger.info({ clientId, deploymentId }, 'WebSocket client connected for build logs');

    // Verify deployment exists and user has access
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: true },
    });

    if (!deployment) {
      connection.socket.close(4004, 'Deployment not found');
      return;
    }

    // Register client
    const userId = await resolveSocketUserId(app, req);
    const client: WsClient = {
      ws: socket,
      userId,
      deploymentId,
      subscriptions: new Set([`${CHANNELS.BUILD_LOGS}${deploymentId}`]),
    };
    clients.set(clientId, client);

    // Send connection acknowledgment
    sendMessage(socket, {
      type: 'connected',
      payload: {
        clientId,
        deploymentId,
        status: deployment.status,
      },
    });

    // Send existing build logs if available
    const existingLogs = await redis.lrange(`logs:${deploymentId}`, 0, -1);
    if (existingLogs.length > 0) {
      sendMessage(socket, {
        type: 'build_logs_history',
        payload: {
          logs: existingLogs.map((l: string) => JSON.parse(l)),
        },
      });
    }

    // Handle incoming messages
    socket.on('message', async (rawMessage: Buffer) => {
      try {
        const message = JSON.parse(rawMessage.toString());
        await handleMessage(client, message);
      } catch (error) {
        logger.error({ error, clientId }, 'Failed to handle WebSocket message');
        sendMessage(socket, {
          type: 'error',
          payload: { message: 'Invalid message format' },
        });
      }
    });

    // Handle disconnect
    socket.on('close', () => {
      logger.info({ clientId, deploymentId }, 'WebSocket client disconnected');
      clients.delete(clientId);
    });

    // Handle errors
    socket.on('error', (error: Error) => {
      logger.error({ error, clientId }, 'WebSocket error');
      clients.delete(clientId);
    });
  });

  // ===========================================
  // DEPLOYMENT LOGS WEBSOCKET (alias for builds)
  // ===========================================

  app.get('/ws/deployments/:deploymentId/logs', { websocket: true }, async (connection, req) => {
    const socket = connection.socket as unknown as WsSocket;
    const { deploymentId } = req.params as { deploymentId: string };
    const clientId = generateClientId();

    logger.info({ clientId, deploymentId }, 'WebSocket client connected for deployment logs');

    // Verify deployment exists and user has access
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: true },
    });

    if (!deployment) {
      connection.socket.close(4004, 'Deployment not found');
      return;
    }

    // Register client
    const userId = await resolveSocketUserId(app, req);
    const client: WsClient = {
      ws: socket,
      userId,
      deploymentId,
      subscriptions: new Set([`${CHANNELS.BUILD_LOGS}${deploymentId}`]),
    };
    clients.set(clientId, client);

    // Send connection acknowledgment
    sendMessage(socket, {
      type: 'connected',
      payload: {
        clientId,
        deploymentId,
        status: deployment.status,
      },
    });

    // Send existing build logs if available
    const existingLogs = await redis.lrange(`logs:${deploymentId}`, 0, -1);
    if (existingLogs.length > 0) {
      sendMessage(socket, {
        type: 'build_logs_history',
        payload: {
          logs: existingLogs.map((l: string) => JSON.parse(l)),
        },
      });
    }

    // Handle incoming messages
    socket.on('message', async (rawMessage: Buffer) => {
      try {
        const message = JSON.parse(rawMessage.toString());
        await handleMessage(client, message);
      } catch (error) {
        logger.error({ error, clientId }, 'Failed to handle WebSocket message');
        sendMessage(socket, {
          type: 'error',
          payload: { message: 'Invalid message format' },
        });
      }
    });

    // Handle disconnect
    socket.on('close', () => {
      logger.info({ clientId, deploymentId }, 'WebSocket client disconnected');
      clients.delete(clientId);
    });

    // Handle errors
    socket.on('error', (error: Error) => {
      logger.error({ error, clientId }, 'WebSocket error');
      clients.delete(clientId);
    });
  });

  // ===========================================
  // PROJECT EVENTS WEBSOCKET
  // ===========================================

  app.get('/ws/projects/:projectId', { websocket: true }, async (connection, req) => {
    const socket = connection.socket as unknown as WsSocket;
    const { projectId } = req.params as { projectId: string };
    const clientId = generateClientId();

    logger.info({ clientId, projectId }, 'WebSocket client connected for project events');

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      connection.socket.close(4004, 'Project not found');
      return;
    }

    // Register client
    const userId = await resolveSocketUserId(app, req);
    const client: WsClient = {
      ws: socket,
      userId,
      projectId,
      subscriptions: new Set([`${CHANNELS.PROJECT_EVENTS}${projectId}`]),
    };
    clients.set(clientId, client);

    // Send connection acknowledgment
    sendMessage(socket, {
      type: 'connected',
      payload: {
        clientId,
        projectId,
        projectName: project.name,
      },
    });

    // Handle disconnect
    socket.on('close', () => {
      logger.info({ clientId, projectId }, 'WebSocket client disconnected');
      clients.delete(clientId);
    });
  });

  // ===========================================
  // GENERAL EVENTS WEBSOCKET
  // ===========================================

  app.get('/ws', { websocket: true }, async (connection, _req) => {
    const socket = connection.socket as unknown as WsSocket;
    const clientId = generateClientId();

    logger.info({ clientId }, 'WebSocket client connected');

    const client: WsClient = {
      ws: socket,
      userId: 'anonymous',
      subscriptions: new Set(),
    };
    clients.set(clientId, client);

    sendMessage(socket, {
      type: 'connected',
      payload: { clientId },
    });

    socket.on('message', async (rawMessage: Buffer) => {
      try {
        const message = JSON.parse(rawMessage.toString());
        await handleMessage(client, message);
      } catch (error) {
        sendMessage(socket, {
          type: 'error',
          payload: { message: 'Invalid message format' },
        });
      }
    });

    socket.on('close', () => {
      clients.delete(clientId);
    });
  });
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function generateClientId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

async function resolveSocketUserId(app: FastifyInstance, req: FastifyRequest): Promise<string> {
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length);
  }

  if (!token) {
    const queryToken = new URL(req.url, 'http://localhost').searchParams.get('token');
    if (queryToken) {
      token = queryToken;
    }
  }

  if (!token) {
    return 'anonymous';
  }

  try {
    const payload = await app.jwt.verify<{ sub?: string; id?: string }>(token);
    return payload.sub || payload.id || 'anonymous';
  } catch (error) {
    logger.debug({ error }, 'WebSocket token verification failed');
    return 'anonymous';
  }
}

function sendMessage(ws: WsSocket, message: WsMessage): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastToSubscribers(channel: string, data: unknown): void {
  for (const [, client] of clients) {
    if (client.subscriptions.has(channel)) {
      sendMessage(client.ws, {
        type: 'message',
        payload: { channel, data },
      });
    }
  }
}

async function handleMessage(client: WsClient, message: unknown): Promise<void> {
  const msg = message as WsMessage;

  switch (msg.type) {
    case 'subscribe': {
      const parsed = subscribeSchema.safeParse(msg);
      if (!parsed.success) {
        sendMessage(client.ws, {
          type: 'error',
          payload: { message: 'Invalid subscribe message' },
        });
        return;
      }

      const { channel, deploymentId, projectId } = parsed.data.payload;
      let fullChannel = '';

      if (channel === 'build_logs' && deploymentId) {
        fullChannel = `${CHANNELS.BUILD_LOGS}${deploymentId}`;
      } else if (channel === 'deployment_status' && deploymentId) {
        fullChannel = `${CHANNELS.DEPLOYMENT_STATUS}${deploymentId}`;
      } else if (channel === 'project_events' && projectId) {
        fullChannel = `${CHANNELS.PROJECT_EVENTS}${projectId}`;
      }

      if (fullChannel) {
        client.subscriptions.add(fullChannel);
        sendMessage(client.ws, {
          type: 'subscribed',
          payload: { channel: fullChannel },
        });
      }
      break;
    }

    case 'unsubscribe': {
      const parsed = unsubscribeSchema.safeParse(msg);
      if (parsed.success) {
        client.subscriptions.delete(parsed.data.payload.channel);
        sendMessage(client.ws, {
          type: 'unsubscribed',
          payload: { channel: parsed.data.payload.channel },
        });
      }
      break;
    }

    case 'ping': {
      sendMessage(client.ws, { type: 'pong', payload: {} });
      break;
    }

    default:
      sendMessage(client.ws, {
        type: 'error',
        payload: { message: `Unknown message type: ${msg.type}` },
      });
  }
}

// ===========================================
// BUILD LOG PUBLISHER (for worker)
// ===========================================

export class BuildLogPublisher {
  private redis = getRedisClient();

  async publishLog(deploymentId: string, log: BuildLogEntry): Promise<void> {
    const channel = `${CHANNELS.BUILD_LOGS}${deploymentId}`;
    const logEntry = {
      ...log,
      timestamp: new Date().toISOString(),
    };

    // Store in Redis list for history
    await this.redis.rpush(`logs:${deploymentId}`, JSON.stringify(logEntry));
    await this.redis.expire(`logs:${deploymentId}`, 86400); // 24h TTL

    // Publish for real-time subscribers
    await this.redis.publish(channel, JSON.stringify(logEntry));
  }

  async publishStatus(deploymentId: string, status: DeploymentStatusUpdate): Promise<void> {
    const channel = `${CHANNELS.DEPLOYMENT_STATUS}${deploymentId}`;
    await this.redis.publish(channel, JSON.stringify({
      ...status,
      timestamp: new Date().toISOString(),
    }));
  }

  async publishComplete(deploymentId: string, summary: DeploymentCompleteSummary): Promise<void> {
    const channel = `${CHANNELS.BUILD_LOGS}${deploymentId}`;
    const completeEvent = {
      type: 'deployment_complete',
      ...summary,
      timestamp: new Date().toISOString(),
    };

    // Store completion event
    await this.redis.rpush(`logs:${deploymentId}`, JSON.stringify(completeEvent));
    
    // Publish for real-time subscribers
    await this.redis.publish(channel, JSON.stringify(completeEvent));

    // Also publish status update
    await this.publishStatus(deploymentId, {
      status: summary.status === 'success' ? 'READY' : 'FAILED',
      message: summary.status === 'success' ? 'Deployment complete' : summary.error,
      url: summary.url,
    });
  }

  async publishProjectEvent(projectId: string, event: ProjectEvent): Promise<void> {
    const channel = `${CHANNELS.PROJECT_EVENTS}${projectId}`;
    await this.redis.publish(channel, JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
    }));
  }

  async clearLogs(deploymentId: string): Promise<void> {
    await this.redis.del(`logs:${deploymentId}`);
  }
}

// ===========================================
// TYPES FOR PUBLISHER
// ===========================================

export interface BuildLogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  step?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

export interface DeploymentStatusUpdate {
  status: string;
  message?: string;
  url?: string;
  containerId?: string;
}

export interface DeploymentCompleteSummary {
  status: 'success' | 'failed';
  duration: number;
  url?: string;
  imageTag?: string;
  error?: string;
}

export interface ProjectEvent {
  type: 'deployment_started' | 'deployment_completed' | 'deployment_failed' | 'webhook_received';
  deploymentId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// Singleton instance
let publisherInstance: BuildLogPublisher | null = null;

export function getBuildLogPublisher(): BuildLogPublisher {
  if (!publisherInstance) {
    publisherInstance = new BuildLogPublisher();
  }
  return publisherInstance;
}

export default websocketRoutes;
