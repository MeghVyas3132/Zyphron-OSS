// ===========================================
// SMART CACHING SERVICE
// Intelligent build caching for faster deployments
// ===========================================

import { createLogger } from '../../lib/logger.js';
import { getRedisClient } from '../../lib/redis.js';
import crypto from 'crypto';

const logger = createLogger('caching-service');

// ===========================================
// TYPES
// ===========================================

export interface CacheLayer {
  type: 'dependencies' | 'build' | 'docker' | 'static';
  key: string;
  hash: string;
  size: number;
  createdAt: Date;
  expiresAt: Date;
  hitCount: number;
}

export interface CacheConfig {
  projectId: string;
  framework: string;
  packageManager: string;
  buildCommand?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalSize: number;
  layerCount: number;
}

export interface CacheKey {
  key: string;
  hash: string;
  dependencies: string[];
}

// ===========================================
// CACHE KEY GENERATORS
// ===========================================

export class CacheKeyGenerator {
  /**
   * Generate cache key for dependencies (node_modules, venv, etc.)
   */
  static generateDependencyKey(config: {
    projectId: string;
    packageManager: string;
    lockfileHash: string;
    nodeVersion?: string;
    pythonVersion?: string;
  }): CacheKey {
    const parts = [
      config.projectId,
      'deps',
      config.packageManager,
      config.lockfileHash,
    ];

    if (config.nodeVersion) parts.push(`node-${config.nodeVersion}`);
    if (config.pythonVersion) parts.push(`python-${config.pythonVersion}`);

    const key = parts.join(':');
    const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);

    return {
      key: `cache:deps:${config.projectId}:${hash}`,
      hash,
      dependencies: [config.lockfileHash],
    };
  }

  /**
   * Generate cache key for build artifacts
   */
  static generateBuildKey(config: {
    projectId: string;
    framework: string;
    sourceHash: string;
    envHash: string;
    buildCommand?: string;
  }): CacheKey {
    const parts = [
      config.projectId,
      'build',
      config.framework,
      config.sourceHash,
      config.envHash,
    ];

    if (config.buildCommand) {
      const cmdHash = crypto.createHash('md5').update(config.buildCommand).digest('hex').slice(0, 8);
      parts.push(cmdHash);
    }

    const key = parts.join(':');
    const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);

    return {
      key: `cache:build:${config.projectId}:${hash}`,
      hash,
      dependencies: [config.sourceHash, config.envHash],
    };
  }

  /**
   * Generate cache key for Docker layers
   */
  static generateDockerLayerKey(config: {
    projectId: string;
    dockerfile: string;
    baseImage: string;
    stage?: string;
  }): CacheKey {
    const dockerfileHash = crypto.createHash('sha256').update(config.dockerfile).digest('hex').slice(0, 16);
    const parts = [
      config.projectId,
      'docker',
      config.baseImage.replace(/[:/]/g, '-'),
      dockerfileHash,
    ];

    if (config.stage) parts.push(config.stage);

    const key = parts.join(':');
    const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);

    return {
      key: `cache:docker:${config.projectId}:${hash}`,
      hash,
      dependencies: [dockerfileHash],
    };
  }

  /**
   * Generate cache key for static assets
   */
  static generateStaticAssetKey(config: {
    projectId: string;
    assetPath: string;
    contentHash: string;
  }): CacheKey {
    const key = `${config.projectId}:static:${config.assetPath}:${config.contentHash}`;
    const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);

    return {
      key: `cache:static:${config.projectId}:${hash}`,
      hash,
      dependencies: [config.contentHash],
    };
  }
}

// ===========================================
// SMART CACHING SERVICE
// ===========================================

export class SmartCachingService {
  private redis = getRedisClient();
  private readonly CACHE_TTL = 7 * 24 * 60 * 60; // 7 days

  /**
   * Check if cache exists and is valid
   */
  async getCacheHit(cacheKey: CacheKey): Promise<CacheLayer | null> {
    try {
      const cached = await this.redis.get(cacheKey.key);
      if (!cached) {
        await this.recordMiss(cacheKey.key);
        return null;
      }

      const layer = JSON.parse(cached) as CacheLayer;

      // Check expiration
      if (new Date(layer.expiresAt) < new Date()) {
        await this.invalidateCache(cacheKey.key);
        return null;
      }

      // Increment hit count
      layer.hitCount++;
      await this.redis.setex(cacheKey.key, this.CACHE_TTL, JSON.stringify(layer));
      await this.recordHit(cacheKey.key);

      logger.info({ key: cacheKey.key, hits: layer.hitCount }, 'Cache hit');
      return layer;
    } catch (error) {
      logger.error({ error, key: cacheKey.key }, 'Cache lookup failed');
      return null;
    }
  }

