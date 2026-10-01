'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/holidays.js');

const iso = (list) => list.map((h) => `${h.iso} ${h.name}`);

test('Ostersonntag für bekannte Jahre', () => {
  const expected = {
    2019: '2019-04-21', 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05',
    2027: '2027-03-28', 2028: '2028-04-16', 2030: '2030-04-21', 2038: '2038-04-25',
  };
  for (const [y, d] of Object.entries(expected)) assert.equal(H.toISO(H.easterSunday(+y)), d, `Ostern ${y}`);
});

test('Buß- und Bettag ist der Mittwoch vor dem 23. November', () => {
  assert.equal(H.toISO(H.bussUndBettag(2024)), '2024-11-20');
  assert.equal(H.toISO(H.bussUndBettag(2026)), '2026-11-18');
  assert.equal(H.toISO(H.bussUndBettag(2027)), '2027-11-17');
  // 22.11. ist selbst ein Mittwoch
  assert.equal(H.toISO(H.bussUndBettag(2028)), '2028-11-22');
});

test('Anzahl der Feiertage je Bundesland (2027)', () => {
  const expected = {
    BW: 12, BY: 12, BE: 10, BB: 12, HB: 10, HH: 10, HE: 10, MV: 11,
    NI: 10, NW: 11, RP: 11, SL: 12, SN: 11, ST: 11, SH: 10, TH: 11,
  };
  for (const [state, n] of Object.entries(expected)) {
    assert.equal(H.getHolidays(2027, state).length, n, `${state}: ${iso(H.getHolidays(2027, state)).join(', ')}`);
  }
});

test('Bayern 2027 mit Mariä Himmelfahrt (regional)', () => {
  const list = H.getHolidays(2027, 'BY', ['by-mariae']);
  assert.deepEqual(iso(list), [
    '2027-01-01 Neujahr',
    '2027-01-06 Heilige Drei Könige',
    '2027-03-26 Karfreitag',
    '2027-03-29 Ostermontag',
    '2027-05-01 Tag der Arbeit',
    '2027-05-06 Christi Himmelfahrt',
    '2027-05-17 Pfingstmontag',
    '2027-05-27 Fronleichnam',
    '2027-08-15 Mariä Himmelfahrt',
    '2027-10-03 Tag der Deutschen Einheit',
    '2027-11-01 Allerheiligen',
    '2027-12-25 1. Weihnachtstag',
    '2027-12-26 2. Weihnachtstag',
  ]);
});

test('Jahresabhängige Feiertage', () => {
  const names = (y, s) => H.getHolidays(y, s).map((h) => h.name);
  assert.ok(names(2025, 'BE').includes('Tag der Befreiung'));
  assert.ok(!names(2026, 'BE').includes('Tag der Befreiung'));
  assert.ok(names(2023, 'MV').includes('Internationaler Frauentag'));
  assert.ok(!names(2022, 'MV').includes('Internationaler Frauentag'));
  assert.ok(names(2018, 'NI').includes('Reformationstag'));
  assert.ok(!names(2016, 'NI').includes('Reformationstag'));
  assert.ok(names(2017, 'BY').includes('Reformationstag'), '500 Jahre Reformation: bundesweit');
  assert.ok(names(2027, 'TH').includes('Weltkindertag'));
  assert.ok(names(2027, 'SN').includes('Buß- und Bettag'));
});

test('Kalenderwoche nach ISO 8601', () => {
  const kw = (d) => H.isoWeek(H.fromISO(d));
  assert.equal(kw('2026-01-01'), 1);
  assert.equal(kw('2026-12-31'), 53);
  assert.equal(kw('2027-01-01'), 53);
  assert.equal(kw('2027-01-04'), 1);
  assert.equal(kw('2024-12-30'), 1);
  assert.equal(kw('2021-01-03'), 53);
});
