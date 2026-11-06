import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onBlue' | 'onBlueGhost';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-action text-white shadow-button hover:bg-action-hover active:bg-brand-ink disabled:bg-action/45 disabled:shadow-none',
  secondary: 'bg-surface text-ink border border-field hover:border-ink/25 hover:bg-canvas active:bg-wash disabled:text-muted',
  ghost: 'bg-transparent text-ink hover:bg-wash active:bg-line disabled:text-subtle',
  danger: 'bg-surface text-danger border border-danger/30 hover:bg-danger-soft disabled:opacity-50',
  onBlue: 'bg-white text-statement hover:bg-white/90 active:bg-white/80 disabled:bg-white/50',
  onBlueGhost: 'bg-white/[0.14] text-white hover:bg-white/[0.2] active:bg-white/[0.26] disabled:text-white/50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-[14px]',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-12 px-6 text-[15px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingLabel?: string;
  block?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'lg', loading = false, loadingLabel, block = false, className = '', disabled, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`relative inline-flex select-none items-center justify-center gap-2 press rounded-[10px] font-medium tracking-[-0.005em] disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner className="h-4 w-4" />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

export function TextButton({ className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center rounded-sm text-[14px] font-medium text-brand-ink underline-offset-4 hover:underline disabled:text-muted disabled:no-underline ${className}`}
      {...rest}
    />
  );
}
