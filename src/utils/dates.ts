import { DayOfWeek } from '../types';

// Helper to get current day of week in Spanish
export function getDayOfWeekName(dateStr: string): DayOfWeek {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const dayIndex = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  switch (dayIndex) {
    case 1: return 'Lunes';
    case 2: return 'Martes';
    case 3: return 'Miércoles';
    case 4: return 'Jueves';
    case 5: return 'Viernes';
    case 6: return 'Sábado';
    default: return 'Lunes'; // For Sunday defaults to Monday for week grouping
  }
}

// Helper to format date YYYY-MM-DD
export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
