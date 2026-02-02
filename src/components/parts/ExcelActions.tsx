'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SupabaseService } from '@/services/supabaseService';
import { SparePart } from '@/types';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from 'lucide-react';

interface ExcelActionsProps {
  onImportSuccess: () => void;
  data: SparePart[]; // For export
}

export function ExcelActions({ onImportSuccess, data }: ExcelActionsProps) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    try {
      const exportData = data.map((p, index) => ({
        'NO.': p.no || index + 1,
        'QR Code': p.qrCodeValue || '',
        'Bin Location': p.binLocation || '',
        'Part Number': p.partNumber || '',
        'Part Name': p.partName || '',
        'Description': p.description || '',
        'Cost Center': p.costCenter || '',
        'Use For': p.useFor || '',
        'Current Stock': p.currentStockOk || 0,
        'Safety': p.safetyStockOk || 0,
        'Max': p.maxStock || 0,
        'Min': p.minStock || 0,
        'Reorder': p.reorderQuantity || 0,
        'Lead Time': p.leadTimeDays || 0,
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
      XLSX.writeFile(wb, `Spare_Parts_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Inventory exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const dataBuffer = evt.target?.result;
        const wb = XLSX.read(dataBuffer, { type: 'array' });
        
        let bestSheet = { name: '', score: 0, parts: [] as any[] };

        // Keywords to map columns - based on user's specific request
        const mappingKeys = {
          partName: ['PART NAME', 'Part Name', 'Tên phụ tùng'],
          partNumber: ['Part number', 'PART NUMBER', 'Mã phụ tùng'],
          description: ['DESCRIPTION', 'Mô tả', 'Thông số kỹ thuật'],
          binLocation: ['Bin Location', 'Bin', 'Vị trí'],
          qrCodeValue: ['QR Code', 'QR'],
          costCenter: ['Cost center', 'Cost Center', 'CC'],
          useFor: ['Use For', 'Dùng cho', 'Máy sử dụng'],
          currentStock: ['Current Stock', 'Stock OK', 'Tồn kho'],
          safetyStock: ['Stock number', 'Safety Stock', 'Safety', 'An toàn'],
          leadTime: ['Lead Time', 'LeadTime', 'Thời gian giao hàng'],
          maxStock: ['Max Stock', 'Max'],
          minStock: ['Min Stock', 'Min'],
          reorderQty: ['Reorder Quantity', 'Reorder']
        };

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(ws) as any[];

          if (jsonData.length === 0) continue;

          // Score this sheet based on how many required columns we find
          const sampleRow = jsonData[0];
          const keys = Object.keys(sampleRow);
          let sheetScore = 0;
          
          // Count matches for core columns
          const coreFields = ['partName', 'partNumber', 'binLocation', 'currentStock'];
          coreFields.forEach(field => {
             if (keys.some(k => (mappingKeys as any)[field].some((mk: string) => k.toLowerCase().includes(mk.toLowerCase())))) {
               sheetScore += 2;
             }
          });

          // Helper to find value in row
          const getVal = (row: any, possibleNames: string[]) => {
            const foundName = Object.keys(row).find(k => 
              possibleNames.some(name => k.toLowerCase().includes(name.toLowerCase()))
            );
            return foundName ? row[foundName] : undefined;
          };

          const mappedParts = jsonData.map(row => {
            const pName = String(getVal(row, mappingKeys.partName) || '').trim();
            const pNum = String(getVal(row, mappingKeys.partNumber) || '').trim();
            
            const bin = String(getVal(row, mappingKeys.binLocation) || '').trim();
            const qr = String(getVal(row, mappingKeys.qrCodeValue) || '').trim();

            if (!pName && !pNum && !bin) return null;

            // Handle Current Stock (Extracting first number in case of "10/2" format)
            const rawStock = String(getVal(row, mappingKeys.currentStock) || '0');
            const okStock = parseInt(rawStock.split('/')[0]) || 0;
            const dmgStock = parseInt(rawStock.split('/')[1]) || 0;

            return {
              partName: pName,
              partNumber: pNum, // Keep empty if not in Excel
              description: String(getVal(row, mappingKeys.description) || '').trim(),
              binLocation: bin,
              qrCodeValue: qr || bin, 
              costCenter: String(getVal(row, mappingKeys.costCenter) || '').trim(),
              useFor: String(getVal(row, mappingKeys.useFor) || '').trim(),
              currentStockOk: okStock,
              currentStockDamaged: dmgStock,
              safetyStockOk: parseInt(String(getVal(row, mappingKeys.safetyStock) || '0')) || 0,
              maxStock: parseInt(String(getVal(row, mappingKeys.maxStock) || '0')) || 0,
              minStock: parseInt(String(getVal(row, mappingKeys.minStock) || '0')) || 0,
              reorderQuantity: parseInt(String(getVal(row, mappingKeys.reorderQty) || '0')) || 0,
              leadTimeDays: parseInt(String(getVal(row, mappingKeys.leadTime) || '0')) || 0,
              isActive: true
            };
          }).filter(p => p !== null);

          if (sheetScore > bestSheet.score) {
            bestSheet = { name: sheetName, score: sheetScore, parts: mappedParts };
          }
        }

        if (bestSheet.parts.length === 0) {
          toast.error('Could not find a sheet with the required columns.');
          setLoading(false);
          return;
        }

        // --- REMOVED DUPLICATE FILTERING ---
        // We now allow all rows from Excel. Each row is its own spare part entry.
        const finalParts = bestSheet.parts.map((p, index) => ({
            ...p,
            no: index + 1
        }));

        setPendingData(finalParts);
        setShowConfirm(true);
        setLoading(false);
      } catch (error: any) {
        console.error('Import error:', error);
        toast.error('Failed to import data: ' + error.message);
        setLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const executeOverwrite = async () => {
    setLoading(true);
    try {
      // 1. Clear existing data
      await SupabaseService.deleteAllParts();
      
      // 2. Insert new data
      await SupabaseService.bulkCreateParts(pendingData);
      
      toast.success(`Inventory updated. Successfully imported ${pendingData.length} items.`);
      onImportSuccess();
      setShowConfirm(false);
      setPendingData([]);
    } catch (error: any) {
      toast.error('Overwrite failed: ' + error.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex gap-2">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImport}
        className="hidden"
        accept=".xlsx, .xls, .csv"
      />
      <Button
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        className="border-primary text-primary hover:bg-primary/5 shadow-sm"
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        Import Excel
      </Button>
      <Button
        variant="outline"
        onClick={handleExport}
        className="border-green-600 text-green-600 hover:bg-green-50 shadow-sm"
      >
        <Download className="mr-2 h-4 w-4" />
        Export Excel
      </Button>

      {/* Modern Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
               <AlertTriangle className="h-5 w-5" /> Confirm Overwrite
            </DialogTitle>
            <DialogDescription className="pt-3">
               This action will <span className="font-bold text-red-600">PERMANENTLY DELETE</span> all current 
               <span className="font-bold mx-1 text-black">{data.length} items</span> 
               from the inventory and replace them with 
               <span className="font-bold mx-1 text-green-600">{pendingData.length} items</span> from your file.
            </DialogDescription>
          </DialogHeader>
          
          <Alert variant="destructive" className="bg-red-50 border-red-200">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800 text-xs font-bold">Warning</AlertTitle>
            <AlertDescription className="text-red-700 text-[11px]">
              This cannot be undone. All current stock levels, bin locations, and part data will be lost.
            </AlertDescription>
          </Alert>

          <DialogFooter className="flex items-center gap-2 sm:justify-end">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowConfirm(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="px-6"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={executeOverwrite}
              disabled={loading}
              className="px-6 bg-red-600 hover:bg-red-700 shadow-md shadow-red-200"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, Overwrite Everything'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

