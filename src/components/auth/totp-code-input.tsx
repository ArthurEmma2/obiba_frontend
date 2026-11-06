'use client';

import { forwardRef } from 'react';
import { Input, type InputProps } from '@/components/ui/field';

export const TotpCodeInput = forwardRef<HTMLInputElement, Omit<InputProps, 'onChange' | 'value'> & { value: string; onValue: (v: string) => void }>(function TotpCodeInput(
  { value, onValue, className = '', ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      value={value}
      onChange={(e) => onValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      placeholder="000000"
      className={`tabular text-center text-[22px] tracking-[0.5em] ${className}`}
      {...rest}
    />
  );
});
