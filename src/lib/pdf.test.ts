import { describe, expect, it } from 'vitest';
import { createPdf, pdfFileName } from './pdf';
import { runScenarios } from './scenarios';
import { period, setup } from './testing';

describe('createPdf', () => {
  it('erzeugt ein zweiseitiges PDF mit Jahresübersicht und Auszeiten', () => {
    const { cal, budget, settings } = setup({ overtimeHours: 42 }, [period('2027-08-09', '2027-08-20')]);
    const r = runScenarios(cal, budget, settings)[0];
    const doc = createPdf({ settings, cal, plan: r.plan, summary: r.summary, budget, scenarioName: r.def.name });
    expect(doc.getNumberOfPages()).toBe(2);
    const raw = doc.output();
    expect(raw.startsWith('%PDF-')).toBe(true);
    for (const text of ['Urlaubsplan 2027', 'Geplante Auszeiten', 'EZA', 'Gleitzeit', 'Seite 2 von 2']) {
      expect(raw).toContain(text);
    }
  });

  it('Dateiname ohne Umlaute', () => {
    const { settings } = setup();
    expect(pdfFileName(settings, 'Regelmäßig erholen')).toBe('urlaubsplan-2027-by-regelmaessig-erholen.pdf');
  });
});
