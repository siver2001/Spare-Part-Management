'use client';

import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { DataTable } from "@/components/ui/data-table";
import { createColumns } from "@/components/users/columns";
import { useEffect, useState } from "react";
import { User } from "@/types";
import { SupabaseService } from "@/services/supabaseService";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserModal } from "@/components/users/UserModal";

export default function UsersPage() {
  const [data, setData] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const refreshData = async () => {
    try {
      const users = await SupabaseService.getUsers();
      setData(users);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditingUser(null);
    setModalOpen(true);
  };

  const handleDelete = async (user: User) => {
    if (confirm(`Are you sure you want to delete user ${user.username}?`)) {
        try {
            await SupabaseService.deleteUser(user.id);
            // toast.success('User deleted'); 
            refreshData();
        } catch (error) {
            console.error('Failed to delete user', error);
            alert('Failed to delete user');
        }
    }
  };

  const columns = createColumns(handleEdit, handleDelete);

  return (
    <ProtectedLayout requiredRoles={['ADMIN']}>
      <div className="flex items-center justify-between mb-6">
         <div>
             <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
             <p className="text-muted-foreground">Manage system access and roles.</p>
         </div>
         <Button onClick={handleCreate}>
             <Plus className="h-4 w-4 mr-2" /> Add User
         </Button>
      </div>

      {loading ? (
        <div className="flex h-[400px] items-center justify-center">
           <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      ) : (
        <DataTable columns={columns} data={data} />
      )}

      {modalOpen && (
          <UserModal 
             isOpen={modalOpen} 
             onClose={() => setModalOpen(false)} 
             user={editingUser} 
             onSuccess={refreshData} 
          />
      )}
    </ProtectedLayout>
  );
}
