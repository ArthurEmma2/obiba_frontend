'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Field, Input } from '@/components/ui/field';
import { Logo } from '@/components/ui/logo';
import { Notice } from '@/components/ui/notice';
import { QrCode } from '@/components/ui/qr-code';
import { Spinner } from '@/components/ui/spinner';
import { routes, useQueryId } from '@/lib/routes';
import { messageFor } from '@/lib/errors';
import type { DepositOption, InvoicePayment, InvoiceView } from '@/lib/graphql/types';
import { formatUsd } from '@/lib/money';
import { useServices, useSession } from '@/lib/services';
import { t } from '@/lib/strings';
import { FooterButton, OpOutcome, Progress, usePayment, ViewOnlyNotice } from './flow';
import { FlowFrame, FlowHeading } from './flow-frame';
import { ScanIcon, ShieldIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { Protected } from './shell';
import { CopyField, DestinationList, Ledger, Skeleton, Status, Tracker } from './ui';
import { AssetPair, TokenLogo } from './providers';
import { useWallet } from './wallet-data';

const INVOICE_ID = /^[0-9a-f]{32}$/;

export function invoiceIdFrom(text: string): string | null {
  const s = text.trim();
  if (INVOICE_ID.test(s)) return s;
  const m = /\/pay\/([0-9a-f]{32})(?:[/?#]|$)/.exec(s);
  return m ? m[1]! : null;
}

export function PayHub() {
  const { state } = useWallet();
  const viewOnly = state.status === 'ready' && state.wallet.me.viewOnly;
  return (
    <div className="max-w-[760px]">
      <PageHeader title={t.pay.title} lead={t.pay.hubLead} />
      {viewOnly ? (
        <div className="mb-8">
          <ViewOnlyNotice />
        </div>
      ) : null}
      <DestinationList
        label={t.pay.hubLabel}
        items={[
          { href: '/pay/scan', title: t.pay.scanTitle, body: t.pay.scanBody, meta: t.pay.instant, disabled: viewOnly, mobileOnly: true },
          { href: '/pay/scan?paste=1', title: t.pay.pasteTitle, body: t.pay.pasteBody, disabled: viewOnly },
        ]}
      />
    </div>
  );
}

type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

export function ScanPay() {
  const router = useRouter();
  const params = useSearchParams();
  const pasteFirst = params.get('paste') === '1';
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<'idle' | 'starting' | 'live' | 'denied' | 'unsupported'>('idle');
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (pasteFirst) linkRef.current?.focus();
  }, [pasteFirst]);

  async function start() {
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCamera('unsupported');
      return;
    }
    setCamera('starting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      stream.current = s;
      setCamera('live');
      const v = video.current;
      if (!v) return;
      v.srcObject = s;
      await v.play();
      const detector = new Detector({ formats: ['qr_code'] });
      const loop = async () => {
        if (!stream.current) return;
        try {
          const codes = await detector.detect(v);
          for (const c of codes) {
            const id = invoiceIdFrom(c.rawValue);
            if (id) {
              stop();
              router.push(routes.invoice(id));
              return;
            }
          }
        } catch {
          return;
        }
        requestAnimationFrame(() => void loop());
      };
      void loop();
    } catch {
      stop();
      setCamera('denied');
    }
  }

  function submit() {
    const id = invoiceIdFrom(link);
    if (!id) {
      setLinkError(t.pay.invalid);
      return;
    }
    router.push(routes.invoice(id));
  }

  return (
    <FlowFrame title={t.pay.title} closeHref="/pay">
      <div className="lg:hidden">
        <FlowHeading title={t.pay.scanHeading} lead={t.pay.scanLead} />
      </div>
      <div className="hidden lg:block">
        <FlowHeading title={t.pay.pasteTitle} lead={t.pay.pasteBody} />
      </div>
      <div className="relative aspect-square w-full overflow-hidden rounded-[12px] bg-night lg:hidden">
        <video ref={video} playsInline muted className={`h-full w-full object-cover transition-opacity duration-500 ${camera === 'live' ? 'opacity-100' : 'opacity-0'}`} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[16%]">
          {['left-0 top-0 border-l-2 border-t-2', 'right-0 top-0 border-r-2 border-t-2', 'left-0 bottom-0 border-l-2 border-b-2', 'right-0 bottom-0 border-r-2 border-b-2'].map((c) => (
            <span key={c} className={`absolute h-10 w-10 border-white ${c}`} />
          ))}
                  </div>
        {camera !== 'live' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            {camera === 'starting' ? (
              <p className="flex items-center gap-2 text-[14px] text-white/80">
                <Spinner className="h-4 w-4" />
                {t.pay.cameraStarting}
              </p>
            ) : camera === 'denied' || camera === 'unsupported' ? (
              <p className="max-w-[18rem] text-[14px] leading-5 text-white/80">{camera === 'denied' ? t.pay.cameraDenied : t.pay.cameraUnsupported}</p>
            ) : (
              <button type="button" onClick={() => void start()} className="press inline-flex h-12 items-center gap-2 rounded-[10px] bg-white px-6 text-[15px] font-medium text-ink hover:bg-white/90">
                <ScanIcon className="h-5 w-5" />
                {t.pay.startCamera}
              </button>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => (stop(), setCamera('idle'))} className="press absolute bottom-4 left-1/2 inline-flex h-10 -translate-x-1/2 items-center rounded-[8px] bg-black/60 px-4 text-[13px] font-medium text-white backdrop-blur-[6px]">
            {t.pay.stopCamera}
          </button>
        )}
      </div>

      <div className="mt-10 lg:mt-0">
        <p className="mb-3 text-[15px] font-semibold text-ink lg:hidden">{t.pay.pasteHeading}</p>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex-1">
            <Field label={<span className="sr-only">{t.pay.linkLabel}</span>} error={linkError}>
              {({ inputId, describedBy, invalid }) => (
                <Input
                  ref={linkRef}
                  id={inputId}
                  value={link}
                  onChange={(e) => {
                    setLink(e.target.value);
                    setLinkError(null);
                  }}
                  placeholder={t.pay.linkPlaceholder}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  className="font-mono text-[14px]"
                />
              )}
            </Field>
          </div>
          <button type="submit" className="press h-[52px] shrink-0 rounded-[10px] bg-ink px-6 text-[15px] font-medium text-white hover:bg-ink-2 sm:mt-[26px]">
            {t.pay.find}
          </button>
        </form>
      </div>
    </FlowFrame>
  );
}

