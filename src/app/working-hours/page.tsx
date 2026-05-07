'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { 
  FileUp, 
  Trash2, 
  Users, 
  Search, 
  AlertCircle
} from 'lucide-react';

import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SupabaseService } from '@/services/supabaseService';
import { WorkingHours } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { getWorkingHoursDateKey, normalizeWorkingHoursDateKey, formatWorkingHoursDate } from '@/lib/workingHours';

export default function WorkingHoursPage() {
  const { user } = useAuth();
  const isAdmin = user && (user.role === 'ADMIN' || user.role === 'POWER_USER');
  const initialWorkingHoursRef = useRef(SupabaseService.peekWorkingHours());
  
  const [data, setData] = useState<WorkingHours[]>(() => initialWorkingHoursRef.current || []);
  const [loading, setLoading] = useState(() => !initialWorkingHoursRef.current);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateKey, setSelectedDateKey] = useState('');

  const fetchData = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const result = await SupabaseService.getWorkingHours({ forceRefresh: true });
      setData(result);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load working hours");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(!initialWorkingHoursRef.current);
  }, [fetchData]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const targetSheetNames = wb.SheetNames.filter(n => {
            const upName = n.toUpperCase();
            return months.some(m => upName.includes(m));
        });

        if (targetSheetNames.length === 0) {
            toast.error("Không tìm thấy sheet dữ liệu (JAN, FEB, ...) trong file");
            setImporting(false);
            return;
        }

        // Use a map to aggregate data by MSNV
        const employeeMap = new Map<string, Omit<WorkingHours, 'id' | 'createdAt'>>();

        for (const sheetName of targetSheetNames) {
            const ws = wb.Sheets[sheetName];
            const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as (string | number | undefined)[][];
            
            // Find Header Row (scan first 15 rows)
            let headerRowIdx = -1;
            for (let i = 0; i < Math.min(rawData.length, 15); i++) {
                const row = rawData[i];
                if (row && row.some(c => {
                    const str = String(c).toUpperCase();
                    return str.includes('MSNV') || str.includes('HỌ TÊN') || str.includes('EID');
                })) {
                    headerRowIdx = i;
                    break;
                }
            }

            if (headerRowIdx === -1) continue;

            const headers = rawData[headerRowIdx];
            let msnvIdx = -1;
            let nameIdx = -1;
            let deptIdx = -1;
            let teamIdx = -1;

            headers.forEach((h, idx) => {
                const s = String(h || '').toUpperCase();
                if (s.includes('MSNV') || s.includes('EID')) msnvIdx = idx;
                if (s.includes('HỌ TÊN') || s.includes('FULL NAME')) nameIdx = idx;
                if (s.includes('PHÒNG BAN') || s.includes('DEPARTMENT')) deptIdx = idx;
                if (s.includes('BỘ PHẬN') || s.includes('TEAM')) teamIdx = idx;
            });

            if (msnvIdx === -1 || nameIdx === -1) continue;

            // Determine the boundary for date columns (everything after the last metadata column)
            const lastMetaIdx = Math.max(msnvIdx, nameIdx, deptIdx, teamIdx);

            // Map day columns
            const dateHeaders: Array<{ key: string, index: number }> = [];
            headers.forEach((h, idx) => {
                if (idx <= lastMetaIdx || !h) return;
                
                let label = String(h);
                if (typeof h === 'number' && h >= 40000 && h < 60000) {
                    try {
                        const dateObj = XLSX.SSF.parse_date_code(h);
                        label = getWorkingHoursDateKey(new Date(dateObj.y, dateObj.m - 1, dateObj.d));
                    } catch {}
                }

                const normalizedKey = normalizeWorkingHoursDateKey(label);
                // Only add if it looks like a date (contains month names or matches date patterns)
                if (normalizedKey && normalizedKey !== 'undefined' && normalizedKey.trim() !== '' && (typeof h === 'number' || months.some(m => normalizedKey.toUpperCase().includes(m)))) {
                    dateHeaders.push({ key: normalizedKey, index: idx });
                }
            });

            // Process rows in this sheet
            for (let i = headerRowIdx + 1; i < rawData.length; i++) {
                const row = rawData[i];
                if (!row) continue;
                
                const msnvRaw = String(row[msnvIdx] || '').trim();
                // Skip header-like rows or empty MSNV
                if (!msnvRaw || msnvRaw.toUpperCase() === 'MSNV' || msnvRaw.toUpperCase() === 'EID') continue;

                const fullName = String(row[nameIdx] || '').trim();
                if (!fullName) continue;

                // Combine Dept and Team
                const dPart = deptIdx !== -1 ? String(row[deptIdx] || '').trim() : '';
                const tPart = teamIdx !== -1 ? String(row[teamIdx] || '').trim() : '';
                const deptValues = [];
                if (dPart) deptValues.push(dPart);
                if (tPart && tPart !== dPart) deptValues.push(tPart);
                const finalDept = deptValues.join(' - ') || 'N/A';

                if (!employeeMap.has(msnvRaw)) {
                    employeeMap.set(msnvRaw, {
                        msnv: msnvRaw,
                        fullName,
                        department: finalDept,
                        days: { _index: i } as Record<string, string | number>
                    });
                }

                const empData = employeeMap.get(msnvRaw)!;
                // Merge days from this sheet
                dateHeaders.forEach(dh => {
                    const value = row[dh.index];
                    if (value !== undefined && value !== null && value !== '') {
                        empData.days[dh.key] = value;
                    }
                });
            }
        }

        const rowsToInsert = Array.from(employeeMap.values());

        if (rowsToInsert.length === 0) {
            toast.error("Không tìm thấy dữ liệu hợp lệ trong các sheet đã chọn");
            setImporting(false);
            return;
        }

        await SupabaseService.bulkCreateWorkingHours(rowsToInsert);
        toast.success(`Đã import thành công ${rowsToInsert.length} nhân viên từ ${targetSheetNames.length} sheet`);
        fetchData();
      } catch (error) {
        console.error(error);
        toast.error("Lỗi khi đọc hoặc lưu file");
      } finally {
        setImporting(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
        const idxA = (a.days as { _index?: number })._index ?? 0;
        const idxB = (b.days as { _index?: number })._index ?? 0;
        return idxA - idxB;
    });
  }, [data]);

  const filteredData = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return sortedData.filter(item => 
      (item.fullName || '').toLowerCase().includes(query) ||
      (item.msnv || '').toLowerCase().includes(query) ||
      (item.department || '').toLowerCase().includes(query)
    );
  }, [sortedData, searchQuery]);

  const dynamicHeaders = useMemo(
    () => {
        if (data.length === 0) return [];
        // Get all unique date keys across all items
        const allKeys = new Set<string>();
        data.forEach(item => {
            Object.keys(item.days).forEach(k => {
                if (!k.startsWith('_')) allKeys.add(k);
            });
        });
        return Array.from(allKeys).sort();
    },
    [data]
  );

  useEffect(() => {
    if (dynamicHeaders.length === 0) {
      if (selectedDateKey !== '') {
        setSelectedDateKey('');
      }
      return;
    }

    if (!selectedDateKey || !dynamicHeaders.includes(selectedDateKey)) {
      setSelectedDateKey(dynamicHeaders[dynamicHeaders.length - 1]);
    }
  }, [dynamicHeaders, selectedDateKey]);

  const getCellColor = (value: string | number | undefined | null) => {
    if (value === undefined || value === null) return 'bg-white';
    const v = String(value).toUpperCase().trim();
    if (!v || v === 'UNDEFINED' || v === 'NULL') return 'bg-white';
    
    // 1. Day off / Holiday - RED
    if (['OFF', 'SUN', 'PH', 'L'].includes(v)) return 'bg-[#ef4444] text-white font-black';
    
    // 2. Annual Leave - ORANGE
    if (v === 'AL') return 'bg-[#f97316] text-white font-black';
    
    // 3. Normal working / HC - GREEN
    if (v.startsWith('HC')) return 'bg-[#22c55e] text-white font-black';
    
    // 4. Shift C1 - BLUE
    if (v.startsWith('C1')) return 'bg-[#3b82f6] text-white font-black';
    
    // 5. Shift C2 - YELLOW
    if (v.startsWith('C2')) return 'bg-[#eab308] text-black font-black';
    
    // 6. Shift C3 - PINK/PURPLE
    if (v.startsWith('C3')) return 'bg-[#d946ef] text-white font-black';

    // 7. Shift A - SKY BLUE
    if (v === 'A') return 'bg-[#0ea5e9] text-white font-black';
    
    // 8. Shift B - VIOLET
    if (v === 'B') return 'bg-[#8b5cf6] text-white font-black';
    
    // 9. OT Hours (numeric values > 0) - DARK SLATE
    if (!isNaN(Number(v)) && Number(v) > 0) return 'bg-[#0f172a] text-white font-black ring-2 ring-inset ring-white/20';
    
    // Default for any other defined value
    return 'bg-[#94a3b8] text-white font-black';
  };

  const mobileDateKey = selectedDateKey || dynamicHeaders[dynamicHeaders.length - 1] || '';

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 rounded-xl border-0 bg-linear-to-r from-slate-900 via-blue-900 to-indigo-900 p-4 shadow-lg shadow-blue-900/20 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white">Working Hours (OT)</h1>
          </div>
          {isAdmin && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button 
                variant="outline" 
                className="relative border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white h-9 px-4 text-xs font-bold"
                disabled={importing}
              >
                <FileUp className="mr-2 h-4 w-4" /> 
                {importing ? 'Importing...' : 'Import Excel'}
                <input 
                    type="file" 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    accept=".xlsx, .xls"
                    onChange={handleFileUpload}
                    disabled={importing}
                />
              </Button>
              <Button 
                variant="destructive" 
                className="bg-red-500/80 hover:bg-red-600 h-9 px-4 text-xs font-bold"
                onClick={async () => {
                    if (confirm("Are you sure you want to delete all records?")) {
                        await SupabaseService.deleteAllWorkingHours();
                        toast.success("All records deleted");
                        fetchData();
                    }
                }}
              >
                  <Trash2 className="mr-2 h-4 w-4" /> Clear All
              </Button>
            </div>
          )}
        </header>

        <Card className="border-0 bg-white shadow-xl shadow-slate-200/70 overflow-hidden rounded-xl">
            <CardHeader className="bg-slate-50/90 border-b py-1.5 px-3">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 shrink-0">
                        <Users className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">Danh sách nhân viên</span>
                    </div>
                    <div className="relative flex-1 max-w-[300px]">
                        <Search className="absolute left-2.5 top-1.5 h-3 w-3 text-slate-400" />
                        <Input 
                            placeholder="Tìm kiếm..." 
                            className="pl-8 h-6 text-[11px] border-slate-200 rounded bg-white/50 focus:bg-white"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-80 text-slate-400 space-y-4">
                        <div className="h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <p className="font-bold text-lg">Đang tải dữ liệu...</p>
                    </div>
                ) : filteredData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-80 text-slate-400 space-y-4">
                        <AlertCircle className="h-16 w-16 opacity-10" />
                        <p className="text-lg font-medium">Không tìm thấy dữ liệu. {isAdmin && "Vui lòng import file Excel."}</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-4 p-4 md:hidden">
                            {mobileDateKey ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                      Selected Day
                                    </Label>
                                    <select
                                      value={mobileDateKey}
                                      onChange={(e) => setSelectedDateKey(e.target.value)}
                                      className="mt-3 flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                                    >
                                      {dynamicHeaders.map((header) => (
                                        <option key={header} value={header}>
                                          {formatWorkingHoursDate(header)}
                                        </option>
                                      ))}
                                    </select>
                                </div>
                            ) : null}

                            <div className="space-y-3">
                                {filteredData.map((item) => (
                                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-base font-black text-slate-900">{item.fullName}</p>
                                                <p className="truncate text-sm text-slate-500">MSNV {item.msnv}</p>
                                            </div>
                                            <div
                                              className={cn(
                                                "min-w-[88px] rounded-xl px-3 py-2 text-center text-sm font-black",
                                                getCellColor(item.days[mobileDateKey] ?? '')
                                              )}
                                            >
                                              {item.days[mobileDateKey] || '--'}
                                            </div>
                                        </div>

                                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                            <div>
                                                <p className="text-xs uppercase tracking-wide text-slate-500">Department</p>
                                                <p className="font-medium text-slate-900">{item.department}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs uppercase tracking-wide text-slate-500">Date</p>
                                                <p className="font-medium text-slate-900">{formatWorkingHoursDate(mobileDateKey) || '--'}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="hidden md:block">
                        <div className="max-h-[600px] overflow-auto border rounded-md relative bg-white">
                            <table className="w-full border-separate border-spacing-0 text-sm">
                                <thead className="relative z-30">
                                    <tr className="hover:bg-transparent">
                                        <th className="min-w-[80px] font-black border-b border-r bg-slate-200 text-slate-900 text-[11px] uppercase p-2 sticky top-0 z-40 shadow-[0_1px_0_0_rgba(0,0,0,0.1)] text-left">MSNV</th>
                                        <th className="min-w-[200px] font-black border-b border-r bg-slate-200 text-slate-900 text-[11px] uppercase p-2 sticky top-0 z-40 shadow-[0_1px_0_0_rgba(0,0,0,0.1)] text-left">HỌ TÊN</th>
                                        <th className="min-w-[150px] font-black border-b border-r bg-slate-200 text-slate-900 text-[11px] uppercase p-2 sticky top-0 z-40 shadow-[0_1px_0_0_rgba(0,0,0,0.1)] text-left">BỘ PHẬN</th>
                                        {dynamicHeaders.map(h => (
                                            <th key={h} className="min-w-[60px] text-center font-black px-1 whitespace-nowrap border-b border-r bg-blue-100 text-blue-900 text-[11px] sticky top-0 z-40 shadow-[0_1px_0_0_rgba(0,0,0,0.1)]">
                                                {formatWorkingHoursDate(h)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredData.map((item) => (
                                        <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="font-bold text-[11px] border-r border-b p-2 text-slate-700 bg-slate-50/50 group-hover:bg-white">{item.msnv}</td>
                                            <td className="font-black text-[12px] border-r border-b p-2 text-slate-900 whitespace-nowrap bg-white">{item.fullName}</td>
                                            <td className="font-bold text-[11px] text-slate-600 border-r border-b p-2">{item.department}</td>
                                            {dynamicHeaders.map(h => (
                                                <td 
                                                    key={h} 
                                                    className={cn(
                                                        "text-center text-[11px] px-1 border-r border-b min-w-[60px] h-9 transition-all group-hover:scale-[1.02]",
                                                        getCellColor(item.days[h])
                                                    )}
                                                >
                                                    {item.days[h] || ''}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
      </div>
    </ProtectedLayout>
  );
}
