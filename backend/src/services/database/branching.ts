// ===========================================
// DATABASE BRANCHING SERVICE
// Branch databases for preview environments
// ===========================================

import { createLogger } from '../../lib/logger.js';
import { getRedisClient } from '../../lib/redis.js';

const logger = createLogger('database-branching');

// ===========================================
// TYPES
// ===========================================

export type DatabaseType = 'postgres' | 'mysql' | 'mongodb' | 'redis';

export interface DatabaseBranch {
  id: string;
  parentId: string;
  projectId: string;
  name: string;
  type: DatabaseType;
  status: 'creating' | 'ready' | 'syncing' | 'error' | 'deleted';
  connectionString: string;
  createdFrom: 'production' | 'staging' | 'branch';
  createdAt: Date;
  expiresAt?: Date;
  sizeBytes: number;
  metadata: {
    prNumber?: number;
    branchName?: string;
    createdBy?: string;
    syncedAt?: Date;
  };
}

export interface BranchConfig {
  projectId: string;
  parentDatabaseId: string;
  name: string;
  type: DatabaseType;
  expirationHours?: number;
  copyData: boolean;
  metadata?: Record<string, unknown>;
}

export interface SyncConfig {
  branchId: string;
  tables?: string[];
  excludeTables?: string[];
  schemaOnly?: boolean;
}

// ===========================================
// DATABASE BRANCHING SERVICE
// ===========================================

export class DatabaseBranchingService {
  private redis = getRedisClient();

