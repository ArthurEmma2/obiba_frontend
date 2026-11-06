import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignUpForm } from '@/components/auth/sign-up-form';

export const metadata: Metadata = { title: 'Create account' };

export default function SignUpPage() {
  return (
    <AuthShell start={1}>
      <SignUpForm />
    </AuthShell>
  );
}
