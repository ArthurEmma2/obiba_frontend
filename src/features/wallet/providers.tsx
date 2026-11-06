import { withBase } from '@/lib/base-path';

export interface ProviderInfo {
  name: string;
  wallet?: string;
  logo?: string;
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  MTN: { name: 'MTN', wallet: 'MTN MoMo', logo: withBase('/logos/providers/mtn.png') },
  TELECEL: { name: 'Telecel', wallet: 'Telecel Cash', logo: withBase('/logos/providers/telecel.png') },
  AT: { name: 'AT', wallet: 'AT Money' },
  ECG: { name: 'ECG', logo: withBase('/logos/providers/ecg.png') },
  GWL: { name: 'Ghana Water', logo: withBase('/logos/providers/gwl.png') },
  DSTV: { name: 'DStv' },
  GOTV: { name: 'GOtv' },
  GCB: { name: 'GCB Bank' },
  ECOBANK: { name: 'Ecobank' },
  STANBIC: { name: 'Stanbic Bank' },
  ABSA: { name: 'Absa Bank' },
  FIDELITY: { name: 'Fidelity Bank' },
  MPESA: { name: 'Safaricom', wallet: 'M-Pesa' },
  AIRTEL_KE: { name: 'Airtel', wallet: 'Airtel Money' },
  EQUITY: { name: 'Equity Bank' },
  KCB: { name: 'KCB Bank' },
  COOP: { name: 'Co-operative Bank' },
  NCBA: { name: 'NCBA Bank' },
  ACCESS: { name: 'Access Bank' },
  GTBANK: { name: 'GTBank' },
  ZENITH: { name: 'Zenith Bank' },
  FIRSTBANK: { name: 'First Bank' },
  UBA: { name: 'UBA' },
  OPAY: { name: 'OPay', wallet: 'OPay' },
  PALMPAY: { name: 'PalmPay', wallet: 'PalmPay' },
  MONIEPOINT: { name: 'Moniepoint', wallet: 'Moniepoint' },
  FNB: { name: 'FNB' },
  STANDARD_BANK: { name: 'Standard Bank' },
  NEDBANK: { name: 'Nedbank' },
  CAPITEC: { name: 'Capitec' },
};

export function providerInfo(id: string): ProviderInfo {
  return PROVIDERS[id] ?? { name: id };
}

export function providerLabel(id: string): string {
  const p = providerInfo(id);
  return p.wallet ?? p.name;
}

export function ProviderLogo({ id, size = 35, className = '' }: { id: string; size?: number; className?: string }) {
  const p = providerInfo(id);
  if (!p.logo) return null;
  return <img src={p.logo} alt="" aria-hidden="true" width={size} height={size} className={`shrink-0 select-none rounded-[6px] object-contain ${className}`} style={{ width: size, height: size }} decoding="async" />;
}

export function ProviderLogos({ ids, size = 29 }: { ids: string[]; size?: number }) {
  const withLogo = ids.filter((id) => providerInfo(id).logo);
  if (!withLogo.length) return null;
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      {withLogo.map((id) => (
        <ProviderLogo key={id} id={id} size={size} />
      ))}
    </span>
  );
}

const NETWORKS: Record<string, { name: string; logo: string }> = {
  near: { name: 'NEAR', logo: withBase('/logos/networks/near.svg') },
  tron: { name: 'Tron', logo: withBase('/logos/networks/tron.svg') },
  bsc: { name: 'BNB Chain', logo: withBase('/logos/networks/bnb.svg') },
  base: { name: 'Base', logo: withBase('/logos/networks/base.svg') },
  arbitrum: { name: 'Arbitrum', logo: withBase('/logos/networks/arbitrum.svg') },
  solana: { name: 'Solana', logo: withBase('/logos/networks/solana.svg') },
};

const TOKENS: Record<string, { name: string; logo: string }> = {
  USDC: { name: 'USDC', logo: withBase('/logos/tokens/usdc.svg') },
  USDT: { name: 'USDT', logo: withBase('/logos/tokens/usdt.svg') },
  SOL: { name: 'SOL', logo: withBase('/logos/tokens/sol.svg') },
};

export function networkOf(label: string): string | null {
  const l = label.toLowerCase();
  if (l.includes('tron')) return 'tron';
  if (l.includes('bnb') || l.includes('bsc') || l.includes('binance')) return 'bsc';
  if (l.includes('base')) return 'base';
  if (l.includes('arbitrum') || l.includes('_arb')) return 'arbitrum';
  if (l.includes('solana') || l.includes('_sol') || l === 'sol') return 'solana';
  if (l.includes('near')) return 'near';
  return null;
}

export function tokenOf(label: string): string | null {
  const u = label.toUpperCase();
  if (u.startsWith('USDC')) return 'USDC';
  if (u.startsWith('USDT')) return 'USDT';
  if (u.startsWith('SOL')) return 'SOL';
  return null;
}

export function NetworkLogo({ network, size = 20 }: { network: string | null; size?: number }) {
  const n = network ? NETWORKS[network] : null;
  if (!n) return null;
  return <img src={n.logo} alt="" aria-hidden="true" width={size} height={size} className="shrink-0" style={{ width: size, height: size }} decoding="async" />;
}

export function TokenLogo({ token, size = 20 }: { token: string | null; size?: number }) {
  const k = token ? TOKENS[token] : null;
  if (!k) return null;
  return <img src={k.logo} alt="" aria-hidden="true" width={size} height={size} className="shrink-0" style={{ width: size, height: size }} decoding="async" />;
}

export function AssetPair({ label, size = 28 }: { label: string; size?: number }) {
  const token = tokenOf(label);
  const network = networkOf(label);
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size + 6, height: size + 4 }} aria-hidden="true">
      <TokenLogo token={token} size={size} />
      {network && network !== token?.toLowerCase() ? (
        <span className="absolute bottom-0 right-0 rounded-[5px] bg-surface p-px">
          <NetworkLogo network={network} size={Math.round(size * 0.5)} />
        </span>
      ) : null}
    </span>
  );
}

export const DEPOSIT_NETWORKS = ['near', 'tron', 'bsc', 'base', 'arbitrum', 'solana'];

export function NetworkRow({ networks, size = 18 }: { networks: string[]; size?: number }) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      {networks.map((n) => (
        <NetworkLogo key={n} network={n} size={size} />
      ))}
    </span>
  );
}

const FLAGS: Record<string, string> = { GH: withBase('/logos/flags/gh-1x1.svg'), KE: withBase('/logos/flags/ke-1x1.svg'), NG: withBase('/logos/flags/ng-1x1.svg'), ZA: withBase('/logos/flags/za-1x1.svg') };

export function Flag({ country, size = 28 }: { country: string; size?: number }) {
  const src = FLAGS[country.toUpperCase()];
  if (!src) return null;
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-ink/10" style={{ width: size, height: size }}>
      <img src={src} alt="" width={size} height={size} className="h-full w-full object-cover" decoding="async" />
    </span>
  );
}
