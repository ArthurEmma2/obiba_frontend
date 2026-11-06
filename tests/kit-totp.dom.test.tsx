import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KitStep } from '@/features/onboarding/steps/kit-step';
import { TotpStep } from '@/features/onboarding/steps/totp-step';
import { isTotpDeferred } from '@/features/onboarding/totp-deferral';
import { kitPublicKey, kitSeedFromWords } from '@/lib/crypto/recovery-kit';
import { t } from '@/lib/strings';
import { USER, fakeApi, fakeAuth, fakeDevice, makeServices, renderWith } from './helpers';

const DEVICE_KEY = { uid: USER.uid, publicKey: 'ed25519:5dbPcQ9rVH7JD3Y5ygMV6k1zjknxWqDMhDHvvPNjaiPq', privateKey: {} as CryptoKey, createdAt: 1 };

function shownWords(): string[] {
  const list = screen.getByRole('list', { name: t.kit.revealTitle });
  return within(list)
    .getAllByRole('listitem')
    .map((li) => li.textContent!.replace(/^\d+/, '').trim());
}

describe('Recovery Kit step', () => {
  it('generates 24 words, confirms three, registers a key derived from them, then forgets them', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const log = vi.spyOn(console, 'log');
    const signed: Uint8Array[] = [];
    const device = fakeDevice({
      load: async () => DEVICE_KEY,
      sign: async (_k, msg) => {
        signed.push(msg);
        return new Uint8Array(64).fill(9);
      },
    });
    const api = fakeApi(async (name, variables) => {
      expect(name).toBe('RegisterRecoveryKit');
      const v = variables as { kitPublicKey: string };
      return { registerRecoveryKit: { active: true, publicKey: v.kitPublicKey, createdAt: '2026-10-26T00:00:00Z' } };
    });
    const onDone = vi.fn();
    renderWith(<KitStep uid={USER.uid} accountId="ama-owusu.obiba.near" onDone={onDone} />, makeServices({ device, api }));

    await userEvent.click(screen.getByRole('button', { name: t.kit.generate }));
    const words = shownWords();
    expect(words).toHaveLength(24);
    expect(screen.getByRole('img', { name: t.kit.qrLabel })).toBeInTheDocument();
    expect(screen.getByText(t.kit.warning)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: t.kit.written }));
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(3);
    for (const input of inputs) {
      expect(input).toHaveAttribute('autocomplete', 'off');
      expect(input).toHaveAttribute('spellcheck', 'false');
      await userEvent.type(input, 'wrong');
    }
    await userEvent.click(screen.getByRole('button', { name: t.kit.register }));
    expect(await screen.findByText(t.kit.mismatch)).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();

    const labels = inputs.map((i) => document.querySelector(`label[for="${i.id}"]`)!.textContent!);
    for (let i = 0; i < inputs.length; i++) {
      const position = Number(labels[i]!.replace(/\D/g, '')) - 1;
      await userEvent.clear(inputs[i]!);
      await userEvent.type(inputs[i]!, words[position]!.toUpperCase());
    }
    await userEvent.click(screen.getByRole('button', { name: t.kit.register }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    const expectedKit = kitPublicKey(kitSeedFromWords(words.join(' ')));
    expect(api.request).toHaveBeenCalledWith('RegisterRecoveryKit', { kitPublicKey: expectedKit, devicePublicKey: DEVICE_KEY.publicKey, deviceSignature: Buffer.alloc(64, 9).toString('base64') });
    expect(new TextDecoder().decode(signed[0])).toBe(`obiba:recovery-kit:v1:mainnet:ama-owusu.obiba.near:${expectedKit}`);

    expect(document.body.textContent).not.toContain(words.slice(0, 6).join(''));
    for (const w of new Set(words)) expect(screen.queryByText(w)).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('wipes the words when the user leaves the screen for too long', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWith(<KitStep uid={USER.uid} accountId="ama-owusu.obiba.near" onDone={vi.fn()} />, makeServices());
    await userEvent.click(screen.getByRole('button', { name: t.kit.generate }));
    const words = shownWords();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(61_000);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    expect(await screen.findByText(t.kit.clearedForSafety)).toBeInTheDocument();
    for (const w of new Set(words)) expect(screen.queryByText(w)).toBeNull();
    vi.useRealTimers();
  });
});

describe('authenticator step', () => {
  it('enrolls with a QR and manual key, rejects a wrong code, then confirms', async () => {
    const finish = vi.fn().mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/invalid-verification-code' })).mockResolvedValueOnce(undefined);
    const auth = fakeAuth({ startTotpEnrollment: vi.fn(async () => ({ secretKey: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/Obiba:ama?secret=JBSWY3DPEHPK3PXP&issuer=Obiba', finish })) });
    const onDone = vi.fn();
    renderWith(<TotpStep uid={USER.uid} onDone={onDone} />, makeServices({ auth }));
    expect(screen.getByText(t.totp.samePhone)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t.totp.start }));
    expect(await screen.findByText('JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: t.totp.scan })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(t.totp.code), '111111');
    await userEvent.click(screen.getByRole('button', { name: t.totp.verify }));
    expect(await screen.findByText(t.totp.invalid)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(t.totp.code));
    await userEvent.type(screen.getByLabelText(t.totp.code), '222222');
    await userEvent.click(screen.getByRole('button', { name: t.totp.verify }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(finish).toHaveBeenLastCalledWith('222222');
  });

  it('can be set up later, and remembers that choice only as a reminder', async () => {
    const onDone = vi.fn();
    renderWith(<TotpStep uid="uid-later-0001" onDone={onDone} />, makeServices());
    await userEvent.click(screen.getByRole('button', { name: t.totp.skip }));
    expect(onDone).toHaveBeenCalled();
    expect(isTotpDeferred('uid-later-0001')).toBe(true);
  });

  it('says so plainly when the environment has TOTP disabled', async () => {
    const auth = fakeAuth({ startTotpEnrollment: vi.fn(async () => Promise.reject(Object.assign(new Error('x'), { code: 'auth/operation-not-allowed' }))) });
    renderWith(<TotpStep uid={USER.uid} onDone={vi.fn()} />, makeServices({ auth }));
    await userEvent.click(screen.getByRole('button', { name: t.totp.start }));
    await waitFor(() => expect(screen.getByText(t.totp.unavailable)).toBeInTheDocument());
  });
});
