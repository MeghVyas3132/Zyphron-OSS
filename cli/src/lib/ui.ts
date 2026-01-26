// ===========================================
// ZYPHRON CLI - PRODUCTION READY UI
// Pure Light Blue + Purple Theme
// Next-level animated terminal experience
// ===========================================

import chalk from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';
import boxen from 'boxen';
import { createSpinner } from 'nanospinner';
import ora from 'ora';
import * as readline from 'readline';

// ===========================================
// COLOR PALETTE - ONLY Light Blue + Purple
// No dark blues, no greens, no other colors
// ===========================================

export const colors = {
  // Primary purples
  primary: '#B84CFF',      // Bright purple (main)
  purple: '#A855F7',       // Purple
  purpleLight: '#C084FC',  // Light purple
  purpleDim: '#D8B4FE',    // Pale purple
  
  // Light blues ONLY (no dark blues)
  blue: '#7DD3FC',         // Light blue (main)
  blueLight: '#BAE6FD',    // Pale blue
  blueBright: '#38BDF8',   // Sky blue
  cyan: '#67E8F9',         // Light cyan
  
  // Gradient stops
  gradientStart: '#B84CFF',  // Purple
  gradientMid: '#A78BFA',    // Light violet
  gradientEnd: '#7DD3FC',    // Light blue
  
  // Status (using purple/blue tones where possible)
  success: '#A78BFA',        // Light violet for success
  warning: '#C084FC',        // Light purple for warning
  error: '#F472B6',          // Pink (purple-adjacent) for errors
  info: '#7DD3FC',           // Light blue for info
  
  // Neutrals
  dim: '#A1A1AA',
  muted: '#D4D4D8',
  white: '#FFFFFF',
  black: '#0F0A1A',
};

// ===========================================
// CHALK STYLES - Pure Purple + Light Blue
// ===========================================

export const style = {
  // Brand colors - Purple
  purple: chalk.hex(colors.primary),
  purpleBright: chalk.hex(colors.primary).bold,
  purpleDim: chalk.hex(colors.purpleDim),
  purpleLight: chalk.hex(colors.purpleLight),
  accent: chalk.hex(colors.purple),
  
  // Brand colors - Light Blue
  blue: chalk.hex(colors.blue),
  blueBright: chalk.hex(colors.blueBright).bold,
  blueLight: chalk.hex(colors.blueLight),
  cyan: chalk.hex(colors.cyan),
  
  // Status (using theme colors)
  success: chalk.hex(colors.success),
  warning: chalk.hex(colors.warning),
  error: chalk.hex(colors.error),
  info: chalk.hex(colors.info),
  
  // Text
  dim: chalk.hex(colors.dim),
  muted: chalk.hex(colors.muted),
  bold: chalk.bold,
  white: chalk.hex(colors.white),
  
  // Combinations
  successBold: chalk.hex(colors.success).bold,
  errorBold: chalk.hex(colors.error).bold,
  warningBold: chalk.hex(colors.warning).bold,
  
  // Special
  link: chalk.hex(colors.cyan).underline,
  code: chalk.hex(colors.purpleLight).bgHex('#1A1025'),
  highlight: chalk.hex(colors.white).bgHex(colors.primary),
};

// ===========================================
// GRADIENTS - Purple to Light Blue
// ===========================================

export const purpleGradient = gradient([
  colors.primary,
  colors.purple,
  colors.blueBright,
  colors.blue,
]);

export const purpleBlueGradient = gradient([
  '#B84CFF',  // Purple
  '#A78BFA',  // Light violet
  '#7DD3FC',  // Light blue
]);

export const blueGradient = gradient([
  colors.blueLight,
  colors.blue,
  colors.cyan,
]);

export const successGradient = gradient([colors.purpleLight, colors.blue, colors.cyan]);
export const errorGradient = gradient([colors.error, '#FDA4AF', colors.purpleLight]);
export const infoGradient = gradient([colors.blue, colors.cyan, colors.blueLight]);

// ===========================================
// ASCII ART BANNER
// ===========================================

export const BANNER_ASCII = `
███████╗██╗   ██╗██████╗ ██╗  ██╗██████╗  ██████╗ ███╗   ██╗
╚══███╔╝╚██╗ ██╔╝██╔══██╗██║  ██║██╔══██╗██╔═══██╗████╗  ██║
  ███╔╝  ╚████╔╝ ██████╔╝███████║██████╔╝██║   ██║██╔██╗ ██║
 ███╔╝    ╚██╔╝  ██╔═══╝ ██╔══██║██╔══██╗██║   ██║██║╚██╗██║
███████╗   ██║   ██║     ██║  ██║██║  ██║╚██████╔╝██║ ╚████║
╚══════╝   ╚═╝   ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
`;

