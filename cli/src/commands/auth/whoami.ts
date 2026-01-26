// ===========================================
// ZYPHRON CLI - WHOAMI COMMAND
// Next-level animated terminal experience
// Pure Light Blue + Purple Theme
// ===========================================

import { Command } from 'commander';
import { api, getErrorMessage } from '../../lib/api.js';
import { getUser, isAuthenticated, getEnvApiUrl, getToken } from '../../lib/config.js';
import { 
  style,
  purpleBlueGradient,
  createOraSpinner,
  box,
  sleep,
  animatedDivider,
  showSuccessAnimation,
  showErrorAnimation,
} from '../../lib/ui.js';

// ===========================================
// WHOAMI COMMAND - Production Ready
// ===========================================

export const whoamiCommand = new Command('whoami')
  .description('Display current user information')
  .option('-r, --refresh', 'Refresh user data from API')
  .action(async (options: { refresh?: boolean }) => {
    // Clear and show animated header
    console.clear();
    console.log('');
    
    // Animated title
    const title = '  ZYPHRON USER';
    for (const char of title) {
      process.stdout.write(purpleBlueGradient(char));
      await sleep(30);
    }
    console.log('');
    await animatedDivider(50);
    console.log('');
    
    // Check if logged in
    if (!isAuthenticated()) {
      console.log(`  ${style.purple('▶')} ${style.blueLight('You are not logged in.')}`);
      console.log('');
      console.log(`  ${style.dim('To log in, run:')} ${style.purple('zyphron login')}`);
      console.log('');
      process.exit(1);
    }
    
    try {
      let user = getUser();
      
      // Refresh from API if requested
      if (options.refresh || !user) {
        const spinner = createOraSpinner('Fetching user data');
        spinner.start();
        
        const response = await api.me();
        
        if (!response.success) {
          spinner.fail(style.error('Failed to fetch user data'));
          console.log('');
          await showErrorAnimation('Session may have expired');
          console.log('');
          console.log(`  ${style.dim('Please log in again:')} ${style.purple('zyphron login')}`);
          console.log('');
          process.exit(1);
        }
        
        user = {
          id: response.data.id,
          email: response.data.email,
          name: response.data.name,
          avatarUrl: response.data.avatarUrl || undefined,
        };
        
        spinner.succeed(style.cyan('User data fetched'));
        console.log('');
      }
      
      // Display user info
      const token = getToken();
      const maskedToken = token ? `${token.slice(0, 10)}...${token.slice(-6)}` : 'N/A';
      
      console.log(box(
        [
          '',
          purpleBlueGradient('  Authenticated User'),
          '',
          `  ${style.purple('Name')}    ${style.blueLight(user?.name || 'N/A')}`,
          `  ${style.purple('Email')}   ${style.blueLight(user?.email || 'N/A')}`,
          `  ${style.purple('ID')}      ${style.dim(user?.id || 'N/A')}`,
          '',
          `  ${style.dim('━'.repeat(35))}`,
          '',
          `  ${style.purple('API')}     ${style.dim(getEnvApiUrl())}`,
          `  ${style.purple('Token')}   ${style.dim(maskedToken)}`,
          '',
        ].join('\n'),
        'Session Info'
      ));
      
      console.log('');
      await showSuccessAnimation(`Logged in as ${style.blueLight(user?.email || 'unknown')}`);
      console.log('');
      
    } catch (error) {
      console.log('');
      await showErrorAnimation(`Failed to get user info: ${getErrorMessage(error)}`);
      console.log('');
      console.log(`  ${style.dim('Session may have expired. Please log in again:')}`);
      console.log(`  ${style.purple('zyphron login')}`);
      console.log('');
      process.exit(1);
    }
  });
