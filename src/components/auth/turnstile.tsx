'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/strings';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
    script.onerror = () => {
      loading = null;
      reject(new Error('turnstile blocked'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function Turnstile({ siteKey, action, resetSignal, onToken }: { siteKey: string; action: string; resetSignal: number; onToken: (token: string | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const report = useRef(onToken);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    report.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let alive = true;
    loadTurnstile().then(
      (api) => {
        if (!alive || !host.current) return;
        widget.current = api.render(host.current, {
          sitekey: siteKey,
          action,
          theme: 'light',
          callback: (token: string) => report.current(token),
          'expired-callback': () => report.current(null),
          'error-callback': () => report.current(null),
        });
      },
      () => {
        if (alive) setUnavailable(true);
      },
    );
    return () => {
      alive = false;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (resetSignal > 0 && widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, [resetSignal]);

  if (unavailable) return <p className="text-[13px] leading-5 text-danger">{t.signUp.humanCheckUnavailable}</p>;
  return <div ref={host} className="min-h-[65px]" />;
}
