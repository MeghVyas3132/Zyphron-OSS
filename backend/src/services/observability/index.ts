// ===========================================
// ADVANCED OBSERVABILITY SERVICE
// Metrics, Tracing, Alerts, and Logging
// ===========================================

import { createLogger } from '../../lib/logger.js';
import { getRedisClient } from '../../lib/redis.js';

const logger = createLogger('observability');

// ===========================================
// TYPES
// ===========================================

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: Date;
  labels: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  serviceName: string;
  operationName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'ok' | 'error' | 'timeout';
  tags: Record<string, string>;
  logs: { timestamp: Date; message: string }[];
}

export interface Alert {
  id: string;
  name: string;
  projectId: string;
  condition: AlertCondition;
  channels: NotificationChannel[];
  status: 'active' | 'firing' | 'resolved' | 'silenced';
  severity: 'critical' | 'warning' | 'info';
  createdAt: Date;
  lastFiredAt?: Date;
  resolvedAt?: Date;
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';
  threshold: number;
  duration: number; // seconds the condition must be true
  aggregation: 'avg' | 'sum' | 'min' | 'max' | 'count';
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'pagerduty' | 'discord';
  config: Record<string, string>;
  enabled: boolean;
}

export interface Dashboard {
  id: string;
  projectId: string;
  name: string;
  panels: DashboardPanel[];
  refreshInterval: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardPanel {
  id: string;
  title: string;
  type: 'graph' | 'stat' | 'table' | 'logs' | 'heatmap';
  query: string;
  position: { x: number; y: number; w: number; h: number };
  options: Record<string, unknown>;
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  service: string;
  traceId?: string;
  spanId?: string;
  metadata: Record<string, unknown>;
}

// ===========================================
// OBSERVABILITY SERVICE
// ===========================================

export class ObservabilityService {
  private redis = getRedisClient();

  // ===========================================
  // METRICS
  // ===========================================

  /**
   * Record a metric
   */
  async recordMetric(metric: MetricPoint): Promise<void> {
    const key = `metrics:${metric.name}:${this.labelsToKey(metric.labels)}`;

    const entry = {
      ...metric,
      timestamp: metric.timestamp.toISOString(),
    };

    // Store in time series
    await this.redis.zadd(
      key,
      metric.timestamp.getTime(),
      JSON.stringify(entry)
    );

    // Trim old data (keep last 24 hours)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    await this.redis.zremrangebyscore(key, 0, cutoff);
  }

  /**
   * Query metrics
   */
  async queryMetrics(params: {
    name: string;
    labels?: Record<string, string>;
    startTime: Date;
    endTime: Date;
    step?: number; // seconds
  }): Promise<{ timestamp: Date; value: number }[]> {
    const key = `metrics:${params.name}:${this.labelsToKey(params.labels || {})}`;

    const data = await this.redis.zrangebyscore(
      key,
      params.startTime.getTime(),
      params.endTime.getTime()
    );

    return data.map((d: string) => {
      const parsed = JSON.parse(d);
      return {
        timestamp: new Date(parsed.timestamp),
        value: parsed.value,
      };
    });
  }

  /**
   * Get aggregated metric value
   */
  async getAggregatedMetric(params: {
    name: string;
    labels?: Record<string, string>;
    duration: number; // seconds
    aggregation: 'avg' | 'sum' | 'min' | 'max' | 'count';
  }): Promise<number> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - params.duration * 1000);

    const metrics = await this.queryMetrics({
      name: params.name,
      labels: params.labels,
      startTime,
      endTime,
    });

    if (metrics.length === 0) return 0;

    const values = metrics.map(m => m.value);

