'use client';

import { ReactNode } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SparePart } from '@/types';

interface InventoryPageViewProps {
  title: string;
  description: string;
  data: SparePart[];
  columns: ColumnDef<SparePart>[];
  loading: boolean;
  onFilteredDataChange: (data: SparePart[]) => void;
  metrics?: ReactNode;
  actions?: ReactNode;
  spotlight?: ReactNode;
  tableTitle?: string;
  tableDescription?: string;
  emptyState?: ReactNode;
  mobileCardRender?: (part: SparePart) => ReactNode;
}

export function InventoryPageView({
  title,
  description,
  data,
  columns,
  loading,
  onFilteredDataChange,
  metrics,
  actions,
  spotlight,
  tableTitle = 'Inventory List',
  tableDescription = 'Search, filter, and update spare parts from this view.',
  emptyState,
  mobileCardRender,
}: InventoryPageViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-100/80 bg-white/85 p-4 shadow-lg backdrop-blur-md sm:p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-600">Inventory Control</p>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          {actions ? (
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {actions}
            </div>
          ) : null}
        </div>

        {metrics ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics}</div> : null}
      </div>

      {spotlight}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white/90 shadow-xl ring-1 ring-black/5 backdrop-blur-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5">
          <h2 className="text-base font-semibold text-slate-900">{tableTitle}</h2>
          <p className="text-sm text-muted-foreground">{tableDescription}</p>
        </div>

        <div className="p-3 sm:p-5">
          {loading ? (
            <div className="flex h-[400px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            </div>
          ) : data.length > 0 ? (
            <DataTable
              columns={columns}
              data={data}
              searchKey="part name"
              onFilteredDataChange={onFilteredDataChange}
              mobileCardRender={mobileCardRender}
            />
          ) : (
            emptyState ?? (
              <div className="flex h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 px-6 text-center">
                <h3 className="text-lg font-semibold text-emerald-900">All spare parts are above safety stock</h3>
                <p className="mt-2 max-w-xl text-sm text-emerald-800/80">
                  There are no items to show in this view right now. Once stock drops below safety level, the alert list will appear here.
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
