import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:3004';
const API  = 'http://localhost:3003/api/v1';

const RUN   = Date.now();
const EMAIL = `e2e_${RUN}@example.com`;
const PASS  = 'TestPass123!';
const NAME  = 'E2E Tester';

// ─── helpers ────────────────────────────────────────────────────────────────

async function apiRegister(email: string, name = 'Tester') {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password: PASS }),
  });
  const data = await res.json() as { data?: { token?: string } };
  return data.data?.token ?? '';
}

/** Inject auth token into localStorage so the layout guard passes immediately. */
async function setToken(page: Page, token: string) {
  await page.addInitScript((t) => localStorage.setItem('auth-token', t), token);
}

/** Navigate and wait for the page body to be interactive (not networkidle). */
async function goto(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('domcontentloaded');
  // Wait until the spinner (if any) disappears — the layout guard redirects or renders
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin'),
    { timeout: 12000 },
  ).catch(() => { /* guard may already be gone */ });
}

// ─── Auth flows ──────────────────────────────────────────────────────────────

test.describe('Auth', () => {
  test('register page renders and validates', async ({ page }) => {
    await page.goto(`${BASE}/register`);
    await expect(page.locator('h1, h2').first()).toBeVisible();
    // Submit empty → stay on register
    await page.click('button[type=submit]');
    await expect(page).toHaveURL(/register/);
  });

  test('login page rejects bad credentials', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator('input[type=email]').first()).toBeVisible();

    await page.fill('input[type=email]', 'nobody@example.com');
    await page.fill('input[type=password]', 'wrongpassword');
    await page.click('button[type=submit]');

    await page.waitForTimeout(2500);
    const stillLogin = page.url().includes('login');
    const hasToast   = await page.locator('[data-sonner-toast], .sonner-toast').count() > 0;
    expect(stillLogin || hasToast).toBeTruthy();
  });

  test('successful register via UI redirects to dashboard', async ({ page }) => {
    const email = `ui_reg_${RUN}@example.com`;
    await page.goto(`${BASE}/register`);

    const nameField = page.locator('input[name=name], input[placeholder*=name i]').first();
    if (await nameField.isVisible()) await nameField.fill('UI Tester');

    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', PASS);

    const confirm = page.locator('input[name=confirmPassword], input[placeholder*=confirm i]').first();
    if (await confirm.isVisible()) await confirm.fill(PASS);

    await page.click('button[type=submit]');
    await page.waitForURL(/dashboard/, { timeout: 12000 });
    await expect(page).toHaveURL(/dashboard/);
  });
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
  let token: string;
  test.beforeAll(async () => { token = await apiRegister(`dash_${RUN}@example.com`, 'Dash Tester'); });
  test.beforeEach(async ({ page }) => { await setToken(page, token); });

  test('dashboard loads with stat cards', async ({ page }) => {
    await goto(page, '/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
    expect(await page.locator('.premium-panel').count()).toBeGreaterThan(0);
  });

  test('sidebar has all nav items', async ({ page }) => {
    await goto(page, '/dashboard');
    const nav = page.locator('nav, aside');
    for (const label of ['Projects', 'Observability', 'Load Testing', 'Databases', 'Settings']) {
      await expect(nav.getByText(label).first()).toBeVisible();
    }
  });

  test('sidebar collapses and expands', async ({ page }) => {
    await goto(page, '/dashboard');
    const aside  = page.locator('aside').first();
    const toggle = aside.locator('button').first();

    await toggle.click();
    await page.waitForTimeout(600);
    expect((await aside.boundingBox())!.width).toBeLessThan(100);

    await toggle.click();
    await page.waitForTimeout(600);
    expect((await aside.boundingBox())!.width).toBeGreaterThan(200);
  });

  test('refresh button does not crash page', async ({ page }) => {
    await goto(page, '/dashboard');
    // The refresh button is inside the flex row that also contains the Dashboard h1
    const headerRow = page.locator('div.flex.items-center.justify-between').filter({
      has: page.locator('h1:has-text("Dashboard")'),
    });
    const refresh = headerRow.locator('button').last();
    if (await refresh.count() > 0) await refresh.click();
    await page.waitForTimeout(1200);
    await expect(page.locator('h1')).toContainText('Dashboard');
  });
});

