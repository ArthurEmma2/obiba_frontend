'use client';

import { Fragment, type ReactNode } from 'react';
import { useSession } from '@/lib/services';

export function AccountScope({ children }: { children: ReactNode }) {
  const session = useSession();
  const scope = session.status === 'signed-in' ? `uid:${session.user.uid}` : session.status;
  return <Fragment key={scope}>{children}</Fragment>;
}
