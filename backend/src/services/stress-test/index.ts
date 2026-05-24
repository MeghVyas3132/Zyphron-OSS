// ===========================================
// STRESS TEST SERVICE — k6 in Docker
// Runs load tests against user deployments.
// ===========================================

import Docker from 'dockerode';
import { Writable } from 'stream';
import { createLogger } from '@/lib/logger.js';

const logger = createLogger('stress-test');

export interface StressTestConfig {
  targetUrl: string;
  virtualUsers: number;    // concurrent users
  durationSeconds: number; // test duration
  rampUpSeconds: number;   // ramp-up period
}

export interface StressTestResult {
  success: boolean;
  summary: StressTestSummary | null;
  error?: string;
  rawOutput?: string;
}

export interface StressTestSummary {
  totalRequests: number;
  failedRequests: number;
  requestRate: number;       // req/sec
  p50: number;               // ms
  p90: number;               // ms
  p95: number;               // ms
  p99: number;               // ms
  maxResponseTime: number;   // ms
  avgResponseTime: number;   // ms
  errorRate: number;         // percentage
  dataReceived: string;      // e.g. "12 MB"
  passed: boolean;           // thresholds met
  thresholds: Record<string, { passed: boolean; value: string }>;
}

// ===========================================
// K6 SCRIPT GENERATOR
// ===========================================

function generateK6Script(cfg: StressTestConfig): string {
  return `
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const failRate = new Rate('failed_requests');
const responseTime = new Trend('response_time');

export const options = {
  stages: [
    { duration: '${cfg.rampUpSeconds}s', target: ${cfg.virtualUsers} },
    { duration: '${cfg.durationSeconds - cfg.rampUpSeconds}s', target: ${cfg.virtualUsers} },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],        // <5% errors
    http_req_duration: ['p(95)<2000'],     // p95 < 2s
    http_req_duration: ['p(99)<5000'],     // p99 < 5s
  },
};

export default function () {
  const res = http.get('${cfg.targetUrl}', {
    headers: { 'User-Agent': 'Zyphron-StressTest/1.0' },
    timeout: '10s',
  });

  const ok = check(res, {
    'status 2xx': (r) => r.status >= 200 && r.status < 300,
    'response time < 3s': (r) => r.timings.duration < 3000,
  });

  failRate.add(!ok);
  responseTime.add(res.timings.duration);

  sleep(Math.random() * 0.5 + 0.1); // 100-600ms between requests
}
`.trim();
}

// ===========================================
// PARSE K6 OUTPUT
// ===========================================

function parseK6Output(output: string): StressTestSummary | null {
  try {
    // k6 outputs summary stats in a predictable format
    const extract = (pattern: RegExp): number => {
      const m = output.match(pattern);
      return m ? parseFloat(m[1]) : 0;
    };

    const extractStr = (pattern: RegExp): string => {
      const m = output.match(pattern);
      return m ? m[1] : '0';
    };

    const totalRequests = extract(/http_reqs\s+[\d.]+\s+(\d+)/);
    const failedRequests = extract(/http_req_failed\s+[\d.%]+\s+([\d.]+)%/);
    const requestRate = extract(/http_reqs\s+([\d.]+) req\/s/);
    const p50 = extract(/http_req_duration\s+p\(50\)=([\d.]+)/);
    const p90 = extract(/http_req_duration\s+p\(90\)=([\d.]+)/);
    const p95 = extract(/http_req_duration\s+p\(95\)=([\d.]+)/);
    const p99 = extract(/http_req_duration\s+p\(99\)=([\d.]+)/);
    const avg = extract(/http_req_duration\s+avg=([\d.]+)/);
    const maxRt = extract(/http_req_duration\s+max=([\d.]+)/);
    const dataReceived = extractStr(/data_received\s+([\d.]+\s+\w+)/);

    const thresholdsPassed = !output.includes('✗');
    const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;

    return {
      totalRequests,
      failedRequests: Math.round(failedRequests),
      requestRate: Math.round(requestRate * 100) / 100,
      p50: Math.round(p50),
      p90: Math.round(p90),
      p95: Math.round(p95),
      p99: Math.round(p99),
      avgResponseTime: Math.round(avg),
      maxResponseTime: Math.round(maxRt),
      errorRate: Math.round(errorRate * 100) / 100,
      dataReceived,
      passed: thresholdsPassed,
      thresholds: {
        'http_req_failed < 5%': {
          passed: errorRate < 5,
          value: `${errorRate.toFixed(2)}%`,
        },
        'p95 < 2000ms': {
          passed: p95 < 2000,
          value: `${Math.round(p95)}ms`,
        },
        'p99 < 5000ms': {
          passed: p99 < 5000,
          value: `${Math.round(p99)}ms`,
        },
      },
    };
  } catch (error) {
    logger.warn({ error }, 'Failed to parse k6 output');
    return null;
  }
}

