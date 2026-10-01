// Baut den Tageskalender eines Jahres: Arbeitstag, Wochenende, Feiertag oder arbeitsfrei,
// inklusive fester Zeiten, Sperren und Schulferien.
import { daysInYear, indexOfIso, isoOfIndex, weekdayOfIndex } from './dates';
import { getHolidays, type Holiday } from './holidays';
import type { SchoolEnvelope, SchoolHoliday } from './schoolHolidays';
import type { LeaveType, Period, Settings } from './types';

export type DayKind = 'work' | 'weekend' | 'holiday' | 'free';

export interface DayInfo {
  idx: number;
  iso: string;
  month: number;
  dom: number;
  /** 0 = Montag … 6 = Sonntag */
  weekday: number;
  kind: DayKind;
  /** Name des Feiertags (auch wenn er auf ein Wochenende fällt). */
  holiday?: string;
  /** Bezeichnung eines arbeitsfreien Tages (24.12., Betriebsruhe …). */
  freeLabel?: string;
  /** Fester Urlaub: Tag muss frei genommen werden. */
  fixed?: { periodId: string; label: string; leaveType: LeaveType | 'auto' };
  /** Urlaubssperre */
  blocked?: string;
  /** Liegt vor dem heutigen Tag und wird nicht verplant. */
  past?: boolean;
  /** Name der Schulferien (gewähltes Bundesland), in die der Tag fällt. */
  school?: string;
  /** Ferienart, die in mindestens einem Bundesland gerade läuft (bundesweiter Zeitraum). */
  schoolAll?: string;
  /** Modus „nur in den Ferien“: Arbeitstag außerhalb der Schulferien wird nicht verplant. */
  outsideSchool?: boolean;
}

export interface YearCalendar {
  year: number;
  days: DayInfo[];
  holidays: Holiday[];
  /** Schulferien des gewählten Bundeslandes, die das Jahr berühren */
  schoolHolidays: SchoolHoliday[];
  /** Bundesweite Ferienzeiträume (frühester Beginn – spätestes Ende) */
  schoolEnvelope: SchoolEnvelope[];
  /** Sommerferien als Tagesindizes, falls bekannt */
  summerSchool?: [number, number];
  /** Erster Tagesindex (negativ) des erweiterten Bereichs ins Vorjahr. */
  extStart: number;
  /** Ist der Tag mit Index idx (auch außerhalb des Jahres) ohne Urlaubsbuchung frei? */
  offAt: (idx: number) => boolean;
  /** Feiertags- bzw. Freizeitbezeichnung für einen Tag (auch außerhalb des Jahres). */
  labelAt: (idx: number) => string | undefined;
  /** Letzter Arbeitstag vor dem 1. Januar (negativer Index). */
  prevWorkday: number;
  /** Erster Arbeitstag nach dem 31. Dezember (Index ≥ Anzahl Tage). */
  nextWorkday: number;
}

const EXT = 45;

interface KindInfo {
  kind: DayKind;
  holiday?: string;
  freeLabel?: string;
}