export const BANNER_MINI = `
╔═══════════════════════════════════════════════════════════╗
║   ███████╗██╗   ██╗██████╗ ██╗  ██╗██████╗  ██████╗ ███╗  ║
║   ╚══███╔╝╚██╗ ██╔╝██╔══██╗██║  ██║██╔══██╗██╔═══██╗████╗ ║
║     ███╔╝  ╚████╔╝ ██████╔╝███████║██████╔╝██║   ██║██╔██╗║
║    ███╔╝    ╚██╔╝  ██╔═══╝ ██╔══██║██╔══██╗██║   ██║██║╚██║
║   ███████╗   ██║   ██║     ██║  ██║██║  ██║╚██████╔╝██║ ╚█║
║   ╚══════╝   ╚═╝   ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝   ║
╚═══════════════════════════════════════════════════════════╝
`;

export function printBanner(): void {
  console.log('');
  console.log(purpleGradient.multiline(BANNER_ASCII));
  console.log('');
}

export function printBannerMini(): void {
  console.log(purpleGradient.multiline(BANNER_MINI));
}

// ===========================================
// ANIMATED ELEMENTS
// ===========================================

export const symbols = {
  // Status
  success: style.success('✓'),
  error: style.error('✗'),
  warning: style.warning('⚠'),
  info: style.info('ℹ'),
  
  // Progress
  arrow: style.purple('▶'),
  arrowRight: style.purple('→'),
  arrowDown: style.purple('↓'),
  bullet: style.purple('•'),
  star: style.purple('★'),
  
  // Boxes
  boxTopLeft: style.purple('╔'),
  boxTopRight: style.purple('╗'),
  boxBottomLeft: style.purple('╚'),
  boxBottomRight: style.purple('╝'),
  boxHorizontal: style.purple('═'),
  boxVertical: style.purple('║'),
  
  // Tree
  treeNode: style.purple('├─'),
  treeEnd: style.purple('└─'),
  treeLine: style.purple('│'),
  
  // Decorative (no emojis - professional ASCII)
  dot: style.blue('·'),
  diamond: style.purple('◆'),
  circle: style.blue('●'),
  square: style.purple('■'),
  dash: style.blue('─'),
  wave: style.purple('~'),
};

// ===========================================
// SPINNERS WITH PURPLE THEME
// ===========================================

const purpleSpinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const dotsFrames = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];
const boxFrames = ['◰', '◳', '◲', '◱'];

export function createPurpleSpinner(text: string) {
  return createSpinner(style.purple(text), {
    color: 'magenta',
    frames: purpleSpinnerFrames,
  });
}

export function createOraSpinner(text: string) {
  return ora({
    text: style.purple(text),
    color: 'magenta',
    spinner: {
      interval: 80,
      frames: dotsFrames.map(f => style.purple(f)),
    },
  });
}

// ===========================================
// BOX DRAWING
// ===========================================

export function box(content: string, title?: string): string {
  return boxen(content, {
    padding: 1,
    margin: { top: 1, bottom: 1, left: 0, right: 0 },
    borderStyle: 'double',
    borderColor: '#B84CFF',
    title: title ? style.purpleBright(` ${title} `) : undefined,
    titleAlignment: 'center',
  });
}

export function infoBox(content: string, title?: string): string {
  return boxen(content, {
    padding: 1,
    borderStyle: 'round',
    borderColor: '#06B6D4',
    title: title ? style.info(` ${title} `) : undefined,
    titleAlignment: 'left',
  });
}

export function successBox(content: string): string {
  return boxen(content, {
    padding: 1,
    borderStyle: 'round',
    borderColor: '#10B981',
    title: style.success(' ✓ Success '),
    titleAlignment: 'left',
  });
}

export function errorBox(content: string): string {
  return boxen(content, {
    padding: 1,
    borderStyle: 'round',
    borderColor: '#EF4444',
    title: style.error(' ✗ Error '),
    titleAlignment: 'left',
  });
}

// ===========================================
// PROGRESS & STATUS OUTPUT
// ===========================================

