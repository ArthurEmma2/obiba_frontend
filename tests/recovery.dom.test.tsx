import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingFlow } from '@/features/onboarding/onboarding-flow';
import { ApiError } from '@/lib/graphql/client';
import { t } from '@/lib/strings';
import { ME, fakeApi, fakeAuth, fakeDevice, makeServices, renderWith } from './helpers';

const OTHER = 'ed25519:8hSHprDq2StXwMtNd43wDTXQYsjXcD4MJTXQYsjXcD4M';
const NEW = 'ed25519:5dbPcQ9rVH7JD3Y5ygMV6k1zjknxWqDMhDHvvPNjaiPq';

function api(recovery: { status: string; newPublicKey: string; executableAt: string | null } | null, start = vi.fn()) {
  return fakeApi(async (name, vars) => {
    if (name === 'Me') return { me: ME };
    if (name === 'SetupStatus') return { devices: [{ publicKey: OTHER, status: 'active', initial: true, createdAt: '' }], recoveryKit: { active: false, publicKey: null, createdAt: null } };
    if (name === 'Recovery') return { recovery: recovery ? { recoveryId: 'r1', reason: null, createdAt: '', ...recovery } : null };
    if (name === 'StartRecovery') return start(vars);
    throw new Error(`unexpected ${name}`);
  });
}

describe('moving an account to a new browser after losing the old one', () => {
  it('creates a key here, starts recovery with it and shows when the move completes', async () => {
    const start = vi.fn(async () => ({ startRecovery: { recoveryId: 'r1', status: 'SIGNED', newPublicKey: NEW, executableAt: null, reason: null, createdAt: '' } }));
    const device = fakeDevice();
    renderWith(<OnboardingFlow />, makeServices({ auth: fakeAuth({ secondFactorEnrolled: () => true }), api: api(null, start), device }));
    await userEvent.click(await screen.findByRole('button', { name: t.device.move }));
    expect(await screen.findByRole('heading', { name: t.device.movingTitle })).toBeInTheDocument();
    expect(device.create).toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith({ newPublicKey: NEW, kitSignature: null });
  });

  it('keeps showing the move after a reload instead of letting the pending key into the account', async () => {
    const device = fakeDevice({ load: async (uid) => ({ uid, publicKey: NEW, privateKey: {} as CryptoKey, createdAt: 0 }) });
    renderWith(<OnboardingFlow />, makeServices({ auth: fakeAuth({ secondFactorEnrolled: () => true }), api: api({ status: 'PENDING_TIMELOCK', newPublicKey: NEW, executableAt: '2026-10-30T18:00:00Z' }), device }));
    expect(await screen.findByRole('heading', { name: t.device.movingTitle })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.device.move })).toBeNull();
  });

  it('asks a user without a verified phone or Kit to verify the phone before anything else', async () => {
    renderWith(<OnboardingFlow />, makeServices({ auth: fakeAuth(), api: api(null) }));
    expect(await screen.findByRole('heading', { name: t.phoneVerify.title })).toBeInTheDocument();
  });
});

describe('confirming before a move', () => {
  it('shows why instead of asking again when the confirmation is not enough', async () => {
    const start = vi.fn(async () => {
      throw new ApiError('STEP_UP_REQUIRED');
    });
    const auth = fakeAuth({ secondFactorEnrolled: () => true });
    renderWith(<OnboardingFlow />, makeServices({ auth, api: api(null, start), device: fakeDevice() }));
    await userEvent.click(await screen.findByRole('button', { name: t.device.move }));
    await userEvent.type(await screen.findByLabelText(t.common.password), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: t.reauth.submit }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(await screen.findByText((text) => text.startsWith(t.device.moveFailed))).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: t.reauth.title })).toBeNull();
    expect(auth.reauthenticate).toHaveBeenCalledTimes(1);
  });
});

describe('an account secured elsewhere with no phone or authenticator', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
    vi.stubEnv('NEXT_PUBLIC_ACCOUNT_SUFFIX', '.obiba.testnet');
    vi.stubEnv('NEXT_PUBLIC_SKIP_OTP', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('offers support instead of a move it cannot complete', async () => {
    vi.resetModules();
    const [{ OnboardingFlow: Flow }, h, { t: s }] = await Promise.all([import('@/features/onboarding/onboarding-flow'), import('./helpers'), import('@/lib/strings')]);
    h.renderWith(<Flow />, h.makeServices({ auth: h.fakeAuth(), api: api(null) }));
    expect(await screen.findByText(s.device.unlinkedNoFactor)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: s.device.move })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: s.device.askSupportMove }));
    expect(await screen.findByRole('heading', { name: s.restore.supportTitle })).toBeInTheDocument();
  });
});

