import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ActionHandlerRoute } from '@/components/auth/action-handler';
import { AuthShell } from '@/components/auth/auth-shell';

export const metadata: Metadata = { title: 'Account action', referrer: 'no-referrer' };

export default function AuthActionPage() {
  return (
    <AuthShell start={4}>
      <Suspense>
        <ActionHandlerRoute />
      </Suspense>
    </AuthShell>
  );
}
