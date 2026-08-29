import { test, expect } from '@playwright/test';
import { generateTotpCode } from '../server/auth/mfa';

const API_URL = process.env.ADMIN_UI_URL || 'http://localhost:3000';
const runId = Date.now().toString(36);
const adminEmail = `mfa.${runId}@brisabase.local`;
const adminPassword = 'SuperSecretMfaPassword123!';
const adminBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN || 'local-bootstrap-token-for-isolated-e2e-only-2026';

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, init);
}

async function json(response: Response): Promise<any> {
  const body = await response.text();
  try { return body ? JSON.parse(body) : null; } catch { return body; }
}

test.describe('MFA Integration E2E', () => {
  test('MFA off, enable, TOTP valid, TOTP invalid, recovery code, disable', async () => {
    // Create admin user
    const signup = await request('/api/admin/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-bootstrap-token': adminBootstrapToken },
      body: JSON.stringify({ email: adminEmail, password: adminPassword, name: 'MFA Admin' }),
    });
    expect(signup.status).toBe(201);

    // Login without MFA (MFA off)
    const login1 = await request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    expect(login1.status).toBe(200);
    const login1Data = await json(login1);
    expect(login1Data.access_token).toBeTruthy();
    expect(login1Data.user.mfa_enabled).toBe(false);
    const accessToken = login1Data.access_token as string;

    // Setup MFA
    const setup = await request('/api/admin/auth/mfa/setup', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(setup.status).toBe(200);
    const setupData = await json(setup);
    expect(setupData.secret).toBeTruthy();
    const secret = setupData.secret as string;

    // Generate valid TOTP code
    const validCode = generateTotpCode(secret);

    // Enable MFA with valid TOTP
    const enable = await request('/api/admin/auth/mfa/enable', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ totp_code: validCode }),
    });
    expect(enable.status).toBe(200);
    const enableData = await json(enable);
    expect(enableData.recovery_codes).toBeTruthy();
    expect(enableData.recovery_codes.length).toBeGreaterThan(0);
    const recoveryCode = enableData.recovery_codes[0] as string;

    // Login without MFA code should require MFA
    const login2 = await request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    expect(login2.status).toBe(200);
    const login2Data = await json(login2);
    expect(login2Data.mfa_required).toBe(true);

    // Login with invalid TOTP should fail
    const login3 = await request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword, totp_code: '000000' }),
    });
    expect(login3.status).toBe(401);

    // Login with valid TOTP should succeed
    const validCode2 = generateTotpCode(secret);
    const login4 = await request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword, totp_code: validCode2 }),
    });
    expect(login4.status).toBe(200);
    const login4Data = await json(login4);
    expect(login4Data.access_token).toBeTruthy();
    const accessToken2 = login4Data.access_token as string;

    // Login with recovery code should succeed
    const login5 = await request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword, totp_code: recoveryCode }),
    });
    expect(login5.status).toBe(200);
    const login5Data = await json(login5);
    expect(login5Data.access_token).toBeTruthy();

    // Reusing the same recovery code should fail
    const login6 = await request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword, totp_code: recoveryCode }),
    });
    expect(login6.status).toBe(401);

    // Disable MFA with valid TOTP
    const validCode3 = generateTotpCode(secret);
    const disable = await request('/api/admin/auth/mfa/disable', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken2}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ totp_code: validCode3 }),
    });
    expect(disable.status).toBe(200);

    // Login without MFA should now work
    const login7 = await request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    expect(login7.status).toBe(200);
    const login7Data = await json(login7);
    expect(login7Data.user.mfa_enabled).toBe(false);
  });
});
