import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignInForm } from '@/components/auth/sign-in-form';
import { AccountView } from '@/features/account/account-view';
import { OnboardingFlow } from '@/features/onboarding/onboarding-flow';
import { loadFacts } from '@/features/onboarding/use-onboarding-facts';
import type { AuthUser } from '@/lib/auth/types';
import { ApiError } from '@/lib/graphql/client';
import type { Me } from '@/lib/graphql/types';
import { t } from '@/lib/strings';
import { ME, fakeApi, fakeAuth, fakeDevice, makeServices, renderWith, testRouter } from './helpers';

const KEY_A = 'ed25519:5dbPcQ9rVH7JD3Y5ygMV6k1zjknxWqDMhDHvvPNjaiPq';
const A: AuthUser = { uid: 'uid-account-aaaa', email: 'a@example.com', emailVerified: true, displayName: 'Ama' };
const B: AuthUser = { uid: 'uid-account-bbbb', email: 'b@example.com', emailVerified: true, displayName: 'Kofi' };

function switchableAuth(first: AuthUser) {
  let user: AuthUser | null = first;
  const listeners = new Set<(u: AuthUser | null) => void>();
  const auth = fakeAuth({
    current: () => user,
    ready: async () => user,
    onChange: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  });
  return {
    auth,
    switchTo(u: AuthUser | null) {
      user = u;
      for (const l of listeners) l(u);
    },
  };
}

const meFor = (u: AuthUser, over: Partial<Me> = {}): Me => ({ ...ME, uid: u.uid, email: u.email, displayName: u.displayName ?? '', accountName: 'ama-owusu', ...over });

describe('switching accounts in one browser', () => {
  it('throws away the previous account\'s half-typed phone code and state when another account signs in', async () => {
    const s = switchableAuth(A);
    const calls: string[] = [];
    const api = fakeApi(async (name) => {
      const who = s.auth.current()!.uid;
      calls.push(`${who}:${name}`);
      if (name === 'Me') {
        if (who === B.uid) throw new ApiError('PROFILE_REQUIRED');
        return { me: meFor(A) };
      }
      if (name === 'SetupStatus') return { devices: [{ publicKey: KEY_A, status: 'active', initial: true, createdAt: '' }], recoveryKit: { active: false, publicKey: null, createdAt: null } };
      if (name === 'Recovery') return { recovery: null };
      throw new Error(`unexpected ${name}`);
    });
    const device = fakeDevice({ load: async (uid) => (uid === A.uid ? { uid, publicKey: KEY_A, privateKey: {} as CryptoKey, createdAt: 0 } : null) });
    renderWith(<OnboardingFlow />, makeServices({ auth: s.auth, api, device }));
    await userEvent.click(await screen.findByRole('button', { name: t.phoneVerify.send }));
    const code = await screen.findByLabelText(t.phoneVerify.code);
    await userEvent.type(code, '123');
    expect(code).toHaveValue('123');

    await act(async () => s.switchTo(B));
    expect(await screen.findByRole('heading', { name: t.profile.title })).toBeInTheDocument();
    expect(screen.queryByLabelText(t.phoneVerify.code)).toBeNull();
    expect(calls).toContain(`${B.uid}:Me`);
    expect(calls.filter((c) => c.startsWith(B.uid)).every((c) => c === `${B.uid}:Me`)).toBe(true);
  });

  it('resets typed profile details when the signed-in account changes', async () => {
    const s = switchableAuth(A);
    const api = fakeApi(async (name) => {
      if (name === 'Me') throw new ApiError('PROFILE_REQUIRED');
      return { accountNameAvailability: { name: 'x', accountId: null, available: false, reason: 'TAKEN', suggestions: [] } };
    });
    renderWith(<OnboardingFlow />, makeServices({ auth: s.auth, api }));
    await userEvent.type(await screen.findByLabelText(t.profile.phone), '0241234567');
    await act(async () => s.switchTo(B));
    await waitFor(() => expect(screen.getByLabelText(t.profile.displayName)).toHaveValue('Kofi'));
    expect(screen.getByLabelText(t.profile.phone)).toHaveValue('');
  });

  it('sends a signed-out tab back to sign-in', async () => {
    const s = switchableAuth(A);
    const api = fakeApi(async () => {
      throw new ApiError('PROFILE_REQUIRED');
    });
    renderWith(<OnboardingFlow />, makeServices({ auth: s.auth, api }));
    await screen.findByRole('heading', { name: t.profile.title });
    await act(async () => s.switchTo(null));
    await waitFor(() => expect(testRouter().replace).toHaveBeenCalledWith('/sign-in'));
  });
});

describe('local keys are deleted only after confirmed revocation', () => {
  const setup = (status: 'active' | 'revoked' | 'absent') =>
    fakeApi(async (name) => {
      if (name === 'Me') return { me: meFor(A) };
      return {
        devices: status === 'absent' ? [] : [{ publicKey: KEY_A, status, initial: true, createdAt: '' }],
        recoveryKit: { active: true, publicKey: null, createdAt: null },
      };
    });
  const device = () => fakeDevice({ load: async (uid) => ({ uid, publicKey: KEY_A, privateKey: {} as CryptoKey, createdAt: 0 }) });

  it('removes the key when the server reports it revoked, for example after recovery completed elsewhere', async () => {
    const d = device();
    const facts = await loadFacts(makeServices({ api: setup('revoked'), device: d }), A);
    expect(d.remove).toHaveBeenCalledWith(A.uid);
    expect(facts.localKey).toEqual({ state: 'missing' });
    expect(facts.removedHere).toBe(true);
  });

  it('keeps the key when it is merely absent from the list or active', async () => {
    for (const status of ['absent', 'active'] as const) {
      const d = device();
      const facts = await loadFacts(makeServices({ api: setup(status), device: d }), A);
      expect(d.remove).not.toHaveBeenCalled();
      expect(facts.localKey.state).toBe('present');
    }
  });

  it('keeps the key when the server cannot be reached', async () => {
    const d = device();
    const api = fakeApi(async (name) => {
      if (name === 'Me') return { me: meFor(A) };
      throw new ApiError('NETWORK');
    });
    await expect(loadFacts(makeServices({ api, device: d }), A)).rejects.toMatchObject({ code: 'NETWORK' });
    expect(d.remove).not.toHaveBeenCalled();
  });
});

