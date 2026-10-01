import { formatNumber } from '../lib/dates';
import type { Budget, PlanSummary } from '../lib/plan';
import { LEAVE_LONG_LABEL, LEAVE_TYPES } from '../lib/types';

interface Props {
  summary: PlanSummary;
  budget: Budget;
  showSchool: boolean;
}

/** Kontenübersicht: Urlaub, EZA und Gleitzeit getrennt. */
export function AccountOverview({ summary, budget, showSchool }: Props) {
  return (
    <section aria-labelledby="accounts-title">
      <div className="section-head">
        <h2 id="accounts-title">Übersicht</h2>
      </div>
      <div className="account-grid">
        {LEAVE_TYPES.map((t) => {
          const used = summary.used[t];
          const available = summary.available[t];
          const rest = summary.remaining[t];
          const pct = available > 0 ? Math.min(100, (used / available) * 100) : used > 0 ? 100 : 0;
          return (
            <div key={t} className={`account-card acc-${t}${rest < 0 ? ' over' : ''}`}>
              <div className="account-head">
                <span className="account-dot" aria-hidden="true" />
                <span className="account-name">{LEAVE_LONG_LABEL[t]}</span>
              </div>
              <div className="account-value">
                <strong>{used}</strong> / {available} Tage verplant
              </div>
              <div
                className="meter"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={available}
                aria-valuenow={used}
                aria-label={`${LEAVE_LONG_LABEL[t]} verplant`}
              >
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className="account-rest">
                {rest >= 0 ? `Rest: ${rest} Tag${rest === 1 ? '' : 'e'}` : `${-rest} Tag${rest === -1 ? '' : 'e'} zu viel`}
                {t === 'overtime' && (
                  <>
                    {' '}· {formatNumber(used * budget.hoursPerDay, 2)} h von {formatNumber(budget.overtimeHours, 2)} h
                    {' '}(Rest {formatNumber(budget.overtimeHours - used * budget.hoursPerDay, 2)} h)
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div className="account-card summary-card">
          <div className="account-head">
            <span className="account-name">Ergebnis</span>
          </div>
          <div className="account-value">
            <strong>{summary.breakDays}</strong> Tage frei am Stück
          </div>
          <div className="account-rest">
            aus {summary.totalLeave} eingesetzten Tagen · Faktor {formatNumber(summary.efficiency, 2)}×
            <br />
            {summary.freeDaysInYear} freie Tage im Jahr insgesamt
            {showSchool && (
              <>
                <br />
                {summary.leaveInSchool} von {summary.totalLeave} eingesetzten Tagen in den Schulferien
              </>
            )}
          </div>
        </div>
      </div>
      {summary.warnings.length > 0 && (
        <ul className="warnings" role="status">
          {summary.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
