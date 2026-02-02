'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
}

export function QRScannerModal({ isOpen, onClose, onScan }: QRScannerModalProps) {
  const handleScan = (result: any) => {
    if (result && result.length > 0) {
      // @yudiel/react-qr-scanner returns array of objects with rawValue
      const rawValue = result[0].rawValue;
      if (rawValue) {
        onScan(rawValue);
        onClose();
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-black text-white border-gray-800">
        <DialogHeader className="absolute top-0 left-0 right-0 z-10 p-4 bg-linear-to-b from-black/80 to-transparent">
          <div className="flex justify-between items-center">
             <DialogTitle className="text-white">Scan QR Code</DialogTitle>
             <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 rounded-full h-8 w-8">
                <X className="h-4 w-4" />
             </Button>
          </div>
        </DialogHeader>
        
        <div className="h-[400px] w-full bg-black relative flex items-center justify-center">
            {isOpen && (
                <Scanner 
                    onScan={handleScan}
                    components={{
                        //audio: false,
                        torch: true,
                       // count: false,
                        onOff: false,
                        tracker: () => {} // Disable default tracker
                    }}
                    styles={{
                        container: { height: 400, width: '100%' },
                        video: { height: 400, width: '100%', objectFit: 'cover' }
                    }}
                />
            )}
            <div className="absolute inset-0 border-2 border-white/30 pointer-events-none">
                 <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-64 h-64 border-2 border-primary/80 rounded-lg relative">
                          <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary shadow-sm -mt-1 -ml-1"></div>
                          <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary shadow-sm -mt-1 -mr-1"></div>
                          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary shadow-sm -mb-1 -ml-1"></div>
                          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary shadow-sm -mb-1 -mr-1"></div>
                          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500/50 animate-pulse"></div>
                      </div>
                 </div>
                 <div className="absolute bottom-10 left-0 right-0 text-center text-sm font-medium text-white/80">
                    Align QR code within the frame
                 </div>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
