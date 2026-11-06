'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Field, Input, PrefixedInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { routes } from '@/lib/routes';
import { messageFor } from '@/lib/errors';
import { ApiError } from '@/lib/graphql/client';
import type { Balance, SandboxCatalog, SandboxQuote, SandboxReceipt, SandboxRequestInput } from '@/lib/graphql/types';
import { CEDI, formatGhs, formatLocal, formatRate, formatUsd } from '@/lib/money';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { buttonStyles, FooterButton, ResultView, ViewOnlyNotice } from './flow';
import { FlowFrame, FlowHeading } from './flow-frame';
import { CheckIcon, CopyIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { providerInfo, providerLabel, ProviderLogo, ProviderLogos } from './providers';
import { DestinationList, Ledger, Skeleton, Tracker, useCopy } from './ui';
import { useWallet } from './wallet-data';

export type LocalKind = 'MOMO_FUND' | 'BANK_FUND' | 'MOMO_PAYOUT' | 'BANK_PAYOUT' | 'AIRTIME' | 'DATA' | 'ECG' | 'WATER' | 'TV';

export const TARGET_RULES: Record<string, RegExp> = {
  phone: /^(0\d{9}|233\d{9}|\+233\d{9})$/,
  bank_account: /^\d{10,16}$/,
  meter: /^\d{11}$/,
  water_account: /^\d{10,13}$/,
  smartcard: /^\d{10}$/,
};

const QUICK: Partial<Record<LocalKind, string[]>> = {
  AIRTIME: ['5', '10', '20', '50'],
  ECG: ['20', '50', '100', '200'],
  WATER: ['50', '100', '200'],
  MOMO_FUND: ['50', '100', '200', '500'],
  BANK_FUND: ['100', '500', '1000'],
  MOMO_PAYOUT: ['50', '100', '200'],
  BANK_PAYOUT: ['200', '500', '1000'],
};

const CLOSE: Record<LocalKind, string> = {
  MOMO_FUND: '/add',
  BANK_FUND: '/add',
  MOMO_PAYOUT: '/cash-out',
  BANK_PAYOUT: '/cash-out',
  AIRTIME: '/services',
  DATA: '/services',
  ECG: '/services',
  WATER: '/services',
  TV: '/services',
};

export function rateSourceName(source: string | null): string {
  if (!source || source === 'pilot') return t.rates.pilot;
  if (source === 'api.frankfurter.dev') return 'Frankfurter';
  return source;
}

export function rateTime(asOf: string | null): string {
  return asOf ? new Date(asOf).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
}

export function rateCaption(rate: string, source: string | null, asOf: string | null): string {
  return `1 USD = ${formatRate(rate)} GHS. ${t.rates.source(rateSourceName(source), rateTime(asOf))}`;
}

const AMOUNT_RE = /^(0|[1-9]\d{0,6})(\.\d{1,2})?$/;

export function compact(v: string): string {
  return v.replace(/[\s-]/g, '');
}

export function grouped(v: string, size: number): string {
  return compact(v)
    .replace(/\D/g, '')
    .replace(new RegExp(`(\\d{${size}})(?=\\d)`, 'g'), '$1 ');
}

export function displayPhone(v: string): string {
  const d = compact(v).replace(/^\+?233/, '0');
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : v;
}

type Catalog = { catalog: SandboxCatalog; balance: Balance };

export function useCatalog(): { data: Catalog | null; error: unknown } {
  const { api } = useServices();
  const [state, setState] = useState<{ data: Catalog | null; error: unknown }>({ data: null, error: null });
  useEffect(() => {
    let alive = true;
    api.request('SandboxCatalog').then(
      (r) => alive && setState({ data: { catalog: r.sandboxCatalog, balance: r.demoBalance }, error: null }),
      (error: unknown) => alive && setState({ data: null, error }),
    );
    return () => {
      alive = false;
    };
  }, [api]);
  return state;
}

export function ProviderPicker({ providers, value, onChange, label, wallet }: { providers: string[]; value: string; onChange: (p: string) => void; label: string; wallet: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${providers.length <= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {providers.map((p) => {
        const on = p === value;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(p)}
            className={`press flex h-14 items-center gap-3 rounded-[10px] border px-3.5 text-left transition-colors duration-200 ${on ? 'border-brand bg-brand-faint' : 'border-field hover:border-ink/25'}`}
          >
            <ProviderLogo id={p} size={37} />
            <span className="flex-1 text-[14.5px] font-semibold text-ink">{wallet ? providerLabel(p) : providerInfo(p).name}</span>
            {on ? <CheckIcon className="h-[18px] w-[18px] animate-pop text-brand" strokeWidth={2.4} /> : null}
          </button>
        );
      })}
    </div>
  );
}

