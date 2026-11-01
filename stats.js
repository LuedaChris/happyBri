// Statistik (Goal 6): Schlaf, Wachfenster, Füttern und Wachstum mit WHO-Kurven. Alles wird aus `entries` berechnet.
// Referenzwerte (WHO-Perzentile) stehen in growth.js. Das Geburtsdatum liegt nicht im Code (öffentliches Repository),
// sondern wird einmal eingegeben und in Firestore (settings/profile) und lokal gespeichert.

let statsMode = 'day'; // 'day' = letzte 7 Tage, 'week' = letzte 8 Wochen (Tagesdurchschnitt je Woche)

const getProfile = () => { try { return JSON.parse(localStorage.getItem('profile')) || {}; } catch { return {}; } };
const num1 = (n, digits = 2) => n.toLocaleString('de-DE', { maximumFractionDigits: digits });
const avg = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

// ---------- Zeiträume ----------
function statsPeriods() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const out = [];
  if (statsMode === 'day') {
    for (let i = 6; i >= 0; i--) {
      const a = new Date(y, m, d - i), b = new Date(y, m, d - i + 1);
      out.push({ label: i === 0 ? 'Heute' : a.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''), t0: a.getTime(), t1: b.getTime() });
    }
  } else {
    const dow = (now.getDay() + 6) % 7; // Montag = 0
    for (let k = 7; k >= 0; k--) {
      const a = new Date(y, m, d - dow - 7 * k), b = new Date(y, m, d - dow - 7 * k + 7);
      out.push({ label: k === 0 ? 'Diese' : `${a.getDate()}.${a.getMonth() + 1}.`, t0: a.getTime(), t1: b.getTime() });
    }
  }
  // Teiler: im Wochenmodus Tagesdurchschnitt (laufende Woche nur durch die bisher vergangenen Tage)
  out.forEach(p => { p.div = statsMode === 'day' ? 1 : Math.max(1, (Math.min(p.t1, Date.now()) - p.t0) / 864e5); });
  return out;
}

// Alle Kennzahlen je Zeitraum in einem Durchlauf über die Einträge
function aggregate(periods) {
  const rows = periods.map(() => ({ nap: 0, night: 0, bottle: 0, solid: 0, wake: [], naps: [] }));
  const at = ms => periods.findIndex(p => ms >= p.t0 && ms < p.t1);
  const now = Date.now(), done = [];
  for (const e of entries) {
    const s = ts(e.start);
    if (e.type === 'feeding') {
      const i = at(s);
      if (i < 0 || !e.amount) continue;
      if (e.title === 'Flasche' && e.unit === 'ml') rows[i].bottle += e.amount;
      else if (e.title === 'Beikost' && e.unit === 'g') rows[i].solid += e.amount;
    } else if (e.type === 'sleep') {
      const en = e.end ? ts(e.end) : now, gross = en - s;
      if (gross <= 0) continue;
      const net = e.durationMin ?? gross / 60000;
      const night = e.title === 'Nachtschlaf';
      periods.forEach((p, i) => { // Netto-Dauer anteilig auf die Zeiträume verteilen, die der Schlaf berührt
        const overlap = Math.min(en, p.t1) - Math.max(s, p.t0);
        if (overlap > 0) rows[i][night ? 'night' : 'nap'] += net * overlap / gross;
      });
      if (e.end) {
        done.push({ s, en });
        if (!night && at(s) >= 0) rows[at(s)].naps.push(net);
      }
    }
  }
  // Wachfenster = Zeit zwischen dem Ende eines Schlafs und dem Beginn des nächsten (Lücken über 12 Std zählen nicht)
  done.sort((a, b) => a.s - b.s);
  let lastEnd = null;
  for (const sl of done) {
    if (lastEnd != null) {
      const gap = (sl.s - lastEnd) / 60000, i = at(sl.s);
      if (i >= 0 && gap > 5 && gap < 720) rows[i].wake.push(gap);
    }
    lastEnd = Math.max(lastEnd ?? 0, sl.en);
  }
  rows.forEach((r, i) => { r.per = periods[i].div; });
  return rows;
}

// ---------- Diagramme (SVG) ----------
const fmtAxisTime = min => (min % 60 === 0 ? `${min / 60}h` : `${Math.floor(min / 60)}h${pad(min % 60)}`);
const TIME_STEPS = [30, 60, 120, 180, 240, 360, 480, 720];
const COUNT_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

