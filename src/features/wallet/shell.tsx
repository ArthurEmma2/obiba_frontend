'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { Logo } from '@/components/ui/logo';
import { Spinner } from '@/components/ui/spinner';
import { splitPesewas, splitUnits, toPesewas, CEDI } from '@/lib/money';
import { useServices, useSession } from '@/lib/services';
import { t } from '@/lib/strings';
import { linkedDevice } from '../onboarding/derive';
import { useOnboardingFacts } from '../onboarding/use-onboarding-facts';
import { AccountScope } from '../session/account-scope';
import {
  ActivityIcon,
  AddIcon,
  BellIcon,
  CashOutIcon,
  CloseIcon,
  MoreIcon,
  OverviewIcon,
  PayIcon,
  RequestsIcon,
  ScanIcon,
  SendIcon,
  ServicesIcon,
  SettingsIcon,
  WithdrawIcon,
} from './nav-icons';
import { realBalance, useDisplayCurrency, useWallet, WalletProvider } from './wallet-data';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type NavItem = { href: string; label: string; icon: Icon; money?: boolean; match?: string[] };
type NavGroup = { label: string | null; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { label: null, items: [{ href: '/home', label: t.wallet.nav.overview, icon: OverviewIcon }] },
  {
    label: t.wallet.groups.money,
    items: [
      { href: '/add', label: t.wallet.nav.add, icon: AddIcon, match: ['/receive'] },
      { href: '/send', label: t.wallet.nav.send, icon: SendIcon, money: true },
      { href: '/pay', label: t.wallet.nav.pay, icon: PayIcon, money: true },
      { href: '/withdraw', label: t.wallet.nav.withdraw, icon: WithdrawIcon, money: true },
      { href: '/cash-out', label: t.wallet.nav.cashOut, icon: CashOutIcon, money: true },
    ],
  },
  { label: t.wallet.groups.everyday, items: [{ href: '/services', label: t.wallet.nav.services, icon: ServicesIcon, money: true }] },
  {
    label: t.wallet.groups.records,
    items: [
      { href: '/activity', label: t.wallet.nav.activity, icon: ActivityIcon },
      { href: '/requests', label: t.wallet.nav.requests, icon: RequestsIcon },
      { href: '/notifications', label: t.wallet.nav.notifications, icon: BellIcon },
    ],
  },
];
const SETTINGS: NavItem = { href: '/settings', label: t.wallet.nav.settings, icon: SettingsIcon };
const ALL: NavItem[] = [...GROUPS.flatMap((g) => g.items), SETTINGS];

function isActive(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.match ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}

export function sectionTitle(pathname: string): string {
  return ALL.find((i) => isActive(pathname, i))?.label ?? t.wallet.nav.overview;
}

const SecuredContext = createContext<boolean>(false);
const UnreadContext = createContext<number>(0);

export function useSecured(): boolean {
  return useContext(SecuredContext);
}

function useUnreadSource(): number {
  const { api } = useServices();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    api.request('Notifications', { first: 50 }).then(
      (r) => {
        if (alive) setCount(r.notifications.filter((n) => !n.read).length);
      },
      () => undefined,
    );
    const off = api.subscribe('AccountEvents', () => {
      api.request('Notifications', { first: 50 }).then(
        (r) => {
          if (alive) setCount(r.notifications.filter((n) => !n.read).length);
        },
        () => undefined,
      );
    });
    return () => {
      alive = false;
      off();
    };
  }, [api, pathname]);
  return count;
}

