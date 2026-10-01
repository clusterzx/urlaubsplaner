/*
 * Datums-Hilfsfunktionen und gesetzliche Feiertage aller 16 Bundesländer.
 *
 * Alle Daten werden als UTC-Mitternacht verarbeitet, damit Sommer-/Winterzeit
 * keine Rolle spielt. Ein "Tag" ist intern ein ISO-String (YYYY-MM-DD) oder
 * ein UTC-Zeitstempel in Millisekunden.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.UP = Object.assign(root.UP || {}, mod);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_MS = 86400000;

  const ymd = (y, m, d) => Date.UTC(y, m - 1, d);
  const addDays = (t, n) => t + n * DAY_MS;
  const toISO = (t) => new Date(t).toISOString().slice(0, 10);
  const fromISO = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return ymd(y, m, d);
  };
  /** 0 = Sonntag … 6 = Samstag (wie Date.getUTCDay) */
  const dow = (t) => new Date(t).getUTCDay();
  const daysInYear = (y) => (ymd(y + 1, 1, 1) - ymd(y, 1, 1)) / DAY_MS;

  const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const WEEKDAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
    'August', 'September', 'Oktober', 'November', 'Dezember'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  /** "Fr 15.05." */
  function fmtShort(t) {
    const d = new Date(t);
    return `${WEEKDAYS_SHORT[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.`;
  }
  /** "15.05.2027" */
  function fmtDate(t) {
    const d = new Date(t);
    return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
  }
  /** "Fr 15.05. – Mo 18.05." bzw. ein einzelner Tag */
  function fmtRange(a, b) {
    return a === b ? fmtShort(a) : `${fmtShort(a)} – ${fmtShort(b)}`;
  }

  /** Kalenderwoche nach ISO 8601 (Woche mit dem ersten Donnerstag ist KW 1). */
  function isoWeek(t) {
    const thursday = addDays(t, 3 - ((dow(t) + 6) % 7));
    const jan1 = ymd(new Date(thursday).getUTCFullYear(), 1, 1);
    return 1 + Math.floor((thursday - jan1) / DAY_MS / 7);
  }

  /** Ostersonntag nach der Gauß'schen Osterformel (gregorianisch, anonymer Algorithmus). */
  function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = h + l - 7 * m + 114;
    return ymd(year, Math.floor(n / 31), (n % 31) + 1);
  }

  /** Buß- und Bettag: der Mittwoch vor dem 23. November. */
  function bussUndBettag(year) {
    const nov22 = ymd(year, 11, 22);
    return addDays(nov22, -((dow(nov22) - 3 + 7) % 7));
  }

  const STATES = [
    { code: 'BW', name: 'Baden-Württemberg' },
    { code: 'BY', name: 'Bayern' },
    { code: 'BE', name: 'Berlin' },
    { code: 'BB', name: 'Brandenburg' },
    { code: 'HB', name: 'Bremen' },
    { code: 'HH', name: 'Hamburg' },
    { code: 'HE', name: 'Hessen' },
    { code: 'MV', name: 'Mecklenburg-Vorpommern' },
    { code: 'NI', name: 'Niedersachsen' },
    { code: 'NW', name: 'Nordrhein-Westfalen' },
    { code: 'RP', name: 'Rheinland-Pfalz' },
    { code: 'SL', name: 'Saarland' },
    { code: 'SN', name: 'Sachsen' },
    { code: 'ST', name: 'Sachsen-Anhalt' },
    { code: 'SH', name: 'Schleswig-Holstein' },
    { code: 'TH', name: 'Thüringen' },
  ];
  const ALL = STATES.map((s) => s.code);

  /*
   * Feiertagsregeln. "states" ist entweder eine Liste oder eine Funktion des
   * Jahres (für Feiertage, die erst ab einem bestimmten Jahr gelten).
   */
  const RULES = [
    { id: 'neujahr', name: 'Neujahr', date: (y) => ymd(y, 1, 1), states: ALL },
    { id: 'hl3k', name: 'Heilige Drei Könige', date: (y) => ymd(y, 1, 6), states: ['BW', 'BY', 'ST'] },
    {
      id: 'frauentag', name: 'Internationaler Frauentag', date: (y) => ymd(y, 3, 8),
      states: (y) => [...(y >= 2019 ? ['BE'] : []), ...(y >= 2023 ? ['MV'] : [])],
    },
    { id: 'karfreitag', name: 'Karfreitag', easter: -2, states: ALL },
    { id: 'ostersonntag', name: 'Ostersonntag', easter: 0, states: ['BB'] },
    { id: 'ostermontag', name: 'Ostermontag', easter: 1, states: ALL },
    { id: 'maifeiertag', name: 'Tag der Arbeit', date: (y) => ymd(y, 5, 1), states: ALL },
    {
      id: 'befreiung', name: 'Tag der Befreiung', date: (y) => ymd(y, 5, 8),
      states: (y) => (y === 2020 || y === 2025 ? ['BE'] : []),
    },
    { id: 'himmelfahrt', name: 'Christi Himmelfahrt', easter: 39, states: ALL },
    { id: 'pfingstsonntag', name: 'Pfingstsonntag', easter: 49, states: ['BB'] },
    { id: 'pfingstmontag', name: 'Pfingstmontag', easter: 50, states: ALL },
    { id: 'fronleichnam', name: 'Fronleichnam', easter: 60, states: ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'] },
    { id: 'mariae', name: 'Mariä Himmelfahrt', date: (y) => ymd(y, 8, 15), states: ['SL'] },
    {
      id: 'weltkindertag', name: 'Weltkindertag', date: (y) => ymd(y, 9, 20),
      states: (y) => (y >= 2019 ? ['TH'] : []),
    },
    { id: 'einheit', name: 'Tag der Deutschen Einheit', date: (y) => ymd(y, 10, 3), states: ALL },
    {
      id: 'reformation', name: 'Reformationstag', date: (y) => ymd(y, 10, 31),
      states: (y) => {
        if (y === 2017) return ALL;
        return ['BB', 'MV', 'SN', 'ST', 'TH', ...(y >= 2018 ? ['HB', 'HH', 'NI', 'SH'] : [])];
      },
    },
    { id: 'allerheiligen', name: 'Allerheiligen', date: (y) => ymd(y, 11, 1), states: ['BW', 'BY', 'NW', 'RP', 'SL'] },
    { id: 'busstag', name: 'Buß- und Bettag', date: bussUndBettag, states: ['SN'] },
    { id: 'weihnachten1', name: '1. Weihnachtstag', date: (y) => ymd(y, 12, 25), states: ALL },
    { id: 'weihnachten2', name: '2. Weihnachtstag', date: (y) => ymd(y, 12, 26), states: ALL },
  ];

  /*
   * Feiertage, die nur in Teilen eines Bundeslandes gelten. Der Nutzer kann
   * sie einzeln zuschalten (z. B. wohnt man in einer katholischen Gemeinde in Bayern).
   */
  const REGIONAL = [
    {
      id: 'by-mariae', state: 'BY', name: 'Mariä Himmelfahrt', defaultOn: true,
      hint: 'in Gemeinden mit überwiegend katholischer Bevölkerung',
      date: (y) => ymd(y, 8, 15),
    },
    {
      id: 'by-friedensfest', state: 'BY', name: 'Augsburger Hohes Friedensfest', defaultOn: false,
      hint: 'nur im Stadtgebiet Augsburg',
      date: (y) => ymd(y, 8, 8),
    },
    {
      id: 'sn-fronleichnam', state: 'SN', name: 'Fronleichnam', defaultOn: false,
      hint: 'in einigen Gemeinden im Landkreis Bautzen',
      date: (y) => addDays(easterSunday(y), 60),
    },
    {
      id: 'th-fronleichnam', state: 'TH', name: 'Fronleichnam', defaultOn: false,
      hint: 'im Eichsfeld und einigen Gemeinden im Unstrut-Hainich- und Wartburgkreis',
      date: (y) => addDays(easterSunday(y), 60),
    },
  ];

  const regionalOptions = (state) => REGIONAL.filter((r) => r.state === state);

  /**
   * Liefert alle Feiertage eines Jahres für ein Bundesland, sortiert.
   * @param {number} year
   * @param {string} state Kürzel, z. B. "BY"
   * @param {string[]} [regionalIds] zugeschaltete regionale Feiertage
   * @returns {{date:number, iso:string, name:string, regional?:boolean}[]}
   */
  function getHolidays(year, state, regionalIds = []) {
    const easter = easterSunday(year);
    const list = [];
    for (const r of RULES) {
      const states = typeof r.states === 'function' ? r.states(year) : r.states;
      if (!states.includes(state)) continue;
      const date = r.easter !== undefined ? addDays(easter, r.easter) : r.date(year);
      list.push({ id: r.id, date, iso: toISO(date), name: r.name });
    }
    for (const r of REGIONAL) {
      if (r.state !== state || !regionalIds.includes(r.id)) continue;
      const date = r.date(year);
      if (list.some((h) => h.date === date)) continue;
      list.push({ id: r.id, date, iso: toISO(date), name: r.name, regional: true });
    }
    return list.sort((a, b) => a.date - b.date);
  }

  return {
    DAY_MS, ymd, addDays, toISO, fromISO, dow, daysInYear,
    WEEKDAYS_SHORT, WEEKDAYS_LONG, MONTHS, MONTHS_SHORT,
    fmtShort, fmtDate, fmtRange, isoWeek,
    easterSunday, bussUndBettag, STATES, REGIONAL, regionalOptions, getHolidays,
  };
});
