import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountStep } from '@/features/onboarding/steps/account-step';
import { DeviceStep } from '@/features/onboarding/steps/device-step';
import { ProfileStep } from '@/features/onboarding/steps/profile-step';
import { VerifyEmailStep } from '@/features/onboarding/steps/verify-email-step';
import { ApiError } from '@/lib/graphql/client';
import { t } from '@/lib/strings';
import { ME, USER, fakeApi, fakeAuth, fakeDevice, makeServices, renderWith } from './helpers';

afterEach(() => {
  vi.useRealTimers();
});

function availability(map: Record<string, { available: boolean; reason?: string; suggestions?: string[] }>) {
  return async (name: string, variables: unknown) => {
    if (name !== 'AccountNameAvailability') throw new Error(`unexpected ${name}`);
    const n = (variables as { name: string }).name;
    const r = map[n] ?? { available: true };
    return { accountNameAvailability: { name: n, accountId: r.available ? `${n}.obiba.near` : null, available: r.available, reason: r.reason ?? null, suggestions: r.suggestions ?? [] } };
  };
}

describe('profile and account name', () => {
  it('previews the public name live and confirms availability from the server', async () => {
    const api = fakeApi(availability({}));
    renderWith(<ProfileStep defaultName="Ama Owusu" onDone={vi.fn()} />, makeServices({ api }));
    await userEvent.type(screen.getByLabelText(t.profile.accountName), 'Ama-Gh');
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'ama-gh.obiba.near')).toBeInTheDocument();
    expect(await screen.findByText(t.profile.available)).toBeInTheDocument();
    expect(api.request).toHaveBeenCalledWith('AccountNameAvailability', { name: 'ama-gh' }, expect.anything());
  });

  it.each(['TAKEN', 'RESERVED', 'TOO_SHORT', 'TOO_LONG', 'CHARACTERS', 'HYPHENS', 'LOOKS_LIKE_PHONE', 'TOO_LONG_WITH_PARENT'])('explains %s and offers the server suggestions', async (reason) => {
    const api = fakeApi(availability({ taken: { available: false, reason, suggestions: ['taken-gh', 'taken2'] } }));
    renderWith(<ProfileStep defaultName="Ama" onDone={vi.fn()} />, makeServices({ api }));
    await userEvent.type(screen.getByLabelText(t.profile.accountName), 'taken');
    expect(await screen.findByText(t.profile.reasons[reason]!)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t.profile.useSuggestion('taken-gh') }));
    expect(screen.getByLabelText(t.profile.accountName)).toHaveValue('taken-gh');
    expect(await screen.findByText(t.profile.available)).toBeInTheDocument();
  });

  it('requires the public-and-permanent acknowledgement before submitting', async () => {
    const api = fakeApi(availability({}));
    renderWith(<ProfileStep defaultName="Ama Owusu" onDone={vi.fn()} />, makeServices({ api }));
    await userEvent.type(screen.getByLabelText(t.profile.phone), '0241234567');
    await userEvent.type(screen.getByLabelText(t.profile.accountName), 'ama-gh');
    await screen.findByText(t.profile.available);
    await userEvent.click(screen.getByRole('button', { name: t.profile.submit }));
    expect(await screen.findByText(t.profile.acknowledgeRequired)).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalledWith('RegisterProfile', expect.anything());
  });

  it('rechecks and explains when someone claims the name first', async () => {
    let claimed = false;
    const check = availability({});
    const api = fakeApi(async (name, variables) => {
      if (name === 'RegisterProfile') {
        claimed = true;
        throw new ApiError('CONFLICT', 'accountName');
      }
      if (claimed) return { accountNameAvailability: { name: 'ama-gh', accountId: null, available: false, reason: 'TAKEN', suggestions: ['ama-gh2'] } };
      return check(name, variables);
    });
    const onDone = vi.fn();
    renderWith(<ProfileStep defaultName="Ama Owusu" onDone={onDone} />, makeServices({ api }));
    await userEvent.type(screen.getByLabelText(t.profile.phone), '0241234567');
    await userEvent.type(screen.getByLabelText(t.profile.accountName), 'ama-gh');
    await screen.findByText(t.profile.available);
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: t.profile.submit }));
    expect(await screen.findByText(t.profile.conflict)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: t.profile.useSuggestion('ama-gh2') })).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('registers the profile with the exact API input', async () => {
    const api = fakeApi(async (name, variables) => (name === 'RegisterProfile' ? { registerProfile: ME } : availability({})(name, variables)));
    const onDone = vi.fn();
    renderWith(<ProfileStep defaultName="Ama Owusu" onDone={onDone} />, makeServices({ api }));
    await userEvent.type(screen.getByLabelText(t.profile.phone), '024 123 4567');
    await userEvent.type(screen.getByLabelText(t.profile.accountName), 'ama-gh');
    await userEvent.click(screen.getByRole('button', { name: t.profile.addHandle }));
    await userEvent.type(screen.getByLabelText(/Obiba @handle/), 'ama_gh');
    await screen.findByText(t.profile.available);
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: t.profile.submit }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.request).toHaveBeenCalledWith('RegisterProfile', { input: { displayName: 'Ama Owusu', phone: '+233241234567', handle: 'ama_gh', accountName: 'ama-gh' } });
  });
});

