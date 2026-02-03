'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role } from '@/types';
import { SupabaseService } from '@/services/supabaseService';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  login: (username: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const verifySession = async () => {
      const storedUser = localStorage.getItem('session_user');
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        try {
          // Verify user still exists in DB
          const users = await SupabaseService.getUsers();
          const exists = users.find(u => u.id === parsedUser.id);
          if (exists) {
            setUser(exists);
            localStorage.setItem('session_user', JSON.stringify(exists));
          } else {
            // User no longer exists (DB reset?)
            localStorage.removeItem('session_user');
            setUser(null);
          }
        } catch (error) {
          console.error('Session verification failed:', error);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    verifySession();
  }, []);

  const login = async (username: string) => {
    setIsLoading(true);
    try {
      // Login logic: find user by username in Supabase profiles
      const users = await SupabaseService.getUsers();
      const foundUser = users.find((u) => u.username === username);

      if (foundUser) {
        if (!foundUser.isActive) {
          throw new Error('Account is disabled');
        }
        setUser(foundUser);
        localStorage.setItem('session_user', JSON.stringify(foundUser));
        router.push('/');
      } else {
        throw new Error('Invalid username');
      }
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('session_user');
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
