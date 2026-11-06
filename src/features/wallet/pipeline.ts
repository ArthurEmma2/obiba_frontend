import { ACCOUNT_METHODS, checkAccountCall, checkDelegate, checkPrepared, DelegateMismatch, type Approved, type ApprovedCall } from '@/lib/crypto/delegate';
import { toBase64 } from '@/lib/crypto/recovery-kit';
import { ApiError } from '@/lib/graphql/client';
import type { OpView, PreparedOp } from '@/lib/graphql/types';
import type { Services } from '@/lib/services';

export type Phase = 'checking' | 'cosigning' | 'approving' | 'sending' | 'confirming';
export type Outcome = { state: 'settled'; op: OpView } | { state: 'failed'; op: OpView } | { state: 'unconfirmed'; opId: string };

export class PaymentError extends Error {
  constructor(readonly code: 'NO_DEVICE_KEY' | 'NEEDS_AUTHENTICATOR' | 'VERIFY_FAILED') {
    super(code);
    this.name = 'PaymentError';
  }
}

export interface PipelineContext {
  services: Services;
  uid: string;
  accountId: string;
  token: string;
  runStepUp: <T>(action: () => Promise<T>, opts?: { requireFresh?: boolean }) => Promise<T>;
  onPhase: (p: Phase) => void;
}

const SETTLED = new Set(['SETTLED']);
const FAILED = new Set(['FAILED', 'EXPIRED', 'REJECTED']);
const POLL_MS = 1500;
const CONFIRM_TIMEOUT_MS = 120_000;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function assemble(delegateBase64: string, signature: Uint8Array): string {
  const bin = atob(delegateBase64);
  const out = new Uint8Array(bin.length + 1 + signature.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  out[bin.length] = 0;
  out.set(signature, bin.length + 1);
  return toBase64(out);
}

export function needsGuardian(amount: bigint, remaining: string, frozen: boolean): boolean {
  return frozen || amount > BigInt(remaining);
}

export async function signAndSubmit(ctx: PipelineContext, prepared: PreparedOp, approved: Approved, cosign: boolean): Promise<string> {
  const { services, uid, accountId, token, runStepUp, onPhase } = ctx;
  onPhase('checking');
  const key = await services.device.load(uid);
  if (!key) throw new PaymentError('NO_DEVICE_KEY');
  try {
    await checkPrepared(prepared, approved, { accountId, networkId: services.networkId, token });
  } catch (err) {
    if (err instanceof DelegateMismatch) throw new PaymentError('VERIFY_FAILED');
    throw err;
  }
  let current = prepared;
  if (cosign) {
    if (!services.auth.totpEnrolled()) throw new PaymentError('NEEDS_AUTHENTICATOR');
    onPhase('cosigning');
    const deviceSignature = toBase64(await services.device.sign(key, hexToBytes(prepared.deviceOpHash)));
    current = (await runStepUp(() => services.api.request('RequestCosign', { opId: prepared.opId, deviceSignature }), { requireFresh: true })).requestCosign;
    try {
      await checkPrepared(current, approved, { accountId, networkId: services.networkId, token });
    } catch (err) {
      if (err instanceof DelegateMismatch) throw new PaymentError('VERIFY_FAILED');
      throw err;
    }
  }
  onPhase('approving');
  const unsigned = (await services.api.request('BuildDelegate', { input: { opId: current.opId, publicKey: key.publicKey } })).buildDelegate;
  let hash: Uint8Array;
  try {
    hash = await checkDelegate(unsigned, current, { accountId, devicePublicKey: key.publicKey });
  } catch (err) {
    if (err instanceof DelegateMismatch) throw new PaymentError('VERIFY_FAILED');
    throw err;
  }
  const signedDelegate = assemble(unsigned.delegateBase64, await services.device.sign(key, hash));
  onPhase('sending');
  const idempotencyKey = `web-${current.opId}-${crypto.randomUUID()}`;
  try {
    await services.api.request('SubmitSignedOp', { opId: current.opId, signedDelegate, idempotencyKey });
  } catch (err) {
    if (!(err instanceof ApiError && err.code === 'NETWORK')) throw err;
    await services.api.request('SubmitSignedOp', { opId: current.opId, signedDelegate, idempotencyKey });
  }
  onPhase('confirming');
  return current.opId;
}

export function trackOp(services: Services, opId: string, onUpdate?: (op: OpView) => void): { done: Promise<Outcome>; cancel: () => void } {
  let cancelled = false;
  let wake: (() => void) | null = null;
  const off = services.api.subscribe('TransactionUpdated', () => wake?.());
  const done = (async (): Promise<Outcome> => {
    const started = Date.now();
    try {
      while (!cancelled && Date.now() - started < CONFIRM_TIMEOUT_MS) {
        const op = await services.api.request('Op', { opId }).then(
          (r) => r.op,
          () => null,
        );
        if (op) {
          onUpdate?.(op);
          if (SETTLED.has(op.status)) return { state: 'settled', op };
          if (FAILED.has(op.status)) return { state: 'failed', op };
        }
        await new Promise<void>((resolve) => {
          const id = setTimeout(resolve, POLL_MS);
          wake = () => {
            clearTimeout(id);
            resolve();
          };
        });
      }
      return { state: 'unconfirmed', opId };
    } finally {
      off();
    }
  })();
  return {
    done,
    cancel: () => {
      cancelled = true;
      wake?.();
    },
  };
}

export async function signAccountCall(
  services: Services,
  uid: string,
  accountId: string,
  call: { accountId: string; methodName: string; argsBase64: string; callId?: string },
  approved: ApprovedCall,
): Promise<string> {
  const key = await services.device.load(uid);
  if (!key) throw new PaymentError('NO_DEVICE_KEY');
  try {
    checkAccountCall(call, approved, accountId);
  } catch (err) {
    if (err instanceof DelegateMismatch) throw new PaymentError('VERIFY_FAILED');
    throw err;
  }
  const input = call.callId ? { callId: call.callId, publicKey: key.publicKey } : { cancelRecovery: true, publicKey: key.publicKey };
  const unsigned = (await services.api.request('BuildDelegate', { input })).buildDelegate;
  let hash: Uint8Array;
  try {
    hash = await checkDelegate(unsigned, call, { accountId, devicePublicKey: key.publicKey }, ACCOUNT_METHODS);
  } catch (err) {
    if (err instanceof DelegateMismatch) throw new PaymentError('VERIFY_FAILED');
    throw err;
  }
  return assemble(unsigned.delegateBase64, await services.device.sign(key, hash));
}
