'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/holidays.js');
const O = require('../js/optimizer.js');

const base = { year: 2027, state: 'BY', urlaubDays: 30, ezaDays: 14, overtimeHours: 38, hoursPerDay: 7.6 };

function checkPlanInvariants(result, plan) {
  const { calendar: cal, budget } = result;
  const st = plan.stats;
  // Budget wird nie überschritten
  const bookedHalf = [...plan.assign].reduce((s, [i, a]) => s + (cal.days[i].inYear ? a.cost : 0), 0);
  assert.ok(bookedHalf <= budget.total, `${plan.scenario.id}: ${bookedHalf} > ${budget.total}`);
  // Keine Buchung auf freien oder gesperrten Tagen
  for (const [i, a] of plan.assign) {
    const d = cal.days[i];
    assert.ok(d.cost > 0, `${plan.scenario.id}: ${d.iso} ist kein Arbeitstag`);
    assert.ok(!d.blocked, `${plan.scenario.id}: ${d.iso} liegt in einer Sperrzeit`);
    assert.ok(O.POOLS.includes(a.type));
  }
  // Blöcke überlappen nicht und sind durch mindestens einen Arbeitstag getrennt
  for (let k = 1; k < st.blocks.length; k++) {
    assert.ok(st.blocks[k].startIndex > st.blocks[k - 1].endIndex + 1, `${plan.scenario.id}: Blöcke ${k - 1}/${k} berühren sich`);
  }
  // Summen passen zusammen
  const sum = st.blocks.reduce((s, b) => s + b.booked, 0);
  assert.equal(sum, st.totalBooked);
  assert.equal(st.used.urlaub + st.used.eza + st.used.gleit, st.totalBooked);
  // Feste Zeiträume zählen nicht zur Blockgrenze des Szenarios
  const fixedBlocks = st.blocks.filter((b) => b.fixed).length;
  assert.ok(st.blocks.length <= plan.scenario.maxBlocks + fixedBlocks, `${plan.scenario.id}: zu viele Blöcke`);
}

test('Gleittage aus Überstunden: 7,6 h = 1 Tag, abgerundet', () => {
  assert.equal(O.poolsFor(O.normalizeSettings({ overtimeHours: 38, hoursPerDay: 7.6 })).gleit, 10);
  assert.equal(O.poolsFor(O.normalizeSettings({ overtimeHours: 45.6, hoursPerDay: 7.6 })).gleit, 12);
  assert.equal(O.poolsFor(O.normalizeSettings({ overtimeHours: 15.2, hoursPerDay: 7.6 })).gleit, 4);
  assert.equal(O.poolsFor(O.normalizeSettings({ overtimeHours: 7.5, hoursPerDay: 7.6 })).gleit, 0);
});

test('Alle Szenarien verbrauchen das komplette Kontingent und halten die Regeln ein', () => {
  const result = O.computePlans(base);
  assert.equal(result.plans.length, 5);
  for (const plan of result.plans) {
    checkPlanInvariants(result, plan);
    assert.equal(plan.stats.totalBooked, 49, plan.scenario.id);
    assert.deepEqual(plan.stats.remaining, { urlaub: 0, eza: 0, gleit: 0 }, plan.scenario.id);
    assert.equal(plan.stats.warnings.length, 0);
    // Jeder eingesetzte Tag bringt mindestens das Wochenende mit
    assert.ok(plan.stats.efficiency > 1.6, `${plan.scenario.id}: Faktor ${plan.stats.efficiency}`);
  }
});

test('Haupturlaub liegt im Wunschzeitraum', () => {
  const result = O.computePlans({ ...base, mainFrom: 7, mainTo: 8 });
  for (const id of ['ausgewogen', 'sommer']) {
    const plan = result.plans.find((p) => p.scenario.id === id);
    const need = plan.scenario.mainDays;
    const jul1 = H.ymd(2027, 7, 1);
    const aug31 = H.ymd(2027, 8, 31);
    const ok = plan.stats.blocks.some((b) => b.booked >= need
      && b.ranges.every((r) => r.from >= jul1 && r.to <= aug31));
    assert.ok(ok, `${id}: kein Block mit ${need} Arbeitstagen im Juli/August`);
  }
});

