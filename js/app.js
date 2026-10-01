/*
 * Oberfläche: liest die Eingaben, ruft die Planungs-Engine auf und zeichnet
 * Szenario-Vergleich, Kontingente, Kalender und Listen. Speichert Eingaben im
 * localStorage (nur auf diesem Gerät).
 */
(function () {
  'use strict';

  const UP = window.UP;
  const STORAGE_KEY = 'urlaubsplaner.v1';
  const TYPE_LABEL = { urlaub: 'Urlaub', eza: 'EZA', gleit: 'Gleitzeit', auto: 'Automatisch', sperre: 'Sperrzeit' };
  const POOL_TYPES = ['urlaub', 'eza', 'gleit'];
  const CYCLE = [null, 'urlaub', 'eza', 'gleit'];
  const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const VIEWS = [
    { id: 'kalender', label: 'Kalender' },
    { id: 'bloecke', label: 'Urlaubsblöcke' },
    { id: 'brueckentage', label: 'Brückentage' },
    { id: 'feiertage', label: 'Feiertage' },
  ];

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, digits = 1) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: digits });
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
  const factor = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function defaultYear() {
    const now = new Date();
    return now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        settings: state.settings, overrides: state.overrides, sig: state.sig, active: state.active, view: state.view,
      }));
    } catch { /* Speichern ist optional */ }
  }

  const saved = load();
  const state = {
    settings: UP.normalizeSettings({ ...UP.DEFAULTS, year: defaultYear(), ...(saved && saved.settings) }),
    overrides: (saved && saved.overrides) || {},
    sig: (saved && saved.sig) || null,
    active: (saved && saved.active) || 'ausgewogen',
    view: saved && VIEWS.some((v) => v.id === saved.view) ? saved.view : 'kalender',
    result: null,
  };

  /* ---------- Formular ---------- */

  function buildStaticOptions() {
    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = thisYear - 1; y <= thisYear + 6; y++) years.push(y);
    if (!years.includes(state.settings.year)) years.push(state.settings.year);
    $('#year').innerHTML = years.sort().map((y) => `<option value="${y}">${y}</option>`).join('');
    $('#state').innerHTML = UP.STATES.map((s) => `<option value="${s.code}">${esc(s.name)}</option>`).join('');
    const months = UP.MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    $('#mainFrom').innerHTML = months;
    $('#mainTo').innerHTML = months;
    $('#orderId').innerHTML = UP.ORDERS.map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join('');
    $('#workdays').innerHTML = WD_ORDER.map((d) => `
      <label title="${UP.WEEKDAYS_LONG[d]}">
        <input type="checkbox" value="${d}" id="wd${d}" aria-label="${UP.WEEKDAYS_LONG[d]}">
        <span>${UP.WEEKDAYS_SHORT[d]}</span>
      </label>`).join('');
  }

  function renderRegional() {
    const s = state.settings;
    const opts = UP.regionalOptions(s.state);
    $('#regional').innerHTML = opts.map((r) => `
      <label class="check">
        <input type="checkbox" value="${r.id}" id="reg-${r.id}" ${s.regional.includes(r.id) ? 'checked' : ''}>
        <span>${esc(r.name)}<small>${esc(r.hint)}</small></span>
      </label>`).join('');
  }

  function fillForm() {
    const s = state.settings;
    $('#year').value = s.year;
    $('#state').value = s.state;
    $('#urlaubDays').value = s.urlaubDays;
    $('#ezaDays').value = s.ezaDays;
    $('#overtimeHours').value = s.overtimeHours;
    $('#hoursPerDay').value = s.hoursPerDay;
    $('#reserveDays').value = s.reserveDays;
    $('#specialDays').value = s.specialDays;
    $('#mainFrom').value = s.mainFrom;
    $('#mainTo').value = s.mainTo;
    $('#orderId').value = s.orderId;
    $('#gleitForBridges').checked = s.gleitForBridges;
    $('#customMaxBlocks').value = s.custom.maxBlocks;
    $('#customMainDays').value = s.custom.mainDays;
    $('#customMaxBlockDays').value = s.custom.maxBlockDays;
    $$('#workdays input').forEach((i) => { i.checked = s.workdays.includes(+i.value); });
    renderRegional();
  }

  const numVal = (sel) => {
    const v = parseFloat(String($(sel).value).replace(',', '.'));
    return Number.isFinite(v) ? v : undefined;
  };

  function readForm() {
    const prev = state.settings;
    const s = { ...prev };
    s.year = +$('#year').value;
    const newState = $('#state').value;
    const stateChanged = newState !== prev.state;
    s.state = newState;
    s.regional = stateChanged ? null : $$('#regional input:checked').map((i) => i.value);
    s.urlaubDays = numVal('#urlaubDays');
    s.ezaDays = numVal('#ezaDays');
    s.overtimeHours = numVal('#overtimeHours');
    s.hoursPerDay = numVal('#hoursPerDay');
    s.reserveDays = numVal('#reserveDays');
    s.specialDays = $('#specialDays').value;
    s.mainFrom = +$('#mainFrom').value;
    s.mainTo = +$('#mainTo').value;
    s.orderId = $('#orderId').value;
    s.gleitForBridges = $('#gleitForBridges').checked;
    s.workdays = $$('#workdays input:checked').map((i) => +i.value);
    s.custom = {
      maxBlocks: numVal('#customMaxBlocks'),
      mainDays: numVal('#customMainDays'),
      maxBlockDays: numVal('#customMaxBlockDays'),
    };
    state.settings = UP.normalizeSettings(s);
    if (stateChanged) renderRegional();
  }

  function renderGleitCalc() {
    const s = state.settings;
    const days = Math.floor(s.overtimeHours / s.hoursPerDay + 1e-9);
    const rest = s.overtimeHours - days * s.hoursPerDay;
    $('#gleitCalc').innerHTML = `${fmt(s.overtimeHours)} h ÷ ${fmt(s.hoursPerDay, 2)} h = <strong>${plural(days, 'Gleittag', 'Gleittage')}</strong>`
      + (rest > 0.001 ? `, Rest ${fmt(rest, 2)} h` : '');
  }

  /* ---------- Feste Zeiträume ---------- */

  function renderFixedList() {
    const { year } = state.settings;
    const cal = state.result && state.result.calendar;
    $('#fixedList').innerHTML = state.settings.fixed.map((f) => {
      const a = UP.fromISO(f.from);
      const b = UP.fromISO(f.to);
      let cost = 0;
      if (cal) for (const d of cal.days) if (d.inYear && d.t >= a && d.t <= b) cost += d.cost;
      const outside = b < UP.ymd(year, 1, 1) || a > UP.ymd(year, 12, 31);
      const meta = [TYPE_LABEL[f.type]];
      if (f.type !== 'sperre') meta.push(outside ? `nicht in ${year}` : plural(cost / 2, 'Arbeitstag', 'Arbeitstage'));
      return `
        <li class="fixed-item">
          <i class="dot t-${f.type}" aria-hidden="true"></i>
          <div class="fixed-main">
            <strong>${UP.fmtRange(a, b)}</strong>
            <span>${f.label ? `${esc(f.label)} · ` : ''}${meta.join(' · ')}</span>
          </div>
          <button type="button" class="icon-btn" data-remove="${esc(f.id)}" aria-label="Zeitraum ${UP.fmtRange(a, b)} entfernen">×</button>
        </li>`;
    }).join('');
  }

  function addFixed() {
    const from = $('#fxFrom').value;
    const to = $('#fxTo').value || from;
    const err = $('#fxError');
    if (!from) {
      err.textContent = 'Bitte mindestens ein Startdatum wählen.';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    const id = `f${Date.now().toString(36)}`;
    state.settings = UP.normalizeSettings({
      ...state.settings,
      fixed: [...state.settings.fixed, { id, from, to, label: $('#fxLabel').value.trim(), type: $('#fxType').value }],
    });
    $('#fxFrom').value = '';
    $('#fxTo').value = '';
    $('#fxLabel').value = '';
    recompute();
  }

  /* ---------- Berechnen ---------- */

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(recompute, 180);
  }

  function recompute() {
    const sig = JSON.stringify(state.settings);
    if (sig !== state.sig) {
      state.overrides = {};
      state.sig = sig;
    }
    state.result = UP.computePlans(state.settings, state.overrides);
    if (!state.result.plans.some((p) => p.scenario.id === state.active)) state.active = state.result.plans[0].scenario.id;
    renderAll();
    save();
  }

  const activePlan = () => state.result.plans.find((p) => p.scenario.id === state.active);
  const stateName = (code) => (UP.STATES.find((s) => s.code === code) || {}).name || code;

  function renderAll() {
    const s = state.settings;
    $('#appContext').textContent = `${s.year} · ${stateName(s.state)}`;
    document.title = `Urlaubsplaner ${s.year}`;
    renderGleitCalc();
    renderFixedList();
    renderComparison();
    renderPlan();
  }

  /* ---------- Szenario-Vergleich ---------- */

  function renderComparison() {
    const plans = state.result.plans;
    const bestFree = Math.max(...plans.map((p) => p.stats.totalFree));
    const rows = plans.map((p) => {
      const st = p.stats;
      const sel = p.scenario.id === state.active;
      return `
        <tr role="radio" tabindex="${sel ? 0 : -1}" aria-selected="${sel}" aria-checked="${sel}" data-scenario="${p.scenario.id}">
          <td><span class="scn"><span class="radio" aria-hidden="true"></span><span class="name">${esc(p.scenario.name)}${p.modified ? '<span class="tag">angepasst</span>' : ''}</span></span></td>
          <td class="num${st.totalFree === bestFree ? ' best' : ''}">${st.totalFree}</td>
          <td class="num opt-col">${fmt(st.totalBooked)}</td>
          <td class="num">${factor(st.efficiency)}</td>
          <td class="num opt-col">${st.blocks.length}</td>
          <td class="num opt-col">${st.longest}</td>
        </tr>`;
    }).join('');
    $('#scenarios').innerHTML = `
      <table class="cmp">
        <thead><tr>
          <th>Szenario</th>
          <th class="num">Tage frei am Stück</th>
          <th class="num opt-col">Eingesetzt</th>
          <th class="num">Faktor</th>
          <th class="num opt-col">Blöcke</th>
          <th class="num opt-col">Längster Block</th>
        </tr></thead>
        <tbody role="radiogroup" aria-label="Szenario wählen">${rows}</tbody>
      </table>`;
  }

  /* ---------- Gewähltes Szenario ---------- */

  function poolsTable(plan) {
    const st = plan.stats;
    const s = state.settings;
    const rows = POOL_TYPES.map((t) => {
      const avail = st.available[t];
      const used = st.used[t];
      const rest = st.remaining[t];
      const over = rest < 0;
      const pct = avail > 0 ? Math.min(100, (used / avail) * 100) : (used > 0 ? 100 : 0);
      const sub = t === 'gleit' ? `<span class="pool-sub">aus ${fmt(s.overtimeHours)} h, ${fmt(s.hoursPerDay, 2)} h = 1 Tag</span>`
        : t === 'eza' ? '<span class="pool-sub">Extrazeitausgleich</span>' : '<span class="pool-sub">Jahresanspruch</span>';
      const restText = t === 'gleit'
        ? `${fmt(rest)}<span class="pool-sub">Konto ${fmt(Math.max(0, st.gleitHoursLeft))} h</span>`
        : fmt(rest);
      return `
        <tr>
          <td><span class="pool-name"><i class="sw sw-${t}"></i>${UP.POOL_LABEL[t]}</span>${sub}</td>
          <td class="num">${fmt(avail)}</td>
          <td class="num">${fmt(used)}<span class="meter t-${t}${over ? ' over' : ''}" aria-hidden="true"><i style="width:${pct}%"></i></span></td>
          <td class="num${over ? ' over' : ''}">${restText}</td>
        </tr>`;
    }).join('');
    return `
      <div class="table-wrap">
        <table class="pools">
          <thead><tr><th>Kontingent in Tagen</th><th class="num">Verfügbar</th><th class="num">Verplant</th><th class="num">Rest</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function dayTitle(d, a) {
    const parts = [`${UP.WEEKDAYS_LONG[d.dow]}, ${UP.fmtDate(d.t)} (KW ${UP.isoWeek(d.t)})`];
    if (d.holiday) parts.push(d.holiday);
    if (d.special === 'half') parts.push('halber Arbeitstag');
    if (d.special === 'free') parts.push('arbeitsfrei');
    if (a) parts.push(UP.POOL_LABEL[a.type] + (a.cost === 1 ? ' (halber Tag)' : ''));
    if (d.fixed) parts.push(`Fest: ${d.fixed.label || TYPE_LABEL[d.fixed.type]}`);
    if (d.blocked) parts.push('Sperrzeit');
    return parts.join(' · ');
  }

  function renderCalendar(plan) {
    const cal = state.result.calendar;
    const { year } = state.settings;
    const inBlock = new Set();
    for (const b of plan.stats.blocks) for (let i = b.startIndex; i <= b.endIndex; i++) inBlock.add(i);
    const head = WD_ORDER.map((d) => `<span class="wd">${UP.WEEKDAYS_SHORT[d]}</span>`).join('');
    let months = '';
    for (let m = 1; m <= 12; m++) {
      const first = UP.ymd(year, m, 1);
      const nDays = new Date(Date.UTC(year, m, 0)).getUTCDate();
      const lead = (UP.dow(first) + 6) % 7;
      let booked = 0;
      let cells = '<span class="day out"></span>'.repeat(lead);
      for (let dd = 1; dd <= nDays; dd++) {
        const t = UP.ymd(year, m, dd);
        const i = UP.indexOf(cal, t);
        const d = cal.days[i];
        const a = plan.assign.get(i);
        if (a) booked += a.cost / 2;
        const cls = ['day'];
        if (!d.workday) cls.push('we');
        if (d.holiday) cls.push('hol');
        if (d.special === 'half') cls.push('half');
        if (d.special === 'free') cls.push('cfree');
        if (a) cls.push(`t-${a.type}`);
        else if (inBlock.has(i)) cls.push('inblock');
        if (a && a.manual) cls.push('manual');
        if (d.fixed) cls.push('fixed');
        if (d.blocked) cls.push('blocked');
        const title = esc(dayTitle(d, a));
        const editable = d.cost > 0 && !d.fixed && !d.blocked;
        cells += editable
          ? `<button type="button" class="${cls.join(' ')}" data-i="${i}" title="${title}" aria-label="${title}">${dd}</button>`
          : `<span class="${cls.join(' ')}" title="${title}">${dd}</span>`;
      }
      months += `
        <div class="month">
          <h3>${UP.MONTHS[m - 1]}${booked ? `<small>${plural(booked, 'Tag', 'Tage')}</small>` : ''}</h3>
          <div class="mgrid">${head}${cells}</div>
        </div>`;
    }
    return `
      <div class="panel">
        <div class="legend" aria-label="Legende">
          <span><i class="day t-urlaub">1</i>Urlaub</span>
          <span><i class="day t-eza">1</i>EZA</span>
          <span><i class="day t-gleit">1</i>Gleitzeit</span>
          <span><i class="day hol">1</i>Feiertag</span>
          <span><i class="day inblock">1</i>frei im Block</span>
          <span><i class="day fixed">1</i>fester Termin</span>
          <span><i class="day blocked">1</i>Sperrzeit</span>
        </div>
        <div class="months">${months}</div>
        <p class="hint">Klick auf einen Arbeitstag wechselt zwischen Urlaub, EZA, Gleitzeit und Arbeitstag. Die Zahlen rechnen sofort mit.</p>
      </div>`;
  }

  function reasonOf(b) {
    const parts = [];
    if (b.labels.length) parts.push(`<span class="label-fixed">Fest</span>${b.labels.map(esc).join(', ')}`);
    else if (b.fixed) parts.push('<span class="label-fixed">Fest</span>');
    const names = [...new Set(b.holidays.map((h) => h.name))];
    if (names.length) parts.push(`<span class="hl">${names.map(esc).join(', ')}</span>`);
    if (b.manual) parts.push('<span class="label-fixed">Manuell</span>');
    if (!parts.length) parts.push(b.booked <= 2 ? 'Verlängertes Wochenende' : 'Urlaub');
    return parts.join(' ');
  }

  function renderBlocks(plan) {
    const blocks = plan.stats.blocks;
    if (!blocks.length) return '<p class="empty">Keine Urlaubsblöcke geplant. Prüfe die Kontingente in der linken Spalte.</p>';
    const cell = (v) => (v ? fmt(v) : '<span class="muted">–</span>');
    const rows = blocks.map((b) => `
      <tr>
        <td class="nowrap">${UP.fmtRange(b.start, b.end)}</td>
        <td class="num"><strong>${b.len}</strong></td>
        <td class="num">${cell(b.used.urlaub)}</td>
        <td class="num">${cell(b.used.eza)}</td>
        <td class="num">${cell(b.used.gleit)}</td>
        <td class="num">${factor(b.ratio)}</td>
        <td><div class="ranges">${b.ranges.map((r) => `<span><i class="sw sw-${r.type}" aria-hidden="true"></i>${UP.POOL_LABEL[r.type]} ${UP.fmtRange(r.from, r.to)}</span>`).join('')}</div></td>
        <td class="reason">${reasonOf(b)}</td>
      </tr>`).join('');
    const st = plan.stats;
    return `
      <p class="panel-intro">Faktor = freie Tage am Stück je eingesetztem Tag. „Zu beantragen“ zeigt die Zeiträume je Kontingent für den Antrag.</p>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Frei am Stück</th><th class="num">Tage</th><th class="num">Urlaub</th><th class="num">EZA</th><th class="num">Gleitzeit</th><th class="num">Faktor</th><th>Zu beantragen</th><th>Anlass</th>
          </tr></thead>
          <tbody>${rows}
            <tr class="group-row">
              <td><strong>Summe</strong></td>
              <td class="num"><strong>${st.totalFree}</strong></td>
              <td class="num"><strong>${fmt(st.used.urlaub)}</strong></td>
              <td class="num"><strong>${fmt(st.used.eza)}</strong></td>
              <td class="num"><strong>${fmt(st.used.gleit)}</strong></td>
              <td class="num"><strong>${factor(st.efficiency)}</strong></td>
              <td></td><td></td>
            </tr>
          </tbody>
        </table>
      </div>`;
  }

  function renderOpportunities() {
    const { opportunities, settings } = state.result;
    if (!opportunities.length) return '<p class="empty">Keine lohnenden Brückentage gefunden.</p>';
    const rows = opportunities.map((o) => {
      const names = [...new Set(o.holidays.map((h) => h.name))].join(' & ');
      const dates = o.holidays.map((h) => UP.fmtShort(h.t)).join(', ');
      return o.options.map((x, k) => `
        <tr class="${k === 0 ? 'group-row' : ''}">
          <td>${k === 0 ? `<span class="hol-name">${esc(names)}</span>` : ''}</td>
          <td class="nowrap">${k === 0 ? dates : ''}</td>
          <td class="num">${plural(x.days, 'Tag', 'Tage')}</td>
          <td class="nowrap">${UP.fmtRange(x.from, x.to)}</td>
          <td class="num">${x.free} Tage</td>
          <td class="nowrap">${UP.fmtRange(x.freeFrom, x.freeTo)}</td>
          <td class="num factor">${factor(x.ratio)}</td>
        </tr>`).join('');
    }).join('');
    return `
      <p class="panel-intro">Lohnende Kombinationen rund um die Feiertage in ${esc(stateName(settings.state))}, unabhängig vom gewählten Szenario.</p>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Feiertag</th><th>Datum</th><th class="num">Einsatz</th><th>Frei nehmen</th><th class="num">Frei am Stück</th><th>Zeitraum</th><th class="num">Faktor</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderHolidays() {
    const { holidays, settings } = state.result;
    const workdays = settings.workdays;
    const effective = holidays.filter((h) => workdays.includes(h.weekday)).length;
    const rows = holidays.map((h) => {
      const onFree = !workdays.includes(h.weekday);
      return `
        <tr class="${onFree ? 'weekend' : ''}">
          <td class="nowrap">${UP.fmtDate(h.date)}</td>
          <td>${UP.WEEKDAYS_LONG[h.weekday]}</td>
          <td>${esc(h.name)}${h.regional ? ' (regional)' : ''}</td>
          <td>${onFree ? 'fällt auf einen freien Tag' : 'Arbeitstag frei'}</td>
        </tr>`;
    }).join('');
    return `
      <p class="panel-intro">${esc(stateName(settings.state))} ${settings.year}: ${holidays.length} Feiertage, davon ${effective} an Arbeitstagen.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Datum</th><th>Wochentag</th><th>Feiertag</th><th>Wirkung</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderView(plan) {
    switch (state.view) {
      case 'bloecke': return renderBlocks(plan);
      case 'brueckentage': return renderOpportunities();
      case 'feiertage': return renderHolidays();
      default: return renderCalendar(plan);
    }
  }

  function renderPlan() {
    const plan = activePlan();
    const st = plan.stats;
    const notes = [
      ...plan.notes.map((n) => `<p class="notice">${esc(n)}</p>`),
      ...st.warnings.map((w) => `<p class="notice warn">${esc(w)}</p>`),
    ];
    const unplanned = st.remaining.urlaub + st.remaining.eza + st.remaining.gleit;
    if (unplanned > 0.01 && !st.warnings.length) {
      notes.push(`<p class="notice">${plural(unplanned, 'Tag ist', 'Tage sind')} noch nicht verplant${state.settings.reserveDays ? ' (inkl. Reserve)' : ''}.</p>`);
    }
    const counts = {
      bloecke: st.blocks.length,
      brueckentage: state.result.opportunities.length,
      feiertage: state.result.holidays.length,
    };
    const tabs = VIEWS.map((v) => `
      <button type="button" class="tab" role="tab" id="view-${v.id}" data-view="${v.id}" aria-selected="${v.id === state.view}" tabindex="${v.id === state.view ? 0 : -1}">
        ${v.label}${counts[v.id] !== undefined ? `<span class="count">${counts[v.id]}</span>` : ''}
      </button>`).join('');

    $('#plan').innerHTML = `
      <div class="plan-head">
        <div class="plan-title">
          <h2>${esc(plan.scenario.name)}${plan.modified ? '<span class="tag">angepasst</span>' : ''}</h2>
          <p>${esc(plan.scenario.description)}</p>
        </div>
        <div class="plan-actions">
          ${plan.modified ? '<button type="button" class="btn" data-action="reset-plan">Änderungen verwerfen</button>' : ''}
          <button type="button" class="btn" data-action="pdf-all">Alle Szenarien als PDF</button>
          <button type="button" class="btn btn-primary" data-action="pdf">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 2v8m0 0 3-3m-3 3L5 7M3 12v2h10v-2"/></svg>
            PDF exportieren
          </button>
        </div>
      </div>
      <div class="notices">${notes.join('')}</div>
      ${poolsTable(plan)}
      <div class="tabs" role="tablist" aria-label="Ansicht">${tabs}</div>
      <div class="view" role="tabpanel" aria-labelledby="view-${state.view}">${renderView(plan)}</div>`;
  }

  /* ---------- Interaktion ---------- */

  function toggleDay(i) {
    const plan = activePlan();
    const cal = state.result.calendar;
    const d = cal.days[i];
    const cur = plan.assign.get(i);
    const next = CYCLE[(CYCLE.indexOf(cur ? cur.type : null) + 1) % CYCLE.length];
    const base = plan.baseAssign.get(i);
    const baseType = base ? base.type : null;
    const id = plan.scenario.id;
    const ov = { ...(state.overrides[id] || {}) };
    if (next === baseType) delete ov[d.iso];
    else ov[d.iso] = next || 'none';
    if (Object.keys(ov).length) state.overrides[id] = ov;
    else delete state.overrides[id];
    refreshPlan(plan);
    renderComparison();
    renderPlan();
    const btn = $(`#plan button.day[data-i="${i}"]`);
    if (btn) btn.focus();
    save();
  }

  function refreshPlan(plan) {
    const { calendar, settings } = state.result;
    const ov = state.overrides[plan.scenario.id];
    plan.assign = UP.applyOverrides(calendar, plan.baseAssign, ov);
    plan.stats = UP.analyze(calendar, plan.assign, settings);
    plan.modified = !!ov && Object.keys(ov).length > 0;
  }

  function exportPdf(all) {
    try {
      UP.exportPdf(state.result, all ? state.result.plans : [activePlan()]);
    } catch (e) {
      console.error(e);
      const n = document.createElement('p');
      n.className = 'notice warn';
      n.textContent = 'Das PDF konnte nicht erstellt werden. Bitte lade die Seite neu und versuche es noch einmal.';
      $('#plan .notices').appendChild(n);
    }
  }

  function selectScenario(id, focus) {
    state.active = id;
    renderComparison();
    renderPlan();
    if (focus) $(`#scenarios tr[data-scenario="${id}"]`).focus();
    save();
  }

  function selectView(id, focus) {
    state.view = id;
    renderPlan();
    if (focus) $(`#view-${id}`).focus();
    save();
  }

  function bindEvents() {
    const form = $('#settingsForm');
    form.addEventListener('input', (e) => {
      if (e.target.closest('#fxFrom, #fxTo, #fxLabel, #fxType')) return;
      readForm();
      renderGleitCalc();
      schedule();
    });
    form.addEventListener('change', (e) => {
      if (e.target.closest('#fxFrom, #fxTo, #fxLabel, #fxType')) {
        if (e.target.id === 'fxFrom' && !$('#fxTo').value) $('#fxTo').value = e.target.value;
        return;
      }
      readForm();
      schedule();
    });
    form.addEventListener('submit', (e) => e.preventDefault());
    $('#fxAdd').addEventListener('click', addFixed);
    $('#fxLabel').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFixed(); } });
    $('#fixedList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      state.settings = UP.normalizeSettings({
        ...state.settings,
        fixed: state.settings.fixed.filter((f) => f.id !== btn.dataset.remove),
      });
      recompute();
    });

    let resetArmed = false;
    $('#resetAll').addEventListener('click', () => {
      const hint = $('#resetConfirm');
      if (!resetArmed) {
        resetArmed = true;
        $('#resetAll').textContent = 'Wirklich zurücksetzen? Nochmal klicken';
        hint.textContent = 'Alle Eingaben und festen Zeiträume werden gelöscht.';
        hint.hidden = false;
        setTimeout(() => {
          resetArmed = false;
          $('#resetAll').textContent = 'Alle Eingaben zurücksetzen';
          hint.hidden = true;
        }, 4000);
        return;
      }
      resetArmed = false;
      $('#resetAll').textContent = 'Alle Eingaben zurücksetzen';
      hint.hidden = true;
      state.settings = UP.normalizeSettings({ ...UP.DEFAULTS, year: defaultYear() });
      state.overrides = {};
      fillForm();
      recompute();
    });

    const scenarios = $('#scenarios');
    scenarios.addEventListener('click', (e) => {
      const row = e.target.closest('[data-scenario]');
      if (row) selectScenario(row.dataset.scenario, true);
    });
    scenarios.addEventListener('keydown', (e) => {
      const ids = state.result.plans.map((p) => p.scenario.id);
      const idx = ids.indexOf(state.active);
      if (['ArrowDown', 'ArrowRight'].includes(e.key)) selectScenario(ids[(idx + 1) % ids.length], true);
      else if (['ArrowUp', 'ArrowLeft'].includes(e.key)) selectScenario(ids[(idx + ids.length - 1) % ids.length], true);
      else return;
      e.preventDefault();
    });

    const plan = $('#plan');
    plan.addEventListener('click', (e) => {
      const day = e.target.closest('button.day[data-i]');
      if (day) { toggleDay(+day.dataset.i); return; }
      const tab = e.target.closest('[data-view]');
      if (tab) { selectView(tab.dataset.view, true); return; }
      const act = e.target.closest('[data-action]');
      if (!act) return;
      if (act.dataset.action === 'pdf') exportPdf(false);
      if (act.dataset.action === 'pdf-all') exportPdf(true);
      if (act.dataset.action === 'reset-plan') {
        delete state.overrides[state.active];
        refreshPlan(activePlan());
        renderComparison();
        renderPlan();
        save();
      }
    });
    plan.addEventListener('keydown', (e) => {
      if (!e.target.closest('[role="tab"]') || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const ids = VIEWS.map((v) => v.id);
      const idx = ids.indexOf(state.view);
      selectView(ids[(idx + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length], true);
      e.preventDefault();
    });
  }

  buildStaticOptions();
  fillForm();
  bindEvents();
  recompute();
})();
