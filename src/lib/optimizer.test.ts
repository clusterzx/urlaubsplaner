import { describe, expect, it } from 'vitest';
import { dayIndex } from './dates';
import { optimize, SCENARIOS } from './optimizer';
import { runScenarios } from './scenarios';
import { period, setup } from './testing';

describe('optimize', () => {
  it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s: verplant genau das Budget und nur Arbeitstage', (_id, def) => {
    const { cal, budget } = setup({ overtimeHours: 38 });
    const { taken, warnings } = optimize(cal, def, { budget: budget.plannable, requireLongBreak: true });
    expect(taken).toHaveLength(budget.plannable);
    expect(new Set(taken).size).toBe(taken.length);
    for (const d of taken) expect(cal.days[d].kind).toBe('work');
    expect(warnings).toEqual([]);
  });

  it('jedes Szenario enthält eine Auszeit von mindestens zwei Wochen', () => {
    const { cal, budget, settings } = setup();
    for (const r of runScenarios(cal, budget, settings)) {
      expect(r.summary.longest, r.def.id).toBeGreaterThanOrEqual(14);
    }
  });

  it('„Ausgewogen“ plant einen Sommerurlaub', () => {
    const { cal, budget, settings } = setup();
    const balanced = runScenarios(cal, budget, settings).find((r) => r.def.id === 'balanced')!;
    const summer = balanced.summary.breaks.find(
      (b) => b.length >= 14 && (b.start + b.end) / 2 >= dayIndex(2027, 5, 20) && (b.start + b.end) / 2 <= dayIndex(2027, 8, 5),
    );
    expect(summer).toBeDefined();
  });

  it('„Lange Auszeiten“ bleibt bei wenigen Auszeiten, „Maximale Effizienz“ holt die meisten Tage heraus', () => {
    const { cal, budget, settings } = setup();
    const results = Object.fromEntries(runScenarios(cal, budget, settings).map((r) => [r.def.id, r.summary]));
    expect(results.long.breaks.length).toBeLessThanOrEqual(4);
    for (const id of ['balanced', 'long', 'regular']) {
      expect(results.efficient.breakDays).toBeGreaterThanOrEqual(results[id].breakDays);
    }
  });

  it('nutzt die klassischen Brückentage (Bayern 2027)', () => {
    const { cal, budget, idx } = setup();
    const def = SCENARIOS.find((s) => s.id === 'efficient')!;
    const { taken } = optimize(cal, def, { budget: budget.plannable, requireLongBreak: true });
    // Freitag nach Christi Himmelfahrt und nach Fronleichnam
    expect(taken).toContain(idx('2027-05-07'));
    expect(taken).toContain(idx('2027-05-28'));
  });

  it('übernimmt feste Zeiten exakt und plant nicht in Sperren', () => {
    const fixed = period('2027-08-02', '2027-08-13');
    const blocked = period('2027-03-01', '2027-04-30', 'blocked');
    const { cal, budget, idx } = setup({}, [fixed, blocked]);
    for (const def of SCENARIOS) {
      const { taken } = optimize(cal, def, { budget: budget.plannable, requireLongBreak: true });
      const set = new Set(taken);
      for (let d = idx('2027-08-02'); d <= idx('2027-08-13'); d++) {
        if (cal.days[d].kind === 'work') expect(set.has(d), def.id).toBe(true);
      }
      // nicht verlängert: Freitag davor und Montag danach bleiben Arbeitstage
      expect(set.has(idx('2027-07-30')), def.id).toBe(false);
      expect(set.has(idx('2027-08-16')), def.id).toBe(false);
      for (let d = idx('2027-03-01'); d <= idx('2027-04-30'); d++) expect(set.has(d), def.id).toBe(false);
    }
  });

  it('warnt, wenn feste Zeiten das Budget übersteigen', () => {
    const { cal } = setup({}, [period('2027-06-01', '2027-07-31')]);
    const { taken, warnings } = optimize(cal, SCENARIOS[0], { budget: 10, requireLongBreak: true });
    expect(taken.length).toBeGreaterThan(10);
    expect(warnings[0]).toMatch(/mehr als verfügbar/);
  });

  it('plant ohne Budget nichts', () => {
    const { cal } = setup();
    for (const def of SCENARIOS) expect(optimize(cal, def, { budget: 0, requireLongBreak: true }).taken).toEqual([]);
  });

  it('plant im laufenden Jahr nur ab heute', () => {
    const { cal, budget, idx } = setup({ excludePast: true }, [], '2027-09-01');
    for (const def of SCENARIOS) {
      const { taken } = optimize(cal, def, { budget: 20, requireLongBreak: true });
      expect(taken.length, def.id).toBe(20);
      expect(Math.min(...taken), def.id).toBeGreaterThanOrEqual(idx('2027-09-01'));
    }
    expect(budget.plannable).toBeGreaterThan(20);
  });

  it('rechnet auch große Budgets zügig', () => {
    const { cal, budget, settings } = setup({ overtimeHours: 200, carryOverDays: 10 });
    const t0 = performance.now();
    const results = runScenarios(cal, budget, settings);
    expect(performance.now() - t0).toBeLessThan(3000);
    for (const r of results) expect(r.summary.totalLeave, r.def.id).toBe(budget.plannable);
  });
});
