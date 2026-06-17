'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { 
  Clock, 
  AlertCircle, 
  Calendar, 
  Users, 
  Activity, 
  FileText, 
  Search, 
  Sparkles,
  BarChart3,
  Wrench,
  Settings
} from 'lucide-react';

import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { SupabaseService } from '@/services/supabaseService';
import { WorkReport, User, WorkingHours } from '@/types';
import { cn } from '@/lib/utils';

const SHIFT_MAP: Record<string, { start: string; stop: string }> = {
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

const getShiftBlocks = (shiftCode: string) => {
  const shift = SHIFT_MAP[shiftCode.toUpperCase().trim()];
  if (!shift) return [];
  
  const [startH, startM] = shift.start.split(':').map(Number);
  const [stopH, stopM] = shift.stop.split(':').map(Number);
  
  const startMins = startH * 60 + startM;
  const stopMins = stopH * 60 + stopM;
  
  if (stopMins <= startMins) {
    const left1 = (startMins / 1440) * 100;
    const width1 = ((1440 - startMins) / 1440) * 100;
    const left2 = 0;
    const width2 = (stopMins / 1440) * 100;
    return [
      { left: `${left1}%`, width: `${width1}%` },
      { left: `${left2}%`, width: `${width2}%` }
    ];
  } else {
    const left = (startMins / 1440) * 100;
    const width = ((stopMins - startMins) / 1440) * 100;
    return [
      { left: `${left}%`, width: `${width}%` }
    ];
  }
};

// Helper: Format YYYY-MM-DD to DD/MM/YYYY
const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
};

