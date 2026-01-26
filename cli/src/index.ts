#!/usr/bin/env node
// ===========================================
// ZYPHRON CLI - MAIN ENTRY POINT
// Production Ready - Purple & Blue Theme
// ===========================================

// Force color output in all environments
process.env.FORCE_COLOR = '3';

import { Command } from 'commander';
import { loginCommand, logoutCommand, whoamiCommand, registerCommand } from './commands/auth/index.js';
import { 
  style, 
  purpleBlueGradient,
  sleep,
  animatedDivider,
} from './lib/ui.js';

// ===========================================
// CLI PROGRAM SETUP
// ===========================================

const program = new Command();

program
  .name('zyphron')
  .description(purpleBlueGradient('Zyphron CLI - Deploy anything, anywhere'))
  .version('1.0.0', '-v, --version', 'Output the current version')
  .helpOption('-h, --help', 'Display help for command');

// ===========================================
// ANIMATED HELP OUTPUT
// ===========================================

async function showAnimatedHelp(): Promise<void> {
  console.clear();
  console.log('');
  
  // Animated banner - line by line
  const bannerLines = [
    '  ███████╗██╗   ██╗██████╗ ██╗  ██╗██████╗  ██████╗ ███╗   ██╗',
    '  ╚══███╔╝╚██╗ ██╔╝██╔══██╗██║  ██║██╔══██╗██╔═══██╗████╗  ██║',
    '    ███╔╝  ╚████╔╝ ██████╔╝███████║██████╔╝██║   ██║██╔██╗ ██║',
    '   ███╔╝    ╚██╔╝  ██╔═══╝ ██╔══██║██╔══██╗██║   ██║██║╚██╗██║',
    '  ███████╗   ██║   ██║     ██║  ██║██║  ██║╚██████╔╝██║ ╚████║',
    '  ╚══════╝   ╚═╝   ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝',
  ];
  
  for (const line of bannerLines) {
    console.log(purpleBlueGradient(line));
    await sleep(40);
  }
  
  console.log('');
  
  // Animated tagline
  const tagline = '  Deploy anything, anywhere.';
  for (const char of tagline) {
    process.stdout.write(style.blue(char));
    await sleep(15);
  }
  console.log(style.dim(' v1.0.0'));
  
  console.log('');
  await animatedDivider(65);
  console.log('');
  
  // Animated sections
  const sections = [
    { title: 'DESCRIPTION', delay: 30 },
    { content: `  ${style.blueLight('Zyphron CLI - Deploy anything, anywhere')}`, delay: 10 },
  ];
  
  console.log(style.purpleBright('  DESCRIPTION'));
  await sleep(50);
  console.log(`  ${style.blueLight('Zyphron CLI - Deploy anything, anywhere')}`);
  console.log('');
  await sleep(50);
  
  console.log(style.purpleBright('  USAGE'));
  await sleep(50);
  console.log(`  ${style.dim('$')} ${style.purple('zyphron')} ${style.blue('<command>')} ${style.dim('[options]')}`);
  console.log('');
  await sleep(50);
  
  console.log(style.purpleBright('  COMMANDS'));
  console.log('');
  await sleep(30);
  
  // Authentication commands
  console.log(`  ${style.purple('Authentication')}`);
  await sleep(20);
  const authCommands = [
    ['login', 'Authenticate with Zyphron'],
    ['logout', 'Log out from Zyphron'],
    ['register', 'Create a new account'],
    ['whoami', 'Display current user'],
  ];
  for (const [cmd, desc] of authCommands) {
    console.log(`    ${style.blue('>')} ${style.purple(cmd.padEnd(12))} ${style.blueLight(desc)}`);
    await sleep(25);
  }
  console.log('');
  
  // Coming soon sections
  console.log(`  ${style.purple('Projects')} ${style.dim('(coming soon)')}`);
  await sleep(20);
  const projectCommands = [
    ['init', 'Initialize a new project'],
    ['projects', 'List all projects'],
    ['link', 'Link current directory'],
  ];
  for (const [cmd, desc] of projectCommands) {
    console.log(`    ${style.dim('>')} ${style.dim(cmd.padEnd(12))} ${style.dim(desc)}`);
    await sleep(15);
  }
  console.log('');
  
  console.log(`  ${style.purple('Deployments')} ${style.dim('(coming soon)')}`);
  await sleep(20);
  const deployCommands = [
    ['deploy', 'Deploy your project'],
    ['logs', 'View deployment logs'],
    ['status', 'Check deployment status'],
  ];
  for (const [cmd, desc] of deployCommands) {
    console.log(`    ${style.dim('>')} ${style.dim(cmd.padEnd(12))} ${style.dim(desc)}`);
    await sleep(15);
  }
  console.log('');
  
  console.log(`  ${style.purple('Environment')} ${style.dim('(coming soon)')}`);
  await sleep(20);
  const envCommands = [
    ['env', 'Manage environment variables'],
    ['domains', 'Manage custom domains'],
  ];
  for (const [cmd, desc] of envCommands) {
    console.log(`    ${style.dim('>')} ${style.dim(cmd.padEnd(12))} ${style.dim(desc)}`);
    await sleep(15);
  }
  console.log('');
  await sleep(30);
  
  // Options
  console.log(style.purpleBright('  OPTIONS'));
  await sleep(30);
  console.log(`    ${style.purple('-v, --version')}    ${style.blueLight('Output the current version')}`);
  await sleep(20);
  console.log(`    ${style.purple('-h, --help')}       ${style.blueLight('Display help for command')}`);
  console.log('');
  await sleep(30);
  
  // Examples
  console.log(style.purpleBright('  EXAMPLES'));
  await sleep(30);
  console.log(`    ${style.dim('$')} ${style.purple('zyphron login')}`);
  await sleep(20);
  console.log(`    ${style.dim('$')} ${style.purple('zyphron init')} ${style.blue('--name my-app')}`);
  await sleep(20);
  console.log(`    ${style.dim('$')} ${style.purple('zyphron deploy')}`);
  console.log('');
  
  // Footer
  await animatedDivider(65);
  console.log('');
  console.log(`  ${style.dim('Documentation:')} ${style.cyan('https://docs.zyphron.dev')}`);
  console.log(`  ${style.dim('Support:')}       ${style.cyan('https://zyphron.dev/support')}`);
  console.log('');
}
// ===========================================

