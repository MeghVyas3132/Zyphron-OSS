'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Database,
  FolderKanban,
  GitBranch,
  Layers,
  LayoutDashboard,
  LogOut,
  Rocket,
  Settings,
  Shield,
  Zap,
  FlaskConical,
  Gauge,
  ChevronLeft,
  ChevronRight,
  Plus,
  Bell,
  Search,
  Crown,
} from 'lucide-react';
import { PageTransition } from '@/components/animated/page-transition';
import { cn } from '@/lib/utils';

const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL ?? 'https://zyphron.space';

const NAV_SECTIONS = [
  {
    label: 'Core',
    items: [
      { name: 'Dashboard',    href: '/dashboard',        icon: LayoutDashboard },
      { name: 'Projects',     href: '/projects',         icon: FolderKanban },
      { name: 'Stacks',       href: '/projects/stacks',  icon: Layers },
    ],
  },
  {
    label: 'Observe',
    items: [
      { name: 'Observability', href: '/observability',   icon: Activity },
      { name: 'Audit Logs',    href: '/audit',           icon: Shield },
    ],
  },
  {
    label: 'DevOps',
    items: [
      { name: 'Load Testing',  href: '/stress',          icon: Gauge },
      { name: 'Chaos Testing', href: '/chaos',           icon: FlaskConical },
      { name: 'AI Insights',   href: '/ai',              icon: Zap },
    ],
  },
  {
    label: 'Data',
    items: [
      { name: 'Databases',     href: '/databases',       icon: Database },
      { name: 'DB Branches',   href: '/db-branches',     icon: GitBranch },
    ],
  },
  {
    label: 'Platform',
    items: [
      { name: 'Edge',          href: '/edge',            icon: Rocket },
      { name: 'Strategies',    href: '/strategies',      icon: Rocket },
      { name: 'Self-Deploy',   href: '/self-deploy',     icon: Zap },
      { name: 'Settings',      href: '/settings',        icon: Settings },
      { name: 'Admin',         href: '/admin',           icon: Crown },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const guard = async () => {
      const token = localStorage.getItem('auth-token');
      if (!token) {
        window.location.replace(`${LANDING_URL}/#access`);
        return;
      }
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          localStorage.removeItem('auth-token');
          window.location.replace(`${LANDING_URL}/#access`);
          return;
        }
        setReady(true);
      } catch {
        localStorage.removeItem('auth-token');
        window.location.replace(`${LANDING_URL}/#access`);
      }
    };
    void guard();
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="h-6 w-6 rounded-full border border-white/20 border-t-white/60 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen border-r border-white/[0.06] bg-[#040404] transition-all duration-500 flex flex-col',
          collapsed ? 'w-[60px]' : 'w-[240px]'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'h-16 flex items-center border-b border-white/[0.06] flex-shrink-0',
          collapsed ? 'justify-center px-0' : 'justify-between px-5'
        )}>
          <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
            <div className="h-7 w-7 rounded border border-white/15 flex items-center justify-center flex-shrink-0">
              <span className="font-mono-ui text-[11px] font-medium text-white/80">Z</span>
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-mono-ui text-[9px] uppercase tracking-[0.35em] text-white/35 leading-none">Zyphron</div>
                <div className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-white/70 leading-none mt-0.5">Control Plane</div>
              </div>
            )}
          </Link>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="ml-2 text-white/20 hover:text-white/60 transition-colors flex-shrink-0"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="mt-2 mx-auto text-white/20 hover:text-white/60 transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto scrollbar-hide py-4 space-y-5">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <div className="px-5 mb-1.5 font-mono-ui text-[8px] uppercase tracking-[0.35em] text-white/20">
                  {section.label}
                </div>
              )}
              <div className="space-y-px px-2">
                {section.items.map((item) => {
                  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      title={collapsed ? item.name : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded px-3 py-2 transition-colors',
                        collapsed && 'justify-center px-0 py-2.5',
                        active
                          ? 'bg-white/[0.07] text-white/90'
                          : 'text-white/35 hover:text-white/65 hover:bg-white/[0.03]'
                      )}
                    >
                      <item.icon className={cn('flex-shrink-0 transition-none', collapsed ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
                      {!collapsed && (
                        <span className="font-mono-ui text-[10px] uppercase tracking-[0.2em]">
                          {item.name}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className={cn(
          'flex-shrink-0 border-t border-white/[0.06] py-3 space-y-px',
          collapsed ? 'px-2' : 'px-2'
        )}>
          <button
            onClick={() => {
              localStorage.removeItem('auth-token');
              window.location.replace(`${LANDING_URL}/#access`);
            }}
            className={cn(
              'w-full flex items-center gap-3 rounded px-3 py-2 text-white/25 hover:text-white/55 hover:bg-white/[0.03] transition-colors',
              collapsed && 'justify-center px-0'
            )}
          >
            <LogOut className={cn('flex-shrink-0', collapsed ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
            {!collapsed && <span className="font-mono-ui text-[10px] uppercase tracking-[0.2em]">Return to Landing</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────── */}
      <div className={cn('flex-1 flex flex-col min-h-screen transition-all duration-500', collapsed ? 'ml-[60px]' : 'ml-[240px]')}>
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl flex items-center px-6 gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
            <input
              type="text"
              placeholder="Search..."
              className="h-9 w-full rounded border border-white/[0.07] bg-white/[0.02] pl-9 pr-4 font-mono-ui text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/projects/new">
              <button className="flex items-center gap-2 rounded border border-white/[0.08] bg-white/[0.03] px-3 py-2 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-white/65 hover:bg-white/[0.06] hover:text-white/90 transition-colors">
                <Plus className="h-3 w-3" />
                New Project
              </button>
            </Link>
            <button
              onClick={() => router.push('/settings?tab=notifications')}
              className="relative rounded border border-white/[0.07] bg-white/[0.02] p-2 text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-colors"
            >
              <Bell className="h-3.5 w-3.5" />
              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-white/70 text-black font-mono-ui text-[8px] flex items-center justify-center">3</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 md:p-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