export function printHeader(text: string): void {
  console.log('');
  console.log(purpleGradient(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
  console.log(purpleGradient(`  ${text}`));
  console.log(purpleGradient(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
}

export function printSection(text: string): void {
  console.log('');
  console.log(style.purple(`▶ ${text}`));
  console.log(style.purple(`──────────────────────────────────────────`));
}

export function printStep(text: string): void {
  console.log(style.purple(`  ${symbols.treeNode} ${text}`));
}

export function printStepLast(text: string): void {
  console.log(style.purple(`  ${symbols.treeEnd} ${text}`));
}

export function printSuccess(text: string): void {
  console.log(`  ${symbols.success} ${style.success(text)}`);
}

export function printError(text: string): void {
  console.log(`  ${symbols.error} ${style.error(text)}`);
}

export function printWarning(text: string): void {
  console.log(`  ${symbols.warning} ${style.warning(text)}`);
}

export function printInfo(text: string): void {
  console.log(`  ${symbols.info} ${style.info(text)}`);
}

export function printDim(text: string): void {
  console.log(style.dim(`  ${text}`));
}

// ===========================================
// ANIMATED TEXT
// ===========================================

export async function animateText(text: string, delay = 30): Promise<void> {
  for (const char of text) {
    process.stdout.write(style.purple(char));
    await sleep(delay);
  }
  console.log('');
}

export async function typewriter(text: string, delay = 20): Promise<void> {
  for (const char of text) {
    process.stdout.write(char);
    await sleep(delay);
  }
  console.log('');
}

// ===========================================
// PROGRESS BAR
// ===========================================

export function progressBar(
  current: number,
  total: number,
  width = 40
): string {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  
  const filledBar = style.purple('█'.repeat(filled));
  const emptyBar = style.dim('░'.repeat(empty));
  
  return `${filledBar}${emptyBar} ${style.purple(`${percentage}%`)}`;
}

export async function animatedProgressBar(
  steps: string[],
  onStep?: (step: string, index: number) => Promise<void>
): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    const spinner = createOraSpinner(steps[i]);
    spinner.start();
    
    if (onStep) {
      await onStep(steps[i], i);
    } else {
      await sleep(500 + Math.random() * 500);
    }
    
    spinner.succeed(style.success(steps[i]));
  }
}

// ===========================================
// DEPLOY ANIMATION
// ===========================================

export async function deployAnimation(): Promise<void> {
  const frames = [
    `
    ${style.purple('╔════════════════════════════════════════╗')}
    ${style.purple('║')}  ${style.dim('Preparing deployment...')}              ${style.purple('║')}
    ${style.purple('║')}  ${progressBar(0, 100, 30)}  ${style.purple('║')}
    ${style.purple('╚════════════════════════════════════════╝')}
    `,
    `
    ${style.purple('╔════════════════════════════════════════╗')}
    ${style.purple('║')}  ${style.info('Cloning repository...')}               ${style.purple('║')}
    ${style.purple('║')}  ${progressBar(20, 100, 30)}  ${style.purple('║')}
    ${style.purple('╚════════════════════════════════════════╝')}
    `,
    `
    ${style.purple('╔════════════════════════════════════════╗')}
    ${style.purple('║')}  ${style.warning('Installing dependencies...')}         ${style.purple('║')}
    ${style.purple('║')}  ${progressBar(40, 100, 30)}  ${style.purple('║')}
    ${style.purple('╚════════════════════════════════════════╝')}
    `,
    `
    ${style.purple('╔════════════════════════════════════════╗')}
    ${style.purple('║')}  ${style.accent('Building application...')}             ${style.purple('║')}
    ${style.purple('║')}  ${progressBar(60, 100, 30)}  ${style.purple('║')}
    ${style.purple('╚════════════════════════════════════════╝')}
    `,
    `
    ${style.purple('╔════════════════════════════════════════╗')}
    ${style.purple('║')}  ${style.purple('Creating container...')}               ${style.purple('║')}
    ${style.purple('║')}  ${progressBar(80, 100, 30)}  ${style.purple('║')}
    ${style.purple('╚════════════════════════════════════════╝')}
    `,
    `
    ${style.purple('╔════════════════════════════════════════╗')}
    ${style.purple('║')}  ${style.success('Deployment complete!')} ${symbols.star}              ${style.purple('║')}
    ${style.purple('║')}  ${progressBar(100, 100, 30)}  ${style.purple('║')}
    ${style.purple('╚════════════════════════════════════════╝')}
    `,
  ];
  
  for (const frame of frames) {
    console.clear();
    printBanner();
    console.log(frame);
    await sleep(800);
  }
}

// ===========================================
// TABLE FORMATTING
// ===========================================

export function formatTable(headers: string[], rows: string[][]): void {
  const Table = require('cli-table3');
  
  const table = new Table({
    head: headers.map(h => style.purpleBright(h)),
    style: {
      head: [],
      border: ['magenta'],
    },
    chars: {
      'top': style.purple('═').toString(),
      'top-mid': style.purple('╤').toString(),
      'top-left': style.purple('╔').toString(),
      'top-right': style.purple('╗').toString(),
      'bottom': style.purple('═').toString(),
      'bottom-mid': style.purple('╧').toString(),
      'bottom-left': style.purple('╚').toString(),
      'bottom-right': style.purple('╝').toString(),
      'left': style.purple('║').toString(),
      'left-mid': style.purple('╟').toString(),
      'mid': style.purple('─').toString(),
      'mid-mid': style.purple('┼').toString(),
      'right': style.purple('║').toString(),
      'right-mid': style.purple('╢').toString(),
      'middle': style.purple('│').toString(),
    },
  });
  
  rows.forEach(row => table.push(row));
  console.log(table.toString());
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function clearLine(): void {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
}

export function clearScreen(): void {
  console.clear();
}

// ===========================================
// ANIMATED WELCOME MESSAGE
// ===========================================

export async function showAnimatedWelcome(userName?: string): Promise<void> {
  console.clear();
  
  // Animate banner line by line
  const bannerLines = BANNER_ASCII.trim().split('\n');
  for (let i = 0; i < bannerLines.length; i++) {
    console.log(purpleBlueGradient(bannerLines[i]));
    await sleep(50);
  }
  
  console.log('');
  
  // Animated tagline
  const tagline = '  Deploy anything, anywhere.';
  for (const char of tagline) {
    process.stdout.write(style.blue(char));
    await sleep(20);
  }
  console.log(style.dim(' v1.0.0'));
  
  console.log('');
  
  // Draw animated line
  const lineChars = '━'.repeat(50);
  for (let i = 0; i < lineChars.length; i++) {
    process.stdout.write(purpleBlueGradient(lineChars[i]));
    await sleep(10);
  }
  console.log('');
  
  // Welcome message
  if (userName) {
    console.log('');
    await typewriterEffect(`  Welcome back, ${style.purpleBright(userName)}!`, 30);
  }
  
  console.log('');
}

export async function showWelcome(): Promise<void> {
  console.clear();
  printBanner();
  
  console.log(style.dim('                    COMPLETE FLOW TEST SUITE'));
  console.log('');
  console.log(style.purple('  Deploy anything, anywhere. ') + style.dim('v1.0.0'));
  console.log('');
}

// ===========================================
// ANIMATED GOODBYE MESSAGE
// ===========================================

export async function showAnimatedGoodbye(): Promise<void> {
  console.log('');
  
  // Animated farewell box
  const farewellLines = [
    '',
    `  ${style.purpleBright('Thank you for using Zyphron!')}`,
    '',
    `  ${style.blue('We hope to see you again soon.')}`,
    '',
    `  ${style.dim('─'.repeat(40))}`,
    '',
    `  ${style.dim('Documentation:')} ${style.cyan('https://docs.zyphron.dev')}`,
    `  ${style.dim('Support:')}       ${style.cyan('https://zyphron.dev/support')}`,
    '',
  ];
  
  // Draw top border with animation
  const topBorder = '╔' + '═'.repeat(46) + '╗';
  for (const char of topBorder) {
    process.stdout.write(purpleBlueGradient(char));
    await sleep(8);
  }
  console.log('');
  
  // Print content with fade-in effect
  for (const line of farewellLines) {
    console.log(style.purple('║') + line.padEnd(46) + style.purple('║'));
    await sleep(60);
  }
  
  // Draw bottom border with animation
  const bottomBorder = '╚' + '═'.repeat(46) + '╝';
  for (const char of bottomBorder) {
    process.stdout.write(purpleBlueGradient(char));
    await sleep(8);
  }
  console.log('');
  
  // Final wave animation
  console.log('');
  const waveText = '  See you again!';
  for (const char of waveText) {
    process.stdout.write(style.blue(char));
    await sleep(40);
  }
  
  // Animated dots
  for (let i = 0; i < 3; i++) {
    await sleep(300);
    process.stdout.write(style.purple('.'));
  }
  console.log('');
  console.log('');
}

export function showGoodbye(): void {
  console.log('');
  console.log(box(
    `${style.purple('Thanks for using Zyphron!')}\n\n` +
    `${style.dim('Documentation:')} ${style.link('https://docs.zyphron.dev')}\n` +
    `${style.dim('Support:')}       ${style.link('https://zyphron.dev/support')}`,
    'See you soon!'
  ));
}

// ===========================================
// TYPEWRITER EFFECT
// ===========================================

export async function typewriterEffect(text: string, delayMs = 30): Promise<void> {
  for (const char of text) {
    process.stdout.write(char);
    await sleep(delayMs);
  }
  console.log('');
}

// ===========================================
// CUSTOM INPUT PROMPTS - Production Ready
// With visible password masking and animations
// ===========================================

export interface PromptOptions {
  message: string;
  defaultValue?: string;
  validate?: (input: string) => string | true;
  mask?: boolean;
  maskChar?: string;
}

/**
 * Animated text input with visible typing
 */
export async function promptInput(options: PromptOptions): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const message = `  ${style.purple('▶')} ${style.blue(options.message)} `;
    process.stdout.write(message);

    rl.question('', (answer) => {
      rl.close();
      resolve(answer || options.defaultValue || '');
    });
  });
}

