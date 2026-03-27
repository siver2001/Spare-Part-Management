import * as XLSX from 'xlsx';
import { PMChecklistItem, PMImportError, PMImportPreview, PMMachineSchedule, PMTask, PMWorkshopData, PMWorkshopType } from '@/types/pm';

export const PM_TOTAL_WEEKS = 52;
const DEFAULT_PM_CHECKLIST_TEXTS = [
  'Ve sinh khu vuc, lau chui may',
  'Tra dau mo, boi tron truc / xich',
  'Kiem tra day dien, cong tac, sensor',
  'Kiem tra he thong khi nen, ong phu',
  'Chay thu may, kiem tra tieng dong la',
];

interface WorkshopParseConfig {
  workshopLabel: string;
  sheetName: string;
  startRowIndex: number;
  equipmentNameColIndex: number;
  idMachineColIndex: number;
  weekStartColIndex: number;
  weekEndColIndex: number;
  isPmMarker: (cell: XLSX.CellObject | undefined) => boolean;
}

const INSOLE_PM_MARKER_CODEPOINT = 0xe258;

const WORKSHOP_PARSE_CONFIG: Record<PMWorkshopType, WorkshopParseConfig> = {
  foaming: {
    workshopLabel: 'Xuong Foaming',
    sheetName: 'Master Plan(Monitoring)',
    startRowIndex: 4,
    equipmentNameColIndex: 1,
    idMachineColIndex: 2,
    weekStartColIndex: 5,
    weekEndColIndex: 56,
    isPmMarker: (cell) => {
      if (!cell) return false;

      const rawValue = cell.v;
      if (rawValue === false) return true;

      if (typeof rawValue === 'string') {
        const normalized = rawValue.trim().toLowerCase();
        if (!normalized) return false;
        if (normalized === 'false') return true;
        if (normalized === 'true') return false;
        return normalized.length > 0;
      }

      // Foaming can also mark PM by non-empty symbol or colored cells.
      if (rawValue !== undefined && rawValue !== null) return true;

      const style = cell.s as
        | {
            patternType?: string;
            fgColor?: unknown;
            bgColor?: unknown;
          }
        | undefined;

      if (!style) return false;
      return Boolean(
        (style.patternType && style.patternType.toLowerCase() !== 'none') ||
          style.fgColor ||
          style.bgColor
      );
    },
  },
  insole: {
    workshopLabel: 'Xuong Insole',
    sheetName: 'Table 1',
    startRowIndex: 8,
    equipmentNameColIndex: 1,
    idMachineColIndex: 2,
    weekStartColIndex: 5,
    weekEndColIndex: 56,
    isPmMarker: (cell) => {
      if (!cell || cell.v === undefined || cell.v === null) return false;
      const text = String(cell.v).trim();
      if (!text) return false;
      return [...text].some((char) => char.codePointAt(0) === INSOLE_PM_MARKER_CODEPOINT);
    },
  },
};

function getCell(sheet: XLSX.WorkSheet, rowIndex: number, colIndex: number): XLSX.CellObject | undefined {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  return sheet[address] as XLSX.CellObject | undefined;
}

function getCellText(sheet: XLSX.WorkSheet, rowIndex: number, colIndex: number): string {
  const cell = getCell(sheet, rowIndex, colIndex);
  if (!cell || cell.v === undefined || cell.v === null) return '';
  return String(cell.v).trim();
}

function extractYearFromFileName(fileName: string): number | null {
  const matched = fileName.match(/\b(20\d{2})\b/);
  if (!matched) return null;
  return Number(matched[1]);
}

function getIsoWeek1StartUTC(year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Start = new Date(jan4);
  week1Start.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  return week1Start;
}

export function getMonthFromIsoWeek(year: number, isoWeek: number): number {
  const weekStart = getIsoWeek1StartUTC(year);
  weekStart.setUTCDate(weekStart.getUTCDate() + (isoWeek - 1) * 7);
  return weekStart.getUTCMonth() + 1;
}

export function toMonthLabel(month: number): string {
  return `Thang ${month}`;
}

export function getCurrentIsoWeek(date: Date = new Date()): number {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return Math.min(Math.max(weekNumber, 1), PM_TOTAL_WEEKS);
}

export function getIsoWeekYear(date: Date = new Date()): number {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  return utcDate.getUTCFullYear();
}

export function createDefaultPmChecklist(): PMChecklistItem[] {
  return DEFAULT_PM_CHECKLIST_TEXTS.map((text, index) => ({
    id: `standard-${index + 1}`,
    text,
    checked: true,
  }));
}

export function normalizePmChecklistTemplate(value: unknown): PMChecklistItem[] {
  if (!Array.isArray(value)) {
    return createDefaultPmChecklist();
  }

  const normalized = value
    .map((item, index) => {
      if (typeof item === 'string') {
        const text = item.trim();
        if (!text) return null;
        return {
          id: `legacy-${index + 1}`,
          text,
          checked: true,
        } satisfies PMChecklistItem;
      }

      if (!item || typeof item !== 'object') return null;

      const candidate = item as Partial<PMChecklistItem>;
      const text = String(candidate.text || '').trim();
      if (!text) return null;

      return {
        id: String(candidate.id || `item-${index + 1}`),
        text,
        checked: candidate.checked !== false,
      } satisfies PMChecklistItem;
    })
    .filter((item): item is PMChecklistItem => Boolean(item));

  return normalized.length > 0 ? normalized : createDefaultPmChecklist();
}

