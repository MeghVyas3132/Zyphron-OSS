'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get('token');
    const error = params.get('error');

    if (error) {
      const messages: Record<string, string> = {
        github_denied: 'GitHub login was cancelled.',
        github_no_email: 'No email found on your GitHub account.',
        github_token_failed: 'GitHub authentication failed. Please try again.',
        github_failed: 'GitHub login failed. Please try again.',
        google_denied: 'Google login was cancelled.',
        google_no_email: 'No email found on your Google account.',
        google_failed: 'Google login failed. Please try again.',
      };
      toast.error(messages[error] || 'Authentication failed.');
      router.replace('/login');
      return;
    }

    if (token) {
      localStorage.setItem('auth-token', token);
      toast.success('Welcome! Redirecting...');
      router.replace('/dashboard');
    } else {
      toast.error('No authentication token received.');
      router.replace('/login');
    }
  }, [params, router]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <Loader2 className="h-8 w-8 animate-spin text-foreground/60" />
      <p className="text-sm text-muted-foreground">Completing sign-in…</p>
    </div>
  );
}