function QuickAmounts({ values, value, onPick }: { values: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label={t.local.quick}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          aria-pressed={value === v}
          className={`press tabular h-9 rounded-[8px] border px-3.5 text-[14px] font-semibold transition-colors duration-200 ${value === v ? 'border-ink bg-ink text-white' : 'border-field text-ink hover:border-ink/30'}`}
        >
          {CEDI} {v}
        </button>
      ))}
    </div>
  );
}

function GhsAmount({ value, onChange, error, quick }: { value: string; onChange: (v: string) => void; error: string | null; quick?: string[] }) {
  return (
    <div>
      <Field label={t.local.amount} error={error}>
        {({ inputId, describedBy, invalid }) => (
          <div className={`flex h-[72px] items-center gap-3 rounded-[16px] border bg-surface px-4 transition-[border-color,box-shadow] duration-150 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/20 ${invalid ? 'border-danger' : 'border-field hover:border-ink/25'}`}>
            <span className="text-[22px] font-semibold text-muted">{CEDI}</span>
            <input
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={value}
              onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="tabular min-w-0 flex-1 bg-transparent text-[32px] font-semibold tracking-[-0.03em] text-ink outline-none placeholder:text-line"
            />
          </div>
        )}
      </Field>
      {quick ? <QuickAmounts values={quick} value={value} onPick={onChange} /> : null}
    </div>
  );
}

