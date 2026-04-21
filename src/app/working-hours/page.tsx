'use client';

import { useState, useEffect } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { SupabaseService } from '@/services/supabaseService';
import { WorkingHours } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { getWorkingHoursDateKey, normalizeWorkingHoursDateKey } from '@/lib/workingHours';

export default function WorkingHoursPage() {
  const { user } = useAuth();
  const isAdmin = user && (user.role === 'ADMIN' || user.role === 'POWER_USER');
  
  const [data, setData] = useState<WorkingHours[]>(() => SupabaseService.peekWorkingHours() || []);
  const [loading, setLoading] = useState(() => !SupabaseService.peekWorkingHours());
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateKey, setSelectedDateKey] = useState('');

  useEffect(() => {
    fetchData(data.length === 0);
  }, []);

  const fetchData = async (showLoader = false) => {
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
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        
        // Find APR-OT sheet
        const sheetName = wb.SheetNames.find(n => n.includes('APR-OT'));
        if (!sheetName) {
            toast.error("Sheet 'APR-OT' not found in file");
            setImporting(false);
            return;
        }

        const ws = wb.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as (string | number | undefined)[][];
        
        // Find Header Row (scan first 10 rows)
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
            const row = rawData[i];
            if (row && row.some(c => String(c).includes('MSNV') || String(c).includes('HỌ TÊN'))) {
                headerRowIdx = i;
                break;
            }
        }

        if (headerRowIdx === -1) {
            toast.error("Could not find header row (MSNV or HỌ TÊN) in the first 10 rows");
            setImporting(false);
            return;
        }

        const headers = rawData[headerRowIdx];
        const msnvIdx = headers.findIndex(h => String(h).includes('MSNV'));
        const nameIdx = headers.findIndex(h => String(h).includes('HỌ TÊN'));
        const deptIdx = headers.findIndex(h => String(h).includes('BỘ PHẬN') || String(h).includes('TEAM'));

        if (msnvIdx === -1 || nameIdx === -1 || deptIdx === -1) {
            toast.error("Required columns (MSNV, HỌ TÊN, BỘ PHẬN/TEAM) not found");
            setImporting(false);
            return;
        }

        // Map day columns (everything after the fixed columns)
        const dateHeaders: Array<{ key: string, index: number }> = [];
        headers.forEach((h, idx) => {
            if (idx <= Math.max(msnvIdx, nameIdx, deptIdx)) return;
            
            let label = String(h);
            if (typeof h === 'number' && h >= 40000 && h < 50000) {
                try {
                    const dateObj = XLSX.SSF.parse_date_code(h);
                    label = getWorkingHoursDateKey(new Date(dateObj.y, dateObj.m - 1, dateObj.d));
                } catch (e) {}
            }

            const normalizedKey = normalizeWorkingHoursDateKey(label);
            if (normalizedKey && normalizedKey !== 'undefined' && normalizedKey.trim() !== '') {
                dateHeaders.push({ key: normalizedKey, index: idx });
            }
        });

        const rowsToInsert: Omit<WorkingHours, 'id' | 'createdAt'>[] = [];

        for (let i = headerRowIdx + 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || !row[nameIdx] || String(row[nameIdx]).trim() === '') continue;

            const days: Record<string, string | number> = {};
            dateHeaders.forEach(dh => {
                days[dh.key] = row[dh.index] ?? '';
            });

            rowsToInsert.push({
                msnv: String(row[msnvIdx] || '').trim(),
                fullName: String(row[nameIdx] || '').trim(),
                department: String(row[deptIdx] || '').trim(),
                days
            });
        }

        if (rowsToInsert.length === 0) {
            toast.error("No valid rows found to import");
            setImporting(false);
            return;
        }

        await SupabaseService.bulkCreateWorkingHours(rowsToInsert);
        toast.success(`Successfully imported ${rowsToInsert.length} records`);
        fetchData();
      } catch (error) {
        console.error(error);
        toast.error("Failed to parse or save file");
      } finally {
        setImporting(false);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const filteredData = data.filter(item => 
    item.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.msnv.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const dynamicHeaders = data.length > 0 ? Object.keys(data[0].days) : [];

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

  const getCellColor = (value: string | number) => {
    const v = String(value).toUpperCase().trim();
    if (!v) return 'bg-white';
    
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
        <header className="flex flex-col gap-4 rounded-2xl border-0 bg-linear-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 shadow-xl shadow-blue-900/20 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Working Hours (OT)</h1>
          </div>
          {isAdmin && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button 
                variant="outline" 
                className="relative border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white h-11 px-6 font-bold"
                disabled={importing}
              >
                <FileUp className="mr-2 h-5 w-5" /> 
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
                className="bg-red-500/80 hover:bg-red-600 h-11 px-6 font-bold"
                onClick={async () => {
                    if (confirm("Are you sure you want to delete all records?")) {
                        await SupabaseService.deleteAllWorkingHours();
                        toast.success("All records deleted");
                        fetchData();
                    }
                }}
              >
                  <Trash2 className="mr-2 h-5 w-5" /> Clear All
              </Button>
            </div>
          )}
        </header>

        <Card className="border-0 bg-white shadow-2xl shadow-slate-200/70 overflow-hidden rounded-2xl">
            <CardHeader className="bg-slate-50/80 border-b p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <CardTitle className="text-xl font-black flex items-center gap-2 text-slate-800">
                        <Users className="h-6 w-6 text-blue-600" /> DANH SÁCH NHÂN VIÊN
                    </CardTitle>
                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                        <Input 
                            placeholder="Tìm kiếm tên, MSNV..." 
                            className="pl-10 h-11 text-base border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
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
                                          {header}
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
                                                <p className="font-medium text-slate-900">{mobileDateKey || '--'}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="hidden md:block">
                    <ScrollArea className="w-full">
                        <div className="max-h-[700px]">
                            <Table className="border-separate border-spacing-0">
                                <TableHeader className="bg-slate-100 sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead className="min-w-[100px] font-black border-b border-r bg-slate-200 text-slate-900 text-sm uppercase p-4">MSNV</TableHead>
                                        <TableHead className="min-w-[250px] font-black border-b border-r bg-slate-200 text-slate-900 text-sm uppercase p-4">HỌ TÊN</TableHead>
                                        <TableHead className="min-w-[180px] font-black border-b border-r bg-slate-200 text-slate-900 text-sm uppercase p-4">BỘ PHẬN</TableHead>
                                        {dynamicHeaders.map(h => (
                                            <TableHead key={h} className="min-w-[70px] text-center font-black px-2 whitespace-nowrap border-b border-r bg-blue-100 text-blue-900 text-sm">
                                                {h}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredData.map((item) => (
                                        <TableRow key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <TableCell className="font-bold text-sm border-r border-b p-3 text-slate-700 bg-slate-50/50 group-hover:bg-white">{item.msnv}</TableCell>
                                            <TableCell className="font-black text-base border-r border-b p-3 text-slate-900 whitespace-nowrap bg-white">{item.fullName}</TableCell>
                                            <TableCell className="font-bold text-sm text-slate-600 border-r border-b p-3">{item.department}</TableCell>
                                            {dynamicHeaders.map(h => (
                                                <TableCell 
                                                    key={h} 
                                                    className={cn(
                                                        "text-center text-sm px-2 border-r border-b min-w-[70px] h-12 transition-all group-hover:scale-[1.02]",
                                                        getCellColor(item.days[h])
                                                    )}
                                                >
                                                    {item.days[h] || ''}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
      </div>
    </ProtectedLayout>
  );
}
