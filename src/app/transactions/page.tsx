'use client';

import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "@/components/transactions/columns";
import { useEffect, useState } from "react";
import { Transaction } from "@/types";
import { SupabaseService } from "@/services/supabaseService";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TransactionsPage() {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshData = async () => {
    try {
      const txs = await SupabaseService.getTransactions();
      setData(txs);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const dataIn = data.filter(t => t.type === 'IN');
  const dataOut = data.filter(t => t.type === 'OUT');

  return (
    <ProtectedLayout>
      <div className="mb-6">
         <h1 className="text-2xl font-bold tracking-tight">Transaction History</h1>
         <p className="text-muted-foreground">Log of all stock movements (auto-cleared after 365 days).</p>
      </div>

      {loading ? (
        <div className="flex h-[400px] items-center justify-center">
           <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      ) : (
        <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger 
                    value="all"
                    className="data-[state=active]:bg-gray-700 data-[state=active]:text-white font-semibold transition-all"
                >
                    All Transactions
                </TabsTrigger>
                <TabsTrigger 
                    value="in"
                    className="data-[state=active]:bg-green-600 data-[state=active]:text-white font-semibold transition-all"
                >
                    Inbound (IN)
                </TabsTrigger>
                <TabsTrigger 
                    value="out"
                    className="data-[state=active]:bg-red-600 data-[state=active]:text-white font-semibold transition-all"
                >
                    Outbound (OUT)
                </TabsTrigger>
            </TabsList>
            <TabsContent value="all">
                 <DataTable columns={columns} data={data} searchKey="orderNo" />
            </TabsContent>
            <TabsContent value="in">
                 <DataTable columns={columns} data={dataIn} searchKey="orderNo" />
            </TabsContent>
            <TabsContent value="out">
                 <DataTable columns={columns} data={dataOut} searchKey="orderNo" />
            </TabsContent>
        </Tabs>
      )}
    </ProtectedLayout>
  );
}
