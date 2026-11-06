'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Button, TextButton } from '@/components/ui/button';
import { Checkbox, Field, Input, PrefixedInput, SuffixedInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { messageFor } from '@/lib/errors';
import { ApiError } from '@/lib/graphql/client';
import { clearPendingProfile, readPendingProfile } from '@/lib/pending-profile';
import { nationalDigits, normalizeGhanaPhone } from '@/lib/phone';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { validDisplayName, validHandle } from '@/lib/validation';
import { DrawnCheck } from '../marks';
import { StepHeader } from '../onboarding-layout';
import { useAccountName, type NameCheck } from '../use-account-name';

type Errors = Partial<Record<'name' | 'phone' | 'handle' | 'accountName' | 'ack', string>>;

export function reasonText(reason: string): string {
  return t.profile.reasons[reason] ?? t.profile.reasons.UNKNOWN!;
}

function AddressPreview({ name, parent, check, onPick }: { name: string; parent: string; check: NameCheck; onPick: (s: string) => void }) {
  const available = check.state === 'available';
  return (
    <div>
      <p className="mb-3 text-[13px] font-medium text-muted">{t.profile.preview}</p>
      <div className="relative inline-block max-w-full pb-3">
        <p className="text-[28px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[44px]" aria-live="polite">
          <span className={`[overflow-wrap:anywhere] ${name ? 'text-ink' : 'text-line'}`}>{name || t.profile.previewEmpty}</span>
          <span className="whitespace-nowrap text-subtle">.{parent}</span>
        </p>
      </div>
      <div className="mt-4 min-h-[48px]" role="status">
        {check.state === 'checking' ? (
          <p className="flex items-center gap-2 text-[14px] text-muted">
            <Spinner className="h-3.5 w-3.5" />
            {t.profile.checking}
          </p>
        ) : check.state === 'available' ? (
          <p key={check.name} className="flex animate-rise items-center gap-2 text-[14px] font-medium text-success">
            <DrawnCheck className="h-4 w-4" />
            {t.profile.available}
          </p>
        ) : check.state === 'error' ? (
          <p className="text-[14px] text-danger">{t.profile.checkFailed}</p>
        ) : check.state === 'unavailable' ? (
          <div key={check.name + check.reason} className="animate-rise">
            <p className="text-[14px] text-danger">{reasonText(check.reason)}</p>
            {check.suggestions.length ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted">
                <span>{t.profile.suggestions}</span>
                {check.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onPick(s)}
                    aria-label={t.profile.useSuggestion(s)}
                    className="press min-h-9 rounded-sm font-medium text-brand-ink underline decoration-brand-border underline-offset-4 hover:decoration-brand-ink"
                  >
                    {s}
                  </button>
                ))}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ProfileStep({ defaultName, onDone }: { defaultName: string | null; onDone: () => void }) {
  const { api, accountParent, auth } = useServices();
  const pending = useMemo(() => readPendingProfile(auth.current()?.email), [auth]);
  const [displayName, setDisplayName] = useState(pending?.displayName ?? defaultName ?? '');
  const [phone, setPhone] = useState(pending ? nationalDigits(pending.phone) : '');
  const [handle, setHandle] = useState('');
  const [showHandle, setShowHandle] = useState(false);
  const [rawName, setRawName] = useState('');
  const [ack, setAck] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const { name, check, recheck } = useAccountName(api, rawName);

  function validate(): Errors {
    const next: Errors = {};
    const n = validDisplayName(displayName);
    if (n !== 'ok') next.name = n === 'control' ? t.validation.nameControl : t.validation.nameRequired;
    if (!normalizeGhanaPhone(phone)) next.phone = phone.trim() ? t.validation.phoneInvalid : t.validation.phoneRequired;
    if (handle && !validHandle(handle)) next.handle = t.profile.handleInvalid;
    if (!name) next.accountName = t.profile.reasons.TOO_SHORT;
    else if (check.state === 'unavailable') next.accountName = reasonText(check.reason);
    else if (check.state === 'error') next.accountName = t.profile.checkFailed;
    if (!ack) next.ack = t.profile.acknowledgeRequired;
    return next;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const next = validate();
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length || check.state !== 'available' || check.name !== name) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await api.request('RegisterProfile', {
        input: { displayName: displayName.trim(), phone: normalizeGhanaPhone(phone)!, handle: handle || null, accountName: name },
      });
      clearPendingProfile();
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT' && err.field === 'accountName') {
        setErrors({ accountName: t.profile.conflict });
        recheck();
      } else if (err instanceof ApiError && err.code === 'CONFLICT' && err.field === 'handle') {
        setShowHandle(true);
        setErrors({ handle: t.profile.handleTaken });
      } else if (err instanceof ApiError && err.code === 'BAD_INPUT' && err.field) {
        const map: Record<string, keyof Errors> = { displayName: 'name', phone: 'phone', handle: 'handle', accountName: 'accountName' };
        const key = map[err.field];
        if (key) setErrors({ [key]: key === 'accountName' ? t.profile.reasons.UNKNOWN : t.errors.BAD_INPUT });
        else setFormError(messageFor(err));
        if (key === 'accountName') recheck();
      } else if (err instanceof ApiError && err.code === 'FORBIDDEN' && err.field === 'email') {
        setFormError(t.profile.emailForbidden);
      } else {
        setFormError(messageFor(err));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={busy} className="flex max-w-[68rem] flex-col gap-y-10 lg:grid lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-20 lg:gap-y-8">
      <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <StepHeader step="profile" title={t.profile.title} lead={t.profile.lead} className="!mb-9" />
        {formError ? (
          <div className="mb-6">
            <Notice tone="danger" live="assertive">
              {formError}
            </Notice>
          </div>
        ) : null}
        <div className="stagger flex flex-col gap-6">
          <Field label={t.profile.displayName} hint={t.signUp.fullNameHint} error={errors.name}>
            {({ inputId, describedBy, invalid }) => (
              <Input id={inputId} autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} aria-describedby={describedBy} invalid={invalid} maxLength={120} />
            )}
          </Field>
          <Field label={t.profile.phone} error={errors.phone}>
            {({ inputId, describedBy, invalid }) => (
              <PrefixedInput
                prefix="+233"
                id={inputId}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="24 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+()-]/g, '').slice(0, 17))}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
          <Field label={t.profile.accountName} hint={t.profile.accountNameHint} error={errors.accountName}>
            {({ inputId, describedBy, invalid }) => (
              <SuffixedInput
                suffix={`.${accountParent}`}
                id={inputId}
                value={rawName}
                onChange={(e) => setRawName(e.target.value.toLowerCase().slice(0, 64))}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
            {showHandle ? (
              <Field label={t.profile.handle} hint={t.profile.handleHint} error={errors.handle} optional>
                {({ inputId, describedBy, invalid }) => (
                  <PrefixedInput
                    prefix="@"
                    id={inputId}
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24))}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    autoFocus
                  />
                )}
              </Field>
            ) : (
              <TextButton onClick={() => setShowHandle(true)} className="self-start">{t.profile.addHandle}</TextButton>
            )}
        </div>
      </div>

      <div className="animate-rise lg:col-start-2 lg:row-start-1 lg:self-start lg:pt-[7.25rem]">
        <AddressPreview name={name} parent={accountParent} check={check} onPick={setRawName} />
      </div>

      <div className="stagger flex flex-col gap-8 lg:col-start-2 lg:row-start-2">
        <div className="flex max-w-[30rem] flex-col gap-4 border-t border-hairline pt-6">
          <p className="text-[14px] leading-[1.55] text-ink-2">
            <span className="font-semibold text-ink">{t.profile.disclosureTitle}. </span>
            {t.profile.disclosureBody}
          </p>
          <Checkbox checked={ack} onChange={setAck} invalid={!!errors.ack}>
            {t.profile.acknowledge}
          </Checkbox>
          {errors.ack ? (
            <p className="animate-rise text-[13px] text-danger" role="alert">
              {errors.ack}
            </p>
          ) : null}
        </div>
        <div>
          <Button type="submit" loading={busy} loadingLabel={t.common.working} disabled={check.state === 'checking'}>
            {t.profile.submit}
          </Button>
        </div>
      </div>
    </form>
  );
}
