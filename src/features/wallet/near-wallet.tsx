'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { InjectedWallet, ModuleState, Wallet as NearWallet, WalletSelector } from '@near-wallet-selector/core';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { webConfig } from '@/lib/config';
import { formatUsd, parseAmount, unitsToInput } from '@/lib/money';
import { useServices } from '@/lib/services';
import { t } from '@/lib/strings';
import { AmountField, buttonStyles, FooterButton, ResultView, ViewOnlyNotice } from './flow';
import { FlowFrame, FlowHeading } from './flow-frame';
import { TokenLogo } from './providers';
import { ChevronIcon } from './nav-icons';
import { Ledger, Skeleton, Tracker } from './ui';
import { realBalance, useWallet } from './wallet-data';

const FT_TRANSFER_GAS = 30_000_000_000_000n;
const CREDIT_TIMEOUT_MS = 180_000;

type Phase = 'idle' | 'connecting' | 'connected' | 'signing' | 'submitted' | 'unconfirmed';

interface WalletOption {
  id: string;
  name: string;
  icon: string;
  available: boolean;
}

const WALLET_NAMES: Record<string, string> = { 'meteor-wallet': 'Meteor', 'here-wallet': 'HERE', 'intear-wallet': 'Intear', sender: 'Sender' };

function optionOf(m: ModuleState): WalletOption {
  return { id: m.id, name: WALLET_NAMES[m.id] ?? m.metadata.name, icon: m.metadata.iconUrl, available: m.metadata.available };
}

async function viewBalance(rpc: string, token: string, account: string): Promise<bigint | null> {
  try {
    const args = btoa(JSON.stringify({ account_id: account }));
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'obiba', method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: token, method_name: 'ft_balance_of', args_base64: args } }),
    });
    const body = (await res.json()) as { result?: { result?: number[] } };
    const bytes = body.result?.result;
    if (!bytes) return null;
    const text = JSON.parse(String.fromCharCode(...bytes)) as unknown;
    return typeof text === 'string' && /^\d+$/.test(text) ? BigInt(text) : null;
  } catch {
    return null;
  }
}

