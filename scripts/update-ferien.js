#!/usr/bin/env node
/*
 * Lädt die Schulferien aller Bundesländer aus der OpenHolidays API und
 * schreibt sie nach js/ferien-data.js.
 *
 *   npm run update-ferien              # Vorjahr bis +5 Jahre
 *   node scripts/update-ferien.js 2024 2031
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeFerienApi } = require('../js/ferien.js');

const API = 'https://openholidaysapi.org/SchoolHolidays';
const thisYear = new Date().getFullYear();
const from = Number(process.argv[2]) || thisYear - 2;
const to = Number(process.argv[3]) || thisYear + 4;

async function main() {
  const states = {};
  const years = [];
  for (let y = from; y <= to; y++) {
    const url = `${API}?countryIsoCode=DE&languageIsoCode=DE&validFrom=${y}-01-01&validTo=${y}-12-31`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const norm = normalizeFerienApi(await res.json());
    const n = Object.values(norm).filter((list) => list.some((e) => /sommer/i.test(e[0]) && e[1].startsWith(String(y)))).length;
    console.log(`${y}: ${Object.keys(norm).length} Länder, Sommerferien für ${n} Länder`);
    if (!n) continue;
    years.push(y);
    for (const [code, list] of Object.entries(norm)) states[code] = [...(states[code] || []), ...list];
  }
  for (const code of Object.keys(states)) {
    const seen = new Set();
    states[code] = states[code]
      .filter((e) => { const k = e.join('|'); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  }
  const ordered = Object.fromEntries(Object.keys(states).sort().map((k) => [k, states[k]]));
  const data = {
    source: 'OpenHolidays API (https://www.openholidaysapi.org), allgemeinbildende Schulen',
    updated: new Date().toISOString().slice(0, 10),
    years,
    states: ordered,
  };
  const body = Object.entries(ordered)
    .map(([code, list]) => `    ${code}: [\n${list.map((e) => `      ${JSON.stringify(e)},`).join('\n')}\n    ],`)
    .join('\n');
  const file = `/*
 * Schulferien der Bundesländer – automatisch erzeugt mit scripts/update-ferien.js.
 * Quelle: ${data.source}
 * Stand: ${data.updated}
 * Format je Bundesland: [Name, erster Ferientag, letzter Ferientag]
 */
(function (root) {
  const data = {
    source: ${JSON.stringify(data.source)},
    updated: ${JSON.stringify(data.updated)},
    years: ${JSON.stringify(years)},
    states: {
${body}
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.UP = Object.assign(root.UP || {}, { FERIEN_DATA: data });
})(typeof self !== 'undefined' ? self : this);
`;
  const out = path.join(__dirname, '..', 'js', 'ferien-data.js');
  fs.writeFileSync(out, file);
  console.log(`Geschrieben: ${path.relative(process.cwd(), out)} (${years[0]}–${years[years.length - 1]})`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
