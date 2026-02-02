'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SparePart } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Package, MapPin, AlertTriangle, Calendar, Activity, QrCode } from 'lucide-react';
import QRCode from 'react-qr-code';

interface PartDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  part: SparePart | null;
}

export function PartDetailsModal({ isOpen, onClose, part }: PartDetailsModalProps) {
  if (!part) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Package className="h-6 w-6 text-primary" />
            {part.partName}
          </DialogTitle>
           <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{part.partNumber}</span>
              <Separator orientation="vertical" className="h-4" />
              <Badge variant={part.isActive ? 'default' : 'secondary'} className={part.isActive ? 'bg-green-600' : ''}>
                {part.isActive ? 'Active' : 'Inactive'}
              </Badge>
           </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pr-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Image Section (Placeholder) */}
                <div className="col-span-1">
                    <div className="aspect-square rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center flex-col text-gray-400 p-4 text-center">
                        <Package className="h-16 w-16 mb-2 opacity-20" />
                        <span className="text-xs">No image available</span>
                        <span className="text-[10px] mt-1 text-muted-foreground">(Image support coming soon)</span>
                    </div>
                    {/* QR Code Placeholder */}
                    {/* QR Code Section */}
                    <div className="mt-4 p-4 border rounded-lg bg-white flex flex-col items-center gap-3 shadow-sm">
                        <div className="bg-white p-2 rounded-lg border w-full max-w-[150px]">
                             {part.qrCodeValue ? (
                                <QRCode
                                value={part.qrCodeValue}
                                size={128}
                                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                viewBox={`0 0 256 256`}
                                />
                             ) : (
                                <div className="h-32 w-32 bg-gray-100 flex items-center justify-center rounded text-gray-400">
                                    <QrCode className="h-8 w-8" />
                                </div>
                             )}
                        </div>
                        <div className="text-center w-full">
                            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest mb-1">Scan Code</p>
                            <p className="text-sm font-mono font-bold bg-gray-100 px-3 py-1 rounded-full inline-block border break-all max-w-full">
                                {part.qrCodeValue || 'N/A'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Details Section */}
                <div className="col-span-2 space-y-6">
                    {/* Description */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-1">Description</h4>
                        <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-md border">
                            {part.description || 'No description provided.'}
                        </p>
                    </div>

                    {/* Stock Status */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <Activity className="h-4 w-4 text-blue-500" /> Stock Status
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                             <div className="p-3 rounded-md border bg-green-50/50 border-green-100">
                                <p className="text-xs text-green-700 font-medium uppercase">Using / OK</p>
                                <p className="text-2xl font-bold text-green-800">{part.currentStockOk}</p>
                             </div>
                             <div className="p-3 rounded-md border bg-red-50/50 border-red-100">
                                <p className="text-xs text-red-700 font-medium uppercase">Damaged</p>
                                <p className="text-2xl font-bold text-red-800">{part.currentStockDamaged}</p>
                             </div>
                        </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                        <div className="flex flex-col">
                            <span className="text-muted-foreground text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Bin Location</span>
                            <span className="font-medium">{part.binLocation || 'N/A'}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-muted-foreground text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Safety Level</span>
                            <span className="font-medium text-orange-600">{part.safetyStockOk} units</span>
                        </div>
                         <div className="flex flex-col">
                            <span className="text-muted-foreground text-xs">Reorder Quantity</span>
                            <span className="font-medium">{part.reorderQuantity} units</span>
                        </div>
                         <div className="flex flex-col">
                            <span className="text-muted-foreground text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> Lead Time</span>
                            <span className="font-medium">{part.leadTimeDays} days</span>
                        </div>
                    </div>

                    <Separator />
                    
                    <div className="text-xs text-muted-foreground flex justify-between">
                        <span>Created: {new Date(part.createdAt).toLocaleDateString()}</span>
                        <span>Updated: {new Date(part.updatedAt || part.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
        </div>

        <div className="mt-4 pt-4 border-t flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
