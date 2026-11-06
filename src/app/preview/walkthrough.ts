import type { AuthService, AuthUser } from '@/lib/auth/types';
import { ApiError, type ApiClient } from '@/lib/graphql/client';
import type { DeviceView, Me, RecoveryKitStatus } from '@/lib/graphql/types';
import { browserDeviceKeys, browserPlatform, type Services } from '@/lib/services';

const PARENT = 'obiba.near';
const PROVISION_MS = 5000;

export function buildWalkthrough(): Services {
  const uid = `preview-${crypto.randomUUID().slice(0, 12)}`;
  const user: AuthUser = { uid, email: 'you@example.com', emailVerified: true, displayName: null };
  let me: Me | null = null;
  const devices: DeviceView[] = [];
  let kit: RecoveryKitStatus = { active: false, publicKey: null, createdAt: null };
  let totp = false;
  const listeners = new Set<(data: never) => void>();
  const taken = new Set(['ama', 'kofi', 'pay', 'admin']);

  const notify = () => {
    for (const l of listeners) l({ accountEvents: { kind: 'account', id: uid, status: 'UPDATED' } } as never);
  };

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
    refreshVerification: async () => true,
    sendPasswordReset: async () => undefined,
    checkResetCode: async () => user.email,
    confirmReset: async () => undefined,
    applyEmailCode: async () => undefined,
    checkPassword: async () => null,
    totpEnrolled: () => totp,
    startTotpEnrollment: async () => ({
      secretKey: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      otpauthUrl: `otpauth://totp/Obiba:${encodeURIComponent(user.email)}?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Obiba`,
      finish: async (code: string) => {
        if (!/^\d{6}$/.test(code)) throw Object.assign(new Error('bad code'), { code: 'auth/invalid-verification-code' });
        totp = true;
      },
    }),
    setSharedComputer: async () => undefined,
    signOut: async () => undefined,
  };

  const api: ApiClient = {
    async request(name, variables) {
      await new Promise((r) => setTimeout(r, 250));
      const v = (variables ?? {}) as Record<string, unknown>;
      switch (name) {
        case 'Me':
          if (!me) throw new ApiError('PROFILE_REQUIRED');
          return { me } as never;
        case 'SetupStatus':
          return { devices, recoveryKit: kit } as never;
        case 'AccountNameAvailability': {
          const n = String(v.name);
          if (n.length < 3) return { accountNameAvailability: { name: n, accountId: null, available: false, reason: 'TOO_SHORT', suggestions: [] } } as never;
          if (!/^[a-z0-9-]+$/.test(n)) return { accountNameAvailability: { name: n, accountId: null, available: false, reason: 'CHARACTERS', suggestions: [] } } as never;
          if (/\d{9,}/.test(n)) return { accountNameAvailability: { name: n, accountId: null, available: false, reason: 'LOOKS_LIKE_PHONE', suggestions: [] } } as never;
          if (n.includes('obiba') || n.includes('support')) return { accountNameAvailability: { name: n, accountId: null, available: false, reason: 'RESERVED', suggestions: [] } } as never;
          if (taken.has(n)) return { accountNameAvailability: { name: n, accountId: null, available: false, reason: 'TAKEN', suggestions: [`${n}-gh`, `${n}-pay`, `${n}2`] } } as never;
          return { accountNameAvailability: { name: n, accountId: `${n}.${PARENT}`, available: true, reason: null, suggestions: [] } } as never;
        }
        case 'RegisterProfile': {
          const input = v.input as { displayName: string; phone: string; handle: string | null; accountName: string };
          me = { uid, displayName: input.displayName, phone: input.phone, email: user.email, handle: input.handle, accountName: input.accountName, viewOnly: false, pilotAllowed: true, merchant: false, accountId: null, accountStatus: null };
          return { registerProfile: me } as never;
        }
        case 'RegisterDevice': {
          devices.push({ publicKey: String(v.publicKey), status: 'pending', initial: true, createdAt: new Date().toISOString() });
          if (me) me = { ...me, accountStatus: 'provisioning' };
          setTimeout(() => {
            if (!me) return;
            me = { ...me, accountStatus: 'active', accountId: `${me.accountName}.${PARENT}` };
            devices[0] = { ...devices[0]!, status: 'active' };
            notify();
          }, PROVISION_MS);
          return { registerDevice: { publicKey: String(v.publicKey), status: 'pending', provisioningQueued: true } } as never;
        }
        case 'RegisterRecoveryKit':
          kit = { active: true, publicKey: String(v.kitPublicKey), createdAt: new Date().toISOString() };
          return { registerRecoveryKit: kit } as never;
        case 'SignOutEverywhere':
          return { signOutEverywhere: true } as never;
        default:
          throw new ApiError('SERVICE_PAUSED');
      }
    },
    subscribe(_name, onData, onState) {
      listeners.add(onData as (data: never) => void);
      onState?.('live');
      return () => {
        listeners.delete(onData as (data: never) => void);
      };
    },
  };

  return {
    auth,
    api,
    device: browserDeviceKeys,
    platform: browserPlatform,
    networkId: 'sandbox',
    accountParent: PARENT,
    supportEmail: 'hello@obibajk.com',
    siteUrl: 'https://www.obibajk.com',
    payContract: 'pay.obiba.near',
  };
}
