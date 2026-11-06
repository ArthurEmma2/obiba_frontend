'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Logo } from '@/components/ui/logo';
import { Notice } from '@/components/ui/notice';
import { routes, useQueryId } from '@/lib/routes';
import { messageFor } from '@/lib/errors';
import type { ActivityItem, SandboxReceipt, TransactionView } from '@/lib/graphql/types';
import { formatMoney, formatUsd } from '@/lib/money';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { EntryHeader, EntryRow, fromActivity, fromLocal, fromPending, type Entry } from './entries';
import { buttonStyles } from './flow';
import { FlowFrame } from './flow-frame';
import { longDate } from './format';
import { BackIcon, CheckIcon, CopyIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { providerInfo, ProviderLogo, TokenLogo } from './providers';
import { Empty, Ledger, Segmented, Skeleton, Status, toneOf, useCopy, type LedgerRow } from './ui';
import { useWallet } from './wallet-data';

function localAmount(r: SandboxReceipt): string | null {
  return r.amountLocal ?? r.amountGhs;
}

function localFee(r: SandboxReceipt): string | null {
  return r.feeLocal ?? r.feeGhs;
}

type Filter = 'all' | 'usdc' | 'local';
const PAGE = 30;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t.activity.today;
  if (d.toDateString() === y.toDateString()) return t.activity.yesterday;
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}

