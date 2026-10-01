import { describe, expect, it } from 'vitest';
import { period, setup } from './testing';

describe('buildCalendar', () => {
  it('zählt Arbeitstage abzüglich Feiertagen (Bayern 2027: 261 Wochentage − 8 Feiertage)', () => {
    const { cal } = setup();
    expect(cal.days).toHaveLength(365);
    expect(cal.days.filter((d) => d.kind === 'work')).toHaveLength(253);
    expect(cal.days.filter((d) => d.kind === 'holiday')).toHaveLength(8);
  });

  it('kennt die Arbeitstage rund um den Jahreswechsel', () => {
    const { cal } = setup();
    // 31.12.2026 ist ein Donnerstag (Arbeitstag), der 03.01.2028 ein Montag.
    expect(cal.prevWorkday).toBe(-1);
    expect(cal.nextWorkday).toBe(367);
  });

  it('Heiligabend/Silvester optional arbeitsfrei', () => {
    const { cal, idx } = setup({ christmasEveOff: true, newYearsEveOff: true, year: 2026 });
    expect(cal.days[idx('2026-12-24')].kind).toBe('free');
    expect(cal.days[idx('2026-12-31')].kind).toBe('free');
  });

  it('Teilzeit: nur Mo–Do als Arbeitstage', () => {
    const { cal, idx } = setup({ workDays: [0, 1, 2, 3] });
    expect(cal.days[idx('2027-01-08')].kind).toBe('weekend'); // Freitag
  });

  it('markiert feste Zeiten, Sperren und arbeitsfreie Zeiträume', () => {
    const { cal, idx } = setup({}, [
      period('2027-08-02', '2027-08-06', 'fixed', 'eza'),
      period('2027-11-01', '2027-11-30', 'blocked'),
      period('2027-02-15', '2027-02-15', 'free'),
    ]);
    expect(cal.days[idx('2027-08-04')].fixed?.leaveType).toBe('eza');
    expect(cal.days[idx('2027-08-07')].fixed).toBeUndefined(); // Samstag
    expect(cal.days[idx('2027-11-02')].blocked).toBeTruthy();
    expect(cal.days[idx('2027-11-01')].blocked).toBeUndefined(); // Allerheiligen
    expect(cal.days[idx('2027-02-15')].kind).toBe('free');
  });

  it('schließt vergangene Tage im laufenden Jahr aus', () => {
    const { cal, idx } = setup({ excludePast: true }, [], '2027-06-15');
    expect(cal.days[idx('2027-06-14')].past).toBe(true);
    expect(cal.days[idx('2027-06-15')].past).toBeUndefined();
  });

  it('sperrt in anderen Jahren keine Tage als vergangen', () => {
    expect(setup({ excludePast: true }, [], '2028-03-01').cal.days.some((d) => d.past)).toBe(false);
    expect(setup({ excludePast: true }, [], '2026-10-01').cal.days.some((d) => d.past)).toBe(false);
  });
});
