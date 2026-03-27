'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { toast } from 'sonner';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Edit,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  PauseCircle,
  ClipboardList
} from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { useAuth } from '@/contexts/AuthContext';
import { DailyAssignment, Priority, Status } from '@/types/pmDaily';
import { pmDailyDb } from '@/lib/pmDailyDb';
import { supabase } from '@/lib/supabase';
import { getCurrentIsoWeek, getIsoWeekYear, getMonthFromIsoWeek, normalizePmChecklistTemplate } from '@/lib/pmSchedule';
import { PMWorkshopType } from '@/types/pm';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const SYNC_NAMESPACE = '5d4a1b67-52b4-4e1b-b8d5-9c6684d5f90d';
const WORKSHOP_OPTIONS: Array<{ value: 'all' | PMWorkshopType; label: string }> = [
  { value: 'all', label: 'All Workshops' },
  { value: 'foaming', label: 'Xuong Foaming' },
  { value: 'insole', label: 'Xuong Insole' }
];
const WORKSHOP_LABELS: Record<PMWorkshopType, string> = {
  foaming: 'Xuong Foaming',
  insole: 'Xuong Insole'
};
const SYNC_MODE_OPTIONS = [
  { value: 'week', label: 'Theo Tuan' },
  { value: 'month', label: 'Theo Thang' }
] as const;

type SyncMode = (typeof SYNC_MODE_OPTIONS)[number]['value'];

function getWeekDatesForIsoWeek(year: number, week: number): Date[] {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(monday);
    current.setUTCDate(monday.getUTCDate() + index);
    return new Date(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  });
}

function formatDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function getSyncDateForWeek(year: number, week: number, mode: SyncMode, selectedDate: Date): string {
  if (mode === 'week') {
    return formatDateKey(selectedDate);
  }

  const selectedMonth = selectedDate.getMonth();
  const weekDates = getWeekDatesForIsoWeek(year, week);
  const matchedDate = weekDates.find((day) => day.getMonth() === selectedMonth);

  return formatDateKey(matchedDate || weekDates[0]);
}