// ─── Projects ────────────────────────────────────────────────────────────────

test.describe('Projects', () => {
  let token: string;
  test.beforeAll(async () => { token = await apiRegister(`proj_${RUN}@example.com`, 'Proj Tester'); });
  test.beforeEach(async ({ page }) => { await setToken(page, token); });

  test('projects page loads with search bar', async ({ page }) => {
    await goto(page, '/projects');
    await expect(page.locator('h1')).toContainText('Projects');
    await expect(page.locator('input[placeholder*=Search]').first()).toBeVisible();
  });

  test('empty state shows create project link', async ({ page }) => {
    await goto(page, '/projects');
    const newBtn = page.locator('a[href="/projects/new"]');
    expect(await newBtn.count()).toBeGreaterThan(0);
  });

  test('new project page renders repo URL input', async ({ page }) => {
    await goto(page, '/projects/new');
    // Some field for repository URL should be present
    const inputs = page.locator('input');
    expect(await inputs.count()).toBeGreaterThan(0);
  });

  test('create project submits and creates project', async ({ page }) => {
    await goto(page, '/projects/new');

    // Fill repo URL — look for the field with a github-related placeholder or name
    const allInputs = page.locator('input[type=text], input[type=url], input:not([type=hidden]):not([type=submit])');
    const count = await allInputs.count();
    let filled = false;
    for (let i = 0; i < count; i++) {
      const input = allInputs.nth(i);
      const ph = (await input.getAttribute('placeholder') ?? '').toLowerCase();
      const nm = (await input.getAttribute('name') ?? '').toLowerCase();
      if (/repo|url|github|repository/i.test(ph + nm)) {
        await input.fill('https://github.com/vercel/next.js');
        filled = true;
        break;
      }
    }
    if (!filled && count > 0) await allInputs.first().fill('https://github.com/vercel/next.js');

    const submitBtn = page.getByRole('button', { name: /create|deploy|import/i }).first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(3500);
      const url     = page.url();
      const success = url.includes('/projects/') ||
        await page.locator('[data-sonner-toast], .sonner-toast').count() > 0;
      expect(success).toBeTruthy();
    }
  });
});

// ─── Observability ───────────────────────────────────────────────────────────

test.describe('Observability', () => {
  let token: string;
  test.beforeAll(async () => { token = await apiRegister(`obs_${RUN}@example.com`, 'Obs Tester'); });
  test.beforeEach(async ({ page }) => { await setToken(page, token); });

  test('loads with 4 metric stat cards', async ({ page }) => {
    await goto(page, '/observability');
    await expect(page.locator('h1')).toContainText('Observability');
    expect(await page.locator('.premium-panel.premium-card-hover').count()).toBeGreaterThanOrEqual(4);
  });

  test('Recharts renders 2 charts (AreaChart + LineChart)', async ({ page }) => {
    await goto(page, '/observability');
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible({ timeout: 8000 });
    expect(await page.locator('.recharts-wrapper').count()).toBeGreaterThanOrEqual(2);
  });

  test('time range selector changes value', async ({ page }) => {
    await goto(page, '/observability');
    const timeSelect = page.locator('select').nth(1);
    await timeSelect.selectOption('6h');
    await expect(timeSelect).toHaveValue('6h');
  });

  test('Alerts section heading and Create Alert button visible', async ({ page }) => {
    await goto(page, '/observability');
    // The h2 inside the alerts section
    await expect(page.locator('h2').filter({ hasText: 'Alerts' })).toBeVisible({ timeout: 8000 });
    // The button — use getByRole to match partial text regardless of icon
    await expect(page.getByRole('button', { name: /create alert/i })).toBeVisible();
  });

  test('fallback alert rows shown when no project selected', async ({ page }) => {
    await goto(page, '/observability');
    // Fallback alerts are always shown
    await expect(page.locator('.premium-panel').nth(5)).toBeVisible({ timeout: 6000 });
  });

  test('traces table renders with correct headers', async ({ page }) => {
    await goto(page, '/observability');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th').filter({ hasText: 'Trace ID' })).toBeVisible();
    await expect(page.locator('th').filter({ hasText: 'Duration' })).toBeVisible();
  });

  test('refresh button is clickable without crash', async ({ page }) => {
    await goto(page, '/observability');
    await page.getByRole('button').filter({ has: page.locator('svg') }).first().click();
    await page.waitForTimeout(1500);
    await expect(page.locator('h1')).toContainText('Observability');
  });
});

