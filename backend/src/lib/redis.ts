// ===========================================
// REDIS CLIENT
// ===========================================

import { Redis } from 'ioredis';
import { config } from '@/config/index.js';
import { createLogger } from '@/lib/logger.js';

const logger = createLogger('redis');

// ===========================================
// REDIS CLIENT SINGLETON
// ===========================================

let redisClient: Redis | null = null;
let subscriberClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });

    redisClient.on('error', (err: Error) => {
      logger.error({ err }, 'Redis connection error');
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redisClient;
}

export function getSubscriberClient(): Redis {
  if (!subscriberClient) {
    subscriberClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    subscriberClient.on('connect', () => {
      logger.info('Redis subscriber connected');
    });

    subscriberClient.on('error', (err: Error) => {
      logger.error({ err }, 'Redis subscriber error');
    });
  }

  return subscriberClient;
}

// ===========================================
// CONNECTION HELPERS
// ===========================================

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  await client.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
  if (subscriberClient) {
    await subscriberClient.quit();
    subscriberClient = null;
  }
  logger.info('Redis disconnected');
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

// ===========================================
// CACHE HELPERS
// ===========================================

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  const value = await client.get(key);
  if (!value) return null;
  return JSON.parse(value) as T;
}

export async function cacheSet<T>(
  key: string, 
  value: T, 
  ttlSeconds?: number
): Promise<void> {
  const client = getRedisClient();
  const serialized = JSON.stringify(value);
  
  if (ttlSeconds) {
    await client.setex(key, ttlSeconds, serialized);
  } else {
    await client.set(key, serialized);
  }
}

export async function cacheDelete(key: string): Promise<void> {
  const client = getRedisClient();
  await client.del(key);
}

export async function cacheDeletePattern(pattern: string): Promise<void> {
  const client = getRedisClient();
  const keys = await client.keys(pattern);
  if (keys.length > 0) {
    await client.del(...keys);
  }
}

// ===========================================
// PUB/SUB HELPERS
// ===========================================

export async function publish(channel: string, message: unknown): Promise<void> {
  const client = getRedisClient();
  await client.publish(channel, JSON.stringify(message));
}

export async function subscribe(
  channel: string, 
  callback: (message: unknown) => void
): Promise<void> {
  const client = getSubscriberClient();
  await client.subscribe(channel);
  
  client.on('message', (ch: string, msg: string) => {
    if (ch === channel) {
      callback(JSON.parse(msg));
    }
  });
}

// ===========================================
// CONVENIENCE EXPORTS
// ===========================================

// Export redis client directly for use in routes
export const redis = {
  get client() { return getRedisClient(); },
  lrange: async (key: string, start: number, stop: number) => getRedisClient().lrange(key, start, stop),
  lpush: async (key: string, ...values: string[]) => getRedisClient().lpush(key, ...values),
  rpush: async (key: string, ...values: string[]) => getRedisClient().rpush(key, ...values),
  duplicate: () => getRedisClient().duplicate(),
};

// Alias for publish function
export const publishEvent = publish;
