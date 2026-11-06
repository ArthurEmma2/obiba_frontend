import { useSearchParams } from 'next/navigation';
import { BASE_PATH } from './base-path';

const withId = (path: string, id: string) => `${path}?id=${encodeURIComponent(id)}`;

export const routes = {
  activity: (id: string) => withId('/activity/detail', id),
  receipt: (id: string) => withId('/activity/receipt', id),
  deposit: (id: string) => withId('/add/crypto/track', id),
  withdrawal: (id: string) => withId('/withdraw/track', id),
  invoice: (id: string, paymentId?: string) => `${withId('/pay/invoice', id)}${paymentId ? `&payment=${encodeURIComponent(paymentId)}` : ''}`,
};

export function useQueryId(): string {
  return useSearchParams().get('id') ?? '';
}

// The API and worker send path-style links (/pay/<id>, /activity/<id>), which a static host answers with 404.html.
export function canonicalRoute(pathname: string, search: string): string | null {
  const inApp = BASE_PATH && pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) : pathname;
  const path = inApp.replace(/\/$/, '');
  const invoice = /^\/pay\/([0-9a-f]{32})$/.exec(path);
  if (invoice) return routes.invoice(invoice[1]!, new URLSearchParams(search).get('payment') ?? undefined);
  const receipt = /^\/activity\/([^/]+)\/receipt$/.exec(path);
  if (receipt) return routes.receipt(decodeURIComponent(receipt[1]!));
  const activity = /^\/activity\/([^/]+)$/.exec(path);
  if (activity) return routes.activity(decodeURIComponent(activity[1]!));
  const deposit = /^\/add\/crypto\/([^/]+)$/.exec(path);
  if (deposit) return routes.deposit(decodeURIComponent(deposit[1]!));
  const withdrawal = /^\/withdraw\/([^/]+)$/.exec(path);
  if (withdrawal) return routes.withdrawal(decodeURIComponent(withdrawal[1]!));
  return null;
}
