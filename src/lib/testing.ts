// Hilfen für Tests.
import { buildCalendar } from './calendar';
import { indexOfIso } from './dates';
import { computeBudget } from './plan';
import { defaultSettings } from './settings';
import type { Period, Settings } from './types';

export function setup(patch: Partial<Settings> = {}, periods: Period[] = [], today?: string) {
  const settings: Settings = { ...defaultSettings(), year: 2027, state: 'BY', excludePast: false, ...patch };
  const cal = buildCalendar(settings, periods, today);
  const budget = computeBudget(settings);
  const idx = (iso: string) => indexOfIso(settings.year, iso)!;
  return { settings, cal, budget, idx };
}

export function period(from: string, to: string, kind: Period['kind'] = 'fixed', leaveType: Period['leaveType'] = 'auto'): Period {
  return { id: `${from}-${kind}`, from, to, label: `${kind} ${from}`, kind, leaveType };
}
