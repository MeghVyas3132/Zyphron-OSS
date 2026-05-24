// ===========================================
// ROLLBACK COMMAND
// ===========================================

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { createApiClient } from '../../lib/api.js';
import { getToken, getApiUrl } from '../../lib/config.js';
import { style, purpleBlueGradient } from '../../lib/ui.js';

export function registerRollbackCommand(program: Command): void {
  program
    .command('rollback <projectSlugOrId>')
    .alias('rb')
    .description('Rollback a project to its previous deployment')
    .action(async (slugOrId: string) => {
      console.log('');

      const token = getToken();
      if (!token) {
        console.log(style.error('  Not logged in. Run: zy login'));
        process.exit(1);
      }

      console.log(purpleBlueGradient('  Rollback'));
      console.log('');

      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([{
        type: 'confirm',
        name: 'confirm',
        message: chalk.yellow(`  Rollback ${chalk.white(slugOrId)} to previous deployment?`),
        default: false,
      }]);

      if (!confirm) {
        console.log(chalk.gray('  Cancelled'));
        return;
      }

      const spinner = ora({
        text: chalk.hex('#7DD3FC')('Initiating rollback...'),
        spinner: 'dots12',
        color: 'cyan',
      }).start();

      const api = createApiClient(getApiUrl(), token);

      try {
        // Find project by slug or ID
        const projectsRes = await api.get<{ projects: Array<{ id: string; slug: string; name: string }> }>(
          `/projects?search=${slugOrId}&limit=5`
        );
        const projects = projectsRes.data.projects ?? [];
        const project = projects.find((p: { id: string; slug: string; name: string }) =>
          p.slug === slugOrId || p.id === slugOrId || p.id.startsWith(slugOrId)
        );

        if (!project) {
          spinner.fail(chalk.red('Project not found'));
          process.exit(1);
        }

        // Get last LIVE deployment
        const depsRes = await api.get<{ deployments: Array<{ id: string; status: string }> }>(
          `/projects/${project.id}/deployments?limit=5`
        );
        const deps = depsRes.data.deployments ?? [];
        const live = deps.find((d: { id: string; status: string }) => d.status === 'LIVE');

        if (!live) {
          spinner.fail(chalk.red('No live deployment to rollback from'));
          process.exit(1);
        }

        await api.post(`/deployments/${live.id}/rollback`, {});

        spinner.succeed(chalk.hex('#A78BFA')(`Rollback triggered for ${chalk.white(project.name)}`));
        console.log('');
        console.log(chalk.gray('  Track progress: zy status'));
        console.log('');
      } catch (err) {
        spinner.fail(chalk.red('Rollback failed'));
        const error = err as { response?: { data?: { error?: { message?: string } } } };
        console.log(chalk.red(`  ${error.response?.data?.error?.message || String(err)}`));
        process.exit(1);
      }
    });
}
