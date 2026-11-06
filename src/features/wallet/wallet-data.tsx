'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ApiClient } from '@/lib/graphql/client';
import type { Balance, IndicativeRate, SpendingLimit, Wallet } from '@/lib/graphql/types';
import { useServices } from '@/lib/services';

export interface LocalBalance {
  balance: Balance;
  rate: string | null;
}

export type WalletState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; wallet: Wallet; limit: SpendingLimit | null; local: LocalBalance | null; rate: IndicativeRate | null; refreshedAt: number; refreshing: boolean };

interface WalletContextValue {
  state: WalletState;
  refresh: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function realBalance(wallet: Wallet): Balance {
  return wallet.balances.find((b) => b.domain === 'REAL') ?? { domain: 'REAL', currency: 'USDC', posted: '0', held: '0', available: '0' };
}

type Loaded = { wallet: Wallet; limit: SpendingLimit | null; local: LocalBalance | null; rate: IndicativeRate | null };

async function fetchWallet(api: ApiClient): Promise<Loaded> {
  const [wallet, limit, rate] = await Promise.all([
    api.request('Wallet'),
    api.request('SpendingLimit').then(
      (r) => r.spendingLimit,
      () => null,
    ),
    api.request('IndicativeRate').then(
      (r) => r.indicativeRate,
      () => null,
    ),
  ]);
  const demo = wallet.balances.find((b) => b.domain === 'DEMO');
  const local =
    demo && BigInt(demo.posted) > 0n
      ? await api.request('LocalBalance').then(
          (r) => ({ balance: r.demoBalance, rate: r.sandboxCatalog.simulatedRate }),
          () => null,
        )
      : null;
  return { wallet, limit, local, rate };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { api } = useServices();
  const [state, setState] = useState<WalletState>({ status: 'loading' });
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setState((s) => (s.status === 'ready' ? { ...s, refreshing: true } : s));
    try {
      const loaded = await fetchWallet(api);
      if (my === seq.current) setState({ status: 'ready', ...loaded, refreshedAt: Date.now(), refreshing: false });
    } catch (error) {
      if (my !== seq.current) return;
      setState((s) => (s.status === 'ready' ? { ...s, refreshing: false } : { status: 'error', error }));
    }
  }, [api]);

  useEffect(() => {
    let alive = true;
    fetchWallet(api).then(
      (loaded) => {
        if (alive) setState({ status: 'ready', ...loaded, refreshedAt: Date.now(), refreshing: false });
      },
      (error: unknown) => {
        if (alive) setState({ status: 'error', error });
      },
    );
    return () => {
      alive = false;
    };
  }, [api]);

  useEffect(() => {
    const soon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(), 400);
    };
    const offBalance = api.subscribe('BalanceChanged', soon);
    const offTx = api.subscribe('TransactionUpdated', soon);
    const onFocus = () => {
      if (document.visibilityState === 'visible') soon();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      offBalance();
      offTx();
      document.removeEventListener('visibilitychange', onFocus);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [api, load]);

  return <WalletContext.Provider value={{ state, refresh: load }}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const v = useContext(WalletContext);
  if (!v) throw new Error('WalletProvider is missing');
  return v;
}

export { useDisplayCurrency, type DisplayCurrency } from './display-currency';
