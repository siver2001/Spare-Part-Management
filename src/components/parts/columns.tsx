'use client';

import { ColumnDef } from '@tanstack/react-table';
import { SparePart } from '@/types';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, MoreHorizontal, ArrowDownCircle, ArrowUpCircle, Edit, QrCode, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { StockActionModal } from './StockActionModal';
import { EditPartModal } from './EditPartModal';
import { PartDetailsModal } from './PartDetailsModal';
import { useAuth } from '@/contexts/AuthContext';

// Cell Component for Actions to manage ModalState
const ActionCell = ({ part, refreshData }: { part: SparePart, refreshData: () => void }) => {
  const [modalOpen, setModalOpen] = useState<'IN' | 'OUT' | 'EDIT' | 'VIEW' | null>(null);
  const { user } = useAuth();

  const canEdit = user && ['ADMIN', 'POWER_USER'].includes(user.role);

  return (
    <>
      <div className="flex items-center gap-2">
         <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          onClick={() => setModalOpen('VIEW')}
        >
          <span className="text-xs font-semibold">View</span>
        </Button>
        <div className="h-4 w-px bg-gray-200" />
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 px-2 text-green-600 border-green-200 hover:bg-green-50"
          onClick={() => setModalOpen('IN')}
        >
          <ArrowDownCircle className="mr-1 h-3 w-3" />
          IN
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 px-2 text-orange-600 border-orange-200 hover:bg-orange-50"
          onClick={() => setModalOpen('OUT')}
        >
          <ArrowUpCircle className="mr-1 h-3 w-3" />
          OUT
        </Button>
        {canEdit && (
            <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0 ml-1 text-gray-500 hover:text-gray-900"
            onClick={() => setModalOpen('EDIT')}
            title="Edit"
          >
            <Edit className="h-4 w-4" />
          </Button>
        )}
        {(user?.role === 'ADMIN' || user?.role === 'POWER_USER') && (
           <Button 
             variant="ghost" 
             size="sm" 
             className="h-8 w-8 p-0 ml-1 text-red-400 hover:text-red-700 hover:bg-red-50"
             onClick={() => {
                if(confirm('Are you sure you want to delete this part? This cannot be undone.')) {
                    // Call delete service directly (quick inline for now, ideally via function)
                   import('@/services/supabaseService').then(({SupabaseService}) => {
                       SupabaseService.deletePart(part.id).then(() => {
                           refreshData();
                           // toast.success('Deleted'); // Need to import toast or pass it
                       }).catch(e => alert(e.message));
                   })
                }
             }}
             title="Delete"
           >
             <Trash2 className="h-4 w-4" /> 
           </Button>
        )}
      </div>

      {modalOpen === 'IN' && (
        <StockActionModal 
          isOpen={true} 
          onClose={() => setModalOpen(null)} 
          type="IN" 
          part={part} 
          onSuccess={refreshData}
        />
      )}
      {modalOpen === 'OUT' && (
        <StockActionModal 
          isOpen={true} 
          onClose={() => setModalOpen(null)} 
          type="OUT" 
          part={part} 
          onSuccess={refreshData}
        />
      )}
      {modalOpen === 'EDIT' && (
        <EditPartModal 
          isOpen={true} 
          onClose={() => setModalOpen(null)} 
          part={part} 
          onSuccess={refreshData}
        />
      )}
      {modalOpen === 'VIEW' && (
        <PartDetailsModal 
          isOpen={true} 
          onClose={() => setModalOpen(null)} 
          part={part} 
        />
      )}
    </>
  );
};

export const createColumns = (refreshData: () => void): ColumnDef<SparePart>[] => [
  {
    accessorKey: 'no',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          No.
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="text-center font-medium">{row.getValue('no')}</div>,
    enableSorting: true,
  },
  {
    accessorKey: 'qrCodeValue',
    header: 'QR Code',
    cell: ({ row }) => {
        const val = row.getValue('qrCodeValue') as string;
        if (!val) return <span className="text-gray-300">-</span>;
        return (
            <div className="flex items-center justify-center h-8 w-8 bg-gray-50 rounded-md border border-gray-200 mx-auto" title={`QR: ${val}`}>
                <QrCode className="h-5 w-5 text-gray-700" />
            </div>
        )
    }
  },
  {
    accessorKey: 'binLocation',
    header: 'Bin Location',
  },
  {
    accessorKey: 'partNumber',
    header: 'Part Number',
    cell: ({ row }) => <div className="font-mono text-sm">{row.getValue('partNumber')}</div>
  },
  {
    accessorKey: 'partName',
    header: 'Part Name',
    cell: ({ row }) => <div className="font-medium whitespace-nowrap">{row.getValue('partName')}</div>
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => <div className="max-w-[150px] truncate text-muted-foreground" title={row.getValue('description') || ''}>{row.getValue('description') || '-'}</div>
  },
  {
    accessorKey: 'costCenter',
    header: 'Cost Center',
    cell: ({ row }) => <div className="text-center">{row.getValue('costCenter') || '-'}</div>
  },
  {
    accessorKey: 'useFor',
    header: 'Use For',
    cell: ({ row }) => <div className="max-w-[120px] truncate" title={row.getValue('useFor') || ''}>{row.getValue('useFor') || '-'}</div>
  },
  {
    id: 'stock',
    accessorKey: 'currentStockOk', // Use accessor for sorting
    header: 'Current Stock',
    cell: ({ row }) => {
      const ok = row.original.currentStockOk;
      const safety = row.original.safetyStockOk;
      const min = row.original.minStock;
      
      // "Safety is for safe quantity, if spare part > that number then ok"
      const isSafe = ok > safety;
      const isCritical = ok < min;

      return (
        <div className="flex flex-col items-center">
           <Badge 
             className={
               isCritical ? "bg-red-600 hover:bg-red-700" : 
               !isSafe ? "bg-yellow-500 hover:bg-yellow-600 text-black" : 
               "bg-green-600 hover:bg-green-700"
             }
           >
             {ok}
           </Badge>
           {/* Optional: Show Damaged if > 0 in small text */}
           {row.original.currentStockDamaged > 0 && (
             <span className="text-[10px] text-red-500 font-semibold mt-1">
               (+{row.original.currentStockDamaged} DMG)
             </span>
           )}
        </div>
      );
    }
  },
  {
    accessorKey: 'safetyStockOk',
    header: 'Safety',
    cell: ({ row }) => <div className="text-center text-gray-600">{row.getValue('safetyStockOk')}</div>
  },
  {
    accessorKey: 'maxStock',
    header: 'Max',
    cell: ({ row }) => <div className="text-center text-gray-500">{row.getValue('maxStock')}</div>
  },
  {
    accessorKey: 'minStock',
    header: 'Min',
    cell: ({ row }) => <div className="text-center text-gray-500">{row.getValue('minStock')}</div>
  },
  {
    accessorKey: 'reorderQuantity',
    header: 'Reorder',
    cell: ({ row }) => <div className="text-center text-gray-500">{row.getValue('reorderQuantity')}</div>
  },
  {
    accessorKey: 'leadTimeDays',
    header: 'Lead Time',
    cell: ({ row }) => <div className="text-center text-gray-500">{row.getValue('leadTimeDays')}</div>
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <ActionCell part={row.original} refreshData={refreshData} />,
  },
];
