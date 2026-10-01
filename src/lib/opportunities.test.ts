import { describe, expect, it } from 'vitest';
import { findOpportunities } from './opportunities';
import { setup } from './testing';

describe('findOpportunities', () => {
  it('findet die klassischen Brückentage (Bayern 2027)', () => {
    const { cal, idx } = setup();
    const opps = findOpportunities(cal);
    const ascension = opps.find((o) => o.title === 'Christi Himmelfahrt')!;
    expect(ascension.options[0]).toMatchObject({ cost: 1, length: 4, take: [idx('2027-05-07')] });
    const easter = opps.find((o) => o.title === 'Karfreitag')!;
    expect(easter.options.map((o) => [o.cost, o.length])).toEqual([
      [1, 5],
      [4, 10],
      [8, 16],
    ]);
  });

  it('berücksichtigt Weihnachten bis Neujahr über den Jahreswechsel', () => {
    const { cal } = setup({ year: 2026, state: 'NW' });
    const xmas = findOpportunities(cal).find((o) => o.title === '1. Weihnachtstag')!;
    expect(xmas.options.some((o) => o.endIso === '2027-01-03' && o.holidays.includes('Neujahr'))).toBe(true);
  });

  it('schlägt keine Tage in Urlaubssperren vor', () => {
    const { cal, idx } = setup({}, [{ id: 'x', from: '2027-05-07', to: '2027-05-07', label: '', kind: 'blocked', leaveType: 'auto' }]);
    const ascension = findOpportunities(cal).find((o) => o.title === 'Christi Himmelfahrt');
    for (const o of ascension?.options ?? []) expect(o.take).not.toContain(idx('2027-05-07'));
  });
});