  /**
   * Store cache layer
   */
  async setCache(cacheKey: CacheKey, data: {
    type: CacheLayer['type'];
    size: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const layer: CacheLayer = {
        type: data.type,
        key: cacheKey.key,
        hash: cacheKey.hash,
        size: data.size,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.CACHE_TTL * 1000),
        hitCount: 0,
      };

      await this.redis.setex(cacheKey.key, this.CACHE_TTL, JSON.stringify(layer));

      // Track cache metadata
      await this.redis.sadd(`cache:layers:${this.extractProjectId(cacheKey.key)}`, cacheKey.key);

      logger.info({ key: cacheKey.key, type: data.type, size: data.size }, 'Cache stored');
    } catch (error) {
      logger.error({ error, key: cacheKey.key }, 'Failed to store cache');
    }
  }

  /**
   * Invalidate specific cache
   */
  async invalidateCache(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      await this.redis.srem(`cache:layers:${this.extractProjectId(key)}`, key);
      logger.info({ key }, 'Cache invalidated');
    } catch (error) {
      logger.error({ error, key }, 'Failed to invalidate cache');
    }
  }

  /**
   * Invalidate all caches for a project
   */
  async invalidateProjectCaches(projectId: string): Promise<number> {
    try {
      const keys = await this.redis.smembers(`cache:layers:${projectId}`);
      if (keys.length === 0) return 0;

      await this.redis.del(...keys);
      await this.redis.del(`cache:layers:${projectId}`);
      await this.redis.del(`cache:stats:${projectId}`);

      logger.info({ projectId, count: keys.length }, 'Project caches invalidated');
      return keys.length;
    } catch (error) {
      logger.error({ error, projectId }, 'Failed to invalidate project caches');
      return 0;
    }
  }

  /**
   * Get cache statistics for a project
   */
  async getCacheStats(projectId: string): Promise<CacheStats> {
    try {
      const statsKey = `cache:stats:${projectId}`;
      const stats = await this.redis.hgetall(statsKey);

      const hits = parseInt(stats.hits || '0', 10);
      const misses = parseInt(stats.misses || '0', 10);
      const total = hits + misses;

      // Get all cache layers
      const layerKeys = await this.redis.smembers(`cache:layers:${projectId}`);
      let totalSize = 0;

      for (const key of layerKeys) {
        const cached = await this.redis.get(key);
        if (cached) {
          const layer = JSON.parse(cached) as CacheLayer;
          totalSize += layer.size;
        }
      }

      return {
        hits,
        misses,
        hitRate: total > 0 ? (hits / total) * 100 : 0,
        totalSize,
        layerCount: layerKeys.length,
      };
    } catch (error) {
      logger.error({ error, projectId }, 'Failed to get cache stats');
      return { hits: 0, misses: 0, hitRate: 0, totalSize: 0, layerCount: 0 };
    }
  }

  /**
   * Get recommended cache strategy for a project
   */
  getCacheStrategy(framework: string, _packageManager: string): {
    layers: string[];
    priorities: Record<string, number>;
    ttl: Record<string, number>;
  } {
    const baseStrategy = {
      layers: ['dependencies', 'build', 'docker'],
      priorities: { dependencies: 1, build: 2, docker: 3 },
      ttl: { dependencies: 7 * 24 * 60 * 60, build: 24 * 60 * 60, docker: 3 * 24 * 60 * 60 },
    };

    // Framework-specific optimizations
    switch (framework.toLowerCase()) {
      case 'nextjs':
      case 'next.js':
        return {
          layers: ['dependencies', 'nextjs-cache', 'build', 'docker'],
          priorities: { dependencies: 1, 'nextjs-cache': 2, build: 3, docker: 4 },
          ttl: { 
            dependencies: 7 * 24 * 60 * 60, 
            'nextjs-cache': 3 * 24 * 60 * 60, 
            build: 24 * 60 * 60, 
            docker: 3 * 24 * 60 * 60 
          },
        };

      case 'react':
      case 'vue':
      case 'angular':
        return {
          layers: ['dependencies', 'build', 'static'],
          priorities: { dependencies: 1, build: 2, static: 3 },
          ttl: { 
            dependencies: 7 * 24 * 60 * 60, 
            build: 24 * 60 * 60, 
            static: 30 * 24 * 60 * 60 
          },
        };

      case 'python':
      case 'django':
      case 'fastapi':
      case 'flask':
        return {
          layers: ['venv', 'build', 'docker'],
          priorities: { venv: 1, build: 2, docker: 3 },
          ttl: { 
            venv: 7 * 24 * 60 * 60, 
            build: 24 * 60 * 60, 
            docker: 3 * 24 * 60 * 60 
          },
        };

      case 'go':
      case 'gin':
        return {
          layers: ['go-modules', 'build', 'docker'],
          priorities: { 'go-modules': 1, build: 2, docker: 3 },
          ttl: { 
            'go-modules': 7 * 24 * 60 * 60, 
            build: 12 * 60 * 60, 
            docker: 3 * 24 * 60 * 60 
          },
        };

      case 'rust':
      case 'actix':
        return {
          layers: ['cargo', 'target', 'docker'],
          priorities: { cargo: 1, target: 2, docker: 3 },
          ttl: { 
            cargo: 7 * 24 * 60 * 60, 
            target: 24 * 60 * 60, 
            docker: 3 * 24 * 60 * 60 
          },
        };

      default:
        return baseStrategy;
    }
  }

  /**
   * Generate Dockerfile cache mount instructions
   */
  generateDockerCacheMounts(framework: string, packageManager: string): string[] {
    const mounts: string[] = [];

    // Package manager specific mounts
    switch (packageManager.toLowerCase()) {
      case 'npm':
        mounts.push('--mount=type=cache,target=/root/.npm');
        break;
      case 'yarn':
        mounts.push('--mount=type=cache,target=/usr/local/share/.cache/yarn');
        break;
      case 'pnpm':
        mounts.push('--mount=type=cache,target=/root/.local/share/pnpm/store');
        break;
      case 'pip':
        mounts.push('--mount=type=cache,target=/root/.cache/pip');
        break;
      case 'poetry':
        mounts.push('--mount=type=cache,target=/root/.cache/pypoetry');
        break;
      case 'cargo':
        mounts.push('--mount=type=cache,target=/usr/local/cargo/registry');
        mounts.push('--mount=type=cache,target=/usr/local/cargo/git');
        break;
      case 'go':
        mounts.push('--mount=type=cache,target=/go/pkg/mod');
        break;
    }

    // Framework specific mounts
    switch (framework.toLowerCase()) {
      case 'nextjs':
      case 'next.js':
        mounts.push('--mount=type=cache,target=/app/.next/cache');
        break;
      case 'rust':
        mounts.push('--mount=type=cache,target=/app/target');
        break;
    }

    return mounts;
  }

  /**
   * Estimate cache savings for a build
   */
  async estimateCacheSavings(projectId: string, buildTime: number): Promise<{
    estimatedSavings: number;
    cacheUtilization: number;
    recommendation: string;
  }> {
    const stats = await this.getCacheStats(projectId);

    // Estimate time savings based on hit rate
    const estimatedSavings = Math.round(buildTime * (stats.hitRate / 100) * 0.6);
    const cacheUtilization = stats.hitRate;

    let recommendation = '';
    if (stats.hitRate < 30) {
      recommendation = 'Consider enabling more aggressive caching. Check if lockfiles are being committed.';
    } else if (stats.hitRate < 60) {
      recommendation = 'Cache utilization is moderate. Review build dependencies for better cache key stability.';
    } else {
      recommendation = 'Good cache utilization! Consider using Docker layer caching for further improvements.';
    }

    return {
      estimatedSavings,
      cacheUtilization,
      recommendation,
    };
  }

  /**
   * Warm cache for a project (pre-populate common layers)
   */
  async warmCache(projectId: string, config: CacheConfig): Promise<void> {
    logger.info({ projectId, framework: config.framework }, 'Warming cache');

    // This would typically trigger a background job to pre-build and cache layers
    const strategy = this.getCacheStrategy(config.framework, config.packageManager);

    for (const layer of strategy.layers) {
      const warmKey = `cache:warm:${projectId}:${layer}`;
      await this.redis.setex(warmKey, 3600, JSON.stringify({
        status: 'scheduled',
        layer,
        scheduledAt: new Date(),
      }));
    }
  }

  // ===========================================
  // PRIVATE HELPERS
  // ===========================================

  private extractProjectId(key: string): string {
    const parts = key.split(':');
    return parts[2] || 'unknown';
  }

  private async recordHit(key: string): Promise<void> {
    const projectId = this.extractProjectId(key);
    await this.redis.hincrby(`cache:stats:${projectId}`, 'hits', 1);
  }

  private async recordMiss(key: string): Promise<void> {
    const projectId = this.extractProjectId(key);
    await this.redis.hincrby(`cache:stats:${projectId}`, 'misses', 1);
  }
}

// ===========================================
// EXPORTS
// ===========================================

export const cachingService = new SmartCachingService();
export const cacheKeyGenerator = CacheKeyGenerator;
