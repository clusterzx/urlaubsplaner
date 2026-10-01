import type { YearCalendar } from '../lib/calendar';
import { formatNumber, formatRange, formatWeekdayDate } from '../lib/dates';
import { isOptionInPlan, type Opportunity, type OpportunityOption } from '../lib/opportunities';
import type { Plan } from '../lib/plan';

interface Props {
  cal: YearCalendar;
  opportunities: Opportunity[];
  plan: Plan;
  onApply: (option: OpportunityOption) => void;
}

export function Opportunities({ cal, opportunities, plan, onApply }: Props) {
  return (
    <section aria-labelledby="opps-title">
      <div className="section-head">
        <h2 id="opps-title">Brückentage-Finder</h2>
        <p>Die lohnendsten Feiertags-Konstellationen {cal.year} – mit einem Klick in den aktuellen Plan übernehmen.</p>
      </div>
      {opportunities.length === 0 ? (
        <p className="empty-note">Keine lohnenden Brückentage gefunden.</p>
      ) : (
        <ul className="opp-list">
          {opportunities.map((o) => (
            <li key={o.anchor} className="opp">
              <div className="opp-title">
                <strong>{o.title}</strong>
                <span className="muted">{formatWeekdayDate(cal.days[o.anchor].iso)}</span>
              </div>
              <div className="opp-options">
                {o.options.map((opt) => {
                  const inPlan = isOptionInPlan(opt, plan);
                  return (
                    <div key={opt.cost} className={`opp-option${inPlan ? ' in-plan' : ''}`}>
                      <div className="opp-math">
                        <span className="opp-cost">{opt.cost} Tag{opt.cost === 1 ? '' : 'e'}</span>
                        <span className="arrow" aria-hidden="true">→</span>
                        <span className="opp-gain">{opt.length} Tage frei</span>
                        <span className="ratio">{formatNumber(opt.ratio, 1)}×</span>
                      </div>
                      <div className="opp-dates muted">
                        {formatRange(opt.startIso, opt.endIso)}
                        {opt.holidays.length > 1 && <> · inkl. {opt.holidays.filter((h) => h !== o.title).join(', ')}</>}
                      </div>
                      {inPlan ? (
                        <span className="in-plan-label">✓ im Plan</span>
                      ) : (
                        <button type="button" className="btn btn-small" onClick={() => onApply(opt)}>
                          Übernehmen
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
