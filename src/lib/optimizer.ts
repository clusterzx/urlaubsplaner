// Optimierer: verteilt die verfügbaren Tage so, dass möglichst viele freie Tage am Stück entstehen.
//
// Modell: Jeder Arbeitstag wird entweder gearbeitet oder frei genommen. Zusammenhängend frei
// genommene Arbeitstage bilden zusammen mit angrenzenden Wochenenden, Feiertagen und arbeitsfreien
// Tagen eine „Auszeit“. Bewertet wird die Summe der Auszeit-Längen – also wie viele freie Tage am
// Stück man aus den eingesetzten Tagen herausholt. Szenarien unterscheiden sich durch
// Nebenbedingungen (Mindestlänge, Anzahl Auszeiten, langer Sommerurlaub, gleichmäßige Abstände).
// Gelöst wird exakt per dynamischer Programmierung über die Arbeitstage des Jahres.
import { isBookable, type YearCalendar } from './calendar';
import { dayIndex } from './dates';

export interface ScenarioDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Mindestlänge einer Auszeit in Kalendertagen (feste Zeiten ausgenommen). */
  minLen: number;
  /** Maximal eingesetzte Tage pro Auszeit (feste Zeiten ausgenommen). */
  maxLeavePerBreak: number;
  /** Höchstzahl an Auszeiten in Abhängigkeit vom Budget. */
  maxBreaks?: (budget: number) => number;
  /** Erforderliche lange Auszeit. */
  long?: { minLen: number; summer: boolean };
  /**
   * Gleichmäßige Abstände bevorzugen: Lücken zwischen Auszeiten, die länger sind als
   * 52 Wochen / (erwartete Anzahl Auszeiten + 1), kosten `weight` je zusätzlichem Arbeitstag.
   */
  spread?: { leavePerBreak: number; weight: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'balanced',
    name: 'Ausgewogen',
    tagline: 'Brückentage + Sommerurlaub',
    description:
      'Nutzt die besten Feiertags-Konstellationen (Ostern, Brückentage, Weihnachten) und plant zusätzlich einen Sommerurlaub von mindestens zwei Wochen.',
    minLen: 4,
    maxLeavePerBreak: 20,
    maxBreaks: (b) => clamp(Math.round(b / 6), 4, 10),
    long: { minLen: 14, summer: true },
    spread: { leavePerBreak: 6, weight: 0.1 },
  },
  {
    id: 'efficient',
    name: 'Maximale Effizienz',
    tagline: 'Meiste freie Tage pro Urlaubstag',
    description:
      'Holt rechnerisch die meisten freien Tage am Stück heraus: alle Brückentage und viele verlängerte Wochenenden (mind. 4 Tage frei).',
    minLen: 4,
    maxLeavePerBreak: 15,
    spread: { leavePerBreak: 2, weight: 0.02 },
  },
  {
    id: 'long',
    name: 'Lange Auszeiten',
    tagline: 'Wenige, lange Urlaube',
    description:
      'Bündelt die Tage in wenigen langen Urlauben rund um Feiertage – ideal für Fernreisen. Ein Urlaub davon im Sommer.',
    minLen: 9,
    maxLeavePerBreak: 15,
    maxBreaks: (b) => clamp(Math.round(b / 12), 2, 5),
    long: { minLen: 14, summer: true },
  },
  {
    id: 'regular',
    name: 'Regelmäßig erholen',
    tagline: 'Alle paar Wochen eine Woche frei',
    description:
      'Verteilt die Tage möglichst gleichmäßig über das Jahr: regelmäßig mindestens 9 Tage am Stück frei, ohne lange Durststrecken.',
    minLen: 9,
    maxLeavePerBreak: 10,
    spread: { leavePerBreak: 5, weight: 0.6 },
  },
];

export interface OptimizeOptions {
  budget: number;
  requireLongBreak: boolean;
}

export interface OptimizeResult {
  /** Tagesindizes der frei zu nehmenden Arbeitstage */
  taken: number[];
  warnings: string[];
}

const LONG_MIN = 14;
const NEG = -Infinity;

