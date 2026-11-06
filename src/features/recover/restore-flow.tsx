'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthHeading } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { DeviceKeyError } from '@/lib/crypto/device-key';
import { messageFor } from '@/lib/errors';
import type { SupportRequestStatus } from '@/lib/graphql/types';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { loadRestore, saveRestore, type SavedRestore } from './storage';

type View =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'confirm'; uid: string; firstName: string }
  | { kind: 'status'; saved: SavedRestore; status: SupportRequestStatus | null };

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function RestoreFlow({ token }: { token: string | null }) {
  const { api, device } = useServices();
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linkToken = useRef(token);
  const inFlight = useRef(false);

  const loadStatus = useCallback(
    async (saved: SavedRestore) => {
      try {
        const r = await api.request('SupportRequestStatus', { caseId: saved.caseId, statusToken: saved.statusToken });
        setView({ kind: 'status', saved, status: r.supportRequestStatus });
      } catch (err) {
        setError(messageFor(err));
        setView({ kind: 'status', saved, status: null });
      }
    },
    [api],
  );

  useEffect(() => {
    const t0 = linkToken.current;
    if (t0) {
      router.replace('/recover');
      api.request('SupportLink', { token: t0 }).then(
        (r) => setView(r.supportLink ? { kind: 'confirm', uid: r.supportLink.uid, firstName: r.supportLink.firstName } : { kind: 'invalid' }),
        () => setView({ kind: 'invalid' }),
      );
      return;
    }
    void (async () => {
      const saved = loadRestore();
      if (saved) await loadStatus(saved);
      else setView({ kind: 'invalid' });
    })();
  }, [api, router, loadStatus]);

  useEffect(() => {
    if (view.kind !== 'status' || view.status?.activated) return;
    const id = setInterval(() => void loadStatus(view.saved), 30_000);
    return () => clearInterval(id);
  }, [view, loadStatus]);

  async function confirm(uid: string) {
    const t0 = linkToken.current;
    if (!t0 || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      let key = await device.load(uid);
      if (key && !(await device.verify(key))) throw new DeviceKeyError('roundtrip');
      if (!key) key = await device.create(uid);
      await device.requestPersistence();
      const r = (await api.request('ConfirmSupportRecovery', { token: t0, newPublicKey: key.publicKey })).confirmSupportRecovery;
      linkToken.current = null;
      const saved = { caseId: r.caseId, statusToken: r.statusToken, uid };
      saveRestore(saved);
      await loadStatus(saved);
    } catch (err) {
      setError(err instanceof DeviceKeyError ? t.device.unsupported : messageFor(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (view.kind === 'loading') {
    return (
      <div className="flex items-center gap-3 text-muted" role="status">
        <Spinner />
        <span>{t.common.loading}</span>
      </div>
    );
  }

  if (view.kind === 'invalid') {
    return (
      <div>
        <AuthHeading title={t.restore.requestTitle} lead={t.restore.linkInvalid} />
        <Link href="/recover/request" className="inline-flex h-12 items-center justify-center rounded-md bg-brand px-6 text-[15px] font-medium text-white hover:bg-brand-pressed">
          {t.restore.again}
        </Link>
      </div>
    );
  }

  const steps = (
    <ol className="mb-8 flex flex-col">
      {t.restore.steps.map((s, i) => (
        <li key={i} className="flex gap-4 border-b border-hairline py-3 text-[15px] leading-6 text-ink-2 first:border-t">
          <span className="tabular w-4 shrink-0 font-semibold text-brand-ink">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );

  if (view.kind === 'confirm') {
    return (
      <div>
        <AuthHeading title={t.restore.linkTitle(view.firstName)} lead={t.restore.linkLead} />
        {steps}
        {error ? (
          <div className="mb-5">
            <Notice tone="danger" live="assertive">
              {error}
            </Notice>
          </div>
        ) : null}
        <Button block loading={busy} loadingLabel={t.common.working} onClick={() => void confirm(view.uid)}>
          {t.restore.confirm}
        </Button>
      </div>
    );
  }

  const s = view.status;
  const done = s?.activated === true;
  return (
    <div>
      <AuthHeading title={t.restore.statusTitle} lead={done ? t.restore.done : s ? (t.restore.status[s.status] ?? s.status) : undefined} />
      {s && !done && s.status !== 'REJECTED' && s.status !== 'CANCELLED' ? (
        <p className="mb-6 text-[15px] font-medium text-ink">{s.movesAt ? t.restore.moves(when(s.movesAt)) : t.restore.earliest(when(s.earliestAt))}</p>
      ) : null}
      {s?.closedReason ? <p className="mb-6 text-[15px] text-ink-2">{s.closedReason}</p> : null}
      {!done ? steps : null}
      {error ? (
        <div className="mb-5">
          <Notice tone="danger" live="assertive">
            {error}
          </Notice>
        </div>
      ) : null}
      {done ? (
        <Link href="/sign-in" className="inline-flex h-12 w-full items-center justify-center rounded-md bg-brand px-6 text-[15px] font-medium text-white hover:bg-brand-pressed">
          {t.restore.signIn}
        </Link>
      ) : (
        <Button variant="secondary" block onClick={() => void loadStatus(view.saved)}>
          {t.restore.refresh}
        </Button>
      )}
    </div>
  );
}

export function RestoreFlowRoute() {
  const params = useSearchParams();
  const [token] = useState(() => {
    const value = params.get('token');
    return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  });
  return <RestoreFlow token={token} />;
}
