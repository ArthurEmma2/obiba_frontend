import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { SignInForm } from '@/components/auth/sign-in-form';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { readPendingProfile } from '@/lib/pending-profile';
import { t } from '@/lib/strings';
import { fakeAuth, makeServices, renderWith, testRouter } from './helpers';

const signedOut = () => fakeAuth({ current: () => null, ready: async () => null });

describe('sign in', () => {
  it('validates before calling the auth service', async () => {
    const auth = signedOut();
    renderWith(<SignInForm />, makeServices({ auth }));
    await userEvent.click(screen.getByRole('button', { name: t.signIn.submit }));
    expect(await screen.findByText(t.validation.emailRequired)).toBeInTheDocument();
    expect(screen.getByText(t.validation.passwordRequired)).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('shows one generic message for bad credentials, without revealing whether the account exists', async () => {
    const auth = signedOut();
    vi.mocked(auth.signIn).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/user-not-found' }));
    renderWith(<SignInForm />, makeServices({ auth }));
    await userEvent.type(screen.getByLabelText(t.common.email), 'ama@example.com');
    await userEvent.type(screen.getByLabelText(t.common.password), 'not-the-password');
    await userEvent.click(screen.getByRole('button', { name: t.signIn.submit }));
    expect(await screen.findByText(t.signIn.invalid)).toBeInTheDocument();
  });

  it('asks for the authenticator code when the account has TOTP, then continues', async () => {
    const auth = signedOut();
    const challenge = { kind: 'totp' as const, purpose: 'sign-in' as const };
    vi.mocked(auth.signIn).mockResolvedValueOnce({ status: 'second-factor', challenge });
    vi.mocked(auth.completeSecondFactor).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/invalid-verification-code' }));
    renderWith(<SignInForm />, makeServices({ auth }));
    await userEvent.type(screen.getByLabelText(t.common.email), 'ama@example.com');
    await userEvent.type(screen.getByLabelText(t.common.password), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: t.signIn.submit }));
    const code = await screen.findByLabelText(t.signIn.totpLabel);
    await userEvent.type(code, '123456');
    await userEvent.click(screen.getByRole('button', { name: t.signIn.totpSubmit }));
    expect(await screen.findByText(t.signIn.totpInvalid)).toBeInTheDocument();
    await userEvent.clear(code);
    await userEvent.type(code, '654321');
    await userEvent.click(screen.getByRole('button', { name: t.signIn.totpSubmit }));
    await waitFor(() => expect(testRouter().replace).toHaveBeenCalledWith('/onboarding'));
    expect(auth.completeSecondFactor).toHaveBeenLastCalledWith(challenge, '654321');
  });

  it('ignores a double submit while a sign-in is in flight', async () => {
    const auth = signedOut();
    let release: () => void = () => undefined;
    vi.mocked(auth.signIn).mockImplementation(() => new Promise((r) => (release = () => r({ status: 'signed-in' }))));
    renderWith(<SignInForm />, makeServices({ auth }));
    await userEvent.type(screen.getByLabelText(t.common.email), 'ama@example.com');
    await userEvent.type(screen.getByLabelText(t.common.password), 'pw');
    const form = screen.getByRole('button', { name: t.signIn.submit }).closest('form')!;
    form.requestSubmit();
    form.requestSubmit();
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledTimes(1));
    form.requestSubmit();
    expect(auth.signIn).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(testRouter().replace).toHaveBeenCalledWith('/onboarding'));
  });
});