function ProductList({ products, value, onChange, kind }: { products: SandboxCatalog['products']; value: string; onChange: (id: string) => void; kind: LocalKind }) {
  return (
    <div role="radiogroup" aria-label={kind === 'DATA' ? t.local.bundle : t.local.package} className="grid gap-2.5 sm:grid-cols-2">
      {products.map((p) => {
        const on = p.id === value;
        const [size, ...rest] = p.label.split(', ');
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(p.id)}
            className={`press flex flex-col items-start rounded-[10px] border px-4 pb-4 pt-3.5 text-left transition-colors duration-200 ${on ? 'border-brand bg-brand-faint' : 'border-field hover:border-ink/25'}`}
          >
            <span className="text-[24px] font-semibold leading-tight tracking-[-0.03em] text-ink">{size}</span>
            <span className="mt-0.5 text-[13px] text-muted">{rest.join(', ') || t.svc.validity}</span>
            <span className="tabular mt-4 text-[15px] font-semibold text-ink">{formatGhs(p.priceGhs)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TargetInput({ target, value, onChange, error, dialCode = '233', placeholder = '24 123 4567', phoneHint, accountHint }: { target: string; value: string; onChange: (v: string) => void; error: string | null; dialCode?: string; placeholder?: string; phoneHint?: string; accountHint?: string }) {
  const cfg: Record<string, { label: string; hint: string; group: number; max: number }> = {
    phone: { label: t.local.phone, hint: phoneHint ?? t.local.phoneHint, group: 0, max: 13 },
    bank_account: { label: t.local.account, hint: accountHint ?? t.local.accountHint, group: 4, max: 20 },
    meter: { label: t.local.meter, hint: t.local.meterHint, group: 4, max: 13 },
    water_account: { label: t.local.waterAccount, hint: t.local.waterHint, group: 4, max: 16 },
    smartcard: { label: t.local.smartcard, hint: t.local.smartcardHint, group: 4, max: 12 },
  };
  const c = cfg[target] ?? cfg.phone!;
  return (
    <Field label={c.label} hint={c.hint} error={error}>
      {({ inputId, describedBy, invalid }) =>
        target === 'phone' ? (
          <PrefixedInput
            id={inputId}
            prefix={`+${dialCode}`}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, '').slice(0, 13))}
            aria-describedby={describedBy}
            invalid={invalid}
            className="text-[18px] font-medium tracking-[0.02em]"
          />
        ) : (
          <Input
            id={inputId}
            inputMode="numeric"
            autoComplete="off"
            value={grouped(value, c.group)}
            onChange={(e) => onChange(compact(e.target.value).replace(/\D/g, '').slice(0, c.max))}
            aria-describedby={describedBy}
            invalid={invalid}
            className="tabular text-[20px] font-semibold tracking-[0.06em]"
          />
        )
      }
    </Field>
  );
}

export function phoneForApi(v: string): string {
  const d = compact(v);
  if (/^\d{9}$/.test(d)) return `0${d}`;
  return d;
}

function ServiceBanner({ provider, kind }: { provider: string; kind: LocalKind }) {
  return (
    <div className="mb-8 flex items-center gap-4 border-b border-hairline pb-6">
      <ProviderLogo id={provider} size={55} />
      <div>
        <p className="text-[17px] font-semibold leading-tight text-ink">{providerInfo(provider).name}</p>
        <p className="mt-0.5 text-[13.5px] text-muted">{kind === 'ECG' ? t.svc.meterType : t.svc.titles[kind]}</p>
      </div>
    </div>
  );
}

export function useReceiptPoll(initial: SandboxReceipt | null): SandboxReceipt | null {
  const { api } = useServices();
  const [receipt, setReceipt] = useState(initial);
  const id = initial?.id;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () =>
      api.request('SandboxOp', { id }).then(
        (r) => {
          if (!alive || !r.sandboxOp) return;
          setReceipt(r.sandboxOp);
          if (r.sandboxOp.status === 'PENDING') timer = setTimeout(tick, 1200);
        },
        () => {
          if (alive) timer = setTimeout(tick, 2500);
        },
      );
    timer = setTimeout(tick, 900);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [api, id]);
  return receipt && receipt.id === id ? receipt : initial;
}

function TokenCard({ token }: { token: string }) {
  const [copied, copy] = useCopy();
  return (
    <div className="rounded-[10px] border border-line bg-canvas px-5 py-4">
      <p className="text-[13px] font-medium text-muted">{t.local.token}</p>
      <p className="tabular mt-2 break-all font-mono text-[22px] font-semibold tracking-[0.04em] text-ink sm:text-[24px]">{token}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">{t.svc.tokenHint}</p>
        <button type="button" onClick={() => copy(token)} className="press flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] border border-field bg-surface px-3 text-[13px] font-medium text-ink hover:border-ink/25">
          {copied ? <CheckIcon className="h-4 w-4 text-success" /> : <CopyIcon className="h-4 w-4" />}
          <span aria-live="polite">{copied ? t.ui.copied : t.ui.copy}</span>
        </button>
      </div>
    </div>
  );
}

export function LocalFlow({ kind }: { kind: LocalKind }) {
  const router = useRouter();
  const { api } = useServices();
  const { state, refresh } = useWallet();
  const { data, error: loadError } = useCatalog();
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState('');
  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [productId, setProductId] = useState('');
  const [touched, setTouched] = useState(false);
  const [quote, setQuote] = useState<SandboxQuote | null>(null);
  const [submitted, setSubmitted] = useState<SandboxReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: string | null; message: string } | null>(null);
  const sent = useRef(false);
  const receipt = useReceiptPoll(submitted);

  useEffect(() => {
    if (receipt && receipt.status !== 'PENDING') void refresh();
  }, [receipt, refresh]);

  const title = t.svc.titles[kind]!;
  const close = CLOSE[kind];

  if (state.status === 'ready' && state.wallet.me.viewOnly) {
    return (
      <FlowFrame title={title} closeHref={close}>
        <ViewOnlyNotice />
      </FlowFrame>
    );
  }
  if (!data) {
    return (
      <FlowFrame title={title} closeHref={close}>
        {loadError ? <Notice tone="danger">{messageFor(loadError)}</Notice> : <Skeleton rows={3} />}
      </FlowFrame>
    );
  }

  const service = data.catalog.services.find((s) => s.kind === kind);
  if (!service) {
    return (
      <FlowFrame title={title} closeHref={close}>
        <Notice tone="info">{t.errors.SERVICE_PAUSED}</Notice>
      </FlowFrame>
    );
  }

  const single = service.providers.length === 1 ? service.providers[0]! : '';
  const chosen = provider || single;
  const products = data.catalog.products.filter((p) => p.provider === chosen);
  const debit = service.direction === 'DEBIT';
  const targetValue = service.target === 'phone' ? phoneForApi(target) : compact(target);
  const targetOk = TARGET_RULES[service.target]?.test(targetValue) ?? false;
  const amountOk = service.usesProducts ? productId !== '' : AMOUNT_RE.test(amount) && Number(amount) > 0;
  const ready = chosen !== '' && targetOk && amountOk;
  const available = BigInt(data.balance.available);
  const localNow = data.catalog.simulatedRate ? formatLocal(data.balance.available, data.catalog.simulatedRate) : null;

  const input: SandboxRequestInput = { kind, provider: chosen, target: targetValue, ...(service.usesProducts ? { productId } : { amountGhs: amount }) };

  async function review() {
    setTouched(true);
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      setQuote((await api.request('SandboxQuote', { input })).sandboxQuote);
      setStep(1);
    } catch (err) {
      const field = err instanceof ApiError ? err.field : null;
      setError({ field, message: field && t.local.invalid[field] ? t.local.invalid[field]! : messageFor(err) });
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (busy || sent.current || !quote) return;
    sent.current = true;
    setBusy(true);
    setError(null);
    try {
      setSubmitted((await api.request('SandboxSubmit', { input })).sandboxSubmit);
      setStep(2);
    } catch (err) {
      sent.current = false;
      setError({ field: null, message: messageFor(err) });
    } finally {
      setBusy(false);
    }
  }

  const momo = kind === 'MOMO_PAYOUT' || kind === 'MOMO_FUND';
  const toLabel = service.target === 'phone' ? `${momo ? providerLabel(chosen) : providerInfo(chosen).name} ${displayPhone(targetValue)}` : `${providerInfo(chosen).name} ${grouped(targetValue, 4)}`;
  const short = debit && quote ? BigInt(quote.total) > available : false;

  let footer = null;
  if (step === 0) footer = <FooterButton disabled={touched && !ready} loading={busy} onClick={() => void review()}>{t.flow.continue}</FooterButton>;
  if (step === 1 && quote)
    footer = (
      <>
        <FooterButton variant="secondary" onClick={() => setStep(0)}>
          {t.ui.back}
        </FooterButton>
        <FooterButton disabled={short} loading={busy} onClick={() => void submit()}>
          {t.local.confirm(formatGhs(quote.totalLocal))}
        </FooterButton>
      </>
    );

  const productLayout = kind === 'DATA' || kind === 'TV';

  return (
    <FlowFrame title={title} steps={t.local.steps as unknown as string[]} step={step} closeHref={close} onBack={step === 1 ? () => setStep(0) : undefined} footer={footer}>
      {step === 0 ? (
        <>
          {single ? <ServiceBanner provider={single} kind={kind} /> : null}
          <FlowHeading title={t.svc.headings[kind]!} lead={t.svc.leads[kind]} />
          <div className="flex flex-col gap-7">
            {!single ? (
              <div>
                <p className="mb-2.5 text-[14px] font-medium text-ink">{service.target === 'bank_account' ? t.local.bank : t.local.network}</p>
                <ProviderPicker
                  providers={service.providers}
                  value={chosen}
                  onChange={(p) => {
                    setProvider(p);
                    setProductId('');
                  }}
                  label={service.target === 'bank_account' ? t.local.bank : t.local.network}
                  wallet={kind === 'MOMO_PAYOUT' || kind === 'MOMO_FUND'}
                />
                {touched && !chosen ? <p className="mt-2 text-[13px] text-danger">{t.local.invalid.provider}</p> : null}
              </div>
            ) : null}
            <TargetInput target={service.target} value={target} onChange={setTarget} error={(touched && target !== '' && !targetOk) || error?.field === 'target' ? t.local.invalid.target! : null} />
            {productLayout ? (
              chosen ? (
                <div>
                  <p className="mb-2.5 text-[14px] font-medium text-ink">{kind === 'DATA' ? t.local.bundle : t.local.package}</p>
                  <ProductList products={products} value={productId} onChange={setProductId} kind={kind} />
                </div>
              ) : null
            ) : (
              <GhsAmount value={amount} onChange={setAmount} error={(touched && amount !== '' && !amountOk) || error?.field === 'amountGhs' ? t.local.invalid.amountGhs! : null} quick={QUICK[kind]} />
            )}
            {debit ? <p className="tabular text-[13.5px] text-muted">{t.local.localAvailable(formatUsd(available), localNow)}</p> : null}
            {error && !error.field ? (
              <Notice tone="danger" live="assertive">
                {error.message}
              </Notice>
            ) : null}
          </div>
        </>
      ) : step === 1 && quote ? (
        <>
          <p className="eyebrow text-brand-ink">{t.local.review}</p>
          <p className="tabular mt-3 text-[48px] font-semibold leading-none tracking-[-0.05em] text-ink">{formatGhs(quote.totalLocal)}</p>
          <div className="mt-7 flex items-center gap-3.5 border-y border-hairline py-3.5">
            <ProviderLogo id={quote.provider} size={43} />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink">{momo ? providerLabel(quote.provider) : providerInfo(quote.provider).name}</p>
              <p className="tabular truncate text-[14px] text-muted">{service.target === 'phone' ? displayPhone(quote.target) : grouped(quote.target, 4)}</p>
            </div>
          </div>
          <Ledger
            className="mt-6"
            rows={[
              ...(quote.productLabel ? [{ label: t.local.for, value: quote.productLabel }] : []),
              { label: t.local.amount, value: formatGhs(quote.amountLocal), strong: true },
              { label: t.local.fee, value: quote.feeLocal === '0.00' ? t.local.feeNone : formatGhs(quote.feeLocal) },
              { label: t.local.total, value: formatGhs(quote.totalLocal), total: true },
            ]}
          />
          <p className="mt-4 text-[13.5px] text-muted">
            {debit ? `${t.local.fromLocal}: ${formatUsd(quote.total)} of ${formatUsd(available)}` : t.local.toLocal}
          </p>
          <p className="tabular mt-1 text-[13px] text-subtle">{rateCaption(quote.simulatedRate, quote.rateSource, quote.rateAsOf)}</p>
          {short ? (
            <div className="mt-5">
              <Notice tone="warning">{t.local.notEnough}</Notice>
            </div>
          ) : null}
          {error ? (
            <div className="mt-5">
              <Notice tone="danger" live="assertive">
                {error.message}
              </Notice>
            </div>
          ) : null}
        </>
      ) : step === 2 && receipt && quote ? (
        receipt.status === 'PENDING' ? (
          <div className="animate-step" role="status">
            <p className="eyebrow mb-3 text-brand-ink">{t.flow.inProgress}</p>
            <p className="mb-8 text-[26px] font-semibold tracking-[-0.03em] text-ink">{t.local.processing}</p>
            <Tracker
              steps={[
                { key: 's', label: t.svc.submitted },
                { key: 'p', label: t.svc.providerProcessing(providerInfo(receipt.provider).name) },
                { key: 'f', label: t.svc.finished },
              ]}
              at={1}
            />
            {debit ? <p className="mt-8 text-[13px] text-muted">{t.svc.holdNote(formatGhs(quote.totalLocal))}</p> : null}
          </div>
        ) : receipt.status === 'SUCCEEDED' ? (
          <ResultView
            tone="success"
            eyebrow={t.local.succeeded}
            title={t.svc.done[kind]!(formatGhs(quote.amountLocal), toLabel)}
            amount={<p className="tabular text-[40px] font-semibold leading-none tracking-[-0.045em] text-ink">{formatGhs(quote.totalLocal)}</p>}
            actions={
              <>
                <button type="button" onClick={() => router.push('/home')} className={buttonStyles.primary}>
                  {t.local.done}
                </button>
                <Link href={routes.receipt(receipt.id)} className={buttonStyles.link}>
                  {t.flow.receipt}
                </Link>
              </>
            }
          >
            {receipt.token ? (
              <div className="mb-6">
                <TokenCard token={receipt.token} />
              </div>
            ) : null}
            <Ledger rows={[{ label: t.local.to, value: toLabel }, ...(quote.productLabel ? [{ label: t.local.for, value: quote.productLabel }] : []), { label: t.local.reference, value: receipt.id.slice(0, 13).toUpperCase(), mono: true }]} />
          </ResultView>
        ) : (
          <ResultView
            tone={receipt.status === 'FAILED' ? 'danger' : 'warning'}
            eyebrow={receipt.status === 'FAILED' ? t.local.failed : t.local.review_}
            title={t.svc.titles[kind]!}
            amount={<p className="tabular text-[40px] font-semibold leading-none tracking-[-0.045em] text-ink">{formatGhs(quote.totalLocal)}</p>}
            actions={
              <>
                <button type="button" onClick={() => router.push('/home')} className={buttonStyles.secondary}>
                  {t.local.done}
                </button>
                <Link href={routes.activity(receipt.id)} className={buttonStyles.link}>
                  {t.flow.viewActivity}
                </Link>
              </>
            }
          >
            <p className="max-w-[30rem] text-[15px] leading-6 text-ink-2">{receipt.status === 'FAILED' ? t.local.failedBody : t.local.reviewBody}</p>
          </ResultView>
        )
      ) : null}
    </FlowFrame>
  );
}

