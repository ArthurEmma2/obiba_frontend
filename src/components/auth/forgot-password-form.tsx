'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { authErrorCode, messageFor } from '@/lib/errors';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { validEmail } from '@/lib/validation';
import { AuthHeading } from './auth-shell';

const COOLDOWN_S = 30;

export function ForgotPasswordForm() {
  const { auth } = useServices();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function send(target: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFormError(null);
    try {
      await auth.sendPasswordReset(target);
      setSentTo(target);
      setCooldown(COOLDOWN_S);
    } catch (err) {
      const c = authErrorCode(err);
      if (c === 'auth/too-many-requests' || c === 'auth/network-request-failed' || c?.includes('recaptcha') || c === 'auth/captcha-check-failed') setFormError(messageFor(err));
      else {
        setSentTo(target);
        setCooldown(COOLDOWN_S);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!v) return setError(t.validation.emailRequired);
    if (!validEmail(v)) return setError(t.validation.emailInvalid);
    setError(null);
    void send(v);
  }

  if (sentTo) {
    return (
      <div>
        <AuthHeading title={t.forgot.sentTitle} lead={t.forgot.sent(sentTo)} />
        {formError ? (
          <div className="mb-5">
            <Notice tone="danger" live="assertive">
              {formError}
            </Notice>
          </div>
        ) : null}
        <div className="flex flex-col gap-3">
          <Button variant="secondary" block disabled={cooldown > 0} loading={busy} onClick={() => void send(sentTo)}>
            {cooldown > 0 ? t.verify.wait(cooldown) : t.forgot.resend}
          </Button>
          <Link href="/sign-in" className="inline-flex h-12 items-center justify-center rounded-md text-[15px] font-medium text-brand-ink hover:bg-brand-faint">
            {t.forgot.backToSignIn}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading title={t.forgot.title} lead={t.forgot.lead} />
      {formError ? (
        <div className="mb-5">
          <Notice tone="danger" live="assertive">
            {formError}
          </Notice>
        </div>
      ) : null}
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label={t.common.email} error={error}>
          {({ inputId, describedBy, invalid }) => (
            <Input
              id={inputId}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={describedBy}
              invalid={invalid}
              autoFocus
            />
          )}
        </Field>
        <Button type="submit" block loading={busy} loadingLabel={t.common.working}>
          {t.forgot.submit}
        </Button>
        <Link href="/sign-in" className="inline-flex h-11 items-center justify-center rounded-md text-[14px] font-medium text-brand-ink hover:bg-brand-faint">
          {t.forgot.backToSignIn}
        </Link>
      </form>
    </div>
  );
}
