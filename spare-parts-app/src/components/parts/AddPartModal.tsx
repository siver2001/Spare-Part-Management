'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SparePart } from '@/types';
import { MockService } from '@/services/mockData';
import { toast } from 'sonner';
import QRCode from 'react-qr-code';

interface AddPartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddPartModal({ isOpen, onClose, onSuccess }: AddPartModalProps) {
  const [loading, setLoading] = useState(false);
  const [hasImage, setHasImage] = useState(false); // Mock image state
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<SparePart>>({
    isActive: true,
    safetyStockOk: 5,
    maxStock: 100,
    reorderQuantity: 10,
    leadTimeDays: 7,
    qrCodeValue: ''
  });

  // Auto-generate QR from Bin Location
  const handleBinChange = (value: string) => {
     setFormData(prev => ({
         ...prev,
         binLocation: value,
         qrCodeValue: value // QR Code is exactly the Bin Location
     }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          // Create fake object URL for preview
          const url = URL.createObjectURL(file);
          setImagePreview(url);
          setHasImage(true);
          toast.success("Image uploaded (mock)");
      }
  };

  const handleChange = (field: keyof SparePart, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.partName || !formData.partNumber) {
        toast.error('Part Name and Number are required');
        return;
    }

    setLoading(true);
    try {
      await MockService.createPart({
          ...formData,
          // In a real app, we'd upload the image here and get a URL
      } as any);
      
      toast.success('Part created successfully');
      setFormData({
        isActive: true,
        safetyStockOk: 5,
        maxStock: 100,
        reorderQuantity: 10,
        leadTimeDays: 7,
        qrCodeValue: ''
      });
      setImagePreview(null);
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Creation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add New Spare Part</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-2 py-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             {/* Left Column - Image & QR */}
             <div className="col-span-1 space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-xl aspect-square flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors relative overflow-hidden group">
                    {imagePreview ? (
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                        <div className="text-center p-4">
                            <Label htmlFor="image-upload" className="cursor-pointer flex flex-col items-center gap-2">
                                <span className="text-4xl text-gray-300">+</span>
                                <span className="text-sm text-gray-500 font-medium">Upload Image</span>
                                <span className="text-xs text-gray-400">(Click to browse)</span>
                            </Label>
                        </div>
                    )}
                    <Input id="image-upload" type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                    
                    {imagePreview && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                             <Label htmlFor="image-upload" className="text-white text-xs cursor-pointer border border-white px-2 py-1 rounded-md">Change</Label>
                        </div>
                    )}
                </div>

                <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-lg">
                    <Label className="text-xs text-blue-700 font-semibold mb-1 block">Generated QR Code</Label>
                    <div className="flex items-center gap-2 bg-white p-2 rounded border border-blue-100">
                        <div className="h-16 w-16 bg-white p-1 rounded-sm flex items-center justify-center border shrink-0">
                            {formData.qrCodeValue ? (
                                <QRCode
                                value={formData.qrCodeValue}
                                size={64}
                                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                viewBox={`0 0 256 256`}
                                />
                            ) : (
                                <span className="text-[8px] text-gray-400">Waiting</span>
                            )}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-xs font-mono font-medium truncate text-gray-700">{formData.qrCodeValue || 'Waiting for BIN...'}</p>
                        </div>
                    </div>
                </div>
             </div>

             {/* Right Column - Form Data */}
             <div className="col-span-1 md:col-span-2 space-y-4">
                 <div className="grid gap-4">
                     <div className="space-y-2">
                       <Label>Part Name <span className="text-red-500">*</span></Label>
                       <Input value={formData.partName || ''} onChange={(e) => handleChange('partName', e.target.value)} placeholder="e.g. Ball Bearing" required />
                     </div>
                     <div className="space-y-2">
                       <Label>Part Number <span className="text-red-500">*</span></Label>
                       <Input value={formData.partNumber || ''} onChange={(e) => handleChange('partNumber', e.target.value)} placeholder="e.g. BR-1234" required />
                     </div>
                     <div className="space-y-2">
                       <Label>Description</Label>
                       <Input value={formData.description || ''} onChange={(e) => handleChange('description', e.target.value)} />
                     </div>
                     
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label>Bin Location</Label>
                           <Input value={formData.binLocation || ''} onChange={(e) => handleBinChange(e.target.value)} placeholder="e.g. A-01" />
                        </div>
                        <div className="space-y-2">
                           <Label>QR Code Value</Label>
                           <Input value={formData.qrCodeValue || ''} onChange={(e) => handleChange('qrCodeValue', e.target.value)} placeholder="Auto-generated" />
                        </div>
                     </div>

                     <div className="bg-gray-50 p-3 rounded-lg border space-y-3">
                       <Label className="text-sm font-semibold">Stock Management</Label>
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                              <Label className="text-xs text-muted-foreground">Initial OK</Label>
                              <Input type="number" min={0} value={formData.currentStockOk || 0} onChange={(e) => handleChange('currentStockOk', Number(e.target.value))} />
                          </div>
                          <div>
                              <Label className="text-xs text-muted-foreground">Initial Damaged</Label>
                              <Input type="number" min={0} value={formData.currentStockDamaged || 0} onChange={(e) => handleChange('currentStockDamaged', Number(e.target.value))} />
                          </div>
                       </div>
                       
                       <div className="grid grid-cols-3 gap-2">
                           <div>
                               <Label className="text-xs text-muted-foreground">Safety Stock</Label>
                               <Input type="number" className="h-8 text-sm" value={formData.safetyStockOk || 0} onChange={(e) => handleChange('safetyStockOk', Number(e.target.value))} />
                           </div>
                           <div>
                               <Label className="text-xs text-muted-foreground">Max Stock</Label>
                               <Input type="number" className="h-8 text-sm" value={formData.maxStock || 0} onChange={(e) => handleChange('maxStock', Number(e.target.value))} />
                           </div>
                           <div>
                               <Label className="text-xs text-muted-foreground">Reorder Qty</Label>
                               <Input type="number" className="h-8 text-sm" value={formData.reorderQuantity || 0} onChange={(e) => handleChange('reorderQuantity', Number(e.target.value))} />
                           </div>
                       </div>
                     </div>
                     
                     <div className="flex items-center gap-2">
                       <Checkbox 
                        id="active-check"
                        checked={formData.isActive} 
                        onCheckedChange={(checked: boolean) => handleChange('isActive', checked)} 
                       />
                       <Label htmlFor="active-check" className="cursor-pointer">Active Status</Label>
                     </div>
                 </div>
             </div>
          </div>
        </form>
        <DialogFooter className="mt-auto pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" onClick={handleSubmit} disabled={loading}>{loading ? 'Creating...' : 'Create Part'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