export function CashOutHub() {
  const { state } = useWallet();
  const { data } = useCatalog();
  const viewOnly = state.status === 'ready' && state.wallet.me.viewOnly;
  return (
    <div className="max-w-[760px]">
      <PageHeader title={t.svc.cashOutTitle} lead={t.svc.cashOutLead} />
      {data ? <p className="tabular mb-6 text-[14px] text-muted">{t.local.localAvailable(formatUsd(data.balance.available), data.catalog.simulatedRate ? formatLocal(data.balance.available, data.catalog.simulatedRate) : null)}</p> : null}
      <DestinationList
        label={t.svc.cashOutLabel}
        items={[
          { href: '/cash-out/momo', logos: <ProviderLogos ids={['MTN', 'TELECEL', 'AT']} />, title: t.send.toMomo, body: t.svc.momoBody, disabled: viewOnly },
          { href: '/cash-out/bank', title: t.send.toBank, body: t.svc.bankBody, disabled: viewOnly },
        ]}
      />
    </div>
  );
}

export function ServicesHub() {
  const { state } = useWallet();
  const { data } = useCatalog();
  const viewOnly = state.status === 'ready' && state.wallet.me.viewOnly;
  return (
    <div className="max-w-[760px]">
      <PageHeader title={t.svc.servicesTitle} lead={t.svc.servicesLead} />
      {data ? <p className="tabular mb-6 text-[14px] text-muted">{t.local.localAvailable(formatUsd(data.balance.available), data.catalog.simulatedRate ? formatLocal(data.balance.available, data.catalog.simulatedRate) : null)}</p> : null}
      <DestinationList
        label={t.svc.servicesLabel}
        items={[
          { href: '/services/airtime', logos: <ProviderLogos ids={['MTN', 'TELECEL', 'AT']} />, title: t.overview.services.airtime, body: t.svc.airtimeBody, disabled: viewOnly },
          { href: '/services/data', logos: <ProviderLogos ids={['MTN', 'TELECEL', 'AT']} />, title: t.overview.services.data, body: t.svc.dataBody, disabled: viewOnly },
          { href: '/services/electricity', logos: <ProviderLogos ids={['ECG']} />, title: t.overview.services.electricity, body: t.svc.ecgBody, disabled: viewOnly },
          { href: '/services/water', logos: <ProviderLogos ids={['GWL']} />, title: t.overview.services.water, body: t.svc.waterBody, disabled: viewOnly },
          { href: '/services/tv', title: t.overview.services.tv, body: t.svc.tvBody, disabled: viewOnly },
        ]}
      />
    </div>
  );
}
