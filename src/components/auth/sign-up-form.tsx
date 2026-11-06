'use client';

import { withBase } from '@/lib/base-path';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, PasswordInput, PrefixedInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { authErrorCode, messageFor } from '@/lib/errors';
import { savePendingProfile } from '@/lib/pending-profile';
import { normalizeGhanaPhone } from '@/lib/phone';
import { webConfig } from '@/lib/config';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { validDisplayName, validEmail } from '@/lib/validation';
import { AuthHeading } from './auth-shell';
import { GoogleButton, OrDivider } from './google-button';
import { PasswordGuidance, usePasswordCheck } from './password-guidance';
import { Turnstile } from './turnstile';
import { useSignedInRedirect } from './use-signed-in-redirect';

type Errors = Partial<Record<'name' | 'phone' | 'email' | 'password', string>>;

export function SignUpForm() {
  const { auth, api, siteUrl } = useServices();
  const { turnstileSiteKey } = webConfig();
  const [humanToken, setHumanToken] = useState<string | null>(null);
  const [humanReset, setHumanReset] = useState(0);
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const guidanceId = useId();
  const policy = usePasswordCheck(password);
  useSignedInRedirect(busy);

  function validate(): Errors {
    const next: Errors = {};
    const n = validDisplayName(name);
    if (n === 'empty') next.name = t.validation.nameRequired;
    if (n === 'control') next.name = t.validation.nameControl;
    if (!phone.trim()) next.phone = t.validation.phoneRequired;
    else if (!normalizeGhanaPhone(phone)) next.phone = t.validation.phoneInvalid;
    if (!email.trim()) next.email = t.validation.emailRequired;
    else if (!validEmail(email)) next.email = t.validation.emailInvalid;
    if (!password) next.password = t.validation.passwordRequired;
    else if (policy.current && !policy.current.valid) next.password = t.errors.authWeakPassword;
    return next;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const next = validate();
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    if (turnstileSiteKey && !humanToken) {
      setFormError(t.signUp.humanCheckNeeded);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const e164 = normalizeGhanaPhone(phone)!;
      savePendingProfile(email, { displayName: name.trim(), phone: e164 });
      if (turnstileSiteKey) {
        await api.request('CreateAccount', { input: { email: email.trim(), password, displayName: name.trim(), turnstileToken: humanToken! } });
        await auth.signIn(email.trim(), password);
        // A full load drops the Cloudflare script before the Recovery Kit screens.
        window.location.assign(withBase('/onboarding'));
        return;
      }
      await auth.signUp({ email: email.trim(), password, displayName: name.trim() });
      setPassword('');
      router.replace('/onboarding');
    } catch (err) {
      if (turnstileSiteKey) {
        setHumanToken(null);
        setHumanReset((n) => n + 1);
      }
      const code = authErrorCode(err);
      if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements') setErrors({ password: messageFor(err) });
      else if (code === 'auth/invalid-email') setErrors({ email: messageFor(err) });
      else setFormError(messageFor(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <AuthHeading title={t.signUp.title} lead={t.signUp.lead} />
      {formError ? (
        <div className="mb-5">
          <Notice tone="danger" live="assertive">
            {formError}
          </Notice>
        </div>
      ) : null}
      <GoogleButton
        label={t.google.signUp}
        disabled={busy}
        onStart={() => setBusy(true)}
        run={() => auth.signInWithGoogle()}
        onResult={(r) => {
          setBusy(false);
          if (r.status === 'second-factor') setFormError(t.signUp.notCreated);
          else router.replace('/onboarding');
        }}
        onError={(m) => {
          setBusy(false);
          setFormError(m);
        }}
      />
      <OrDivider />
      <form onSubmit={submit} noValidate className="flex flex-col gap-5" aria-busy={busy}>
        <Field label={t.signUp.fullName} hint={t.signUp.fullNameHint} error={errors.name}>
          {({ inputId, describedBy, invalid }) => (
            <Input id={inputId} name="name" autoComplete="name" autoCapitalize="words" value={name} onChange={(e) => setName(e.target.value)} aria-describedby={describedBy} invalid={invalid} maxLength={120} required />
          )}
        </Field>
        <Field label={t.signUp.phone} hint={t.signUp.phoneHint} error={errors.phone}>
          {({ inputId, describedBy, invalid }) => (
            <PrefixedInput
              prefix="+233"
              id={inputId}
              name="tel"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="24 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+()-]/g, '').slice(0, 17))}
              aria-describedby={describedBy}
              invalid={invalid}
              required
            />
          )}
        </Field>
        <Field label={t.common.email} error={errors.email}>
          {({ inputId, describedBy, invalid }) => (
            <Input
              id={inputId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
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
        <Field label={t.common.password} error={errors.password}>
          {({ inputId, describedBy, invalid }) => (
            <div className="flex flex-col gap-3">
              <PasswordInput
                id={inputId}
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={[describedBy, guidanceId].filter(Boolean).join(' ')}
                invalid={invalid}
                required
              />
              <PasswordGuidance id={guidanceId} password={password} check={policy.check} unavailable={policy.unavailable} />
            </div>
          )}
        </Field>
        {turnstileSiteKey ? <Turnstile siteKey={turnstileSiteKey} action="sign_up" resetSignal={humanReset} onToken={setHumanToken} /> : null}
        <Button type="submit" block loading={busy} loadingLabel={t.common.working} className="mt-1">
          {t.signUp.submit}
        </Button>
        <p className="text-[13px] leading-5 text-muted">
          {t.signUp.agree}{' '}
          <a className="text-ink underline underline-offset-2" href={`${siteUrl}/terms`}>
            {t.common.terms}
          </a>{' '}
          {t.signUp.and}{' '}
          <a className="text-ink underline underline-offset-2" href={`${siteUrl}/privacy`}>
            {t.common.privacy}
          </a>
          .
        </p>
      </form>
      <p className="mt-8 text-[14px] text-muted">
        {t.signUp.haveAccount}{' '}
        <Link href="/sign-in" className="font-medium text-brand-ink underline-offset-4 hover:underline">
          {t.signUp.signIn}
        </Link>
      </p>
    </div>
  );
}