function useInvoice(invoiceId: string) {
  const { api } = useServices();
  const [state, setState] = useState<{ invoice: InvoiceView | null; error: unknown; loaded: boolean }>({ invoice: null, error: null, loaded: false });
  const load = useCallback(
    () =>
      api.request('Invoice', { invoiceId }).then(
        (r) => setState({ invoice: r.invoice, error: null, loaded: true }),
        (error: unknown) => setState({ invoice: null, error, loaded: true }),
      ),
    [api, invoiceId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function expiryOf(invoice: InvoiceView, now: number): { expired: boolean; left: string } {
  const ms = Number(BigInt(invoice.expiresAtNs) / 1_000_000n) - now;
  if (ms <= 0) return { expired: true, left: '0:00' };
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { expired: false, left: m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${s.toString().padStart(2, '0')}` };
}

function blockReason(invoice: InvoiceView, expired: boolean): string | null {
  if (invoice.status === 'PAID') return t.pay.paid;
  if (invoice.status === 'PAYING') return t.pay.paying;
  if (invoice.status === 'CANCELLED') return t.pay.cancelled;
  if (expired || invoice.status === 'EXPIRED') return t.pay.expired;
  return null;
}

function MerchantHeader({ invoice, left, expired }: { invoice: InvoiceView; left: string; expired: boolean }) {
  return (
    <div>
      <p className="eyebrow text-subtle">{t.pay.merchant}</p>
      <p className="mt-2 truncate text-[24px] font-semibold tracking-[-0.025em] text-ink">{invoice.merchantName}</p>
      <p className="mt-0.5 truncate font-mono text-[12.5px] text-muted">{invoice.merchantAccount}</p>
      <p className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-success">
        <ShieldIcon className="h-4 w-4" />
        {t.pay.verified}
      </p>
      <p className="eyebrow mt-9 text-subtle">{t.pay.amount}</p>
      <p className="tabular mt-2 text-[52px] font-semibold leading-none tracking-[-0.05em] text-ink sm:text-[60px]">{formatUsd(invoice.amount)}</p>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-muted">
        <TokenLogo token="USDC" size={16} />
        USDC on NEAR,{' '}
        <span className={expired ? 'text-danger' : 'tabular text-ink-2'}>{expired ? t.pay.expired : t.pay.expiresIn(left)}</span>
      </p>
    </div>
  );
}

function InvoiceSummary({ invoice }: { invoice: InvoiceView }) {
  const pct = `${(invoice.feeBps / 100).toFixed(invoice.feeBps % 100 ? 2 : 0)}%`;
  return (
    <Ledger
      rows={[
        { label: t.pay.merchant, value: invoice.merchantName },
        { label: t.pay.asset, value: 'USDC' },
        { label: t.pay.network, value: 'NEAR' },
        { label: t.pay.fee, value: t.pay.feeMerchant(pct) },
        { label: t.pay.reference, value: `${invoice.invoiceId.slice(0, 8)}...${invoice.invoiceId.slice(-6)}`, mono: true },
        { label: t.pay.youPay, value: formatUsd(invoice.amount), total: true },
      ]}
    />
  );
}

function PayInvoice({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const { api, payContract } = useServices();
  const { state } = useWallet();
  const { invoice, error, loaded, reload } = useInvoice(invoiceId);
  const pay = usePayment();
  const now = useNow();

  if (!loaded || state.status !== 'ready') {
    return (
      <FlowFrame title={t.pay.invoiceTitle} closeHref="/pay">
        <Skeleton rows={3} />
      </FlowFrame>
    );
  }
  if (!invoice) {
    return (
      <FlowFrame title={t.pay.invoiceTitle} closeHref="/pay">
        <Notice tone="danger">{error ? messageFor(error) : t.pay.notFound}</Notice>
      </FlowFrame>
    );
  }

  const { wallet } = state;
  const { expired, left } = expiryOf(invoice, now);
  const amount = BigInt(invoice.amount);
  const own = invoice.merchantAccount === wallet.me.accountId;
  const badToken = invoice.token !== wallet.account.usdcContract;
  const blocked = blockReason(invoice, expired) ?? (own ? t.pay.own : badToken ? t.pay.tokenMismatch : null);
  const { flow } = pay;

  if (flow.at === 'running') {
    return (
      <FlowFrame title={t.pay.invoiceTitle} closeHref="/home">
        <Progress phase={flow.phase} cosign={flow.cosign} title={t.pay.payingTitle(formatUsd(amount), invoice.merchantName)} />
        {pay.stepUpPanel ? <div className="mt-8">{pay.stepUpPanel}</div> : null}
      </FlowFrame>
    );
  }
  if (flow.at === 'done') {
    return (
      <FlowFrame title={t.pay.invoiceTitle} closeHref="/home">
        <OpOutcome outcome={flow.outcome} amount={amount} settledTitle={t.pay.paidTitle(invoice.merchantName)} onDone={() => router.push('/home')} rows={<InvoiceSummary invoice={invoice} />} />
      </FlowFrame>
    );
  }

  async function confirm() {
    if (!invoice || blocked) return;
    await pay.run(
      amount,
      () => api.request('PrepareInvoicePayment', { invoiceId: invoice.invoiceId }).then((r) => r.prepareInvoicePayment),
      () => ({ kind: 'PayInvoice', receiver: payContract, amount: invoice.amount, invoiceId: invoice.invoiceId, merchant: invoice.merchantAccount }),
    );
    void reload();
  }

  const footer = wallet.me.viewOnly ? null : (
    <FooterButton disabled={!!blocked || pay.stepUpActive} onClick={() => void confirm()}>
      {flow.at === 'error' ? t.ui.retry : t.pay.confirm(formatUsd(amount))}
    </FooterButton>
  );

  return (
    <FlowFrame title={t.pay.invoiceTitle} closeHref="/pay" footer={footer} wide>
      <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <MerchantHeader invoice={invoice} left={left} expired={expired} />
        <div>
          <InvoiceSummary invoice={invoice} />
          {pay.requiresCosign(amount) && !blocked ? <p className="mt-5 text-[14px] leading-5 text-ink-2">{t.pay.cosign}</p> : null}
        </div>
      </div>
      <div className="mt-8 flex flex-col gap-4">
        {wallet.me.viewOnly ? <ViewOnlyNotice /> : null}
        {blocked ? <Notice tone={invoice.status === 'PAID' ? 'success' : 'warning'}>{blocked}</Notice> : null}
        {flow.at === 'error' ? (
          <Notice tone="danger" live="assertive">
            {flow.message}
          </Notice>
        ) : null}
        {pay.stepUpPanel}
      </div>
    </FlowFrame>
  );
}

const PAYMENT_FLOW = ['AWAITING_DEPOSIT', 'DETECTED', 'CONVERTING', 'DELIVERED', 'COMPLETED'];

function PublicInvoice({ invoiceId }: { invoiceId: string }) {
  const { api } = useServices();
  const router = useRouter();
  const params = useSearchParams();
  const { invoice, error, loaded } = useInvoice(invoiceId);
  const now = useNow();
  const [options, setOptions] = useState<DepositOption[] | null>(null);
  const [origin, setOrigin] = useState('');
  const [refund, setRefund] = useState('');
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [payment, setPayment] = useState<InvoicePayment | null>(null);
  const paymentId = params.get('payment');

  useEffect(() => {
    if (!invoice?.crossChainEnabled) return;
    let alive = true;
    api.request('InvoicePayOptions').then(
      (r) => alive && setOptions(r.invoicePayOptions),
      () => alive && setOptions([]),
    );
    return () => {
      alive = false;
    };
  }, [api, invoice?.crossChainEnabled]);

  useEffect(() => {
    if (!paymentId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () =>
      api.request('InvoicePayment', { paymentId }).then(
        (r) => {
          if (!alive) return;
          setPayment(r.invoicePayment);
          if (r.invoicePayment && !['COMPLETED', 'REFUNDED', 'EXPIRED', 'FAILED'].includes(r.invoicePayment.status)) timer = setTimeout(load, 5000);
        },
        () => {
          if (alive) timer = setTimeout(load, 8000);
        },
      );
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [api, paymentId]);

  async function start() {
    if (!invoice || !origin || busy) return;
    setBusy(true);
    setStartError(null);
    try {
      const p = (await api.request('StartInvoicePayment', { input: { invoiceId: invoice.invoiceId, origin, refundAddress: refund.trim() } })).startInvoicePayment;
      setPayment(p);
      router.replace(routes.invoice(invoice.invoiceId, p.paymentId));
    } catch (err) {
      setStartError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  const head = (
    <header className="border-b border-hairline">
      <div className="mx-auto flex h-16 max-w-[1080px] items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Obiba">
          <Logo className="h-[20px] w-auto" />
        </Link>
        <p className="text-[13px] text-muted">{t.pay.poweredBy}</p>
      </div>
    </header>
  );

  if (!loaded) {
    return (
      <div className="min-h-dvh bg-surface">
        {head}
        <div className="mx-auto max-w-[1080px] px-5 py-12 sm:px-8">
          <Skeleton rows={3} />
        </div>
      </div>
    );
  }
  if (!invoice) {
    return (
      <div className="min-h-dvh bg-surface">
        {head}
        <div className="mx-auto max-w-[560px] px-5 py-16">
          <Notice tone="danger">{error ? messageFor(error) : t.pay.notFound}</Notice>
        </div>
      </div>
    );
  }

  const { expired, left } = expiryOf(invoice, now);
  const blocked = blockReason(invoice, expired);
  const at = payment ? PAYMENT_FLOW.indexOf(payment.status) : -1;
  const problem = payment ? t.pay.problems[payment.status] : undefined;

  return (
    <div className="min-h-dvh bg-canvas">
      {head}
      <main className="mx-auto grid max-w-[1080px] gap-10 px-5 py-10 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:py-16">
        <section className="animate-step">
          <MerchantHeader invoice={invoice} left={left} expired={expired} />
          <div className="mt-10 max-w-[380px]">
            <InvoiceSummary invoice={invoice} />
          </div>
        </section>
        <section className="animate-step rounded-[12px] border border-line bg-surface p-6 sm:p-8">
          {blocked ? (
            <Notice tone={invoice.status === 'PAID' ? 'success' : 'warning'}>{blocked}</Notice>
          ) : payment ? (
            <>
              <p className="text-[17px] font-semibold text-ink">{t.pay.trackTitle}</p>
              {payment.status === 'AWAITING_DEPOSIT' ? (
                <div className="mt-5">
                  <div className="mx-auto mb-5 aspect-square w-full max-w-[200px] [&>svg]:h-full [&>svg]:w-full">
                    <QrCode value={payment.depositAddress} label={t.pay.toAddress} size={200} />
                  </div>
                  <div className="border-y border-hairline">
                    <CopyField label={t.pay.sendExactly} value={payment.amountIn} mono={false} display={`${payment.amountIn} ${payment.origin}`} />
                    <CopyField label={t.pay.toAddress} value={payment.depositAddress} />
                    {payment.depositMemo ? <CopyField label={t.crypto.memo} value={payment.depositMemo} /> : null}
                  </div>
                </div>
              ) : null}
              <div className="mt-7">
                <Tracker steps={PAYMENT_FLOW.map((k) => ({ key: k, label: t.pay.states[k]! }))} at={Math.max(0, at)} failed={!!problem} failedLabel={problem} />
              </div>
              <div className="mt-5">
                <Status status={payment.status} />
              </div>
            </>
          ) : (
            <>
              <p className="text-[17px] font-semibold text-ink">{t.pay.payWithObiba}</p>
              <p className="mt-1 text-[14px] leading-5 text-muted">{t.pay.payWithObibaBody}</p>
              <Link href={`/sign-in?next=${encodeURIComponent(routes.invoice(invoice.invoiceId))}`} className="press mt-5 inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-action text-[15px] font-medium text-white shadow-button hover:bg-action-hover">
                {t.pay.signIn}
              </Link>
              <div className="my-7 flex items-center gap-3 text-[12px] font-medium text-subtle">
                <span className="h-px flex-1 bg-hairline" />
                {t.google.or}
                <span className="h-px flex-1 bg-hairline" />
              </div>
              <p className="text-[17px] font-semibold text-ink">{t.pay.payFromChain}</p>
              {!invoice.crossChainEnabled || (options && options.length === 0) ? (
                <p className="mt-2 text-[14px] leading-5 text-muted">{t.pay.crossNone}</p>
              ) : !options ? (
                <div className="mt-4">
                  <Skeleton rows={2} />
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-4">
                  <div role="radiogroup" aria-label={t.pay.chooseSource} className="flex flex-col gap-2">
                    {options.map((o) => (
                      <button key={o.key} type="button" role="radio" aria-checked={origin === o.key} onClick={() => setOrigin(o.key)} className={`press flex items-center gap-3 rounded-[10px] border px-4 py-3 text-left text-[14.5px] font-medium ${origin === o.key ? 'border-brand bg-brand-faint text-ink' : 'border-field text-ink-2 hover:border-ink/25'}`}>
                        <AssetPair label={`${o.key} ${o.label}`} size={24} />
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <Field label={t.pay.refund} hint={t.pay.refundHint}>
                    {({ inputId, describedBy }) => <Input id={inputId} value={refund} onChange={(e) => setRefund(e.target.value.trim())} aria-describedby={describedBy} className="font-mono text-[14px]" autoComplete="off" spellCheck={false} />}
                  </Field>
                  {startError ? <Notice tone="danger">{startError}</Notice> : null}
                  <FooterButton disabled={!origin || refund.length < 20} loading={busy} onClick={() => void start()}>
                    {t.pay.getAddress}
                  </FooterButton>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export function InvoicePage({ invoiceId }: { invoiceId: string }) {
  const session = useSession();
  if (!INVOICE_ID.test(invoiceId)) {
    return (
      <div className="mx-auto max-w-[560px] px-5 py-16">
        <Notice tone="danger">{t.pay.invalid}</Notice>
      </div>
    );
  }
  if (session.status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted" role="status">
        <Spinner />
      </div>
    );
  }
  if (session.status === 'signed-out') return <PublicInvoice invoiceId={invoiceId} />;
  return (
    <Protected>
      <PayInvoice invoiceId={invoiceId} />
    </Protected>
  );
}

export function InvoiceRoute() {
  return <InvoicePage invoiceId={useQueryId()} />;
}
