import type { StateCode } from './holidays';

/** Konten, aus denen ein freier Arbeitstag gebucht wird. */
export type LeaveType = 'vacation' | 'eza' | 'overtime';

export const LEAVE_TYPES: LeaveType[] = ['vacation', 'eza', 'overtime'];

export const LEAVE_LABEL: Record<LeaveType, string> = {
  vacation: 'Urlaub',
  eza: 'EZA',
  overtime: 'Gleitzeit',
};

export const LEAVE_LONG_LABEL: Record<LeaveType, string> = {
  vacation: 'Urlaub',
  eza: 'EZA (Extrazeitausgleich)',
  overtime: 'Gleitzeit (Überstundenabbau)',
};

export const LEAVE_SHORT: Record<LeaveType, string> = {
  vacation: 'U',
  eza: 'E',
  overtime: 'G',
};

export type AllocationMode = 'shortFirst' | 'chronological';

export interface Settings {
  year: number;
  state: StateCode;
  /** Zuschaltbare regionale Feiertage, siehe REGIONAL_OPTIONS. */
  regional: Record<string, boolean>;
  vacationDays: number;
  carryOverDays: number;
  ezaDays: number;
  overtimeHours: number;
  hoursPerDay: number;
  /** Arbeitstage, 0 = Montag … 6 = Sonntag. */
  workDays: number[];
  christmasEveOff: boolean;
  newYearsEveOff: boolean;
  /** Tage, die bewusst nicht verplant werden (Puffer). */
  reserveDays: number;
  /** Mindestens eine Auszeit von zwei Wochen am Stück (§ 7 Abs. 2 BUrlG). */
  requireLongBreak: boolean;
  /** Im laufenden Jahr Tage vor heute nicht verplanen. */
  excludePast: boolean;
  /** Reihenfolge, in der die Konten bei automatischer Zuordnung belastet werden. */
  allocationOrder: LeaveType[];
  allocationMode: AllocationMode;
}

export type PeriodKind = 'fixed' | 'blocked' | 'free';

export const PERIOD_KIND_LABEL: Record<PeriodKind, string> = {
  fixed: 'Fester Urlaub',
  blocked: 'Urlaubssperre',
  free: 'Arbeitsfrei (ohne Buchung)',
};

/** Persönlich wichtige Zeiten: feste Urlaube, Sperren oder zusätzliche freie Tage. */
export interface Period {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: PeriodKind;
  /** Nur für `fixed`: Konto, aus dem gebucht werden soll. */
  leaveType: LeaveType | 'auto';
}

/** Manuelle Änderungen am Plan: Datum → Konto oder 'work' (Tag wird gearbeitet). */
export type Overrides = Record<string, LeaveType | 'work'>;