function niceScale(maxVal, steps) {
  const step = steps.find(s => maxVal / s <= 5) ?? steps[steps.length - 1];
  return { step, max: Math.max(step, Math.ceil(maxVal / step) * step) };
}

function barChart({ labels, series, stacked = false, fmtAxis, fmtLabel, steps, band = null }) {
  const W = 340, H = 200, L = 40, R = 6, T = 16, B = 22, pw = W - L - R, ph = H - T - B, n = labels.length;
  const totals = labels.map((_, i) => (stacked ? series.reduce((s, x) => s + x.values[i], 0) : Math.max(...series.map(x => x.values[i]))));
  const { max, step } = niceScale(Math.max(...totals, band ? band[1] : 0, 0), steps);
  const y = v => T + ph - (v / max) * ph;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`;
  for (let v = 0; v <= max + 1e-9; v += step) {
    svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 5}" y="${y(v) + 3}" text-anchor="end">${fmtAxis(v)}</text>`;
  }
  if (band) svg += `<rect class="band" x="${L}" y="${y(band[1])}" width="${pw}" height="${y(band[0]) - y(band[1])}"/>`; // Richtwert-Bereich
  const gw = pw / n;
  labels.forEach((lab, i) => {
    const cx = L + gw * i + gw / 2;
    if (stacked) {
      const bw = Math.min(30, gw * 0.6);
      let acc = 0;
      for (const s of series) {
        const v = s.values[i];
        if (v <= 0) continue;
        svg += `<rect class="${s.cls}" x="${cx - bw / 2}" y="${y(acc + v)}" width="${bw}" height="${Math.max(0, y(acc) - y(acc + v))}" rx="2"/>`;
        acc += v;
      }
    } else {
      const bw = Math.min(26, (gw * 0.8) / series.length);
      series.forEach((s, k) => {
        const v = s.values[i];
        if (v > 0) svg += `<rect class="${s.cls}" x="${cx - (bw * series.length) / 2 + bw * k}" y="${y(v)}" width="${bw - 1}" height="${y(0) - y(v)}" rx="2"/>`;
      });
    }
    svg += `<text class="ax" x="${cx}" y="${H - 6}" text-anchor="middle">${lab}</text>`;
    if (!stacked && series.length === 1 && totals[i] > 0) svg += `<text class="val" x="${cx}" y="${y(totals[i]) - 3}" text-anchor="middle">${fmtLabel(totals[i])}</text>`;
  });
  return svg + '</svg>';
}

// Schlafplan: je Tag eine Säule von 00:00 (unten) bis 24:00 (oben); hell = Schlaf, dunkel = wach
function sleepPlanChart(periods) {
  const W = 340, H = 230, L = 30, R = 6, T = 12, B = 22, pw = W - L - R, ph = H - T - B, n = periods.length, now = Date.now();
  const y = frac => T + ph - frac * ph;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`;
  for (let h = 0; h <= 24; h += 4) svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(h / 24)}" y2="${y(h / 24)}"/><text class="ax" x="${L - 5}" y="${y(h / 24) + 3}" text-anchor="end">${pad(h % 24)}</text>`;
  const gw = pw / n, bw = Math.min(26, gw * 0.6);
  periods.forEach((p, i) => {
    const cx = L + gw * i + gw / 2, len = p.t1 - p.t0, upTo = Math.min(1, (now - p.t0) / len);
    svg += `<rect class="wake" x="${cx - bw / 2}" y="${y(upTo)}" width="${bw}" height="${upTo * ph}" rx="3"/>`;
    for (const e of entries) {
      if (e.type !== 'sleep') continue;
      const s = Math.max(ts(e.start), p.t0), en = Math.min(e.end ? ts(e.end) : now, p.t1, now);
      if (en <= s) continue;
      svg += `<rect class="nap" x="${cx - bw / 2}" y="${y((en - p.t0) / len)}" width="${bw}" height="${((en - s) / len) * ph}"/>`;
    }
    svg += `<text class="ax" x="${cx}" y="${H - 6}" text-anchor="middle">${p.label}</text>`;
  });
  return svg + '</svg>';
}

