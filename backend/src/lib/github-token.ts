import { getRedisClient } from '@/lib/redis.js';

const PRIMARY_PREFIX = 'github_token:';
const LEGACY_PREFIX = 'github:token:';

function primaryKey(userId: string): string {
  return `${PRIMARY_PREFIX}${userId}`;
}

function legacyKey(userId: string): string {
  return `${LEGACY_PREFIX}${userId}`;
}

export async function getGitHubToken(userId: string): Promise<string | null> {
  const redis = getRedisClient();

  const primary = await redis.get(primaryKey(userId));
  if (primary) {
    return primary;
  }

  // Backward-compatible read path for older token key format.
  const legacy = await redis.get(legacyKey(userId));
  if (!legacy) {
    return null;
  }

  const ttl = await redis.ttl(legacyKey(userId));
  if (ttl > 0) {
    await redis.setex(primaryKey(userId), ttl, legacy);
  } else {
    await redis.set(primaryKey(userId), legacy);
  }

  return legacy;
}

export async function storeGitHubToken(
  userId: string,
  token: string,
  expiresIn: number = 28800
): Promise<void> {
  const redis = getRedisClient();

  if (expiresIn > 0) {
    await Promise.all([
      redis.setex(primaryKey(userId), expiresIn, token),
      redis.setex(legacyKey(userId), expiresIn, token),
    ]);
    return;
  }

  await Promise.all([
    redis.set(primaryKey(userId), token),
    redis.set(legacyKey(userId), token),
  ]);
}

export async function clearGitHubToken(userId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(primaryKey(userId), legacyKey(userId));
}
