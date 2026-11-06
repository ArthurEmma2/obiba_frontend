'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type DisplayCurrency = 'USDC' | 'GHS';

const CURRENCY_KEY = 'obiba:display-currency';
const listeners = new Set<() => void>();
let chosen: DisplayCurrency | null = null;

function readCurrency(): DisplayCurrency {
  if (chosen) return chosen;
  try {
    return localStorage.getItem(CURRENCY_KEY) === 'GHS' ? 'GHS' : 'USDC';
  } catch {
    return 'USDC';
  }
}

export function useDisplayCurrency(): [DisplayCurrency, (c: DisplayCurrency) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readCurrency,
    () => 'USDC' as DisplayCurrency,
  );
  const set = useCallback((c: DisplayCurrency) => {
    chosen = c;
    try {
      localStorage.setItem(CURRENCY_KEY, c);
    } catch {
      chosen = c;
    }
    listeners.forEach((l) => l());
  }, []);
  return [value, set];
}
