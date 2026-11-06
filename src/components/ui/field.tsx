'use client';

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { t } from '@/lib/strings';
import { AlertIcon } from './icons';

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: (ids: { inputId: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  trailing?: ReactNode;
}

export function Field({ label, hint, error, optional, children, trailing }: FieldProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-[14px] font-medium text-ink">
          {label}
          {optional ? <span className="ml-1.5 font-normal text-muted">({t.common.optional.toLowerCase()})</span> : null}
        </label>
        {trailing}
      </div>
      {children({ inputId, describedBy, invalid: !!error })}
      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-[13px] leading-5 text-danger">
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-[13px] leading-5 text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const INPUT =
  'h-[52px] w-full rounded-[12px] border bg-surface px-4 text-[16px] text-ink placeholder:text-subtle transition-[border-color,box-shadow] duration-150 outline-none focus:border-brand focus:ring-3 focus:ring-brand/20 disabled:bg-wash disabled:text-muted';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, className = '', ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={`${INPUT} ${invalid ? 'border-danger' : 'border-field hover:border-ink/25'} ${className}`} {...rest} />;
});

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput({ invalid, className = '', ...rest }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} invalid={invalid} type={visible ? 'text' : 'password'} className={`pr-18 ${className}`} autoCapitalize="none" autoCorrect="off" spellCheck={false} {...rest} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t.common.hidePassword : t.common.showPassword}
        aria-pressed={visible}
        className="absolute inset-y-1 right-1 rounded-sm px-3 text-[13px] font-medium text-muted hover:bg-wash hover:text-ink"
      >
        {visible ? t.common.hide : t.common.show}
      </button>
    </div>
  );
});

export const PrefixedInput = forwardRef<HTMLInputElement, InputProps & { prefix: string }>(function PrefixedInput({ prefix, invalid, className = '', ...rest }, ref) {
  return (
    <div className={`flex h-[52px] w-full items-stretch overflow-hidden rounded-[12px] border bg-surface transition-[border-color,box-shadow] duration-150 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/20 ${invalid ? 'border-danger' : 'border-field hover:border-ink/25'}`}>
      <span className="flex items-center border-r border-line bg-canvas px-3 text-[15px] text-ink-2 tabular" aria-hidden="true">
        {prefix}
      </span>
      <input ref={ref} aria-invalid={invalid || undefined} className={`min-w-0 flex-1 bg-transparent px-3.5 text-[16px] text-ink outline-none placeholder:text-subtle tabular ${className}`} {...rest} />
    </div>
  );
});

export const SuffixedInput = forwardRef<HTMLInputElement, InputProps & { suffix: string }>(function SuffixedInput({ suffix, invalid, className = '', ...rest }, ref) {
  return (
    <div className={`flex h-[52px] w-full items-stretch overflow-hidden rounded-[12px] border bg-surface transition-[border-color,box-shadow] duration-150 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/20 ${invalid ? 'border-danger' : 'border-field hover:border-ink/25'}`}>
      <input ref={ref} aria-invalid={invalid || undefined} className={`min-w-0 flex-1 bg-transparent pl-3.5 text-[16px] text-ink outline-none placeholder:text-subtle ${className}`} {...rest} />
      <span className="flex max-w-[55%] items-center truncate pr-3.5 text-[15px] text-muted" aria-hidden="true">
        {suffix}
      </span>
    </div>
  );
});

export function Checkbox({ id, checked, onChange, children, invalid, describedBy }: { id?: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode; invalid?: boolean; describedBy?: string }) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <div className="flex items-start gap-3">
      <input
        id={cid}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-[5px] border accent-[var(--color-action)] ${invalid ? 'border-danger' : 'border-field'}`}
      />
      <label htmlFor={cid} className="cursor-pointer text-[14px] leading-5 text-ink-2">
        {children}
      </label>
    </div>
  );
}