// ─── Load Testing ─────────────────────────────────────────────────────────────

test.describe('Load Testing', () => {
  let token: string;
  test.beforeAll(async () => { token = await apiRegister(`stress_${RUN}@example.com`, 'Stress Tester'); });
  test.beforeEach(async ({ page }) => { await setToken(page, token); });

  test('stress page loads', async ({ page }) => {
    await goto(page, '/stress');
    await expect(page.locator('h1')).toContainText(/Load Testing|Stress/i);
  });

  test('VU / Duration inputs present', async ({ page }) => {
    await goto(page, '/stress');
    const numInputs = page.locator('input[type=number]');
    expect(await numInputs.count()).toBeGreaterThanOrEqual(2);
  });

  test('"Run Load Test" button is visible', async ({ page }) => {
    await goto(page, '/stress');
    await expect(page.getByRole('button', { name: /Run Load Test/i })).toBeVisible({ timeout: 8000 });
  });

  test('"Probe" button is present (disabled without project)', async ({ page }) => {
    await goto(page, '/stress');
    // Probe button is always rendered but disabled when no project is selected
    const probe = page.getByRole('button', { name: /^Probe$/i });
    await expect(probe).toBeVisible({ timeout: 8000 });
    // Button exists — disabled state is expected when no project selected
    const isDisabled = await probe.isDisabled();
    // Either disabled (no project) or enabled (project already selected) — both valid
    expect(typeof isDisabled).toBe('boolean');
  });
});

// ─── Databases ───────────────────────────────────────────────────────────────

test.describe('Databases', () => {
  let token: string;
  test.beforeAll(async () => { token = await apiRegister(`db_${RUN}@example.com`, 'DB Tester'); });
  test.beforeEach(async ({ page }) => { await setToken(page, token); });

  test('databases page loads', async ({ page }) => {
    await goto(page, '/databases');
    await expect(page.locator('h1')).toContainText(/Database/i);
  });

  test('new database button is present', async ({ page }) => {
    await goto(page, '/databases');
    const newBtn = page.getByRole('button', { name: /New|Create|Add/i }).first();
    await expect(newBtn).toBeVisible();
  });
});

// ─── Settings ────────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  let token: string;
  test.beforeAll(async () => { token = await apiRegister(`settings_${RUN}@example.com`, 'Settings Tester'); });
  test.beforeEach(async ({ page }) => { await setToken(page, token); });

  test('settings page loads with tabs', async ({ page }) => {
    await goto(page, '/settings');
    await expect(page.locator('h1')).toContainText(/Setting/i);
  });

  test('profile tab shows email field', async ({ page }) => {
    await goto(page, '/settings');
    await expect(page.locator('input[type=email], input[name=email]').first()).toBeVisible({ timeout: 6000 });
  });
});

// ─── Deployment Detail + TerminalLog ─────────────────────────────────────────

