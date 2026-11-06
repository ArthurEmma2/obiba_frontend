'use client';

import { withBase } from '@/lib/base-path';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Field, Input } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { isApiError, messageFor } from '@/lib/errors';
import type { Recipient } from '@/lib/graphql/types';
import { formatUsd, unitsToInput } from '@/lib/money';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { AmountField, checkAmount, FooterButton, OpOutcome, Progress, usePayment, ViewOnlyNotice } from './flow';
import { FlowFrame, FlowHeading } from './flow-frame';
import { shortAccount } from './format';
import { PageHeader } from './page-header';
import { Flag, NetworkLogo, ProviderLogos, TokenLogo } from './providers';
import { DestinationList, Ledger } from './ui';
import { realBalance, useWallet } from './wallet-data';

export function SendHub() {
  const { state } = useWallet();
  const viewOnly = state.status === 'ready' && state.wallet.me.viewOnly;
  return (
    <div className="max-w-[760px]">
      <PageHeader title={t.send.title} lead={t.send.hubLead} />
      {viewOnly ? (
        <div className="mb-8">
          <ViewOnlyNotice />
        </div>
      ) : null}
      <DestinationList
        label={t.send.hubLabel}
        items={[
          { href: '/send/obiba', logos: <img src={withBase('/logos/obiba-mark.png')} alt="" aria-hidden="true" width={29} height={29} className="h-[29px] w-[29px] shrink-0" />, title: t.send.toObiba, body: t.send.toObibaBody, meta: t.send.toObibaMeta, disabled: viewOnly },
          { href: '/send/external', logos: <span className="flex items-center gap-1.5"><Flag country="GH" size={29} /><ProviderLogos ids={['MTN', 'TELECEL']} size={29} /></span>, title: t.remit.hubTitle, body: t.remit.hubBody, disabled: viewOnly },
          { href: '/send/near', logos: <NetworkLogo network="near" size={29} />, title: t.send.toNear, body: t.send.toNearBody, meta: t.send.toNearMeta, disabled: viewOnly },
        ]}
      />
      <div className="mt-8 text-[14px]">
        <Link href="/withdraw" className="font-medium text-brand-ink underline-offset-4 hover:underline">
          {t.send.otherChainShort}
        </Link>
      </div>
    </div>
  );
}

type Lookup = { status: 'idle' } | { status: 'searching' } | { status: 'found'; recipient: Recipient } | { status: 'none' } | { status: 'error'; message: string };

