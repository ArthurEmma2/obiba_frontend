'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { CEDI, splitUnits } from '@/lib/money';
import { t } from '@/lib/strings';
import { statusLabel } from './format';
import { Spinner } from '@/components/ui/spinner';
import { CheckIcon, ChevronIcon, CopyIcon } from './nav-icons';

const MINUS = String.fromCharCode(0x2212);

export function Amount({ units, sign, className = '', currency = 'USD' }: { units: string | bigint; sign?: '+' | '-' | null; className?: string; currency?: 'USD' | 'GHS' }) {
  const { whole, fraction } = splitUnits(units);
  return (
    <span className={`tabular whitespace-nowrap ${className}`}>
      {sign === '-' ? MINUS : sign === '+' ? '+' : ''}
      {currency === 'GHS' ? `${CEDI} ` : '$'}
      {whole}
      <span className="text-[0.78em] opacity-70">.{fraction}</span>
    </span>
  );
}

export type Tone = 'live' | 'done' | 'review' | 'bad' | 'idle';

const DONE = new Set(['SETTLED', 'POSTED', 'CREDITED', 'COMPLETED', 'SUCCEEDED', 'PAID']);
const BAD = new Set(['FAILED', 'EXPIRED', 'REJECTED', 'REFUNDED', 'CANCELLED', 'INCOMPLETE']);
const REVIEW = new Set(['REVIEW', 'REVIEW_REQUIRED', 'REFUND_PENDING']);

export function toneOf(status: string): Tone {
  if (DONE.has(status)) return 'done';
  if (BAD.has(status)) return 'bad';
  if (REVIEW.has(status)) return 'review';
  if (status === 'OPEN') return 'idle';
  return 'live';
}

const TEXT: Record<Tone, string> = { live: 'text-brand-ink', done: 'text-success', review: 'text-warning', bad: 'text-danger', idle: 'text-muted' };

export function Status({ status, label, className = '' }: { status: string; label?: string; className?: string }) {
  return <span className={`whitespace-nowrap text-[13px] font-medium ${TEXT[toneOf(status)]} ${className}`}>{label ?? statusLabel(status)}</span>;
}

export interface Destination {
  href: string;
  title: string;
  body: string;
  meta?: ReactNode;
  logos?: ReactNode;
  tag?: string;
  disabled?: boolean;
  disabledNote?: string;
  mobileOnly?: boolean;
}

