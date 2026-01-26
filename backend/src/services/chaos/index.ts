// ===========================================
// CHAOS ENGINEERING SERVICE
// Controlled failure injection and resilience testing
// ===========================================

import { createLogger } from '../../lib/logger.js';
import { getRedisClient } from '../../lib/redis.js';

const logger = createLogger('chaos-engineering');

// ===========================================
// TYPES
// ===========================================

export type ExperimentType =
  | 'pod-failure'
  | 'network-latency'
  | 'network-partition'
  | 'cpu-stress'
  | 'memory-stress'
  | 'disk-stress'
  | 'dns-failure'
  | 'http-error'
  | 'time-skew';

export type ExperimentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted';

export interface ChaosExperiment {
  id: string;
  projectId: string;
  name: string;
  description: string;
  type: ExperimentType;
  config: ExperimentConfig;
  target: ExperimentTarget;
  schedule?: ExperimentSchedule;
  status: ExperimentStatus;
  results?: ExperimentResults;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdBy: string;
}

export interface ExperimentConfig {
  duration: number; // seconds
  intensity: 'low' | 'medium' | 'high';
  parameters: Record<string, unknown>;
  safetyChecks: SafetyCheck[];
  rollbackOnFailure: boolean;
}

export interface ExperimentTarget {
  type: 'deployment' | 'service' | 'pod' | 'namespace';
  selector: Record<string, string>;
  percentage?: number; // % of targets to affect
  count?: number; // absolute number of targets
}

export interface ExperimentSchedule {
  enabled: boolean;
  cron?: string;
  runOnce?: Date;
  timezone?: string;
}

export interface SafetyCheck {
  type: 'metric' | 'health' | 'error-rate';
  threshold: number;
  action: 'abort' | 'pause' | 'alert';
}

export interface ExperimentResults {
  success: boolean;
  affectedTargets: number;
  observations: Observation[];
  metrics: {
    before: Record<string, number>;
    during: Record<string, number>;
    after: Record<string, number>;
  };
  incidents: Incident[];
  recommendations: string[];
}

export interface Observation {
  timestamp: Date;
  type: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

export interface Incident {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: Date;
  resolvedAt?: Date;
  autoRecovered: boolean;
}

// ===========================================
// EXPERIMENT TEMPLATES
// ===========================================

export const EXPERIMENT_TEMPLATES: Record<ExperimentType, {
  name: string;
  description: string;
  defaultConfig: Partial<ExperimentConfig>;
}> = {
  'pod-failure': {
    name: 'Pod Failure',
    description: 'Randomly kill pods to test auto-recovery',
    defaultConfig: {
      duration: 60,
      intensity: 'medium',
      parameters: {
        killInterval: 10,
        gracePeriod: 5,
      },
    },
  },
  'network-latency': {
    name: 'Network Latency',
    description: 'Inject network latency to test timeout handling',
    defaultConfig: {
      duration: 120,
      intensity: 'medium',
      parameters: {
        latencyMs: 200,
        jitterMs: 50,
        correlation: 0.25,
      },
    },
  },
  'network-partition': {
    name: 'Network Partition',
    description: 'Simulate network partition between services',
    defaultConfig: {
      duration: 60,
      intensity: 'high',
      parameters: {
        direction: 'both',
        targetService: '',
      },
    },
  },
  'cpu-stress': {
    name: 'CPU Stress',
    description: 'Stress CPU to test resource limits and throttling',
    defaultConfig: {
      duration: 120,
      intensity: 'medium',
      parameters: {
        workers: 2,
        loadPercent: 80,
      },
    },
  },
  'memory-stress': {
    name: 'Memory Stress',
    description: 'Consume memory to test OOM handling',
    defaultConfig: {
      duration: 60,
      intensity: 'medium',
      parameters: {
        targetMb: 256,
        growthRate: 'gradual',
      },
    },
  },
  'disk-stress': {
    name: 'Disk Stress',
    description: 'Fill disk space to test disk full scenarios',
    defaultConfig: {
      duration: 60,
      intensity: 'low',
      parameters: {
        fillPercent: 80,
        path: '/tmp',
      },
    },
  },
  'dns-failure': {
    name: 'DNS Failure',
    description: 'Simulate DNS resolution failures',
    defaultConfig: {
      duration: 30,
      intensity: 'high',
      parameters: {
        domains: ['*'],
        failureRate: 1.0,
      },
    },
  },
  'http-error': {
    name: 'HTTP Error Injection',
    description: 'Inject HTTP errors into responses',
    defaultConfig: {
      duration: 60,
      intensity: 'medium',
      parameters: {
        statusCode: 500,
        errorRate: 0.5,
        paths: ['/*'],
      },
    },
  },
  'time-skew': {
    name: 'Time Skew',
    description: 'Offset system time to test time-sensitive operations',
    defaultConfig: {
      duration: 120,
      intensity: 'low',
      parameters: {
        offsetSeconds: 3600,
        direction: 'forward',
      },
    },
  },
};

// ===========================================
// CHAOS ENGINEERING SERVICE
// ===========================================

export class ChaosEngineeringService {
  private redis = getRedisClient();
  private runningExperiments: Map<string, boolean> = new Map();

