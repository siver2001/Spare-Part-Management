'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SparePart } from '@/types';
import { MockService } from '@/services/mockData';
import { toast } from 'sonner';

interface EditPartModalProps {
  isOpen: boolean;
  onClose: () => void;
  part: SparePart | null;
  onSuccess: () => void;
}

export function EditPartModal({ isOpen, onClose, part, onSuccess }: EditPartModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<SparePart>>({});

  useEffect(() => {
    if (part) {
      setFormData({
        partName: part.partName,
        partNumber: part.partNumber,
        description: part.description,
        binLocation: part.binLocation,
        safetyStockOk: part.safetyStockOk,
        maxStock: part.maxStock,
        reorderQuantity: part.reorderQuantity,
        leadTimeDays: part.leadTimeDays,
        qrCodeValue: part.qrCodeValue,
        isActive: part.isActive
      });
    }
  }, [part]);

  const handleChange = (field: keyof SparePart, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!part) return;

    setLoading(true);
    try {
      await MockService.updatePart(part.id, formData);
      toast.success('Part updated successfully');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  if (!part) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Part - {part.partName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-1 py-2">
          <div className="grid gap-4 py-4">
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">Part Name</Label>
               <Input value={formData.partName || ''} onChange={(e) => handleChange('partName', e.target.value)} className="col-span-3" />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">Part Number</Label>
               <Input value={formData.partNumber || ''} onChange={(e) => handleChange('partNumber', e.target.value)} className="col-span-3" />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">Description</Label>
               <Input value={formData.description || ''} onChange={(e) => handleChange('description', e.target.value)} className="col-span-3" />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">Bin Location</Label>
               <Input value={formData.binLocation || ''} onChange={(e) => handleChange('binLocation', e.target.value)} className="col-span-3" />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">Safety Stock</Label>
               <Input type="number" value={formData.safetyStockOk || 0} onChange={(e) => handleChange('safetyStockOk', Number(e.target.value))} className="col-span-3" />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">Max Stock</Label>
               <Input type="number" value={formData.maxStock || 0} onChange={(e) => handleChange('maxStock', Number(e.target.value))} className="col-span-3" />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">Reorder Qty</Label>
               <Input type="number" value={formData.reorderQuantity || 0} onChange={(e) => handleChange('reorderQuantity', Number(e.target.value))} className="col-span-3" />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">Lead Time (Days)</Label>
               <Input type="number" value={formData.leadTimeDays || 0} onChange={(e) => handleChange('leadTimeDays', Number(e.target.value))} className="col-span-3" />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">QR Code</Label>
               <Input value={formData.qrCodeValue || ''} onChange={(e) => handleChange('qrCodeValue', e.target.value)} className="col-span-3" />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">Active</Label>
               <Checkbox 
                checked={formData.isActive} 
                onCheckedChange={(checked: boolean) => handleChange('isActive', checked)} 
               />
             </div>
          </div>
        </form>
        <DialogFooter className="mt-auto pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" onClick={handleSubmit} disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