describe('sign up', () => {
  async function fill(phone = '024 123 4567') {
    await userEvent.type(screen.getByLabelText(t.signUp.fullName), 'Ama Owusu');
    await userEvent.type(screen.getByLabelText(t.signUp.phone), phone);
    await userEvent.type(screen.getByLabelText(t.common.email), 'ama@example.com');
    await userEvent.type(screen.getByLabelText(t.common.password), 'a-long-passphrase');
  }

  it('rejects a non-Ghana phone number on the field', async () => {
    const auth = signedOut();
    renderWith(<SignUpForm />, makeServices({ auth }));
    await fill('+44 20 7946 0958');
    await userEvent.click(screen.getByRole('button', { name: t.signUp.submit }));
    expect(await screen.findByText(t.validation.phoneInvalid)).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('shows the project password rules and creates the account with a normalized phone', async () => {
    const auth = signedOut();
    renderWith(<SignUpForm />, makeServices({ auth }));
    await fill();
    expect(await screen.findByText(/At least 10 characters/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t.signUp.submit }));
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith({ email: 'ama@example.com', password: 'a-long-passphrase', displayName: 'Ama Owusu' }));
    expect(readPendingProfile('ama@example.com')).toEqual({ displayName: 'Ama Owusu', phone: '+233241234567' });
    expect(readPendingProfile('someone.else@example.com')).toBeNull();
    await waitFor(() => expect(testRouter().replace).toHaveBeenCalledWith('/onboarding'));
  });

  it('does not reject a strong password on the result for the shorter text typed before it', async () => {
    const auth = signedOut();
    renderWith(<SignUpForm />, makeServices({ auth }));
    await fill();
    await screen.findByText(/At least 10 characters/);
    await waitFor(() => expect(auth.checkPassword).toHaveBeenCalledWith('a-long-passphrase'));
    const field = screen.getByLabelText(t.common.password);
    await userEvent.clear(field);
    await userEvent.type(field, 'short');
    await waitFor(() => expect(auth.checkPassword).toHaveBeenCalledWith('short'));
    await screen.findByText(t.password.strength[0]);
    await userEvent.type(field, '-now-long-enough');
    await userEvent.click(screen.getByRole('button', { name: t.signUp.submit }));
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith({ email: 'ama@example.com', password: 'short-now-long-enough', displayName: 'Ama Owusu' }));
  });

  it('does not reveal that an email is already registered', async () => {
    const auth = signedOut();
    vi.mocked(auth.signUp).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/email-already-in-use' }));
    renderWith(<SignUpForm />, makeServices({ auth }));
    await fill();
    await screen.findByText(/At least 10 characters/);
    await userEvent.click(screen.getByRole('button', { name: t.signUp.submit }));
    expect(await screen.findByText(t.signUp.notCreated)).toBeInTheDocument();
    expect(screen.queryByText(/already in use|already exists/i)).toBeNull();
  });
});

describe('forgot password', () => {
  it('confirms the same way whether or not the account exists', async () => {
    const auth = signedOut();
    renderWith(<ForgotPasswordForm />, makeServices({ auth }));
    await userEvent.type(screen.getByLabelText(t.common.email), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: t.forgot.submit }));
    expect(await screen.findByText(t.forgot.sent('nobody@example.com'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /You can resend/ })).toBeDisabled();
  });
});

describe('Google sign-in', () => {
  it('signs in with Google and continues to setup', async () => {
    const auth = signedOut();
    renderWith(<SignInForm />, makeServices({ auth }));
    await userEvent.click(screen.getByRole('button', { name: t.google.continue }));
    await waitFor(() => expect(testRouter().replace).toHaveBeenCalledWith('/onboarding'));
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('treats a closed Google window as a cancel, not an error', async () => {
    const auth = signedOut();
    vi.mocked(auth.signInWithGoogle).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' }));
    renderWith(<SignInForm />, makeServices({ auth }));
    await userEvent.click(screen.getByRole('button', { name: t.google.continue }));
    await waitFor(() => expect(screen.getByRole('button', { name: t.google.continue })).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(testRouter().replace).not.toHaveBeenCalled();
  });

  it('explains a blocked popup and an email already used by another sign-in method', async () => {
    const auth = signedOut();
    vi.mocked(auth.signInWithGoogle)
      .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/popup-blocked' }))
      .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/account-exists-with-different-credential' }));
    renderWith(<SignUpForm />, makeServices({ auth }));
    await userEvent.click(screen.getByRole('button', { name: t.google.signUp }));
    expect(await screen.findByText(t.google.popupBlocked)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t.google.signUp }));
    expect(await screen.findByText(t.google.accountExists)).toBeInTheDocument();
  });

  it('asks for the authenticator code when the Google account has TOTP', async () => {
    const auth = signedOut();
    vi.mocked(auth.signInWithGoogle).mockResolvedValueOnce({ status: 'second-factor', challenge: { kind: 'totp', purpose: 'sign-in' } });
    renderWith(<SignInForm />, makeServices({ auth }));
    await userEvent.click(screen.getByRole('button', { name: t.google.continue }));
    expect(await screen.findByLabelText(t.signIn.totpLabel)).toBeInTheDocument();
  });
});
