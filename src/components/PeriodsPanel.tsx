import { useState } from 'react';
import type { YearCalendar } from '../lib/calendar';
import { formatRange, indexOfIso, parseIso } from '../lib/dates';
import { newId } from '../lib/settings';
import { LEAVE_LABEL, PERIOD_KIND_LABEL, type LeaveType, type Period, type PeriodKind } from '../lib/types';

interface Props {
  periods: Period[];
  cal: YearCalendar;
  onChange: (periods: Period[]) => void;
}

const KIND_HINT: Record<PeriodKind, string> = {
  fixed: 'wird in jedem Szenario frei genommen',
  blocked: 'hier wird nie Urlaub eingeplant',
  free: 'zusätzlich frei, ohne Konto (z. B. Betriebsruhe)',
};

export function PeriodsPanel({ periods, cal, onChange }: Props) {
  const year = cal.year;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<PeriodKind>('fixed');
  const [leaveType, setLeaveType] = useState<LeaveType | 'auto'>('auto');
  const [error, setError] = useState('');

  const add = () => {
    const a = from;
    const b = to || from;
    if (!parseIso(a) || !parseIso(b)) {
      setError('Bitte mindestens ein Startdatum angeben.');
      return;
    }
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    onChange([
      ...periods,
      { id: newId(), from: lo, to: hi, label: label.trim(), kind, leaveType: kind === 'fixed' ? leaveType : 'auto' },
    ].sort((x, y) => x.from.localeCompare(y.from)));
    setFrom('');
    setTo('');
    setLabel('');
    setError('');
  };

  const workdaysIn = (p: Period) => {
    const a = indexOfIso(year, p.from)!;
    const b = indexOfIso(year, p.to)!;
    let count = 0;
    for (let i = Math.max(0, a); i <= Math.min(cal.days.length - 1, b); i++) if (cal.days[i].kind === 'work') count++;
    return count;
  };

  return (
    <section className="panel" aria-labelledby="periods-title">
      <h2 id="periods-title" className="panel-title">Feste Zeiten &amp; Wünsche</h2>
      <p className="panel-intro">
        Trage Zeiten ein, die dir wichtig sind – z. B. einen gebuchten Urlaub, eine Hochzeit oder Projektphasen,
        in denen du nicht weg kannst. Die Szenarien planen drumherum.
      </p>

      <div className="period-form">
        <div className="grid-2">
          <label className="field">
            <span className="field-label">Von</span>
            <input
              type="date"
              value={from}
              min={`${year - 1}-12-01`}
              max={`${year + 1}-01-31`}
              onChange={(e) => {
                setFrom(e.target.value);
                if (!to || to < e.target.value) setTo(e.target.value);
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">Bis</span>
            <input type="date" value={to} min={from || undefined} max={`${year + 1}-01-31`} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Bezeichnung</span>
          <input type="text" value={label} placeholder="z. B. Sommerurlaub Italien" onChange={(e) => setLabel(e.target.value)} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span className="field-label">Art</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as PeriodKind)}>
              {(Object.keys(PERIOD_KIND_LABEL) as PeriodKind[]).map((k) => (
                <option key={k} value={k}>{PERIOD_KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Buchen auf</span>
            <select value={leaveType} disabled={kind !== 'fixed'} onChange={(e) => setLeaveType(e.target.value as LeaveType | 'auto')}>
              <option value="auto">Automatisch</option>
              <option value="vacation">{LEAVE_LABEL.vacation}</option>
              <option value="eza">{LEAVE_LABEL.eza}</option>
              <option value="overtime">{LEAVE_LABEL.overtime}</option>
            </select>
          </label>
        </div>
        <p className="field-hint">{PERIOD_KIND_LABEL[kind]}: {KIND_HINT[kind]}.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="button" className="btn btn-secondary" onClick={add}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
          Zeitraum hinzufügen
        </button>
      </div>

      {periods.length > 0 && (
        <ul className="period-list">
          {periods.map((p) => {
            const otherYear = p.to < `${year}-01-01` || p.from > `${year}-12-31`;
            const wd = otherYear ? 0 : workdaysIn(p);
            return (
              <li key={p.id} className={`period-item kind-${p.kind}${otherYear ? ' other-year' : ''}`}>
                <span className="period-swatch" aria-hidden="true" />
                <div className="period-body">
                  <strong>{p.label || PERIOD_KIND_LABEL[p.kind]}</strong>
                  <span>
                    {formatRange(p.from, p.to)}
                    {otherYear
                      ? ' · anderes Jahr'
                      : ` · ${PERIOD_KIND_LABEL[p.kind]}${p.kind === 'fixed' ? ` · ${wd} Arbeitstag${wd === 1 ? '' : 'e'}` : ''}${
                          p.kind === 'fixed' && p.leaveType !== 'auto' ? ` · ${LEAVE_LABEL[p.leaveType]}` : ''
                        }`}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${p.label || 'Zeitraum'} entfernen`}
                  onClick={() => onChange(periods.filter((x) => x.id !== p.id))}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