    switch (params.aggregation) {
      case 'avg':
        return values.reduce((a, b) => a + b, 0) / values.length;
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'count':
        return values.length;
      default:
        return 0;
    }
  }

  /**
   * Get predefined metrics for a deployment
   */
  async getDeploymentMetrics(_deploymentId: string): Promise<{
    requests: number;
    errors: number;
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
    cpuUsage: number;
    memoryUsage: number;
    networkIn: number;
    networkOut: number;
  }> {
    // In production, would fetch from Prometheus/Victoria Metrics
    return {
      requests: Math.floor(Math.random() * 100000),
      errors: Math.floor(Math.random() * 100),
      latencyP50: Math.random() * 50,
      latencyP95: Math.random() * 200,
      latencyP99: Math.random() * 500,
      cpuUsage: Math.random() * 100,
      memoryUsage: Math.random() * 100,
      networkIn: Math.random() * 1000000,
      networkOut: Math.random() * 1000000,
    };
  }

  // ===========================================
  // DISTRIBUTED TRACING
  // ===========================================

  /**
   * Start a new trace
   */
  async startTrace(params: {
    serviceName: string;
    operationName: string;
    tags?: Record<string, string>;
  }): Promise<Span> {
    const span: Span = {
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
      name: params.operationName,
      serviceName: params.serviceName,
      operationName: params.operationName,
      startTime: new Date(),
      status: 'ok',
      tags: params.tags || {},
      logs: [],
    };

    await this.saveSpan(span);
    return span;
  }

  /**
   * Start a child span
   */
  async startSpan(params: {
    traceId: string;
    parentSpanId: string;
    serviceName: string;
    operationName: string;
    tags?: Record<string, string>;
  }): Promise<Span> {
    const span: Span = {
      traceId: params.traceId,
      spanId: this.generateSpanId(),
      parentSpanId: params.parentSpanId,
      name: params.operationName,
      serviceName: params.serviceName,
      operationName: params.operationName,
      startTime: new Date(),
      status: 'ok',
      tags: params.tags || {},
      logs: [],
    };

    await this.saveSpan(span);
    return span;
  }

  /**
   * End a span
   */
  async endSpan(span: Span, status?: 'ok' | 'error' | 'timeout'): Promise<Span> {
    span.endTime = new Date();
    span.duration = span.endTime.getTime() - span.startTime.getTime();
    span.status = status || 'ok';

    await this.saveSpan(span);
    return span;
  }

  /**
   * Add log to span
   */
  async addSpanLog(spanId: string, message: string): Promise<void> {
    const spanData = await this.redis.get(`trace:span:${spanId}`);
    if (!spanData) return;

    const span = JSON.parse(spanData) as Span;
    span.logs.push({ timestamp: new Date(), message });
    await this.saveSpan(span);
  }

  /**
   * Get trace by ID
   */
  async getTrace(traceId: string): Promise<Span[]> {
    const spanIds = await this.redis.smembers(`trace:spans:${traceId}`);
    const spans: Span[] = [];

    for (const spanId of spanIds) {
      const data = await this.redis.get(`trace:span:${spanId}`);
      if (data) spans.push(JSON.parse(data));
    }

    return spans.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  /**
   * Search traces
   */
  async searchTraces(params: {
    serviceName?: string;
    operationName?: string;
    minDuration?: number;
    maxDuration?: number;
    tags?: Record<string, string>;
    limit?: number;
  }): Promise<Span[][]> {
    // In production, would query Jaeger/Zipkin
    // For now, return empty
    logger.info({ params }, 'Searching traces');
    return [];
  }

  // ===========================================
  // ALERTS
  // ===========================================

  /**
   * Create an alert
   */
  async createAlert(params: {
    projectId: string;
    name: string;
    condition: AlertCondition;
    channels: NotificationChannel[];
    severity: Alert['severity'];
  }): Promise<Alert> {
    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: params.name,
      projectId: params.projectId,
      condition: params.condition,
      channels: params.channels,
      status: 'active',
      severity: params.severity,
      createdAt: new Date(),
    };

    await this.saveAlert(alert);
    logger.info({ alertId: alert.id, name: alert.name }, 'Alert created');

    return alert;
  }

  /**
   * Get alerts for a project
   */
  async getProjectAlerts(projectId: string): Promise<Alert[]> {
    const alertIds = await this.redis.smembers(`alerts:project:${projectId}`);
    const alerts: Alert[] = [];

    for (const id of alertIds) {
      const data = await this.redis.get(`alert:${id}`);
      if (data) alerts.push(JSON.parse(data));
    }

    return alerts;
  }

  /**
   * Evaluate alert conditions
   */
  async evaluateAlerts(projectId: string): Promise<{ alert: Alert; shouldFire: boolean }[]> {
    const alerts = await this.getProjectAlerts(projectId);
    const results: { alert: Alert; shouldFire: boolean }[] = [];

    for (const alert of alerts) {
      if (alert.status === 'silenced') {
        results.push({ alert, shouldFire: false });
        continue;
      }

      const value = await this.getAggregatedMetric({
        name: alert.condition.metric,
        duration: alert.condition.duration,
        aggregation: alert.condition.aggregation,
      });

      const shouldFire = this.evaluateCondition(value, alert.condition);
      results.push({ alert, shouldFire });

      if (shouldFire && alert.status !== 'firing') {
        await this.fireAlert(alert);
      } else if (!shouldFire && alert.status === 'firing') {
        await this.resolveAlert(alert.id);
      }
    }

    return results;
  }

  /**
   * Fire an alert
   */
  async fireAlert(alert: Alert): Promise<void> {
    alert.status = 'firing';
    alert.lastFiredAt = new Date();
    await this.saveAlert(alert);

    // Send notifications
    for (const channel of alert.channels) {
      if (channel.enabled) {
        await this.sendNotification(channel, alert);
      }
    }

    logger.warn({ alertId: alert.id, name: alert.name }, 'Alert fired');
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const data = await this.redis.get(`alert:${alertId}`);
    if (!data) return;

    const alert = JSON.parse(data) as Alert;
    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    await this.saveAlert(alert);

    logger.info({ alertId, name: alert.name }, 'Alert resolved');
  }

  /**
   * Silence an alert
   */
  async silenceAlert(alertId: string, duration: number): Promise<void> {
    const data = await this.redis.get(`alert:${alertId}`);
    if (!data) return;

    const alert = JSON.parse(data) as Alert;
    alert.status = 'silenced';
    await this.saveAlert(alert);

    // Schedule unsilence
    setTimeout(async () => {
      const currentData = await this.redis.get(`alert:${alertId}`);
      if (currentData) {
        const currentAlert = JSON.parse(currentData) as Alert;
        if (currentAlert.status === 'silenced') {
          currentAlert.status = 'active';
          await this.saveAlert(currentAlert);
        }
      }
    }, duration * 1000);

    logger.info({ alertId, duration }, 'Alert silenced');
  }

  /**
   * Delete an alert
   */
  async deleteAlert(alertId: string): Promise<boolean> {
    const data = await this.redis.get(`alert:${alertId}`);
    if (!data) return false;

    const alert = JSON.parse(data) as Alert;
    await this.redis.del(`alert:${alertId}`);
    await this.redis.srem(`alerts:project:${alert.projectId}`, alertId);

    return true;
  }

  // ===========================================
  // LOGGING
  // ===========================================

  /**
   * Store log entry
   */
  async log(entry: LogEntry): Promise<void> {
    const key = `logs:${entry.service}`;

    await this.redis.lpush(key, JSON.stringify({
      ...entry,
      timestamp: entry.timestamp.toISOString(),
    }));

    // Trim to last 10000 logs
    await this.redis.ltrim(key, 0, 9999);
  }

  /**
   * Query logs
   */
  async queryLogs(params: {
    service?: string;
    level?: LogEntry['level'];
    search?: string;
    traceId?: string;
    limit?: number;
  }): Promise<LogEntry[]> {
    const limit = params.limit || 100;
    const key = params.service ? `logs:${params.service}` : 'logs:*';

    let logs: string[];
    if (key.includes('*')) {
      const keys = await this.redis.keys(key);
      logs = [];
      for (const k of keys) {
        const serviceLogs = await this.redis.lrange(k, 0, limit - 1);
        logs.push(...serviceLogs);
      }
    } else {
      logs = await this.redis.lrange(key, 0, limit - 1);
    }

    let entries = logs.map((l: string) => JSON.parse(l) as LogEntry);

    // Apply filters
    if (params.level) {
      entries = entries.filter(e => e.level === params.level);
    }
    if (params.search) {
      const search = params.search.toLowerCase();
      entries = entries.filter(e => e.message.toLowerCase().includes(search));
    }
    if (params.traceId) {
      entries = entries.filter(e => e.traceId === params.traceId);
    }

    return entries.slice(0, limit);
  }

  // ===========================================
  // DASHBOARDS
  // ===========================================

  /**
   * Create a dashboard
   */
  async createDashboard(params: {
    projectId: string;
    name: string;
    panels?: DashboardPanel[];
    refreshInterval?: number;
  }): Promise<Dashboard> {
    const dashboard: Dashboard = {
      id: `dash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: params.projectId,
      name: params.name,
      panels: params.panels || [],
      refreshInterval: params.refreshInterval || 30,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveDashboard(dashboard);
    return dashboard;
  }

  /**
   * Get dashboard by ID
   */
  async getDashboard(dashboardId: string): Promise<Dashboard | null> {
    const data = await this.redis.get(`dashboard:${dashboardId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get project dashboards
   */
  async getProjectDashboards(projectId: string): Promise<Dashboard[]> {
    const dashIds = await this.redis.smembers(`dashboards:project:${projectId}`);
    const dashboards: Dashboard[] = [];

    for (const id of dashIds) {
      const dash = await this.getDashboard(id);
      if (dash) dashboards.push(dash);
    }

    return dashboards;
  }

  /**
   * Update dashboard
   */
  async updateDashboard(
    dashboardId: string,
    updates: Partial<Pick<Dashboard, 'name' | 'panels' | 'refreshInterval'>>
  ): Promise<Dashboard | null> {
    const dashboard = await this.getDashboard(dashboardId);
    if (!dashboard) return null;

    const updated = {
      ...dashboard,
      ...updates,
      updatedAt: new Date(),
    };

    await this.saveDashboard(updated);
    return updated;
  }

  /**
   * Delete dashboard
   */
  async deleteDashboard(dashboardId: string): Promise<boolean> {
    const dashboard = await this.getDashboard(dashboardId);
    if (!dashboard) return false;

    await this.redis.del(`dashboard:${dashboardId}`);
    await this.redis.srem(`dashboards:project:${dashboard.projectId}`, dashboardId);

    return true;
  }

  /**
   * Get default dashboard template
   */
  getDefaultDashboard(projectId: string): Dashboard {
    return {
      id: 'default',
      projectId,
      name: 'Overview',
      panels: [
        {
          id: 'requests',
          title: 'Request Rate',
          type: 'graph',
          query: 'rate(http_requests_total[5m])',
          position: { x: 0, y: 0, w: 6, h: 4 },
          options: { fill: true },
        },
        {
          id: 'errors',
          title: 'Error Rate',
          type: 'graph',
          query: 'rate(http_errors_total[5m])',
          position: { x: 6, y: 0, w: 6, h: 4 },
          options: { fill: true, color: 'red' },
        },
        {
          id: 'latency',
          title: 'P99 Latency',
          type: 'stat',
          query: 'histogram_quantile(0.99, http_request_duration_seconds)',
          position: { x: 0, y: 4, w: 3, h: 2 },
          options: { unit: 'ms' },
        },
        {
          id: 'cpu',
          title: 'CPU Usage',
          type: 'stat',
          query: 'container_cpu_usage_seconds_total',
          position: { x: 3, y: 4, w: 3, h: 2 },
          options: { unit: '%' },
        },
        {
          id: 'memory',
          title: 'Memory Usage',
          type: 'stat',
          query: 'container_memory_usage_bytes',
          position: { x: 6, y: 4, w: 3, h: 2 },
          options: { unit: 'bytes' },
        },
        {
          id: 'uptime',
          title: 'Uptime',
          type: 'stat',
          query: 'up',
          position: { x: 9, y: 4, w: 3, h: 2 },
          options: { unit: '%' },
        },
      ],
      refreshInterval: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ===========================================
  // PRIVATE HELPERS
  // ===========================================

  private labelsToKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
  }

  private generateTraceId(): string {
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  private generateSpanId(): string {
    return Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  private async saveSpan(span: Span): Promise<void> {
    await this.redis.set(
      `trace:span:${span.spanId}`,
      JSON.stringify(span),
      'EX',
      86400 // 24 hour TTL
    );
    await this.redis.sadd(`trace:spans:${span.traceId}`, span.spanId);
    await this.redis.expire(`trace:spans:${span.traceId}`, 86400);
  }

  private async saveAlert(alert: Alert): Promise<void> {
    await this.redis.set(`alert:${alert.id}`, JSON.stringify(alert));
    await this.redis.sadd(`alerts:project:${alert.projectId}`, alert.id);
  }

  private async saveDashboard(dashboard: Dashboard): Promise<void> {
    await this.redis.set(`dashboard:${dashboard.id}`, JSON.stringify(dashboard));
    await this.redis.sadd(`dashboards:project:${dashboard.projectId}`, dashboard.id);
  }

  private evaluateCondition(value: number, condition: AlertCondition): boolean {
    switch (condition.operator) {
      case 'gt':
        return value > condition.threshold;
      case 'lt':
        return value < condition.threshold;
      case 'gte':
        return value >= condition.threshold;
      case 'lte':
        return value <= condition.threshold;
      case 'eq':
        return value === condition.threshold;
      case 'neq':
        return value !== condition.threshold;
      default:
        return false;
    }
  }

  private async sendNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    logger.info({ channel: channel.type, alertId: alert.id }, 'Sending notification');

    // In production, would actually send to Slack/Email/PagerDuty
    switch (channel.type) {
      case 'slack':
        // Send Slack message
        break;
      case 'email':
        // Send email
        break;
      case 'pagerduty':
        // Create PagerDuty incident
        break;
      case 'webhook':
        // POST to webhook URL
        break;
      case 'discord':
        // Send Discord message
        break;
    }
  }
}

// ===========================================
// EXPORTS
// ===========================================

export const observabilityService = new ObservabilityService();
