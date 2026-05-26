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

export const options = {
  stages: [
    { duration: '${cfg.rampUpSeconds}s', target: ${cfg.virtualUsers} },
    { duration: '${cfg.durationSeconds - cfg.rampUpSeconds}s', target: ${cfg.virtualUsers} },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_failed': ['rate<0.05'],
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'],
  },
};

export default function () {
  const res = http.get('${cfg.targetUrl}', {
    headers: { 'User-Agent': 'Zyphron-StressTest/1.0' },
    timeout: '10s',
  });

  check(res, {
    'status 2xx': (r) => r.status >= 200 && r.status < 300,
    'response time < 3s': (r) => r.timings.duration < 3000,
  });

  sleep(Math.random() * 0.5 + 0.1);
}
`.trim();
}

// ===========================================
// PARSE K6 OUTPUT
// ===========================================

// k6 text summary output format (examples):
//   http_reqs......................: 127      4.23/s
//   http_req_failed................: 0.00%    ✓ 0       ✗ 127
//   http_req_duration..............: avg=7.19ms  min=5.17ms med=8.2ms max=8.22ms p(90)=8.22ms p(95)=8.22ms p(99)=8.22ms
//   data_received..................: 203 kB   6.7 kB/s
// NOTE: count comes BEFORE rate for http_reqs; latency uses human units (ms, µs, s)

/** Convert a k6 duration string (e.g. "7.19ms", "512µs", "1.2s") to milliseconds */
function parseDurationMs(raw: string): number {
  if (!raw) return 0;
  const m = raw.match(/([\d.]+)([\wµ]+)/u);
  if (!m) return parseFloat(raw) || 0;
  const n = parseFloat(m[1]);
  const u = m[2];
  if (u === 'µs' || u === 'us' || u === 'μs') return n / 1000; // microseconds → ms
  if (u === 'ms') return n;
  if (u === 's')  return n * 1000;  // seconds → ms
  return n;
}

function parseK6Output(output: string): StressTestSummary | null {
  try {
    const extractNum = (pattern: RegExp): number => {
      const m = output.match(pattern);
      return m ? parseFloat(m[1]) : 0;
    };

    const extractDur = (pattern: RegExp): number => {
      const m = output.match(pattern);
      return m ? parseDurationMs(m[1]) : 0;
    };

    // ── counts / rates ──────────────────────────────────────────────────────
    // "http_reqs....: 127      4.23/s"
    const totalRequests = extractNum(/http_reqs[^:]+:\s+(\d+)\s/);
    const requestRate   = extractNum(/http_reqs[^:]+:\s+\d+\s+([\d.]+)\//);

    // "http_req_failed....: 0.00%  ✓ 0  ✗ 0"
    const failedPct = extractNum(/http_req_failed[^:]+:\s+([\d.]+)%/);

    // ── latency ─────────────────────────────────────────────────────────────
    // "http_req_duration....: avg=7.19ms min=... med=... max=... p(90)=... p(95)=... p(99)=..."
    const avg   = extractDur(/http_req_duration[^:]+:.*?\bavg=(\S+)/);
    const maxRt = extractDur(/http_req_duration[^:]+:.*?\bmax=(\S+)/);
    const p50   = extractDur(/http_req_duration[^:]+:.*?\bmed=(\S+)/);   // med = p50
    const p90   = extractDur(/http_req_duration[^:]+:.*?\bp\(90\)=(\S+)/);
    const p95   = extractDur(/http_req_duration[^:]+:.*?\bp\(95\)=(\S+)/);
    const p99raw = extractDur(/http_req_duration[^:]+:.*?\bp\(99\)=(\S+)/);
    const p99   = p99raw > 0 ? p99raw : p95; // fallback to p95 when p(99) not in output

    // ── data ────────────────────────────────────────────────────────────────
    // "data_received....: 203 kB  6.7 kB/s"
    const dataMatch = output.match(/data_received[^:]+:\s+([\d.]+\s+\S+)/);
    const dataReceived = dataMatch ? dataMatch[1].trim() : '0 B';

    // ── thresholds (compute from values — more reliable than parsing ✗/✓) ──
    const errorRate = failedPct;
    const thresholdsPassed = failedPct < 5 && p95 < 2000 && p99 < 5000;

    logger.debug({ totalRequests, requestRate, failedPct, p50, p90, p95, p99, avg, maxRt }, 'k6 parsed metrics');

    return {
      totalRequests,
      failedRequests: totalRequests > 0 ? Math.round((failedPct / 100) * totalRequests) : 0,
      requestRate:   Math.round(requestRate * 100) / 100,
      p50:   Math.round(p50),
      p90:   Math.round(p90),
      p95:   Math.round(p95),
      p99:   Math.round(p99),
      avgResponseTime: Math.round(avg),
      maxResponseTime: Math.round(maxRt),
      errorRate: Math.round(errorRate * 100) / 100,
      dataReceived,
      passed: thresholdsPassed,
      thresholds: {
        'http_req_failed < 5%': { passed: failedPct < 5,  value: `${failedPct.toFixed(2)}%` },
        'p95 < 2000ms':          { passed: p95 < 2000,     value: `${Math.round(p95)}ms`      },
        'p99 < 5000ms':          { passed: p99 < 5000,     value: `${Math.round(p99)}ms`      },
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
  // Base64-encode the script so we can pass it via env var and decode inside the container.
  // This is more reliable than stdin piping in Docker-in-Docker environments.
  const scriptB64 = Buffer.from(script).toString('base64');
  const outputChunks: string[] = [];

  logger.info({ targetUrl: cfg.targetUrl, vus: cfg.virtualUsers, duration: cfg.durationSeconds }, 'Starting stress test');

  try {
    // Pull k6 image if needed (silent fail)
    try {
      await new Promise<void>((resolve) => {
        docker.pull('grafana/k6:latest', {}, (err, stream) => {
          if (err || !stream) return resolve();
          docker.modem.followProgress(stream, () => resolve());
        });
      });
    } catch { /* ignore pull errors */ }

    // Decode the base64 script to a temp file inside the container, then run k6.
    // Single-quotes around --summary-trend-stats value protect the parentheses from shell.
    const shellCmd =
      `echo "$K6_B64" | base64 -d > /tmp/script.js && ` +
      `k6 run '--summary-trend-stats=avg,min,med,max,p(90),p(95),p(99)' /tmp/script.js`;

    const container = await docker.createContainer({
      Image: 'grafana/k6:latest',
      // Override k6's entrypoint with sh so we can decode + run in one step
      Entrypoint: ['sh', '-c'],
      Cmd: [shellCmd],
      Env: [`K6_B64=${scriptB64}`],
      HostConfig: {
        AutoRemove: false,          // keep so we can remove after wait()
        NetworkMode: 'host',        // reach host-network deployments
        Memory: 512 * 1024 * 1024, // 512 MB for larger tests
        NanoCpus: 1e9,              // 1 CPU
      },
    });

    // Attach for stdout/stderr capture BEFORE start
    const stream = await container.attach({ stream: true, stdout: true, stderr: true });

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

    await container.start();
    const { StatusCode } = await container.wait();

    // Remove container now that we've collected the output
    try { await container.remove({ force: true }); } catch { /* ignore */ }

    const fullOutput = outputChunks.join('');
    logger.debug({ output: fullOutput.slice(0, 1000) }, 'k6 raw output (first 1000 chars)');

    const summary = parseK6Output(fullOutput);

    if (opts?.userEmail && summary) {
      logger.info({ email: opts.userEmail, p95: summary.p95, passed: summary.passed }, 'Stress test complete');
    }

    // success if k6 exited 0, OR if we managed to parse results (threshold failures exit non-zero)
    const success = StatusCode === 0 || (summary !== null && summary.totalRequests > 0);
    return { success, summary, rawOutput: fullOutput };

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
