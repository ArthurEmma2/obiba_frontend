import type { ReactNode } from 'react';

export function PageHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-9 flex flex-col gap-4 border-b border-hairline pb-6 sm:flex-row sm:items-end sm:justify-between lg:mb-11">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[30px]">{title}</h1>
        {lead ? <p className="mt-1.5 hidden max-w-[40rem] text-[15px] leading-6 text-muted sm:block">{lead}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-4">{actions}</div> : null}
    </header>
  );
}
