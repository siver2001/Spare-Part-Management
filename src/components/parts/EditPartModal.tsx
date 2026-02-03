'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SparePart } from '@/types';
import { SupabaseService } from '@/services/supabaseService';
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
  const [imageFile, setImageFile] = useState<Blob | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(part?.imageUrl || null);

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
        currentStockOk: part.currentStockOk,
        currentStockDamaged: part.currentStockDamaged,
        costCenter: part.costCenter,
        useFor: part.useFor,
        minStock: part.minStock,
        isActive: part.isActive,
        imageUrl: part.imageUrl
      });
      setImagePreview(part.imageUrl || null);
    }
  }, [part]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        try {
          setLoading(true);
          const { compressImage } = await import('@/lib/imageUtils');
          const compressed = await compressImage(file);
          
          const url = URL.createObjectURL(compressed);
          setImagePreview(url);
          setImageFile(compressed);
          
          const sizeKB = Math.round(compressed.size / 1024);
          toast.success(`Image compressed to ${sizeKB}KB`);
        } catch (error) {
          console.error(error);
          toast.error("Failed to process image");
        } finally {
          setLoading(false);
        }
    }
  };

  const handleChange = (field: keyof SparePart, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Sync QR code with Bin Location
  const handleBinChange = (value: string) => {
    setFormData(prev => ({
        ...prev,
        binLocation: value,
        qrCodeValue: value
    }));
 };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!part) return;

    setLoading(true);
    try {
      let imageUrl = formData.imageUrl;

      if (imageFile) {
        imageUrl = await SupabaseService.uploadImage(imageFile, `${formData.partNumber || 'part'}.jpg`);
      }

      await SupabaseService.updatePart(part.id, { ...formData, imageUrl });
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
             <div className="grid grid-cols-4 items-start gap-4">
               <Label className="text-right mt-2">Description</Label>
               <textarea 
                  value={formData.description || ''} 
                  onChange={(e) => handleChange('description', e.target.value)} 
                  className="col-span-3 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Enter part description..."
                />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">Cost Center</Label>
               <Input value={formData.costCenter || ''} onChange={(e) => handleChange('costCenter', e.target.value)} className="col-span-3" />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">Use For</Label>
               <Input value={formData.useFor || ''} onChange={(e) => handleChange('useFor', e.target.value)} className="col-span-3" />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label className="text-right">Bin Location</Label>
               <Input value={formData.binLocation || ''} onChange={(e) => handleBinChange(e.target.value)} className="col-span-3" />
             </div>
             
             {/* Stock Section */}
             <div className="grid grid-cols-4 items-center gap-4 border-t pt-4">
                <Label className="text-right font-semibold text-green-600">Stock OK</Label>
                <Input type="number" value={formData.currentStockOk || 0} onChange={(e) => handleChange('currentStockOk', Number(e.target.value))} className="col-span-3 border-green-200 focus:ring-green-500" />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right font-semibold text-red-600">Stock DMG</Label>
                <Input type="number" value={formData.currentStockDamaged || 0} onChange={(e) => handleChange('currentStockDamaged', Number(e.target.value))} className="col-span-3 border-red-200 focus:ring-red-500" />
             </div>

             <div className="grid grid-cols-4 items-center gap-4 border-t pt-4">
               <Label className="text-right">Min Stock</Label>
               <Input type="number" value={formData.minStock || 0} onChange={(e) => handleChange('minStock', Number(e.target.value))} className="col-span-3" />
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
               <Label className="text-right">Active</Label>
               <Checkbox 
                checked={formData.isActive} 
                onCheckedChange={(checked: boolean) => handleChange('isActive', checked)} 
               />
             </div>

              {/* Image Section */}
              <div className="grid grid-cols-4 items-start gap-4 border-t pt-4">
                <Label className="text-right mt-4">Part Image</Label>
                <div className="col-span-3 space-y-2">
                    <div className="border-2 border-dashed border-gray-300 rounded-xl w-32 h-32 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors relative overflow-hidden group">
                        {imagePreview ? (
                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <div className="text-center p-2">
                                <Label htmlFor="edit-image-upload" className="cursor-pointer flex flex-col items-center gap-1">
                                    <span className="text-2xl text-gray-300">+</span>
                                    <span className="text-[10px] text-gray-400 font-medium text-center">Upload Image</span>
                                </Label>
                            </div>
                        )}
                        <Input id="edit-image-upload" type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                        
                        {imagePreview && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Label htmlFor="edit-image-upload" className="text-white text-[10px] cursor-pointer border border-white px-2 py-1 rounded-md">Change</Label>
                            </div>
                        )}
                    </div>
                    <p className="text-[10px] text-gray-400 italic">Automatic JPG compression enabled (&lt; 200KB)</p>
                </div>
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
