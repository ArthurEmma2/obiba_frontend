import type { ActivityItem, PendingItem } from '@/lib/graphql/types';
import { t } from '@/lib/strings';

const DAY = 24 * 3600 * 1000;

export function shortDate(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (now - d.getTime() < 6 * DAY) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function shortAccount(id: string | null | undefined): string {
  if (!id) return '';
  if (id.length <= 28) return id;
  return `${id.slice(0, 12)}...${id.slice(-10)}`;
}

export function activityLabel(a: ActivityItem): string {
  if (a.kind === 'invoice_paid' && a.direction === 'OUT') return t.wallet.kinds.invoice_paid!;
  if (a.kind === 'deposit' && a.direction === 'IN') return t.wallet.kinds.deposit!;
  return a.direction === 'IN' ? t.wallet.kinds.in! : t.wallet.kinds.out!;
}

export function counterpartyOf(a: { counterparty: string | null; counterpartyName?: string | null }): string {
  return a.counterpartyName || shortAccount(a.counterparty) || '';
}

export function pendingLabel(p: PendingItem): string {
  return t.wallet.kinds[p.kind] ?? t.wallet.pending;
}

export function statusLabel(status: string): string {
  return t.wallet.statuses[status] ?? status.toLowerCase().replace(/_/g, ' ');
}
