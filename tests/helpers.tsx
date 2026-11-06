import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import type { AuthService, AuthUser } from '@/lib/auth/types';
import type { ApiClient } from '@/lib/graphql/client';
import type { Me } from '@/lib/graphql/types';
import { ServicesProvider, type DeviceKeys, type Services } from '@/lib/services';

export const USER: AuthUser = { uid: 'uid-ama-00001', email: 'ama@example.com', emailVerified: true, displayName: 'Ama Owusu' };

export const ME: Me = {
  uid: USER.uid,
  displayName: 'Ama Owusu',
  phone: '+233241234567',
  email: USER.email,
  handle: null,
  accountName: 'ama-owusu',
  viewOnly: false,
  pilotAllowed: true,
  merchant: false,
  accountId: 'ama-owusu.obiba.near',
  accountStatus: 'active',
};

export function fakeAuth(over: Partial<AuthService> = {}): AuthService {
  let user: AuthUser | null = USER;
  return {
    current: () => user,
    ready: async () => user,
    onChange: () => () => undefined,
    idToken: async () => (user ? 'token' : null),
    authAgeSeconds: async () => 10,
    signUp: vi.fn(async () => undefined),
    signIn: vi.fn(async () => ({ status: 'signed-in' as const })),
    signInWithGoogle: vi.fn(async () => ({ status: 'signed-in' as const })),
    completeSecondFactor: vi.fn(async () => undefined),
    resendSecondFactor: vi.fn(async () => undefined),
    phoneEnrolled: () => false,
    secondFactorEnrolled: () => false,
    startPhoneEnrollment: vi.fn(async (phoneNumber: string) => ({ phoneNumber, finish: vi.fn(async () => undefined) })),
    reauthenticate: vi.fn(async () => ({ status: 'signed-in' as const })),
    reauthenticateWithGoogle: vi.fn(async () => ({ status: 'signed-in' as const })),
    reauthMethods: () => ['password'],
    sendVerification: vi.fn(async () => undefined),
    refreshVerification: vi.fn(async () => false),
    sendPasswordReset: vi.fn(async () => undefined),
    checkResetCode: vi.fn(async () => USER.email),
    confirmReset: vi.fn(async () => undefined),
    applyEmailCode: vi.fn(async () => undefined),
    checkPassword: vi.fn(async (p: string) => ({ valid: p.length >= 10, rules: [{ id: 'min' as const, met: p.length >= 10, value: 10 }] })),
    totpEnrolled: () => false,
    startTotpEnrollment: vi.fn(async () => ({ secretKey: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/Obiba:ama?secret=JBSWY3DPEHPK3PXP&issuer=Obiba', finish: vi.fn(async () => undefined) })),
    setSharedComputer: vi.fn(async () => undefined),
    signOut: vi.fn(async () => {
      user = null;
    }),
    ...over,
  };
}

export function fakeApi(handler: (name: string, variables: unknown) => Promise<unknown>, subscribe?: ApiClient['subscribe']): ApiClient {
  return {
    request: vi.fn((name: string, variables?: unknown) => handler(name, variables)) as unknown as ApiClient['request'],
    subscribe: subscribe ?? ((() => () => undefined) as unknown as ApiClient['subscribe']),
  };
}

export function fakeDevice(over: Partial<DeviceKeys> = {}): DeviceKeys {
  return {
    support: async () => ({ ok: true }),
    load: async () => null,
    remove: vi.fn(async () => undefined),
    create: vi.fn(async (uid: string) => ({ uid, publicKey: 'ed25519:5dbPcQ9rVH7JD3Y5ygMV6k1zjknxWqDMhDHvvPNjaiPq', privateKey: {} as CryptoKey, createdAt: 0 })),
    verify: async () => true,
    sign: async () => new Uint8Array(64).fill(7),
    requestPersistence: async () => 'granted',
    persistence: async () => 'granted',
    ...over,
  };
}

export function makeServices(over: Partial<Services> = {}): Services {
  return {
    auth: fakeAuth(),
    api: fakeApi(async () => {
      throw new Error('unexpected request');
    }),
    device: fakeDevice(),
    platform: { isIos: () => false, isStandalone: () => false },
    networkId: 'mainnet',
    accountParent: 'obiba.near',
    supportEmail: 'hello@obibajk.com',
    siteUrl: 'https://www.obibajk.com',
    payContract: 'pay.obiba.near',
    ...over,
  };
}

export function renderWith(ui: ReactElement, services: Services) {
  return render(<ServicesProvider services={services}>{ui}</ServicesProvider>);
}

export function testRouter(): { replace: ReturnType<typeof vi.fn>; push: ReturnType<typeof vi.fn> } {
  return (globalThis as unknown as { testRouter: { replace: ReturnType<typeof vi.fn>; push: ReturnType<typeof vi.fn> } }).testRouter;
}
