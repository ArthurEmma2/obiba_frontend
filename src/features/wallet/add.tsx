'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Field, Input } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { QrCode } from '@/components/ui/qr-code';
import { routes, useQueryId } from '@/lib/routes';
import { isApiError, messageFor } from '@/lib/errors';
import { ApiError } from '@/lib/graphql/client';
import type { DepositInstructions, DepositOption, QuoteView } from '@/lib/graphql/types';
import { formatUsd } from '@/lib/money';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { FlowFrame, FlowHeading } from './flow-frame';
import { FooterButton } from './flow';
import { DOT } from './entries';
import { longDate } from './format';
import { CheckIcon, CopyIcon, ShareIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { AssetPair, NetworkLogo, NetworkRow, networkOf, TokenLogo } from './providers';
import { CopyField, DestinationList, Ledger, Skeleton, Status, Tracker, useCopy } from './ui';
import { useWallet } from './wallet-data';

type ReceiveData = { options: DepositOption[]; address: string | null; contract: string | null; network: string; error: unknown };

function useReceive(): ReceiveData | null {
  const { api } = useServices();
  const [data, setData] = useState<ReceiveData | null>(null);
  useEffect(() => {
    let alive = true;
    api.request('Receive').then(
      (r) => alive && setData({ options: r.depositOptions, address: r.directDeposit.address, contract: r.directDeposit.tokenContract, network: r.directDeposit.network, error: null }),
      (error: unknown) => alive && setData({ options: [], address: null, contract: null, network: 'NEAR', error }),
    );
    return () => {
      alive = false;
    };
  }, [api]);
  return data;
}

export function AddHub() {
  const data = useReceive();
  const crossOk = (data?.options.length ?? 0) > 0;
  const crossNetworks = [...new Set((data?.options ?? []).map((o) => networkOf(`${o.key} ${o.label}`)).filter((n): n is string => !!n))];
  return (
    <div className="max-w-[760px]">
      <PageHeader title={t.add.title} lead={t.add.lead} />
      {!data ? (
        <Skeleton rows={2} />
      ) : (
        <DestinationList
          label={t.add.hubLabel}
          items={[
            { href: '/receive', logos: <span className="flex items-center gap-1.5"><TokenLogo token="USDC" size={31} /><NetworkLogo network="near" size={31} /></span>, title: t.add.receiveTitle, body: t.add.receiveBody, meta: t.add.receiveMeta },
            { href: '/add/near-wallet', logos: <NetworkLogo network="near" size={31} />, title: t.nearWallet.hubTitle, body: t.nearWallet.hubBody, meta: t.nearWallet.hubMeta },
            { href: '/add/crypto', logos: <NetworkRow networks={crossNetworks.length ? crossNetworks.slice(0, 4) : ['base', 'solana', 'tron', 'bsc']} size={27} />, title: t.add.crossTitle, body: t.add.crossBody, meta: t.add.crossMeta, disabled: !crossOk, disabledNote: t.add.crossNone },
          ]}
        />
      )}
      <p className="mt-8 text-[14px] text-muted">
        <span className="hidden sm:inline">{t.add.cashOutHint} </span>
        <Link href="/cash-out" className="font-medium text-brand-ink underline-offset-4 hover:underline">
          {t.add.cashOutLink}
        </Link>
      </p>
    </div>
  );
}

function groupAddress(a: string): string[] {
  const parts = a.split('.');
  return parts.map((p, i) => (i === 0 ? p : `.${p}`));
}

export function Receive() {
  const data = useReceive();
  const { state } = useWallet();
  const [copied, copy] = useCopy();
  const handle = state.status === 'ready' ? state.wallet.me.handle : null;

  if (!data) {
    return (
      <div>
        <PageHeader title={t.receive2.title} lead={t.receive2.lead} />
        <Skeleton rows={3} />
      </div>
    );
  }
  if (data.error || !data.address) {
    return (
      <div className="max-w-[36rem]">
        <PageHeader title={t.receive2.title} />
        <Notice tone={isApiError(data.error, 'RECOVERY_SETUP_REQUIRED') ? 'warning' : 'danger'} live="assertive">
          {isApiError(data.error, 'RECOVERY_SETUP_REQUIRED') ? t.receive2.kitNeeded : messageFor(data.error)}
        </Notice>
      </div>
    );
  }
  const address = data.address;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div>
      <PageHeader title={t.receive2.title} lead={t.receive2.lead} />
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-14">
        <figure className="stagger mx-auto w-full max-w-[320px] lg:mx-0">
          <div className="rounded-[12px] border border-line bg-white p-5">
            <div className="mx-auto aspect-square w-full [&>svg]:h-full [&>svg]:w-full">
              <QrCode value={address} label={t.receive2.qr} size={260} />
            </div>
          </div>
          <figcaption className="mt-3 flex items-center justify-center gap-2 text-[13px] font-medium text-ink-2">
            <TokenLogo token="USDC" size={18} />
            USDC on NEAR
            <NetworkLogo network="near" size={18} />
          </figcaption>
        </figure>

        <div className="stagger min-w-0">
          <p className="eyebrow text-brand-ink">{t.receive2.addressLabel}</p>
          <p className="mt-3 break-all font-mono text-[22px] font-medium leading-[1.35] tracking-[-0.01em] text-ink sm:text-[26px]">
            {groupAddress(address).map((p, i) => (
              <span key={i} className={i === 0 ? 'text-ink' : 'text-muted'}>
                {p}
              </span>
            ))}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => copy(address)} className="press inline-flex h-12 items-center gap-2 rounded-[10px] bg-action px-6 text-[15px] font-medium text-white shadow-button hover:bg-action-hover">
              {copied ? <CheckIcon className="h-[18px] w-[18px]" /> : <CopyIcon className="h-[18px] w-[18px]" />}
              <span aria-live="polite">{copied ? t.ui.copied : t.receive2.copy}</span>
            </button>
            {canShare ? (
              <button
                type="button"
                onClick={() => void navigator.share({ text: t.receive2.shareText(address) }).catch(() => undefined)}
                className="press inline-flex h-12 items-center gap-2 rounded-[10px] border border-field px-6 text-[15px] font-medium text-ink hover:border-ink/25"
              >
                <ShareIcon className="h-[18px] w-[18px]" />
                {t.receive2.share}
              </button>
            ) : null}
          </div>

          <div className="mt-10">
            <Ledger
              rows={[
                { label: t.receive2.network, value: <span className="inline-flex items-center gap-2"><NetworkLogo network="near" size={18} />NEAR</span> },
                { label: t.receive2.asset, value: <span className="inline-flex items-center gap-2"><TokenLogo token="USDC" size={18} />USDC</span> },
                ...(data.contract ? [{ label: t.receive2.contract, value: data.contract, mono: true }] : []),
                ...(handle ? [{ label: t.receive2.handle, value: `@${handle}` }] : []),
              ]}
            />
          </div>

          <div className="mt-8 border-l-0">
            <p className="text-[14px] font-semibold text-ink">{t.receive2.warnTitle}</p>
            <p className="mt-1 max-w-[32rem] text-[14px] leading-[1.55] text-muted">{t.receive2.warnBody}</p>
            {data.options.length > 0 ? (
              <p className="mt-4 text-[14px] text-ink-2">
                {t.receive2.otherNetwork}{' '}
                <Link href="/add/crypto" className="font-medium text-brand-ink underline-offset-4 hover:underline">
                  {t.receive2.otherLink}
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function decimalsOk(v: string, decimals: number): boolean {
  const m = /^(\d{1,12})(?:\.(\d*))?$/.exec(v.trim());
  return !!m && (m[2] ?? '').length <= decimals && Number(v) > 0;
}

export function AddCrypto() {
  const router = useRouter();
  const { api } = useServices();
  const data = useReceive();
  const [step, setStep] = useState(0);
  const [origin, setOrigin] = useState<DepositOption | null>(null);
  const [amount, setAmount] = useState('');
  const [refund, setRefund] = useState('');
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: string | null; message: string } | null>(null);

  const input = origin ? { amount: amount.trim(), origin: origin.key, refundAddress: refund.trim() } : null;

  async function getQuote() {
    if (!input || busy) return;
    setBusy(true);
    setError(null);
    try {
      setQuote((await api.request('QuoteDeposit', { input })).quoteDeposit);
      setStep(2);
    } catch (err) {
      setError({ field: err instanceof ApiError ? err.field : null, message: messageFor(err) });
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!input || busy) return;
    setBusy(true);
    setError(null);
    try {
      const d = (await api.request('StartDeposit', { input })).startDeposit;
      router.push(routes.deposit(d.depositId));
    } catch (err) {
      setError({ field: null, message: messageFor(err) });
      setBusy(false);
    }
  }

  const back = step > 0 ? () => setStep((s) => s - 1) : undefined;
  let footer = null;
  if (step === 0) footer = <FooterButton disabled={!origin} onClick={() => setStep(1)}>{t.flow.continue}</FooterButton>;
  if (step === 1)
    footer = (
      <>
        <FooterButton variant="secondary" onClick={() => setStep(0)}>
          {t.ui.back}
        </FooterButton>
        <FooterButton disabled={!origin || !decimalsOk(amount, origin.decimals) || refund.trim().length < 20} loading={busy} onClick={() => void getQuote()}>
          {t.crypto.getQuote}
        </FooterButton>
      </>
    );
  if (step === 2)
    footer = (
      <>
        <FooterButton variant="secondary" onClick={() => setStep(1)}>
          {t.ui.back}
        </FooterButton>
        <FooterButton loading={busy} onClick={() => void start()}>
          {t.crypto.start}
        </FooterButton>
      </>
    );

  return (
    <FlowFrame title={t.crypto.title} steps={t.crypto.steps as unknown as string[]} step={step} closeHref="/add" onBack={back} footer={footer}>
      {!data ? (
        <Skeleton rows={4} />
      ) : data.options.length === 0 ? (
        <Notice tone="info" title={t.add.crossTitle}>
          {t.add.crossNone}
        </Notice>
      ) : step === 0 ? (
        <>
          <FlowHeading title={t.crypto.sourceTitle} lead={t.crypto.sourceLead} />
          <div role="radiogroup" aria-label={t.crypto.sourceTitle} className="flex flex-col gap-2">
            {data.options.map((o) => {
              const on = origin?.key === o.key;
              const net = o.label.split(' on ')[1] ?? o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setOrigin(o)}
                  className={`press flex items-center gap-4 rounded-[10px] border px-4 py-3.5 text-left transition-colors duration-200 ${on ? 'border-brand bg-brand-faint' : 'border-field hover:border-ink/25'}`}
                >
                  <AssetPair label={`${o.key} ${o.label}`} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">{o.label}</span>
                    <span className="block text-[13px] text-muted">{net}</span>
                  </span>
                  <span className="text-[13px] text-muted">{t.crypto.min(`$${o.minUsd}`)}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : step === 1 && origin ? (
        <>
          <FlowHeading eyebrow={origin.label} title={t.crypto.amountTitle} />
          <div className="flex flex-col gap-6">
            <Field label={t.crypto.amountLabel(origin.label)} error={error?.field === 'amount' ? error.message : null} hint={t.crypto.min(`$${origin.minUsd}`)}>
              {({ inputId, describedBy, invalid }) => <Input id={inputId} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} aria-describedby={describedBy} invalid={invalid} className="tabular text-[20px] font-semibold" placeholder="0.00" autoFocus />}
            </Field>
            <Field label={t.crypto.refund} hint={t.crypto.refundHint} error={error?.field === 'refundAddress' ? error.message : null}>
              {({ inputId, describedBy, invalid }) => <Input id={inputId} value={refund} onChange={(e) => setRefund(e.target.value.trim())} aria-describedby={describedBy} invalid={invalid} className="font-mono text-[14px]" autoComplete="off" autoCapitalize="none" spellCheck={false} />}
            </Field>
            {error && !error.field ? (
              <Notice tone="danger" live="assertive">
                {error.message}
              </Notice>
            ) : null}
          </div>
        </>
      ) : step === 2 && quote && origin ? (
        <>
          <FlowHeading eyebrow={origin.label} title={t.crypto.quoteTitle} lead={t.crypto.quoteLead} />
          <Ledger
            rows={[
              { label: t.crypto.youSend, value: `${amount} ${origin.label.split(' ')[0]}`, strong: true },
              ...(quote.fees.appFeeBps ? [{ label: t.crypto.appFee, value: `${(quote.fees.appFeeBps / 100).toFixed(2)}%` }] : []),
              ...(quote.fees.providerSpreadUsd ? [{ label: t.crypto.spread, value: `$${quote.fees.providerSpreadUsd}` }] : []),
              { label: t.crypto.eta, value: quote.timeEstimateSeconds ? `~${Math.max(1, Math.round(quote.timeEstimateSeconds / 60))} min` : t.crypto.etaUnknown },
              { label: t.crypto.deadline, value: longDate(quote.deadline) },
              { label: t.crypto.youGet, value: formatUsd(quote.amountOut), total: true },
              { label: t.crypto.atLeast, value: formatUsd(quote.minAmountOut), strong: true },
            ]}
          />
          <p className="mt-5 text-[13px] leading-5 text-muted">{t.crypto.exchangeFees}</p>
          {error ? (
            <div className="mt-5">
              <Notice tone="danger" live="assertive">
                {error.message}
              </Notice>
            </div>
          ) : null}
        </>
      ) : null}
    </FlowFrame>
  );
}

const DEPOSIT_FLOW = ['AWAITING_DEPOSIT', 'DETECTED', 'CONVERTING', 'VERIFYING_SETTLEMENT', 'CREDITED'];
const DEPOSIT_DONE = new Set(['CREDITED', 'REFUNDED', 'FAILED', 'EXPIRED']);

function useCountdown(deadline: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!deadline) return null;
  const left = Date.parse(deadline) - now;
  if (left <= 0) return null;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function DepositTracker({ id }: { id: string }) {
  const { api } = useServices();
  const [deposit, setDeposit] = useState<DepositInstructions | null | 'missing'>(null);
  const left = useCountdown(deposit && deposit !== 'missing' ? deposit.deadline : null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () =>
      api.request('Deposit', { id }).then(
        (r) => {
          if (!alive) return;
          setDeposit(r.deposit ?? 'missing');
          if (r.deposit && !DEPOSIT_DONE.has(r.deposit.status)) timer = setTimeout(load, 5000);
        },
        () => {
          if (alive) timer = setTimeout(load, 8000);
        },
      );
    void load();
    const off = api.subscribe('DepositUpdated', () => void load());
    return () => {
      alive = false;
      off();
      if (timer) clearTimeout(timer);
    };
  }, [api, id]);

  if (deposit === null) {
    return (
      <FlowFrame title={t.crypto.title} closeHref="/add">
        <Skeleton rows={4} />
      </FlowFrame>
    );
  }
  if (deposit === 'missing') {
    return (
      <FlowFrame title={t.crypto.title} closeHref="/add">
        <Notice tone="danger">{t.crypto.notFound}</Notice>
      </FlowFrame>
    );
  }

  const flowAt = DEPOSIT_FLOW.indexOf(deposit.status);
  const problem = t.crypto.problems[deposit.status];
  const awaiting = deposit.status === 'AWAITING_DEPOSIT';
  const steps = DEPOSIT_FLOW.map((k) => ({
    key: k,
    label: t.crypto.states[k]!,
    detail:
      k === 'DETECTED' && deposit.originTxHashes[0] ? (
        <span className="break-all font-mono text-[12.5px]">{deposit.originTxHashes[0]}</span>
      ) : k === 'CREDITED' && deposit.nearExplorerUrls[0] ? (
        <a href={deposit.nearExplorerUrls[0]} target="_blank" rel="noreferrer" className="font-medium text-brand-ink underline-offset-4 hover:underline">
          {t.crypto.nearTx}
        </a>
      ) : undefined,
  }));

  return (
    <FlowFrame title={t.crypto.title} closeHref="/home" wide>
      <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          {awaiting ? (
            <>
              <FlowHeading eyebrow={deposit.origin} title={t.crypto.sendTitle} lead={t.crypto.sendLead} />
              <p className="tabular mb-6 text-[40px] font-semibold leading-none tracking-[-0.045em] text-ink">{deposit.amountIn}</p>
              <div className="border-y border-hairline">
                <CopyField label={t.crypto.address} value={deposit.depositAddress} />
                {deposit.depositMemo ? <CopyField label={t.crypto.memo} value={deposit.depositMemo} /> : null}
                <CopyField label={t.crypto.amount} value={deposit.amountIn} mono={false} />
                <CopyField label={t.crypto.network} value={deposit.origin} mono={false} />
              </div>
              <p className="mt-4 text-[13.5px] leading-5 text-muted">
                {t.crypto.minimum}: {deposit.minAmountIn}
                {DOT}
                {left ? t.crypto.timeLeft(left) : t.crypto.expired}
              </p>
            </>
          ) : (
            <FlowHeading eyebrow={deposit.origin} title={deposit.status === 'CREDITED' ? t.crypto.credited : t.crypto.trackTitle} />
          )}
          <div className="mt-10">
            <p className="eyebrow mb-4 text-subtle">{t.crypto.trackTitle}</p>
            <Tracker steps={steps} at={problem ? Math.max(0, flowAt) : flowAt === DEPOSIT_FLOW.length - 1 ? flowAt : Math.max(0, flowAt)} failed={!!problem} failedLabel={problem} />
            <div className="mt-6">
              <Status status={deposit.status} />
            </div>
          </div>
        </div>
        {awaiting ? (
          <div className="order-first md:order-none">
            <div className="rounded-[12px] border border-line bg-white p-4">
              <div className="mx-auto aspect-square w-full max-w-[220px] [&>svg]:h-full [&>svg]:w-full">
                <QrCode value={deposit.depositAddress} label={t.crypto.address} size={220} />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </FlowFrame>
  );
}

export function DepositTrackerRoute() {
  return <DepositTracker id={useQueryId()} />;
}