describe('device key step', () => {
  it('blocks unsupported browsers and offers no weaker fallback', () => {
    const device = fakeDevice();
    renderWith(<DeviceStep uid={USER.uid} localKey={{ state: 'unsupported' }} devices={[]} onDone={vi.fn()} onSignOut={vi.fn()} />, makeServices({ device }));
    expect(screen.getByText(t.device.unsupportedTitle)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.device.create })).toBeNull();
    expect(device.create).not.toHaveBeenCalled();
  });

  it('explains blocked storage', () => {
    renderWith(<DeviceStep uid={USER.uid} localKey={{ state: 'storage-unavailable' }} devices={[]} onDone={vi.fn()} onSignOut={vi.fn()} />, makeServices());
    expect(screen.getByText(t.device.storageTitle)).toBeInTheDocument();
  });

  it('never creates a second key when the account already has one elsewhere', () => {
    const device = fakeDevice();
    renderWith(
      <DeviceStep uid={USER.uid} localKey={{ state: 'missing' }} devices={[{ publicKey: 'ed25519:other', status: 'active', initial: true, createdAt: '' }]} onDone={vi.fn()} onSignOut={vi.fn()} />,
      makeServices({ device }),
    );
    expect(screen.getByText(t.device.unlinkedTitle)).toBeInTheDocument();
    expect(device.create).not.toHaveBeenCalled();
  });

  it('shows Home Screen guidance on iPhone Safari before creating a key', async () => {
    renderWith(<DeviceStep uid={USER.uid} localKey={{ state: 'missing' }} devices={[]} onDone={vi.fn()} onSignOut={vi.fn()} />, makeServices({ platform: { isIos: () => true, isStandalone: () => false } }));
    expect(screen.getByText(t.device.iosTitle)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t.device.iosContinue }));
    expect(screen.getByRole('button', { name: t.device.create })).toBeInTheDocument();
  });

  it('creates, persists and registers the key, asking for the password when the session is not fresh', async () => {
    const device = fakeDevice({ requestPersistence: async () => 'denied' });
    const auth = fakeAuth({ authAgeSeconds: async () => 900 });
    const api = fakeApi(async (name, variables) => {
      expect(name).toBe('RegisterDevice');
      return { registerDevice: { publicKey: (variables as { publicKey: string }).publicKey, status: 'pending', provisioningQueued: true } };
    });
    const onDone = vi.fn();
    renderWith(<DeviceStep uid={USER.uid} localKey={{ state: 'missing' }} devices={[]} onDone={onDone} onSignOut={vi.fn()} />, makeServices({ device, auth, api }));
    await userEvent.click(screen.getByRole('button', { name: t.device.create }));
    expect(await screen.findByText(t.reauth.title)).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(t.common.password), 'my password');
    await userEvent.click(screen.getByRole('button', { name: t.reauth.submit }));
    expect(await screen.findByText(t.device.created)).toBeInTheDocument();
    expect(screen.getByText(t.device.notPersisted)).toBeInTheDocument();
    expect(auth.reauthenticate).toHaveBeenCalledWith('my password');
    expect(api.request).toHaveBeenCalledWith('RegisterDevice', { publicKey: 'ed25519:5dbPcQ9rVH7JD3Y5ygMV6k1zjknxWqDMhDHvvPNjaiPq' });
    await userEvent.click(screen.getByRole('button', { name: t.common.continue }));
    expect(onDone).toHaveBeenCalled();
  });

  it('reuses a saved key after a failed registration instead of making a new one', async () => {
    const saved = { uid: USER.uid, publicKey: 'ed25519:5dbPcQ9rVH7JD3Y5ygMV6k1zjknxWqDMhDHvvPNjaiPq', privateKey: {} as CryptoKey, createdAt: 1 };
    const device = fakeDevice({ load: async () => saved });
    const api = fakeApi(async () => {
      throw new ApiError('SERVICE_PAUSED');
    });
    renderWith(<DeviceStep uid={USER.uid} localKey={{ state: 'present', publicKey: saved.publicKey }} devices={[]} onDone={vi.fn()} onSignOut={vi.fn()} />, makeServices({ device, api }));
    await userEvent.click(screen.getByRole('button', { name: t.device.create }));
    expect(await screen.findByText(new RegExp(t.device.registerFailed.slice(0, 30)))).toBeInTheDocument();
    expect(device.create).not.toHaveBeenCalled();
  });
});