// Wachstumskurve: WHO-Perzentile 3/15/50/85/97 als Linien, eigene Messungen als Punkte
function growthChart(kind, list, birthMs, yStep) {
  const toMonths = s => (ts(s) - birthMs) / (30.4375 * 864e5);
  const pts = list.map(e => ({ m: toMonths(e.start), v: e.amount })).filter(p => p.m >= 0 && p.m <= 24 && p.v > 0).sort((a, b) => a.m - b.m);
  const age = Math.max(toMonths(nowLocal()), ...pts.map(p => p.m), 0);
  const xMax = Math.min(24, Math.max(6, Math.ceil(age) + 3));
  const lo = Math.floor(whoValue(kind, 0, WHO_PERCENTILES[0][1]) / yStep) * yStep;
  const hi = Math.ceil(whoValue(kind, xMax, WHO_PERCENTILES[4][1]) / yStep) * yStep;
  const W = 340, H = 240, L = 34, R = 22, T = 12, B = 34, pw = W - L - R, ph = H - T - B;
  const x = m => L + (m / xMax) * pw, y = v => T + ph - ((v - lo) / (hi - lo)) * ph;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`;
  for (let v = lo; v <= hi + 1e-9; v += yStep) svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 5}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  for (let m = 0; m <= xMax; m += xMax > 14 ? 2 : 1) svg += `<text class="ax" x="${x(m)}" y="${H - 18}" text-anchor="middle">${m}</text>`;
  svg += `<text class="ax" x="${L + pw / 2}" y="${H - 4}" text-anchor="middle">Alter (Monate)</text>`;
  for (const [pc, z] of WHO_PERCENTILES) {
    let d = '';
    for (let m = 0; m <= xMax + 1e-9; m += 0.5) d += `${d ? 'L' : 'M'}${x(m).toFixed(1)},${y(whoValue(kind, m, z)).toFixed(1)}`;
    svg += `<path class="pc${pc === 50 ? ' pc50' : ''}" d="${d}"/><text class="pcl" x="${x(xMax) + 2}" y="${y(whoValue(kind, xMax, z)) + 3}">${pc}</text>`;
  }
  if (pts.length > 1) svg += `<path class="mine" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)},${y(p.v).toFixed(1)}`).join('')}"/>`;
  for (const p of pts) svg += `<circle class="pt" cx="${x(p.m).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5"/>`;
  return svg + '</svg>';
}

// ---------- Seite ----------
const card = (title, body, foot = '') => `<section class="card"><h3>${title}</h3>${body}${foot ? `<p class="foot">${foot}</p>` : ''}</section>`;
const legend = items => `<div class="legend">${items.map(([cls, text]) => `<span><i class="sw ${cls}"></i>${text}</span>`).join('')}</div>`;

// Richtwert für den Gesamtschlaf je 24 Std inklusive Nickerchen, in Minuten.
// Quellen: AASM-Konsens 2016 (Paruthi et al., J Clin Sleep Med 12(11):1549, von der American Academy of Pediatrics mitgetragen)
// für 4 Monate bis 5 Jahre; für die ersten 3 Monate die Apotheken Umschau (14–17 Std „durchschnittlich“).
// Das sind Spannen für gesunde Kinder, kein Sollwert: der Bedarf ist individuell verschieden.
function sleepRef(m) {
  if (m < 4) return { band: [14 * 60, 17 * 60], src: 'Apotheken Umschau' };
  if (m < 12) return { band: [12 * 60, 16 * 60], src: 'AASM 2016' };
  if (m < 36) return { band: [11 * 60, 14 * 60], src: 'AASM 2016' };
  return { band: [10 * 60, 13 * 60], src: 'AASM 2016' };
}
const babyAgeMonths = () => {
  const b = getProfile().birth;
  return b ? (Date.now() - new Date(b + 'T00:00').getTime()) / (30.4375 * 864e5) : null;
};

// Durchschnitt über die abgeschlossenen Zeiträume (der laufende Tag bzw. die laufende Woche ist unvollständig)
const periodAvg = (rows, pick) => avg(rows.slice(0, -1).map(pick).filter(v => v > 0));
const avgNote = () => (statsMode === 'day' ? ' (ohne heute)' : ' (ohne laufende Woche)');

