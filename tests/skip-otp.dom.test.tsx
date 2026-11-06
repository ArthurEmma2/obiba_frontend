import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, makeServices, ME, USER } from './helpers';

const UNVERIFIED = { ...USER, emailVerified: false };

async function load() {
  vi.resetModules();
  const [{ loadFacts }, { deriveStep }, { ApiError }] = await Promise.all([import('@/features/onboarding/use-onboarding-facts'), import('@/features/onboarding/derive'), import('@/lib/graphql/client')]);
  const setupApi = (me: unknown) =>
    fakeApi(async (name) => {
      if (name === 'Me') {
        if (me === null) throw new ApiError('PROFILE_REQUIRED');
        return { me };
      }
      if (name === 'SetupStatus') return { devices: [], recoveryKit: null };
      if (name === 'Recovery') return { recovery: null };
      return { supportCase: null };
    });
  return { loadFacts, deriveStep, setupApi };
}

describe('NEXT_PUBLIC_SKIP_OTP', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
    vi.stubEnv('NEXT_PUBLIC_ACCOUNT_SUFFIX', '.obiba.testnet');
    vi.stubEnv('NEXT_PUBLIC_SKIP_OTP', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('takes a new unverified user straight to their profile', async () => {
    const { loadFacts, deriveStep, setupApi } = await load();
    const facts = await loadFacts(makeServices({ api: setupApi(null) }), UNVERIFIED);
    expect(deriveStep(facts)).toBe('profile');
  });

  it('does not ask for a phone code after the profile', async () => {
    const { loadFacts, deriveStep, setupApi } = await load();
    const facts = await loadFacts(makeServices({ api: setupApi(ME) }), UNVERIFIED);
    expect(deriveStep(facts)).toBe('device');
  });

  it('still asks for both when the flag is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_SKIP_OTP', '0');
    const { loadFacts, deriveStep, setupApi } = await load();
    expect(deriveStep(await loadFacts(makeServices({ api: setupApi(ME) }), UNVERIFIED))).toBe('verify');
    expect(deriveStep(await loadFacts(makeServices({ api: setupApi(ME) }), USER))).toBe('phone');
  });

  it('refuses to run on mainnet', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'mainnet');
    vi.resetModules();
    const { webConfig } = await import('@/lib/config');
    expect(() => webConfig()).toThrow('NEXT_PUBLIC_SKIP_OTP is not allowed on mainnet');
  });
});
