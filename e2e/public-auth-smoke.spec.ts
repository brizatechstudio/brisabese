import { expect, test } from '@playwright/test';

async function expectNoDocumentOverflow(page: import('@playwright/test').Page, name: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow, `Horizontal overflow on ${name}`).toBe(false);
}

test.describe('Public authentication responsive smoke', () => {
  test('login remains usable without horizontal overflow', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /Bem-vindo de volta|Welcome back/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Entrar|Sign in)$/i })).toBeEnabled();
    await expectNoDocumentOverflow(page, 'login');
  });

  test('registration remains usable without horizontal overflow', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: /^(Criar Conta|Create Account)$/i })).toBeEnabled();
    await expectNoDocumentOverflow(page, 'registration');
  });

  test('password recovery remains usable without horizontal overflow', async ({ page }) => {
    await page.goto('/forgot-password', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: /^(Enviar Link de Redefinição|Send Reset Link)$/i })).toBeEnabled();
    await expectNoDocumentOverflow(page, 'password recovery');
  });
});