  /**
   * Get available experiment types
   */
  getExperimentTypes(): { type: ExperimentType; name: string; description: string }[] {
    return Object.entries(EXPERIMENT_TEMPLATES).map(([type, template]) => ({
      type: type as ExperimentType,
      name: template.name,
      description: template.description,
    }));
  }

  /**
   * Create a new experiment
   */
  async createExperiment(params: {
    projectId: string;
    name: string;
    description?: string;
    type: ExperimentType;
    config?: Partial<ExperimentConfig>;
    target: ExperimentTarget;
    schedule?: ExperimentSchedule;
    createdBy: string;
  }): Promise<ChaosExperiment> {
    const template = EXPERIMENT_TEMPLATES[params.type];

    const experiment: ChaosExperiment = {
      id: `chaos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: params.projectId,
      name: params.name,
      description: params.description || template.description,
      type: params.type,
      config: {
        duration: params.config?.duration || template.defaultConfig.duration || 60,
        intensity: params.config?.intensity || template.defaultConfig.intensity || 'medium',
        parameters: { ...template.defaultConfig.parameters, ...params.config?.parameters },
        safetyChecks: params.config?.safetyChecks || [
          { type: 'error-rate', threshold: 50, action: 'abort' },
          { type: 'health', threshold: 0, action: 'abort' },
        ],
        rollbackOnFailure: params.config?.rollbackOnFailure ?? true,
      },
      target: params.target,
      schedule: params.schedule,
      status: 'pending',
      createdAt: new Date(),
      createdBy: params.createdBy,
    };

    await this.saveExperiment(experiment);
    logger.info({ experimentId: experiment.id, type: params.type }, 'Chaos experiment created');

    return experiment;
  }

  /**
   * Get experiment by ID
   */
  async getExperiment(experimentId: string): Promise<ChaosExperiment | null> {
    const data = await this.redis.get(`chaos:experiment:${experimentId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get all experiments for a project
   */
  async getProjectExperiments(projectId: string): Promise<ChaosExperiment[]> {
    const ids = await this.redis.smembers(`chaos:experiments:${projectId}`);
    const experiments: ChaosExperiment[] = [];

    for (const id of ids) {
      const exp = await this.getExperiment(id);
      if (exp) experiments.push(exp);
    }

    return experiments.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Run an experiment
   */
  async runExperiment(experimentId: string): Promise<ChaosExperiment> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) throw new Error('Experiment not found');

    if (experiment.status === 'running') {
      throw new Error('Experiment is already running');
    }

    experiment.status = 'running';
    experiment.startedAt = new Date();
    experiment.results = {
      success: false,
      affectedTargets: 0,
      observations: [],
      metrics: { before: {}, during: {}, after: {} },
      incidents: [],
      recommendations: [],
    };

    await this.saveExperiment(experiment);
    this.runningExperiments.set(experimentId, true);

    logger.info({ experimentId, type: experiment.type }, 'Chaos experiment started');

    // Run experiment in background
    this.executeExperiment(experiment).catch(error => {
      logger.error({ error, experimentId }, 'Experiment execution failed');
    });

    return experiment;
  }

  /**
   * Abort a running experiment
   */
  async abortExperiment(experimentId: string): Promise<ChaosExperiment | null> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) return null;

    if (experiment.status !== 'running') {
      throw new Error('Experiment is not running');
    }

    this.runningExperiments.set(experimentId, false);

    experiment.status = 'aborted';
    experiment.completedAt = new Date();
    experiment.results?.observations.push({
      timestamp: new Date(),
      type: 'warning',
      message: 'Experiment aborted by user',
    });

    await this.saveExperiment(experiment);
    logger.warn({ experimentId }, 'Chaos experiment aborted');

    return experiment;
  }

