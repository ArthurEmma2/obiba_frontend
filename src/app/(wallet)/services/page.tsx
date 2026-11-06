import type { Metadata } from 'next';
import { ServicesHub } from '@/features/wallet/local';

export const metadata: Metadata = { title: 'Everyday services' };

export default function Page() {
  return <ServicesHub />;
}
