// ===========================================
// DEPLOYMENT STRATEGIES SERVICE
// Rolling, Blue-Green, Canary deployments
// ===========================================

import { createLogger } from '../../lib/logger.js';
import { getRedisClient } from '../../lib/redis.js';

const logger = createLogger('deployment-strategies');

// ===========================================
// TYPES
// ===========================================

export type DeploymentStrategy = 'rolling' | 'blue-green' | 'canary' | 'recreate' | 'shadow';

export interface StrategyConfig {
  strategy: DeploymentStrategy;
  projectId: string;
  currentVersion: string;
  newVersion: string;
}

export interface RollingConfig extends StrategyConfig {
  strategy: 'rolling';
  maxSurge: number; // Max replicas over desired during update
  maxUnavailable: number; // Max unavailable replicas during update
  batchSize?: number; // Number of pods to update at once
  pauseBetweenBatches?: number; // Seconds to wait between batches
}

export interface BlueGreenConfig extends StrategyConfig {
  strategy: 'blue-green';
  blueReplicas: number;
  greenReplicas: number;
  testingTime?: number; // Seconds to test green before switch
  autoSwitch: boolean;
}

export interface CanaryConfig extends StrategyConfig {
  strategy: 'canary';
  initialWeight: number; // Initial traffic % to canary (e.g., 10)
  steps: { weight: number; duration: number }[]; // Progressive rollout steps
  successCriteria: {
    errorRateThreshold: number; // Max error rate % to proceed
    latencyThreshold: number; // Max p99 latency in ms
    minRequestCount?: number; // Min requests before evaluating
  };
}

export interface ShadowConfig extends StrategyConfig {
  strategy: 'shadow';
  shadowReplicas: number;
  comparisonduration: number; // Duration in seconds to run shadow
}

export interface DeploymentState {
  id: string;
  projectId: string;
  strategy: DeploymentStrategy;
  currentPhase: string;
  progress: number;
  startedAt: Date;
  updatedAt: Date;
  versions: {
    current: string;
    target: string;
  };
  trafficSplit: {
    current: number;
    target: number;
  };
  healthStatus: {
    current: 'healthy' | 'degraded' | 'unhealthy';
    target: 'healthy' | 'degraded' | 'unhealthy' | 'pending';
  };
  rollbackAvailable: boolean;
  metadata: Record<string, unknown>;
}

export interface RolloutStep {
  phase: string;
  action: string;
  trafficWeight?: number;
  duration?: number;
  healthCheck?: boolean;
}

// ===========================================
// DEPLOYMENT STRATEGIES SERVICE
// ===========================================

export class DeploymentStrategiesService {
  private redis = getRedisClient();

  /**
   * Get available deployment strategies with descriptions
   */
  getStrategies(): { id: DeploymentStrategy; name: string; description: string; riskLevel: string }[] {
    return [
      {
        id: 'recreate',
        name: 'Recreate',
        description: 'Terminate all existing pods before creating new ones. Causes downtime but is simple.',
        riskLevel: 'high',
      },
      {
        id: 'rolling',
        name: 'Rolling Update',
        description: 'Gradually replace old pods with new ones. Zero downtime with controlled rollout.',
        riskLevel: 'low',
      },
      {
        id: 'blue-green',
        name: 'Blue-Green',
        description: 'Run two identical environments, switch traffic atomically. Instant rollback capability.',
        riskLevel: 'low',
      },
      {
        id: 'canary',
        name: 'Canary',
        description: 'Gradually shift traffic to new version while monitoring metrics. Safest for critical services.',
        riskLevel: 'very-low',
      },
      {
        id: 'shadow',
        name: 'Shadow / Dark',
        description: 'Mirror production traffic to new version without affecting users. Best for testing.',
        riskLevel: 'none',
      },
    ];
  }

  /**
   * Generate rollout plan for a strategy
   */
  generateRolloutPlan(config: RollingConfig | BlueGreenConfig | CanaryConfig | ShadowConfig): RolloutStep[] {
    switch (config.strategy) {
      case 'rolling':
        return this.generateRollingPlan(config);
      case 'blue-green':
        return this.generateBlueGreenPlan(config);
      case 'canary':
        return this.generateCanaryPlan(config);
      case 'shadow':
        return this.generateShadowPlan(config);
      default:
        return this.generateRecreatePlan(config);
    }
  }

