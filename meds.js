// Medikamente & Fieber (Goal 8). Gaben sind Einträge vom Typ 'medication' (Titel = Medikament, amount/unit = Dosis,
// substance = Wirkstoff), Temperaturen Einträge vom Typ 'temperature' (amount in °C).
// Die Medikamentenliste mit Mindestabstand und Höchstzahl tragen die Eltern selbst ein (Beipackzettel/Kinderarzt);
// die App gibt keine Dosis und keine Abstände vor. Die Liste liegt in Firestore (settings/meds) und lokal.

const getMeds = () => { try { return JSON.parse(localStorage.getItem('meds')); } catch { return null; } }; // null = noch nie angelegt
function saveMeds(items) {
  try { localStorage.setItem('meds', JSON.stringify(items)); } catch { /* egal */ }
  if (window.Sync && Sync.saveMeds) Sync.saveMeds(items);
}

// Einmalige Vorbelegung aus den eigenen alten Einträgen: allgemeine Markennamen -> Wirkstoff.
// Nur Name und Wirkstoff; Dosis, Abstand und Höchstzahl bleiben leer.
const MED_BRANDS = [
  [/nurofen/i, 'Nurofen Junior', 'Ibuprofen'],
  [/ben-?u-?ron/i, 'ben-u-ron', 'Paracetamol'],
  [/dentinox/i, 'Dentinox', 'Lidocain'],
  [/ibuprofen/i, 'Ibuprofen', 'Ibuprofen'],
  [/paracetamol/i, 'Paracetamol', 'Paracetamol'],
];
window.seedMeds = async () => {
  await window.entriesReady; // erst wenn die alten Einträge geladen sind
  if (getMeds()) return;
  const titles = entries.filter(e => e.type === 'custom').map(e => e.title || '');
  const items = MED_BRANDS.filter(([re]) => titles.some(t => re.test(t)))
    .map(([, name, substance]) => ({ name, substance, dose: null, unit: '', minHours: null, maxPerDay: null }));
  saveMeds(items);
};
window.onMeds = () => render(); // Liste kam vom anderen Handy

const fmtNum = n => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const clockOf = ms => fmtTime(toLocal(new Date(ms)));
const subKey = s => (s || '').trim().toLowerCase();

// Regeln je Wirkstoff: strengster Wert über alle Präparate mit diesem Wirkstoff
function substanceRules(substance) {
  const same = (getMeds() || []).filter(m => subKey(m.substance) === subKey(substance));
  const hours = same.map(m => m.minHours).filter(v => v > 0), max = same.map(m => m.maxPerDay).filter(v => v > 0);
  return { minHours: hours.length ? Math.max(...hours) : null, maxPerDay: max.length ? Math.min(...max) : null };
}

// Stand eines Wirkstoffs zum Zeitpunkt t: letzte Gabe, Gaben in den 24 Std davor, frühester nächster Zeitpunkt
function substanceState(substance, t = Date.now()) {
  const doses = entries.filter(e => e.type === 'medication' && subKey(e.substance || e.title) === subKey(substance) && ts(e.start) <= t);
  const last = doses[0] || null; // entries ist nach Start absteigend sortiert
  const rules = substanceRules(substance);
  const count24 = doses.filter(e => ts(e.start) > t - 864e5).length;
  let next = null;
  if (last && rules.minHours) next = ts(last.start) + rules.minHours * 3600e3;
  // Höchstzahl erreicht: frühestens, wenn die älteste der Gaben in den letzten 24 Std herausfällt
  if (rules.maxPerDay && count24 >= rules.maxPerDay) {
    const window24 = doses.filter(e => ts(e.start) > t - 864e5);
    next = Math.max(next || 0, ts(window24[window24.length - 1].start) + 864e5);
  }
  return { last, count24, next, rules };
}

