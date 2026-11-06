import type { DeviceView, Me, RecoveryKitStatus, RecoveryView, SupportCaseView } from '@/lib/graphql/types';

export const STEPS = ['verify', 'profile', 'phone', 'device', 'account'] as const;
export type StepId = (typeof STEPS)[number] | 'done';

export type LocalKey = { state: 'present'; publicKey: string } | { state: 'missing' } | { state: 'unsupported' } | { state: 'storage-unavailable' } | { state: 'unknown' };

export interface OnboardingFacts {
  emailVerified: boolean;
  me: Me | null;
  devices: DeviceView[];
  recoveryKit: RecoveryKitStatus | null;
  recovery: RecoveryView | null;
  supportCase: SupportCaseView | null;
  localKey: LocalKey;
  secondFactorEnrolled: boolean;
  removedHere: boolean;
}

export const ACTIVE_RECOVERY = new Set(['REQUESTED', 'SIGNED', 'SUBMITTED', 'PENDING_TIMELOCK', 'CANCEL_REQUESTED']);

export function movingHere(f: Pick<OnboardingFacts, 'recovery' | 'localKey'>): RecoveryView | null {
  if (!f.recovery || !ACTIVE_RECOVERY.has(f.recovery.status) || f.localKey.state !== 'present') return null;
  return f.recovery.newPublicKey === f.localKey.publicKey ? f.recovery : null;
}

const SUPPORT_ACTIVE = new Set(['OPEN', 'VERIFIED', 'APPROVED', 'SUBMITTED']);

export function supportHere(f: Pick<OnboardingFacts, 'supportCase' | 'localKey' | 'recovery'>): SupportCaseView | null {
  if (!f.supportCase || !SUPPORT_ACTIVE.has(f.supportCase.status) || f.localKey.state !== 'present') return null;
  if (f.supportCase.newPublicKey !== f.localKey.publicKey) return null;
  if (f.supportCase.status === 'SUBMITTED' && f.recovery?.newPublicKey === f.localKey.publicKey && f.recovery.status === 'COMPLETED') return null;
  return f.supportCase;
}

export function linkedDevice(facts: Pick<OnboardingFacts, 'devices' | 'localKey'>): DeviceView | null {
  if (facts.localKey.state !== 'present') return null;
  const pk = facts.localKey.publicKey;
  return facts.devices.find((d) => d.publicKey === pk && d.status !== 'revoked') ?? null;
}

export function deriveStep(f: OnboardingFacts): StepId {
  if (!f.emailVerified) return 'verify';
  if (!f.me) return 'profile';
  if (!f.secondFactorEnrolled && !f.recoveryKit?.active) return 'phone';
  if (!linkedDevice(f) || movingHere(f) || supportHere(f)) return 'device';
  if (f.me.accountStatus !== 'active') return 'account';
  return 'done';
}

export function stepNumber(step: StepId): number {
  return step === 'done' ? STEPS.length : STEPS.indexOf(step) + 1;
}

export function setupComplete(f: OnboardingFacts): boolean {
  const s = deriveStep(f);
  return s === 'done';
}
