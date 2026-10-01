// Lädt die Schulferien aller Bundesländer von der OpenHolidays API (https://www.openholidaysapi.org)
// und speichert sie in src/data/school-holidays.json.
//
//   npm run update-ferien            → aktuelles Jahr − 1 bis + 5
//   npm run update-ferien 2026 2032  → bestimmter Bereich
import { writeFile } from 'node:fs/promises';

const STATES = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'];
const now = new Date().getFullYear();
const from = Number(process.argv[2] ?? now - 1);
const to = Number(process.argv[3] ?? now + 5);
const target = new URL('../src/data/school-holidays.json', import.meta.url);

async function load(state, year) {
  const url =
    'https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&languageIsoCode=DE' +
    `&subdivisionCode=DE-${state}&validFrom=${year}-01-01&validTo=${year}-12-31`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const states = {};
for (const state of STATES) {
  const seen = new Map();
  for (let year = from; year <= to; year++) {
    for (const h of await load(state, year)) {
      // Nur landesweite Termine (keine Sonderregelungen einzelner Städte).
      if (!h.nationwide && !h.subdivisions?.some((s) => s.code === `DE-${state}`)) continue;
      // Gibt es getrennte Termine je Schulart (z. B. MV), zählen die allgemeinbildenden Schulen.
      if (h.groups?.length && !h.groups.some((g) => g.code.endsWith('-ABS'))) continue;
      // Sonderregeln mit Kommentar (z. B. Inseln in Schleswig-Holstein) auslassen.
      if (h.comment?.length) continue;
      const name = h.name.find((n) => n.language === 'DE')?.text ?? h.name[0]?.text ?? 'Ferien';
      const entry = [h.startDate, h.endDate, name];
      seen.set(entry.join('|'), entry);
    }
  }
  states[state] = [...seen.values()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`${state}: ${states[state].length} Zeiträume`);
}

const data = {
  source: 'OpenHolidays API (openholidaysapi.org)',
  updated: new Date().toISOString().slice(0, 10),
  years: [from, to],
  states,
};
await writeFile(target, JSON.stringify(data, null, 0).replace(/\],\[/g, '],\n[') + '\n');
console.log(`Gespeichert: ${target.pathname}`);
