'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Bell,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Database,
  FlaskConical,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Moon,
  Plus,
  Rocket,
  Search,
  Settings,
  Sun,
  Zap,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'AI Insights', href: '/ai', icon: Zap },
  { name: 'Databases', href: '/databases', icon: Database },
  { name: 'Multi-Cloud', href: '/cloud', icon: Cloud },
  { name: 'Edge Functions', href: '/edge', icon: Rocket },
  { name: 'Strategies', href: '/strategies', icon: Rocket },
  { name: 'Observability', href: '/observability', icon: Activity },
  { name: 'Chaos Testing', href: '/chaos', icon: FlaskConical },
  { name: 'DB Branches', href: '/db-branches', icon: GitBranch },
  { name: 'Self-Deploy', href: '/self-deploy', icon: Zap },
  { name: 'Settings', href: '/settings', icon: Settings },
];
const delayClasses = ['animate-delay-1', 'animate-delay-2', 'animate-delay-3', 'animate-delay-4'];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const guard = async () => {
      const token = localStorage.getItem('auth-token');
      if (!token) {
        router.replace('/login');
        return;
      }

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          localStorage.removeItem('auth-token');
          router.replace('/login');
          return;
        }

        setReady(true);
      } catch {
        localStorage.removeItem('auth-token');
        router.replace('/login');
      }
    };

    void guard();
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-9 w-9 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen premium-shell flex">
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen border-r bg-card/75 backdrop-blur-xl transition-all duration-500',
          collapsed ? 'w-20' : 'w-72'
        )}
      >
        <div className="h-full flex flex-col">
          <div className="h-20 px-4 flex items-center justify-between border-b border-border/60">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-foreground/15">
                <Zap className="h-5 w-5" />
              </div>
              {!collapsed && (
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Zyphron</p>
                  <p className="font-semibold leading-none mt-1">Control Plane</p>
                </div>
              )}
            </Link>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCollapsed((prev) => !prev)}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-hide">
            {navigation.map((item, index) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'stagger-in',
                    index < delayClasses.length ? delayClasses[index] : undefined,
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-300',
                    active
                      ? 'bg-foreground text-background shadow-md'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                    collapsed && 'justify-center'
                  )}
                >
                  <item.icon className={cn('h-5 w-5 flex-shrink-0', active ? 'text-background' : '')} />
                  {!collapsed && <span className="font-medium">{item.name}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="p-3 border-t border-border/60 space-y-2">
            <Button
              variant="outline"
              className={cn('w-full justify-start gap-3', collapsed && 'justify-center')}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {!collapsed && <span>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>}
            </Button>

            <Button
              variant="ghost"
              className={cn('w-full justify-start gap-3 text-muted-foreground', collapsed && 'justify-center')}
              onClick={() => {
                localStorage.removeItem('auth-token');
                router.replace('/login');
              }}
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign Out</span>}
            </Button>
          </div>
        </div>
      </aside>

      <div className={cn('flex-1 transition-all duration-500', collapsed ? 'ml-20' : 'ml-72')}>
        <header className="sticky top-0 z-30 h-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
          <div className="h-full px-5 sm:px-8 flex items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search projects, deployments, logs..."
                className="h-11 w-full rounded-xl border border-input bg-card/80 pl-10 pr-4 text-sm outline-none transition-all duration-300 focus:border-foreground/35"
              />
            </div>

            <div className="flex items-center gap-2">
              <Link href="/projects/new">
                <Button className="gap-2 rounded-xl">
                  <Plus className="h-4 w-4" />
                  New Project
                </Button>
              </Link>
              <Button
                variant="outline"
                size="icon"
                className="relative rounded-xl"
                onClick={() => router.push('/settings?tab=notifications')}
              >
                <Bell className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 size-4 rounded-full bg-foreground text-background text-[10px] flex items-center justify-center">
                  3
                </span>
              </Button>
            </div>
          </div>
        </header>

        <main className="p-5 sm:p-8">
          <div className="stagger-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
