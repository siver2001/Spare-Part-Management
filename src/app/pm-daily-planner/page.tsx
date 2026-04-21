'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { toast } from 'sonner';
import {
  Calendar as CalendarIcon,
  Plus,
  Check,
  ChevronsUpDown,
  Trash2,
  Edit,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { DailyAssignment, Priority, Status } from '@/types/pmDaily';
import { pmDailyDb } from '@/lib/pmDailyDb';
import { supabase } from '@/lib/supabase';
import { getCurrentIsoWeek, getIsoWeekYear, getMonthFromIsoWeek, normalizePmChecklistTemplate } from '@/lib/pmSchedule';
import { PMWorkshopType } from '@/types/pm';
import { User } from '@/types';
import { SupabaseService } from '@/services/supabaseService';
import { getWorkingHoursDateKey } from '@/lib/workingHours';

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

const SHIFT_MAP: Record<string, { start: string, stop: string }> = {
  'C1': { start: '06:00', stop: '14:00' },
  'C1/12': { start: '06:00', stop: '18:00' },
  'C2': { start: '14:00', stop: '22:00' },
  'C2/12': { start: '10:00', stop: '22:00' },
  'C3': { start: '22:00', stop: '06:00' },
  'C3/12': { start: '18:00', stop: '06:00' },
  'HC': { start: '08:00', stop: '16:00' },
  'HC/12': { start: '08:00', stop: '22:00' },
  'HC/OT': { start: '08:00', stop: '22:00' },
};

const normalizeIdentity = (value: string | null | undefined) =>
  String(value || '')
    .trim()
    .toLowerCase();

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const isTaskInShift = (taskStart: string, taskStop: string, shiftCode: string) => {
    const code = String(shiftCode).toUpperCase().trim();
    const shift = SHIFT_MAP[code];
    if (!shift) return false;
    
    const ts = timeToMinutes(taskStart);
    const te = timeToMinutes(taskStop);
    const ss = timeToMinutes(shift.start);
    const se = timeToMinutes(shift.stop);
    
    if (se > ss) {
        return ts >= ss && te <= se;
    } else {
        // Overnight
        const isTsValid = ts >= ss || ts <= se;
        const isTeValid = te >= ss || te <= se;
        return isTsValid && isTeValid;
    }
};

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
  const initialDateRef = useRef(new Date());
  const initialMonthStartRef = useRef(format(startOfMonth(initialDateRef.current), 'yyyy-MM-dd'));
  const initialMonthEndRef = useRef(format(endOfMonth(initialDateRef.current), 'yyyy-MM-dd'));
  const initialTasksRef = useRef(
    pmDailyDb.peekTasks(initialMonthStartRef.current, initialMonthEndRef.current)
  );
  const initialUsersRef = useRef(
    (SupabaseService.peekUsers() || []).filter((item) => item.isActive)
  );
  const initialWorkingHoursRef = useRef(SupabaseService.peekWorkingHours() || []);
  
  const [date, setDate] = useState<Date | undefined>(initialDateRef.current);
  const [tasks, setTasks] = useState<DailyAssignment[]>(initialTasksRef.current || []);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyAssignment | null>(null);
  const [loading, setLoading] = useState(!initialTasksRef.current);
  const [mounted, setMounted] = useState(false);
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncWorkshop, setSyncWorkshop] = useState<'all' | PMWorkshopType>('all');
  const [syncMode, setSyncMode] = useState<SyncMode>('week');
  const [taskPendingDelete, setTaskPendingDelete] = useState<DailyAssignment | null>(null);
  const [users, setUsers] = useState<User[]>(initialUsersRef.current);
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('monthly');
  const [openAssignee, setOpenAssignee] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [workingHours, setWorkingHours] = useState<Awaited<ReturnType<typeof SupabaseService.getWorkingHours>>>(initialWorkingHoursRef.current);
  const itemsPerPage = 10;

  useEffect(() => {
    setMounted(true);
    
    // Fetch users and working hours
    const fetchData = async () => {
        try {
            const [userData, whData] = await Promise.all([
                SupabaseService.getUsers({ forceRefresh: true }),
                SupabaseService.getWorkingHours({ forceRefresh: true })
            ]);
            setUsers(userData.filter(u => u.isActive));
            setWorkingHours(whData);
        } catch (error) {
            console.error("Failed to fetch data", error);
        }
    };
    fetchData();
  }, []);

  // Form State
  const [formData, setFormData] = useState({
    taskDate: '',
    assignees: [] as string[],
    workContent: '',
    priority: 'P2 (Normal)' as Priority,
    status: 'Planned' as Status,
    startTime: '08:00',
    stopTime: '16:00',
    idMachine: '',
    shift: ''
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
      const start = format(startOfMonth(date), 'yyyy-MM-dd');
      const end = format(endOfMonth(date), 'yyyy-MM-dd');
      const cachedTasks = pmDailyDb.peekTasks(start, end);
      if (cachedTasks) {
        setTasks(cachedTasks);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const allTasks = await pmDailyDb.getTasks(start, end, { forceRefresh: true });
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
    const allTasks = await pmDailyDb.getTasks(start, end, { forceRefresh: true });
    setTasks(allTasks);
  }, [date, mounted]);

  const monthStats = useMemo(() => {
    const stats = {
        total: tasks.length,
        p0: tasks.filter(t => t.priority.startsWith('P0')).length,
        p1: tasks.filter(t => t.priority.startsWith('P1')).length,
        p2: tasks.filter(t => t.priority.startsWith('P2')).length,
        done: tasks.filter(t => t.status === 'Done').length,
        planned: tasks.filter(t => t.status === 'Planned').length,
        progress: tasks.filter(t => t.status.startsWith('Progress')).length
    };
    return stats;
  }, [tasks]);

  const paginatedTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => a.date.localeCompare(b.date));
    const start = (currentPage - 1) * itemsPerPage;
    return sorted.slice(start, start + itemsPerPage);
  }, [tasks, currentPage]);

  const tasksByDate = useMemo(() => {
    const grouped: Record<string, DailyAssignment[]> = {};
    paginatedTasks.forEach(t => {
        if (!grouped[t.date]) grouped[t.date] = [];
        grouped[t.date].push(t);
    });
    return grouped;
  }, [paginatedTasks]);

  const totalPages = Math.ceil(tasks.length / itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [date, tasks.length]);

  const handleOpenAdd = () => {
    setEditingTask(null);
    setFormData({
      taskDate: selectedDateStr,
      assignees: [],
      workContent: '',
      priority: 'P2 (Normal)',
      status: 'Planned',
      startTime: '08:00',
      stopTime: '16:00',
      idMachine: '',
      shift: ''
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (task: DailyAssignment) => {
    setEditingTask(task);
    setFormData({
      taskDate: task.date,
      assignees: task.assignees || [],
      workContent: task.workContent,
      priority: task.priority,
      status: task.status,
      startTime: task.startTime || '08:00',
      stopTime: task.stopTime || '09:00',
      idMachine: task.idMachine || '',
      shift: ''
    });
    setIsDialogOpen(true);
  };

  const assignmentDate = useMemo(() => {
    if (!formData.taskDate) {
      return null;
    }

    const parsed = new Date(`${formData.taskDate}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [formData.taskDate]);

  // Only allow assignees that exist in working-hours and are on shift for the chosen date/time.
  const filteredUsersByShift = useMemo(() => {
    if (!formData.startTime || !formData.stopTime) return users;
    if (!assignmentDate) return [];

    const dateLabel = getWorkingHoursDateKey(assignmentDate);

    const userByMsnv = new Map(
      users.map((item) => [normalizeIdentity(item.username), item] as const)
    );
    const userByDisplayName = new Map(
      users.map((item) => [normalizeIdentity(item.displayName), item] as const)
    );

    const matchedUsers = workingHours
      .filter((wh) => {
        const shiftOnDate = wh.days[dateLabel];
        if (!shiftOnDate) return false;

        return isTaskInShift(formData.startTime, formData.stopTime, String(shiftOnDate));
      })
      .map((wh) => {
        const msnvMatch = userByMsnv.get(normalizeIdentity(wh.msnv));
        if (msnvMatch) {
          return msnvMatch;
        }

        return userByDisplayName.get(normalizeIdentity(wh.fullName)) || null;
      })
      .filter((item): item is User => Boolean(item));

    return Array.from(new Map(matchedUsers.map((item) => [item.id, item])).values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
  }, [users, workingHours, assignmentDate, formData.startTime, formData.stopTime]);

  useEffect(() => {
    if (formData.assignees.length === 0) {
      return;
    }

    const validAssignees = formData.assignees.filter((name) =>
      filteredUsersByShift.some((u) => u.displayName === name)
    );

    if (validAssignees.length !== formData.assignees.length) {
      setFormData((current) => ({
        ...current,
        assignees: validAssignees,
      }));
    }
  }, [filteredUsersByShift, formData.assignees]);

  const handleSave = async () => {
    if (!formData.workContent) {
      toast.error("Please enter work content");
      return;
    }

    if (formData.assignees.length > 0) {
      const allAllowed = formData.assignees.every((name) =>
        filteredUsersByShift.some((u) => u.displayName === name)
      );

      if (!allAllowed) {
        toast.error("Some assignees are not scheduled or don't match the selected time range.");
        return;
      }
    }

    const task: DailyAssignment = {
      id: editingTask?.id || uuidv4(),
      date: formData.taskDate || selectedDateStr,
      assignees: formData.assignees,
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
            assignees: [],
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
      case 'Progress 25%': return <Clock className="h-4 w-4 text-blue-400 animate-pulse" />;
      case 'Progress 50%': return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'Progress 75%': return <Clock className="h-4 w-4 text-indigo-500 animate-pulse" />;
      case 'Planned': return <CalendarIcon className="h-4 w-4 text-amber-500" />;
      default: return <AlertCircle className="h-4 w-4 text-amber-500" />;
    }
  };

  const getStatusTone = (status: string) => {
    switch (status) {
      case 'Done':
        return 'from-emerald-50 to-green-50';
      case 'Progress 25%':
        return 'from-blue-50 to-cyan-50';
      case 'Progress 50%':
        return 'from-blue-50 to-indigo-50';
      case 'Progress 75%':
        return 'from-indigo-50 to-violet-50';
      default:
        return 'from-amber-50 to-yellow-50';
    }
  };

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 rounded-xl border-0 bg-linear-to-r from-slate-900 via-indigo-900 to-fuchsia-900 p-3 shadow-xl shadow-indigo-900/20 md:flex-row md:items-center md:justify-between sm:p-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Monthly Planner</h1>
            <p className="text-sm text-slate-200">Plan and track daily PM assignments for {mounted && date ? format(date, 'MMMM yyyy') : ''}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="mr-0 flex gap-1 rounded-lg border border-white/20 bg-white/10 p-1 sm:mr-2">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setViewMode('daily')}
                    className={`h-8 flex-1 text-xs ${viewMode === 'daily' ? 'bg-white text-indigo-900 shadow-sm' : 'text-white hover:bg-white/10'}`}
                >
                    Daily View
                </Button>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setViewMode('monthly')}
                    className={`h-8 flex-1 text-xs ${viewMode === 'monthly' ? 'bg-white text-indigo-900 shadow-sm' : 'text-white hover:bg-white/10'}`}
                >
                    Month Overview
                </Button>
            </div>
            {isAdmin && (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button variant="outline" onClick={() => setIsSyncDialogOpen(true)} className="w-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:w-auto">
                        <RefreshCw className="mr-2 h-4 w-4" /> Sync
                    </Button>
                    <Button onClick={handleOpenAdd} className="w-full bg-linear-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/30 hover:from-cyan-300 hover:to-blue-400 sm:w-auto">
                        <Plus className="mr-2 h-4 w-4" /> Add Task
                    </Button>
                </div>
            )}
          </div>
        </header>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 lg:grid-cols-7 sm:gap-2">
            {[
                { label: 'Total', value: monthStats.total, color: 'bg-slate-500', textColor: 'text-slate-600' },
                { label: 'P0 Urgent', value: monthStats.p0, color: 'bg-red-500', textColor: 'text-red-600' },
                { label: 'P1 High', value: monthStats.p1, color: 'bg-orange-500', textColor: 'text-orange-600' },
                { label: 'P2 Normal', value: monthStats.p2, color: 'bg-blue-500', textColor: 'text-blue-600' },
                { label: 'Planned', value: monthStats.planned, color: 'bg-amber-500', textColor: 'text-amber-600' },
                { label: 'Progress', value: monthStats.progress, color: 'bg-indigo-500', textColor: 'text-indigo-600' },
                { label: 'Completed', value: monthStats.done, color: 'bg-emerald-500', textColor: 'text-emerald-600' }
            ].map((stat, i) => (
                <Card key={i} className="border-0 bg-white shadow-xs overflow-hidden h-10 flex flex-col justify-center">
                    <div className={`${stat.color} h-[3px] w-full absolute top-0`} />
                    <CardContent className="p-0 px-2.5 pt-1 flex items-center justify-between gap-1">
                        <span className={`text-[8px] font-black uppercase tracking-tighter ${stat.textColor} truncate mr-1`}>{stat.label}</span>
                        <span className="text-sm font-black text-slate-900">{stat.value}</span>
                    </CardContent>
                </Card>
            ))}
        </div>

        {viewMode === 'daily' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Calendar Section */}
             <Card className="h-fit overflow-hidden border-0 bg-white shadow-md shadow-slate-200/70 lg:col-span-4">
              <CardHeader className="border-b border-cyan-100 bg-linear-to-r from-cyan-50 via-sky-50 to-blue-50 py-4">
                 <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-indigo-600" /> Select Date
                  </CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center bg-linear-to-b from-white to-cyan-50/50 p-4">
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
             <Card className="flex min-h-[500px] flex-col overflow-hidden border-0 bg-white shadow-md shadow-slate-200/70 lg:col-span-8">
               <CardHeader className="flex flex-col gap-3 border-b border-fuchsia-100 bg-linear-to-r from-fuchsia-50 via-violet-50 to-indigo-50 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                     <CardTitle className="text-lg font-bold">Tasks for {selectedDateStr}</CardTitle>
                      <CardDescription>
                        {dailyTasks.length} task(s) scheduled
                     </CardDescription>
                  </div>
                   <Badge variant="outline" className="w-fit border-fuchsia-200 bg-white/90 text-fuchsia-700">
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
                          <>
                          <div className="space-y-3 p-4 md:hidden">
                            {dailyTasks.map((task) => (
                              <div key={task.id} className={`rounded-2xl border border-transparent bg-linear-to-r p-4 ${getStatusTone(task.status)} shadow-sm`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {task.idMachine && <Badge variant="secondary" className="bg-white/80 text-[10px] text-slate-700 shadow-sm">{task.idMachine}</Badge>}
                                      {getPriorityBadge(task.priority)}
                                    </div>
                                    <p className="mt-2 text-base font-bold text-slate-900">{task.workContent}</p>
                                    <p className="mt-1 text-xs text-slate-600 font-medium">Assignees: {task.assignees.length > 0 ? task.assignees.join(', ') : 'Unassigned'}</p>
                                  </div>
                                  <div className="shrink-0">{getStatusIcon(task.status)}</div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                  <span className="inline-flex items-center rounded-full bg-white/80 px-2.5 py-1 shadow-sm">
                                    <Clock className="mr-1.5 h-3.5 w-3.5 text-indigo-500" />
                                    {task.startTime || '08:00'}{task.stopTime ? ` - ${task.stopTime}` : ''}
                                  </span>
                                  <span className="font-medium">{task.status}</span>
                                </div>

                                {isAdmin && (
                                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/60 pt-4">
                                    <Button variant="outline" className="bg-white/80" onClick={() => handleOpenEdit(task)}>
                                      <Edit className="mr-2 h-4 w-4" />
                                      Edit
                                    </Button>
                                    <Button variant="outline" className="border-red-200 bg-white/80 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setTaskPendingDelete(task)}>
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="hidden md:block">
                          <Table>
                            <TableHeader className="bg-linear-to-r from-slate-50 via-cyan-50/50 to-fuchsia-50/50">
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
                                <TableRow key={task.id} className={`group bg-linear-to-r ${getStatusTone(task.status)} transition-colors hover:brightness-[0.98]`}>
                                  <TableCell className="font-medium align-top">
                                    <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-slate-700 shadow-sm">
                                      <Clock className="h-3.5 w-3.5 text-indigo-500" />
                                      {task.startTime || '08:00'}
                                      {task.stopTime ? ` - ${task.stopTime}` : ''}
                                    </div>
                                  </TableCell>
                                  <TableCell className="align-top">
                                    <div className="flex flex-wrap gap-2">
                                      {task.assignees.length > 0 ? (
                                        task.assignees.map((name, i) => (
                                          <div key={i} className="flex items-center gap-1.5 bg-white/60 px-2 py-1 rounded-md border border-slate-100">
                                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-fuchsia-500 font-bold text-[8px] text-white shadow-sm">
                                              {name.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-[11px] font-medium text-slate-700">{name}</span>
                                          </div>
                                        ))
                                      ) : (
                                        <span className="text-xs text-slate-400 italic">Unassigned</span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="align-top">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        {task.idMachine && <Badge variant="secondary" className="h-4 bg-white/80 px-1 text-[10px] text-slate-700 shadow-sm">{task.idMachine}</Badge>}
                                        {getPriorityBadge(task.priority)}
                                      </div>
                                      <p className="text-base font-bold text-slate-900 leading-snug">{task.workContent}</p>
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
                          </div>
                          </>
                        )}
                     </div>
                  </ScrollArea>
               </CardContent>
            </Card>
          </div>
        ) : (
          /* Month Overview Section */
          <Card className="overflow-hidden border-0 bg-white shadow-md shadow-slate-200/70">
               <CardHeader className="border-b border-indigo-100 bg-linear-to-r from-indigo-50 via-violet-50 to-fuchsia-50 py-2 px-4">
                   <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                     <div>
                         <CardTitle className="text-lg font-bold">Month Overview: {mounted && date ? format(date, 'MMMM yyyy') : ''}</CardTitle>
                         <CardDescription>All tasks scheduled for the current month</CardDescription>
                     </div>
                     <Badge variant="secondary" className="w-fit bg-indigo-600 text-white hover:bg-indigo-700">
                         {tasks.length} Total Tasks
                     </Badge>
                   </div>
              </CardHeader>
              <CardContent className="p-0">
                  <ScrollArea className="h-[600px]">
                      {tasks.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-[300px] text-slate-400 space-y-4">
                              <ClipboardList className="h-12 w-12 opacity-20" />
                              <p>No tasks found for this month.</p>
                          </div>
                      ) : (
                          <div className="space-y-6 p-4 sm:space-y-8 sm:p-6">
                              {Object.entries(tasksByDate).map(([dateKey, dayTasks]) => (
                                  <div key={dateKey} className="space-y-3">
                                      <div className="flex items-center gap-2 sm:gap-4">
                                          <div className="h-px flex-1 bg-slate-100" />
                                          <h3 
                                            className="text-sm font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-full cursor-pointer hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                                            onClick={() => {
                                                setDate(new Date(dateKey));
                                                setViewMode('daily');
                                            }}
                                          >
                                              {format(new Date(dateKey), 'EEEE, MMMM do')}
                                          </h3>
                                          <div className="h-px flex-1 bg-slate-100" />
                                      </div>
                                      <div className="grid gap-3">
                                          {dayTasks.map(task => (
                                              <div 
                                                key={task.id} 
                                                className={`flex items-start gap-3 rounded-xl border border-slate-100 bg-linear-to-r ${getStatusTone(task.status)} p-3 transition-all hover:scale-[1.005] hover:shadow-md group sm:gap-4`}
                                              >
                                                  <div className="shrink-0 pt-0.5">
                                                      {getStatusIcon(task.status)}
                                                  </div>
                                                  <div className="flex-1 min-w-0">
                                                      <div className="flex items-center gap-2 mb-1">
                                                          {getPriorityBadge(task.priority)}
                                                          {task.idMachine && <Badge variant="outline" className="text-[10px] h-4">{task.idMachine}</Badge>}
                                                          <span className="text-[10px] font-mono text-slate-500">{task.startTime} - {task.stopTime}</span>
                                                      </div>
                                                      <p className="text-base font-bold text-slate-900 leading-tight">{task.workContent}</p>
                                                      <div className="flex flex-wrap items-center gap-2 mt-2">
                                                          <p className="text-[11px] text-slate-500 font-medium">Assignees:</p>
                                                          {task.assignees.length > 0 ? (
                                                              task.assignees.map((name, i) => (
                                                                  <Badge key={i} variant="secondary" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-100 text-[10px] px-1.5 py-0">
                                                                      {name}
                                                                  </Badge>
                                                              ))
                                                          ) : (
                                                              <span className="text-[10px] text-slate-400 italic">Unassigned</span>
                                                          )}
                                                      </div>
                                                  </div>
                                                   {isAdmin && (
                                                       <Button 
                                                         variant="ghost" 
                                                         size="icon" 
                                                         className="h-8 w-8 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                                                         onClick={() => handleOpenEdit(task)}
                                                       >
                                                           <Edit className="h-3.5 w-3.5" />
                                                      </Button>
                                                  )}
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              ))}
                              
                              {totalPages > 1 && (
                                 <div className="flex flex-col items-center justify-center gap-3 border-t py-4 sm:flex-row sm:gap-4">
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                      disabled={currentPage === 1}
                                    >
                                        Previous
                                    </Button>
                                    <span className="text-sm font-medium text-slate-600">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                      disabled={currentPage === totalPages}
                                    >
                                        Next
                                    </Button>
                                </div>
                              )}
                          </div>
                      )}
                  </ScrollArea>
              </CardContent>
          </Card>
        )}
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
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
               <Label className="sm:text-right">Date</Label>
               <Input
                 value={formData.taskDate}
                 readOnly
                 className="bg-slate-50 sm:col-span-3"
               />
             </div>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
               <Label htmlFor="startTime" className="sm:text-right">Start Time</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="sm:col-span-3"
                />
             </div>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
               <Label htmlFor="stopTime" className="sm:text-right">Stop Time</Label>
                <Input
                  id="stopTime"
                  type="time"
                  value={formData.stopTime}
                  onChange={(e) => setFormData({ ...formData, stopTime: e.target.value })}
                  className="sm:col-span-3"
                />
             </div>

            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label className="sm:text-right">Assignee</Label>
              <Popover open={openAssignee} onOpenChange={setOpenAssignee}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openAssignee}
                    className="justify-between font-normal sm:col-span-3 min-h-[40px] h-auto flex-wrap gap-1"
                  >
                    {formData.assignees.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {formData.assignees.map((name) => (
                          <Badge key={name} variant="secondary" className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      "Select Assignees..."
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                  <Command>
                    <CommandInput placeholder="Search assignee..." />
                    <CommandList>
                      <CommandEmpty>No staff scheduled for this time range.</CommandEmpty>
                      <CommandGroup heading="Available Staff">
                        {filteredUsersByShift.map((u) => (
                          <CommandItem
                            key={u.id}
                            value={u.displayName}
                            onSelect={(currentValue) => {
                              const alreadySelected = formData.assignees.includes(u.displayName);
                              if (alreadySelected) {
                                setFormData({
                                  ...formData,
                                  assignees: formData.assignees.filter((name) => name !== u.displayName)
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  assignees: [...formData.assignees, u.displayName]
                                });
                              }
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.assignees.includes(u.displayName) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {u.displayName}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-[10px] font-medium italic text-indigo-600 sm:col-start-2 sm:col-span-3">
                {filteredUsersByShift.length} staff members in working-hours match the selected date and time range.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-start sm:gap-4">
              <Label htmlFor="work" className="pt-2 sm:text-right">Task Info</Label>
              <textarea
                id="work"
                value={formData.workContent}
                onChange={(e) => setFormData({ ...formData, workContent: e.target.value })}
                className="min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:col-span-3"
                placeholder="What needs to be done?"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label className="sm:text-right">Priority</Label>
              <Select value={formData.priority} onValueChange={(v: Priority) => setFormData({...formData, priority: v})}>
                <SelectTrigger className="sm:col-span-3">
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
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label className="sm:text-right">Status</Label>
              <Select value={formData.status} onValueChange={(v: Status) => setFormData({...formData, status: v})}>
                <SelectTrigger className="sm:col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Planned">Planned</SelectItem>
                  <SelectItem value="Progress 25%">Progress 25%</SelectItem>
                  <SelectItem value="Progress 50%">Progress 50%</SelectItem>
                  <SelectItem value="Progress 75%">Progress 75%</SelectItem>
                  <SelectItem value="Done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pb-safe">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleSave} className="w-full bg-linear-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-700 hover:to-fuchsia-700 sm:w-auto">Save Task</Button>
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
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label className="sm:text-right">Workshop</Label>
              <Select value={syncWorkshop} onValueChange={(value: 'all' | PMWorkshopType) => setSyncWorkshop(value)}>
                <SelectTrigger className="sm:col-span-3">
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

            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label className="sm:text-right">Mode</Label>
              <Select value={syncMode} onValueChange={(value: SyncMode) => setSyncMode(value)}>
                <SelectTrigger className="sm:col-span-3">
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

            <div className="rounded-xl border border-cyan-100 bg-linear-to-r from-cyan-50 via-sky-50 to-indigo-50 p-4 text-sm text-slate-600">
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

          <DialogFooter className="pb-safe">
            <Button variant="outline" onClick={() => setIsSyncDialogOpen(false)} disabled={syncing} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleSyncPmSchedule} className="w-full bg-linear-to-r from-cyan-500 to-indigo-600 hover:from-cyan-600 hover:to-indigo-700 sm:w-auto" disabled={syncing || !date}>
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
          <DialogFooter className="pb-safe">
            <Button variant="outline" onClick={() => setTaskPendingDelete(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={() => taskPendingDelete && handleDelete(taskPendingDelete)}
              className="w-full bg-linear-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 sm:w-auto"
            >
              Delete Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedLayout>
  );
}