function NavLink({ item, pathname, viewOnly, badge, onNavigate }: { item: NavItem; pathname: string; viewOnly: boolean; badge?: number; onNavigate?: () => void }) {
  const on = isActive(pathname, item);
  const muted = viewOnly && item.money;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={on ? 'page' : undefined}
      className={`group relative flex h-[38px] items-center gap-3 rounded-[8px] pl-3 pr-2.5 text-[14.5px] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand/70 ${
        on ? 'bg-white font-semibold text-brand-ink' : muted ? 'text-brand-night/30 hover:text-brand-night/45' : 'text-brand-night/80 hover:bg-white/60 hover:text-brand-night'
      }`}
    >
      <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${on ? 'text-brand' : ''}`} />
      <span className="flex-1">{item.label}</span>
      {badge ? (
        <span className="tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11.5px] font-semibold leading-none text-white" aria-label={t.wallet.unread(badge)}>
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function useBalanceDisplay(): { currency: 'USDC' | 'GHS'; whole: string; fraction: string; symbol: string; rateMissing: boolean } | null {
  const { state } = useWallet();
  const [currency] = useDisplayCurrency();
  if (state.status !== 'ready') return null;
  const units = realBalance(state.wallet).available;
  if (currency === 'GHS') {
    const pesewas = state.rate ? toPesewas(units, state.rate.rate) : null;
    if (pesewas === null) return { currency, whole: '', fraction: '', symbol: CEDI, rateMissing: true };
    return { currency, ...splitPesewas(pesewas), symbol: CEDI, rateMissing: false };
  }
  return { currency, ...splitUnits(units), symbol: '$', rateMissing: false };
}

function Glance({ onNavigate }: { onNavigate?: () => void }) {
  const shown = useBalanceDisplay();
  const { state } = useWallet();
  if (!shown || state.status !== 'ready') {
    return (
      <div className="px-3.5" aria-hidden="true">
        <div className="h-2.5 w-16 animate-pulse rounded-full bg-white/70" />
        <div className="mt-3 h-6 w-28 animate-pulse rounded-md bg-white/70" />
      </div>
    );
  }
  const fallback = splitUnits(realBalance(state.wallet).available);
  return (
    <Link href="/home" onClick={onNavigate} className="group block rounded-[12px] px-3.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-brand/70">
      <p className="text-[12px] font-medium text-brand-ink/75">{t.wallet.available}</p>
      <p className="tabular mt-2 whitespace-nowrap text-[24px] font-semibold leading-none tracking-[-0.03em] text-brand-night">
        <span className="mr-1 align-[0.28em] text-[13px] font-medium text-brand-ink/70">{shown.rateMissing ? '$' : shown.symbol}</span>
        {shown.rateMissing ? fallback.whole : shown.whole}
        <span className="text-[15px] text-brand-ink/60">.{shown.rateMissing ? fallback.fraction : shown.fraction}</span>
      </p>
      <p className="mt-2 truncate font-mono text-[11.5px] text-brand-ink/60 transition-colors duration-200 group-hover:text-brand-ink">{state.wallet.me.accountId}</p>
    </Link>
  );
}

function Identity({ onNavigate }: { onNavigate?: () => void }) {
  const { state } = useWallet();
  const secured = useSecured();
  const me = state.status === 'ready' ? state.wallet.me : null;
  if (!me) return null;
  const status = me.viewOnly ? t.wallet.security.viewOnly : secured ? t.wallet.security.secured : t.wallet.security.notSecured;
  return (
    <Link href="/settings" onClick={onNavigate} className="group flex items-center gap-3 rounded-[8px] px-3 py-2.5 outline-none transition-colors duration-200 hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-brand/70">
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium text-brand-night">{me.displayName}</span>
        <span className={`mt-0.5 block truncate text-[12px] ${secured || me.viewOnly ? 'text-brand-ink/70' : 'text-warning'}`}>{status}</span>
      </span>
    </Link>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { state } = useWallet();
  const unread = useContext(UnreadContext);
    const viewOnly = state.status === 'ready' && state.wallet.me.viewOnly;
  return (
    <nav aria-label={t.wallet.navLabel} className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col">
        {GROUPS.map((g) => (
          <div key={g.label ?? 'main'} className={g.label ? 'mt-6' : ''}>
            {g.label ? <p className="eyebrow mb-1.5 px-3.5 text-brand-ink/80">{g.label}</p> : null}
            <div className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} viewOnly={viewOnly} badge={item.href === '/notifications' ? unread : undefined} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
        <div className="mt-auto pt-6">
          <NavLink item={SETTINGS} pathname={pathname} viewOnly={viewOnly} onNavigate={onNavigate} />
        </div>
      </div>
      <div className="mt-3 border-t border-brand-border pt-3">
        <Identity onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

function Sidebar() {
  return (
    <aside className="print-hidden no-scrollbar sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-brand-border bg-brand-soft px-3 pb-3 pt-6 lg:flex">
      <Link href="/home" className="ml-3.5 self-start rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/70" aria-label="Obiba overview">
        <Logo className="h-[29px] w-auto" />
      </Link>
      <div className="mb-6 mt-8">
        <Glance />
      </div>
      <Navigation />
    </aside>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const unread = useContext(UnreadContext);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" aria-label={t.wallet.closeMenu} onClick={onClose} className="absolute inset-0 animate-fade bg-ink/45" />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t.wallet.menu}
        className="safe-bottom absolute inset-x-0 bottom-0 max-h-[88dvh] animate-sheet-y overflow-y-auto rounded-t-[24px] bg-surface px-5 pt-3 outline-none"
      >
                <div className="mb-2 flex items-center justify-between">
          <p className="text-[17px] font-semibold text-ink">{t.wallet.tabs.more}</p>
          <button type="button" onClick={onClose} aria-label={t.ui.close} className="press -mr-2 flex h-10 w-10 items-center justify-center rounded-[8px] text-muted hover:bg-wash hover:text-ink">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {GROUPS.slice(1).map((g) => (
          <div key={g.label} className="mt-4">
            <p className="eyebrow mb-1 text-subtle">{g.label}</p>
            <ul className="grid grid-cols-2 gap-x-3">
              {g.items.map((item) => {
                const Icon = item.icon;
                const on = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link href={item.href} onClick={onClose} aria-current={on ? 'page' : undefined} className={`flex h-12 items-center gap-3 rounded-[8px] px-2 text-[15px] ${on ? 'font-semibold text-ink' : 'text-ink-2'} hover:bg-canvas`}>
                      <Icon className={`h-5 w-5 ${on ? 'text-brand' : 'text-muted'}`} />
                      {item.label}
                      {item.href === '/notifications' && unread ? <span className="tabular ml-auto text-[13px] font-semibold text-brand-ink">{unread}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className="mt-5 border-t border-hairline pt-2">
          <Link href="/settings" onClick={onClose} className="flex h-12 items-center gap-3 rounded-[8px] px-2 text-[15px] text-ink-2 hover:bg-canvas">
            <SettingsIcon className="h-5 w-5 text-muted" />
            {t.wallet.nav.settings}
          </Link>
        </div>
      </div>
    </div>
  );
}

function TabBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const pathname = usePathname();
  const tab = (href: string, label: string, Icon: Icon, on: boolean) => (
    <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${on ? 'text-ink' : 'text-subtle'}`}>
      <Icon className={`h-[22px] w-[22px] ${on ? 'text-brand' : ''}`} />
      {label}
    </Link>
  );
  const payOn = pathname === '/pay' || (pathname.startsWith('/pay/') && pathname !== '/pay/scan');
  return (
    <nav aria-label={t.wallet.navLabel} className="print-hidden safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/95 backdrop-blur-[10px] lg:hidden">
      <div className="mx-auto flex h-[58px] max-w-[560px] items-stretch px-2">
        {tab('/home', t.wallet.tabs.home, OverviewIcon, pathname === '/home')}
        {tab('/pay', t.wallet.tabs.pay, PayIcon, payOn)}
        {tab('/pay/scan', t.wallet.tabs.scan, ScanIcon, pathname === '/pay/scan')}
        {tab('/activity', t.wallet.tabs.activity, ActivityIcon, pathname.startsWith('/activity'))}
        <button type="button" onClick={onMore} aria-expanded={moreOpen} className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${moreOpen ? 'text-ink' : 'text-subtle'}`}>
          <MoreIcon className="h-[22px] w-[22px]" />
          {t.wallet.tabs.more}
        </button>
      </div>
    </nav>
  );
}

function TopBar() {
  const unread = useContext(UnreadContext);
  const { state } = useWallet();
  const me = state.status === 'ready' ? state.wallet.me : null;
  return (
    <header className="print-hidden sticky top-0 z-30 flex h-14 items-center justify-between bg-night px-4 lg:hidden">
      <Link href="/home" aria-label="Obiba overview" className="rounded-sm">
        <Logo tone="light" className="h-[19px] w-auto" />
      </Link>
      <div className="flex items-center gap-1">
        <Link href="/notifications" aria-label={unread ? `${t.wallet.nav.notifications}, ${t.wallet.unread(unread)}` : t.wallet.nav.notifications} className="flex h-10 min-w-10 items-center justify-center gap-1 rounded-[8px] px-1 text-white/80 hover:text-white">
          <BellIcon className="h-[21px] w-[21px]" />
          {unread ? <span className="tabular -ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11.5px] font-semibold leading-none text-white">{unread}</span> : null}
        </Link>
        {me ? (
          <Link href="/settings" aria-label={t.wallet.nav.settings} className="flex h-10 w-10 items-center justify-center rounded-[8px] text-white/80 hover:text-white">
            <SettingsIcon className="h-[21px] w-[21px]" />
          </Link>
        ) : null}
      </div>
    </header>
  );
}

function Chrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const unread = useUnreadSource();
  return (
    <UnreadContext.Provider value={unread}>
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar />
      <div className="flex min-h-dvh min-w-0 flex-col">
        <TopBar />
        <main className="w-full flex-1 px-5 pb-28 pt-6 sm:px-8 lg:px-12 lg:pb-20 lg:pt-10 xl:px-14">
          <div key={pathname} className="mx-auto w-full max-w-[1120px] animate-step">
            {children}
          </div>
        </main>
      </div>
      <TabBar onMore={() => setMore(true)} moreOpen={more} />
      <MoreSheet open={more} onClose={() => setMore(false)} />
    </div>
    </UnreadContext.Provider>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const services = useServices();
  const session = useSession();
  const router = useRouter();
  const user = session.status === 'signed-in' ? session.user : null;
  const { state } = useOnboardingFacts(services, user);

  useEffect(() => {
    if (session.status === 'signed-out') router.replace('/sign-in');
  }, [session.status, router]);

  const allowed = state.status === 'ready' && (state.step === 'done' || state.facts.me?.viewOnly === true);
  const blocked = state.status === 'ready' && !allowed;

  useEffect(() => {
    if (blocked) router.replace('/onboarding');
  }, [blocked, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface text-muted" role="status">
        <Spinner />
        <span className="sr-only">{t.common.loading}</span>
      </div>
    );
  }
  return <SecuredContext.Provider value={linkedDevice(state.facts) !== null}>{children}</SecuredContext.Provider>;
}

export function Protected({ children }: { children: ReactNode }) {
  return (
    <AccountScope>
      <Gate>
        <WalletProvider>{children}</WalletProvider>
      </Gate>
    </AccountScope>
  );
}

export function WalletShell({ children }: { children: ReactNode }) {
  return (
    <Protected>
      <Chrome>{children}</Chrome>
    </Protected>
  );
}