test('Mit nur einem Tag wird der beste Brückentag gewählt (Gründonnerstag: 5 Tage frei)', () => {
  const result = O.computePlans({ ...base, urlaubDays: 1, ezaDays: 0, overtimeHours: 0 });
  const plan = result.plans.find((p) => p.scenario.id === 'effizienz');
  assert.equal(plan.stats.blocks.length, 1);
  assert.equal(plan.stats.blocks[0].len, 5);
  assert.equal(H.toISO(plan.stats.blocks[0].ranges[0].from), '2027-03-25');
  assert.equal(plan.stats.totalBooked, 1);
});

test('Optimierer schlägt eine Brute-Force-Suche nicht (kleines Budget)', () => {
  // Bei 2 Tagen Budget: bester Wert über alle Paare von Kandidaten
  const s = O.normalizeSettings({ ...base, urlaubDays: 2, ezaDays: 0, overtimeHours: 0 });
  const cal = O.buildCalendar(s);
  const cands = O.buildCandidates(cal, 10);
  let best = 0;
  for (const a of cands) {
    if (a.cost === 4) best = Math.max(best, a.value);
    if (a.cost !== 2) continue;
    for (const b of cands) {
      if (b.cost === 2 && b.rs > a.re + 1) best = Math.max(best, a.value + b.value);
    }
  }
  const { selected } = O.optimize(cal, cands, { budget: 4, maxBlocks: 12, maxBlockDays: 10, main: null });
  assert.equal(selected.reduce((sum, c) => sum + c.value, 0), best);
});

test('Feste Zeiträume werden mit der gewählten Art verbucht, Sperrzeiten bleiben frei', () => {
  const result = O.computePlans({
    ...base,
    fixed: [
      { id: 'a', from: '2027-06-14', to: '2027-06-18', label: 'Hochzeit', type: 'eza' },
      { id: 'b', from: '2027-09-01', to: '2027-09-30', label: 'Projekt', type: 'sperre' },
      { id: 'c', from: '2027-02-15', to: '2027-02-16', label: '', type: 'auto' },
    ],
  });
  const cal = result.calendar;
  assert.equal(result.budget.fixedCost, 14); // 5 + 2 Arbeitstage
  for (const plan of result.plans) {
    checkPlanInvariants(result, plan);
    for (let t = H.ymd(2027, 6, 14); t <= H.ymd(2027, 6, 18); t += H.DAY_MS) {
      const a = plan.assign.get(O.indexOf(cal, t));
      assert.equal(a && a.type, 'eza', `${plan.scenario.id} ${H.toISO(t)}`);
      assert.ok(a.fixed);
    }
    assert.ok(plan.assign.has(O.indexOf(cal, H.ymd(2027, 2, 15))));
    for (let t = H.ymd(2027, 9, 1); t <= H.ymd(2027, 9, 30); t += H.DAY_MS) {
      assert.ok(!plan.assign.has(O.indexOf(cal, t)), `${plan.scenario.id}: ${H.toISO(t)} in Sperrzeit gebucht`);
    }
    const block = plan.stats.blocks.find((b) => b.labels.includes('Hochzeit'));
    assert.ok(block && block.fixed);
  }
});

test('Halbe Tage an Heiligabend/Silvester zählen 0,5', () => {
  const s = O.normalizeSettings({ ...base, year: 2026, specialDays: 'half' });
  const cal = O.buildCalendar(s);
  const d24 = cal.days[O.indexOf(cal, H.ymd(2026, 12, 24))];
  assert.equal(d24.cost, 1);
  const free = O.buildCalendar(O.normalizeSettings({ ...base, year: 2026, specialDays: 'free' }));
  assert.equal(free.days[O.indexOf(free, H.ymd(2026, 12, 31))].cost, 0);
  const result = O.computePlans({ ...base, year: 2026, specialDays: 'half' });
  for (const plan of result.plans) checkPlanInvariants(result, plan);
});

