'use client';

import { ColumnDef, Column } from '@tanstack/react-table';
import { SparePart } from '@/types';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ArrowDownCircle, ArrowUpCircle, Edit, QrCode, Trash2, Filter, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { StockActionModal } from './StockActionModal';
import { EditPartModal } from './EditPartModal';
import { PartDetailsModal } from './PartDetailsModal';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';

// Cell Component for Actions to manage ModalState
export function PartActions({
  part,
  refreshData,
  machineOptions,
  layout = 'table',
}: {
  part: SparePart;
  refreshData: () => void;
  machineOptions: string[];
  layout?: 'table' | 'card';
}) {
  const [modalOpen, setModalOpen] = useState<'IN' | 'OUT' | 'EDIT' | 'VIEW' | null>(null);
  const { user } = useAuth();

  const canEdit = user && (user.role === 'ADMIN' || user.role === 'POWER_USER');
  const isCardLayout = layout === 'card';

  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-2', isCardLayout && 'grid grid-cols-2')}>
         <Button 
          variant="outline" 
          size="sm" 
          className={cn(
            'text-indigo-600 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-600 hover:text-white shadow-sm transition-all group',
            isCardLayout ? 'col-span-2 h-9 justify-center px-3' : 'h-8 px-2'
          )}
          onClick={() => setModalOpen('VIEW')}
        >
          <Eye className="mr-1.5 h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-bold">View</span>
        </Button>
        {!isCardLayout && <div className="h-4 w-px bg-gray-200" />}
        <Button 
          variant="outline" 
          size="sm" 
          className={cn(
            'text-green-600 border-green-200 hover:bg-green-50',
            isCardLayout ? 'h-9 justify-center px-3' : 'h-8 px-2'
          )}
          onClick={() => setModalOpen('IN')}
        >
          <ArrowDownCircle className="mr-1 h-3 w-3" />
          IN
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className={cn(
            'text-orange-600 border-orange-200 hover:bg-orange-50',
            isCardLayout ? 'h-9 justify-center px-3' : 'h-8 px-2'
          )}
          onClick={() => setModalOpen('OUT')}
        >
          <ArrowUpCircle className="mr-1 h-3 w-3" />
          OUT
        </Button>
        {canEdit && (
            <Button 
            variant={isCardLayout ? 'outline' : 'ghost'} 
            size="sm" 
            className={cn(
              'text-gray-500 hover:text-gray-900',
              isCardLayout ? 'h-9 justify-center px-3' : 'ml-1 h-8 w-8 p-0'
            )}
            onClick={() => setModalOpen('EDIT')}
            title="Edit"
          >
            <Edit className="h-4 w-4" />
            {isCardLayout && <span>Edit</span>}
          </Button>
        )}
        {(user?.role === 'ADMIN' || user?.role === 'POWER_USER') && (
           <Button 
             variant={isCardLayout ? 'outline' : 'ghost'} 
             size="sm" 
             className={cn(
               'text-red-400 hover:text-red-700 hover:bg-red-50',
               isCardLayout ? 'h-9 justify-center border-red-200 px-3' : 'ml-1 h-8 w-8 p-0'
             )}
             onClick={() => {
                if(confirm('Are you sure you want to delete this part? This cannot be undone.')) {
                   import('@/services/supabaseService').then(({SupabaseService}) => {
                       SupabaseService.deletePart(part.id).then(() => {
                           refreshData();
                       }).catch(e => alert(e.message));
                   })
                }
             }}
             title="Delete"
           >
             <Trash2 className="h-4 w-4" />
             {isCardLayout && <span>Delete</span>}
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
          machineOptions={machineOptions}
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
}

// Filter Header Component
const ColumnHeaderWithFilter = ({ column, title, options, hideSort }: { column: Column<SparePart, unknown>, title: string, options?: string[], hideSort?: boolean }) => {
    return (
        <div className="flex items-center space-x-2">
            {!hideSort ? (
                <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8 data-[state=open]:bg-accent"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    <span>{title}</span>
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ) : (
                <span className="text-sm font-medium px-1">{title}</span>
            )}
            {options && options.length > 0 && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-transparent">
                            <Filter className={`h-3 w-3 ${column.getFilterValue() ? 'text-primary fill-primary' : 'text-muted-foreground'}`} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuItem onClick={() => column.setFilterValue(undefined)}>
                            Clear Filter
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <div className="max-h-60 overflow-y-auto">
                            {options.map((option) => (
                                <DropdownMenuCheckboxItem
                                    key={option}
                                    checked={(column.getFilterValue() as string[])?.includes(option)}
                                    onCheckedChange={(checked) => {
                                        const currentFilter = (column.getFilterValue() as string[]) || [];
                                        if (checked) {
                                            column.setFilterValue([...currentFilter, option]);
                                        } else {
                                            column.setFilterValue(currentFilter.filter((v: string) => v !== option));
                                        }
                                    }}
                                >
                                    {option}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
};

export const createColumns = (refreshData: () => void, allData: SparePart[]): ColumnDef<SparePart>[] => {
  // Predefined stock filter options
  const stockFilterOptions = [
    'Below or Equal to Min',
    'Below Safety',
    'Greater Than or Equal to Safety'
  ];

  const materialTypeFilterOptions = Array.from(
    new Set(
      allData.map((part) => part.materialType).filter((val): val is string => !!val)
    )
  ).sort((a, b) => a.localeCompare(b));

  return [
  {
    accessorKey: 'no',
    header: ({ column }) => <ColumnHeaderWithFilter column={column} title="No." />,
    cell: ({ row }) => <div className="text-center font-medium">{row.getValue('no')}</div>,
  },
  {
    accessorKey: 'qrCodeValue',
    header: 'QR',
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
    header: ({ column }) => <ColumnHeaderWithFilter column={column} title="Bin Location" hideSort />,
    enableSorting: false,
  },
  {
    accessorKey: 'partNumber',
    header: 'Part Number',
    cell: ({ row }) => <div className="font-mono text-sm">{row.getValue('partNumber')}</div>
  },
  {
    accessorKey: 'materialType',
    header: ({ column }) => <ColumnHeaderWithFilter column={column} title="Loại vật tư" options={materialTypeFilterOptions} hideSort />,
    enableSorting: false,
    filterFn: (row, _id, filterValues: string[]) => {
      if (!filterValues || filterValues.length === 0) return true;
      const val = row.original.materialType || '';
      return filterValues.includes(val);
    },
    cell: ({ row }) => <div className="text-sm">{row.original.materialType || '-'}</div>
  },
  {
    accessorKey: 'partName',
    header: 'Part Name',
    cell: ({ row }) => <div className="font-medium whitespace-nowrap">{row.getValue('partName')}</div>
  },
  {
    accessorKey: 'useFor',
    header: 'Use For',
    cell: ({ row }) => (
      <div className="max-w-[180px] truncate text-muted-foreground" title={row.original.useFor || ''}>
        {row.original.useFor || '-'}
      </div>
    )
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
    id: 'stock',
    accessorKey: 'currentStockOk',
    header: ({ column }) => <ColumnHeaderWithFilter column={column} title="Stock" options={stockFilterOptions} hideSort />,
    enableSorting: false,
    filterFn: (row, id, filterValues: string[]) => {
        if (!filterValues || filterValues.length === 0) return true;
        const ok = row.original.currentStockOk;
        const safety = row.original.safetyStockOk;
        const min = row.original.minStock;

        return filterValues.some(val => {
            if (val === 'Below or Equal to Min') return ok <= min;
            if (val === 'Below Safety') return ok < safety;
            if (val === 'Greater Than or Equal to Safety') return ok >= safety;
            return false;
        });
    },
    cell: ({ row }) => {
      const ok = row.original.currentStockOk;
      const damaged = row.original.currentStockDamaged;
      const total = ok + damaged;
      const safety = row.original.safetyStockOk;
      const min = row.original.minStock;
      const max = row.original.maxStock;
      
      // Dynamic coloring logic
      let badgeClass = "bg-green-600 hover:bg-green-700";
      if (ok <= min) badgeClass = "bg-red-600 hover:bg-red-700 animate-pulse";
      else if (ok <= safety) badgeClass = "bg-orange-500 hover:bg-orange-600";
      else if (ok >= max && max > 0) badgeClass = "bg-blue-600 hover:bg-blue-700";

      return (
        <div className="flex flex-col gap-1 w-[110px]">
           {/* Total */}
           <div className="flex justify-between items-center text-xs border-b border-gray-100 pb-1 mb-1">
             <span className="text-gray-500 font-medium text-[10px] uppercase">Total</span>
             <span className="font-bold text-blue-600 text-sm">{total}</span>
           </div>
           
           {/* OK */}
           <div className="flex justify-between items-center">
             <span className="text-[10px] text-gray-500 font-bold mr-2">OK</span>
             <Badge className={`h-5 px-2 min-w-[40px] justify-center ${badgeClass}`}>
               {ok}
             </Badge>
           </div>

           {/* DMG */}
           <div className="flex justify-between items-center">
             <span className="text-[10px] text-gray-500 font-bold">DMG</span>
             <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100 min-w-[40px] text-center">
               {damaged}
             </span>
           </div>
        </div>
      );
    }
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => (
      <PartActions
        part={row.original}
        refreshData={refreshData}
        machineOptions={[]}
      />
    ),
  },
];};
