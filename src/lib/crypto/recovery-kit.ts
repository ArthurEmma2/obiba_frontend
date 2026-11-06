import { ed25519 } from '@noble/curves/ed25519.js';
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { encodePublicKey } from './device-key';

export const KIT_WORD_COUNT = 24;
const SEED_BYTES = 32;

export type KitFormatProblem = 'count' | 'word' | 'checksum';

export class KitFormatError extends Error {
  constructor(
    readonly problem: KitFormatProblem,
    readonly position: number | null = null,
  ) {
    super(problem);
    this.name = 'KitFormatError';
  }
}

export function generateKitSeed(): Uint8Array {
  const seed = new Uint8Array(SEED_BYTES);
  crypto.getRandomValues(seed);
  return seed;
}

export function kitWords(seed: Uint8Array): string[] {
  if (seed.length !== SEED_BYTES) throw new Error('A Recovery Kit seed is 32 bytes');
  return entropyToMnemonic(seed, wordlist).split(' ');
}

export function normalizeKitWords(input: string): string[] {
  const s = input.normalize('NFKD').trim().toLowerCase();
  return s === '' ? [] : s.split(/\s+/);
}

export function kitSeedFromWords(input: string): Uint8Array {
  const words = normalizeKitWords(input);
  if (words.length !== KIT_WORD_COUNT) throw new KitFormatError('count');
  const unknown = words.findIndex((w) => !wordlist.includes(w));
  if (unknown >= 0) throw new KitFormatError('word', unknown + 1);
  let seed: Uint8Array;
  try {
    seed = mnemonicToEntropy(words.join(' '), wordlist);
  } catch {
    throw new KitFormatError('checksum');
  }
  if (seed.length !== SEED_BYTES) throw new KitFormatError('count');
  return seed;
}

export function kitPublicKey(seed: Uint8Array): string {
  return encodePublicKey(ed25519.getPublicKey(seed));
}

export function kitSign(seed: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, seed);
}

export function wipe(bytes: Uint8Array | null | undefined): void {
  bytes?.fill(0);
}

export function isKitWord(word: string): boolean {
  return wordlist.includes(word.trim().toLowerCase());
}

export function pickConfirmationPositions(count = 3, total = KIT_WORD_COUNT): number[] {
  const picked = new Set<number>();
  const buf = new Uint32Array(1);
  while (picked.size < count) {
    crypto.getRandomValues(buf);
    const limit = Math.floor(0x1_0000_0000 / total) * total;
    if (buf[0]! >= limit) continue;
    picked.add(buf[0]! % total);
  }
  return [...picked].sort((a, b) => a - b);
}

export function recoveryKitRegistrationMessage(networkId: string, accountId: string, kitPublicKey: string): Uint8Array {
  return new TextEncoder().encode(`obiba:recovery-kit:v1:${networkId}:${accountId}:${kitPublicKey}`);
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
