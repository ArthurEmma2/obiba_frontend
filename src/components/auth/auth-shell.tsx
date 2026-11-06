'use client';

import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/logo';
import { webConfig } from '@/lib/config';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { PhotoCarousel } from './photo-carousel';

export function AuthShell({ children, start = 0 }: { children: ReactNode; start?: number }) {
  const { siteUrl, supportEmail } = useServices();
  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-2">
      <div className="flex min-h-dvh flex-col px-5 sm:px-10 lg:px-14 xl:px-20">
        <header className="flex h-[72px] shrink-0 items-center">
          <a href={siteUrl} className="-m-1 rounded-sm p-1" aria-label="Obiba home">
            <Logo className="h-7 w-auto" />
          </a>
        </header>

        <div className="relative mb-2 hidden h-[220px] shrink-0 overflow-hidden rounded-lg sm:block lg:hidden">
          <PhotoCarousel start={start} />
        </div>

        <main className="flex flex-1 flex-col justify-center py-8 lg:py-12">
          <div className="mx-auto w-full max-w-[400px] animate-rise">
            {webConfig().uiPreview ? <p className="mb-6 rounded-[8px] border border-line bg-canvas px-3.5 py-2.5 text-[13px] leading-5 text-ink-2">{t.uiPreview}</p> : null}
            {children}
          </div>
        </main>

        <footer className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 py-6 text-[13px] text-muted">
          <span>&copy; {new Date().getFullYear()} Obiba</span>
          <a className="hover:text-ink" href={`${siteUrl}/terms`}>
            {t.common.terms}
          </a>
          <a className="hover:text-ink" href={`${siteUrl}/privacy`}>
            {t.common.privacy}
          </a>
          <a className="hover:text-ink" href={`mailto:${supportEmail}`}>
            {t.common.help}
          </a>
        </footer>
      </div>

      <div className="hidden lg:block">
        <div className="sticky top-0 h-dvh overflow-hidden">
          <PhotoCarousel start={start} />
        </div>
      </div>
    </div>
  );
}

export function AuthHeading({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.022em] text-ink sm:text-[30px]">{title}</h1>
      {lead ? <p className="mt-2.5 text-[15px] leading-6 text-muted">{lead}</p> : null}
    </div>
  );
}
