'use client';

import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { InventoryPageView } from "@/components/parts/InventoryPageView";
import { createColumns } from "@/components/parts/columns";
import { useEffect, useState } from "react";
import { SparePart } from "@/types";
import { SupabaseService } from "@/services/supabaseService";
import { AddPartModal } from "@/components/parts/AddPartModal";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowRight, Package, Plus, TriangleAlert } from "lucide-react";
import { ExcelActions } from "@/components/parts/ExcelActions";
import { ImportGoodsReport } from "@/components/parts/ImportGoodsReport";
import { getPartsBelowSafety, isCriticalPart } from "@/lib/partSafety";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { PartActions } from "@/components/parts/columns";
import { cn } from "@/lib/utils";

export default function Home() {
  const cachedPartsRef = useRef<SparePart[] | null>(SupabaseService.peekParts());
  const [data, setData] = useState<SparePart[]>(cachedPartsRef.current || []);
  const [filteredData, setFilteredData] = useState<SparePart[]>(cachedPartsRef.current || []);
  const [loading, setLoading] = useState(!cachedPartsRef.current);
  const { user } = useAuth();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const canAdd = user && (user.role === 'ADMIN' || user.role === 'POWER_USER');

  const refreshData = async (showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const parts = await SupabaseService.getParts({ forceRefresh: true });
      setData(parts);
      setFilteredData(parts);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData(!cachedPartsRef.current);
  }, []);

  const columns = createColumns(refreshData, data);
  const belowSafetyParts = getPartsBelowSafety(data);
  const criticalParts = data.filter(isCriticalPart);
  const machineOptions = Array.from(
    new Set(data.flatMap((part) => part.machines || []).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const renderPartMobileCard = (part: SparePart) => {
    const machines = part.machines || [];
    const stockTone =
      part.currentStockOk <= part.minStock
        ? "bg-red-50 text-red-700 border-red-200"
        : part.currentStockOk < part.safetyStockOk
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200";

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">{part.partName}</p>
            <p className="truncate font-mono text-xs text-slate-500">{part.partNumber}</p>
          </div>
          <div className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", stockTone)}>
            OK {part.currentStockOk}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Bin</p>
            <p className="font-medium text-slate-900">{part.binLocation || '-'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Safety</p>
            <p className="font-medium text-slate-900">{part.safetyStockOk}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Damaged</p>
            <p className="font-medium text-slate-900">{part.currentStockDamaged}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Reorder</p>
            <p className="font-medium text-slate-900">{part.reorderQuantity}</p>
          </div>
        </div>

        {machines.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {machines.map((machine) => (
              <Badge key={machine} variant="outline" className="bg-slate-50 text-slate-700">
                {machine}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="border-t border-slate-100 pt-4">
          <PartActions
            part={part}
            refreshData={refreshData}
            machineOptions={machineOptions}
            layout="card"
          />
        </div>
      </div>
    );
  };

  return (
    <ProtectedLayout>
      <InventoryPageView
        title="Spare Parts Inventory"
        description="Manage detailed spare parts list, watch risk levels, and move quickly from overview to action."
        data={data}
        columns={columns}
        loading={loading}
        onFilteredDataChange={setFilteredData}
        actions={
          <>
            {user && (user.role === 'ADMIN' || user.role === 'POWER_USER') && (
              <>
                <ImportGoodsReport existingParts={data} onImportSuccess={refreshData} />
                <ExcelActions data={filteredData} onImportSuccess={refreshData} />
              </>
            )}

            {canAdd && (
              <Button onClick={() => setIsAddModalOpen(true)} className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 shrink-0">
                <Plus className="mr-2 h-4 w-4" /> Add Part
              </Button>
            )}
          </>
        }
        metrics={
          <>
            <div className="rounded-2xl bg-linear-to-r from-sky-500 to-cyan-400 p-4 text-white shadow-md shadow-sky-500/15">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-90">Total Parts</p>
              <div className="mt-3 flex items-end justify-between">
                <p className="text-3xl font-bold leading-none">{data.length}</p>
                <Package className="h-8 w-8 opacity-80" />
              </div>
            </div>

            <div className="rounded-2xl bg-linear-to-r from-amber-500 to-orange-500 p-4 text-white shadow-md shadow-amber-500/15">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-90">Below Safety</p>
              <div className="mt-3 flex items-end justify-between">
                <p className="text-3xl font-bold leading-none">{belowSafetyParts.length}</p>
                <TriangleAlert className="h-8 w-8 opacity-80" />
              </div>
            </div>

            <div className="rounded-2xl bg-linear-to-r from-rose-500 to-pink-500 p-4 text-white shadow-md shadow-rose-500/15">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-90">Critical</p>
              <div className="mt-3 flex items-end justify-between">
                <p className="text-3xl font-bold leading-none">{criticalParts.length}</p>
                <ArrowRight className="h-8 w-8 opacity-80" />
              </div>
            </div>

            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/80 p-4 text-indigo-950 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">Watchlist</p>
              <p className="mt-3 text-sm leading-6 text-indigo-950/80">
                Use the new <span className="font-semibold">Below Safety</span> menu to focus only on risky items and prepare reorder decisions faster.
              </p>
            </div>
          </>
        }
        tableTitle="All Spare Parts"
        tableDescription="This is the full inventory workspace. Use filters for machines, stock status, and quick actions per part."
        mobileCardRender={renderPartMobileCard}
      />
      
      {/* Add Part Modal */}
      {isAddModalOpen && (
        <AddPartModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            onSuccess={refreshData}
        />
      )}
    </ProtectedLayout>
  );
}
