import type { Metadata } from 'next';
import { SendFlow } from '@/features/wallet/send';

export const metadata: Metadata = { title: 'Send to an Obiba user' };

export default function Page() {
  return <SendFlow mode="obiba" />;
}
