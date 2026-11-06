'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Field, Input } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { routes } from '@/lib/routes';
import { messageFor } from '@/lib/errors';
import { ApiError } from '@/lib/graphql/client';
import type { Balance, RemittanceCorridor, RemittanceMethod, SandboxQuote, SandboxReceipt } from '@/lib/graphql/types';
import { currencySymbol, formatMoney, formatRate, formatUsd, splitPesewas } from '@/lib/money';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { buttonStyles, FooterButton, ResultView, ViewOnlyNotice } from './flow';
import { FlowFrame, FlowHeading } from './flow-frame';
import { compact, grouped, ProviderPicker, rateSourceName, rateTime, TargetInput, useReceiptPoll } from './local';
import { CheckIcon } from './nav-icons';
import { Flag, ProviderLogos, providerInfo, providerLabel } from './providers';
import { Ledger, Skeleton, Tracker } from './ui';
import { useWallet } from './wallet-data';

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,79}$/u;

const COUNTRY_RULES: Record<string, { dial: string; national: RegExp; placeholder: string; bank: RegExp }> = {
  GH: { dial: '233', national: /^[1-9]\d{8}$/, placeholder: '24 123 4567', bank: /^\d{10,16}$/ },
  KE: { dial: '254', national: /^[17]\d{8}$/, placeholder: '712 345 678', bank: /^\d{10,14}$/ },
  NG: { dial: '234', national: /^[789]\d{9}$/, placeholder: '803 123 4567', bank: /^\d{10}$/ },
  ZA: { dial: '27', national: /^[6-8]\d{8}$/, placeholder: '82 123 4567', bank: /^\d{9,11}$/ },
};

function nationalOf(v: string): string {
  return compact(v).replace(/\D/g, '').replace(/^0/, '');
}

function useCorridors(): { corridors: RemittanceCorridor[] | null; balance: Balance | null; error: unknown } {
  const { api } = useServices();
  const [state, setState] = useState<{ corridors: RemittanceCorridor[] | null; balance: Balance | null; error: unknown }>({ corridors: null, balance: null, error: null });
  useEffect(() => {
    let alive = true;
    api.request('RemittanceCorridors').then(
      (r) => alive && setState({ corridors: r.remittanceCorridors, balance: r.demoBalance, error: null }),
      (error: unknown) => alive && setState({ corridors: [], balance: null, error }),
    );
    return () => {
      alive = false;
    };
  }, [api]);
  return state;
}

function unitsFromUsd(input: string): bigint | null {
  const m = /^(\d{1,7})(?:\.(\d{0,2}))?$/.exec(input.trim());
  if (!m) return null;
  return BigInt(m[1]!) * 1_000_000n + BigInt((m[2] ?? '').padEnd(2, '0')) * 10_000n;
}

function minorFrom(input: string): bigint | null {
  const m = /^(\d{1,9})(?:\.(\d{0,2}))?$/.exec(input.trim());
  if (!m) return null;
  return BigInt(m[1]!) * 100n + BigInt((m[2] ?? '').padEnd(2, '0'));
}

function rateScaled(rate: string): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(rate)!;
  return BigInt(m[1]!) * 1_000_000n + BigInt((m[2] ?? '').slice(0, 6).padEnd(6, '0'));
}

function minorText(pesewas: bigint): string {
  const { whole, fraction } = splitPesewas(pesewas);
  return `${whole.replace(/,/g, '')}.${fraction}`;
}

