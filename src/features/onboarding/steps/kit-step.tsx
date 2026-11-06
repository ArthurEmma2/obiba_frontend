'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { PrintIcon } from '@/components/ui/icons';
import { Notice } from '@/components/ui/notice';
import { QrCode } from '@/components/ui/qr-code';
import {
  generateKitSeed,
  kitPublicKey,
  kitSeedFromWords,
  kitWords,
  pickConfirmationPositions,
  recoveryKitRegistrationMessage,
  toBase64,
  wipe,
} from '@/lib/crypto/recovery-kit';
import { isApiError, messageFor } from '@/lib/errors';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { StepUpCancelled, useStepUp } from '../../session/use-step-up';
import { Actions, StepHeader } from '../onboarding-layout';

type Stage = 'intro' | 'reveal' | 'confirm';

const HIDDEN_WIPE_MS = 60_000;
const IDLE_WIPE_MS = 10 * 60_000;
const INPUT_GUARDS = { autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'none', spellCheck: false } as const;

export function KitStep({ uid, accountId, onDone }: { uid: string; accountId: string; onDone: () => void }) {
  const { api, device, networkId } = useServices();
  const [stage, setStage] = useState<Stage>('intro');
  const [words, setWords] = useState<string[]>([]);
  const [positions, setPositions] = useState<number[]>([]);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [mismatch, setMismatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [busy, setBusy] = useState(false);
  const seed = useRef<Uint8Array | null>(null);
  const inFlight = useRef(false);
  const stepUp = useStepUp();

  const clearSecret = useCallback(() => {
    wipe(seed.current);
    seed.current = null;
    setWords([]);
    setAnswers(['', '', '']);
    setPositions([]);
  }, []);

  useEffect(() => clearSecret, [clearSecret]);

  const holdingSecret = stage === 'reveal' || stage === 'confirm';

  useEffect(() => {
    if (!holdingSecret) return;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const expire = () => {
      clearSecret();
      setCleared(true);
      setStage('intro');
    };
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(expire, IDLE_WIPE_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenTimer = setTimeout(expire, HIDDEN_WIPE_MS);
      else if (hiddenTimer) clearTimeout(hiddenTimer);
    };
    resetIdle();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointerdown', resetIdle);
    window.addEventListener('keydown', resetIdle);
    window.addEventListener('pagehide', expire);
    return () => {
      if (hiddenTimer) clearTimeout(hiddenTimer);
      if (idleTimer) clearTimeout(idleTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      window.removeEventListener('pagehide', expire);
    };
  }, [holdingSecret, clearSecret]);

  function generate() {
    clearSecret();
    const s = generateKitSeed();
    seed.current = s;
    setWords(kitWords(s));
    setPositions(pickConfirmationPositions());
    setCleared(false);
    setError(null);
    setStage('reveal');
  }

  async function register(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || !seed.current) return;
    const ok = positions.every((p, i) => answers[i]!.trim().toLowerCase() === words[p]);
    setMismatch(!ok);
    if (!ok) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const restored = kitSeedFromWords(words.join(' '));
      const kitPk = kitPublicKey(seed.current);
      const roundTrip = kitPublicKey(restored);
      wipe(restored);
      if (roundTrip !== kitPk) throw new Error('kit round trip failed');
      const key = await device.load(uid);
      if (!key) throw new Error('device key missing');
      const signature = toBase64(await device.sign(key, recoveryKitRegistrationMessage(networkId, accountId, kitPk)));
      const r = await stepUp.run(
        () => api.request('RegisterRecoveryKit', { kitPublicKey: kitPk, devicePublicKey: key.publicKey, deviceSignature: signature }),
        { requireFresh: true },
      );
      if (!r.registerRecoveryKit.active || r.registerRecoveryKit.publicKey !== kitPk) throw new Error('kit not active');
      clearSecret();
      onDone();
    } catch (err) {
      if (!(err instanceof StepUpCancelled)) setError(isApiError(err, 'SIGNED_OP_MISMATCH') ? t.kit.signatureMismatch : `${t.kit.failed} ${messageFor(err)}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (stage === 'intro') {
    return (
      <div className="max-w-[38rem]">
        <StepHeader title={t.kit.title} lead={t.kit.lead} />
        <div className="stagger flex flex-col gap-8">
          {cleared ? (
            <Notice tone="info" live="polite">
              {t.kit.clearedForSafety}
            </Notice>
          ) : null}
          <div>
            <Button onClick={generate}>{t.kit.generate}</Button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'confirm') {
    return (
      <div className="max-w-[44rem]">
        <StepHeader title={t.kit.confirmTitle} lead={t.kit.confirmLead} />
        <form onSubmit={register} noValidate className="stagger flex flex-col gap-8" aria-busy={busy}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {positions.map((p, i) => (
              <Field key={p} label={t.kit.wordN(p + 1)}>
                {({ inputId, describedBy }) => (
                  <Input
                    id={inputId}
                    name={`kit-confirm-${i}`}
                    value={answers[i]}
                    onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 12) : v)))}
                    aria-describedby={describedBy}
                    invalid={mismatch}
                    autoFocus={i === 0}
                    className="font-mono"
                    {...INPUT_GUARDS}
                  />
                )}
              </Field>
            ))}
          </div>
          {mismatch ? (
            <Notice tone="danger" live="assertive">
              {t.kit.mismatch}
            </Notice>
          ) : null}
          {error ? (
            <Notice tone="danger" live="assertive">
              {error}
            </Notice>
          ) : null}
          {stepUp.panel}
          {!stepUp.active ? (
            <Actions>
              <Button type="submit" loading={busy} loadingLabel={t.kit.registering}>
                {t.kit.register}
              </Button>
              <Button variant="ghost" onClick={() => setStage('reveal')} disabled={busy}>
                {t.kit.showAgain}
              </Button>
            </Actions>
          ) : null}
        </form>
      </div>
    );
  }

  const printDate = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="max-w-[60rem]">
      <div className="print-hidden">
        <StepHeader title={t.kit.revealTitle} lead={t.kit.revealLead} />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_13rem]">
          <section
            className="select-none rounded-md border border-line bg-surface shadow-raise"
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3 text-[12.5px] text-muted sm:px-7">
              <span className="font-medium text-ink-2">{t.kit.printTitle}</span>
              <span className="truncate pl-4 font-mono">{accountId}</span>
            </div>
            <ol aria-label={t.kit.revealTitle} className="grid grid-cols-2 gap-x-8 px-5 py-4 sm:grid-cols-3 sm:px-7 sm:py-5">
              {words.map((w, i) => (
                <li key={i} className="flex animate-rise items-baseline gap-3 py-[9px]" style={{ animationDelay: `${120 + i * 22}ms` }}>
                  <span className="tabular w-5 shrink-0 text-right text-[12px] text-subtle">{i + 1}</span>
                  <span className="font-mono text-[16px] tracking-[0.01em] text-ink">{w}</span>
                </li>
              ))}
            </ol>
          </section>
          <aside className="stagger flex flex-row items-start gap-5 lg:flex-col">
            <div className="rounded-sm border border-line bg-white p-2">
              <QrCode value={words.join(' ')} label={t.kit.qrLabel} size={132} />
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-[13px] leading-5 text-muted">{t.kit.qrHint}</p>
              <Button variant="secondary" size="md" onClick={() => window.print()} className="self-start">
                <PrintIcon className="h-4 w-4" />
                {t.kit.print}
              </Button>
            </div>
          </aside>
        </div>
        <div className="stagger mt-10 flex flex-col gap-8">
          <p className="max-w-[36rem] text-[14px] leading-[1.55] text-ink-2">{t.kit.warning}</p>
          <div>
            <Button onClick={() => setStage('confirm')}>{t.kit.written}</Button>
          </div>
        </div>
      </div>

      <section className="print-only text-black" aria-hidden="true">
        <h1 className="text-[22px] font-semibold">{t.kit.printTitle}</h1>
        <p className="mt-2 text-[13px]">
          {t.kit.printAccount}: {accountId}
        </p>
        <p className="text-[13px]">
          {t.kit.printDate}: {printDate}
        </p>
        <ol className="mt-6 grid grid-cols-3 gap-x-8 gap-y-3">
          {words.map((w, i) => (
            <li key={i} className="flex gap-2 border-b border-black/20 pb-1 font-mono text-[14px]">
              <span className="w-6 text-right">{i + 1}.</span>
              <span>{w}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <QrCode value={words.join(' ')} label={t.kit.qrLabel} size={150} />
        </div>
        <p className="mt-6 max-w-[34rem] text-[12px] leading-5">{t.kit.printNotice}</p>
      </section>
    </div>
  );
}
