'use client';

import * as React from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getFilteredRowModel,
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QrCode } from 'lucide-react';
import { QRScannerModal } from './QRScannerModal';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  onSearch?: (value: string) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  onSearch
}: DataTableProps<TData, TValue>) {
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [isScannerOpen, setIsScannerOpen] = React.useState(false);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
  });

  return (
    <div>
      <div className="flex items-center py-4 w-full gap-2">
        <div className="relative max-w-sm w-full flex items-center">
            <Input
            placeholder="Search..."
            value={globalFilter ?? ''}
            onChange={(event) => {
                setGlobalFilter(event.target.value);
                if (onSearch) onSearch(event.target.value);
            }}
            className="pr-10"
            />
             <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsScannerOpen(true)}
                className="absolute right-0 h-full px-3 text-gray-500 hover:text-primary transition-colors hover:bg-transparent"
                title="Scan QR Code"
            >
                <QrCode className="h-4 w-4" />
            </Button>
        </div>
      </div>
      
      <QRScannerModal 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScan={(val) => {
            setGlobalFilter(val);
            if (onSearch) onSearch(val);
            // Optionally play a sound or toast
        }} 
      />
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className="border-primary text-primary hover:bg-primary hover:text-white disabled:opacity-50"
        >
          Previous
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className="bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/20 disabled:opacity-50"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
