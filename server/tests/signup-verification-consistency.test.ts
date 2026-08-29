import assert from 'node:assert/strict';
import { assertSignupMailAvailable, createAndDeliverSignupVerification, SignupVerificationError } from '../auth/signupVerification';

async function expectSignupError(run: () => Promise<unknown>, code: string, status: number): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof SignupVerificationError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.ok(error.publicMessage.length > 0);
    return true;
  });
}

console.log('AUTH SIGNUP VERIFICATION CONSISTENCY');

await expectSignupError(
  () => assertSignupMailAvailable(async () => ({ status: 'ok', disabled: true })),
  'EMAIL_SERVICE_DISABLED',
  503,
);
await expectSignupError(
  () => assertSignupMailAvailable(async () => ({ status: 'degraded' })),
  'EMAIL_SERVICE_UNAVAILABLE',
  503,
);
await assertSignupMailAvailable(async () => ({ status: 'ok' }));
console.log('✓ mail availability produces explicit safe errors before account creation');

const user = { id: 'auth_test', project_id: 'proj_test', environment_id: 'env_test', email: 'user@example.test' };

{
  const events: string[] = [];
  await createAndDeliverSignupVerification({
    user,
    token: 'verification-token',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createVerificationToken: async () => { events.push('token'); },
    sendVerificationEmail: async () => { events.push('mail'); return true; },
    deleteUserInScope: async () => { events.push('rollback'); return true; },
  });
  assert.deepEqual(events, ['token', 'mail']);
  console.log('✓ successful verification keeps the newly created account');
}

{
  const events: string[] = [];
  await expectSignupError(
    () => createAndDeliverSignupVerification({
      user,
      token: 'verification-token',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createVerificationToken: async () => { events.push('token'); throw new Error('database write failed'); },
      sendVerificationEmail: async () => { events.push('mail'); return true; },
      deleteUserInScope: async () => { events.push('rollback'); return true; },
    }),
    'SIGNUP_PERSISTENCE_FAILED',
    500,
  );
  assert.deepEqual(events, ['token', 'rollback']);
  console.log('✓ verification-token persistence failure rolls the account back');
}

{
  const events: string[] = [];
  await expectSignupError(
    () => createAndDeliverSignupVerification({
      user,
      token: 'verification-token',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createVerificationToken: async () => { events.push('token'); },
      sendVerificationEmail: async () => { events.push('mail'); throw new Error('smtp unavailable'); },
      deleteUserInScope: async () => { events.push('rollback'); return true; },
    }),
    'EMAIL_DELIVERY_FAILED',
    503,
  );
  assert.deepEqual(events, ['token', 'mail', 'rollback']);
  console.log('✓ SMTP delivery failure removes the user and verification token through cascade');
}

{
  await expectSignupError(
    () => createAndDeliverSignupVerification({
      user,
      token: 'verification-token',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createVerificationToken: async () => undefined,
      sendVerificationEmail: async () => { throw new Error('smtp unavailable'); },
      deleteUserInScope: async () => { throw new Error('rollback database unavailable'); },
    }),
    'SIGNUP_ROLLBACK_FAILED',
    500,
  );
  console.log('✓ cleanup failure is surfaced explicitly instead of pretending the signup was cleanly rolled back');
}

console.log('AUTH SIGNUP VERIFICATION CONSISTENCY PASS');