// ===========================================
// RUN STRESS TEST
// ===========================================

export async function runStressTest(
  cfg: StressTestConfig,
  opts?: {
    onLog?: (line: string) => void;
    userEmail?: string;
    userName?: string;
    projectName?: string;
    projectId?: string;
  }
): Promise<StressTestResult> {
  const docker = new Docker();
  const script = generateK6Script(cfg);
  const outputChunks: string[] = [];

  logger.info({ targetUrl: cfg.targetUrl, vus: cfg.virtualUsers, duration: cfg.durationSeconds }, 'Starting stress test');

  try {
    // Pull k6 image if needed (silent fail — image might already exist)
    try {
      await new Promise<void>((resolve) => {
        docker.pull('grafana/k6:latest', {}, (err, stream) => {
          if (err || !stream) return resolve();
          docker.modem.followProgress(stream, () => resolve());
        });
      });
    } catch { /* ignore pull errors */ }

    // Create container with k6 script piped via env var
    const container = await docker.createContainer({
      Image: 'grafana/k6:latest',
      Cmd: ['run', '--out', 'json=/tmp/results.json', '-'],
      Env: [`K6_SCRIPT=${script}`],
      // Pipe script via stdin
      AttachStdin: true,
      OpenStdin: true,
      StdinOnce: true,
      HostConfig: {
        AutoRemove: true,
        // Allow container to reach host network deployments
        NetworkMode: 'host',
        // Resource limits for test runner
        Memory: 256 * 1024 * 1024, // 256MB
        NanoCpus: 1e9, // 1 CPU
      },
    });

    // Attach and write script to stdin
    const stream = await container.attach({ stream: true, stdin: true, stdout: true, stderr: true });

    // Collect output via proper Writable streams
    const stdoutSink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        const line = chunk.toString();
        outputChunks.push(line);
        opts?.onLog?.(line.trim());
        cb();
      },
    });
    const stderrSink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        const line = chunk.toString();
        outputChunks.push(line);
        opts?.onLog?.(`[stderr] ${line.trim()}`);
        cb();
      },
    });
    docker.modem.demuxStream(stream, stdoutSink, stderrSink);

    // Write script to stdin then close
    stream.write(`${script}\n`);
    stream.end();

    await container.start();
    await container.wait();

    const fullOutput = outputChunks.join('');
    const summary = parseK6Output(fullOutput);

    if (opts?.userEmail && summary) {
      logger.info(
        { email: opts.userEmail, p95: summary.p95, passed: summary.passed },
        'Stress test complete'
      );
    }

    return { success: true, summary, rawOutput: fullOutput };

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, 'Stress test failed');
    return { success: false, summary: null, error: msg };
  }
}

// ===========================================
// QUICK HEALTH PROBE (used for smoke test)
// ===========================================

export async function quickHealthProbe(url: string): Promise<{
  reachable: boolean;
  responseTimeMs: number;
  statusCode?: number;
}> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return {
      reachable: true,
      responseTimeMs: Date.now() - start,
      statusCode: res.status,
    };
  } catch {
    return { reachable: false, responseTimeMs: Date.now() - start };
  }
}
