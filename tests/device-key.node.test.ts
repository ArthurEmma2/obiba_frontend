import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DeviceKeyError,
  checkDeviceKeySupport,
  createDeviceKey,
  decodePublicKey,
  deleteDeviceKey,
  loadDeviceKey,
  owned,
  persistenceStatus,
  requestPersistentStorage,
  signWithDeviceKey,
  verifyDeviceKey,
} from '@/lib/crypto/device-key';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('device key', () => {
  it('is supported in an Ed25519-capable runtime', async () => {
    expect(await checkDeviceKeySupport()).toEqual({ ok: true });
  });

  it('creates a non-extractable key, stores it, and reloads a key that still signs', async () => {
    const key = await createDeviceKey('uid-device-0001');
    expect(key.publicKey).toMatch(/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/);
    expect(decodePublicKey(key.publicKey)).toHaveLength(32);
    expect(key.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('pkcs8', key.privateKey)).rejects.toThrow();
    await expect(crypto.subtle.exportKey('jwk', key.privateKey)).rejects.toThrow();
    const reloaded = await loadDeviceKey('uid-device-0001');
    expect(reloaded?.publicKey).toBe(key.publicKey);
    expect(reloaded?.privateKey.extractable).toBe(false);
    expect(await verifyDeviceKey(reloaded!)).toBe(true);
    const msg = new TextEncoder().encode('obiba:recovery-kit:v1:mainnet:ama.obiba.near:ed25519:x');
    const sig = await signWithDeviceKey(reloaded!, msg);
    const pub = await crypto.subtle.importKey('raw', decodePublicKey(key.publicKey), { name: 'Ed25519' }, false, ['verify']);
    expect(await crypto.subtle.verify({ name: 'Ed25519' }, pub, owned(sig), msg)).toBe(true);
  });

  it('never silently replaces an existing key', async () => {
    await createDeviceKey('uid-device-0002');
    await expect(createDeviceKey('uid-device-0002')).rejects.toMatchObject({ problem: 'exists' });
  });

  it('keeps a separate key for each account in the same browser', async () => {
    const a = await createDeviceKey('uid-multi-aaaa');
    const b = await createDeviceKey('uid-multi-bbbb');
    const c = await createDeviceKey('uid-multi-cccc');
    expect(new Set([a.publicKey, b.publicKey, c.publicKey]).size).toBe(3);
    expect((await loadDeviceKey('uid-multi-aaaa'))?.publicKey).toBe(a.publicKey);
    expect((await loadDeviceKey('uid-multi-bbbb'))?.publicKey).toBe(b.publicKey);
    await expect(createDeviceKey('uid-multi-aaaa')).rejects.toMatchObject({ problem: 'exists' });
    expect((await loadDeviceKey('uid-multi-aaaa'))?.publicKey).toBe(a.publicKey);
  });

  it('removes only the named account key and leaves the others usable', async () => {
    await createDeviceKey('uid-remove-aaaa');
    const b = await createDeviceKey('uid-remove-bbbb');
    await deleteDeviceKey('uid-remove-aaaa');
    expect(await loadDeviceKey('uid-remove-aaaa')).toBeNull();
    const kept = await loadDeviceKey('uid-remove-bbbb');
    expect(kept?.publicKey).toBe(b.publicKey);
    expect(await verifyDeviceKey(kept!)).toBe(true);
  });

  it('reports a missing key as missing, not as an error', async () => {
    expect(await loadDeviceKey('uid-nobody-0000')).toBeNull();
  });

  it('refuses browsers without Ed25519 WebCrypto and never falls back', async () => {
    const real = crypto.subtle;
    const generateKey = vi.fn(async () => {
      throw new DOMException('Algorithm: Unrecognized name', 'NotSupportedError');
    });
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto), subtle: { ...real, generateKey, exportKey: real.exportKey.bind(real), importKey: real.importKey.bind(real), sign: real.sign.bind(real), verify: real.verify.bind(real) } });
    expect(await checkDeviceKeySupport()).toEqual({ ok: false, problem: 'no_ed25519' });
    await expect(createDeviceKey('uid-device-0003')).rejects.toBeInstanceOf(DeviceKeyError);
    expect(generateKey.mock.calls.length).toBeGreaterThan(0);
    expect(generateKey.mock.calls.every((c) => (c as unknown[])[1] === false)).toBe(true);
  });

  it('refuses a runtime that hands back an extractable private key', async () => {
    const real = crypto.subtle;
    const generateKey = vi.fn(async (alg: AlgorithmIdentifier, _extractable: boolean, usages: KeyUsage[]) => real.generateKey(alg as 'Ed25519', true, usages));
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto), subtle: { ...real, generateKey, exportKey: real.exportKey.bind(real), importKey: real.importKey.bind(real), sign: real.sign.bind(real), verify: real.verify.bind(real) } });
    expect(await checkDeviceKeySupport()).toEqual({ ok: false, problem: 'extractable' });
  });

  it('reports storage persistence honestly', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist: async () => false } });
    expect(await requestPersistentStorage()).toBe('denied');
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist: async () => true } });
    expect(await requestPersistentStorage()).toBe('granted');
    vi.stubGlobal('navigator', {});
    expect(await persistenceStatus()).toBe('unsupported');
  });
});
