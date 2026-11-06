import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { ApiError } from '@/lib/graphql/client';
import { t } from '@/lib/strings';
import { fakeApi, makeServices, renderWith } from './helpers';

vi.mock('@/lib/config', async (original) => {
  const actual = await original<typeof import('@/lib/config')>();
  return { ...actual, webConfig: () => ({ ...actual.webConfig(), turnstileSiteKey: 'site-key' }) };
});

const TOKEN = 'cloudflare-token';

function stubTurnstile(pass: boolean) {
  const reset = vi.fn();
  window.turnstile = {
    render: (_el, options) => {
      if (pass) (options.callback as (token: string) => void)(TOKEN);
      return 'widget';
    },
    reset,
    remove: vi.fn(),
  };
  return reset;
}

async function fill() {
  await userEvent.type(screen.getByLabelText(t.signUp.fullName), 'Ama Owusu');
  await userEvent.type(screen.getByLabelText(t.signUp.phone), '024 123 4567');
  await userEvent.type(screen.getByLabelText(t.common.email), 'ama@example.com');
  await userEvent.type(screen.getByLabelText(t.common.password), 'a-long-passphrase');
}

describe('sign up behind the Cloudflare check', () => {
  afterEach(() => {
    delete window.turnstile;
  });

  it('asks for the check first and never touches the API without a token', async () => {
    stubTurnstile(false);
    const request = vi.fn(async () => ({ createAccount: true }));
    const services = makeServices({ api: fakeApi(request) });
    renderWith(<SignUpForm />, services);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: t.signUp.submit }));
    expect(await screen.findByText(t.signUp.humanCheckNeeded)).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
    expect(services.auth.signUp).not.toHaveBeenCalled();
  });

  it('creates the account through the API, then signs in, never through Firebase directly', async () => {
    stubTurnstile(true);
    const request = vi.fn(async () => ({ createAccount: true }));
    const services = makeServices({ api: fakeApi(request) });
    renderWith(<SignUpForm />, services);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: t.signUp.submit }));
    await waitFor(() => expect(services.auth.signIn).toHaveBeenCalledWith('ama@example.com', 'a-long-passphrase'));
    expect(request).toHaveBeenCalledWith('CreateAccount', { input: { email: 'ama@example.com', password: 'a-long-passphrase', displayName: 'Ama Owusu', turnstileToken: TOKEN } });
    expect(services.auth.signUp).not.toHaveBeenCalled();
  });

  it('resets the single-use token after a refusal and shows the generic message', async () => {
    const reset = stubTurnstile(true);
    const services = makeServices({
      api: fakeApi(async () => {
        throw new ApiError('SIGN_UP_REFUSED');
      }),
    });
    renderWith(<SignUpForm />, services);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: t.signUp.submit }));
    expect(await screen.findByText(t.signUp.notCreated)).toBeInTheDocument();
    await waitFor(() => expect(reset).toHaveBeenCalledWith('widget'));
    expect(services.auth.signIn).not.toHaveBeenCalled();
  });
});
