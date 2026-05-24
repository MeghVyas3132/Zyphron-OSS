// ===========================================
// STRESS COMMAND — k6 load test against a live deployment
// ===========================================

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { createApiClient } from '../../lib/api.js';
import { getToken, getApiUrl } from '../../lib/config.js';
import { style, purpleBlueGradient } from '../../lib/ui.js';

interface StressTestSummary {
  totalRequests: number;
  failedRequests: number;
  requestRate: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  avgResponseTime: number;
  maxResponseTime: number;
  errorRate: number;
  dataReceived: string;
  passed: boolean;
  thresholds: Record<string, { passed: boolean; value: string }>;
}

function ms(val: number): string {
  if (val < 1000) return `${val}ms`;
  return `${(val / 1000).toFixed(2)}s`;
}

function passIcon(passed: boolean): string {
  return passed ? chalk.hex('#A78BFA')('✓') : chalk.red('✕');
}

function renderResults(summary: StressTestSummary, targetUrl: string, vus: number, duration: number): void {
  console.log('');
  console.log(purpleBlueGradient('  Stress Test Results'));
  console.log('');
  console.log(chalk.gray(`  Target:   ${targetUrl}`));
  console.log(chalk.gray(`  Load:     ${vus} VUs × ${duration}s`));
  console.log('');

  // Latency table
  const latencyTable = new Table({
    head: [
      chalk.hex('#A855F7')('Metric'),
      chalk.hex('#A855F7')('Value'),
      chalk.hex('#A855F7')('Status'),
    ],
    colWidths: [20, 16, 12],
    style: { head: [], border: ['gray'], compact: true },
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '╭', 'top-right': '╮',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '╰', 'bottom-right': '╯',
      'left': '│', 'left-mid': '├', 'right': '│', 'right-mid': '┤',
      'mid': '─', 'mid-mid': '┼', 'middle': '│',
    },
  });

  latencyTable.push(
    [chalk.white('Avg latency'), chalk.hex('#7DD3FC')(ms(summary.avgResponseTime)), chalk.gray('—')],
    [chalk.white('p50'), chalk.hex('#7DD3FC')(ms(summary.p50)), chalk.gray('—')],
    [chalk.white('p90'), chalk.hex('#7DD3FC')(ms(summary.p90)), chalk.gray('—')],
    [chalk.white('p95'), chalk.hex('#7DD3FC')(ms(summary.p95)), `${passIcon(summary.p95 < 2000)} <2s`],
    [chalk.white('p99'), chalk.hex('#7DD3FC')(ms(summary.p99)), `${passIcon(summary.p99 < 5000)} <5s`],
    [chalk.white('Max'), chalk.hex('#7DD3FC')(ms(summary.maxResponseTime)), chalk.gray('—')],
  );

  console.log(latencyTable.toString());
  console.log('');

  // Traffic table
  const trafficTable = new Table({
    head: [
      chalk.hex('#A855F7')('Traffic'),
      chalk.hex('#A855F7')('Value'),
    ],
    colWidths: [22, 20],
    style: { head: [], border: ['gray'], compact: true },
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '╭', 'top-right': '╮',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '╰', 'bottom-right': '╯',
      'left': '│', 'left-mid': '├', 'right': '│', 'right-mid': '┤',
      'mid': '─', 'mid-mid': '┼', 'middle': '│',
    },
  });

  trafficTable.push(
    [chalk.white('Total requests'), chalk.hex('#7DD3FC')(summary.totalRequests.toString())],
    [chalk.white('Failed requests'), summary.failedRequests > 0
      ? chalk.red(summary.failedRequests.toString())
      : chalk.hex('#A78BFA')('0')],
    [chalk.white('Req / sec'), chalk.hex('#7DD3FC')(summary.requestRate.toFixed(1))],
    [chalk.white('Error rate'), summary.errorRate >= 5
      ? chalk.red(`${summary.errorRate}%`)
      : chalk.hex('#A78BFA')(`${summary.errorRate}%`)],
    [chalk.white('Data received'), chalk.hex('#7DD3FC')(summary.dataReceived)],
  );

  console.log(trafficTable.toString());
  console.log('');

  // Verdict
  if (summary.passed) {
    console.log(purpleBlueGradient('  ✓ All thresholds passed — deployment is healthy under load'));
  } else {
    console.log(chalk.red('  ✕ Some thresholds failed — deployment may struggle under this load'));
  }
  console.log('');
}

