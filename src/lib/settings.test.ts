import { describe, expect, it } from 'vitest';
import { defaultSettings, sanitizeSettings } from './settings';

describe('sanitizeSettings', () => {
  it('ergänzt fehlende Felder mit Standardwerten', () => {
    const s = sanitizeSettings({ year: 2028, state: 'NW', vacationDays: 28 });
    expect(s).toMatchObject({ year: 2028, state: 'NW', vacationDays: 28, ezaDays: 14, schoolMode: 'show', schoolState: 'same', schoolAll: false });
  });

  it('verwirft ungültige Werte', () => {
    const s = sanitizeSettings({ state: 'XX', schoolState: 'YY', schoolMode: 'egal', workDays: [], hoursPerDay: 'abc' });
    const d = defaultSettings();
    expect(s).toMatchObject({ state: d.state, schoolState: 'same', schoolMode: 'show', workDays: d.workDays, hoursPerDay: 7.6 });
  });

  it('übernimmt ein abweichendes Schulferien-Bundesland', () => {
    expect(sanitizeSettings({ state: 'BY', schoolState: 'BW', schoolAll: true })).toMatchObject({ schoolState: 'BW', schoolAll: true });
  });
});
