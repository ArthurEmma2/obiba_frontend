'use client';

import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/logo';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { STEPS, stepNumber, type StepId } from './derive';
import { DrawnCheck } from './marks';

const LABELS: Record<(typeof STEPS)[number], string> = {
  verify: t.onboarding.steps.verify,
  profile: t.onboarding.steps.profile,
  phone: t.onboarding.steps.phone,
  device: t.onboarding.steps.device,
  account: t.onboarding.steps.account,
};

type State = 'complete' | 'current' | 'upcoming';

function stateOf(step: StepId, i: number): State {
  const current = step === 'done' ? STEPS.length + 1 : stepNumber(step);
  const n = i + 1;
  return n < current ? 'complete' : n === current ? 'current' : 'upcoming';
}

function Marker({ state, n }: { state: State; n: number }) {
  return (
    <span className={`tabular flex w-5 shrink-0 justify-center text-[13px] ${state === 'current' ? 'font-semibold text-ink' : 'text-subtle'}`} aria-hidden="true">
      {state === 'complete' ? <DrawnCheck className="h-4 w-4 text-ink" /> : n}
    </span>
  );
}

function RailProgress({ step }: { step: StepId }) {
  return (
    <nav aria-label={t.onboarding.progressLabel}>
      <ol className="flex flex-col gap-1">
        {STEPS.map((s, i) => {
          const state = stateOf(step, i);
          return (
            <li key={s} aria-current={state === 'current' ? 'step' : undefined} className="flex h-10 items-center gap-4">
              <Marker state={state} n={i + 1} />
              <span
                className={`text-[14px] transition-colors duration-500 ${state === 'current' ? 'font-semibold text-ink' : state === 'complete' ? 'text-ink-2' : 'text-subtle'}`}
              >
                {LABELS[s]}
              </span>
              <span className="sr-only">{state === 'complete' ? t.onboarding.stepComplete : state === 'current' ? t.onboarding.stepCurrent : t.onboarding.stepUpcoming}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function BarProgress({ step }: { step: StepId }) {
  const n = step === 'done' ? STEPS.length : stepNumber(step);
  return (
    <p className="tabular text-[13px] font-medium text-muted" aria-hidden="true">
      {t.ui.stepOf(n, STEPS.length)}
      {step !== 'done' ? <span className="text-ink">{` ${LABELS[step as (typeof STEPS)[number]]}`}</span> : null}
    </p>
  );
}

export function OnboardingLayout({ step, children, onSignOut, leaving = false }: { step: StepId | null; children: ReactNode; onSignOut: () => void; leaving?: boolean }) {
  const { supportEmail, auth } = useServices();
  const email = auth.current()?.email ?? '';
  const quiet = 'text-[13px] font-medium text-muted transition-colors hover:text-ink';

  if (!step) {
    return (
      <div className="flex min-h-dvh flex-col bg-surface">
        <header className="print-hidden">
          <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 sm:px-8">
            <Logo className="h-6 w-auto" />
            <div className="flex items-center gap-5">
              <a href={`mailto:${supportEmail}`} className={quiet}>
                {t.common.help}
              </a>
              <button type="button" onClick={onSignOut} className={quiet}>
                {t.common.signOut}
              </button>
            </div>
          </div>
        </header>
        <main className={`flex flex-1 justify-center px-5 pb-20 pt-8 sm:px-8 sm:pt-14 ${leaving ? 'leaving' : ''}`}>
          <div className="w-full max-w-[1180px]">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[288px_minmax(0,1fr)]">
      <aside className="print-hidden sticky top-0 hidden h-dvh flex-col justify-between border-r border-hairline bg-canvas px-8 py-9 lg:flex">
        <div className="flex flex-col gap-14">
          <Logo className="h-[26px] w-auto self-start" />
          <RailProgress step={step} />
        </div>
        <div className="flex flex-col gap-4">
          {email ? (
            <p className="text-[12.5px] leading-5 text-muted">
              {t.onboarding.signedInAs}
              <span className="block truncate font-medium text-ink-2">{email}</span>
            </p>
          ) : null}
          <div className="flex items-center gap-5">
            <a href={`mailto:${supportEmail}`} className={quiet}>
              {t.common.help}
            </a>
            <button type="button" onClick={onSignOut} className={quiet}>
              {t.common.signOut}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="print-hidden sticky top-0 z-10 border-b border-hairline bg-surface/95 backdrop-blur-[3px] lg:hidden">
          <div className="flex h-14 items-center justify-between px-5">
            <Logo className="h-[22px] w-auto" />
            <div className="flex items-center gap-4">
              <a href={`mailto:${supportEmail}`} className={quiet}>
                {t.common.help}
              </a>
              <button type="button" onClick={onSignOut} className={quiet}>
                {t.common.signOut}
              </button>
            </div>
          </div>
          <div className="px-5 pb-3">
            <BarProgress step={step} />
          </div>
        </header>
        <main className={`flex flex-1 px-5 pb-20 pt-9 sm:px-10 sm:pt-14 lg:px-16 lg:pt-[13vh] xl:px-24 ${leaving ? 'leaving' : ''}`}>
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function StepHeader({ step, title, lead, className = '' }: { step?: StepId; title: string; lead?: ReactNode; className?: string }) {
  const n = step && step !== 'done' ? stepNumber(step) : null;
  return (
    <header className={`stagger mb-10 max-w-[34rem] ${className}`}>
      {n ? (
        <p className="tabular mb-4 text-[13px] font-medium text-brand-ink">
          {t.onboarding.stepOf(n, STEPS.length)}
        </p>
      ) : null}
      <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[40px]">{title}</h1>
      {lead ? <p className="mt-4 text-[16px] leading-[1.6] text-muted sm:text-[17px]">{lead}</p> : null}
    </header>
  );
}

export function Actions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col-reverse gap-3 sm:flex-row sm:items-center ${className}`}>{children}</div>;
}