program.configureHelp({
  sortSubcommands: true,
  sortOptions: true,
  formatHelp: (cmd, helper) => {
    // Custom help formatting
    const output: string[] = [];
    
    // Banner with gradient
    output.push('');
    output.push(purpleBlueGradient('  ███████╗██╗   ██╗██████╗ ██╗  ██╗██████╗  ██████╗ ███╗   ██╗'));
    output.push(purpleBlueGradient('  ╚══███╔╝╚██╗ ██╔╝██╔══██╗██║  ██║██╔══██╗██╔═══██╗████╗  ██║'));
    output.push(purpleBlueGradient('    ███╔╝  ╚████╔╝ ██████╔╝███████║██████╔╝██║   ██║██╔██╗ ██║'));
    output.push(purpleBlueGradient('   ███╔╝    ╚██╔╝  ██╔═══╝ ██╔══██║██╔══██╗██║   ██║██║╚██╗██║'));
    output.push(purpleBlueGradient('  ███████╗   ██║   ██║     ██║  ██║██║  ██║╚██████╔╝██║ ╚████║'));
    output.push(purpleBlueGradient('  ╚══════╝   ╚═╝   ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝'));
    output.push('');
    output.push(style.blue('  Deploy anything, anywhere. ') + style.dim('v1.0.0'));
    output.push('');
    output.push(purpleBlueGradient('━'.repeat(65)));
    output.push('');
    
    // Description
    output.push(style.purpleBright('  DESCRIPTION'));
    output.push(`  ${style.blue(helper.commandDescription(cmd))}`);
    output.push('');
    
    // Usage
    output.push(style.purpleBright('  USAGE'));
    output.push(`  ${style.dim('$')} ${style.purple('zyphron')} ${style.blue('<command>')} ${style.dim('[options]')}`);
    output.push('');
    
    // Commands
    output.push(style.purpleBright('  COMMANDS'));
    output.push('');
    output.push(`  ${style.purple('Authentication')}`);
    output.push(`    ${style.blue('>')} ${style.purple('login')}       ${style.blue('Authenticate with Zyphron')}`);
    output.push(`    ${style.blue('>')} ${style.purple('logout')}      ${style.blue('Log out from Zyphron')}`);
    output.push(`    ${style.blue('>')} ${style.purple('register')}    ${style.blue('Create a new account')}`);
    output.push(`    ${style.blue('>')} ${style.purple('whoami')}      ${style.blue('Display current user')}`);
    output.push('');
    output.push(`  ${style.purple('Projects')} ${style.dim('(coming soon)')}`);
    output.push(`    ${style.dim('>')} ${style.dim('init')}        Initialize a new project`);
    output.push(`    ${style.dim('>')} ${style.dim('projects')}    List all projects`);
    output.push(`    ${style.dim('>')} ${style.dim('link')}        Link current directory`);
    output.push('');
    output.push(`  ${style.purple('Deployments')} ${style.dim('(coming soon)')}`);
    output.push(`    ${style.dim('>')} ${style.dim('deploy')}      Deploy your project`);
    output.push(`    ${style.dim('>')} ${style.dim('logs')}        View deployment logs`);
    output.push(`    ${style.dim('>')} ${style.dim('status')}      Check deployment status`);
    output.push('');
    output.push(`  ${style.purple('Environment')} ${style.dim('(coming soon)')}`);
    output.push(`    ${style.dim('>')} ${style.dim('env')}         Manage environment variables`);
    output.push(`    ${style.dim('>')} ${style.dim('domains')}     Manage custom domains`);
    output.push('');
    
    // Options
    output.push(style.purpleBright('  OPTIONS'));
    output.push(`    ${style.purple('-v, --version')}    ${style.blue('Output the current version')}`);
    output.push(`    ${style.purple('-h, --help')}       ${style.blue('Display help for command')}`);
    output.push('');
    
    // Examples
    output.push(style.purpleBright('  EXAMPLES'));
    output.push(`    ${style.dim('$')} ${style.purple('zyphron login')}`);
    output.push(`    ${style.dim('$')} ${style.purple('zyphron init')} ${style.blue('--name my-app')}`);
    output.push(`    ${style.dim('$')} ${style.purple('zyphron deploy')}`);
    output.push('');
    
    // Footer
    output.push(style.purple('━'.repeat(65)));
    output.push('');
    output.push(`  ${style.dim('Documentation:')} ${style.cyan('https://docs.zyphron.dev')}`);
    output.push(`  ${style.dim('Support:')}       ${style.cyan('https://zyphron.dev/support')}`);
    output.push('');
    
    return output.join('\n');
  },
});

// ===========================================
// REGISTER AUTH COMMANDS
// ===========================================

program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);
program.addCommand(registerCommand);

// ===========================================
// DEFAULT ACTION (no command) - ANIMATED
// ===========================================

program.action(async () => {
  await showAnimatedHelp();
});

// ===========================================
// ERROR HANDLING
// ===========================================

program.exitOverride((err) => {
  if (err.code === 'commander.helpDisplayed') {
    process.exit(0);
  }
  if (err.code === 'commander.unknownCommand') {
    console.log('');
    console.log(style.error(`  Unknown command: ${err.message}`));
    console.log(style.dim(`  Run ${style.purple('zyphron --help')} for available commands`));
    console.log('');
  }
  throw err;
});

// ===========================================
// PARSE & EXECUTE
// ===========================================

try {
  await program.parseAsync(process.argv);
} catch (error) {
  // Silent exit for help and version
  if (error instanceof Error) {
    if ((error as any).code === 'commander.helpDisplayed') {
      process.exit(0);
    }
    if ((error as any).code === 'commander.version') {
      process.exit(0);
    }
  }
  process.exit(1);
}
