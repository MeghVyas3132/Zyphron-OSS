'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth-token');
      if (!token) {
        setReady(true);
        return;
      }

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          router.replace('/dashboard');
          return;
        }
      } catch {
        // Ignore and continue to auth page fallback.
      }

      localStorage.removeItem('auth-token');
      setReady(true);
    };

    void checkAuth();
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-9 w-9 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen premium-shell grid lg:grid-cols-[1.2fr_1fr]">
      <section className="hidden lg:flex p-12 xl:p-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--foreground)/0.15),transparent_40%)]" />
        <div className="relative w-full premium-panel p-10 flex flex-col justify-between stagger-in">
          <div>
            <p className="uppercase tracking-[0.32em] text-xs text-muted-foreground">Zyphron</p>
            <h1 className="text-5xl font-semibold leading-tight mt-5 max-w-xl mono-text-gradient">
              Deploy Any Runtime with Enterprise Discipline
            </h1>
            <p className="mt-6 text-muted-foreground max-w-lg text-base leading-relaxed">
              Universal deployment infrastructure for monoliths, microservices, worker fleets,
              and multi-database systems from one control plane.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="premium-panel p-4 stagger-in animate-delay-1">
              <p className="text-2xl font-semibold">99.99%</p>
              <p className="text-muted-foreground mt-1">Uptime SLO</p>
            </div>
            <div className="premium-panel p-4 stagger-in animate-delay-2">
              <p className="text-2xl font-semibold">12x</p>
              <p className="text-muted-foreground mt-1">Faster Rollout</p>
            </div>
            <div className="premium-panel p-4 stagger-in animate-delay-3">
              <p className="text-2xl font-semibold">0 Drift</p>
              <p className="text-muted-foreground mt-1">Infra Policy</p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-md premium-panel p-7 sm:p-8 stagger-in">{children}</div>
      </section>
    </div>
  );
}
