// ===========================================
// ZYPHRON CLI - LOGIN COMMAND
// Browser-based auth: opens zyphron.space,
// listens on localhost for the token callback.
// ===========================================

import { Command } from 'commander';
import * as http from 'http';
import * as crypto from 'crypto';
import open from 'open';
import { setToken, setApiUrl, getEnvApiUrl } from '../../lib/config.js';
import {
  style,
  purpleBlueGradient,
  createOraSpinner,
  sleep,
  animatedDivider,
} from '../../lib/ui.js';

const LANDING_URL = process.env.ZYPHRON_LANDING_URL || 'https://zyphron.space';
const CALLBACK_PORT_RANGE = [9731, 9732, 9733, 9734, 9735];

async function findFreePort(candidates: number[]): Promise<number> {
  for (const port of candidates) {
    const free = await new Promise<boolean>((resolve) => {
      const srv = http.createServer();
      srv.listen(port, '127.0.0.1', () => { srv.close(); resolve(true); });
      srv.on('error', () => resolve(false));
    });
    if (free) return port;
  }
  // Fallback: OS-assigned port
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as { port: number };
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

const SUCCESS_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Zyphron — Authenticated</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#030303;color:#eee;font-family:'JetBrains Mono',monospace;
         display:flex;align-items:center;justify-content:center;min-height:100vh}
    .box{border:1px solid rgba(255,255,255,.08);padding:40px 48px;border-radius:8px;text-align:center;max-width:380px}
    .z{width:36px;height:36px;border:1px solid rgba(255,255,255,.15);border-radius:4px;
       display:inline-flex;align-items:center;justify-content:center;
       font-size:12px;letter-spacing:.1em;color:rgba(255,255,255,.7);margin-bottom:20px}
    h2{font-size:16px;font-weight:400;letter-spacing:.05em;color:rgba(255,255,255,.85);margin-bottom:8px}
    p{font-size:10px;letter-spacing:.25em;text-transform:uppercase;color:rgba(255,255,255,.3)}
  </style>
</head>
<body>
  <div class="box">
    <div class="z">Z</div>
    <h2>Authentication complete</h2>
    <p>You can close this tab</p>
  </div>
</body>
</html>`;

const ERROR_HTML = (msg: string) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Zyphron — Error</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#030303;color:#eee;font-family:'JetBrains Mono',monospace;
         display:flex;align-items:center;justify-content:center;min-height:100vh}
    .box{border:1px solid rgba(255,100,100,.15);padding:40px 48px;border-radius:8px;text-align:center;max-width:380px}
    h2{font-size:14px;font-weight:400;color:rgba(255,120,120,.8);margin-bottom:8px}
    p{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.3)}
  </style>
</head>
<body>
  <div class="box">
    <h2>${msg || 'Authentication failed'}</h2>
    <p>Return to terminal and try again</p>
  </div>
</body>
</html>`;

interface LoginOptions {
  apiUrl?: string;
}

export const loginCommand = new Command('login')
  .description('Authenticate via browser')
  .option('--api-url <url>', 'Custom API URL')
  .action(async (options: LoginOptions) => {
    console.clear();
    console.log('');

    const title = '  ZYPHRON LOGIN';
    for (const char of title) {
      process.stdout.write(purpleBlueGradient(char));
      await sleep(25);
    }
    console.log('');
    await animatedDivider(50);
    console.log('');

    if (options.apiUrl) {
      setApiUrl(options.apiUrl);
      console.log(`  ${style.purple('API')}  ${style.dim(options.apiUrl)}`);
      console.log('');
    }

    // ── Start local callback server ──────────────────────────
    const port = await findFreePort(CALLBACK_PORT_RANGE);
    const state = crypto.randomBytes(20).toString('hex');
    const callbackUrl = `http://127.0.0.1:${port}/callback`;
    const loginUrl = `${LANDING_URL}/?cli_redirect=${encodeURIComponent(callbackUrl)}&state=${state}#access`;

    let resolveAuth: (token: string) => void;
    let rejectAuth: (err: Error) => void;
    const authPromise = new Promise<string>((res, rej) => {
      resolveAuth = res;
      rejectAuth = rej;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const token = url.searchParams.get('token');
      const error = url.searchParams.get('error');

      if (token) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(SUCCESS_HTML);
        server.close();
        resolveAuth(token);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(ERROR_HTML(error ?? 'Authentication failed'));
        server.close();
        rejectAuth(new Error(error ?? 'Authentication failed'));
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(port, '127.0.0.1', () => resolve());
      server.on('error', reject);
    });

    // ── Open browser ─────────────────────────────────────────
    const spinner = createOraSpinner('Opening browser');
    spinner.start();
    await open(loginUrl);
    spinner.succeed(style.purpleLight('Browser opened'));

    console.log('');
    console.log(`  ${style.dim('Waiting for authentication...')}`);
    console.log(`  ${style.dim('Listening on')} ${style.cyan(`http://127.0.0.1:${port}`)}`);
    console.log('');

    // ── Timeout after 5 minutes ───────────────────────────────
    const timeout = setTimeout(() => {
      server.close();
      rejectAuth(new Error('Authentication timed out after 5 minutes'));
    }, 5 * 60 * 1000);

    try {
      const token = await authPromise;
      clearTimeout(timeout);

      // Save token
      setToken(token);

      // Fetch user info
      const apiBase = getEnvApiUrl();
      let userName = 'authenticated';
      let userEmail = '';
      try {
        const r = await fetch(`${apiBase}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const d = await r.json() as { data?: { name?: string; email?: string } };
          userName = d?.data?.name ?? userName;
          userEmail = d?.data?.email ?? '';
        }
      } catch { /* best effort */ }

      console.log('');
      console.log(`  ${style.purple('/')}${'─'.repeat(46)}${style.purple('\\')}`);
      console.log(`  ${style.purple('|')}  ${purpleBlueGradient('  Authentication successful')}          ${style.purple('|')}`);
      console.log(`  ${style.purple('|')}                                              ${style.purple('|')}`);
      if (userEmail) {
        console.log(`  ${style.purple('|')}  ${style.dim('User')}  ${style.blueLight(userName.padEnd(36))}${style.purple('|')}`);
        console.log(`  ${style.purple('|')}  ${style.dim('Email')} ${style.blueLight(userEmail.padEnd(36))}${style.purple('|')}`);
      } else {
        console.log(`  ${style.purple('|')}  ${style.dim('Logged in as')} ${style.blueLight(userName.padEnd(32))}${style.purple('|')}`);
      }
      console.log(`  ${style.purple('\\') }${'─'.repeat(46)}${style.purple('/')}`);
      console.log('');

      console.log(`  ${style.purple('Next steps:')}`);
      console.log(`    ${style.dim('$')} ${style.purple('zy create')} ${style.blue('my-app')}     ${style.dim('create a project')}`);
      console.log(`    ${style.dim('$')} ${style.purple('zy deploy')}             ${style.dim('deploy current directory')}`);
      console.log(`    ${style.dim('$')} ${style.purple('zy logs')}               ${style.dim('stream live logs')}`);
      console.log('');

    } catch (err) {
      clearTimeout(timeout);
      console.log('');
      console.log(`  ${style.error('Authentication failed')}: ${err instanceof Error ? err.message : String(err)}`);
      console.log(`  ${style.dim('Try again with')} ${style.purple('zy login')}`);
      console.log('');
      process.exit(1);
    }
  });
