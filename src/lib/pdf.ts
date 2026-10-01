// PDF-Export (A4 quer): Jahresübersicht, Kontenstand und Liste der Auszeiten.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { YearCalendar } from './calendar';
import { daysInMonth, formatDate, formatNumber, formatRange, MONTHS, todayIso, WEEKDAYS_SHORT } from './dates';
import { stateName } from './holidays';
import type { Budget, Plan, PlanSummary } from './plan';
import { LEAVE_LABEL, LEAVE_SHORT, LEAVE_TYPES, type LeaveType, type Settings } from './types';

type RGB = [number, number, number];

const COLOR: Record<LeaveType | 'holiday' | 'weekend' | 'free' | 'inBreak' | 'blocked' | 'past', RGB> = {
  vacation: [37, 99, 235],
  eza: [124, 58, 237],
  overtime: [217, 119, 6],
  holiday: [254, 202, 202],
  weekend: [229, 231, 235],
  free: [167, 243, 208],
  inBreak: [219, 234, 254],
  blocked: [243, 244, 246],
  past: [249, 250, 251],
};
const INK: RGB = [17, 24, 39];
const MUTED: RGB = [107, 114, 128];
const LINE: RGB = [209, 213, 219];

export interface PdfInput {
  settings: Settings;
  cal: YearCalendar;
  plan: Plan;
  summary: PlanSummary;
  budget: Budget;
  scenarioName: string;
}

