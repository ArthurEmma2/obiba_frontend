import { base58 } from '@scure/base';

const DELEGATE_PREFIX = 2 ** 30 + 366;
const FUNCTION_CALL = 2;
const DEVICE_OP_TAG = 'obiba-device-op/v1';
const OP_KINDS = ['Transfer', 'PayInvoice'] as const;
export const SIGNABLE_METHODS = new Set(['execute', 'pay_invoice']);
export const ACCOUNT_METHODS = new Set(['set_limit', 'cancel_recovery', 'add_token']);

export class DelegateMismatch extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'DelegateMismatch';
  }
}

export interface DecodedDelegate {
  senderId: string;
  receiverId: string;
  actions: Array<{ type: number; methodName?: string; args?: Uint8Array; gas?: bigint; deposit?: bigint }>;
  nonce: bigint;
  maxBlockHeight: bigint;
  publicKey: string;
}

export interface OpFields {
  op_id: string;
  kind: (typeof OP_KINDS)[number];
  token: string;
  receiver: string;
  amount: string;
  expires_at_ns: string;
  memo: string | null;
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

class Reader {
  private o = 0;
  constructor(private readonly b: Uint8Array) {}
  private need(n: number) {
    if (this.o + n > this.b.length) throw new DelegateMismatch('truncated');
  }
  u8(): number {
    this.need(1);
    return this.b[this.o++]!;
  }
  u32(): number {
    this.need(4);
    const v = this.b[this.o]! | (this.b[this.o + 1]! << 8) | (this.b[this.o + 2]! << 16) | (this.b[this.o + 3]! * 2 ** 24);
    this.o += 4;
    return v >>> 0;
  }
  uint(bytes: number): bigint {
    this.need(bytes);
    let v = 0n;
    for (let i = bytes - 1; i >= 0; i--) v = (v << 8n) | BigInt(this.b[this.o + i]!);
    this.o += bytes;
    return v;
  }
  bytes(n: number): Uint8Array {
    this.need(n);
    const v = this.b.slice(this.o, this.o + n);
    this.o += n;
    return v;
  }
  string(): string {
    return new TextDecoder('utf-8', { fatal: true }).decode(this.bytes(this.u32()));
  }
  done(): boolean {
    return this.o === this.b.length;
  }
}

class Writer {
  private parts: number[] = [];
  u8(v: number) {
    this.parts.push(v & 0xff);
  }
  u32(v: number) {
    for (let i = 0; i < 4; i++) this.parts.push((v >>> (8 * i)) & 0xff);
  }
  uint(v: bigint, bytes: number) {
    for (let i = 0; i < bytes; i++) this.parts.push(Number((v >> BigInt(8 * i)) & 0xffn));
  }
  bytes(b: Uint8Array) {
    this.u32(b.length);
    for (const x of b) this.parts.push(x);
  }
  string(s: string) {
    this.bytes(new TextEncoder().encode(s));
  }
  out(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

export function decodeDelegate(delegateBase64: string): DecodedDelegate {
  const r = new Reader(fromBase64(delegateBase64));
  const senderId = r.string();
  const receiverId = r.string();
  const count = r.u32();
  if (count > 16) throw new DelegateMismatch('action_count');
  const actions: DecodedDelegate['actions'] = [];
  for (let i = 0; i < count; i++) {
    const type = r.u8();
    if (type !== FUNCTION_CALL) {
      actions.push({ type });
      return { senderId, receiverId, actions, nonce: 0n, maxBlockHeight: 0n, publicKey: '' };
    }
    actions.push({ type, methodName: r.string(), args: r.bytes(r.u32()), gas: r.uint(8), deposit: r.uint(16) });
  }
  const nonce = r.uint(8);
  const maxBlockHeight = r.uint(8);
  const keyType = r.u8();
  if (keyType !== 0) throw new DelegateMismatch('key_type');
  const publicKey = `ed25519:${base58.encode(r.bytes(32))}`;
  if (!r.done()) throw new DelegateMismatch('trailing_bytes');
  return { senderId, receiverId, actions, nonce, maxBlockHeight, publicKey };
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', copy));
}

export async function delegateSigningHash(delegateBase64: string): Promise<Uint8Array> {
  const body = fromBase64(delegateBase64);
  const w = new Writer();
  w.u32(DELEGATE_PREFIX);
  const prefix = w.out();
  const all = new Uint8Array(prefix.length + body.length);
  all.set(prefix);
  all.set(body, prefix.length);
  return sha256(all);
}

function opBytes(op: OpFields): Uint8Array {
  const kind = OP_KINDS.indexOf(op.kind);
  if (kind < 0) throw new DelegateMismatch('op_kind');
  const w = new Writer();
  w.string(op.op_id);
  w.u8(kind);
  w.string(op.token);
  w.string(op.receiver);
  w.uint(BigInt(op.amount), 16);
  w.uint(BigInt(op.expires_at_ns), 8);
  if (op.memo === null) w.u8(0);
  else {
    w.u8(1);
    w.string(op.memo);
  }
  return w.out();
}

export async function deviceOpHash(networkId: string, accountId: string, op: OpFields): Promise<string> {
  const w = new Writer();
  w.string(DEVICE_OP_TAG);
  w.string(networkId);
  w.string(accountId);
  w.u8(0);
  w.bytes(opBytes(op));
  return toHex(await sha256(w.out()));
}

export function parseOpArgs(argsBase64: string): { op: OpFields; raw: Record<string, unknown> } {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64(argsBase64))) as Record<string, unknown>;
  } catch {
    throw new DelegateMismatch('args_json');
  }
  const op = raw.op as Partial<OpFields> | undefined;
  if (
    !op ||
    typeof op.op_id !== 'string' ||
    typeof op.token !== 'string' ||
    typeof op.receiver !== 'string' ||
    typeof op.amount !== 'string' ||
    typeof op.expires_at_ns !== 'string' ||
    !OP_KINDS.includes(op.kind as OpFields['kind']) ||
    !(op.memo === null || typeof op.memo === 'string')
  ) {
    throw new DelegateMismatch('op_shape');
  }
  return { op: op as OpFields, raw };
}