describe('account provisioning', () => {
  it('shows the waitlist when the pilot is not open to this user', () => {
    renderWith(<AccountStep initial={{ ...ME, pilotAllowed: false, accountStatus: null, accountId: null }} onActive={vi.fn()} />, makeServices({ api: fakeApi(async () => ({ me: ME })) }));
    expect(screen.getAllByText(t.account.waitlistTitle).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: t.common.continue })).toBeNull();
  });

  it.each([
    ['quarantined', t.account.quarantinedTitle],
    ['frozen', t.account.frozenTitle],
  ] as const)('blocks progress for a %s account', (status, title) => {
    renderWith(<AccountStep initial={{ ...ME, accountStatus: status }} onActive={vi.fn()} />, makeServices());
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.common.continue })).toBeNull();
  });

  it('refreshes on any live event and only continues once the server says active', async () => {
    let push: (() => void) | null = null;
    let status: 'provisioning' | 'active' = 'provisioning';
    const api = fakeApi(
      async () => ({ me: { ...ME, accountStatus: status } }),
      ((_: string, onData: () => void, onState?: (s: string) => void) => {
        push = onData;
        onState?.('live');
        return () => undefined;
      }) as never,
    );
    const onActive = vi.fn();
    renderWith(<AccountStep initial={{ ...ME, accountStatus: 'provisioning' }} onActive={onActive} />, makeServices({ api }));
    expect(screen.getByText(t.account.provisioning)).toBeInTheDocument();
    expect(screen.getByText(t.account.live)).toBeInTheDocument();
    status = 'active';
    await act(async () => push?.());
    expect(await screen.findByText(t.account.activeTitle)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t.common.continue }));
    expect(onActive).toHaveBeenCalled();
  });
});

describe('email verification', () => {
  it('keeps the user here until the email is really verified', async () => {
    const auth = fakeAuth();
    vi.mocked(auth.refreshVerification).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onVerified = vi.fn();
    renderWith(<VerifyEmailStep email="ama@example.com" onVerified={onVerified} />, makeServices({ auth }));
    expect(screen.getByText('ama@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /You can resend in/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: t.verify.check }));
    expect(await screen.findByText(t.verify.stillPending)).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: t.verify.check }));
    await waitFor(() => expect(onVerified).toHaveBeenCalled());
  });
});

describe('re-confirming identity for Google accounts', () => {
  it('offers Google instead of a password for a Google-only account, then retries the action', async () => {
    const auth = fakeAuth({ authAgeSeconds: async () => 900, reauthMethods: () => ['google'] });
    const api = fakeApi(async (_name, variables) => ({ registerDevice: { publicKey: (variables as { publicKey: string }).publicKey, status: 'pending', provisioningQueued: true } }));
    renderWith(<DeviceStep uid={USER.uid} localKey={{ state: 'missing' }} devices={[]} onDone={vi.fn()} onSignOut={vi.fn()} />, makeServices({ auth, api }));
    await userEvent.click(screen.getByRole('button', { name: t.device.create }));
    expect(await screen.findByRole('button', { name: t.google.reauth })).toBeInTheDocument();
    expect(screen.queryByLabelText(t.common.password)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: t.google.reauth }));
    expect(await screen.findByText(t.device.created)).toBeInTheDocument();
    expect(auth.reauthenticateWithGoogle).toHaveBeenCalled();
  });
});