export function optimize(cal: YearCalendar, def: ScenarioDef, opts: OptimizeOptions): OptimizeResult {
  const warnings: string[] = [];
  const work = cal.days.filter((d) => d.kind === 'work');
  const M = work.length;
  const W = work.map((d) => d.idx);
  const fixed = work.map((d) => !!d.fixed);
  const blocked = work.map((d) => !d.fixed && (!isBookable(d) || !!d.blocked));
  const pos = (k: number) => (k < 0 ? cal.prevWorkday : k >= M ? cal.nextWorkday : W[k]);

  const fixedCount = fixed.filter(Boolean).length;
  let B = Math.max(0, Math.floor(opts.budget));
  if (fixedCount > B) {
    warnings.push(`Die festen Zeiten benötigen ${fixedCount} Tage – ${fixedCount - B} mehr als verfügbar.`);
    B = fixedCount;
  }
  let fixedRuns = 0;
  for (let k = 0; k < M; k++) if (fixed[k] && (k === 0 || !fixed[k - 1])) fixedRuns++;

  // Wochentags-Feiertage (inkl. arbeitsfreier Tage) als Präfixsumme für einen kleinen Bonus,
  // damit bei gleicher Länge Brückentage vor normalen Wochenenden bevorzugt werden.
  const lo = cal.extStart;
  const span = cal.days.length - 2 * lo;
  const holPrefix = new Float64Array(span + 1);
  for (let i = 0; i < span; i++) {
    const idx = i + lo;
    const isHol = idx >= 0 && idx < cal.days.length
      ? cal.days[idx].kind === 'holiday' || cal.days[idx].kind === 'free'
      : false;
    holPrefix[i + 1] = holPrefix[i] + (isHol ? 1 : 0);
  }
  const holidaysBetween = (a: number, b: number) =>
    holPrefix[clamp(b - lo + 1, 0, span)] - holPrefix[clamp(a - lo, 0, span)];

  const long = def.long ?? (opts.requireLongBreak ? { minLen: LONG_MIN, summer: false } : undefined);
  // Sommerurlaub: Mitte der Auszeit zwischen 20.06. und 05.09., bevorzugt um den 31.07.
  const summerFrom = dayIndex(cal.year, 5, 20);
  const summerTo = dayIndex(cal.year, 8, 5);
  const summerPeak = dayIndex(cal.year, 6, 31);

  // Zustandsraum: (Budget b, Anzahl Auszeiten k, lange Auszeit h, Arbeitswochen seit letzter Auszeit r)
  const baseBreaks = def.maxBreaks ? def.maxBreaks(opts.budget) : null;
  const K = baseBreaks === null ? null : baseBreaks + fixedRuns;
  // Bei großem Budget muss jede Auszeit entsprechend mehr Tage aufnehmen können.
  const maxLeave = baseBreaks === null ? def.maxLeavePerBreak : Math.max(def.maxLeavePerBreak, Math.ceil(B / baseBreaks));
  const KK = K === null ? 1 : K + 1;
  const HH = long ? 2 : 1;
  const spread = def.spread;
  const expectedBreaks = spread ? Math.max(1, Math.round(B / spread.leavePerBreak)) : 0;
  const R = spread ? clamp(Math.round(52 / (expectedBreaks + 1)), 1, 12) : 0;
  const RR = spread ? R + 1 : 1;
  // Strafe je Arbeitswoche über dem Zielabstand
  const gapWeight = (spread?.weight ?? 0) * workdaysPerWeek(cal);
  // Erster Arbeitstag einer Kalenderwoche: dort zählt der Wochenzähler hoch.
  const weekStart = W.map((d, k) => k === 0 || cal.days[d].weekday <= cal.days[W[k - 1]].weekday || d - W[k - 1] >= 7);
  const S = (B + 1) * KK * HH * RR;
  const enc = (b: number, k: number, h: number, r: number) => ((b * KK + k) * HH + h) * RR + r;

  // Mögliche Auszeiten ab Arbeitstag i vorberechnen.
  interface Option { next: number; cost: number; value: number; long: boolean }
  const options: Option[][] = [];
  for (let i = 0; i < M; i++) {
    const list: Option[] = [];
    let cost = 0;
    let nonFixed = 0;
    let hasFixed = false;
    for (let j = i; j < M; j++) {
      if (blocked[j]) break;
      cost++;
      if (fixed[j]) hasFixed = true;
      else nonFixed++;
      // Feste Zeiten bleiben genau so, wie sie eingetragen sind: nicht verlängern.
      if (hasFixed && nonFixed > 0) break;
      if (nonFixed > maxLeave || cost > B) break;
      if (j + 1 < M && fixed[j + 1]) continue;
      const start = pos(i - 1) + 1;
      const end = pos(j + 1) - 1;
      const L = end - start + 1;
      if (!hasFixed && L < def.minLen) continue;
      const center = (start + end) / 2;
      const inSummer = center >= summerFrom && center <= summerTo;
      const isLong = !!long && L >= long.minLen && (!long.summer || inSummer);
      let value = L + 0.01 * holidaysBetween(start, end);
      if (isLong && long.summer) value += Math.max(0, 0.2 - 0.004 * Math.abs(center - summerPeak));
      list.push({ next: j + 2, cost, value, long: isLong });
    }
    options.push(list);
  }

  const score = new Float64Array((M + 2) * S).fill(NEG);
  const parent = new Int32Array((M + 2) * S).fill(-1);
  score[enc(0, 0, 0, 0)] = 0;

  const relax = (i: number, s: number, v: number, from: number) => {
    const at = i * S + s;
    if (v > score[at] + 1e-9) {
      score[at] = v;
      parent[at] = from;
    }
  };

  for (let i = 0; i <= M; i++) {
    const base = i * S;
    for (let s = 0; s < S; s++) {
      const v = score[base + s];
      if (v === NEG) continue;
      const r = s % RR;
      const h = Math.floor(s / RR) % HH;
      const k = Math.floor(s / (RR * HH)) % KK;
      const b = Math.floor(s / (RR * HH * KK));
      // Arbeitstag i wird gearbeitet.
      if (i === M) {
        relax(M + 1, s, v, base + s);
      } else if (!fixed[i]) {
        const tick = spread && weekStart[i];
        const r2 = tick ? Math.min(r + 1, R) : r;
        const penalty = tick && r + 1 > R ? gapWeight : 0;
        relax(i + 1, enc(b, k, h, r2), v - penalty, base + s);
      }
      if (i === M) continue;
      // Arbeitstage i..next-2 frei nehmen.
      if (K !== null && k + 1 > K) continue;
      const k2 = K === null ? 0 : k + 1;
      for (const o of options[i]) {
        if (b + o.cost > B) break;
        const h2 = o.long ? 1 : h;
        relax(o.next, enc(b + o.cost, k2, h2, 0), v + o.value, base + s);
      }
    }
  }

  // Bestes Endergebnis: lange Auszeit erfüllt > möglichst volles Budget > höchste Bewertung.
  const end = (M + 1) * S;
  let best = -1;
  let bestKey: [number, number, number] = [-1, -1, NEG];
  for (let s = 0; s < S; s++) {
    const v = score[end + s];
    if (v === NEG) continue;
    const h = Math.floor(s / RR) % HH;
    const b = Math.floor(s / (RR * HH * KK));
    const key: [number, number, number] = [h, b, v];
    if (
      key[0] > bestKey[0] ||
      (key[0] === bestKey[0] && key[1] > bestKey[1]) ||
      (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2] + 1e-9)
    ) {
      best = s;
      bestKey = key;
    }
  }

  const taken: number[] = [];
  if (best < 0) {
    warnings.push('Für dieses Szenario wurde kein gültiger Plan gefunden.');
    return { taken: work.filter((d) => d.fixed).map((d) => d.idx), warnings };
  }
  if (long && HH > 1 && bestKey[0] < 1) {
    warnings.push(
      long.summer
        ? 'Ein Sommerurlaub von mindestens zwei Wochen ließ sich nicht einplanen.'
        : 'Eine Auszeit von mindestens zwei Wochen am Stück ließ sich nicht einplanen.',
    );
  }
  if (bestKey[1] < Math.min(B, opts.budget)) {
    warnings.push(`${Math.min(B, opts.budget) - bestKey[1]} Tag(e) konnten nicht sinnvoll verplant werden.`);
  }

  let at = end + best;
  let i = M + 1;
  while (i > 0) {
    const from = parent[at];
    const i0 = Math.floor(from / S);
    // Übergang von i0 nach i: Arbeitstage i0..i-2 frei (leer bei i0 = i-1).
    for (let k = i0; k <= i - 2; k++) taken.push(W[k]);
    at = from;
    i = i0;
  }
  taken.sort((a, b) => a - b);
  return { taken, warnings };
}

function workdaysPerWeek(cal: YearCalendar): number {
  const weekdays = new Set(cal.days.filter((d) => d.kind === 'work' || d.kind === 'holiday' || d.kind === 'free').map((d) => d.weekday));
  return Math.max(1, weekdays.size);
}
