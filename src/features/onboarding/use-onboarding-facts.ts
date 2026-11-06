'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { webConfig } from '@/lib/config';
import type { AuthUser } from '@/lib/auth/types';
import { DeviceKeyError } from '@/lib/crypto/device-key';
import { isApiError } from '@/lib/errors';
import type { Services } from '@/lib/services';
import { deriveStep, type LocalKey, type OnboardingFacts, type StepId } from './derive';

export type FactsState = { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; facts: OnboardingFacts; step: StepId };

export async function loadLocalKey(services: Services, uid: string): Promise<LocalKey> {
  try {
    const key = await services.device.load(uid);
    if (key) return { state: 'present', publicKey: key.publicKey };
    const support = await services.device.support();
    if (!support.ok) return support.problem === 'no_indexeddb' ? { state: 'storage-unavailable' } : { state: 'unsupported' };
    return { state: 'missing' };
  } catch (err) {
    if (err instanceof DeviceKeyError && err.problem === 'storage') return { state: 'storage-unavailable' };
    return { state: 'unknown' };
  }
}

export async function loadFacts(services: Services, user: AuthUser): Promise<OnboardingFacts> {
  const { skipOtp } = webConfig();
  const facts: OnboardingFacts = {
    emailVerified: user.emailVerified || skipOtp,
    me: null,
    devices: [],
    recoveryKit: null,
    recovery: null,
    supportCase: null,
    localKey: { state: 'unknown' },
    secondFactorEnrolled: services.auth.secondFactorEnrolled() || skipOtp,
    removedHere: false,
  };
  if (!facts.emailVerified) return facts;
  try {
    facts.me = (await services.api.request('Me')).me;
  } catch (err) {
    if (isApiError(err, 'PROFILE_REQUIRED')) return facts;
    if (isApiError(err, 'EMAIL_NOT_VERIFIED')) return { ...facts, emailVerified: false };
    throw err;
  }
  const [setup, localKey, recovery, supportCase] = await Promise.all([
    services.api.request('SetupStatus'),
    loadLocalKey(services, user.uid),
    services.api.request('Recovery').then((r) => r.recovery, () => null),
    services.api.request('SupportCase').then((r) => r.supportCase, () => null),
  ]);
  facts.devices = setup.devices;
  facts.recoveryKit = setup.recoveryKit;
  facts.recovery = recovery;
  facts.supportCase = supportCase;
  facts.localKey = localKey;
  if (localKey.state === 'present' && setup.devices.some((d) => d.publicKey === localKey.publicKey && d.status === 'revoked')) {
    await services.device.remove(user.uid);
    facts.localKey = { state: 'missing' };
    facts.removedHere = true;
  }
  return facts;
}

export function useOnboardingFacts(services: Services, user: AuthUser | null) {
  const [state, setState] = useState<FactsState>({ status: 'loading' });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!user) return;
    const my = ++seq.current;
    try {
      const current = services.auth.current() ?? user;
      const facts = await loadFacts(services, current);
      if (my === seq.current) setState({ status: 'ready', facts, step: deriveStep(facts) });
    } catch (error) {
      if (my === seq.current) setState({ status: 'error', error });
    }
  }, [services, user]);

  useEffect(() => {
    if (!user) return;
    const my = ++seq.current;
    loadFacts(services, services.auth.current() ?? user).then(
      (facts) => {
        if (my === seq.current) setState({ status: 'ready', facts, step: deriveStep(facts) });
      },
      (error: unknown) => {
        if (my === seq.current) setState({ status: 'error', error });
      },
    );
  }, [services, user]);

  return { state, reload };
}
