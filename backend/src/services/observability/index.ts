// ===========================================
// OBSERVABILITY SERVICE
// Real p95/p99 via Prometheus + Traefik metrics.
// Traffic spike detection with email alerts.
// ===========================================

import { createLogger } from '@/lib/logger.js';
import { config } from '@/config/index.js';
import { emailService } from '@/services/email/index.js';
import { prisma } from '@/lib/prisma.js';

const logger = createLogger('observability');

export interface SREMetrics {
  requestRate: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  uptime: number;
  activeConnections: number;
  totalRequests: number;
  totalErrors: number;
}

export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

// ===========================================
// PROMETHEUS HTTP CLIENT
// ===========================================

async function queryPrometheus(query: string): Promise<number | null> {
  try {
    const url = `${config.prometheus.url}/api/v1/query?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json() as {
      status: string;
      data: { result: Array<{ value: [number, string] }> };
    };
    if (json.status !== 'success' || json.data.result.length === 0) return null;
    return parseFloat(json.data.result[0].value[1]);
  } catch {
    return null;
  }
}

async function queryPrometheusRange(
  query: string, start: number, end: number, step: string
): Promise<TimeSeriesPoint[]> {
  try {
    const url = `${config.prometheus.url}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const json = await res.json() as {
      status: string;
      data: { result: Array<{ values: Array<[number, string]> }> };
    };
    if (json.status !== 'success' || !json.data.result[0]) return [];
    return json.data.result[0].values.map(([ts, val]) => ({
      timestamp: ts * 1000,
      value: parseFloat(val),
    }));
  } catch {
    return [];
  }
}

// Traefik router/service names contain the project slug
function serviceSelector(projectSlug: string): string {
  return `{service=~"zyphron-${projectSlug}.*@docker"}`;
}

// ===========================================
// PER-PROJECT METRICS
// ===========================================

export async function getProjectMetrics(projectSlug: string): Promise<SREMetrics> {
  const sel = serviceSelector(projectSlug);

  const [requestRate, p50, p95, p99, totalRequests, totalErrors] = await Promise.all([
    queryPrometheus(`sum(rate(traefik_service_requests_total${sel}[1m]))`),
    queryPrometheus(`histogram_quantile(0.50, sum(rate(traefik_service_request_duration_seconds_bucket${sel}[5m])) by (le)) * 1000`),
    queryPrometheus(`histogram_quantile(0.95, sum(rate(traefik_service_request_duration_seconds_bucket${sel}[5m])) by (le)) * 1000`),
    queryPrometheus(`histogram_quantile(0.99, sum(rate(traefik_service_request_duration_seconds_bucket${sel}[5m])) by (le)) * 1000`),
    queryPrometheus(`sum(traefik_service_requests_total${sel})`),
    queryPrometheus(`sum(traefik_service_requests_total{code=~"5..",${sel.slice(1)})`),
  ]);

  const totalRate5m = await queryPrometheus(`sum(rate(traefik_service_requests_total${sel}[5m]))`);
  const errRate5m = await queryPrometheus(`sum(rate(traefik_service_requests_total{code=~"5..",${sel.slice(1)}[5m]))`);
  const errorRate = (totalRate5m && totalRate5m > 0 && errRate5m) ? (errRate5m / totalRate5m) * 100 : 0;

  return {
    requestRate: Math.round((requestRate ?? 0) * 100) / 100,
    errorRate: Math.round(errorRate * 100) / 100,
    p50: Math.round(p50 ?? 0),
    p95: Math.round(p95 ?? 0),
    p99: Math.round(p99 ?? 0),
    uptime: 0,
    activeConnections: 0,
    totalRequests: Math.round(totalRequests ?? 0),
    totalErrors: Math.round(totalErrors ?? 0),
  };
}

export async function getMetricsTimeSeries(
  projectSlug: string,
  metric: 'requestRate' | 'errorRate' | 'p95' | 'p99',
  rangeHours = 24
): Promise<TimeSeriesPoint[]> {
  const sel = serviceSelector(projectSlug);
  const end = Math.floor(Date.now() / 1000);
  const start = end - rangeHours * 3600;
  const step = rangeHours <= 1 ? '30s' : rangeHours <= 6 ? '1m' : '5m';

  const queries: Record<string, string> = {
    requestRate: `sum(rate(traefik_service_requests_total${sel}[1m]))`,
    errorRate: `sum(rate(traefik_service_requests_total{code=~"5..",${sel.slice(1)}[5m])) / sum(rate(traefik_service_requests_total${sel}[5m])) * 100`,
    p95: `histogram_quantile(0.95, sum(rate(traefik_service_request_duration_seconds_bucket${sel}[5m])) by (le)) * 1000`,
    p99: `histogram_quantile(0.99, sum(rate(traefik_service_request_duration_seconds_bucket${sel}[5m])) by (le)) * 1000`,
  };

  return queryPrometheusRange(queries[metric], start, end, step);
}

