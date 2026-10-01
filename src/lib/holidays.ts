// Gesetzliche Feiertage in Deutschland je Bundesland.
import { dayIndex, isoOfIndex, weekdayOfIndex } from './dates';

export type StateCode =
  | 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV'
  | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH';

export const STATES: { code: StateCode; name: string }[] = [
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bayern' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hessen' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NI', name: 'Niedersachsen' },
  { code: 'NW', name: 'Nordrhein-Westfalen' },
  { code: 'RP', name: 'Rheinland-Pfalz' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Sachsen' },
  { code: 'ST', name: 'Sachsen-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thüringen' },
];

export function stateName(code: StateCode): string {
  return STATES.find((s) => s.code === code)?.name ?? code;
}

export interface Holiday {
  /** ISO-Datum yyyy-mm-dd */
  date: string;
  name: string;
  /** Nur regional gültig (per Option zugeschaltet). */
  regional?: boolean;
}

/** Feiertage, die nur in Teilen eines Bundeslandes gelten und daher zuschaltbar sind. */
export interface RegionalOption {
  id: string;
  state: StateCode;
  label: string;
  defaultOn: boolean;
}

export const REGIONAL_OPTIONS: RegionalOption[] = [
  {
    id: 'by-mariae',
    state: 'BY',
    label: 'Mariä Himmelfahrt (15.08.) – Gemeinde mit überwiegend katholischer Bevölkerung',
    defaultOn: true,
  },
  {
    id: 'by-augsburg',
    state: 'BY',
    label: 'Augsburger Hohes Friedensfest (08.08.) – nur Stadt Augsburg',
    defaultOn: false,
  },
  {
    id: 'sn-fronleichnam',
    state: 'SN',
    label: 'Fronleichnam – einzelne Gemeinden (v. a. Landkreis Bautzen)',
    defaultOn: false,
  },
  {
    id: 'th-fronleichnam',
    state: 'TH',
    label: 'Fronleichnam – einzelne Gemeinden (Eichsfeld, Teile Wartburgkreis/Unstrut-Hainich)',
    defaultOn: false,
  },
];

export function regionalOptionsFor(state: StateCode): RegionalOption[] {
  return REGIONAL_OPTIONS.filter((o) => o.state === state);
}

/** Ostersonntag nach der Gaußschen Osterformel (anonymer gregorianischer Algorithmus). */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const ALL: StateCode[] = STATES.map((s) => s.code);

export function getHolidays(
  year: number,
  state: StateCode,
  regional: Record<string, boolean> = {},
): Holiday[] {
  const list: Holiday[] = [];
  const easter = easterSunday(year);
  const easterIdx = dayIndex(year, easter.month, easter.day);

  const add = (idx: number, name: string, states: StateCode[], isRegional = false) => {
    if (states.includes(state)) list.push({ date: isoOfIndex(year, idx), name, regional: isRegional || undefined });
  };
  const fixed = (month: number, day: number, name: string, states: StateCode[]) =>
    add(dayIndex(year, month - 1, day), name, states);
  const option = (id: string) => regional[id] ?? REGIONAL_OPTIONS.find((o) => o.id === id)?.defaultOn ?? false;

  fixed(1, 1, 'Neujahr', ALL);
  fixed(1, 6, 'Heilige Drei Könige', ['BW', 'BY', 'ST']);
  const frauentag: StateCode[] = [];
  if (year >= 2019) frauentag.push('BE');
  if (year >= 2023) frauentag.push('MV');
  fixed(3, 8, 'Internationaler Frauentag', frauentag);
  add(easterIdx - 2, 'Karfreitag', ALL);
  add(easterIdx, 'Ostersonntag', ['BB']);
  add(easterIdx + 1, 'Ostermontag', ALL);
  fixed(5, 1, 'Tag der Arbeit', ALL);
  if (year === 2020 || year === 2025) fixed(5, 8, 'Tag der Befreiung', ['BE']);
  add(easterIdx + 39, 'Christi Himmelfahrt', ALL);
  add(easterIdx + 49, 'Pfingstsonntag', ['BB']);
  add(easterIdx + 50, 'Pfingstmontag', ALL);
  add(easterIdx + 60, 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']);
  if (state === 'SN' && option('sn-fronleichnam')) add(easterIdx + 60, 'Fronleichnam (regional)', ['SN'], true);
  if (state === 'TH' && option('th-fronleichnam')) add(easterIdx + 60, 'Fronleichnam (regional)', ['TH'], true);
  if (state === 'BY' && option('by-augsburg')) add(dayIndex(year, 7, 8), 'Augsburger Hohes Friedensfest', ['BY'], true);
  fixed(8, 15, 'Mariä Himmelfahrt', ['SL']);
  if (state === 'BY' && option('by-mariae')) add(dayIndex(year, 7, 15), 'Mariä Himmelfahrt', ['BY'], true);
  if (year >= 2019) fixed(9, 20, 'Weltkindertag', ['TH']);
  fixed(10, 3, 'Tag der Deutschen Einheit', ALL);
  const reformation: StateCode[] =
    year === 2017
      ? ALL
      : year >= 2018
        ? ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']
        : ['BB', 'MV', 'SN', 'ST', 'TH'];
  fixed(10, 31, 'Reformationstag', reformation);
  fixed(11, 1, 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']);
  // Buß- und Bettag: Mittwoch vor dem 23. November.
  const nov22 = dayIndex(year, 10, 22);
  add(nov22 - ((weekdayOfIndex(year, nov22) - 2 + 7) % 7), 'Buß- und Bettag', ['SN']);
  fixed(12, 25, '1. Weihnachtstag', ALL);
  fixed(12, 26, '2. Weihnachtstag', ALL);

  return list.sort((a, b) => a.date.localeCompare(b.date));
}
