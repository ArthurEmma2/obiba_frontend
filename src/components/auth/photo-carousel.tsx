'use client';

import { withBase } from '@/lib/base-path';
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/strings';
import { useReducedMotion } from '@/lib/use-reduced-motion';

type Slide = { id: string; position: string; caption: { title: string; body: string } };

export const SLIDES: readonly Slide[] = [
  { id: 'obiba1', position: '50% 15%', caption: t.brand.slides.collections },
  { id: 'obiba2', position: '50% 30%', caption: t.brand.slides.payouts },
  { id: 'obiba3', position: '50% 35%', caption: t.brand.slides.treasury },
  { id: 'obiba4', position: '50% 25%', caption: t.brand.slides.globalAccounts },
  { id: 'obiba5', position: '50% 35%', caption: t.brand.slides.cards },
  { id: 'obiba6', position: '50% 20%', caption: t.brand.slides.apis },
];

export const SLIDE_MS = 6500;
const FADE_MS = 1400;

export function PhotoCarousel({ start = 0 }: { start?: number }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(start % SLIDES.length);
  const [cycle, setCycle] = useState(0);
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([start % SLIDES.length, (start + 1) % SLIDES.length]));
  const [hidden, setHidden] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = useCallback((next: number) => {
    const n = ((next % SLIDES.length) + SLIDES.length) % SLIDES.length;
    setIndex(n);
    setCycle((c) => c + 1);
    setMounted((m) => {
      const s = new Set(m);
      s.add(n);
      s.add((n + 1) % SLIDES.length);
      return s;
    });
  }, []);

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (reduced || hidden) return;
    timer.current = setTimeout(() => go(index + 1), SLIDE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, cycle, reduced, hidden, go]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-brand-night" aria-roledescription="carousel" aria-label={t.brand.carouselLabel} role="region">
      {SLIDES.map((s, i) => {
        const active = i === index;
        if (!mounted.has(i)) return null;
        return (
          <div
            key={s.id}
            aria-hidden={!active}
            className="absolute inset-0 transition-opacity ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{ opacity: active ? 1 : 0, transitionDuration: `${FADE_MS}ms`, zIndex: active ? 2 : 1 }}
          >
            <img
              src={withBase(`/photos/${s.id}.webp`)}
              alt=""
              draggable={false}
              decoding="async"
              loading={i === start ? 'eager' : 'lazy'}
              fetchPriority={i === start ? 'high' : 'low'}
              className="h-full w-full object-cover"
              style={{ objectPosition: s.position }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[80%] lg:h-[60%]"
              style={{ background: 'linear-gradient(to top, rgba(8,14,28,0.92) 0%, rgba(8,14,28,0.74) 30%, rgba(8,14,28,0.34) 62%, rgba(8,14,28,0) 100%)' }}
            />
            <p className="absolute inset-x-0 bottom-0 max-w-[620px] text-balance px-6 pb-6 text-[19px] font-semibold leading-[1.22] tracking-[-0.018em] lg:px-14 lg:pb-16 lg:text-[40px] lg:leading-[1.12] lg:tracking-[-0.032em] xl:px-16 [text-shadow:0_1px_18px_rgba(8,14,28,0.35)]">
              <Words text={`${s.caption.title}.`} className="text-white" active={active} reduced={reduced} offset={0} />{' '}
              <Words text={s.caption.body} className="text-white/62" active={active} reduced={reduced} offset={s.caption.title.split(' ').length} />
            </p>
          </div>
        );
      })}

    </div>
  );
}

const WORD_DELAY_MS = 55;
const WORD_START_MS = 380;

function Words({ text, className, active, reduced, offset }: { text: string; className: string; active: boolean; reduced: boolean; offset: number }) {
  const words = text.split(' ');
  return (
    <span className={className}>
      {words.map((w, j) => (
        <span key={j}>
          <span
            className="inline-block transition-[opacity,transform,filter] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              opacity: active ? 1 : 0,
              transform: active || reduced ? 'none' : 'translateY(0.45em)',
              filter: active || reduced ? 'none' : 'blur(6px)',
              transitionDuration: active ? '900ms' : '400ms',
              transitionDelay: active && !reduced ? `${WORD_START_MS + (offset + j) * WORD_DELAY_MS}ms` : '0ms',
            }}
          >
            {w}
          </span>
          {j < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  );
}
