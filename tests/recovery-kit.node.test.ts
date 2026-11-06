import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KitFormatError,
  generateKitSeed,
  kitPublicKey,
  kitSeedFromWords,
  kitSign,
  kitWords,
  pickConfirmationPositions,
  recoveryKitRegistrationMessage,
  toBase64,
} from '@/lib/crypto/recovery-kit';

interface Vector {
  seedHex: string;
  words: string;
  publicKey: string;
  registrationMessageBase64: string;
  registrationSignature: string;
  challengeMessageBase64: string;
  challengeSignature: string;
  wrongKeyFromStandardWalletDerivation: string;
}

const LOCKED = JSON.parse(readFileSync(join(__dirname, 'fixtures/recovery-kit-vectors.json'), 'utf8')) as {
  spec: string;
  context: { networkId: string; accountId: string };
  vectors: Vector[];
};

const hex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));
const b64 = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'));

describe('Recovery Kit matches the backend obiba-recovery-kit-v1 vectors', () => {
  it('uses the spec the backend locked', () => {
    expect(LOCKED.spec).toBe('obiba-recovery-kit-v1');
    expect(LOCKED.vectors.length).toBeGreaterThanOrEqual(6);
  });

  it.each(LOCKED.vectors.map((v, i) => [i, v] as const))('vector %i: words, key and both signatures are byte-identical', (_, v) => {
    const seed = hex(v.seedHex);
    expect(kitWords(seed).join(' ')).toBe(v.words);
    expect(Buffer.from(kitSeedFromWords(v.words)).toString('hex')).toBe(v.seedHex);
    expect(kitPublicKey(seed)).toBe(v.publicKey);
    expect(kitPublicKey(seed)).not.toBe(v.wrongKeyFromStandardWalletDerivation);
    const reg = recoveryKitRegistrationMessage(LOCKED.context.networkId, LOCKED.context.accountId, v.publicKey);
    expect(toBase64(reg)).toBe(v.registrationMessageBase64);
    expect(toBase64(kitSign(seed, b64(v.registrationMessageBase64)))).toBe(v.registrationSignature);
    expect(toBase64(kitSign(seed, b64(v.challengeMessageBase64)))).toBe(v.challengeSignature);
  });

  it('restores from messy input, and rejects bad counts, unknown words and bad checksums', () => {
    const v = LOCKED.vectors[3]!;
    expect(kitPublicKey(kitSeedFromWords(`  ${v.words.toUpperCase().split(' ').join('   ')}\n`))).toBe(v.publicKey);
    const words = v.words.split(' ');
    expect(() => kitSeedFromWords(words.slice(0, 23).join(' '))).toThrow(KitFormatError);
    expect(() => kitSeedFromWords(`${'abandon '.repeat(11)}about`)).toThrow(KitFormatError);
    try {
      kitSeedFromWords([...words.slice(0, 5), 'obiba', ...words.slice(6)].join(' '));
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ problem: 'word', position: 6 });
    }
    expect(() => kitSeedFromWords([words[0] === 'zoo' ? 'abandon' : 'zoo', ...words.slice(1)].join(' '))).toThrow(KitFormatError);
  });

  it('generates 32 random bytes and three distinct confirmation positions', () => {
    const a = generateKitSeed();
    const b = generateKitSeed();
    expect(a).toHaveLength(32);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(kitWords(a)).toHaveLength(24);
    for (let i = 0; i < 50; i++) {
      const p = pickConfirmationPositions();
      expect(new Set(p).size).toBe(3);
      expect(p.every((n) => n >= 0 && n < 24)).toBe(true);
    }
  });
});
