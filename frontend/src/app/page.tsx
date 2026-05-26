'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL ?? 'https://zyphron.space';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Accept token passed from landing page via ?token= URL param (cross-domain handoff)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('auth-token', urlToken);
      // Clean the token from the URL before proceeding
      window.history.replaceState({}, '', '/');
    }

    const token = urlToken || localStorage.getItem('auth-token');
    if (token) {
      router.replace('/dashboard');
    } else {
      window.location.replace(`${LANDING_URL}/#access`);
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="h-9 w-9 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
    </div>
  );
}
