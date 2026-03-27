export type PMWorkshopType = 'foaming' | 'insole';
export type PMStatus = 'Planned' | 'In Progress' | 'Completed' | 'Skipped';

export interface PMTask {
  workshop: PMWorkshopType;
  idMachine: string;
  equipmentName: string;
  week: number;
  month: number;
  monthLabel: string;
  status: PMStatus;
  notes?: string;
  checklistTemplate?: PMChecklistItem[];
}

export interface PMMachineSchedule {
  idMachine: string;
  equipmentName: string;
  plannedWeeks: number[];
  checklistTemplate?: PMChecklistItem[];
}

export interface PMWorkshopData {
  workshop: PMWorkshopType;
  workshopLabel: string;
  sourceFileName: string;
  year: number;
  importedAt: string;
  machines: PMMachineSchedule[];
  tasks: PMTask[];
}

export interface PMImportError {
  row: number;
  idMachine?: string;
  type: 'error' | 'warning';
  message: string;
  suggestion: string;
}

export interface PMImportPreview {
  data: PMWorkshopData | null;
  errors: PMImportError[];
  isValid: boolean;
}

export interface PMChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface PMTaskDetail {
  idMachine: string;
  week: number;
  status: PMStatus;
  checklist: PMChecklistItem[];
  notes: string;
  photos: string[];
  executionTimeMin: number;
}
