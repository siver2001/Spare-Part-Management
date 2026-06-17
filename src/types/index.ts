export type Role = 'USER' | 'POWER_USER' | 'ADMIN';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  createdAt: string; // ISO date string
  password?: string; // Mock password
  imageUrl?: string;
}

export interface SparePart {
  id: string;
  no: number;
  qrCodeValue: string; // Moved up as per user request order preference (logical only)
  binLocation: string;
  partNumber: string;
  materialType?: string; // Loại vật tư
  partName: string;
  description?: string;
  costCenter?: string; // New
  useFor?: string;      // New
  machines?: string[];
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
  imageUrl?: string;
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
  performedByUserId: string | null;
  performedByDisplayName: string; // Snapshot
  performedAt: string;
  createdAt: string;
}

export interface WorkingHours {
  id: string;
  msnv: string;
  fullName: string;
  department: string;
  days: Record<string, string | number>;
  createdAt: string;
}

export interface WorkReport {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  reportDate: string; // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  activity: string;
  workType?: 'MACHINE_REPAIR' | 'OTHER';
  machineName?: string | null;
  createdAt: string;  // ISO date string
}
