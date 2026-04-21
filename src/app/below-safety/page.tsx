'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SupabaseService } from '@/services/supabaseService';
import { SparePart } from '@/types';
import { getPartsBelowSafety, getSafetyGap, isCriticalPart } from '@/lib/partSafety';

const PAGE_SIZE = 10;

export default function BelowSafetyPage() {
  const [data, setData] = useState<SparePart[]>(() => SupabaseService.peekParts() || []);
  const [loading, setLoading] = useState(() => !SupabaseService.peekParts());
  const [page, setPage] = useState(1);

  const refreshData = async (showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const parts = await SupabaseService.getParts({ forceRefresh: true });
      setData(parts);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData(data.length === 0);
  }, []);

  const belowSafetyParts = getPartsBelowSafety(data);
  const totalPages = Math.max(1, Math.ceil(belowSafetyParts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const priorityParts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return belowSafetyParts.slice(start, start + PAGE_SIZE);
  }, [belowSafetyParts, currentPage]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const startItem = belowSafetyParts.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = belowSafetyParts.length === 0 ? 0 : startItem + priorityParts.length - 1;

  return (
    <ProtectedLayout>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-gray-100/80 bg-white/85 p-4 shadow-lg backdrop-blur-md sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">Safety Watch</p>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Below Safety</h1>
            </div>

            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Spare Parts
              </Link>
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-white/90 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
                <TriangleAlert className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Priority Watchlist</h2>
                <p className="text-xs text-muted-foreground">Hien thi toi da 10 item moi trang, sap xep theo muc do uu tien.</p>
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-100">
              Showing {startItem}-{endItem} / {belowSafetyParts.length}
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading watchlist...</div>
          ) : (
            <div className="mt-4 space-y-2.5">
              {priorityParts.length > 0 ? (
                priorityParts.map((part, index) => {
                  const gap = getSafetyGap(part);
                  const isCritical = isCriticalPart(part);
                  const displayIndex = (currentPage - 1) * PAGE_SIZE + index + 1;

                  return (
                    <div key={part.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="border-slate-300 bg-white text-[11px] text-slate-700">
                              #{displayIndex}
                            </Badge>
                            {isCritical ? (
                              <Badge className="bg-rose-600 text-[11px] text-white hover:bg-rose-700">Critical</Badge>
                            ) : (
                              <Badge className="bg-amber-500 text-[11px] text-white hover:bg-amber-600">Below Safety</Badge>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{part.partName}</p>
                            <p className="truncate text-xs text-slate-500">{part.partNumber} • Bin {part.binLocation || 'N/A'}</p>
                          </div>
                        </div>

                        <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                          <div className="rounded-lg bg-linear-to-br from-sky-50 to-cyan-50 px-3 py-2 shadow-sm ring-1 ring-sky-100">
                            <p className="text-[10px] uppercase tracking-[0.15em] text-sky-500">Current</p>
                            <p className="text-sm font-bold text-sky-900">{part.currentStockOk}</p>
                          </div>
                          <div className="rounded-lg bg-linear-to-br from-amber-50 to-orange-50 px-3 py-2 shadow-sm ring-1 ring-amber-100">
                            <p className="text-[10px] uppercase tracking-[0.15em] text-amber-500">Safety</p>
                            <p className="text-sm font-bold text-amber-900">{part.safetyStockOk}</p>
                          </div>
                          <div className="rounded-lg bg-linear-to-br from-rose-50 to-pink-50 px-3 py-2 shadow-sm ring-1 ring-rose-100">
                            <p className="text-[10px] uppercase tracking-[0.15em] text-rose-500">Gap</p>
                            <p className="text-sm font-bold text-rose-700">-{gap}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-6 text-center text-sm text-emerald-900">
                  No items are below safety stock right now.
                </div>
              )}
            </div>
          )}

          {!loading && belowSafetyParts.length > PAGE_SIZE ? (
            <div className="pb-safe sticky bottom-0 mt-4 flex flex-col gap-2 border-t border-slate-100 bg-white/95 pt-4 backdrop-blur sm:flex-row sm:items-center sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={currentPage === 1}
                className="w-full border-primary text-primary hover:bg-primary hover:text-white disabled:opacity-50 sm:w-auto"
              >
                Previous
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="w-full bg-primary text-white shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </ProtectedLayout>
  );
}
