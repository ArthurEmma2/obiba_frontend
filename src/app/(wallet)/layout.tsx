import type { ReactNode } from 'react';
import { WalletShell } from '@/features/wallet/shell';

export default function WalletLayout({ children }: { children: ReactNode }) {
  return <WalletShell>{children}</WalletShell>;
}
