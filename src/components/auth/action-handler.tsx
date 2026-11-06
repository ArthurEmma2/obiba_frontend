'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, PasswordInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { authErrorCode, messageFor } from '@/lib/errors';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { AuthHeading } from './auth-shell';
import { PasswordGuidance, usePasswordCheck } from './password-guidance';

type View =
  | { kind: 'loading' }
  | { kind: 'reset'; code: string; email: string }
  | { kind: 'reset-done' }
  | { kind: 'verified' }
  | { kind: 'error'; message: string };

function linkError(err: unknown): string {
  const c = authErrorCode(err);
  if (c === 'auth/expired-action-code') return t.action.expiredLink;
  if (c === 'auth/invalid-action-code') return t.action.invalidLink;
  return messageFor(err);
}

function initialView(mode: string | null, code: string | null): View {
  if (!code) return { kind: 'error', message: t.action.invalidLink };
  if (mode !== 'resetPassword' && mode !== 'verifyEmail') return { kind: 'error', message: t.action.unknownMode };
  return { kind: 'loading' };
}

export function ActionHandler({ mode, code }: { mode: string | null; code: string | null }) {
  const { auth } = useServices();
  const [view, setView] = useState<View>(() => initialView(mode, code));
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    if (!code) return;
    if (mode === 'resetPassword') {
      auth.checkResetCode(code).then(
        (email) => setView({ kind: 'reset', code, email }),
        (err) => setView({ kind: 'error', message: linkError(err) }),
      );
    } else if (mode === 'verifyEmail') {
      auth.applyEmailCode(code).then(
        () => setView({ kind: 'verified' }),
        (err) => setView({ kind: 'error', message: linkError(err) }),
      );
    }
  }, [auth, mode, code]);

  if (view.kind === 'loading') {
    return (
      <div className="flex items-center gap-3 text-muted" role="status">
        <Spinner />
        <span>{t.common.loading}</span>
      </div>
    );
  }
  if (view.kind === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading title={t.action.verifyTitle} />
        <Notice tone="danger" live="assertive">
          {view.message}
        </Notice>
        <Link href="/sign-in" className="inline-flex h-12 items-center justify-center rounded-md border border-field text-[15px] font-medium text-ink hover:bg-canvas">
          {t.forgot.backToSignIn}
        </Link>
      </div>
    );
  }
  if (view.kind === 'verified') {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading title={t.verify.title} />
        <Notice tone="success" live="polite">
          {t.action.verifyDone}
        </Notice>
        <Link href="/onboarding" className="inline-flex h-12 items-center justify-center rounded-md bg-action text-[15px] font-medium text-white shadow-button hover:bg-action-hover">
          {t.action.continueSetup}
        </Link>
      </div>
    );
  }
  if (view.kind === 'reset-done') {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading title={t.action.resetTitle} />
        <Notice tone="success" live="polite">
          {t.action.resetDone}
        </Notice>
        <Link href="/sign-in" className="inline-flex h-12 items-center justify-center rounded-md bg-action text-[15px] font-medium text-white shadow-button hover:bg-action-hover">
          {t.signIn.submit}
        </Link>
      </div>
    );
  }
  return <ResetForm code={view.code} email={view.email} onDone={() => setView({ kind: 'reset-done' })} onLinkError={(m) => setView({ kind: 'error', message: m })} />;
}

function ResetForm({ code, email, onDone, onLinkError }: { code: string; email: string; onDone: () => void; onLinkError: (m: string) => void }) {
  const { auth } = useServices();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const guidanceId = useId();
  const policy = usePasswordCheck(password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!password) return setError(t.validation.passwordRequired);
    if (policy.current && !policy.current.valid) return setError(t.errors.authWeakPassword);
    setError(null);
    setBusy(true);
    try {
      await auth.confirmReset(code, password);
      setPassword('');
      onDone();
    } catch (err) {
      const c = authErrorCode(err);
      if (c === 'auth/expired-action-code' || c === 'auth/invalid-action-code') onLinkError(linkError(err));
      else setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AuthHeading title={t.action.resetTitle} lead={t.action.resetLead(email)} />
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <Field label={t.action.newPassword} error={error}>
          {({ inputId, describedBy, invalid }) => (
            <div className="flex flex-col gap-3">
              <PasswordInput
                id={inputId}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={[describedBy, guidanceId].filter(Boolean).join(' ')}
                invalid={invalid}
                autoFocus
              />
              <PasswordGuidance id={guidanceId} password={password} check={policy.check} unavailable={policy.unavailable} />
            </div>
          )}
        </Field>
        <Button type="submit" block loading={busy} loadingLabel={t.common.working}>
          {t.action.resetSubmit}
        </Button>
      </form>
    </div>
  );
}

export function ActionHandlerRoute() {
  const params = useSearchParams();
  // ActionHandler strips the code from the address bar, which also clears it from useSearchParams.
  const [link] = useState(() => ({ mode: params.get('mode'), code: params.get('oobCode') }));
  return <ActionHandler mode={link.mode} code={link.code} />;
}
