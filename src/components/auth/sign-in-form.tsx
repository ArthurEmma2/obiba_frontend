'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Button, TextButton } from '@/components/ui/button';
import { Field, Input, PasswordInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import type { SecondFactorChallenge } from '@/lib/auth/types';
import { authErrorCode, messageFor } from '@/lib/errors';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { validEmail, validTotpCode } from '@/lib/validation';
import { AuthHeading } from './auth-shell';
import { GoogleButton, OrDivider } from './google-button';
import { TotpCodeInput } from './totp-code-input';
import { rememberRestoreEmail } from '@/features/recover/storage';
import { useSignedInRedirect } from './use-signed-in-redirect';

export function SignInForm() {
  const { auth } = useServices();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<SecondFactorChallenge | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const session = useSignedInRedirect(busy || challenge !== null);

  async function finish(): Promise<void> {
    const wanted = new URLSearchParams(window.location.search).get('next');
    const next = wanted && /^\/pay\/invoice\?id=[0-9a-f]{32}$/.test(wanted) ? wanted : null;
    router.replace(next ?? '/onboarding');
  }

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const next: typeof errors = {};
    if (!email.trim()) next.email = t.validation.emailRequired;
    else if (!validEmail(email)) next.email = t.validation.emailInvalid;
    if (!password) next.password = t.validation.passwordRequired;
    setErrors(next);
    setFormError(null);
    if (next.email || next.password) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await auth.signIn(email.trim(), password);
      if (result.status === 'second-factor') {
        setChallenge(result.challenge);
        setPassword('');
      } else {
        await finish();
      }
    } catch (err) {
      setFormError(messageFor(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || !challenge) return;
    if (!validTotpCode(code)) {
      setCodeError(t.validation.codeInvalid);
      return;
    }
    setCodeError(null);
    inFlight.current = true;
    setBusy(true);
    try {
      await auth.completeSecondFactor(challenge, code);
      await finish();
    } catch (err) {
      const c = authErrorCode(err);
      if (c === 'auth/totp-challenge-timeout' || c === 'auth/code-expired' || c === 'auth/session-expired') {
        setChallenge(null);
        setCode('');
        setFormError(t.signIn.totpExpired);
      } else {
        setCodeError(c === 'auth/invalid-verification-code' ? (challenge.kind === 'phone' ? t.phoneVerify.invalid : t.signIn.totpInvalid) : messageFor(err));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function resend() {
    if (!challenge || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setCodeError(null);
    try {
      await auth.resendSecondFactor(challenge);
      setCode('');
    } catch (err) {
      const c = authErrorCode(err);
      setCodeError(c === 'auth/too-many-requests' ? t.phoneVerify.tooMany : messageFor(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <div>
        <AuthHeading title={challenge.kind === 'phone' ? t.signIn.smsTitle : t.signIn.totpTitle} lead={challenge.kind === 'phone' ? t.signIn.smsLead(challenge.phoneHint) : t.signIn.totpLead} />
        <form onSubmit={submitCode} noValidate className="flex flex-col gap-5">
          <Field label={challenge.kind === 'phone' ? t.phoneVerify.code : t.signIn.totpLabel} error={codeError}>
            {({ inputId, describedBy, invalid }) => (
              <TotpCodeInput id={inputId} aria-describedby={describedBy} invalid={invalid} value={code} onValue={setCode} autoFocus />
            )}
          </Field>
          <Button type="submit" block loading={busy} loadingLabel={t.common.checking}>
            {t.signIn.totpSubmit}
          </Button>
          {challenge.kind === 'phone' ? (
            <>
              <TextButton onClick={() => void resend()} disabled={busy} className="self-center">
                {t.signIn.resend}
              </TextButton>
              <Link href="/recover/request" onClick={() => rememberRestoreEmail(email.trim())} className="self-center rounded-sm text-[14px] font-medium text-brand-ink underline-offset-4 hover:underline">
                {t.restore.lostNumber}
              </Link>
            </>
          ) : null}
          <TextButton
            onClick={() => {
              setChallenge(null);
              setCode('');
              setCodeError(null);
            }}
            className="self-center"
          >
            {t.signIn.useDifferentAccount}
          </TextButton>
        </form>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading title={t.signIn.title} lead={t.signIn.lead} />
      {formError ? (
        <div className="mb-5">
          <Notice tone="danger" live="assertive">
            {formError}
          </Notice>
        </div>
      ) : null}
      <GoogleButton
        disabled={busy}
        onStart={() => setBusy(true)}
        run={() => auth.signInWithGoogle()}
        onResult={(r) => {
          if (r.status === 'second-factor') {
            setBusy(false);
            setChallenge(r.challenge);
          } else void finish().finally(() => setBusy(false));
        }}
        onError={(m) => {
          setBusy(false);
          setFormError(m);
        }}
      />
      <OrDivider />
      <form onSubmit={submitCredentials} noValidate className="flex flex-col gap-5" aria-busy={busy || session.status === 'loading'}>
        <Field label={t.common.email} error={errors.email}>
          {({ inputId, describedBy, invalid }) => (
            <Input
              id={inputId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
              required
            />
          )}
        </Field>
        <Field
          label={t.common.password}
          error={errors.password}
          trailing={
            <Link href="/forgot-password" className="rounded-sm text-[13px] font-medium text-brand-ink underline-offset-4 hover:underline">
              {t.signIn.forgot}
            </Link>
          }
        >
          {({ inputId, describedBy, invalid }) => (
            <PasswordInput
              id={inputId}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
              required
            />
          )}
        </Field>
        <Button type="submit" block loading={busy} loadingLabel={t.common.working} className="mt-1">
          {t.signIn.submit}
        </Button>
      </form>
      <p className="mt-8 text-[14px] text-muted">
        {t.signIn.noAccount}{' '}
        <Link href="/sign-up" className="font-medium text-brand-ink underline-offset-4 hover:underline">
          {t.signIn.create}
        </Link>
      </p>
    </div>
  );
}
