// Budget, Kontenzuordnung (Urlaub / EZA / Gleitzeit) und Auswertung eines Plans.
import { isBookable, type YearCalendar } from './calendar';
import { isoOfIndex } from './dates';
import { LEAVE_LABEL, LEAVE_TYPES, type LeaveType, type Overrides, type Settings } from './types';

/** Pro Tag des Jahres: gebuchtes Konto oder null. */
export type Plan = (LeaveType | null)[];

export interface Budget {
  /** Urlaubstage inkl. Resturlaub */
  vacation: number;
  eza: number;
  /** Ganze Gleitzeittage aus den Überstunden */
  overtime: number;
  overtimeHours: number;
  hoursPerDay: number;
  /** Überstunden, die für keinen ganzen Tag reichen */
  overtimeRestHours: number;
  total: number;
  /** Zu verplanende Tage (gesamt abzüglich Reserve) */
  plannable: number;
}

export function computeBudget(s: Settings): Budget {
  const vacation = Math.max(0, Math.floor(s.vacationDays) + Math.floor(s.carryOverDays));
  const eza = Math.max(0, Math.floor(s.ezaDays));
  const hpd = s.hoursPerDay > 0 ? s.hoursPerDay : 7.6;
  const hours = Math.max(0, s.overtimeHours);
  // kleine Toleranz gegen Rundungsfehler (z. B. 22,8 h / 7,6 h)
  const overtime = Math.floor(hours / hpd + 1e-9);
  const overtimeRestHours = Math.max(0, Math.round((hours - overtime * hpd) * 100) / 100);
  const total = vacation + eza + overtime;
  return {
    vacation,
    eza,
    overtime,
    overtimeHours: hours,
    hoursPerDay: hpd,
    overtimeRestHours,
    total,
    plannable: Math.max(0, total - Math.max(0, Math.floor(s.reserveDays))),
  };
}

export interface Break {
  /** Tagesindizes (können über das Jahr hinausreichen) */
  start: number;
  end: number;
  startIso: string;
  endIso: string;
  /** Freie Kalendertage am Stück */
  length: number;
  /** Eingesetzte Tage (Urlaub + EZA + Gleitzeit) im Planungsjahr */
  leaveDays: number;
  byType: Record<LeaveType, number>;
  /** Feiertage und arbeitsfreie Tage im Zeitraum */
  holidays: string[];
  /** Bezeichnungen fester Zeiten im Zeitraum */
  labels: string[];
  /** Schulferien, die die Auszeit berührt */
  school: string[];
}

function emptyCounts(): Record<LeaveType, number> {
  return { vacation: 0, eza: 0, overtime: 0 };
}

/** Zusammenhängende freie Zeiträume, die mindestens einen gebuchten Tag enthalten. */
export function computeBreaks(cal: YearCalendar, plan: Plan): Break[] {
  const n = cal.days.length;
  const lo = cal.extStart;
  const hi = n - cal.extStart - 1;
  const off = (i: number) => (i >= 0 && i < n ? cal.days[i].kind !== 'work' || plan[i] !== null : cal.offAt(i));
  const breaks: Break[] = [];
  let i = 0;
  while (i < n) {
    if (plan[i] === null) {
      i++;
      continue;
    }
    let s = i;
    while (s - 1 >= lo && off(s - 1)) s--;
    let e = i;
    while (e + 1 <= hi && off(e + 1)) e++;
    const byType = emptyCounts();
    const holidays: string[] = [];
    const labels: string[] = [];
    const school: string[] = [];
    for (let d = s; d <= e; d++) {
      if (d >= 0 && d < n) {
        const t = plan[d];
        if (t) byType[t]++;
        const sh = cal.days[d].school;
        if (sh && !school.includes(sh)) school.push(sh);
        const fx = cal.days[d].fixed;
        if (fx && t && !labels.includes(fx.label)) labels.push(fx.label);
      }
      const label = cal.labelAt(d);
      if (label && !holidays.includes(label)) holidays.push(label);
    }
    breaks.push({
      start: s,
      end: e,
      startIso: isoOfIndex(cal.year, s),
      endIso: isoOfIndex(cal.year, e),
      length: e - s + 1,
      leaveDays: byType.vacation + byType.eza + byType.overtime,
      byType,
      holidays,
      labels,
      school,
    });
    i = e + 1;
  }
  return breaks;
}

/**
 * Ordnet den frei zu nehmenden Tagen ein Konto zu.
 * Feste Zeiten mit vorgegebenem Konto werden zuerst gebucht. Danach werden die übrigen Tage
 * entweder kurze Auszeiten zuerst (Brückentage → z. B. Gleitzeit) oder chronologisch
 * gemäß der Kontenreihenfolge verteilt.
 */