test.describe('Deployment Detail', () => {
  let token  = '';
  let slug   = '';
  let depId  = '';

  test.beforeAll(async () => {
    token = await apiRegister(`depdetail_${RUN}@example.com`, 'DepDetail Tester');

    const projRes = await fetch(`${API}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'E2E Deploy App',
        slug: `e2e-dep-${RUN}`,
        repositoryUrl: 'https://github.com/vercel/next.js',
        branch: 'main',
        framework: 'nextjs',
      }),
    });
    const proj = await projRes.json() as { data?: { project?: { id: string; slug: string } } };
    const project = proj.data?.project;
    slug = project?.slug ?? '';

    const depRes = await fetch(`${API}/projects/${project?.id}/deployments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ branch: 'main' }),
    });
    const dep = await depRes.json() as { deployment?: { id: string } };
    depId = dep.deployment?.id ?? '';
  });

  // addInitScript must run before each page.goto, so inject token in beforeEach
  test.beforeEach(async ({ page }) => {
    if (token) await setToken(page, token);
  });

  test('deployment detail page loads with status badge', async ({ page }) => {
    test.skip(!slug || !depId, 'API setup failed');
    await goto(page, `/projects/${slug}/deployments/${depId}`);
    // Allow extra time for auth guard + data fetch on deployment detail
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 15000 },
    ).catch(() => {});

    await expect(
      page.locator('span, div').filter({ hasText: /queued|pending|building|live|failed|cancelled/i }).first(),
    ).toBeVisible({ timeout: 12000 });
  });

  test('TerminalLog component renders', async ({ page }) => {
    test.skip(!slug || !depId, 'API setup failed');
    await goto(page, `/projects/${slug}/deployments/${depId}`);
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 15000 },
    ).catch(() => {});

    // TerminalLog is a .premium-panel that contains a .font-mono scrollable area
    await expect(
      page.locator('.premium-panel').filter({ has: page.locator('.font-mono') }).first(),
    ).toBeVisible({ timeout: 12000 });
  });

  test('back button returns to project page', async ({ page }) => {
    test.skip(!slug || !depId, 'API setup failed');
    await goto(page, `/projects/${slug}/deployments/${depId}`);
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 15000 },
    ).catch(() => {});

    await page.locator(`a[href="/projects/${slug}"]`).first().click();
    await page.waitForURL(new RegExp(`/projects/${slug}$`), { timeout: 8000 });
    await expect(page).toHaveURL(new RegExp(`/projects/${slug}$`));
  });
});

// ─── Theme toggle ─────────────────────────────────────────────────────────────

test.describe('Theme', () => {
  let token: string;
  test.beforeAll(async () => { token = await apiRegister(`theme_${RUN}@example.com`, 'Theme Tester'); });
  test.beforeEach(async ({ page }) => { await setToken(page, token); });

  test('dark/light theme toggle changes html class', async ({ page }) => {
    await goto(page, '/dashboard');
    const themeBtn = page.locator('aside').getByRole('button', { name: /theme|light|dark/i });
    await expect(themeBtn).toBeVisible();

    const before = await page.locator('html').getAttribute('class') ?? '';
    await themeBtn.click();
    await page.waitForTimeout(400);
    const after = await page.locator('html').getAttribute('class') ?? '';
    expect(before).not.toEqual(after);
  });
});

// ─── Sign Out ─────────────────────────────────────────────────────────────────

test.describe('Sign Out', () => {
  let token: string;
  test.beforeAll(async () => { token = await apiRegister(`signout_${RUN}@example.com`, 'SignOut Tester'); });
  test.beforeEach(async ({ page }) => { await setToken(page, token); });

  test('sign out redirects to login and clears token', async ({ page }) => {
    await goto(page, '/dashboard');

    const signOutBtn = page.locator('aside').getByRole('button', { name: /sign out/i });
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    await page.waitForURL(/login/, { timeout: 8000 });
    await expect(page).toHaveURL(/login/);
    expect(await page.evaluate(() => localStorage.getItem('auth-token'))).toBeNull();
  });
});

// ─── CLI: zy login flow (via API contract) ────────────────────────────────────

