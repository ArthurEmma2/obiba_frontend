'use client';

import { useEffect, useState } from 'react';
import { CheckIcon } from '@/components/ui/icons';
import type { PasswordCheck, PasswordRule } from '@/lib/auth/types';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';

function ruleLabel(r: PasswordRule): string {
  switch (r.id) {
    case 'min':
      return t.password.minLength(r.value ?? 0);
    case 'max':
      return t.password.maxLength(r.value ?? 0);
    case 'lower':
      return t.password.lowercase;
    case 'upper':
      return t.password.uppercase;
    case 'number':
      return t.password.number;
    case 'symbol':
      return t.password.symbol;
  }
}

export function estimateStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length < 8) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const unique = new Set(password).size;
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (classes >= 3) score++;
  if (unique < password.length / 2) score--;
  return Math.max(0, Math.min(3, score)) as 0 | 1 | 2 | 3;
}

export function usePasswordCheck(password: string): { check: PasswordCheck | null; current: PasswordCheck | null; unavailable: boolean } {
  const { auth } = useServices();
  const [state, setState] = useState<{ password: string; check: PasswordCheck | null; unavailable: boolean }>({ password: '', check: null, unavailable: false });
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      void auth.checkPassword(password).then((check) => {
        if (alive) setState({ password, check, unavailable: check === null });
      });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [auth, password]);
  // `check` keeps the last result so the rules do not flicker while typing; only `current` describes this password.
  return { check: state.check, current: state.password === password ? state.check : null, unavailable: state.unavailable };
}

export function PasswordGuidance({ password, id, check, unavailable }: { password: string; id: string; check: PasswordCheck | null; unavailable: boolean }) {
  const strength = estimateStrength(password);
  const colors = ['bg-danger', 'bg-warning', 'bg-brand', 'bg-success'];
  return (
    <div id={id} className="flex flex-col gap-3">
      {password ? (
        <div className="flex items-center gap-3" aria-live="polite">
          <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-1 rounded-[1px] transition-colors ${i <= strength ? colors[strength] : 'bg-line'}`} />
            ))}
          </div>
          <span className="min-w-16 text-right text-[12px] font-medium text-muted">
            <span className="sr-only">{t.password.strengthLabel}: </span>
            {t.password.strength[strength]}
          </span>
        </div>
      ) : null}
      {check && check.rules.length > 0 ? (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2" aria-label={t.signUp.passwordRules}>
          {check.rules.map((r) => (
            <li key={r.id} className={`flex items-center gap-2 text-[13px] ${r.met ? 'text-success' : 'text-muted'}`}>
              <CheckIcon className={`h-3.5 w-3.5 shrink-0 ${r.met ? 'opacity-100' : 'opacity-35'}`} />
              <span>
                {ruleLabel(r)}
                <span className="sr-only">{r.met ? ' (met)' : ' (not met)'}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : unavailable && password ? (
        <p className="text-[13px] text-muted">{t.password.policyUnavailable}</p>
      ) : null}
    </div>
  );
}