describe('view-only sessions', () => {
  it('skip setup entirely and never create a device key', async () => {
    const device = fakeDevice({ load: async () => null });
    const api = fakeApi(async (name) => {
      if (name === 'Me') return { me: meFor(A, { viewOnly: true }) };
      return { devices: [{ publicKey: KEY_A, status: 'active', initial: true, createdAt: '' }], recoveryKit: { active: true, publicKey: null, createdAt: null } };
    });
    renderWith(<OnboardingFlow />, makeServices({ auth: fakeAuth({ current: () => A, ready: async () => A }), api, device }));
    await waitFor(() => expect(testRouter().replace).toHaveBeenCalledWith('/home'));
    expect(screen.queryByRole('button', { name: t.device.create })).toBeNull();
    expect(device.create).not.toHaveBeenCalled();
  });

  it('show the account read-only, with no setup or device actions', async () => {
    const api = fakeApi(async (name) => {
      if (name === 'Me') return { me: meFor(A, { viewOnly: true }) };
      return { devices: [{ publicKey: KEY_A, status: 'active', initial: true, createdAt: '' }], recoveryKit: { active: true, publicKey: null, createdAt: null } };
    });
    renderWith(<AccountView />, makeServices({ auth: fakeAuth({ current: () => A, ready: async () => A }), api, device: fakeDevice({ load: async () => null }) }));
    expect(await screen.findByText(t.accountPage.viewOnlyTitle)).toBeInTheDocument();
    expect(screen.getByText(t.accountPage.deviceViewOnly)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.accountPage.setUp })).toBeNull();
    expect(screen.queryByRole('button', { name: t.accountPage.removeBrowser })).toBeNull();
    expect(testRouter().replace).not.toHaveBeenCalledWith('/onboarding');
  });
});

describe('remove this browser', () => {
  it('explains the last-device rule and never deletes the key', async () => {
    const device = fakeDevice({ load: async (uid) => ({ uid, publicKey: KEY_A, privateKey: {} as CryptoKey, createdAt: 0 }) });
    const api = fakeApi(async (name) => {
      if (name === 'Me') return { me: meFor(A) };
      return { devices: [{ publicKey: KEY_A, status: 'active', initial: true, createdAt: '' }], recoveryKit: { active: true, publicKey: null, createdAt: null } };
    });
    renderWith(<AccountView />, makeServices({ auth: fakeAuth({ current: () => A, ready: async () => A, totpEnrolled: () => true }), api, device }));
    await userEvent.click(await screen.findByRole('button', { name: t.accountPage.removeBrowser }));
    expect(screen.getByText(t.accountPage.removeOnlyTitle)).toBeInTheDocument();
    expect(device.remove).not.toHaveBeenCalled();
    expect(api.request).not.toHaveBeenCalledWith('RegisterDevice', expect.anything());
  });
});

describe('signing in on a shared computer', () => {
  const signedOut = () => fakeAuth({ current: () => null, ready: async () => null });

  async function signIn(shared: boolean) {
    await userEvent.type(screen.getByLabelText(t.common.email), 'a@example.com');
    await userEvent.type(screen.getByLabelText(t.common.password), 'pw');
    if (shared) await userEvent.click(screen.getByRole('checkbox', { name: t.signIn.shared }));
    await userEvent.click(screen.getByRole('button', { name: t.signIn.submit }));
  }

  it('uses a tab-only session and locks it to view-only before showing the account', async () => {
    const auth = signedOut();
    const order: string[] = [];
    vi.mocked(auth.setSharedComputer).mockImplementation(async (v) => void order.push(`shared:${v}`));
    vi.mocked(auth.signIn).mockImplementation(async () => {
      order.push('signIn');
      return { status: 'signed-in' };
    });
    const api = fakeApi(async (name) => {
      order.push(name);
      return { beginViewOnlySession: true };
    });
    renderWith(<SignInForm />, makeServices({ auth, api }));
    await signIn(true);
    await waitFor(() => expect(testRouter().replace).toHaveBeenCalledWith('/home'));
    expect(order).toEqual(['shared:true', 'signIn', 'BeginViewOnlySession']);
  });

  it('signs straight back out if view-only cannot be confirmed', async () => {
    const auth = signedOut();
    const api = fakeApi(async () => {
      throw new ApiError('SERVICE_PAUSED');
    });
    renderWith(<SignInForm />, makeServices({ auth, api }));
    await signIn(true);
    expect(await screen.findByText(t.signIn.sharedFailed)).toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalled();
    expect(testRouter().replace).not.toHaveBeenCalled();
  });

  it('keeps normal sign-in persistent and full', async () => {
    const auth = signedOut();
    const api = fakeApi(async () => ({}));
    renderWith(<SignInForm />, makeServices({ auth, api }));
    await signIn(false);
    await waitFor(() => expect(testRouter().replace).toHaveBeenCalledWith('/onboarding'));
    expect(auth.setSharedComputer).toHaveBeenCalledWith(false);
    expect(api.request).not.toHaveBeenCalled();
  });
});