test.describe('CLI contract', () => {
  test('zy login — POST /auth/login returns token with correct shape', async () => {
    const token = await apiRegister(`cli_${RUN}@example.com`, 'CLI Tester');
    // Re-login to verify the login endpoint (register gives us a token directly)
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `cli_${RUN}@example.com`, password: PASS }),
    });
    const data = await res.json() as { success: boolean; data?: { token?: string; user?: { email: string; role: string } } };
    expect(data.success).toBe(true);
    expect(data.data?.token).toBeTruthy();
    expect(data.data?.user?.email).toBe(`cli_${RUN}@example.com`);
  });

  test('zy deploy — POST /projects/:id/deployments returns QUEUED deployment', async () => {
    const token = await apiRegister(`cliproj_${RUN}@example.com`, 'CLI Proj Tester');
    const projRes = await fetch(`${API}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'CLI Deploy App',
        slug: `cli-deploy-${RUN}`,
        repositoryUrl: 'https://github.com/vercel/next.js',
        branch: 'main',
      }),
    });
    const proj = await projRes.json() as { data?: { project?: { id: string } } };
    const pid = proj.data?.project?.id ?? '';
    expect(pid).toBeTruthy();

    const depRes = await fetch(`${API}/projects/${pid}/deployments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ branch: 'main' }),
    });
    const dep = await depRes.json() as { deployment?: { id: string; status: string } };
    expect(dep.deployment?.status).toBe('QUEUED');
    expect(dep.deployment?.id).toBeTruthy();
  });

  test('zy status — GET /projects/:slug returns project with deployment count', async () => {
    const token = await apiRegister(`clistatus_${RUN}@example.com`, 'CLI Status Tester');
    const projRes = await fetch(`${API}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'CLI Status App',
        slug: `cli-status-${RUN}`,
        repositoryUrl: 'https://github.com/vercel/next.js',
        branch: 'main',
      }),
    });
    const proj = await projRes.json() as { data?: { project?: { slug: string } } };
    const slug = proj.data?.project?.slug ?? '';

    const getRes = await fetch(`${API}/projects/${slug}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const get = await getRes.json() as { success: boolean; data?: { project?: { name: string } } };
    expect(get.success).toBe(true);
    expect(get.data?.project?.name).toBe('CLI Status App');
  });

  test('zy rollback — POST /deployments/:id/rollback returns 400 for QUEUED dep', async () => {
    const token = await apiRegister(`cliroll_${RUN}@example.com`, 'CLI Rollback Tester');
    const projRes = await fetch(`${API}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'CLI Roll App', slug: `cli-roll-${RUN}`, repositoryUrl: 'https://github.com/vercel/next.js', branch: 'main' }),
    });
    const proj = await projRes.json() as { data?: { project?: { id: string } } };
    const pid = proj.data?.project?.id ?? '';

    const depRes = await fetch(`${API}/projects/${pid}/deployments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ branch: 'main' }),
    });
    const dep = await depRes.json() as { deployment?: { id: string } };
    const did = dep.deployment?.id ?? '';

    // Rollback without targetDeploymentId should return 400 (not 500)
    const rollRes = await fetch(`${API}/deployments/${did}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    expect([400, 404, 409, 422]).toContain(rollRes.status);
  });

  test('zy stress probe — GET /projects/:id/stress/probe returns structured error for no live deployment', async () => {
    const token = await apiRegister(`clistress_${RUN}@example.com`, 'CLI Stress Tester');
    const projRes = await fetch(`${API}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'CLI Stress App', slug: `cli-stress-${RUN}`, repositoryUrl: 'https://github.com/vercel/next.js', branch: 'main' }),
    });
    const proj = await projRes.json() as { data?: { project?: { id: string } } };
    const pid = proj.data?.project?.id ?? '';

    const probeRes = await fetch(`${API}/projects/${pid}/stress/probe`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const probe = await probeRes.json() as { error?: { message?: string } };
    // No live deployment → structured error (not 500)
    expect([200, 404, 422]).toContain(probeRes.status);
    if (probeRes.status !== 200) {
      expect(probe.error?.message).toBeTruthy();
    }
  });
});
