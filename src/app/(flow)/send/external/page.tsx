import type { Metadata } from 'next';
import { RemitFlow } from '@/features/wallet/remit';

export const metadata: Metadata = { title: 'Send to someone outside Obiba' };

export default function Page() {
  return <RemitFlow />;
}
