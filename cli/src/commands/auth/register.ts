// ===========================================
// ZYPHRON CLI - REGISTER COMMAND
// Next-level animated terminal experience
// Pure Light Blue + Purple Theme
// ===========================================

import { Command } from 'commander';
import { api, getErrorMessage } from '../../lib/api.js';
import { setToken, setApiUrl, setUser, getEnvApiUrl } from '../../lib/config.js';
import { 
  style,
  purpleBlueGradient,
  createOraSpinner,
  box,
  sleep,
  promptInput,
  promptPassword,
  showSuccessAnimation,
  showErrorAnimation,
  animatedDivider,
  typewriterEffect,
} from '../../lib/ui.js';

interface RegisterOptions {
  name?: string;
  email?: string;
  password?: string;
  apiUrl?: string;
}

// ===========================================
// REGISTER COMMAND - Production Ready
// ===========================================

export const registerCommand = new Command('register')
  .description('Create a new Zyphron account')
  .option('-n, --name <name>', 'Your full name')
  .option('-e, --email <email>', 'Account email')
  .option('-p, --password <password>', 'Account password')
  .option('--api-url <url>', 'Custom API URL')
  .action(async (options: RegisterOptions) => {
    // Clear and show animated header
    console.clear();
    console.log('');
    
    // Animated title
    const title = '  ZYPHRON REGISTER';
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
      
      // Get registration info
      let name = options.name;
      let email = options.email;
      let password = options.password;
      
      if (!name || !email || !password) {
        await typewriterEffect('  Create your account:', 20);
        console.log('');
        
        if (!name) {
          name = await promptInput({
            message: 'Full Name',
            validate: (input) => {
              if (input.length < 2) return 'Name must be at least 2 characters';
              return true;
            },
          });
        }
        
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
            message: 'Password (min 8 chars)',
            validate: (input) => {
              if (input.length < 8) return 'Password must be at least 8 characters';
              return true;
            },
          });
          
          // Confirm password
          const confirmPassword = await promptPassword({
            message: 'Confirm Password',
            validate: (input) => {
              if (input !== password) return 'Passwords do not match';
              return true;
            },
          });
        }
      }
      
      console.log('');
      
      // Animated registration process
      const stages = [
        'Preparing your account',
        'Connecting to Zyphron',
        'Creating credentials',
      ];
      
      for (let i = 0; i < stages.length; i++) {
        const spinner = createOraSpinner(stages[i]);
        spinner.start();
        await sleep(350 + Math.random() * 250);
        spinner.succeed(style.purpleLight(stages[i]));
      }
      
      // Register
      const spinner = createOraSpinner('Registering');
      spinner.start();
      
      const response = await api.register(name!, email!, password!);
      
      if (!response.success) {
        spinner.fail(style.error('Registration failed'));
        console.log('');
        await showErrorAnimation('Could not create account');
        console.log('');
        process.exit(1);
      }
      
      spinner.succeed(style.cyan('Account created'));
      
      // Save session
      setToken(response.data.token);
      setUser({
        id: response.data.user.id,
        email: response.data.user.email,
        name: response.data.user.name,
        avatarUrl: response.data.user.avatarUrl || undefined,
      });
      
      console.log('');
      
      // Success box
      console.log(box(
        [
          '',
          purpleBlueGradient('  Welcome to Zyphron!'),
          '',
          `  ${style.purple('User')}   ${style.blueLight(response.data.user.name)}`,
          `  ${style.purple('Email')}  ${style.blueLight(response.data.user.email)}`,
          '',
          `  ${style.dim('API')}    ${style.dim(getEnvApiUrl())}`,
          '',
        ].join('\n'),
        'Account Created'
      ));
      
      console.log('');
      await showSuccessAnimation('Your account is ready!');
      console.log('');
      
      // Get started hints
      console.log(`  ${style.purple('Get Started:')}`);
      console.log(`    ${style.dim('1.')} ${style.blue('zyphron init')}      ${style.dim('- Initialize a project')}`);
      console.log(`    ${style.dim('2.')} ${style.purple('zyphron projects')}  ${style.dim('- List your projects')}`);
      console.log(`    ${style.dim('3.')} ${style.blue('zyphron deploy')}    ${style.dim('- Deploy your code')}`);
      console.log('');
      
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      
      console.log('');
      if (errorMessage.includes('already exists')) {
        await showErrorAnimation('An account with this email already exists');
        console.log('');
        console.log(`  ${style.dim('Already have an account?')} ${style.purple('zyphron login')}`);
      } else {
        await showErrorAnimation(`Registration failed: ${errorMessage}`);
      }
      console.log('');
      process.exit(1);
    }
  });
