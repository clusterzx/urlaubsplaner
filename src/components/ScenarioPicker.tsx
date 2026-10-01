import { formatNumber, formatRange } from '../lib/dates';
import type { ScenarioResult } from '../lib/scenarios';
import { LEAVE_LABEL, LEAVE_TYPES } from '../lib/types';

interface Props {
  results: ScenarioResult[];
  selectedId: string;
  edited: Set<string>;
  daysInYear: number;
  onSelect: (id: string) => void;
}

export function ScenarioPicker({ results, selectedId, edited, daysInYear, onSelect }: Props) {
  return (
    <section aria-labelledby="scenarios-title">
      <div className="section-head">
        <h2 id="scenarios-title">Szenarien</h2>
        <p>Vier Vorschläge, berechnet für deine Feiertage und Konten. Wähle einen aus und passe ihn im Kalender an.</p>
      </div>
      <div className="scenario-grid" role="radiogroup" aria-label="Szenario auswählen">
        {results.map((r) => {
          const s = r.summary;
          const active = r.def.id === selectedId;
          return (
            <button
              key={r.def.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`scenario-card${active ? ' active' : ''}`}
              onClick={() => onSelect(r.def.id)}
            >
              <span className="scenario-top">
                <span className="scenario-name">{r.def.name}</span>
                {edited.has(r.def.id) && <span className="badge">bearbeitet</span>}
              </span>
              <span className="scenario-tagline">{r.def.tagline}</span>
              <span className="scenario-kpi">
                <span className="kpi-big">{s.breakDays}</span>
                <span className="kpi-label">
                  Tage frei am Stück
                  <br />
                  aus {s.totalLeave} eingesetzten
                </span>
              </span>
              <span className="scenario-stats">
                <span><strong>{formatNumber(s.efficiency, 2)}×</strong> Faktor</span>
                <span><strong>{s.breaks.length}</strong> Auszeiten</span>
                <span><strong>{s.longest}</strong> Tage max.</span>
              </span>
              <span className="year-strip" aria-hidden="true">
                {s.breaks.map((b) => {
                  const start = Math.max(0, b.start);
                  const end = Math.min(daysInYear - 1, b.end);
                  return (
                    <span
                      key={b.start}
                      className="strip-seg"
                      style={{ left: `${(start / daysInYear) * 100}%`, width: `${((end - start + 1) / daysInYear) * 100}%` }}
                      title={formatRange(b.startIso, b.endIso)}
                    />
                  );
                })}
              </span>
              <span className="scenario-accounts">
                {LEAVE_TYPES.map((t) => (
                  <span key={t} className={`acc acc-${t}`}>
                    {LEAVE_LABEL[t]} {s.used[t]}
                  </span>
                ))}
              </span>
              {r.warnings.length > 0 && <span className="scenario-warn">{r.warnings[0]}</span>}
            </button>
          );
        })}
      </div>
      {results.find((r) => r.def.id === selectedId) && (
        <p className="scenario-desc">{results.find((r) => r.def.id === selectedId)!.def.description}</p>
      )}
    </section>
  );
}
