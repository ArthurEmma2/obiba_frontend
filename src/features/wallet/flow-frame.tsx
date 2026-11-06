'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/logo';
import { t } from '@/lib/strings';
import { BackIcon, CloseIcon } from './nav-icons';

export function FlowFrame({
  title,
  steps,
  step,
  closeHref,
  onBack,
  footer,
  wide = false,
  children,
}: {
  title: string;
  steps?: string[];
  step?: number;
  closeHref: string;
  onBack?: () => void;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const at = step ?? 0;
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="print-hidden sticky top-0 z-30 border-b border-hairline bg-surface/95 backdrop-blur-[8px]">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-8">
          {onBack ? (
            <button type="button" onClick={onBack} aria-label={t.ui.back} className="press -ml-2 flex h-10 w-10 items-center justify-center rounded-[8px] text-ink hover:bg-wash lg:hidden">
              <BackIcon className="h-5 w-5" />
            </button>
          ) : null}
          <Link href="/home" aria-label="Obiba overview" className="hidden items-center rounded-sm lg:flex">
            <Logo className="h-[20px] w-auto" />
          </Link>
          <span aria-hidden="true" className="mx-2 hidden h-5 w-px bg-line lg:block" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">{title}</p>
            {steps && steps.length > 1 ? <p className="text-[12.5px] text-muted lg:hidden">{t.ui.stepOf(at + 1, steps.length)}</p> : null}
          </div>
          <Link href={closeHref} aria-label={t.ui.close} className="press -mr-2 flex h-10 w-10 items-center justify-center rounded-[8px] text-muted hover:bg-wash hover:text-ink">
            <CloseIcon className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1280px] flex-1 px-5 pb-36 pt-8 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)_220px] lg:gap-10 lg:pt-14">
        <nav aria-label={title} className="hidden lg:block">
          {steps && steps.length > 1 ? (
            <ol className="sticky top-28">
              {steps.map((s, i) => (
                <li key={s} aria-current={i === at ? 'step' : undefined} className={`flex items-baseline gap-3 py-2 text-[14px] transition-colors duration-300 ${i === at ? 'font-semibold text-ink' : i < at ? 'text-ink-2' : 'text-subtle'}`}>
                  <span className="tabular w-4 text-[13px] text-subtle">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          ) : null}
        </nav>
        <main className={`mx-auto w-full min-w-0 ${wide ? 'max-w-[760px]' : 'max-w-[520px]'}`}>
          <div key={at} className="animate-step">
            {children}
          </div>
        </main>
        <div className="hidden lg:block" />
      </div>

      {footer ? (
        <div className="print-hidden safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/95 pt-3 backdrop-blur-[8px]">
          <div className={`mx-auto flex w-full items-center gap-3 px-5 sm:px-8 ${wide ? 'max-w-[760px]' : 'max-w-[520px]'} lg:box-content`}>{footer}</div>
        </div>
      ) : null}
    </div>
  );
}

export function FlowHeading({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow ? <p className="mb-2 text-[14px] font-medium text-muted">{eyebrow}</p> : null}
      <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] text-ink sm:text-[32px]">{title}</h1>
      {lead ? <p className="mt-2.5 hidden text-[15px] leading-6 text-muted sm:block">{lead}</p> : null}
    </div>
  );
}