// ===========================================
// PLATFORM METRICS (admin view)
// ===========================================

export async function getPlatformMetrics() {
  const [totalRate, errorRate, avgP95] = await Promise.all([
    queryPrometheus('sum(rate(traefik_service_requests_total[5m]))'),
    queryPrometheus('sum(rate(traefik_service_requests_total{code=~"5.."}[5m])) / sum(rate(traefik_service_requests_total[5m])) * 100'),
    queryPrometheus('histogram_quantile(0.95, sum(rate(traefik_service_request_duration_seconds_bucket[5m])) by (le)) * 1000'),
  ]);

  const [activeDeployments, totalUsers] = await Promise.all([
    prisma.deployment.count({ where: { status: 'LIVE' } }),
    prisma.user.count({ where: { isActive: true } }),
  ]);

  return {
    requestRate: Math.round((totalRate ?? 0) * 100) / 100,
    platformErrorRate: Math.round((errorRate ?? 0) * 100) / 100,
    platformP95: Math.round(avgP95 ?? 0),
    activeDeployments,
    totalUsers,
    prometheusAvailable: totalRate !== null,
  };
}

// ===========================================
// TRAFFIC SPIKE MONITOR — runs every 60s via setInterval
// ===========================================

const SPIKE_THRESHOLD_RPS = 50;
const SPIKE_COOLDOWN_MS = 15 * 60_000;
const lastAlertTime = new Map<string, number>();

export async function checkTrafficSpikes(): Promise<void> {
  try {
    const liveDeployments = await prisma.deployment.findMany({
      where: { status: 'LIVE' },
      include: {
        project: { include: { user: { select: { email: true, name: true } } } },
      },
    });

    for (const dep of liveDeployments) {
      const slug = dep.project.slug;
      const rps = await queryPrometheus(
        `sum(rate(traefik_service_requests_total${serviceSelector(slug)}[1m]))`
      );
      if (!rps || rps < SPIKE_THRESHOLD_RPS) continue;

      const now = Date.now();
      if (now - (lastAlertTime.get(slug) ?? 0) < SPIKE_COOLDOWN_MS) continue;
      lastAlertTime.set(slug, now);

      const p95 = await queryPrometheus(
        `histogram_quantile(0.95, sum(rate(traefik_service_request_duration_seconds_bucket${serviceSelector(slug)}[1m])) by (le)) * 1000`
      ) ?? 0;

      const { user } = dep.project;
      if (user?.email) {
        void emailService.sendTrafficSpike(user.email, user.name || 'there', dep.project.name, rps, Math.round(p95), dep.project.id);
        logger.info({ slug, rps, p95 }, 'Traffic spike alert sent');
      }
    }
  } catch (error) {
    logger.error({ error }, 'Traffic spike check failed');
  }
}

// Start background spike monitor when module loads (only in production)
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => { void checkTrafficSpikes(); }, 60_000);
}

// ===========================================
// COMPAT TYPES — used by routes/observability.ts
// ===========================================

export type AlertCondition = {
  metric: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  threshold: number;
  duration?: number;
};

export type NotificationChannel = {
  type: 'email' | 'slack' | 'webhook';
  target: string;
};

export type DashboardPanel = {
  id: string;
  type: string;
  title: string;
  query?: string;
};

// ===========================================
// COMPAT SHIM — observabilityService object
// Wraps new function-based API; stubs legacy methods.
// ===========================================

export const observabilityService = {
  async recordMetric(_m: unknown) { return; },
  async queryMetrics(_q: unknown) { return []; },
  async getDeploymentMetrics(deploymentId: string) {
    return getProjectMetrics(deploymentId);
  },
  async startTrace(_span: unknown) { return { traceId: crypto.randomUUID(), spanId: crypto.randomUUID() }; },
  async getTrace(_traceId: string): Promise<unknown[]> { return []; },
  async searchTraces(_q: unknown) { return []; },
  async createAlert(_a: unknown) { return { id: crypto.randomUUID() }; },
  async getProjectAlerts(_projectId: string) { return []; },
  async silenceAlert(_id: string, _duration: number) { return; },
  async deleteAlert(_id: string) { return true; },
  async queryLogs(_q: unknown) { return []; },
  async createDashboard(d: { name: string; projectId: string }) {
    return { id: crypto.randomUUID(), name: d.name, projectId: d.projectId, panels: [] };
  },
  async getProjectDashboards(_projectId: string) { return []; },
  getDefaultDashboard(projectId: string) {
    return { id: 'default', name: 'Overview', projectId, panels: [] };
  },
  async getDashboard(id: string) { return { id, name: 'Dashboard', panels: [] }; },
  async updateDashboard(id: string, updates: unknown) { return { id, ...updates as object }; },
  async deleteDashboard(_id: string) { return true; },
};
