// ===========================================
// ZYPHRON CLI - REGISTER COMMAND
// Create a new Zyphron account
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
  symbols,
} from '../../lib/ui.js';

interface RegisterOptions {
  name?: string;
  email?: string;
  password?: string;
  apiUrl?: string;
}

// ===========================================
// REGISTER COMMAND
// ===========================================

export const registerCommand = new Command('register')
  .description('Create a new Zyphron account')
  .option('-n, --name <name>', 'Your full name')
  .option('-e, --email <email>', 'Account email')
  .option('-p, --password <password>', 'Account password')
  .option('--api-url <url>', 'Custom API URL')
  .action(async (options: RegisterOptions) => {
    console.log('\n');
    
    // Show purple gradient title
    console.log(purpleGradient('📝 ZYPHRON REGISTER'));
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
      
      // Get registration info - use provided or prompt
      let name = options.name;
      let email = options.email;
      let password = options.password;
      
      if (!name || !email || !password) {
        console.log(style.dim('  Create your Zyphron account:'));
        console.log('');
        
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: style.purple('Full Name:'),
            when: !name,
            validate: (input: string) => {
              if (input.length < 2) {
                return 'Name must be at least 2 characters';
              }
              return true;
            },
          },
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
              if (input.length < 8) {
                return 'Password must be at least 8 characters';
              }
              return true;
            },
          },
          {
            type: 'password',
            name: 'confirmPassword',
            message: style.purple('Confirm Password:'),
            when: !password,
            mask: '●',
            validate: (input: string, answers: any) => {
              if (input !== answers.password) {
                return 'Passwords do not match';
              }
              return true;
            },
          },
        ]);
        
        name = name || answers.name;
        email = email || answers.email;
        password = password || answers.password;
      }
      
      console.log('');
      
      // Animate registration process
      const spinner = createOraSpinner('Creating your account...');
      spinner.start();
      
      await sleep(500);
      spinner.text = style.purple('Connecting to Zyphron...');
      
      await sleep(500);
      spinner.text = style.purple('Registering...');
      
      // Call register API
      const response = await api.register(name!, email!, password!);
      
      if (!response.success) {
        spinner.fail(style.error('Registration failed'));
        printError('Could not create account. Please try again.');
        process.exit(1);
      }
      
      spinner.text = style.purple('Setting up your account...');
      await sleep(500);
      
      // Save token and user info
      setToken(response.data.token);
      setUser({
        id: response.data.user.id,
        email: response.data.user.email,
        name: response.data.user.name,
        avatarUrl: response.data.user.avatarUrl || undefined,
      });
      
      spinner.succeed(style.success('Account created!'));
      
      console.log('');
      console.log(box(
        [
          purpleGradient(`${symbols.sparkle} Welcome to Zyphron!`),
          '',
          `${style.purple('User:')} ${response.data.user.name}`,
          `${style.purple('Email:')} ${response.data.user.email}`,
          '',
          style.dim(`API: ${getEnvApiUrl()}`),
        ].join('\n'),
        'Account Created'
      ));
      
      console.log('');
      printSuccess('Your account is ready!');
      console.log('');
      printInfo('Get started:');
      console.log(style.dim(`  ${style.purple('zyphron init')}          Initialize a project`));
      console.log(style.dim(`  ${style.purple('zyphron projects')}      List your projects`));
      console.log(style.dim(`  ${style.purple('zyphron deploy')}        Deploy your project`));
      console.log('');
      
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      
      if (errorMessage.includes('already exists')) {
        printError('An account with this email already exists.');
        console.log('');
        printInfo('To log in with your existing account:');
        console.log(style.dim(`  ${style.purple('zyphron login')}`));
      } else {
        printError(`Registration failed: ${errorMessage}`);
      }
      console.log('');
      process.exit(1);
    }
  });
