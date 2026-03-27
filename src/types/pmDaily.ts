export type Priority = 'P0 (Urgent)' | 'P1 (High)' | 'P2 (Normal)' | 'P3 (Low)';
export type Status = 'Planned' | 'In Progress' | 'Done' | 'Blocked' | 'Skipped';
export type ReasonTag = 'Safety' | 'Downtime risk' | 'Quality risk' | 'Audit';

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
  startTime?: string; // HH:mm
  stopTime?: string; // HH:mm
  durationMins?: number;
  assignee: string | null;
  
  // tracking
  priority: Priority;
  status: Status;
  reasonTag?: ReasonTag | null;
  checklist: { text: string; checked: boolean }[];
  notes: string;
  photos: string[];
}
