import { describe, expect, it, vi } from 'vitest';
import { deriveStep, type OnboardingFacts } from '@/features/onboarding/derive';
import { ApiError, createApiClient, readEvents } from '@/lib/graphql/client';
import { formatGhanaLocal, normalizeGhanaPhone } from '@/lib/phone';
import { normalizeAccountNameInput, validEmail, validHandle } from '@/lib/validation';
import { ME } from './helpers';

const KEY = 'ed25519:5dbPcQ9rVH7JD3Y5ygMV6k1zjknxWqDMhDHvvPNjaiPq';

function facts(over: Partial<OnboardingFacts> = {}): OnboardingFacts {
  return {
    emailVerified: true,
    me: ME,
    devices: [{ publicKey: KEY, status: 'active', initial: true, createdAt: '2026-10-26T00:00:00Z' }],
    recoveryKit: { active: true, publicKey: 'ed25519:kit', createdAt: '2026-10-26T00:00:00Z' },
    recovery: null,
    supportCase: null,
    localKey: { state: 'present', publicKey: KEY },
    secondFactorEnrolled: true,
    removedHere: false,
    ...over,
  };
}

describe('onboarding step derivation follows authoritative state', () => {
  it('walks the steps in order and never skips one', () => {
    expect(deriveStep(facts({ emailVerified: false }))).toBe('verify');
    expect(deriveStep(facts({ me: null }))).toBe('profile');
    expect(deriveStep(facts({ secondFactorEnrolled: false, recoveryKit: null }))).toBe('phone');
    expect(deriveStep(facts({ devices: [] }))).toBe('device');
    expect(deriveStep(facts({ localKey: { state: 'missing' } }))).toBe('device');
    expect(deriveStep(facts({ localKey: { state: 'present', publicKey: 'ed25519:other' } }))).toBe('device');
    expect(deriveStep(facts({ devices: [{ publicKey: KEY, status: 'revoked', initial: true, createdAt: '' }] }))).toBe('device');
    expect(deriveStep(facts({ me: { ...ME, accountStatus: null } }))).toBe('account');
    expect(deriveStep(facts({ me: { ...ME, accountStatus: 'provisioning' } }))).toBe('account');
    expect(deriveStep(facts({ me: { ...ME, accountStatus: 'quarantined' } }))).toBe('account');
    expect(deriveStep(facts({ me: { ...ME, accountStatus: 'frozen' } }))).toBe('account');
    expect(deriveStep(facts({ recoveryKit: null }))).toBe('done');
    expect(deriveStep(facts())).toBe('done');
  });

  it('cannot reach money-ready without a verified phone, unless an optional Recovery Kit is already saved', () => {
    expect(deriveStep(facts({ secondFactorEnrolled: false, recoveryKit: { active: false, publicKey: null, createdAt: null } }))).toBe('phone');
    expect(deriveStep(facts({ secondFactorEnrolled: false }))).toBe('done');
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('API client', () => {
  it('sends the persisted hash and no query text in production mode', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.query).toBeUndefined();
      expect(body.extensions.persistedQuery.sha256Hash).toMatch(/^[0-9a-f]{64}$/);
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer t1');
      expect(init?.credentials).toBe('omit');
      return jsonResponse({ data: { me: ME } });
    });
    const api = createApiClient({ url: 'https://api.test/graphql', tokens: { idToken: async () => 't1' }, sendQueryText: false, fetchImpl });
    expect((await api.request('Me')).me.accountName).toBe('ama-owusu');
  });

  it('retries once with a refreshed token on UNAUTHENTICATED', async () => {
    const tokens = { idToken: vi.fn(async (force?: boolean) => (force ? 'fresh' : 'stale')) };
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).authorization;
      return auth === 'Bearer stale' ? jsonResponse({ errors: [{ message: 'x', extensions: { code: 'UNAUTHENTICATED' } }] }) : jsonResponse({ data: { me: ME } });
    });
    const api = createApiClient({ url: 'u', tokens, sendQueryText: false, fetchImpl });
    await api.request('Me');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(tokens.idToken).toHaveBeenCalledWith(true);
  });

  it('maps backend error codes and fields, and never retries a mutation after a network failure', async () => {
    const api1 = createApiClient({ url: 'u', tokens: { idToken: async () => 't' }, sendQueryText: false, fetchImpl: async () => jsonResponse({ errors: [{ message: 'm', extensions: { code: 'CONFLICT', field: 'accountName' } }] }) });
    await expect(api1.request('RegisterProfile', { input: { displayName: 'A', phone: '+233241234567', handle: null, accountName: 'ama' } })).rejects.toMatchObject({ code: 'CONFLICT', field: 'accountName' });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const api2 = createApiClient({ url: 'u', tokens: { idToken: async () => 't' }, sendQueryText: false, fetchImpl });
    await expect(api2.request('RegisterDevice', { publicKey: KEY })).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('parses server-sent events across chunk boundaries', async () => {
    const chunks = ['event: next\ndata: {"data":{"accountEvents":{"kind":"acc', 'ount","id":"1","status":"ACTIVE"}}}\n\n:keepalive\n\nevent: complete\ndata:\n\n'];
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
        c.close();
      },
    });
    const seen: Array<[string, string]> = [];
    await readEvents(stream, new AbortController().signal, (e, d) => seen.push([e, d]));
    expect(seen[0]).toEqual(['next', '{"data":{"accountEvents":{"kind":"account","id":"1","status":"ACTIVE"}}}']);
  });
});

describe('input rules mirror the backend', () => {
  it('normalizes Ghana phone numbers exactly like the API', () => {
    expect(normalizeGhanaPhone('024 123 4567')).toBe('+233241234567');
    expect(normalizeGhanaPhone('241234567')).toBe('+233241234567');
    expect(normalizeGhanaPhone('+233 24 123 4567')).toBe('+233241234567');
    expect(normalizeGhanaPhone('233241234567')).toBe('+233241234567');
    expect(normalizeGhanaPhone('+2441234567')).toBeNull();
    expect(normalizeGhanaPhone('0041234567')).toBeNull();
    expect(formatGhanaLocal('+233241234567')).toBe('024 123 4567');
  });

  it('validates emails, handles and account-name input', () => {
    expect(validEmail('ama@example.com')).toBe(true);
    expect(validEmail('ama@')).toBe(false);
    expect(validHandle('ama_gh')).toBe(true);
    expect(validHandle('Ama')).toBe(false);
    expect(normalizeAccountNameInput('  Ama Owusu ')).toBe('ama-owusu');
  });
});