// Helper: Calculate week boundaries for a given week offset from today
const getWeekRange = (offset: number) => {
  const today = new Date();
  const day = today.getDay();
  // Get offset from Monday
  const diff = today.getDate() - day + (day === 0 ? -6 : 1) + (offset * 7);
  const monday = new Date(today.setDate(diff));
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${date}`;
  };
  
  return {
    start: format(monday),
    end: format(sunday)
  };
};

const mergeConsecutiveReports = (reports: WorkReport[]): WorkReport[] => {
  if (reports.length === 0) return [];
  
  const sorted = [...reports].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const merged: WorkReport[] = [];
  
  let current = { ...sorted[0] };
  
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    
    if (
      current.endTime === next.startTime && 
      current.activity.trim().toLowerCase() === next.activity.trim().toLowerCase() &&
      current.workType === next.workType &&
      current.machineName === next.machineName
    ) {
      current.endTime = next.endTime;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  
  merged.push(current);
  return merged;
};

export default function WorkSummaryPage() {
  const { user } = useAuth();
  
  // Date selection state: WEEK or CUSTOM
  const [timeMode, setTimeMode] = useState<'WEEK' | 'CUSTOM'>('WEEK');

  // Generate list of last 12 weeks
  const weekOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 12; i++) {
      const range = getWeekRange(-i);
      const label = i === 0 
        ? `Tuần này (${formatDisplayDate(range.start)} - ${formatDisplayDate(range.end)})` 
        : i === 1 
          ? `Tuần trước (${formatDisplayDate(range.start)} - ${formatDisplayDate(range.end)})`
          : `Tuần từ ${formatDisplayDate(range.start)} đến ${formatDisplayDate(range.end)}`;
      options.push({
        value: `${range.start}_${range.end}`,
        label,
        ...range
      });
    }
    return options;
  }, []);

  const [selectedWeek, setSelectedWeek] = useState<string>(weekOptions[0].value);
  
  // Custom Date range states
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // Calculate final start and end dates used for query
  const { startDate, endDate } = useMemo(() => {
    if (timeMode === 'WEEK') {
      const [start, end] = selectedWeek.split('_');
      return { startDate: start, endDate: end };
    }
    return { startDate: customStartDate, endDate: customEndDate };
  }, [timeMode, selectedWeek, customStartDate, customEndDate]);

  // Report records
  const [allReports, setAllReports] = useState<WorkReport[]>([]);
  const [dbLoading, setDbLoading] = useState(false);

  // All users from profiles table (for filtering)
  const [users, setUsers] = useState<User[]>([]);

  // All working hours (for timeline background coloring)
  const [workingHours, setWorkingHours] = useState<WorkingHours[]>([]);

  // Dashboard filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserFilter, setSelectedUserFilter] = useState('all');

  // Pagination State for Detailed Table
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Reset pagination to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [timeMode, selectedWeek, customStartDate, customEndDate, selectedUserFilter, searchQuery]);

  // Fetch all users and working hours on mount
  useEffect(() => {
    const fetchUsersAndWH = async () => {
      try {
        const [usersData, whData] = await Promise.all([
          SupabaseService.getUsers(),
          SupabaseService.getWorkingHours()
        ]);
        setUsers(usersData);
        setWorkingHours(whData);
      } catch (error) {
        console.error('Error fetching users and working hours:', error);
      }
    };
    void fetchUsersAndWH();
  }, []);

  // Fetch all reports for the dashboard using range
  const fetchAllReports = useCallback(async () => {
    setDbLoading(true);
    try {
      const data = await SupabaseService.getWorkReports(startDate, undefined, {}, endDate);
      setAllReports(data);
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi tải dữ liệu bảng tổng hợp');
    } finally {
      setDbLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void fetchAllReports();
  }, [fetchAllReports]);

  // Calculate duration in hours
  const calculateDuration = (start: string, end: string): number => {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const diffMin = (endH * 60 + endM) - (startH * 60 + startM);
    return Math.round((diffMin / 60) * 10) / 10;
  };

  // Get list of unique users for the filter select
  const uniqueUsersList = useMemo(() => {
    if (users.length > 0) {
      return users.map(u => ({
        userId: u.id,
        displayName: u.displayName || u.username
      }));
    }
    const map = new Map<string, string>();
    allReports.forEach(r => {
      map.set(r.userId, r.displayName || r.username);
    });
    if (user) {
      map.set(user.id, user.displayName || user.username);
    }
    return Array.from(map.entries()).map(([userId, displayName]) => ({
      userId,
      displayName
    }));
  }, [users, allReports, user]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return allReports.filter(r => {
      // 1. User filter
      if (selectedUserFilter !== 'all' && r.userId !== selectedUserFilter) {
        return false;
      }
      // 2. Keyword search
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesUser = r.displayName.toLowerCase().includes(q) || r.username.toLowerCase().includes(q);
        const matchesActivity = r.activity.toLowerCase().includes(q) || (r.machineName && r.machineName.toLowerCase().includes(q));
        return matchesUser || matchesActivity;
      }
      return true;
    });
  }, [allReports, selectedUserFilter, searchQuery]);

  // Paginated reports for Tab 3
  const paginatedReports = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredReports.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredReports, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredReports.length / itemsPerPage);
  }, [filteredReports.length, itemsPerPage]);

  // Group filtered reports by user and date for Timeline
  const groupedReports = useMemo(() => {
    const groups: Record<string, { displayName: string; username: string; reportDate: string; reports: WorkReport[] }> = {};
    
    filteredReports.forEach(r => {
      const key = `${r.userId}_${r.reportDate}`;
      if (!groups[key]) {
        groups[key] = {
          displayName: r.displayName || r.username,
          username: r.username,
          reportDate: r.reportDate,
          reports: []
        };
      }
      groups[key].reports.push(r);
    });

    return Object.entries(groups).map(([key, val]) => ({
      key,
      userId: key.split('_')[0],
      ...val
    })).sort((a, b) => {
      if (a.reportDate !== b.reportDate) {
        return b.reportDate.localeCompare(a.reportDate);
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }, [filteredReports]);

  // Filtered reports for the current user's "Báo cáo của tôi" tab
  const myFilteredReports = useMemo(() => {
    if (!user) return [];
    return filteredReports.filter(r => r.userId === user.id);
  }, [filteredReports, user]);

  // Dashboard Stats based on filtered data
  const dashboardStats = useMemo(() => {
    let totalHours = 0;
    const activeUsers = new Set<string>();
    
    filteredReports.forEach(r => {
      totalHours += calculateDuration(r.startTime, r.endTime);
      activeUsers.add(r.userId);
    });

    return {
      totalHours: Math.round(totalHours * 10) / 10,
      activeUsersCount: activeUsers.size,
      totalEntries: filteredReports.length
    };
  }, [filteredReports]);

  // Timeline Gantt block math
  const getTimelineBlockStyle = (startTime: string, endTime: string) => {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const durationMinutes = endMinutes - startMinutes;

    const left = (startMinutes / 1440) * 100;
    const width = (durationMinutes / 1440) * 100;

    return {
      left: `${left}%`,
      width: `${width}%`
    };
  };

  // Get all reports that are actually rendered in the timeline
  const timelineReports = useMemo(() => {
    const reports: WorkReport[] = [];
    groupedReports.forEach(g => {
      reports.push(...g.reports);
    });
    return reports;
  }, [groupedReports]);

  // Map each unique activity to a specific color index
  const activityColorMap = useMemo(() => {
    const map = new Map<string, number>();
    let colorIndex = 0;
    
    const uniqueNames = Array.from(new Set(
      timelineReports.map(r => r.activity.trim())
    )).sort();

    uniqueNames.forEach(name => {
      const normalized = name.toLowerCase();
      if (!map.has(normalized)) {
        map.set(normalized, colorIndex);
        colorIndex++;
      }
    });

    return map;
  }, [timelineReports]);

  const activityColors = useMemo(() => [
    'from-indigo-500/80 to-purple-600/80 hover:from-indigo-600 hover:to-purple-700',
    'from-sky-500/80 to-blue-600/80 hover:from-sky-600 hover:to-blue-700',
    'from-emerald-500/80 to-teal-600/80 hover:from-emerald-600 hover:to-teal-700',
    'from-amber-500/80 to-orange-600/80 hover:from-amber-600 hover:to-orange-700',
    'from-rose-500/80 to-pink-600/80 hover:from-rose-600 hover:to-pink-700',
    'from-violet-500/80 to-fuchsia-600/80 hover:from-violet-600 hover:to-fuchsia-700',
    'from-cyan-500/80 to-teal-500/80 hover:from-cyan-600 hover:to-teal-600',
    'from-lime-500/80 to-emerald-600/80 hover:from-lime-600 hover:to-emerald-700',
    'from-orange-500/80 to-red-600/80 hover:from-orange-600 hover:to-red-700',
    'from-fuchsia-500/80 to-pink-600/80 hover:from-fuchsia-600 hover:to-pink-700',
    'from-blue-500/80 to-indigo-600/80 hover:from-blue-600 hover:to-indigo-700',
    'from-yellow-500/80 to-amber-600/80 hover:from-yellow-600 hover:to-amber-700'
  ], []);

  const legendDotColors = useMemo(() => [
    'from-indigo-500 to-purple-600',
    'from-sky-500 to-blue-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-violet-500 to-fuchsia-600',
    'from-cyan-500 to-teal-500',
    'from-lime-500 to-emerald-600',
    'from-orange-500 to-red-600',
    'from-fuchsia-500 to-pink-600',
    'from-blue-500 to-indigo-600',
    'from-yellow-500 to-amber-600'
  ], []);

  const getActivityColorClass = useCallback((activityName: string) => {
    const normalized = activityName.trim().toLowerCase();
    const colorIndex = activityColorMap.get(normalized) ?? 0;
    return activityColors[colorIndex % activityColors.length];
  }, [activityColorMap, activityColors]);

  const getLegendDotColorClass = useCallback((activityName: string) => {
    const normalized = activityName.trim().toLowerCase();
    const colorIndex = activityColorMap.get(normalized) ?? 0;
    return legendDotColors[colorIndex % legendDotColors.length];
  }, [activityColorMap, legendDotColors]);

  const getDashboardDateRangeText = useCallback(() => {
    const startStr = formatDisplayDate(startDate);
    const endStr = formatDisplayDate(endDate);
    if (startStr === endStr) {
      return `ngày ${startStr}`;
    }
    return `từ ngày ${startStr} đến ngày ${endStr}`;
  }, [startDate, endDate]);

  const getShiftForUserOnDate = useCallback((username: string, displayName: string, dateStr: string): string => {
    const normUser = username.trim().toLowerCase();
    const normDisplay = displayName.trim().toLowerCase();
    
    const wh = workingHours.find(row => {
      const normMsnv = row.msnv.trim().toLowerCase();
      const normName = row.fullName.trim().toLowerCase();
      return normMsnv === normUser || normName === normDisplay;
    });
    
    if (!wh) return 'OFF';
    return String(wh.days[dateStr] || 'OFF').toUpperCase().trim();
  }, [workingHours]);

  // CHARTS DATA CALCULATIONS
  // Chart 1: Time spent on machine repairs
  const machineRepairChartData = useMemo(() => {
    const map = new Map<string, number>();
    filteredReports.forEach(r => {
      if (r.workType === 'MACHINE_REPAIR' && r.machineName) {
        const duration = calculateDuration(r.startTime, r.endTime);
        map.set(r.machineName, (map.get(r.machineName) || 0) + duration);
      }
    });

    return Array.from(map.entries())
      .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours);
  }, [filteredReports]);

  // Chart 2: Time spent on other tasks
  const otherWorkChartData = useMemo(() => {
    const map = new Map<string, number>();
    filteredReports.forEach(r => {
      if (r.workType === 'OTHER' || !r.workType) {
        const duration = calculateDuration(r.startTime, r.endTime);
        const name = r.activity.trim();
        map.set(name, (map.get(name) || 0) + duration);
      }
    });

    return Array.from(map.entries())
      .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10); // Top 10 other tasks to avoid overflow
  }, [filteredReports]);

  // Max values for chart percentage scaling
  const maxMachineHours = useMemo(() => {
    return Math.max(...machineRepairChartData.map(d => d.hours), 1);
  }, [machineRepairChartData]);

  const maxOtherHours = useMemo(() => {
    return Math.max(...otherWorkChartData.map(d => d.hours), 1);
  }, [otherWorkChartData]);

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        {/* Header Block */}
        <header className="relative overflow-hidden rounded-2xl bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 shadow-xl shadow-indigo-950/20">
          <div className="absolute right-0 top-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="absolute left-1/3 bottom-0 -mb-16 h-36 w-36 rounded-full bg-purple-500/10 blur-3xl" />
          
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                  <BarChart3 className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Tổng hợp</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">
                Bảng Tổng Hợp Công Việc
              </h1>
              <p className="text-sm text-slate-300">
                Thống kê, phân tích và trực quan hóa thời gian bảo trì sửa máy và các công việc kỹ thuật khác.
              </p>
            </div>
            
            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2 backdrop-blur-md">
              <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
              <span className="text-xs font-bold text-slate-200">
                Lọc tuần hoặc khoảng ngày linh hoạt
              </span>
            </div>
          </div>
        </header>

        {/* Filters Panel Card */}
        <Card className="border-0 border-l-4 border-l-indigo-600 bg-white shadow-md shadow-slate-200/50 overflow-hidden">
          <CardHeader className="py-4 px-6 border-b bg-slate-50/50">
            <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Settings className="h-4.5 w-4.5 text-indigo-600" />
              Bộ lọc tổng hợp
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              
              {/* Date Filter Mode Selector */}
              <div className="space-y-1">
                <Label htmlFor="time-mode" className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-indigo-500" />
                  Thời gian xem:
                </Label>
                <select
                  id="time-mode"
                  className="flex h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1 text-xs font-bold text-slate-700 transition-all hover:bg-slate-100/70 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none shadow-xs cursor-pointer"
                  value={timeMode}
                  onChange={(e) => setTimeMode(e.target.value as 'WEEK' | 'CUSTOM')}
                >
                  <option value="WEEK">Xem theo tuần</option>
                  <option value="CUSTOM">Chọn khoảng ngày tùy ý</option>
                </select>
              </div>

              {/* Time value selectors */}
              {timeMode === 'WEEK' ? (
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="week-select" className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                    Chọn tuần báo cáo:
                  </Label>
                  <select
                    id="week-select"
                    className="flex h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1 text-xs font-bold text-slate-700 transition-all hover:bg-slate-100/70 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none shadow-xs cursor-pointer"
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                  >
                    {weekOptions.map(w => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="custom-start-date" className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                      Từ ngày:
                    </Label>
                    <Input
                      id="custom-start-date"
                      type="date"
                      className="h-9 text-xs font-bold text-slate-700 rounded-lg border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="custom-end-date" className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                      Đến ngày:
                    </Label>
                    <Input
                      id="custom-end-date"
                      type="date"
                      className="h-9 text-xs font-bold text-slate-700 rounded-lg border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Employee filter */}
              <div className="space-y-1">
                <Label htmlFor="dash-user" className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-indigo-500" />
                  Lọc theo nhân viên:
                </Label>
                <select
                  id="dash-user"
                  className="flex h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1 text-xs font-bold text-slate-700 transition-all hover:bg-slate-100/70 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none shadow-xs cursor-pointer"
                  value={selectedUserFilter}
                  onChange={(e) => setSelectedUserFilter(e.target.value)}
                >
                  <option value="all">Tất cả nhân sự</option>
                  {uniqueUsersList.map(u => (
                    <option key={u.userId} value={u.userId}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            <div className="grid gap-4 md:grid-cols-4 border-t pt-4">
              {/* Activity query */}
              <div className="space-y-1 md:col-span-4">
                <Label htmlFor="dash-search" className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5 text-indigo-500" />
                  Tìm từ khóa công việc hoặc tên máy:
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="dash-search"
                    placeholder="Tìm kiếm nội dung hoạt động, tên máy móc..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-xs font-bold text-slate-700 rounded-lg border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Statistics Row */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="relative overflow-hidden border-0 bg-linear-to-br from-indigo-600 to-indigo-800 text-white shadow-lg shadow-indigo-600/15">
            <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <CardHeader className="pb-2 flex flex-row items-start justify-between">
              <div className="space-y-1">
                <CardDescription className="text-indigo-200 text-xs font-bold uppercase tracking-wider">Tổng giờ làm việc</CardDescription>
                <CardTitle className="text-3xl font-black text-white">{dashboardStats.totalHours} giờ</CardTitle>
              </div>
              <Clock className="h-8 w-8 text-indigo-300/30 shrink-0" />
            </CardHeader>
          </Card>
          <Card className="relative overflow-hidden border-0 bg-linear-to-br from-purple-600 to-fuchsia-800 text-white shadow-lg shadow-fuchsia-600/15">
            <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <CardHeader className="pb-2 flex flex-row items-start justify-between">
              <div className="space-y-1">
                <CardDescription className="text-purple-200 text-xs font-bold uppercase tracking-wider">Nhân sự tham gia</CardDescription>
                <CardTitle className="text-3xl font-black text-white">{dashboardStats.activeUsersCount} thành viên</CardTitle>
              </div>
              <Users className="h-8 w-8 text-purple-300/30 shrink-0" />
            </CardHeader>
          </Card>
          <Card className="relative overflow-hidden border-0 bg-linear-to-br from-emerald-500 to-teal-700 text-white shadow-lg shadow-emerald-600/15">
            <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <CardHeader className="pb-2 flex flex-row items-start justify-between">
              <div className="space-y-1">
                <CardDescription className="text-emerald-100 text-xs font-bold uppercase tracking-wider">Lượt ghi nhận hoạt động</CardDescription>
                <CardTitle className="text-3xl font-black text-white">{dashboardStats.totalEntries} lượt</CardTitle>
              </div>
              <Activity className="h-8 w-8 text-emerald-200/30 shrink-0" />
            </CardHeader>
          </Card>
        </div>

        {/* Charts Section: Dynamic Custom HTML Bar Charts */}
        <div className="grid gap-6 md:grid-cols-2">
          
          {/* Chart 1: Machine Repair Time */}
          <Card className="border-0 border-l-4 border-l-rose-500 bg-white shadow-md shadow-slate-200/50 overflow-hidden">
            <CardHeader className="py-4 px-6 border-b bg-slate-50/50 flex flex-row items-center gap-2">
              <Wrench className="h-4.5 w-4.5 text-rose-500" />
              <div>
                <CardTitle className="text-sm font-black text-slate-800">Thời gian sửa chữa máy</CardTitle>
                <CardDescription className="text-[11px]">Tổng số giờ bảo trì/sửa chữa theo từng loại máy móc</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {machineRepairChartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 space-y-2">
                  <AlertCircle className="h-8 w-8 text-slate-300" />
                  <p className="text-xs font-medium">Không có dữ liệu sửa máy trong khoảng thời gian này</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {machineRepairChartData.map((d) => {
                    const pct = (d.hours / maxMachineHours) * 100;
                    return (
                      <div key={d.name} className="space-y-1 group">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                          <span className="truncate max-w-[200px]">{d.name}</span>
                          <span className="font-bold text-rose-600">{d.hours}h</span>
                        </div>
                        <div className="relative h-4.5 w-full bg-slate-100 rounded-md overflow-hidden shadow-inner">
                          <div 
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-400 to-pink-500 rounded-md transition-all duration-500 ease-out group-hover:from-rose-500 group-hover:to-pink-600 flex items-center justify-end px-2"
                            style={{ width: `${pct}%` }}
                          >
                            {pct > 10 && (
                              <span className="text-[9px] font-extrabold text-white select-none">
                                {Math.round(pct)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart 2: Other Tasks Time */}
          <Card className="border-0 border-l-4 border-l-indigo-500 bg-white shadow-md shadow-slate-200/50 overflow-hidden">
            <CardHeader className="py-4 px-6 border-b bg-slate-50/50 flex flex-row items-center gap-2">
              <Settings className="h-4.5 w-4.5 text-indigo-500" />
              <div>
                <CardTitle className="text-sm font-black text-slate-800">Thời gian các công việc khác</CardTitle>
                <CardDescription className="text-[11px]">Phân tích thời gian cho các nhiệm vụ phụ trợ</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {otherWorkChartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 space-y-2">
                  <AlertCircle className="h-8 w-8 text-slate-300" />
                  <p className="text-xs font-medium">Không có dữ liệu công việc khác trong khoảng thời gian này</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {otherWorkChartData.map((d) => {
                    const pct = (d.hours / maxOtherHours) * 100;
                    return (
                      <div key={d.name} className="space-y-1 group">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                          <span className="truncate max-w-[200px]">{d.name}</span>
                          <span className="font-bold text-indigo-600">{d.hours}h</span>
                        </div>
                        <div className="relative h-4.5 w-full bg-slate-100 rounded-md overflow-hidden shadow-inner">
                          <div 
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-400 to-purple-500 rounded-md transition-all duration-500 ease-out group-hover:from-indigo-500 group-hover:to-purple-600 flex items-center justify-end px-2"
                            style={{ width: `${pct}%` }}
                          >
                            {pct > 10 && (
                              <span className="text-[9px] font-extrabold text-white select-none">
                                {Math.round(pct)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Tabs Content */}
        <Tabs defaultValue="dashboard" className="w-full space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3 rounded-xl bg-slate-100/80 p-1 backdrop-blur-md shadow-inner border border-slate-200/50">
            <TabsTrigger 
              value="reporting" 
              className="group rounded-lg text-xs font-bold transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-md"
            >
              <Clock className="mr-2 h-4 w-4 text-emerald-600 group-data-[state=active]:text-white transition-colors" />
              Báo cáo của tôi
            </TabsTrigger>
            <TabsTrigger 
              value="dashboard" 
              className="group rounded-lg text-xs font-bold transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md"
            >
              <Users className="mr-2 h-4 w-4 text-indigo-600 group-data-[state=active]:text-white transition-colors" />
              Sơ đồ thời gian
            </TabsTrigger>
            <TabsTrigger 
              value="details" 
              className="group rounded-lg text-xs font-bold transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-pink-600 data-[state=active]:text-white data-[state=active]:shadow-md"
            >
              <FileText className="mr-2 h-4 w-4 text-fuchsia-600 group-data-[state=active]:text-white transition-colors" />
              Bảng chi tiết
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: BÁO CÁO CỦA TÔI */}
          <TabsContent value="reporting" className="space-y-6 focus-visible:ring-0">
            <Card className="border-0 border-l-4 border-l-emerald-500 bg-white shadow-lg shadow-slate-200/50 overflow-hidden">
              <CardHeader className="border-b border-slate-100/80 py-4 px-6 bg-slate-50/50">
                <CardTitle className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Clock className="h-4.5 w-4.5 text-emerald-500" />
                  Báo cáo cá nhân của tôi
                </CardTitle>
                <CardDescription>
                  Danh sách công việc cá nhân được tổng hợp {getDashboardDateRangeText()}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {myFilteredReports.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
                    <Clock className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium">Bạn chưa có báo cáo nào trong khoảng thời gian này.</p>
                  </div>
                ) : (
                  <div className="relative border-l-2 border-slate-100 pl-4 ml-3 space-y-6">
                    {myFilteredReports.map((report, idx) => {
                      const duration = calculateDuration(report.startTime, report.endTime);
                      return (
                        <div key={report.id} className="relative group">
                          <div className="absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-indigo-200 bg-white text-[9px] font-bold text-indigo-600 shadow-sm">
                            {idx + 1}
                          </div>
                          <div className="rounded-xl border p-4 shadow-sm bg-white border-slate-100">
                            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2 py-1 text-xs font-black text-indigo-700 border border-indigo-100">
                                    {report.startTime} - {report.endTime}
                                  </span>
                                  <span className="text-[11px] font-bold text-slate-400">
                                    ({duration} giờ)
                                  </span>
                                  <span className="text-[10px] text-slate-500 bg-slate-50 border px-1.5 py-0.5 rounded font-semibold">
                                    {formatDisplayDate(report.reportDate)}
                                  </span>
                                  {report.workType === 'MACHINE_REPAIR' && report.machineName && (
                                    <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 border border-rose-100">
                                      <Wrench className="h-3 w-3" /> Sửa máy: {report.machineName}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                                  {report.activity}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: SƠ ĐỒ THỜI GIAN (GANTT) */}
          <TabsContent value="dashboard" className="space-y-6 focus-visible:ring-0">
            <Card className="border-0 border-l-4 border-l-indigo-600 bg-white shadow-xl shadow-slate-200/60 overflow-hidden">
              <CardHeader className="border-b border-slate-100/80 py-4 px-6 bg-slate-50/50">
                <CardTitle className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Activity className="h-4.5 w-4.5 text-indigo-600 animate-pulse" />
                  Sơ đồ phân bổ công việc (Timeline)
                </CardTitle>
                <CardDescription>
                  Xem trực quan hóa công việc của các thành viên từ 00:00 đến 24:00 {getDashboardDateRangeText()}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="p-6">
                {dbLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-4">
                    <div className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <p className="font-bold text-sm">Đang vẽ dòng thời gian...</p>
                  </div>
                ) : groupedReports.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400 space-y-3">
                    <AlertCircle className="h-16 w-16 opacity-10 text-indigo-900" />
                    <p className="text-sm font-medium">Không tìm thấy dữ liệu báo cáo nào khớp với bộ lọc.</p>
                  </div>
                ) : (
                  <div className="space-y-6 overflow-x-auto min-w-[700px] pb-4">
                    
                    {/* Time Ruler Header */}
                    <div className="relative flex border-b pb-2 text-[10px] font-bold text-slate-400 select-none">
                      <div className="w-40 shrink-0 text-slate-500 font-extrabold pl-2">Thành viên</div>
                      <div className="relative flex-1 h-5">
                        {[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map((hour) => (
                          <div
                            key={hour}
                            className="absolute -translate-x-1/2 whitespace-nowrap"
                            style={{ left: `${(hour / 24) * 100}%` }}
                          >
                            {String(hour).padStart(2, '0')}:00
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Users rows */}
                    <div className="space-y-4 relative">
                      
                      {/* Vertical grid lines background */}
                      <div className="absolute inset-y-0 left-40 right-0 grid grid-cols-12 pointer-events-none z-0">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <div key={i} className="border-l border-slate-100 h-full first:border-l-0" />
                        ))}
                      </div>

                      {/* Map through each user group */}
                      {groupedReports.map((userGroup) => {
                        const shiftCode = getShiftForUserOnDate(userGroup.username, userGroup.displayName, userGroup.reportDate);
                        const shiftBlocks = getShiftBlocks(shiftCode);
                        
                        return (
                          <div key={userGroup.key} className="relative z-10 flex items-center group/row">
                            {/* User label */}
                            <div className="w-40 shrink-0 pr-4 select-none">
                              <p className="text-sm font-extrabold text-slate-800 truncate leading-none">
                                {userGroup.displayName}
                              </p>
                              <p className="text-[10px] text-slate-400 font-medium truncate mt-1">
                                @{userGroup.username}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className="text-[9px] text-indigo-600 font-bold bg-indigo-50 border border-indigo-100 rounded px-1 py-0.5">
                                  {formatDisplayDate(userGroup.reportDate)}
                                </span>
                                {shiftCode && shiftCode !== 'OFF' && (
                                  <span className="text-[9px] text-rose-600 font-bold bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5" title={`Ca làm việc: ${shiftCode}`}>
                                    {shiftCode}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 24h timeline track container */}
                            <div className="relative flex-1 h-14 rounded-lg bg-amber-100 border border-amber-200 shadow-xs flex items-center overflow-hidden">
                              {/* Shift Hours background coloring in red */}
                              {shiftBlocks.map((block, bIdx) => (
                                <div
                                  key={bIdx}
                                  className="absolute h-full bg-rose-200/70 pointer-events-none"
                                  style={block}
                                  title={`Thời gian trong ca làm việc (${shiftCode})`}
                                />
                              ))}

                              {/* Render each block segment */}
                              {mergeConsecutiveReports(userGroup.reports).map((report, idx) => {
                                const blockStyle = getTimelineBlockStyle(report.startTime, report.endTime);
                                const duration = calculateDuration(report.startTime, report.endTime);
                                
                                return (
                                  <div
                                    key={report.id}
                                    className={cn(
                                      "absolute h-12 rounded-md shadow-xs flex items-start p-1 text-[8px] font-bold text-white transition-all cursor-pointer group/block select-none overflow-hidden bg-gradient-to-r",
                                      getActivityColorClass(report.activity)
                                    )}
                                    style={blockStyle}
                                    title={`${report.startTime} - ${report.endTime}: ${report.activity}`}
                                  >
                                    {/* Activity Text */}
                                    <span className="w-full block whitespace-normal break-words leading-[9px]">
                                      {report.activity}
                                    </span>

                                    {/* Hover Tooltip Overlay card */}
                                    <div className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 w-56 p-3 rounded-lg border border-slate-200 bg-white/95 text-slate-800 shadow-xl opacity-0 scale-90 group-hover/block:opacity-100 group-hover/block:scale-100 transition-all pointer-events-none z-50 text-xs">
                                      <div className="flex items-center justify-between border-b pb-1 mb-1.5">
                                        <span className="font-extrabold text-indigo-700">Chi tiết công việc</span>
                                        <span className="font-black text-[10px] text-slate-400 uppercase">
                                          {report.startTime} - {report.endTime}
                                        </span>
                                      </div>
                                      <p className="font-bold text-slate-900 leading-normal">
                                        {userGroup.displayName}
                                      </p>
                                      <p className="text-[10px] text-indigo-600 font-semibold mb-1">
                                        Ngày: {formatDisplayDate(userGroup.reportDate)}
                                      </p>
                                      {report.workType === 'MACHINE_REPAIR' && report.machineName && (
                                        <p className="text-[10px] text-rose-600 font-bold mb-1 flex items-center gap-1">
                                          <Wrench className="h-3 w-3" /> Sửa máy: {report.machineName}
                                        </p>
                                      )}
                                      <div className="max-h-24 overflow-y-auto pr-1 my-1">
                                        <p className="text-slate-600 leading-relaxed break-words font-medium">
                                          {report.activity}
                                        </p>
                                      </div>
                                      <div className="mt-1.5 border-t pt-1 flex justify-between text-[10px] text-slate-400 font-bold">
                                        <span>Thời lượng:</span>
                                        <span>{duration} giờ</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Timeline Legend */}
                    <div className="mt-4 border-t pt-4 flex flex-wrap items-center justify-between gap-4 text-[10px] font-bold text-slate-400 select-none">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 max-h-24 overflow-y-auto pr-2">
                        <span className="flex items-center gap-1.5 border-r pr-3">
                          <span className="h-3 w-3 rounded-sm bg-rose-200 border border-rose-400 shrink-0 shadow-xs" />
                          <span className="text-rose-600 font-extrabold">Trống trong ca (Chưa báo cáo)</span>
                        </span>
                        <span className="flex items-center gap-1.5 border-r pr-3">
                          <span className="h-3 w-3 rounded-sm bg-amber-100 border border-amber-300 shrink-0 shadow-xs" />
                          <span className="text-amber-600 font-extrabold">Trống ngoài ca (Tự do)</span>
                        </span>
                        
                        {Array.from(activityColorMap.keys()).map((normalizedName) => {
                          const originalReport = timelineReports.find(r => r.activity.trim().toLowerCase() === normalizedName);
                          const displayName = originalReport ? originalReport.activity.trim() : normalizedName;
                          return (
                            <span key={normalizedName} className="flex items-center gap-1.5">
                              <span className={cn("h-3 w-3 rounded-sm bg-gradient-to-r shrink-0 shadow-xs", getLegendDotColorClass(displayName))} />
                              <span className="text-slate-600 max-w-[150px] truncate" title={displayName}>
                                {displayName}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                      <span className="text-slate-400 font-medium italic shrink-0">
                        * Nhấn/di chuột lên khối để xem chi tiết đầy đủ
                      </span>
                    </div>

                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: BẢNG CHI TIẾT TỔNG HỢP */}
          <TabsContent value="details" className="space-y-6 focus-visible:ring-0">
            <Card className="border-0 border-l-4 border-l-fuchsia-500 bg-white shadow-md shadow-slate-200/50 overflow-hidden">
              <CardHeader className="border-b border-slate-100/80 py-4 px-6 bg-slate-50/50">
                <CardTitle className="text-base font-black text-slate-800 flex items-center gap-2">
                  <FileText className="h-4.5 w-4.5 text-fuchsia-500" />
                  Bảng tổng hợp chi tiết công việc trong tuần
                </CardTitle>
                <CardDescription>
                  Danh sách chi tiết được tổng hợp cho {getDashboardDateRangeText()}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[500px]">
                  <table className="w-full text-xs text-slate-600 text-left border-collapse">
                    <thead>
                      <tr className="border-b bg-slate-50 text-slate-500 font-bold uppercase select-none">
                        <th className="py-3 px-4 w-[160px]">Nhân viên</th>
                        <th className="py-3 px-4 w-[130px]">Thời gian & Ngày</th>
                        <th className="py-3 px-4 w-[120px]">Phân loại</th>
                        <th className="py-3 px-4 w-[80px] text-center">Thời lượng</th>
                        <th className="py-3 px-4">Nội dung công việc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReports.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">
                            Chưa có dữ liệu chi tiết cho khoảng thời gian này.
                          </td>
                        </tr>
                      ) : (
                        paginatedReports.map((report) => (
                          <tr key={report.id} className="border-b hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-4">
                              <p className="font-extrabold text-slate-800">{report.displayName}</p>
                              <p className="text-[10px] text-slate-400 font-medium">@{report.username}</p>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700 border border-slate-200 w-fit">
                                  {report.startTime} - {report.endTime}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">
                                  {formatDisplayDate(report.reportDate)}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {report.workType === 'MACHINE_REPAIR' && report.machineName ? (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 border border-rose-100">
                                  <Wrench className="h-3 w-3 text-rose-500" />
                                  Sửa máy: {report.machineName}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold text-slate-500 border border-slate-200">
                                  <Settings className="h-3 w-3 text-slate-400" />
                                  Khác
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center font-extrabold text-slate-700">
                              {calculateDuration(report.startTime, report.endTime)}h
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">
                              {report.activity}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </ScrollArea>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 p-4 bg-slate-50/50 rounded-b-xl gap-3">
                    <div className="text-xs text-slate-500 font-bold select-none">
                      Hiển thị <span className="font-extrabold text-slate-800">{(currentPage - 1) * itemsPerPage + 1} - {Math.min(filteredReports.length, currentPage * itemsPerPage)}</span> trong số <span className="font-extrabold text-slate-800">{filteredReports.length}</span> công việc
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        className="h-8 text-xs font-bold border-slate-200 rounded-lg"
                      >
                        Trước
                      </Button>
                      {Array.from({ length: totalPages }).map((_, i) => {
                        const pageNum = i + 1;
                        if (totalPages > 5 && pageNum !== 1 && pageNum !== totalPages && Math.abs(pageNum - currentPage) > 1) {
                          if (pageNum === 2 || pageNum === totalPages - 1) {
                            return (
                              <span key={pageNum} className="px-1 text-slate-400 text-xs font-bold select-none">
                                ...
                              </span>
                            );
                          }
                          return null;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            className={cn(
                              "h-8 w-8 text-xs font-bold rounded-lg border-slate-200",
                              currentPage === pageNum ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600" : "hover:bg-slate-50"
                            )}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                        className="h-8 text-xs font-bold border-slate-200 rounded-lg"
                      >
                        Sau
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedLayout>
  );
}