export function allocate(cal: YearCalendar, takenIdx: number[], budget: Budget, s: Settings): Plan {
  const n = cal.days.length;
  const plan: Plan = new Array(n).fill(null);
  const remaining = { vacation: budget.vacation, eza: budget.eza, overtime: budget.overtime };
  const order = normalizeOrder(s.allocationOrder);
  const open: number[] = [];

  for (const idx of [...takenIdx].sort((a, b) => a - b)) {
    const fx = cal.days[idx]?.fixed;
    if (fx && fx.leaveType !== 'auto') {
      plan[idx] = fx.leaveType;
      remaining[fx.leaveType]--;
    } else {
      open.push(idx);
      plan[idx] = 'vacation'; // vorläufig, damit die Auszeiten ermittelt werden können
    }
  }

  let sequence = open;
  if (s.allocationMode === 'shortFirst') {
    const breaks = computeBreaks(cal, plan);
    const breakOf = new Map<number, Break>();
    for (const b of breaks) for (let d = Math.max(0, b.start); d <= Math.min(n - 1, b.end); d++) breakOf.set(d, b);
    sequence = [...open].sort((a, b) => {
      const ba = breakOf.get(a)!;
      const bb = breakOf.get(b)!;
      return ba.leaveDays - bb.leaveDays || ba.start - bb.start || a - b;
    });
  }

  for (const idx of sequence) {
    const t = order.find((k) => remaining[k] > 0) ?? order[order.length - 1];
    plan[idx] = t;
    remaining[t]--;
  }
  return plan;
}

export function normalizeOrder(order: LeaveType[] | undefined): LeaveType[] {
  const result = (order ?? []).filter((t, i, arr) => LEAVE_TYPES.includes(t) && arr.indexOf(t) === i);
  for (const t of LEAVE_TYPES) if (!result.includes(t)) result.push(t);
  return result;
}

/** Wendet manuelle Änderungen auf einen Plan an. */
export function applyOverrides(cal: YearCalendar, plan: Plan, overrides: Overrides | undefined): Plan {
  if (!overrides) return plan;
  const result = [...plan];
  for (const day of cal.days) {
    const o = overrides[day.iso];
    if (!o || day.kind !== 'work') continue;
    result[day.idx] = o === 'work' ? null : o;
  }
  return result;
}

export interface PlanSummary {
  used: Record<LeaveType, number>;
  available: Record<LeaveType, number>;
  remaining: Record<LeaveType, number>;
  totalLeave: number;
  breaks: Break[];
  /** Summe der freien Tage in allen Auszeiten */
  breakDays: number;
  /** Freie Tage je eingesetztem Tag */
  efficiency: number;
  longest: number;
  /** Alle freien Tage im Jahr (Wochenenden, Feiertage, arbeitsfrei, gebucht) */
  freeDaysInYear: number;
  /** Eingesetzte Tage, die in den Schulferien liegen */
  leaveInSchool: number;
  warnings: string[];
}

export function summarize(cal: YearCalendar, plan: Plan, budget: Budget): PlanSummary {
  const used = emptyCounts();
  const warnings: string[] = [];
  let unbookable = 0;
  let freeDaysInYear = 0;
  let leaveInSchool = 0;
  for (const day of cal.days) {
    const t = plan[day.idx];
    if (t) {
      used[t]++;
      if (day.school) leaveInSchool++;
      if (!isBookable(day) || day.blocked) unbookable++;
    }
    if (day.kind !== 'work' || t) freeDaysInYear++;
  }
  const available = { vacation: budget.vacation, eza: budget.eza, overtime: budget.overtime };
  const remaining = {
    vacation: available.vacation - used.vacation,
    eza: available.eza - used.eza,
    overtime: available.overtime - used.overtime,
  };
  for (const t of LEAVE_TYPES) {
    if (remaining[t] < 0) warnings.push(`${LEAVE_LABEL[t]}: ${-remaining[t]} Tag(e) mehr verplant als verfügbar.`);
  }
  if (unbookable > 0) warnings.push(`${unbookable} gebuchte(r) Tag(e) liegen in einer Urlaubssperre oder in der Vergangenheit.`);
  const breaks = computeBreaks(cal, plan);
  const breakDays = breaks.reduce((sum, b) => sum + b.length, 0);
  const totalLeave = used.vacation + used.eza + used.overtime;
  return {
    used,
    available,
    remaining,
    totalLeave,
    breaks,
    breakDays,
    efficiency: totalLeave > 0 ? breakDays / totalLeave : 0,
    longest: breaks.reduce((m, b) => Math.max(m, b.length), 0),
    freeDaysInYear,
    leaveInSchool,
    warnings,
  };
}