function useRecipient(query: string): Lookup {
  const { api } = useServices();
  const [result, setResult] = useState<{ query: string; lookup: Lookup }>({ query: '', lookup: { status: 'idle' } });
  const q = query.trim();

  useEffect(() => {
    if (q.length < 3) return;
    let alive = true;
    const id = setTimeout(() => {
      api.request('Recipient', { query: q }).then(
        (r) => {
          if (alive) setResult({ query: q, lookup: r.recipient ? { status: 'found', recipient: r.recipient } : { status: 'none' } });
        },
        (err: unknown) => {
          if (!alive) return;
          setResult({ query: q, lookup: isApiError(err, 'BAD_INPUT') ? { status: 'none' } : { status: 'error', message: messageFor(err) } });
        },
      );
    }, 350);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [api, q]);

  if (q.length < 3) return { status: 'idle' };
  return result.query === q ? result.lookup : { status: 'searching' };
}

function RecipientCard({ recipient, selected, onPick }: { recipient: Recipient; selected?: boolean; onPick?: () => void }) {
  const name = recipient.displayName ?? shortAccount(recipient.accountId);
  const body = (
    <>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[15px] font-semibold text-ink">
          {name}
          {recipient.handle ? <span className="ml-2 font-normal text-muted">@{recipient.handle}</span> : null}
        </span>
        <span className="block truncate font-mono text-[12.5px] text-muted">{recipient.accountId}</span>
      </span>
      <span className="eyebrow shrink-0 text-subtle">{recipient.kind === 'OBIBA' ? t.send.obiba : t.send.near}</span>
    </>
  );
  if (!onPick) return <div className="flex items-center gap-3.5 border-y border-hairline py-3.5 animate-pop">{body}</div>;
  return (
    <button type="button" onClick={onPick} aria-pressed={selected} className={`press flex w-full items-center gap-3.5 rounded-[10px] border px-4 py-3.5 transition-colors duration-200 ${selected ? 'border-brand bg-brand-faint' : 'border-line hover:border-ink/25'}`}>
      {body}
    </button>
  );
}

export function SendFlow({ mode }: { mode: 'obiba' | 'near' }) {
  const router = useRouter();
  const { api, payContract } = useServices();
  const { state } = useWallet();
  const pay = usePayment();
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Recipient | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [draft, setDraft] = useState<{ to: Recipient; units: bigint } | null>(null);
  const lookup = useRecipient(picked ? '' : query);

  const recent = useMemo(() => {
    if (state.status !== 'ready') return [];
    const seen = new Map<string, Recipient>();
    for (const a of state.wallet.activity) {
      if (a.direction !== 'OUT' || !a.counterparty || a.counterparty === payContract || seen.has(a.counterparty)) continue;
      const obiba = a.counterparty.endsWith(`.${payContract.split('.').slice(1).join('.')}`) || !!a.counterpartyName;
      if ((mode === 'obiba') !== obiba) continue;
      seen.set(a.counterparty, { kind: obiba ? 'OBIBA' : 'NEAR', accountId: a.counterparty, displayName: a.counterpartyName, handle: null, canReceive: true });
    }
    return [...seen.values()].slice(0, 4);
  }, [state, payContract, mode]);

  const title = mode === 'obiba' ? t.send.flowObiba : t.send.flowNear;

  if (state.status !== 'ready') {
    return (
      <FlowFrame title={title} closeHref="/send">
        <div className="h-40 animate-pulse rounded-[16px] bg-wash" />
      </FlowFrame>
    );
  }
  const { wallet, limit } = state;
  if (wallet.me.viewOnly) {
    return (
      <FlowFrame title={title} closeHref="/send">
        <ViewOnlyNotice />
      </FlowFrame>
    );
  }

  const usdc = realBalance(wallet);
  const available = BigInt(usdc.available);
  const maxOp = limit ? BigInt(limit.maxOpAmount) : null;
  const amount = checkAmount(amountInput, available, maxOp);
  const me = wallet.me;
  const q = query.trim().toLowerCase();
  const typedSelf = q !== '' && (q === me.accountId || (me.handle !== null && (q === me.handle || q === `@${me.handle}`)));
  const found = picked ?? (lookup.status === 'found' ? lookup.recipient : null);
  const wrongKind = mode === 'obiba' && found?.kind === 'NEAR';
  const recipientProblem = typedSelf ? t.send.self : found && found.accountId === me.accountId ? t.send.self : wrongKind ? t.send.notObiba : found && !found.canReceive ? t.send.cannotReceive : null;
  const sendable = found && !recipientProblem ? found : null;
  const { flow } = pay;

  if (flow.at === 'running' && draft) {
    const name = draft.to.displayName ?? shortAccount(draft.to.accountId);
    return (
      <FlowFrame title={title} closeHref="/home">
        <Progress phase={flow.phase} cosign={flow.cosign} title={t.send.sendingTitle(formatUsd(draft.units), name)} />
        {pay.stepUpPanel ? <div className="mt-8">{pay.stepUpPanel}</div> : null}
      </FlowFrame>
    );
  }

  if (flow.at === 'done' && draft) {
    const name = draft.to.displayName ?? shortAccount(draft.to.accountId);
    return (
      <FlowFrame title={title} closeHref="/home">
        <OpOutcome
          outcome={flow.outcome}
          amount={draft.units}
          settledTitle={t.send.sent(formatUsd(draft.units), name)}
          onDone={() => router.push('/home')}
          rows={<Ledger rows={[{ label: t.send.to, value: draft.to.accountId, mono: true }, { label: t.send.network, value: 'NEAR' }, { label: t.withdraw.fee, value: t.flow.feeNone }]} />}
        />
      </FlowFrame>
    );
  }

  async function confirm() {
    if (!draft) return;
    const { to, units } = draft;
    await pay.run(
      units,
      () => api.request('PrepareTransfer', { input: { amount: unitsToInput(units), toAccount: to.accountId } }).then((r) => r.prepareTransfer),
      () => ({ kind: 'Transfer', receiver: to.accountId, amount: units.toString() }),
    );
  }

  const back = step > 0 ? () => (pay.reset(), setStep((s) => s - 1)) : undefined;
  const footer =
    step === 0 ? (
      <FooterButton disabled={!sendable} onClick={() => sendable && (setPicked(sendable), setStep(1))}>
        {t.flow.continue}
      </FooterButton>
    ) : step === 1 ? (
      <>
        <FooterButton variant="secondary" onClick={() => setStep(0)}>
          {t.ui.back}
        </FooterButton>
        <FooterButton disabled={amount.units === null} onClick={() => sendable && amount.units !== null && (setDraft({ to: sendable, units: amount.units }), setStep(2))}>
          {t.flow.continue}
        </FooterButton>
      </>
    ) : draft ? (
      <>
        <FooterButton variant="secondary" onClick={() => (pay.reset(), setStep(1))}>
          {t.ui.back}
        </FooterButton>
        <FooterButton disabled={pay.stepUpActive} onClick={() => void confirm()}>
          {flow.at === 'error' ? t.ui.retry : t.send.confirm(formatUsd(draft.units))}
        </FooterButton>
      </>
    ) : null;

  return (
    <FlowFrame title={title} steps={t.send.steps as unknown as string[]} step={step} closeHref="/send" onBack={back} footer={footer}>
      {step === 0 ? (
        <>
          <FlowHeading title={mode === 'obiba' ? t.send.whoTitle : t.send.whoNearTitle} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (sendable) {
                setPicked(sendable);
                setStep(1);
              }
            }}
          >
            <Field label={t.send.recipientLabel} hint={mode === 'obiba' ? t.send.recipientHint : t.send.nearHint}>
              {({ inputId, describedBy }) => (
                <Input
                  id={inputId}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPicked(null);
                  }}
                  placeholder={mode === 'obiba' ? t.send.recipientPlaceholder : t.send.nearPlaceholder}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  aria-describedby={describedBy}
                  className={mode === 'near' ? 'font-mono text-[15px]' : ''}
                />
              )}
            </Field>
          </form>
          <div className="mt-5 min-h-[5rem]" aria-live="polite">
            {picked ? (
              <RecipientCard recipient={picked} />
            ) : lookup.status === 'searching' ? (
              <p className="flex items-center gap-2 text-[14px] text-muted">
                <Spinner className="h-4 w-4" />
                {t.send.searching}
              </p>
            ) : typedSelf ? (
              <p className="text-[14px] text-danger">{t.send.self}</p>
            ) : lookup.status === 'none' ? (
              <p className="text-[14px] text-muted">{t.send.notFound}</p>
            ) : lookup.status === 'error' ? (
              <p className="text-[14px] text-danger">{lookup.message}</p>
            ) : found ? (
              <>
                <RecipientCard recipient={found} onPick={sendable ? () => (setPicked(sendable), setStep(1)) : undefined} />
                {recipientProblem ? <p className="mt-2.5 text-[14px] text-danger">{recipientProblem}</p> : null}
              </>
            ) : recent.length ? (
              <div>
                <p className="eyebrow mb-2 text-subtle">{t.send.recent}</p>
                <div className="flex flex-col gap-2">
                  {recent.map((r) => (
                    <RecipientCard key={r.accountId} recipient={r} onPick={() => (setPicked(r), setQuery(r.accountId), setStep(1))} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : step === 1 && sendable ? (
        <>
          <FlowHeading title={t.send.amountTitle} />
          <div className="mb-7">
            <RecipientCard recipient={sendable} />
          </div>
          <AmountField
            value={amountInput}
            onChange={setAmountInput}
            error={amount.error}
            availableLabel={t.flow.available(formatUsd(usdc.available))}
            onMax={() => setAmountInput(unitsToInput(maxOp !== null && maxOp < available ? maxOp : available))}
            autoFocus
          />
          <p className="mt-3 text-[13.5px] text-muted">{t.send.feeLine}</p>
          {amount.units !== null && pay.requiresCosign(amount.units) ? <p className="mt-3 text-[14px] leading-5 text-ink-2">{t.send.cosign}</p> : null}
        </>
      ) : step === 2 && draft ? (
        <>
          <p className="eyebrow text-brand-ink">{t.send.reviewTitle}</p>
          <p className="tabular mt-3 text-[48px] font-semibold leading-none tracking-[-0.05em] text-ink sm:text-[56px]">{formatUsd(draft.units)}</p>
          <div className="mt-8">
            <RecipientCard recipient={draft.to} />
          </div>
          <Ledger
            className="mt-6"
            rows={[
              { label: t.flow.amount, value: formatUsd(draft.units), strong: true },
              { label: t.withdraw.fee, value: t.flow.feeNone },
              { label: t.send.network, value: 'NEAR' },
              { label: t.send.total, value: formatUsd(draft.units), total: true },
            ]}
          />
          {pay.requiresCosign(draft.units) ? <p className="mt-5 text-[14px] leading-5 text-ink-2">{t.send.cosign}</p> : null}
          {flow.at === 'error' ? (
            <div className="mt-6">
              <Notice tone="danger" live="assertive">
                {flow.message}
              </Notice>
            </div>
          ) : null}
          {pay.stepUpPanel ? <div className="mt-6">{pay.stepUpPanel}</div> : null}
        </>
      ) : null}
    </FlowFrame>
  );
}
