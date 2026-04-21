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
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";

export default function UsersPage() {
  const { user } = useAuth();
  const [data, setData] = useState<User[]>(() => {
    return SupabaseService.peekUsers() || [];
  });
  const [loading, setLoading] = useState(() => {
    return !SupabaseService.peekUsers();
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // Deletion state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const refreshData = async (showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const users = await SupabaseService.getUsers({ forceRefresh: true });
      setData(users);
    } catch (error) {
      console.error(error);
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData(data.length === 0);
    // Only run the initial fetch on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditingUser(null);
    setModalOpen(true);
  };

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    
    if (user && user.id === userToDelete.id) {
      toast.error('You cannot delete your own account.');
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      return;
    }

    setIsDeleting(true);
    try {
      const result = await SupabaseService.deleteUser(userToDelete.id);

      if (result.mode === 'deleted') {
        toast.success(`User ${userToDelete.username} deleted successfully`);
      } else {
        toast.info(result.reason || `User ${userToDelete.username} was disabled because historical records still reference this account.`);
      }

      refreshData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update user status.';
      toast.error(message);
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const columns = createColumns(handleEdit, handleDeleteClick);
  const renderUserCard = (targetUser: User) => (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{targetUser.displayName}</p>
          <p className="truncate text-sm text-slate-500">@{targetUser.username}</p>
        </div>
        <Badge variant={targetUser.isActive ? 'default' : 'destructive'}>
          {targetUser.isActive ? 'Active' : 'Disabled'}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{targetUser.role}</Badge>
        <Badge variant="outline">Created {new Date(targetUser.createdAt).toLocaleDateString()}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
        <Button variant="outline" className="h-9 justify-center" onClick={() => handleEdit(targetUser)}>
          Edit
        </Button>
        <Button
          variant="outline"
          className="h-9 justify-center border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => handleDeleteClick(targetUser)}
        >
          Delete
        </Button>
      </div>
    </div>
  );

  return (
    <ProtectedLayout requiredRoles={['ADMIN']}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
         <div>
             <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
             <p className="text-muted-foreground">Manage system access and roles.</p>
         </div>
         <Button onClick={handleCreate} className="w-full sm:w-auto">
             <Plus className="h-4 w-4 mr-2" /> Add User
         </Button>
      </div>

      {loading ? (
        <div className="flex h-[400px] items-center justify-center">
           <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      ) : (
        <DataTable columns={columns} data={data} searchKey="username" mobileCardRender={renderUserCard} />
      )}

      {modalOpen && (
          <UserModal 
             isOpen={modalOpen} 
             onClose={() => setModalOpen(false)} 
             user={editingUser} 
             onSuccess={refreshData} 
          />
      )}

      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => !isDeleting && setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete User"
        description={`Are you sure you want to delete user "${userToDelete?.username}"? If this account already has transaction history, the system will disable it instead of deleting it to keep historical data intact.`}
        confirmText="Delete"
        variant="destructive"
        isLoading={isDeleting}
      />
    </ProtectedLayout>
  );
}
