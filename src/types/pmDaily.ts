export type Priority = 'P0 (Urgent)' | 'P1 (High)' | 'P2 (Normal)' | 'P3 (Low)';
export type Status = 'Planned' | 'Progress 25%' | 'Progress 50%' | 'Progress 75%' | 'Done';
export type ReasonTag = 'Safety' | 'Downtime risk' | 'Quality risk' | 'Audit';

export interface HandoverLog {
  fromStaff: string;
  toStaff: string[];
  shifts: string[];
  note: string;
  timestamp: string;
}

export interface TaskConfirmation {
  staffName: string;
  timestamp: string;
}

export interface DailyAssignment {
  id: string; // UUID
  idMachine?: string;
  equipmentName?: string;
  workshop?: string;
  week?: number;
  
  // Work info
  workContent: string;
  
  // scheduling
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  stopTime?: string; // HH:mm
  durationMins?: number;
  assignees: string[];
  
  // tracking
  priority: Priority;
  status: Status;
  reasonTag?: ReasonTag | null;
  checklist: { text: string; checked: boolean }[];
  notes: string;
  photos: string[];
  handoverShifts?: string[];
  handoverStaff?: string[];
  handoverLogs?: HandoverLog[];
  confirmations?: TaskConfirmation[];
  createdBy?: string;
  createdById?: string;
}
