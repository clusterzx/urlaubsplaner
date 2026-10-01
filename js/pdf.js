/*
 * PDF-Export mit jsPDF: pro Szenario eine Jahresübersicht (A4 quer, eine
 * Zeile je Monat) und eine Seite mit Blockliste, Feiertagen und Grundlagen.
 */
(function (root) {
  'use strict';

  const UP = root.UP;

  const C = {
    ink: [23, 32, 46],
    ink2: [74, 84, 102],
    ink3: [111, 122, 141],
    line: [217, 223, 232],
    paper: [244, 246, 249],
    white: [255, 255, 255],
    red: [196, 29, 58],
    redTint: [251, 227, 231],
    weekend: [230, 234, 240],
    inblock: [220, 230, 243],
    empty: [248, 249, 251],
    sperre: [200, 205, 214],
    urlaub: [47, 125, 225],
    urlaubTint: [211, 229, 252],
    urlaubInk: [12, 69, 136],
    eza: [129, 80, 212],
    ezaTint: [231, 219, 250],
    ezaInk: [77, 36, 147],
    gleit: [220, 142, 11],
    gleitTint: [252, 229, 189],
    gleitInk: [119, 71, 0],
  };
  const TINT = { urlaub: C.urlaubTint, eza: C.ezaTint, gleit: C.gleitTint };
  const STRONG = { urlaub: C.urlaub, eza: C.eza, gleit: C.gleit };
  const INK = { urlaub: C.urlaubInk, eza: C.ezaInk, gleit: C.gleitInk };
  const CODE = { urlaub: 'U', eza: 'E', gleit: 'G' };
  const TYPE_LABEL = { auto: 'Frei (automatisch)', urlaub: 'Urlaub', eza: 'EZA', gleit: 'Gleitzeit', sperre: 'Sperrzeit' };

  const W = 297;
  const H = 210;
  const M = 12;

  const TABLE_W = 196;

  const fmt = (n, d = 1) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: d });
  const factor = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;

  /** Die Standardschriften von jsPDF kennen nur Latin-1; typografische Zeichen ersetzen. */
  const clean = (s) => String(s)
    .replace(/[–—]/g, '-')
    .replace(/→/g, '->')
    .replace(/×/g, 'x')
    .replace(/[„“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x00-\xff]/g, '');

  function text(doc, str, x, y, opt) { doc.text(clean(str), x, y, opt); }
  const fill = (doc, rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const stroke = (doc, rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  const color = (doc, rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  function font(doc, size, style = 'normal', rgb = C.ink) {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    color(doc, rgb);
  }

  function truncate(doc, str, maxW) {
    let s = clean(str);
    if (doc.getTextWidth(s) <= maxW) return s;
    while (s.length > 1 && doc.getTextWidth(`${s}...`) > maxW) s = s.slice(0, -1);
    return `${s.trimEnd()}...`;
  }

  const stateName = (code) => (UP.STATES.find((s) => s.code === code) || {}).name || code;

  function header(doc, result, plan, subtitle) {
    const s = result.settings;
    font(doc, 20, 'bold');
    text(doc, `URLAUBSPLAN ${s.year}`, M, 17);
    const w = doc.getTextWidth(`URLAUBSPLAN ${s.year}`);
    font(doc, 11, 'normal', C.ink2);
    text(doc, `${stateName(s.state)}  |  ${plan.scenario.name}${plan.modified ? ' (angepasst)' : ''}`, M + w + 6, 17);
    font(doc, 8, 'normal', C.ink3);
    text(doc, `Erstellt am ${UP.fmtDate(Date.now() - (Date.now() % UP.DAY_MS))}`, W - M, 17, { align: 'right' });
    if (subtitle) {
      font(doc, 9, 'normal', C.ink2);
      text(doc, subtitle, M, 23);
    }
    stroke(doc, C.line);
    doc.setLineWidth(0.3);
    doc.line(M, 26, W - M, 26);
  }

  function summaryBoxes(doc, result, plan, y) {
    const st = plan.stats;
    const s = result.settings;
    const boxes = [
      {
        rgb: C.urlaub, label: 'URLAUB',
        value: `${fmt(st.used.urlaub)} von ${fmt(st.available.urlaub)} Tagen`,
        sub: `Rest ${plural(st.remaining.urlaub, 'Tag', 'Tage')}`,
      },
      {
        rgb: C.eza, label: 'EZA (EXTRAZEITAUSGLEICH)',
        value: `${fmt(st.used.eza)} von ${fmt(st.available.eza)} Tagen`,
        sub: `Rest ${plural(st.remaining.eza, 'Tag', 'Tage')}`,
      },
      {
        rgb: C.gleit, label: `GLEITZEIT (${fmt(s.hoursPerDay, 2)} H = 1 TAG)`,
        value: `${fmt(st.used.gleit)} von ${fmt(st.available.gleit)} Tagen`,
        sub: `${fmt(st.gleitHoursUsed)} h genutzt, ${fmt(Math.max(0, st.gleitHoursLeft))} h verbleiben`,
      },
      {
        rgb: C.ink, label: 'ERGEBNIS',
        value: `${st.totalFree} Tage frei am Stück`,
        sub: `${plural(st.blocks.length, 'Block', 'Blöcke')}, Faktor ${factor(st.efficiency)}, längster ${st.longest} Tage`,
      },
    ];
    const gap = 4;
    const bw = (W - 2 * M - gap * 3) / 4;
    const bh = 16;
    boxes.forEach((b, k) => {
      const x = M + k * (bw + gap);
      fill(doc, C.paper);
      doc.rect(x, y, bw, bh, 'F');
      fill(doc, b.rgb);
      doc.rect(x, y, 1.4, bh, 'F');
      font(doc, 6.5, 'bold', C.ink3);
      text(doc, b.label, x + 4, y + 4.5);
      font(doc, 11, 'bold', C.ink);
      text(doc, b.value, x + 4, y + 10);
      font(doc, 7, 'normal', C.ink2);
      text(doc, truncate(doc, b.sub, bw - 6), x + 4, y + 14);
    });
    return y + bh;
  }

  /** Jahresstreifen: 12 Zeilen (Monate) x 31 Spalten (Tage). */
  function yearStrip(doc, result, plan, y0) {
    const s = result.settings;
    const cal = result.calendar;
    const labelW = 16;
    const cellW = (W - 2 * M - labelW) / 31;
    const rowH = 9.6;
    const inBlock = new Set();
    for (const b of plan.stats.blocks) for (let i = b.startIndex; i <= b.endIndex; i++) inBlock.add(i);

    font(doc, 6.5, 'bold', C.ink3);
    for (let d = 1; d <= 31; d++) text(doc, String(d), M + labelW + (d - 0.5) * cellW, y0 - 1.5, { align: 'center' });

    doc.setLineWidth(0.15);
    for (let m = 1; m <= 12; m++) {
      const y = y0 + (m - 1) * rowH;
      const nDays = new Date(Date.UTC(s.year, m, 0)).getUTCDate();
      let booked = 0;
      for (let d = 1; d <= 31; d++) {
        const x = M + labelW + (d - 1) * cellW;
        stroke(doc, C.white);
        if (d > nDays) {
          fill(doc, C.empty);
          doc.rect(x, y, cellW, rowH, 'F');
          continue;
        }
        const i = UP.indexOf(cal, UP.ymd(s.year, m, d));
        const day = cal.days[i];
        const a = plan.assign.get(i);
        if (a) booked += a.cost / 2;
        let bg = C.white;
        if (a) bg = TINT[a.type];
        else if (day.blocked) bg = C.sperre;
        else if (day.holiday) bg = C.redTint;
        else if (inBlock.has(i)) bg = C.inblock;
        else if (!day.workday || day.special === 'free') bg = C.weekend;
        fill(doc, bg);
        stroke(doc, C.line);
        doc.rect(x, y, cellW, rowH, 'FD');
        if (a) {
          fill(doc, STRONG[a.type]);
          doc.rect(x, y + rowH - 0.9, cellW, 0.9, 'F');
        }
        if (day.fixed) {
          stroke(doc, C.ink);
          doc.setLineWidth(0.45);
          doc.rect(x + 0.35, y + 0.35, cellW - 0.7, rowH - 0.7, 'S');
          doc.setLineWidth(0.15);
        }
        const red = day.dow === 0 || !!day.holiday;
        font(doc, 5.5, 'normal', red ? C.red : C.ink3);
        text(doc, UP.WEEKDAYS_SHORT[day.dow], x + cellW / 2, y + 3.4, { align: 'center' });
        if (a) {
          font(doc, 7.5, 'bold', INK[a.type]);
          text(doc, (a.cost === 1 ? '½' : '') + CODE[a.type], x + cellW / 2, y + 7.6, { align: 'center' });
        } else if (day.holiday) {
          font(doc, 6.5, 'bold', C.red);
          text(doc, 'FT', x + cellW / 2, y + 7.6, { align: 'center' });
        } else if (day.special === 'half') {
          font(doc, 6, 'normal', C.ink3);
          text(doc, '½', x + cellW / 2, y + 7.6, { align: 'center' });
        }
      }
      font(doc, 8.5, 'bold', C.ink);
      text(doc, UP.MONTHS_SHORT[m - 1].toUpperCase(), M, y + 4.6);
      if (booked) {
        font(doc, 6, 'normal', C.ink3);
        text(doc, `${fmt(booked)} T`, M, y + 8);
      }
    }
    return y0 + 12 * rowH;
  }

  function legend(doc, y) {
    const items = [
      { bg: C.urlaubTint, bar: C.urlaub, code: 'U', ink: C.urlaubInk, label: 'Urlaub' },
      { bg: C.ezaTint, bar: C.eza, code: 'E', ink: C.ezaInk, label: 'EZA' },
      { bg: C.gleitTint, bar: C.gleit, code: 'G', ink: C.gleitInk, label: 'Gleitzeit' },
      { bg: C.redTint, code: 'FT', ink: C.red, label: 'Feiertag' },
      { bg: C.weekend, label: 'Wochenende / frei' },
      { bg: C.inblock, label: 'frei im Urlaubsblock' },
      { bg: C.white, frame: true, label: 'fester Termin' },
      { bg: C.sperre, label: 'Sperrzeit' },
    ];
    let x = M;
    doc.setLineWidth(0.15);
    for (const it of items) {
      fill(doc, it.bg);
      stroke(doc, C.line);
      doc.rect(x, y - 3.2, 5, 4.4, 'FD');
      if (it.bar) { fill(doc, it.bar); doc.rect(x, y + 0.6, 5, 0.6, 'F'); }
      if (it.frame) { stroke(doc, C.ink); doc.setLineWidth(0.45); doc.rect(x + 0.3, y - 2.9, 4.4, 3.8, 'S'); doc.setLineWidth(0.15); }
      if (it.code) { font(doc, 5.5, 'bold', it.ink); text(doc, it.code, x + 2.5, y - 0.1, { align: 'center' }); }
      font(doc, 7.5, 'normal', C.ink2);
      text(doc, it.label, x + 6.5, y);
      x += 6.5 + doc.getTextWidth(clean(it.label)) + 7;
    }
  }

  function notesBlock(doc, plan, y) {
    const lines = [...plan.notes, ...plan.stats.warnings];
    const st = plan.stats;
    const unplanned = st.remaining.urlaub + st.remaining.eza + st.remaining.gleit;
    if (unplanned > 0.01 && !st.warnings.length) lines.push(`${plural(unplanned, 'Tag ist', 'Tage sind')} noch nicht verplant.`);
    lines.push('Faktor = freie Tage am Stück je eingesetztem Urlaubs-, EZA- oder Gleittag. "Zu beantragen" (Seite 2) listet die Zeiträume je Kontingent.');
    font(doc, 7.5, 'normal', C.ink2);
    for (const l of lines) {
      for (const part of doc.splitTextToSize(clean(l), W - 2 * M)) {
        text(doc, part, M, y);
        y += 3.6;
      }
    }
  }

  function blocksTable(doc, result, plan) {
    const st = plan.stats;
    const x0 = M;
    const cols = [
      { key: 'nr', label: '#', w: 7 },
      { key: 'range', label: 'FREI AM STÜCK', w: 36 },
      { key: 'len', label: 'TAGE', w: 11, align: 'right' },
      { key: 'u', label: 'URLAUB', w: 14, align: 'right' },
      { key: 'e', label: 'EZA', w: 10, align: 'right' },
      { key: 'g', label: 'GLEIT', w: 11, align: 'right' },
      { key: 'f', label: 'FAKTOR', w: 14, align: 'right' },
      { key: 'antrag', label: 'ZU BEANTRAGEN', w: 52, pad: 5 },
      { key: 'reason', label: 'ANLASS', w: 0 },
    ];
    const tableW = TABLE_W;
    cols[cols.length - 1].w = tableW - cols.slice(0, -1).reduce((s, c) => s + c.w, 0);

    let y = 34;
    const drawHead = () => {
      font(doc, 11, 'bold');
      text(doc, 'URLAUBSBLÖCKE', x0, y);
      y += 6;
      font(doc, 6.5, 'bold', C.ink3);
      let x = x0;
      for (const c of cols) {
        const tx = c.align === 'right' ? x + c.w - 1.5 : x + (c.pad || 0);
        text(doc, c.label, tx, y, c.align === 'right' ? { align: 'right' } : undefined);
        x += c.w;
      }
      y += 2;
      stroke(doc, C.ink3);
      doc.setLineWidth(0.3);
      doc.line(x0, y, x0 + tableW, y);
      y += 4.5;
    };
    drawHead();

    if (!st.blocks.length) {
      font(doc, 9, 'normal', C.ink3);
      text(doc, 'Keine Urlaubsblöcke geplant.', x0, y + 2);
      return;
    }

    const reasonW = cols[cols.length - 1].w - 1;
    st.blocks.forEach((b, idx) => {
      const ranges = b.ranges.map((r) => `${UP.POOL_LABEL[r.type]}: ${UP.fmtRange(r.from, r.to)}`);
      const names = [...new Set(b.holidays.map((h) => h.name))];
      const reason = [b.labels.length ? `Fest: ${b.labels.join(', ')}` : (b.fixed ? 'Fester Termin' : ''), names.join(', ')]
        .filter(Boolean).join(' | ') || (b.booked <= 2 ? 'Verlängertes Wochenende' : 'Urlaub');
      font(doc, 7.5, 'normal');
      const reasonLines = doc.splitTextToSize(clean(reason), reasonW).slice(0, 3);
      const lines = Math.max(1, ranges.length, reasonLines.length);
      const rowH = lines * 3.6 + 2.4;
      if (y + rowH > H - 12) {
        doc.addPage();
        header(doc, result, plan);
        y = 34;
        drawHead();
      }
      const vals = {
        nr: String(idx + 1),
        range: UP.fmtRange(b.start, b.end),
        len: String(b.len),
        u: b.used.urlaub ? fmt(b.used.urlaub) : '-',
        e: b.used.eza ? fmt(b.used.eza) : '-',
        g: b.used.gleit ? fmt(b.used.gleit) : '-',
        f: `${factor(b.ratio)}x`,
      };
      let x = x0;
      for (const c of cols) {
        if (c.key === 'antrag') {
          b.ranges.forEach((r, k) => {
            font(doc, 7.5, 'normal', INK[r.type]);
            text(doc, truncate(doc, ranges[k], c.w - 6), x + 5, y + k * 3.6);
          });
        } else if (c.key === 'reason') {
          font(doc, 7.5, 'normal', names.length ? C.red : C.ink2);
          reasonLines.forEach((l, k) => doc.text(l, x, y + k * 3.6));
        } else {
          const bold = c.key === 'len';
          font(doc, bold ? 9 : 8, bold ? 'bold' : 'normal', C.ink);
          if (c.key === 'u' && b.used.urlaub) color(doc, C.urlaubInk);
          if (c.key === 'e' && b.used.eza) color(doc, C.ezaInk);
          if (c.key === 'g' && b.used.gleit) color(doc, C.gleitInk);
          const tx = c.align === 'right' ? x + c.w - 1.5 : x;
          text(doc, vals[c.key], tx, y, c.align === 'right' ? { align: 'right' } : undefined);
        }
        x += c.w;
      }
      y += rowH - 2.4;
      stroke(doc, C.line);
      doc.setLineWidth(0.15);
      doc.line(x0, y - 1.2, x0 + tableW, y - 1.2);
      y += 3.2;
    });

    // Summenzeile
    font(doc, 8, 'bold', C.ink);
    text(doc, 'Summe', x0 + 7, y);
    let x = x0 + cols[0].w + cols[1].w;
    const sums = [String(st.totalFree), fmt(st.used.urlaub), fmt(st.used.eza), fmt(st.used.gleit), `${factor(st.efficiency)}x`];
    cols.slice(2, 7).map((c) => c.w).forEach((w, k) => {
      text(doc, sums[k], x + w - 1.5, y, { align: 'right' });
      x += w;
    });
  }

  function sidePanel(doc, result) {
    const s = result.settings;
    const x = M + TABLE_W + 8;
    const w = W - M - x;
    let y = 34;
    font(doc, 11, 'bold');
    text(doc, `FEIERTAGE ${s.year}`, x, y);
    y += 5;
    font(doc, 7, 'normal', C.ink3);
    text(doc, stateName(s.state), x, y);
    y += 4.5;
    for (const h of result.holidays) {
      const off = !s.workdays.includes(h.weekday);
      font(doc, 7.5, 'normal', off ? C.ink3 : C.ink);
      text(doc, `${UP.WEEKDAYS_SHORT[h.weekday]} ${UP.fmtDate(h.date).slice(0, 6)}`, x, y);
      text(doc, truncate(doc, h.name + (h.regional ? ' (regional)' : ''), w - 19), x + 18, y);
      y += 3.7;
    }

    y += 4;
    font(doc, 11, 'bold');
    text(doc, 'GRUNDLAGEN', x, y);
    y += 5;
    const wd = [1, 2, 3, 4, 5, 6, 0].filter((d) => s.workdays.includes(d)).map((d) => UP.WEEKDAYS_SHORT[d]).join(', ');
    const special = { normal: 'normale Arbeitstage', half: 'halbe Arbeitstage', free: 'arbeitsfrei' }[s.specialDays];
    const order = (UP.ORDERS.find((o) => o.id === s.orderId) || UP.ORDERS[0]).label;
    const rows = [
      ['Urlaubsanspruch', `${fmt(s.urlaubDays)} Tage`],
      ['EZA', `${fmt(s.ezaDays)} Tage`],
      ['Überstunden', `${fmt(s.overtimeHours)} h = ${fmt(result.pools.gleit / 2)} Gleittage`],
      ['Gleittag', `${fmt(s.hoursPerDay, 2)} h`],
      ['Reserve', `${fmt(s.reserveDays)} Tage`],
      ['Arbeitstage', wd],
      ['24.12. / 31.12.', special],
      ['Haupturlaub', `${UP.MONTHS[s.mainFrom - 1]} bis ${UP.MONTHS[s.mainTo - 1]}`],
      ['Verbuchung', order],
    ];
    for (const [k, v] of rows) {
      font(doc, 7.5, 'normal', C.ink3);
      text(doc, k, x, y);
      font(doc, 7.5, 'normal', C.ink);
      text(doc, truncate(doc, v, w - 24), x + 24, y);
      y += 3.7;
    }

    if (s.fixed.length) {
      y += 4;
      font(doc, 11, 'bold');
      text(doc, 'FESTE ZEITRÄUME', x, y);
      y += 5;
      for (const f of s.fixed) {
        if (y > H - 12) break;
        font(doc, 7.5, 'normal', C.ink);
        text(doc, UP.fmtRange(UP.fromISO(f.from), UP.fromISO(f.to)), x, y);
        y += 3.4;
        font(doc, 7, 'normal', C.ink3);
        text(doc, truncate(doc, [f.label, TYPE_LABEL[f.type]].filter(Boolean).join(' | '), w), x, y);
        y += 4.2;
      }
    }
  }

  function footer(doc) {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      font(doc, 6.5, 'normal', C.ink3);
      text(doc, 'Urlaubsplaner | Angaben ohne Gewähr, betriebliche Regelungen und regionale Feiertage bitte prüfen.', M, H - 6);
      text(doc, `Seite ${p} von ${n}`, W - M, H - 6, { align: 'right' });
    }
  }

  function drawPlan(doc, result, plan) {
    header(doc, result, plan, plan.scenario.description);
    const y = summaryBoxes(doc, result, plan, 30);
    const end = yearStrip(doc, result, plan, y + 9);
    legend(doc, end + 6);
    notesBlock(doc, plan, end + 13);
    doc.addPage();
    header(doc, result, plan);
    sidePanel(doc, result);
    blocksTable(doc, result, plan);
  }

  function buildPdf(result, plans) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title: `Urlaubsplan ${result.settings.year}`, creator: 'Urlaubsplaner' });
    plans.forEach((plan, k) => {
      if (k) doc.addPage();
      drawPlan(doc, result, plan);
    });
    footer(doc);
    return doc;
  }

  function fileName(result, plans) {
    const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const base = `Urlaubsplan_${result.settings.year}_${result.settings.state}`;
    return plans.length === 1 ? `${base}_${slug(plans[0].scenario.name)}.pdf` : `${base}_alle-Szenarien.pdf`;
  }

  function exportPdf(result, plans) {
    const doc = buildPdf(result, plans);
    doc.save(fileName(result, plans));
    return doc;
  }

  root.UP = Object.assign(root.UP || {}, { exportPdf, buildPdf, pdfFileName: fileName });
})(typeof self !== 'undefined' ? self : this);