export function NearWalletDeposit() {
  const router = useRouter();
  const { networkId } = useServices();
  const { state, refresh } = useWallet();
  const selector = useRef<WalletSelector | null>(null);
  const wallet = useRef<NearWallet | null>(null);
  const attempt = useRef(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [ready, setReady] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [options, setOptions] = useState<WalletOption[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [active, setActive] = useState<WalletOption | null>(null);
  const [external, setExternal] = useState<bigint | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<bigint | null>(null);
  const [sent, setSent] = useState<bigint | null>(null);
  const supported = networkId === 'mainnet' || networkId === 'testnet';
  const rpc = supported ? webConfig().nearRpcUrl : null;
  const token = state.status === 'ready' ? state.wallet.account.usdcContract : null;
  const posted = state.status === 'ready' ? BigInt(realBalance(state.wallet).posted) : null;

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    void (async () => {
      const [{ setupWalletSelector }, { setupMeteorWallet }, { setupHereWallet }, { setupIntearWallet }, { setupSender }] = await Promise.all([
        import('@near-wallet-selector/core'),
        import('@near-wallet-selector/meteor-wallet'),
        import('@near-wallet-selector/here-wallet'),
        import('@near-wallet-selector/intear-wallet'),
        import('@near-wallet-selector/sender'),
      ]);
      const network = networkId as 'mainnet' | 'testnet';
      const s = await setupWalletSelector({
        network,
        modules: [setupMeteorWallet(), setupHereWallet({ walletOptions: { networkId: network, ...(rpc ? { nodeUrl: rpc } : {}) } }), setupIntearWallet(), setupSender()],
        ...(rpc ? { fallbackRpcUrls: [rpc] } : {}),
      });
      if (!alive) return;
      selector.current = s;
      const state = s.store.getState();
      setOptions(state.modules.map(optionOf));
      setReady(true);
      if (s.isSignedIn() && state.accounts[0] && state.selectedWalletId) {
        wallet.current = await s.wallet();
        if (!alive) return;
        const m = state.modules.find((x) => x.id === state.selectedWalletId);
        setActive(m ? optionOf(m) : null);
        setFrom(state.accounts[0].accountId);
        setPhase('connected');
      }
    })().catch(() => alive && setError(t.nearWallet.loadFailed));
    return () => {
      alive = false;
    };
  }, [supported, networkId, rpc]);

  useEffect(() => {
    if (!from || !token || !rpc) return;
    let alive = true;
    void viewBalance(rpc, token, from).then((b) => alive && setExternal(b));
    return () => {
      alive = false;
    };
  }, [from, token, rpc, phase]);

  const credited = phase === 'submitted' && baseline !== null && sent !== null && posted !== null && posted >= baseline + sent;

  useEffect(() => {
    if (phase !== 'submitted' || credited) return;
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > CREDIT_TIMEOUT_MS) {
        clearInterval(id);
        setPhase('unconfirmed');
        return;
      }
      void refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [phase, credited, refresh]);

  async function connect(option: WalletOption) {
    if (!selector.current || !option.available) return;
    const mine = ++attempt.current;
    setError(null);
    setPending(option.id);
    setPhase('connecting');
    try {
      const w = await selector.current.wallet<InjectedWallet>(option.id);
      const accounts = await w.signIn({ contractId: token ?? '', methodNames: [] });
      if (mine !== attempt.current) return;
      wallet.current = w;
      const id = accounts[0]?.accountId ?? selector.current.store.getState().accounts[0]?.accountId ?? null;
      if (!id) throw new Error('no account');
      setActive(option);
      setFrom(id);
      setPhase('connected');
    } catch {
      if (mine !== attempt.current) return;
      setPhase('idle');
      setError(t.nearWallet.connectFailed);
    } finally {
      if (mine === attempt.current) setPending(null);
    }
  }

  async function disconnect() {
    await wallet.current?.signOut().catch(() => undefined);
    wallet.current = null;
    setActive(null);
    setFrom(null);
    setExternal(null);
    setPhase('idle');
  }

  if (state.status !== 'ready') {
    return (
      <FlowFrame title={t.nearWallet.title} closeHref="/add">
        <Skeleton rows={3} />
      </FlowFrame>
    );
  }
  const me = state.wallet.me;
  if (me.viewOnly) {
    return (
      <FlowFrame title={t.nearWallet.title} closeHref="/add">
        <ViewOnlyNotice />
      </FlowFrame>
    );
  }
  if (!supported) {
    return (
      <FlowFrame title={t.nearWallet.title} closeHref="/add">
        <FlowHeading title={t.nearWallet.heading} lead={t.nearWallet.lead} />
        <Notice tone="info" title={t.nearWallet.unavailableTitle}>
          {t.nearWallet.unavailableBody}
        </Notice>
        <Link href="/receive" className={`${buttonStyles.secondary} mt-6`}>
          {t.nearWallet.useAddress}
        </Link>
      </FlowFrame>
    );
  }

  const units = parseAmount(amountInput);
  const amountError = amountInput.trim() === '' ? null : units === null || units <= 0n ? t.flow.amountInvalid : external !== null && units > external ? t.nearWallet.notEnough : null;

  async function deposit() {
    if (!wallet.current || !from || !token || !me.accountId || units === null || units <= 0n || amountError || posted === null) return;
    setError(null);
    setPhase('signing');
    try {
      const { actionCreators } = await import('@near-wallet-selector/core');
      const outcome = await wallet.current.signAndSendTransaction({
        signerId: from,
        receiverId: token,
        actions: [actionCreators.functionCall('ft_transfer', { receiver_id: me.accountId, amount: units.toString(), memo: 'Obiba deposit' }, FT_TRANSFER_GAS, 1n)],
      });
      const hash = (outcome as { transaction?: { hash?: string } } | undefined)?.transaction?.hash ?? null;
      setTxHash(hash);
      setBaseline(posted);
      setSent(units);
      setPhase('submitted');
      void refresh();
    } catch {
      setPhase('connected');
      setError(t.nearWallet.rejected);
    }
  }

  if (credited && sent !== null) {
    return (
      <FlowFrame title={t.nearWallet.title} closeHref="/home">
        <ResultView
          tone="success"
          eyebrow={t.nearWallet.creditedEyebrow}
          title={t.nearWallet.credited(formatUsd(sent))}
          amount={<p className="tabular text-[40px] font-semibold leading-none tracking-[-0.045em] text-ink">{formatUsd(sent)}</p>}
          actions={
            <button type="button" onClick={() => router.push('/home')} className={buttonStyles.primary}>
              {t.flow.done}
            </button>
          }
        >
          <Ledger rows={[{ label: t.nearWallet.from, value: from ?? '', mono: true }, { label: t.nearWallet.to, value: me.accountId ?? '', mono: true }, ...(txHash ? [{ label: t.activity.reference, value: txHash, mono: true }] : [])]} />
        </ResultView>
      </FlowFrame>
    );
  }

  if ((phase === 'submitted' || phase === 'unconfirmed') && sent !== null) {
    return (
      <FlowFrame title={t.nearWallet.title} closeHref="/home">
        <FlowHeading title={t.nearWallet.trackTitle(formatUsd(sent))} />
        <Tracker
          steps={[
            { key: 'signed', label: t.nearWallet.stepSigned, detail: txHash ? <span className="break-all font-mono text-[12.5px]">{txHash}</span> : undefined },
            { key: 'final', label: t.nearWallet.stepFinal },
            { key: 'credited', label: t.nearWallet.stepCredited },
          ]}
          at={1}
          failed={phase === 'unconfirmed'}
          failedLabel={t.nearWallet.slow}
        />
        <p className="mt-6 text-[13.5px] leading-5 text-muted">{t.nearWallet.trackNote}</p>
      </FlowFrame>
    );
  }

  const footer =
    phase === 'connected' || phase === 'signing' ? (
      <FooterButton disabled={units === null || units <= 0n || !!amountError} loading={phase === 'signing'} onClick={() => void deposit()}>
        {units && !amountError ? t.nearWallet.confirm(formatUsd(units)) : t.nearWallet.deposit}
      </FooterButton>
    ) : undefined;

  return (
    <FlowFrame title={t.nearWallet.title} closeHref="/add" footer={footer}>
      <FlowHeading title={t.nearWallet.heading} lead={t.nearWallet.lead} />
      {from ? (
        <div className="flex flex-col gap-7">
          <div className="flex items-center justify-between gap-4 border-y border-hairline py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              {active ? <img src={active.icon} alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" /> : null}
              <div className="min-w-0">
                <p className="text-[13px] text-muted">{active ? t.nearWallet.connectedWith(active.name) : t.nearWallet.connected}</p>
                <p className="truncate font-mono text-[14px] text-ink">{from}</p>
              </div>
            </div>
            <button type="button" onClick={() => void disconnect()} className="press shrink-0 rounded-[6px] text-[14px] font-medium text-brand-ink underline-offset-4 hover:underline">
              {t.nearWallet.disconnect}
            </button>
          </div>
          <AmountField
            value={amountInput}
            onChange={setAmountInput}
            error={amountError}
            availableLabel={external !== null ? t.nearWallet.walletHas(formatUsd(external)) : undefined}
            onMax={external !== null && external > 0n ? () => setAmountInput(unitsToInput(external)) : undefined}
            autoFocus
          />
          <Ledger
            rows={[
              { label: t.nearWallet.to, value: me.accountId ?? '', mono: true },
              { label: t.receive2.asset, value: <span className="inline-flex items-center gap-2"><TokenLogo token="USDC" size={18} />USDC</span> },
              { label: t.nearWallet.networkFee, value: t.nearWallet.networkFeeValue },
            ]}
          />
        </div>
      ) : (
        <section aria-labelledby="wallet-choice">
          <h2 id="wallet-choice" className="eyebrow text-muted">
            {t.nearWallet.choose}
          </h2>
          {!ready ? (
            <div className="mt-3">
              <Skeleton rows={3} />
            </div>
          ) : (
            <ul className="mt-3 border-t border-hairline">
              {options.map((o) => (
                <li key={o.id} className={`border-b border-hairline ${o.available ? '' : 'max-sm:hidden'}`}>
                  <button
                    type="button"
                    disabled={!o.available || pending === o.id}
                    onClick={() => void connect(o)}
                    className="group -mx-4 flex w-[calc(100%+2rem)] items-center gap-4 rounded-[10px] px-4 py-4 text-left outline-none transition-colors duration-200 hover:bg-canvas focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <img src={o.icon} alt="" width={32} height={32} className={`h-8 w-8 shrink-0 object-contain ${o.available ? '' : 'opacity-50 grayscale'}`} />
                    <span className={`min-w-0 flex-1 text-[16px] font-semibold tracking-[-0.01em] ${o.available ? 'text-ink' : 'text-muted'}`}>{o.name}</span>
                    {pending === o.id ? (
                      <Spinner className="h-4 w-4 text-brand" />
                    ) : o.available ? (
                      <ChevronIcon className="h-[18px] w-[18px] shrink-0 text-subtle transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1 group-hover:text-ink" />
                    ) : (
                      <span className="shrink-0 text-[13px] text-muted">{t.nearWallet.notInstalled}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-[13.5px] leading-5 text-muted">{t.nearWallet.keysNote}</p>
        </section>
      )}
      {error ? (
        <div className="mt-6">
          <Notice tone="danger" live="assertive">
            {error}
          </Notice>
        </div>
      ) : null}
    </FlowFrame>
  );
}
