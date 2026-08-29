/*
 * Real-stack password-recovery acceptance.
 *
 * The test uses the public BrisaBase Auth API plus Mailpit's HTTP API. It does
 * not read reset tokens from PostgreSQL, so the proof covers actual SMTP
 * delivery, token consumption, password replacement and session revocation.
 */
import assert from 'node:assert/strict';

const enabled = process.env.BRISABASE_REAL_E2E === 'true';
if (!enabled) {
  console.log('Password recovery real-stack test skipped. Set BRISABASE_REAL_E2E=true.');
  process.exit(0);
}

const apiUrl = (process.env.BRISABASE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const mailpitPort = process.env.BRISABASE_MAILPIT_PORT || '8025';
const mailpitUrl = (process.env.BRISABASE_MAILPIT_URL || `http://127.0.0.1:${mailpitPort}`).replace(/\/$/, '');
const projectId = process.env.BRISABASE_E2E_PROJECT_ID || 'proj_local_1';
const environmentId = process.env.BRISABASE_E2E_ENVIRONMENT_ID || 'env_proj_local_1_development';
const organizationId = process.env.BRISABASE_E2E_ORGANIZATION_ID || 'org_local_1';
const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN || 'local-bootstrap-token-for-isolated-e2e-only-2026';
const adminEmail = 'owner@brisabase.local';
const adminPassword = 'SuperSecretSmokePassword123!';
const runId = `recovery_${Date.now().toString(36)}`;
const recoveryEmail = `${runId}@brisabase.local`;
const oldPassword = `Old-${runId}-Password!`;
const newPassword = `New-${runId}-Password!`;
const genericResetMessage = 'If the account exists, reset instructions were sent.';

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, init);
}

async function payload(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function expectStatus(response: Response, expected: number, description: string): Promise<any> {
  const value = await payload(response);
  assert.equal(response.status, expected, `${description}: HTTP ${response.status} ${JSON.stringify(value)}`);
  return value;
}

async function adminLogin(): Promise<any> {
  const login = async () => request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });

  let response = await login();
  if (response.status === 200) return payload(response);
  await payload(response);

  const bootstrap = await request('/api/admin/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-bootstrap-token': bootstrapToken },
    body: JSON.stringify({ email: adminEmail, password: adminPassword, name: 'Password Recovery Owner' }),
  });
  if (![201, 409].includes(bootstrap.status)) {
    throw new Error(`Admin bootstrap failed: HTTP ${bootstrap.status} ${JSON.stringify(await payload(bootstrap))}`);
  }
  await payload(bootstrap);
  return expectStatus(await login(), 200, 'admin login');
}

async function waitForResetEmail(email: string): Promise<any> {
  const search = `to:"${email}"`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(search)}&limit=20`);
    if (response.ok) {
      const result = await response.json() as { messages?: Array<{ ID?: string; Subject?: string }> };
      const summary = result.messages?.find((item) => item.ID && /redefini|reset/i.test(String(item.Subject || '')))
        || result.messages?.find((item) => item.ID);
      if (summary?.ID) {
        const detail = await fetch(`${mailpitUrl}/api/v1/message/${encodeURIComponent(summary.ID)}`);
        if (detail.ok) return detail.json();
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Password reset email for ${email} was not captured by Mailpit.`);
}

function resetTokenFromMessage(message: any): string {
  assert.match(String(message.Subject || ''), /redefini|reset/i, 'reset email must have a password-reset subject');
  const addressed = Array.isArray(message.To)
    && message.To.some((entry: any) => String(entry?.Address || entry?.address || '').toLowerCase() === recoveryEmail.toLowerCase());
  assert.equal(addressed, true, 'reset email must be addressed to the recovery account');
  const content = `${String(message.Text || '')}\n${String(message.HTML || '')}`;
  const match = content.match(/[?&]token=([A-Za-z0-9_-]+)/);
  assert.ok(match?.[1], 'reset email must contain an opaque reset token');
  return match[1];
}