export function buildCalendar(
  settings: Settings,
  periods: Period[],
  today?: string,
  schoolHolidays: SchoolHoliday[] = [],
  schoolEnvelope: SchoolEnvelope[] = [],
): YearCalendar {
  const { year } = settings;
  const n = daysInYear(year);
  const holidayMap = new Map<number, string>();
  const allHolidays: Record<number, Holiday[]> = {};
  for (const y of [year - 1, year, year + 1]) {
    allHolidays[y] = getHolidays(y, settings.state, settings.regional);
    for (const h of allHolidays[y]) holidayMap.set(indexOfIso(year, h.date)!, h.name);
  }
  const workDays = new Set(settings.workDays);

  // Arbeitsfreie Zeiträume und feste Urlaube (auch außerhalb des Jahres, für Randbetrachtungen).
  const freeMap = new Map<number, string>();
  const fixedMap = new Map<number, Period>();
  const blockedMap = new Map<number, string>();
  for (const p of periods) {
    const a = indexOfIso(year, p.from);
    const b = indexOfIso(year, p.to);
    if (a === null || b === null) continue;
    const lo = Math.max(Math.min(a, b), -EXT);
    const hi = Math.min(Math.max(a, b), n + EXT - 1);
    for (let i = lo; i <= hi; i++) {
      if (p.kind === 'free') freeMap.set(i, p.label || 'Arbeitsfrei');
      else if (p.kind === 'fixed') fixedMap.set(i, p);
      else blockedMap.set(i, p.label || 'Urlaubssperre');
    }
  }

  const kindAt = (idx: number): KindInfo => {
    const holiday = holidayMap.get(idx);
    const wd = weekdayOfIndex(year, idx);
    if (!workDays.has(wd)) return { kind: 'weekend', holiday };
    if (holiday) return { kind: 'holiday', holiday };
    const free = freeMap.get(idx);
    if (free) return { kind: 'free', freeLabel: free };
    const iso = isoOfIndex(year, idx);
    const md = iso.slice(5);
    if (md === '12-24' && settings.christmasEveOff) return { kind: 'free', freeLabel: 'Heiligabend (arbeitsfrei)' };
    if (md === '12-31' && settings.newYearsEveOff) return { kind: 'free', freeLabel: 'Silvester (arbeitsfrei)' };
    return { kind: 'work' };
  };

  const schoolMap = new Map<number, string>();
  let summerSchool: [number, number] | undefined;
  for (const h of schoolHolidays) {
    const a = indexOfIso(year, h.from);
    const b = indexOfIso(year, h.to);
    if (a === null || b === null) continue;
    for (let i = Math.max(0, a); i <= Math.min(n - 1, b); i++) schoolMap.set(i, h.name);
    if (/sommer/i.test(h.name) && a >= 0 && b < n) summerSchool = [a, b];
  }
  const onlySchool = settings.schoolMode === 'only' && schoolHolidays.length > 0;
  const allMap = new Map<number, string>();
  for (const h of schoolEnvelope) {
    const a = indexOfIso(year, h.from);
    const b = indexOfIso(year, h.to);
    if (a === null || b === null) continue;
    for (let i = Math.max(0, a); i <= Math.min(n - 1, b); i++) allMap.set(i, h.name);
  }

  // Nur im laufenden Jahr relevant – andere Jahre werden vollständig geplant.
  const cutoff = settings.excludePast && today?.startsWith(`${year}-`) ? indexOfIso(year, today) : null;

  const days: DayInfo[] = [];
  for (let idx = 0; idx < n; idx++) {
    const iso = isoOfIndex(year, idx);
    const k = kindAt(idx);
    const day: DayInfo = {
      idx,
      iso,
      month: Number(iso.slice(5, 7)) - 1,
      dom: Number(iso.slice(8, 10)),
      weekday: weekdayOfIndex(year, idx),
      ...k,
    };
    const school = schoolMap.get(idx);
    if (school) day.school = school;
    const schoolAll = allMap.get(idx);
    if (schoolAll) day.schoolAll = schoolAll;
    if (day.kind === 'work') {
      if (cutoff !== null && idx < cutoff) {
        day.past = true;
      } else {
        const fp = fixedMap.get(idx);
        if (fp) day.fixed = { periodId: fp.id, label: fp.label || 'Fester Urlaub', leaveType: fp.leaveType };
        else if (blockedMap.has(idx)) day.blocked = blockedMap.get(idx);
        else if (onlySchool && !school) day.outsideSchool = true;
      }
    }
    days.push(day);
  }

  // Außerhalb des Jahres: frei, wenn arbeitsfrei oder durch einen festen Urlaub abgedeckt.
  const extOff = new Map<number, boolean>();
  const extLabel = new Map<number, string | undefined>();
  for (let i = -EXT; i < n + EXT; i++) {
    if (i >= 0 && i < n) continue;
    const k = kindAt(i);
    extOff.set(i, k.kind !== 'work' || fixedMap.has(i));
    extLabel.set(i, k.holiday ?? k.freeLabel);
  }
  const offAt = (idx: number): boolean => {
    if (idx >= 0 && idx < n) return days[idx].kind !== 'work';
    return extOff.get(idx) ?? false;
  };
  const labelAt = (idx: number): string | undefined => {
    if (idx >= 0 && idx < n) return days[idx].holiday ?? days[idx].freeLabel;
    return extLabel.get(idx);
  };

  let prevWorkday = -1;
  while (prevWorkday > -EXT && offAt(prevWorkday)) prevWorkday--;
  let nextWorkday = n;
  while (nextWorkday < n + EXT - 1 && offAt(nextWorkday)) nextWorkday++;

  return {
    year,
    days,
    holidays: allHolidays[year],
    schoolHolidays,
    schoolEnvelope,
    summerSchool,
    extStart: -EXT,
    offAt,
    labelAt,
    prevWorkday,
    nextWorkday,
  };
}

/** Ein Tag, an dem Urlaub/EZA/Gleitzeit überhaupt gebucht werden kann. */
export function isBookable(day: DayInfo): boolean {
  return day.kind === 'work' && !day.past;
}

/** Ein Tag, den die Planung (Szenarien, Brückentage-Finder) verwenden darf. */
export function isPlannable(day: DayInfo): boolean {
  if (day.fixed) return true;
  return isBookable(day) && !day.blocked && !day.outsideSchool;
}
