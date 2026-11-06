import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RestoreRequestForm } from '@/features/recover/request-form';
import { RestoreFlow } from '@/features/recover/restore-flow';
import { t } from '@/lib/strings';
import { fakeApi, fakeDevice, makeServices, renderWith } from './helpers';

const TOKEN = 'A'.repeat(43);

describe('restoring an account after losing the phone number', () => {
  it('sends the new number with the email and never says whether the account exists', async () => {
    const request = vi.fn(async (_vars: unknown) => ({ requestSupportRecovery: true }));
    renderWith(<RestoreRequestForm />, makeServices({ api: fakeApi(async (name, vars) => (name === 'RequestSupportRecovery' ? request(vars) : Promise.reject(new Error(name)))) }));
    await userEvent.type(screen.getByLabelText(t.restore.email), 'ama@example.com');
    await userEvent.type(screen.getByLabelText(t.restore.newPhone), '20 999 8877');
    await userEvent.click(screen.getByRole('button', { name: t.restore.send }));
    expect(await screen.findByRole('heading', { name: t.restore.sentTitle })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith({ email: 'ama@example.com', newPhone: '+233209998877' });
  });

  it('creates this device key from the emailed link, opens the case and shows when the move can start', async () => {
    const confirm = vi.fn(async (_vars: unknown) => ({ confirmSupportRecovery: { caseId: '0b6f2d4e-8c3a-4f1e-9a7b-1c2d3e4f5a6b', statusToken: 'B'.repeat(43), earliestAt: '2026-11-01T10:00:00Z' } }));
    const api = fakeApi(async (name, vars) => {
      if (name === 'SupportLink') return { supportLink: { uid: 'uid-ama', firstName: 'Ama', expiresAt: '2026-10-29T10:30:00Z' } };
      if (name === 'ConfirmSupportRecovery') return confirm(vars);
      if (name === 'SupportRequestStatus') return { supportRequestStatus: { status: 'OPEN', earliestAt: '2026-11-01T10:00:00Z', closedReason: null, recoveryStatus: null, movesAt: null, activated: false } };
      throw new Error(`unexpected ${name}`);
    });
    const device = fakeDevice();
    renderWith(<RestoreFlow token={TOKEN} />, makeServices({ api, device }));
    await userEvent.click(await screen.findByRole('button', { name: t.restore.confirm }));
    expect(await screen.findByRole('heading', { name: t.restore.statusTitle })).toBeInTheDocument();
    expect(screen.getByText(t.restore.status.OPEN!)).toBeInTheDocument();
    expect(device.create).toHaveBeenCalledWith('uid-ama');
    expect(confirm).toHaveBeenCalledWith({ token: TOKEN, newPublicKey: expect.stringMatching(/^ed25519:/) });
  });

  it('offers a new link when the emailed one has expired or was used', async () => {
    renderWith(<RestoreFlow token={TOKEN} />, makeServices({ api: fakeApi(async () => ({ supportLink: null })) }));
    expect(await screen.findByText(t.restore.linkInvalid)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.restore.again })).toHaveAttribute('href', '/recover/request');
  });
});
