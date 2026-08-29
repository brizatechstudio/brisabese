export type SignupVerificationUser = {
  id: string;
  project_id: string;
  environment_id: string;
  email: string;
};

export type MailHealth = { status: 'ok' | 'degraded'; disabled?: boolean };

export class SignupVerificationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly publicMessage: string,
    options?: { cause?: unknown },
  ) {
    super(publicMessage, options);
    this.name = 'SignupVerificationError';
  }
}

export async function assertSignupMailAvailable(
  healthCheck: () => Promise<MailHealth>,
): Promise<void> {
  let health: MailHealth;
  try {
    health = await healthCheck();
  } catch (error) {
    throw new SignupVerificationError(
      503,
      'EMAIL_SERVICE_UNAVAILABLE',
      'Email verification is temporarily unavailable. Please try again later.',
      { cause: error },
    );
  }

  if (health.disabled) {
    throw new SignupVerificationError(
      503,
      'EMAIL_SERVICE_DISABLED',
      'Email verification is required for this project, but the email service is not configured. Contact the project administrator.',
    );
  }
  if (health.status !== 'ok') {
    throw new SignupVerificationError(
      503,
      'EMAIL_SERVICE_UNAVAILABLE',
      'Email verification is temporarily unavailable. Please try again later.',
    );
  }
}

async function rollbackSignup(
  user: SignupVerificationUser,
  deleteUserInScope: (projectId: string, environmentId: string, userId: string) => Promise<boolean>,
): Promise<void> {
  try {
    const deleted = await deleteUserInScope(user.project_id, user.environment_id, user.id);
    if (!deleted) throw new Error('Newly created signup user could not be found during rollback.');
  } catch (error) {
    throw new SignupVerificationError(
      500,
      'SIGNUP_ROLLBACK_FAILED',
      'The account could not be completed and automatic cleanup also failed. Please contact the project administrator before trying again.',
      { cause: error },
    );
  }
}

export async function createAndDeliverSignupVerification(input: {
  user: SignupVerificationUser;
  token: string;
  tokenHash: string;
  expiresAt: string;
  createVerificationToken: (userId: string, projectId: string, environmentId: string, tokenHash: string, expiresAt: string) => Promise<void>;
  sendVerificationEmail: (email: string, token: string) => Promise<boolean>;
  deleteUserInScope: (projectId: string, environmentId: string, userId: string) => Promise<boolean>;
}): Promise<void> {
  try {
    await input.createVerificationToken(
      input.user.id,
      input.user.project_id,
      input.user.environment_id,
      input.tokenHash,
      input.expiresAt,
    );
  } catch (error) {
    await rollbackSignup(input.user, input.deleteUserInScope);
    throw new SignupVerificationError(
      500,
      'SIGNUP_PERSISTENCE_FAILED',
      'The account could not be prepared for email verification. No account was created. Please try again.',
      { cause: error },
    );
  }

  try {
    const delivered = await input.sendVerificationEmail(input.user.email, input.token);
    if (!delivered) throw new Error('Email provider reported that the verification message was not delivered.');
  } catch (error) {
    await rollbackSignup(input.user, input.deleteUserInScope);
    throw new SignupVerificationError(
      503,
      'EMAIL_DELIVERY_FAILED',
      'We could not send the verification email. No account was created. Please try again later.',
      { cause: error },
    );
  }
}
