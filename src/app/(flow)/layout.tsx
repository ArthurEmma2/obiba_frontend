import type { ReactNode } from 'react';
import { Protected } from '@/features/wallet/shell';

export default function FlowLayout({ children }: { children: ReactNode }) {
  return <Protected>{children}</Protected>;
}
