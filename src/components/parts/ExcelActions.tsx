'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import QRCode from 'qrcode';
import { SupabaseService } from '@/services/supabaseService';
import { SparePart } from '@/types';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

  const handleExport = async () => {
    setLoading(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Inventory');

      // Define columns
      worksheet.columns = [
        { header: 'NO.', key: 'no', width: 6 },
        { header: 'QR Image', key: 'qr_image', width: 12 },
        { header: 'QR Code Value', key: 'qrCodeValue', width: 15 },
        { header: 'Bin Location', key: 'binLocation', width: 15 },
        { header: 'Part Number', key: 'partNumber', width: 20 },
        { header: 'Part Name', key: 'partName', width: 30 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Cost Center', key: 'costCenter', width: 15 },
        { header: 'Use For', key: 'useFor', width: 20 },
        { header: 'Current Stock', key: 'currentStockOk', width: 15 },
        { header: 'Safety', key: 'safetyStockOk', width: 10 },
        { header: 'Max', key: 'maxStock', width: 10 },
        { header: 'Min', key: 'minStock', width: 10 },
        { header: 'Reorder', key: 'reorderQuantity', width: 10 },
        { header: 'Lead Time', key: 'leadTimeDays', width: 10 },
      ];

      // Style Header
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F46E5' } // Indigo color
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      worksheet.getRow(1).height = 25;

      // Add Data
      for (let i = 0; i < data.length; i++) {
        const p = data[i];
        const rowIndex = i + 2;
        const row = worksheet.addRow({
          no: p.no || i + 1,
          qrCodeValue: p.qrCodeValue || '',
          binLocation: p.binLocation || '',
          partNumber: p.partNumber || '',
          partName: p.partName || '',
          description: p.description || '',
          costCenter: p.costCenter || '',
          useFor: p.useFor || '',
          currentStockOk: p.currentStockOk || 0,
          safetyStockOk: p.safetyStockOk || 0,
          maxStock: p.maxStock || 0,
          minStock: p.minStock || 0,
          reorderQuantity: p.reorderQuantity || 0,
          leadTimeDays: p.leadTimeDays || 0,
        });

        row.height = 70; // High enough for QR code
        row.alignment = { vertical: 'middle', wrapText: true };

        // Add QR Image
        if (p.qrCodeValue) {
          try {
            const qrDataUrl = await QRCode.toDataURL(p.qrCodeValue, { 
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 100
            });
            const imageId = workbook.addImage({
              base64: qrDataUrl,
              extension: 'png',
            });
            
            // Calculate center of the cell
            worksheet.addImage(imageId, {
              tl: { col: 1.1, row: rowIndex - 0.9 },
              ext: { width: 80, height: 80 },
              editAs: 'oneCell'
            });
          } catch (err) {
            console.error('QR Export Error:', err);
          }
        }
      }

      // Auto-adjust column widths
      worksheet.columns.forEach(column => {
        if (column.key === 'qr_image') return;
        
        let maxLength = column.header ? column.header.toString().length : 10;
        data.forEach(p => {
          const val = (p as any)[column.key as string];
          const len = val ? val.toString().length : 0;
          if (len > maxLength) maxLength = len;
        });
        
        column.width = Math.min(Math.max(10, maxLength + 4), 60);
      });

      // Write to buffer and save
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Spare_Parts_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      toast.success('Inventory exported successfully with QR codes');
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error('Failed to export data: ' + error.message);
    } finally {
      setLoading(false);
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

          const sampleRow = jsonData[0];
          const keys = Object.keys(sampleRow);
          let sheetScore = 0;
          
          const coreFields = ['partName', 'partNumber', 'binLocation', 'currentStock'];
          coreFields.forEach(field => {
             if (keys.some(k => (mappingKeys as any)[field].some((mk: string) => k.toLowerCase().includes(mk.toLowerCase())))) {
               sheetScore += 2;
             }
          });

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

            const rawStock = String(getVal(row, mappingKeys.currentStock) || '0');
            const okStock = parseInt(rawStock.split('/')[0]) || 0;
            const dmgStock = parseInt(rawStock.split('/')[1]) || 0;

            return {
              partName: pName,
              partNumber: pNum,
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
      await SupabaseService.deleteAllParts();
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
        disabled={loading}
        className="border-green-600 text-green-600 hover:bg-green-50 shadow-sm"
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        Export Excel
      </Button>

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
