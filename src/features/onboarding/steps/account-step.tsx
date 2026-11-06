'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import type { StreamState } from '@/lib/graphql/client';
import type { Me } from '@/lib/graphql/types';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { Address, DrawnCheck } from '../marks';
import { StepHeader } from '../onboarding-layout';

const POLL_ACTIVE_MS = 4000;
const POLL_WAITLIST_MS = 30_000;
const SLOW_AFTER_MS = 90_000;
const STAGES = t.account.stages;

function Track({ stage, paused }: { stage: 0 | 1 | 2 | 3; paused: boolean }) {
  return (
    <ol className="border-y border-hairline" aria-label={t.account.title}>
      {STAGES.map((label, i) => {
        const done = stage > i || stage === 3;
        const active = stage === i && !paused;
        return (
          <li key={label} className="flex items-center gap-3 border-b border-hairline py-3 last:border-b-0" aria-current={active ? 'step' : undefined}>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
              {done ? <DrawnCheck className="h-4 w-4 text-ink" /> : active ? <Spinner className="h-4 w-4 text-brand" /> : null}
            </span>
            <span className={`flex-1 text-[15px] transition-colors duration-500 ${done ? 'text-ink' : active ? 'font-medium text-ink' : 'text-subtle'}`}>{label}</span>
            {paused && stage === i ? <span className="text-[13px] font-medium text-warning">{t.account.pausedLabel}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function AccountStep({ initial, onActive }: { initial: Me; onActive: () => void }) {
  const { api, supportEmail, accountParent } = useServices();
  const [me, setMe] = useState<Me>(initial);
  const [stream, setStream] = useState<StreamState>('connecting');
  const [checkedAt, setCheckedAt] = useState<Date>(() => new Date());
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);

  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const r = await api.request('Me');
      setMe(r.me);
      setFailed(false);
      setCheckedAt(new Date());
    } catch {
      setFailed(true);
    } finally {
      loading.current = false;
    }
  }, [api]);

  const status = me.accountStatus;
  const waitlisted = !me.pilotAllowed && status === null;
  const settled = status === 'active' || status === 'quarantined' || status === 'frozen';

  useEffect(() => {
    if (settled) return;
    return api.subscribe('AccountEvents', () => void refresh(), setStream);
  }, [api, refresh, settled]);

  useEffect(() => {
    if (settled) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, waitlisted ? POLL_WAITLIST_MS : POLL_ACTIVE_MS);
    return () => clearInterval(id);
  }, [refresh, settled, waitlisted]);

  useEffect(() => {
    if (settled || waitlisted) return;
    const id = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(id);
  }, [settled, waitlisted]);

  const name = me.accountName ?? '';
  const stage: 0 | 1 | 2 | 3 = status === 'active' ? 3 : status === 'provisioning' ? 1 : status === 'quarantined' || status === 'frozen' ? 1 : 0;
  const halted = status === 'quarantined' || status === 'frozen';

  const title = status === 'active' ? t.account.activeTitle : waitlisted ? t.account.waitlistTitle : status === 'quarantined' ? t.account.quarantinedTitle : status === 'frozen' ? t.account.frozenTitle : t.account.title;
  const lead = waitlisted ? t.account.waitlist : status === 'quarantined' ? t.account.quarantined : status === 'frozen' ? t.account.frozen : status === 'active' ? undefined : t.account.lead;
  const time = checkedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="max-w-[46rem]">
      <div key={title} className="animate-rise">
        <StepHeader step="account" title={title} lead={lead} />
      </div>
      <div className="stagger flex flex-col gap-10">
        <Address name={name} suffix={accountParent} muted={status !== 'active'} />
        <div role="status" aria-live="polite">
          <Track stage={stage} paused={waitlisted || halted} />
          {!settled ? (
            <p className="mt-6 flex items-center gap-2 text-[13px] text-muted">
              {stream === 'live' ? t.account.live : t.account.polling}
              <span aria-hidden="true">/</span>
              <span className="tabular">{t.account.lastChecked(time)}</span>
            </p>
          ) : null}
        </div>
        {slow && !waitlisted && !settled ? (
          <Notice tone="info" live="polite">
            {t.account.slow}
          </Notice>
        ) : null}
        {failed ? (
          <Notice tone="danger" live="polite" action={<Button variant="secondary" size="md" onClick={() => void refresh()}>{t.common.retry}</Button>}>
            {t.errors.NETWORK}
          </Notice>
        ) : null}
        {status === 'active' ? (
          <div>
            <Button onClick={onActive}>{t.common.continue}</Button>
          </div>
        ) : halted ? (
          <div>
            <a href={`mailto:${supportEmail}`} className="press inline-flex h-12 items-center justify-center rounded-md bg-action px-6 text-[15px] font-medium text-white shadow-button hover:bg-action-hover">
              {t.common.contactSupport}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
