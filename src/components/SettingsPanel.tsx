import { formatNumber, WEEKDAYS_SHORT } from '../lib/dates';
import { NumberInput } from './NumberInput';
import { regionalOptionsFor, STATES, type StateCode } from '../lib/holidays';
import type { Budget } from '../lib/plan';
import { LEAVE_LABEL, type AllocationMode, type LeaveType, type Settings } from '../lib/types';

interface Props {
  settings: Settings;
  budget: Budget;
  onChange: (patch: Partial<Settings>) => void;
  currentYear: number;
}

const ORDERS: LeaveType[][] = [
  ['overtime', 'eza', 'vacation'],
  ['eza', 'overtime', 'vacation'],
  ['eza', 'vacation', 'overtime'],
  ['overtime', 'vacation', 'eza'],
  ['vacation', 'eza', 'overtime'],
  ['vacation', 'overtime', 'eza'],
];

export function SettingsPanel({ settings, budget, onChange, currentYear }: Props) {
  const years: number[] = [];
  for (let y = currentYear - 1; y <= currentYear + 6; y++) years.push(y);
  if (!years.includes(settings.year)) years.push(settings.year);
  years.sort((a, b) => a - b);
  const regional = regionalOptionsFor(settings.state);
  const orderKey = settings.allocationOrder.join(',');

  const numberField = (
    key: 'vacationDays' | 'ezaDays' | 'overtimeHours' | 'hoursPerDay' | 'carryOverDays' | 'reserveDays',
    label: string,
    opts: { max?: number; min?: number; suffix?: string; hint?: string } = {},
  ) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-wrap">
        <NumberInput value={settings[key]} min={opts.min ?? 0} max={opts.max ?? 365} onChange={(v) => onChange({ [key]: v })} />
        {opts.suffix && <span className="suffix">{opts.suffix}</span>}
      </span>
      {opts.hint && <span className="field-hint">{opts.hint}</span>}
    </label>
  );

  return (
    <section className="panel" aria-labelledby="settings-title">
      <h2 id="settings-title" className="panel-title">Grunddaten</h2>
      <div className="grid-2">
        <label className="field">
          <span className="field-label">Jahr</span>
          <select value={settings.year} onChange={(e) => onChange({ year: Number(e.target.value) })}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Bundesland</span>
          <select value={settings.state} onChange={(e) => onChange({ state: e.target.value as StateCode })}>
            {STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </label>
      </div>
      {regional.length > 0 && (
        <div className="checks">
          {regional.map((o) => (
            <label key={o.id} className="check">
              <input
                type="checkbox"
                checked={settings.regional[o.id] ?? o.defaultOn}
                onChange={(e) => onChange({ regional: { ...settings.regional, [o.id]: e.target.checked } })}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}

      <div className="grid-2">
        {numberField('vacationDays', 'Urlaubstage', { suffix: 'Tage', hint: 'Jahresurlaub' })}
        {numberField('ezaDays', 'EZA-Tage', { suffix: 'Tage', hint: 'Extrazeitausgleich' })}
        {numberField('overtimeHours', 'Überstunden vorhanden', { max: 2000, suffix: 'h', hint: 'Gleitzeitguthaben' })}
        {numberField('hoursPerDay', 'Stunden pro Tag', { min: 0.5, max: 24, suffix: 'h', hint: 'entspricht 1 freien Tag' })}
      </div>
      <p className="calc-note">
        {formatNumber(budget.overtimeHours, 2)} h ÷ {formatNumber(budget.hoursPerDay, 2)} h ={' '}
        <strong>{budget.overtime} Gleitzeittag{budget.overtime === 1 ? '' : 'e'}</strong>
        {budget.overtimeRestHours > 0 && <> (Rest {formatNumber(budget.overtimeRestHours, 2)} h)</>}
        <br />
        Gesamt verfügbar: <strong>{budget.total} Tage</strong>
        {budget.plannable !== budget.total && <>, davon {budget.plannable} verplant</>}
      </p>

      <details className="more">
        <summary>Weitere Einstellungen</summary>
        <div className="grid-2">
          {numberField('carryOverDays', 'Resturlaub Vorjahr', { suffix: 'Tage' })}
          {numberField('reserveDays', 'Reserve (nicht verplanen)', { suffix: 'Tage' })}
        </div>

        <div className="field">
          <span className="field-label">Arbeitstage</span>
          <div className="weekday-toggle" role="group" aria-label="Arbeitstage">
            {WEEKDAYS_SHORT.map((label, d) => {
              const on = settings.workDays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  className={on ? 'on' : ''}
                  aria-pressed={on}
                  onClick={() => {
                    const next = on ? settings.workDays.filter((x) => x !== d) : [...settings.workDays, d].sort((a, b) => a - b);
                    if (next.length > 0) onChange({ workDays: next });
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="checks">
          <label className="check">
            <input type="checkbox" checked={settings.christmasEveOff} onChange={(e) => onChange({ christmasEveOff: e.target.checked })} />
            <span>Heiligabend (24.12.) ist arbeitsfrei</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.newYearsEveOff} onChange={(e) => onChange({ newYearsEveOff: e.target.checked })} />
            <span>Silvester (31.12.) ist arbeitsfrei</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.requireLongBreak} onChange={(e) => onChange({ requireLongBreak: e.target.checked })} />
            <span>Mindestens 2 Wochen am Stück einplanen (§ 7 BUrlG)</span>
          </label>
          {settings.year === currentYear && (
            <label className="check">
              <input type="checkbox" checked={settings.excludePast} onChange={(e) => onChange({ excludePast: e.target.checked })} />
              <span>Vergangene Tage nicht verplanen</span>
            </label>
          )}
        </div>

        <div className="grid-2">
          <label className="field">
            <span className="field-label">Konten-Reihenfolge</span>
            <select
              value={orderKey}
              onChange={(e) => onChange({ allocationOrder: e.target.value.split(',') as LeaveType[] })}
            >
              {ORDERS.map((o) => (
                <option key={o.join(',')} value={o.join(',')}>
                  {o.map((t) => LEAVE_LABEL[t]).join(' → ')}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Verteilung</span>
            <select value={settings.allocationMode} onChange={(e) => onChange({ allocationMode: e.target.value as AllocationMode })}>
              <option value="shortFirst">Kurze Auszeiten zuerst</option>
              <option value="chronological">Chronologisch</option>
            </select>
          </label>
        </div>
        <p className="field-hint">
          Bestimmt, aus welchem Konto die Tage automatisch gebucht werden. Standard: Brückentage zuerst aus
          Gleitzeit, dann EZA – lange Urlaube aus dem Urlaubskonto.
        </p>
      </details>
    </section>
  );
}
