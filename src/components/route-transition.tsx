'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useId, useRef } from 'react';
import { withBase } from '@/lib/base-path';
import { ROUTE_START_EVENT, isSameDocument, type RouteStartDetail } from '@/lib/route-events';

const SHOW_AFTER_MS = 160;
const MIN_VISIBLE_MS = 360;
const GIVE_UP_MS = 12_000;

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASE_SWAY = 'cubic-bezier(0.45, 0, 0.55, 1)';
const EASE_AWAY = 'cubic-bezier(0.55, 0, 0.75, 0.2)';

const LOGO_SRC = '/brand/obiba-logo.png';
const LOGO_W = 1140;
const LOGO_H = 285;
const LETTERS: readonly (readonly [number, number])[] = [
  [373, 509],
  [520, 656],
  [662, 702],
  [716, 853],
  [861, 999],
];
const UPPER = { x1: 72.4, y1: 225.1, x2: 379.6, y2: 41.9 };
const LOWER = { x1: 88, y1: 340, x2: 371.6, y2: 170.9 };

type Phase = 'idle' | 'waiting' | 'entering' | 'holding' | 'exiting';
type Frame = Record<string, string>;

const dash = (start: number, end: number): Frame => ({ strokeDasharray: `${Math.max(end - start, 0)} 200`, strokeDashoffset: `${-start}` });

const HIDDEN = {
  upper: dash(0, 0),
  lower: dash(0, 0),
  letter: { transform: 'translateY(170px)', filter: 'blur(5px)' } as Frame,
  veil: { opacity: '0' } as Frame,
};
const REST = {
  upper: dash(24.6, 100),
  lower: dash(0, 73.4),
  letter: { transform: 'translateY(0px)', filter: 'blur(0px)' } as Frame,
  veil: { opacity: '1' } as Frame,
};
const SWAY = {
  upper: [REST.upper, dash(33.5, 100), REST.upper],
  lower: [REST.lower, dash(0, 64.5), REST.lower],
};
const GONE = {
  upper: dash(100, 100),
  lower: dash(100, 100),
  letter: { transform: 'translateY(170px)', filter: 'blur(3px)' } as Frame,
  veil: { opacity: '0' } as Frame,
};

function apply(el: Element | null, frame: Frame): void {
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) return;
  for (const [k, v] of Object.entries(frame)) el.style.setProperty(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), v);
}

function commit(a: Animation): void {
  try {
    a.commitStyles();
  } catch {
    return;
  }
}

function canAnimate(): boolean {
  return typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
}

function prefersStill(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function RouteSettled({ onSettled }: { onSettled: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? '';
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onSettled();
  }, [pathname, search, onSettled]);
  return null;
}

