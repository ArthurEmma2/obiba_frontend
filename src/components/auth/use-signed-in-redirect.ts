'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/lib/services';

export function useSignedInRedirect(hold: boolean, to = '/onboarding') {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!hold && session.status === 'signed-in') router.replace(to);
  }, [hold, session.status, router, to]);
  return session;
}
