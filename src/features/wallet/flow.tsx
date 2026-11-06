'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Field } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { routes } from '@/lib/routes';
import type { Approved } from '@/lib/crypto/delegate';
import { messageFor } from '@/lib/errors';
import type { PreparedOp } from '@/lib/graphql/types';
import { CEDI, formatUsd, parseAmount } from '@/lib/money';
import { useServices, useSession } from '@/lib/services';
import { t } from '@/lib/strings';
import { StepUpCancelled, useStepUp } from '../session/use-step-up';
import { needsGuardian, PaymentError, signAndSubmit, trackOp, type Outcome, type Phase } from './pipeline';
import { TokenLogo } from './providers';
import { Tracker } from './ui';
import { useWallet } from './wallet-data';

export type FlowState = { at: 'idle' } | { at: 'running'; phase: Phase; cosign: boolean } | { at: 'done'; outcome: Outcome } | { at: 'error'; message: string };

function failureMessage(err: unknown): string {
  if (err instanceof PaymentError) {
    if (err.code === 'NO_DEVICE_KEY') return t.flow.noDeviceKey;
    if (err.code === 'NEEDS_AUTHENTICATOR') return t.flow.needsAuthenticator;
    return t.flow.verifyFailed;
  }
  return messageFor(err);
}

export function usePayment() {
  const services = useServices();
  const session = useSession();
  const { state, refresh } = useWallet();
  const stepUp = useStepUp();
  const [flow, setFlow] = useState<FlowState>({ at: 'idle' });
  const tracker = useRef<{ cancel: () => void } | null>(null);
  const busy = useRef(false);

  useEffect(() => () => tracker.current?.cancel(), []);

  const limit = state.status === 'ready' ? state.limit : null;

  const requiresCosign = useCallback((amount: bigint) => (limit ? needsGuardian(amount, limit.remaining, limit.frozenUntil !== null) : false), [limit]);

  const run = useCallback(
    async (amount: bigint, prepare: () => Promise<PreparedOp>, approve: (prepared: PreparedOp) => Approved): Promise<Outcome | null> => {
      if (busy.current || state.status !== 'ready' || session.status !== 'signed-in') return null;
      const { wallet } = state;
      if (!wallet.me.accountId || wallet.me.viewOnly) return null;
      busy.current = true;
      const cosign = requiresCosign(amount);
      setFlow({ at: 'running', phase: 'checking', cosign });
      try {
        const prepared = await prepare();
        const opId = await signAndSubmit(
          {
            services,
            uid: session.user.uid,
            accountId: wallet.me.accountId,
            token: wallet.account.usdcContract,
            runStepUp: stepUp.run,
            onPhase: (phase) => setFlow({ at: 'running', phase, cosign }),
          },
          prepared,
          approve(prepared),
          cosign,
        );
        const track = trackOp(services, opId);
        tracker.current = track;
        const outcome = await track.done;
        tracker.current = null;
        setFlow({ at: 'done', outcome });
        void refresh();
        return outcome;
      } catch (err) {
        if (err instanceof StepUpCancelled) {
          setFlow({ at: 'idle' });
          return null;
        }
        setFlow({ at: 'error', message: failureMessage(err) });
        void refresh();
        return null;
      } finally {
        busy.current = false;
      }
    },
    [state, session, services, stepUp.run, requiresCosign, refresh],
  );

  const reset = useCallback(() => setFlow({ at: 'idle' }), []);

  return { flow, run, reset, requiresCosign, stepUpPanel: stepUp.panel, stepUpActive: stepUp.active };
}

const ORDER: Phase[] = ['checking', 'cosigning', 'approving', 'sending', 'confirming'];

export function Progress({ phase, cosign, title }: { phase: Phase; cosign: boolean; title: string }) {
  const steps = ORDER.filter((p) => cosign || p !== 'cosigning');
  return (
    <div className="animate-step" role="status">
      <p className="eyebrow mb-3 text-brand-ink">{t.flow.inProgress}</p>
      <p className="mb-8 text-[26px] font-semibold tracking-[-0.03em] text-ink">{title}</p>
      <Tracker steps={steps.map((p) => ({ key: p, label: t.flow.phases[p]! }))} at={steps.indexOf(phase)} />
      <p className="mt-8 text-[13px] leading-5 text-muted">{t.flow.dontClose}</p>
    </div>
  );
}

export function ResultView({
  tone,
  eyebrow,
  title,
  amount,
  children,
  actions,
}: {
  tone: 'success' | 'danger' | 'warning';
  eyebrow: string;
  title: string;
  amount?: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="animate-step" role="status" aria-live="polite">
      <p className={`eyebrow ${tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-warning'}`}>{eyebrow}</p>
      <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[30px]">{title}</h1>
      {amount ? <div className="mt-4">{amount}</div> : null}
      {children ? <div className="mt-8">{children}</div> : null}
      <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">{actions}</div>
    </div>
  );
}

