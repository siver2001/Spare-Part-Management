'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SupabaseService } from '@/services/supabaseService';
import { SparePart } from '@/types';
import { toast } from 'sonner';

interface ExcelActionsProps {
  onImportSuccess: () => void;
  data: SparePart[]; // For export
}

export function ExcelActions({ onImportSuccess, data }: ExcelActionsProps) {
  const [loading, setLoading] = useState(false);
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
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        
        let allImportedParts: any[] = [];
        let dataFound = false;

        // Iterate through all sheets to find data
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(ws) as any[];

          if (jsonData.length === 0) continue;

          // Tentative mapping based on user's specific column names
          const partsFromSheet = jsonData.map(row => {
            // Flexible matching for column names (case-insensitive-ish)
            const getVal = (possibleNames: string[]) => {
               const foundName = Object.keys(row).find(k => 
                 possibleNames.some(name => k.toLowerCase().includes(name.toLowerCase()))
               );
               return foundName ? row[foundName] : undefined;
            };

            const partName = String(getVal(['PART NAME', 'Part Name']) || '').trim();
            const partNumber = String(getVal(['PART NUMBER', 'Part Number']) || '').trim();
            
            if (!partName && !partNumber) return null;

            // Handle the complex Description column: "DESCRIPTION (Thông số kỹ thuật, dùng cho những máy nào, hình ảnh)"
            const fullDesc = String(getVal(['DESCRIPTION', 'Mô tả']) || '').trim();
            
            // Current Stock ( OK part/Damaged part )
            const rawStock = String(getVal(['Current Stock ( OK part/Damaged part )', 'Current Stock']) || '0');
            // Sometimes users put "10/2" for OK/Damaged, let's try to extract the first number
            const okStock = parseInt(rawStock.split('/')[0]) || 0;
            const dmgStock = parseInt(rawStock.split('/')[1]) || 0;

            const safety = parseInt(String(getVal(['Safety Stock', 'Safety']) || '0')) || 0;
            const max = parseInt(String(getVal(['Max Stock', 'Max']) || '0')) || 0;
            const min = parseInt(String(getVal(['Min Stock', 'Min']) || '0')) || 0;
            const reorder = parseInt(String(getVal(['Reorder Quantity', 'Reorder']) || '0')) || 0;
            const leadIn = parseInt(String(getVal(['Lead Time', 'LeadTime']) || '0')) || 0;
            const bin = String(getVal(['Bin Location', 'Bin']) || '').trim();

            return {
              partName,
              partNumber,
              description: fullDesc,
              binLocation: bin,
              qrCodeValue: bin, // Default QR to Bin if not specified
              costCenter: String(getVal(['Cost Center', 'CostCenter']) || '').trim(),
              useFor: String(getVal(['Use For', 'UseFor', 'Dùng cho']) || '').trim(),
              currentStockOk: okStock,
              currentStockDamaged: dmgStock,
              safetyStockOk: safety,
              maxStock: max,
              minStock: min,
              reorderQuantity: reorder,
              leadTimeDays: leadIn,
              isActive: true
            };
          }).filter(p => p !== null);

          if (partsFromSheet.length > 0) {
            allImportedParts = [...allImportedParts, ...partsFromSheet];
            dataFound = true;
          }
        }

        if (!dataFound || allImportedParts.length === 0) {
          toast.error('No valid spare parts data found in any sheet. Please check your column headers.');
          setLoading(false);
          return;
        }

        await SupabaseService.bulkCreateParts(allImportedParts);
        toast.success(`Successfully imported ${allImportedParts.length} items from the file`);
        onImportSuccess();
      } catch (error: any) {
        console.error('Import error:', error);
        toast.error('Failed to import data: ' + error.message);
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      toast.error('Error reading file');
      setLoading(false);
    };

    reader.readAsBinaryString(file);
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
    </div>
  );
}
