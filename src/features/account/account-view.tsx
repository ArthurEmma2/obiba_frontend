'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button, TextButton } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import type { PersistenceStatus } from '@/lib/crypto/device-key';
import { messageFor } from '@/lib/errors';
import { useServices, useSession } from '@/lib/services';
import { t } from '@/lib/strings';
import { linkedDevice } from '../onboarding/derive';
import { Address } from '../onboarding/marks';
import { OnboardingLayout } from '../onboarding/onboarding-layout';
import { TotpStep } from '../onboarding/steps/totp-step';
import { useOnboardingFacts } from '../onboarding/use-onboarding-facts';
import { AccountScope } from '../session/account-scope';
import { StepUpCancelled, useStepUp } from '../session/use-step-up';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12 first:mt-0">
      <h2 className="mb-2 text-[13px] font-medium text-muted">{title}</h2>
      <dl className="divide-y divide-hairline border-y border-hairline">{children}</dl>
    </section>
  );
}

function Row({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-[14px] text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-3 text-[15px] text-ink sm:justify-end">
        <span className="min-w-0 break-all">{children}</span>
        {action}
      </dd>
    </div>
  );
}

export function AccountView() {
  return (
    <AccountScope>
      <Account />
    </AccountScope>
  );
}

function Account() {
  const services = useServices();
  const session = useSession();
  const router = useRouter();
  const user = session.status === 'signed-in' ? session.user : null;
  const { state, reload } = useOnboardingFacts(services, user);
  const [persistence, setPersistence] = useState<PersistenceStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const [settingUpTotp, setSettingUpTotp] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stepUp = useStepUp();

  useEffect(() => {
    if (session.status === 'signed-out') router.replace('/sign-in');
  }, [session.status, router]);

  useEffect(() => {
    if (state.status === 'ready' && state.step !== 'done' && !state.facts.me?.viewOnly) router.replace('/onboarding');
  }, [state, router]);

  useEffect(() => {
    void services.device.persistence().then(setPersistence);
  }, [services.device]);

  const signOut = useCallback(() => {
    void services.auth.signOut().then(() => router.replace('/sign-in'));
  }, [services.auth, router]);

  async function signOutEverywhere() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await stepUp.run(() => services.api.request('SignOutEverywhere'), { requireFresh: true });
      await services.auth.signOut();
      router.replace('/sign-in');
    } catch (err) {
      if (!(err instanceof StepUpCancelled)) setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (!user || state.status !== 'ready') {
    return (
      <OnboardingLayout step={null} onSignOut={signOut}>
        {state.status === 'error' ? (
          <Notice tone="danger" live="assertive" action={<Button variant="secondary" size="md" onClick={() => void reload()}>{t.common.retry}</Button>}>
            {messageFor(state.error)}
          </Notice>
        ) : (
          <div className="flex items-center gap-3 pt-6 text-muted" role="status">
            <Spinner />
            <span>{t.common.loading}</span>
          </div>
        )}
      </OnboardingLayout>
    );
  }

  const { facts } = state;
  const me = facts.me;
  const device = linkedDevice(facts);
  const viewOnly = me?.viewOnly === true;
  const activeDevices = facts.devices.filter((d) => d.status !== 'revoked').length;

  if (settingUpTotp) {
    return (
      <OnboardingLayout step={null} onSignOut={signOut}>
        <TotpStep
          uid={user.uid}
          mode="settings"
          onDone={() => {
            setSettingUpTotp(false);
            void reload();
          }}
        />
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout step={null} onSignOut={signOut}>
      <div className="mx-auto max-w-[44rem]">
      <header className="stagger mb-14">
        <p className="mb-4 text-[15px] text-muted">{me?.displayName}</p>
        <Address name={me?.accountName ?? ''} suffix={services.accountParent} />
        <div className="mt-5 flex items-center gap-5 text-[14px]">
          <span className="flex items-center gap-2 text-ink-2">
            {t.accountPage.statuses[me?.accountStatus ?? ''] ?? '-'}
          </span>
          {me?.accountId ? (
            <TextButton onClick={() => void copy(me.accountId!)} aria-live="polite">
              {copied ? t.accountPage.copied : t.accountPage.copy}
            </TextButton>
          ) : null}
        </div>
      </header>

      {viewOnly ? (
        <div className="mb-12 animate-rise">
          <Notice tone="info" title={t.accountPage.viewOnlyTitle}>
            {t.accountPage.viewOnlyBody}
          </Notice>
        </div>
      ) : null}

      <Section title={t.accountPage.security}>
        <Row
          label={t.accountPage.deviceKey}
          action={!viewOnly && device ? <TextButton onClick={() => setRemoving((r) => !r)} aria-expanded={removing}>{t.accountPage.removeBrowser}</TextButton> : null}
        >
          {viewOnly ? t.accountPage.deviceViewOnly : device ? t.accountPage.deviceOk : t.accountPage.deviceMissing}
        </Row>
        {removing && !viewOnly ? (
          <div className="animate-rise border-b border-hairline py-5" role="region" aria-label={t.accountPage.removeBrowser}>
            {activeDevices <= 1 ? (
              <div className="flex max-w-[36rem] flex-col gap-3 text-[14px] leading-[1.55] text-ink-2">
                <p className="text-[15px] font-semibold text-ink">{t.accountPage.removeOnlyTitle}</p>
                <p>{t.accountPage.removeOnlyBody}</p>
              </div>
            ) : (
              <p className="max-w-[36rem] text-[14px] leading-[1.55] text-ink-2">{t.accountPage.removeUnavailable}</p>
            )}
            <Button variant="secondary" size="md" className="mt-5" onClick={() => setRemoving(false)}>
              {t.accountPage.close}
            </Button>
          </div>
        ) : null}
        {!viewOnly ? (
          <Row label={t.accountPage.storage}>
            {persistence === 'granted' ? t.accountPage.storageGranted : persistence === 'denied' ? t.accountPage.storageNotGranted : persistence === 'unsupported' ? t.accountPage.storageUnknown : '-'}
          </Row>
        ) : null}
        <Row label={t.accountPage.kit}>{facts.recoveryKit?.active ? t.done.kitActive : '-'}</Row>
        <Row
          label={t.accountPage.totp}
          action={!services.auth.totpEnrolled() && !viewOnly ? <TextButton onClick={() => setSettingUpTotp(true)}>{t.accountPage.setUp}</TextButton> : null}
        >
          {services.auth.totpEnrolled() ? t.done.totpOn : t.done.totpOff}
        </Row>
      </Section>

      <Section title={t.accountPage.sessions}>
        <div className="flex flex-col gap-4 py-5">
          <p className="text-[14px] leading-5 text-muted">{t.accountPage.signOutEverywhereHint}</p>
          {error ? (
            <Notice tone="danger" live="assertive">
              {error}
            </Notice>
          ) : null}
          {stepUp.panel}
          {!stepUp.active ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" onClick={signOut}>
                {t.common.signOut}
              </Button>
              <Button variant="danger" onClick={() => void signOutEverywhere()} loading={busy} loadingLabel={t.common.working}>
                {t.accountPage.signOutEverywhere}
              </Button>
            </div>
          ) : null}
        </div>
      </Section>
      </div>
    </OnboardingLayout>
  );
}
