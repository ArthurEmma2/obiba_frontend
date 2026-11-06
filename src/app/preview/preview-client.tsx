'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { AccountView } from '@/features/account/account-view';
import { OnboardingFlow } from '@/features/onboarding/onboarding-flow';
import type { AuthService, AuthUser } from '@/lib/auth/types';
import { ApiError, type ApiClient } from '@/lib/graphql/client';
import type { Me } from '@/lib/graphql/types';
import { ServicesProvider, type DeviceKeys, type Services } from '@/lib/services';
import { buildWalkthrough } from './walkthrough';

const KEY = 'ed25519:5dbPcQ9rVH7JD3Y5ygMV6k1zjknxWqDMhDHvvPNjaiPq';

const BASE_ME: Me = {
  uid: 'uid-preview-001',
  displayName: 'Ama Owusu',
  phone: '+233241234567',
  email: 'ama.owusu@example.com',
  handle: 'ama',
  accountName: 'ama-owusu',
  viewOnly: false,
  pilotAllowed: true,
  merchant: false,
  accountId: 'ama-owusu.obiba.near',
  accountStatus: 'active',
};

type Scenario = 'verify' | 'profile' | 'device' | 'device-ios' | 'device-unsupported' | 'provisioning' | 'waitlist' | 'quarantined' | 'kit' | 'authenticator' | 'done' | 'account';

function scenarioOf(s: string | null): Scenario {
  const all: Scenario[] = ['verify', 'profile', 'device', 'device-ios', 'device-unsupported', 'provisioning', 'waitlist', 'quarantined', 'kit', 'authenticator', 'done', 'account'];
  return all.includes(s as Scenario) ? (s as Scenario) : 'verify';
}

function build(scenario: Scenario): Services {
  const user: AuthUser = { uid: BASE_ME.uid, email: BASE_ME.email, emailVerified: scenario !== 'verify', displayName: BASE_ME.displayName };
  const me: Me | null =
    scenario === 'verify' || scenario === 'profile'
      ? null
      : {
          ...BASE_ME,
          accountStatus: scenario === 'provisioning' ? 'provisioning' : scenario === 'waitlist' ? null : scenario === 'quarantined' ? 'quarantined' : scenario.startsWith('device') ? null : 'active',
          pilotAllowed: scenario !== 'waitlist',
          accountId: ['provisioning', 'waitlist', 'quarantined'].includes(scenario) || scenario.startsWith('device') ? null : BASE_ME.accountId,
        };
  const hasDevice = !scenario.startsWith('device') && me !== null;
  const auth: AuthService = {
    current: () => user,
    ready: async () => user,
    onChange: () => () => undefined,
    idToken: async () => 'preview',
    authAgeSeconds: async () => 30,
    signUp: async () => undefined,
    signIn: async () => ({ status: 'signed-in' }),
    signInWithGoogle: async () => ({ status: 'signed-in' }),
    completeSecondFactor: async () => undefined,
    resendSecondFactor: async () => undefined,
    phoneEnrolled: () => true,
    secondFactorEnrolled: () => true,
    startPhoneEnrollment: async (phoneNumber: string) => ({ phoneNumber, finish: async () => undefined }),
    reauthenticate: async () => ({ status: 'signed-in' }),
    reauthenticateWithGoogle: async () => ({ status: 'signed-in' }),
    reauthMethods: () => ['password'],
    sendVerification: async () => undefined,
    refreshVerification: async () => false,
    sendPasswordReset: async () => undefined,
    checkResetCode: async () => user.email,
    confirmReset: async () => undefined,
    applyEmailCode: async () => undefined,
    checkPassword: async () => null,
    totpEnrolled: () => scenario === 'done' || scenario === 'account',
    startTotpEnrollment: async () => ({ secretKey: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/Obiba:ama.owusu%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Obiba', finish: async () => undefined }),
    setSharedComputer: async () => undefined,
    signOut: async () => undefined,
  };
  const api: ApiClient = {
    async request(name, variables) {
      await new Promise((r) => setTimeout(r, 120));
      switch (name) {
        case 'Me':
          if (!me) throw new ApiError('PROFILE_REQUIRED');
          return { me } as never;
        case 'SetupStatus':
          return {
            devices: hasDevice ? [{ publicKey: KEY, status: 'active', initial: true, createdAt: '2026-10-26T09:00:00Z' }] : scenario === 'device-unsupported' ? [] : [],
            recoveryKit: { active: ['authenticator', 'done', 'account'].includes(scenario), publicKey: null, createdAt: null },
          } as never;
        case 'AccountNameAvailability': {
          const n = (variables as { name: string }).name;
          const taken = n.includes('taken') || n === 'ama';
          const reserved = ['pay', 'admin', 'support', 'obiba'].some((r) => n === r || n.includes('obiba'));
          if (n.length < 3) return { accountNameAvailability: { name: n, accountId: null, available: false, reason: 'TOO_SHORT', suggestions: [] } } as never;
          if (/\d{9,}/.test(n)) return { accountNameAvailability: { name: n, accountId: null, available: false, reason: 'LOOKS_LIKE_PHONE', suggestions: [] } } as never;
          if (reserved) return { accountNameAvailability: { name: n, accountId: null, available: false, reason: 'RESERVED', suggestions: [] } } as never;
          if (taken) return { accountNameAvailability: { name: n, accountId: null, available: false, reason: 'TAKEN', suggestions: [`${n}-gh`, `${n}-pay`, `${n}2`] } } as never;
          return { accountNameAvailability: { name: n, accountId: `${n}.obiba.near`, available: true, reason: null, suggestions: [] } } as never;
        }
        case 'RegisterRecoveryKit':
          return { registerRecoveryKit: { active: true, publicKey: (variables as { kitPublicKey: string }).kitPublicKey, createdAt: new Date().toISOString() } } as never;
        default:
          throw new ApiError('SERVICE_PAUSED');
      }
    },
    subscribe(_name, _onData, onState) {
      onState?.('live');
      return () => undefined;
    },
  };
  const device: DeviceKeys = {
    support: async () => (scenario === 'device-unsupported' ? { ok: false, problem: 'no_ed25519' } : { ok: true }),
    load: async () => (hasDevice ? { uid: user.uid, publicKey: KEY, privateKey: {} as CryptoKey, createdAt: 0 } : null),
    remove: async () => undefined,
    create: async () => ({ uid: user.uid, publicKey: KEY, privateKey: {} as CryptoKey, createdAt: 0 }),
    verify: async () => true,
    sign: async () => new Uint8Array(64),
    requestPersistence: async () => 'granted',
    persistence: async () => 'granted',
  };
  return {
    auth,
    api,
    device,
    platform: { isIos: () => scenario === 'device-ios', isStandalone: () => false },
    networkId: 'mainnet',
    accountParent: 'obiba.near',
    supportEmail: 'hello@obibajk.com',
    siteUrl: 'https://www.obibajk.com',
    payContract: 'pay.obiba.near',
  };
}

export function PreviewClient({ scenario }: { scenario: string | null }) {
  const walkthrough = scenario === null || scenario === 'start';
  const s = scenarioOf(scenario);
  const services = useMemo(() => (walkthrough ? buildWalkthrough() : build(s)), [walkthrough, s]);
  return <ServicesProvider services={services}>{!walkthrough && s === 'account' ? <AccountView /> : <OnboardingFlow accountHref="/preview?step=account" />}</ServicesProvider>;
}

export function PreviewRoute() {
  return <PreviewClient scenario={useSearchParams().get('step')} />;
}
