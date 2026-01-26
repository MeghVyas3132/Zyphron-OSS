// ===========================================
// ZYPHRON CLI - LOGIN COMMAND
// Next-level animated terminal experience
// Pure Light Blue + Purple Theme
// ===========================================

import { Command } from 'commander';
import { api, getErrorMessage } from '../../lib/api.js';
import { setToken, setApiUrl, setUser, getEnvApiUrl } from '../../lib/config.js';
import { 
  style,
  purpleBlueGradient,
  purpleGradient,
  createOraSpinner,
  box,
  sleep,
  promptInput,
  promptPassword,
  showSuccessAnimation,
  showErrorAnimation,
  animatedDivider,
  typewriterEffect,
  drawDivider,
} from '../../lib/ui.js';

interface LoginOptions {
  email?: string;
  password?: string;
  apiUrl?: string;
}

// ===========================================
// LOGIN COMMAND - Production Ready
// ===========================================

export const loginCommand = new Command('login')
  .description('Authenticate with Zyphron')
  .option('-e, --email <email>', 'Account email')
  .option('-p, --password <password>', 'Account password')
  .option('--api-url <url>', 'Custom API URL')
  .action(async (options: LoginOptions) => {
    // Clear and show animated header
    console.clear();
    console.log('');
    
    // Animated title
    const title = '  ZYPHRON LOGIN';
    for (const char of title) {
      process.stdout.write(purpleBlueGradient(char));
      await sleep(30);
    }
    console.log('');
    await animatedDivider(50);
    console.log('');
    
    try {
      // Set custom API URL if provided
      if (options.apiUrl) {
        api.setBaseUrl(options.apiUrl);
        setApiUrl(options.apiUrl);
        console.log(`  ${style.purple('▶')} ${style.blueLight('Custom API:')} ${style.dim(options.apiUrl)}`);
        console.log('');
      }
      
      // Get credentials
      let email = options.email;
      let password = options.password;
      
      if (!email || !password) {
        await typewriterEffect('  Enter your credentials:', 20);
        console.log('');
        
        if (!email) {
          email = await promptInput({
            message: 'Email',
            validate: (input) => {
              if (!input.includes('@')) return 'Please enter a valid email';
              return true;
            },
          });
        }
        
        if (!password) {
          password = await promptPassword({
            message: 'Password',
            validate: (input) => {
              if (input.length < 6) return 'Password must be at least 6 characters';
              return true;
            },
          });
        }
      }
      
      console.log('');
      
      // Animated login process with multiple stages
      const stages = [
        'Connecting to Zyphron',
        'Verifying credentials',
        'Establishing secure session',
      ];
      
      for (let i = 0; i < stages.length; i++) {
        const spinner = createOraSpinner(stages[i]);
        spinner.start();
        await sleep(400 + Math.random() * 300);
        spinner.succeed(style.purpleLight(stages[i]));
      }
      
      // Authenticate
      const spinner = createOraSpinner('Authenticating');
      spinner.start();
      
      const response = await api.login(email!, password!);
      
      if (!response.success) {
        spinner.fail(style.error('Authentication failed'));
        console.log('');
        await showErrorAnimation('Invalid email or password');
        console.log('');
        console.log(`  ${style.dim('Forgot your password?')} ${style.cyan('https://zyphron.dev/reset')}`);
        console.log('');
        process.exit(1);
      }
      
      spinner.succeed(style.cyan('Authenticated'));
      
      // Save session
      setToken(response.data.token);
      setUser({
        id: response.data.user.id,
        email: response.data.user.email,
        name: response.data.user.name,
        avatarUrl: response.data.user.avatarUrl || undefined,
      });
      
      console.log('');
      
      // Animated success box
      console.log(box(
        [
          '',
          purpleBlueGradient('  Welcome back!'),
          '',
          `  ${style.purple('User')}   ${style.blueLight(response.data.user.name)}`,
          `  ${style.purple('Email')}  ${style.blueLight(response.data.user.email)}`,
          '',
          `  ${style.dim('API')}    ${style.dim(getEnvApiUrl())}`,
          '',
        ].join('\n'),
        'Session Active'
      ));
      
      console.log('');
      await showSuccessAnimation('You are now logged in to Zyphron!');
      console.log('');
      
      // Quick start hints
      console.log(`  ${style.purple('Quick Start:')}`);
      console.log(`    ${style.dim('1.')} ${style.blue('zyphron projects')}  ${style.dim('- List your projects')}`);
      console.log(`    ${style.dim('2.')} ${style.purple('zyphron init')}      ${style.dim('- Initialize a project')}`);
      console.log(`    ${style.dim('3.')} ${style.blue('zyphron deploy')}    ${style.dim('- Deploy your code')}`);
      console.log('');
      
    } catch (error) {
      console.log('');
      await showErrorAnimation(`Login failed: ${getErrorMessage(error)}`);
      console.log('');
      console.log(`  ${style.dim('Need an account?')} ${style.purple('zyphron register')}`);
      console.log('');
      process.exit(1);
    }
  });
