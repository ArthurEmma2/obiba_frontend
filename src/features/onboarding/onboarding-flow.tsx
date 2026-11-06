'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { isApiError, messageFor } from '@/lib/errors';
import { useServices, useSession } from '@/lib/services';
import { t } from '@/lib/strings';
import { AccountScope } from '../session/account-scope';
import { OnboardingLayout } from './onboarding-layout';
import { AccountStep } from './steps/account-step';
import { DeviceStep } from './steps/device-step';
import { PhoneStep } from './steps/phone-step';
import { ProfileStep } from './steps/profile-step';
import { VerifyEmailStep } from './steps/verify-email-step';
import { movingHere, supportHere } from './derive';
import { useOnboardingFacts } from './use-onboarding-facts';

export function OnboardingFlow({ accountHref = '/home' }: { accountHref?: string }) {
  return (
    <AccountScope>
      <Flow accountHref={accountHref} />
    </AccountScope>
  );
}

function Flow({ accountHref }: { accountHref: string }) {
  const services = useServices();
  const session = useSession();
  const router = useRouter();
  const user = session.status === 'signed-in' ? session.user : null;
  const { state, reload } = useOnboardingFacts(services, user);
  const complete = state.status === 'ready' && (state.step === 'done' || state.facts.me?.viewOnly === true);

  useEffect(() => {
    if (!complete) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const id = setTimeout(() => router.replace(accountHref), reduced ? 0 : 320);
    return () => clearTimeout(id);
  }, [complete, router, accountHref]);

  useEffect(() => {
    if (session.status === 'signed-out') router.replace('/sign-in');
  }, [session.status, router]);

  useEffect(() => {
    if (state.status === 'error' && (isApiError(state.error, 'UNAUTHENTICATED') || isApiError(state.error, 'ACCOUNT_DISABLED'))) {
      void services.auth.signOut().then(() => router.replace('/sign-in'));
    }
  }, [state, services.auth, router]);

  const signOut = useCallback(() => {
    void services.auth.signOut().then(() => router.replace('/sign-in'));
  }, [services.auth, router]);

  const advance = useCallback(() => {
    window.scrollTo({ top: 0 });
    void reload();
  }, [reload]);

  if (!user || state.status === 'loading') {
    return (
      <OnboardingLayout step={null} onSignOut={signOut}>
        <div className="flex items-center gap-3 pt-6 text-muted" role="status">
          <Spinner />
          <span>{t.common.loading}</span>
        </div>
      </OnboardingLayout>
    );
  }

  if (state.status === 'error') {
    return (
      <OnboardingLayout step={null} onSignOut={signOut}>
        <Notice tone="danger" live="assertive" title={t.onboarding.loadFailed} action={<Button variant="secondary" size="md" onClick={() => void reload()}>{t.common.retry}</Button>}>
          {messageFor(state.error)}
        </Notice>
      </OnboardingLayout>
    );
  }

  const { facts, step } = state;

  return (
    <OnboardingLayout step={step} onSignOut={signOut} leaving={complete}>
      <div key={step}>
        {step === 'verify' ? <VerifyEmailStep email={user.email} onVerified={advance} /> : null}
        {step === 'profile' ? <ProfileStep defaultName={user.displayName} onDone={advance} /> : null}
        {step === 'phone' && facts.me ? <PhoneStep phone={facts.me.phone} onDone={advance} /> : null}
        {step === 'device' ? <DeviceStep uid={user.uid} localKey={facts.localKey} devices={facts.devices} removedHere={facts.removedHere} moving={movingHere(facts)} support={supportHere(facts)} onDone={advance} onSignOut={signOut} /> : null}
        {step === 'account' && facts.me ? <AccountStep initial={facts.me} onActive={advance} /> : null}

      </div>
    </OnboardingLayout>
  );
}
