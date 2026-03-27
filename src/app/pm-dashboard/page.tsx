'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  AlertTriangle,
  Building2,
  CalendarCheck2,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Loader2,
  Plus,
  Save,
  Search,
  StickyNote,
  Trash2,
  Upload,
} from 'lucide-react';

import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  createDefaultPmChecklist,
  getCurrentIsoWeek,
  getMonthFromIsoWeek,
  normalizePmChecklistTemplate,
  parsePmScheduleFile,
  PM_TOTAL_WEEKS,
  toMonthLabel,
} from '@/lib/pmSchedule';
import { PMChecklistItem, PMImportPreview, PMMachineSchedule, PMTask, PMWorkshopData, PMWorkshopType } from '@/types/pm';

const WORKSHOPS: PMWorkshopType[] = ['foaming', 'insole'];

const WORKSHOP_META: Record<PMWorkshopType, { label: string; sheetHint: string }> = {
  foaming: {
    label: 'Xuong Foaming',
    sheetHint: 'Sheet: Master Plan(Monitoring), row data from row 5',
  },
  insole: {
    label: 'Xuong Insole',
    sheetHint: 'Sheet: Table 1, row data from row 9',
  },
};

interface WorkshopFilterState {
  search: string;
  monthFilter: string;
  selectedWeek: number;
}

function getWeekTiming(
  week: number,
  planYear: number,
  currentYear: number,
  currentWeek: number
): 'past' | 'current' | 'future' {
  if (planYear < currentYear) return 'past';
  if (planYear > currentYear) return 'future';
  if (week < currentWeek) return 'past';
  if (week === currentWeek) return 'current';
  return 'future';
}

function machineMatchesSearch(machine: PMMachineSchedule, search: string): boolean {
  if (!search) return true;
  const normalized = search.toLowerCase();
  return (
    machine.idMachine.toLowerCase().includes(normalized) ||
    machine.equipmentName.toLowerCase().includes(normalized)
  );
}

function taskMatchesSearch(task: PMTask, search: string): boolean {
  if (!search) return true;
  const normalized = search.toLowerCase();
  return (
    task.idMachine.toLowerCase().includes(normalized) ||
    task.equipmentName.toLowerCase().includes(normalized)
  );
}

