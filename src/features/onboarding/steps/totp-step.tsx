'use client';

import { useRef, useState, type FormEvent } from 'react';
import { TotpCodeInput } from '@/components/auth/totp-code-input';
import { Button, TextButton } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { QrCode } from '@/components/ui/qr-code';
import type { TotpEnrollment } from '@/lib/auth/types';
import { authErrorCode, messageFor } from '@/lib/errors';
import { ApiError } from '@/lib/graphql/client';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { validTotpCode } from '@/lib/validation';
import { StepUpCancelled, useStepUp } from '../../session/use-step-up';
import { Actions, StepHeader } from '../onboarding-layout';
import { deferTotp, clearTotpDeferral } from '../totp-deferral';

const UNAVAILABLE = new Set(['auth/operation-not-allowed', 'auth/admin-restricted-operation', 'auth/unsupported-first-factor', 'auth/configuration-not-found']);

function groupKey(key: string): string {
  return key.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

export function TotpStep({ uid, onDone, mode = 'onboarding' }: { uid: string; onDone: () => void; mode?: 'onboarding' | 'settings' }) {
  const { auth } = useServices();
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [starting, setStarting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);
  const stepUp = useStepUp();

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setStarting(true);
    setError(null);
    try {
      const e = await stepUp.run(async () => {
        try {
          return await auth.startTotpEnrollment();
        } catch (err) {
          if (authErrorCode(err) === 'auth/requires-recent-login') throw new ApiError('STEP_UP_REQUIRED');
          throw err;
        }
      }, { requireFresh: true });
      setEnrollment(e);
    } catch (err) {
      const c = authErrorCode(err);
      if (err instanceof StepUpCancelled) return;
      if (c && UNAVAILABLE.has(c)) setUnavailable(true);
      else setError(messageFor(err));
    } finally {
      inFlight.current = false;
      setStarting(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || !enrollment) return;
    if (!validTotpCode(code)) return setCodeError(t.validation.codeInvalid);
    setCodeError(null);
    inFlight.current = true;
    setVerifying(true);
    try {
      await enrollment.finish(code);
      clearTotpDeferral(uid);
      setEnrollment(null);
      onDone();
    } catch (err) {
      const c = authErrorCode(err);
      if (c === 'auth/invalid-verification-code') setCodeError(t.totp.invalid);
      else if (c === 'auth/totp-challenge-timeout' || c === 'auth/code-expired' || c === 'auth/session-expired') {
        setEnrollment(null);
        setCode('');
        setError(t.totp.expired);
      } else setError(messageFor(err));
    } finally {
      inFlight.current = false;
      setVerifying(false);
    }
  }

  function later() {
    deferTotp(uid);
    onDone();
  }

  async function copyKey() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secretKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (unavailable) {
    return (
      <div className="max-w-[38rem]">
        <StepHeader title={t.totp.title} lead={t.totp.unavailable} />
        <Button onClick={mode === 'onboarding' ? later : onDone}>{t.common.continue}</Button>
      </div>
    );
  }

  if (enrollment) {
    return (
      <div className="max-w-[56rem]">
        <StepHeader title={t.totp.title} />
        <div className="grid items-start gap-10 md:grid-cols-[auto_minmax(0,1fr)] md:gap-14">
          <figure className="stagger flex flex-col gap-4">
            <div className="w-fit rounded-sm border border-line bg-white p-3 shadow-raise">
              <QrCode value={enrollment.otpauthUrl} label={t.totp.scan} size={188} />
            </div>
            <figcaption className="flex max-w-[236px] flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-muted">{t.totp.manual}</span>
              <span className="font-mono text-[14px] leading-6 tracking-[0.06em] text-ink [overflow-wrap:break-word]">{groupKey(enrollment.secretKey)}</span>
              <TextButton onClick={() => void copyKey()} className="self-start" aria-live="polite">
                {copied ? t.totp.copied : t.totp.copyKey}
              </TextButton>
            </figcaption>
          </figure>

          <form onSubmit={verify} noValidate className="flex flex-col">
            <ol className="stagger flex flex-col">
              {t.totp.steps.map((s, i) => (
                <li key={i} className="flex gap-5 border-b border-hairline py-4 first:pt-0">
                  <span className="tabular w-4 shrink-0 pt-px text-[14px] font-semibold text-brand-ink">{i + 1}</span>
                  <div className="flex flex-1 flex-col gap-4">
                    <span className="text-[16px] leading-6 text-ink-2">{s}</span>
                    {i === t.totp.steps.length - 1 ? (
                      <div className="flex flex-col gap-4 pb-2">
                        <Field label={t.totp.code} error={codeError}>
                          {({ inputId, describedBy, invalid }) => <TotpCodeInput id={inputId} aria-describedby={describedBy} invalid={invalid} value={code} onValue={setCode} className="max-w-[15rem]" />}
                        </Field>
                        {error ? (
                          <Notice tone="danger" live="assertive">
                            {error}
                          </Notice>
                        ) : null}
                        <Actions>
                          <Button type="submit" loading={verifying} loadingLabel={t.common.checking}>
                            {t.totp.verify}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setEnrollment(null);
                              setCode('');
                              setCodeError(null);
                            }}
                            disabled={verifying}
                          >
                            {t.common.back}
                          </Button>
                        </Actions>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[38rem]">
      <StepHeader title={t.totp.title} lead={t.totp.lead} />
      <div className="stagger flex flex-col gap-8">
        <p className="max-w-[32rem] text-[14px] leading-[1.55] text-muted">{t.totp.samePhone}</p>
        {error ? (
          <Notice tone="danger" live="assertive">
            {error}
          </Notice>
        ) : null}
        {stepUp.panel}
        {!stepUp.active ? (
          <Actions>
            <Button onClick={() => void start()} loading={starting} loadingLabel={t.common.working}>
              {t.totp.start}
            </Button>
            {mode === 'onboarding' ? (
              <Button variant="ghost" onClick={later} disabled={starting}>
                {t.totp.skip}
              </Button>
            ) : null}
          </Actions>
        ) : null}
        {mode === 'onboarding' ? <p className="text-[13px] text-muted">{t.totp.skipNote}</p> : null}
      </div>
    </div>
  );
}
