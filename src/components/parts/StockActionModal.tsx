'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SparePart, User } from '@/types';
import { SupabaseService } from '@/services/supabaseService';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface StockActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'IN' | 'OUT';
  part: SparePart | null;
  onSuccess: () => void;
}

export function StockActionModal({ isOpen, onClose, type, part, onSuccess }: StockActionModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [quantity, setQuantity] = useState<number>(1);
  const [condition, setCondition] = useState<'OK' | 'DAMAGED'>('OK');
  const [reason, setReason] = useState('');
  const [workOrderNo, setWorkOrderNo] = useState('');
  const [inspectorName, setInspectorName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!part || !user) return;

    setLoading(true);
    try {
      if (quantity <= 0) throw new Error('Quantity must be greater than 0');

      await SupabaseService.createTransaction(type, {
        partId: part.id,
        condition,
        quantity,
        performedBy: user,
        reason,
        workOrderNo: type === 'OUT' ? workOrderNo : undefined,
        inspectorName: type === 'IN' ? inspectorName : undefined
      });

      toast.success(`${type} transaction successful`);
      onSuccess();
      onClose();
      // Reset form
      setQuantity(1);
      setReason('');
      setWorkOrderNo('');
    } catch (error: any) {
      toast.error(error.message || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  if (!part) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{type === 'IN' ? 'Stock In' : 'Stock Out'} - {part.partName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
            <Label className="sm:text-right">Condition</Label>
            <Select value={condition} onValueChange={(v: any) => setCondition(v)}>
              <SelectTrigger className="sm:col-span-3">
                <SelectValue placeholder="Select condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OK">OK</SelectItem>
                <SelectItem value="DAMAGED">Damaged</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
            <Label className="sm:text-right">Quantity</Label>
            <Input 
              type="number" 
              value={quantity} 
              onChange={(e) => setQuantity(Number(e.target.value))} 
              className="sm:col-span-3" 
              min={1}
            />
          </div>
          {type === 'OUT' && (
             <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                <Label className="sm:text-right">Work Order</Label>
                <Input 
                  value={workOrderNo} 
                  onChange={(e) => setWorkOrderNo(e.target.value)} 
                  className="sm:col-span-3" 
                  placeholder="Optional"
                />
             </div>
          )}
          {type === 'IN' && (
             <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
                <Label className="sm:text-right">Inspector</Label>
                <Input 
                  value={inspectorName} 
                  onChange={(e) => setInspectorName(e.target.value)} 
                  className="sm:col-span-3" 
                  placeholder="Optional"
                />
             </div>
          )}
          <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
             <Label className="sm:text-right">Reason</Label>
             <Input 
               value={reason} 
               onChange={(e) => setReason(e.target.value)} 
               className="sm:col-span-3" 
               placeholder="Optional"
             />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Processing...' : 'Submit'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
