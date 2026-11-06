import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon, InfoIcon } from './icons';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONES: Record<Tone, { box: string; icon: string }> = {
  info: { box: 'bg-brand-faint border-brand-border text-ink-2', icon: 'text-brand-ink' },
  success: { box: 'bg-success-soft border-success/20 text-ink-2', icon: 'text-success' },
  warning: { box: 'bg-warning-soft border-warning/25 text-ink-2', icon: 'text-warning' },
  danger: { box: 'bg-danger-soft border-danger/25 text-ink-2', icon: 'text-danger' },
  neutral: { box: 'bg-canvas border-line text-ink-2', icon: 'text-muted' },
};

export function Notice({ tone = 'info', title, children, live, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; live?: 'polite' | 'assertive'; action?: ReactNode }) {
  const Icon = tone === 'success' ? CheckIcon : tone === 'danger' || tone === 'warning' ? AlertIcon : InfoIcon;
  const role = live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined;
  return (
    <div role={role} className={`flex gap-3 rounded-md border px-4 py-3 text-[14px] leading-[1.45] ${TONES[tone].box}`}>
      <Icon className={`mt-[1px] h-[18px] w-[18px] shrink-0 ${TONES[tone].icon}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        {children ? <div>{children}</div> : null}
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  );
}
