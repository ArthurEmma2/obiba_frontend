'use client';

import Link from 'next/link';
import { useMemo, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { messageFor } from '@/lib/errors';
import type { SpendingLimit } from '@/lib/graphql/types';
import { CEDI, formatLocal, formatUsd } from '@/lib/money';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { EntryHeader, EntryRow, fromActivity, fromPending } from './entries';
import { AddIcon, CashOutIcon, CheckIcon, ChevronIcon, CopyIcon, PayIcon, ReceiveIcon, SendIcon, WithdrawIcon } from './nav-icons';
import { ProviderLogos } from './providers';
import { TokenEnablePrompt } from './token-enable';
import { useBalanceDisplay } from './shell';
import { Empty, Segmented, useCopy } from './ui';
import { realBalance, useDisplayCurrency, useWallet, type WalletState } from './wallet-data';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export function Side({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-ink-2">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function LimitBlock({ limit }: { limit: SpendingLimit | null }) {
  if (!limit || limit.frozenUntil) return <p className="text-[14px] font-medium text-ink">{t.wallet.frozen}</p>;
  const daily = BigInt(limit.dailyLimit);
  const spent = BigInt(limit.spent24h);
  const ratio = daily > 0n ? Number((spent * 1000n) / daily) / 1000 : 0;
  return (
    <>
      <p className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{t.wallet.canSend(formatUsd(limit.remaining))}</p>
      <div className="mt-3 h-[4px] overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className="h-full origin-left rounded-full bg-ink transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ transform: `scaleX(${Math.min(1, ratio)})` }} />
      </div>
      <p className="mt-2.5 text-[13px] text-muted">{t.wallet.limitOf(formatUsd(limit.spent24h), formatUsd(limit.dailyLimit))}</p>
    </>
  );
}