export function Activity() {
  const { api, payContract } = useServices();
  const { state } = useWallet();
  const [filter, setFilter] = useState<Filter>('all');
  const [real, setReal] = useState<ActivityItem[] | null>(null);
  const [local, setLocal] = useState<SandboxReceipt[] | null>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    () =>
      Promise.all([api.request('Activity', { first: PAGE }), api.request('SandboxOps', { first: 50 }).then((r) => r.sandboxOps, () => [] as SandboxReceipt[])]).then(
        ([a, l]) => {
          setReal(a.activity.filter((x) => x.domain === 'REAL'));
          setMore(a.activity.length === PAGE);
          setLocal(l);
          setError(null);
        },
        (err: unknown) => setError(err),
      ),
    [api],
  );

  useEffect(() => {
    void load();
    const off = api.subscribe('TransactionUpdated', () => void load());
    const off2 = api.subscribe('BalanceChanged', () => void load());
    return () => {
      off();
      off2();
    };
  }, [api, load]);

  async function loadMore() {
    if (!real || loadingMore) return;
    const last = [...real].sort((x, y) => Number(BigInt(x.id) - BigInt(y.id)))[0];
    if (!last) return;
    setLoadingMore(true);
    try {
      const r = await api.request('Activity', { first: PAGE, before: last.id });
      setReal((cur) => [...(cur ?? []), ...r.activity.filter((x) => x.domain === 'REAL')]);
      setMore(r.activity.length === PAGE);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  }

  const pending = useMemo(() => (state.status === 'ready' ? state.wallet.pendingActivity : []), [state]);
  const { inFlight, settled } = useMemo(() => {
    const flight: Entry[] = [];
    const done: Entry[] = [];
    if (filter !== 'local') flight.push(...pending.map(fromPending));
    if (filter !== 'usdc') for (const l of local ?? []) (l.status === 'PENDING' ? flight : done).push(fromLocal(l));
    if (filter !== 'local') done.push(...(real ?? []).map((a) => fromActivity(a, payContract)));
    done.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return { inFlight: flight, settled: done };
  }, [filter, pending, local, real, payContract]);

  const groups = useMemo(() => {
    const out: Array<{ day: string; items: Entry[] }> = [];
    for (const e of settled) {
      const day = dayLabel(e.createdAt);
      const g = out[out.length - 1];
      if (g && g.day === day) g.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [settled]);

  const loading = real === null || local === null;

  return (
    <div>
      <PageHeader
        title={t.activity.title}
        lead={t.activity.lead}
        actions={
          <Segmented
            label={t.activity.filterLabel}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t.activity.filters.all },
              { value: 'usdc', label: t.activity.filters.usdc },
              { value: 'local', label: t.activity.filters.local },
            ]}
          />
        }
      />
      {error && loading ? (
        <Notice tone="danger" live="assertive">
          {messageFor(error)}
        </Notice>
      ) : loading ? (
        <Skeleton rows={6} />
      ) : inFlight.length === 0 && settled.length === 0 ? (
        <Empty title={filter === 'local' ? t.activity.emptyLocal : t.activity.empty} body={filter === 'local' ? t.activity.emptyLocalBody : t.activity.emptyBody} />
      ) : (
        <div className="flex flex-col gap-10">
          <EntryHeader />
          {inFlight.length ? (
            <section aria-label={t.activity.inProgress} className="-mt-6">
              <h2 className="eyebrow mb-1 text-brand-ink">{t.activity.inProgress}</h2>
              <ul>
                {inFlight.map((e) => (
                  <EntryRow key={e.key} e={e} />
                ))}
              </ul>
            </section>
          ) : null}
          {groups.map((g, i) => (
            <section key={g.day} aria-label={g.day} className={i === 0 && !inFlight.length ? '-mt-6' : ''}>
              <h2 className="eyebrow mb-1 text-subtle">{g.day}</h2>
              <ul className="stagger">
                {g.items.map((e) => (
                  <EntryRow key={e.key} e={e} />
                ))}
              </ul>
            </section>
          ))}
          {filter !== 'local' ? (
            <div className="flex justify-center">
              {more ? (
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="press h-10 rounded-[10px] border border-field px-5 text-[14px] font-medium text-ink hover:border-ink/25 disabled:text-subtle">
                  {loadingMore ? t.activity.loadingMore : t.activity.more}
                </button>
              ) : (
                <p className="text-[13px] text-subtle">{t.activity.end}</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface Detail {
  tx: TransactionView;
  item: ActivityItem | null;
  local: SandboxReceipt | null;
}

function useDetail(id: string): { detail: Detail | null; error: unknown; loaded: boolean } {
  const { api } = useServices();
  const [state, setState] = useState<{ detail: Detail | null; error: unknown; loaded: boolean }>({ detail: null, error: null, loaded: false });
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const tx = (await api.request('Transaction', { id })).transaction;
        if (!tx) {
          if (alive) setState({ detail: null, error: null, loaded: true });
          return;
        }
        const numeric = /^[1-9]\d{0,17}$/.test(id);
        const item = numeric ? ((await api.request('Activity', { first: 1, before: (BigInt(id) + 1n).toString() })).activity.find((a) => a.id === id) ?? null) : null;
        const local = tx.domain === 'DEMO' && !numeric ? (await api.request('SandboxOp', { id })).sandboxOp : null;
        if (!alive) return;
        setState({ detail: { tx, item, local }, error: null, loaded: true });
        if (toneOf(tx.status) === 'live') timer = setTimeout(() => void load(), 3000);
      } catch (error) {
        if (alive) setState({ detail: null, error, loaded: true });
      }
    };
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [api, id]);
  return state;
}

function describe(d: Detail, payContract: string): { title: string; sign: '+' | '-' | null; local: boolean; kind: string | null } {
  const { tx, item, local } = d;
  if (local || tx.domain === 'DEMO') {
    const kind = local?.kind ?? tx.type.replace(/^SANDBOX_/, '');
    return { title: t.entries.local[kind] ?? kind, sign: kind === 'MOMO_FUND' || kind === 'BANK_FUND' ? '+' : '-', local: true, kind };
  }
  if (item) {
    const merchant = item.direction === 'OUT' && item.counterparty === payContract;
    return { title: merchant ? t.entries.merchant : item.direction === 'IN' ? t.activity.received : t.activity.sent, sign: item.direction === 'IN' ? '+' : '-', local: false, kind: null };
  }
  if (tx.type === 'DEPOSIT') return { title: t.activity.types.DEPOSIT!, sign: '+', local: false, kind: null };
  return { title: t.activity.types[tx.type] ?? tx.type, sign: '-', local: false, kind: null };
}

function rowsFor(d: Detail, payContract: string): LedgerRow[] {
  const { tx, item, local } = d;
  const info = describe(d, payContract);
  if (info.local && local) {
    const provider = providerInfo(local.provider);
    return [
      { label: t.activity.type, value: info.title },
      ...(local.recipientName ? [{ label: t.remit.recipient, value: local.recipientName }] : []),
      { label: t.activity.status, value: <Status status={local.status} /> },
      ...(localAmount(local) ? [{ label: t.activity.amount, value: formatMoney(localAmount(local)!, local.localCurrency ?? 'GHS'), strong: true }] : []),
      { label: t.activity.fee, value: localFee(local) && localFee(local) !== '0.00' ? formatMoney(localFee(local)!, local.localCurrency ?? 'GHS') : t.activity.noFee },
      { label: info.sign === '+' ? t.activity.from : t.activity.to, value: `${provider.wallet ?? provider.name} ${local.target}` },
      { label: t.activity.asset, value: t.activity.localBalance },
      { label: t.activity.created, value: longDate(local.createdAt) },
      { label: t.activity.reference, value: local.id, mono: true },
    ];
  }
  const counterparty = item?.counterpartyName ? `${item.counterpartyName} (${item.counterparty})` : (item?.counterparty ?? tx.recipient);
  return [
    { label: t.activity.type, value: info.title },
    { label: t.activity.status, value: <Status status={tx.status} /> },
    { label: t.activity.amount, value: formatUsd(tx.amount), strong: true },
    { label: t.activity.fee, value: tx.fee === null ? '-' : BigInt(tx.fee) === 0n ? t.activity.noFee : formatUsd(tx.fee) },
    { label: t.activity.asset, value: t.activity.usdcNear },
    ...(tx.sourceNetwork && tx.destinationNetwork && tx.sourceNetwork !== tx.destinationNetwork ? [{ label: t.activity.route, value: `${tx.sourceNetwork} to ${tx.destinationNetwork}` }] : []),
    ...(counterparty ? [{ label: info.sign === '+' ? t.activity.from : t.activity.to, value: counterparty, mono: !item?.counterpartyName }] : []),
    { label: t.activity.created, value: longDate(tx.createdAt) },
    ...tx.references.map((r, i) => ({ label: tx.references.length > 1 ? `${t.activity.reference} ${i + 1}` : t.activity.reference, value: r, mono: true })),
  ];
}

function TokenLine({ token }: { token: string }) {
  const [copied, copy] = useCopy();
  return (
    <div className="mt-6 rounded-[10px] border border-line bg-canvas px-5 py-4">
      <p className="text-[13px] font-medium text-muted">{t.activity.token}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="break-all font-mono text-[19px] font-semibold tracking-[0.04em] text-ink">{token}</p>
        <button type="button" onClick={() => copy(token)} aria-label={t.ui.copy} className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-field bg-surface text-ink hover:border-ink/25">
          {copied ? <CheckIcon className="h-4 w-4 text-success" /> : <CopyIcon className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function Hero({ d, payContract }: { d: Detail; payContract: string }) {
  const info = describe(d, payContract);
  const status = d.local?.status ?? d.tx.status;
  const amount = info.local && d.local && localAmount(d.local) ? `${info.sign === '+' ? '+' : String.fromCharCode(0x2212)}${formatMoney(localAmount(d.local)!, d.local.localCurrency ?? 'GHS')}` : `${info.sign === '+' ? '+' : String.fromCharCode(0x2212)}${formatUsd(d.tx.amount)}`;
  return (
    <div className="flex items-start gap-4">
      {info.local && d.local ? <ProviderLogo id={d.local.provider} size={55} /> : <TokenLogo token="USDC" size={40} />}
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-muted">{info.title}</p>
        <p className={`tabular mt-2 text-[44px] font-semibold leading-none tracking-[-0.045em] sm:text-[52px] ${info.sign === '+' && toneOf(status) !== 'bad' ? 'text-success' : 'text-ink'}`}>{amount}</p>
        <div className="mt-4">
          <Status status={status} />
        </div>
      </div>
    </div>
  );
}

export function TransactionDetail({ id }: { id: string }) {
  const { payContract } = useServices();
  const { detail, error, loaded } = useDetail(id);
  return (
    <div className="max-w-[760px]">
      <Link href="/activity" className="mb-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-muted hover:text-ink">
        <BackIcon className="h-4 w-4" />
        {t.activity.back}
      </Link>
      {!loaded ? (
        <Skeleton rows={5} />
      ) : !detail ? (
        <Notice tone="danger">{error ? messageFor(error) : t.activity.notFound}</Notice>
      ) : (
        <div className="stagger">
          <Hero d={detail} payContract={payContract} />
          {detail.local?.token ? <TokenLine token={detail.local.token} /> : null}
          <Ledger className="mt-10" rows={rowsFor(detail, payContract)} />
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href={routes.receipt(id)} className={buttonStyles.primary}>
              {t.activity.viewReceipt}
            </Link>
            {detail.tx.explorerUrls.map((u, i) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className={buttonStyles.link}>
                {t.activity.explorer}
                {detail.tx.explorerUrls.length > 1 ? ` ${i + 1}` : ''}
              </a>
            ))}
            {detail.tx.type === 'DEPOSIT' ? (
              <Link href={routes.deposit(id)} className={buttonStyles.link}>
                {t.activity.track}
              </Link>
            ) : detail.tx.type === 'WITHDRAWAL' && !/^[0-9a-f]{32}$/.test(id) ? (
              <Link href={routes.withdrawal(id)} className={buttonStyles.link}>
                {t.activity.track}
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function ReceiptLine({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-dashed border-line py-2.5 text-[14px]">
      <span className="shrink-0 text-muted">{label}</span>
      <span className={`min-w-0 text-right ${mono ? 'break-all font-mono text-[12.5px] text-ink-2' : 'text-ink'}`}>{children}</span>
    </div>
  );
}

export function Receipt({ id }: { id: string }) {
  const { payContract } = useServices();
  const { state } = useWallet();
  const { detail, error, loaded } = useDetail(id);

  if (!loaded) {
    return (
      <FlowFrame title={t.receipt.title} closeHref={routes.activity(id)}>
        <Skeleton rows={5} />
      </FlowFrame>
    );
  }
  if (!detail) {
    return (
      <FlowFrame title={t.receipt.title} closeHref="/activity">
        <Notice tone="danger">{error ? messageFor(error) : t.activity.notFound}</Notice>
      </FlowFrame>
    );
  }

  const info = describe(detail, payContract);
  const status = detail.local?.status ?? detail.tx.status;
  const tone = toneOf(status);
  const outcome = tone === 'done' ? (info.local ? t.receipt.completed : t.receipt.settled) : tone === 'bad' ? t.receipt.failed : tone === 'review' ? t.receipt.review : t.receipt.pending;
  const amount = info.local && detail.local && localAmount(detail.local) ? formatMoney(localAmount(detail.local)!, detail.local.localCurrency ?? 'GHS') : formatUsd(detail.tx.amount);
  const rows = rowsFor(detail, payContract).filter((r) => r.label !== t.activity.status);
  const me = state.status === 'ready' ? state.wallet.me : null;

  return (
    <FlowFrame title={t.receipt.title} closeHref={routes.activity(id)}>
      <article className="relative overflow-hidden rounded-[4px] border border-line bg-surface print:border-0">
        <div className="px-6 pb-7 pt-6 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <Logo className="h-[20px] w-auto" />
            <div className="text-right">
              <p className="eyebrow text-subtle">{t.receipt.number}</p>
              <p className="font-mono text-[12px] text-ink-2">{id.length > 16 ? `${id.slice(0, 8)}-${id.slice(-6)}`.toUpperCase() : id}</p>
            </div>
          </div>
          <p className="mt-9 text-[14px] text-muted">{info.title}</p>
          <p className="tabular mt-1 text-[44px] font-semibold leading-none tracking-[-0.045em] text-ink">{amount}</p>
          <p className={`mt-4 text-[14px] font-medium ${tone === 'done' ? 'text-success' : tone === 'bad' ? 'text-danger' : tone === 'review' ? 'text-warning' : 'text-brand-ink'}`}>{outcome}</p>
          {detail.local?.token ? (
            <div className="mt-6 rounded-[12px] bg-canvas px-4 py-3">
              <p className="eyebrow text-subtle">{t.activity.token}</p>
              <p className="mt-1 break-all font-mono text-[17px] font-semibold tracking-[0.04em] text-ink">{detail.local.token}</p>
            </div>
          ) : null}
          <div className="mt-7">
            {me ? <ReceiptLine label={t.receipt.account}>{me.displayName}</ReceiptLine> : null}
            {rows.map((r) => (
              <ReceiptLine key={r.label} label={r.label} mono={r.mono}>
                {r.value}
              </ReceiptLine>
            ))}
            <ReceiptLine label={t.receipt.issued}>{longDate(new Date().toISOString())}</ReceiptLine>
          </div>
          {!info.local && detail.tx.explorerUrls.length ? <p className="mt-5 text-[12.5px] leading-5 text-muted">{t.receipt.verify}</p> : null}
          <p className="mt-6 text-[12px] text-subtle">{t.receipt.footer}</p>
        </div>
      </article>
      <div className="print-hidden mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button type="button" onClick={() => window.print()} className={buttonStyles.primary}>
          {t.receipt.print}
        </button>
        {detail.tx.explorerUrls[0] ? (
          <a href={detail.tx.explorerUrls[0]} target="_blank" rel="noreferrer" className={buttonStyles.link}>
            {t.activity.explorer}
          </a>
        ) : null}
      </div>
    </FlowFrame>
  );
}

export function TransactionDetailRoute() {
  return <TransactionDetail id={useQueryId()} />;
}

export function ReceiptRoute() {
  return <Receipt id={useQueryId()} />;
}
