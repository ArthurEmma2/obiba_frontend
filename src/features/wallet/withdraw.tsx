'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Field, Input } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { routes, useQueryId } from '@/lib/routes';
import { messageFor } from '@/lib/errors';
import { ApiError } from '@/lib/graphql/client';
import type { QuoteView, WithdrawalOption, WithdrawalView } from '@/lib/graphql/types';
import { formatUsd, unitsToInput } from '@/lib/money';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { AmountField, checkAmount, FooterButton, OpOutcome, Progress, usePayment, ViewOnlyNotice } from './flow';
import { FlowFrame, FlowHeading } from './flow-frame';
import { AssetPair, NetworkLogo, NetworkRow, networkOf } from './providers';
import { PageHeader } from './page-header';
import { DestinationList, Ledger, Skeleton, Status, Tracker } from './ui';
import { realBalance, useWallet } from './wallet-data';

function useOptions(): WithdrawalOption[] | null {
  const { api } = useServices();
  const [options, setOptions] = useState<WithdrawalOption[] | null>(null);
  useEffect(() => {
    let alive = true;
    api.request('WithdrawalOptions').then(
      (r) => alive && setOptions(r.withdrawalOptions),
      () => alive && setOptions([]),
    );
    return () => {
      alive = false;
    };
  }, [api]);
  return options;
}

