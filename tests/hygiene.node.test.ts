import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const SOURCES = files(join(ROOT, 'src')).filter((f) => /\.(ts|tsx|css|json)$/.test(f));
const read = (f: string) => readFileSync(f, 'utf8');
const rel = (f: string) => relative(ROOT, f);

describe('source hygiene for a money app', () => {
  it('keeps every source file pure ASCII (audit F-30)', () => {
    const bad = SOURCES.filter((f) => /[^\x00-\x7F]/.test(read(f))).map(rel);
    expect(bad).toEqual([]);
  });

  it('never logs to the console', () => {
    const bad = SOURCES.filter((f) => /\bconsole\.(log|info|warn|error|debug|trace)\b/.test(read(f))).map(rel);
    expect(bad).toEqual([]);
  });

  it('never injects raw HTML', () => {
    expect(SOURCES.filter((f) => read(f).includes('dangerouslySetInnerHTML')).map(rel)).toEqual([]);
  });

  it('touches localStorage only for the authenticator reminder and the display-currency preference, and never stores Kit material', () => {
    const users = SOURCES.filter((f) => read(f).includes('localStorage')).map(rel);
    expect(users.sort()).toEqual(['src/features/onboarding/totp-deferral.ts', 'src/features/wallet/display-currency.ts']);
    const kit = read(join(ROOT, 'src/features/onboarding/steps/kit-step.tsx'));
    expect(kit).not.toMatch(/sessionStorage|localStorage|indexedDB|clipboard|navigator\.share/);
  });

  it('creates device keys as non-extractable and never exports private key material', () => {
    const src = read(join(ROOT, 'src/lib/crypto/device-key.ts'));
    expect(src).toMatch(/generateKey\(\{ name: 'Ed25519' \}, false,/);
    expect(src).not.toMatch(/generateKey\([^)]*,\s*true\s*,/);
    expect(src).not.toMatch(/exportKey\('(jwk|pkcs8)', (key|record|reloaded)\.privateKey/);
  });

  it('never calls the standard BIP-39 wallet derivation for the Recovery Kit', () => {
    const offenders = SOURCES.filter((f) => /mnemonicToSeed|HDKey|derivePath|slip10/i.test(read(f))).map(rel);
    expect(offenders).toEqual([]);
  });
});
