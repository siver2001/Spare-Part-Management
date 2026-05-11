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
  ClipboardList,
  Search,
  History
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
import { DailyAssignment, Priority, Status, HandoverLog, TaskConfirmation } from '@/types/pmDaily';
import { pmDailyDb } from '@/lib/pmDailyDb';
import { supabase } from '@/lib/supabase';
import { getCurrentIsoWeek, getIsoWeekYear, getMonthFromIsoWeek, normalizePmChecklistTemplate } from '@/lib/pmSchedule';
import { PMWorkshopType } from '@/types/pm';
import { User } from '@/types';
import { SupabaseService } from '@/services/supabaseService';
import { getWorkingHoursDateKey } from '@/lib/workingHours';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const SYNC_NAMESPACE = '5d4a1b67-52b4-4e1b-b8d5-9c6684d5f90d';
const WORKSHOP_LABELS: Record<PMWorkshopType, string> = {
  foaming: 'Xuong Foaming',
  insole: 'Xuong Insole'
};

const WORKSHOP_OPTIONS: Array<{ value: 'all' | PMWorkshopType; label: string }> = [
  { value: 'all', label: 'All Workshops' },
  { value: 'foaming', label: 'Xuong Foaming' },
  { value: 'insole', label: 'Xuong Insole' }
];

const SYNC_MODE_OPTIONS = [
  { value: 'week', label: 'Theo Tuan' },
  { value: 'month', label: 'Theo Thang' }
] as const;


const PRIORITY_ORDER_LIST: Priority[] = ['P3 (Low)', 'P2 (Normal)', 'P1 (High)', 'P0 (Urgent)'];

const getEffectivePriority = (task: DailyAssignment): Priority => {
    if (task.status === 'Done') return task.priority;
    const deadlineStr = `${task.endDate || task.date}T${task.stopTime || '23:59'}:00`;
    const deadline = new Date(deadlineStr);
    const now = new Date();
    if (now <= deadline) return task.priority;
    const currentIndex = PRIORITY_ORDER_LIST.indexOf(task.priority);
    if (currentIndex === -1) return task.priority;
    return PRIORITY_ORDER_LIST[Math.min(currentIndex + 1, PRIORITY_ORDER_LIST.length - 1)];
};

const PRIORITY_ORDER: Record<string, number> = {
  'P0 (Urgent)': 0,
  'P1 (High)': 1,
  'P2 (Normal)': 2,
  'P3 (Low)': 3,
};

const sortTasksLogic = (a: DailyAssignment, b: DailyAssignment) => {
  // 1. Priority sort
  const pA = PRIORITY_ORDER[getEffectivePriority(a)] ?? 99;
  const pB = PRIORITY_ORDER[getEffectivePriority(b)] ?? 99;
  if (pA !== pB) return pA - pB;

  // 2. Start time sort
  const tA = a.startTime || '00:00';
  const tB = b.startTime || '00:00';
  return tA.localeCompare(tB);
};

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

