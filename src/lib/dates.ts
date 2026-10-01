// Datumshilfen. Alle Berechnungen laufen in UTC, damit Sommer-/Winterzeit keine Rolle spielt.
// Ein Tag wird innerhalb eines Planungsjahres über seinen Index (0 = 1. Januar) adressiert.

const MS_PER_DAY = 86_400_000;

export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Index des Tages relativ zum 1. Januar von `year` (month 0-basiert). Darf außerhalb des Jahres liegen. */
export function dayIndex(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month, day) - Date.UTC(year, 0, 1)) / MS_PER_DAY);
}

export function dateOfIndex(year: number, idx: number): Date {
  return new Date(Date.UTC(year, 0, 1 + idx));
}

export function isoOfIndex(year: number, idx: number): string {
  return dateOfIndex(year, idx).toISOString().slice(0, 10);
}

export function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

/** Index eines ISO-Datums relativ zum 1. Januar von `year`, oder null bei ungültigem Datum. */
export function indexOfIso(year: number, iso: string): number | null {
  const p = parseIso(iso);
  if (!p) return null;
  return Math.round((Date.UTC(p.year, p.month, p.day) - Date.UTC(year, 0, 1)) / MS_PER_DAY);
}

/** Wochentag mit 0 = Montag … 6 = Sonntag. */
export function weekdayOfIndex(year: number, idx: number): number {
  return (dateOfIndex(year, idx).getUTCDay() + 6) % 7;
}

export function weekdayOfIso(iso: string): number {
  const p = parseIso(iso)!;
  return (new Date(Date.UTC(p.year, p.month, p.day)).getUTCDay() + 6) % 7;
}

/** 14.05.2027 */
export function formatDate(iso: string): string {
  const p = parseIso(iso);
  if (!p) return iso;
  return `${pad(p.day)}.${pad(p.month + 1)}.${p.year}`;
}

/** 14.05. */
export function formatDayMonth(iso: string): string {
  const p = parseIso(iso);
  if (!p) return iso;
  return `${pad(p.day)}.${pad(p.month + 1)}.`;
}

/** Do, 14.05. */
export function formatWeekdayDate(iso: string): string {
  return `${WEEKDAYS_SHORT[weekdayOfIso(iso)]}, ${formatDayMonth(iso)}`;
}

/** Zeitraum kompakt, z. B. „14.05.–17.05.2027“ oder „28.12.2026–03.01.2027“. */
export function formatRange(fromIso: string, toIso: string): string {
  if (fromIso === toIso) return formatDate(fromIso);
  const a = parseIso(fromIso)!;
  const b = parseIso(toIso)!;
  if (a.year === b.year) return `${formatDayMonth(fromIso)}–${formatDate(toIso)}`;
  return `${formatDate(fromIso)}–${formatDate(toIso)}`;
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatNumber(n: number, digits = 1): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
