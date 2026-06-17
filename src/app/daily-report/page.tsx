'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { 
  Clock, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  AlertCircle, 
  Calendar, 
  CheckCircle2, 
  FileText, 
  X,
  Sparkles,
  Wrench,
  Settings
} from 'lucide-react';

import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { SupabaseService } from '@/services/supabaseService';
import { WorkReport } from '@/types';
import { cn } from '@/lib/utils';

export default function DailyReportPage() {
  const { user } = useAuth();
  
  // State for report date
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // Report records
  const [myReports, setMyReports] = useState<WorkReport[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('10:00');
  const [activity, setActivity] = useState('');
  const [workType, setWorkType] = useState<'MACHINE_REPAIR' | 'OTHER'>('OTHER');
  const [selectedMachine, setSelectedMachine] = useState<string>('');
  
  // Edit mode state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editActivity, setEditActivity] = useState('');
  const [editWorkType, setEditWorkType] = useState<'MACHINE_REPAIR' | 'OTHER'>('OTHER');
  const [editMachineName, setEditMachineName] = useState<string>('');

  // Machine options
  const [machineOptions, setMachineOptions] = useState<string[]>([]);

  // Machine adding states
  const [newMachineDialogOpen, setNewMachineDialogOpen] = useState(false);
  const [newMachineName, setNewMachineName] = useState('');
  const [addingMachine, setAddingMachine] = useState(false);
  const [customMachines, setCustomMachines] = useState<string[]>([]);
  const [editingMachineName, setEditingMachineName] = useState<string | null>(null);
  const [editMachineInput, setEditMachineInput] = useState('');

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  // Fetch machine options from database parts on mount
  const fetchMachines = useCallback(async () => {
    try {
      const [parts, customMachinesData] = await Promise.all([
        SupabaseService.getParts(),
        SupabaseService.getCustomMachines()
      ]);
      setCustomMachines(customMachinesData);
      const partsMachines = parts.flatMap((p) => p.machines || []).filter(Boolean);
      const BASE_MACHINES = [
        'Máy Dán',
        'Máy Cắt Đứng',
        'Máy Tách',
        'Máy Chặt Tự Động Luxin',
        'Máy Chặt Manual',
        'Máy In Logo',
        'Logo In-House',
        'Máy Thành Hình',
        'Máy Đổ',
        'Khuôn Đổ',
        'Chiller',
        'Bồn Liệu'
      ];
      const combined = Array.from(
        new Set([...BASE_MACHINES, ...partsMachines, ...customMachinesData])
      ).sort((a, b) => a.localeCompare(b));
      setMachineOptions(combined);
    } catch (error) {
      console.error('Error fetching machines:', error);
      const BASE_MACHINES = [
        'Máy Dán',
        'Máy Cắt Đứng',
        'Máy Tách',
        'Máy Chặt Tự Động Luxin',
        'Máy Chặt Manual',
        'Máy In Logo',
        'Logo In-House',
        'Máy Thành Hình',
        'Máy Đổ',
        'Khuôn Đổ',
        'Chiller',
        'Bồn Liệu'
      ];
      setMachineOptions(BASE_MACHINES);
    }
  }, []);

  useEffect(() => {
    void fetchMachines();
  }, [fetchMachines]);

  const handleAddNewMachine = async () => {
    const name = newMachineName.trim();
    if (!name) return;
    
    setAddingMachine(true);
    try {
      await SupabaseService.createCustomMachine(name);
      toast.success(`Đã thêm máy "${name}" thành công!`);
      await fetchMachines();
      setSelectedMachine(name);
      setNewMachineDialogOpen(false);
      setNewMachineName('');
    } catch (error) {
      console.error('Error adding machine:', error);
      toast.error('Lỗi khi thêm máy mới');
    } finally {
      setAddingMachine(false);
    }
  };

  const handleDeleteMachine = async (name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa máy "${name}" không?`)) return;
    try {
      await SupabaseService.deleteCustomMachine(name);
      toast.success(`Đã xóa máy "${name}" thành công!`);
      await fetchMachines();
      if (selectedMachine === name) {
        setSelectedMachine('');
      }
    } catch (error) {
      console.error('Error deleting machine:', error);
      toast.error('Lỗi khi xóa máy');
    }
  };

  const handleSaveEditMachine = async (oldName: string) => {
    const newName = editMachineInput.trim();
    if (!newName || newName === oldName) {
      setEditingMachineName(null);
      return;
    }
    try {
      await SupabaseService.updateCustomMachine(oldName, newName);
      toast.success(`Đã cập nhật máy thành "${newName}" thành công!`);
      await fetchMachines();
      if (selectedMachine === oldName) {
        setSelectedMachine(newName);
      }
      setEditingMachineName(null);
    } catch (error) {
      console.error('Error updating machine:', error);
      toast.error('Lỗi khi cập nhật máy');
    }
  };

  // Fetch my reports for the selected date
  const fetchMyReports = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await SupabaseService.getWorkReports(selectedDate, user.id);
      setMyReports(data);
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi tải báo cáo công việc cá nhân');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, user]);

  useEffect(() => {
    void fetchMyReports();
  }, [fetchMyReports]);

  // Helper to validate and check overlap
  const checkOverlap = (
    start: string, 
    end: string, 
    ignoreId: string | null = null,
    reportList: WorkReport[] = myReports
  ): boolean => {
    return reportList.some(r => {
      if (ignoreId && r.id === ignoreId) return false;
      // Overlap condition: startA < endB && endA > startB
      return (start < r.endTime && end > r.startTime);
    });
  };

  // Submit new report interval
  const handleAddReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (!startTime || !endTime || !activity.trim()) {
      toast.warning('Vui lòng điền đầy đủ thông tin khoảng thời gian và công việc');
      return;
    }

    if (startTime >= endTime) {
      toast.error('Thời gian bắt đầu phải trước thời gian kết thúc');
      return;
    }

    if (workType === 'MACHINE_REPAIR' && !selectedMachine) {
      toast.warning('Vui lòng chọn máy sửa chữa');
      return;
    }

    // Check overlap
    if (checkOverlap(startTime, endTime)) {
      toast.error('Khoảng thời gian này bị trùng lặp với báo cáo khác trong ngày!');
      return;
    }

    try {
      await SupabaseService.createWorkReport({
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        reportDate: selectedDate,
        startTime,
        endTime,
        activity: activity.trim(),
        workType,
        machineName: workType === 'MACHINE_REPAIR' ? selectedMachine : null
      });

      toast.success('Đã thêm báo cáo công việc mới thành công');
      setActivity('');
      setSelectedMachine('');
      // Automatically default next start time to current end time
      setStartTime(endTime);
      
      // Calculate a standard +2h interval if possible
      const [h, m] = endTime.split(':').map(Number);
      const nextH = Math.min(h + 2, 23);
      const nextEnd = `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      setEndTime(nextEnd);

      void fetchMyReports();
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi lưu báo cáo công việc');
    }
  };

  // Handle Edit Start
  const startEditing = (report: WorkReport) => {
    setEditingId(report.id);
    setEditStartTime(report.startTime);
    setEditEndTime(report.endTime);
    setEditActivity(report.activity);
    setEditWorkType(report.workType || 'OTHER');
    setEditMachineName(report.machineName || '');
  };

  // Handle Edit Save
  const saveEdit = async (id: string) => {
    if (!editStartTime || !editEndTime || !editActivity.trim()) {
      toast.warning('Các trường dữ liệu không được để trống');
      return;
    }

    if (editStartTime >= editEndTime) {
      toast.error('Thời gian bắt đầu phải trước thời gian kết thúc');
      return;
    }

    if (editWorkType === 'MACHINE_REPAIR' && !editMachineName) {
      toast.warning('Vui lòng chọn máy sửa chữa');
      return;
    }

    if (checkOverlap(editStartTime, editEndTime, id)) {
      toast.error('Khoảng thời gian chỉnh sửa bị trùng lặp với báo cáo khác!');
      return;
    }

    try {
      await SupabaseService.updateWorkReport(id, {
        startTime: editStartTime,
        endTime: editEndTime,
        activity: editActivity.trim(),
        workType: editWorkType,
        machineName: editWorkType === 'MACHINE_REPAIR' ? editMachineName : null
      });

      toast.success('Đã cập nhật báo cáo thành công');
      setEditingId(null);
      void fetchMyReports();
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi cập nhật báo cáo');
    }
  };

  // Handle Delete Click
  const handleDeleteClick = (id: string) => {
    setReportToDelete(id);
    setDeleteDialogOpen(true);
  };

  // Handle Confirm Delete
  const handleConfirmDelete = async () => {
    if (!reportToDelete) return;
    try {
      await SupabaseService.deleteWorkReport(reportToDelete);
      toast.success('Đã xóa khoảng thời gian thành công');
      void fetchMyReports();
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi xóa báo cáo');
    } finally {
      setDeleteDialogOpen(false);
      setReportToDelete(null);
    }
  };

  // Calculate duration in hours
  const calculateDuration = (start: string, end: string): number => {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const diffMin = (endH * 60 + endM) - (startH * 60 + startM);
    return Math.round((diffMin / 60) * 10) / 10;
  };

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
                  <FileText className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Khai báo</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">
                Khai Báo Công Việc Hàng Ngày
              </h1>
              <p className="text-sm text-slate-300">
                Ghi nhận các khoảng thời gian sửa chữa máy móc hoặc các công việc khác trong ngày làm việc của bạn.
              </p>
            </div>
            
            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2 backdrop-blur-md">
              <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
              <span className="text-xs font-bold text-slate-200">
                Lưu trữ 3 tháng & Xóa cuốn chiếu
              </span>
            </div>
          </div>
        </header>

        {/* Content grid */}
        <div className="grid gap-6 md:grid-cols-[1fr_360px]">
          
          {/* Left Column: Log list */}
          <div className="space-y-6">
            
            {/* Selector & Action bar */}
            <Card className="border-0 bg-white shadow-md shadow-slate-200/50">
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-indigo-600" />
                  <Label htmlFor="report-date" className="text-sm font-bold text-slate-700">
                    Chọn ngày báo cáo:
                  </Label>
                  <Input
                    id="report-date"
                    type="date"
                    className="w-[160px] h-9 text-xs font-semibold border-slate-200 rounded-lg shadow-inner bg-slate-50 focus:bg-white"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
                
                <div className="text-xs font-medium text-slate-500 bg-slate-50 border px-3 py-1.5 rounded-lg">
                  Đã báo cáo ngày này:{' '}
                  <span className="font-bold text-indigo-600">
                    {myReports.reduce((acc, curr) => acc + calculateDuration(curr.startTime, curr.endTime), 0)} giờ
                  </span>{' '}
                  ({myReports.length} lượt)
                </div>
              </CardContent>
            </Card>

            {/* Entry List */}
            <Card className="border-0 bg-white shadow-lg shadow-slate-200/50">
              <CardHeader className="border-b border-slate-50 py-4 px-6">
                <CardTitle className="text-base font-black text-slate-800">
                  Danh sách khoảng thời gian đã khai báo
                </CardTitle>
                <CardDescription>
                  Bảng sắp xếp theo thứ tự thời gian trong ngày
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-4">
                    <div className="h-8 w-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs font-bold">Đang tải danh sách báo cáo...</p>
                  </div>
                ) : myReports.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 space-y-3">
                    <div className="rounded-full bg-slate-50 p-4 border">
                      <Clock className="h-8 w-8 text-slate-300" />
                    </div>
                    <p className="text-sm font-medium">Chưa có công việc nào được khai báo cho ngày này.</p>
                    <p className="text-xs text-slate-400 max-w-[280px]">
                      Vui lòng sử dụng biểu mẫu bên phải để khai báo thời gian làm việc của bạn.
                    </p>
                  </div>
                ) : (
                  <div className="relative border-l-2 border-slate-100 pl-4 ml-3 space-y-6">
                    {myReports.map((report, idx) => {
                      const isEditing = editingId === report.id;
                      const duration = calculateDuration(report.startTime, report.endTime);
                      
                      return (
                        <div key={report.id} className="relative group">
                          {/* Circle Bullet on timeline */}
                          <div className="absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-indigo-200 bg-white text-[9px] font-bold text-indigo-600 group-hover:border-indigo-500 transition-colors shadow-sm">
                            {idx + 1}
                          </div>
                          
                          <div className={cn(
                            "rounded-xl border p-4 shadow-sm transition-all duration-200 bg-white",
                            isEditing ? "border-indigo-400 ring-2 ring-indigo-50/50 bg-indigo-50/10" : "border-slate-100 hover:border-slate-200 hover:shadow-md"
                          )}>
                            {isEditing ? (
                              /* EDIT MODE INLINE */
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-500">Giờ Bắt Đầu</Label>
                                    <Input
                                      type="time"
                                      value={editStartTime}
                                      onChange={(e) => setEditStartTime(e.target.value)}
                                      className="h-8 text-xs font-semibold"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-500">Giờ Kết Thúc</Label>
                                    <Input
                                      type="time"
                                      value={editEndTime}
                                      onChange={(e) => setEditEndTime(e.target.value)}
                                      className="h-8 text-xs font-semibold"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-500">Loại công việc</Label>
                                    <select
                                      value={editWorkType}
                                      onChange={(e) => setEditWorkType(e.target.value as 'MACHINE_REPAIR' | 'OTHER')}
                                      className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold shadow-xs focus-visible:outline-none"
                                    >
                                      <option value="OTHER">Công việc khác</option>
                                      <option value="MACHINE_REPAIR">Sửa chữa máy</option>
                                    </select>
                                  </div>
                                  {editWorkType === 'MACHINE_REPAIR' && (
                                    <div className="space-y-1">
                                      <Label className="text-[10px] uppercase font-bold text-slate-500">Chọn máy</Label>
                                      <select
                                        value={editMachineName}
                                        onChange={(e) => setEditMachineName(e.target.value)}
                                        className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold shadow-xs focus-visible:outline-none"
                                      >
                                        <option value="">-- Chọn máy --</option>
                                        {machineOptions.map(m => (
                                          <option key={m} value={m}>{m}</option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase font-bold text-slate-500">Nội dung công việc</Label>
                                  <Input
                                    value={editActivity}
                                    onChange={(e) => setEditActivity(e.target.value)}
                                    placeholder="Bạn đã làm gì?"
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div className="flex justify-end gap-2 pt-2 border-t">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => setEditingId(null)}
                                  >
                                    Hủy
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                                    onClick={() => saveEdit(report.id)}
                                  >
                                    <Save className="h-3 w-3 mr-1" />
                                    Lưu lại
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              /* READ MODE */
                              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2 py-1 text-xs font-black text-indigo-700 border border-indigo-100">
                                      <Clock className="mr-1 h-3 w-3" />
                                      {report.startTime} - {report.endTime}
                                    </span>
                                    <span className="text-[11px] font-bold text-slate-400">
                                      ({duration} giờ)
                                    </span>
                                    {report.workType === 'MACHINE_REPAIR' && report.machineName && (
                                      <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 border border-rose-100">
                                        <Wrench className="h-3 w-3 text-rose-500" />
                                        Sửa máy: {report.machineName}
                                      </span>
                                    )}
                                    {report.workType === 'OTHER' && (
                                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold text-slate-500 border border-slate-200">
                                        <Settings className="h-3 w-3 text-slate-400" />
                                        Khác
                                      </span>
                                    )}
                                  </div>
                                  
                                  <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                                    {report.activity}
                                  </p>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 self-end sm:self-start">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 p-0"
                                    onClick={() => startEditing(report)}
                                    title="Chỉnh sửa"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600 p-0"
                                    onClick={() => handleDeleteClick(report.id)}
                                    title="Xóa"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>

          {/* Right Column: Form to ADD */}
          <div className="space-y-6">
            <Card className="border-0 bg-white shadow-xl shadow-slate-200/50 sticky top-6 overflow-hidden rounded-2xl">
              {/* Decorative Gradient Header */}
              <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
              
              <CardHeader className="py-5 px-6">
                <CardTitle className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Plus className="h-4.5 w-4.5 text-indigo-600" />
                  Khai báo thời gian
                </CardTitle>
                <CardDescription>
                  Thêm khoảng thời gian làm việc mới vào ngày {selectedDate}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="p-6 pt-0">
                <form onSubmit={handleAddReport} className="space-y-4">
                  
                  <div className="space-y-2">
                    <Label htmlFor="start-time" className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Giờ bắt đầu:
                    </Label>
                    <Input
                      id="start-time"
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="h-10 text-sm font-semibold border-slate-200 rounded-lg shadow-inner bg-slate-50 focus:bg-white focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="end-time" className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Giờ kết thúc:
                    </Label>
                    <Input
                      id="end-time"
                      type="time"
                      required
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="h-10 text-sm font-semibold border-slate-200 rounded-lg shadow-inner bg-slate-50 focus:bg-white focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="work-type" className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Loại công việc:
                    </Label>
                    <select
                      id="work-type"
                      value={workType}
                      onChange={(e) => setWorkType(e.target.value as 'MACHINE_REPAIR' | 'OTHER')}
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                    >
                      <option value="OTHER">Công việc khác</option>
                      <option value="MACHINE_REPAIR">Sửa chữa máy</option>
                    </select>
                  </div>

                  {workType === 'MACHINE_REPAIR' && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="machine-select" className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                          Chọn máy sửa chữa:
                        </Label>
                        {user?.role === 'ADMIN' && (
                          <button
                            type="button"
                            onClick={() => setNewMachineDialogOpen(true)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                          >
                            + Thêm máy mới
                          </button>
                        )}
                      </div>
                      <select
                        id="machine-select"
                        required
                        value={selectedMachine}
                        onChange={(e) => setSelectedMachine(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                      >
                        <option value="">-- Chọn máy --</option>
                        {machineOptions.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="activity-desc" className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Nội dung công việc:
                    </Label>
                    <textarea
                      id="activity-desc"
                      required
                      value={activity}
                      onChange={(e) => setActivity(e.target.value)}
                      placeholder="Ví dụ: Kiểm tra thông số máy dán, sửa van hơi máy dập..."
                      rows={4}
                      className="w-full text-sm p-3 border border-slate-200 rounded-lg shadow-inner bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-10 bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-800 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-indigo-600/10 rounded-lg flex items-center justify-center gap-2 group transition-all"
                  >
                    <Plus className="h-4 w-4" />
                    Thêm khoảng thời gian
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6 border-0 shadow-2xl bg-white animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500 border border-rose-100">
              <Trash2 className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center text-lg font-black text-slate-800">
              Xác nhận xóa báo cáo
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-slate-500 font-medium leading-relaxed">
              Bạn có chắc chắn muốn xóa khoảng thời gian làm việc này? Hành động này không thể hoàn tác và dữ liệu sẽ bị xóa vĩnh viễn.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="w-full sm:w-auto h-9 text-xs font-bold border-slate-200 rounded-xl hover:bg-slate-50"
            >
              Hủy bỏ
            </Button>
            <Button
              onClick={handleConfirmDelete}
              className="w-full sm:w-auto h-9 text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-500/10"
            >
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Machines Dialog */}
      <Dialog open={newMachineDialogOpen} onOpenChange={setNewMachineDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6 border-0 shadow-2xl bg-white animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 border border-indigo-100">
              <Wrench className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center text-lg font-black text-slate-800">
              Quản lý danh sách máy móc
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-slate-500 font-medium leading-relaxed">
              Thêm, sửa, hoặc xóa các loại máy móc tùy chỉnh trên toàn hệ thống.
            </DialogDescription>
          </DialogHeader>

          {/* Add Section */}
          {user?.role === 'ADMIN' && (
            <div className="space-y-2 pt-2 border-b pb-4">
              <Label htmlFor="new-machine-name" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Thêm máy mới:
              </Label>
              <div className="flex gap-2">
                <Input
                  id="new-machine-name"
                  placeholder="Ví dụ: Máy ép nhiệt 3D..."
                  value={newMachineName}
                  onChange={(e) => setNewMachineName(e.target.value)}
                  className="h-9 text-xs font-semibold border-slate-200"
                />
                <Button
                  onClick={handleAddNewMachine}
                  disabled={addingMachine || !newMachineName.trim()}
                  className="h-9 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                >
                  {addingMachine ? 'Đang thêm...' : 'Thêm'}
                </Button>
              </div>
            </div>
          )}

          {/* List Section */}
          <div className="space-y-2 py-4">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Danh sách máy tùy chỉnh ({customMachines.length}):
            </Label>
            {customMachines.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2 text-center">Chưa có máy tùy chỉnh nào được tạo.</p>
            ) : (
              <ScrollArea className="max-h-[200px] border rounded-lg p-2 bg-slate-50/50">
                <div className="space-y-2">
                  {customMachines.map((m) => {
                    const isEditing = editingMachineName === m;
                    return (
                      <div key={m} className="flex items-center justify-between gap-2 p-2 bg-white rounded-md border text-xs font-semibold text-slate-700 shadow-xs">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 w-full">
                            <Input
                              value={editMachineInput}
                              onChange={(e) => setEditMachineInput(e.target.value)}
                              className="h-7 text-xs font-semibold py-0.5 px-2 flex-1"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                              onClick={() => handleSaveEditMachine(m)}
                              title="Lưu"
                            >
                              <Save className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-slate-400 hover:bg-slate-50"
                              onClick={() => setEditingMachineName(null)}
                              title="Hủy"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="truncate flex-1">{m}</span>
                            {user?.role === 'ADMIN' && (
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-slate-800 hover:bg-slate-100"
                                  onClick={() => {
                                    setEditingMachineName(m);
                                    setEditMachineInput(m);
                                  }}
                                  title="Chỉnh sửa"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                                  onClick={() => handleDeleteMachine(m)}
                                  title="Xóa"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setNewMachineDialogOpen(false);
                setNewMachineName('');
                setEditingMachineName(null);
              }}
              className="w-full sm:w-auto h-9 text-xs font-bold border-slate-200 rounded-xl hover:bg-slate-50"
            >
              Đóng lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedLayout>
  );
}