function growthCard(kind, type, title, unit, yStep, profile) {
  if (!profile.birth) return '';
  const birthMs = new Date(profile.birth + 'T00:00').getTime();
  const list = entries.filter(e => e.type === type && e.amount > 0);
  const latest = list.find(e => e.start <= nowLocal());
  let foot = 'Noch keine Messung.';
  if (latest) {
    const m = (ts(latest.start) - birthMs) / (30.4375 * 864e5);
    if (m >= 0 && m <= 24) {
      foot = `Letzter Eintrag: <b>${num1(latest.amount)} ${unit}</b> mit ${num1(m, 1)} Monaten · Perzentil <b>${Math.round(whoPercentile(kind, m, latest.amount))}</b> · Median in diesem Alter: ${num1(whoValue(kind, m, 0))} ${unit}`;
    }
  }
  const lines = legend([['l50', '50. Perzentil'], ['lpc', '3. / 15. / 85. / 97.'], ['pt', 'Bri']]);
  return card(title, growthChart(kind, list, birthMs, yStep) + lines, foot);
}

function renderStats() {
  const periods = statsPeriods(), rows = aggregate(periods), labels = periods.map(p => p.label);
  const profile = getProfile();
  const per = statsMode === 'day' ? 'pro Tag' : 'pro Tag, Wochendurchschnitt';
  const perMin = (r, k) => r[k] / r.per; // Minuten bzw. ml/g je Tag
  const sleepTot = rows.map(r => (r.nap + r.night) / r.per);
  let html = `<div class="seg"><button data-mode="day" class="${statsMode === 'day' ? 'on' : ''}">Täglich</button><button data-mode="week" class="${statsMode === 'week' ? 'on' : ''}">Wöchentlich</button></div>`;

  if (statsMode === 'day') html += card('Schlafplan', sleepPlanChart(periods) + legend([['nap', 'Schlaf'], ['wake', 'Wach']]));

  const ageM = babyAgeMonths(), ref = ageM != null ? sleepRef(ageM) : null;
  const sleepAvg = Math.round(periodAvg(rows, r => (r.nap + r.night) / r.per));
  let refText = '';
  if (ref) {
    const [lo, hi] = ref.band, verdict = !sleepAvg ? '' : sleepAvg < lo ? ' – darunter' : sleepAvg > hi ? ' – darüber' : ' – im Bereich';
    refText = `<br>Richtwert mit ${Math.floor(ageM)} Monaten: ${lo / 60}–${hi / 60} Std pro Tag inkl. Nickerchen (${ref.src})${verdict}. Der Bedarf ist individuell verschieden.`;
  }
  html += card(`Gesamtschlaf (${per})`, barChart({
    labels, stacked: true, steps: TIME_STEPS, fmtAxis: fmtAxisTime, fmtLabel: fmtDur, band: ref ? ref.band : null,
    series: [{ cls: 'night', values: rows.map(r => r.night / r.per) }, { cls: 'nap', values: rows.map(r => r.nap / r.per) }],
  }) + legend([['nap', 'Nickerchen'], ['night', 'Nachtschlaf'], ...(ref ? [['band', 'Richtwert']] : [])]),
  `Ø ${fmtDur(sleepAvg)} · davon Nickerchen Ø ${fmtDur(Math.round(periodAvg(rows, r => r.nap / r.per)))}${avgNote()}${refText}`);

  html += card('Wachfenster und Nickerchen', barChart({
    labels, steps: TIME_STEPS, fmtAxis: fmtAxisTime, fmtLabel: fmtDur,
    series: [{ cls: 'wakebar', values: rows.map(r => avg(r.wake)) }, { cls: 'nap', values: rows.map(r => avg(r.naps)) }],
  }) + legend([['wakebar', 'Ø Wachfenster'], ['nap', 'Ø Nickerchen']]),
  `Ø Wachfenster ${fmtDur(Math.round(periodAvg(rows, r => avg(r.wake))))} · Ø Nickerchen ${fmtDur(Math.round(periodAvg(rows, r => avg(r.naps))))}${avgNote()}
   <br>Dafür gibt es keine medizinischen Richtwerte. Als Orientierung (Apotheken Umschau): ab etwa 4 Monaten meist zwei Nickerchen am Tag, später nur noch eines am Nachmittag.`);

  html += card('Schlafvorhersage prüfen', `<p>Backtest: Für jeden Schlaf der 28 Tage bis zu einem Stichtag sagt die App die Startzeit nur mit den Daten davor vorher und vergleicht sie mit der echten.</p>
    <button class="big small" data-backtest>Backtest öffnen</button>`);

  const feedChart = (key, title, unit, cls) => card(`${title} (${unit}, ${per})`, barChart({
    labels, steps: COUNT_STEPS, fmtAxis: v => v, fmtLabel: v => Math.round(v),
    series: [{ cls, values: rows.map(r => perMin(r, key)) }],
  }), `Ø ${Math.round(periodAvg(rows, r => perMin(r, key)))} ${unit}${avgNote()}`);
  html += feedChart('bottle', 'Flasche', 'ml', 'bottle');
  html += feedChart('solid', 'Beikost', 'g', 'solid');

  if (profile.birth) {
    html += growthCard('weight', 'weight', 'Gewicht (kg)', 'kg', 1, profile);
    html += growthCard('length', 'height', 'Größe (cm)', 'cm', 5, profile);
    html += `<p class="who">Referenz: WHO Child Growth Standards (Mädchen), Perzentile 3/15/50/85/97 – wie in den deutschen Vorsorgeheften. Zur Orientierung, keine ärztliche Beurteilung.</p>
      <p class="who"><button class="link inline" data-editbirth>Geburtsdatum ändern</button></p>`;
  } else {
    html += card('Gewicht und Größe', `<p>Für die Wachstumskurven braucht die App das Geburtsdatum. Es wird nur in eurer Datenbank gespeichert.</p>
      <label>Geburtsdatum <input type="date" id="birthInput"></label><button class="big small ok" data-savebirth>Speichern</button>`);
  }
  $('#statsBody').innerHTML = html;
}

