'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { Loader2 } from 'lucide-react';

export function ProtectedLayout({ children, requiredRoles = [] }: { children: React.ReactNode, requiredRoles?: string[] }) {
  const { user, isLoading } = useAuth();
  const [collapsed, setCollapsed] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  const toggleSidebar = () => setCollapsed(!collapsed);

  if (!user) return null; // Should redirect in useEffect

  if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
    return (
        <div className="flex min-h-screen bg-gray-100">
            <AppSidebar collapsed={collapsed} onToggle={toggleSidebar} />
            <div className="flex-1 flex flex-col">
                <AppHeader onToggle={toggleSidebar} />
                <div className="flex-1 flex items-center justify-center p-4 text-center">
                    <div className="max-w-md bg-white p-8 rounded shadow">
                        <h2 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h2>
                        <p className="text-gray-600">You do not have permission to view this page.</p>
                    </div>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-linear-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:to-slate-800">
      <AppSidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <AppHeader onToggle={toggleSidebar} />
        <main className="flex-1 overflow-auto p-6 transition-all duration-300">
          {children}
        </main>
      </div>
    </div>
  );
}