export async function parsePmScheduleFile(file: File, workshop: PMWorkshopType): Promise<PMImportPreview> {
  const parseConfig = WORKSHOP_PARSE_CONFIG[workshop];
  const year = extractYearFromFileName(file.name) ?? new Date().getFullYear();

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    raw: true,
    cellStyles: true,
    cellNF: true,
  });

  const worksheet = workbook.Sheets[parseConfig.sheetName];
  if (!worksheet) {
    throw new Error(`Khong tim thay sheet "${parseConfig.sheetName}" trong file ${file.name}.`);
  }

  if (!worksheet['!ref']) {
    throw new Error(`Sheet "${parseConfig.sheetName}" khong co du lieu.`);
  }

  const sheetRange = XLSX.utils.decode_range(worksheet['!ref']);
  const machines: PMMachineSchedule[] = [];
  const tasks: PMTask[] = [];
  const errors: PMImportError[] = [];

  const seenIds = new Set<string>();

  for (let rowIndex = parseConfig.startRowIndex; rowIndex <= sheetRange.e.r; rowIndex += 1) {
    const equipmentName = getCellText(worksheet, rowIndex, parseConfig.equipmentNameColIndex);
    const idMachine = getCellText(worksheet, rowIndex, parseConfig.idMachineColIndex);

    // Skip totally empty rows for these two columns
    if (!equipmentName && !idMachine) continue;

    const rowNumber = rowIndex + 1; // 1-based for UI

    // 1. Missing Equipment Name or ID
    if (!idMachine) {
      errors.push({
        row: rowNumber,
        type: 'error',
        message: 'Thieu ID Machine.',
        suggestion: 'Vui long dien ID Machine cho dong nay.',
      });
    }

    if (!equipmentName) {
      errors.push({
        row: rowNumber,
        idMachine,
        type: 'warning',
        message: 'Thieu Ten Thiet Bi (Equipment Name).',
        suggestion: 'Nen bo sung de de theo doi.',
      });
    }

    // 2. Duplicate ID Machine
    if (idMachine) {
      if (seenIds.has(idMachine)) {
        errors.push({
          row: rowNumber,
          idMachine,
          type: 'error',
          message: `Trung lap ID Machine: ${idMachine}.`,
          suggestion: 'Hop nhat hoac doi ten ID de tranh nham lan.',
        });
      }
      seenIds.add(idMachine);
    }

    const safeIdMachine = idMachine || `ROW-${rowNumber}`;
    const safeEquipmentName = equipmentName || 'Unknown';
    const plannedWeekSet = new Set<number>();
    
    // Scan up to the final column in sheet, normally to check for "lost marks"
    const furthestCol = Math.max(parseConfig.weekEndColIndex, sheetRange.e.c);

    for (let colIndex = parseConfig.weekStartColIndex; colIndex <= furthestCol; colIndex += 1) {
      const weekCell = getCell(worksheet, rowIndex, colIndex);
      if (!parseConfig.isPmMarker(weekCell)) continue;

      const week = colIndex - parseConfig.weekStartColIndex + 1;

      // 3. Mark out of bounds
      if (week > PM_TOTAL_WEEKS) {
         errors.push({
           row: rowNumber,
           idMachine: safeIdMachine,
           type: 'warning',
           message: `Co dau PM o cot nam ngoai 52 tuan (${colIndex + 1}).`,
           suggestion: 'Kiem tra xem o nay co bi danh dau nham khong.',
         });
         continue;
      }

      plannedWeekSet.add(week);
    }

    // 4. No PM scheduled
    if (plannedWeekSet.size === 0) {
      errors.push({
        row: rowNumber,
        idMachine: safeIdMachine,
        type: 'warning',
        message: 'May nay khong co lich PM nao trong nam.',
        suggestion: 'Moi may nen co it nhat 1 lich PM, kiem tra lai neu thieu.',
      });
    } else if (plannedWeekSet.size > 26) {
      errors.push({
        row: rowNumber,
        idMachine: safeIdMachine,
        type: 'warning',
        message: `Lich PM day dac (${plannedWeekSet.size} tuan).`,
        suggestion: 'Tan suat PM qua nhieu, hay kiem tra lai neu danh dau sai.',
      });
    }

    const plannedWeeks = [...plannedWeekSet].sort((a, b) => a - b);
    for (const week of plannedWeeks) {
      const month = getMonthFromIsoWeek(year, week);
      tasks.push({
        workshop,
        idMachine: safeIdMachine,
        equipmentName: safeEquipmentName,
        week,
        month,
        monthLabel: toMonthLabel(month),
        status: 'Planned',
        checklistTemplate: createDefaultPmChecklist(),
      });
    }

    machines.push({
      idMachine: safeIdMachine,
      equipmentName: safeEquipmentName,
      plannedWeeks,
      checklistTemplate: createDefaultPmChecklist(),
    });
  }

  tasks.sort((a, b) => {
    if (a.week !== b.week) return a.week - b.week;
    return a.idMachine.localeCompare(b.idMachine);
  });

  const parsedData: PMWorkshopData = {
    workshop,
    workshopLabel: parseConfig.workshopLabel,
    sourceFileName: file.name,
    year,
    importedAt: new Date().toISOString(),
    machines,
    tasks,
  };

  const hasFatalErrors = errors.some((e) => e.type === 'error');

  return {
    data: hasFatalErrors ? null : parsedData,
    errors,
    isValid: !hasFatalErrors,
  };
}
