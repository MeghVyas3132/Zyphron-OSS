#!/usr/bin/env node
// ===========================================
// ZYPHRON CLI - MAIN ENTRY POINT
// Beautiful purple-themed deployment platform
// ===========================================

import { Command } from 'commander';
import { loginCommand, logoutCommand, whoamiCommand, registerCommand } from './commands/auth/index.js';
import { 
  printBanner,
  style, 
  purpleGradient,
  showGoodbye,
  symbols,
} from './lib/ui.js';

// ===========================================
// CLI PROGRAM SETUP
// ===========================================

const program = new Command();

program
  .name('zyphron')
  .description(purpleGradient('⚡ Zyphron CLI - Deploy anything, anywhere'))
  .version('1.0.0', '-v, --version', 'Output the current version')
  .helpOption('-h, --help', 'Display help for command');

// ===========================================
// CUSTOMIZE HELP OUTPUT
// ===========================================

program.configureHelp({
  sortSubcommands: true,
  sortOptions: true,
  formatHelp: (cmd, helper) => {
    // Custom help formatting
    const output: string[] = [];
    
    // Banner
    output.push('');
    output.push(purpleGradient('  ███████╗██╗   ██╗██████╗ ██╗  ██╗██████╗  ██████╗ ███╗   ██╗'));
    output.push(purpleGradient('  ╚══███╔╝╚██╗ ██╔╝██╔══██╗██║  ██║██╔══██╗██╔═══██╗████╗  ██║'));
    output.push(purpleGradient('    ███╔╝  ╚████╔╝ ██████╔╝███████║██████╔╝██║   ██║██╔██╗ ██║'));
    output.push(purpleGradient('   ███╔╝    ╚██╔╝  ██╔═══╝ ██╔══██║██╔══██╗██║   ██║██║╚██╗██║'));
    output.push(purpleGradient('  ███████╗   ██║   ██║     ██║  ██║██║  ██║╚██████╔╝██║ ╚████║'));
    output.push(purpleGradient('  ╚══════╝   ╚═╝   ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝'));
    output.push('');
    output.push(style.dim('  Deploy anything, anywhere. v1.0.0'));
    output.push('');
    output.push(style.purple('━'.repeat(65)));
    output.push('');
    
    // Description
    output.push(style.purpleBright('  DESCRIPTION'));
    output.push(`  ${helper.commandDescription(cmd)}`);
    output.push('');
    
    // Usage
    output.push(style.purpleBright('  USAGE'));
    output.push(`  ${style.dim('$')} ${style.purple('zyphron')} ${style.dim('<command>')} ${style.dim('[options]')}`);
    output.push('');
    
    // Commands
    output.push(style.purpleBright('  COMMANDS'));
    output.push('');
    output.push(`  ${style.purple('Authentication')}`);
    output.push(`    ${symbols.arrow} ${style.purple('login')}       Authenticate with Zyphron`);
    output.push(`    ${symbols.arrow} ${style.purple('logout')}      Log out from Zyphron`);
    output.push(`    ${symbols.arrow} ${style.purple('whoami')}      Display current user`);
    output.push('');
    output.push(`  ${style.purple('Projects')} ${style.dim('(coming soon)')}`);
    output.push(`    ${symbols.arrow} ${style.dim('init')}        Initialize a new project`);
    output.push(`    ${symbols.arrow} ${style.dim('projects')}    List all projects`);
    output.push(`    ${symbols.arrow} ${style.dim('link')}        Link current directory`);
    output.push('');
    output.push(`  ${style.purple('Deployments')} ${style.dim('(coming soon)')}`);
    output.push(`    ${symbols.arrow} ${style.dim('deploy')}      Deploy your project`);
    output.push(`    ${symbols.arrow} ${style.dim('logs')}        View deployment logs`);
    output.push(`    ${symbols.arrow} ${style.dim('status')}      Check deployment status`);
    output.push('');
    output.push(`  ${style.purple('Environment')} ${style.dim('(coming soon)')}`);
    output.push(`    ${symbols.arrow} ${style.dim('env')}         Manage environment variables`);
    output.push(`    ${symbols.arrow} ${style.dim('domains')}     Manage custom domains`);
    output.push('');
    
    // Options
    output.push(style.purpleBright('  OPTIONS'));
    output.push(`    ${style.purple('-v, --version')}    Output the current version`);
    output.push(`    ${style.purple('-h, --help')}       Display help for command`);
    output.push('');
    
    // Examples
    output.push(style.purpleBright('  EXAMPLES'));
    output.push(`    ${style.dim('$')} ${style.purple('zyphron login')}`);
    output.push(`    ${style.dim('$')} ${style.purple('zyphron init')} ${style.dim('--name my-app')}`);
    output.push(`    ${style.dim('$')} ${style.purple('zyphron deploy')}`);
    output.push('');
    
    // Footer
    output.push(style.purple('━'.repeat(65)));
    output.push('');
    output.push(`  ${style.dim('Documentation:')} ${style.info('https://docs.zyphron.dev')}`);
    output.push(`  ${style.dim('Support:')}       ${style.info('https://zyphron.dev/support')}`);
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
// DEFAULT ACTION (no command)
// ===========================================

program.action(() => {
  printBanner();
  console.log(style.dim('  Deploy anything, anywhere. v1.0.0'));
  console.log('');
  console.log(style.purple('━'.repeat(65)));
  console.log('');
  console.log(`  ${style.dim('Type')} ${style.purple('zyphron --help')} ${style.dim('for available commands')}`);
  console.log('');
  console.log(`  ${style.purple('Quick Start:')}`);
  console.log(`    ${style.dim('1.')} ${style.purple('zyphron login')}     ${style.dim('- Authenticate with your account')}`);
  console.log(`    ${style.dim('2.')} ${style.purple('zyphron init')}      ${style.dim('- Initialize a project')}`);
  console.log(`    ${style.dim('3.')} ${style.purple('zyphron deploy')}    ${style.dim('- Deploy your application')}`);
  console.log('');
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