export function createPdf(input: PdfInput): jsPDF {
  const { settings, cal, plan, summary, budget, scenarioName } = input;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;

  // Kopf
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`Urlaubsplan ${settings.year}`, margin, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(
    `${stateName(settings.state)}  ·  Szenario „${scenarioName}“  ·  erstellt am ${formatDate(todayIso())}`,
    margin,
    21,
  );

  // Kennzahlen
  const boxes: { title: string; value: string; sub: string; color?: RGB }[] = [
    ...LEAVE_TYPES.map((t) => ({
      title: LEAVE_LABEL[t],
      value: `${summary.used[t]} / ${summary.available[t]} Tage`,
      sub:
        t === 'overtime'
          ? `Rest ${summary.remaining[t]} Tage (${formatNumber(summary.remaining[t] * budget.hoursPerDay + budget.overtimeRestHours, 2)} h)`
          : `Rest ${summary.remaining[t]} Tage`,
      color: COLOR[t],
    })),
    {
      title: 'Freie Tage am Stück',
      value: `${summary.breakDays} Tage`,
      sub: `aus ${summary.totalLeave} eingesetzten Tagen (${formatNumber(summary.efficiency, 2)}×)`,
    },
    {
      title: 'Auszeiten',
      value: `${summary.breaks.length}`,
      sub: `längste: ${summary.longest} Tage`,
    },
  ];
  const gap = 4;
  const boxW = (pageW - 2 * margin - gap * (boxes.length - 1)) / boxes.length;
  boxes.forEach((b, i) => {
    const x = margin + i * (boxW + gap);
    const y = 26;
    doc.setDrawColor(...LINE);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, boxW, 17, 1.5, 1.5, 'FD');
    if (b.color) {
      doc.setFillColor(...b.color);
      doc.rect(x, y + 1.5, 1.2, 14, 'F');
    }
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(b.title, x + 4, y + 5);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(b.value, x + 4, y + 10.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(b.sub, x + 4, y + 14.5);
  });

  drawYearGrid(doc, cal, plan, summary, margin, 50, pageW - 2 * margin);

  // Auszeiten
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text('Geplante Auszeiten', margin, 15);

  const body = summary.breaks.map((b, i) => [
    String(i + 1),
    formatRange(b.startIso, b.endIso),
    String(b.length),
    String(b.leaveDays),
    String(b.byType.vacation || ''),
    String(b.byType.eza || ''),
    String(b.byType.overtime || ''),
    formatNumber(b.leaveDays ? b.length / b.leaveDays : 0, 2) + '×',
    [...b.labels, ...b.holidays].join(', '),
  ]);
  autoTable(doc, {
    startY: 19,
    margin: { left: margin, right: margin },
    head: [['#', 'Zeitraum', 'Tage frei', 'Eingesetzt', 'Urlaub', 'EZA', 'Gleitzeit', 'Faktor', 'Anlass / Feiertage']],
    body,
    foot: [[
      '',
      'Summe',
      String(summary.breakDays),
      String(summary.totalLeave),
      String(summary.used.vacation),
      String(summary.used.eza),
      String(summary.used.overtime),
      formatNumber(summary.efficiency, 2) + '×',
      '',
    ]],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.6, textColor: INK, lineColor: LINE },
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [243, 244, 246], textColor: INK, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8, halign: 'right' },
      1: { cellWidth: 46 },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 16, halign: 'right', textColor: COLOR.vacation },
      5: { cellWidth: 14, halign: 'right', textColor: COLOR.eza },
      6: { cellWidth: 18, halign: 'right', textColor: COLOR.overtime },
      7: { cellWidth: 16, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' && data.column.index >= 2 && data.column.index <= 7) data.cell.styles.halign = 'right';
    },
  });

  let y = lastY(doc) + 8;
  const half = (pageW - 2 * margin - 8) / 2;

  // Kontenübersicht (links) und Feiertage (rechts)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Kontenübersicht', margin, y);
  doc.text(`Feiertage ${settings.year} – ${stateName(settings.state)}`, margin + half + 8, y);
  const accountRows = LEAVE_TYPES.map((t) => [
    LEAVE_LABEL[t],
    String(summary.available[t]),
    String(summary.used[t]),
    String(summary.remaining[t]),
  ]);
  if (budget.overtimeHours > 0) {
    accountRows.push([
      'Gleitzeit in Stunden',
      formatNumber(budget.overtimeHours, 2),
      formatNumber(summary.used.overtime * budget.hoursPerDay, 2),
      formatNumber(budget.overtimeHours - summary.used.overtime * budget.hoursPerDay, 2),
    ]);
  }
  accountRows.push([
    'Gesamt',
    String(budget.total),
    String(summary.totalLeave),
    String(budget.total - summary.totalLeave),
  ]);
  autoTable(doc, {
    startY: y + 3,
    margin: { left: margin, right: pageW - margin - half },
    head: [['Konto', 'Verfügbar', 'Verplant', 'Rest']],
    body: accountRows,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.6, textColor: INK, lineColor: LINE },
    headStyles: { fillColor: [31, 41, 55], textColor: 255 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right';
      if (data.section === 'body' && data.row.index === accountRows.length - 1) data.cell.styles.fontStyle = 'bold';
    },
  });
  const leftEnd = lastY(doc);

  const notes = [
    `1 Gleitzeittag = ${formatNumber(budget.hoursPerDay, 2)} h; vorhandene Überstunden: ${formatNumber(budget.overtimeHours, 2)} h` +
      (budget.overtimeRestHours > 0 ? ` (Rest ${formatNumber(budget.overtimeRestHours, 2)} h ohne ganzen Tag)` : ''),
    `Arbeitstage: ${settings.workDays.map((d) => WEEKDAYS_SHORT[d]).join(', ')}`,
    `Urlaub ${settings.vacationDays} Tage` +
      (settings.carryOverDays ? ` + ${settings.carryOverDays} Resturlaub` : '') +
      `, EZA ${settings.ezaDays} Tage` +
      (settings.reserveDays ? `, Reserve ${settings.reserveDays} Tage` : ''),
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  notes.forEach((line, i) => doc.text(line, margin, leftEnd + 5 + i * 3.6, { maxWidth: half }));

  const weekdayHolidays = cal.holidays.map((h) => {
    const day = cal.days.find((d) => d.iso === h.date)!;
    return [
      `${WEEKDAYS_SHORT[day.weekday]}, ${formatDate(h.date)}`,
      h.name + (h.regional ? ' (regional)' : ''),
      day.kind === 'weekend' ? 'Wochenende' : '',
    ];
  });
  autoTable(doc, {
    startY: y + 3,
    margin: { left: margin + half + 8, right: margin },
    head: [['Datum', 'Feiertag', '']],
    body: weekdayHolidays,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.3, textColor: INK, lineColor: LINE },
    headStyles: { fillColor: [31, 41, 55], textColor: 255 },
    columnStyles: { 0: { cellWidth: 26 }, 2: { cellWidth: 20, textColor: MUTED } },
  });

  // Seitenfuß
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const h = doc.internal.pageSize.getHeight();
    doc.text(`Urlaubsplan ${settings.year} · ${stateName(settings.state)} · ${scenarioName}`, margin, h - 6);
    doc.text(`Seite ${p} von ${pages}`, pageW - margin, h - 6, { align: 'right' });
  }
  return doc;
}

