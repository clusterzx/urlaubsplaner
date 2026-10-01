// Schulferien je Bundesland. Mitgeliefert werden die Termine aus src/data/school-holidays.json
// (aktualisierbar mit `npm run update-ferien`); fehlt ein Jahr, wird es live von der
// OpenHolidays API nachgeladen.
import data from '../data/school-holidays.json';
import { STATES, type StateCode } from './holidays';

export interface SchoolHoliday {
  from: string;
  to: string;
  name: string;
}

export type SchoolByState = Record<StateCode, SchoolHoliday[]>;

/** Bundesweiter Ferienzeitraum einer Ferienart: frühester Beginn bis spätestes Ende. */
export interface SchoolEnvelope extends SchoolHoliday {
  /** Bundesländer mit dem frühesten Beginn */
  first: StateCode[];
  /** Bundesländer mit dem spätesten Ende */
  last: StateCode[];
  /** Anzahl Bundesländer mit dieser Ferienart */
  states: number;
}

export type SchoolMode = 'off' | 'show' | 'prefer' | 'only' | 'avoid';

export const SCHOOL_MODE_LABEL: Record<SchoolMode, string> = {
  off: 'Ausblenden',
  show: 'Nur anzeigen',
  prefer: 'Urlaub bevorzugt in den Ferien',
  only: 'Urlaub nur in den Ferien',
  avoid: 'Ferien meiden (leerer & günstiger)',
};

export const SCHOOL_SOURCE = data.source;
export const SCHOOL_UPDATED = data.updated;

const bundled = data.states as Record<string, string[][]>;

/** Ferien, die das Jahr (inkl. Jahreswechsel) berühren. */
function relevant(list: SchoolHoliday[], year: number): SchoolHoliday[] {
  const lo = `${year - 1}-11-15`;
  const hi = `${year + 1}-02-15`;
  return list.filter((h) => h.to >= lo && h.from <= hi);
}

export function bundledSchoolHolidays(state: StateCode, year: number): SchoolHoliday[] {
  return relevant(
    (bundled[state] ?? []).map(([from, to, name]) => ({ from, to, name })),
    year,
  );
}

export function bundledAllSchoolHolidays(year: number): SchoolByState {
  return Object.fromEntries(STATES.map((s) => [s.code, bundledSchoolHolidays(s.code, year)])) as SchoolByState;
}

/** Sind die Ferien des Jahres vollständig bekannt (mindestens Sommerferien und drei weitere)? */
export function isCovered(list: SchoolHoliday[], year: number): boolean {
  const inYear = list.filter((h) => h.from.startsWith(`${year}-`));
  return inYear.length >= 4 && inYear.some((h) => /sommer/i.test(h.name));
}

export function isAllCovered(map: SchoolByState, year: number): boolean {
  return STATES.every((s) => isCovered(map[s.code] ?? [], year));
}

export function mergeSchoolHolidays(...lists: SchoolHoliday[][]): SchoolHoliday[] {
  const map = new Map<string, SchoolHoliday>();
  for (const list of lists) for (const h of list) map.set(`${h.from}|${h.to}`, h);
  return [...map.values()].sort((a, b) => a.from.localeCompare(b.from));
}

export function mergeSchoolByState(a: SchoolByState, b?: Partial<SchoolByState>): SchoolByState {
  if (!b) return a;
  return Object.fromEntries(STATES.map((s) => [s.code, mergeSchoolHolidays(a[s.code] ?? [], b[s.code] ?? [])])) as SchoolByState;
}

/** Ordnet Ferien einer Ferienart zu; einzelne bewegliche Ferientage zählen nicht. */
function category(h: SchoolHoliday): string | null {
  const name = h.name;
  if (/weihnacht/i.test(name)) return 'Weihnachtsferien';
  // „Frühjahrsferien“ heißen in Bayern die Faschingsferien (Februar), in Hamburg die Märzferien.
  if (/winter|frühjahr|fasching|fastnacht|halbjahr|zeugnis/i.test(name)) {
    return Number(h.from.slice(5, 7)) <= 2 ? 'Winterferien' : 'Frühjahrsferien';
  }
  if (/oster/i.test(name)) return 'Osterferien';
  if (/pfingst/i.test(name)) return 'Pfingstferien';
  if (/sommer/i.test(name)) return 'Sommerferien';
  if (/herbst/i.test(name)) return 'Herbstferien';
  return null;
}

/** Bundesweiter Zeitraum je Ferienart: frühester Beginn und spätestes Ende über alle Länder. */
export function schoolEnvelope(map: SchoolByState, year: number): SchoolEnvelope[] {
  const groups = new Map<string, SchoolEnvelope & { seen: Set<StateCode> }>();
  for (const { code } of STATES) {
    for (const h of map[code] ?? []) {
      const name = category(h);
      if (!name) continue;
      const key = `${name}|${h.from.slice(0, 4)}`;
      let g = groups.get(key);
      if (!g) {
        g = { name, from: h.from, to: h.to, first: [code], last: [code], states: 0, seen: new Set() };
        groups.set(key, g);
      } else {
        if (h.from < g.from) [g.from, g.first] = [h.from, [code]];
        else if (h.from === g.from && !g.first.includes(code)) g.first.push(code);
        if (h.to > g.to) [g.to, g.last] = [h.to, [code]];
        else if (h.to === g.to && !g.last.includes(code)) g.last.push(code);
      }
      g.seen.add(code);
    }
  }
  return [...groups.values()]
    .map(({ seen, ...g }) => ({ ...g, states: seen.size }))
    .filter((g) => g.to >= `${year}-01-01` && g.from <= `${year}-12-31`)
    .sort((a, b) => a.from.localeCompare(b.from));
}

interface ApiEntry {
  startDate: string;
  endDate: string;
  name: { language: string; text: string }[];
  nationwide?: boolean;
  subdivisions?: { code: string }[];
  groups?: { code: string }[];
  comment?: { text: string }[];
}

/** Gleiche Filter wie scripts/update-school-holidays.mjs. */
export function parseOpenHolidays(state: StateCode, entries: ApiEntry[]): SchoolHoliday[] {
  return entries
    .filter((h) => h.nationwide || h.subdivisions?.some((s) => s.code === `DE-${state}`))
    .filter((h) => !h.groups?.length || h.groups.some((g) => g.code.endsWith('-ABS')))
    .filter((h) => !h.comment?.length)
    .map((h) => ({
      from: h.startDate,
      to: h.endDate,
      name: h.name.find((n) => n.language === 'DE')?.text ?? h.name[0]?.text ?? 'Ferien',
    }));
}

/** Lädt die Schulferien aller Bundesländer rund um ein Jahr in einer Abfrage. */
export async function fetchAllSchoolHolidays(year: number, signal?: AbortSignal): Promise<SchoolByState> {
  const url =
    'https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&languageIsoCode=DE' +
    `&validFrom=${year - 1}-12-01&validTo=${year + 1}-01-31`;
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const entries = (await res.json()) as ApiEntry[];
  return Object.fromEntries(
    STATES.map((s) => [s.code, relevant(parseOpenHolidays(s.code, entries), year)]),
  ) as SchoolByState;
}
