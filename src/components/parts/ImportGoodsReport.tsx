'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, AlertTriangle, CheckCircle2, PackagePlus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SupabaseService } from '@/services/supabaseService';
import { SparePart } from '@/types';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

interface ImportGoodsReportProps {
  onImportSuccess: () => void;
  existingParts: SparePart[];
}

interface ReportItem {
  partName: string;
  quantity: number;
  costCenter: string;
  matchedPart?: SparePart;
  // Fields for new part addition
  selected?: boolean;
  partNumber?: string;
  binLocation?: string;
  description?: string;
  imageUrl?: string;
  overwriteExisting?: boolean;
}

export function ImportGoodsReport({ onImportSuccess, existingParts }: ImportGoodsReportProps) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [reportData, setReportData] = useState<ReportItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const isPowerUser = user && (user.role === 'ADMIN' || user.role === 'POWER_USER');

  if (!isPowerUser) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const dataBuffer = evt.target?.result;
        const wb = XLSX.read(dataBuffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        if (rows.length === 0) {
          toast.error('File is empty');
          setLoading(false);
          return;
        }

        const keywords = ['Item name', 'Quantity accepted', 'Tên hàng hoá dịch vụ', 'số lượng chấp nhận'];
        let headerRowIndex = -1;

        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const row = rows[i];
          if (row && Array.isArray(row)) {
            const hasKeyword = row.some(cell => 
              cell && keywords.some(k => String(cell).toLowerCase().includes(k.toLowerCase()))
            );
            if (hasKeyword) {
              headerRowIndex = i;
              break;
            }
          }
        }

        if (headerRowIndex === -1) {
          toast.error('Could not find table headers in Excel file');
          setLoading(false);
          return;
        }

        const headers = rows[headerRowIndex];
        const dataRows = rows.slice(headerRowIndex + 1);

        const mapping = {
          name: ['Tên hàng hoá dịch vụ / Item name', 'Item name', 'Tên hàng'],
          qty: ['số lượng chấp nhận / Quantity accepted', 'Quantity accepted', 'Số lượng'],
          cc: ['sử dụng cho phòng ban / Used for cost center', 'Cost center', 'Phòng ban'],
          pn: ['Part Number', 'Part Code', 'Mã hàng', 'Mã số', 'Item Code'],
          desc: ['Description', 'Mô tả', 'Ghi chú', 'Note', 'Thông số'],
          img: ['Image', 'Ảnh', 'Link ảnh', 'URL', 'Hình ảnh']
        };

        const getColumnIndex = (targetKeywords: string[]) => {
          return headers.findIndex(h => 
            h && targetKeywords.some(k => String(h).toLowerCase().trim() === k.toLowerCase().trim() || String(h).toLowerCase().includes(k.toLowerCase()))
          );
        };

        const nameIdx = getColumnIndex(mapping.name);
        const qtyIdx = getColumnIndex(mapping.qty);
        const ccIdx = getColumnIndex(mapping.cc);
        const pnIdx = getColumnIndex(mapping.pn);
        const descIdx = getColumnIndex(mapping.desc);
        const imgIdx = getColumnIndex(mapping.img);

        if (nameIdx === -1 || qtyIdx === -1) {
          toast.error('Required columns (Item Name or Quantity) not found');
          setLoading(false);
          return;
        }

        const itemMap = new Map<string, ReportItem>();

        dataRows.forEach(row => {
          const name = String(row[nameIdx] || '').trim();
          const qty = parseFloat(String(row[qtyIdx] || '0'));
          const cc = ccIdx !== -1 ? String(row[ccIdx] || '').trim() : '';
          const pn = pnIdx !== -1 ? String(row[pnIdx] || '').trim() : '';
          const desc = descIdx !== -1 ? String(row[descIdx] || '').trim() : '';
          const img = imgIdx !== -1 ? String(row[imgIdx] || '').trim() : '';

          if (!name || isNaN(qty) || name.toLowerCase().includes('tổng cộng') || name.toLowerCase().includes('total')) return;

          const standardizedName = name.toLowerCase().replace(/\s+/g, ' ').trim();
          const matched = existingParts.find(p => p.partName.toLowerCase().replace(/\s+/g, ' ').trim() === standardizedName);
          
          const key = matched ? `matched-${matched.id}` : `new-${standardizedName}`;

          if (itemMap.has(key)) {
            const existing = itemMap.get(key)!;
            itemMap.set(key, {
              ...existing,
              quantity: existing.quantity + qty,
              costCenter: existing.costCenter || cc,
              partNumber: existing.partNumber || pn,
              description: existing.description || desc,
              imageUrl: existing.imageUrl || img
            });
          } else {
            itemMap.set(key, {
              partName: name,
              quantity: qty,
              costCenter: cc,
              matchedPart: matched,
              selected: true,
              partNumber: pn,
              binLocation: matched ? matched.binLocation : '',
              description: desc,
              imageUrl: img,
              overwriteExisting: false
            });
          }
        });

        const parsedItems = Array.from(itemMap.values());
        setReportData(parsedItems);
        setShowModal(true);
      } catch (err: any) {
        console.error(err);
        toast.error('Failed to parse file: ' + err.message);
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const [showCollisionModal, setShowCollisionModal] = useState(false);
  const [collisions, setCollisions] = useState<{item: ReportItem, existing: SparePart}[]>([]);

  const processImport = async (skipCollisionCheck = false) => {
    const selectedNewItems = reportData.filter(item => !item.matchedPart && item.selected);
    const selectedMatchedItems = reportData.filter(item => item.matchedPart && item.selected);

    // 1. Pre-validation
    const invalidItems = selectedNewItems.filter(i => !i.binLocation?.trim());
    if (invalidItems.length > 0) {
      toast.error(`Please provide Bin Location for: ${invalidItems[0].partName}${invalidItems.length > 1 ? ` and ${invalidItems.length - 1} others` : ''}`);
      return;
    }

    setLoading(true);
    try {
      // 2. Collision Check
      if (!skipCollisionCheck) {
        const foundCollisions: {item: ReportItem, existing: SparePart}[] = [];
        for (const item of selectedNewItems) {
          const existing = await SupabaseService.checkBinLocation(item.binLocation!);
          if (existing && existing.partName && existing.partName.trim() !== '') {
            foundCollisions.push({ item, existing });
          }
        }

        if (foundCollisions.length > 0) {
          setCollisions(foundCollisions);
          setShowCollisionModal(true);
          setLoading(false);
          return;
        }
      }

      // 3. Process matched items
      for (const item of selectedMatchedItems) {
         const part = item.matchedPart!;
         const oldImageUrl = part.imageUrl;

         await SupabaseService.createTransaction('IN', {
            partId: part.id,
            condition: 'OK',
            quantity: item.quantity,
            performedBy: { id: user?.id || '', displayName: user?.displayName || 'System' },
            reason: 'Import Goods Report'
         });

         if (item.overwriteExisting) {
            const updates: Partial<SparePart> = {
                partNumber: item.partNumber || part.partNumber,
                costCenter: item.costCenter || part.costCenter,
                description: item.description || part.description,
                imageUrl: item.imageUrl || part.imageUrl
            };
            await SupabaseService.updatePart(part.id, updates);

            if (item.imageUrl && oldImageUrl && oldImageUrl !== item.imageUrl) {
               await SupabaseService.deleteImage(oldImageUrl);
            }
         } else if (!part.costCenter && item.costCenter) {
            await SupabaseService.updatePart(part.id, { costCenter: item.costCenter });
         }
      }

      // 4. Process new items
      for (const item of selectedNewItems) {
          const binLoc = item.binLocation!.trim();
          const existingBin = await SupabaseService.checkBinLocation(binLoc);

          if (existingBin && (!existingBin.partName || existingBin.partName.trim() === '')) {
             const oldImg = existingBin.imageUrl;
             await SupabaseService.updatePart(existingBin.id, {
                partName: item.partName,
                partNumber: item.partNumber || '',
                currentStockOk: item.quantity,
                costCenter: item.costCenter,
                isActive: true,
                description: item.description || 'Updated via Goods Report (Empty Bin filled)',
                imageUrl: item.imageUrl || oldImg
             });
             if (item.imageUrl && oldImg && oldImg !== item.imageUrl) {
                await SupabaseService.deleteImage(oldImg);
             }
          } else {
             await SupabaseService.createPart({
                partName: item.partName,
                partNumber: item.partNumber || '',
                binLocation: binLoc,
                qrCodeValue: item.partNumber || '',
                currentStockOk: item.quantity,
                currentStockDamaged: 0,
                costCenter: item.costCenter,
                isActive: true,
                safetyStockOk: 5,
                maxStock: 100,
                minStock: 0,
                reorderQuantity: 10,
                leadTimeDays: 7,
                description: item.description || 'Added via Goods Report',
                imageUrl: item.imageUrl
             } as any);
          }
      }

      toast.success('Successfully processed all items!');
      onImportSuccess();
      setShowModal(false);
      setShowCollisionModal(false);
    } catch (err: any) {
      toast.error('Import failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const matchedItems = reportData.filter(i => i.matchedPart);
  const newItems = reportData.filter(i => !i.matchedPart);

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".xlsx, .xls"
      />
      <Button
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        className="border-indigo-600 text-indigo-600 hover:bg-indigo-50 shadow-sm"
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <PackagePlus className="mr-2 h-4 w-4" />
        )}
        Import Goods Report
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
               <Upload className="h-5 w-5 text-indigo-600" />
               Import Goods Report Review
            </DialogTitle>
            <DialogDescription>
               Review items from the report before adding to inventory.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 py-4">
            {matchedItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-700 font-bold bg-green-50 p-3 rounded-xl border border-green-100">
                   <div className="bg-green-100 p-1.5 rounded-full"><CheckCircle2 className="h-4 w-4" /></div>
                   Existing Parts found ({matchedItems.length}) - Stock will be increased
                </div>
                <div className="border rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-green-50/50 border-b border-green-100">
                      <tr>
                        <th className="w-12 p-3">
                          <Checkbox 
                            checked={matchedItems.length > 0 && matchedItems.every(i => i.selected)}
                             onCheckedChange={(checked) => {
                               const newData = [...reportData];
                               newData.forEach((i, idx) => { if(i.matchedPart) newData[idx] = { ...i, selected: !!checked }; });
                               setReportData(newData);
                             }}
                          />
                        </th>
                        <th className="text-left p-3 text-green-900 font-semibold uppercase text-[10px] tracking-wider">Part Name</th>
                        <th className="text-center p-3 text-green-900 font-semibold uppercase text-[10px] tracking-wider">Add Qty</th>
                        <th className="text-left p-3 text-green-900 font-semibold uppercase text-[10px] tracking-wider">Cost Center</th>
                        <th className="text-left p-3 text-green-900 font-semibold uppercase text-[10px] tracking-wider">Existing Bin</th>
                        <th className="text-center p-3 text-green-900 font-semibold uppercase text-[10px] tracking-wider">Overwrite</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {matchedItems.map((item, idx) => {
                        const matches = existingParts.filter(p => p.partName.toLowerCase().replace(/\s+/g, ' ').trim() === item.partName.toLowerCase().replace(/\s+/g, ' ').trim());
                        const hasMultipleBins = matches.length > 1;
                        return (
                          <tr key={idx} className={`transition-colors ${item.selected ? 'bg-white' : 'bg-gray-50/30'}`}>
                            <td className="p-3 text-center">
                              <Checkbox 
                                checked={item.selected} 
                                 onCheckedChange={(checked) => {
                                  const newData = [...reportData];
                                  const itemIdx = reportData.indexOf(item);
                                  if (itemIdx !== -1) { newData[itemIdx] = { ...item, selected: !!checked }; setReportData(newData); }
                                }}
                              />
                            </td>
                            <td className="p-3">
                              <p className="font-semibold text-gray-900">{item.partName}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">{hasMultipleBins ? <span className="text-orange-600 font-medium">Multiple bins available</span> : item.matchedPart?.partNumber}</p>
                            </td>
                            <td className="p-3 text-center"><span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">+{item.quantity}</span></td>
                            <td className="p-3 text-gray-600 font-medium">{item.costCenter || item.matchedPart?.costCenter || '-'}</td>
                            <td className="p-3">
                              {hasMultipleBins ? (
                                <select 
                                  className="text-xs border rounded px-1"
                                  value={item.matchedPart?.id}
                                  onChange={(e) => {
                                    const selectedPart = matches.find(p => p.id === e.target.value);
                                    const newData = [...reportData];
                                    const itemIdx = reportData.indexOf(item);
                                    if (itemIdx !== -1) { newData[itemIdx].matchedPart = selectedPart; setReportData(newData); }
                                  }}
                                >
                                  {matches.map(m => <option key={m.id} value={m.id}>{m.binLocation}</option>)}
                                </select>
                              ) : (
                                <Badge variant="outline">{item.matchedPart?.binLocation}</Badge>
                              )}
                            </td>
                            <td className="p-3 text-center">
                               <Checkbox checked={item.overwriteExisting} onCheckedChange={(checked) => {
                                  const newData = [...reportData];
                                  const itemIdx = reportData.indexOf(item);
                                  if (itemIdx !== -1) { newData[itemIdx] = { ...item, overwriteExisting: !!checked }; setReportData(newData); }
                               }} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {newItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-orange-700 font-semibold bg-orange-50 p-2 rounded-md">
                   <AlertTriangle className="h-4 w-4" /> New Parts needed ({newItems.length})
                </div>
                <div className="border rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-indigo-50/50 border-b border-indigo-100">
                      <tr>
                        <th className="w-12 p-3">
                          <Checkbox 
                            checked={newItems.length > 0 && newItems.every(i => i.selected)}
                             onCheckedChange={(checked) => {
                               const newData = [...reportData];
                               newData.forEach((i, idx) => { if(!i.matchedPart) newData[idx] = { ...i, selected: !!checked }; });
                               setReportData(newData);
                             }}
                          />
                        </th>
                        <th className="text-left p-3">Item Name</th>
                        <th className="w-20 p-3 text-center">Qty</th>
                        <th className="p-3">Part Number</th>
                        <th className="p-3">Bin</th>
                        <th className="p-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {newItems.map((item, idx) => (
                        <tr key={idx} className={`transition-colors ${item.selected ? 'bg-white' : 'bg-gray-50/30'}`}>
                          <td className="p-3 text-center">
                            <Checkbox checked={item.selected} onCheckedChange={(checked) => {
                                const newData = [...reportData];
                                const itemIdx = reportData.indexOf(item);
                                if (itemIdx !== -1) { newData[itemIdx] = { ...item, selected: !!checked }; setReportData(newData); }
                            }} />
                          </td>
                          <td className="p-3"><p className="font-semibold">{item.partName}</p></td>
                          <td className="p-3 text-center font-bold">{item.quantity}</td>
                          <td className="p-3">
                             <Input className="h-8 text-xs" value={item.partNumber} onChange={(e) => {
                                const newData = [...reportData];
                                const itemIdx = reportData.indexOf(item);
                                if (itemIdx !== -1) { newData[itemIdx] = { ...item, partNumber: e.target.value }; setReportData(newData); }
                             }} />
                          </td>
                          <td className="p-3">
                             <Input className="h-8 text-xs" value={item.binLocation} onChange={(e) => {
                                const newData = [...reportData];
                                const itemIdx = reportData.indexOf(item);
                                if (itemIdx !== -1) { newData[itemIdx] = { ...item, binLocation: e.target.value }; setReportData(newData); }
                             }} />
                          </td>
                          <td className="p-3">
                             <Input className="h-8 text-xs" value={item.description} onChange={(e) => {
                                const newData = [...reportData];
                                const itemIdx = reportData.indexOf(item);
                                if (itemIdx !== -1) { newData[itemIdx] = { ...item, description: e.target.value }; setReportData(newData); }
                             }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={() => processImport(false)} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirm Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCollisionModal} onOpenChange={setShowCollisionModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600"><AlertTriangle className="h-5 w-5" /> Bin Conflict</DialogTitle>
            <DialogDescription>Some bins are already occupied. Proceed anyway?</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            {collisions.map((c, i) => (
              <div key={i} className="text-xs p-2 border rounded bg-orange-50">Bin <b>"{c.item.binLocation}"</b> is used by <b>"{c.existing.partName}"</b></div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCollisionModal(false)}>Back</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => processImport(true)} disabled={loading}>Yes, Proceed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
