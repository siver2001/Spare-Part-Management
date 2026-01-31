'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Shield, Info } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error('Please enter both username and password');
      return;
    }

    setLoading(true);
    try {
      // Mock password check - accept anything for now as per "Mock" requirement, 
      // but strictly verify username exists in mock DB
      await login(username);
      toast.success('Logged in successfully');
    } catch (error: any) {
      toast.error(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (

    <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-indigo-500 via-purple-500 to-pink-500 relative overflow-hidden">
      {/* Decorative Circles */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-white/30 rounded-full mix-blend-overlay filter blur-xl animate-pulse"></div>
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-yellow-300/30 rounded-full mix-blend-overlay filter blur-xl animate-pulse delay-1000"></div>

      <Card className="w-[400px] border-0 shadow-2xl bg-white/90 backdrop-blur-md z-10">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto bg-primary/10 w-16 h-16 flex items-center justify-center rounded-full mb-4">
             <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold bg-linear-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            SpareManager
          </CardTitle>
          <CardDescription className="text-gray-500">
            Secure Warehouse Management System
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input 
                id="username" 
                placeholder="Enter your username" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                className="bg-white/50 border-gray-200 focus:border-primary focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/50 border-gray-200 focus:border-primary focus:ring-primary/20"
              />
            </div>
            
            <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 text-xs text-blue-700 space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <Info className="h-3 w-3" /> Demo Credentials:
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                 <span className="bg-white rounded px-1 py-0.5 border shadow-sm cursor-pointer hover:bg-blue-50" onClick={() => {setUsername('admin'); setPassword('123')}}>admin</span>
                 <span className="bg-white rounded px-1 py-0.5 border shadow-sm cursor-pointer hover:bg-blue-50" onClick={() => {setUsername('power'); setPassword('123')}}>power</span>
                 <span className="bg-white rounded px-1 py-0.5 border shadow-sm cursor-pointer hover:bg-blue-50" onClick={() => {setUsername('user'); setPassword('123')}}>user</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" disabled={loading} className="w-full bg-linear-to-r from-primary to-purple-600 hover:opacity-90 transition-opacity shadow-lg shadow-primary/20">
              {loading ? 'Authenticating...' : 'Sign In'}
            </Button>
            <p className="text-xs text-center text-gray-400">
              © 2024 Spare Parts Management. All rights reserved.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
