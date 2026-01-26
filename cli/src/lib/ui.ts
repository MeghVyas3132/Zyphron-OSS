// ===========================================
// ZYPHRON CLI - PURPLE THEME & ANIMATIONS
// Beautiful terminal UI with heavy animations
// ===========================================

import chalk from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';
import boxen from 'boxen';
import { createSpinner } from 'nanospinner';
import ora from 'ora';

// ===========================================
// COLOR PALETTE - Purple Theme
// ===========================================

export const colors = {
  // Primary purples
  primary: '#B84CFF',      // Bright purple
  secondary: '#9333EA',    // Deep purple
  accent: '#C084FC',       // Light purple
  
  // Gradients
  gradientStart: '#7C3AED',
  gradientMid: '#A855F7',
  gradientEnd: '#D946EF',
  
  // Status colors
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#06B6D4',
  
  // Neutrals
  dim: '#6B7280',
  muted: '#9CA3AF',
  white: '#FFFFFF',
  black: '#0F0A1A',
};

// ===========================================
// CHALK STYLES
// ===========================================

export const style = {
  // Brand colors
  purple: chalk.hex(colors.primary),
  purpleBright: chalk.hex(colors.primary).bold,
  purpleDim: chalk.hex(colors.secondary),
  accent: chalk.hex(colors.accent),
  
  // Status
  success: chalk.hex(colors.success),
  warning: chalk.hex(colors.warning),
  error: chalk.hex(colors.error),
  info: chalk.hex(colors.info),
  
  // Text
  dim: chalk.hex(colors.dim),
  muted: chalk.hex(colors.muted),
  bold: chalk.bold,
  
  // Combinations
  successBold: chalk.hex(colors.success).bold,
  errorBold: chalk.hex(colors.error).bold,
  warningBold: chalk.hex(colors.warning).bold,
  
  // Special
  link: chalk.hex(colors.info).underline,
  code: chalk.hex(colors.accent).bgHex('#1A1025'),
  highlight: chalk.hex(colors.white).bgHex(colors.primary),
};

// ===========================================
// GRADIENTS
// ===========================================

export const purpleGradient = gradient([
  colors.gradientStart,
  colors.gradientMid,
  colors.gradientEnd,
]);

export const successGradient = gradient(['#059669', '#10B981', '#34D399']);
export const errorGradient = gradient(['#DC2626', '#EF4444', '#F87171']);
export const infoGradient = gradient(['#0891B2', '#06B6D4', '#22D3EE']);

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
║   ╚══════╝   ╚═╝   ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ║
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
  
  // Misc
  rocket: '🚀',
  fire: '🔥',
  sparkle: '✨',
  check: '✅',
  cross: '❌',
  cloud: '☁️',
  lightning: '⚡',
  database: '🗄️',
  lock: '🔒',
  key: '🔑',
  link: '🔗',
  globe: '🌐',
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
    ${style.purple('║')}  ${style.success('Deployment complete!')} ${symbols.rocket}             ${style.purple('║')}
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
// WELCOME MESSAGE
// ===========================================

export async function showWelcome(): Promise<void> {
  console.clear();
  printBanner();
  
  console.log(style.dim('                    COMPLETE FLOW TEST SUITE'));
  console.log('');
  console.log(style.purple('  Deploy anything, anywhere. ') + style.dim('v1.0.0'));
  console.log('');
}

// ===========================================
// GOODBYE MESSAGE
// ===========================================

export function showGoodbye(): void {
  console.log('');
  console.log(box(
    `${style.purple('Thanks for using Zyphron!')} ${symbols.sparkle}\n\n` +
    `${style.dim('Documentation:')} ${style.link('https://docs.zyphron.dev')}\n` +
    `${style.dim('Support:')}       ${style.link('https://zyphron.dev/support')}`,
    'See you soon!'
  ));
}
