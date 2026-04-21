'use client';

import { ProtectedLayout } from "@/components/layout/ProtectedLayout";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "@/components/transactions/columns";
import { useEffect, useState } from "react";
import { Transaction } from "@/types";
import { SupabaseService } from "@/services/supabaseService";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function TransactionsPage() {
  const [data, setData] = useState<Transaction[]>(() => SupabaseService.peekTransactions() || []);
  const [loading, setLoading] = useState(() => !SupabaseService.peekTransactions());

  const refreshData = async (showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const txs = await SupabaseService.getTransactions({ forceRefresh: true });
      setData(txs);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData(data.length === 0);
  }, []);

  const dataIn = data.filter(t => t.type === 'IN');
  const dataOut = data.filter(t => t.type === 'OUT');
  const renderTransactionCard = (transaction: Transaction) => (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{transaction.partName}</p>
          <p className="truncate font-mono text-xs text-slate-500">{transaction.partNumber}</p>
        </div>
        <Badge className={transaction.type === 'IN' ? 'bg-green-600' : 'bg-orange-600'}>
          {transaction.type}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Quantity</p>
          <p className="font-semibold text-slate-900">{transaction.quantity}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Condition</p>
          <p className="font-semibold text-slate-900">{transaction.partCondition}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Order</p>
          <p className="font-semibold text-slate-900">{transaction.orderNo}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Performed By</p>
          <p className="font-semibold text-slate-900">{transaction.performedByDisplayName}</p>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">Date</p>
        <p className="mt-1 font-medium text-slate-900">
          {new Date(transaction.performedAt).toLocaleString()}
        </p>
        {transaction.reason ? (
          <>
            <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Reason</p>
            <p className="mt-1 text-slate-700">{transaction.reason}</p>
          </>
        ) : null}
      </div>
    </div>
  );

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
            <TabsList className="mb-4 grid w-full grid-cols-1 gap-2 bg-transparent p-0 sm:grid-cols-3 sm:bg-muted sm:p-[3px]">
                <TabsTrigger 
                    value="all"
                    className="data-[state=active]:bg-gray-700 data-[state=active]:text-white font-semibold transition-all"
                >
                    <span className="sm:hidden">All</span>
                    <span className="hidden sm:inline">All Transactions</span>
                </TabsTrigger>
                <TabsTrigger 
                    value="in"
                    className="data-[state=active]:bg-green-600 data-[state=active]:text-white font-semibold transition-all"
                >
                    <span className="sm:hidden">Inbound</span>
                    <span className="hidden sm:inline">Inbound (IN)</span>
                </TabsTrigger>
                <TabsTrigger 
                    value="out"
                    className="data-[state=active]:bg-red-600 data-[state=active]:text-white font-semibold transition-all"
                >
                    <span className="sm:hidden">Outbound</span>
                    <span className="hidden sm:inline">Outbound (OUT)</span>
                </TabsTrigger>
            </TabsList>
            <TabsContent value="all">
                 <DataTable columns={columns} data={data} searchKey="order number" mobileCardRender={renderTransactionCard} />
            </TabsContent>
            <TabsContent value="in">
                 <DataTable columns={columns} data={dataIn} searchKey="order number" mobileCardRender={renderTransactionCard} />
            </TabsContent>
            <TabsContent value="out">
                 <DataTable columns={columns} data={dataOut} searchKey="order number" mobileCardRender={renderTransactionCard} />
            </TabsContent>
        </Tabs>
      )}
    </ProtectedLayout>
  );
}
