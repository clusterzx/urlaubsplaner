// Brückentage-Finder: die lohnendsten Konstellationen rund um Feiertage.
import { isPlannable, type YearCalendar } from './calendar';
import { isoOfIndex } from './dates';
import type { Plan } from './plan';

export interface OpportunityOption {
  /** Frei zu nehmende Arbeitstage (Tagesindizes) */
  take: number[];
  start: number;
  end: number;
  startIso: string;
  endIso: string;
  cost: number;
  length: number;
  ratio: number;
  /** Feiertage/arbeitsfreie Tage in der Auszeit */
  holidays: string[];
  /** Schulferien, die die Auszeit berührt */
  school: string[];
}

export interface Opportunity {
  /** Erster Feiertag der Konstellation */
  anchor: number;
  title: string;
  options: OpportunityOption[];
}

/**
 * Sucht für jeden Feiertag (bzw. arbeitsfreien Tag) die besten Möglichkeiten, ihn mit
 * Urlaubstagen zu einer längeren Auszeit zu verbinden: die effizienteste Variante sowie die
 * effizientesten Varianten mit mindestens 9 bzw. 16 freien Tagen am Stück.
 */
export function findOpportunities(cal: YearCalendar, maxCost = 10, minRatio = 2): Opportunity[] {
  const n = cal.days.length;
  const work = cal.days.filter((d) => d.kind === 'work');
  const W = work.map((d) => d.idx);
  const M = W.length;
  const pos = (k: number) => (k < 0 ? cal.prevWorkday : k >= M ? cal.nextWorkday : W[k]);
  const isSpecial = (d: number) =>
    d >= 0 && d < n ? cal.days[d].kind === 'holiday' || cal.days[d].kind === 'free' : !!cal.labelAt(d);

  // Je Anker-Feiertag und Anzahl eingesetzter Tage die längste Auszeit.
  const groups = new Map<number, Map<number, OpportunityOption>>();
  for (let i = 0; i < M; i++) {
    for (let j = i; j < M && j - i + 1 <= maxCost; j++) {
      const day = work[j];
      if (!isPlannable(day)) break;
      const start = pos(i - 1) + 1;
      const end = pos(j + 1) - 1;
      let anchor: number | null = null;
      for (let d = start; d <= end && anchor === null; d++) if (isSpecial(d)) anchor = d;
      if (anchor === null || anchor < 0 || anchor >= n) continue;
      const cost = j - i + 1;
      const length = end - start + 1;
      let byCost = groups.get(anchor);
      if (!byCost) groups.set(anchor, (byCost = new Map()));
      const prev = byCost.get(cost);
      if (!prev || length > prev.length) {
        byCost.set(cost, {
          take: W.slice(i, j + 1),
          start,
          end,
          startIso: isoOfIndex(cal.year, start),
          endIso: isoOfIndex(cal.year, end),
          cost,
          length,
          ratio: length / cost,
          holidays: namesBetween(cal, start, end, isSpecial),
          school: schoolBetween(cal, start, end),
        });
      }
    }
  }

  const result: Opportunity[] = [];
  for (const [anchor, byCost] of groups) {
    // Pareto-Front: mehr Einsatz nur, wenn dadurch auch mehr freie Tage entstehen.
    const frontier: OpportunityOption[] = [];
    for (const o of [...byCost.values()].sort((a, b) => a.cost - b.cost)) {
      if (frontier.length === 0 || o.length > frontier[frontier.length - 1].length) frontier.push(o);
    }
    const options: OpportunityOption[] = [];
    for (const minLength of [0, 9, 16]) {
      const candidates = frontier.filter((o) => o.length >= minLength && o.ratio >= minRatio);
      if (candidates.length === 0) continue;
      const best = candidates.reduce((a, b) => (b.ratio > a.ratio + 1e-9 ? b : a));
      if (!options.includes(best)) options.push(best);
    }
    if (options.length === 0) continue;
    result.push({ anchor, title: cal.labelAt(anchor) ?? '', options });
  }
  return result.sort((a, b) => a.anchor - b.anchor);
}

function schoolBetween(cal: YearCalendar, start: number, end: number): string[] {
  const names: string[] = [];
  for (let d = Math.max(0, start); d <= Math.min(cal.days.length - 1, end); d++) {
    const name = cal.days[d].school;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function namesBetween(cal: YearCalendar, start: number, end: number, isSpecial: (d: number) => boolean): string[] {
  const names: string[] = [];
  for (let d = start; d <= end; d++) {
    const name = isSpecial(d) ? cal.labelAt(d) : undefined;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

export function isOptionInPlan(option: OpportunityOption, plan: Plan): boolean {
  return option.take.every((d) => plan[d] !== null);
}
