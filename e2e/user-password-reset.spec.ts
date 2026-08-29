import { test, expect } from '@playwright/test';

test.describe('Project user password reset page', () => {
  test('reset link opens the public new-password form without admin authentication', async ({ page }) => {
    const token = 'browser-smoke-reset-token-not-submitted';

    await page.goto(`/auth/v1/password-reset?token=${token}`, { waitUntil: 'networkidle' });

    expect(new URL(page.url()).pathname).toBe('/auth/v1/password-reset');
    await expect(page.getByRole('heading', { name: /^(Definir nova senha|Set a new password)$/i })).toBeVisible();
    await expect(page.getByLabel(/^(Nova senha|New password)$/i)).toBeVisible();
    await expect(page.getByLabel(/^(Confirmar nova senha|Confirm new password)$/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Atualizar senha|Update password)$/i })).toBeEnabled();
    await expect(page.getByRole('heading', { name: /sign in/i })).toHaveCount(0);
  });

  test('missing token keeps the public page visible but disables submission', async ({ page }) => {
    await page.goto('/auth/v1/password-reset', { waitUntil: 'networkidle' });

    expect(new URL(page.url()).pathname).toBe('/auth/v1/password-reset');
    await expect(page.getByRole('heading', { name: /^(Definir nova senha|Set a new password)$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Atualizar senha|Update password)$/i })).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText(/Solicite um novo e-mail de recuperação|Request a new recovery email/i);
  });
});
