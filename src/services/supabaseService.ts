import { supabase } from '@/lib/supabase';
import { SparePart, Transaction, User, Role } from '@/types';

const normalizeMachines = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((machine) => String(machine).trim())
    .filter(Boolean);
};

export const SupabaseService = {
  // --- Users (Profiles) ---
  getUsers: async (): Promise<User[]> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(p => ({
      id: p.id,
      username: p.username,
      displayName: p.display_name,
      role: p.role as Role,
      isActive: p.is_active,
      createdAt: p.created_at,
      password: p.password,
      imageUrl: p.image_url
    }));
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
    return {
      id: data.id,
      username: data.username,
      displayName: data.display_name,
      role: data.role as Role,
      isActive: data.is_active,
      createdAt: data.created_at,
      password: data.password
    };
  },

  updateUser: async (id: string, updates: Partial<User>): Promise<User> => {
    const mappedUpdates: any = {};
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
    return {
      id: data.id,
      username: data.username,
      displayName: data.display_name,
      role: data.role as Role,
      isActive: data.is_active,
      createdAt: data.created_at,
      password: data.password
    };
  },

  deleteUser: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // --- Parts ---
  getParts: async (): Promise<SparePart[]> => {
    const { data, error } = await supabase
      .from('spare_parts')
      .select('*')
      .order('bin_location', { ascending: true })
      .order('part_name', { ascending: true });

    if (error) throw error;
    return (data || []).map(p => ({
      id: p.id,
      no: p.no,
      partName: p.part_name,
      partNumber: p.part_number,
      description: p.description,
      binLocation: p.bin_location,
      currentStockOk: p.current_stock_ok,
      currentStockDamaged: p.current_stock_damaged,
      safetyStockOk: p.safety_stock_ok,
      maxStock: p.max_stock,
      reorderQuantity: p.reorder_quantity,
      leadTimeDays: p.lead_time_days,
      qrCodeValue: p.qr_code_value,
      costCenter: p.cost_center,
      useFor: p.use_for,
      machines: normalizeMachines(p.machines),
      minStock: p.min_stock || 0,
      isActive: p.is_active,
      imageUrl: p.image_url,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }));
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
    
    return {
      id: newPart.id,
      no: newPart.no,
      partName: newPart.part_name,
      partNumber: newPart.part_number,
      description: newPart.description,
      binLocation: newPart.bin_location,
      currentStockOk: newPart.current_stock_ok,
      currentStockDamaged: newPart.current_stock_damaged,
      safetyStockOk: newPart.safety_stock_ok,
      maxStock: newPart.max_stock,
      reorderQuantity: newPart.reorder_quantity,
      leadTimeDays: newPart.lead_time_days,
      qrCodeValue: newPart.qr_code_value,
      costCenter: newPart.cost_center,
      useFor: newPart.use_for,
      machines: normalizeMachines(newPart.machines),
      minStock: newPart.min_stock || 0,
      isActive: newPart.is_active,
      imageUrl: newPart.image_url,
      createdAt: newPart.created_at,
      updatedAt: newPart.updated_at
    };
  },

  updatePart: async (id: string, updates: Partial<SparePart>): Promise<SparePart> => {
    // Map cammelCase to snake_case for Supabase
    const mappedUpdates: any = {};
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
    
    return {
      id: updatedPart.id,
      no: updatedPart.no,
      partName: updatedPart.part_name,
      partNumber: updatedPart.part_number,
      description: updatedPart.description,
      binLocation: updatedPart.bin_location,
      currentStockOk: updatedPart.current_stock_ok,
      currentStockDamaged: updatedPart.current_stock_damaged,
      safetyStockOk: updatedPart.safety_stock_ok,
      maxStock: updatedPart.max_stock,
      reorderQuantity: updatedPart.reorder_quantity,
      leadTimeDays: updatedPart.lead_time_days,
      qrCodeValue: updatedPart.qr_code_value,
      costCenter: updatedPart.cost_center,
      useFor: updatedPart.use_for,
      machines: normalizeMachines(updatedPart.machines),
      minStock: updatedPart.min_stock || 0,
      isActive: updatedPart.is_active,
      imageUrl: updatedPart.image_url,
      createdAt: updatedPart.created_at,
      updatedAt: updatedPart.updated_at
    };
  },

  deletePart: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('spare_parts')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  deleteAllParts: async (): Promise<void> => {
    const { error } = await supabase
      .from('spare_parts')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows where id is not a dummy uuid

    if (error) throw error;
  },

  checkBinLocation: async (binLocation: string): Promise<SparePart | null> => {
    const { data, error } = await supabase
      .from('spare_parts')
      .select('*')
      .eq('bin_location', binLocation)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;

    return {
      id: data.id,
      no: data.no,
      partName: data.part_name,
      partNumber: data.part_number,
      description: data.description,
      binLocation: data.bin_location,
      currentStockOk: data.current_stock_ok,
      currentStockDamaged: data.current_stock_damaged,
      safetyStockOk: data.safety_stock_ok,
      maxStock: data.max_stock,
      reorderQuantity: data.reorder_quantity,
      leadTimeDays: data.lead_time_days,
      qrCodeValue: data.qr_code_value,
      costCenter: data.cost_center,
      useFor: data.use_for,
      machines: normalizeMachines(data.machines),
      minStock: data.min_stock || 0,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  },

  bulkCreateParts: async (parts: any[]): Promise<void> => {
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
  },

  // --- Transactions ---
  getTransactions: async (): Promise<Transaction[]> => {
    // Auto-cleanup: Delete transactions older than 365 days
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

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(t => ({
      id: t.id,
      orderNo: t.order_no,
      type: t.type as 'IN' | 'OUT',
      partId: t.part_id,
      partName: t.part_name_snapshot,
      partNumber: t.part_number_snapshot,
      partCondition: t.part_condition as 'OK' | 'DAMAGED',
      quantity: t.quantity,
      reason: t.reason,
      workOrderNo: t.work_order_no,
      inspectorName: t.inspector_name,
      performedByUserId: t.performed_by_user_id,
      performedByDisplayName: t.performed_by_display_name_snapshot,
      performedAt: t.performed_at,
      createdAt: t.created_at
    }));
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
    
    console.log('--- DEBUG TRANSACTION ---');
    console.log('UserID being sent:', data.performedBy.id);
    console.log('Username:', (data.performedBy as any).username);
    
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

    return {
      id: tx.id,
      orderNo: tx.order_no,
      type: tx.type as 'IN' | 'OUT',
      partId: tx.part_id,
      partName: tx.part_name_snapshot,
      partNumber: tx.part_number_snapshot,
      partCondition: tx.part_condition as 'OK' | 'DAMAGED',
      quantity: tx.quantity,
      reason: tx.reason,
      workOrderNo: tx.work_order_no,
      inspectorName: tx.inspector_name,
      performedByUserId: tx.performed_by_user_id,
      performedByDisplayName: tx.performed_by_display_name_snapshot,
      performedAt: tx.performed_at,
      createdAt: tx.created_at
    };
  },

  uploadImage: async (file: Blob, fileName: string): Promise<string> => {
    const fileExt = 'jpg';
    const filePath = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;

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
      // URL format: .../storage/v1/object/public/parts/filename.jpg
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
        // We don't throw here to avoid blocking the main overwrite process if storage cleanup fails
    }
  }
};
