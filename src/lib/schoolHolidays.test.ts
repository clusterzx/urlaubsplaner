import { describe, expect, it } from 'vitest';
import { STATES } from './holidays';
import { runScenarios } from './scenarios';
import {
  bundledAllSchoolHolidays,
  bundledSchoolHolidays,
  isAllCovered,
  isCovered,
  mergeSchoolHolidays,
  parseOpenHolidays,
  schoolEnvelope,
  type SchoolByState,
} from './schoolHolidays';
import { setup } from './testing';

const schoolBY = bundledSchoolHolidays('BY', 2027);

describe('mitgelieferte Schulferien', () => {
  it('enthalten die Sommerferien Bayern 2027 und die Weihnachtsferien über den Jahreswechsel', () => {
    expect(schoolBY).toContainEqual({ from: '2027-08-02', to: '2027-09-13', name: 'Sommerferien' });
    expect(schoolBY.some((h) => h.from.startsWith('2026-12') && h.to.startsWith('2027-01'))).toBe(true);
  });

  it('decken 2025–2029 für alle Bundesländer ab', () => {
    for (const { code } of STATES) {
      for (let year = 2025; year <= 2029; year++) {
        expect(isCovered(bundledSchoolHolidays(code, year), year), `${code} ${year}`).toBe(true);
      }
    }
    expect(isCovered(bundledSchoolHolidays('BY', 2040), 2040)).toBe(false);
  });
});

describe('schoolEnvelope (alle Bundesländer)', () => {
  it('ermittelt frühesten Beginn und spätestes Ende je Ferienart', () => {
    const all = bundledAllSchoolHolidays(2027);
    expect(isAllCovered(all, 2027)).toBe(true);
    const env = schoolEnvelope(all, 2027);
    const summer = env.find((e) => e.name === 'Sommerferien')!;
    expect(summer).toMatchObject({ from: '2027-06-28', to: '2027-09-13', states: 16 });
    expect(summer.last).toContain('BY');
    // Weihnachtsferien beider Jahreswechsel, Winter-/Faschingsferien zusammengefasst
    expect(env.filter((e) => e.name === 'Weihnachtsferien')).toHaveLength(2);
    expect(env.map((e) => e.name)).toEqual(expect.arrayContaining(['Winterferien', 'Osterferien', 'Pfingstferien', 'Herbstferien']));
    // jeder Landeszeitraum liegt innerhalb des bundesweiten Zeitraums
    for (const list of Object.values(all)) {
      for (const h of list.filter((x) => /sommer/i.test(x.name) && x.from.startsWith('2027'))) {
        expect(h.from >= summer.from && h.to <= summer.to).toBe(true);
      }
    }
  });

  it('einzelne bewegliche Ferientage zählen nicht', () => {
    const map = Object.fromEntries(STATES.map((s) => [s.code, []])) as unknown as SchoolByState;
    map.BY = [{ from: '2027-05-07', to: '2027-05-07', name: 'Tag nach Himmelfahrt' }];
    map.NW = [{ from: '2027-07-19', to: '2027-08-31', name: 'Sommerferien' }];
    map.HE = [{ from: '2027-06-28', to: '2027-08-06', name: 'Sommerferien' }];
    expect(schoolEnvelope(map, 2027)).toEqual([
      { name: 'Sommerferien', from: '2027-06-28', to: '2027-08-31', first: ['HE'], last: ['NW'], states: 2 },
    ]);
  });
});

describe('parseOpenHolidays', () => {
  it('nimmt nur allgemeinbildende Schulen und keine Sonderregeln', () => {
    const name = (text: string) => [{ language: 'DE', text }];
    const sub = [{ code: 'DE-MV' }];
    const list = parseOpenHolidays('MV', [
      { startDate: '2027-07-05', endDate: '2027-08-14', name: name('Sommerferien'), subdivisions: sub, groups: [{ code: 'DE-MV-ABS' }] },
      { startDate: '2027-07-12', endDate: '2027-08-28', name: name('Sommerferien'), subdivisions: sub, groups: [{ code: 'DE-MV-BBS' }] },
      { startDate: '2027-10-04', endDate: '2027-10-23', name: name('Herbstferien'), subdivisions: sub, comment: [{ text: 'Inseln' }] },
      { startDate: '2027-10-11', endDate: '2027-10-23', name: name('Herbstferien'), subdivisions: [{ code: 'DE-SH' }] },
    ]);
    expect(list).toEqual([{ from: '2027-07-05', to: '2027-08-14', name: 'Sommerferien' }]);
  });

  it('mergeSchoolHolidays entfernt Doppelte und sortiert', () => {
    const a = { from: '2027-03-01', to: '2027-03-05', name: 'A' };
    const b = { from: '2027-01-01', to: '2027-01-02', name: 'B' };
    expect(mergeSchoolHolidays([a], [b, a])).toEqual([b, a]);
  });
});

describe('Schulferien in der Planung', () => {
  const run = (schoolMode: 'show' | 'prefer' | 'only' | 'avoid') => {
    const { cal, budget, settings } = setup({ schoolMode, overtimeHours: 38 }, [], undefined, schoolBY);
    return { cal, results: Object.fromEntries(runScenarios(cal, budget, settings).map((r) => [r.def.id, r])) };
  };

  it('markiert Ferientage im Kalender', () => {
    const { cal, idx } = setup({ schoolMode: 'show' }, [], undefined, schoolBY);
    expect(cal.days[idx('2027-08-10')].school).toBe('Sommerferien');
    expect(cal.days[idx('2027-07-10')].school).toBeUndefined();
    expect(cal.summerSchool).toEqual([idx('2027-08-02'), idx('2027-09-13')]);
  });

  it('markiert den bundesweiten Ferienzeitraum zusätzlich', () => {
    const env = schoolEnvelope(bundledAllSchoolHolidays(2027), 2027);
    const { cal, idx } = setup({ schoolMode: 'show' }, [], undefined, schoolBY, env);
    expect(cal.days[idx('2027-07-10')]).toMatchObject({ schoolAll: 'Sommerferien' });
    expect(cal.days[idx('2027-07-10')].school).toBeUndefined();
    expect(cal.days[idx('2027-06-15')].schoolAll).toBeUndefined();
  });

  it('„bevorzugt“ legt mehr Tage in die Ferien, „meiden“ weniger', () => {
    const show = run('show').results;
    const prefer = run('prefer').results;
    const avoid = run('avoid').results;
    for (const id of Object.keys(show)) {
      expect(prefer[id].summary.leaveInSchool, id).toBeGreaterThan(show[id].summary.leaveInSchool);
      expect(avoid[id].summary.leaveInSchool, id).toBeLessThan(show[id].summary.leaveInSchool);
      expect(prefer[id].summary.totalLeave, id).toBe(show[id].summary.totalLeave);
    }
  });

  it('„nur in den Ferien“ plant ausschließlich in den Ferien, der Sommerurlaub liegt in den Sommerferien', () => {
    const { cal, results } = run('only');
    for (const r of Object.values(results)) {
      for (const day of cal.days) if (r.plan[day.idx]) expect(day.school, `${r.def.id} ${day.iso}`).toBeTruthy();
    }
    const summer = results.balanced.summary.breaks.find((b) => b.length >= 14 && b.school.includes('Sommerferien'));
    expect(summer).toBeDefined();
  });
});
