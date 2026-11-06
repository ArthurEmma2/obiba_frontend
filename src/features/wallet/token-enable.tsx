'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { messageFor } from '@/lib/errors';
import { useServices, useSession } from '@/lib/services';
import { t } from '@/lib/strings';
import { PaymentError, signAccountCall } from './pipeline';
import { TokenLogo } from './providers';
import { useWallet } from './wallet-data';

const POLL_MS = 2_000;
const POLL_LIMIT = 45;

export function TokenEnablePrompt() {
  const services = useServices();
  const session = useSession();
  const { state, refresh } = useWallet();
  const [pending, setPending] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountId = state.status === 'ready' ? state.wallet.me.accountId : null;
  const primary = state.status === 'ready' ? state.wallet.account.usdcContract : null;

  const load = useCallback(async () => {
    try {
      return (await services.api.request('TokensToEnable', undefined)).tokensToEnable;
    } catch {
      return [];
    }
  }, [services]);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    void load().then((list) => alive && setPending(list));
    return () => {
      alive = false;
    };
  }, [accountId, load]);

  const token = pending[0];
  if (!token || !accountId || session.status !== 'signed-in') return null;
  const name = token === primary ? t.tokenEnable.circle : t.tokenEnable.other(`${token.slice(0, 6)}\u2026${token.slice(-4)}`);

  async function enable() {
    if (!token || !accountId || busy || session.status !== 'signed-in') return;
    setBusy(true);
    setError(null);
    try {
      const call = (await services.api.request('PrepareTokenEnable', { token })).prepareTokenEnable;
      const signed = await signAccountCall(services, session.user.uid, accountId, call, { method: 'add_token', token });
      await services.api.request('SubmitAccountCall', { callId: call.callId, signedDelegate: signed });
      let status = 'SUBMITTED';
      for (let i = 0; i < POLL_LIMIT && status === 'SUBMITTED'; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        status = (await services.api.request('AccountCall', { callId: call.callId })).accountCall?.status ?? 'FAILED';
      }
      if (status !== 'SETTLED') throw new Error(status === 'SUBMITTED' ? 'slow' : 'failed');
      setPending(await load());
      await refresh();
    } catch (err) {
      setError(err instanceof PaymentError ? (err.code === 'NO_DEVICE_KEY' ? t.flow.noDeviceKey : t.flow.verifyFailed) : err instanceof Error && err.message === 'slow' ? t.tokenEnable.slow : err instanceof Error && err.message === 'failed' ? t.tokenEnable.failed : messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t.tokenEnable.title(name)} className="mb-6">
      <div className="flex items-center gap-4 border-y border-hairline py-4">
        <TokenLogo token="USDC" size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">{t.tokenEnable.title(name)}</p>
          <p className="mt-0.5 hidden text-[13.5px] leading-5 text-muted sm:block">{t.tokenEnable.body}</p>
        </div>
        <Button variant="secondary" size="md" loading={busy} onClick={() => void enable()}>
          {t.tokenEnable.action}
        </Button>
      </div>
      {error ? (
        <div className="mt-4">
          <Notice tone="danger" live="assertive">
            {error}
          </Notice>
        </div>
      ) : null}
    </section>
  );
}
