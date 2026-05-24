// ===========================================
// EMAIL TEMPLATES — monochrome, premium
// ===========================================

const base = (content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Zyphron</title>
</head>
<body style="margin:0;padding:0;background:#000;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#000;min-height:100vh;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid #1a1a1a;">
            <span style="font-size:20px;font-weight:700;letter-spacing:-0.5px;color:#fff;">ZYPHRON</span>
            <span style="font-size:11px;color:#444;margin-left:8px;letter-spacing:2px;text-transform:uppercase;">deploy anything</span>
          </td>
        </tr>
        <!-- Content -->
        <tr><td style="padding:40px;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #1a1a1a;text-align:center;">
            <p style="margin:0;font-size:12px;color:#333;">
              © 2025 Zyphron · <a href="https://zyphron.space" style="color:#555;text-decoration:none;">zyphron.space</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const btn = (url: string, label: string) =>
  `<a href="${url}" style="display:inline-block;padding:12px 28px;background:#fff;color:#000;font-size:13px;font-weight:600;text-decoration:none;border-radius:4px;letter-spacing:0.5px;">${label}</a>`;

const mono = (text: string) =>
  `<code style="background:#111;color:#aaa;padding:2px 6px;border-radius:3px;font-size:13px;font-family:monospace;">${text}</code>`;

const h1 = (text: string) =>
  `<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;letter-spacing:-0.5px;color:#fff;">${text}</h1>`;

const p = (text: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#888;">${text}</p>`;

const statusBadge = (status: 'success' | 'failed' | 'info', label: string) => {
  const colors = { success: '#1a3d1a', failed: '#3d1a1a', info: '#1a1a3d' };
  const text = { success: '#4ade80', failed: '#f87171', info: '#818cf8' };
  return `<span style="display:inline-block;padding:4px 10px;background:${colors[status]};color:${text[status]};border-radius:3px;font-size:12px;font-weight:600;font-family:monospace;">${label}</span>`;
};

// ===========================================
// TEMPLATE FUNCTIONS
// ===========================================

export function welcomeEmail(_name: string, loginUrl: string): { subject: string; html: string } {
  return {
    subject: 'Welcome to Zyphron — Deploy anything, anywhere',
    html: base(`
      ${h1('Welcome to Zyphron.')}
      ${p('Your Zyphron account is ready. Paste any public GitHub repo URL and your app goes live on <strong style="color:#fff;">yourapp.zyphron.space</strong> in minutes.')}
      ${p('Zero config. Auto-detected stack. Custom subdomain. SSL included.')}
      <div style="margin:28px 0;">${btn(loginUrl, 'Open Dashboard →')}</div>
      ${p('Questions? Reply to this email.')}
    `),
  };
}

export function emailVerificationEmail(_name: string, otp: string): { subject: string; html: string } {
  return {
    subject: `${otp} — Verify your Zyphron email`,
    html: base(`
      ${h1('Verify your email')}
      ${p('Use the code below to verify your Zyphron account. Valid for 15 minutes.')}
      <div style="margin:28px 0;text-align:center;">
        <div style="display:inline-block;padding:20px 40px;background:#111;border:1px solid #222;border-radius:6px;">
          <span style="font-size:36px;font-weight:700;letter-spacing:8px;font-family:monospace;color:#fff;">${otp}</span>
        </div>
      </div>
      ${p('If you did not create a Zyphron account, ignore this email.')}
    `),
  };
}

export function passwordResetEmail(_name: string, resetUrl: string): { subject: string; html: string } {
  return {
    subject: 'Reset your Zyphron password',
    html: base(`
      ${h1('Password reset')}
      ${p('Click the button below to set a new password. This link expires in 1 hour.')}
      <div style="margin:28px 0;">${btn(resetUrl, 'Reset Password →')}</div>
      ${p('If you did not request this, your account is safe — ignore this email.')}
    `),
  };
}

export function deploymentStartedEmail(
  _name: string,
  projectName: string,
  repoUrl: string,
  deploymentId: string,
  dashboardUrl: string
): { subject: string; html: string } {
  return {
    subject: `Deploying ${projectName} — Zyphron`,
    html: base(`
      ${h1('Deployment started')}
      <div style="margin:0 0 24px;">${statusBadge('info', 'BUILDING')}</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #111;color:#555;font-size:13px;">Project</td>
            <td style="padding:8px 0;border-bottom:1px solid #111;color:#fff;font-size:13px;text-align:right;">${projectName}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #111;color:#555;font-size:13px;">Repository</td>
            <td style="padding:8px 0;border-bottom:1px solid #111;color:#fff;font-size:13px;text-align:right;">${repoUrl}</td></tr>
        <tr><td style="padding:8px 0;color:#555;font-size:13px;">Deployment ID</td>
            <td style="padding:8px 0;color:#fff;font-size:13px;text-align:right;">${mono(deploymentId.slice(0, 8))}</td></tr>
      </table>
      ${btn(dashboardUrl, 'Watch Live Logs →')}
    `),
  };
}

export function deploymentSuccessEmail(
  _name: string,
  projectName: string,
  liveUrl: string,
  duration: string,
  dashboardUrl: string
): { subject: string; html: string } {
  return {
    subject: `✓ ${projectName} is live — Zyphron`,
    html: base(`
      ${h1(projectName + ' is live')}
      <div style="margin:0 0 24px;">${statusBadge('success', '✓ DEPLOYED')}</div>
      ${p('Your deployment completed successfully. Your app is live at:')}
      <div style="margin:20px 0;padding:16px;background:#111;border:1px solid #1a1a1a;border-radius:6px;">
        <a href="${liveUrl}" style="font-size:16px;font-weight:600;color:#fff;text-decoration:none;font-family:monospace;">${liveUrl}</a>
      </div>
      <p style="margin:0 0 28px;font-size:13px;color:#555;">Build time: ${duration}</p>
      ${btn(dashboardUrl, 'Open Dashboard →')}
    `),
  };
}

export function deploymentFailedEmail(
  _name: string,
  projectName: string,
  errorSummary: string,
  aiSuggestion: string,
  dashboardUrl: string
): { subject: string; html: string } {
  return {
    subject: `✕ ${projectName} deployment failed — Zyphron`,
    html: base(`
      ${h1('Deployment failed')}
      <div style="margin:0 0 24px;">${statusBadge('failed', '✕ FAILED')}</div>
      ${p('Your deployment encountered an error:')}
      <div style="margin:0 0 20px;padding:16px;background:#0d0000;border:1px solid #2a0000;border-radius:6px;font-family:monospace;font-size:13px;color:#f87171;line-height:1.5;">${errorSummary}</div>
      ${aiSuggestion ? `
        <div style="margin:0 0 24px;padding:16px;background:#0a0a0d;border:1px solid #1a1a2d;border-radius:6px;">
          <p style="margin:0 0 8px;font-size:12px;color:#555;letter-spacing:1px;text-transform:uppercase;">AI Suggestion</p>
          <p style="margin:0;font-size:14px;color:#818cf8;line-height:1.6;">${aiSuggestion}</p>
        </div>
      ` : ''}
      ${btn(dashboardUrl, 'View Build Logs →')}
    `),
  };
}

export function trafficSpikeEmail(
  _name: string,
  projectName: string,
  currentRps: number,
  p95: number,
  dashboardUrl: string
): { subject: string; html: string } {
  return {
    subject: `Traffic spike detected — ${projectName}`,
    html: base(`
      ${h1('Traffic spike detected')}
      <div style="margin:0 0 24px;">${statusBadge('info', '⚡ SPIKE')}</div>
      ${p(`<strong style="color:#fff;">${projectName}</strong> is experiencing unusual traffic.`)}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #111;color:#555;font-size:13px;">Current req/sec</td>
            <td style="padding:8px 0;border-bottom:1px solid #111;color:#fff;font-size:13px;text-align:right;">${currentRps.toFixed(1)}</td></tr>
        <tr><td style="padding:8px 0;color:#555;font-size:13px;">p95 latency</td>
            <td style="padding:8px 0;color:#fff;font-size:13px;text-align:right;">${p95}ms</td></tr>
      </table>
      ${btn(dashboardUrl, 'View Metrics →')}
    `),
  };
}

export function accessRevokedEmail(_name: string): { subject: string; html: string } {
  return {
    subject: 'Your Zyphron access has been revoked',
    html: base(`
      ${h1('Access revoked')}
      ${p('Your Zyphron account has been suspended by an administrator. All active deployments have been stopped.')}
      ${p('If you believe this is a mistake, contact support@zyphron.space.')}
    `),
  };
}

export function rollbackEmail(
  _name: string,
  projectName: string,
  reason: string,
  dashboardUrl: string
): { subject: string; html: string } {
  return {
    subject: `Auto-rollback triggered — ${projectName}`,
    html: base(`
      ${h1('Auto-rollback triggered')}
      <div style="margin:0 0 24px;">${statusBadge('info', '↩ ROLLED BACK')}</div>
      ${p(`Zyphron automatically rolled back <strong style="color:#fff;">${projectName}</strong> to the previous healthy version.`)}
      <div style="margin:0 0 24px;padding:16px;background:#111;border:1px solid #1a1a1a;border-radius:6px;">
        <p style="margin:0;font-size:13px;color:#888;">Reason: ${reason}</p>
      </div>
      ${btn(dashboardUrl, 'View Deployment →')}
    `),
  };
}
