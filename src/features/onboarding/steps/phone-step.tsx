'use client';

import { useRef, useState, type FormEvent } from 'react';
import { TotpCodeInput } from '@/components/auth/totp-code-input';
import { Button, TextButton } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import type { PhoneEnrollment } from '@/lib/auth/types';
import { authErrorCode, messageFor } from '@/lib/errors';
import { ApiError } from '@/lib/graphql/client';
import { formatGhanaLocal } from '@/lib/phone';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { validTotpCode } from '@/lib/validation';
import { StepUpCancelled, useStepUp } from '../../session/use-step-up';
import { Actions, StepHeader } from '../onboarding-layout';

function codeMessage(code: string | null): string | null {
  if (code === 'auth/invalid-verification-code') return t.phoneVerify.invalid;
  if (code === 'auth/code-expired' || code === 'auth/session-expired') return t.phoneVerify.expired;
  if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') return t.phoneVerify.tooMany;
  if (code === 'auth/invalid-phone-number' || code === 'auth/missing-phone-number') return t.phoneVerify.badNumber;
  return null;
}

export function PhoneStep({ phone, onDone, mode = 'onboarding' }: { phone: string; onDone: () => void; mode?: 'onboarding' | 'settings' }) {
  const { auth, api } = useServices();
  const [enrollment, setEnrollment] = useState<PhoneEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const inFlight = useRef(false);
  const stepUp = useStepUp();
  const shown = formatGhanaLocal(phone);

  async function send(again = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    setNote(null);
    try {
      const e = await stepUp.run(async () => {
        try {
          return await auth.startPhoneEnrollment(phone);
        } catch (err) {
          if (authErrorCode(err) === 'auth/requires-recent-login') throw new ApiError('STEP_UP_REQUIRED');
          throw err;
        }
      }, { requireFresh: true });
      setEnrollment(e);
      setCode('');
      setCodeError(null);
      if (again) setNote(t.phoneVerify.resent);
    } catch (err) {
      if (err instanceof StepUpCancelled) return;
      setError(codeMessage(authErrorCode(err)) ?? messageFor(err));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || !enrollment) return;
    if (!validTotpCode(code)) return setCodeError(t.validation.codeInvalid);
    setCodeError(null);
    setNote(null);
    inFlight.current = true;
    setVerifying(true);
    try {
      await enrollment.finish(code);
      await api.request('ConfirmPhone').catch(() => undefined);
      onDone();
    } catch (err) {
      const c = authErrorCode(err);
      if (c === 'auth/invalid-verification-code') setCodeError(t.phoneVerify.invalid);
      else if (c === 'auth/code-expired' || c === 'auth/session-expired') {
        setEnrollment(null);
        setError(t.phoneVerify.expired);
      } else setError(codeMessage(c) ?? messageFor(err));
    } finally {
      inFlight.current = false;
      setVerifying(false);
    }
  }

  const step = mode === 'onboarding' ? 'phone' : undefined;

  if (enrollment) {
    return (
      <div className="max-w-[38rem]">
        <StepHeader step={step} title={t.phoneVerify.title} lead={t.phoneVerify.sentTo(shown)} />
        <form onSubmit={verify} noValidate className="stagger flex flex-col gap-6">
          <Field label={t.phoneVerify.code} error={codeError}>
            {({ inputId, describedBy, invalid }) => <TotpCodeInput id={inputId} aria-describedby={describedBy} invalid={invalid} value={code} onValue={setCode} className="max-w-[15rem]" autoFocus />}
          </Field>
          {note ? <p className="text-[14px] text-muted" aria-live="polite">{note}</p> : null}
          {error ? (
            <Notice tone="danger" live="assertive">
              {error}
            </Notice>
          ) : null}
          <Actions>
            <Button type="submit" loading={verifying} loadingLabel={t.common.checking}>
              {t.phoneVerify.verify}
            </Button>
            <TextButton onClick={() => void send(true)} disabled={sending || verifying}>
              {t.phoneVerify.resend}
            </TextButton>
          </Actions>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-[38rem]">
      <StepHeader step={step} title={t.phoneVerify.title} lead={t.phoneVerify.lead} />
      <div className="stagger flex flex-col gap-8">
        <div>
          <p className="text-[13px] font-medium text-muted">{t.phoneVerify.number}</p>
          <p className="tabular mt-1 text-[22px] font-semibold tracking-[-0.01em] text-ink">{shown}</p>
        </div>
        {error ? (
          <Notice tone="danger" live="assertive">
            {error}
          </Notice>
        ) : null}
        {stepUp.panel}
        {!stepUp.active ? (
          <Actions>
            <Button onClick={() => void send()} loading={sending} loadingLabel={t.common.working}>
              {t.phoneVerify.send}
            </Button>
          </Actions>
        ) : null}
      </div>
    </div>
  );
}
