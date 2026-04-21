import { supabase } from '@/lib/supabase';
import { SparePart, Transaction, User, Role, WorkingHours } from '@/types';
import {
  invalidateClientCache,
  peekClientCache,
  readClientCache,
  writeClientCache,
} from '@/lib/clientCache';

type UserDeleteResult = {
  mode: 'deleted' | 'disabled';
  reason?: string;
};

type QueryOptions = {
  forceRefresh?: boolean;
};

const CACHE_KEYS = {
  users: 'profiles',
  parts: 'spare-parts',
  transactions: 'transactions',
  workingHours: 'working-hours',
} as const;

const CACHE_TTL = {
  users: 5 * 60 * 1000,
  parts: 2 * 60 * 1000,
  transactions: 60 * 1000,
  workingHours: 10 * 60 * 1000,
} as const;

const TRANSACTION_CLEANUP_KEY = 'transactions-cleanup-last-run';
const TRANSACTION_CLEANUP_INTERVAL = 12 * 60 * 60 * 1000;

const mapProfile = (p: Record<string, unknown>): User => ({
  id: String(p.id),
  username: String(p.username),
  displayName: String(p.display_name),
  role: p.role as Role,
  isActive: Boolean(p.is_active),
  createdAt: String(p.created_at),
  password: (p.password as string | undefined) || undefined,
  imageUrl: (p.image_url as string | undefined) || undefined
});

const mapPart = (p: Record<string, unknown>): SparePart => ({
  id: String(p.id),
  no: Number(p.no),
  partName: String(p.part_name),
  partNumber: String(p.part_number),
  description: (p.description as string | undefined) || undefined,
  binLocation: String(p.bin_location),
  currentStockOk: Number(p.current_stock_ok),
  currentStockDamaged: Number(p.current_stock_damaged),
  safetyStockOk: Number(p.safety_stock_ok),
  maxStock: Number(p.max_stock),
  reorderQuantity: Number(p.reorder_quantity),
  leadTimeDays: Number(p.lead_time_days),
  qrCodeValue: String(p.qr_code_value || ''),
  costCenter: (p.cost_center as string | undefined) || undefined,
  useFor: (p.use_for as string | undefined) || undefined,
  machines: normalizeMachines(p.machines),
  minStock: Number(p.min_stock || 0),
  isActive: Boolean(p.is_active),
  imageUrl: (p.image_url as string | undefined) || undefined,
  createdAt: String(p.created_at),
  updatedAt: String(p.updated_at)
});

const mapTransaction = (t: Record<string, unknown>): Transaction => ({
  id: String(t.id),
  orderNo: String(t.order_no),
  type: t.type as 'IN' | 'OUT',
  partId: String(t.part_id),
  partName: String(t.part_name_snapshot),
  partNumber: String(t.part_number_snapshot),
  partCondition: t.part_condition as 'OK' | 'DAMAGED',
  quantity: Number(t.quantity),
  reason: (t.reason as string | undefined) || undefined,
  workOrderNo: (t.work_order_no as string | undefined) || undefined,
  inspectorName: (t.inspector_name as string | undefined) || undefined,
  performedByUserId: t.performed_by_user_id ? String(t.performed_by_user_id) : null,
  performedByDisplayName: String(t.performed_by_display_name_snapshot),
  performedAt: String(t.performed_at),
  createdAt: String(t.created_at)
});

const mapWorkingHours = (row: Record<string, unknown>): WorkingHours => ({
  id: String(row.id),
  msnv: String(row.msnv),
  fullName: String(row.full_name),
  department: String(row.department),
  days: row.hours as Record<string, string | number>,
  createdAt: String(row.created_at)
});

async function cleanupTransactionsInBackground() {
  const lastRun = peekClientCache<number>(TRANSACTION_CLEANUP_KEY);
  if (lastRun && Date.now() - lastRun < TRANSACTION_CLEANUP_INTERVAL) {
    return;
  }

  writeClientCache(TRANSACTION_CLEANUP_KEY, Date.now());

  try {
    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);

    await supabase
      .from('transactions')
      .delete()
      .lt('created_at', oneYearAgo.toISOString());
  } catch (cleanupError) {
    console.error('Failed to cleanup old transactions:', cleanupError);
  }
}

