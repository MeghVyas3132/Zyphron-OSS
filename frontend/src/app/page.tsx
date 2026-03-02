'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('auth-token');
    router.replace(token ? '/dashboard' : '/login');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-9 w-9 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
    </div>
  );
}
