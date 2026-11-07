'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { isApiError } from '@/lib/errors';
import { useServices } from '@/lib/services';
import { ReauthPanel } from './reauth-panel';

export const FRESH_SESSION_LIMIT_S = 240;

export class StepUpCancelled extends Error {
  constructor() {
    super('step-up cancelled');
    this.name = 'StepUpCancelled';
  }
}

interface Pending {
  retry: () => void;
  cancel: () => void;
}

export function useStepUp(): { run: <T>(action: () => Promise<T>, opts?: { requireFresh?: boolean }) => Promise<T>; panel: ReactNode; active: boolean } {
  const { auth } = useServices();
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const open = (p: Pending) => {
    pendingRef.current = p;
    setPending(p);
  };
  const close = () => {
    pendingRef.current = null;
    setPending(null);
  };

  const run = useCallback(
    <T,>(action: () => Promise<T>, opts: { requireFresh?: boolean } = {}): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        let reauthed = false;
        const attempt = async () => {
          try {
            if (opts.requireFresh && !reauthed) {
              const age = await auth.authAgeSeconds();
              if (age === null || age > FRESH_SESSION_LIMIT_S) {
                open({ retry: () => void attempt(), cancel: () => reject(new StepUpCancelled()) });
                reauthed = true;
                return;
              }
            }
            resolve(await action());
          } catch (err) {
            if (isApiError(err, 'STEP_UP_REQUIRED') && !pendingRef.current && !reauthed) {
              open({ retry: () => void attempt(), cancel: () => reject(new StepUpCancelled()) });
              reauthed = true;
              return;
            }
            reject(err);
          }
        };
        void attempt();
      }),
    [auth],
  );

  const panel = pending ? (
    <ReauthPanel
      onDone={() => {
        const p = pendingRef.current;
        close();
        p?.retry();
      }}
      onCancel={() => {
        const p = pendingRef.current;
        close();
        p?.cancel();
      }}
    />
  ) : null;

  return { run, panel, active: pending !== null };
}
