// ===========================================
// ZYPHRON API SERVER ENTRY POINT
// ===========================================

import { createApp } from './app.js';
import { config } from './config/index.js';
import { createLogger } from './lib/logger.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { connectKafka, disconnectKafka } from './lib/kafka.js';
import { prisma } from './lib/prisma.js';

const logger = createLogger('server');

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

  const shutdownTimeout = setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);

  try {
    await prisma.$disconnect();
    logger.info('Prisma disconnected');

    await disconnectRedis();
    logger.info('Redis disconnected');

    await disconnectKafka();
    logger.info('Kafka disconnected');

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  try {
    logger.info({ env: config.env }, 'Starting Zyphron API server');

    // Connect Redis (required)
    await connectRedis();
    logger.info('Redis connected');

    // Connect Kafka (optional — soft gate)
    const kafkaConnected = await connectKafka();
    if (!kafkaConnected) {
      logger.warn('Running without Kafka — event streaming disabled, core deployments still work');
    }

    // Test database connection (required)
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connected');

    // Build and start Fastify
    const app = await createApp();

    await app.listen({
      host: config.host,
      port: config.port,
    });

    logger.info({
      host: config.host,
      port: config.port,
      url: `http://${config.host}:${config.port}`,
    }, '🚀 Zyphron API server started');

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