function partOfDay(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

const ACTIONS: Array<{ key: string; label: string; href: string; icon: Icon; money: boolean }> = [
  { key: 'add', label: t.wallet.nav.add, href: '/add', icon: AddIcon, money: false },
  { key: 'send', label: t.wallet.nav.send, href: '/send', icon: SendIcon, money: true },
  { key: 'pay', label: t.wallet.nav.pay, href: '/pay', icon: PayIcon, money: true },
  { key: 'withdraw', label: t.wallet.nav.withdraw, href: '/withdraw', icon: WithdrawIcon, money: true },
  { key: 'cashout', label: t.wallet.nav.cashOut, href: '/cash-out', icon: CashOutIcon, money: true },
];

function Actions({ viewOnly }: { viewOnly: boolean }) {
  return (
    <nav aria-label={t.wallet.actionsLabel} className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:flex md:flex-wrap">
      {ACTIONS.map((a, i) => {
        const Icon = a.icon;
        const disabled = viewOnly && a.money;
        const cls = `press flex h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-[15px] font-medium md:justify-start md:px-5 ${
          disabled ? 'cursor-not-allowed bg-white/[0.08] text-white/40' : i === 0 ? 'bg-white text-statement hover:bg-white/90' : 'bg-white/[0.14] text-white hover:bg-white/[0.22]'
        } ${i === 0 ? 'col-span-2 sm:col-span-1' : ''}`;
        const inner = (
          <>
            <Icon className="h-[18px] w-[18px]" />
            {a.label}
          </>
        );
        return disabled ? (
          <span key={a.key} aria-disabled="true" className={cls}>
            {inner}
          </span>
        ) : (
          <Link key={a.key} href={a.href} className={cls}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}

function CardMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 640 420" preserveAspectRatio="xMaxYMid slice" className="pointer-events-none absolute right-0 top-0 -z-10 h-[46%] w-[92%] sm:inset-y-0 sm:h-full sm:w-[62%]">
      <rect x="250" y="-40" width="560" height="150" rx="75" transform="rotate(-30 530 35)" fill="#ffffff" fillOpacity="0.07" />
      <rect x="210" y="150" width="560" height="150" rx="75" transform="rotate(-30 490 225)" fill="#004fb3" fillOpacity="0.55" />
      <rect x="330" y="330" width="560" height="150" rx="75" transform="rotate(-30 610 405)" fill="#ffffff" fillOpacity="0.05" />
    </svg>
  );
}

function Statement({ state }: { state: Extract<WalletState, { status: 'ready' }> }) {
  const [currency, setCurrency] = useDisplayCurrency();
  const shown = useBalanceDisplay();
  const [copied, copy] = useCopy();
  const { wallet, rate } = state;
  const usdc = realBalance(wallet);
  const held = BigInt(usdc.held);
  const pending = wallet.pendingActivity.length;
  const ghsMissing = currency === 'GHS' && (!shown || shown.rateMissing);
  const usd = formatUsd(usdc.available).replace('$', '');
  const [usdWhole, usdFrac] = usd.split('.');
  const whole = ghsMissing || !shown ? usdWhole : shown.whole;
  const fraction = ghsMissing || !shown ? usdFrac : shown.fraction;
  const symbol = currency === 'GHS' && !ghsMissing ? CEDI : '$';

  return (
    <section aria-labelledby="available-h" className="relative isolate overflow-hidden rounded-[16px] bg-statement px-6 pb-6 pt-6 text-white sm:px-9 sm:pb-8 sm:pt-8">
      <CardMark />
      <div className="flex items-center justify-between gap-4">
        <p id="available-h" className="flex items-center gap-2 text-[14px] font-medium text-white/85">
          {t.overview.availableUsdc}
        </p>
        <Segmented
          tone="onBlue"
          label={t.overview.show}
          value={currency}
          onChange={setCurrency}
          options={[
            { value: 'USDC', label: 'USDC' },
            { value: 'GHS', label: CEDI },
          ]}
        />
      </div>

      <p key={`${symbol}${whole}${fraction}`} className="tabular mt-5 flex animate-settle items-baseline whitespace-nowrap font-semibold leading-none tracking-[-0.05em]" aria-label={`${symbol} ${whole}.${fraction}`}>
        <span aria-hidden="true" className="mr-2 self-start pt-[0.35em] text-[22px] font-medium tracking-[-0.02em] text-white/70 sm:text-[30px]">
          {symbol}
        </span>
        <span aria-hidden="true" className="text-[52px] sm:text-[76px] lg:text-[84px]">
          {whole}
        </span>
        <span aria-hidden="true" className="text-[26px] text-white/60 sm:text-[38px] lg:text-[42px]">
          .{fraction}
        </span>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] leading-5 text-white/75">
        {currency === 'GHS' ? ghsMissing ? <span>{t.overview.ghsMissing}</span> : null : <span>{t.overview.usdcNote}</span>}
        {wallet.me.accountId ? (
          <button
            type="button"
            onClick={() => copy(wallet.me.accountId!)}
            className="press group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-[6px] text-white/70 hover:text-white"
            aria-label={`${t.ui.copy} ${wallet.me.accountId}`}
          >
            <span className="truncate font-mono text-[12.5px]">{wallet.me.accountId}</span>
            {copied ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : <CopyIcon className="h-3.5 w-3.5 shrink-0" />}
            <span className="sr-only" aria-live="polite">
              {copied ? t.ui.copied : ''}
            </span>
          </button>
        ) : null}
      </div>
      {held > 0n || pending > 0 ? (
        <p className="mt-2 text-[14px] text-white">
          {held > 0n ? t.overview.held(formatUsd(usdc.held)) : t.overview.pendingCount(pending)}
        </p>
      ) : null}

      <div className="mt-7 border-t border-white/[0.16] pt-6 sm:mt-8">
        <Actions viewOnly={wallet.me.viewOnly} />
      </div>
    </section>
  );
}

const BILLS: Array<{ key: keyof typeof t.overview.services; href: string; logos: string[] }> = [
  { key: 'airtime', href: '/services/airtime', logos: ['MTN', 'TELECEL'] },
  { key: 'data', href: '/services/data', logos: ['MTN', 'TELECEL'] },
  { key: 'electricity', href: '/services/electricity', logos: ['ECG'] },
  { key: 'water', href: '/services/water', logos: ['GWL'] },
  { key: 'tv', href: '/services/tv', logos: [] },
];

function Everyday() {
  return (
    <ul>
      {BILLS.map((b) => (
        <li key={b.key} className="border-b border-hairline last:border-b-0">
          <Link href={b.href} className="group -mx-2 flex h-12 items-center justify-between gap-3 rounded-[8px] px-2 text-[14.5px] font-medium text-ink hover:bg-canvas">
            {t.overview.services[b.key]}
            <span className="flex items-center gap-2">
              <ProviderLogos ids={b.logos} size={27} />
              <ChevronIcon className="h-4 w-4 text-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Recent({ state }: { state: Extract<WalletState, { status: 'ready' }> }) {
  const { payContract } = useServices();
  const entries = useMemo(
    () => [...state.wallet.pendingActivity.slice(0, 3).map(fromPending), ...state.wallet.activity.filter((a) => a.domain === 'REAL').map((a) => fromActivity(a, payContract))].slice(0, 6),
    [state.wallet, payContract],
  );
  return (
    <section aria-labelledby="recent-h">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="recent-h" className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
          {t.wallet.recent}
        </h2>
        {entries.length ? (
          <Link href="/activity" className="text-[14px] font-medium text-brand-ink underline-offset-4 hover:underline">
            {t.wallet.allActivity}
          </Link>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <div className="border-t border-hairline">
          <Empty
            title={t.wallet.emptyTitle}
            body={t.wallet.emptyBody}
            action={
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/receive" className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-action px-5 sm:w-auto text-[15px] font-medium text-white shadow-button hover:bg-action-hover">
                  <ReceiveIcon className="h-[18px] w-[18px]" />
                  {t.wallet.emptyAction}
                </Link>
                <Link href="/add" className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-field px-5 sm:w-auto text-[15px] font-medium text-ink hover:border-ink/25 hover:bg-canvas">
                  <AddIcon className="h-[18px] w-[18px]" />
                  {t.wallet.emptySecondary}
                </Link>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <EntryHeader />
          <ul className="stagger">
            {entries.map((e) => (
              <EntryRow key={e.key} e={e} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Loading() {
  return (
    <div aria-busy="true">
      <div className="mb-8 h-8 w-64 max-w-full animate-pulse rounded-lg bg-wash" />
      <div className="h-[300px] animate-pulse rounded-[16px] bg-wash" />
    </div>
  );
}

export function Overview() {
  const { state, refresh } = useWallet();

  if (state.status === 'loading') return <Loading />;

  if (state.status === 'error') {
    return (
      <div className="max-w-[36rem] pt-4">
        <Notice tone="danger" live="assertive" title={t.wallet.loadFailed} action={<Button variant="secondary" size="md" onClick={() => void refresh()}>{t.common.retry}</Button>}>
          {messageFor(state.error)}
        </Notice>
      </div>
    );
  }

  const { wallet, limit, local } = state;
  const first = wallet.me.displayName.split(/\s+/)[0] ?? wallet.me.displayName;
  const time = new Date(state.refreshedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const frozen = wallet.me.accountStatus === 'frozen' || wallet.me.accountStatus === 'quarantined';

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 lg:mb-8">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[32px]">{t.overview.greeting(partOfDay(), first)}</h1>
        <div className="flex items-center gap-4 text-[13px]">
          <span className="tabular text-muted">{state.refreshing ? t.wallet.refreshing : t.wallet.updated(time)}</span>
          <button type="button" onClick={() => void refresh()} disabled={state.refreshing} className="press rounded-sm font-medium text-brand-ink underline-offset-4 hover:underline disabled:text-subtle">
            {t.wallet.refresh}
          </button>
        </div>
      </header>

      {wallet.me.viewOnly || frozen ? (
        <div className="mb-6">
          <Notice tone={frozen ? 'warning' : 'info'} title={frozen ? t.wallet.frozen : t.accountPage.viewOnlyTitle}>
            {frozen ? null : t.wallet.viewOnly}
          </Notice>
        </div>
      ) : null}

      {wallet.me.viewOnly || frozen ? null : <TokenEnablePrompt />}

      <div className="grid gap-x-10 gap-y-12 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-12">
          <Statement state={state} />
          <Recent state={state} />
        </div>
        <aside className="stagger grid content-start gap-8 sm:grid-cols-2 sm:gap-x-10 xl:grid-cols-1 xl:gap-7">
          <Side title={t.wallet.today}>
            <LimitBlock limit={limit} />
          </Side>
          <div className="sm:col-span-2 xl:col-span-1">
            <Side title={t.overview.everyday}>
              <Everyday />
            </Side>
          </div>
        </aside>
      </div>
    </div>
  );
}
