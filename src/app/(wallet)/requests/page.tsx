import type { Metadata } from 'next';
import { Requests } from '@/features/wallet/account';

export const metadata: Metadata = { title: 'Requests' };

export default function Page() {
  return <Requests />;
}