export function DestinationList({ items, label }: { items: Destination[]; label: string }) {
  const slot = items.some((d) => d.logos);
  return (
    <ul aria-label={label} className="stagger border-t border-hairline">
      {items.map((d) => {
        const inner = (
          <>
            {slot ? <span className={`flex w-[70px] shrink-0 overflow-hidden max-sm:[&_img:nth-of-type(n+3)]:hidden sm:w-[136px] ${d.disabled ? 'opacity-50' : ''}`}>{d.logos}</span> : null}
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2.5">
                <span className={`text-[16px] font-semibold tracking-[-0.01em] ${d.disabled ? 'text-muted' : 'text-ink'}`}>{d.title}</span>
                {d.tag ? <span className="eyebrow text-brand-ink">{d.tag}</span> : null}
              </span>
              <span className={`mt-0.5 text-[14px] leading-5 text-muted ${d.disabled ? 'block' : 'hidden sm:block'}`}>{d.disabled && d.disabledNote ? d.disabledNote : d.body}</span>
            </span>
            {d.meta ? <span className="hidden shrink-0 text-right text-[13px] text-muted sm:block">{d.meta}</span> : null}
            {!d.disabled ? <ChevronIcon className="h-[18px] w-[18px] shrink-0 text-subtle transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1 group-hover:text-ink" /> : null}
          </>
        );
        const cls = 'group flex items-center gap-5 py-5';
        return (
          <li key={d.href + d.title} className={`border-b border-hairline ${d.mobileOnly ? 'lg:hidden' : ''}`}>
            {d.disabled ? (
              <div className={`${cls} cursor-not-allowed`} aria-disabled="true">
                {inner}
              </div>
            ) : (
              <Link href={d.href} className={`${cls} -mx-4 rounded-[10px] px-4 outline-none transition-colors duration-200 hover:bg-canvas focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-brand/60`}>
                {inner}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface LedgerRow {
  label: string;
  value: ReactNode;
  strong?: boolean;
  total?: boolean;
  mono?: boolean;
  hint?: string;
}

export function Ledger({ rows, className = '' }: { rows: LedgerRow[]; className?: string }) {
  return (
    <dl className={className}>
      {rows.map((r) => (
        <div key={r.label} className={`flex flex-wrap items-baseline justify-between gap-x-6 ${r.total ? 'mt-1 border-t border-ink pt-3.5' : 'border-b border-hairline py-3'} last:border-b-0`}>
          <dt className={`shrink-0 text-[14px] ${r.total ? 'font-semibold text-ink' : 'text-muted'}`}>{r.label}</dt>
          <dd className={`min-w-0 text-right ${r.mono ? 'break-all font-mono text-[13px] text-ink-2' : 'text-[15px] text-ink'} ${r.strong || r.total ? 'tabular font-semibold' : ''} ${r.total ? 'text-[17px]' : ''}`}>{r.value}</dd>
          {r.hint ? <p className="mt-1 w-full text-[12.5px] leading-5 text-subtle">{r.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}

export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  return [
    copied,
    (text: string) => {
      void navigator.clipboard?.writeText(text).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        },
        () => setCopied(false),
      );
    },
  ];
}

export function CopyField({ label, value, mono = true, display }: { label: string; value: string; mono?: boolean; display?: ReactNode }) {
  const [copied, copy] = useCopy();
  return (
    <div className="flex items-center justify-between gap-4 border-b border-hairline py-3.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13px] text-muted">{label}</p>
        <p className={`mt-1 break-all ${mono ? 'font-mono text-[14px]' : 'text-[15px] font-medium'} text-ink`}>{display ?? value}</p>
      </div>
      <button
        type="button"
        onClick={() => copy(value)}
        aria-label={`${t.ui.copy} ${label}`}
        className="press flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] border border-field px-3 text-[13px] font-medium text-ink hover:border-ink/25"
      >
        {copied ? <CheckIcon className="h-4 w-4 text-success" /> : <CopyIcon className="h-4 w-4" />}
        <span aria-live="polite">{copied ? t.ui.copied : t.ui.copy}</span>
      </button>
    </div>
  );
}

export function SectionHead({ title, action, id }: { title: string; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[14px] font-medium text-brand-ink underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="animate-rise py-12">
      <p className="text-[16px] font-semibold text-ink">{title}</p>
      <p className="mt-1.5 max-w-[28rem] text-[14px] leading-[1.55] text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label={t.common.loading} className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-hairline py-4">
          <div className="h-7 w-7 animate-pulse rounded-[6px] bg-wash" />
          <div className="flex-1">
            <div className="h-3 w-40 max-w-full animate-pulse rounded-full bg-wash" />
            <div className="mt-2 h-2.5 w-24 animate-pulse rounded-full bg-wash" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded-full bg-wash" />
        </div>
      ))}
    </div>
  );
}

export interface TrackStep {
  key: string;
  label: string;
  detail?: ReactNode;
}

export function Tracker({ steps, at, failed, failedLabel, failedDetail }: { steps: TrackStep[]; at: number; failed?: boolean; failedLabel?: string; failedDetail?: ReactNode }) {
  return (
    <ol className="border-y border-hairline" aria-live="polite">
      {steps.map((s, i) => {
        const done = i < at || (i === at && i === steps.length - 1 && !failed);
        const now = i === at && !done;
        const bad = now && failed;
        return (
          <li key={s.key} aria-current={now ? 'step' : undefined} className="flex items-start gap-3 border-b border-hairline py-3 last:border-b-0">
            <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center pt-0.5">
              {done ? <CheckIcon className="h-[18px] w-[18px] animate-settle text-ink" strokeWidth={2.2} /> : now && !bad ? <Spinner className="h-4 w-4 text-brand" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[15px] ${bad ? 'font-medium text-danger' : done ? 'text-ink' : now ? 'font-medium text-ink' : 'text-subtle'}`}>{bad && failedLabel ? failedLabel : s.label}</p>
              {bad && failedDetail ? <div className="mt-1 text-[14px] leading-5 text-muted">{failedDetail}</div> : s.detail && (done || now) ? <div className="mt-1 text-[13.5px] leading-5 text-muted">{s.detail}</div> : null}
            </div>
            <span className={`shrink-0 text-[13px] ${bad ? 'text-danger' : done ? 'text-muted' : now ? 'text-brand-ink' : 'text-subtle'}`}>{bad ? t.ui.stepFailed : done ? t.ui.stepDone : now ? t.ui.stepNow : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, tone = 'light' }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string; tone?: 'light' | 'onBlue' }) {
  return (
    <div role="radiogroup" aria-label={label} className={`relative inline-flex rounded-[10px] p-[3px] ${tone === 'onBlue' ? 'bg-white/[0.14]' : 'bg-wash'}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`press relative h-8 min-w-[3.5rem] rounded-[8px] px-3.5 text-[13px] font-semibold transition-colors duration-200 ${
              on ? (tone === 'onBlue' ? 'bg-white text-statement shadow-[0_1px_2px_rgb(0_0_0/0.12)]' : 'bg-surface text-ink shadow-[0_1px_2px_rgb(11_11_12/0.08)]') : tone === 'onBlue' ? 'text-white/75 hover:text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
