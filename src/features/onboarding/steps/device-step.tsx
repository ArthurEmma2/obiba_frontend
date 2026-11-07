'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShareIcon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { DeviceKeyError, type PersistenceStatus, type StoredDeviceKey } from '@/lib/crypto/device-key';
import { isApiError, messageFor } from '@/lib/errors';
import type { DeviceView, RecoveryView, SupportCaseView } from '@/lib/graphql/types';
import { TextButton } from '@/components/ui/button';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { StepUpCancelled, useStepUp } from '../../session/use-step-up';
import type { LocalKey } from '../derive';
import { PhaseList, type PhaseState } from '../marks';
import { Actions, StepHeader } from '../onboarding-layout';

type View =
  | { kind: 'intro' }
  | { kind: 'ios' }
  | { kind: 'working'; phase: number }
  | { kind: 'ready'; persistence: PersistenceStatus }
  | { kind: 'unsupported' }
  | { kind: 'storage' }
  | { kind: 'unlinked' }
  | { kind: 'moving'; recovery: RecoveryView }
  | { kind: 'ask-support' }
  | { kind: 'support'; kase: SupportCaseView };

function initialView(localKey: LocalKey, devices: DeviceView[], ios: boolean, moving: RecoveryView | null, support: SupportCaseView | null): View {
  if (moving) return { kind: 'moving', recovery: moving };
  if (support) return { kind: 'support', kase: support };
  if (localKey.state === 'unsupported') return { kind: 'unsupported' };
  if (localKey.state === 'storage-unavailable') return { kind: 'storage' };
  if (devices.some((d) => d.status !== 'revoked')) return { kind: 'unlinked' };
  return ios ? { kind: 'ios' } : { kind: 'intro' };
}

function phasesFor(phase: number): Array<{ label: string; state: PhaseState }> {
  return t.device.phases.map((label, i) => ({ label, state: i < phase ? 'done' : i === phase ? 'active' : 'waiting' }));
}

