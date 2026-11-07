'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Field, Input } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { QrCode } from '@/components/ui/qr-code';
import type { PersistenceStatus } from '@/lib/crypto/device-key';
import { messageFor } from '@/lib/errors';
import type { CreatedInvoice, DeviceView, MerchantInvoice, NotificationView, RecoveryKitStatus, RecoveryView, SupportCaseView } from '@/lib/graphql/types';
import { formatUsd, parseAmount, unitsToInput } from '@/lib/money';
import { useServices, useSession } from '@/lib/services';
import { t } from '@/lib/strings';
import { KitStep } from '../onboarding/steps/kit-step';
import { PhoneStep } from '../onboarding/steps/phone-step';
import { TotpStep } from '../onboarding/steps/totp-step';
import { formatGhanaLocal } from '@/lib/phone';
import { StepUpCancelled, useStepUp } from '../session/use-step-up';
import { buttonStyles, FooterButton, ViewOnlyNotice } from './flow';
import { longDate, shortDate } from './format';
import { CheckIcon, CopyIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { PaymentError, signAccountCall } from './pipeline';
import { useSecured } from './shell';
import { Empty, Segmented, Skeleton, Status, useCopy } from './ui';
import { useWallet } from './wallet-data';

function nsDate(ns: string): string {
  return longDate(new Date(Number(BigInt(ns) / 1_000_000n)).toISOString());
}

function CreateRequest({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const { api } = useServices();
  const [amount, setAmount] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInvoice | null>(null);
  const [copied, copy] = useCopy();
  const units = parseAmount(amount);
  const valid = units !== null && units > 0n;

  async function create() {
    if (!valid || busy || units === null) return;
    setBusy(true);
    setError(null);
    try {
      setCreated((await api.request('CreateInvoice', { input: { amount: unitsToInput(units), expiresInMinutes: minutes, reference: reference.trim() || null } })).createInvoice);
      onCreated();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="animate-step grid gap-8 sm:grid-cols-[220px_minmax(0,1fr)]">
        <div className="rounded-[12px] border border-line bg-white p-4 [&>svg]:h-full [&>svg]:w-full">
          <QrCode value={created.paymentUrl} label={t.requests.share} size={200} />
        </div>
        <div className="min-w-0">
          <p className="eyebrow text-success">{t.requests.created}</p>
          <p className="tabular mt-2 text-[40px] font-semibold leading-none tracking-[-0.045em] text-ink">{formatUsd(created.amount)}</p>
          <p className="mt-3 text-[14px] text-muted">
            {t.requests.expiresAt} {nsDate(created.expiresAtNs)}
          </p>
          <p className="mt-6 text-[14px] text-ink-2">{t.requests.share}</p>
          <p className="mt-2 break-all rounded-[12px] bg-canvas px-3 py-2.5 font-mono text-[12.5px] text-ink-2">{created.paymentUrl}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => copy(created.paymentUrl)} className={`${buttonStyles.primary} gap-2`}>
              {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
              {copied ? t.ui.copied : t.requests.copyLink}
            </button>
            <button type="button" onClick={onClose} className={buttonStyles.secondary}>
              {t.requests.close}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      className="animate-step flex max-w-[520px] flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <p className="text-[19px] font-semibold tracking-[-0.02em] text-ink">{t.requests.createTitle}</p>
      <Field label={t.requests.amount}>
        {({ inputId }) => <Input id={inputId} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" className="tabular text-[20px] font-semibold" autoFocus />}
      </Field>
      <div>
        <p className="mb-2 text-[14px] font-medium text-ink">{t.requests.expires}</p>
        <Segmented label={t.requests.expires} value={String(minutes)} onChange={(v) => setMinutes(Number(v))} options={[15, 30, 60].map((m) => ({ value: String(m), label: t.requests.minutes(m) }))} />
      </div>
      <Field label={t.requests.reference} hint={t.requests.referenceHint} optional>
        {({ inputId, describedBy }) => <Input id={inputId} value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} aria-describedby={describedBy} />}
      </Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex gap-3">
        <FooterButton type="submit" disabled={!valid} loading={busy}>
          {t.requests.createButton}
        </FooterButton>
        <FooterButton variant="secondary" onClick={onClose}>
          {t.common.cancel}
        </FooterButton>
      </div>
    </form>
  );
}

function RequestRow({ inv }: { inv: MerchantInvoice }) {
  const [open, setOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const expired = inv.status === 'OPEN' && Number(BigInt(inv.expiresAtNs) / 1_000_000n) < now;
  const status = expired ? 'EXPIRED' : inv.status;
  return (
    <li className="border-b border-hairline last:border-b-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="group -mx-3 grid w-[calc(100%+1.5rem)] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-[8px] px-3 py-3.5 text-left hover:bg-canvas md:grid-cols-[minmax(0,1fr)_8rem_8rem_7rem]">
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium text-ink">{inv.reference || `${inv.invoiceId.slice(0, 8)}...`}</span>
          <span className="block text-[13px] text-muted">{shortDate(inv.createdAt)}</span>
        </span>
        <span className="hidden md:block">
          <Status status={status} label={t.requests.statuses[status]} />
        </span>
        <span className="hidden truncate text-[13px] text-muted md:block">{inv.payer ?? ''}</span>
        <span className="tabular text-right text-[15px] font-semibold text-ink">{formatUsd(inv.amount)}</span>
      </button>
      {open ? (
        <div className="animate-step pb-5 pl-0 md:pl-0">
          <dl className="grid gap-x-8 gap-y-2 text-[14px] sm:grid-cols-2">
            <div className="flex justify-between gap-4 md:hidden">
              <dt className="text-muted">{t.activity.status}</dt>
              <dd>
                <Status status={status} label={t.requests.statuses[status]} />
              </dd>
            </div>
            {inv.payer ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t.requests.payer}</dt>
                <dd className="truncate font-mono text-[12.5px]">{inv.payer}</dd>
              </div>
            ) : null}
            {inv.net ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t.requests.net}</dt>
                <dd className="tabular font-semibold">{formatUsd(inv.net)}</dd>
              </div>
            ) : null}
            {inv.fee ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t.requests.fee}</dt>
                <dd className="tabular">{formatUsd(inv.fee)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{inv.paidAt ? t.requests.paidAt : t.requests.expiresAt}</dt>
              <dd>{inv.paidAt ? longDate(inv.paidAt) : nsDate(inv.expiresAtNs)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {status === 'OPEN' ? (
              <a href={inv.paymentUrl} target="_blank" rel="noreferrer" className={buttonStyles.link}>
                {inv.paymentUrl.replace(/^https?:\/\//, '')}
              </a>
            ) : null}
            {inv.paidExplorerUrl ? (
              <a href={inv.paidExplorerUrl} target="_blank" rel="noreferrer" className={buttonStyles.link}>
                {t.activity.explorer}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function Requests() {
  const { api } = useServices();
  const { state } = useWallet();
  const [items, setItems] = useState<MerchantInvoice[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all');
  const [now] = useState(() => Date.now());
  const merchant = state.status === 'ready' && state.wallet.me.merchant;
  const viewOnly = state.status === 'ready' && state.wallet.me.viewOnly;

  const load = useCallback(() => {
    api.request('MerchantInvoices', { first: 50 }).then(
      (r) => {
        setItems(r.merchantInvoices);
        setError(null);
      },
      (err: unknown) => setError(err),
    );
  }, [api]);

  useEffect(() => {
    if (!merchant) return;
    load();
    return api.subscribe('TransactionUpdated', () => load());
  }, [api, merchant, load]);

  if (state.status !== 'ready') return <Skeleton rows={4} />;

  if (!merchant) {
    return (
      <div className="max-w-[760px]">
        <PageHeader title={t.requests.title} lead={t.requests.lead} />
        <Empty title={t.requests.notMerchant} body={t.requests.notMerchantBody} />
      </div>
    );
  }

  const shown = (items ?? []).filter((i) => {
    if (filter === 'all') return true;
    const expired = i.status === 'OPEN' && Number(BigInt(i.expiresAtNs) / 1_000_000n) < now;
    return (expired ? 'EXPIRED' : i.status) === filter;
  });

  return (
    <div className="max-w-[900px]">
      <PageHeader
        title={t.requests.title}
        lead={t.requests.lead}
        actions={
          !creating && !viewOnly ? (
            <button type="button" onClick={() => setCreating(true)} className={buttonStyles.primary}>
              {t.requests.create}
            </button>
          ) : null
        }
      />
      {viewOnly ? (
        <div className="mb-8">
          <ViewOnlyNotice />
        </div>
      ) : null}
      {creating ? (
        <div className="mb-12 border-b border-hairline pb-12">
          <CreateRequest onCreated={load} onClose={() => setCreating(false)} />
        </div>
      ) : null}
      <div className="mb-4">
        <Segmented label={t.activity.filterLabel} value={filter} onChange={setFilter} options={Object.entries(t.requests.filters).map(([value, label]) => ({ value, label }))} />
      </div>
      {error && !items ? (
        <Notice tone="danger">{messageFor(error)}</Notice>
      ) : !items ? (
        <Skeleton rows={4} />
      ) : shown.length === 0 ? (
        <Empty title={t.requests.empty} body={t.requests.emptyBody} />
      ) : (
        <ul className="stagger">
          {shown.map((inv) => (
            <RequestRow key={inv.invoiceId} inv={inv} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function Notifications() {
  const { api } = useServices();
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.request('Notifications', { first: 50 }).then(
      (r) => setItems(r.notifications),
      (err: unknown) => setError(err),
    );
  }, [api]);

  useEffect(() => {
    load();
    return api.subscribe('AccountEvents', () => load());
  }, [api, load]);

  const unread = (items ?? []).filter((n) => !n.read);

  async function markAll() {
    const newest = items?.[0];
    if (!newest || busy) return;
    setBusy(true);
    try {
      await api.request('MarkNotificationsRead', { upToId: newest.id });
      setItems((cur) => (cur ?? []).map((n) => ({ ...n, read: true })));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[760px]">
      <PageHeader
        title={t.notifications.title}
        lead={t.notifications.lead}
        actions={
          unread.length ? (
            <button type="button" onClick={() => void markAll()} disabled={busy} className="press text-[14px] font-medium text-brand-ink underline-offset-4 hover:underline disabled:text-subtle">
              {t.notifications.markAll}
            </button>
          ) : null
        }
      />
      {error && !items ? (
        <Notice tone="danger">{messageFor(error)}</Notice>
      ) : !items ? (
        <Skeleton rows={3} />
      ) : items.length === 0 ? (
        <Empty title={t.notifications.empty} body={t.notifications.emptyBody} />
      ) : (
        <ul className="stagger">
          {items.map((n) => {
            const urgent = n.kind === 'RECOVERY_REQUESTED' || n.kind === 'RECOVERY_STARTED';
            return (
              <li key={n.id} className="border-b border-hairline last:border-b-0">
                <Link href="/settings#recovery" className="group -mx-3 flex gap-4 rounded-[8px] px-3 py-4 hover:bg-canvas">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`text-[15px] ${n.read ? 'font-medium text-ink-2' : 'font-semibold text-ink'} ${urgent ? 'text-warning' : ''}`}>{t.notifications.kinds[n.kind] ?? n.kind}</span>
                      <span className="shrink-0 text-[12.5px] text-subtle">{shortDate(n.createdAt)}</span>
                    </span>
                    {t.notifications.bodies[n.kind] ? <span className="mt-0.5 block text-[14px] leading-5 text-muted">{t.notifications.bodies[n.kind]}</span> : null}
                  </span>
                  {!n.read ? <span className="mt-0.5 shrink-0 text-[12px] font-semibold text-brand-ink">{t.notifications.newLabel}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Section({ id, title, children, lead }: { id: string; title: string; children: ReactNode; lead?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-hairline pt-8 first:border-t-0 first:pt-0">
      <h2 id={`${id}-h`} className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
        {title}
      </h2>
      {lead ? <p className="mt-1 max-w-[36rem] text-[14px] leading-5 text-muted">{lead}</p> : null}
      <dl className="mt-4">{children}</dl>
    </section>
  );
}

function Row({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-hairline py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-[14px] text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-4 text-[15px] text-ink sm:justify-end">
        <span className="min-w-0 break-words text-left sm:text-right">{children}</span>
        {action}
      </dd>
    </div>
  );
}

function LimitEditor({ current, onDone }: { current: bigint; onDone: () => void }) {
  const services = useServices();
  const session = useSession();
  const stepUp = useStepUp();
  const { state, refresh } = useWallet();
  const [value, setValue] = useState(unitsToInput(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const units = parseAmount(value);
  const raise = units !== null && units > current;

  async function apply() {
    if (units === null || units <= 0n || units === current || busy || session.status !== 'signed-in' || state.status !== 'ready' || !state.wallet.me.accountId) return;
    setBusy(true);
    setError(null);
    try {
      if (raise && !services.auth.secondFactorEnrolled()) throw new PaymentError('NEEDS_AUTHENTICATOR');
      const amount = unitsToInput(units);
      const call = raise
        ? (await stepUp.run(() => services.api.request('RequestLimitRaise', { newLimit: amount }), { requireFresh: true })).requestLimitRaise
        : (await services.api.request('PrepareLimitChange', { newLimit: amount })).prepareLimitChange;
      const signed = await signAccountCall(services, session.user.uid, state.wallet.me.accountId, call, { method: 'set_limit', newLimit: units.toString() });
      await services.api.request('SubmitAccountCall', { callId: call.callId, signedDelegate: signed });
      await refresh();
      onDone();
    } catch (err) {
      if (err instanceof StepUpCancelled) return;
      setError(err instanceof PaymentError ? (err.code === 'NEEDS_AUTHENTICATOR' ? t.flow.needsAuthenticator : err.code === 'NO_DEVICE_KEY' ? t.flow.noDeviceKey : t.flow.verifyFailed) : messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-step border-b border-hairline py-5">
      <Field label={t.settings.daily} hint={raise ? t.settings.limitNote : undefined}>
        {({ inputId, describedBy }) => <Input id={inputId} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} aria-describedby={describedBy} className="tabular max-w-[16rem] text-[18px] font-semibold" />}
      </Field>
      {error ? (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      {stepUp.panel ? <div className="mt-4">{stepUp.panel}</div> : null}
      <div className="mt-4 flex gap-3">
        <FooterButton disabled={units === null || units <= 0n || units === current} loading={busy} onClick={() => void apply()}>
          {t.flow.continue}
        </FooterButton>
        <FooterButton variant="secondary" onClick={onDone}>
          {t.common.cancel}
        </FooterButton>
      </div>
    </div>
  );
}

const ACTIVE_RECOVERY = new Set(['REQUESTED', 'SIGNED', 'SUBMITTED', 'PENDING_TIMELOCK', 'CANCEL_REQUESTED']);

export function Settings() {
  const services = useServices();
  const session = useSession();
  const router = useRouter();
  const secured = useSecured();
  const stepUp = useStepUp();
  const { state, refresh } = useWallet();
  const [setup, setSetup] = useState<{ devices: DeviceView[]; kit: RecoveryKitStatus; recovery: RecoveryView | null; support: SupportCaseView | null } | null>(null);
  const [persistence, setPersistence] = useState<PersistenceStatus | null>(null);
  const [localKey, setLocalKey] = useState<string | null>(null);
  const [totp, setTotp] = useState(false);
  const [phoneSetup, setPhoneSetup] = useState(false);
  const [kitSetup, setKitSetup] = useState(false);
  const [editingLimit, setEditingLimit] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, copy] = useCopy();
  const uid = session.status === 'signed-in' ? session.user.uid : null;

  const load = useCallback(() => {
    Promise.all([
      services.api.request('SetupStatus'),
      services.api.request('Recovery').then((r) => r.recovery, () => null),
      services.api.request('SupportCase').then((r) => r.supportCase, () => null),
    ]).then(
      ([s, recovery, support]) => setSetup({ devices: s.devices, kit: s.recoveryKit, recovery, support }),
      (err: unknown) => setError(messageFor(err)),
    );
  }, [services.api]);

  useEffect(() => {
    load();
    void services.device.persistence().then(setPersistence);
    if (uid) void services.device.load(uid).then((k) => setLocalKey(k?.publicKey ?? null));
  }, [load, services.device, uid]);

  const sections = useMemo(
    () => [
      ['profile', t.settings.nav.profile],
      ['security', t.settings.nav.security],
      ['limits', t.settings.nav.limits],
      ['recovery', t.settings.nav.recovery],
      ['sessions', t.settings.nav.sessions],
      ['about', t.settings.nav.about],
    ],
    [],
  );

  if (state.status !== 'ready') return <Skeleton rows={6} />;
  const { wallet, limit } = state;
  const me = wallet.me;
  const viewOnly = me.viewOnly;
  const recovery = setup?.recovery && ACTIVE_RECOVERY.has(setup.recovery.status) ? setup.recovery : null;
  const activeDevices = setup?.devices.filter((d) => d.status !== 'revoked') ?? [];
  const supportOpen = !!setup?.support && ['OPEN', 'VERIFIED', 'APPROVED'].includes(setup.support.status);

  async function cancelRecovery() {
    if (!uid || !me.accountId || busy) return;
    setBusy('cancel');
    setError(null);
    try {
      const call = (await services.api.request('CancelRecoveryCall')).cancelRecoveryCall;
      const signed = await signAccountCall(services, uid, me.accountId, call, { method: 'cancel_recovery' });
      await services.api.request('CancelRecovery', { signedDelegate: signed });
      load();
    } catch (err) {
      setError(err instanceof PaymentError ? t.flow.verifyFailed : messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  async function cancelSupport() {
    if (busy) return;
    setBusy('support');
    setError(null);
    try {
      await services.api.request('CancelSupportRecovery');
      load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  async function signOutEverywhere() {
    if (busy) return;
    setBusy('everywhere');
    setError(null);
    try {
      await stepUp.run(() => services.api.request('SignOutEverywhere'), { requireFresh: true });
      await services.auth.signOut();
      router.replace('/sign-in');
    } catch (err) {
      if (!(err instanceof StepUpCancelled)) setError(messageFor(err));
    } finally {
      setBusy(null);
    }
  }

  if (phoneSetup) {
    return (
      <div className="max-w-[560px]">
        <PhoneStep
          phone={me.phone}
          mode="settings"
          onDone={() => {
            setPhoneSetup(false);
            load();
          }}
        />
      </div>
    );
  }

  if (kitSetup && uid && me.accountId) {
    return (
      <div className="max-w-[640px]">
        <KitStep
          uid={uid}
          accountId={me.accountId}
          onDone={() => {
            setKitSetup(false);
            load();
          }}
        />
      </div>
    );
  }

  if (totp && uid) {
    return (
      <div className="max-w-[560px]">
        <TotpStep
          uid={uid}
          mode="settings"
          onDone={() => {
            setTotp(false);
            load();
          }}
        />
      </div>
    );
  }

  const link = (label: string, onClick: () => void, disabled = false) => (
    <button type="button" onClick={onClick} disabled={disabled} className="press shrink-0 rounded-[6px] text-[14px] font-medium text-brand-ink underline-offset-4 hover:underline disabled:text-subtle disabled:no-underline">
      {label}
    </button>
  );

  return (
    <div>
      <PageHeader title={t.settings.title} lead={t.settings.lead} />
      <div className="grid gap-10 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-14">
        <nav aria-label={t.settings.title} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:sticky lg:top-10 lg:mx-0 lg:flex-col lg:gap-0.5 lg:self-start lg:px-0">
          {sections.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="shrink-0 rounded-[8px] border border-field px-3 py-1.5 text-[14px] text-ink-2 hover:border-ink/25 lg:border-0 lg:px-3 lg:py-2 lg:hover:bg-canvas">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex max-w-[760px] flex-col gap-12">
          {viewOnly ? <ViewOnlyNotice /> : null}
          {error ? (
            <Notice tone="danger" live="assertive">
              {error}
            </Notice>
          ) : null}

          <Section id="profile" title={t.settings.account}>
            <Row label={t.settings.name}>{me.displayName}</Row>
            <Row label={t.settings.email}>{me.email}</Row>
            <Row label={t.settings.phone}>
              {me.phone} <span className="text-[13px] text-muted">({t.settings.phoneNote})</span>
            </Row>
            {me.handle ? <Row label={t.settings.handle}>@{me.handle}</Row> : null}
            <Row label={t.settings.address} action={me.accountId ? link(copied ? t.ui.copied : t.ui.copy, () => copy(me.accountId!)) : null}>
              <span className="font-mono text-[13.5px]">{me.accountId}</span>
            </Row>
            <Row
              label={t.settings.status}
              action={
                wallet.account.explorerUrl ? (
                  <a href={wallet.account.explorerUrl} target="_blank" rel="noreferrer" className="shrink-0 text-[14px] font-medium text-brand-ink underline-offset-4 hover:underline">
                    {t.settings.explorer}
                  </a>
                ) : null
              }
            >
              <Status status={me.accountStatus === 'active' ? 'COMPLETED' : 'REVIEW'} label={t.accountPage.statuses[me.accountStatus ?? ''] ?? '-'} />
            </Row>
          </Section>

          <Section id="security" title={t.settings.security}>
            <Row label={t.accountPage.deviceKey} action={!viewOnly && secured ? link(t.accountPage.removeBrowser, () => setRemoving((r) => !r)) : null}>
              {viewOnly ? t.accountPage.deviceViewOnly : secured ? <Status status="COMPLETED" label={t.accountPage.deviceOk} /> : <Status status="REVIEW" label={t.accountPage.deviceMissing} />}
            </Row>
            {removing ? (
              <div className="animate-step border-b border-hairline py-5 text-[14px] leading-[1.55] text-ink-2">
                {activeDevices.length <= 1 ? (
                  <>
                    <p className="text-[15px] font-semibold text-ink">{t.accountPage.removeOnlyTitle}</p>
                    <p className="mt-2 max-w-[36rem]">{t.accountPage.removeOnlyBody}</p>
                  </>
                ) : (
                  <p className="max-w-[36rem]">{t.accountPage.removeUnavailable}</p>
                )}
                <div className="mt-4">{link(t.accountPage.close, () => setRemoving(false))}</div>
              </div>
            ) : null}
            {!viewOnly ? <Row label={t.accountPage.storage}>{persistence === 'granted' ? t.accountPage.storageGranted : persistence === 'denied' ? t.accountPage.storageNotGranted : persistence === 'unsupported' ? t.accountPage.storageUnknown : '-'}</Row> : null}
            <Row label={t.accountPage.phone} action={!services.auth.phoneEnrolled() && !viewOnly ? link(t.accountPage.setUp, () => setPhoneSetup(true)) : null}>
              {services.auth.phoneEnrolled() ? <Status status="COMPLETED" label={t.accountPage.phoneOn(formatGhanaLocal(me.phone))} /> : t.accountPage.phoneOff}
            </Row>
            <Row label={t.accountPage.totp} action={!services.auth.totpEnrolled() && !viewOnly ? link(t.accountPage.setUp, () => setTotp(true)) : null}>
              {services.auth.totpEnrolled() ? <Status status="COMPLETED" label={t.done.totpOn} /> : t.done.totpOff}
            </Row>
            {setup ? (
              <Row label={t.settings.devices}>
                <span className="flex flex-col gap-1 sm:items-end">
                  {activeDevices.map((d) => (
                    <span key={d.publicKey} className="flex items-center gap-2 text-[14px]">
                      <span className="font-mono text-[12.5px] text-muted">
                        {d.publicKey.slice(8, 14)}...{d.publicKey.slice(-6)}
                      </span>
                      {d.publicKey === localKey ? t.settings.deviceThis : t.settings.deviceOther}
                      {d.initial ? <span className="text-[12.5px] text-subtle">({t.settings.deviceInitial})</span> : null}
                    </span>
                  ))}
                </span>
              </Row>
            ) : null}
          </Section>

          <Section id="limits" title={t.settings.limits} lead={t.settings.limitNote}>
            {limit ? (
              <>
                <Row label={t.settings.daily} action={!viewOnly && secured && !editingLimit ? link(t.settings.change, () => setEditingLimit(true)) : null}>
                  <span className="tabular font-semibold">{formatUsd(limit.dailyLimit)}</span>
                </Row>
                {editingLimit ? (
                  <LimitEditor
                    current={BigInt(limit.dailyLimit)}
                    onDone={() => {
                      setEditingLimit(false);
                      void refresh();
                    }}
                  />
                ) : null}
                <Row label={t.settings.spent}>
                  <span className="tabular">{formatUsd(limit.spent24h)}</span>
                </Row>
                <Row label={t.settings.remaining}>
                  <span className="tabular">{formatUsd(limit.remaining)}</span>
                </Row>
                <Row label={t.settings.perPayment}>
                  <span className="tabular">{formatUsd(limit.maxOpAmount)}</span>
                </Row>
                {limit.pendingLimit && limit.pendingLimitEffectiveAt ? <Row label={t.settings.scheduled}>{t.settings.pendingRaise(formatUsd(limit.pendingLimit), longDate(limit.pendingLimitEffectiveAt))}</Row> : null}
                {limit.frozenUntil ? <Row label={t.settings.status}>{t.settings.frozenUntil(longDate(limit.frozenUntil))}</Row> : null}
              </>
            ) : (
              <p className="text-[14px] text-muted">{t.wallet.frozen}</p>
            )}
          </Section>

          <Section id="recovery" title={t.settings.recovery} lead={t.settings.recoveryHelp}>
            <Row label={t.settings.kitStatus} action={setup && !viewOnly && secured && me.accountId ? link(setup.kit.active ? t.settings.kitReplace : t.settings.kitCreate, () => setKitSetup(true)) : null}>{setup ? setup.kit.active ? <Status status="COMPLETED" label={setup.kit.createdAt ? t.settings.kitSaved(shortDate(setup.kit.createdAt)) : t.done.kitActive} /> : t.settings.kitMissing : '-'}</Row>
            <Row
              label={t.settings.recovery}
              action={recovery && !viewOnly && secured ? link(busy === 'cancel' ? t.common.working : t.common.cancel, () => void cancelRecovery(), busy !== null) : null}
            >
              {recovery ? <span className="font-medium text-warning">{t.settings.recoveryActive(recovery.executableAt ? longDate(recovery.executableAt) : '-')}</span> : t.settings.recoveryNone}
            </Row>
            <Row
              label={t.restore.settingsRow}
              action={supportOpen && !viewOnly && secured ? link(busy === 'support' ? t.common.working : t.restore.cancelRequest, () => void cancelSupport(), busy !== null) : null}
            >
              {setup?.support ? <span className={supportOpen ? 'font-medium text-warning' : ''}>{t.restore.status[setup.support.status] ?? setup.support.status}</span> : t.restore.none}
            </Row>
          </Section>

          <Section id="sessions" title={t.settings.sessions} lead={t.accountPage.signOutEverywhereHint}>
            {stepUp.panel ? <div className="py-4">{stepUp.panel}</div> : null}
            <div className="flex flex-wrap gap-3 pt-2">
              <button type="button" onClick={() => void services.auth.signOut().then(() => router.replace('/sign-in'))} className={buttonStyles.secondary}>
                {t.common.signOut}
              </button>
              <button type="button" onClick={() => void signOutEverywhere()} disabled={busy !== null} className="press inline-flex h-12 items-center rounded-[10px] border border-danger/30 px-6 text-[15px] font-medium text-danger hover:bg-danger-soft disabled:opacity-50">
                {busy === 'everywhere' ? t.common.working : t.accountPage.signOutEverywhere}
              </button>
            </div>
          </Section>

          <Section id="about" title={t.settings.about}>
            <Row label={t.settings.about}>{t.settings.aboutCustody}</Row>
            <Row label={t.overview.localTitle}>{t.settings.aboutLocal}</Row>
            <Row label={t.settings.support}>
              <a href={`mailto:${services.supportEmail}`} className="font-medium text-brand-ink underline-offset-4 hover:underline">
                {services.supportEmail}
              </a>
            </Row>
            <Row label={t.settings.terms}>
              <a href={`${services.siteUrl}/terms`} target="_blank" rel="noreferrer" className="font-medium text-brand-ink underline-offset-4 hover:underline">
                {services.siteUrl.replace(/^https?:\/\//, '')}/terms
              </a>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}