test('Brückentage werden bevorzugt mit Gleitzeit abgedeckt', () => {
  const result = O.computePlans({ ...base, orderId: 'urlaub-eza-gleit', gleitForBridges: true });
  const plan = result.plans.find((p) => p.scenario.id === 'wochenenden');
  const short = plan.stats.blocks.filter((b) => b.booked <= 2);
  const gleitInShort = short.reduce((s, b) => s + b.used.gleit, 0);
  assert.equal(gleitInShort, 5, 'alle 5 Gleittage gehen in kurze Blöcke');

  const off = O.computePlans({ ...base, orderId: 'urlaub-eza-gleit', gleitForBridges: false });
  const plan2 = off.plans.find((p) => p.scenario.id === 'wochenenden');
  // Ohne Vorrang wird zuerst Urlaub verbraucht, Gleitzeit erst am Jahresende
  const firstGleit = plan2.stats.blocks.find((b) => b.used.gleit > 0);
  const lastUrlaub = [...plan2.stats.blocks].reverse().find((b) => b.used.urlaub > 0);
  assert.ok(firstGleit.start >= lastUrlaub.start);
});

test('Manuelle Änderungen per Klick werden übernommen', () => {
  const first = O.computePlans(base);
  const plan = first.plans.find((p) => p.scenario.id === 'ausgewogen');
  const cal = first.calendar;
  const bookedIdx = [...plan.assign.keys()].find((i) => !plan.assign.get(i).fixed);
  const freeWork = cal.days.find((d, i) => d.inYear && d.cost === 2 && !plan.assign.has(i));
  const overrides = { ausgewogen: { [cal.days[bookedIdx].iso]: 'none', [freeWork.iso]: 'gleit' } };
  const second = O.computePlans(base, overrides);
  const p2 = second.plans.find((p) => p.scenario.id === 'ausgewogen');
  assert.ok(p2.modified);
  assert.ok(!p2.assign.has(bookedIdx));
  assert.equal(p2.assign.get(freeWork.i).type, 'gleit');
  assert.equal(p2.stats.totalBooked, plan.stats.totalBooked);
  assert.ok(p2.stats.remaining.gleit < 0 || p2.stats.used.gleit === plan.stats.used.gleit + 1 - (plan.assign.get(bookedIdx).type === 'gleit' ? 1 : 0));
});

test('Brückentage-Übersicht findet die klassischen Kombinationen', () => {
  const result = O.computePlans(base);
  const himmelfahrt = result.opportunities.find((o) => o.holidays.some((h) => h.name === 'Christi Himmelfahrt'));
  assert.ok(himmelfahrt);
  const one = himmelfahrt.options.find((o) => o.days === 1);
  assert.equal(H.toISO(one.from), '2027-05-07');
  assert.equal(one.free, 4);
  const easter = result.opportunities.find((o) => o.holidays.some((h) => h.name === 'Karfreitag'));
  assert.ok(easter.options.some((o) => o.days === 4 && o.free === 10));
});

test('Andere Arbeitswoche (Mo–Do) und Reserve', () => {
  const result = O.computePlans({ ...base, workdays: [1, 2, 3, 4], reserveDays: 3 });
  for (const plan of result.plans) {
    checkPlanInvariants(result, plan);
    assert.equal(plan.stats.totalBooked, 46);
    for (const [i] of plan.assign) assert.notEqual(result.calendar.days[i].dow, 5, 'kein Freitag gebucht');
  }
});

test('Eingaben werden bereinigt', () => {
  const s = O.normalizeSettings({ year: 'abc', state: 'XX', urlaubDays: -5, hoursPerDay: 0, mainFrom: 9, mainTo: 6, fixed: [{ from: 'kaputt' }] });
  assert.equal(s.state, 'BY');
  assert.equal(s.urlaubDays, 0);
  assert.equal(s.hoursPerDay, 0.5);
  assert.deepEqual([s.mainFrom, s.mainTo], [6, 9]);
  assert.equal(s.fixed.length, 0);
});