const PRIMARY = 'press inline-flex h-12 items-center rounded-[10px] bg-action px-6 text-[15px] font-medium text-white shadow-button hover:bg-action-hover';
const SECONDARY = 'press inline-flex h-12 items-center rounded-[10px] border border-field px-6 text-[15px] font-medium text-ink hover:border-ink/25';
const LINK = 'text-[14px] font-medium text-brand-ink underline-offset-4 hover:underline';

export const buttonStyles = { primary: PRIMARY, secondary: SECONDARY, link: LINK };

export function OpOutcome({ outcome, amount, settledTitle, onDone, rows }: { outcome: Outcome; amount: bigint; settledTitle: string; onDone: () => void; rows?: ReactNode }) {
  const big = <p className="tabular text-[40px] font-semibold leading-none tracking-[-0.045em] text-ink sm:text-[48px]">{formatUsd(amount)}</p>;
  if (outcome.state === 'settled') {
    const url = outcome.op.explorerUrls[0];
    return (
      <ResultView
        tone="success"
        eyebrow={t.flow.settled}
        title={settledTitle}
        amount={big}
        actions={
          <>
            <button type="button" onClick={onDone} className={PRIMARY}>
              {t.flow.done}
            </button>
            <Link href={routes.receipt(outcome.op.opId)} className={LINK}>
              {t.flow.receipt}
            </Link>
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className={LINK}>
                {t.flow.explorer}
              </a>
            ) : null}
          </>
        }
      >
        {rows}
      </ResultView>
    );
  }
  const failed = outcome.state === 'failed';
  return (
    <ResultView
      tone={failed ? 'danger' : 'warning'}
      eyebrow={failed ? t.flow.failedEyebrow : t.flow.unconfirmedEyebrow}
      title={failed ? t.flow.failedTitle : t.flow.unconfirmedTitle}
      amount={big}
      actions={
        <>
          <button type="button" onClick={onDone} className={SECONDARY}>
            {t.flow.done}
          </button>
          <Link href={routes.activity(outcome.state === 'failed' ? outcome.op.opId : outcome.opId)} className={LINK}>
            {t.flow.viewActivity}
          </Link>
        </>
      }
    >
      <p className="max-w-[30rem] text-[15px] leading-6 text-ink-2">{failed ? t.flow.failedBody : t.flow.unconfirmedBody}</p>
    </ResultView>
  );
}

export function ViewOnlyNotice() {
  return (
    <Notice tone="info" title={t.accountPage.viewOnlyTitle}>
      {t.flow.viewOnly}
    </Notice>
  );
}

export function checkAmount(input: string, available: bigint, maxOp: bigint | null): { units: bigint | null; error: string | null } {
  if (input.trim() === '') return { units: null, error: null };
  const units = parseAmount(input);
  if (units === null || units <= 0n) return { units: null, error: t.flow.amountInvalid };
  if (maxOp !== null && units > maxOp) return { units: null, error: t.flow.amountTooLarge(formatUsd(maxOp)) };
  if (units > available) return { units: null, error: t.flow.amountTooMuch };
  return { units, error: null };
}

export function AmountField({
  value,
  onChange,
  error,
  availableLabel,
  currency = 'USD',
  label = t.flow.amount,
  autoFocus,
  onMax,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  availableLabel?: string;
  currency?: 'USD' | 'GHS';
  label?: string;
  autoFocus?: boolean;
  onMax?: () => void;
}) {
  return (
    <Field
      label={label}
      error={error}
      trailing={
        availableLabel ? (
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <span className="tabular">{availableLabel}</span>
            {onMax ? (
              <button type="button" onClick={onMax} className="rounded-[4px] px-1 font-semibold text-brand-ink hover:underline">
                {t.flow.max}
              </button>
            ) : null}
          </span>
        ) : null
      }
    >
      {({ inputId, describedBy, invalid }) => (
        <div
          className={`flex h-[76px] items-center gap-3 rounded-[16px] border bg-surface px-4 transition-[border-color,box-shadow] duration-150 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/20 ${invalid ? 'border-danger' : 'border-field hover:border-ink/25'}`}
        >
          <span className="flex shrink-0 items-center gap-2 text-[15px] font-semibold text-ink-2">{currency === 'GHS' ? CEDI : (<><TokenLogo token="USDC" size={24} />USDC</>)}</span>
          <input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={value}
            autoFocus={autoFocus}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="tabular min-w-0 flex-1 bg-transparent text-right text-[34px] font-semibold tracking-[-0.03em] text-ink outline-none placeholder:text-line sm:text-[40px]"
          />
        </div>
      )}
    </Field>
  );
}

export function FooterButton({ children, onClick, disabled, loading, type = 'button', form, variant = 'primary' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; type?: 'button' | 'submit'; form?: string; variant?: 'primary' | 'secondary' }) {
  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`press inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[10px] px-6 text-[15px] font-medium disabled:cursor-not-allowed sm:flex-none sm:min-w-[9rem] ${
        variant === 'primary' ? 'bg-action text-white shadow-button hover:bg-action-hover disabled:bg-action/40 disabled:shadow-none' : 'border border-field bg-surface text-ink hover:border-ink/25 disabled:text-subtle'
      }`}
    >
      {loading ? <span className="h-4 w-4 animate-spin-slow rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
