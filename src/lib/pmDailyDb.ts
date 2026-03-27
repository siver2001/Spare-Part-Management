import { DailyAssignment } from '@/types/pmDaily';
import { supabase } from '@/lib/supabase';

const RETENTION_DAYS = 60;

function toPayload(task: DailyAssignment) {
  return {
    id: task.id,
    id_machine: task.idMachine,
    work_content: task.workContent,
    assignee: task.assignee,
    date: task.date,
    start_time: task.startTime,
    stop_time: task.stopTime,
    priority: task.priority,
    status: task.status,
    checklist: task.checklist,
    notes: task.notes,
    photos: task.photos
  };
}

export const pmDailyDb = {
  async getTasks(dateStart?: string, dateEnd?: string): Promise<DailyAssignment[]> {
    let query = supabase
      .from('pm_daily_assignments')
      .select('*')
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (dateStart) query = query.gte('date', dateStart);
    if (dateEnd) query = query.lte('date', dateEnd);

    const { data, error } = await query;
    if (error) return [];

    return (data || []).map(t => ({
      id: t.id,
      idMachine: t.id_machine,
      equipmentName: '', 
      workContent: t.work_content,
      date: t.date,
      startTime: t.start_time,
      stopTime: t.stop_time,
      assignee: t.assignee,
      priority: t.priority,
      status: t.status,
      checklist: t.checklist || [],
      notes: t.notes || '',
      photos: t.photos || []
    }));
  },

  async saveTask(task: DailyAssignment): Promise<void> {
    await supabase.from('pm_daily_assignments').upsert(toPayload(task));
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

    this.cleanupOldTasks();
    return {
      created: newTasks.length,
      skipped: tasks.length - newTasks.length
    };
  },

  async deleteTask(id: string): Promise<void> {
    await supabase.from('pm_daily_assignments').delete().eq('id', id);
  },

  async cleanupOldTasks() {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - RETENTION_DAYS);
    const thresholdStr = threshold.toISOString().split('T')[0];

    await supabase.from('pm_daily_assignments').delete().lt('date', thresholdStr);
  }
};
