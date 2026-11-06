'use client';

import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { routes } from '@/lib/routes';
import type { ActivityItem, PendingItem, SandboxReceipt } from '@/lib/graphql/types';
import { CEDI, formatMoney } from '@/lib/money';
import { t } from '@/lib/strings';
import { shortAccount, shortDate } from './format';
import { BoltIcon, CashOutIcon, DropIcon, PayIcon, PhoneIcon, ReceiveIcon, SendIcon, SignalIcon, TvIcon, WithdrawIcon, AddIcon, BankIcon } from './nav-icons';
import { ProviderLogo, TokenLogo } from './providers';
import { Amount, Status } from './ui';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export const DOT = ', ';

export interface Entry {
  key: string;
  href: string;
  title: string;
  who: string;
  method: string;
  icon: Icon;
  status: string;
  amount: string;
  ghs: string | null;
  localCurrency?: string;
  sign: '+' | '-';
  createdAt: string;
  local: boolean;
  provider?: string;
}

export function fromActivity(a: ActivityItem, payContract: string): Entry {
  const merchant = a.direction === 'OUT' && a.counterparty === payContract;
  return {
    key: `a-${a.id}`,
    href: routes.activity(a.opId ?? a.id),
    title: merchant ? t.entries.merchant : a.direction === 'IN' ? t.entries.received : t.entries.sent,
    who: a.counterpartyName || shortAccount(a.counterparty) || '',
    method: merchant ? t.entries.methodInvoice : t.entries.methodNear,
    icon: merchant ? PayIcon : a.direction === 'IN' ? ReceiveIcon : SendIcon,
    status: a.status,
    amount: a.amount,
    ghs: null,
    sign: a.direction === 'IN' ? '+' : '-',
    createdAt: a.createdAt,
    local: false,
  };
}

export function fromPending(p: PendingItem): Entry {
  const kinds: Record<string, { title: string; icon: Icon; method: string; sign: '+' | '-' }> = {
    TRANSFER: { title: t.entries.sending, icon: SendIcon, method: t.entries.methodNear, sign: '-' },
    INVOICE_PAYMENT: { title: t.entries.paying, icon: PayIcon, method: t.entries.methodInvoice, sign: '-' },
    DEPOSIT: { title: t.entries.adding, icon: AddIcon, method: t.entries.methodCrossChain, sign: '+' },
    WITHDRAWAL: { title: t.entries.withdrawing, icon: WithdrawIcon, method: t.entries.methodCrossChain, sign: '-' },
  };
  const k = kinds[p.kind] ?? kinds.TRANSFER!;
  return {
    key: `p-${p.id}`,
    href: routes.activity(p.id),
    title: k.title,
    who: shortAccount(p.counterparty),
    method: k.method,
    icon: k.icon,
    status: p.status,
    amount: p.amount,
    ghs: null,
    sign: k.sign,
    createdAt: p.createdAt,
    local: false,
  };
}

const LOCAL_ICONS: Record<string, Icon> = { MOMO_FUND: PhoneIcon, BANK_FUND: BankIcon, MOMO_PAYOUT: CashOutIcon, BANK_PAYOUT: BankIcon, AIRTIME: PhoneIcon, DATA: SignalIcon, ECG: BoltIcon, WATER: DropIcon, TV: TvIcon };

export function fromLocal(r: SandboxReceipt): Entry {
  const credit = r.kind === 'MOMO_FUND' || r.kind === 'BANK_FUND';
  return {
    key: `l-${r.id}`,
    href: routes.activity(r.id),
    title: r.recipientName ? t.entries.sentTo(r.recipientName) : (t.entries.local[r.kind] ?? r.kind),
    who: `${r.provider} ${r.target}`,
    method: t.entries.methodLocal,
    icon: LOCAL_ICONS[r.kind] ?? CashOutIcon,
    status: r.status,
    amount: r.amount,
    ghs: r.amountLocal ?? r.amountGhs,
    localCurrency: r.localCurrency ?? 'GHS',
    sign: credit ? '+' : '-',
    createdAt: r.createdAt,
    local: true,
    provider: r.provider,
  };
}

function EntryAmount({ e }: { e: Entry }) {
  const cls = `text-[15px] font-semibold ${e.sign === '+' && e.status !== 'FAILED' ? 'text-success' : 'text-ink'} ${e.status === 'FAILED' ? 'line-through decoration-1 opacity-60' : ''}`;
  if (e.local) {
    return (
      <span className={`tabular whitespace-nowrap ${cls}`}>
        {e.sign === '+' ? '+' : String.fromCharCode(0x2212)}
        {e.ghs ? formatMoney(e.ghs, e.localCurrency ?? 'GHS') : `${CEDI} -`}
      </span>
    );
  }
  return <Amount units={e.amount} sign={e.sign} className={cls} />;
}

export function EntryRow({ e }: { e: Entry }) {
  return (
    <li className="border-b border-hairline last:border-b-0">
      <Link
        href={e.href}
        className="group -mx-3 grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 rounded-[8px] px-3 py-3 outline-none transition-colors duration-200 hover:bg-canvas focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-brand/60 md:grid-cols-[2.5rem_minmax(0,1fr)_9rem_8.5rem_7.5rem]"
      >
        <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center">
          {e.provider ? <ProviderLogo id={e.provider} size={35} /> : e.local ? null : <TokenLogo token="USDC" size={26} />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium text-ink">{e.title}</span>
          <span className="block truncate text-[13px] text-muted">
            {e.who}
            <span className="md:hidden">
              {e.who ? DOT : ''}
              {shortDate(e.createdAt)}
            </span>
          </span>
        </span>
        <span className="hidden truncate text-[13px] text-muted md:block">{e.method}</span>
        <span className="hidden md:block">
          <Status status={e.status} />
        </span>
        <span className="flex flex-col items-end gap-0.5">
          <EntryAmount e={e} />
          <span className="hidden text-[12.5px] text-subtle md:block">{shortDate(e.createdAt)}</span>
          <span className="md:hidden">{e.status !== 'POSTED' && e.status !== 'SUCCEEDED' ? <Status status={e.status} className="text-[12px]" /> : null}</span>
        </span>
      </Link>
    </li>
  );
}

export function EntryHeader() {
  return (
    <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_9rem_8.5rem_7.5rem] gap-x-4 border-b border-hairline pb-2.5 text-[12px] font-medium text-subtle md:grid" aria-hidden="true">
      <span />
      <span>{t.entries.colDescription}</span>
      <span>{t.entries.colMethod}</span>
      <span>{t.entries.colStatus}</span>
      <span className="text-right">{t.entries.colAmount}</span>
    </div>
  );
}