export default function PmDashboardPage() {
  const currentDate = useMemo(() => new Date(), []);
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const currentWeek = getCurrentIsoWeek(currentDate);

  const [activeWorkshop, setActiveWorkshop] = useState<PMWorkshopType>('foaming');
  const [workshopData, setWorkshopData] = useState<Record<PMWorkshopType, PMWorkshopData | null>>({
    foaming: null,
    insole: null,
  });
  const [importingState, setImportingState] = useState<Record<PMWorkshopType, boolean>>({
    foaming: false,
    insole: false,
  });
  const [previewData, setPreviewData] = useState<{ workshop: PMWorkshopType; preview: PMImportPreview } | null>(null);
  const [selectedTask, setSelectedTask] = useState<PMTask | null>(null);
  const [checklistDraft, setChecklistDraft] = useState<PMChecklistItem[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [savingChecklist, setSavingChecklist] = useState(false);
  
  const [filters, setFilters] = useState<Record<PMWorkshopType, WorkshopFilterState>>({
    foaming: { search: '', monthFilter: 'all', selectedWeek: currentWeek },
    insole: { search: '', monthFilter: 'all', selectedWeek: currentWeek },
  });

  const foamingInputRef = useRef<HTMLInputElement>(null);
  const insoleInputRef = useRef<HTMLInputElement>(null);

  const setWorkshopFilter = (workshop: PMWorkshopType, patch: Partial<WorkshopFilterState>) => {
    setFilters((prev) => ({
      ...prev,
      [workshop]: {
        ...prev[workshop],
        ...patch,
      },
    }));
  };

  const handleImport = async (
    workshop: PMWorkshopType,
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingState((prev) => ({ ...prev, [workshop]: true }));
    try {
      const preview = await parsePmScheduleFile(file, workshop);
      setPreviewData({ workshop, preview });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed.';
      toast.error(message);
    } finally {
      setImportingState((prev) => ({ ...prev, [workshop]: false }));
      event.target.value = '';
    }
  };

  const confirmImport = async () => {
    if (!previewData || !previewData.preview.isValid || !previewData.preview.data) return;
    const { workshop, preview: { data } } = previewData;

    try {
      const { data: existingRows, error: existingRowsError } = await supabase
        .from('pm_schedules')
        .select('id_machine, checklist_template')
        .eq('workshop', workshop);

      if (existingRowsError) throw existingRowsError;

      const existingChecklistMap = new Map<string, PMChecklistItem[]>();
      (existingRows || []).forEach((row) => {
        existingChecklistMap.set(String(row.id_machine), normalizePmChecklistTemplate(row.checklist_template));
      });
      const machinesWithChecklist = data.machines.map((machine) => ({
        ...machine,
        checklistTemplate: existingChecklistMap.get(machine.idMachine) || machine.checklistTemplate || createDefaultPmChecklist(),
      }));
      const tasksWithChecklist = data.tasks.map((task) => ({
        ...task,
        checklistTemplate: existingChecklistMap.get(task.idMachine) || task.checklistTemplate || createDefaultPmChecklist(),
      }));
      const enrichedData = {
        ...data,
        machines: machinesWithChecklist,
        tasks: tasksWithChecklist,
      };

      // 1. Delete old schedules for this workshop to save space/avoid duplication
      await supabase
        .from('pm_schedules')
        .delete()
        .eq('workshop', workshop);

      // 2. Insert new ones
      const toInsert = machinesWithChecklist.map(m => ({
        id_machine: m.idMachine,
        equipment_name: m.equipmentName,
        workshop: workshop,
        planned_weeks: m.plannedWeeks,
        year: data.year,
        checklist_template: existingChecklistMap.get(m.idMachine) || m.checklistTemplate || createDefaultPmChecklist()
      }));

      const { error } = await supabase
        .from('pm_schedules')
        .insert(toInsert);

      if (error) throw error;

      setWorkshopData((prev) => ({ ...prev, [workshop]: enrichedData }));
      toast.success(
        `${WORKSHOP_META[workshop].label}: synced ${data.machines.length} machines to cloud. Data replaced successfully.`
      );
    } catch (err: unknown) {
      console.error(err);
      toast.error("Failed to sync data to Supabase");
    } finally {
      setPreviewData(null);
    }
  };

  useEffect(() => {
    const loadStoredSchedules = async () => {
      const { data, error } = await supabase.from('pm_schedules').select('*');
      if (error || !data) return;

      const workshopMap: Record<PMWorkshopType, PMWorkshopData> = {
        foaming: { 
          workshop: 'foaming', 
          workshopLabel: WORKSHOP_META.foaming.label, 
          machines: [], 
          tasks: [], 
          year: currentYear, 
          importedAt: new Date().toISOString(), 
          sourceFileName: 'Cloud Storage' 
        },
        insole: { 
          workshop: 'insole', 
          workshopLabel: WORKSHOP_META.insole.label, 
          machines: [], 
          tasks: [], 
          year: currentYear, 
          importedAt: new Date().toISOString(), 
          sourceFileName: 'Cloud Storage' 
        },
      };

      data.forEach(row => {
        const ws = row.workshop as PMWorkshopType;
        const machine: PMMachineSchedule = {
          idMachine: row.id_machine,
          equipmentName: row.equipment_name,
          plannedWeeks: row.planned_weeks,
          checklistTemplate: normalizePmChecklistTemplate(row.checklist_template),
        };
        workshopMap[ws].machines.push(machine);
        
        // Regenerate tasks for each machine
        machine.plannedWeeks.forEach((w: number) => {
          const month = getMonthFromIsoWeek(row.year, w);
          workshopMap[ws].tasks.push({
            workshop: ws,
            idMachine: machine.idMachine,
            equipmentName: machine.equipmentName,
            week: w,
            month: month,
            monthLabel: toMonthLabel(month),
            status: 'Planned',
            checklistTemplate: machine.checklistTemplate,
          });
        });
      });

      setWorkshopData(workshopMap);
    };
    loadStoredSchedules();
  }, [currentYear]);

  useEffect(() => {
    if (!selectedTask) {
      setChecklistDraft([]);
      setNewChecklistText('');
      return;
    }

    setChecklistDraft(normalizePmChecklistTemplate(selectedTask.checklistTemplate));
    setNewChecklistText('');
  }, [selectedTask]);

  const handleChecklistToggle = (itemId: string, checked: boolean) => {
    setChecklistDraft((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, checked } : item))
    );
  };

  const handleChecklistTextChange = (itemId: string, text: string) => {
    setChecklistDraft((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, text } : item))
    );
  };

  const handleAddChecklistItem = () => {
    const text = newChecklistText.trim();
    if (!text) return;

    setChecklistDraft((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        text,
        checked: true,
      },
    ]);
    setNewChecklistText('');
  };

  const handleRemoveChecklistItem = (itemId: string) => {
    setChecklistDraft((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleSaveChecklist = async () => {
    if (!selectedTask) return;

    const normalizedChecklist = normalizePmChecklistTemplate(checklistDraft);
    setSavingChecklist(true);
    try {
      const { error } = await supabase
        .from('pm_schedules')
        .update({ checklist_template: normalizedChecklist })
        .eq('workshop', selectedTask.workshop)
        .eq('year', workshopData[selectedTask.workshop]?.year ?? currentYear)
        .eq('id_machine', selectedTask.idMachine);

      if (error) throw error;

      setWorkshopData((prev) => {
        const workshopEntry = prev[selectedTask.workshop];
        if (!workshopEntry) return prev;

        return {
          ...prev,
          [selectedTask.workshop]: {
            ...workshopEntry,
            machines: workshopEntry.machines.map((machine) =>
              machine.idMachine === selectedTask.idMachine
                ? { ...machine, checklistTemplate: normalizedChecklist }
                : machine
            ),
            tasks: workshopEntry.tasks.map((task) =>
              task.idMachine === selectedTask.idMachine
                ? { ...task, checklistTemplate: normalizedChecklist }
                : task
            ),
          },
        };
      });

      setSelectedTask((prev) => (prev ? { ...prev, checklistTemplate: normalizedChecklist } : prev));
      toast.success('Checklist saved');
    } catch (error) {
      console.error('Failed to save checklist', error);
      toast.error('Failed to save checklist');
    } finally {
      setSavingChecklist(false);
    }
  };

  const openFileDialog = (workshop: PMWorkshopType): void => {
    if (workshop === 'foaming') {
      foamingInputRef.current?.click();
      return;
    }
    insoleInputRef.current?.click();
  };

  const renderWorkshopDashboard = (workshop: PMWorkshopType) => {
    const data = workshopData[workshop];
    const filter = filters[workshop];
    const isImporting = importingState[workshop];
    const workshopTheme =
      workshop === 'foaming'
        ? {
            shell: 'from-cyan-50 via-sky-50 to-blue-50',
            border: 'border-cyan-200/70',
            button: 'from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700',
            soft: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-100',
          }
        : {
            shell: 'from-amber-50 via-orange-50 to-rose-50',
            border: 'border-orange-200/70',
            button: 'from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700',
            soft: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
          };

    if (!data) {
      return (
        <Card className={cn('border-dashed border-2 bg-gradient-to-br shadow-sm', workshopTheme.shell, workshopTheme.border)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5 text-indigo-600" />
              Import PM Schedule
            </CardTitle>
            <CardDescription>
              {WORKSHOP_META[workshop].sheetHint}. Import xlsx file to build PM dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => openFileDialog(workshop)}
              disabled={isImporting}
              className={cn('bg-gradient-to-r text-white shadow-lg', workshopTheme.button)}
            >
              {isImporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import Schedule
            </Button>
          </CardContent>
        </Card>
      );
    }

    const weekMonthMap = Array.from({ length: PM_TOTAL_WEEKS }, (_, index) =>
      getMonthFromIsoWeek(data.year, index + 1)
    );

    const monthFilterNumber = filter.monthFilter === 'all' ? null : Number(filter.monthFilter);
    const visibleMachines = data.machines.filter((machine) => {
      if (!machineMatchesSearch(machine, filter.search)) return false;
      if (!monthFilterNumber) return true;
      return machine.plannedWeeks.some((week) => weekMonthMap[week - 1] === monthFilterNumber);
    });

    const visibleTasks = data.tasks.filter((task) => {
      if (!taskMatchesSearch(task, filter.search)) return false;
      if (!monthFilterNumber) return true;
      return task.month === monthFilterNumber;
    });

    const todoTasks = visibleTasks.filter((task) => task.week === filter.selectedWeek);
    const monthlyFocus = monthFilterNumber ?? currentMonth;
    const machinesInFocusedMonth = data.machines.filter((machine) =>
      machine.plannedWeeks.some((week) => weekMonthMap[week - 1] === monthlyFocus)
    );
    const monthCoverage =
      data.machines.length === 0 ? 0 : Math.round((machinesInFocusedMonth.length / data.machines.length) * 100);
    const currentWeekTasks = data.tasks.filter((task) => task.week === currentWeek);

    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
            <CardHeader className="pb-2">
              <CardDescription className="text-cyan-50">Total Machines</CardDescription>
              <CardTitle className="text-3xl text-white">{data.machines.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 text-white shadow-lg shadow-fuchsia-500/20">
            <CardHeader className="pb-2">
              <CardDescription className="text-fuchsia-50">Total PM Plans</CardDescription>
              <CardTitle className="text-3xl text-white">{data.tasks.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20">
            <CardHeader className="pb-2">
              <CardDescription className="text-emerald-50">PM In Current Week</CardDescription>
              <CardTitle className="text-3xl text-white">{currentWeekTasks.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-amber-400 via-orange-400 to-rose-500 text-white shadow-lg shadow-orange-500/20">
            <CardHeader className="pb-2">
              <CardDescription className="text-orange-50">Monthly Coverage ({monthlyFocus})</CardDescription>
              <CardTitle className="text-3xl text-white">{monthCoverage}%</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-2 rounded-full bg-white/30">
                <div
                  className="h-2 rounded-full bg-linear-to-r from-white via-amber-50 to-yellow-100 transition-all"
                  style={{ width: `${monthCoverage}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className={cn('border-0 bg-gradient-to-r shadow-md', workshopTheme.shell)}>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={filter.selectedWeek === currentWeek ? 'default' : 'outline'}
                  onClick={() => setWorkshopFilter(workshop, { selectedWeek: currentWeek })}
                  className={filter.selectedWeek === currentWeek ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'border-white/80 bg-white/80 text-slate-700 hover:bg-white'}
                >
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Current Week
                </Button>
                <Button
                  size="sm"
                  variant={filter.monthFilter === String(currentMonth) ? 'default' : 'outline'}
                  onClick={() => setWorkshopFilter(workshop, { monthFilter: String(currentMonth) })}
                  className={filter.monthFilter === String(currentMonth) ? 'bg-fuchsia-600 text-white shadow-md shadow-fuchsia-500/20' : 'border-white/80 bg-white/80 text-slate-700 hover:bg-white'}
                >
                  <CalendarCheck2 className="mr-2 h-4 w-4" />
                  Current Month
                </Button>
                <Button
                  size="sm"
                  variant={filter.monthFilter === 'all' && !filter.search ? 'default' : 'outline'}
                  onClick={() =>
                    setWorkshopFilter(workshop, {
                      search: '',
                      monthFilter: 'all',
                      selectedWeek: currentWeek,
                    })
                  }
                  className={filter.monthFilter === 'all' && !filter.search ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20' : 'border-white/80 bg-white/80 text-slate-700 hover:bg-white'}
                >
                  Reset Filter
                </Button>
              </div>
              <Button onClick={() => openFileDialog(workshop)} disabled={isImporting} variant="outline" className="border-white/80 bg-white/80 text-slate-700 hover:bg-white">
                {isImporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Import Schedule
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_160px_140px]">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={filter.search}
                  onChange={(event) => setWorkshopFilter(workshop, { search: event.target.value })}
                  className="border-white/80 bg-white/90 pl-9 shadow-sm"
                  placeholder="Search ID machine or equipment name"
                />
              </div>
              <Select
                value={String(filter.selectedWeek)}
                onValueChange={(value) => setWorkshopFilter(workshop, { selectedWeek: Number(value) })}
              >
                <SelectTrigger className="w-full border-white/80 bg-white/90 shadow-sm">
                  <SelectValue placeholder="Week" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: PM_TOTAL_WEEKS }, (_, index) => index + 1).map((week) => (
                    <SelectItem key={week} value={String(week)}>
                      Week {week}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filter.monthFilter}
                onValueChange={(value) => setWorkshopFilter(workshop, { monthFilter: value })}
              >
                <SelectTrigger className="w-full border-white/80 bg-white/90 shadow-sm">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All months</SelectItem>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                    <SelectItem key={month} value={String(month)}>
                      Month {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 bg-white/95 shadow-md shadow-slate-200/70">
          <CardHeader className="border-b border-cyan-100 bg-gradient-to-r from-cyan-50 via-sky-50 to-blue-50 pb-2">
            <CardTitle className="text-lg text-slate-900">Machine Card View</CardTitle>
            <CardDescription>
              Quick card view by machine. Highlight supports weekly operation follow-up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleMachines.length === 0 && (
              <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
                No machine found for current filters.
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleMachines.slice(0, 12).map((machine) => {
                const nextPmWeek =
                  machine.plannedWeeks.find(
                    (week) => getWeekTiming(week, data.year, currentYear, currentWeek) !== 'past'
                  ) ?? null;
                const monthPmCount = machine.plannedWeeks.filter(
                  (week) => weekMonthMap[week - 1] === monthlyFocus
                ).length;
                const dueCurrentWeek = machine.plannedWeeks.includes(currentWeek);
                const cardTone = dueCurrentWeek
                  ? {
                      shell: 'border-amber-300 bg-gradient-to-br from-amber-100 via-orange-50 to-rose-100',
                      glow: 'from-amber-300/35 to-rose-300/15',
                      badge: 'bg-amber-500 text-white hover:bg-amber-500',
                      chip: 'bg-amber-100 text-amber-800',
                      label: 'Due This Week',
                    }
                  : monthPmCount > 0
                    ? {
                        shell: 'border-cyan-200 bg-gradient-to-br from-cyan-100 via-sky-50 to-indigo-100',
                        glow: 'from-cyan-300/30 to-indigo-300/15',
                        badge: 'bg-cyan-600 text-white hover:bg-cyan-600',
                        chip: 'bg-cyan-100 text-cyan-800',
                        label: 'Planned This Month',
                      }
                    : {
                        shell: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-100',
                        glow: 'from-emerald-300/20 to-sky-300/15',
                        badge: 'bg-emerald-600 text-white hover:bg-emerald-600',
                        chip: 'bg-slate-100 text-slate-700',
                        label: 'No PM This Month',
                      };

                return (
                  <div
                    key={`card-${machine.idMachine}-${machine.equipmentName}`}
                    className={cn(
                      'relative overflow-hidden rounded-2xl border p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
                      cardTone.shell
                    )}
                  >
                    <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-tr opacity-90', cardTone.glow)} />
                    <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/30 blur-2xl" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-white/60 via-white/10 to-transparent" />

                    <div className="relative flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{machine.idMachine}</p>
                        <p className="text-xs text-slate-600 line-clamp-2">{machine.equipmentName}</p>
                      </div>
                      <Badge className={cn('border-0 shadow-sm', cardTone.badge)}>{machine.plannedWeeks.length} PM</Badge>
                    </div>

                    <div className="relative mt-3 space-y-2 text-xs text-slate-700">
                      <div className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide shadow-sm">
                        <span className={cn('rounded-full px-2 py-0.5', cardTone.chip)}>{cardTone.label}</span>
                      </div>
                      <p>
                        Next PM: <span className="font-semibold text-slate-800">{nextPmWeek ? `Week ${nextPmWeek}` : 'N/A'}</span>
                      </p>
                      <p>
                        PM in month {monthlyFocus}:{' '}
                        <span className="font-semibold text-slate-800">{monthPmCount}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {visibleMachines.length > 12 && (
              <p className="text-xs text-slate-500">Showing first 12 machines. Use search/filter to narrow down.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-4">
          <Card className="xl:col-span-3 overflow-hidden border-0 bg-white/95 shadow-md shadow-slate-200/70">
            <CardHeader className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-fuchsia-50 to-pink-50 pb-2">
              <CardTitle className="text-lg text-slate-900">Detailed PM Board (Week 1-52)</CardTitle>
              <CardDescription>
                Green: past week planned. Orange: current/upcoming planned. Current week is highlighted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="w-full rounded-xl border border-slate-200 shadow-inner">
                <div className="min-w-[2300px]">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="h-10 w-36 border-r bg-slate-900 px-3 text-left font-semibold text-white">
                          ID Machine
                        </th>
                        <th className="h-10 w-72 border-r bg-slate-900 px-3 text-left font-semibold text-white">
                          Equipment Name
                        </th>
                        {Array.from({ length: PM_TOTAL_WEEKS }, (_, index) => index + 1).map((week) => (
                          <th
                            key={week}
                            className={cn(
                              'h-10 min-w-9 border-r text-center text-[10px] font-semibold',
                              week === currentWeek
                                ? 'bg-amber-400 text-slate-900'
                                : 'bg-slate-800 text-slate-200'
                            )}
                          >
                            {week}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleMachines.length === 0 && (
                        <tr>
                          <td
                            colSpan={PM_TOTAL_WEEKS + 2}
                            className="h-20 text-center text-sm text-slate-500"
                          >
                            No machine found for current filters.
                          </td>
                        </tr>
                      )}
                      {visibleMachines.map((machine) => {
                        const plannedWeekSet = new Set(machine.plannedWeeks);
                        const dueCurrentWeek = plannedWeekSet.has(currentWeek);
                        return (
                          <tr
                            key={`${machine.idMachine}-${machine.equipmentName}`}
                            className={cn('border-b', dueCurrentWeek && 'bg-amber-50/70')}
                          >
                            <td className="h-8 border-r px-3 font-medium text-slate-900">{machine.idMachine}</td>
                            <td className="h-8 border-r px-3 text-slate-700">{machine.equipmentName}</td>
                            {Array.from({ length: PM_TOTAL_WEEKS }, (_, index) => index + 1).map((week) => {
                              const planned = plannedWeekSet.has(week);
                              const timing = getWeekTiming(week, data.year, currentYear, currentWeek);
                              return (
                                <td
                                  key={`${machine.idMachine}-${week}`}
                                  onClick={() => {
                                    if (planned) {
                                      const task = data.tasks.find(t => t.idMachine === machine.idMachine && t.week === week);
                                      if (task) setSelectedTask(task);
                                    }
                                  }}
                                  className={cn(
                                    'h-8 min-w-9 border-r text-center text-[10px] font-semibold transition-all',
                                    week === currentWeek && 'outline outline-1 outline-indigo-300',
                                    !planned && 'bg-slate-50 text-slate-300',
                                    planned && timing === 'past' && 'bg-emerald-500/90 text-white hover:bg-emerald-600 cursor-pointer shadow-sm',
                                    planned && timing !== 'past' && 'bg-amber-400/90 text-slate-900 hover:bg-amber-500 cursor-pointer shadow-sm'
                                  )}
                                >
                                  {planned ? 'PM' : ''}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-0 bg-white/95 shadow-md shadow-slate-200/70">
            <CardHeader className="border-b border-amber-100 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 pb-2">
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-indigo-600" />
                  Weekly To-do
                </span>
                <Badge variant="outline" className="border-amber-200 bg-white/80 text-amber-800">Week {filter.selectedWeek}</Badge>
              </CardTitle>
              <CardDescription>{todoTasks.length} machine(s) need PM in selected week.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                {todoTasks.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
                    No PM task in this week with current filters.
                  </div>
                )}
                {todoTasks.map((task) => (
                  <div
                    key={`${task.idMachine}-${task.week}`}
                    onClick={() => setSelectedTask(task)}
                    className={cn(
                      'rounded-lg border p-3 cursor-pointer hover:shadow-md transition-all',
                      task.week === currentWeek
                        ? 'border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100'
                        : 'border-slate-200 bg-gradient-to-r from-white to-sky-50/40 hover:from-slate-50 hover:to-sky-50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{task.idMachine}</p>
                        <p className="text-xs text-slate-600">{task.equipmentName}</p>
                      </div>
                       <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 shadow-sm">
                        {task.monthLabel}
                      </Badge>
                    </div>
                    <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Status: {task.status}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-xs text-slate-500">
          Source file: <span className="font-medium text-slate-700">{data.sourceFileName}</span> | Plan year:{' '}
          <span className="font-medium text-slate-700">{data.year}</span> | Imported at:{' '}
          <span className="font-medium text-slate-700">
            {new Date(data.importedAt).toLocaleString()}
          </span>
        </div>
      </div>
    );
  };

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <div className="overflow-hidden rounded-2xl border-0 bg-gradient-to-r from-slate-900 via-indigo-900 to-sky-900 p-6 shadow-xl shadow-indigo-900/20">
          <h1 className="text-2xl font-bold tracking-tight text-white">PM Schedule Dashboard</h1>
          <p className="mt-1 text-sm text-slate-200">
            Monitor periodic maintenance plans for Foaming and Insole. Import each workshop schedule to view 52-week
            PM timeline and weekly to-do list.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge className="border-0 bg-cyan-400/20 text-cyan-100 hover:bg-cyan-400/20">
              <Building2 className="mr-1 h-3 w-3" /> 2 Workshops
            </Badge>
            <Badge className="border-0 bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/20">
              <CalendarClock className="mr-1 h-3 w-3" /> 52 Weeks Tracking
            </Badge>
            <Badge className="border-0 bg-amber-300/25 text-amber-100 hover:bg-amber-300/25">
              Current week: {currentWeek}
            </Badge>
          </div>
        </div>

        <input
          ref={foamingInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(event) => handleImport('foaming', event)}
        />
        <input
          ref={insoleInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(event) => handleImport('insole', event)}
        />

        <Tabs
          value={activeWorkshop}
          onValueChange={(value) => setActiveWorkshop(value as PMWorkshopType)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-gradient-to-r from-slate-100 via-cyan-50 to-orange-50 p-1">
            {WORKSHOPS.map((workshop) => (
              <TabsTrigger key={workshop} value={workshop} className="rounded-xl font-semibold data-[state=active]:bg-white data-[state=active]:shadow-md">
                {WORKSHOP_META[workshop].label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="foaming">{renderWorkshopDashboard('foaming')}</TabsContent>
          <TabsContent value="insole">{renderWorkshopDashboard('insole')}</TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!previewData} onOpenChange={(open) => !open && setPreviewData(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border-0 bg-white">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Import Preview Report</DialogTitle>
            <DialogDescription className="text-slate-600">
              We analyzed the uploaded file. Please review the validation results below before confirming.
            </DialogDescription>
          </DialogHeader>

          {previewData && (
            <div className="flex-1 overflow-auto space-y-4 py-4">
              {previewData.preview.isValid ? (
                <Alert className="bg-emerald-50 border-emerald-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <AlertTitle className="text-emerald-800 font-semibold">Ready to Import</AlertTitle>
                  <AlertDescription className="text-emerald-700">
                    No critical errors found. This will import {previewData.preview.data?.machines.length} machines and {previewData.preview.data?.tasks.length} tasks.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Import Blocked</AlertTitle>
                  <AlertDescription>
                    Please fix the critical errors in your Excel file and try again.
                  </AlertDescription>
                </Alert>
              )}

              {previewData.preview.errors.length > 0 && (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead className="w-24">Type</TableHead>
                        <TableHead className="w-48">Machine ID</TableHead>
                        <TableHead>Issue Message & Suggestion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.preview.errors.map((err, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-slate-500">{err.row}</TableCell>
                          <TableCell>
                            {err.type === 'error' ? (
                              <Badge variant="destructive" className="font-semibold uppercase text-[10px]">Error</Badge>
                            ) : (
                              <Badge variant="outline" className="border-amber-300 text-amber-700 font-semibold bg-amber-50 uppercase text-[10px]">Warn</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{err.idMachine || 'N/A'}</TableCell>
                          <TableCell>
                            <p className="text-sm font-medium text-slate-900">{err.message}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{err.suggestion}</p>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-2 border-t pt-4">
            <Button variant="outline" onClick={() => setPreviewData(null)}>Cancel</Button>
            <Button 
              disabled={!previewData?.preview.isValid} 
              onClick={confirmImport}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Confirm Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <SheetContent className="w-full overflow-y-auto border-0 bg-gradient-to-b from-white via-slate-50 to-indigo-50 sm:max-w-md">
          {selectedTask && (
            <>
              <SheetHeader className="border-b border-indigo-100 pb-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 mb-2">
                  <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">{selectedTask.workshop}</Badge>
                  <ChevronRight className="h-3 w-3" />
                  <span>Week {selectedTask.week}</span>
                </div>
                <SheetTitle className="text-xl">{selectedTask.idMachine}</SheetTitle>
                <SheetDescription>{selectedTask.equipmentName}</SheetDescription>
              </SheetHeader>

              <div className="py-6 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <ClipboardList className="h-4 w-4 text-slate-500" />
                    Standard PM Checklist
                  </h3>
                  <div className="space-y-3">
                    {checklistDraft.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          'flex items-start gap-3 rounded-xl border p-3 transition-colors',
                          item.checked ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-100 bg-slate-50'
                        )}
                      >
                        <Checkbox
                          checked={item.checked}
                          onCheckedChange={(checked) => handleChecklistToggle(item.id, checked === true)}
                          className="mt-1"
                        />
                        <Input
                          value={item.text}
                          onChange={(event) => handleChecklistTextChange(item.id, event.target.value)}
                          className="h-9 flex-1 border-white/80 bg-white/90 text-sm"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-slate-400 hover:bg-white/80 hover:text-red-500"
                          onClick={() => handleRemoveChecklistItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 space-y-3 rounded-xl border border-dashed border-indigo-200 bg-white/70 p-3">
                    <div className="flex gap-2">
                      <Input
                        value={newChecklistText}
                        onChange={(event) => setNewChecklistText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAddChecklistItem();
                          }
                        }}
                        placeholder="Them hang muc checklist neu can"
                        className="border-white/80 bg-white"
                      />
                      <Button type="button" onClick={handleAddChecklistItem} className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="mr-2 h-4 w-4" />
                        Add
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSaveChecklist}
                      disabled={savingChecklist}
                      className="border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    >
                      {savingChecklist ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save Checklist
                    </Button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <StickyNote className="h-4 w-4 text-slate-500" />
                    Notes & Remarks
                  </h3>
                  <textarea 
                    className="flex min-h-[100px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                    placeholder="Enter any issues found during maintenance..."
                  />
                </div>

                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Camera className="h-4 w-4 text-slate-500" />
                    Photos Attachments
                  </h3>
                  <div className="flex gap-2">
                    <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 cursor-pointer transition-colors">
                      <Camera className="h-5 w-5" />
                    </div>
                  </div>
                </div>

              </div>

              <div className="pt-4 border-t sticky bottom-0 bg-white space-y-3 pb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 flex items-center gap-1"><Clock className="h-4 w-4" /> Time spent:</span>
                  <div className="flex items-center gap-2 bg-slate-100 rounded-md p-1 px-3">
                    <span className="font-mono text-slate-700">45 mins</span>
                  </div>
                </div>
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mark as Completed
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </ProtectedLayout>
  );
}