const normalizeMachines = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((machine) => String(machine).trim())
    .filter(Boolean);
};

export const SupabaseService = {
  peekUsers: (): User[] | null => peekClientCache<User[]>(CACHE_KEYS.users),
  peekParts: (): SparePart[] | null => peekClientCache<SparePart[]>(CACHE_KEYS.parts),
  peekTransactions: (): Transaction[] | null => peekClientCache<Transaction[]>(CACHE_KEYS.transactions),
  peekWorkingHours: (): WorkingHours[] | null => peekClientCache<WorkingHours[]>(CACHE_KEYS.workingHours),

  // --- Users (Profiles) ---
  getUsers: async (options: QueryOptions = {}): Promise<User[]> => {
    if (!options.forceRefresh) {
      const cachedUsers = readClientCache<User[]>(CACHE_KEYS.users, CACHE_TTL.users);
      if (cachedUsers) {
        return cachedUsers;
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    const users = (data || []).map((p) => mapProfile(p as Record<string, unknown>));
    writeClientCache(CACHE_KEYS.users, users);
    return users;
  },

  getUserById: async (id: string): Promise<User | null> => {
    const cachedUsers = SupabaseService.peekUsers();
    const cachedMatch = cachedUsers?.find((user) => user.id === id) || null;
    if (cachedMatch) {
      return cachedMatch;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    const user = mapProfile(data as Record<string, unknown>);
    const mergedUsers = [user, ...(SupabaseService.peekUsers() || []).filter((item) => item.id !== user.id)];
    writeClientCache(CACHE_KEYS.users, mergedUsers);
    return user;
  },

  getUserByUsername: async (username: string): Promise<User | null> => {
    const cachedUsers = SupabaseService.peekUsers();
    const cachedMatch = cachedUsers?.find((user) => user.username === username) || null;
    if (cachedMatch) {
      return cachedMatch;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    const user = mapProfile(data as Record<string, unknown>);
    const mergedUsers = [user, ...(SupabaseService.peekUsers() || []).filter((item) => item.id !== user.id)];
    writeClientCache(CACHE_KEYS.users, mergedUsers);
    return user;
  },

  createUser: async (user: Omit<User, 'id' | 'createdAt'>): Promise<User> => {
    // Note: In a real Supabase app, creating a user in profiles 
    // doesn't create them in Auth unless using Admin SDK.
    // For this demonstration, we'll insert into profiles.
    const { data, error } = await supabase
      .from('profiles')
      .insert([{
        username: user.username,
        display_name: user.displayName,
        role: user.role,
        is_active: user.isActive,
        password: user.password
      }])
      .select()
      .single();

    if (error) throw error;
    invalidateClientCache(CACHE_KEYS.users);
    return mapProfile(data as Record<string, unknown>);
  },

  updateUser: async (id: string, updates: Partial<User>): Promise<User> => {
    const mappedUpdates: Record<string, string | boolean | undefined> = {};
    if (updates.username !== undefined) mappedUpdates.username = updates.username;
    if (updates.displayName !== undefined) mappedUpdates.display_name = updates.displayName;
    if (updates.role !== undefined) mappedUpdates.role = updates.role;
    if (updates.isActive !== undefined) mappedUpdates.is_active = updates.isActive;
    if (updates.password !== undefined) mappedUpdates.password = updates.password;

    const { data, error } = await supabase
      .from('profiles')
      .update(mappedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    invalidateClientCache(CACHE_KEYS.users);
    return mapProfile(data as Record<string, unknown>);
  },

  deleteUser: async (id: string): Promise<UserDeleteResult> => {
    const disableUser = async (reason: string): Promise<UserDeleteResult> => {
      const { data: disabledProfile, error: disableError } = await supabase
        .from('profiles')
        .update({ is_active: false })
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (disableError) {
        throw disableError;
      }

      if (!disabledProfile) {
        throw new Error('Could not disable this user in Supabase. Check the UPDATE policy on the profiles table.');
      }

      invalidateClientCache(CACHE_KEYS.users);

      return {
        mode: 'disabled',
        reason,
      };
    };

    const { data: deletedProfiles, error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id)
      .select('id');

    if (!error && (deletedProfiles?.length || 0) > 0) {
      invalidateClientCache(CACHE_KEYS.users);
      return { mode: 'deleted' };
    }

    if (!error) {
      const { data: existingProfile, error: existingProfileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (existingProfileError) {
        throw existingProfileError;
      }

      if (!existingProfile) {
        invalidateClientCache(CACHE_KEYS.users);
        return { mode: 'deleted' };
      }

      return disableUser('Hard delete was blocked by the database policy, so the account was disabled instead.');
    }

    if (error.code === '23503') {
      return disableUser('User is still referenced by historical data, so the account was disabled instead of being deleted.');
    }

    throw error;
  },

  // --- Parts ---
  getParts: async (options: QueryOptions = {}): Promise<SparePart[]> => {
    if (!options.forceRefresh) {
      const cachedParts = readClientCache<SparePart[]>(CACHE_KEYS.parts, CACHE_TTL.parts);
      if (cachedParts) {
        return cachedParts;
      }
    }

    const { data, error } = await supabase
      .from('spare_parts')
      .select('*')
      .order('bin_location', { ascending: true })
      .order('part_name', { ascending: true });

    if (error) throw error;
    const parts = (data || []).map((p) => mapPart(p as Record<string, unknown>));
    writeClientCache(CACHE_KEYS.parts, parts);
    return parts;
  },

  createPart: async (data: Omit<SparePart, 'id' | 'createdAt' | 'updatedAt' | 'no'>): Promise<SparePart> => {
    // Manually calculate next 'no'
    const { data: lastPart } = await supabase
      .from('spare_parts')
      .select('no')
      .order('no', { ascending: false })
      .limit(1)
      .single();
    
    const nextNo = (lastPart?.no || 0) + 1;

    const { data: newPart, error } = await supabase
      .from('spare_parts')
      .insert([{
        no: nextNo,
        part_name: data.partName,
        part_number: data.partNumber,
        description: data.description,
        bin_location: data.binLocation,
        current_stock_ok: data.currentStockOk,
        current_stock_damaged: data.currentStockDamaged,
        safety_stock_ok: data.safetyStockOk,
        max_stock: data.maxStock,
        reorder_quantity: data.reorderQuantity,
        lead_time_days: data.leadTimeDays,
        qr_code_value: data.qrCodeValue,
        cost_center: data.costCenter,
        use_for: data.useFor,
        machines: normalizeMachines(data.machines),
        min_stock: data.minStock,
        is_active: data.isActive,
        image_url: data.imageUrl
      }])
      .select()
      .single();

    if (error) throw error;
    invalidateClientCache(CACHE_KEYS.parts);
    
    return mapPart(newPart as Record<string, unknown>);
  },

  updatePart: async (id: string, updates: Partial<SparePart>): Promise<SparePart> => {
    // Map cammelCase to snake_case for Supabase
    const mappedUpdates: Record<string, unknown> = {};
    if (updates.partName !== undefined) mappedUpdates.part_name = updates.partName;
    if (updates.partNumber !== undefined) mappedUpdates.part_number = updates.partNumber;
    if (updates.description !== undefined) mappedUpdates.description = updates.description;
    if (updates.binLocation !== undefined) mappedUpdates.bin_location = updates.binLocation;
    if (updates.currentStockOk !== undefined) mappedUpdates.current_stock_ok = updates.currentStockOk;
    if (updates.currentStockDamaged !== undefined) mappedUpdates.current_stock_damaged = updates.currentStockDamaged;
    if (updates.safetyStockOk !== undefined) mappedUpdates.safety_stock_ok = updates.safetyStockOk;
    if (updates.maxStock !== undefined) mappedUpdates.max_stock = updates.maxStock;
    if (updates.reorderQuantity !== undefined) mappedUpdates.reorder_quantity = updates.reorderQuantity;
    if (updates.leadTimeDays !== undefined) mappedUpdates.lead_time_days = updates.leadTimeDays;
    if (updates.qrCodeValue !== undefined) mappedUpdates.qr_code_value = updates.qrCodeValue;
    if (updates.costCenter !== undefined) mappedUpdates.cost_center = updates.costCenter;
    if (updates.useFor !== undefined) mappedUpdates.use_for = updates.useFor;
    if (updates.machines !== undefined) mappedUpdates.machines = normalizeMachines(updates.machines);
    if (updates.minStock !== undefined) mappedUpdates.min_stock = updates.minStock;
    if (updates.isActive !== undefined) mappedUpdates.is_active = updates.isActive;
    if (updates.imageUrl !== undefined) mappedUpdates.image_url = updates.imageUrl;

    const { data: updatedPart, error } = await supabase
      .from('spare_parts')
      .update(mappedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    invalidateClientCache(CACHE_KEYS.parts);
    
    return mapPart(updatedPart as Record<string, unknown>);
  },

  deletePart: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('spare_parts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    invalidateClientCache(CACHE_KEYS.parts);
  },

  deleteAllParts: async (): Promise<void> => {
    const { error } = await supabase
      .from('spare_parts')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows where id is not a dummy uuid

    if (error) throw error;
    invalidateClientCache(CACHE_KEYS.parts);
  },

  checkBinLocation: async (binLocation: string): Promise<SparePart | null> => {
    const { data, error } = await supabase
      .from('spare_parts')
      .select('*')
      .eq('bin_location', binLocation)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;

    return mapPart(data as Record<string, unknown>);
  },

  bulkCreateParts: async (parts: Partial<SparePart>[]): Promise<void> => {
    const { error } = await supabase
      .from('spare_parts')
      .insert(parts.map((p, index) => ({
        no: p.no || (index + 1), 
        part_name: p.partName,
        part_number: p.partNumber,
        description: p.description,
        bin_location: p.binLocation,
        current_stock_ok: p.currentStockOk,
        current_stock_damaged: p.currentStockDamaged,
        safety_stock_ok: p.safetyStockOk,
        max_stock: p.maxStock,
        reorder_quantity: p.reorderQuantity,
        lead_time_days: p.leadTimeDays,
        qr_code_value: p.qrCodeValue,
        cost_center: p.costCenter,
        use_for: p.useFor,
        machines: normalizeMachines(p.machines),
        min_stock: p.minStock,
        is_active: p.isActive,
        image_url: p.imageUrl
      })));

    if (error) throw error;
    invalidateClientCache(CACHE_KEYS.parts);
  },

  // --- Transactions ---
  getTransactions: async (options: QueryOptions = {}): Promise<Transaction[]> => {
    if (!options.forceRefresh) {
      const cachedTransactions = readClientCache<Transaction[]>(CACHE_KEYS.transactions, CACHE_TTL.transactions);
      if (cachedTransactions) {
        void cleanupTransactionsInBackground();
        return cachedTransactions;
      }
    }

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    const transactions = (data || []).map((t) => mapTransaction(t as Record<string, unknown>));
    writeClientCache(CACHE_KEYS.transactions, transactions);
    void cleanupTransactionsInBackground();
    return transactions;
  },

  createTransaction: async (
    type: 'IN' | 'OUT',
    data: {
      partId: string;
      condition: 'OK' | 'DAMAGED';
      quantity: number;
      performedBy: { id: string, displayName: string };
      reason?: string;
      workOrderNo?: string;
      inspectorName?: string;
    }
  ): Promise<Transaction> => {
    // 1. Get part current stock
    const { data: part, error: partError } = await supabase
      .from('spare_parts')
      .select('*')
      .eq('id', data.partId)
      .single();

    if (partError) throw partError;

    // 2. Logic check for OUT
    let newOkStock = part.current_stock_ok;
    let newDamagedStock = part.current_stock_damaged;

    if (type === 'OUT') {
      if (data.condition === 'OK') {
        if (part.current_stock_ok < data.quantity) throw new Error('Insufficient OK stock');
        newOkStock -= data.quantity;
      } else {
        if (part.current_stock_damaged < data.quantity) throw new Error('Insufficient Damaged stock');
        newDamagedStock -= data.quantity;
      }
    } else {
      if (data.condition === 'OK') newOkStock += data.quantity;
      else newDamagedStock += data.quantity;
    }

    // 3. Update Part Stock in a transaction-like way (handled sequentially here)
    const { error: updateError } = await supabase
      .from('spare_parts')
      .update({
        current_stock_ok: newOkStock,
        current_stock_damaged: newDamagedStock
      })
      .eq('id', data.partId);

    if (updateError) throw updateError;

    // 4. Create Transaction Record
    const orderNo = `${type}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert([{
        order_no: orderNo,
        type,
        part_id: data.partId,
        part_name_snapshot: part.part_name,
        part_number_snapshot: part.part_number || '',
        part_condition: data.condition,
        quantity: data.quantity,
        reason: data.reason || '',
        work_order_no: data.workOrderNo || '',
        inspector_name: data.inspectorName || '',
        performed_by_user_id: data.performedBy.id,
        performed_by_display_name_snapshot: data.performedBy.displayName,
        performed_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (txError) throw txError;
    invalidateClientCache(CACHE_KEYS.transactions);
    invalidateClientCache(CACHE_KEYS.parts);

    return mapTransaction(tx as Record<string, unknown>);
  },

  uploadImage: async (file: Blob, fileName?: string): Promise<string> => {
    const fallbackExt = 'jpg';
    const normalizedName = fileName?.trim().replace(/\s+/g, '-');
    const hasExtension = normalizedName ? /\.[a-z0-9]+$/i.test(normalizedName) : false;
    const safeFileName = normalizedName
      ? normalizedName.replace(/[^a-zA-Z0-9._-]/g, '')
      : `${Math.random().toString(36).substring(2)}-${Date.now()}.${fallbackExt}`;
    const filePath = hasExtension ? safeFileName : `${safeFileName}.${fallbackExt}`;

    const { error: uploadError } = await supabase.storage
      .from('parts')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('parts')
      .getPublicUrl(filePath);

    return data.publicUrl;
  },

  deleteImage: async (url: string): Promise<void> => {
    try {
      if (!url) return;
      // Extract file path from public URL
      const parts = url.split('/parts/');
      if (parts.length < 2) return;
      const filePath = parts[1];

      const { error } = await supabase.storage
        .from('parts')
        .remove([filePath]);

      if (error) throw error;
    } catch (error) {
      console.error("Error deleting image:", error);
    }
  },

  deleteAllImages: async (): Promise<void> => {
    try {
        const { data: list, error: listError } = await supabase.storage.from('parts').list();
        if (listError) throw listError;
        
        if (list && list.length > 0) {
            const filesToRemove = list.map(x => x.name);
            const { error: removeError } = await supabase.storage.from('parts').remove(filesToRemove);
            if (removeError) throw removeError;
        }
    } catch (error) {
        console.error("Error deleting images:", error);
    }
  },

  // --- Working Hours ---
  getWorkingHours: async (options: QueryOptions = {}): Promise<WorkingHours[]> => {
    if (!options.forceRefresh) {
      const cachedWorkingHours = readClientCache<WorkingHours[]>(CACHE_KEYS.workingHours, CACHE_TTL.workingHours);
      if (cachedWorkingHours) {
        return cachedWorkingHours;
      }
    }

    const { data, error } = await supabase
      .from('working_hours')
      .select('*')
      .order('full_name', { ascending: true });

    if (error) throw error;
    const workingHours = (data || []).map((row) => mapWorkingHours(row as Record<string, unknown>));
    writeClientCache(CACHE_KEYS.workingHours, workingHours);
    return workingHours;
  },

  bulkCreateWorkingHours: async (rows: Omit<WorkingHours, 'id' | 'createdAt'>[]): Promise<void> => {
    // Delete all first
    const { error: deleteError } = await supabase
      .from('working_hours')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (deleteError) throw deleteError;

    // Insert new
    const { error: insertError } = await supabase
      .from('working_hours')
      .insert(rows.map(row => ({
        msnv: row.msnv,
        full_name: row.fullName,
        department: row.department,
        hours: row.days
      })));

    if (insertError) throw insertError;
    invalidateClientCache(CACHE_KEYS.workingHours);
  },

  deleteAllWorkingHours: async (): Promise<void> => {
    const { error } = await supabase
      .from('working_hours')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) throw error;
    invalidateClientCache(CACHE_KEYS.workingHours);
  }
};
