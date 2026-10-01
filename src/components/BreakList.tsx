import { formatNumber, formatWeekdayDate } from '../lib/dates';
import type { PlanSummary } from '../lib/plan';
import { LEAVE_LABEL, LEAVE_TYPES } from '../lib/types';

interface Props {
  summary: PlanSummary;
}

export function BreakList({ summary }: Props) {
  return (
    <section aria-labelledby="breaks-title">
      <div className="section-head">
        <h2 id="breaks-title">Geplante Auszeiten</h2>
        <p>Zusammenhängende freie Zeiträume inklusive Wochenenden und Feiertagen.</p>
      </div>
      {summary.breaks.length === 0 ? (
        <p className="empty-note">Noch keine Auszeiten geplant.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Zeitraum</th>
                <th scope="col" className="num">Tage frei</th>
                <th scope="col" className="num">Eingesetzt</th>
                <th scope="col">Konten</th>
                <th scope="col" className="num">Faktor</th>
                <th scope="col">Anlass</th>
              </tr>
            </thead>
            <tbody>
              {summary.breaks.map((b) => (
                <tr key={b.start}>
                  <td className="nowrap">
                    {formatWeekdayDate(b.startIso)} – {formatWeekdayDate(b.endIso)}
                  </td>
                  <td className="num"><strong>{b.length}</strong></td>
                  <td className="num">{b.leaveDays}</td>
                  <td>
                    <span className="chips">
                      {LEAVE_TYPES.filter((t) => b.byType[t] > 0).map((t) => (
                        <span key={t} className={`chip acc-${t}`}>{b.byType[t]} {LEAVE_LABEL[t]}</span>
                      ))}
                    </span>
                  </td>
                  <td className="num">{formatNumber(b.leaveDays ? b.length / b.leaveDays : 0, 2)}×</td>
                  <td className="muted">{[...b.labels, ...b.holidays].join(', ')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Summe</th>
                <td className="num"><strong>{summary.breakDays}</strong></td>
                <td className="num">{summary.totalLeave}</td>
                <td>
                  <span className="chips">
                    {LEAVE_TYPES.map((t) => (
                      <span key={t} className={`chip acc-${t}`}>{summary.used[t]} {LEAVE_LABEL[t]}</span>
                    ))}
                  </span>
                </td>
                <td className="num">{formatNumber(summary.efficiency, 2)}×</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
