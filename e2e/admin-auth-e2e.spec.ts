import { test, expect, Page } from '@playwright/test';
import { ensureReleaseAdmin, RELEASE_ADMIN_EMAIL, RELEASE_ADMIN_PASSWORD } from './helpers/releaseAdmin';

async function login(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle', timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /Bem-vindo de volta|Welcome back/i })).toBeVisible();
  await page.fill('input[type="email"]', RELEASE_ADMIN_EMAIL);
  await page.fill('input[type="password"]', RELEASE_ADMIN_PASSWORD);
  await page.getByRole('button', { name: /^(Entrar|Sign in)$/i }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
}

test.describe('Admin UI Authentication E2E', () => {
  test.beforeAll(async () => {
    await ensureReleaseAdmin();
  });

  test('Route protection: unauthenticated dashboard redirects to /login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForURL('**/login', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Bem-vindo de volta|Welcome back/i })).toBeVisible();
  });

  test('Login, access pages, logout, and post-logout block', async ({ page }) => {
    await login(page);

    // Dashboard loads
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await page.waitForTimeout(2_000);
    const dashboardHasContent = await page.locator('body').innerText();
    expect(dashboardHasContent.length).toBeGreaterThan(0);

    // Access each page
    const pages = [
      '/projects',
      '/members',
      '/settings',
      '/billing',
      '/docs',
    ];
    for (const path of pages) {
      await page.goto(path, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(1_000);
      // Should NOT redirect to login
      expect(page.url()).not.toContain('/login');
    }

    // Access project sub-pages
    const projectPages = [
      '/database',
      '/auth',
      '/storage',
      '/realtime',
      '/apis',
      '/security',
      '/observability',
    ];
    for (const path of projectPages) {
      await page.goto(path, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(1_000);
      expect(page.url()).not.toContain('/login');
    }

    // Logout
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1_000);
    await page.getByRole('button', { name: /Menu da conta|Account menu/i }).click();
    await page.getByRole('button', { name: /Sair|Sign out/i }).click();
    await page.waitForURL('**/login', { timeout: 15_000 });

    // After logout, dashboard should redirect to login
    await page.goto('/', { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForURL('**/login', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Bem-vindo de volta|Welcome back/i })).toBeVisible();
  });

  test('Invalid credentials are rejected', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle', timeout: 30_000 });
    await page.fill('input[type="email"]', 'wrong@example.com');
    await page.fill('input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    await expect(page.getByText(/Invalid email or password|Falha no login|Credenciais inválidas/i).first()).toBeVisible();
  });

  test('Forgot password flow shows success message', async ({ page }) => {
    await page.goto('/forgot-password', { waitUntil: 'networkidle', timeout: 30_000 });
    await page.fill('input[type="email"]', RELEASE_ADMIN_EMAIL);
    await page.getByRole('button', { name: /^(Enviar Link de Redefinição|Send Reset Link)$/i }).click();
    await expect(page.getByText(/Verifique seu E-mail|Check your email/i)).toBeVisible();
  });
});
