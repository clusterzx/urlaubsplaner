import { describe, expect, it } from 'vitest';
import { easterSunday, getHolidays } from './holidays';

const dates = (list: { date: string }[]) => list.map((h) => h.date);
const names = (list: { name: string }[]) => list.map((h) => h.name);

describe('easterSunday', () => {
  it.each([
    [2024, 2, 31],
    [2025, 3, 20],
    [2026, 3, 5],
    [2027, 2, 28],
    [2028, 3, 16],
    [2030, 3, 21],
    [2038, 3, 25],
  ])('%i', (year, month, day) => {
    expect(easterSunday(year)).toEqual({ month, day });
  });
});

describe('getHolidays', () => {
  it('Bayern 2027 inkl. Mariä Himmelfahrt (Standard) ohne Augsburger Friedensfest', () => {
    expect(dates(getHolidays(2027, 'BY'))).toEqual([
      '2027-01-01',
      '2027-01-06',
      '2027-03-26',
      '2027-03-29',
      '2027-05-01',
      '2027-05-06',
      '2027-05-17',
      '2027-05-27',
      '2027-08-15',
      '2027-10-03',
      '2027-11-01',
      '2027-12-25',
      '2027-12-26',
    ]);
  });

  it('regionale Feiertage lassen sich zu- und abschalten', () => {
    const withAugsburg = getHolidays(2027, 'BY', { 'by-augsburg': true, 'by-mariae': false });
    expect(names(withAugsburg)).toContain('Augsburger Hohes Friedensfest');
    expect(names(withAugsburg)).not.toContain('Mariä Himmelfahrt');
    expect(names(getHolidays(2027, 'SN', { 'sn-fronleichnam': true }))).toContain('Fronleichnam (regional)');
    expect(names(getHolidays(2027, 'SN'))).not.toContain('Fronleichnam (regional)');
  });

  it('Hamburg hat 10 Feiertage inkl. Reformationstag', () => {
    const hh = getHolidays(2026, 'HH');
    expect(hh).toHaveLength(10);
    expect(names(hh)).toContain('Reformationstag');
  });

  it('Buß- und Bettag in Sachsen', () => {
    expect(getHolidays(2026, 'SN').find((h) => h.name === 'Buß- und Bettag')?.date).toBe('2026-11-18');
    expect(getHolidays(2027, 'SN').find((h) => h.name === 'Buß- und Bettag')?.date).toBe('2027-11-17');
  });

  it('Berlin: Frauentag und einmaliger Tag der Befreiung 2025', () => {
    expect(names(getHolidays(2025, 'BE'))).toEqual(expect.arrayContaining(['Internationaler Frauentag', 'Tag der Befreiung']));
    expect(names(getHolidays(2026, 'BE'))).not.toContain('Tag der Befreiung');
  });

  it('Thüringen: Weltkindertag, NRW: Allerheiligen ohne Reformationstag', () => {
    expect(dates(getHolidays(2027, 'TH'))).toContain('2027-09-20');
    const nw = names(getHolidays(2027, 'NW'));
    expect(nw).toContain('Allerheiligen');
    expect(nw).not.toContain('Reformationstag');
  });
});
