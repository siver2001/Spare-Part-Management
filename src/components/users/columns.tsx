'use client';

import { ColumnDef } from '@tanstack/react-table';
import { User } from '@/types';
import { Button } from '@/components/ui/button';
import { Edit, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const createColumns = (onEdit: (user: User) => void, onDelete: (user: User) => void): ColumnDef<User>[] => [
  {
    accessorKey: 'username',
    header: 'Username',
  },
  {
    accessorKey: 'displayName',
    header: 'Display Name',
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => {
      const role = row.getValue('role') as string;
      return <Badge variant="outline">{role}</Badge>
    }
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.getValue('isActive') ? 'default' : 'destructive'}>
        {row.getValue('isActive') ? 'Active' : 'Disabled'}
      </Badge>
    )
  },
  {
    accessorKey: 'createdAt',
    header: 'Created At',
    cell: ({ row }) => new Date(row.getValue('createdAt')).toLocaleDateString()
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => onEdit(row.original)} title="Edit User">
            <Edit className="h-4 w-4 mr-1" />
        </Button>
        <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onDelete(row.original)} 
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            title="Delete User"
        >
            <Trash2 className="h-4 w-4 mr-1" />
        </Button>
      </div>
    )
  }
];
