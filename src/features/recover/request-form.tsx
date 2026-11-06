'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { AuthHeading } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Field, Input, PrefixedInput } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { messageFor } from '@/lib/errors';
import { normalizeGhanaPhone } from '@/lib/phone';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { validEmail } from '@/lib/validation';
import { restoreEmail } from './storage';

export function RestoreRequestForm() {
  const { api } = useServices();
  const [email, setEmail] = useState(restoreEmail);
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ email?: string; phone?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const next: { email?: string; phone?: string } = {};
    if (!email.trim()) next.email = t.validation.emailRequired;
    else if (!validEmail(email.trim())) next.email = t.validation.emailInvalid;
    const e164 = normalizeGhanaPhone(phone);
    if (!phone.trim()) next.phone = t.validation.phoneRequired;
    else if (!e164) next.phone = t.validation.phoneInvalid;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length || !e164) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await api.request('RequestSupportRecovery', { email: email.trim(), newPhone: e164 });
      setSent(true);
    } catch (err) {
      setFormError(messageFor(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div>
        <AuthHeading title={t.restore.sentTitle} lead={t.restore.sent} />
        <Link href="/sign-in" className="inline-flex h-12 items-center justify-center rounded-md text-[15px] font-medium text-brand-ink hover:bg-brand-faint">
          {t.forgot.backToSignIn}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading title={t.restore.requestTitle} lead={t.restore.requestLead} />
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label={t.restore.email} error={errors.email ?? null}>
          {({ inputId, describedBy, invalid }) => <Input id={inputId} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={describedBy} invalid={invalid} />}
        </Field>
        <Field label={t.restore.newPhone} hint={t.restore.newPhoneHint} error={errors.phone ?? null}>
          {({ inputId, describedBy, invalid }) => (
            <PrefixedInput id={inputId} prefix="+233" inputMode="tel" autoComplete="tel-national" placeholder="24 123 4567" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 13))} aria-describedby={describedBy} invalid={invalid} />
          )}
        </Field>
        {formError ? (
          <Notice tone="danger" live="assertive">
            {formError}
          </Notice>
        ) : null}
        <Button type="submit" block loading={busy} loadingLabel={t.common.working}>
          {t.restore.send}
        </Button>
        <Link href="/sign-in" className="inline-flex h-12 items-center justify-center rounded-md text-[15px] font-medium text-brand-ink hover:bg-brand-faint">
          {t.forgot.backToSignIn}
        </Link>
      </form>
    </div>
  );
}
