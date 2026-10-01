import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AccountOverview } from './components/AccountOverview';
import { BreakList } from './components/BreakList';
import { HolidayList } from './components/HolidayList';
import { Opportunities } from './components/Opportunities';
import { PeriodsPanel } from './components/PeriodsPanel';
import { ScenarioPicker } from './components/ScenarioPicker';
import { SettingsPanel } from './components/SettingsPanel';
import { YearCalendar, type Brush } from './components/YearCalendar';
import { buildCalendar } from './lib/calendar';
import { indexOfIso, todayIso } from './lib/dates';
import { stateName } from './lib/holidays';
import { findOpportunities, type OpportunityOption } from './lib/opportunities';
import { SCENARIOS } from './lib/optimizer';
import { applyOverrides, computeBudget, normalizeOrder, summarize } from './lib/plan';
import { runScenarios } from './lib/scenarios';
import {
  bundledAllSchoolHolidays,
  fetchAllSchoolHolidays,
  isAllCovered,
  isCovered,
  mergeSchoolByState,
  SCHOOL_SOURCE,
  SCHOOL_UPDATED,
  schoolEnvelope,
  type SchoolByState,
} from './lib/schoolHolidays';
import { defaultSettings, sanitizePeriods, sanitizeSettings } from './lib/settings';
import { usePersistentState } from './lib/storage';
import type { LeaveType, Overrides, Settings } from './lib/types';

type OverrideStore = Record<string, Overrides>;

const OVERRIDE_VALUES = new Set(['vacation', 'eza', 'overtime', 'work']);

function sanitizeOverrides(raw: unknown): OverrideStore {
  if (!raw || typeof raw !== 'object') return {};
  const result: OverrideStore = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([iso, v]) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && typeof v === 'string' && OVERRIDE_VALUES.has(v),
    );
    if (entries.length > 0) result[key] = Object.fromEntries(entries) as Overrides;
  }
  return result;
}

const sanitizeScenario = (raw: unknown) =>
  typeof raw === 'string' && SCENARIOS.some((s) => s.id === raw) ? raw : SCENARIOS[0].id;

