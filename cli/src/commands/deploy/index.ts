// ===========================================
// DEPLOY COMMAND — core Zyphron workflow
// Paste URL → ENV scan → fill vars → deploy → live
// ===========================================

import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { createApiClient } from '../../lib/api.js';
import { getToken, getApiUrl } from '../../lib/config.js';
import { style, purpleBlueGradient, sleep } from '../../lib/ui.js';
import WebSocket from 'ws';

interface EnvVar {
  name: string;
  required: boolean;
  purpose?: string;
  example?: string;
  aiDescription?: string;
  aiExample?: string;
  category?: string;
}

async function streamBuildLogs(
  wsUrl: string,
  token: string,
  deploymentId: string
): Promise<void> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${wsUrl}/logs/${deploymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const timeout = setTimeout(() => {
      ws.close();
      resolve();
    }, 30 * 60 * 1000); // 30 min max

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          level?: string;
          message?: string;
          step?: string;
          progress?: number;
          status?: string;
          url?: string;
        };

        if (msg.type === 'log') {
          const prefix = msg.level === 'error'
            ? chalk.red('  ✕')
            : msg.level === 'warn'
            ? chalk.yellow('  ⚠')
            : chalk.gray('  │');

          const stepLabel = msg.step
            ? chalk.hex('#7DD3FC')(` [${msg.step}]`)
            : '';

          const progressStr = msg.progress !== undefined
            ? chalk.hex('#A855F7')(` ${msg.progress}%`)
            : '';

          console.log(`${prefix}${stepLabel}${progressStr} ${msg.message || ''}`);
        }

        if (msg.type === 'status') {
          if (msg.status === 'LIVE') {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
          if (msg.status === 'FAILED' || msg.status === 'CANCELLED') {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve();
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export function registerDeployCommand(program: Command): void {
  program
    .command('deploy')
    .alias('d')
    .description('Deploy a public GitHub repo to zyphron.space')
    .argument('[url]', 'Public GitHub repository URL')
    .option('-n, --name <name>', 'Project name (auto-generated if omitted)')
    .option('-b, --branch <branch>', 'Branch to deploy', 'main')
    .option('--no-stream', 'Skip live log streaming')
    .action(async (url: string | undefined, opts: { name?: string; branch: string; stream: boolean }) => {
      console.log('');
      console.log(purpleBlueGradient('  ⚡ Zyphron Deploy'));
      console.log('');

      const token = getToken();
      if (!token) {
        console.log(style.error('  Not logged in. Run: zy login'));
        process.exit(1);
      }

      // Get repo URL
      let repoUrl = url;
      if (!repoUrl) {
        const ans = await inquirer.prompt<{ repoUrl: string }>([{
          type: 'input',
          name: 'repoUrl',
          message: chalk.hex('#7DD3FC')('  GitHub repo URL:'),
          validate: (v) => /^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/.+/.test(v)
            ? true
            : 'Enter a valid GitHub/GitLab/Bitbucket URL',
        }]);
        repoUrl = ans.repoUrl;
      }

      // Validate URL
      if (!/^https?:\/\/github\.com\/[^/]+\/[^/]+/.test(repoUrl)) {
        console.log(style.error(`  Invalid repo URL. Must be: https://github.com/user/repo`));
        process.exit(1);
      }

      console.log(`  ${chalk.hex('#A855F7')('→')} ${chalk.white(repoUrl)}`);
      console.log('');

      const api = createApiClient(getApiUrl(), token);

      // ── Step 1: Scan ENV vars ──────────────────────
      const scanSpinner = ora({
        text: chalk.hex('#7DD3FC')('Scanning repository for required environment variables...'),
        spinner: 'dots12',
        color: 'cyan',
      }).start();

      let envVars: EnvVar[] = [];
      let projectName = opts.name || '';

      try {
        const scanRes = await api.post<{
          vars: EnvVar[];
          hasEnvExample: boolean;
        }>('/projects/scan-env', { repositoryUrl: repoUrl });

        envVars = scanRes.data.vars;
        scanSpinner.succeed(chalk.hex('#A78BFA')(`Found ${envVars.length} environment variable${envVars.length !== 1 ? 's' : ''}`));
      } catch {
        scanSpinner.warn(chalk.yellow('Could not scan for env vars — you can add them manually later'));
      }

      console.log('');

      // ── Step 2: Collect ENV values from user ──────
      const collectedEnv: Record<string, string> = {};

      if (envVars.length > 0) {
        console.log(chalk.hex('#7DD3FC')('  Configure environment variables:'));
        console.log(chalk.gray('  (Press Enter to skip optional vars, Tab to use example)\n'));

        for (const v of envVars) {
          const label = v.required
            ? chalk.red('*') + ' ' + chalk.white(v.name)
            : chalk.gray('○') + ' ' + chalk.gray(v.name);

          const hint = v.aiDescription || v.purpose
            ? chalk.gray(` — ${v.aiDescription || v.purpose}`)
            : '';

          const exampleValue = v.aiExample || v.example;

          const ans = await inquirer.prompt<{ val: string }>([{
            type: 'input',
            name: 'val',
            message: `  ${label}${hint}`,
            default: exampleValue && !v.required ? '' : undefined,
          }]);

          if (ans.val.trim()) {
            collectedEnv[v.name] = ans.val.trim();
          } else if (v.required) {
            console.log(chalk.yellow(`    ⚠ ${v.name} is required but was skipped — add it in the dashboard`));
          }
        }
        console.log('');
      }

      // ── Step 3: Project name ──────────────────────
      if (!projectName) {
        const repoName = repoUrl.split('/').pop()?.replace(/\.git$/, '') || 'my-app';
        const ans = await inquirer.prompt<{ name: string }>([{
          type: 'input',
          name: 'name',
          message: chalk.hex('#7DD3FC')('  Project name:'),
          default: repoName,
        }]);
        projectName = ans.name.trim() || repoName;
      }

      console.log('');

      // ── Step 4: Create project ──────────────────────
      const createSpinner = ora({
        text: chalk.hex('#7DD3FC')('Creating project...'),
        spinner: 'dots12',
        color: 'cyan',
      }).start();

      let projectId: string;
      let deploymentId: string;

      try {
        const projectRes = await api.post<{
          project: { id: string; slug: string; subdomain: string };
          deployment: { id: string };
        }>('/projects', {
          name: projectName,
          repositoryUrl: repoUrl,
          branch: opts.branch,
          envVariables: Object.entries(collectedEnv).map(([key, value]) => ({ key, value })),
        });

        projectId = projectRes.data.project.id;
        deploymentId = projectRes.data.deployment.id;
        const subdomain = projectRes.data.project.subdomain;
        const domain = getApiUrl().includes('localhost') ? 'localhost' : 'zyphron.space';
        const liveUrl = `https://${subdomain}.${domain}`;

        createSpinner.succeed(chalk.hex('#A78BFA')(`Project created: ${chalk.white(projectName)}`));
        console.log('');
        console.log(chalk.gray('  ┌─────────────────────────────────────────────'));
        console.log(chalk.gray('  │') + chalk.hex('#7DD3FC')(' Deployment ID: ') + chalk.white(deploymentId.slice(0, 8)));
        console.log(chalk.gray('  │') + chalk.hex('#7DD3FC')(' Live URL:      ') + chalk.white(liveUrl));
        console.log(chalk.gray('  └─────────────────────────────────────────────'));
        console.log('');
      } catch (err) {
        createSpinner.fail(chalk.red('Failed to create project'));
        const error = err as { response?: { data?: { error?: { message?: string } } } };
        console.log(chalk.red(`  ${error.response?.data?.error?.message || String(err)}`));
        process.exit(1);
      }

      // ── Step 5: Stream build logs ──────────────────
      if (opts.stream) {
        console.log(chalk.hex('#7DD3FC')('  Live build logs:'));
        console.log(chalk.gray('  ' + '─'.repeat(50)));
        console.log('');

        const wsBase = getApiUrl().replace(/^http/, 'ws');
        await streamBuildLogs(wsBase, token, deploymentId);

        console.log('');
        console.log(chalk.gray('  ' + '─'.repeat(50)));

        // Check final status
        try {
          const depRes = await api.get<{ deployment: { status: string; url?: string } }>(
            `/deployments/${deploymentId}`
          );
          const dep = depRes.data.deployment;

          if (dep.status === 'LIVE') {
            console.log('');
            console.log(purpleBlueGradient('  ✓ Deployment successful!'));
            console.log('');
            console.log(chalk.hex('#7DD3FC')(`  Live at: `) + chalk.white(dep.url || ''));
            console.log('');
          } else if (dep.status === 'FAILED') {
            console.log('');
            console.log(chalk.red('  ✕ Deployment failed. Check logs above for details.'));
            console.log(chalk.gray('  Run: zy logs ' + deploymentId.slice(0, 8)));
            console.log('');
          }
        } catch { /* ignore */ }
      } else {
        console.log(chalk.hex('#7DD3FC')('  Deployment queued. Track progress:'));
        console.log(chalk.gray(`  zy logs ${deploymentId.slice(0, 8)}`));
        console.log('');
      }
    });
}
