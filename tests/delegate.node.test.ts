import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DelegateMismatch, checkAccountCall, checkDelegate, checkPrepared, decodeDelegate, delegateSigningHash, deviceOpHash, parseOpArgs, toHex } from '@/lib/crypto/delegate';

interface Vector {
  name: string;
  methodName: string;
  argsBase64: string;
  delegateBase64: string;
  signingHashHex: string;
  deviceOpHash: string;
  nonce: string;
  maxBlockHeight: string;
}

const LOCKED = JSON.parse(readFileSync(join(__dirname, 'fixtures/signing-vectors.json'), 'utf8')) as {
  context: { networkId: string; accountId: string; devicePublicKey: string };
  vectors: Vector[];
};
const ctx = LOCKED.context;

describe('delegate verification matches the backend signing vectors', () => {
  it.each(LOCKED.vectors.map((v) => [v.name, v] as const))('%s: decodes, hashes and recomputes deviceOpHash byte for byte', async (_, v) => {
    const d = decodeDelegate(v.delegateBase64);
    expect(d.senderId).toBe(ctx.accountId);
    expect(d.receiverId).toBe(ctx.accountId);
    expect(d.publicKey).toBe(ctx.devicePublicKey);
    expect(d.nonce.toString()).toBe(v.nonce);
    expect(d.maxBlockHeight.toString()).toBe(v.maxBlockHeight);
    expect(d.actions[0]!.methodName).toBe(v.methodName);
    expect(Buffer.from(d.actions[0]!.args!).toString('base64')).toBe(v.argsBase64);
    expect(toHex(await delegateSigningHash(v.delegateBase64))).toBe(v.signingHashHex);
    const { op } = parseOpArgs(v.argsBase64);
    expect(await deviceOpHash(ctx.networkId, ctx.accountId, op)).toBe(v.deviceOpHash);
    const hash = await checkDelegate({ delegateBase64: v.delegateBase64, signingHashHex: v.signingHashHex, methodName: v.methodName }, v, { accountId: ctx.accountId, devicePublicKey: ctx.devicePublicKey });
    expect(toHex(hash)).toBe(v.signingHashHex);
  });

  const transfer = LOCKED.vectors.find((v) => v.name === 'transfer')!;
  const { op } = parseOpArgs(transfer.argsBase64);
  const prepared = { opId: op.op_id, accountId: ctx.accountId, methodName: 'execute', argsBase64: transfer.argsBase64, amount: op.amount, receiver: op.receiver, deviceOpHash: transfer.deviceOpHash };
  const pctx = { accountId: ctx.accountId, networkId: ctx.networkId, token: op.token };

  it('accepts a prepared op that matches what the user approved', async () => {
    await expect(checkPrepared(prepared, { kind: 'Transfer', receiver: op.receiver, amount: op.amount }, pctx)).resolves.toMatchObject({ op_id: op.op_id });
  });

  it.each([
    ['a swapped recipient', { kind: 'Transfer' as const, receiver: 'attacker.near', amount: op.amount }, 'receiver'],
    ['a different amount', { kind: 'Transfer' as const, receiver: op.receiver, amount: (BigInt(op.amount) + 1n).toString() }, 'amount'],
    ['a different kind', { kind: 'PayInvoice' as const, receiver: op.receiver, amount: op.amount }, 'method'],
  ])('refuses %s', async (_, approved, reason) => {
    await expect(checkPrepared(prepared, approved, pctx)).rejects.toMatchObject({ reason });
  });

  it('refuses a server deviceOpHash that does not match the op', async () => {
    await expect(checkPrepared({ ...prepared, deviceOpHash: '00'.repeat(32) }, { kind: 'Transfer', receiver: op.receiver, amount: op.amount }, pctx)).rejects.toMatchObject({ reason: 'device_op_hash' });
  });

  it('refuses a server signing hash, account, key or args that do not match the delegate', async () => {
    const unsigned = { delegateBase64: transfer.delegateBase64, signingHashHex: transfer.signingHashHex, methodName: 'execute' };
    const dctx = { accountId: ctx.accountId, devicePublicKey: ctx.devicePublicKey };
    await expect(checkDelegate({ ...unsigned, signingHashHex: 'ab'.repeat(32) }, transfer, dctx)).rejects.toMatchObject({ reason: 'signing_hash' });
    await expect(checkDelegate(unsigned, transfer, { ...dctx, accountId: 'kofi.obiba.near' })).rejects.toMatchObject({ reason: 'sender' });
    await expect(checkDelegate(unsigned, transfer, { ...dctx, devicePublicKey: 'ed25519:5dbPcQ9rVH7JD3Y5ygMV6k1zjknxWqDMhDHvvPNjaiPq' })).rejects.toMatchObject({ reason: 'public_key' });
    const other = LOCKED.vectors.find((v) => v.name === 'transfer_cosigned')!;
    await expect(checkDelegate(unsigned, { methodName: 'execute', argsBase64: other.argsBase64 }, dctx)).rejects.toBeInstanceOf(DelegateMismatch);
  });
});

describe('enabling a token on the account', () => {
  const ACCOUNT = 'yaw.obiba.obiba-dev.testnet';
  const TOKEN = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
  const call = (args: Record<string, unknown>) => ({ accountId: ACCOUNT, methodName: 'add_token', argsBase64: Buffer.from(JSON.stringify(args)).toString('base64') });
  const good = { token: TOKEN, decimals: 6, guardian_sig: 'A'.repeat(86) + '==', guardian_nonce: '0' };

  it('signs only the token the person approved, with USDC decimals and no extra arguments', () => {
    expect(() => checkAccountCall(call(good), { method: 'add_token', token: TOKEN }, ACCOUNT)).not.toThrow();
    expect(() => checkAccountCall(call({ ...good, token: 'evil.testnet' }), { method: 'add_token', token: TOKEN }, ACCOUNT)).toThrow(DelegateMismatch);
    expect(() => checkAccountCall(call({ ...good, decimals: 18 }), { method: 'add_token', token: TOKEN }, ACCOUNT)).toThrow(DelegateMismatch);
    expect(() => checkAccountCall(call({ ...good, new_limit: '1' }), { method: 'add_token', token: TOKEN }, ACCOUNT)).toThrow(DelegateMismatch);
    expect(() => checkAccountCall(call(good), { method: 'add_token', token: TOKEN }, 'someone.testnet')).toThrow(DelegateMismatch);
  });
});
