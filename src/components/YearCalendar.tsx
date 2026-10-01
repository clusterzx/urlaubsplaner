import { useMemo } from 'react';
import type { DayInfo, YearCalendar as Cal } from '../lib/calendar';
import { formatDate, MONTHS, WEEKDAYS_LONG, WEEKDAYS_SHORT } from '../lib/dates';
import type { Plan, PlanSummary } from '../lib/plan';
import { LEAVE_LABEL, LEAVE_LONG_LABEL, LEAVE_SHORT, type LeaveType } from '../lib/types';

export type Brush = 'cycle' | LeaveType | 'work';

const CYCLE: (LeaveType | null)[] = [null, 'vacation', 'eza', 'overtime'];

interface Props {
  cal: Cal;
  plan: Plan;
  summary: PlanSummary;
  brush: Brush;
  today: string;
  editedCount: number;
  onBrushChange: (b: Brush) => void;
  onEdit: (iso: string, value: LeaveType | null) => void;
  onReset: () => void;
}

const BRUSHES: { id: Brush; label: string }[] = [
  { id: 'cycle', label: 'Durchschalten' },
  { id: 'vacation', label: 'Urlaub' },
  { id: 'eza', label: 'EZA' },
  { id: 'overtime', label: 'Gleitzeit' },
  { id: 'work', label: 'Arbeiten' },
];

export function YearCalendar({ cal, plan, summary, brush, today, editedCount, onBrushChange, onEdit, onReset }: Props) {
  const inBreak = useMemo(() => {
    const set = new Set<number>();
    for (const b of summary.breaks) for (let d = Math.max(0, b.start); d <= Math.min(cal.days.length - 1, b.end); d++) set.add(d);
    return set;
  }, [summary.breaks, cal.days.length]);

  const months = useMemo(() => {
    const result: DayInfo[][] = Array.from({ length: 12 }, () => []);
    for (const d of cal.days) result[d.month].push(d);
    return result;
  }, [cal.days]);

  const click = (day: DayInfo) => {
    const current = plan[day.idx];
    let next: LeaveType | null;
    if (brush === 'cycle') next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
    else if (brush === 'work') next = null;
    else next = current === brush ? null : brush;
    onEdit(day.iso, next);
  };

  return (
    <section aria-labelledby="calendar-title">
      <div className="section-head section-head-row">
        <div>
          <h2 id="calendar-title">Jahreskalender {cal.year}</h2>
          <p>Klick auf einen Arbeitstag ändert die Buchung.</p>
        </div>
        <div className="calendar-tools">
          <div className="segmented" role="radiogroup" aria-label="Klick bucht">
            {BRUSHES.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={brush === b.id}
                className={`seg seg-${b.id}${brush === b.id ? ' on' : ''}`}
                onClick={() => onBrushChange(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
          {editedCount > 0 && (
            <button type="button" className="btn btn-ghost" onClick={onReset}>
              {editedCount} Änderung{editedCount === 1 ? '' : 'en'} verwerfen
            </button>
          )}
        </div>
      </div>

      <Legend school={cal.schoolHolidays.length > 0} schoolAll={cal.schoolEnvelope.length > 0} />

      <div className="months">
        {months.map((days, m) => {
          const lead = days[0].weekday;
          return (
            <div key={m} className="month">
              <div className="month-name">{MONTHS[m]}</div>
              <div className="month-grid" role="grid" aria-label={`${MONTHS[m]} ${cal.year}`}>
                {WEEKDAYS_SHORT.map((w) => (
                  <span key={w} className="wd" aria-hidden="true">{w}</span>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <span key={`e${i}`} className="day empty" aria-hidden="true" />
                ))}
                {days.map((day) => {
                  const t = plan[day.idx];
                  const cls = ['day', `k-${day.kind}`];
                  if (t) cls.push(`t-${t}`);
                  if (!t && day.kind !== 'work' && inBreak.has(day.idx)) cls.push('in-break');
                  if (day.fixed) cls.push('fixed');
                  if (day.blocked) cls.push('blocked');
                  if (day.past) cls.push('past');
                  if (day.iso === today) cls.push('today');
                  if (day.school) cls.push('school');
                  if (day.schoolAll) cls.push('school-all');
                  const parts = [`${WEEKDAYS_LONG[day.weekday]}, ${formatDate(day.iso)}`];
                  if (day.holiday) parts.push(day.holiday);
                  if (day.freeLabel) parts.push(day.freeLabel);
                  if (day.school) parts.push(day.school);
                  if (day.schoolAll) parts.push(`${day.schoolAll} (bundesweiter Zeitraum)`);
                  if (t) parts.push(LEAVE_LONG_LABEL[t]);
                  if (day.fixed) parts.push(`Fest: ${day.fixed.label}`);
                  if (day.blocked) parts.push(`Sperre: ${day.blocked}`);
                  const title = parts.join(' – ');
                  if (day.kind !== 'work') {
                    return (
                      <span key={day.idx} className={cls.join(' ')} title={title}>
                        {day.dom}
                      </span>
                    );
                  }
                  return (
                    <button
                      key={day.idx}
                      type="button"
                      className={cls.join(' ')}
                      title={title}
                      aria-label={title}
                      onClick={() => click(day)}
                    >
                      {day.dom}
                      {t && <span className="mark" aria-hidden="true">{LEAVE_SHORT[t]}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Legend({ school, schoolAll }: { school: boolean; schoolAll: boolean }) {
  return (
    <ul className="legend" aria-label="Legende">
      <li><span className="sw t-vacation" />{LEAVE_LABEL.vacation}</li>
      <li><span className="sw t-eza" />{LEAVE_LONG_LABEL.eza}</li>
      <li><span className="sw t-overtime" />{LEAVE_LONG_LABEL.overtime}</li>
      <li><span className="sw k-holiday" />Feiertag</li>
      <li><span className="sw k-free" />Arbeitsfrei</li>
      <li><span className="sw k-weekend" />Wochenende</li>
      <li><span className="sw in-break" />frei in Auszeit</li>
      <li><span className="sw fixed" />Feste Zeit</li>
      <li><span className="sw blocked" />Urlaubssperre</li>
      {school && <li><span className="sw school" />Schulferien</li>}
      {schoolAll && <li><span className="sw school-all" />Ferien bundesweit (frühester Beginn – spätestes Ende)</li>}
    </ul>
  );
}
