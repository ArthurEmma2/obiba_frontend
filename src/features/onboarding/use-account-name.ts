'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from '@/lib/graphql/client';
import { normalizeAccountNameInput } from '@/lib/validation';

export type NameCheck =
  | { state: 'idle' }
  | { state: 'checking'; name: string }
  | { state: 'available'; name: string; accountId: string }
  | { state: 'unavailable'; name: string; reason: string; suggestions: string[] }
  | { state: 'error'; name: string };

type Answer = Exclude<NameCheck, { state: 'idle' } | { state: 'checking' }> & { nonce: number };

export const NAME_DEBOUNCE_MS = 350;

export function useAccountName(api: ApiClient, raw: string) {
  const name = normalizeAccountNameInput(raw);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!name) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      api.request('AccountNameAvailability', { name }, { signal: ctrl.signal }).then(
        ({ accountNameAvailability: r }) => {
          if (ctrl.signal.aborted) return;
          if (r.available && r.accountId) setAnswer({ state: 'available', name, accountId: r.accountId, nonce });
          else setAnswer({ state: 'unavailable', name, reason: r.reason ?? 'UNKNOWN', suggestions: r.suggestions, nonce });
        },
        () => {
          if (!ctrl.signal.aborted) setAnswer({ state: 'error', name, nonce });
        },
      );
    }, NAME_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [api, name, nonce]);

  const recheck = useCallback(() => setNonce((n) => n + 1), []);

  let check: NameCheck;
  if (!name) check = { state: 'idle' };
  else if (!answer || answer.name !== name || answer.nonce !== nonce) check = { state: 'checking', name };
  else if (answer.state === 'available') check = { state: 'available', name, accountId: answer.accountId };
  else if (answer.state === 'unavailable') check = { state: 'unavailable', name, reason: answer.reason, suggestions: answer.suggestions };
  else check = { state: 'error', name };
  return { name, check, recheck };
}