function usdText(units: bigint): string {
  const cents = units / 10_000n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

function MoneyInput({ id, label, symbol, value, onChange, flag, code, hint }: { id: string; label: string; symbol: string; value: string; onChange: (v: string) => void; flag?: string; code: string; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-medium text-ink">
        {label}
      </label>
      <div className="flex h-[72px] items-center gap-3 rounded-[12px] border border-field bg-surface px-4 transition-[border-color,box-shadow] duration-150 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/20 hover:border-ink/25">
        <span className="text-[22px] font-semibold text-muted">{symbol}</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
          className="tabular min-w-0 flex-1 bg-transparent text-[30px] font-semibold tracking-[-0.03em] text-ink outline-none placeholder:text-line"
        />
        <span className="flex shrink-0 items-center gap-2 text-[14px] font-semibold text-ink-2">
          {flag ? <Flag country={flag} size={22} /> : null}
          {code}
        </span>
      </div>
      {hint ? <p className="tabular mt-1.5 text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function RemitFlow() {
  const router = useRouter();
  const { api } = useServices();
  const { state, refresh } = useWallet();
  const { corridors, balance, error: loadError } = useCorridors();
  const [step, setStep] = useState(0);
  const [corridor, setCorridor] = useState<RemittanceCorridor | null>(null);
  const [method, setMethod] = useState<RemittanceMethod | null>(null);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [target, setTarget] = useState('');
  const [sendInput, setSendInput] = useState('');
  const [receiveInput, setReceiveInput] = useState('');
  const [touched, setTouched] = useState(false);
  const [quote, setQuote] = useState<SandboxQuote | null>(null);
  const [submitted, setSubmitted] = useState<SandboxReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false);
  const receipt = useReceiptPoll(submitted);

  useEffect(() => {
    if (receipt && receipt.status !== 'PENDING') void refresh();
  }, [receipt, refresh]);

  if (state.status === 'ready' && state.wallet.me.viewOnly) {
    return (
      <FlowFrame title={t.remit.title} closeHref="/send">
        <ViewOnlyNotice />
      </FlowFrame>
    );
  }
  if (!corridors) {
    return (
      <FlowFrame title={t.remit.title} closeHref="/send">
        <Skeleton rows={3} />
      </FlowFrame>
    );
  }
  if (corridors.length === 0) {
    return (
      <FlowFrame title={t.remit.title} closeHref="/send">
        <Notice tone="info">{loadError ? messageFor(loadError) : t.remit.noCorridors}</Notice>
      </FlowFrame>
    );
  }

  const available = BigInt(balance?.available ?? '0');
  const rate = corridor?.rate ? rateScaled(corridor.rate) : 0n;
  const rules = COUNTRY_RULES[corridor?.country ?? 'GH'] ?? COUNTRY_RULES.GH!;
  const targetValue = method?.target === 'phone' ? `+${rules.dial}${nationalOf(target)}` : compact(target);
  const targetOk = method ? (method.target === 'phone' ? rules.national.test(nationalOf(target)) : rules.bank.test(compact(target))) : false;
  const nameOk = NAME_RE.test(name.trim().replace(/\s+/g, ' '));
  const receivePesewas = minorFrom(receiveInput);
  const sendUnits = unitsFromUsd(sendInput);
  const maxMinor = corridor ? (minorFrom(corridor.maxAmount) ?? 0n) : 0n;
  const amountOk = receivePesewas !== null && receivePesewas > 0n && receivePesewas <= maxMinor;
  const overBalance = sendUnits !== null && sendUnits > available;

  function onSend(v: string) {
    setSendInput(v);
    const u = unitsFromUsd(v);
    setReceiveInput(u !== null && corridor ? minorText((u * rate * 100n) / (1_000_000n * 1_000_000n)) : '');
  }

  function onReceive(v: string) {
    setReceiveInput(v);
    const p = minorFrom(v);
    setSendInput(p !== null && corridor && rate > 0n ? usdText((p * 1_000_000n * 1_000_000n) / (rate * 100n)) : '');
  }

  const input = method && corridor && receivePesewas !== null ? { kind: method.kind, provider, target: targetValue, country: corridor.country, amountLocal: minorText(receivePesewas), recipientName: name.trim().replace(/\s+/g, ' ') } : null;

  async function review() {
    setTouched(true);
    if (!input || !amountOk || overBalance || busy) return;
    setBusy(true);
    setError(null);
    try {
      setQuote((await api.request('SandboxQuote', { input })).sandboxQuote);
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError && err.field === 'target' ? t.local.invalid.target! : messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!input || !quote || sent.current || busy) return;
    sent.current = true;
    setBusy(true);
    setError(null);
    try {
      setSubmitted((await api.request('SandboxSubmit', { input })).sandboxSubmit);
      setStep(4);
    } catch (err) {
      sent.current = false;
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  const recipientLine = method ? `${method.type === 'MOBILE_MONEY' ? providerLabel(provider) : providerInfo(provider).name} ${method.target === 'phone' ? `+${rules.dial} ${grouped(nationalOf(target), 3)}` : grouped(targetValue, 4)}` : '';
  const short = quote ? BigInt(quote.total) > available : false;

  let footer = null;
  if (step === 0) footer = <FooterButton disabled={!corridor || !method} onClick={() => setStep(1)}>{t.flow.continue}</FooterButton>;
  if (step === 1)
    footer = (
      <>
        <FooterButton variant="secondary" onClick={() => setStep(0)}>
          {t.ui.back}
        </FooterButton>
        <FooterButton disabled={touched && (!nameOk || !provider || !targetOk)} onClick={() => (setTouched(true), nameOk && provider && targetOk && (setTouched(false), setStep(2)))}>
          {t.flow.continue}
        </FooterButton>
      </>
    );
  if (step === 2)
    footer = (
      <>
        <FooterButton variant="secondary" onClick={() => setStep(1)}>
          {t.ui.back}
        </FooterButton>
        <FooterButton disabled={!amountOk || overBalance || !corridor?.rate} loading={busy} onClick={() => void review()}>
          {t.flow.continue}
        </FooterButton>
      </>
    );
  if (step === 3 && quote)
    footer = (
      <>
        <FooterButton variant="secondary" onClick={() => setStep(2)}>
          {t.ui.back}
        </FooterButton>
        <FooterButton disabled={short} loading={busy} onClick={() => void submit()}>
          {t.remit.confirm(formatUsd(quote.total))}
        </FooterButton>
      </>
    );

  const displayName = name.trim().replace(/\s+/g, ' ');

  return (
    <FlowFrame title={t.remit.title} steps={step < 4 ? (t.remit.steps as unknown as string[]) : undefined} step={Math.min(step, 3)} closeHref="/send" onBack={step > 0 && step < 4 ? () => setStep((s) => s - 1) : undefined} footer={footer}>
      {step === 0 ? (
        <>
          <FlowHeading title={t.remit.whereTitle} />
          <p className="mb-2.5 text-[14px] font-medium text-ink">{t.remit.country}</p>
          <div role="radiogroup" aria-label={t.remit.country} className="flex flex-col gap-2">
            {corridors.map((c) => {
              const on = corridor?.country === c.country;
              return (
                <button
                  key={c.country}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setCorridor(c);
                    setMethod(null);
                    setProvider('');
                    setTarget('');
                    setSendInput('');
                    setReceiveInput('');
                  }}
                  className={`press flex h-16 items-center gap-4 rounded-[10px] border px-4 text-left transition-colors duration-200 ${on ? 'border-brand bg-brand-faint' : 'border-field hover:border-ink/25'}`}
                >
                  <Flag country={c.country} size={32} />
                  <span className="flex-1 text-[16px] font-semibold text-ink">{c.countryName}</span>
                  <span className="text-[14px] font-medium text-muted">{c.currency}</span>
                  {on ? <CheckIcon className="h-[18px] w-[18px] text-brand" strokeWidth={2.4} /> : null}
                </button>
              );
            })}
          </div>
          {corridor ? (
            <div className="mt-8 animate-step">
              <p className="mb-2.5 text-[14px] font-medium text-ink">{t.remit.method}</p>
              <div role="radiogroup" aria-label={t.remit.method} className="flex flex-col gap-2">
                {corridor.methods.map((m) => {
                  const on = method?.kind === m.kind;
                  return (
                    <button
                      key={m.kind}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setMethod(m);
                        setProvider('');
                        setTarget('');
                      }}
                      className={`press flex min-h-16 items-center gap-4 rounded-[10px] border px-4 py-3 text-left transition-colors duration-200 ${on ? 'border-brand bg-brand-faint' : 'border-field hover:border-ink/25'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15.5px] font-semibold text-ink">{t.remit.methods[m.type] ?? m.label}</span>
                        <span className="hidden text-[13px] text-muted sm:block">{t.remit.methodBody[m.type]}</span>
                      </span>
                      <ProviderLogos ids={m.providers} size={28} />
                      {on ? <CheckIcon className="h-[18px] w-[18px] text-brand" strokeWidth={2.4} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : step === 1 && method && corridor ? (
        <>
          <FlowHeading title={t.remit.whoTitle} />
          <div className="flex flex-col gap-7">
            <Field label={t.remit.name} hint={t.remit.nameHint} error={touched && !nameOk ? t.remit.nameInvalid : null}>
              {({ inputId, describedBy, invalid }) => <Input id={inputId} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoCapitalize="words" maxLength={80} aria-describedby={describedBy} invalid={invalid} autoFocus />}
            </Field>
            <div>
              <p className="mb-2.5 text-[14px] font-medium text-ink">{method.type === 'BANK' ? t.local.bank : t.local.network}</p>
              <ProviderPicker providers={method.providers} value={provider} onChange={setProvider} label={method.type === 'BANK' ? t.local.bank : t.local.network} wallet={method.type === 'MOBILE_MONEY'} />
              {touched && !provider ? <p className="mt-2 text-[13px] text-danger">{t.local.invalid.provider}</p> : null}
            </div>
            <TargetInput
              target={method.target}
              value={target}
              onChange={setTarget}
              error={touched && !targetOk ? t.local.invalid.target! : null}
              dialCode={rules.dial}
              placeholder={rules.placeholder}
              phoneHint={t.remit.phoneHint(corridor.countryName)}
              accountHint={t.remit.accountHint(corridor.countryName)}
            />
          </div>
        </>
      ) : step === 2 && method && corridor ? (
        <>
          <FlowHeading title={t.remit.amountTitle} />
          <div className="flex flex-col gap-3">
            <MoneyInput id="remit-send" label={t.remit.youSend} symbol="$" code="USD" value={sendInput} onChange={onSend} hint={t.remit.available(formatUsd(available))} />
            <p className="tabular py-1 text-center text-[13.5px] font-medium text-ink-2">{corridor.rate ? t.remit.rateLine(formatRate(corridor.rate), corridor.currency) : t.remit.rateUnavailable}</p>
            <MoneyInput id="remit-receive" label={t.remit.theyReceive} symbol={currencySymbol(corridor.currency)} code={corridor.currency} flag={corridor.country} value={receiveInput} onChange={onReceive} />
          </div>
          {corridor.rate ? <p className="mt-3 text-[13px] text-muted">{`${t.rates.source(rateSourceName(corridor.rateSource), rateTime(corridor.rateAsOf))}. ${t.remit.rateNote}`}</p> : null}
          {overBalance ? <p className="mt-3 text-[14px] text-danger">{t.remit.tooMuch}</p> : null}
          {touched && !amountOk && !overBalance ? <p className="mt-3 text-[14px] text-danger">{t.remit.amountRange(formatMoney('0.01', corridor.currency), formatMoney(corridor.maxAmount, corridor.currency))}</p> : null}
          {error ? (
            <div className="mt-5">
              <Notice tone="danger">{error}</Notice>
            </div>
          ) : null}
        </>
      ) : step === 3 && quote && corridor && method ? (
        <>
          <p className="text-[14px] font-medium text-muted">{t.remit.reviewTitle}</p>
          <div className="mt-3 flex items-end justify-between gap-4 border-b border-hairline pb-6">
            <div>
              <p className="text-[13px] text-muted">{t.remit.totalSend}</p>
              <p className="tabular mt-1 text-[34px] font-semibold leading-none tracking-[-0.04em] text-ink">{formatUsd(quote.total)}</p>
            </div>
            <div className="text-right">
              <p className="text-[13px] text-muted">{t.remit.receives}</p>
              <p className="tabular mt-1 flex items-center justify-end gap-2 text-[34px] font-semibold leading-none tracking-[-0.04em] text-ink">{formatMoney(quote.amountLocal, quote.localCurrency)}</p>
            </div>
          </div>
          <Ledger
            className="mt-2"
            rows={[
              { label: t.remit.recipient, value: displayName },
              { label: t.remit.payout, value: recipientLine },
              { label: t.remit.rate, value: t.remit.rateLine(formatRate(quote.simulatedRate), corridor.currency), hint: t.rates.source(rateSourceName(quote.rateSource), rateTime(quote.rateAsOf)) },
              { label: t.remit.fee, value: quote.feeLocal === '0.00' ? t.local.feeNone : `${formatMoney(quote.feeLocal, quote.localCurrency)} (${formatUsd(quote.fee)})` },
              { label: t.remit.from, value: t.remit.fromValue },
              { label: t.remit.delivery, value: t.remit.deliveryValue },
              { label: t.remit.totalSend, value: formatUsd(quote.total), total: true },
            ]}
          />
          {short ? (
            <div className="mt-5">
              <Notice tone="warning">{t.remit.tooMuch}</Notice>
            </div>
          ) : null}
          {error ? (
            <div className="mt-5">
              <Notice tone="danger" live="assertive">
                {error}
              </Notice>
            </div>
          ) : null}
        </>
      ) : step === 4 && receipt && quote ? (
        receipt.status === 'PENDING' ? (
          <div className="animate-step" role="status">
            <p className="mb-8 text-[26px] font-semibold tracking-[-0.03em] text-ink">{t.remit.processing(displayName)}</p>
            <Tracker steps={[{ key: 's', label: t.remit.stepSent }, { key: 'p', label: t.remit.stepPayout(providerInfo(receipt.provider).name) }, { key: 'd', label: t.remit.stepDone }]} at={1} />
          </div>
        ) : receipt.status === 'SUCCEEDED' ? (
          <ResultView
            tone="success"
            eyebrow={t.local.succeeded}
            title={t.remit.sentTitle(formatMoney(quote.amountLocal, quote.localCurrency), displayName)}
            amount={<p className="tabular text-[40px] font-semibold leading-none tracking-[-0.045em] text-ink">{formatUsd(quote.total)}</p>}
            actions={
              <>
                <button type="button" onClick={() => router.push('/home')} className={buttonStyles.primary}>
                  {t.flow.done}
                </button>
                <Link href={routes.receipt(receipt.id)} className={buttonStyles.link}>
                  {t.flow.receipt}
                </Link>
              </>
            }
          >
            <Ledger rows={[{ label: t.remit.recipient, value: displayName }, { label: t.remit.payout, value: recipientLine }, { label: t.remit.receives, value: formatMoney(quote.amountLocal, quote.localCurrency) }, { label: t.local.reference, value: receipt.id.slice(0, 13).toUpperCase(), mono: true }]} />
          </ResultView>
        ) : (
          <ResultView
            tone={receipt.status === 'FAILED' ? 'danger' : 'warning'}
            eyebrow={receipt.status === 'FAILED' ? t.local.failed : t.local.review_}
            title={receipt.status === 'FAILED' ? t.remit.failedTitle : t.remit.processing(displayName)}
            amount={<p className="tabular text-[40px] font-semibold leading-none tracking-[-0.045em] text-ink">{formatUsd(quote.total)}</p>}
            actions={
              <>
                <button type="button" onClick={() => router.push('/home')} className={buttonStyles.secondary}>
                  {t.flow.done}
                </button>
                <Link href={routes.activity(receipt.id)} className={buttonStyles.link}>
                  {t.flow.viewActivity}
                </Link>
              </>
            }
          >
            <p className="max-w-[30rem] text-[15px] leading-6 text-ink-2">{receipt.status === 'FAILED' ? t.remit.failedBody : t.remit.reviewHeld}</p>
          </ResultView>
        )
      ) : null}
    </FlowFrame>
  );
}