// Warntext, falls eine Gabe zum Zeitpunkt t zu früh wäre, sonst ''
function doseWarning(med, t) {
  const st = substanceState(med.substance || med.name, t), lines = [];
  const sub = med.substance || med.name;
  if (st.last && st.rules.minHours && t < ts(st.last.start) + st.rules.minHours * 3600e3) {
    lines.push(`Letzte Gabe ${sub}: ${fmtTime(st.last.start)}${st.last.createdBy ? ` (${st.last.createdBy})` : ''}. Mindestabstand ${fmtNum(st.rules.minHours)} Std, frühestens ${clockOf(ts(st.last.start) + st.rules.minHours * 3600e3)}.`);
  }
  if (st.rules.maxPerDay && st.count24 >= st.rules.maxPerDay) {
    lines.push(`Schon ${st.count24} Gaben ${sub} in 24 Std (eingetragenes Maximum: ${st.rules.maxPerDay}).`);
  }
  return lines.join('\n');
}

// Kurztext für einen Wirkstoff: "Ibuprofen ab 09:10" / "Ibuprofen möglich" / "Ibuprofen zuletzt 03:10"
function substanceShort(substance, now = Date.now()) {
  const st = substanceState(substance, now);
  if (st.next && st.next > now) return `${substance} ab ${clockOf(st.next)}`;
  if (st.rules.minHours || st.rules.maxPerDay) return `${substance} möglich`;
  return st.last ? `${substance} zuletzt ${fmtTime(st.last.start)}` : substance;
}

// ---------- Startbildschirm ----------
function medsRow() {
  const since = toLocal(new Date(Date.now() - 864e5)), now = nowLocal();
  const recent = entries.filter(e => (e.type === 'medication' || e.type === 'temperature') && e.start >= since && e.start <= now);
  if (!recent.length) return '';
  const subs = [];
  for (const e of recent) {
    if (e.type !== 'medication') continue;
    const s = e.substance || e.title;
    if (!subs.some(x => subKey(x) === subKey(s))) subs.push(s);
  }
  const temp = recent.find(e => e.type === 'temperature');
  const value = subs.length ? subs.map(s => substanceShort(s)).join(' · ') : 'keine Gabe';
  const detail = temp ? `${fmtNum(temp.amount)} °C · ${fmtTime(temp.start)}` : '';
  return `<div class="srow tap" data-meds><span class="ic">💊</span><span class="sbody"><small>Medikamente & Fieber (24 Std)</small><b>${esc(value)}</b></span><span class="det">${esc(detail)}</span></div>`;
}
$('#status').addEventListener('click', ev => { if (ev.target.closest('[data-meds]')) medSheet(); });

// ---------- Eingabe ----------
function medSheet() {
  const meds = getMeds() || [];
  openQuick('Medikament', body => {
    const now = Date.now();
    body.innerHTML = (meds.length ? meds.map((m, i) => {
      const st = substanceState(m.substance || m.name, now);
      const status = st.next && st.next > now ? `wieder ab ${clockOf(st.next)}` : st.last ? `zuletzt ${fmtTime(st.last.start)}${st.last.createdBy ? ` (${st.last.createdBy})` : ''}` : '';
      const dose = m.dose ? `${fmtNum(m.dose)} ${m.unit || ''}` : 'Dosis nicht eingetragen';
      return `<button class="big med" data-i="${i}">💊 ${esc(m.name)}<span>${esc(dose)}${m.substance ? ` · ${esc(m.substance)}` : ''}</span><small>${esc(status)}</small></button>`;
    }).join('') : '<p class="who">Noch keine Medikamente angelegt.</p>')
      + '<button class="link" id="medManage">Medikamente verwalten</button>';
    body.querySelectorAll('[data-i]').forEach(b => (b.onclick = () => {
      const m = meds[b.dataset.i], start = quickStart();
      const warn = doseWarning(m, ts(start));
      if (warn && !confirm(`${warn}\n\nTrotzdem eintragen?`)) return;
      quickSave(newEntry('medication', m.name, start, { amount: m.dose || null, unit: m.unit || null, substance: m.substance || null }),
        `${m.name} gespeichert`);
    }));
    $('#medManage').onclick = () => { $('#quick').close(); manageMeds(); };
  });
}

