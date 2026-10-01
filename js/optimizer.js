/*
 * Planungs-Engine: baut den Jahreskalender, sucht die besten Urlaubsblöcke per
 * dynamischer Programmierung und verteilt die gebuchten Tage auf die
 * Kontingente Urlaub, EZA und Gleitzeit.
 *
 * Alle Kosten werden in HALBEN Tagen gerechnet (ganzer Arbeitstag = 2), damit
 * halbe Arbeitstage wie Heiligabend/Silvester exakt abgebildet werden können.
 */
(function (root, factory) {
  const H = typeof module === 'object' && module.exports ? require('./holidays.js') : root.UP;
  const mod = factory(H);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.UP = Object.assign(root.UP || {}, mod);
})(typeof self !== 'undefined' ? self : this, function (H) {
  'use strict';

  const { ymd, addDays, toISO, fromISO, dow, daysInYear } = H;

  /** Tage vor/nach dem Jahr, damit Blöcke über den Jahreswechsel korrekt gezählt werden. */
  const MARGIN = 14;
  /** Obergrenze für das Planungsbudget (halbe Tage) – hält die DP-Tabellen klein. */
  const MAX_BUDGET = 200;

  const POOLS = ['urlaub', 'eza', 'gleit'];
  const POOL_LABEL = { urlaub: 'Urlaub', eza: 'EZA', gleit: 'Gleitzeit' };

  const ORDERS = [
    { id: 'gleit-eza-urlaub', label: 'Gleitzeit → EZA → Urlaub', order: ['gleit', 'eza', 'urlaub'] },
    { id: 'eza-gleit-urlaub', label: 'EZA → Gleitzeit → Urlaub', order: ['eza', 'gleit', 'urlaub'] },
    { id: 'eza-urlaub-gleit', label: 'EZA → Urlaub → Gleitzeit', order: ['eza', 'urlaub', 'gleit'] },
    { id: 'gleit-urlaub-eza', label: 'Gleitzeit → Urlaub → EZA', order: ['gleit', 'urlaub', 'eza'] },
    { id: 'urlaub-eza-gleit', label: 'Urlaub → EZA → Gleitzeit', order: ['urlaub', 'eza', 'gleit'] },
    { id: 'urlaub-gleit-eza', label: 'Urlaub → Gleitzeit → EZA', order: ['urlaub', 'gleit', 'eza'] },
  ];

  const SCENARIOS = [
    {
      id: 'effizienz',
      name: 'Brückentage-Maximum',
      description: 'Holt aus jedem freien Tag das Maximum heraus: Brückentage, Feiertags-Kombis und kurze Auszeiten.',
      maxBlocks: 12, maxBlockDays: 10, mainDays: 0,
    },
    {
      id: 'ausgewogen',
      name: 'Ausgewogen',
      description: 'Zwei Wochen Haupturlaub im Wunschzeitraum plus die lohnendsten Brückentage.',
      maxBlocks: 8, maxBlockDays: 15, mainDays: 10,
    },
    {
      id: 'sommer',
      name: 'Großer Haupturlaub',
      description: 'Drei Wochen am Stück im Wunschzeitraum, dazu wenige, aber lange Auszeiten.',
      maxBlocks: 5, maxBlockDays: 20, mainDays: 15,
    },
    {
      id: 'wochenenden',
      name: 'Viele lange Wochenenden',
      description: 'Kurze Auszeiten von höchstens drei Arbeitstagen – möglichst viele verlängerte Wochenenden.',
      maxBlocks: 26, maxBlockDays: 3, mainDays: 0,
    },
  ];

  const DEFAULTS = {
    year: new Date().getFullYear() + 1,
    state: 'BY',
    regional: null, // null = Standardauswahl des Bundeslandes
    urlaubDays: 30,
    ezaDays: 14,
    overtimeHours: 0,
    hoursPerDay: 7.6,
    reserveDays: 0,
    workdays: [1, 2, 3, 4, 5],
    specialDays: 'normal', // 24.12./31.12.: normal | half | free
    mainFrom: 7,
    mainTo: 8,
    orderId: 'gleit-eza-urlaub',
    gleitForBridges: true,
    custom: { maxBlocks: 6, mainDays: 10, maxBlockDays: 15 },
    fixed: [],
  };

  const num = (v, def, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  };

  /** Bereinigt Eingaben und füllt Standardwerte auf. */
  function normalizeSettings(raw = {}) {
    const s = { ...DEFAULTS, ...raw };
    s.year = Math.round(num(s.year, DEFAULTS.year, 1990, 2100));
    if (!H.STATES.some((x) => x.code === s.state)) s.state = DEFAULTS.state;
    const regionalOpts = H.regionalOptions(s.state);
    s.regional = Array.isArray(s.regional)
      ? s.regional.filter((id) => regionalOpts.some((r) => r.id === id))
      : regionalOpts.filter((r) => r.defaultOn).map((r) => r.id);
    s.urlaubDays = num(s.urlaubDays, 30, 0, 100);
    s.ezaDays = num(s.ezaDays, 14, 0, 100);
    s.overtimeHours = num(s.overtimeHours, 0, 0, 2000);
    s.hoursPerDay = num(s.hoursPerDay, 7.6, 0.5, 24);
    s.reserveDays = num(s.reserveDays, 0, 0, 100);
    s.workdays = Array.isArray(s.workdays) ? s.workdays.map(Number).filter((d) => d >= 0 && d <= 6) : DEFAULTS.workdays;
    if (!s.workdays.length) s.workdays = DEFAULTS.workdays.slice();
    if (!['normal', 'half', 'free'].includes(s.specialDays)) s.specialDays = 'normal';
    s.mainFrom = Math.round(num(s.mainFrom, 7, 1, 12));
    s.mainTo = Math.round(num(s.mainTo, 8, 1, 12));
    if (s.mainTo < s.mainFrom) [s.mainFrom, s.mainTo] = [s.mainTo, s.mainFrom];
    if (!ORDERS.some((o) => o.id === s.orderId)) s.orderId = DEFAULTS.orderId;
    s.gleitForBridges = s.gleitForBridges !== false;
    const c = { ...DEFAULTS.custom, ...(s.custom || {}) };
    s.custom = {
      maxBlocks: Math.round(num(c.maxBlocks, 6, 1, 20)),
      mainDays: Math.round(num(c.mainDays, 10, 0, 30)),
      maxBlockDays: Math.round(num(c.maxBlockDays, 15, 1, 30)),
    };
    s.custom.maxBlockDays = Math.max(s.custom.maxBlockDays, s.custom.mainDays);
    s.fixed = (Array.isArray(s.fixed) ? s.fixed : [])
      .filter((f) => f && /^\d{4}-\d{2}-\d{2}$/.test(f.from) && /^\d{4}-\d{2}-\d{2}$/.test(f.to || f.from))
      .map((f, i) => {
        const a = f.from;
        const b = f.to || f.from;
        return {
          id: f.id || `f${i}`,
          from: a <= b ? a : b,
          to: a <= b ? b : a,
          label: String(f.label || '').slice(0, 80),
          type: ['auto', 'urlaub', 'eza', 'gleit', 'sperre'].includes(f.type) ? f.type : 'auto',
        };
      });
    return s;
  }

  /** Verfügbare Kontingente in halben Tagen. */
  function poolsFor(s) {
    return {
      urlaub: Math.round(s.urlaubDays * 2),
      eza: Math.round(s.ezaDays * 2),
      gleit: Math.floor(s.overtimeHours / s.hoursPerDay + 1e-9) * 2,
    };
  }

  /**
   * Baut den Kalender des Jahres (plus Randtage) mit allen Eigenschaften, die
   * Optimierer und Darstellung brauchen.
   */
  function buildCalendar(s) {
    const jan1 = ymd(s.year, 1, 1);
    const n = daysInYear(s.year);
    const start = addDays(jan1, -MARGIN);
    const total = n + 2 * MARGIN;

    const holidays = new Map();
    for (const y of [s.year - 1, s.year, s.year + 1]) {
      for (const h of H.getHolidays(y, s.state, s.regional)) holidays.set(h.date, h.name);
    }

    const fixedMap = new Map();
    const blockedSet = new Set();
    for (const f of s.fixed) {
      for (let t = fromISO(f.from); t <= fromISO(f.to); t = addDays(t, 1)) {
        if (f.type === 'sperre') blockedSet.add(t);
        else if (!fixedMap.has(t)) fixedMap.set(t, f);
      }
    }

    const days = [];
    for (let i = 0; i < total; i++) {
      const t = addDays(start, i);
      const d = new Date(t);
      const weekday = dow(t);
      const m = d.getUTCMonth() + 1;
      const dd = d.getUTCDate();
      const holiday = holidays.get(t) || null;
      const workday = s.workdays.includes(weekday);
      const isSpecial = m === 12 && (dd === 24 || dd === 31);
      const special = isSpecial && s.specialDays !== 'normal' ? s.specialDays : null;
      const off = !workday || !!holiday || special === 'free';
      days.push({
        i, t, iso: toISO(t), dow: weekday, month: m, day: dd,
        inYear: i >= MARGIN && i < MARGIN + n,
        workday, holiday, special,
        cost: off ? 0 : special === 'half' ? 1 : 2,
        fixed: fixedMap.get(t) || null,
        blocked: blockedSet.has(t) && !fixedMap.has(t),
      });
    }
    return { year: s.year, start, firstIndex: MARGIN, lastIndex: MARGIN + n - 1, days };
  }

  /** Index eines Datums im Kalender (oder -1). */
  function indexOf(cal, t) {
    const i = Math.round((t - cal.start) / H.DAY_MS);
    return i >= 0 && i < cal.days.length ? i : -1;
  }

  /**
   * Erzeugt alle sinnvollen Urlaubsblöcke: zusammenhängende Arbeitstage [a, b],
   * die an mindestens einer Seite an freie Tage (Wochenende, Feiertag, fester
   * Urlaub) grenzen. "value" = zusätzliche freie Tage am Stück, die der Block bringt.
   */
  function buildCandidates(cal, maxDays) {
    const { days } = cal;
    const N = days.length;
    const free = days.map((d) => d.cost === 0 || !!d.fixed);
    const bookable = days.map((d) => d.inYear && d.cost > 0 && !d.fixed && !d.blocked);

    const freeLeft = new Int32Array(N);
    for (let i = 1; i < N; i++) freeLeft[i] = free[i - 1] ? freeLeft[i - 1] + 1 : 0;
    const freeRight = new Int32Array(N);
    for (let i = N - 2; i >= 0; i--) freeRight[i] = free[i + 1] ? freeRight[i + 1] + 1 : 0;

    // Freie Abschnitte, die schon einen festen Termin enthalten, zählen nicht
    // als "gewonnen" – sonst würde jede Verlängerung eines festen Urlaubs
    // dessen komplette Länge gutgeschrieben bekommen.
    const fixedRunDay = new Int32Array(N);
    const fixedWork = new Int32Array(N);
    for (let i = 0; i < N;) {
      if (!free[i]) { i++; continue; }
      let j = i;
      while (j + 1 < N && free[j + 1]) j++;
      let hasFixed = false;
      for (let k = i; k <= j; k++) if (days[k].fixed) hasFixed = true;
      if (hasFixed) for (let k = i; k <= j; k++) {
        fixedRunDay[k] = 1;
        if (days[k].fixed) fixedWork[k] = days[k].cost;
      }
      i = j + 1;
    }
    const prefix = (arr) => {
      const p = new Int32Array(N + 1);
      for (let i = 0; i < N; i++) p[i + 1] = p[i] + arr[i];
      return p;
    };
    const pRun = prefix(fixedRunDay);
    const pWork = prefix(fixedWork);
    // Tage, die einen Block "besonders" machen (Feiertag auf Arbeitstag,
    // Heiligabend/Silvester-Regel, Jahresgrenze). Blöcke ohne solche Tage sind
    // austauschbar und dürfen später übers Jahr verteilt werden.
    const pSpecial = prefix(days.map((d) => ((d.holiday && d.workday) || d.special || !d.inYear ? 1 : 0)));

    const cands = [];
    for (let a = 0; a < N; a++) {
      if (!bookable[a] || free[a]) continue;
      let cost = 0;
      let cnt = 0;
      for (let b = a; b < N; b++) {
        if (free[b]) continue;
        if (!bookable[b]) break;
        cost += days[b].cost;
        cnt++;
        if (cnt > maxDays) break;
        if (freeLeft[a] === 0 && freeRight[b] === 0) continue;
        const rs = a - freeLeft[a];
        const re = b + freeRight[b];
        const absorbed = pRun[re + 1] - pRun[rs];
        cands.push({
          a, b, rs, re, cost, cnt,
          runLen: re - rs + 1,
          value: re - rs + 1 - absorbed,
          mainCost: cost + (pWork[re + 1] - pWork[rs]),
          absorbsFixed: absorbed > 0,
          plain: absorbed === 0 && pSpecial[re + 1] - pSpecial[rs] === 0,
        });
      }
    }
    return cands;
  }

  /**
   * Dynamische Programmierung über die Tage des Jahres:
   * best[d][c][k][f] = maximaler Wert mit Blöcken, deren freier Abschnitt vor
   * Tag d endet, bei c verbrauchten halben Tagen, k Blöcken und Flag f
   * ("Haupturlaub eingeplant"). Zwischen zwei Blöcken liegt immer mindestens
   * ein Arbeitstag, sonst wären sie ein einziger Block.
   */
  function optimize(cal, cands, opts) {
    const N = cal.days.length;
    const B = Math.max(0, Math.min(MAX_BUDGET, Math.floor(opts.budget)));
    const K = Math.max(1, opts.maxBlocks);
    const main = opts.main; // { minCost, a, b } oder null
    const F = main ? 2 : 1;
    const KF = (K + 1) * F;
    const S = (B + 1) * KF;

    const list = cands.filter((c) => c.cnt <= opts.maxBlockDays && c.cost <= B);
    const byEnd = Array.from({ length: N }, () => []);
    list.forEach((c, idx) => byEnd[c.re].push(idx));

    const qual = new Uint8Array(list.length);
    const weight = new Float64Array(list.length);
    const mid = main ? (main.a + main.b) / 2 : 0;
    const half = main ? Math.max(1, (main.b - main.a) / 2) : 1;
    list.forEach((c, idx) => {
      let w = c.value - 0.02; // bei Gleichstand weniger, dafür längere Blöcke
      if (main && c.mainCost >= main.minCost && c.a >= main.a && c.b <= main.b) {
        qual[idx] = 1;
        const closeness = Math.max(0, 1 - Math.abs((c.a + c.b) / 2 - mid) / half);
        w += 0.05 * closeness; // Haupturlaub möglichst mittig im Wunschzeitraum
      }
      weight[idx] = w;
    });

    const val = new Float32Array((N + 1) * S).fill(-Infinity);
    const choice = new Int32Array((N + 1) * S);
    val[0] = 0;

    for (let d = 0; d < N; d++) {
      const cur = d * S;
      const nxt = cur + S;
      val.copyWithin(nxt, cur, cur + S);
      for (const idx of byEnd[d]) {
        const c = list[idx];
        const prev = Math.max(0, c.rs - 1) * S;
        const q = qual[idx];
        const w = weight[idx];
        for (let cc = c.cost; cc <= B; cc++) {
          const srcBase = prev + (cc - c.cost) * KF;
          const dstBase = nxt + cc * KF;
          for (let k = 1; k <= K; k++) {
            for (let fs = 0; fs < F; fs++) {
              const v = val[srcBase + (k - 1) * F + fs];
              if (v === -Infinity) continue;
              const dst = dstBase + k * F + (fs | q);
              const nv = v + w;
              if (nv > val[dst] + 1e-3) {
                val[dst] = nv;
                choice[dst] = idx * 2 + fs + 1;
              }
            }
          }
        }
      }
    }

    const pick = (needFlag) => {
      let best = -Infinity;
      let state = null;
      const end = N * S;
      for (let cc = 0; cc <= B; cc++) {
        for (let k = 0; k <= K; k++) {
          for (let f = needFlag ? 1 : 0; f < F; f++) {
            const v = val[end + cc * KF + k * F + f];
            if (v > best + 1e-3) { best = v; state = { cc, k, f }; }
          }
        }
      }
      return state;
    };

    let mainMissing = false;
    let state = pick(!!main);
    if (main && !state) {
      mainMissing = true;
      state = pick(false);
    }
    const selected = [];
    if (state) {
      let { cc, k, f } = state;
      let d = N;
      while (d > 0) {
        const ch = choice[d * S + cc * KF + k * F + f];
        if (ch === 0) { d--; continue; }
        const idx = (ch - 1) >> 1;
        const c = list[idx];
        selected.push(c);
        cc -= c.cost;
        k -= 1;
        f = (ch - 1) & 1;
        d = Math.max(0, c.rs - 1);
      }
    }
    return { selected: selected.reverse(), mainMissing };
  }

  /**
   * Gleichwertige Blöcke ohne Feiertag (z. B. "Freitag frei") landen in der DP
   * bei Gleichstand immer am Jahresanfang. Hier werden sie – bei identischem
   * Gesamtwert – möglichst gleichmäßig über das Jahr verteilt.
   */
  function spreadBlocks(cal, cands, selected, isPinned, maxBlockDays) {
    const key = (c) => `${c.cnt}|${c.cost}|${c.value}`;
    const flex = selected.filter((c) => c.plain && !isPinned(c));
    if (!flex.length) return selected;
    const pool = new Map();
    for (const c of cands) {
      if (!c.plain || c.cnt > maxBlockDays) continue;
      const k = key(c);
      if (!pool.has(k)) pool.set(k, []);
      pool.get(k).push(c);
    }
    const placed = selected.filter((c) => !flex.includes(c));
    const gap = (o, p) => (o.rs > p.re ? o.rs - p.re : p.rs - o.re);
    const conflicts = (o) => placed.some((p) => o.rs <= p.re + 1 && o.re >= p.rs - 1);
    flex.sort((x, y) => y.cnt - x.cnt || y.value - x.value);
    for (const f of flex) {
      let best = null;
      let bestScore = -Infinity;
      for (const o of pool.get(key(f)) || []) {
        if (conflicts(o)) continue;
        // Abstand zu den Jahresgrenzen zählt doppelt, damit Blöcke nicht an den Rand rutschen.
        let score = Math.min(2 * (o.rs - cal.firstIndex), 2 * (cal.lastIndex - o.re));
        for (const p of placed) score = Math.min(score, gap(o, p));
        if (score > bestScore) { bestScore = score; best = o; }
      }
      if (!best) return selected; // sollte nicht vorkommen – dann DP-Ergebnis behalten
      placed.push(best);
    }
    return placed.sort((x, y) => x.a - y.a);
  }

  /** Findet zusammenhängende freie Abschnitte, die gebuchte Tage enthalten. */
  function runsOf(cal, assign) {
    const { days } = cal;
    const off = (i) => days[i].cost === 0 || assign.has(i);
    const runs = [];
    for (let i = 0; i < days.length;) {
      if (!off(i)) { i++; continue; }
      let j = i;
      while (j + 1 < days.length && off(j + 1)) j++;
      const booked = [];
      for (let k = i; k <= j; k++) if (assign.has(k)) booked.push(k);
      if (booked.length) runs.push({ s: i, e: j, booked });
      i = j + 1;
    }
    return runs;
  }

  /**
   * Verteilt gebuchte Tage auf Urlaub / EZA / Gleitzeit.
   * - Feste Zeiträume mit gewählter Art werden zuerst verbucht.
   * - Optional bekommen kurze Blöcke (max. 2 Tage, also Brückentage) bevorzugt Gleitzeit.
   * - Der Rest wird chronologisch nach der gewählten Reihenfolge verteilt.
   */
  function allocate(cal, selected, s) {
    const { days } = cal;
    const pools = poolsFor(s);
    const left = { ...pools };
    const order = (ORDERS.find((o) => o.id === s.orderId) || ORDERS[0]).order;
    const assign = new Map();

    days.forEach((d, i) => {
      if (!d.fixed || d.cost === 0) return;
      assign.set(i, { type: null, cost: d.cost, fixed: true });
    });
    for (const c of selected) {
      for (let i = c.a; i <= c.b; i++) {
        if (days[i].cost > 0 && !days[i].fixed) assign.set(i, { type: null, cost: days[i].cost, fixed: false });
      }
    }

    // 1. Feste Zeiträume mit fester Art
    for (const [i, a] of assign) {
      const f = days[i].fixed;
      if (!a.fixed || f.type === 'auto') continue;
      a.type = f.type;
      if (days[i].inYear) left[f.type] -= a.cost;
    }

    const take = (i, a, type) => {
      a.type = type;
      if (days[i].inYear) left[type] -= a.cost;
    };

    // Tage außerhalb des Jahres belasten das Kontingent nicht.
    for (const [i, a] of assign) if (!a.type && !days[i].inYear) a.type = order[0];

    // 2. Brückentage bevorzugt aus der Gleitzeit
    if (s.gleitForBridges) {
      for (const run of runsOf(cal, assign)) {
        const open = run.booked.filter((i) => !assign.get(i).type);
        const bookedDays = run.booked.reduce((sum, i) => sum + assign.get(i).cost, 0) / 2;
        if (bookedDays > 2) continue;
        for (const i of open) {
          const a = assign.get(i);
          if (left.gleit >= a.cost) take(i, a, 'gleit');
        }
      }
    }

    // 3. Rest chronologisch nach Reihenfolge
    const rest = [...assign.keys()].filter((i) => !assign.get(i).type).sort((x, y) => x - y);
    for (const i of rest) {
      const a = assign.get(i);
      const type = order.find((p) => left[p] >= a.cost)
        || order.reduce((best, p) => (left[p] > left[best] ? p : best), order[0]);
      take(i, a, type);
    }
    return assign;
  }

  /** Wendet manuelle Änderungen (Klick im Kalender) auf eine Verteilung an. */
  function applyOverrides(cal, assign, overrides) {
    if (!overrides) return assign;
    const out = new Map([...assign].map(([i, a]) => [i, { ...a }]));
    for (const [iso, type] of Object.entries(overrides)) {
      const i = indexOf(cal, fromISO(iso));
      if (i < 0) continue;
      const d = cal.days[i];
      if (!d.inYear || d.cost === 0 || d.fixed || d.blocked) continue;
      if (type === 'none') out.delete(i);
      else if (POOLS.includes(type)) out.set(i, { type, cost: d.cost, fixed: false, manual: true });
    }
    return out;
  }

  /** Kennzahlen eines Plans: Blöcke, Verbrauch je Kontingent, Effizienz. */
  function analyze(cal, assign, s) {
    const { days } = cal;
    const pools = poolsFor(s);
    const used = { urlaub: 0, eza: 0, gleit: 0 };
    for (const [i, a] of assign) if (days[i].inYear) used[a.type] += a.cost;

    const blocks = [];
    for (const run of runsOf(cal, assign)) {
      let inYear = false;
      for (let k = run.s; k <= run.e; k++) if (days[k].inYear) inYear = true;
      if (!inYear) continue;
      const u = { urlaub: 0, eza: 0, gleit: 0 };
      const holidays = [];
      const labels = new Set();
      let manual = false;
      for (let k = run.s; k <= run.e; k++) {
        const a = assign.get(k);
        if (a) {
          u[a.type] += a.cost;
          if (a.manual) manual = true;
        }
        if (days[k].holiday) holidays.push({ name: days[k].holiday, t: days[k].t });
        if (days[k].fixed && days[k].fixed.label) labels.add(days[k].fixed.label);
      }
      const bookedHalf = u.urlaub + u.eza + u.gleit;
      const len = run.e - run.s + 1;
      // Zeiträume für den Antrag: gleiche Art, nur durch freie Tage getrennt → ein Zeitraum.
      const ranges = [];
      for (const i of run.booked) {
        const a = assign.get(i);
        const last = ranges[ranges.length - 1];
        if (last && last.type === a.type) {
          last.to = days[i].t;
          last.days += a.cost / 2;
        } else {
          ranges.push({ type: a.type, from: days[i].t, to: days[i].t, days: a.cost / 2 });
        }
      }
      blocks.push({
        start: days[run.s].t, end: days[run.e].t, startIndex: run.s, endIndex: run.e,
        len, used: { urlaub: u.urlaub / 2, eza: u.eza / 2, gleit: u.gleit / 2 },
        booked: bookedHalf / 2, ratio: len / (bookedHalf / 2), ranges,
        holidays, labels: [...labels], fixed: run.booked.some((i) => assign.get(i).fixed), manual,
      });
    }

    const totalBooked = (used.urlaub + used.eza + used.gleit) / 2;
    const totalFree = blocks.reduce((sum, b) => sum + b.len, 0);
    const remaining = {
      urlaub: (pools.urlaub - used.urlaub) / 2,
      eza: (pools.eza - used.eza) / 2,
      gleit: (pools.gleit - used.gleit) / 2,
    };
    const gleitHoursUsed = (used.gleit / 2) * s.hoursPerDay;
    const warnings = [];
    for (const p of POOLS) {
      if (remaining[p] < 0) warnings.push(`${POOL_LABEL[p]}-Kontingent um ${fmtNum(-remaining[p])} Tag(e) überschritten.`);
    }
    return {
      blocks,
      used: { urlaub: used.urlaub / 2, eza: used.eza / 2, gleit: used.gleit / 2 },
      available: { urlaub: pools.urlaub / 2, eza: pools.eza / 2, gleit: pools.gleit / 2 },
      remaining,
      gleitHoursUsed,
      gleitHoursLeft: s.overtimeHours - gleitHoursUsed,
      totalBooked,
      totalFree,
      efficiency: totalBooked > 0 ? totalFree / totalBooked : 0,
      longest: blocks.reduce((m, b) => Math.max(m, b.len), 0),
      warnings,
    };
  }

  const fmtNum = (n) => (Math.round(n * 10) / 10).toLocaleString('de-DE');

  /**
   * Die besten Feiertags-Konstellationen: für jeden Feiertag (bzw. jede Gruppe
   * nah beieinander liegender Feiertage) auf einem Arbeitstag die Varianten mit
   * dem besten Verhältnis von freien Tagen zu eingesetzten Tagen.
   */
  function bridgeOpportunities(cal, cands) {
    const { days } = cal;
    const hol = [];
    for (let i = cal.firstIndex; i <= cal.lastIndex; i++) {
      if (days[i].holiday && days[i].workday) hol.push(i);
    }
    const groups = [];
    for (const i of hol) {
      const g = groups[groups.length - 1];
      if (g && i - g[g.length - 1] <= 6) g.push(i);
      else groups.push([i]);
    }
    const result = [];
    for (const g of groups) {
      const best = new Map(); // gebuchte Tage → bester Kandidat
      for (const c of cands) {
        if (c.absorbsFixed || c.cnt > 9) continue;
        if (!g.some((i) => i >= c.rs && i <= c.re)) continue;
        const prev = best.get(c.cost);
        if (!prev || c.value > prev.value) best.set(c.cost, c);
      }
      const options = [];
      let lastValue = 0;
      for (const cost of [...best.keys()].sort((x, y) => x - y)) {
        const c = best.get(cost);
        if (c.value <= lastValue) continue;
        lastValue = c.value;
        const ratio = c.value / (cost / 2);
        if (ratio >= 2) options.push({ from: days[c.a].t, to: days[c.b].t, freeFrom: days[c.rs].t, freeTo: days[c.re].t, days: cost / 2, free: c.runLen, ratio });
      }
      if (!options.length) continue;
      // Beste Quote zuerst, maximal drei Varianten
      const shown = options.sort((x, y) => y.ratio - x.ratio || x.days - y.days).slice(0, 3).sort((x, y) => x.days - y.days);
      result.push({
        holidays: g.map((i) => ({ name: days[i].holiday, t: days[i].t })),
        options: shown,
        bestRatio: Math.max(...shown.map((o) => o.ratio)),
      });
    }
    return result;
  }

  /** Planungsbudget in halben Tagen nach Abzug fester Zeiträume und Reserve. */
  function budgetFor(cal, s) {
    const pools = poolsFor(s);
    let fixedCost = 0;
    for (const d of cal.days) if (d.inYear && d.fixed) fixedCost += d.cost;
    const total = pools.urlaub + pools.eza + pools.gleit;
    return { total, fixedCost, free: Math.max(0, total - fixedCost - Math.round(s.reserveDays * 2)) };
  }

  /** Ist der Haupturlaub schon durch einen festen Zeitraum abgedeckt? */
  function fixedCoversMain(cal, main) {
    const { days } = cal;
    for (let i = main.a; i <= main.b;) {
      if (!days[i].fixed) { i++; continue; }
      let j = i;
      let cost = 0;
      while (j <= main.b && (days[j].fixed || days[j].cost === 0)) { if (days[j].fixed) cost += days[j].cost; j++; }
      if (cost >= main.minCost) return true;
      i = j;
    }
    return false;
  }

  function planScenario(cal, cands, s, sc, budget) {
    const notes = [];
    let main = null;
    if (sc.mainDays > 0) {
      const a = indexOf(cal, ymd(s.year, s.mainFrom, 1));
      const b = indexOf(cal, addDays(ymd(s.year + (s.mainTo === 12 ? 1 : 0), (s.mainTo % 12) + 1, 1), -1));
      main = { minCost: sc.mainDays * 2, a, b };
      if (fixedCoversMain(cal, main)) {
        main = null;
        notes.push('Der Haupturlaub ist bereits durch einen festen Zeitraum abgedeckt.');
      }
    }
    const result = optimize(cal, cands, {
      budget, maxBlocks: sc.maxBlocks, maxBlockDays: sc.maxBlockDays, main,
    });
    const { mainMissing } = result;
    // Nur ein Haupturlaub bleibt fest im Wunschzeitraum, alle anderen
    // gleichwertigen Blöcke dürfen übers Jahr wandern.
    let mainBlock = null;
    if (main) {
      const mid = (main.a + main.b) / 2;
      for (const c of result.selected) {
        if (c.mainCost < main.minCost || c.a < main.a || c.b > main.b) continue;
        if (!mainBlock || c.mainCost > mainBlock.mainCost
          || (c.mainCost === mainBlock.mainCost && Math.abs((c.a + c.b) / 2 - mid) < Math.abs((mainBlock.a + mainBlock.b) / 2 - mid))) {
          mainBlock = c;
        }
      }
    }
    const selected = spreadBlocks(cal, cands, result.selected, (c) => c === mainBlock, sc.maxBlockDays);
    if (mainMissing && budget >= main.minCost) {
      notes.push(`Ein Haupturlaub von ${sc.mainDays} Arbeitstagen passt nicht in den Wunschzeitraum. Prüfe Sperrzeiten und feste Termine im Haupturlaubs-Zeitraum.`);
    } else if (mainMissing && budget > 0) {
      notes.push(`Für einen Haupturlaub von ${sc.mainDays} Arbeitstagen reicht das freie Kontingent nicht.`);
    }
    if (budget > MAX_BUDGET) {
      notes.push(`Es werden höchstens ${MAX_BUDGET / 2} Tage automatisch verplant. Den Rest kannst du per Klick im Kalender verteilen.`);
    }
    const assign = allocate(cal, selected, s);
    return { scenario: sc, assign, notes };
  }

  /**
   * Hauptfunktion: berechnet alle Szenarien für die Einstellungen.
   * @param {object} rawSettings
   * @param {Object<string, Object<string,string>>} [overrides] je Szenario-ID: ISO-Datum → Art
   */
  function computePlans(rawSettings, overrides = {}) {
    const s = normalizeSettings(rawSettings);
    const cal = buildCalendar(s);
    const budget = budgetFor(cal, s);
    const scenarios = [
      ...SCENARIOS,
      {
        id: 'individuell',
        name: 'Eigenes Szenario',
        description: `Deine Vorgaben: max. ${s.custom.maxBlocks} Blöcke, je höchstens ${s.custom.maxBlockDays} Arbeitstage`
          + (s.custom.mainDays ? `, Haupturlaub ${s.custom.mainDays} Arbeitstage am Stück.` : '.'),
        ...s.custom,
      },
    ];
    const maxDays = Math.max(...scenarios.map((x) => x.maxBlockDays), 9);
    const cands = buildCandidates(cal, maxDays);

    const plans = scenarios.map((sc) => {
      const base = planScenario(cal, cands, s, sc, budget.free);
      const ov = overrides[sc.id];
      const assign = applyOverrides(cal, base.assign, ov);
      return {
        ...base,
        baseAssign: base.assign,
        assign,
        modified: !!ov && Object.keys(ov).length > 0,
        stats: analyze(cal, assign, s),
      };
    });

    const holidays = H.getHolidays(s.year, s.state, s.regional).map((h) => ({ ...h, weekday: dow(h.date) }));
    return {
      settings: s,
      calendar: cal,
      holidays,
      pools: poolsFor(s),
      budget,
      opportunities: bridgeOpportunities(cal, cands),
      plans,
    };
  }

  return {
    MARGIN, POOLS, POOL_LABEL, ORDERS, SCENARIOS, DEFAULTS,
    normalizeSettings, poolsFor, buildCalendar, buildCandidates, optimize, spreadBlocks,
    allocate, applyOverrides, analyze, bridgeOpportunities, computePlans, indexOf, fmtNum,
  };
});
