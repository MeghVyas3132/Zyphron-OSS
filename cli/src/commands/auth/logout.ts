// ===========================================
// ZYPHRON CLI - LOGOUT COMMAND
// Next-level animated terminal experience
// Pure Light Blue + Purple Theme
// ===========================================

import { Command } from 'commander';
import { clearToken, getUser, isAuthenticated } from '../../lib/config.js';
import { 
  style,
  purpleBlueGradient,
  createOraSpinner,
  sleep,
  showAnimatedGoodbye,
  animatedDivider,
  typewriterEffect,
  promptConfirm,
} from '../../lib/ui.js';

// ===========================================
// LOGOUT COMMAND - Production Ready
// ===========================================

export const logoutCommand = new Command('logout')
  .description('Log out from Zyphron')
  .option('-f, --force', 'Force logout without confirmation')
  .action(async (options: { force?: boolean }) => {
    // Clear and show animated header
    console.clear();
    console.log('');
    
    // Animated title
    const title = '  ZYPHRON LOGOUT';
    for (const char of title) {
      process.stdout.write(purpleBlueGradient(char));
      await sleep(30);
    }
    console.log('');
    await animatedDivider(50);
    console.log('');
    
    // Check if logged in
    if (!isAuthenticated()) {
      console.log(`  ${style.purple('▶')} ${style.blueLight('You are not currently logged in.')}`);
      console.log('');
      console.log(`  ${style.dim('To log in, run:')} ${style.purple('zyphron login')}`);
      console.log('');
      return;
    }
    
    const user = getUser();
    
    // Show current user
    console.log(`  ${style.purple('▶')} ${style.dim('Logged in as:')} ${style.blueLight(user?.email || 'unknown')}`);
    console.log('');
    
    // Confirm logout if not forced
    if (!options.force) {
      const confirmed = await promptConfirm('Are you sure you want to log out?', true);
      if (!confirmed) {
        console.log('');
        console.log(`  ${style.purple('▶')} ${style.blueLight('Logout cancelled.')}`);
        console.log('');
        return;
      }
    }
    
    console.log('');
    
    // Animated logout process
    const stages = [
      'Ending session',
      'Clearing credentials',
    ];
    
    for (let i = 0; i < stages.length; i++) {
      const spinner = createOraSpinner(stages[i]);
      spinner.start();
      await sleep(300 + Math.random() * 200);
      spinner.succeed(style.purpleLight(stages[i]));
    }
    
    // Clear credentials
    clearToken();
    
    // Final success
    const spinner = createOraSpinner('Logging out');
    spinner.start();
    await sleep(200);
    spinner.succeed(style.cyan('Logged out successfully'));
    
    // Show animated goodbye
    await showAnimatedGoodbye();
  });