function tempSheet() {
  openQuick('Temperatur', body => {
    body.innerHTML = `<div class="custom"><input id="qTemp" inputmode="decimal" placeholder="z. B. 38,2"><button class="big small ok" id="qTempOk">OK</button></div>
      <p class="danger" id="qTempMsg"></p>`;
    $('#qTempOk').onclick = () => {
      const v = parseFloat($('#qTemp').value.replace(',', '.'));
      if (!(v >= 34 && v <= 43)) { $('#qTempMsg').textContent = 'Bitte eine Temperatur zwischen 34 und 43 °C eingeben.'; return; }
      quickSave(newEntry('temperature', 'Temperatur', quickStart(), { amount: v, unit: '°C' }), `${fmtNum(v)} °C gespeichert`);
    };
  });
}

// Liste verwalten (Dialog): vorhandene Medikamente antippen zum Bearbeiten, darunter das Formular
function manageMeds(editIndex = null) {
  const meds = getMeds() || [], m = editIndex != null ? meds[editIndex] : {};
  const list = meds.map((x, i) => `<tr><td><button class="link inline" data-edit="${i}">${esc(x.name)}</button></td>
    <td>${esc(x.substance || '–')} · ${x.minHours ? `${fmtNum(x.minHours)} Std` : 'Abstand –'} · ${x.maxPerDay ? `max. ${x.maxPerDay}` : 'max. –'}</td></tr>`).join('');
  const val = v => (v == null ? '' : esc(String(v).replace('.', ',')));
  showInfo('Medikamente verwalten', `${list ? `<table>${list}</table>` : ''}
    <h3>${editIndex != null ? 'Bearbeiten' : 'Neues Medikament'}</h3>
    <label>Name <input id="mName" value="${esc(m.name || '')}" placeholder="z. B. Nurofen Junior Saft"></label>
    <label>Wirkstoff <input id="mSub" list="mSubs" value="${esc(m.substance || '')}" placeholder="z. B. Ibuprofen"><datalist id="mSubs"><option value="Ibuprofen"><option value="Paracetamol"></datalist></label>
    <div class="row"><label>Dosis <input id="mDose" inputmode="decimal" value="${val(m.dose)}"></label>
      <label>Einheit <input id="mUnit" list="mUnits" value="${esc(m.unit || '')}"><datalist id="mUnits"><option value="ml"><option value="mg"><option value="Zäpfchen"><option value="Tropfen"></datalist></label></div>
    <div class="row"><label>Mindestabstand (Std) <input id="mHours" inputmode="decimal" value="${val(m.minHours)}"></label>
      <label>Max. Gaben / 24 Std <input id="mMax" inputmode="numeric" value="${val(m.maxPerDay)}"></label></div>
    <p class="who">Werte laut Beipackzettel oder Kinderarzt. Die App gibt nichts vor.</p>
    <button class="big small ok" id="mSave">Speichern</button>
    ${editIndex != null ? '<button class="link danger" id="mDel">Medikament entfernen</button>' : ''}`);
  const num = id => { const v = parseFloat($(id).value.replace(',', '.')); return isNaN(v) ? null : v; };
  $('#infoBody').querySelectorAll('[data-edit]').forEach(b => (b.onclick = () => manageMeds(Number(b.dataset.edit))));
  $('#mSave').onclick = () => {
    const name = $('#mName').value.trim();
    if (!name) { $('#mName').focus(); return; }
    const item = { name, substance: $('#mSub').value.trim() || null, dose: num('#mDose'), unit: $('#mUnit').value.trim(),
      minHours: num('#mHours'), maxPerDay: num('#mMax') };
    const next = [...meds];
    if (editIndex != null) next[editIndex] = item; else next.push(item);
    saveMeds(next);
    render();
    manageMeds();
  };
  if ($('#mDel')) $('#mDel').onclick = () => {
    if (!confirm(`${m.name} aus der Liste entfernen? Bisherige Gaben bleiben im Verlauf.`)) return;
    saveMeds(meds.filter((_, i) => i !== editIndex));
    render();
    manageMeds();
  };
}

