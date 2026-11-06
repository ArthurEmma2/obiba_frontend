import { ApiError } from './graphql/client';
import { t } from './strings';

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': t.signIn.invalid,
  'auth/wrong-password': t.signIn.invalid,
  'auth/user-not-found': t.signIn.invalid,
  'auth/invalid-login-credentials': t.signIn.invalid,
  'auth/too-many-requests': t.errors.authTooManyRequests,
  'auth/network-request-failed': t.errors.authNetwork,
  'auth/user-disabled': t.errors.authDisabled,
  'auth/invalid-email': t.errors.authEmailInvalid,
  'auth/missing-email': t.errors.authEmailInvalid,
  'auth/weak-password': t.errors.authWeakPassword,
  'auth/password-does-not-meet-requirements': t.errors.authWeakPassword,
  'auth/email-already-in-use': t.signUp.notCreated,
  'auth/requires-recent-login': t.errors.authRecentLogin,
  'auth/invalid-verification-code': t.signIn.totpInvalid,
  'auth/missing-code': t.validation.codeInvalid,
  'auth/totp-challenge-timeout': t.signIn.totpExpired,
  'auth/expired-action-code': t.action.expiredLink,
  'auth/invalid-action-code': t.action.invalidLink,
  'auth/captcha-check-failed': t.errors.authRecaptcha,
  'auth/missing-recaptcha-token': t.errors.authRecaptcha,
  'auth/invalid-recaptcha-token': t.errors.authRecaptcha,
  'auth/invalid-recaptcha-action': t.errors.authRecaptcha,
  'auth/recaptcha-not-enabled': t.errors.authRecaptcha,
  'auth/invalid-app-credential': t.errors.authRecaptcha,
};

export function authErrorCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('auth/') ? code : null;
}

export function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    const known = (t.errors as Record<string, string>)[err.code];
    return known ?? t.errors.UNKNOWN;
  }
  const auth = authErrorCode(err);
  if (auth) return AUTH_MESSAGES[auth] ?? t.errors.UNKNOWN;
  return t.errors.UNKNOWN;
}

export function isApiError(err: unknown, code: string, field?: string): boolean {
  return err instanceof ApiError && err.code === code && (field === undefined || err.field === field);
}