// ---------- Bedienung ----------
$('#statsBody').onclick = ev => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.mode) { statsMode = t.dataset.mode; renderStats(); }
  if (t.dataset.savebirth !== undefined) {
    const birth = $('#birthInput').value;
    if (!birth) return;
    saveProfile({ ...getProfile(), birth });
  }
  if (t.dataset.editbirth !== undefined) saveProfile({ ...getProfile(), birth: '' });
  if (t.dataset.backtest !== undefined) openBacktest();
};

// Backtest der Schlafvorhersage (predict.js) im Dialog; Stichtag wählbar, Standard: jetzt
function openBacktest() {
  showInfo('Backtest Schlafvorhersage', `<label>Stichtag <input type="datetime-local" id="btAt" value="${nowLocal()}"></label>
    <button class="big small ok" id="btRun">Rechnen</button><div id="btOut"></div>`);
  const run = () => {
    const at = $('#btAt').value;
    if (!at) return;
    const r = sleepBacktest(ts(at));
    if (!r.n) { $('#btOut').innerHTML = '<p>Keine Vorhersage möglich: zu wenig Schlafdaten vor diesem Stichtag.</p>'; return; }
    const rank = s => (s === 'night' ? 99 : Number(s.slice(3)));
    const rows = Object.keys(r.bySlot).sort((a, b) => rank(a) - rank(b))
      .map(s => `<tr><td>${slotName(s)}</td><td>${r.bySlot[s].length} · ${Math.round(spMedian(r.bySlot[s]))} Min</td></tr>`).join('');
    $('#btOut').innerHTML = `<p><b>${r.n}</b> Vorhersagen · Median-Fehler <b>${Math.round(r.medianErr)} Min</b> · <b>${Math.round(r.within30 * 100)} %</b> innerhalb ±30 Min</p>
      <table>${rows}</table><p class="who">Je Slot: Anzahl · Median-Fehler. Zeitraum: 28 Tage bis einschließlich Stichtag.</p>`;
  };
  $('#btRun').onclick = run;
  run();
}
function saveProfile(p) {
  try { localStorage.setItem('profile', JSON.stringify(p)); } catch { /* egal */ }
  if (window.Sync && Sync.saveProfile) Sync.saveProfile(p);
  renderStats();
}
window.onProfile = () => { if (!$('#viewStats').hidden) renderStats(); }; // sync.js ruft das, wenn das Profil aus der Cloud kam

document.querySelectorAll('#tabs button').forEach(b => (b.onclick = () => {
  const stats = b.dataset.view === 'stats';
  $('#viewHome').hidden = stats;
  $('#viewStats').hidden = !stats;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  window.scrollTo(0, 0);
  if (stats) renderStats();
}));
