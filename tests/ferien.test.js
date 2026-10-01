'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/holidays.js');
const F = require('../js/ferien.js');
const O = require('../js/optimizer.js');

const ALL = H.STATES.map((s) => s.code);
const range = (f) => `${H.toISO(f.start)}..${H.toISO(f.end)}`;

test('Eingebaute Daten decken alle 16 Länder ab', () => {
  for (const y of [2025, 2026, 2027, 2028, 2029]) {
    assert.ok(F.hasFerienYear(y), `${y} fehlt`);
    for (const st of ALL) {
      const summer = F.getSchoolHolidays(y, st).filter((f) => f.cat === 'sommer' && new Date(f.start).getUTCFullYear() === y);
      assert.equal(summer.length, 1, `${st} ${y}: ${summer.length} Sommerferien`);
    }
  }
  assert.ok(!F.hasFerienYear(2040));
});

test('Bayern 2027', () => {
  const list = F.getSchoolHolidays(2027, 'BY').filter((f) => f.cat !== 'einzeln');
  assert.deepEqual(list.map((f) => `${f.label} ${range(f)}`), [
    'Weihnachtsferien 2026-12-24..2027-01-08',
    'Winterferien 2027-02-08..2027-02-12',
    'Osterferien 2027-03-22..2027-04-02',
    'Pfingstferien 2027-05-18..2027-05-28',
    'Sommerferien 2027-08-02..2027-09-13',
    'Herbstferien 2027-11-02..2027-11-05',
    'Weihnachtsferien 2027-12-24..2028-01-07',
  ]);
});

test('Zuordnung der Ferienarten', () => {
  assert.equal(F.categorizeFerien('Frühjahrsferien', '2027-02-08'), 'winter'); // Bayern (Fasching)
  assert.equal(F.categorizeFerien('Frühjahrsferien', '2027-03-01'), 'ostern'); // Hamburg
  assert.equal(F.categorizeFerien('Halbjahresferien', '2027-02-01'), 'winter');
  assert.equal(F.categorizeFerien('Tag nach Himmelfahrt', '2027-05-07'), 'einzeln');
  assert.equal(F.categorizeFerien('Weihnachtsferien', '2027-12-23'), 'weihnachten');
});

test('Ausnahmen und berufliche Schulen werden ignoriert', () => {
  const api = [
    { startDate: '2027-07-03', endDate: '2027-08-14', name: [{ language: 'DE', text: 'Sommerferien' }], subdivisions: [{ code: 'DE-SH', shortName: 'SH' }] },
    { startDate: '2027-07-03', endDate: '2027-08-07', name: [{ language: 'DE', text: 'Sommerferien' }], subdivisions: [{ code: 'DE-SH', shortName: 'SH' }], tags: ['Exception'] },
    { startDate: '2027-02-08', endDate: '2027-02-13', name: [{ language: 'DE', text: 'Winterferien' }], subdivisions: [{ code: 'DE-MV', shortName: 'MV' }], groups: [{ code: 'DE-MV-BBS' }] },
    { startDate: '2027-02-08', endDate: '2027-02-19', name: [{ language: 'DE', text: 'Winterferien' }], subdivisions: [{ code: 'DE-MV', shortName: 'MV' }], groups: [{ code: 'DE-MV-ABS' }] },
  ];
  assert.deepEqual(F.normalizeFerienApi(api), {
    SH: [['Sommerferien', '2027-07-03', '2027-08-14']],
    MV: [['Winterferien', '2027-02-08', '2027-02-19']],
  });
  // Auch im eingebauten Datenbestand: nur ein Sommerferien-Zeitraum für Schleswig-Holstein
  const sh = F.getSchoolHolidays(2027, 'SH').filter((f) => f.cat === 'sommer');
  assert.deepEqual(sh.map(range), ['2027-07-03..2027-08-14']);
});

test('Alle Länder: frühester Beginn und spätestes Ende', () => {
  const all = F.getCombinedFerien(2027);
  const summer = all.find((g) => g.cat === 'sommer');
  // Frühester Beginn = Minimum, spätestes Ende = Maximum über alle Länder
  const starts = ALL.map((st) => F.getSchoolHolidays(2027, st).find((f) => f.cat === 'sommer').start);
  const ends = ALL.map((st) => F.getSchoolHolidays(2027, st).find((f) => f.cat === 'sommer').end);
  assert.equal(summer.start, Math.min(...starts));
  assert.equal(summer.end, Math.max(...ends));
  assert.equal(summer.states.length, 16);
  assert.ok(summer.firstStates.length >= 1 && summer.lastStates.length >= 1);
  // Weihnachten über den Jahreswechsel wird je Saison getrennt geführt
  const xmas = all.filter((g) => g.cat === 'weihnachten');
  assert.equal(xmas.length, 2);
  assert.ok(xmas[0].end < H.ymd(2027, 2, 1));
  assert.ok(xmas[1].start > H.ymd(2027, 12, 1));
  // Einzelne schulfreie Tage zählen nicht mit
  assert.ok(all.every((g) => g.cat !== 'einzeln'));
});

test('Tageszählung „Länder mit Ferien“', () => {
  const map = F.statesOnHoliday(2027);
  // Am 10.09. sind nur noch wenige Länder in den Sommerferien, darunter Bayern; Mitte Juni noch nicht
  assert.ok(map.get(H.ymd(2027, 9, 10)).has('BY'));
  assert.ok(!map.has(H.ymd(2027, 6, 15)) || !map.get(H.ymd(2027, 6, 15)).has('BY'));
});

test('Haupturlaub in den Sommerferien des Bundeslands', () => {
  const result = O.computePlans({ year: 2027, state: 'BY', overtimeHours: 38, mainMode: 'sommer' });
  assert.equal(result.mainWindow.mode, 'sommer');
  const from = H.ymd(2027, 8, 2);
  const to = H.ymd(2027, 9, 13);
  for (const id of ['ausgewogen', 'sommer']) {
    const plan = result.plans.find((p) => p.scenario.id === id);
    const need = plan.scenario.mainDays;
    const ok = plan.stats.blocks.some((b) => b.booked >= need && b.ranges.every((r) => r.from >= from && r.to <= to));
    assert.ok(ok, `${id}: kein Haupturlaub in den bayerischen Sommerferien`);
  }
});

test('Ohne Feriendaten fällt der Haupturlaub auf die Wunschmonate zurück', () => {
  const result = O.computePlans({ year: 2040, state: 'BY', mainMode: 'sommer' });
  assert.equal(result.mainWindow.mode, 'months');
  const plan = result.plans.find((p) => p.scenario.id === 'ausgewogen');
  assert.ok(plan.notes.some((n) => n.includes('noch keine Sommerferien')));
});
