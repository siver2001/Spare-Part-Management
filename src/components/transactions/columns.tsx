'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Transaction } from '@/types';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const columns: ColumnDef<Transaction>[] = [
  {
    accessorKey: 'orderNo',
    header: 'Order No',
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => {
      const type = row.getValue('type') as string;
      return (
        <Badge variant={type === 'IN' ? 'default' : 'secondary'} className={type === 'IN' ? 'bg-green-600' : 'bg-orange-600'}>
          {type}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'partName',
    header: 'Part Name',
  },
  {
    accessorKey: 'partNumber',
    header: 'Part Number',
  },
  {
    accessorKey: 'partCondition',
    header: 'Condition',
    cell: ({ row }) => {
        const cond = row.getValue('partCondition') as string;
        return (
            <span className={cond === 'DAMAGED' ? 'text-red-500 font-bold' : ''}>{cond}</span>
        );
    }
  },
  {
    accessorKey: 'quantity',
    header: 'Qty',
    cell: ({ row }) => <div className="font-bold">{row.getValue('quantity')}</div>
  },
  {
    accessorKey: 'reason',
    header: 'Reason',
  },
  {
    accessorKey: 'workOrderNo',
    header: 'Work Order',
  },
  {
    accessorKey: 'inspectorName',
    header: 'Inspector',
  },
  {
    accessorKey: 'performedByDisplayName',
    header: 'Performed By',
  },
  {
    accessorKey: 'performedAt',
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Date
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
    cell: ({ row }) => {
        const date = new Date(row.getValue('performedAt'));
        return <div>{date.toLocaleString()}</div>
    },
    enableSorting: true,
  }
];
