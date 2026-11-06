import { base58 } from '@scure/base';

const DB_NAME = 'obiba-device';
const DB_VERSION = 1;
const STORE = 'keys';
const PROBE = new TextEncoder().encode('obiba:device-key-probe:v1');
const LOCK = 'obiba-device-key';

export type SupportProblem = 'no_webcrypto' | 'no_ed25519' | 'extractable' | 'sign_failed' | 'no_indexeddb';
export type SupportResult = { ok: true } | { ok: false; problem: SupportProblem };

export interface StoredDeviceKey {
  uid: string;
  publicKey: string;
  privateKey: CryptoKey;
  createdAt: number;
}

export class DeviceKeyError extends Error {
  constructor(readonly problem: SupportProblem | 'storage' | 'roundtrip' | 'exists') {
    super(problem);
    this.name = 'DeviceKeyError';
  }
}

export function encodePublicKey(raw: Uint8Array): string {
  if (raw.length !== 32) throw new Error('Ed25519 public keys are 32 bytes');
  return `ed25519:${base58.encode(raw)}`;
}

export function owned(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
}

export function decodePublicKey(key: string): Uint8Array<ArrayBuffer> {
  const m = /^ed25519:([1-9A-HJ-NP-Za-km-z]{43,44})$/.exec(key);
  if (!m) throw new Error('Invalid Ed25519 public key');
  const raw = base58.decode(m[1]!);
  if (raw.length !== 32) throw new Error('Invalid Ed25519 public key');
  return owned(raw);
}

function subtle(): SubtleCrypto | null {
  return typeof globalThis.crypto?.subtle?.generateKey === 'function' ? globalThis.crypto.subtle : null;
}

async function verifyWith(publicKey: string, message: Uint8Array, signature: Uint8Array): Promise<boolean> {
  const s = subtle();
  if (!s) return false;
  const key = await s.importKey('raw', decodePublicKey(publicKey), { name: 'Ed25519' }, false, ['verify']);
  return s.verify({ name: 'Ed25519' }, key, owned(signature), owned(message));
}

export async function checkDeviceKeySupport(): Promise<SupportResult> {
  const s = subtle();
  if (!s) return { ok: false, problem: 'no_webcrypto' };
  if (typeof globalThis.indexedDB?.open !== 'function') return { ok: false, problem: 'no_indexeddb' };
  let pair: CryptoKeyPair;
  try {
    pair = (await s.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
  } catch {
    return { ok: false, problem: 'no_ed25519' };
  }
  if (pair.privateKey.extractable) return { ok: false, problem: 'extractable' };
  const exportable = await s.exportKey('pkcs8', pair.privateKey).then(
    () => true,
    () => false,
  );
  if (exportable) return { ok: false, problem: 'extractable' };
  try {
    const raw = new Uint8Array(await s.exportKey('raw', pair.publicKey));
    const sig = new Uint8Array(await s.sign({ name: 'Ed25519' }, pair.privateKey, PROBE));
    if (sig.length !== 64 || !(await verifyWith(encodePublicKey(raw), PROBE, sig))) return { ok: false, problem: 'sign_failed' };
  } catch {
    return { ok: false, problem: 'sign_failed' };
  }
  return { ok: true };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      reject(new DeviceKeyError('storage'));
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'uid' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new DeviceKeyError('storage'));
    req.onblocked = () => reject(new DeviceKeyError('storage'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      let result: T | undefined;
      if (req) req.onsuccess = () => (result = req.result);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(new DeviceKeyError('storage'));
      tx.onabort = () => reject(new DeviceKeyError('storage'));
    });
  } finally {
    db.close();
  }
}

export async function loadDeviceKey(uid: string): Promise<StoredDeviceKey | null> {
  const rec = await withStore<StoredDeviceKey | undefined>('readonly', (s) => s.get(uid) as IDBRequest<StoredDeviceKey | undefined>);
  if (!rec || !(rec.privateKey instanceof CryptoKey) || typeof rec.publicKey !== 'string') return null;
  return rec;
}

export async function deleteDeviceKey(uid: string): Promise<void> {
  await withLock(() => withStore('readwrite', (s) => s.delete(uid)));
}

async function saveDeviceKey(rec: StoredDeviceKey): Promise<void> {
  await withStore('readwrite', (s) => s.add(rec));
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks?.request) return locks.request(LOCK, { mode: 'exclusive' }, fn) as Promise<T>;
  return fn();
}

export async function signWithDeviceKey(key: StoredDeviceKey, message: Uint8Array): Promise<Uint8Array> {
  const s = subtle();
  if (!s) throw new DeviceKeyError('no_webcrypto');
  const sig = new Uint8Array(await s.sign({ name: 'Ed25519' }, key.privateKey, owned(message)));
  if (sig.length !== 64) throw new DeviceKeyError('sign_failed');
  return sig;
}

export async function verifyDeviceKey(key: StoredDeviceKey): Promise<boolean> {
  try {
    const sig = await signWithDeviceKey(key, PROBE);
    return await verifyWith(key.publicKey, PROBE, sig);
  } catch {
    return false;
  }
}

export async function createDeviceKey(uid: string): Promise<StoredDeviceKey> {
  return withLock(async () => {
    const support = await checkDeviceKeySupport();
    if (!support.ok) throw new DeviceKeyError(support.problem);
    const existing = await loadDeviceKey(uid);
    if (existing) throw new DeviceKeyError('exists');
    const s = subtle()!;
    const pair = (await s.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
    if (pair.privateKey.extractable) throw new DeviceKeyError('extractable');
    const raw = new Uint8Array(await s.exportKey('raw', pair.publicKey));
    const record: StoredDeviceKey = { uid, publicKey: encodePublicKey(raw), privateKey: pair.privateKey, createdAt: Date.now() };
    await saveDeviceKey(record);
    const reloaded = await loadDeviceKey(uid);
    if (!reloaded || reloaded.publicKey !== record.publicKey || reloaded.privateKey.extractable || !(await verifyDeviceKey(reloaded))) {
      throw new DeviceKeyError('roundtrip');
    }
    return reloaded;
  });
}

export type PersistenceStatus = 'granted' | 'denied' | 'unsupported';

export async function requestPersistentStorage(): Promise<PersistenceStatus> {
  const storage = (globalThis.navigator as Navigator | undefined)?.storage;
  if (typeof storage?.persist !== 'function') return 'unsupported';
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return 'granted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function persistenceStatus(): Promise<PersistenceStatus> {
  const storage = (globalThis.navigator as Navigator | undefined)?.storage;
  if (typeof storage?.persisted !== 'function') return 'unsupported';
  try {
    return (await storage.persisted()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
