'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { messageFor } from '@/lib/errors';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { Actions, StepHeader } from '../onboarding-layout';

const RESEND_COOLDOWN_S = 45;
const AUTO_CHECK_MS = 8000;

export function VerifyEmailStep({ email, onVerified }: { email: string; onVerified: () => void }) {
  const { auth } = useServices();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger' | 'success'; text: string } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== 'visible' || busy.current) return;
      try {
        if ((await auth.refreshVerification()) && alive) onVerified();
      } catch {
        return;
      }
    };
    const id = setInterval(() => void tick(), AUTO_CHECK_MS);
    const onFocus = () => void tick();
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [auth, onVerified]);

  async function check() {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    setMessage(null);
    try {
      if (await auth.refreshVerification()) onVerified();
      else setMessage({ tone: 'info', text: t.verify.stillPending });
    } catch (err) {
      setMessage({ tone: 'danger', text: messageFor(err) });
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }

  async function resend() {
    if (busy.current || cooldown > 0) return;
    busy.current = true;
    setSending(true);
    setMessage(null);
    try {
      await auth.sendVerification();
      setMessage({ tone: 'success', text: t.verify.resent });
    } catch (err) {
      setMessage({ tone: 'danger', text: messageFor(err) });
    } finally {
      setCooldown(RESEND_COOLDOWN_S);
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <div className="max-w-[40rem]">
      <StepHeader step="verify" title={t.verify.title} />
      <div className="stagger">
        <p className="text-[17px] text-muted">{t.verify.lead}</p>
        <p className="mt-1 break-all text-[24px] font-semibold tracking-[-0.02em] text-ink sm:text-[28px]">{email}</p>
        <p className="mt-6 flex items-center gap-3 text-[15px] text-ink-2" role="status" aria-live="polite">
          <Spinner className="h-4 w-4 text-brand" />
          {t.verify.pending}
        </p>
        {message ? (
          <div className="mt-8 max-w-[32rem]">
            <Notice tone={message.tone} live={message.tone === 'danger' ? 'assertive' : 'polite'}>
              {message.text}
            </Notice>
          </div>
        ) : null}
        <Actions className="mt-10">
          <Button onClick={() => void check()} loading={checking} loadingLabel={t.common.checking} disabled={sending}>
            {t.verify.check}
          </Button>
          <Button variant="ghost" onClick={() => void resend()} disabled={cooldown > 0 || checking} loading={sending}>
            {cooldown > 0 ? t.verify.wait(cooldown) : t.verify.resend}
          </Button>
        </Actions>
        <div className="mt-12 flex flex-col gap-1 border-t border-hairline pt-6 text-[14px] text-muted">
          <p>{t.verify.spam}</p>
          <p>{t.verify.wrongEmail}</p>
        </div>
      </div>
    </div>
  );
}
