// ===========================================
// ZYPHRON CLI - LOGOUT COMMAND
// Clear authentication session
// ===========================================

import { Command } from 'commander';
import { clearToken, getUser, isAuthenticated } from '../../lib/config.js';
import { 
  style,
  purpleGradient,
  createOraSpinner,
  printSuccess, 
  printWarning,
  printInfo,
  box,
  sleep,
  symbols,
} from '../../lib/ui.js';

// ===========================================
// LOGOUT COMMAND
// ===========================================

export const logoutCommand = new Command('logout')
  .description('Log out from Zyphron')
  .option('-f, --force', 'Force logout without confirmation')
  .action(async (options: { force?: boolean }) => {
    console.log('\n');
    
    // Show purple gradient title
    console.log(purpleGradient('🔓 ZYPHRON LOGOUT'));
    console.log(style.dim('━'.repeat(50)));
    console.log('\n');
    
    // Check if logged in
    if (!isAuthenticated()) {
      printWarning('You are not currently logged in.');
      console.log('');
      printInfo('To log in, run:');
      console.log(style.dim(`  ${style.purple('zyphron login')}`));
      console.log('');
      return;
    }
    
    const user = getUser();
    
    // Confirm logout if not forced
    if (!options.force) {
      console.log(style.dim(`Currently logged in as: ${style.purple(user?.email || 'unknown')}`));
      console.log('');
    }
    
    // Animate logout
    const spinner = createOraSpinner('Logging out...');
    spinner.start();
    
    await sleep(500);
    spinner.text = style.purple('Clearing session...');
    
    // Clear credentials
    clearToken();
    
    await sleep(300);
    spinner.succeed(style.success('Logged out successfully!'));
    
    console.log('');
    console.log(box(
      [
        `${symbols.check} Session cleared`,
        '',
        style.dim('Your credentials have been removed from this device.'),
        '',
        `${style.purple('To log in again:')} zyphron login`,
      ].join('\n'),
      'Goodbye!'
    ));
    console.log('');
  });