/**
 * Password input with visible masked characters (●●●●)
 * Shows each character as it's typed for better UX
 */
export async function promptPassword(options: PromptOptions): Promise<string> {
  return new Promise((resolve) => {
    const message = `  ${style.purple('▶')} ${style.blue(options.message)} `;
    process.stdout.write(message);

    const maskChar = options.maskChar || '●';
    let password = '';

    // Enable raw mode to read character by character
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onKeypress = (char: string) => {
      // Handle Ctrl+C
      if (char === '\u0003') {
        process.stdout.write('\n');
        process.exit(0);
      }

      // Handle Enter
      if (char === '\r' || char === '\n') {
        process.stdin.removeListener('data', onKeypress);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        process.stdout.write('\n');
        resolve(password);
        return;
      }

      // Handle Backspace
      if (char === '\u007F' || char === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          // Clear the masked char
          process.stdout.write('\b \b');
        }
        return;
      }

      // Regular character
      password += char;
      process.stdout.write(style.purple(maskChar));
    };

    process.stdin.on('data', onKeypress);
  });
}

/**
 * Animated confirmation prompt (y/n)
 */
export async function promptConfirm(message: string, defaultValue = true): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const defaultHint = defaultValue ? style.dim('(Y/n)') : style.dim('(y/N)');
    const prompt = `  ${style.purple('▶')} ${style.blue(message)} ${defaultHint} `;
    
    rl.question(prompt, (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      if (normalized === '') {
        resolve(defaultValue);
      } else {
        resolve(normalized === 'y' || normalized === 'yes');
      }
    });
  });
}