export function registerStressCommand(program: Command): void {
  program
    .command('stress <projectSlugOrId>')
    .alias('st')
    .description('Run a k6 load test against a live deployment')
    .option('--vus <n>', 'Concurrent virtual users', '10')
    .option('--duration <s>', 'Test duration in seconds', '30')
    .option('--ramp <s>', 'Ramp-up period in seconds', '10')
    .action(async (
      slugOrId: string,
      opts: { vus: string; duration: string; ramp: string }
    ) => {
      console.log('');

      const token = getToken();
      if (!token) {
        console.log(style.error('  Not logged in. Run: zy login'));
        process.exit(1);
      }

      const vus = Math.max(1, Math.min(200, parseInt(opts.vus, 10) || 10));
      const duration = Math.max(10, Math.min(300, parseInt(opts.duration, 10) || 30));
      const ramp = Math.max(0, Math.min(duration - 5, parseInt(opts.ramp, 10) || 10));

      console.log(purpleBlueGradient('  Load Test'));
      console.log('');
      console.log(chalk.gray(`  Project:  ${slugOrId}`));
      console.log(chalk.gray(`  Load:     ${vus} VUs × ${duration}s (${ramp}s ramp)`));
      console.log('');

      const api = createApiClient(getApiUrl(), token);

      // First probe — check reachability
      const probeSpinner = ora({
        text: chalk.hex('#7DD3FC')('Probing deployment...'),
        spinner: 'dots12',
        color: 'cyan',
      }).start();

      try {
        const probe = await api.get<{ reachable: boolean; responseTimeMs: number; statusCode?: number; url: string }>(
          `/projects/${slugOrId}/stress/probe`
        );

        if (!probe.data.reachable) {
          probeSpinner.fail(chalk.red('Deployment is not reachable'));
          console.log(chalk.gray('  Make sure the deployment is live: zy status'));
          process.exit(1);
        }

        probeSpinner.succeed(
          chalk.hex('#A78BFA')(
            `Deployment reachable — ${probe.data.responseTimeMs}ms (HTTP ${probe.data.statusCode})`
          )
        );
        console.log(chalk.gray(`  URL: ${probe.data.url}`));
        console.log('');
      } catch (err) {
        probeSpinner.fail(chalk.red('Could not probe deployment'));
        const error = err as { response?: { data?: { error?: { message?: string } } } };
        console.log(chalk.red(`  ${error.response?.data?.error?.message || String(err)}`));
        process.exit(1);
      }

      // Run stress test
      const spinner = ora({
        text: chalk.hex('#7DD3FC')(`Running load test (${duration}s)...`),
        spinner: 'dots12',
        color: 'cyan',
      }).start();

      // Animate elapsed time while waiting
      let elapsed = 0;
      const ticker = setInterval(() => {
        elapsed += 1;
        const pct = Math.min(100, Math.round((elapsed / duration) * 100));
        const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
        spinner.text = chalk.hex('#7DD3FC')(`Running load test  ${chalk.hex('#A855F7')(bar)} ${pct}%  ${elapsed}s/${duration}s`);
      }, 1000);

      try {
        const res = await api.post<{
          success: boolean;
          targetUrl: string;
          config: { virtualUsers: number; durationSeconds: number; rampUpSeconds: number };
          summary: StressTestSummary | null;
          error?: string;
        }>(`/projects/${slugOrId}/stress`, {
          virtualUsers: vus,
          durationSeconds: duration,
          rampUpSeconds: ramp,
        });

        clearInterval(ticker);
        spinner.stop();

        const { summary, targetUrl, config: cfg, error: testError } = res.data;

        if (!res.data.success || !summary) {
          console.log(chalk.red(`  ✕ Stress test failed: ${testError || 'Unknown error'}`));
          console.log('');
          process.exit(1);
        }

        renderResults(summary, targetUrl, cfg.virtualUsers, cfg.durationSeconds);

      } catch (err) {
        clearInterval(ticker);
        spinner.fail(chalk.red('Stress test failed'));
        const error = err as { response?: { data?: { error?: { message?: string } } } };
        console.log(chalk.red(`  ${error.response?.data?.error?.message || String(err)}`));
        process.exit(1);
      }
    });
}