  /**
   * Start a deployment with the specified strategy
   */
  async startDeployment(
    config: RollingConfig | BlueGreenConfig | CanaryConfig | ShadowConfig
  ): Promise<DeploymentState> {
    const plan = this.generateRolloutPlan(config);

    const state: DeploymentState = {
      id: `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: config.projectId,
      strategy: config.strategy,
      currentPhase: plan[0]?.phase || 'initializing',
      progress: 0,
      startedAt: new Date(),
      updatedAt: new Date(),
      versions: {
        current: config.currentVersion,
        target: config.newVersion,
      },
      trafficSplit: {
        current: 100,
        target: 0,
      },
      healthStatus: {
        current: 'healthy',
        target: 'pending',
      },
      rollbackAvailable: false,
      metadata: {
        plan,
        config,
      },
    };

    await this.saveState(state);
    logger.info({ deploymentId: state.id, strategy: config.strategy }, 'Deployment started');

    return state;
  }

  /**
   * Get deployment state
   */
  async getDeploymentState(deploymentId: string): Promise<DeploymentState | null> {
    const data = await this.redis.get(`deployment:state:${deploymentId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Update deployment progress
   */
  async updateProgress(
    deploymentId: string,
    update: Partial<Pick<DeploymentState, 'currentPhase' | 'progress' | 'trafficSplit' | 'healthStatus'>>
  ): Promise<DeploymentState | null> {
    const state = await this.getDeploymentState(deploymentId);
    if (!state) return null;

    const updatedState: DeploymentState = {
      ...state,
      ...update,
      updatedAt: new Date(),
    };

    await this.saveState(updatedState);
    return updatedState;
  }

  /**
   * Execute canary promotion (increase traffic to new version)
   */
  async promoteCanary(deploymentId: string, newWeight: number): Promise<DeploymentState | null> {
    const state = await this.getDeploymentState(deploymentId);
    if (!state || state.strategy !== 'canary') return null;

    const updatedState = await this.updateProgress(deploymentId, {
      trafficSplit: {
        current: 100 - newWeight,
        target: newWeight,
      },
      currentPhase: newWeight === 100 ? 'complete' : 'rolling-out',
      progress: newWeight,
    });

    logger.info({ deploymentId, newWeight }, 'Canary promoted');
    return updatedState;
  }

  /**
   * Execute blue-green switch
   */
  async switchBlueGreen(deploymentId: string): Promise<DeploymentState | null> {
    const state = await this.getDeploymentState(deploymentId);
    if (!state || state.strategy !== 'blue-green') return null;

    const updatedState = await this.updateProgress(deploymentId, {
      trafficSplit: {
        current: 0,
        target: 100,
      },
      currentPhase: 'switched',
      progress: 100,
    });

    logger.info({ deploymentId }, 'Blue-green switched');
    return updatedState;
  }

  /**
   * Rollback deployment
   */
  async rollback(deploymentId: string): Promise<DeploymentState | null> {
    const state = await this.getDeploymentState(deploymentId);
    if (!state) return null;

    const updatedState = await this.updateProgress(deploymentId, {
      trafficSplit: {
        current: 100,
        target: 0,
      },
      currentPhase: 'rolled-back',
      progress: 0,
    });

    logger.info({ deploymentId, strategy: state.strategy }, 'Deployment rolled back');
    return updatedState;
  }

  /**
   * Evaluate canary health based on metrics
   */
  evaluateCanaryHealth(metrics: {
    requestCount: number;
    errorCount: number;
    p99Latency: number;
  }, criteria: CanaryConfig['successCriteria']): {
    healthy: boolean;
    reason?: string;
  } {
    // Check minimum request count
    if (criteria.minRequestCount && metrics.requestCount < criteria.minRequestCount) {
      return { healthy: true, reason: 'Insufficient traffic to evaluate' };
    }

    // Check error rate
    const errorRate = (metrics.errorCount / metrics.requestCount) * 100;
    if (errorRate > criteria.errorRateThreshold) {
      return {
        healthy: false,
        reason: `Error rate ${errorRate.toFixed(2)}% exceeds threshold ${criteria.errorRateThreshold}%`,
      };
    }

    // Check latency
    if (metrics.p99Latency > criteria.latencyThreshold) {
      return {
        healthy: false,
        reason: `P99 latency ${metrics.p99Latency}ms exceeds threshold ${criteria.latencyThreshold}ms`,
      };
    }

    return { healthy: true };
  }

  /**
   * Get recommended strategy based on project characteristics
   */
  getRecommendedStrategy(params: {
    isStateful: boolean;
    hasDatabase: boolean;
    isHighTraffic: boolean;
    requiresZeroDowntime: boolean;
    hasCriticalUsers: boolean;
  }): { strategy: DeploymentStrategy; reason: string } {
    if (!params.requiresZeroDowntime && !params.isHighTraffic) {
      return {
        strategy: 'recreate',
        reason: 'Simple deployment for non-critical services with acceptable downtime',
      };
    }

    if (params.hasCriticalUsers || params.isHighTraffic) {
      return {
        strategy: 'canary',
        reason: 'Canary deployments minimize risk for high-traffic or critical services',
      };
    }

    if (params.hasDatabase || params.isStateful) {
      return {
        strategy: 'blue-green',
        reason: 'Blue-green provides instant rollback for stateful applications',
      };
    }

    return {
      strategy: 'rolling',
      reason: 'Rolling updates provide zero-downtime with minimal resource overhead',
    };
  }

  /**
   * Estimate deployment duration
   */
  estimateDuration(config: RollingConfig | BlueGreenConfig | CanaryConfig): number {
    switch (config.strategy) {
      case 'rolling': {
        const batches = Math.ceil(10 / (config.batchSize || 1)); // Assume 10 replicas
        const pauseTime = (config.pauseBetweenBatches || 30) * (batches - 1);
        return batches * 60 + pauseTime; // 60s per batch + pauses
      }

      case 'blue-green': {
        return (config.testingTime || 300) + 30; // Testing time + switch time
      }

      case 'canary': {
        return config.steps.reduce((total, step) => total + step.duration, 0);
      }

      default:
        return 120; // Default 2 minutes
    }
  }

  // ===========================================
  // PLAN GENERATORS
  // ===========================================

  private generateRollingPlan(config: RollingConfig): RolloutStep[] {
    const batches = Math.ceil(10 / (config.batchSize || 2));
    const steps: RolloutStep[] = [];

    steps.push({
      phase: 'prepare',
      action: 'Pull new image and prepare for rollout',
      healthCheck: true,
    });

    for (let i = 1; i <= batches; i++) {
      const progress = Math.round((i / batches) * 100);
      steps.push({
        phase: `batch-${i}`,
        action: `Update batch ${i} of ${batches}`,
        trafficWeight: progress,
        duration: config.pauseBetweenBatches || 30,
        healthCheck: true,
      });
    }

    steps.push({
      phase: 'complete',
      action: 'Rolling update complete',
      trafficWeight: 100,
    });

    return steps;
  }

  private generateBlueGreenPlan(config: BlueGreenConfig): RolloutStep[] {
    return [
      {
        phase: 'prepare-green',
        action: 'Deploy new version to green environment',
        trafficWeight: 0,
        healthCheck: true,
      },
      {
        phase: 'test-green',
        action: 'Run tests on green environment',
        duration: config.testingTime || 300,
        healthCheck: true,
      },
      {
        phase: 'switch-traffic',
        action: 'Switch all traffic to green',
        trafficWeight: 100,
      },
      {
        phase: 'monitor',
        action: 'Monitor green environment',
        duration: 300,
        healthCheck: true,
      },
      {
        phase: 'cleanup-blue',
        action: 'Scale down blue environment',
      },
    ];
  }

  private generateCanaryPlan(config: CanaryConfig): RolloutStep[] {
    const steps: RolloutStep[] = [];

    steps.push({
      phase: 'deploy-canary',
      action: 'Deploy canary with initial traffic',
      trafficWeight: config.initialWeight,
      healthCheck: true,
    });

    config.steps.forEach((step, index) => {
      steps.push({
        phase: `rollout-${index + 1}`,
        action: `Increase traffic to ${step.weight}%`,
        trafficWeight: step.weight,
        duration: step.duration,
        healthCheck: true,
      });
    });

    steps.push({
      phase: 'complete',
      action: 'Canary rollout complete',
      trafficWeight: 100,
    });

    return steps;
  }

  private generateShadowPlan(config: ShadowConfig): RolloutStep[] {
    return [
      {
        phase: 'deploy-shadow',
        action: 'Deploy shadow environment',
        trafficWeight: 0,
      },
      {
        phase: 'mirror-traffic',
        action: 'Start mirroring production traffic',
        duration: config.comparisonduration,
      },
      {
        phase: 'analyze',
        action: 'Analyze shadow responses vs production',
        healthCheck: true,
      },
      {
        phase: 'report',
        action: 'Generate comparison report',
      },
    ];
  }

  private generateRecreatePlan(_config: StrategyConfig): RolloutStep[] {
    return [
      {
        phase: 'scale-down',
        action: 'Terminate all existing replicas',
        trafficWeight: 0,
      },
      {
        phase: 'deploy',
        action: 'Deploy new version',
        healthCheck: true,
      },
      {
        phase: 'scale-up',
        action: 'Scale up new replicas',
        trafficWeight: 100,
      },
    ];
  }

  // ===========================================
  // HELPERS
  // ===========================================

  private async saveState(state: DeploymentState): Promise<void> {
    await this.redis.set(
      `deployment:state:${state.id}`,
      JSON.stringify(state),
      'EX',
      86400 * 7 // 7 days TTL
    );

    // Also track by project
    await this.redis.lpush(`deployment:history:${state.projectId}`, state.id);
    await this.redis.ltrim(`deployment:history:${state.projectId}`, 0, 99); // Keep last 100
  }

  /**
   * Get deployment history for a project
   */
  async getDeploymentHistory(projectId: string, limit = 10): Promise<DeploymentState[]> {
    const ids = await this.redis.lrange(`deployment:history:${projectId}`, 0, limit - 1);
    const states: DeploymentState[] = [];

    for (const id of ids) {
      const state = await this.getDeploymentState(id);
      if (state) states.push(state);
    }

    return states;
  }
}

// ===========================================
// EXPORTS
// ===========================================

export const deploymentStrategiesService = new DeploymentStrategiesService();
