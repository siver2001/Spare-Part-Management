'use client';

import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { DataTable } from "@/components/ui/data-table";
import { createColumns } from "@/components/parts/columns";
import { useEffect, useState } from "react";
import { SparePart } from "@/types";
import { MockService } from "@/services/mockData";
import { AddPartModal } from "@/components/parts/AddPartModal";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";

export default function Home() {
  const [data, setData] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const canAdd = user && ['ADMIN', 'POWER_USER'].includes(user.role);

  // Function to refresh data, passed to actions
  const refreshData = async () => {
    // Keep loading state minimal for better UX, or show spinner
    try {
      const parts = await MockService.getParts();
      setData(parts);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const columns = createColumns(refreshData);

  return (
    <ProtectedLayout>
      <div className="flex flex-col space-y-4">
        {/* Compact Header Area */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-4 rounded-xl shadow-lg border-t-4 border-t-indigo-500 border-x border-b border-gray-100/50">
          <div className="flex items-center justify-between w-full md:w-auto">
             <div>
                <h1 className="text-xl font-bold tracking-tight text-primary">Spare Parts Inventory</h1>
                <p className="text-xs text-muted-foreground">Manage detailed spare parts list and stock levels.</p>
             </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-end md:items-center gap-3">
             {/* Summary Cards */}
            {!loading && (
               <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-linear-to-r from-blue-500 to-cyan-400 text-white shadow-md shadow-blue-500/10 min-w-[120px]">
                      <div>
                         <p className="text-[10px] opacity-90 font-medium uppercase tracking-wider">Total</p>
                         <p className="text-lg font-bold leading-none">{data.length}</p>
                      </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-linear-to-r from-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/10 min-w-[120px]">
                       <div>
                         <p className="text-[10px] opacity-90 font-medium uppercase tracking-wider">Low Stock</p>
                         <p className="text-lg font-bold leading-none">{data.filter(p => p.currentStockOk <= p.safetyStockOk).length}</p>
                      </div>
                  </div>

               </div>
            )}
            
            {canAdd && (
                <Button onClick={() => setIsAddModalOpen(true)} className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 shrink-0">
                    <Plus className="mr-2 h-4 w-4" /> Add Part
                </Button>
            )}
          </div>
        </div>

        {/* Data Table Area - Maximized */}
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-xl border border-gray-100 p-0 overflow-hidden flex-1 ring-1 ring-black/5">
           {loading ? (
             <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
             </div>
           ) : (
              <DataTable columns={columns} data={data} searchKey="partName" onSearch={() => {}} />
           )}
        </div>
      </div>
      
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