export function RouteTransition() {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const root = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const upper = useRef<SVGLineElement>(null);
  const lower = useRef<SVGLineElement>(null);
  const letters = useRef<(SVGGElement | null)[]>([]);
  const engine = useRef<{ settle: () => void } | null>(null);
  const onSettled = useCallback(() => engine.current?.settle(), []);

  useEffect(() => {
    let phase: Phase = 'idle';
    let pending = false;
    let shownAt = 0;
    let running: Animation[] = [];
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    let giveUpTimer: ReturnType<typeof setTimeout> | undefined;

    const parts = () => ({ upper: upper.current, lower: lower.current, letters: letters.current.filter((l): l is SVGGElement => !!l), veil: veil.current });

    function halt() {
      for (const a of running) {
        commit(a);
        a.cancel();
      }
      running = [];
    }

    function settleTo(state: typeof HIDDEN) {
      const p = parts();
      apply(p.upper, state.upper);
      apply(p.lower, state.lower);
      for (const l of p.letters) apply(l, state.letter);
      apply(p.veil, state.veil);
    }

    function setVisible(on: boolean) {
      if (root.current) root.current.style.visibility = on ? 'visible' : 'hidden';
    }

    function hold() {
      if (phase !== 'entering') return;
      phase = 'holding';
      halt();
      const p = parts();
      if (!canAnimate() || prefersStill() || !p.upper || !p.lower) return;
      running = [
        p.upper.animate(SWAY.upper, { duration: 1900, easing: EASE_SWAY, iterations: Infinity }),
        p.lower.animate(SWAY.lower, { duration: 1900, delay: 950, easing: EASE_SWAY, iterations: Infinity }),
      ];
    }

    function show() {
      showTimer = undefined;
      halt();
      phase = 'entering';
      shownAt = performance.now();
      setVisible(true);
      const p = parts();
      if (!canAnimate() || !p.upper || !p.lower || !p.veil) {
        settleTo(REST);
        hold();
        return;
      }
      if (prefersStill()) {
        apply(p.upper, REST.upper);
        apply(p.lower, REST.lower);
        for (const l of p.letters) apply(l, REST.letter);
        running = [p.veil.animate([REST.veil], { duration: 200, easing: 'ease-out', fill: 'forwards' })];
      } else {
        running = [
          p.veil.animate([REST.veil], { duration: 220, easing: 'ease-out', fill: 'forwards' }),
          p.lower.animate([REST.lower], { duration: 640, easing: EASE_OUT, fill: 'forwards' }),
          p.upper.animate([REST.upper], { duration: 700, delay: 90, easing: EASE_OUT, fill: 'forwards' }),
          ...p.letters.map((l, i) => l.animate([REST.letter], { duration: 760, delay: 180 + i * 42, easing: EASE_OUT, fill: 'forwards' })),
        ];
      }
      const entrance = running;
      Promise.all(entrance.map((a) => a.finished)).then(
        () => {
          if (running === entrance) hold();
        },
        () => undefined,
      );
    }

    function finish() {
      halt();
      settleTo(HIDDEN);
      setVisible(false);
      phase = 'idle';
    }

    function leave() {
      leaveTimer = undefined;
      if (pending || (phase !== 'entering' && phase !== 'holding')) return;
      halt();
      phase = 'exiting';
      const p = parts();
      if (!canAnimate() || !p.upper || !p.lower || !p.veil) {
        finish();
        return;
      }
      running = prefersStill()
        ? [p.veil.animate([GONE.veil], { duration: 200, easing: 'ease-out', fill: 'forwards' })]
        : [
            p.lower.animate([GONE.lower], { duration: 460, easing: EASE_AWAY, fill: 'forwards' }),
            p.upper.animate([GONE.upper], { duration: 460, delay: 50, easing: EASE_AWAY, fill: 'forwards' }),
            ...p.letters.map((l, i) => l.animate([GONE.letter], { duration: 400, delay: i * 28, easing: EASE_AWAY, fill: 'forwards' })),
            p.veil.animate([GONE.veil], { duration: 360, delay: 160, easing: 'cubic-bezier(0.33, 0, 0.2, 1)', fill: 'forwards' }),
          ];
      const exit = running;
      Promise.all(exit.map((a) => a.finished)).then(
        () => {
          if (running === exit && phase === 'exiting') finish();
        },
        () => undefined,
      );
    }

    function settle() {
      if (!pending) return;
      pending = false;
      clearTimeout(giveUpTimer);
      if (phase === 'waiting') {
        clearTimeout(showTimer);
        showTimer = undefined;
        phase = 'idle';
        return;
      }
      if (phase === 'entering' || phase === 'holding') {
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(leave, Math.max(0, MIN_VISIBLE_MS - (performance.now() - shownAt)));
      }
    }

    function begin(e: Event) {
      const { url } = (e as CustomEvent<RouteStartDetail>).detail ?? {};
      if (!url || isSameDocument(url)) return;
      pending = true;
      clearTimeout(leaveTimer);
      leaveTimer = undefined;
      clearTimeout(giveUpTimer);
      giveUpTimer = setTimeout(settle, GIVE_UP_MS);
      if (phase === 'idle') {
        phase = 'waiting';
        showTimer = setTimeout(show, SHOW_AFTER_MS);
      } else if (phase === 'exiting') {
        show();
      }
    }

    engine.current = { settle };
    window.addEventListener(ROUTE_START_EVENT, begin);
    return () => {
      window.removeEventListener(ROUTE_START_EVENT, begin);
      clearTimeout(showTimer);
      clearTimeout(leaveTimer);
      clearTimeout(giveUpTimer);
      halt();
      engine.current = null;
    };
  }, []);

  const href = withBase(LOGO_SRC);

  return (
    <div ref={root} aria-hidden="true" data-route-transition="" className="pointer-events-none fixed inset-0 z-[100] grid place-items-center" style={{ visibility: 'hidden' }}>
      <div ref={veil} className="absolute inset-0 bg-canvas/90 backdrop-blur-lg backdrop-saturate-150" style={{ opacity: 0 }} />
      <svg viewBox="60 20 960 280" className="relative h-auto w-[152px] overflow-visible sm:w-[168px]" focusable="false">
        <defs>
          <mask id={`${uid}-upper`} maskUnits="userSpaceOnUse" x="0" y="0" width={LOGO_W} height="400">
            <line ref={upper} {...UPPER} pathLength={100} stroke="#fff" strokeWidth={88} strokeLinecap="round" style={HIDDEN.upper} />
          </mask>
          <mask id={`${uid}-lower`} maskUnits="userSpaceOnUse" x="0" y="0" width={LOGO_W} height="400">
            <line ref={lower} {...LOWER} pathLength={100} stroke="#fff" strokeWidth={88} strokeLinecap="round" style={HIDDEN.lower} />
          </mask>
          <clipPath id={`${uid}-mark`}>
            <rect x="0" y="0" width="362" height={LOGO_H} />
          </clipPath>
          {LETTERS.map(([a, b], i) => (
            <clipPath key={a} id={`${uid}-l${i}`}>
              <rect x={a - 3} y="0" width={b - a + 6} height={LOGO_H} />
            </clipPath>
          ))}
        </defs>
        <g clipPath={`url(#${uid}-mark)`}>
          <image href={href} width={LOGO_W} height={LOGO_H} mask={`url(#${uid}-lower)`} />
          <image href={href} width={LOGO_W} height={LOGO_H} mask={`url(#${uid}-upper)`} />
        </g>
        {LETTERS.map(([a], i) => (
          <g key={a} clipPath={`url(#${uid}-l${i})`}>
            <g
              ref={(el) => {
                letters.current[i] = el;
              }}
              style={HIDDEN.letter}
            >
              <image href={href} width={LOGO_W} height={LOGO_H} />
            </g>
          </g>
        ))}
      </svg>
      <Suspense fallback={null}>
        <RouteSettled onSettled={onSettled} />
      </Suspense>
    </div>
  );
}
