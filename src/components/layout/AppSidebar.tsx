'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Package, History, Users, Shield, ChevronLeft, ChevronRight, CalendarClock, TriangleAlert, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface AppSidebarProps {
  collapsed: boolean;
  onDesktopToggle: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

interface SidebarLink {
  href: string;
  label: string;
  icon: typeof Package;
  roles: string[];
}

interface SidebarNavProps {
  collapsed: boolean;
  links: SidebarLink[];
  pathname: string;
  router: ReturnType<typeof useRouter>;
  onNavigate?: () => void;
}

function SidebarNavContent({ collapsed, links, pathname, router, onNavigate }: SidebarNavProps) {
  return (
    <>
      <div
        className={cn(
          'flex h-16 items-center border-b border-white/5 transition-all duration-300',
          collapsed ? 'justify-center px-0' : 'px-4'
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500 shadow-lg shadow-indigo-500/20">
          <Shield className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div className="ml-3 min-w-0">
            <h1 className="truncate text-base font-bold text-white">SpareManager</h1>
            <p className="text-xs text-slate-400">Inventory workspace</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-3">
        {!collapsed && (
          <div className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-gray-400/80 transition-opacity duration-300">
            Menu
          </div>
        )}

        {links.map((link) => {
          const Icon = link.icon;
          const isActive =
            link.href === '/'
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className="group block"
              onClick={onNavigate}
              onMouseEnter={() => router.prefetch(link.href)}
              onFocus={() => router.prefetch(link.href)}
            >
              <div
                className={cn(
                  'relative flex items-center rounded-lg transition-all duration-200',
                  collapsed ? 'mx-auto h-12 w-12 justify-center' : 'w-full px-3 py-2.5',
                  isActive
                    ? 'bg-linear-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                )}
                title={collapsed ? link.label : undefined}
              >
                <Icon
                  className={cn(
                    'shrink-0 transition-colors',
                    collapsed ? 'h-6 w-6' : 'mr-3 h-5 w-5'
                  )}
                />

                {!collapsed && (
                  <span className="truncate text-sm font-medium">{link.label}</span>
                )}

                {collapsed && isActive && (
                  <div className="absolute left-0 h-8 w-1 rounded-r-full bg-purple-400" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        {!collapsed ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center backdrop-blur-sm">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-gray-400">Status</p>
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <span className="text-xs font-bold text-emerald-300">Operational</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div
              className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
              title="System Operational"
            />
          </div>
        )}
      </div>
    </>
  );
}

export function AppSidebar({
  collapsed,
  onDesktopToggle,
  mobileOpen,
  onMobileOpenChange,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  const links: SidebarLink[] = [
    {
      href: '/below-safety',
      label: 'Below Safety',
      icon: TriangleAlert,
      roles: ['USER', 'POWER_USER', 'ADMIN'],
    },
    {
      href: '/',
      label: 'Spare Parts',
      icon: Package,
      roles: ['USER', 'POWER_USER', 'ADMIN'],
    },
    {
      href: '/transactions',
      label: 'Transactions',
      icon: History,
      roles: ['USER', 'POWER_USER', 'ADMIN'],
    },
    {
      href: '/pm-dashboard',
      label: 'PM Dashboard',
      icon: CalendarClock,
      roles: ['USER', 'POWER_USER', 'ADMIN'],
    },
    {
      href: '/pm-daily-planner',
      label: 'Daily Planner',
      icon: CalendarClock,
      roles: ['USER', 'POWER_USER', 'ADMIN'],
    },
    {
      href: '/working-hours',
      label: 'Working Hours',
      icon: Clock,
      roles: ['USER', 'POWER_USER', 'ADMIN'],
    },
    {
      href: '/admin/users',
      label: 'User Management',
      icon: Users,
      roles: ['ADMIN'],
    },
  ];

  const filteredLinks = links.filter(link => 
    user && link.roles.includes(user.role)
  );

  useEffect(() => {
    if (filteredLinks.length === 0) {
      return;
    }

    const browserWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const routesToPrefetch = filteredLinks
      .map((link) => link.href)
      .filter((href) => href !== pathname);

    const warmRoutes = () => {
      routesToPrefetch.forEach((href) => {
        router.prefetch(href);
      });
    };

    if (typeof browserWindow.requestIdleCallback === 'function') {
      const idleId = browserWindow.requestIdleCallback(() => warmRoutes());
      return () => browserWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(() => warmRoutes(), 500);
    return () => globalThis.clearTimeout(timeoutId);
  }, [filteredLinks, pathname, router]);

  return (
    <>
      <aside
        className={cn(
          'relative z-20 hidden h-screen shrink-0 flex-col bg-slate-900 text-white shadow-lg transition-all duration-300 ease-in-out md:sticky md:top-0 md:flex',
          collapsed ? 'w-20 border-r' : 'w-64 border-r'
        )}
      >
        <SidebarNavContent collapsed={collapsed} links={filteredLinks} pathname={pathname} router={router} />

        <button
          onClick={onDesktopToggle}
          className="absolute -right-3 top-8 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-md transition-all hover:bg-gray-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="w-[88vw] max-w-[320px] border-r-0 bg-slate-950 p-0 text-white [&>button]:text-white"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Open app sections and move between mobile screens.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full flex-col">
            <SidebarNavContent
              collapsed={false}
              links={filteredLinks}
              pathname={pathname}
              router={router}
              onNavigate={() => onMobileOpenChange(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
