import { describe, expect, it } from 'vitest';
import { optimize, SCENARIOS } from './optimizer';
import { allocate, applyOverrides, computeBreaks, computeBudget, summarize, type Plan } from './plan';
import { defaultSettings } from './settings';
import { period, setup } from './testing';

describe('computeBudget', () => {
  it('rechnet Überstunden in ganze Gleitzeittage um (7,6 h = 1 Tag)', () => {
    const s = defaultSettings();
    expect(computeBudget({ ...s, overtimeHours: 45.6 })).toMatchObject({ overtime: 6, overtimeRestHours: 0 });
    expect(computeBudget({ ...s, overtimeHours: 22.8 })).toMatchObject({ overtime: 3, overtimeRestHours: 0 });
    expect(computeBudget({ ...s, overtimeHours: 42 })).toMatchObject({ overtime: 5, overtimeRestHours: 4 });
  });

  it('summiert Urlaub, Resturlaub, EZA und Gleitzeit; Reserve wird nicht verplant', () => {
    const b = computeBudget({ ...defaultSettings(), carryOverDays: 3, overtimeHours: 15.2, reserveDays: 2 });
    expect(b).toMatchObject({ vacation: 33, eza: 14, overtime: 2, total: 49, plannable: 47 });
  });
});

describe('allocate', () => {
  it('bucht nie mehr als je Konto verfügbar und hält Urlaub und EZA getrennt', () => {
    const { cal, budget, settings } = setup({ overtimeHours: 38 });
    const { taken } = optimize(cal, SCENARIOS[0], { budget: budget.plannable, requireLongBreak: true });
    const plan = allocate(cal, taken, budget, settings);
    const s = summarize(cal, plan, budget);
    expect(s.used).toEqual({ vacation: 30, eza: 14, overtime: 5 });
    expect(s.warnings).toEqual([]);
  });

  it('kurze Auszeiten zuerst aus Gleitzeit, lange aus Urlaub', () => {
    const { cal, budget, settings, idx } = setup({ overtimeHours: 7.6, ezaDays: 0, vacationDays: 10 });
    const taken = [idx('2027-05-07'), ...range(idx('2027-08-02'), idx('2027-08-06'))];
    const plan = allocate(cal, taken, budget, settings);
    expect(plan[idx('2027-05-07')]).toBe('overtime');
    expect(plan[idx('2027-08-02')]).toBe('vacation');
  });

  it('chronologisch nach Kontenreihenfolge', () => {
    const { cal, budget, settings, idx } = setup({
      allocationMode: 'chronological',
      allocationOrder: ['eza', 'vacation', 'overtime'],
      ezaDays: 1,
    });
    const plan = allocate(cal, [idx('2027-02-01'), idx('2027-02-02')], budget, settings);
    expect(plan[idx('2027-02-01')]).toBe('eza');
    expect(plan[idx('2027-02-02')]).toBe('vacation');
  });

  it('feste Zeiten mit Konto werden auf dieses Konto gebucht', () => {
    const { cal, budget, settings, idx } = setup({}, [period('2027-03-01', '2027-03-03', 'fixed', 'eza')]);
    const plan = allocate(cal, range(idx('2027-03-01'), idx('2027-03-03')), budget, settings);
    expect(plan.filter((t) => t === 'eza')).toHaveLength(3);
  });
});

describe('computeBreaks', () => {
  it('verbindet Urlaubstage mit Wochenenden und Feiertagen, auch über den Jahreswechsel', () => {
    const { cal, idx } = setup();
    const plan: Plan = new Array(cal.days.length).fill(null);
    for (const d of range(idx('2027-12-27'), idx('2027-12-31'))) plan[d] = 'vacation';
    plan[idx('2027-05-07')] = 'overtime';
    const breaks = computeBreaks(cal, plan);
    expect(breaks.map((b) => [b.startIso, b.endIso, b.length, b.leaveDays])).toEqual([
      ['2027-05-06', '2027-05-09', 4, 1],
      ['2027-12-25', '2028-01-02', 9, 5],
    ]);
    expect(breaks[1].holidays).toContain('Neujahr');
  });
});

describe('applyOverrides', () => {
  it('setzt Konten und entfernt Tage', () => {
    const { cal, budget, idx } = setup();
    const plan: Plan = new Array(cal.days.length).fill(null);
    plan[idx('2027-05-07')] = 'vacation';
    const edited = applyOverrides(cal, plan, { '2027-05-07': 'work', '2027-05-28': 'eza', '2027-05-29': 'eza' });
    expect(edited[idx('2027-05-07')]).toBeNull();
    expect(edited[idx('2027-05-28')]).toBe('eza');
    expect(edited[idx('2027-05-29')]).toBeNull(); // Samstag, nicht buchbar
    expect(summarize(cal, edited, { ...budget, eza: 0 }).warnings[0]).toMatch(/EZA/);
  });
});

function range(a: number, b: number): number[] {
  const r: number[] = [];
  for (let i = a; i <= b; i++) r.push(i);
  return r;
}