  /**
   * Delete an experiment
   */
  async deleteExperiment(experimentId: string): Promise<boolean> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) return false;

    if (experiment.status === 'running') {
      throw new Error('Cannot delete running experiment');
    }

    await this.redis.del(`chaos:experiment:${experimentId}`);
    await this.redis.srem(`chaos:experiments:${experiment.projectId}`, experimentId);

    return true;
  }

  /**
   * Get experiment history
   */
  async getExperimentHistory(projectId: string, limit = 20): Promise<{
    experiment: ChaosExperiment;
    success: boolean;
    duration: number;
  }[]> {
    const experiments = await this.getProjectExperiments(projectId);

    return experiments
      .filter(e => e.status === 'completed' || e.status === 'failed' || e.status === 'aborted')
      .slice(0, limit)
      .map(e => ({
        experiment: e,
        success: e.results?.success || false,
        duration: e.completedAt && e.startedAt
          ? new Date(e.completedAt).getTime() - new Date(e.startedAt).getTime()
          : 0,
      }));
  }

  /**
   * Get resilience score for a project
   */
  async getResilienceScore(projectId: string): Promise<{
    score: number;
    breakdown: {
      category: string;
      score: number;
      tested: boolean;
      lastTested?: Date;
    }[];
    recommendations: string[];
  }> {
    const experiments = await this.getProjectExperiments(projectId);
    const completedExperiments = experiments.filter(e => e.status === 'completed');

    const categories = [
      { category: 'Pod Recovery', types: ['pod-failure'] },
      { category: 'Network Resilience', types: ['network-latency', 'network-partition', 'dns-failure'] },
      { category: 'Resource Limits', types: ['cpu-stress', 'memory-stress', 'disk-stress'] },
      { category: 'Error Handling', types: ['http-error'] },
      { category: 'Time Sensitivity', types: ['time-skew'] },
    ];

    const breakdown = categories.map(cat => {
      const categoryExperiments = completedExperiments.filter(e => 
        cat.types.includes(e.type)
      );
      const successfulExperiments = categoryExperiments.filter(e => e.results?.success);

      return {
        category: cat.category,
        score: categoryExperiments.length > 0
          ? Math.round((successfulExperiments.length / categoryExperiments.length) * 100)
          : 0,
        tested: categoryExperiments.length > 0,
        lastTested: categoryExperiments.length > 0
          ? new Date(Math.max(...categoryExperiments.map(e => new Date(e.completedAt!).getTime())))
          : undefined,
      };
    });

    const testedCategories = breakdown.filter(b => b.tested);
    const overallScore = testedCategories.length > 0
      ? Math.round(testedCategories.reduce((sum, b) => sum + b.score, 0) / testedCategories.length)
      : 0;

    const recommendations: string[] = [];
    for (const b of breakdown) {
      if (!b.tested) {
        recommendations.push(`Run ${b.category.toLowerCase()} tests to improve coverage`);
      } else if (b.score < 70) {
        recommendations.push(`Improve ${b.category.toLowerCase()} resilience (current score: ${b.score}%)`);
      }
    }

    return {
      score: overallScore,
      breakdown,
      recommendations,
    };
  }

  /**
   * Get gameday scenarios
   */
  getGamedayScenarios(): {
    name: string;
    description: string;
    experiments: { type: ExperimentType; delay: number }[];
    estimatedDuration: number;
  }[] {
    return [
      {
        name: 'Basic Resilience Check',
        description: 'Quick check of pod recovery and basic network handling',
        experiments: [
          { type: 'pod-failure', delay: 0 },
          { type: 'network-latency', delay: 120 },
        ],
        estimatedDuration: 300,
      },
      {
        name: 'Network Chaos',
        description: 'Comprehensive network failure scenarios',
        experiments: [
          { type: 'network-latency', delay: 0 },
          { type: 'dns-failure', delay: 180 },
          { type: 'network-partition', delay: 300 },
        ],
        estimatedDuration: 480,
      },
      {
        name: 'Resource Exhaustion',
        description: 'Test behavior under resource constraints',
        experiments: [
          { type: 'cpu-stress', delay: 0 },
          { type: 'memory-stress', delay: 180 },
          { type: 'disk-stress', delay: 300 },
        ],
        estimatedDuration: 480,
      },
      {
        name: 'Full Stack Chaos',
        description: 'Complete chaos engineering gameday',
        experiments: [
          { type: 'pod-failure', delay: 0 },
          { type: 'network-latency', delay: 120 },
          { type: 'cpu-stress', delay: 300 },
          { type: 'http-error', delay: 480 },
          { type: 'dns-failure', delay: 600 },
        ],
        estimatedDuration: 900,
      },
    ];
  }

  // ===========================================
  // PRIVATE HELPERS
  // ===========================================

  private async saveExperiment(experiment: ChaosExperiment): Promise<void> {
    await this.redis.set(
      `chaos:experiment:${experiment.id}`,
      JSON.stringify(experiment),
      'EX',
      86400 * 30 // 30 days TTL
    );
    await this.redis.sadd(`chaos:experiments:${experiment.projectId}`, experiment.id);
  }

  private async executeExperiment(experiment: ChaosExperiment): Promise<void> {
    const startTime = Date.now();

    try {
      // Record "before" metrics
      experiment.results!.metrics.before = await this.collectMetrics(experiment);
      experiment.results!.observations.push({
        timestamp: new Date(),
        type: 'info',
        message: 'Collected baseline metrics',
      });

      // Simulate target selection
      const targetCount = experiment.target.count || 
        Math.ceil((experiment.target.percentage || 100) / 100 * 3);
      experiment.results!.affectedTargets = targetCount;

      // Inject chaos based on type
      await this.injectChaos(experiment);

      // Monitor during experiment
      const checkInterval = setInterval(async () => {
        if (!this.runningExperiments.get(experiment.id)) {
          clearInterval(checkInterval);
          return;
        }

        // Collect metrics during experiment
        const metrics = await this.collectMetrics(experiment);
        experiment.results!.metrics.during = metrics;

        // Check safety conditions
        const safetyViolation = await this.checkSafetyConditions(experiment, metrics);
        if (safetyViolation) {
          clearInterval(checkInterval);
          await this.abortExperiment(experiment.id);
        }

        await this.saveExperiment(experiment);
      }, 5000);

      // Wait for experiment duration
      await new Promise(resolve => setTimeout(resolve, experiment.config.duration * 1000));
      clearInterval(checkInterval);

      // Stop chaos injection
      await this.stopChaos(experiment);

      // Collect "after" metrics
      experiment.results!.metrics.after = await this.collectMetrics(experiment);

      // Analyze results
      experiment.results!.success = this.analyzeResults(experiment);
      experiment.results!.recommendations = this.generateRecommendations(experiment);
      experiment.results!.observations.push({
        timestamp: new Date(),
        type: 'info',
        message: 'Experiment completed',
        details: {
          duration: Date.now() - startTime,
          success: experiment.results!.success,
        },
      });

      experiment.status = 'completed';
      experiment.completedAt = new Date();

    } catch (error) {
      experiment.status = 'failed';
      experiment.completedAt = new Date();
      experiment.results!.observations.push({
        timestamp: new Date(),
        type: 'error',
        message: `Experiment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }

    this.runningExperiments.delete(experiment.id);
    await this.saveExperiment(experiment);

    logger.info(
      { experimentId: experiment.id, status: experiment.status, success: experiment.results?.success },
      'Chaos experiment completed'
    );
  }

  private async injectChaos(experiment: ChaosExperiment): Promise<void> {
    logger.info(
      { experimentId: experiment.id, type: experiment.type },
      'Injecting chaos'
    );

    // In production, would use chaos-mesh, litmus, or similar
    experiment.results!.observations.push({
      timestamp: new Date(),
      type: 'info',
      message: `Started ${experiment.type} injection`,
      details: experiment.config.parameters,
    });
  }

  private async stopChaos(experiment: ChaosExperiment): Promise<void> {
    logger.info({ experimentId: experiment.id }, 'Stopping chaos injection');

    experiment.results!.observations.push({
      timestamp: new Date(),
      type: 'info',
      message: 'Stopped chaos injection',
    });
  }

  private async collectMetrics(_experiment: ChaosExperiment): Promise<Record<string, number>> {
    // In production, would query Prometheus/metrics API
    return {
      requestRate: Math.random() * 1000,
      errorRate: Math.random() * 5,
      latencyP99: Math.random() * 500,
      cpuUsage: Math.random() * 100,
      memoryUsage: Math.random() * 100,
    };
  }

  private async checkSafetyConditions(
    experiment: ChaosExperiment,
    metrics: Record<string, number>
  ): Promise<SafetyCheck | null> {
    for (const check of experiment.config.safetyChecks) {
      let violated = false;

      switch (check.type) {
        case 'error-rate':
          violated = metrics.errorRate > check.threshold;
          break;
        case 'health':
          violated = metrics.requestRate === 0;
          break;
        case 'metric':
          // Custom metric check
          break;
      }

      if (violated) {
        experiment.results!.observations.push({
          timestamp: new Date(),
          type: 'warning',
          message: `Safety check triggered: ${check.type} exceeded threshold`,
          details: { check, currentValue: metrics },
        });
        return check;
      }
    }

    return null;
  }

  private analyzeResults(experiment: ChaosExperiment): boolean {
    const { before, after } = experiment.results!.metrics;

    // Check if system recovered
    const recovered = 
      after.errorRate <= before.errorRate * 1.5 &&
      after.latencyP99 <= before.latencyP99 * 2;

    return recovered;
  }

  private generateRecommendations(experiment: ChaosExperiment): string[] {
    const recommendations: string[] = [];
    const { before, during, after } = experiment.results!.metrics;

    if (during.errorRate > before.errorRate * 5) {
      recommendations.push('Consider implementing circuit breakers to handle cascading failures');
    }

    if (during.latencyP99 > before.latencyP99 * 10) {
      recommendations.push('Review timeout configurations - current values may be too aggressive');
    }

    if (after.errorRate > before.errorRate * 1.5) {
      recommendations.push('System did not fully recover - investigate recovery procedures');
    }

    if (experiment.results!.incidents.length > 0) {
      recommendations.push('Review incident responses and update runbooks accordingly');
    }

    if (recommendations.length === 0) {
      recommendations.push('System showed good resilience! Consider increasing test intensity');
    }

    return recommendations;
  }
}

// ===========================================
// EXPORTS
// ===========================================

export const chaosEngineeringService = new ChaosEngineeringService();
