import { SparePart, Transaction, User, Role } from '@/types';
import { v4 as uuidv4 } from 'uuid'; // We might need uuid, or just use random string

// Simple ID generator for mock
const generateId = () => Math.random().toString(36).substring(2, 9);
const generateOrderNo = (type: 'IN' | 'OUT') => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${type}-${date}-${rand}`;
};

// Initial Mock Data
const INITIAL_USERS: User[] = [
  {
    id: 'user-admin',
    username: 'admin',
    displayName: 'Admin User',
    role: 'ADMIN',
    isActive: true,
    createdAt: new Date().toISOString(),
    password: 'admin123'
  },
  {
    id: 'user-power',
    username: 'power',
    displayName: 'Power User',
    role: 'POWER_USER',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user-normal',
    username: 'user',
    displayName: 'Normal User',
    role: 'USER',
    isActive: true,
    createdAt: new Date().toISOString(),
    password: 'user123'
  },
];

const generateMockParts = (): SparePart[] => {
  const categories = ['Bearing', 'Motor', 'Sensor', 'Valve', 'Piston', 'Switch', 'Controller', 'Pump', 'Filter', 'Gasket'];
  const brands = ['SKF', 'Siemens', 'Omron', 'Festo', 'Rexroth', 'Schneider', 'Grundfos', 'Danfoss', 'Parker'];
  
  return Array.from({ length: 50 }).map((_, i) => {
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const brand = brands[Math.floor(Math.random() * brands.length)];
    const id = generateId();
    const stock = Math.floor(Math.random() * 100);
    const bin = `${String.fromCharCode(65 + Math.floor(Math.random() * 6))}-${Math.floor(Math.random() * 10)}-${Math.floor(Math.random() * 100)}`;
    
    return {
      id: `part-${i + 3}`,
      no: i + 3,
      partName: `${cat} ${Math.floor(Math.random() * 1000)} Series`,
      partNumber: `${cat.slice(0, 3).toUpperCase()}-${Math.floor(Math.random() * 10000)}-${brand.slice(0, 2).toUpperCase()}`,
      description: `High performance ${cat.toLowerCase()} from ${brand}, suitable for industrial automation.`,
      binLocation: bin,
      currentStockOk: stock,
      currentStockDamaged: Math.floor(Math.random() * 5),
      safetyStockOk: Math.floor(Math.random() * 20) + 5,
      maxStock: 200,
      reorderQuantity: 20,
      leadTimeDays: Math.floor(Math.random() * 30) + 1,
      qrCodeValue: bin, // QR Code matches Bin
      isActive: Math.random() > 0.1, // 90% active
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });
};

const INITIAL_PARTS: SparePart[] = [
  {
    id: 'part-1',
    no: 1,
    partName: 'Bearing 6205',
    partNumber: 'BR-6205-SKF',
    description: 'Deep groove ball bearing',
    binLocation: 'A-01-01',
    currentStockOk: 50,
    currentStockDamaged: 2,
    safetyStockOk: 10,
    maxStock: 100,
    reorderQuantity: 20,
    leadTimeDays: 7,
    qrCodeValue: 'A-01-01',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'part-2',
    no: 2,
    partName: 'Motor 1.5kW',
    partNumber: 'MTR-1500-SI',
    description: '3-phase induction motor',
    binLocation: 'B-02-05',
    currentStockOk: 5,
    currentStockDamaged: 0,
    safetyStockOk: 2,
    maxStock: 10,
    reorderQuantity: 3,
    leadTimeDays: 14,
    qrCodeValue: 'B-02-05',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  ...generateMockParts()
];

const INITIAL_TRANSACTIONS: Transaction[] = [];

// Simulation delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// LocalStorage Keys
const KEYS = {
  USERS: 'mock_users',
  PARTS: 'mock_parts',
  TRANSACTIONS: 'mock_transactions',
};

// Helper to get from LS or Init
const getFromStorage = <T>(key: string, initial: T[]): T[] => {
  if (typeof window === 'undefined') return initial;
  const stored = localStorage.getItem(key);
  if (stored) return JSON.parse(stored);
  localStorage.setItem(key, JSON.stringify(initial));
  return initial;
};

const saveToStorage = (key: string, data: any) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(data));
  }
};

// Services
export const MockService = {
  // Users
  getUsers: async (): Promise<User[]> => {
    await delay(500);
    return getFromStorage(KEYS.USERS, INITIAL_USERS);
  },
  
  createUser: async (user: Omit<User, 'id' | 'createdAt'>): Promise<User> => {
    await delay(500);
    const users = getFromStorage(KEYS.USERS, INITIAL_USERS);
    const newUser: User = { ...user, id: generateId(), createdAt: new Date().toISOString() };
    users.push(newUser);
    saveToStorage(KEYS.USERS, users);
    return newUser;
  },

  deleteUser: async (id: string): Promise<void> => {
    await delay(500);
    const users = getFromStorage(KEYS.USERS, INITIAL_USERS);
    const newUsers = users.filter(u => u.id !== id);
    if (newUsers.length === users.length) throw new Error('User not found');
    saveToStorage(KEYS.USERS, newUsers);
  },

  updateUser: async (id: string, updates: Partial<User>): Promise<User> => {
    await delay(500);
    let users = getFromStorage(KEYS.USERS, INITIAL_USERS);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error('User not found');
    users[idx] = { ...users[idx], ...updates };
    saveToStorage(KEYS.USERS, users);
    return users[idx];
  },

  // Parts
  getParts: async (): Promise<SparePart[]> => {
    await delay(500);
    return getFromStorage(KEYS.PARTS, INITIAL_PARTS);
  },

  createPart: async (data: Omit<SparePart, 'id' | 'createdAt' | 'updatedAt' | 'no'>): Promise<SparePart> => {
    await delay(500);
    const parts = getFromStorage(KEYS.PARTS, INITIAL_PARTS);
    const maxNo = Math.max(...parts.map(p => p.no), 0);
    
    const newPart: SparePart = {
      ...data,
      id: generateId(),
      no: maxNo + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    parts.push(newPart);
    saveToStorage(KEYS.PARTS, parts);
    return newPart;
  },

  updatePart: async (id: string, updates: Partial<SparePart>): Promise<SparePart> => {
    await delay(500);
    let parts = getFromStorage(KEYS.PARTS, INITIAL_PARTS);
    const idx = parts.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Part not found');
    parts[idx] = { ...parts[idx], ...updates, updatedAt: new Date().toISOString() };
    saveToStorage(KEYS.PARTS, parts);
    return parts[idx];
  },

  // Transactions (IN/OUT Logic)
  getTransactions: async (): Promise<Transaction[]> => {
    await delay(500);
    // Cleanup lazy logic: remove older than 60 days
    let transactions = getFromStorage(KEYS.TRANSACTIONS, INITIAL_TRANSACTIONS);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    
    const filtered = transactions.filter(t => new Date(t.createdAt) > sixtyDaysAgo);
    if (filtered.length !== transactions.length) {
      saveToStorage(KEYS.TRANSACTIONS, filtered);
    }
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  createTransaction: async (
    type: 'IN' | 'OUT',
    data: {
      partId: string;
      condition: 'OK' | 'DAMAGED';
      quantity: number;
      performedBy: User;
      reason?: string;
      workOrderNo?: string;
      inspectorName?: string;
    }
  ): Promise<Transaction> => {
    await delay(800);
    const parts = getFromStorage(KEYS.PARTS, INITIAL_PARTS);
    const partIdx = parts.findIndex(p => p.id === data.partId);
    if (partIdx === -1) throw new Error('Part not found');
    
    const part = parts[partIdx];

    // Check stock for OUT
    if (type === 'OUT') {
      if (data.condition === 'OK' && part.currentStockOk < data.quantity) {
        throw new Error(`Insufficient OK stock. Available: ${part.currentStockOk}`);
      }
      if (data.condition === 'DAMAGED' && part.currentStockDamaged < data.quantity) {
        throw new Error(`Insufficient DATA stock. Available: ${part.currentStockDamaged}`);
      }
    }

    // Update Stock
    if (type === 'IN') {
      if (data.condition === 'OK') part.currentStockOk += data.quantity;
      else part.currentStockDamaged += data.quantity;
    } else {
      if (data.condition === 'OK') part.currentStockOk -= data.quantity;
      else part.currentStockDamaged -= data.quantity;
    }
    part.updatedAt = new Date().toISOString();
    parts[partIdx] = part;
    saveToStorage(KEYS.PARTS, parts);

    // Create Transaction Record
    const newTx: Transaction = {
      id: generateId(),
      orderNo: generateOrderNo(type),
      type,
      partId: part.id,
      partName: part.partName,
      partNumber: part.partNumber,
      partCondition: data.condition,
      quantity: data.quantity,
      performedByUserId: data.performedBy.id,
      performedByDisplayName: data.performedBy.displayName,
      performedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      reason: data.reason,
      workOrderNo: data.workOrderNo,
      inspectorName: data.inspectorName
    };

    const transactions = getFromStorage(KEYS.TRANSACTIONS, INITIAL_TRANSACTIONS);
    transactions.push(newTx);
    saveToStorage(KEYS.TRANSACTIONS, transactions);

    return newTx;
  }
};
