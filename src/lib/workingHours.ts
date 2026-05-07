const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function getWorkingHoursDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatWorkingHoursDate(key: string): string {
  if (!key || key.startsWith('_')) return key;
  const parts = key.split('-');
  if (parts.length !== 3) return key;
  const day = parseInt(parts[2], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  return `${day}-${MONTHS[monthIdx]}`;
}

export function normalizeWorkingHoursDateKey(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return getWorkingHoursDateKey(value);
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const dayMonthMatch = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,})$/);
  if (dayMonthMatch) {
    const [, day, monthText] = dayMonthMatch;
    const monthIndex = MONTHS.findIndex(
      (month) => month.toLowerCase() === monthText.slice(0, 3).toLowerCase()
    );

    if (monthIndex >= 0) {
      const year = new Date().getFullYear();
      const parsed = new Date(year, monthIndex, Number(day));
      return getWorkingHoursDateKey(parsed);
    }
  }

  const numericMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?$/);
  if (numericMatch) {
    const [, day, month, year] = numericMatch;
    const normalizedYear = year ? Number(year.length === 2 ? `20${year}` : year) : new Date().getFullYear();
    const parsed = new Date(normalizedYear, Number(month) - 1, Number(day));

    if (!Number.isNaN(parsed.getTime())) {
      return getWorkingHoursDateKey(parsed);
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return getWorkingHoursDateKey(parsed);
  }

  return raw;
}