export interface Approved {
  kind: OpFields['kind'];
  receiver: string;
  amount: string;
  invoiceId?: string;
  merchant?: string;
}

export interface PreparedLike {
  opId: string;
  accountId: string;
  methodName: string;
  argsBase64: string;
  amount: string;
  receiver: string;
  deviceOpHash: string;
}

export async function checkPrepared(prepared: PreparedLike, approved: Approved, ctx: { accountId: string; networkId: string; token: string }): Promise<OpFields> {
  if (prepared.accountId !== ctx.accountId) throw new DelegateMismatch('account');
  const expectedMethod = approved.kind === 'PayInvoice' ? 'pay_invoice' : 'execute';
  if (prepared.methodName !== expectedMethod) throw new DelegateMismatch('method');
  const { op, raw } = parseOpArgs(prepared.argsBase64);
  if (op.op_id !== prepared.opId) throw new DelegateMismatch('op_id');
  if (op.kind !== approved.kind) throw new DelegateMismatch('op_kind');
  if (op.token !== ctx.token) throw new DelegateMismatch('token');
  if (op.receiver !== approved.receiver || prepared.receiver !== approved.receiver) throw new DelegateMismatch('receiver');
  if (op.amount !== approved.amount || prepared.amount !== approved.amount) throw new DelegateMismatch('amount');
  if (approved.invoiceId !== undefined) {
    const inv = (raw.invoice as { invoice?: { invoice_id?: unknown; merchant?: unknown; amount?: unknown } } | undefined)?.invoice;
    if (op.memo !== approved.invoiceId || inv?.invoice_id !== approved.invoiceId) throw new DelegateMismatch('invoice');
    if (approved.merchant !== undefined && inv?.merchant !== approved.merchant) throw new DelegateMismatch('merchant');
    if (inv?.amount !== approved.amount) throw new DelegateMismatch('invoice_amount');
  }
  if ((await deviceOpHash(ctx.networkId, ctx.accountId, op)) !== prepared.deviceOpHash) throw new DelegateMismatch('device_op_hash');
  return op;
}

export async function checkDelegate(
  unsigned: { delegateBase64: string; signingHashHex: string; methodName: string },
  prepared: { methodName: string; argsBase64: string },
  ctx: { accountId: string; devicePublicKey: string },
  allowed: Set<string> = SIGNABLE_METHODS,
): Promise<Uint8Array> {
  const d = decodeDelegate(unsigned.delegateBase64);
  if (d.senderId !== ctx.accountId || d.receiverId !== ctx.accountId) throw new DelegateMismatch('sender');
  if (d.actions.length !== 1 || d.actions[0]!.type !== FUNCTION_CALL) throw new DelegateMismatch('actions');
  const call = d.actions[0]!;
  if (!allowed.has(call.methodName ?? '') || call.methodName !== prepared.methodName || unsigned.methodName !== prepared.methodName) throw new DelegateMismatch('method');
  if (call.deposit !== 0n) throw new DelegateMismatch('deposit');
  const expectedArgs = fromBase64(prepared.argsBase64);
  if (call.args!.length !== expectedArgs.length || call.args!.some((b, i) => b !== expectedArgs[i])) throw new DelegateMismatch('args');
  if (d.publicKey !== ctx.devicePublicKey) throw new DelegateMismatch('public_key');
  const hash = await delegateSigningHash(unsigned.delegateBase64);
  if (toHex(hash) !== unsigned.signingHashHex.toLowerCase()) throw new DelegateMismatch('signing_hash');
  return hash;
}

export type ApprovedCall = { method: 'set_limit'; newLimit: string } | { method: 'cancel_recovery' } | { method: 'add_token'; token: string };

export function checkAccountCall(call: { accountId: string; methodName: string; argsBase64: string }, approved: ApprovedCall, accountId: string): void {
  if (call.accountId !== accountId) throw new DelegateMismatch('account');
  if (call.methodName !== approved.method) throw new DelegateMismatch('method');
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64(call.argsBase64))) as Record<string, unknown>;
  } catch {
    throw new DelegateMismatch('args_json');
  }
  if (approved.method === 'cancel_recovery') {
    if (Object.keys(args).length !== 0) throw new DelegateMismatch('args');
    return;
  }
  if (approved.method === 'add_token') {
    if (Object.keys(args).sort().join(',') !== 'decimals,guardian_nonce,guardian_sig,token') throw new DelegateMismatch('args');
    if (args.token !== approved.token) throw new DelegateMismatch('token');
    if (args.decimals !== 6) throw new DelegateMismatch('decimals');
    return;
  }
  if (args.new_limit !== approved.newLimit) throw new DelegateMismatch('new_limit');
}
