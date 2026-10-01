/*
 * Oberfläche: liest die Eingaben, ruft die Planungs-Engine auf und zeichnet
 * Kontingente, Szenarien, Kalender und Listen. Speichert Eingaben im
 * localStorage (nur auf diesem Gerät).
 */
(function () {
  'use strict';

  const UP = window.UP;
  const STORAGE_KEY = 'urlaubsplaner.v1';
  const TYPE_LABEL = { urlaub: 'Urlaub', eza: 'EZA', gleit: 'Gleitzeit', auto: 'Automatisch', sperre: 'Sperrzeit' };
  const TYPE_CODE = { urlaub: 'U', eza: 'E', gleit: 'G' };
  const CYCLE = [null, 'urlaub', 'eza', 'gleit'];
  const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];

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
        settings: state.settings, overrides: state.overrides, sig: state.sig, active: state.active,
      }));
    } catch { /* Speichern ist optional */ }
  }

  const saved = load();
  const state = {
    settings: UP.normalizeSettings({ ...UP.DEFAULTS, year: defaultYear(), ...(saved && saved.settings) }),
    overrides: (saved && saved.overrides) || {},
    sig: (saved && saved.sig) || null,
    active: (saved && saved.active) || 'ausgewogen',
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
        <span>${esc(r.name)} mitzählen<small>${esc(r.hint)}</small></span>
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
      + (rest > 0.001 ? ` · Rest ${fmt(rest, 2)} h` : '');
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
      const outside = UP.fromISO(f.to) < UP.ymd(year, 1, 1) || UP.fromISO(f.from) > UP.ymd(year, 12, 31);
      const meta = [TYPE_LABEL[f.type]];
      if (f.type !== 'sperre') meta.push(outside ? `nicht in ${year}` : plural(cost / 2, 'Arbeitstag', 'Arbeitstage'));
      return `
        <li class="fixed-item">
          <i class="stripe t-${f.type}" aria-hidden="true"></i>
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
    $('#brandYear').textContent = state.settings.year;
    document.title = `Urlaubsplaner ${state.settings.year}`;
    renderGleitCalc();
    renderFixedList();
    renderOverview();
    renderScenarios();
    renderPlan();
    renderOpportunities();
    renderHolidays();
  }

  function renderOverview() {
    const { settings: s, pools, budget } = state.result;
    const gleitDays = pools.gleit / 2;
    const fixedDays = budget.fixedCost / 2;
    const total = budget.total / 2;
    $('#overview').innerHTML = `
      <div class="tile">
        <span class="tile-label"><i class="sw sw-urlaub"></i>Urlaub</span>
        <span class="tile-value">${fmt(s.urlaubDays)} <small>Tage</small></span>
        <span class="tile-sub">Jahresanspruch</span>
      </div>
      <div class="tile">
        <span class="tile-label"><i class="sw sw-eza"></i>EZA</span>
        <span class="tile-value">${fmt(s.ezaDays)} <small>Tage</small></span>
        <span class="tile-sub">Extrazeitausgleich, separat verbucht</span>
      </div>
      <div class="tile">
        <span class="tile-label"><i class="sw sw-gleit"></i>Gleitzeit</span>
        <span class="tile-value">${fmt(gleitDays)} <small>Tage</small></span>
        <span class="tile-sub">aus ${fmt(s.overtimeHours)} h Überstunden</span>
      </div>
      <div class="tile">
        <span class="tile-label">Planbar gesamt</span>
        <span class="tile-value">${fmt(budget.free / 2)} <small>von ${fmt(total)} Tagen</small></span>
        <span class="tile-sub">${fixedDays ? `${fmt(fixedDays)} fest verplant` : 'nichts fest verplant'}${s.reserveDays ? ` · ${fmt(s.reserveDays)} Reserve` : ''}</span>
      </div>`;
  }

  function dominantType(used) {
    return ['urlaub', 'eza', 'gleit'].reduce((best, t) => (used[t] > used[best] ? t : best), 'urlaub');
  }

  function miniTimeline(plan) {
    const cal = state.result.calendar;
    const len = cal.lastIndex - cal.firstIndex + 1;
    return plan.stats.blocks.map((b) => {
      const s = Math.max(b.startIndex, cal.firstIndex) - cal.firstIndex;
      const e = Math.min(b.endIndex, cal.lastIndex) - cal.firstIndex + 1;
      return `<span class="t-${dominantType(b.used)}" style="left:${(s / len) * 100}%;width:${((e - s) / len) * 100}%"></span>`;
    }).join('');
  }

  function renderScenarios() {
    $('#scenarios').innerHTML = state.result.plans.map((p) => {
      const st = p.stats;
      const sel = p.scenario.id === state.active;
      return `
        <button type="button" class="scenario-tab" role="tab" id="tab-${p.scenario.id}" aria-selected="${sel}" aria-controls="plan" data-scenario="${p.scenario.id}">
          <span class="st-name">${esc(p.scenario.name)}</span>
          <span class="st-big">${st.totalFree}<small>Tage frei</small></span>
          <span class="st-sub">für ${plural(st.totalBooked, 'Tag', 'Tage')} · Faktor ${factor(st.efficiency)} · ${plural(st.blocks.length, 'Block', 'Blöcke')}</span>
          <span class="mini" aria-hidden="true">${miniTimeline(p)}</span>
          ${p.modified ? '<span class="st-badge">angepasst</span>' : ''}
        </button>`;
    }).join('');
  }

  function meter(type, plan) {
    const st = plan.stats;
    const avail = st.available[type];
    const used = st.used[type];
    const rest = st.remaining[type];
    const over = rest < 0;
    const pct = avail > 0 ? Math.min(100, (used / avail) * 100) : (used > 0 ? 100 : 0);
    let sub;
    if (type === 'gleit') {
      sub = `${fmt(st.gleitHoursUsed)} h genutzt · ${fmt(Math.max(0, st.gleitHoursLeft))} h verbleiben auf dem Konto`;
      if (over) sub = `${fmt(-rest)} Tag(e) mehr verplant als Überstunden vorhanden`;
    } else {
      sub = over ? `${fmt(-rest)} Tag(e) zu viel verplant` : `Rest ${plural(rest, 'Tag', 'Tage')}`;
    }
    return `
      <div class="meter">
        <div class="meter-head">
          <strong><i class="sw sw-${type}"></i>${UP.POOL_LABEL[type]}</strong>
          <span>${fmt(used)} / ${fmt(avail)} Tage</span>
        </div>
        <div class="bar t-${type}${over ? ' over' : ''}" role="img" aria-label="${UP.POOL_LABEL[type]}: ${fmt(used)} von ${fmt(avail)} Tagen verplant"><i style="width:${pct}%"></i></div>
        <span class="meter-sub${over ? ' over' : ''}">${sub}</span>
      </div>`;
  }

  function dayTitle(d, a) {
    const parts = [`${UP.WEEKDAYS_LONG[d.dow]}, ${UP.fmtDate(d.t)}`];
    if (d.holiday) parts.push(d.holiday);
    if (d.special === 'half') parts.push('halber Arbeitstag');
    if (d.special === 'free') parts.push('arbeitsfrei');
    if (a) parts.push(UP.POOL_LABEL[a.type] + (a.cost === 1 ? ' (halber Tag)' : ''));
    if (d.fixed) parts.push(`Fest: ${d.fixed.label || TYPE_LABEL[d.fixed.type]}`);
    if (d.blocked) parts.push('Sperrzeit');
    return parts.join(' · ');
  }

  function renderMonths(plan) {
    const cal = state.result.calendar;
    const { year } = state.settings;
    const inBlock = new Set();
    for (const b of plan.stats.blocks) for (let i = b.startIndex; i <= b.endIndex; i++) inBlock.add(i);
    const head = `<span></span>${WD_ORDER.map((d) => `<span class="wd${d === 0 ? ' sun' : ''}">${UP.WEEKDAYS_SHORT[d]}</span>`).join('')}`;
    let html = '';
    for (let m = 1; m <= 12; m++) {
      const first = UP.ymd(year, m, 1);
      const nDays = new Date(Date.UTC(year, m, 0)).getUTCDate();
      const lead = (UP.dow(first) + 6) % 7;
      let booked = 0;
      let cells = '';
      let col = 0;
      const pushKw = (t) => { cells += `<span class="kw" title="Kalenderwoche">${UP.isoWeek(t)}</span>`; };
      pushKw(first);
      for (let k = 0; k < lead; k++) { cells += '<span class="day out"></span>'; col++; }
      for (let dd = 1; dd <= nDays; dd++) {
        const t = UP.ymd(year, m, dd);
        if (col === 7) { pushKw(t); col = 0; }
        const i = UP.indexOf(cal, t);
        const d = cal.days[i];
        const a = plan.assign.get(i);
        if (a) booked += a.cost / 2;
        const cls = ['day'];
        if (!d.workday) cls.push('we');
        if (d.dow === 0) cls.push('sun');
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
        col++;
      }
      html += `
        <div class="month">
          <h3>${UP.MONTHS[m - 1]}${booked ? `<small>${plural(booked, 'Tag', 'Tage')}</small>` : ''}</h3>
          <div class="mgrid">${head}${cells}</div>
        </div>`;
    }
    return html;
  }

  function reasonOf(b) {
    const parts = [];
    if (b.labels.length) parts.push(`<span class="tag">Fest</span>${b.labels.map(esc).join(', ')}`);
    else if (b.fixed) parts.push('<span class="tag">Fest</span>');
    const names = [...new Set(b.holidays.map((h) => h.name))];
    if (names.length) parts.push(`<span class="hl">${names.map(esc).join(', ')}</span>`);
    if (b.manual) parts.push('<span class="tag">Manuell</span>');
    if (!parts.length) parts.push(b.booked <= 2 ? 'Verlängertes Wochenende' : 'Urlaub');
    return parts.join(' ');
  }

  function renderBlocks(plan) {
    const blocks = plan.stats.blocks;
    if (!blocks.length) return '<p class="empty">Keine Urlaubsblöcke geplant. Prüfe die Kontingente in der linken Spalte.</p>';
    const rows = blocks.map((b) => `
      <tr>
        <td class="date">${UP.fmtRange(b.start, b.end)}</td>
        <td class="num"><span class="free-big">${b.len}</span></td>
        <td><div class="chips">${['urlaub', 'eza', 'gleit'].filter((t) => b.used[t]).map((t) => `<span class="chip t-${t}">${TYPE_CODE[t]} ${fmt(b.used[t])}</span>`).join('')}</div></td>
        <td><div class="ranges">${b.ranges.map((r) => `<span class="t-${r.type}"><b>${UP.POOL_LABEL[r.type]}</b> ${UP.fmtRange(r.from, r.to)}</span>`).join('')}</div></td>
        <td class="num">${factor(b.ratio)}×</td>
        <td class="reason">${reasonOf(b)}</td>
      </tr>`).join('');
    return `
      <div class="table-wrap">
        <table class="blocks">
          <thead><tr>
            <th>Frei am Stück</th><th class="num">Tage</th><th>Einsatz</th><th>Zu beantragen</th><th class="num">Faktor</th><th>Anlass</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
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
    $('#plan').setAttribute('aria-labelledby', `tab-${plan.scenario.id}`);
    $('#plan').innerHTML = `
      <div class="plan-head">
        <div class="plan-title">
          <h2>${esc(plan.scenario.name)}</h2>
          <p>${esc(plan.scenario.description)}</p>
        </div>
        <div class="plan-actions">
          ${plan.modified ? '<button type="button" class="btn btn-secondary" data-action="reset-plan">Änderungen verwerfen</button>' : ''}
          <button type="button" class="btn btn-primary" data-action="pdf">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 2v8m0 0 3-3m-3 3L5 7M3 12v2h10v-2"/></svg>
            PDF exportieren
          </button>
          <button type="button" class="btn btn-secondary" data-action="pdf-all">Alle Szenarien als PDF</button>
        </div>
      </div>
      <div class="notices">${notes.join('')}</div>
      <div class="meters">
        ${meter('urlaub', plan)}
        ${meter('eza', plan)}
        ${meter('gleit', plan)}
        <div class="meter">
          <div class="meter-head"><strong>Ergebnis</strong><span>Faktor ${factor(st.efficiency)}</span></div>
          <span class="tile-value">${st.totalFree} <small>Tage frei am Stück</small></span>
          <span class="meter-sub">längster Block ${plural(st.longest, 'Tag', 'Tage')} · ${plural(st.blocks.length, 'Block', 'Blöcke')}</span>
        </div>
      </div>
      <div class="legend" aria-label="Legende">
        <span><i class="day t-urlaub">8</i>Urlaub</span>
        <span><i class="day t-eza">8</i>EZA</span>
        <span><i class="day t-gleit">8</i>Gleitzeit</span>
        <span><i class="day hol">8</i>Feiertag</span>
        <span><i class="day we">8</i>Wochenende</span>
        <span><i class="day inblock">8</i>frei im Block</span>
        <span><i class="day fixed">8</i>fester Termin</span>
        <span><i class="day blocked">8</i>Sperrzeit</span>
      </div>
      <div class="months">${renderMonths(plan)}</div>
      <p class="hint">Tipp: Klick auf einen Arbeitstag wechselt zwischen Urlaub, EZA, Gleitzeit und Arbeitstag. So kannst du den Vorschlag anpassen, die Zahlen rechnen sofort mit.</p>
      <div class="section-head">
        <h3>Urlaubsblöcke</h3>
        <span>Faktor = freie Tage je eingesetztem Tag</span>
      </div>
      ${renderBlocks(plan)}`;
  }

  function renderOpportunities() {
    const { opportunities, settings } = state.result;
    const items = opportunities.map((o) => {
      const names = [...new Set(o.holidays.map((h) => h.name))].join(' & ');
      const dates = o.holidays.map((h) => UP.fmtShort(h.t)).join(', ');
      const opts = o.options.map((x) => `
        <span class="opt">
          <span><b>${plural(x.days, 'Tag', 'Tage')}</b> einsetzen → <b>${x.free} frei</b> <span class="factor">${factor(x.ratio)}×</span></span>
          <small>${UP.fmtRange(x.from, x.to)}</small>
        </span>`).join('');
      return `
        <li class="opp">
          <div class="opp-head"><strong>${esc(names)}</strong><span>${dates}</span></div>
          <div class="opp-opts">${opts}</div>
        </li>`;
    }).join('');
    $('#opportunities').innerHTML = `
      <h3>Beste Brückentage ${settings.year}</h3>
      <p>Lohnende Kombinationen rund um Feiertage in ${esc(stateName(settings.state))}, unabhängig vom Szenario.</p>
      ${items ? `<ul class="opps">${items}</ul>` : '<p class="empty">Keine lohnenden Brückentage gefunden.</p>'}`;
  }

  function renderHolidays() {
    const { holidays, settings } = state.result;
    const workdays = settings.workdays;
    const rows = holidays.map((h) => {
      const onFree = !workdays.includes(h.weekday);
      return `
        <tr class="${onFree ? 'weekend' : ''}">
          <td class="date">${UP.fmtDate(h.date).slice(0, 6)}</td>
          <td class="wdname">${UP.WEEKDAYS_SHORT[h.weekday]}</td>
          <td>${esc(h.name)}${h.regional ? ' <span class="note">(regional)</span>' : ''}${onFree ? '<span class="note block">fällt auf einen freien Tag</span>' : ''}</td>
        </tr>`;
    }).join('');
    const effective = holidays.filter((h) => workdays.includes(h.weekday)).length;
    $('#holidays').innerHTML = `
      <h3>Feiertage ${settings.year}</h3>
      <p>${esc(stateName(settings.state))}: ${holidays.length} Feiertage, davon ${effective} an Arbeitstagen.</p>
      <div class="table-wrap"><table class="hol-table"><tbody>${rows}</tbody></table></div>`;
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
    renderScenarios();
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

    $('#scenarios').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-scenario]');
      if (!tab) return;
      state.active = tab.dataset.scenario;
      renderScenarios();
      renderPlan();
      save();
    });
    $('#scenarios').addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const ids = state.result.plans.map((p) => p.scenario.id);
      const idx = ids.indexOf(state.active);
      state.active = ids[(idx + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
      renderScenarios();
      renderPlan();
      $(`#tab-${state.active}`).focus();
      save();
    });

    $('#plan').addEventListener('click', (e) => {
      const day = e.target.closest('button.day[data-i]');
      if (day) { toggleDay(+day.dataset.i); return; }
      const act = e.target.closest('[data-action]');
      if (!act) return;
      if (act.dataset.action === 'pdf') exportPdf(false);
      if (act.dataset.action === 'pdf-all') exportPdf(true);
      if (act.dataset.action === 'reset-plan') {
        delete state.overrides[state.active];
        refreshPlan(activePlan());
        renderScenarios();
        renderPlan();
        save();
      }
    });
  }

  buildStaticOptions();
  fillForm();
  bindEvents();
  recompute();
})();
