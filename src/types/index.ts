export type Role = 'USER' | 'POWER_USER' | 'ADMIN';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  createdAt: string; // ISO date string
  password?: string; // Mock password
}

export interface SparePart {
  id: string;
  no: number;
  qrCodeValue: string; // Moved up as per user request order preference (logical only)
  binLocation: string;
  partNumber: string;
  partName: string;
  description?: string;
  costCenter?: string; // New
  useFor?: string;      // New
  currentStockOk: number;
  currentStockDamaged: number;
  safetyStockOk: number;
  maxStock: number;
  minStock: number;     // New
  reorderQuantity: number;
  leadTimeDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = 'IN' | 'OUT';
export type PartCondition = 'OK' | 'DAMAGED';

export interface Transaction {
  id: string;
  orderNo: string;
  type: TransactionType;
  partId: string;
  partName: string; // Snapshot
  partNumber: string; // Snapshot
  partCondition: PartCondition;
  quantity: number;
  reason?: string;
  workOrderNo?: string;
  inspectorName?: string;
  performedByUserId: string;
  performedByDisplayName: string; // Snapshot
  performedAt: string;
  createdAt: string;
}