export function DeviceStep({
  uid,
  localKey,
  devices,
  onDone,
  onSignOut,
  removedHere = false,
  moving = null,
  support = null,
}: {
  uid: string;
  localKey: LocalKey;
  devices: DeviceView[];
  onDone: () => void;
  onSignOut: () => void;
  removedHere?: boolean;
  moving?: RecoveryView | null;
  support?: SupportCaseView | null;
}) {
  const { api, auth, device, platform, supportEmail } = useServices();
  const [view, setView] = useState<View>(() => initialView(localKey, devices, platform.isIos() && !platform.isStandalone(), moving, support));
  const [movingBusy, setMovingBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const stepUp = useStepUp();

  useEffect(() => {
    if (view.kind !== 'intro' && view.kind !== 'ios') return;
    let alive = true;
    void device.support().then((s) => {
      if (alive && !s.ok) setView(s.problem === 'no_indexeddb' ? { kind: 'storage' } : { kind: 'unsupported' });
    });
    return () => {
      alive = false;
    };
  }, [device, view.kind]);

  async function secure() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setView({ kind: 'working', phase: 0 });
    try {
      let key: StoredDeviceKey | null = await device.load(uid);
      if (key && !(await device.verify(key))) throw new DeviceKeyError('roundtrip');
      if (!key) key = await device.create(uid);
      setView({ kind: 'working', phase: 1 });
      const persistence = await device.requestPersistence();
      setView({ kind: 'working', phase: 2 });
      await stepUp.run(() => api.request('RegisterDevice', { publicKey: key!.publicKey }), { requireFresh: true });
      setView({ kind: 'ready', persistence });
    } catch (err) {
      if (err instanceof StepUpCancelled) setView({ kind: 'intro' });
      else if (err instanceof DeviceKeyError) {
        if (err.problem === 'storage') setView({ kind: 'storage' });
        else if (err.problem === 'exists') onDone();
        else setView({ kind: 'unsupported' });
      } else if (isApiError(err, 'CONFLICT', 'publicKey')) onDone();
      else {
        setError(isApiError(err, 'RATE_LIMITED') ? t.device.rateLimited : `${t.device.registerFailed} ${messageFor(err)}`);
        setView({ kind: 'intro' });
      }
    } finally {
      inFlight.current = false;
    }
  }

  async function move() {
    if (inFlight.current) return;
    inFlight.current = true;
    setMovingBusy(true);
    setError(null);
    try {
      let key: StoredDeviceKey | null = await device.load(uid);
      if (key && !(await device.verify(key))) throw new DeviceKeyError('roundtrip');
      if (!key) key = await device.create(uid);
      await device.requestPersistence();
      const r = (await stepUp.run(() => api.request('StartRecovery', { newPublicKey: key!.publicKey, kitSignature: null }), { requireFresh: true })).startRecovery;
      if (r.status === 'FAILED') setError(t.device.moveFailed);
      else setView({ kind: 'moving', recovery: r });
    } catch (err) {
      if (err instanceof StepUpCancelled) return;
      if (err instanceof DeviceKeyError) setView(err.problem === 'storage' ? { kind: 'storage' } : { kind: 'unsupported' });
      else setError(isApiError(err, 'CONFLICT') ? t.device.moveBusy : `${t.device.moveFailed} ${messageFor(err)}`);
    } finally {
      inFlight.current = false;
      setMovingBusy(false);
    }
  }

  async function askSupport() {
    if (inFlight.current) return;
    inFlight.current = true;
    setMovingBusy(true);
    setError(null);
    try {
      let key: StoredDeviceKey | null = await device.load(uid);
      if (key && !(await device.verify(key))) throw new DeviceKeyError('roundtrip');
      if (!key) key = await device.create(uid);
      await device.requestPersistence();
      const kase = (await stepUp.run(() => api.request('OpenSupportRecovery', { newPublicKey: key!.publicKey }), { requireFresh: true })).openSupportRecovery;
      setView({ kind: 'support', kase });
    } catch (err) {
      if (err instanceof StepUpCancelled) return;
      if (err instanceof DeviceKeyError) setView(err.problem === 'storage' ? { kind: 'storage' } : { kind: 'unsupported' });
      else setError(isApiError(err, 'CONFLICT') ? t.device.moveBusy : messageFor(err));
    } finally {
      inFlight.current = false;
      setMovingBusy(false);
    }
  }

  const supportLink = (
    <a href={`mailto:${supportEmail}`} className="press inline-flex h-12 items-center justify-center rounded-md border border-field px-6 text-[15px] font-medium text-ink hover:border-ink/25 hover:bg-canvas">
      {t.common.contactSupport}
    </a>
  );

  if (view.kind === 'moving') {
    const when = view.recovery.executableAt ? new Date(view.recovery.executableAt).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : null;
    return (
      <div className="max-w-[36rem]">
        <StepHeader step="device" title={t.device.movingTitle} lead={t.device.movingLead(when)} />
        <Actions className="stagger">
          <Button onClick={() => window.location.reload()}>{t.device.checkAgain}</Button>
          <Button variant="secondary" onClick={onSignOut}>
            {t.common.signOut}
          </Button>
        </Actions>
      </div>
    );
  }

  if (view.kind === 'support') {
    const when = new Date(view.kase.earliestAt).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    return (
      <div className="max-w-[36rem]">
        <StepHeader step="device" title={t.restore.statusTitle} lead={t.restore.status[view.kase.status] ?? view.kase.status} />
        <p className="mb-6 text-[15px] font-medium text-ink">{t.restore.earliest(when)}</p>
        <ol className="stagger mb-8 flex flex-col">
          {t.restore.steps.map((s, i) => (
            <li key={i} className="flex gap-4 border-b border-hairline py-3 text-[15px] leading-6 text-ink-2 first:border-t">
              <span className="tabular w-4 shrink-0 font-semibold text-brand-ink">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <Actions className="stagger">
          <Button onClick={() => window.location.reload()}>{t.device.checkAgain}</Button>
          <Button variant="secondary" onClick={onSignOut}>
            {t.common.signOut}
          </Button>
        </Actions>
      </div>
    );
  }

  if (view.kind === 'ask-support') {
    return (
      <div className="max-w-[36rem]">
        <StepHeader step="device" title={t.restore.supportTitle} lead={t.restore.supportLead} />
        <div className="stagger flex flex-col gap-6">
          {error ? (
            <Notice tone="danger" live="assertive">
              {error}
            </Notice>
          ) : null}
          {stepUp.panel}
          {!stepUp.active ? (
            <Actions>
              <Button onClick={() => void askSupport()} loading={movingBusy} loadingLabel={t.common.working}>
                {t.restore.supportConfirm}
              </Button>
              <Button variant="secondary" onClick={() => setView({ kind: 'unlinked' })} disabled={movingBusy}>
                {t.common.back}
              </Button>
            </Actions>
          ) : null}
        </div>
      </div>
    );
  }

  if (view.kind === 'unlinked') {
    const canMove = auth.secondFactorEnrolled();
    return (
      <div className="max-w-[36rem]">
        <StepHeader step="device" title={removedHere ? t.device.removedTitle : t.device.unlinkedTitle} lead={canMove ? t.device.unlinked : t.device.unlinkedNoFactor} />
        <div className="stagger flex flex-col gap-6">
          {error ? (
            <Notice tone="danger" live="assertive">
              {error}
            </Notice>
          ) : null}
          {stepUp.panel}
          {!stepUp.active ? (
            <Actions>
              {canMove ? (
                <Button onClick={() => void move()} loading={movingBusy} loadingLabel={t.common.working}>
                  {t.device.move}
                </Button>
              ) : (
                <Button onClick={() => (setError(null), setView({ kind: 'ask-support' }))}>{t.device.askSupportMove}</Button>
              )}
              <Button variant="secondary" onClick={onSignOut} disabled={movingBusy}>
                {t.common.signOut}
              </Button>
            </Actions>
          ) : null}
          {!stepUp.active && canMove ? (
            <TextButton onClick={() => (setError(null), setView({ kind: 'ask-support' }))} className="self-start">
              {t.restore.askSupport}
            </TextButton>
          ) : null}
        </div>
      </div>
    );
  }

  if (view.kind === 'unsupported' || view.kind === 'storage') {
    const copy = view.kind === 'unsupported' ? [t.device.unsupportedTitle, t.device.unsupported] : [t.device.storageTitle, t.device.storage];
    return (
      <div className="max-w-[36rem]">
        <StepHeader step="device" title={copy[0]!} lead={copy[1]} />
        <Actions className="stagger">
          <Button onClick={() => window.location.reload()}>{t.common.retry}</Button>
          {supportLink}
        </Actions>
      </div>
    );
  }

  if (view.kind === 'ios') {
    return (
      <div className="max-w-[36rem]">
        <StepHeader step="device" title={t.device.iosTitle} lead={t.device.iosLead} />
        <ol className="stagger mb-8 flex flex-col">
          {t.device.iosSteps.map((s, i) => (
            <li key={i} className="flex items-center gap-5 border-b border-hairline py-4 text-[16px] text-ink-2 first:border-t">
              <span className="tabular w-4 text-[14px] font-semibold text-brand-ink">{i + 1}</span>
              <span className="flex-1">{s}</span>
              {i === 0 ? <ShareIcon className="h-5 w-5 text-muted" /> : null}
            </li>
          ))}
        </ol>
        <p className="mb-8 text-[14px] text-muted">{t.device.iosWarning}</p>
        <Button variant="secondary" onClick={() => setView({ kind: 'intro' })}>
          {t.device.iosContinue}
        </Button>
      </div>
    );
  }

  if (view.kind === 'ready') {
    return (
      <div className="max-w-[36rem]">
        <div key="ready" className="animate-settle">
          <StepHeader step="device" title={t.device.created} lead={t.device.createdLead} />
        </div>
        <div className="mb-10">
          <PhaseList label={t.device.creating} phases={phasesFor(3)} />
        </div>
        <p className="stagger mb-10 max-w-[32rem] text-[14px] leading-[1.55] text-muted">{view.persistence === 'granted' ? t.device.persisted : t.device.notPersisted}</p>
        <Button onClick={onDone}>{t.common.continue}</Button>
      </div>
    );
  }

  const working = view.kind === 'working';

  return (
    <div className="max-w-[36rem]">
      <StepHeader step="device" title={t.device.title} lead={t.device.lead} />
      {working ? (
        <div className="mb-10 animate-rise" aria-live="polite">
          <PhaseList label={t.device.creating} phases={phasesFor(view.phase)} />
        </div>
      ) : null}
      {error ? (
        <div className="mb-8">
          <Notice tone="danger" live="assertive">
            {error}
          </Notice>
        </div>
      ) : null}
      {stepUp.panel ? <div className="mb-8">{stepUp.panel}</div> : null}
      {!working ? (
        <div className="stagger">
          <Button onClick={() => void secure()}>{t.device.create}</Button>
        </div>
      ) : null}
    </div>
  );
}
