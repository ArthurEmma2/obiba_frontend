'use client';

import { useRef, useState, type FormEvent } from 'react';
import { GoogleButton, OrDivider } from '@/components/auth/google-button';
import { TotpCodeInput } from '@/components/auth/totp-code-input';
import { Button } from '@/components/ui/button';
import { Field, PasswordInput } from '@/components/ui/field';
import { LockIcon } from '@/components/ui/icons';
import type { SecondFactorChallenge } from '@/lib/auth/types';
import { authErrorCode, messageFor } from '@/lib/errors';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { validTotpCode } from '@/lib/validation';

export function ReauthPanel({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { auth } = useServices();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<SecondFactorChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const email = auth.current()?.email ?? '';
  const methods = auth.reauthMethods();
  const usePassword = methods.includes('password');
  const useGoogle = methods.includes('google');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    if (!challenge && !password) return setError(t.validation.passwordRequired);
    if (challenge && !validTotpCode(code)) return setError(t.validation.codeInvalid);
    setError(null);
    inFlight.current = true;
    setBusy(true);
    try {
      if (challenge) {
        await auth.completeSecondFactor(challenge, code);
        onDone();
      } else {
        const r = await auth.reauthenticate(password);
        setPassword('');
        if (r.status === 'second-factor') setChallenge(r.challenge);
        else onDone();
      }
    } catch (err) {
      const c = authErrorCode(err);
      if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/invalid-login-credentials') setError(t.signIn.invalid);
      else if (c === 'auth/invalid-verification-code') setError(challenge?.kind === 'phone' ? t.phoneVerify.invalid : t.signIn.totpInvalid);
      else setError(messageFor(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="reauth-title" className="rounded-lg border border-line bg-surface p-5 shadow-raise sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <LockIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" />
        <div>
          <h2 id="reauth-title" className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
            {t.reauth.title}
          </h2>
          <p className="mt-1 text-[14px] leading-5 text-muted">{challenge ? (challenge.kind === 'phone' ? t.reauth.smsLead(challenge.phoneHint) : t.reauth.totpLead) : usePassword ? t.reauth.lead : t.google.reauthLead}</p>
        </div>
      </div>
      {!challenge && useGoogle ? (
        <>
          <GoogleButton
            label={t.google.reauth}
            disabled={busy}
            run={() => auth.reauthenticateWithGoogle()}
            onResult={(r) => {
              if (r.status === 'second-factor') setChallenge(r.challenge);
              else onDone();
            }}
            onError={setError}
          />
          {usePassword ? <OrDivider /> : null}
        </>
      ) : null}
      {!challenge && !usePassword ? (
        <div className="mt-4 flex flex-col gap-3">
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <Button variant="ghost" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        </div>
      ) : (
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        {challenge ? (
          <Field label={challenge.kind === 'phone' ? t.phoneVerify.code : t.signIn.totpLabel} error={error}>
            {({ inputId, describedBy, invalid }) => <TotpCodeInput id={inputId} aria-describedby={describedBy} invalid={invalid} value={code} onValue={setCode} autoFocus />}
          </Field>
        ) : (
          <Field label={t.common.password} error={error}>
            {({ inputId, describedBy, invalid }) => (
              <PasswordInput id={inputId} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={describedBy} invalid={invalid} autoFocus />
            )}
          </Field>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button type="submit" loading={busy} loadingLabel={t.common.checking}>
            {t.reauth.submit}
          </Button>
        </div>
      </form>
      )}
    </section>
  );
}
