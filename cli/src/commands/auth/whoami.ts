// ===========================================
// ZYPHRON CLI - WHOAMI COMMAND
// Display current user information
// ===========================================

import { Command } from 'commander';
import { api, getErrorMessage } from '../../lib/api.js';
import { getUser, isAuthenticated, getEnvApiUrl, getToken } from '../../lib/config.js';
import { 
  style,
  purpleGradient,
  createOraSpinner,
  printSuccess, 
  printError, 
  printWarning,
  printInfo,
  box,
  sleep,
  symbols,
} from '../../lib/ui.js';

// ===========================================
// WHOAMI COMMAND
// ===========================================

export const whoamiCommand = new Command('whoami')
  .description('Display current user information')
  .option('-r, --refresh', 'Refresh user data from API')
  .action(async (options: { refresh?: boolean }) => {
    console.log('\n');
    
    // Show purple gradient title
    console.log(purpleGradient('👤 ZYPHRON USER'));
    console.log(style.dim('━'.repeat(50)));
    console.log('\n');
    
    // Check if logged in
    if (!isAuthenticated()) {
      printWarning('You are not logged in.');
      console.log('');
      printInfo('To log in, run:');
      console.log(style.dim(`  ${style.purple('zyphron login')}`));
      console.log('');
      process.exit(1);
    }
    
    try {
      let user = getUser();
      
      // Refresh from API if requested
      if (options.refresh || !user) {
        const spinner = createOraSpinner('Fetching user data...');
        spinner.start();
        
        const response = await api.me();
        
        if (!response.success) {
          spinner.fail(style.error('Failed to fetch user data'));
          printError('Your session may have expired. Please log in again.');
          console.log(style.dim(`  ${style.purple('zyphron login')}`));
          process.exit(1);
        }
        
        user = {
          id: response.data.id,
          email: response.data.email,
          name: response.data.name,
          avatarUrl: response.data.avatarUrl || undefined,
        };
        
        spinner.succeed(style.success('User data fetched'));
        console.log('');
      }
      
      // Display user info
      const token = getToken();
      const maskedToken = token ? `${token.slice(0, 10)}...${token.slice(-6)}` : 'N/A';
      
      console.log(box(
        [
          purpleGradient(`${symbols.sparkle} Authenticated User`),
          '',
          `${style.purple('Name:')}    ${user?.name || 'N/A'}`,
          `${style.purple('Email:')}   ${user?.email || 'N/A'}`,
          `${style.purple('ID:')}      ${user?.id || 'N/A'}`,
          '',
          style.dim('━'.repeat(35)),
          '',
          `${style.purple('API:')}     ${getEnvApiUrl()}`,
          `${style.purple('Token:')}   ${style.dim(maskedToken)}`,
        ].join('\n'),
        'Session Info'
      ));
      
      console.log('');
      printSuccess(`Logged in as ${style.purpleBright(user?.email || 'unknown')}`);
      console.log('');
      
    } catch (error) {
      printError(`Failed to get user info: ${getErrorMessage(error)}`);
      console.log('');
      printWarning('Your session may have expired. Please log in again:');
      console.log(style.dim(`  ${style.purple('zyphron login')}`));
      console.log('');
      process.exit(1);
    }
  });
