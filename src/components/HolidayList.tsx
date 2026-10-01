import type { YearCalendar } from '../lib/calendar';
import { formatDate, WEEKDAYS_SHORT } from '../lib/dates';
import { stateName, type StateCode } from '../lib/holidays';

interface Props {
  cal: YearCalendar;
  state: StateCode;
}

export function HolidayList({ cal, state }: Props) {
  return (
    <section aria-labelledby="holidays-title">
      <details className="holidays">
        <summary>
          <h2 id="holidays-title">Feiertage {cal.year} in {stateName(state)}</h2>
          <span className="muted">
            {cal.holidays.filter((h) => cal.days.find((d) => d.iso === h.date)?.kind === 'holiday').length} an Arbeitstagen
          </span>
        </summary>
        <ul className="holiday-list">
          {cal.holidays.map((h) => {
            const day = cal.days.find((d) => d.iso === h.date)!;
            const onWeekend = day.kind === 'weekend';
            return (
              <li key={h.date + h.name} className={onWeekend ? 'weekend' : ''}>
                <span className="h-date">{WEEKDAYS_SHORT[day.weekday]}, {formatDate(h.date)}</span>
                <span className="h-name">
                  {h.name}
                  {h.regional && <span className="tag">regional</span>}
                  {onWeekend && <span className="tag">Wochenende</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