const MACHINE_LIST_DATA = {
  'Insole': ['Máy Dán', 'Máy Cắt Đứng', 'Máy Tách', 'Máy Chặt Tự Động Luxin', 'Máy Chặt Manual', 'Máy In Logo', 'Logo In-House', 'Máy Thành Hình'],
  'Foaming': ['Máy Đổ', 'Khuôn Đổ', 'Máy Tách', 'Chiller', 'Bồn Liệu']
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
    let te = timeToMinutes(taskStop);
    if (te <= ts) te += 1440; // Overnight task
    
    const ss = timeToMinutes(shift.start);
    let se = timeToMinutes(shift.stop);
    if (se <= ss) se += 1440; // Overnight shift
    
    const checkOverlap = (s1: number, e1: number, s2: number, e2: number) => {
        return Math.max(s1, s2) < Math.min(e1, e2);
    };

    // Check overlap across possible day boundaries to handle overnight shifts/tasks correctly
    return (
        checkOverlap(ts, te, ss, se) ||
        checkOverlap(ts, te, ss - 1440, se - 1440) ||
        checkOverlap(ts, te, ss + 1440, se + 1440)
    );
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
  const isPowerUser = user && (user.role === 'ADMIN' || user.role === 'POWER_USER');
  const isSuperAdmin = user?.role === 'ADMIN';
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
  const [openDatePicker, setOpenDatePicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [workingHours, setWorkingHours] = useState<Awaited<ReturnType<typeof SupabaseService.getWorkingHours>>>(initialWorkingHoursRef.current);
  const [plannerMode, setPlannerMode] = useState<'active' | 'history'>('active');
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

    // New Handover State
  const [isHandoverMode, setIsHandoverMode] = useState(false);
  const [tempHandoverNote, setTempHandoverNote] = useState('');
  const [tempHandoverStaff, setTempHandoverStaff] = useState<string[]>([]);
  const [tempHandoverShifts, setTempHandoverShifts] = useState<string[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    taskDate: '',
    taskEndDate: '',
    assignees: [] as string[],
    workContent: '',
    priority: 'P2 (Normal)' as Priority,
    status: 'Planned' as Status,
    startTime: '08:00',
    stopTime: '16:00',
    idMachine: '',
    workshop: '',
    shift: '',
    handoverShifts: [] as string[],
    handoverStaff: [] as string[],
    handoverLogs: [] as HandoverLog[],
    confirmations: [] as TaskConfirmation[]
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
  const canEditTask = useCallback((task: DailyAssignment) => {
    if (!user) return false;
    // Chỉ ADMIN thực thụ mới có quyền sửa MỌI task. 
    // POWER_USER và USER chỉ được sửa task mình tạo hoặc được phân công.
    if (isSuperAdmin) return true;
    
    const normalize = (n: string | null | undefined) => String(n || '').trim().toLowerCase();
    const currentName = normalize(user.displayName);
    const currentUsername = normalize(user.username);
    const currentUserId = user.id;
    
    if (!currentName && !currentUsername) return false;

    // Kiểm tra nếu là người tạo task
    const isCreator = task.createdById === currentUserId || (task.createdBy && normalize(task.createdBy) === currentName);
    if (isCreator) return true;

    const isAssignee = task.assignees?.some(name => {
      const n = normalize(name);
      return n !== '' && (n === currentName || n === currentUsername);
    });
    
    const isHandover = task.handoverStaff?.some(name => {
      const n = normalize(name);
      return n !== '' && (n === currentName || n === currentUsername);
    });
    
    return !!(isAssignee || isHandover);
  }, [user]);



  const isReadOnly = useMemo(() => {
    if (!editingTask) return false;
    if (isSuperAdmin) return false;
    if (editingTask.status === 'Done') return true;
    return !canEditTask(editingTask);
  }, [editingTask, user, canEditTask]);

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
    let filtered = tasks.filter(t => {
      const compareDate = (plannerMode === 'history' && t.status === 'Done') ? (t.endDate || t.date) : t.date;
      return compareDate === selectedDateStr;
    });
    
    if (plannerMode === 'active') {
        filtered = filtered.filter(t => t.status !== 'Done');
    } else {
        filtered = filtered.filter(t => t.status === 'Done');
    }
    
    return [...filtered].sort(sortTasksLogic);
  }, [tasks, selectedDateStr, mounted, plannerMode]);

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
        p3: tasks.filter(t => t.priority.startsWith('P3')).length,
        done: tasks.filter(t => t.status === 'Done').length,
        planned: tasks.filter(t => t.status === 'Planned').length,
        progress: tasks.filter(t => t.status.startsWith('Progress')).length
    };
    return stats;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let baseTasks = tasks;
    if (plannerMode === 'active') {
        baseTasks = baseTasks.filter(t => t.status !== 'Done');
    } else {
        baseTasks = baseTasks.filter(t => t.status === 'Done');
    }

    if (!searchTerm) return baseTasks;
    const low = searchTerm.toLowerCase();
    return baseTasks.filter(t => 
      t.workContent.toLowerCase().includes(low) || 
      (t.idMachine && t.idMachine.toLowerCase().includes(low)) ||
      t.assignees.some(a => a.toLowerCase().includes(low))
    );
  }, [tasks, searchTerm, plannerMode]);

  const paginatedTasks = useMemo(() => {
    const sorted = [...filteredTasks].sort((a, b) => {
        // Primary: Date
        const dateDiff = a.date.localeCompare(b.date);
        if (dateDiff !== 0) return dateDiff;
        
        // Secondary: Priority & Time
        return sortTasksLogic(a, b);
    });
    const start = (currentPage - 1) * itemsPerPage;
    return sorted.slice(start, start + itemsPerPage);
  }, [filteredTasks, currentPage]);

  const tasksByDate = useMemo(() => {
    const grouped: Record<string, DailyAssignment[]> = {};
    paginatedTasks.forEach(t => {
      const displayDate = (plannerMode === 'history' && t.status === 'Done') ? (t.endDate || t.date) : t.date;
      if (!grouped[displayDate]) grouped[displayDate] = [];
      grouped[displayDate].push(t);
    });
    return grouped;
  }, [paginatedTasks, plannerMode]);

  const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [date, tasks.length, plannerMode, searchTerm]);

  const handleOpenAdd = () => {
    setEditingTask(null);
    setFormData({
      taskDate: selectedDateStr,
      taskEndDate: selectedDateStr,
      assignees: [],
      workContent: '',
      priority: 'P2 (Normal)',
      status: 'Planned',
      startTime: '08:00',
      stopTime: '16:00',
      idMachine: '',
      workshop: '',
      shift: '',
      handoverShifts: [],
      handoverStaff: [],
      handoverLogs: [],
      confirmations: []
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (task: DailyAssignment) => {
    setEditingTask(task);
    setFormData({
      taskDate: task.date,
      taskEndDate: task.endDate || task.date,
      assignees: task.assignees || [],
      workContent: task.workContent,
      priority: task.priority,
      status: task.status,
      startTime: task.startTime || '08:00',
      stopTime: task.stopTime || '09:00',
      idMachine: task.idMachine || '',
      workshop: task.workshop || '',
      shift: '',
      handoverShifts: task.handoverShifts || [],
      handoverStaff: task.handoverStaff || [],
      handoverLogs: task.handoverLogs || [],
      confirmations: task.confirmations || []
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
    if (!formData.taskDate) return [];

    const startDate = new Date(`${formData.taskDate}T00:00:00`);
    const endDate = new Date(`${formData.taskEndDate || formData.taskDate}T00:00:00`);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return [];

    // Get all date keys in range (limit to 7 days for safety)
    const dateKeys: string[] = [];
    const curr = new Date(startDate);
    let limit = 0;
    while (curr <= endDate && limit < 7) {
      dateKeys.push(getWorkingHoursDateKey(curr));
      curr.setDate(curr.getDate() + 1);
      limit++;
    }

    const userByMsnv = new Map(
      users.map((item) => [normalizeIdentity(item.username), item] as const)
    );
    const userByDisplayName = new Map(
      users.map((item) => [normalizeIdentity(item.displayName), item] as const)
    );

    const matchedUsers = workingHours
      .filter((wh) => {
        return dateKeys.some(dateLabel => {
          const shiftOnDate = wh.days[dateLabel];
          if (!shiftOnDate) return false;
          return isTaskInShift(formData.startTime, formData.stopTime, String(shiftOnDate));
        });
      })
      .map((wh) => {
        const msnvMatch = userByMsnv.get(normalizeIdentity(wh.msnv));
        if (msnvMatch) return msnvMatch;
        return userByDisplayName.get(normalizeIdentity(wh.fullName)) || null;
      })
      .filter((item): item is User => Boolean(item));

    return Array.from(new Map(matchedUsers.map((item) => [item.id, item])).values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
  }, [users, workingHours, formData.taskDate, formData.taskEndDate, formData.startTime, formData.stopTime]);

  const filteredHandoverUsers = useMemo(() => {
    if (tempHandoverShifts.length === 0) return users;
    if (!assignmentDate) return [];

    const dateLabel = getWorkingHoursDateKey(assignmentDate);
    const userByMsnv = new Map(users.map(u => [normalizeIdentity(u.username), u] as const));
    const userByDisplayName = new Map(users.map(u => [normalizeIdentity(u.displayName), u] as const));

    const matchedUsers = workingHours
      .filter((wh) => {
        const shiftOnDate = String(wh.days[dateLabel] || '').toUpperCase().trim();
        if (!shiftOnDate) return false;
        return tempHandoverShifts.some(s => shiftOnDate.includes(s));
      })
      .map((wh) => {
        const msnvMatch = userByMsnv.get(normalizeIdentity(wh.msnv));
        if (msnvMatch) return msnvMatch;
        return userByDisplayName.get(normalizeIdentity(wh.fullName)) || null;
      })
      .filter((item): item is User => Boolean(item));

    return Array.from(new Map(matchedUsers.map((item) => [item.id, item])).values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
  }, [users, workingHours, assignmentDate, tempHandoverShifts]);


  
  const handleAddHandoverLog = () => {
    if (!tempHandoverNote || tempHandoverStaff.length === 0) {
      toast.error("Please provide a note and select staff for handover.");
      return;
    }

    const newLog: HandoverLog = {
      fromStaff: user?.displayName || 'Unknown',
      toStaff: tempHandoverStaff,
      shifts: tempHandoverShifts,
      note: tempHandoverNote,
      timestamp: new Date().toISOString()
    };

    setFormData(prev => ({
      ...prev,
      handoverLogs: [...prev.handoverLogs, newLog],
      // Also update the legacy handoverStaff for backward compatibility if needed
      handoverStaff: Array.from(new Set([...prev.handoverStaff, ...tempHandoverStaff]))
    }));

    setIsHandoverMode(false);
    setTempHandoverNote('');
    setTempHandoverStaff([]);
    setTempHandoverShifts([]);
    toast.success("Handover log added locally. Save task to persist.");
  };

  const handleConfirmTask = async (task: DailyAssignment) => {
    if (!user) return;
    const staffName = user.displayName;
    if (task.confirmations?.some(c => c.staffName === staffName)) {
        toast.info("You have already confirmed this task.");
        return;
    }

    const newConfirmation: TaskConfirmation = {
        staffName: staffName,
        timestamp: new Date().toISOString()
    };

    const updatedTask = {
        ...task,
        confirmations: [...(task.confirmations || []), newConfirmation]
    };

    try {
        await pmDailyDb.saveTask(updatedTask);
        setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
        toast.success("Task confirmed!");
    } catch (error) {
        toast.error("Failed to confirm task.");
    }
  };

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
        console.log("Some assignees are not scheduled for this shift."); // toast.error replaced

        // return;

      }
    }

    const task: DailyAssignment = {
      id: editingTask?.id || uuidv4(),
      date: formData.taskDate || selectedDateStr,
      endDate: formData.status === 'Done' 
        ? format(new Date(), 'yyyy-MM-dd') 
        : (formData.taskEndDate || formData.taskDate || selectedDateStr),
      assignees: formData.assignees,
      workContent: formData.workContent,
      priority: formData.priority,
      status: formData.status,
      startTime: formData.startTime,
      stopTime: formData.stopTime,
      idMachine: formData.idMachine,
      createdBy: editingTask ? editingTask.createdBy : user?.displayName,
      createdById: editingTask ? editingTask.createdById : user?.id,
      workshop: formData.workshop,
      handoverShifts: formData.handoverShifts,
      handoverStaff: formData.handoverStaff,
      handoverLogs: formData.handoverLogs,
      confirmations: formData.confirmations,
      checklist: editingTask?.checklist || [],
      notes: editingTask?.notes || '',
      photos: editingTask?.photos || []
    };

    try {
      await pmDailyDb.saveTask(task);
    toast.success(editingTask ? "Task updated" : "Task added");
    setIsDialogOpen(false);
    // Update local state immediately for better UX and to avoid race conditions
    setTasks(prev => {
      const exists = prev.some(t => t.id === task.id);
      if (exists) {
        return prev.map(t => t.id === task.id ? task : t);
      }
      return [...prev, task];
    });
    loadMonthTasks();
    } catch (error) {
      console.error("Failed to save task:", error);
      toast.error("Failed to save task. Please check your connection or permissions.");
    }
  };

  const handleDelete = async (task: DailyAssignment) => {
    try {
      await pmDailyDb.deleteTask(task.id);
    setTasks(prev => prev.filter(t => t.id !== task.id));
    setTaskPendingDelete(null);
    loadMonthTasks();
      toast.success("Task deleted");
    } catch (error) {
      console.error("Failed to delete task:", error);
      toast.error("Failed to delete task. Please try again.");
    }
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

  const getPriorityBadge = (task: DailyAssignment) => {
    const p = getEffectivePriority(task);
    const isEscalated = p !== task.priority;
    
    let badge;
    switch (p) {
      case 'P0 (Urgent)': badge = <Badge variant="destructive" className="bg-red-500">{p}</Badge>; break;
      case 'P1 (High)': badge = <Badge className="bg-orange-500 text-white border-orange-600">{p}</Badge>; break;
      case 'P2 (Normal)': badge = <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">{p}</Badge>; break;
      default: badge = <Badge variant="outline">{p}</Badge>; break;
    }

    if (isEscalated) {
        return (
            <div className="flex items-center gap-1">
                {badge}
                <Badge className="bg-red-100 text-red-700 border-red-200 text-[9px] h-4 px-1 flex items-center gap-0.5 animate-pulse">
                    <AlertCircle className="h-2.5 w-2.5" /> Overdue
                </Badge>
            </div>
        );
    }
    return badge;
  };

  const getStatusIcon = (s: string) => {
    switch (s) {
      default: return <AlertCircle className="h-4 w-4 text-amber-500" />;
    }
  };
  
  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'Done': 
        return <Badge className="bg-emerald-500 text-white border-emerald-600 shadow-sm shadow-emerald-200 uppercase text-[9px] font-black h-4 px-1.5 flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5" /> {s}</Badge>;
      case 'Progress 25%': 
        return <Badge className="bg-sky-500 text-white border-sky-600 shadow-sm shadow-sky-200 animate-pulse uppercase text-[9px] font-black h-4 px-1.5 flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {s}</Badge>;
      case 'Progress 50%': 
        return <Badge className="bg-blue-600 text-white border-blue-700 shadow-sm shadow-blue-200 animate-pulse uppercase text-[9px] font-black h-4 px-1.5 flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {s}</Badge>;
      case 'Progress 75%': 
        return <Badge className="bg-indigo-600 text-white border-indigo-700 shadow-sm shadow-indigo-200 animate-pulse uppercase text-[9px] font-black h-4 px-1.5 flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {s}</Badge>;
      case 'Planned': 
        return <Badge className="bg-amber-400 text-amber-950 border-amber-500 shadow-sm shadow-amber-100 uppercase text-[9px] font-black h-4 px-1.5 flex items-center gap-1"><CalendarIcon className="h-2.5 w-2.5" /> {s}</Badge>;
      default: 
        return <Badge variant="outline" className="text-[9px] h-4 font-black uppercase">{s}</Badge>;
    }
  };

  const getTimeBadge = (start?: string, stop?: string) => {
    const s = start || '08:00';
    const e = stop || '16:00';
    const timeRange = `${s} - ${e}`;
    const h = parseInt(s.split(':')[0], 10);
    
    let colorClass = "bg-slate-100 text-slate-700 border-slate-200"; // Default
    let label = "";

    if (h >= 6 && h < 14) {
        colorClass = "bg-blue-50 text-blue-700 border-blue-200 shadow-sm shadow-blue-100";
        label = "C1";
    } else if (h >= 14 && h < 22) {
        colorClass = "bg-orange-50 text-orange-700 border-orange-200 shadow-sm shadow-orange-100";
        label = "C2";
    } else if (h >= 22 || h < 6) {
        colorClass = "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm shadow-indigo-100";
        label = "C3";
    } else if (h >= 8 && h < 17) {
        colorClass = "bg-sky-50 text-sky-700 border-sky-200 shadow-sm shadow-sky-100";
        label = "HC";
    }

    return (
        <Badge variant="outline" className={cn("text-[10px] font-mono h-4 px-1.5 flex items-center gap-1", colorClass)}>
            <Clock className="h-2.5 w-2.5" />
            {label && <span className="font-black border-r border-current pr-1 mr-1">{label}</span>}
            {timeRange}
        </Badge>
    );
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
            <div className="mr-0 flex gap-1 rounded-lg border border-white/20 bg-white/10 p-1 sm:mr-2">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setPlannerMode('active')}
                    className={`h-8 flex-1 text-xs gap-1.5 ${plannerMode === 'active' ? 'bg-emerald-500 text-white shadow-sm' : 'text-white hover:bg-white/10'}`}
                >
                    <Clock className="h-3 w-3" /> Active
                </Button>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setPlannerMode('history')}
                    className={`h-8 flex-1 text-xs gap-1.5 ${plannerMode === 'history' ? 'bg-indigo-500 text-white shadow-sm' : 'text-white hover:bg-white/10'}`}
                >
                    <History className="h-3 w-3" /> Done History
                </Button>
            </div>
            {isPowerUser && (
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
                             {isPowerUser && <Button variant="outline" size="sm" onClick={handleOpenAdd}>Create first task</Button>}
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
                                      {getPriorityBadge(task)}
                                    </div>
                                    <p className="mt-2 text-base font-bold text-slate-900">{task.workContent}</p>
                                     <div className="mt-1 text-xs text-slate-600 font-medium">Assignees: {task.assignees.length > 0 ? task.assignees.join(", ") : "Unassigned"}
                                      {task.createdBy && <p className="mt-0.5 text-[10px] text-slate-400">Created by: {task.createdBy}</p>}
                                      
                                      {/* Handover Waves Display (Mobile/Compact) */}
                                      {task.handoverLogs && task.handoverLogs.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          {task.handoverLogs.map((log, idx) => (
                                            <div key={idx} className="flex items-center gap-1.5 text-[10px]">
                                              <span className="text-emerald-600 font-bold">HO #{idx + 1}:</span>
                                              <span className="text-slate-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                                {log.toStaff.join(', ')}
                                              </span>
                                              {log.timestamp && <span className="text-slate-400 font-normal italic">({format(new Date(log.timestamp), 'HH:mm')})</span>}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                     </div>
                                  </div>
                                  <div className="shrink-0">{getStatusIcon(task.status)}</div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                  {getTimeBadge(task.startTime, task.stopTime)}
                                  {getStatusBadge(task.status)}
                                </div>

                                {(isPowerUser || canEditTask(task) || task.status === 'Done') && (
                                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/60 pt-4">
                                    <Button variant="outline" className="bg-white/80 h-9 text-xs font-bold" onClick={() => handleOpenEdit(task)}>
                                      <Edit className="mr-2 h-3.5 w-3.5" />
                                      Edit
                                    </Button>
                                    
                                         {user && (task.assignees.includes(user.displayName) || task.handoverStaff?.includes(user.displayName) || task.handoverLogs?.some(l => l.toStaff.includes(user.displayName))) && !task.confirmations?.some(c => c.staffName === user.displayName) && (
                                            <Button 
                                              variant="outline" 
                                              size="sm" 
                                              className="h-8 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                              onClick={() => handleConfirmTask(task)} disabled={isReadOnly}
                                            >
                                              <Check className="mr-1.5 h-3.5 w-3.5" /> Confirm
                                            </Button>
                                         )}
{user?.role === 'ADMIN' && (
                                      <Button variant="outline" className="border-red-200 bg-white/80 text-red-600 hover:bg-red-50 hover:text-red-700 h-9 text-xs font-bold" onClick={() => setTaskPendingDelete(task)}>
                                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                                        Delete
                                      </Button>
                                    )}
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
                                {(isPowerUser || dailyTasks.some(t => canEditTask(t))) && <TableHead className="text-right">Actions</TableHead>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {dailyTasks.map((task) => (
                                <TableRow key={task.id} className={`group bg-linear-to-r ${getStatusTone(task.status)} transition-colors hover:brightness-[0.98]`}>
                                  <TableCell className="font-medium align-top">
                                    <div className="py-1">
                                      {getTimeBadge(task.startTime, task.stopTime)}
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
                                      ) : task.handoverStaff && task.handoverStaff.length > 0 ? null : (
                                        <span className="text-xs text-slate-400 italic">Unassigned</span>
                                      )}
                                      {/* Table View Handover Waves */}
                                      {task.handoverLogs && task.handoverLogs.length > 0 ? (
                                        <div className="flex flex-col gap-1.5">
                                          {task.handoverLogs.map((log, idx) => (
                                            <div key={idx} className="flex flex-wrap items-center gap-1.5 p-1 rounded-md bg-emerald-50/50 border border-emerald-50">
                                              <span className="text-[9px] font-black text-emerald-600 uppercase">HO {idx+1}</span>
                                              {log.toStaff.map((name, i) => (
                                                <div key={i} className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-emerald-100 shadow-xs">
                                                  <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                                  <span className="text-[10px] font-bold text-emerald-800">{name}</span>
                                                </div>
                                              ))}
                                            </div>
                                          ))}
                                        </div>
                                      ) : task.handoverStaff?.map((name, i) => (
                                        <div key={`ho-${i}`} className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-500 font-bold text-[8px] text-white shadow-sm">
                                            {name.charAt(0).toUpperCase()}
                                          </div>
                                          <span className="text-[11px] font-bold text-emerald-700">{name}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="align-top">
                                     <div className="space-y-1">
                                       <div className="flex items-center gap-2">
                                        {task.idMachine && <Badge variant="secondary" className="h-4 bg-white/80 px-1 text-[10px] text-slate-700 shadow-sm">{task.idMachine}</Badge>}
                                        {getPriorityBadge(task)}
                                      </div>
                                       <p className="text-base font-bold text-slate-900 leading-snug">{task.workContent}</p>
                                       {task.createdBy && <p className="text-[10px] text-slate-400 mt-1 italic">Created by: {task.createdBy}</p>}
                                     </div>
                                   </TableCell>
                                   <TableCell className="align-top">
                                     <div className="flex items-center gap-2 py-1">
                                        {getStatusBadge(task.status)}
                                     </div>
                                  </TableCell>
                                    <TableCell className="text-right align-top">
                                      <div className="flex flex-col items-end gap-2">
                                         {/* Confirmation Row */}
                                         <div className="flex flex-wrap justify-end gap-1 mb-1 max-w-[200px]">
                                           {task.confirmations?.map((c, i) => (
                                              <Badge key={i} className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[9px] py-0">
                                                <Check className="mr-1 h-2.5 w-2.5" /> {c.staffName}
                                              </Badge>
                                           ))}
                                         </div>

                                         <div className="flex items-center justify-end gap-1">
                                            {/* CONFIRM BUTTON with robust name matching */}
                                            {user && (
                                              task.assignees.some(a => a.trim().toLowerCase() === user.displayName?.trim().toLowerCase()) || 
                                              task.handoverStaff?.some(s => s.trim().toLowerCase() === user.displayName?.trim().toLowerCase()) ||
                                              task.handoverLogs?.some(l => l.toStaff.some(ts => ts.trim().toLowerCase() === user.displayName?.trim().toLowerCase()))
                                            ) && !task.confirmations?.some(c => c.staffName.trim().toLowerCase() === user.displayName?.trim().toLowerCase()) && (
                                               <Button 
                                                 variant="default" 
                                                 size="sm" 
                                                 className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm px-3 font-bold"
                                                 onClick={() => handleConfirmTask(task)} disabled={isReadOnly}
                                               >
                                                 <Check className="mr-1 h-3 w-3" /> Confirm
                                               </Button>
                                            )}

                                            {(isPowerUser || canEditTask(task) || task.status === 'Done') && (
                                              <>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:bg-white/70 hover:text-indigo-600" onClick={() => handleOpenEdit(task)}>
                                                  <Edit className="h-4 w-4" />
                                                </Button>
                                                {user?.role === 'ADMIN' && (
                                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:bg-white/70 hover:text-red-500" onClick={() => setTaskPendingDelete(task)}>
                                                    <Trash2 className="h-4 w-4" />
                                                  </Button>
                                                )}
                                              </>
                                            )}
                                         </div>
                                      </div>
                                    </TableCell>
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
               <CardHeader className="border-b border-indigo-100 bg-linear-to-r from-indigo-50 via-violet-50 to-fuchsia-50 py-1.5 px-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-col md:flex-row md:items-center gap-4">
                          <CardTitle className="text-lg font-bold whitespace-nowrap">
                            {plannerMode === 'active' ? 'Active Tasks' : 'History: Done Tasks'} - {mounted && date ? format(date, 'MMMM yyyy') : ''}
                          </CardTitle>
                          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                              {[
                                  { label: 'Total', value: monthStats.total, color: 'bg-slate-500' },
                                  { label: 'P0 (Urgent)', value: monthStats.p0, color: 'bg-red-500' },
                                  { label: 'P1 (High)', value: monthStats.p1, color: 'bg-orange-500' },
                                  { label: 'P2 (Medium)', value: monthStats.p2, color: 'bg-blue-500' },
                                  { label: 'P3 (Low)', value: monthStats.p3, color: 'bg-cyan-500' },
                                  { label: 'Planned', value: monthStats.planned, color: 'bg-amber-500' },
                                  { label: 'Progress', value: monthStats.progress, color: 'bg-indigo-500' },
                                  { label: 'Done', value: monthStats.done, color: 'bg-emerald-500' }
                              ].map((stat, i) => (
                                  <div key={i} className="flex items-center gap-1.5 bg-white/60 px-1.5 py-0.5 rounded-md border border-slate-100 h-7 min-w-[45px]">
                                      <div className={`w-1.5 h-1.5 rounded-full ${stat.color} shrink-0`} />
                                      <span className="text-[10px] font-bold text-slate-500 uppercase">{stat.label}</span>
                                      <span className="text-xs font-black text-slate-900 ml-auto">{stat.value}</span>
                                  </div>
                              ))}
                          </div>
                      </div>
                       <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                           <div className="relative w-full sm:w-64">
                               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                               <Input placeholder="Search tasks, machines, staff..."
                                   className="h-9 pl-9 bg-white/50 border-slate-200 text-xs"
                                   value={searchTerm}
                                   onChange={(e) => setSearchTerm(e.target.value)}
                               />
                           </div>
                           <Badge variant="secondary" className="w-fit shrink-0 bg-indigo-600 text-white hover:bg-indigo-700 h-9 px-3">
                               {filteredTasks.length} {searchTerm ? 'Matches' : 'Total Tasks'}
                           </Badge>
                       </div>
                    </div>
              </CardHeader>
              <CardContent className="p-0">
                  <ScrollArea className="h-[750px]">
                      {tasks.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-[300px] text-slate-400 space-y-4">
                              <ClipboardList className="h-12 w-12 opacity-20" />
                              <p>No tasks found for this month.</p>
                          </div>
                      ) : (
                          <div className="space-y-3 p-2 sm:space-y-4 sm:p-3">
                              {Object.entries(tasksByDate).map(([dateKey, dayTasks]) => (
                                  <div key={dateKey} className="space-y-2">
                                      <div className="flex items-center gap-2 sm:gap-4">
                                          <div className="h-px flex-1 bg-slate-100" />
                                          <h3 
                                            className="text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-full cursor-pointer hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                                            onClick={() => {
                                                setDate(new Date(dateKey));
                                                setViewMode('daily');
                                            }}
                                          >
                                              {format(new Date(dateKey), 'EEEE, MMMM do')}
                                          </h3>
                                          <div className="h-px flex-1 bg-slate-100" />
                                      </div>
                                      <div className="grid gap-2">
                                          {dayTasks.map(task => (
                                              <div 
                                                key={task.id} 
                                                className={`flex items-start gap-2.5 rounded-xl border border-slate-100 bg-linear-to-r ${getStatusTone(task.status)} p-2 transition-all hover:scale-[1.005] hover:shadow-md group sm:gap-3`}
                                              >
                                                  <div className="shrink-0 pt-0.5">
                                                      {getStatusIcon(task.status)}
                                                  </div>
                                                  <div className="flex-1 min-w-0">
                                                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                                          {getPriorityBadge(task)}
                                                          {getStatusBadge(task.status)}
                                                          {getTimeBadge(task.startTime, task.stopTime)}
                                                          {task.idMachine && <Badge variant="outline" className="text-[10px] h-4">{task.idMachine}</Badge>}
                                                      </div>
                                                      <p className="text-sm font-bold text-slate-900 leading-tight">{task.workContent}</p>
                                                       {task.createdBy && <p className="text-[9px] text-slate-400 italic">Created by: {task.createdBy}</p>}
                                                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                          <p className="text-[10px] text-slate-500 font-medium">Staff:</p>
                                                          {task.assignees.map((name, i) => (
                                                              <Badge key={`as-${i}`} variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-100 text-[10px] px-1.5 py-0">
                                                                  {name}
                                                              </Badge>
                                                          ))}
                                                          {task.handoverStaff?.map((name, i) => (
                                                              <Badge key={`ho-${i}`} variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] px-1.5 py-0 font-bold">
                                                                  {name}
                                                              </Badge>
                                                          ))}
                                                          {task.assignees.length === 0 && (!task.handoverStaff || task.handoverStaff.length === 0) && (
                                                              <span className="text-[10px] text-slate-400 italic">Unassigned</span>
                                                          )}
                                                      </div>
                                                  </div>
                                                  
                                                  <div className="flex items-center gap-1 shrink-0 ml-2">
                                                        {user && (
                                                          task.assignees.some(a => a.trim().toLowerCase() === user.displayName?.trim().toLowerCase()) || 
                                                          task.handoverStaff?.some(s => s.trim().toLowerCase() === user.displayName?.trim().toLowerCase()) ||
                                                          task.handoverLogs?.some(l => l.toStaff.some(ts => ts.trim().toLowerCase() === user.displayName?.trim().toLowerCase()))
                                                        ) && !task.confirmations?.some(c => c.staffName.trim().toLowerCase() === user.displayName?.trim().toLowerCase()) && (
                                                           <Button 
                                                             variant="default" 
                                                             size="sm" 
                                                             className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-bold px-2.5"
                                                             onClick={() => handleConfirmTask(task)}
                                                           >
                                                               <Check className="h-3.5 w-3.5 mr-1" /> Confirm
                                                           </Button>
                                                        )}

                                                        {(isPowerUser || canEditTask(task) || task.status === 'Done') && (
                                                           <Button 
                                                             variant="ghost" 
                                                             size="icon" 
                                                             className="h-9 w-9 shrink-0 bg-white/50 text-indigo-600 border border-white/20 shadow-sm opacity-100 transition-all sm:h-8 sm:w-8 sm:bg-transparent sm:border-0 sm:shadow-none sm:opacity-0 sm:group-hover:opacity-100"
                                                             onClick={() => handleOpenEdit(task)}
                                                           >
                                                               <Edit className="h-4 w-4" />
                                                          </Button>
                                                        )}
                                                    </div>
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
        <DialogContent className="max-w-xl p-0 flex flex-col overflow-hidden border-0 bg-white shadow-2xl shadow-indigo-200/50 max-h-[95vh]">
          <div className="shrink-0 bg-linear-to-r from-indigo-600 via-purple-600 to-fuchsia-600 px-6 py-5 text-white">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm">
                <ClipboardList className="h-5 w-5" />
              </div>
              {editingTask ? 'Edit Task Details' : 'Create New Task'}
            </DialogTitle>
            <DialogDescription className="text-indigo-100/90 mt-1.5 flex items-center gap-2">
              <CalendarIcon className="h-3.5 w-3.5" />
              Scheduling for {selectedDateStr}
            </DialogDescription>
          </div>
          
          <ScrollArea className="flex-1 overflow-y-auto max-h-[calc(95vh-160px)]">
            <div className="px-6 py-6 pb-12 space-y-8">
                            {/* SECTION: Scheduling */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-indigo-600">
                  <Clock className="h-4 w-4" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Scheduling & Time</h4>
                  <div className="h-px flex-1 bg-indigo-50" />
                </div>
                
                <div className="grid gap-4">
                  {/* Row 1: Start Date & Start Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-500">Start Date</Label>
                      <Popover open={openDatePicker} onOpenChange={setOpenDatePicker}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            disabled={isReadOnly}
                            className={cn(
                              "w-full justify-start text-left font-normal border-slate-200 h-10",
                              !formData.taskDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 text-indigo-500" />
                            {formData.taskDate ? format(new Date(`${formData.taskDate}T00:00:00`), "PPP") : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={formData.taskDate ? new Date(`${formData.taskDate}T00:00:00`) : undefined}
                            onSelect={(d) => {
                              if (d) {
                                setFormData({ ...formData, taskDate: format(d, 'yyyy-MM-dd') });
                                setOpenDatePicker(false);
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="startTime" className="text-xs font-semibold text-slate-500">Start Time</Label>
                      <Input
                        id="startTime"
                        type="time"
                        value={formData.startTime}
                        onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                        className="h-10 border-slate-200" 
                        disabled={isReadOnly} 
                      />
                    </div>
                  </div>

                  {/* Row 2: End Date & End Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-500">Target End Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            disabled={isReadOnly}
                            className={cn(
                              "w-full justify-start text-left font-normal border-slate-200 h-10",
                              !formData.taskEndDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4 text-fuchsia-500" />
                            {formData.taskEndDate ? format(new Date(`${formData.taskEndDate}T00:00:00`), "PPP") : <span>Pick end date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={formData.taskEndDate ? new Date(`${formData.taskEndDate}T00:00:00`) : undefined}
                            onSelect={(d) => {
                              if (d) {
                                setFormData({ ...formData, taskEndDate: format(d, 'yyyy-MM-dd') });
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="stopTime" className="text-xs font-semibold text-slate-500">Target End Time</Label>
                      <Input
                        id="stopTime"
                        type="time"
                        value={formData.stopTime}
                        onChange={(e) => setFormData({ ...formData, stopTime: e.target.value })}
                        className="h-10 border-slate-200" 
                        disabled={isReadOnly} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: Equipment & Location */}
              <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <div className="flex items-center gap-2 text-emerald-600">
                  <RefreshCw className="h-4 w-4" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Equipment & Workshop</h4>
                  <div className="h-px flex-1 bg-emerald-50" />
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-500">Workshop</Label>
                    <Select 
                      value={formData.workshop || 'none'} 
                      onValueChange={(v) => setFormData({ ...formData, workshop: v === 'none' ? '' : v, idMachine: '' })}
                    >
                      <SelectTrigger className="h-10 border-slate-200 bg-white">
                        <SelectValue placeholder="Workshop (Optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None / Khác</SelectItem>
                        {Object.keys(MACHINE_LIST_DATA).map(ws => (
                          <SelectItem key={ws} value={ws}>{ws}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-500">Machine / Asset</Label>
                    {formData.workshop ? (
                      <Select disabled={isReadOnly}
                      value={formData.idMachine} 
                        onValueChange={(v) => setFormData({ ...formData, idMachine: v })}
                      >
                        <SelectTrigger className="h-10 border-slate-200 bg-white">
                          <SelectValue placeholder="Select Machine" />
                        </SelectTrigger>
                        <SelectContent>
                          {MACHINE_LIST_DATA[formData.workshop as keyof typeof MACHINE_LIST_DATA]?.map(m => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        placeholder="Manual entry..."
                        className="h-10 border-slate-200 bg-white"
                        value={formData.idMachine}
                        onChange={(e) => setFormData({ ...formData, idMachine: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION: Task Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-amber-600">
                  <ClipboardList className="h-4 w-4" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Task Specification</h4>
                  <div className="h-px flex-1 bg-amber-50" />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-500">Main Assignee(s)</Label>
                    <Popover open={openAssignee} onOpenChange={setOpenAssignee}>
                      <PopoverTrigger asChild>
                          <Button variant="outline" disabled={isReadOnly}
                          role="combobox"
                          aria-expanded={openAssignee}
                          className="w-full justify-between font-normal border-slate-200 min-h-[44px] h-auto p-2 flex-wrap gap-1 bg-white"
                        >
                          {formData.assignees.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {formData.assignees.map((name) => (
                                <Badge key={name} variant="secondary" className="bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100 px-1.5 py-0.5">
                                  {name}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">Select staff members...</span>
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search staff..." />
                          <CommandList>
                            <CommandEmpty>No staff available.</CommandEmpty>
                            {filteredUsersByShift.length > 0 && (
                              <CommandGroup heading="Recommended (On Shift)">
                                {filteredUsersByShift.map((u) => (
                                  <CommandItem
                                    key={u.id}
                                    value={u.displayName}
                                    onSelect={() => {
                                      const alreadySelected = formData.assignees.includes(u.displayName);
                                      setFormData({
                                        ...formData,
                                       assignees: alreadySelected
                                          ? formData.assignees.filter((name) => name !== u.displayName)
                                          : [...formData.assignees, u.displayName]
                                      });
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4 text-indigo-600", formData.assignees.includes(u.displayName) ? "opacity-100" : "opacity-0")} />
                                    {u.displayName}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                            
                            <CommandGroup heading="All Staff">
                              {users
                                .filter(u => !filteredUsersByShift.some(fu => fu.id === u.id))
                                .map((u) => (
                                  <CommandItem
                                    key={u.id}
                                    value={u.displayName}
                                    onSelect={() => {
                                      const alreadySelected = formData.assignees.includes(u.displayName);
                                      setFormData({
                                        ...formData,
                                       assignees: alreadySelected
                                          ? formData.assignees.filter((name) => name !== u.displayName)
                                          : [...formData.assignees, u.displayName]
                                      });
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4 text-indigo-600", formData.assignees.includes(u.displayName) ? "opacity-100" : "opacity-0")} />
                                    {u.displayName}
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-[10px] font-medium text-slate-400 italic">

                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="work" className="text-xs font-semibold text-slate-500">Work Content / Instructions</Label>
                    <textarea
                      id="work"
                      value={formData.workContent}
                      onChange={(e) => setFormData({ ...formData, workContent: e.target.value })}
                      className="min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all disabled:opacity-70" disabled={isReadOnly}
                      placeholder="Describe the maintenance task..."
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-500">Priority Level</Label>
                      <Select
                      value={formData.priority} 
                        onValueChange={(v) => setFormData({ ...formData, priority: v as Priority })}
                      >
                        <SelectTrigger className="h-10 border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="P0 (Urgent)"><span className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-red-500" /> P0 (Urgent)</span></SelectItem>
                          <SelectItem value="P1 (High)"><span className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-orange-500" /> P1 (High)</span></SelectItem>
                          <SelectItem value="P2 (Normal)"><span className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-blue-500" /> P2 (Normal)</span></SelectItem>
                          <SelectItem value="P3 (Low)"><span className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-slate-400" /> P3 (Low)</span></SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: Handover Chain & History */}
              <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-indigo-600">
                    <History className="h-4 w-4" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Handover History & Confirmation</h4>
                  </div>
                  {(!editingTask || canEditTask(editingTask)) && !isHandoverMode && (
                    <Button 
                      type="button" 
                      variant="outline" size="sm" onClick={() => setIsHandoverMode(true)} disabled={isReadOnly}
                      className="h-7 text-[10px] font-bold border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                    >
                      <Plus className="mr-1 h-3 w-3" /> New Handover
                    </Button>
                  )}
                </div>

                {/* Handover Timeline */}
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {formData.handoverLogs.length === 0 && !isHandoverMode && (
                    <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
                      <p className="text-xs text-slate-400 italic">No handover logs recorded yet.</p>
                    </div>
                  )}

                  {formData.handoverLogs.map((log, idx) => (
                    <div key={idx} className="relative pl-4 border-l-2 border-indigo-100 pb-2 last:pb-0">
                      <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center">
                         <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200 p-2 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-indigo-600">{log.fromStaff} → {log.toStaff.join(', ')}</span>
                          <span className="text-[9px] text-slate-400">{format(new Date(log.timestamp), 'MMM dd, HH:mm')}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">{log.note}</p>
                        {log.shifts.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {log.shifts.map(s => <Badge key={s} variant="outline" className="text-[8px] h-3 px-1">{s}</Badge>)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Add New Handover Form */}
                  {isHandoverMode && (
                    <div className="bg-indigo-50/50 rounded-xl border border-indigo-200 p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-indigo-700">Handover To</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            disabled={isReadOnly} className="w-full justify-between h-9 bg-white text-xs">
                               <span className="truncate">
                                {tempHandoverStaff.length > 0 ? tempHandoverStaff.join(', ') : "Select staff..."}
                               </span>
                               <ChevronsUpDown className="h-3 w-3 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[280px] p-0">
                            <Command>
                              <CommandInput placeholder="Search staff..." />
                              <CommandList>
                                <CommandGroup>
                                  {filteredHandoverUsers.map(u => (
                                    <CommandItem key={u.id} onSelect={() => {
                                      const exists = tempHandoverStaff.includes(u.displayName);
                                      setTempHandoverStaff(exists ? tempHandoverStaff.filter(n => n !== u.displayName) : [...tempHandoverStaff, u.displayName]);
                                    }}>
                                      <Check className={cn("mr-2 h-3 w-3", tempHandoverStaff.includes(u.displayName) ? "opacity-100" : "opacity-0")} />
                                      {u.displayName}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-indigo-700">Shifts</Label>
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(SHIFT_MAP).map(s => (
                            <Badge 
                              key={s} 
                              variant={tempHandoverShifts.includes(s) ? "default" : "outline"}
                              className="cursor-pointer text-[10px] h-6"
                              onClick={() => {
                                const exists = tempHandoverShifts.includes(s);
                                setTempHandoverShifts(exists ? tempHandoverShifts.filter(x => x !== s) : [...tempHandoverShifts, s]);
                              }}
                            >
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-indigo-700">Handover Notes</Label>
                        <textarea 
                          className="w-full rounded-lg border border-slate-200 p-2 text-xs min-h-[60px] outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="What should the next shift know?..."
                          value={tempHandoverNote}
                          onChange={e => setTempHandoverNote(e.target.value)}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="flex-1 text-[10px] h-8" onClick={() => setIsHandoverMode(false)}>Cancel</Button>
                        <Button variant="default" size="sm" className="flex-1 text-[10px] h-8 bg-indigo-600" onClick={handleAddHandoverLog}>Add Log</Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Task Confirmations Section */}
                <div className="pt-2 border-t border-slate-200">
                   <div className="flex items-center gap-2 mb-2 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <h4 className="text-[10px] font-bold uppercase tracking-wider">Acknowledge / Confirmations</h4>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {formData.confirmations.map((c, i) => (
                      <Badge key={i} className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[9px] py-0.5">
                        <Check className="mr-1 h-2.5 w-2.5" /> {c.staffName} ({format(new Date(c.timestamp), 'HH:mm')})
                      </Badge>
                    ))}
                    {formData.confirmations.length === 0 && <span className="text-[10px] text-slate-400 italic">No confirmations yet.</span>}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-4">
                <Label className="text-xs font-semibold text-slate-500">Current Progress / Status</Label>
                <Select 
                      value={formData.status} 
                  onValueChange={(v) => setFormData({ ...formData, status: v as Status })}
                  disabled={isReadOnly}
                >
                  <SelectTrigger className="h-10 border-slate-200 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planned">⚪ Planned</SelectItem>
                    <SelectItem value="Progress 25%">🟡 Progress 25%</SelectItem>
                    <SelectItem value="Progress 50%">🟠 Progress 50%</SelectItem>
                    <SelectItem value="Progress 75%">🔵 Progress 75%</SelectItem>
                    <SelectItem value="Done">🟢 Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </ScrollArea>
          
          <DialogFooter className="shrink-0 bg-slate-50 px-6 py-4 border-t border-slate-100 gap-2 flex flex-col sm:flex-row">
            <Button 
              variant="outline" 
              onClick={() => setIsDialogOpen(false)} 
              className="flex-1 sm:flex-none border-slate-200 text-slate-600 hover:bg-slate-100 h-10"
            >
              Cancel
            </Button>
            <Button 
              onClick={isReadOnly ? () => setIsDialogOpen(false) : handleSave} 
              className="flex-1 sm:flex-none bg-linear-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-700 hover:to-fuchsia-700 text-white shadow-md shadow-indigo-200 transition-all active:scale-95 h-10 font-bold"
            >
              {isReadOnly ? 'Close' : (editingTask ? 'Save Changes' : 'Confirm & Save')}
            </Button>
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
              <Select disabled={isReadOnly} value={syncMode} onValueChange={(value: SyncMode) => setSyncMode(value)}>
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