// ---------- Statistik-Karte ----------
// Temperaturverlauf der letzten 7 Tage, Gaben als senkrechte Markierungen (ohne Fieber-Schwellenlinie: keine verifizierte Referenz)
function feverCard() {
  const t1 = Date.now(), t0 = t1 - 7 * 864e5, since14 = toLocal(new Date(t1 - 14 * 864e5));
  if (!entries.some(e => (e.type === 'temperature' || e.type === 'medication') && e.start >= since14)) return '';
  const temps = entries.filter(e => e.type === 'temperature' && ts(e.start) >= t0 && ts(e.start) <= t1).reverse();
  const doses = entries.filter(e => e.type === 'medication' && ts(e.start) >= t0 && ts(e.start) <= t1);
  const vals = temps.map(e => e.amount);
  const lo = Math.floor(Math.min(36, ...vals) * 2) / 2, hi = Math.ceil(Math.max(39, ...vals) * 2) / 2;
  const W = 340, H = 210, L = 34, R = 8, T = 18, B = 22, pw = W - L - R, ph = H - T - B;
  const x = ms => L + ((ms - t0) / (t1 - t0)) * pw, y = v => T + ph - ((v - lo) / (hi - lo)) * ph;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`;
  for (let v = lo; v <= hi + 1e-9; v += 0.5) {
    if (v % 1 === 0) svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 5}" y="${y(v) + 3}" text-anchor="end">${v}°</text>`;
  }
  for (let i = 6; i >= 0; i--) { // Tagesgrenzen
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    if (d.getTime() < t0) continue;
    svg += `<line class="grid" x1="${x(d.getTime())}" x2="${x(d.getTime())}" y1="${T}" y2="${T + ph}"/>`;
    svg += `<text class="ax" x="${x(d.getTime() + 432e5)}" y="${H - 6}" text-anchor="middle">${d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}</text>`;
  }
  for (const e of doses) {
    const xm = x(ts(e.start));
    svg += `<line class="medmark" x1="${xm}" x2="${xm}" y1="${T}" y2="${T + ph}"/><text class="medlbl" x="${xm}" y="${T - 4}" text-anchor="middle">${esc((e.substance || e.title).slice(0, 3))}</text>`;
  }
  if (temps.length > 1) svg += `<path class="mine" d="${temps.map((e, i) => `${i ? 'L' : 'M'}${x(ts(e.start)).toFixed(1)},${y(e.amount).toFixed(1)}`).join('')}"/>`;
  for (const e of temps) svg += `<circle class="pt" cx="${x(ts(e.start)).toFixed(1)}" cy="${y(e.amount).toFixed(1)}" r="3.5"/>`;
  svg += '</svg>';
  const perSub = {};
  for (const e of doses) { const s = e.substance || e.title; perSub[s] = (perSub[s] || 0) + 1; }
  const max = vals.length ? Math.max(...vals) : null;
  const foot = [max != null ? `Höchste Temperatur: ${fmtNum(max)} °C` : 'Keine Temperatur in den letzten 7 Tagen',
    ...Object.entries(perSub).map(([s, n]) => `${s}: ${n} Gabe${n > 1 ? 'n' : ''}`)].join(' · ');
  return card('Fieber & Medikamente (7 Tage)', svg + legend([['pt', 'Temperatur'], ['medsw', 'Gabe (Kürzel = Wirkstoff)']]), foot);
}