export function WithdrawHub() {
  const options = useOptions();
  const { state } = useWallet();
  const viewOnly = state.status === 'ready' && state.wallet.me.viewOnly;
  return (
    <div className="max-w-[760px]">
      <PageHeader title={t.withdraw.title} lead={t.withdraw.hubLead} />
      {viewOnly ? (
        <div className="mb-8">
          <ViewOnlyNotice />
        </div>
      ) : null}
      {!options ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <DestinationList
            label={t.withdraw.hubLabel}
            items={[
              { href: '/withdraw/chain', logos: <NetworkRow networks={[...new Set(options.map((o) => networkOf(`${o.key} ${o.label} ${o.network}`)).filter((n): n is string => !!n))].slice(0, 4)} size={20} />, title: t.withdraw.chainTitle, body: t.withdraw.chainBody, meta: t.withdraw.chainMeta, disabled: viewOnly || options.length === 0, disabledNote: options.length === 0 ? t.withdraw.chainNone : undefined },
              { href: '/send/near', logos: <NetworkLogo network="near" size={22} />, title: t.withdraw.nearTitle, body: t.withdraw.nearBody, meta: t.withdraw.nearMeta, disabled: viewOnly },
            ]}
          />
          <p className="mt-8 text-[14px] text-muted">
            {t.withdraw.cashHint}{' '}
            <Link href="/cash-out" className="font-medium text-brand-ink underline-offset-4 hover:underline">
              {t.wallet.nav.cashOut}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function useSecondsLeft(deadline: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!deadline) return null;
  return Math.max(0, Math.floor((Date.parse(deadline) - now) / 1000));
}

export function WithdrawChain() {
  const router = useRouter();
  const { api } = useServices();
  const { state } = useWallet();
  const options = useOptions();
  const pay = usePayment();
  const [step, setStep] = useState(0);
  const [dest, setDest] = useState<WithdrawalOption | null>(null);
  const [address, setAddress] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: string | null; message: string } | null>(null);
  const withdrawal = useRef<WithdrawalView | null>(null);
  const left = useSecondsLeft(quote?.deadline ?? null);

  if (state.status !== 'ready' || !options) {
    return (
      <FlowFrame title={t.withdraw.flowTitle} closeHref="/withdraw">
        <Skeleton rows={3} />
      </FlowFrame>
    );
  }
  const { wallet, limit } = state;
  if (wallet.me.viewOnly) {
    return (
      <FlowFrame title={t.withdraw.flowTitle} closeHref="/withdraw">
        <ViewOnlyNotice />
      </FlowFrame>
    );
  }
  if (options.length === 0) {
    return (
      <FlowFrame title={t.withdraw.flowTitle} closeHref="/withdraw">
        <Notice tone="info" title={t.withdraw.chainTitle}>
          {t.withdraw.chainNone}
        </Notice>
      </FlowFrame>
    );
  }

  const usdc = realBalance(wallet);
  const available = BigInt(usdc.available);
  const maxOp = limit ? BigInt(limit.maxOpAmount) : null;
  const amount = checkAmount(amountInput, available, maxOp);
  const { flow } = pay;
  const units = amount.units;

  async function getQuote() {
    if (!dest || units === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      setQuote((await api.request('QuoteWithdrawal', { input: { amount: unitsToInput(units), destination: dest.key, recipientAddress: address.trim() } })).quoteWithdrawal);
      setStep(2);
    } catch (err) {
      const field = err instanceof ApiError ? err.field : null;
      setError({ field, message: messageFor(err) });
      if (field === 'recipientAddress') setStep(0);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!dest || units === null) return;
    const outcome = await pay.run(
      units,
      async () => {
        const r = (await api.request('PrepareWithdrawal', { input: { amount: unitsToInput(units), destination: dest.key, recipientAddress: address.trim() } })).prepareWithdrawal;
        withdrawal.current = r.withdrawal;
        return r.op;
      },
      (prepared) => ({ kind: 'Transfer', receiver: prepared.receiver, amount: units.toString() }),
    );
    if (outcome?.state === 'settled' && withdrawal.current) router.push(routes.withdrawal(withdrawal.current.withdrawalId));
  }

  if (flow.at === 'running' && units !== null) {
    return (
      <FlowFrame title={t.withdraw.flowTitle} closeHref="/home">
        <Progress phase={flow.phase} cosign={flow.cosign} title={t.withdraw.sendingTitle(formatUsd(units))} />
        {pay.stepUpPanel ? <div className="mt-8">{pay.stepUpPanel}</div> : null}
      </FlowFrame>
    );
  }
  if (flow.at === 'done' && units !== null && flow.outcome.state !== 'settled') {
    return (
      <FlowFrame title={t.withdraw.flowTitle} closeHref="/home">
        <OpOutcome outcome={flow.outcome} amount={units} settledTitle="" onDone={() => router.push('/home')} />
      </FlowFrame>
    );
  }

  const expired = left === 0;
  const back = step > 0 ? () => (pay.reset(), setStep((s) => s - 1)) : undefined;
  const footer =
    step === 0 ? (
      <FooterButton disabled={!dest || address.trim().length < 10} onClick={() => setStep(1)}>
        {t.flow.continue}
      </FooterButton>
    ) : step === 1 ? (
      <>
        <FooterButton variant="secondary" onClick={() => setStep(0)}>
          {t.ui.back}
        </FooterButton>
        <FooterButton disabled={units === null} loading={busy} onClick={() => void getQuote()}>
          {t.withdraw.getQuote}
        </FooterButton>
      </>
    ) : (
      <>
        <FooterButton variant="secondary" onClick={() => (pay.reset(), setStep(1))}>
          {t.ui.back}
        </FooterButton>
        {expired ? (
          <FooterButton loading={busy} onClick={() => void getQuote()}>
            {t.withdraw.refresh}
          </FooterButton>
        ) : (
          <FooterButton disabled={pay.stepUpActive || units === null} onClick={() => void confirm()}>
            {flow.at === 'error' ? t.ui.retry : t.withdraw.confirm(units !== null ? formatUsd(units) : '')}
          </FooterButton>
        )}
      </>
    );

  return (
    <FlowFrame title={t.withdraw.flowTitle} steps={t.withdraw.steps as unknown as string[]} step={step} closeHref="/withdraw" onBack={back} footer={footer}>
      {step === 0 ? (
        <>
          <FlowHeading title={t.withdraw.destTitle} lead={t.withdraw.destLead} />
          <div role="radiogroup" aria-label={t.withdraw.destination} className="flex flex-col gap-2">
            {options.map((o) => {
              const on = dest?.key === o.key;
              return (
                <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => setDest(o)} className={`press flex items-center gap-4 rounded-[10px] border px-4 py-3.5 text-left ${on ? 'border-brand bg-brand-faint' : 'border-field hover:border-ink/25'}`}>
                  <AssetPair label={`${o.key} ${o.label}`} size={30} />
                  <span className="flex-1">
                    <span className="block text-[15px] font-semibold text-ink">{o.label}</span>
                    <span className="block text-[13px] text-muted">{o.network}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-8">
            <Field label={t.withdraw.address} hint={t.withdraw.addressHint} error={error?.field === 'recipientAddress' ? error.message : null}>
              {({ inputId, describedBy, invalid }) => <Input id={inputId} value={address} onChange={(e) => setAddress(e.target.value.trim())} aria-describedby={describedBy} invalid={invalid} className="font-mono text-[14px]" autoComplete="off" autoCapitalize="none" spellCheck={false} />}
            </Field>
          </div>
        </>
      ) : step === 1 ? (
        <>
          <FlowHeading eyebrow={dest?.label} title={t.withdraw.amountTitle} />
          <AmountField value={amountInput} onChange={setAmountInput} error={amount.error ?? (error?.field === 'amount' ? error.message : null)} availableLabel={t.flow.available(formatUsd(usdc.available))} onMax={() => setAmountInput(unitsToInput(maxOp !== null && maxOp < available ? maxOp : available))} autoFocus />
          {error && error.field !== 'amount' && error.field !== 'recipientAddress' ? (
            <div className="mt-5">
              <Notice tone="danger">{error.message}</Notice>
            </div>
          ) : null}
        </>
      ) : quote && dest && units !== null ? (
        <>
          <FlowHeading eyebrow={dest.label} title={t.withdraw.quoteTitle} lead={t.withdraw.quoteLead} />
          <Ledger
            rows={[
              { label: t.withdraw.youSend, value: formatUsd(units), strong: true },
              ...(quote.fees.appFeeBps ? [{ label: t.withdraw.appFee, value: `${(quote.fees.appFeeBps / 100).toFixed(2)}%` }] : []),
              ...(quote.fees.providerSpreadUsd ? [{ label: t.withdraw.spread, value: `$${quote.fees.providerSpreadUsd}` }] : []),
              { label: t.withdraw.to, value: address, mono: true },
              { label: t.withdraw.eta, value: quote.timeEstimateSeconds ? `~${Math.max(1, Math.round(quote.timeEstimateSeconds / 60))} min` : t.crypto.etaUnknown },
              { label: t.withdraw.debit, value: formatUsd(quote.totalDebit), total: true },
              ...(quote.fees.amountOutUsd ? [{ label: t.withdraw.theyReceive, value: `$${quote.fees.amountOutUsd}`, strong: true }] : []),
            ]}
          />
          <p className={`tabular mt-4 text-[13.5px] ${expired ? 'text-danger' : 'text-muted'}`}>{expired ? t.withdraw.quoteExpired : left !== null ? t.withdraw.expiresIn(left) : ''}</p>
          {pay.requiresCosign(units) ? <p className="mt-4 text-[14px] leading-5 text-ink-2">{t.withdraw.cosign}</p> : null}
          {flow.at === 'error' ? (
            <div className="mt-5">
              <Notice tone="danger" live="assertive">
                {flow.message}
              </Notice>
            </div>
          ) : null}
          {pay.stepUpPanel ? <div className="mt-6">{pay.stepUpPanel}</div> : null}
        </>
      ) : null}
    </FlowFrame>
  );
}

const W_FLOW = ['PREPARED', 'SUBMITTED', 'SENT', 'PROCESSING', 'VERIFYING', 'COMPLETED'];
const W_DONE = new Set(['COMPLETED', 'REFUNDED', 'FAILED']);

export function WithdrawalTracker({ id }: { id: string }) {
  const { api } = useServices();
  const [w, setW] = useState<WithdrawalView | null | 'missing'>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () =>
      api.request('Withdrawal', { id }).then(
        (r) => {
          if (!alive) return;
          setW(r.withdrawal ?? 'missing');
          if (r.withdrawal && !W_DONE.has(r.withdrawal.status)) timer = setTimeout(load, 4000);
        },
        () => {
          if (alive) timer = setTimeout(load, 8000);
        },
      );
    void load();
    const off = api.subscribe('TransactionUpdated', () => void load());
    return () => {
      alive = false;
      off();
      if (timer) clearTimeout(timer);
    };
  }, [api, id]);

  if (w === null) {
    return (
      <FlowFrame title={t.withdraw.title} closeHref="/withdraw">
        <Skeleton rows={4} />
      </FlowFrame>
    );
  }
  if (w === 'missing') {
    return (
      <FlowFrame title={t.withdraw.title} closeHref="/withdraw">
        <Notice tone="danger">{t.withdraw.notFound}</Notice>
      </FlowFrame>
    );
  }

  const at = W_FLOW.indexOf(w.status);
  const problem = t.withdraw.problems[w.status];
  const steps = W_FLOW.map((k) => ({
    key: k,
    label: t.withdraw.states[k]!,
    detail: k === 'SENT' && w.nearTxHash ? <span className="break-all font-mono text-[12.5px]">{w.nearTxHash}</span> : k === 'COMPLETED' && w.destinationTxHashes[0] ? <span className="break-all font-mono text-[12.5px]">{w.destinationTxHashes[0]}</span> : undefined,
  }));

  return (
    <FlowFrame title={t.withdraw.title} closeHref="/home">
      <FlowHeading eyebrow={w.destination} title={w.status === 'COMPLETED' ? t.withdraw.delivered : t.withdraw.trackTitle} />
      <p className="tabular -mt-3 mb-8 text-[44px] font-semibold leading-none tracking-[-0.045em] text-ink">{formatUsd(w.amountIn)}</p>
      <Tracker steps={steps} at={Math.max(0, at)} failed={!!problem} failedLabel={problem} />
      <div className="mt-6">
        <Status status={w.status} />
      </div>
      <Ledger
        className="mt-8"
        rows={[
          { label: t.withdraw.to, value: w.recipient, mono: true },
          { label: t.withdraw.destination, value: w.destination },
          ...(w.fees.amountOutUsd ? [{ label: t.withdraw.theyReceive, value: `$${w.fees.amountOutUsd}` }] : []),
          ...(w.nearTxHash ? [{ label: t.withdraw.nearTx, value: w.nearTxHash, mono: true }] : []),
          ...w.destinationTxHashes.map((h, i) => ({ label: `${t.withdraw.destTx}${w.destinationTxHashes.length > 1 ? ` ${i + 1}` : ''}`, value: h, mono: true })),
        ]}
      />
    </FlowFrame>
  );
}

export function WithdrawalTrackerRoute() {
  return <WithdrawalTracker id={useQueryId()} />;
}