export function App() {
  const [settings, setSettings] = usePersistentState('urlaubsplaner.settings', sanitizeSettings);
  const [periods, setPeriods] = usePersistentState('urlaubsplaner.periods', sanitizePeriods);
  const [selectedId, setSelectedId] = usePersistentState('urlaubsplaner.scenario', sanitizeScenario);
  const [overrideStore, setOverrideStore] = usePersistentState('urlaubsplaner.overrides', sanitizeOverrides);
  const [brush, setBrush] = useState<Brush>('cycle');
  const [liveSchool, setLiveSchool] = useState<Record<number, SchoolByState | 'loading' | 'error'>>({});
  const requestedSchool = useRef(new Set<number>());
  const [exporting, setExporting] = useState(false);

  const today = useMemo(() => todayIso(), []);
  const currentYear = Number(today.slice(0, 4));

  // Die Berechnung läuft verzögert, damit Eingaben flüssig bleiben.
  const deferredSettings = useDeferredValue(settings);
  const deferredPeriods = useDeferredValue(periods);
  const calculating = deferredSettings !== settings || deferredPeriods !== periods;

  // Schulferien: mitgelieferte Termine, fehlende Jahre live von der OpenHolidays API
  // (eine Abfrage liefert alle Bundesländer).
  const { state, year, schoolMode, schoolAll } = deferredSettings;
  const schoolState = deferredSettings.schoolState === 'same' ? state : deferredSettings.schoolState;
  const bundledSchool = useMemo(() => bundledAllSchoolHolidays(year), [year]);
  const stateCovered = isCovered(bundledSchool[schoolState], year);
  const needLive = (schoolMode !== 'off' && !stateCovered) || (schoolAll && !isAllCovered(bundledSchool, year));
  const live = liveSchool[year];
  useEffect(() => {
    if (!needLive || requestedSchool.current.has(year)) return;
    requestedSchool.current.add(year);
    setLiveSchool((m) => ({ ...m, [year]: 'loading' }));
    fetchAllSchoolHolidays(year).then(
      (map) => setLiveSchool((m) => ({ ...m, [year]: map })),
      () => setLiveSchool((m) => ({ ...m, [year]: 'error' })),
    );
  }, [needLive, year]);
  const schoolByState = useMemo(
    () => mergeSchoolByState(bundledSchool, typeof live === 'object' ? live : undefined),
    [bundledSchool, live],
  );
  const schoolHolidays = useMemo(
    () => (schoolMode === 'off' ? [] : schoolByState[schoolState]),
    [schoolMode, schoolByState, schoolState],
  );
  const envelope = useMemo(() => (schoolAll ? schoolEnvelope(schoolByState, year) : []), [schoolAll, schoolByState, year]);
  const schoolStatus = !needLive
    ? schoolMode === 'off' && !schoolAll
      ? undefined
      : `Quelle: ${SCHOOL_SOURCE}, Stand ${SCHOOL_UPDATED.split('-').reverse().join('.')}`
    : live === 'loading'
      ? 'Ferientermine werden geladen …'
      : live === 'error'
        ? `Ferientermine für ${year} konnten nicht geladen werden – bei Bedarf als feste Zeit/Sperre eintragen.`
        : (schoolMode === 'off' || isCovered(schoolHolidays, year)) && (!schoolAll || isAllCovered(schoolByState, year))
          ? `Quelle: ${SCHOOL_SOURCE} (live geladen)`
          : `Für ${year} sind noch nicht alle Ferientermine veröffentlicht.`;

  const cal = useMemo(
    () => buildCalendar(deferredSettings, deferredPeriods, today, schoolHolidays, envelope),
    [deferredSettings, deferredPeriods, today, schoolHolidays, envelope],
  );
  const budget = useMemo(() => computeBudget(deferredSettings), [deferredSettings]);
  const results = useMemo(() => runScenarios(cal, budget, deferredSettings), [cal, budget, deferredSettings]);
  const opportunities = useMemo(() => findOpportunities(cal), [cal]);

  const keyOf = (id: string) => `${cal.year}|${id}`;
  const cards = useMemo(
    () =>
      results.map((r) => {
        const o = overrideStore[`${cal.year}|${r.def.id}`];
        return o ? { ...r, summary: summarize(cal, applyOverrides(cal, r.plan, o), budget) } : r;
      }),
    [results, overrideStore, cal, budget],
  );
  const edited = new Set(results.filter((r) => overrideStore[keyOf(r.def.id)]).map((r) => r.def.id));

  const selected = results.find((r) => r.def.id === selectedId) ?? results[0];
  const overrides = overrideStore[keyOf(selected.def.id)];
  const plan = useMemo(() => applyOverrides(cal, selected.plan, overrides), [cal, selected.plan, overrides]);
  const summary = useMemo(() => summarize(cal, plan, budget), [cal, plan, budget]);

  const updateSettings = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  const setOverrides = (change: (current: Overrides) => Overrides) => {
    const key = keyOf(selected.def.id);
    setOverrideStore((store) => {
      const next = change({ ...(store[key] ?? {}) });
      const copy = { ...store };
      if (Object.keys(next).length > 0) copy[key] = next;
      else delete copy[key];
      return copy;
    });
  };

  const editDay = (iso: string, value: LeaveType | null) => {
    const idx = indexOfIso(cal.year, iso);
    if (idx === null) return;
    setOverrides((o) => {
      if (selected.plan[idx] === value) delete o[iso];
      else o[iso] = value ?? 'work';
      return o;
    });
  };

  const applyOpportunity = (option: OpportunityOption) => {
    const remaining = { ...summary.remaining };
    const order = normalizeOrder(deferredSettings.allocationOrder);
    setOverrides((o) => {
      for (const idx of option.take) {
        if (plan[idx] !== null) continue;
        const t = order.find((k) => remaining[k] > 0) ?? order[0];
        remaining[t]--;
        const iso = cal.days[idx].iso;
        if (selected.plan[idx] === t) delete o[iso];
        else o[iso] = t;
      }
      return o;
    });
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const { downloadPdf } = await import('./lib/pdf');
      downloadPdf({
        settings: deferredSettings,
        cal,
        plan,
        summary,
        budget,
        scenarioName: selected.def.name + (overrides ? ' (angepasst)' : ''),
        schoolState,
      });
    } catch (err) {
      console.error(err);
      window.alert('Das PDF konnte nicht erstellt werden.');
    } finally {
      setExporting(false);
    }
  };

  const resetAll = () => {
    if (!window.confirm('Alle Eingaben, festen Zeiten und Änderungen zurücksetzen?')) return;
    setSettings(defaultSettings());
    setPeriods([]);
    setOverrideStore({});
    setSelectedId(SCENARIOS[0].id);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="3" y="6" width="26" height="23" rx="5" />
            <path d="M3 13h26M10 3v6M22 3v6" />
            <circle cx="16" cy="21" r="3.5" />
          </svg>
          <div>
            <h1>Urlaubsplaner</h1>
            <p>
              {cal.year} · {stateName(deferredSettings.state)} · Szenario „{selected.def.name}“
              {calculating && <span className="calc"> · berechne…</span>}
            </p>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={exportPdf} disabled={exporting}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 16h12" /></svg>
          {exporting ? 'Erstelle PDF…' : 'PDF exportieren'}
        </button>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <SettingsPanel
            settings={settings}
            budget={computeBudget(settings)}
            onChange={updateSettings}
            currentYear={currentYear}
            schoolStatus={schoolStatus}
          />
          <PeriodsPanel periods={periods} cal={cal} onChange={setPeriods} />
        </aside>

        <div className="content">
          <ScenarioPicker
            results={cards}
            selectedId={selected.def.id}
            edited={edited}
            daysInYear={cal.days.length}
            onSelect={setSelectedId}
          />
          <AccountOverview summary={summary} budget={budget} showSchool={schoolHolidays.length > 0} />
          <YearCalendar
            cal={cal}
            plan={plan}
            summary={summary}
            brush={brush}
            today={today}
            editedCount={overrides ? Object.keys(overrides).length : 0}
            onBrushChange={setBrush}
            onEdit={editDay}
            onReset={() => setOverrides(() => ({}))}
          />
          <BreakList summary={summary} />
          <Opportunities cal={cal} opportunities={opportunities} plan={plan} onApply={applyOpportunity} />
          <HolidayList cal={cal} state={deferredSettings.state} schoolState={schoolState} schoolStatus={schoolStatus} />
        </div>
      </main>

      <footer className="footer">
        <p>
          Alle Angaben ohne Gewähr – regionale Feiertage und betriebliche Regelungen bitte prüfen. Deine Eingaben
          werden nur lokal in diesem Browser gespeichert.
        </p>
        <button type="button" className="btn btn-ghost" onClick={resetAll}>Alles zurücksetzen</button>
      </footer>
    </div>
  );
}
