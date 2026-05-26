// ===========================================
// ZYPHRON CLI - CREATE COMMAND
// zy create <name>  →  creates project + subdomain
// ===========================================

import { Command } from 'commander';
import { api, getErrorMessage } from '../../lib/api.js';
import { getToken } from '../../lib/config.js';
import {
  style,
  purpleBlueGradient,
  createOraSpinner,
  sleep,
  animatedDivider,
} from '../../lib/ui.js';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')   // non-alphanumeric → hyphen
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^-+|-+$/g, '');       // strip leading/trailing hyphens
}

export const createCommand = new Command('create')
  .description('Create a new project (name becomes subdomain)')
  .argument('<name>', 'Project name — also used as subdomain (e.g. my-app → my-app.zyphron.space)')
  .option('--repo <url>', 'Git repository URL to link immediately')
  .option('--branch <branch>', 'Default branch', 'main')
  .action(async (name: string, options: { repo?: string; branch?: string }) => {
    console.clear();
    console.log('');

    const title = '  ZYPHRON CREATE';
    for (const char of title) {
      process.stdout.write(purpleBlueGradient(char));
      await sleep(25);
    }
    console.log('');
    await animatedDivider(50);
    console.log('');

    const token = getToken();
    if (!token) {
      console.log(`  ${style.error('Not authenticated.')}`);
      console.log(`  ${style.dim('Run')} ${style.purple('zy login')} ${style.dim('first.')}`);
      console.log('');
      process.exit(1);
    }

    const slug = toSlug(name);
    if (!slug) {
      console.log(`  ${style.error('Invalid project name.')} Use letters, numbers and hyphens.`);
      process.exit(1);
    }

    console.log(`  ${style.dim('Name')}    ${style.blueLight(name)}`);
    console.log(`  ${style.dim('Slug')}    ${style.blueLight(slug)}`);
    console.log(`  ${style.dim('URL')}     ${style.cyan(`https://${slug}.zyphron.space`)}`);
    if (options.repo) {
      console.log(`  ${style.dim('Repo')}    ${style.dim(options.repo)}`);
    }
    console.log('');

    const spinner = createOraSpinner('Creating project');
    spinner.start();

    try {
      const payload: { name: string; repositoryUrl?: string; branch?: string; slug?: string } = {
        name,
        branch: options.branch ?? 'main',
        slug,
      };
      if (options.repo) payload.repositoryUrl = options.repo;

      const response = await api.createProject(payload);

      if (!response.success) {
        spinner.fail(style.error('Project creation failed'));
        console.log('');
        const msg = response.error?.message ?? 'Unknown error';
        console.log(`  ${style.error(msg)}`);
        console.log('');
        process.exit(1);
      }

      spinner.succeed(style.purpleLight('Project created'));
      console.log('');

      const project = response.data;

      console.log(`  ${style.purple('/')}${'─'.repeat(46)}${style.purple('\\')}`);
      console.log(`  ${style.purple('|')}  ${purpleBlueGradient('  Project ready')}                              ${style.purple('|')}`);
      console.log(`  ${style.purple('|')}                                              ${style.purple('|')}`);
      console.log(`  ${style.purple('|')}  ${style.dim('ID')}      ${style.blueLight((project.id ?? '').padEnd(36))}${style.purple('|')}`);
      console.log(`  ${style.purple('|')}  ${style.dim('Slug')}    ${style.blueLight(slug.padEnd(36))}${style.purple('|')}`);
      console.log(`  ${style.purple('|')}  ${style.dim('URL')}     ${style.cyan((`https://${slug}.zyphron.space`).padEnd(36))}${style.purple('|')}`);
      console.log(`  ${style.purple('\\') }${'─'.repeat(46)}${style.purple('/')}`);
      console.log('');

      console.log(`  ${style.purple('Next:')}`);
      if (!options.repo) {
        console.log(`    ${style.dim('$')} ${style.purple('zy deploy')} ${style.blue('https://github.com/you/' + slug)}  ${style.dim('deploy a repo')}`);
        console.log(`    ${style.dim('$')} ${style.purple('zy deploy')} ${style.blue('.')}                               ${style.dim('deploy current dir')}`);
      } else {
        console.log(`    ${style.dim('$')} ${style.purple('zy deploy')}  ${style.dim('deploy now')}`);
      }
      console.log(`    ${style.dim('$')} ${style.purple('zy logs')}   ${style.dim('tail logs')}`);
      console.log('');

    } catch (error) {
      spinner.fail(style.error('Failed'));
      console.log('');
      console.log(`  ${style.error(getErrorMessage(error))}`);
      console.log('');
      process.exit(1);
    }
  });
