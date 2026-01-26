// ===========================================
// ZYPHRON CLI - LOGIN COMMAND
// Authenticate with the Zyphron platform
// ===========================================

import { Command } from 'commander';
import inquirer from 'inquirer';
import { api, getErrorMessage } from '../../lib/api.js';
import { setToken, setApiUrl, setUser, getEnvApiUrl } from '../../lib/config.js';
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
} from '../../lib/ui.js';

interface LoginOptions {
  email?: string;
  password?: string;
  apiUrl?: string;
}

// ===========================================
// LOGIN COMMAND
// ===========================================

export const loginCommand = new Command('login')
  .description('Authenticate with Zyphron')
  .option('-e, --email <email>', 'Account email')
  .option('-p, --password <password>', 'Account password')
  .option('--api-url <url>', 'Custom API URL')
  .action(async (options: LoginOptions) => {
    console.log('\n');
    
    // Show purple gradient title
    console.log(purpleGradient('🔐 ZYPHRON LOGIN'));
    console.log(style.dim('━'.repeat(50)));
    console.log('\n');
    
    try {
      // Set custom API URL if provided
      if (options.apiUrl) {
        api.setBaseUrl(options.apiUrl);
        setApiUrl(options.apiUrl);
        printInfo(`Using custom API: ${options.apiUrl}`);
        console.log('');
      }
      
      // Get credentials - use provided or prompt
      let email = options.email;
      let password = options.password;
      
      if (!email || !password) {
        printInfo('Enter your Zyphron credentials:');
        console.log('');
        
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'email',
            message: style.purple('Email:'),
            when: !email,
            validate: (input: string) => {
              if (!input.includes('@')) {
                return 'Please enter a valid email address';
              }
              return true;
            },
          },
          {
            type: 'password',
            name: 'password',
            message: style.purple('Password:'),
            when: !password,
            mask: '●',
            validate: (input: string) => {
              if (input.length < 6) {
                return 'Password must be at least 6 characters';
              }
              return true;
            },
          },
        ]);
        
        email = email || answers.email;
        password = password || answers.password;
      }
      
      console.log('');
      
      // Animate login process
      const spinner = createOraSpinner('Connecting to Zyphron...');
      spinner.start();
      
      await sleep(800);
      spinner.text = style.purple('Authenticating...');
      
      // Call login API
      const response = await api.login(email!, password!);
      
      if (!response.success) {
        spinner.fail(style.error('Authentication failed'));
        printError('Invalid credentials. Please try again.');
        process.exit(1);
      }
      
      spinner.text = style.purple('Securing session...');
      await sleep(500);
      
      // Save token and user info
      setToken(response.data.token);
      setUser({
        id: response.data.user.id,
        email: response.data.user.email,
        name: response.data.user.name,
        avatarUrl: response.data.user.avatarUrl || undefined,
      });
      
      spinner.succeed(style.success('Authenticated!'));
      
      console.log('');
      console.log(box(
        [
          purpleGradient('✨ Welcome back!'),
          '',
          `${style.purple('User:')} ${response.data.user.name}`,
          `${style.purple('Email:')} ${response.data.user.email}`,
          '',
          style.dim(`API: ${getEnvApiUrl()}`),
        ].join('\n'),
        'Session Active'
      ));
      
      console.log('');
      printSuccess('You are now logged in to Zyphron!');
      console.log('');
      printInfo('Quick start commands:');
      console.log(style.dim(`  ${style.purple('zyphron projects')}      List your projects`));
      console.log(style.dim(`  ${style.purple('zyphron init')}          Initialize a new project`));
      console.log(style.dim(`  ${style.purple('zyphron deploy')}        Deploy your project`));
      console.log('');
      
    } catch (error) {
      printError(`Login failed: ${getErrorMessage(error)}`);
      console.log('');
      printWarning('If you don\'t have an account, run:');
      console.log(style.dim(`  ${style.purple('zyphron auth register')}`));
      console.log('');
      process.exit(1);
    }
  });