async function main(): Promise<void> {
  const admin = await adminLogin();
  const controlHeaders: Record<string, string> = {
    authorization: `Bearer ${admin.access_token}`,
    'x-organization-id': organizationId,
    'x-project-id': projectId,
    'x-environment-id': environmentId,
    'content-type': 'application/json',
  };

  let recoveryUserId: string | undefined;
  try {
    // Create an already-verified isolated user through the management plane so
    // this acceptance does not depend on signup rate limits or verification mail.
    const created = await expectStatus(await request(`/api/projects/${projectId}/environments/${environmentId}/auth/users`, {
      method: 'POST',
      headers: controlHeaders,
      body: JSON.stringify({ email: recoveryEmail, password: oldPassword, role: 'user', provider: 'email' }),
    }), 201, 'create password-recovery account');
    recoveryUserId = created.id;
    assert.ok(recoveryUserId);

    const loginBefore = await expectStatus(await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: recoveryEmail, password: oldPassword, project_id: projectId, environment_id: environmentId }),
    }), 200, 'login before password reset');
    const oldAccessToken = loginBefore.session?.access_token as string;
    const oldRefreshToken = loginBefore.session?.refresh_token as string;
    assert.ok(oldAccessToken && oldRefreshToken, 'pre-reset login must issue access and refresh tokens');

    // Unknown and existing accounts intentionally return the exact same public
    // response, preventing account discovery through this endpoint.
    const unknown = await expectStatus(await request('/api/auth/password-reset/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `missing-${runId}@brisabase.local`, project_id: projectId, environment_id: environmentId }),
    }), 200, 'request reset for unknown account');
    assert.equal(unknown.message, genericResetMessage);

    const requested = await expectStatus(await request('/api/auth/password-reset/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: recoveryEmail, project_id: projectId, environment_id: environmentId }),
    }), 200, 'request password reset');
    assert.equal(requested.message, genericResetMessage);

    const mail = await waitForResetEmail(recoveryEmail);
    const resetToken = resetTokenFromMessage(mail);

    // A validation error must not burn the one-time token. This catches a subtle
    // UX/security regression where the token was consumed before password policy
    // validation and forced the user to request a second email.
    const shortPassword = await expectStatus(await request('/api/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: resetToken, new_password: 'short' }),
    }), 400, 'reject too-short reset password');
    assert.equal(shortPassword.error?.code, 'PASSWORD_TOO_SHORT');

    const reset = await expectStatus(await request('/api/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: resetToken, new_password: newPassword }),
    }), 200, 'complete password reset with same token');
    assert.equal(reset.message, 'Password reset completed.');

    const oldSession = await expectStatus(await request('/api/auth/user', {
      headers: { authorization: `Bearer ${oldAccessToken}` },
    }), 401, 'old access token after password reset');
    assert.ok(
      ['SESSION_REVOKED', 'INVALID_TOKEN', 'UNAUTHORIZED'].includes(String(oldSession.error?.code)),
      `old access token must be rejected after reset, received code ${String(oldSession.error?.code)}`,
    );

    const oldRefresh = await expectStatus(await request('/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: oldRefreshToken }),
    }), 401, 'old refresh token after password reset');
    assert.ok(['SESSION_EXPIRED', 'INVALID_REFRESH_TOKEN'].includes(String(oldRefresh.error?.code)));

    const oldLogin = await expectStatus(await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: recoveryEmail, password: oldPassword, project_id: projectId, environment_id: environmentId }),
    }), 401, 'old password after reset');
    assert.equal(oldLogin.error?.code, 'INVALID_CREDENTIALS');

    const newLogin = await expectStatus(await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: recoveryEmail, password: newPassword, project_id: projectId, environment_id: environmentId }),
    }), 200, 'new password after reset');
    assert.equal(newLogin.user?.email, recoveryEmail);

    const replay = await expectStatus(await request('/api/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: resetToken, new_password: `Replay-${runId}-Password!` }),
    }), 400, 'reject reset-token replay');
    assert.equal(replay.error?.code, 'INVALID_OR_EXPIRED_TOKEN');

    console.log('✅ Password recovery E2E passed: SMTP delivery, privacy response, password policy, one-time token, session revocation, and new-password login.');
  } finally {
    if (recoveryUserId) {
      try {
        await request(`/api/projects/${projectId}/environments/${environmentId}/auth/users/${recoveryUserId}`, {
          method: 'DELETE', headers: controlHeaders,
        });
      } catch { /* best-effort E2E cleanup */ }
    }
  }
}

main().catch((error) => {
  console.error('Password recovery real-stack E2E failed:', error);
  process.exitCode = 1;
});