export default function PmDailyPlannerPage() {
  const { user } = useAuth();
  const isAdmin = user && (user.role === 'ADMIN' || user.role === 'POWER_USER');
  
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [tasks, setTasks] = useState<DailyAssignment[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyAssignment | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncWorkshop, setSyncWorkshop] = useState<'all' | PMWorkshopType>('all');
  const [syncMode, setSyncMode] = useState<SyncMode>('week');
  const [taskPendingDelete, setTaskPendingDelete] = useState<DailyAssignment | null>(null);

  useEffect(() => {
    setMounted(true);
    setDate(new Date());
  }, []);

  // Form State
  const [formData, setFormData] = useState({
    assignee: '',
    workContent: '',
    priority: 'P2 (Normal)' as Priority,
    status: 'Planned' as Status,
    startTime: '08:00',
    stopTime: '09:00',
    idMachine: ''
  });

  const selectedDateStr = useMemo(() => {
    if (!mounted || !date) return format(new Date(), 'yyyy-MM-dd');
    return format(date, 'yyyy-MM-dd');
  }, [date, mounted]);

  const selectedWeek = useMemo(() => {
    if (!mounted || !date) return getCurrentIsoWeek(new Date());
    return getCurrentIsoWeek(date);
  }, [date, mounted]);

  const selectedWeekYear = useMemo(() => {
    if (!mounted || !date) return getIsoWeekYear(new Date());
    return getIsoWeekYear(date);
  }, [date, mounted]);

  const selectedMonth = useMemo(() => {
    if (!mounted || !date) return new Date().getMonth() + 1;
    return date.getMonth() + 1;
  }, [date, mounted]);

  const selectedCalendarYear = useMemo(() => {
    if (!mounted || !date) return new Date().getFullYear();
    return date.getFullYear();
  }, [date, mounted]);

  useEffect(() => {
    if (!mounted || !date) return;

    let isMounted = true;
    const fetchTasks = async () => {
      setLoading(true);
      try {
        const start = format(startOfMonth(date), 'yyyy-MM-dd');
        const end = format(endOfMonth(date), 'yyyy-MM-dd');
        const allTasks = await pmDailyDb.getTasks(start, end);
        if (isMounted) {
          setTasks(allTasks);
        }
      } catch (err) {
        console.error("Failed to load tasks:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTasks();
    return () => { isMounted = false; };
  }, [date, mounted]); // Reload on date change (month change in calendar or specific date selection)

  const dailyTasks = useMemo(() => {
    if (!mounted) return [];
    return tasks.filter(t => t.date === selectedDateStr);
  }, [tasks, selectedDateStr, mounted]);

  const loadMonthTasks = useCallback(async () => {
    if (!date || !mounted) return;
    const start = format(startOfMonth(date), 'yyyy-MM-dd');
    const end = format(endOfMonth(date), 'yyyy-MM-dd');
    const allTasks = await pmDailyDb.getTasks(start, end);
    setTasks(allTasks);
  }, [date, mounted]);

  const handleOpenAdd = () => {
    setEditingTask(null);
    setFormData({
      assignee: '',
      workContent: '',
      priority: 'P2 (Normal)',
      status: 'Planned',
      startTime: '08:00',
      stopTime: '09:00',
      idMachine: ''
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (task: DailyAssignment) => {
    setEditingTask(task);
    setFormData({
      assignee: task.assignee || '',
      workContent: task.workContent,
      priority: task.priority,
      status: task.status,
      startTime: task.startTime || '08:00',
      stopTime: task.stopTime || '09:00',
      idMachine: task.idMachine || ''
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.workContent) {
      toast.error("Please enter work content");
      return;
    }

    const task: DailyAssignment = {
      id: editingTask?.id || uuidv4(),
      date: selectedDateStr,
      assignee: formData.assignee,
      workContent: formData.workContent,
      priority: formData.priority,
      status: formData.status,
      startTime: formData.startTime,
      stopTime: formData.stopTime,
      idMachine: formData.idMachine,
      checklist: editingTask?.checklist || [],
      notes: editingTask?.notes || '',
      photos: editingTask?.photos || []
    };

    await pmDailyDb.saveTask(task);
    toast.success(editingTask ? "Task updated" : "Task added");
    setIsDialogOpen(false);
    loadMonthTasks();
  };

  const handleDelete = async (task: DailyAssignment) => {
    await pmDailyDb.deleteTask(task.id);
    setTaskPendingDelete(null);
    loadMonthTasks();
    toast.success("Task deleted");
  };

  const handleSyncPmSchedule = async () => {
    if (!date) return;

    setSyncing(true);
    try {
      const targetYear = syncMode === 'week' ? selectedWeekYear : selectedCalendarYear;
      let query = supabase
        .from('pm_schedules')
        .select('workshop, year, id_machine, equipment_name, planned_weeks, checklist_template')
        .eq('year', targetYear);

      if (syncWorkshop !== 'all') {
        query = query.eq('workshop', syncWorkshop);
      }

      const { data: scheduleRows, error } = await query;
      if (error) throw error;

      const sourceRows = scheduleRows || [];
      if (sourceRows.length === 0) {
        toast.error('Khong tim thay du lieu PM Schedule phu hop de dong bo.');
        return;
      }

      const generatedTasks: DailyAssignment[] = sourceRows.flatMap((row) => {
        const plannedWeeks = Array.isArray(row.planned_weeks)
          ? row.planned_weeks
              .map((week) => Number(week))
              .filter((week) => Number.isInteger(week) && week >= 1 && week <= 52)
          : [];

        const matchedWeeks = plannedWeeks.filter((week) =>
          syncMode === 'week'
            ? week === selectedWeek
            : getMonthFromIsoWeek(targetYear, week) === selectedMonth
        );

        if (matchedWeeks.length === 0) {
          return [];
        }

        return matchedWeeks.map((week) => {
          const taskDate = getSyncDateForWeek(targetYear, week, syncMode, date);
          const workshop = row.workshop as PMWorkshopType;
          const workshopLabel = WORKSHOP_LABELS[workshop] || workshop;
          const equipmentName = String(row.equipment_name || '').trim();
          const machineId = String(row.id_machine || '').trim();
          const titleSuffix = equipmentName ? `${equipmentName}` : machineId;
          const activeChecklist = normalizePmChecklistTemplate(row.checklist_template).filter((item) => item.checked);
          const checklistSummary = activeChecklist.map((item) => item.text).join(' • ');
          const baseWorkContent = `PM ${workshopLabel} - ${titleSuffix} - Week ${week}`;

          return {
            id: uuidv5(`${workshop}:${machineId}:${targetYear}:${week}:${taskDate}`, SYNC_NAMESPACE),
            idMachine: machineId,
            equipmentName,
            workshop,
            week,
            workContent: checklistSummary ? `${baseWorkContent} | Checklist: ${checklistSummary}` : baseWorkContent,
            date: taskDate,
            startTime: '08:00',
            assignee: '',
            priority: 'P2 (Normal)' as Priority,
            status: 'Planned' as Status,
            checklist: activeChecklist.map((item) => ({ text: item.text, checked: false })),
            notes: [
              `Auto-generated from PM Schedule (${workshopLabel}, Week ${week}).`,
              checklistSummary ? `Checklist can lam:\n- ${activeChecklist.map((item) => item.text).join('\n- ')}` : '',
            ].filter(Boolean).join('\n\n'),
            stopTime: '09:00',
            photos: []
          };
        });
      });

      if (generatedTasks.length === 0) {
        toast.error('Khong co may den han trong pham vi da chon.');
        return;
      }

      const result = await pmDailyDb.createTasksIfMissing(generatedTasks);
      await loadMonthTasks();
      setIsSyncDialogOpen(false);

      if (result.created === 0) {
        toast.success(`Tat ca ${result.skipped} task da ton tai, khong tao trung.`);
        return;
      }

      toast.success(`Da tao ${result.created} task tu PM Schedule${result.skipped > 0 ? `, bo qua ${result.skipped} task trung` : ''}.`);
    } catch (error) {
      console.error('Failed to sync PM schedule to planner:', error);
      toast.error('Dong bo tu PM Schedule that bai.');
    } finally {
      setSyncing(false);
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'P0 (Urgent)': return <Badge variant="destructive" className="bg-red-500">{p}</Badge>;
      case 'P1 (High)': return <Badge className="bg-orange-500 text-white border-orange-600">{p}</Badge>;
      case 'P2 (Normal)': return <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">{p}</Badge>;
      default: return <Badge variant="outline">{p}</Badge>;
    }
  };

  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'Done': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'In Progress': return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'Blocked': return <PauseCircle className="h-4 w-4 text-red-500" />;
      case 'Skipped': return <XCircle className="h-4 w-4 text-slate-400" />;
      default: return <AlertCircle className="h-4 w-4 text-amber-500" />;
    }
  };

  const getStatusTone = (status: string) => {
    switch (status) {
      case 'Done':
        return 'from-emerald-50 to-green-50';
      case 'In Progress':
        return 'from-blue-50 to-cyan-50';
      case 'Blocked':
        return 'from-rose-50 to-red-50';
      case 'Skipped':
        return 'from-slate-50 to-slate-100';
      default:
        return 'from-amber-50 to-yellow-50';
    }
  };

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border-0 bg-gradient-to-r from-slate-900 via-indigo-900 to-fuchsia-900 p-6 shadow-xl shadow-indigo-900/20 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Monthly Planner</h1>
            <p className="text-sm text-slate-200">Plan and track daily PM assignments for each month</p>
          </div>
          {isAdmin && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setIsSyncDialogOpen(true)} className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <RefreshCw className="mr-2 h-4 w-4" /> Sync From PM Schedule
              </Button>
              <Button onClick={handleOpenAdd} className="bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/30 hover:from-cyan-300 hover:to-blue-400">
                 <Plus className="mr-2 h-4 w-4" /> Add Task for {selectedDateStr}
              </Button>
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Calendar Section */}
          <Card className="lg:col-span-4 h-fit overflow-hidden border-0 bg-white shadow-md shadow-slate-200/70">
            <CardHeader className="border-b border-cyan-100 bg-gradient-to-r from-cyan-50 via-sky-50 to-blue-50 py-4">
               <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-indigo-600" /> Select Date
                </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center bg-gradient-to-b from-white to-cyan-50/50 p-4">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border-0"
                modifiers={{
                  hasTasks: (d: Date) => tasks.some(t => t.date === format(d, 'yyyy-MM-dd'))
                }}
                modifiersClassNames={{
                  hasTasks: "font-bold text-indigo-600 underline decoration-2 underline-offset-4"
                }}
              />
            </CardContent>
          </Card>

          {/* Daily Tasks Section */}
          <Card className="lg:col-span-8 flex min-h-[500px] flex-col overflow-hidden border-0 bg-white shadow-md shadow-slate-200/70">
             <CardHeader className="flex flex-row items-center justify-between border-b border-fuchsia-100 bg-gradient-to-r from-fuchsia-50 via-violet-50 to-indigo-50 py-4">
                <div>
                   <CardTitle className="text-lg font-bold">Tasks for {selectedDateStr}</CardTitle>
                    <CardDescription>
                      {dailyTasks.length} task(s) scheduled
                   </CardDescription>
                </div>
                <Badge variant="outline" className="border-fuchsia-200 bg-white/90 text-fuchsia-700">
                  {mounted && date ? format(date, 'MMMM yyyy') : ''}
                </Badge>
             </CardHeader>
             <CardContent className="p-0 flex-1 relative">
                <ScrollArea className="h-[450px]">
                   <div className="p-0">
                      {loading ? (
                        <div className="flex flex-col items-center justify-center h-[300px] text-slate-400 space-y-4">
                           <div className="h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                           <p className="text-sm">Loading tasks...</p>
                        </div>
                      ) : dailyTasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[300px] text-slate-400 space-y-4">
                           <ClipboardList className="h-12 w-12 opacity-20" />
                           <p className="text-sm">No tasks assigned to this date.</p>
                           {isAdmin && <Button variant="outline" size="sm" onClick={handleOpenAdd}>Create first task</Button>}
                        </div>
                      ) : (
                        <Table>
                          <TableHeader className="bg-gradient-to-r from-slate-50 via-cyan-50/50 to-fuchsia-50/50">
                            <TableRow>
                              <TableHead className="w-[100px]">Time</TableHead>
                              <TableHead>Assignee</TableHead>
                              <TableHead>Machine/Work</TableHead>
                              <TableHead>Status</TableHead>
                              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dailyTasks.map((task) => (
                              <TableRow key={task.id} className={`group bg-gradient-to-r ${getStatusTone(task.status)} transition-colors hover:brightness-[0.98]`}>
                                <TableCell className="font-medium align-top">
                                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-slate-700 shadow-sm">
                                    <Clock className="h-3.5 w-3.5 text-indigo-500" />
                                    {task.startTime || '08:00'}
                                    {task.stopTime ? ` - ${task.stopTime}` : ''}
                                  </div>
                                </TableCell>
                                <TableCell className="align-top">
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 font-bold text-[10px] text-white shadow-sm">
                                       {task.assignee ? task.assignee.charAt(0).toUpperCase() : '?'}
                                     </div>
                                    <span className="text-sm text-slate-700">{task.assignee || 'Unassigned'}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="align-top">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      {task.idMachine && <Badge variant="secondary" className="h-4 bg-white/80 px-1 text-[10px] text-slate-700 shadow-sm">{task.idMachine}</Badge>}
                                      {getPriorityBadge(task.priority)}
                                    </div>
                                    <p className="text-sm font-medium text-slate-900 leading-tight">{task.workContent}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="align-top">
                                   <div className="flex items-center gap-2 py-1">
                                      {getStatusIcon(task.status)}
                                      <span className="text-xs font-semibold text-slate-600">{task.status}</span>
                                   </div>
                                </TableCell>
                                {isAdmin && (
                                  <TableCell className="text-right align-top">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:bg-white/70 hover:text-indigo-600" onClick={() => handleOpenEdit(task)}>
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:bg-white/70 hover:text-red-500" onClick={() => setTaskPendingDelete(task)}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                   </div>
                </ScrollArea>
             </CardContent>
          </Card>
        </div>
      </div>

      {/* Task Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md border-0 bg-white shadow-xl shadow-indigo-200/40">
          <DialogHeader>
            <DialogTitle className="text-slate-900">{editingTask ? 'Edit Task' : 'Add New Task'}</DialogTitle>
            <DialogDescription className="text-slate-600">
              Assign work for {selectedDateStr}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="assignee" className="text-right">Assignee</Label>
              <Input
                id="assignee"
                value={formData.assignee}
                onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
                className="col-span-3"
                placeholder="e.g. Technician A"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="idMachine" className="text-right">Machine ID</Label>
              <Input
                id="idMachine"
                value={formData.idMachine}
                onChange={(e) => setFormData({ ...formData, idMachine: e.target.value })}
                className="col-span-3"
                placeholder="Optional machine code"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="startTime" className="text-right">Start Time</Label>
               <Input
                 id="startTime"
                 type="time"
                 value={formData.startTime}
                 onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                 className="col-span-3"
               />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="stopTime" className="text-right">Stop Time</Label>
               <Input
                 id="stopTime"
                 type="time"
                 value={formData.stopTime}
                 onChange={(e) => setFormData({ ...formData, stopTime: e.target.value })}
                 className="col-span-3"
               />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="work" className="text-right pt-2">Task Info</Label>
              <textarea
                id="work"
                value={formData.workContent}
                onChange={(e) => setFormData({ ...formData, workContent: e.target.value })}
                className="col-span-3 min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="What needs to be done?"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Priority</Label>
              <Select value={formData.priority} onValueChange={(v: Priority) => setFormData({...formData, priority: v})}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="P0 (Urgent)">P0 (Urgent)</SelectItem>
                  <SelectItem value="P1 (High)">P1 (High)</SelectItem>
                  <SelectItem value="P2 (Normal)">P2 (Normal)</SelectItem>
                  <SelectItem value="P3 (Low)">P3 (Low)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Status</Label>
              <Select value={formData.status} onValueChange={(v: Status) => setFormData({...formData, status: v})}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Planned">Planned</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Done">Done</SelectItem>
                  <SelectItem value="Blocked">Blocked</SelectItem>
                  <SelectItem value="Skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-700 hover:to-fuchsia-700">Save Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSyncDialogOpen} onOpenChange={setIsSyncDialogOpen}>
        <DialogContent className="max-w-lg border-0 bg-white shadow-xl shadow-cyan-200/40">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Sync Tasks From PM Schedule</DialogTitle>
            <DialogDescription className="text-slate-600">
              Tu dong tao task trong Monthly Planner tu cac may den han PM. He thong se bo qua task da ton tai de tranh tao trung.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Workshop</Label>
              <Select value={syncWorkshop} onValueChange={(value: 'all' | PMWorkshopType) => setSyncWorkshop(value)}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKSHOP_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Mode</Label>
              <Select value={syncMode} onValueChange={(value: SyncMode) => setSyncMode(value)}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYNC_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border border-cyan-100 bg-gradient-to-r from-cyan-50 via-sky-50 to-indigo-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">
                {syncMode === 'week'
                  ? `Tuan duoc dong bo: Week ${selectedWeek} / ${selectedWeekYear}`
                  : `Thang duoc dong bo: ${mounted && date ? format(date, 'MMMM yyyy') : ''}`}
              </p>
              <p className="mt-2">
                {syncMode === 'week'
                  ? `Tat ca may den han trong week ${selectedWeek} se duoc tao task vao ngay ${selectedDateStr}.`
                  : 'Task se duoc trai vao ngay dau tien trong thang ung voi tung week PM de de theo doi tren lich.'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSyncDialogOpen(false)} disabled={syncing}>
              Cancel
            </Button>
            <Button onClick={handleSyncPmSchedule} className="bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-600 hover:to-indigo-700" disabled={syncing || !date}>
              {syncing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync Now
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!taskPendingDelete} onOpenChange={(open) => !open && setTaskPendingDelete(null)}>
        <DialogContent className="max-w-md border-0 bg-white shadow-xl shadow-rose-200/40">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Delete Task?</DialogTitle>
            <DialogDescription className="text-slate-600">
              {taskPendingDelete
                ? `Task "${taskPendingDelete.workContent}" on ${taskPendingDelete.date} will be deleted. This action cannot be undone.`
                : 'This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => taskPendingDelete && handleDelete(taskPendingDelete)}
              className="bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700"
            >
              Delete Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedLayout>
  );
}
