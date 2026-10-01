import { regionalOptionsFor, STATES } from './holidays';
import { normalizeOrder } from './plan';
import { SCHOOL_MODE_LABEL } from './schoolHolidays';
import type { Period, Settings } from './types';

export function defaultYear(now = new Date()): number {
  // Ab Oktober plant man meist schon das Folgejahr.
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

export function defaultSettings(): Settings {
  return {
    year: defaultYear(),
    state: 'BY',
    regional: {},
    vacationDays: 30,
    carryOverDays: 0,
    ezaDays: 14,
    overtimeHours: 0,
    hoursPerDay: 7.6,
    workDays: [0, 1, 2, 3, 4],
    christmasEveOff: false,
    newYearsEveOff: false,
    reserveDays: 0,
    requireLongBreak: true,
    excludePast: true,
    allocationOrder: ['overtime', 'eza', 'vacation'],
    allocationMode: 'shortFirst',
    schoolMode: 'show',
    schoolState: 'same',
    schoolAll: false,
  };
}

const num = (v: unknown, fallback: number, min = 0, max = 1000): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Gespeicherte (evtl. ältere oder fehlerhafte) Einstellungen mit Standardwerten zusammenführen. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<Settings>;
  const state = STATES.some((s) => s.code === r.state) ? r.state! : d.state;
  const regional: Record<string, boolean> = {};
  for (const o of regionalOptionsFor(state)) {
    const v = r.regional?.[o.id];
    if (typeof v === 'boolean') regional[o.id] = v;
  }
  const workDays = Array.isArray(r.workDays)
    ? [...new Set(r.workDays.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort((a, b) => a - b)
    : d.workDays;
  return {
    year: Math.round(num(r.year, d.year, 2000, 2100)),
    state,
    regional: { ...(r.regional ?? {}), ...regional },
    vacationDays: num(r.vacationDays, d.vacationDays, 0, 100),
    carryOverDays: num(r.carryOverDays, d.carryOverDays, 0, 100),
    ezaDays: num(r.ezaDays, d.ezaDays, 0, 100),
    overtimeHours: num(r.overtimeHours, d.overtimeHours, 0, 2000),
    hoursPerDay: num(r.hoursPerDay, d.hoursPerDay, 0.5, 24),
    workDays: workDays.length > 0 ? workDays : d.workDays,
    christmasEveOff: typeof r.christmasEveOff === 'boolean' ? r.christmasEveOff : d.christmasEveOff,
    newYearsEveOff: typeof r.newYearsEveOff === 'boolean' ? r.newYearsEveOff : d.newYearsEveOff,
    reserveDays: num(r.reserveDays, d.reserveDays, 0, 100),
    requireLongBreak: typeof r.requireLongBreak === 'boolean' ? r.requireLongBreak : d.requireLongBreak,
    excludePast: typeof r.excludePast === 'boolean' ? r.excludePast : d.excludePast,
    allocationOrder: normalizeOrder(r.allocationOrder),
    allocationMode: r.allocationMode === 'chronological' ? 'chronological' : 'shortFirst',
    schoolMode: r.schoolMode && r.schoolMode in SCHOOL_MODE_LABEL ? r.schoolMode : d.schoolMode,
    schoolState: STATES.some((s) => s.code === r.schoolState) ? r.schoolState! : 'same',
    schoolAll: typeof r.schoolAll === 'boolean' ? r.schoolAll : d.schoolAll,
  };
}

export function sanitizePeriods(raw: unknown): Period[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Period => !!p && typeof p === 'object' && typeof p.from === 'string' && typeof p.to === 'string')
    .map((p) => ({
      id: typeof p.id === 'string' ? p.id : newId(),
      from: p.from,
      to: p.to,
      label: typeof p.label === 'string' ? p.label : '',
      kind: p.kind === 'blocked' || p.kind === 'free' ? p.kind : 'fixed',
      leaveType: p.leaveType === 'vacation' || p.leaveType === 'eza' || p.leaveType === 'overtime' ? p.leaveType : 'auto',
    }));
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
