// ===========================================
// STATUS COMMAND — show all deployments
// ===========================================

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { createApiClient } from '../../lib/api.js';
import { getToken, getApiUrl } from '../../lib/config.js';
import { style, purpleBlueGradient } from '../../lib/ui.js';

interface Deployment {
  id: string;
  status: string;
  url?: string;
  createdAt: string;
  buildDuration?: number;
  project?: { name: string; slug: string };
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    LIVE: chalk.hex('#A78BFA')('● LIVE'),
    BUILDING: chalk.hex('#7DD3FC')('◌ BUILDING'),
    DEPLOYING: chalk.hex('#7DD3FC')('◌ DEPLOYING'),
    FAILED: chalk.red('✕ FAILED'),
    CANCELLED: chalk.gray('○ CANCELLED'),
    QUEUED: chalk.gray('· QUEUED'),
  };
  return map[status] || chalk.gray(status);
}

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .alias('ls')
    .description('List all your deployments')
    .option('-n, --limit <n>', 'Number of deployments to show', '10')
    .action(async (opts: { limit: string }) => {
      console.log('');

      const token = getToken();
      if (!token) {
        console.log(style.error('  Not logged in. Run: zy login'));
        process.exit(1);
      }

      const spinner = ora({
        text: chalk.hex('#7DD3FC')('Fetching deployments...'),
        spinner: 'dots12',
        color: 'cyan',
      }).start();

      const api = createApiClient(getApiUrl(), token);

      try {
        const res = await api.get<{ deployments: Deployment[] }>(
          `/projects?includeDeployments=true&limit=${opts.limit}`
        );

        spinner.stop();
        console.log(purpleBlueGradient('  Deployments'));
        console.log('');

        const deployments: Deployment[] = res.data.deployments ?? [];

        if (deployments.length === 0) {
          console.log(chalk.gray('  No deployments yet. Run: zy deploy <github-url>'));
          console.log('');
          return;
        }

        const table = new Table({
          head: [
            chalk.hex('#A855F7')('ID'),
            chalk.hex('#A855F7')('Project'),
            chalk.hex('#A855F7')('Status'),
            chalk.hex('#A855F7')('URL'),
            chalk.hex('#A855F7')('Age'),
          ],
          colWidths: [12, 20, 16, 40, 10],
          style: {
            head: [],
            border: ['gray'],
            compact: true,
          },
          chars: {
            'top': '─', 'top-mid': '┬', 'top-left': '╭', 'top-right': '╮',
            'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '╰', 'bottom-right': '╯',
            'left': '│', 'left-mid': '├', 'right': '│', 'right-mid': '┤',
            'mid': '─', 'mid-mid': '┼', 'middle': '│',
          },
        });

        for (const d of deployments) {
          table.push([
            chalk.white(d.id.slice(0, 8)),
            chalk.hex('#7DD3FC')(d.project?.name || '—'),
            statusColor(d.status),
            d.url ? chalk.gray(d.url.replace('https://', '')) : chalk.gray('—'),
            chalk.gray(ago(d.createdAt)),
          ]);
        }

        console.log(table.toString());
        console.log('');
      } catch (err) {
        spinner.fail(chalk.red('Failed to fetch deployments'));
        console.error(chalk.red(`  ${String(err)}`));
        process.exit(1);
      }
    });
}
