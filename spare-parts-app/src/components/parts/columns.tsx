'use client';

import { ColumnDef } from '@tanstack/react-table';
import { SparePart } from '@/types';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, MoreHorizontal, ArrowDownCircle, ArrowUpCircle, Edit, QrCode } from 'lucide-react';
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
          >
            <Edit className="h-4 w-4" />
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
    accessorKey: 'partName',
    header: 'Part Name',
    cell: ({ row }) => <div className="font-medium whitespace-nowrap">{row.getValue('partName')}</div>
  },
  {
    accessorKey: 'partNumber',
    header: 'Part Number',
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => <div className="max-w-[150px] truncate" title={row.getValue('description')}>{row.getValue('description')}</div>
  },
  {
    accessorKey: 'qrCodeValue',
    header: 'QR Code',
    cell: ({ row }) => {
        const val = row.getValue('qrCodeValue') as string;
        return (
            <div className="flex items-center justify-center h-8 w-8 bg-gray-50 rounded-md border border-gray-200" title={`QR: ${val}`}>
                <QrCode className="h-5 w-5 text-gray-700" />
            </div>
        )
    }
  },
  {
    accessorKey: 'binLocation',
    header: 'Bin',
  },
  {
    id: 'stock',
    header: 'Stock (OK/DMG)',
    cell: ({ row }) => {
      const ok = row.original.currentStockOk;
      const dmg = row.original.currentStockDamaged;
      const safety = row.original.safetyStockOk;
      const isLow = ok <= safety;
      return (
        <div className="flex gap-2 text-sm">
          <Badge variant={isLow ? "destructive" : "secondary"}>OK: {ok}</Badge>
          <Badge variant="outline" className="text-gray-500">DMG: {dmg}</Badge>
        </div>
      );
    }
  },
  {
    accessorKey: 'safetyStockOk',
    header: 'Safety',
    cell: ({ row }) => <div className="text-center">{row.getValue('safetyStockOk')}</div>
  },
  {
    accessorKey: 'maxStock',
    header: 'Max',
    cell: ({ row }) => <div className="text-center">{row.getValue('maxStock')}</div>
  },
  {
    accessorKey: 'reorderQuantity',
    header: 'Reorder',
    cell: ({ row }) => <div className="text-center">{row.getValue('reorderQuantity')}</div>
  },
  {
    accessorKey: 'leadTimeDays',
    header: 'Lead Time',
    cell: ({ row }) => <div className="text-center">{row.getValue('leadTimeDays')} days</div>
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <ActionCell part={row.original} refreshData={refreshData} />,
  },
];
