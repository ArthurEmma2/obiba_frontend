'use client';

import { useRef, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import type { SignInResult } from '@/lib/auth/types';
import { authErrorCode, messageFor } from '@/lib/errors';
import { t } from '@/lib/strings';

const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

export function googleErrorMessage(err: unknown): string | null {
  const code = authErrorCode(err);
  if (code && SILENT.has(code)) return null;
  if (code === 'auth/popup-blocked') return t.google.popupBlocked;
  if (code === 'auth/account-exists-with-different-credential' || code === 'auth/credential-already-in-use') return t.google.accountExists;
  if (code === 'auth/operation-not-allowed') return t.google.unavailable;
  return messageFor(err);
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function GoogleButton({
  onStart,
  run,
  onResult,
  onError,
  disabled,
  label = t.google.continue,
}: {
  onStart?: () => void;
  run: () => Promise<SignInResult>;
  onResult: (r: SignInResult) => void;
  onError: (message: string | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function click() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onStart?.();
    onError(null);
    try {
      onResult(await run());
    } catch (err) {
      onError(googleErrorMessage(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void click()}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-md border border-field bg-surface px-4 text-[15px] font-medium text-ink transition-colors hover:border-ink/25 hover:bg-canvas active:bg-wash disabled:cursor-not-allowed disabled:text-muted"
    >
      {busy ? <Spinner className="h-[18px] w-[18px] text-muted" /> : <GoogleMark />}
      <span>{label}</span>
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-4" role="separator" aria-label={t.google.or}>
      <span className="h-px flex-1 bg-line" />
      <span className="text-[13px] text-muted">{t.google.or}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