  /**
   * Create a new database branch
   */
  async createBranch(config: BranchConfig): Promise<DatabaseBranch> {
    logger.info({ projectId: config.projectId, name: config.name }, 'Creating database branch');

    const branchId = `branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Generate unique connection string for branch
    const connectionString = this.generateConnectionString(branchId, config.type);

    const branch: DatabaseBranch = {
      id: branchId,
      parentId: config.parentDatabaseId,
      projectId: config.projectId,
      name: config.name,
      type: config.type,
      status: 'creating',
      connectionString,
      createdFrom: 'production',
      createdAt: new Date(),
      expiresAt: config.expirationHours
        ? new Date(Date.now() + config.expirationHours * 60 * 60 * 1000)
        : undefined,
      sizeBytes: 0,
      metadata: config.metadata as DatabaseBranch['metadata'] || {},
    };

    // Store branch info
    await this.saveBranch(branch);

    // Initiate branch creation (async)
    this.initializeBranch(branch, config).catch(error => {
      logger.error({ error, branchId }, 'Failed to initialize branch');
    });

    return branch;
  }

  /**
   * Create branch for a pull request
   */
  async createPreviewBranch(params: {
    projectId: string;
    prNumber: number;
    branchName: string;
    parentDatabaseId: string;
    type: DatabaseType;
    createdBy: string;
  }): Promise<DatabaseBranch> {
    return this.createBranch({
      projectId: params.projectId,
      parentDatabaseId: params.parentDatabaseId,
      name: `preview-pr-${params.prNumber}`,
      type: params.type,
      expirationHours: 72, // 3 days default for previews
      copyData: true,
      metadata: {
        prNumber: params.prNumber,
        branchName: params.branchName,
        createdBy: params.createdBy,
      },
    });
  }

  /**
   * Get branch by ID
   */
  async getBranch(branchId: string): Promise<DatabaseBranch | null> {
    const data = await this.redis.get(`db:branch:${branchId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get all branches for a project
   */
  async getProjectBranches(projectId: string): Promise<DatabaseBranch[]> {
    const branchIds = await this.redis.smembers(`db:branches:${projectId}`);
    const branches: DatabaseBranch[] = [];

    for (const id of branchIds) {
      const branch = await this.getBranch(id);
      if (branch && branch.status !== 'deleted') {
        branches.push(branch);
      }
    }

    return branches;
  }

  /**
   * Get branch for a PR
   */
  async getBranchByPR(projectId: string, prNumber: number): Promise<DatabaseBranch | null> {
    const branches = await this.getProjectBranches(projectId);
    return branches.find(b => b.metadata.prNumber === prNumber) || null;
  }

  /**
   * Sync branch with parent
   */
  async syncBranch(config: SyncConfig): Promise<{
    success: boolean;
    rowsSynced?: number;
    duration?: number;
  }> {
    const branch = await this.getBranch(config.branchId);
    if (!branch) {
      return { success: false };
    }

    logger.info({ branchId: config.branchId }, 'Syncing database branch');

    // Update status
    await this.updateBranchStatus(config.branchId, 'syncing');

    try {
      // Simulate sync operation
      const startTime = Date.now();

      // In production, this would:
      // 1. Connect to parent database
      // 2. Connect to branch database
      // 3. Sync schema changes
      // 4. Optionally sync data for specified tables

      const rowsSynced = Math.floor(Math.random() * 10000);
      const duration = Date.now() - startTime;

      // Update branch metadata
      branch.metadata.syncedAt = new Date();
      await this.saveBranch(branch);
      await this.updateBranchStatus(config.branchId, 'ready');

      return { success: true, rowsSynced, duration };
    } catch (error) {
      await this.updateBranchStatus(config.branchId, 'error');
      return { success: false };
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchId: string): Promise<boolean> {
    const branch = await this.getBranch(branchId);
    if (!branch) return false;

    logger.info({ branchId, projectId: branch.projectId }, 'Deleting database branch');

    // In production, would actually delete the database
    await this.updateBranchStatus(branchId, 'deleted');
    await this.redis.srem(`db:branches:${branch.projectId}`, branchId);

    return true;
  }

  /**
   * Delete branches for a PR
   */
  async deletePRBranches(projectId: string, prNumber: number): Promise<number> {
    const branches = await this.getProjectBranches(projectId);
    const prBranches = branches.filter(b => b.metadata.prNumber === prNumber);

    let deleted = 0;
    for (const branch of prBranches) {
      const success = await this.deleteBranch(branch.id);
      if (success) deleted++;
    }

    return deleted;
  }

  /**
   * Cleanup expired branches
   */
  async cleanupExpiredBranches(): Promise<number> {
    logger.info('Cleaning up expired database branches');

    let cleaned = 0;

    // Get all project keys
    const projectKeys = await this.redis.keys('db:branches:*');

    for (const key of projectKeys) {
      const branchIds = await this.redis.smembers(key);

      for (const branchId of branchIds) {
        const branch = await this.getBranch(branchId);
        if (branch && branch.expiresAt && new Date(branch.expiresAt) < new Date()) {
          await this.deleteBranch(branchId);
          cleaned++;
        }
      }
    }

    logger.info({ cleaned }, 'Expired branches cleaned up');
    return cleaned;
  }

  /**
   * Get branch statistics
   */
  async getBranchStats(projectId: string): Promise<{
    totalBranches: number;
    activeBranches: number;
    totalSize: number;
    byType: Record<DatabaseType, number>;
  }> {
    const branches = await this.getProjectBranches(projectId);
    const activeBranches = branches.filter(b => b.status === 'ready');

    const byType: Record<DatabaseType, number> = {
      postgres: 0,
      mysql: 0,
      mongodb: 0,
      redis: 0,
    };

    let totalSize = 0;
    for (const branch of branches) {
      byType[branch.type]++;
      totalSize += branch.sizeBytes;
    }

    return {
      totalBranches: branches.length,
      activeBranches: activeBranches.length,
      totalSize,
      byType,
    };
  }

  /**
   * Run migrations on a branch
   */
  async runMigrations(branchId: string, migrations: string[]): Promise<{
    success: boolean;
    appliedMigrations: string[];
    errors: string[];
  }> {
    const branch = await this.getBranch(branchId);
    if (!branch) {
      return { success: false, appliedMigrations: [], errors: ['Branch not found'] };
    }

    logger.info({ branchId, migrationCount: migrations.length }, 'Running migrations on branch');

    const appliedMigrations: string[] = [];
    const errors: string[] = [];

    for (const migration of migrations) {
      try {
        // In production, would actually run the migration
        appliedMigrations.push(migration);
      } catch (error) {
        errors.push(`Failed to apply ${migration}: ${error}`);
        break;
      }
    }

    return {
      success: errors.length === 0,
      appliedMigrations,
      errors,
    };
  }

  /**
   * Get connection info for a branch
   */
  async getConnectionInfo(branchId: string): Promise<{
    connectionString: string;
    host: string;
    port: number;
    database: string;
    username: string;
  } | null> {
    const branch = await this.getBranch(branchId);
    if (!branch || branch.status !== 'ready') return null;

    // Parse connection string (simplified)
    return {
      connectionString: branch.connectionString,
      host: 'db.zyphron.internal',
      port: branch.type === 'postgres' ? 5432 : branch.type === 'mysql' ? 3306 : 27017,
      database: branch.name.replace(/-/g, '_'),
      username: `user_${branch.id.slice(0, 8)}`,
    };
  }

  // ===========================================
  // PRIVATE HELPERS
  // ===========================================

  private generateConnectionString(branchId: string, type: DatabaseType): string {
    const dbName = branchId.replace(/-/g, '_');

    switch (type) {
      case 'postgres':
        return `postgresql://user:password@db.zyphron.internal:5432/${dbName}`;
      case 'mysql':
        return `mysql://user:password@db.zyphron.internal:3306/${dbName}`;
      case 'mongodb':
        return `mongodb://user:password@db.zyphron.internal:27017/${dbName}`;
      case 'redis':
        return `redis://user:password@db.zyphron.internal:6379/0`;
      default:
        return '';
    }
  }

  private async initializeBranch(branch: DatabaseBranch, config: BranchConfig): Promise<void> {
    try {
      // Simulate database creation
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (config.copyData) {
        // Simulate data copy
        await new Promise(resolve => setTimeout(resolve, 3000));
        branch.sizeBytes = Math.floor(Math.random() * 100 * 1024 * 1024); // Random size up to 100MB
      }

      branch.status = 'ready';
      await this.saveBranch(branch);

      logger.info({ branchId: branch.id }, 'Database branch ready');
    } catch (error) {
      branch.status = 'error';
      await this.saveBranch(branch);
      throw error;
    }
  }

  private async saveBranch(branch: DatabaseBranch): Promise<void> {
    await this.redis.set(
      `db:branch:${branch.id}`,
      JSON.stringify(branch),
      'EX',
      86400 * 30 // 30 days TTL
    );
    await this.redis.sadd(`db:branches:${branch.projectId}`, branch.id);
  }

  private async updateBranchStatus(branchId: string, status: DatabaseBranch['status']): Promise<void> {
    const branch = await this.getBranch(branchId);
    if (branch) {
      branch.status = status;
      await this.saveBranch(branch);
    }
  }
}

// ===========================================
// EXPORTS
// ===========================================

export const databaseBranchingService = new DatabaseBranchingService();
