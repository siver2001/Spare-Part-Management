import { DailyAssignment } from '@/types/pmDaily';
import { supabase } from '@/lib/supabase';
import {
  invalidateClientCacheByPrefix,
  peekClientCache,
  readClientCache,
  writeClientCache,
} from '@/lib/clientCache';

const RETENTION_DAYS = 60;
const PM_DAILY_CACHE_PREFIX = 'pm-daily:';
const PM_DAILY_CACHE_TTL = 2 * 60 * 1000;

function getPmDailyCacheKey(dateStart?: string, dateEnd?: string) {
  return `${PM_DAILY_CACHE_PREFIX}${dateStart || 'all'}:${dateEnd || 'all'}`;
}

function toPayload(task: DailyAssignment) {
  return {
    id: task.id,
    id_machine: task.idMachine,
    work_content: task.workContent,
    assignee: task.assignees.join(', '),
    date: task.date,
    end_date: task.endDate,
    start_time: task.startTime,
    stop_time: task.stopTime,
    priority: task.priority,
    status: task.status,
    checklist: task.checklist,
    notes: task.notes,
    photos: task.photos,
    workshop: task.workshop,
    handover_shifts: task.handoverShifts?.join(', '),
    handover_staff: task.handoverStaff?.join(', '),
    created_by: task.createdBy,
    created_by_id: task.createdById,
    handover_logs: task.handoverLogs || [],
    confirmations: task.confirmations || []
  };
}

export const pmDailyDb = {
  peekTasks(dateStart?: string, dateEnd?: string): DailyAssignment[] | null {
    return peekClientCache<DailyAssignment[]>(getPmDailyCacheKey(dateStart, dateEnd));
  },

  async getTasks(dateStart?: string, dateEnd?: string, options: { forceRefresh?: boolean } = {}): Promise<DailyAssignment[]> {
    const cacheKey = getPmDailyCacheKey(dateStart, dateEnd);
    if (!options.forceRefresh) {
      const cachedTasks = readClientCache<DailyAssignment[]>(cacheKey, PM_DAILY_CACHE_TTL);
      if (cachedTasks) {
        return cachedTasks;
      }
    }

    let query = supabase
      .from('pm_daily_assignments')
      .select('*')
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (dateStart) query = query.gte('date', dateStart);
    if (dateEnd) query = query.lte('date', dateEnd);

    const { data, error } = await query;
    if (error) return [];

    const tasks = (data || []).map(t => ({
      id: t.id,
      idMachine: t.id_machine,
      equipmentName: '', 
      workContent: t.work_content,
      date: t.date,
      endDate: t.end_date || t.date, // Use date as fallback if end_date is null
      startTime: t.start_time,
      stopTime: t.stop_time,
      assignees: t.assignee ? String(t.assignee).split(',').map((s: string) => s.trim()) : [],
      priority: t.priority,
      status: t.status,
      checklist: t.checklist || [],
      notes: t.notes || '',
      photos: t.photos || [],
      workshop: t.workshop || '',
      handoverShifts: t.handover_shifts ? String(t.handover_shifts).split(',').map((s: string) => s.trim()) : [],
      handoverStaff: t.handover_staff ? String(t.handover_staff).split(',').map((s: string) => s.trim()) : [],
      createdBy: t.created_by,
      createdById: t.created_by_id,
      handoverLogs: t.handover_logs || [],
      confirmations: t.confirmations || []
    }));

    writeClientCache(cacheKey, tasks);
    return tasks;
  },

  async saveTask(task: DailyAssignment): Promise<void> {
    const { error } = await supabase.from('pm_daily_assignments').upsert(toPayload(task));
    if (error) {
      console.error('Error saving task:', error);
      throw error;
    }
    invalidateClientCacheByPrefix(PM_DAILY_CACHE_PREFIX);
    this.cleanupOldTasks();
  },

  async createTasksIfMissing(tasks: DailyAssignment[]): Promise<{ created: number; skipped: number }> {
    if (tasks.length === 0) {
      return { created: 0, skipped: 0 };
    }

    const taskIds = tasks.map((task) => task.id);
    const { data: existingRows, error: existingError } = await supabase
      .from('pm_daily_assignments')
      .select('id')
      .in('id', taskIds);

    if (existingError) throw existingError;

    const existingIds = new Set((existingRows || []).map((row) => row.id as string));
    const newTasks = tasks.filter((task) => !existingIds.has(task.id));

    if (newTasks.length === 0) {
      return { created: 0, skipped: tasks.length };
    }

    const { error: insertError } = await supabase
      .from('pm_daily_assignments')
      .insert(newTasks.map(toPayload));

    if (insertError) throw insertError;

    invalidateClientCacheByPrefix(PM_DAILY_CACHE_PREFIX);
    this.cleanupOldTasks();
    return {
      created: newTasks.length,
      skipped: tasks.length - newTasks.length
    };
  },

  async deleteTask(id: string): Promise<void> {
    const { error } = await supabase.from('pm_daily_assignments').delete().eq('id', id);
    if (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
    invalidateClientCacheByPrefix(PM_DAILY_CACHE_PREFIX);
  },

  async cleanupOldTasks() {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - RETENTION_DAYS);
    const thresholdStr = threshold.toISOString().split('T')[0];

    await supabase.from('pm_daily_assignments').delete().lt('date', thresholdStr);
  }
};
