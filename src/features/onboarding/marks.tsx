export type PhaseState = 'waiting' | 'active' | 'done';

export function DrawnCheck({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.2 8.4l3 3 6.6-6.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="16" strokeDashoffset="16" className="animate-draw" />
    </svg>
  );
}

export function PhaseMark({ state }: { state: PhaseState }) {
  if (state === 'done') {
    return (
      <span className="flex h-5 w-5 items-center justify-center text-ink">
        <DrawnCheck />
      </span>
    );
  }
  if (state === 'active') {
    return (
      <svg className="h-5 w-5 animate-spin-slow text-brand" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" />
        <path d="M17.5 10A7.5 7.5 0 0 0 10 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5 text-line" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function PhaseList({ phases, label }: { phases: Array<{ label: string; state: PhaseState }>; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {phases.map((p, i) => (
        <li key={i} className="flex items-center gap-4 border-b border-hairline py-4 last:border-b-0" aria-current={p.state === 'active' ? 'step' : undefined}>
          <PhaseMark state={p.state} />
          <span className={`text-[16px] transition-colors duration-500 ${p.state === 'waiting' ? 'text-subtle' : p.state === 'active' ? 'font-medium text-ink' : 'text-ink-2'}`}>{p.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function Address({ name, suffix, muted = false, size = 'xl' }: { name: string; suffix: string; muted?: boolean; size?: 'lg' | 'xl' }) {
  const text = size === 'xl' ? 'text-[30px] sm:text-[46px]' : 'text-[24px] sm:text-[32px]';
  return (
    <p className={`font-semibold leading-[1.05] tracking-[-0.035em] transition-colors duration-500 ${text}`}>
      <span className={`[overflow-wrap:anywhere] ${muted ? 'text-subtle' : 'text-ink'}`}>{name}</span>
      <span className="whitespace-nowrap text-subtle">.{suffix}</span>
    </p>
  );
}
