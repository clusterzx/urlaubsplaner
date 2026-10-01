/*
 * Schulferien der 16 Bundesländer.
 *
 * Datengrundlage ist js/ferien-data.js (erzeugt mit scripts/update-ferien.js
 * aus der OpenHolidays API). Für Jahre, die dort fehlen, kann der Browser die
 * Termine bei Bedarf direkt bei der API nachladen.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const H = isNode ? require('./holidays.js') : root.UP;
  let data = null;
  if (isNode) {
    try { data = require('./ferien-data.js'); } catch { data = null; }
  } else {
    data = root.UP && root.UP.FERIEN_DATA;
  }
  const mod = factory(H, data, isNode ? null : root);
  if (isNode) module.exports = mod;
  else root.UP = Object.assign(root.UP || {}, mod);
})(typeof self !== 'undefined' ? self : this, function (H, bundled, win) {
  'use strict';

  const API = 'https://openholidaysapi.org/SchoolHolidays';
  const CACHE_KEY = 'urlaubsplaner.ferien.v1';

  const CATEGORIES = [
    { id: 'winter', label: 'Winterferien' },
    { id: 'ostern', label: 'Osterferien' },
    { id: 'pfingsten', label: 'Pfingstferien' },
    { id: 'sommer', label: 'Sommerferien' },
    { id: 'herbst', label: 'Herbstferien' },
    { id: 'weihnachten', label: 'Weihnachtsferien' },
    { id: 'einzeln', label: 'Einzelne schulfreie Tage' },
  ];
  const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
  const MAIN_CATS = CATEGORIES.filter((c) => c.id !== 'einzeln').map((c) => c.id);

  /** Ordnet einen Ferien-Namen einer Ferienart zu. */
  function categorize(name, startIso) {
    const n = name.toLowerCase();
    if (n.includes('weihnacht')) return 'weihnachten';
    if (n.includes('sommer')) return 'sommer';
    if (n.includes('herbst')) return 'herbst';
    if (n.includes('pfingst')) return 'pfingsten';
    if (n.includes('oster')) return 'ostern';
    if (n.includes('frühjahr')) return Number(startIso.slice(5, 7)) <= 2 ? 'winter' : 'ostern';
    if (n.includes('winter') || n.includes('halbjahr') || n.includes('fastnacht') || n.includes('fasching')) return 'winter';
    return 'einzeln';
  }

  /**
   * Wandelt die Antwort der OpenHolidays API in { BY: [[Name, Start, Ende], ...] } um.
   * Ausnahmen (z. B. Nordseeinseln) und berufliche Schulen (MV-BBS) werden
   * übersprungen, es zählen die allgemeinbildenden Schulen.
   */
  function normalizeApi(entries) {
    const out = {};
    for (const h of entries || []) {
      if ((h.tags || []).includes('Exception')) continue;
      if ((h.groups || []).length && !(h.groups || []).some((g) => /-ABS$/.test(g.code))) continue;
      const name = ((h.name || []).find((x) => x.language === 'DE') || (h.name || [])[0] || {}).text;
      if (!name || !h.startDate || !h.endDate) continue;
      for (const sub of h.subdivisions || []) {
        const code = sub.shortName || String(sub.code || '').replace(/^DE-/, '');
        if (!code) continue;
        (out[code] = out[code] || []).push([name, h.startDate, h.endDate]);
      }
    }
    for (const code of Object.keys(out)) out[code] = dedupeSort(out[code]);
    return out;
  }

  function dedupeSort(list) {
    const seen = new Set();
    return list.filter((e) => {
      const k = e.join('|');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  }

  /* ---------- Datenbestand ---------- */

  const store = {};
  const years = new Set();

  function addData(states, coveredYears) {
    for (const [code, list] of Object.entries(states || {})) {
      store[code] = dedupeSort([...(store[code] || []), ...list]);
    }
    for (const y of coveredYears || []) years.add(Number(y));
  }

  if (bundled) addData(bundled.states, bundled.years);

  // Im Browser zuvor nachgeladene Jahre aus dem Cache übernehmen
  if (win) {
    try {
      const cached = JSON.parse(win.localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && cached.states) addData(cached.states, cached.years);
    } catch { /* Cache ist optional */ }
  }

  /** Gibt es für das Jahr Ferientermine (mind. Sommerferien in den meisten Ländern)? */
  function hasYear(year) {
    if (!years.has(year)) return false;
    let n = 0;
    for (const list of Object.values(store)) {
      if (list.some((e) => categorize(e[0], e[1]) === 'sommer' && e[1].startsWith(String(year)))) n++;
    }
    return n >= 12;
  }

  function toItem(e, state) {
    const cat = categorize(e[0], e[1]);
    const start = H.fromISO(e[1]);
    const end = H.fromISO(e[2]);
    return { state, name: e[0], cat, label: CAT_LABEL[cat], start, end, startIso: e[1], endIso: e[2], single: start === end };
  }

  /** Alle Ferien eines Bundeslands, die das Jahr berühren. */
  function getSchoolHolidays(year, state) {
    const from = H.ymd(year, 1, 1);
    const to = H.ymd(year, 12, 31);
    return (store[state] || [])
      .map((e) => toItem(e, state))
      .filter((f) => f.end >= from && f.start <= to);
  }

  /** Welche Ferienarten fehlen für Bundesland und Jahr (z. B. noch nicht veröffentlicht)? */
  function missingCategories(year, state) {
    const list = getSchoolHolidays(year, state).filter((f) => f.start >= H.ymd(year, 1, 1));
    const have = new Set(list.map((f) => f.cat));
    return ['sommer', 'herbst', 'weihnachten'].filter((c) => !have.has(c)).map((c) => CAT_LABEL[c]);
  }

  /**
   * Alle Länder zusammen: je Ferienart (und Saison) der früheste Beginn und
   * das späteste Ende. Einzelne schulfreie Tage zählen hier nicht mit.
   */
  function getCombined(year) {
    const groups = new Map();
    for (const state of Object.keys(store)) {
      for (const f of getSchoolHolidays(year, state)) {
        if (f.cat === 'einzeln') continue;
        const season = new Date(f.start).getUTCFullYear();
        const key = `${f.cat}|${season}`;
        if (!groups.has(key)) groups.set(key, { key, cat: f.cat, label: f.label, season, items: [] });
        groups.get(key).items.push(f);
      }
    }
    const result = [];
    for (const g of groups.values()) {
      const start = Math.min(...g.items.map((f) => f.start));
      const end = Math.max(...g.items.map((f) => f.end));
      const states = [...new Set(g.items.map((f) => f.state))].sort();
      result.push({
        ...g,
        start,
        end,
        states,
        firstStates: [...new Set(g.items.filter((f) => f.start === start).map((f) => f.state))].sort(),
        lastStates: [...new Set(g.items.filter((f) => f.end === end).map((f) => f.state))].sort(),
        label: g.cat === 'weihnachten' ? `${g.label} ${g.season}/${String(g.season + 1).slice(2)}` : g.label,
      });
    }
    const order = (c) => MAIN_CATS.indexOf(c);
    return result.sort((a, b) => a.start - b.start || order(a.cat) - order(b.cat));
  }

  /** Für jeden Tag des Jahres: in welchen Ländern sind Ferien (ohne Einzeltage)? */
  function statesOnHoliday(year) {
    const map = new Map();
    const from = H.ymd(year, 1, 1);
    const to = H.ymd(year, 12, 31);
    for (const state of Object.keys(store)) {
      for (const f of getSchoolHolidays(year, state)) {
        if (f.cat === 'einzeln') continue;
        for (let t = Math.max(f.start, from); t <= Math.min(f.end, to); t = H.addDays(t, 1)) {
          if (!map.has(t)) map.set(t, new Set());
          map.get(t).add(state);
        }
      }
    }
    return map;
  }

  /* ---------- Nachladen im Browser ---------- */

  const pending = new Map();

  /** Lädt die Ferien eines Jahres bei der OpenHolidays API nach (nur Browser). */
  function fetchYear(year) {
    if (!win || typeof win.fetch !== 'function') return Promise.resolve(false);
    if (pending.has(year)) return pending.get(year);
    const url = `${API}?countryIsoCode=DE&languageIsoCode=DE&validFrom=${year}-01-01&validTo=${year}-12-31`;
    const p = win.fetch(url, { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        const states = normalizeApi(json);
        if (!Object.keys(states).length) return false;
        addData(states, [year]);
        try {
          const cached = JSON.parse(win.localStorage.getItem(CACHE_KEY) || 'null') || { states: {}, years: [] };
          for (const [code, list] of Object.entries(states)) cached.states[code] = dedupeSort([...(cached.states[code] || []), ...list]);
          cached.years = [...new Set([...cached.years, year])];
          win.localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
        } catch { /* Cache ist optional */ }
        return true;
      })
      .catch(() => false);
    pending.set(year, p);
    return p;
  }

  return {
    FERIEN_CATEGORIES: CATEGORIES,
    FERIEN_SOURCE: (bundled && bundled.source) || 'OpenHolidays API',
    FERIEN_UPDATED: (bundled && bundled.updated) || null,
    categorizeFerien: categorize,
    normalizeFerienApi: normalizeApi,
    addFerienData: addData,
    hasFerienYear: hasYear,
    getSchoolHolidays,
    missingFerien: missingCategories,
    getCombinedFerien: getCombined,
    statesOnHoliday,
    fetchFerienYear: fetchYear,
  };
});
