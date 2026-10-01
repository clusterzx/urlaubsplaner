import type { YearCalendar } from '../lib/calendar';
import { formatDate, formatWeekdayDate, weekdayOfIso, WEEKDAYS_SHORT } from '../lib/dates';
import { stateName, type StateCode } from '../lib/holidays';
import type { SchoolHoliday } from '../lib/schoolHolidays';

interface Props {
  cal: YearCalendar;
  state: StateCode;
  schoolState: StateCode;
  schoolStatus?: string;
}

const inYear = (cal: YearCalendar) => (h: SchoolHoliday) => h.to >= `${cal.year}-01-01` && h.from <= `${cal.year}-12-31`;

const states = (list: StateCode[]) => (list.length > 4 ? `${list.slice(0, 3).join(', ')} +${list.length - 3}` : list.join(', '));

const range = (year: number) => (h: SchoolHoliday) => {
  // Termine außerhalb des Planungsjahres mit Jahreszahl
  const fmt = (iso: string) => (iso.startsWith(`${year}-`) ? formatWeekdayDate(iso) : `${WEEKDAYS_SHORT[weekdayOfIso(iso)]}, ${formatDate(iso)}`);
  return h.from === h.to ? fmt(h.from) : `${fmt(h.from)} – ${fmt(h.to)}`;
};

export function HolidayList({ cal, state, schoolState, schoolStatus }: Props) {
  const school = cal.schoolHolidays.filter(inYear(cal));
  const envelope = cal.schoolEnvelope.filter(inYear(cal));
  const hasSchool = school.length > 0 || envelope.length > 0;
  const fmtRange = range(cal.year);
  return (
    <section aria-labelledby="holidays-title">
      <details className="holidays">
        <summary>
          <h2 id="holidays-title">
            Feiertage{hasSchool && ' & Schulferien'} {cal.year}
          </h2>
          <span className="muted">
            {cal.holidays.filter((h) => cal.days.find((d) => d.iso === h.date)?.kind === 'holiday').length} Feiertage an Arbeitstagen
          </span>
        </summary>
        <h3 className="list-title">Gesetzliche Feiertage – {stateName(state)}</h3>
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
        {school.length > 0 && (
          <>
            <h3 className="list-title">Schulferien – {stateName(schoolState)}</h3>
            <ul className="holiday-list school-list">
              {school.map((h) => (
                <li key={h.from + h.name}>
                  <span className="h-date h-range">{fmtRange(h)}</span>
                  <span className="h-name">{h.name}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {envelope.length > 0 && (
          <>
            <h3 className="list-title">Ferienzeitraum aller Bundesländer (frühester Beginn – spätestes Ende)</h3>
            <ul className="holiday-list school-list">
              {envelope.map((h) => (
                <li key={h.from + h.name}>
                  <span className="h-date h-range">{fmtRange(h)}</span>
                  <span className="h-name">
                    {h.name}
                    <span className="h-detail muted">
                      ab {states(h.first)} · bis {states(h.last)}
                      {h.states < 16 && ` · ${h.states} ${h.states === 1 ? 'Land' : 'Länder'}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {hasSchool && schoolStatus && (
          <p className="list-note muted">{schoolStatus}. Bewegliche Ferientage einzelner Schulen sind nicht enthalten.</p>
        )}
      </details>
    </section>
  );
}