/**
 * Animated select menu
 */
export async function promptSelect(
  message: string,
  choices: { name: string; value: string }[]
): Promise<string> {
  console.log('');
  console.log(`  ${style.purple('▶')} ${style.blue(message)}`);
  console.log('');
  
  choices.forEach((choice, index) => {
    console.log(`    ${style.purple(`${index + 1}.`)} ${style.blueLight(choice.name)}`);
  });
  
  console.log('');
  
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`  ${style.purple('▶')} ${style.dim('Enter choice (1-' + choices.length + '):')} `, (answer) => {
      rl.close();
      const index = parseInt(answer, 10) - 1;
      if (index >= 0 && index < choices.length) {
        resolve(choices[index].value);
      } else {
        resolve(choices[0].value);
      }
    });
  });
}

// ===========================================
// ANIMATED LOADING STATES
// ===========================================

export async function showLoadingAnimation(text: string, durationMs = 1500): Promise<void> {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  const startTime = Date.now();
  
  process.stdout.write(`  ${style.purple(frames[0])} ${style.blueLight(text)}`);
  
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      frameIndex = (frameIndex + 1) % frames.length;
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(`  ${style.purple(frames[frameIndex])} ${style.blueLight(text)}`);
      
      if (Date.now() - startTime >= durationMs) {
        clearInterval(interval);
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        resolve();
      }
    }, 80);
  });
}

export async function showSuccessAnimation(text: string): Promise<void> {
  await sleep(100);
  console.log(`  ${style.purple('✓')} ${style.cyan(text)}`);
}

export async function showErrorAnimation(text: string): Promise<void> {
  await sleep(100);
  console.log(`  ${style.error('✗')} ${style.error(text)}`);
}

// ===========================================
// DIVIDERS AND SEPARATORS
// ===========================================

export function drawDivider(width = 50): void {
  console.log(purpleBlueGradient('━'.repeat(width)));
}

export function drawDoubleDivider(width = 50): void {
  console.log(purpleBlueGradient('═'.repeat(width)));
}

export async function animatedDivider(width = 50): Promise<void> {
  for (let i = 0; i < width; i++) {
    process.stdout.write(purpleBlueGradient('━'));
    await sleep(10);
  }
  console.log('');
}