function lastY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function drawYearGrid(
  doc: jsPDF,
  cal: YearCalendar,
  plan: Plan,
  summary: PlanSummary,
  x0: number,
  y0: number,
  width: number,
) {
  const labelW = 20;
  const cellW = (width - labelW) / 31;
  const cellH = 9.4;
  const headH = 5;

  const inBreak = new Set<number>();
  for (const b of summary.breaks) for (let d = Math.max(0, b.start); d <= Math.min(cal.days.length - 1, b.end); d++) inBreak.add(d);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  for (let d = 1; d <= 31; d++) {
    doc.text(String(d), x0 + labelW + (d - 0.5) * cellW, y0 + 3.5, { align: 'center' });
  }

  let idx = 0;
  for (let m = 0; m < 12; m++) {
    const y = y0 + headH + m * cellH;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(MONTHS[m], x0, y + cellH / 2 + 1.2);
    const dim = daysInMonth(cal.year, m);
    for (let d = 1; d <= 31; d++) {
      const x = x0 + labelW + (d - 1) * cellW;
      if (d > dim) continue;
      const day = cal.days[idx++];
      const t = plan[day.idx];
      let fill: RGB = [255, 255, 255];
      let text: RGB = INK;
      let mark = '';
      if (t) {
        fill = COLOR[t];
        text = [255, 255, 255];
        mark = LEAVE_SHORT[t];
      } else if (day.kind === 'holiday') {
        fill = COLOR.holiday;
        text = [153, 27, 27];
        mark = 'F';
      } else if (day.kind === 'free') {
        fill = COLOR.free;
        text = [6, 95, 70];
        mark = 'A';
      } else if (day.kind === 'weekend') {
        fill = inBreak.has(day.idx) ? COLOR.inBreak : COLOR.weekend;
        text = MUTED;
      } else if (day.blocked) {
        fill = COLOR.blocked;
        text = MUTED;
        mark = 'S';
      } else if (day.past) {
        fill = COLOR.past;
        text = [180, 180, 180];
      }
      if (day.kind === 'holiday' && inBreak.has(day.idx)) fill = [252, 165, 165];
      doc.setFillColor(...fill);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.15);
      doc.rect(x, y, cellW, cellH, 'FD');
      if (day.fixed && t) {
        doc.setDrawColor(...INK);
        doc.setLineWidth(0.5);
        doc.rect(x + 0.35, y + 0.35, cellW - 0.7, cellH - 0.7, 'S');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(...text);
      doc.text(WEEKDAYS_SHORT[day.weekday], x + cellW / 2, y + 3, { align: 'center' });
      if (mark) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(mark, x + cellW / 2, y + 7.6, { align: 'center' });
      }
    }
  }

  // Legende
  const ly = y0 + headH + 12 * cellH + 6;
  const items: { fill: RGB; label: string; mark?: string; text?: RGB; frame?: boolean }[] = [
    { fill: COLOR.vacation, label: 'Urlaub', mark: 'U', text: [255, 255, 255] },
    { fill: COLOR.eza, label: 'EZA (Extrazeitausgleich)', mark: 'E', text: [255, 255, 255] },
    { fill: COLOR.overtime, label: 'Gleitzeit (Überstundenabbau)', mark: 'G', text: [255, 255, 255] },
    { fill: COLOR.holiday, label: 'Feiertag', mark: 'F', text: [153, 27, 27] },
    { fill: COLOR.free, label: 'Arbeitsfrei', mark: 'A', text: [6, 95, 70] },
    { fill: COLOR.weekend, label: 'Wochenende' },
    { fill: COLOR.inBreak, label: 'Wochenende in Auszeit' },
    { fill: [255, 255, 255], label: 'Fester Termin', frame: true },
    { fill: COLOR.blocked, label: 'Urlaubssperre', mark: 'S', text: MUTED },
  ];
  let lx = x0;
  doc.setFontSize(7.5);
  for (const it of items) {
    doc.setFillColor(...it.fill);
    doc.setDrawColor(...(it.frame ? INK : LINE));
    doc.setLineWidth(it.frame ? 0.5 : 0.15);
    doc.rect(lx, ly - 3, 4.5, 4.5, 'FD');
    if (it.mark) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...(it.text ?? INK));
      doc.text(it.mark, lx + 2.25, ly + 0.3, { align: 'center' });
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text(it.label, lx + 6, ly + 0.3);
    lx += 6 + doc.getTextWidth(it.label) + 6;
  }
}

export function pdfFileName(settings: Settings, scenarioName: string): string {
  const slug = scenarioName
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `urlaubsplan-${settings.year}-${settings.state.toLowerCase()}-${slug}.pdf`;
}

export function downloadPdf(input: PdfInput): void {
  createPdf(input).save(pdfFileName(input.settings, input.scenarioName));
}
