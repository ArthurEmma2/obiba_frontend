import type { Metadata } from 'next';
import { Notifications } from '@/features/wallet/account';

export const metadata: Metadata = { title: 'Notifications' };

export default function Page() {
  return <Notifications />;
}
