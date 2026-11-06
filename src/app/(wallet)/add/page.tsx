import type { Metadata } from 'next';
import { AddHub } from '@/features/wallet/add';

export const metadata: Metadata = { title: 'Add money' };

export default function Page() {
  return <AddHub />;
}
