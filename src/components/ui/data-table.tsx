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
import { cn } from '@/lib/utils';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  onSearch?: (value: string) => void;
  onFilteredDataChange?: (data: TData[]) => void;
  searchPlaceholder?: string;
  toolbarActions?: React.ReactNode;
  mobileCardRender?: (row: TData) => React.ReactNode;
  emptyMessage?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  onSearch,
  onFilteredDataChange,
  searchPlaceholder,
  toolbarActions,
  mobileCardRender,
  emptyMessage = 'No results.',
}: DataTableProps<TData, TValue>) {
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [isScannerOpen, setIsScannerOpen] = React.useState(false);
  const lastFilteredRowsRef = React.useRef<TData[] | null>(null);

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
    autoResetPageIndex: false,
  });

  const filteredRows = table.getFilteredRowModel().rows.map((row) => row.original);
  const currentRows = table.getRowModel().rows;
  const totalPages = Math.max(table.getPageCount(), 1);
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? (searchKey ? `Search ${searchKey}...` : 'Search...');

  React.useEffect(() => {
    if (!onFilteredDataChange) return;

    const previousRows = lastFilteredRowsRef.current;
    const hasChanged =
      !previousRows ||
      previousRows.length !== filteredRows.length ||
      previousRows.some((row, index) => !Object.is(row, filteredRows[index]));

    if (!hasChanged) {
      return;
    }

    lastFilteredRowsRef.current = filteredRows;
    onFilteredDataChange(filteredRows);
  }, [filteredRows, onFilteredDataChange]);

  return (
    <div className="space-y-4">
      <div className="flex w-full flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex w-full items-center sm:max-w-sm">
            <Input
            placeholder={resolvedSearchPlaceholder}
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
        {toolbarActions ? (
          <div className="flex flex-wrap items-center gap-2">
            {toolbarActions}
          </div>
        ) : null}
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
      <div className={cn('rounded-md border bg-white', mobileCardRender && 'hidden md:block')}>
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
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {mobileCardRender ? (
        <div className="space-y-3 md:hidden">
          {currentRows.length ? (
            currentRows.map((row) => (
              <div key={row.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                {mobileCardRender(row.original)}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed bg-white px-4 py-10 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {totalPages}
        </p>
        <div className="flex items-center justify-end gap-2">
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
    </div>
  );
}
