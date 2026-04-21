'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Role } from '@/types';
import { SupabaseService } from '@/services/supabaseService';
import { toast } from 'sonner';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void;
}

export function UserModal({ isOpen, onClose, user, onSuccess }: UserModalProps) {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('USER');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setDisplayName(user.displayName);
      setRole(user.role);
      setIsActive(user.isActive);
      setPassword(user.password || '');
    } else {
      setUsername('');
      setDisplayName('');
      setPassword('');
      setRole('USER');
      setIsActive(true);
    }
  }, [user, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (user) {
        await SupabaseService.updateUser(user.id, { username, displayName, role, isActive, password: password || undefined });
        toast.success('User updated');
      } else {
        await SupabaseService.createUser({ username, displayName, role, isActive, password });
        toast.success('User created');
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{user ? 'Edit User' : 'Create User'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
             <Label className="sm:text-right">Username</Label>
             <Input value={username} onChange={(e) => setUsername(e.target.value)} className="sm:col-span-3" disabled={!!user} />
          </div>
          <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
             <Label className="sm:text-right">Display Name</Label>
             <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="sm:col-span-3" />
          </div>
          <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
             <Label className="sm:text-right">Role</Label>
             <Select value={role} onValueChange={(val: Role) => setRole(val)}>
               <SelectTrigger className="sm:col-span-3">
                 <SelectValue />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="USER">User (Standard)</SelectItem>
                 <SelectItem value="POWER_USER">Power User</SelectItem>
                 <SelectItem value="ADMIN">Admin</SelectItem>
               </SelectContent>
             </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
             <Label className="sm:text-right">Active</Label>
             <Checkbox checked={isActive} onCheckedChange={(c) => setIsActive(!!c)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-4 sm:items-start sm:gap-4">
             <Label className="pt-2 sm:text-right">Password</Label>
             <div className="relative sm:col-span-3">
                 <Input 
                    type={showPassword ? "text" : "password"} 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder={user ? "Leave blank to keep current" : "Required for new user"}
                    required={!user}
                 />
                 <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                 >
                    {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                    ) : (
                        <Eye className="h-4 w-4" />
                    )}
                 </button>
             </div>
          </div>
          <DialogFooter>
             <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
             <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
