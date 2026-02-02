'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Package, History, Users, Shield, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // Toggle handlers
  const toggleSidebar = () => setCollapsed(!collapsed);

  const links = [
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
      href: '/admin/users',
      label: 'User Management',
      icon: Users,
      roles: ['ADMIN'],
    },
  ];

  const filteredLinks = links.filter(link => 
    user && link.roles.includes(user.role)
  );

  return (
    <div 
      className={cn(
        "border-r h-screen flex flex-col hidden md:flex shadow-2xl z-20 transition-all duration-300 ease-in-out relative",
        "bg-linear-to-b from-slate-900 to-slate-800 text-white", // Vibrant dark theme
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Header */}
      <div className={cn(
        "h-16 flex items-center border-b border-white/10 transition-all duration-300",
        collapsed ? "justify-center px-0" : "px-6"
      )}>
        <div className="h-9 w-9 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30 shrink-0">
            <Shield className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <h1 className="ml-3 text-lg font-bold bg-linear-to-r from-white to-gray-400 bg-clip-text text-transparent whitespace-nowrap overflow-hidden">
            SpareManager
          </h1>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-2 overflow-y-auto overflow-x-hidden">
        {!collapsed && (
          <div className="text-xs font-bold text-gray-400/80 uppercase tracking-wider mb-2 px-3 transition-opacity duration-300">
            Menu
          </div>
        )}
        
        {filteredLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} className="block group">
              <div
                className={cn(
                  'flex items-center rounded-lg transition-all duration-200 cursor-pointer', 
                  collapsed ? "justify-center w-12 h-12 mx-auto" : "w-full px-3 py-2.5",
                  isActive 
                    ? 'bg-linear-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20' 
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                )}
                title={collapsed ? link.label : undefined}
              >
                <Icon className={cn(
                  "shrink-0 transition-colors", 
                  collapsed ? "h-6 w-6" : "h-5 w-5 mr-3"
                )} />
                
                {!collapsed && (
                  <span className="font-medium whitespace-nowrap overflow-hidden text-sm">
                    {link.label}
                  </span>
                )}
                
                {/* Active Indicator for collapsed state */}
                {collapsed && isActive && (
                  <div className="absolute left-0 w-1 h-8 bg-purple-400 rounded-r-full" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>
      
      {/* System Status & Footer */}
      <div className="p-4 border-t border-white/10">
         {!collapsed ? (
            <div className="bg-white/5 rounded-xl border border-white/10 p-3 text-center backdrop-blur-sm">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest mb-1">Status</p>
                <div className="flex items-center justify-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]"></div>
                  <span className="text-xs text-emerald-300 font-bold">Operational</span>
                </div>
            </div>
         ) : (
            <div className="flex justify-center">
                 <div className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" title="System Operational"></div>
            </div>
         )}
      </div>

      {/* Collapse Toggle Button - Absolute positioned on border */}
      <button 
        onClick={toggleSidebar}
        className="absolute -right-3 top-20 bg-white dark:bg-slate-800 text-slate-800 dark:text-gray-200 border border-slate-200 dark:border-slate-700 h-6 w-6 rounded-full flex items-center justify-center shadow-md hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors z-30 ring-0 focus:outline-none"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </div>
  );
}
