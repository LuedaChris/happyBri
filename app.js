const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Art -> Symbol, Standard-Einheit und Titel-Vorschläge für das Bearbeiten-Formular
const TYPES = {
  feeding: { icon: '🍼', unit: 'ml', titles: ['Flasche', 'Beikost'] },
  sleep:   { icon: '😴', unit: '',   titles: ['Nickerchen', 'Nachtschlaf'] },
  diaper:  { icon: '🧷', unit: '',   titles: ['Pipi', 'Kacka', 'Beides'] },
  custom:  { icon: '📝', unit: '',   titles: [] },
  memory:  { icon: '⭐', unit: '',   titles: [] },
  weight:  { icon: '⚖️', unit: 'kg', titles: ['Gewicht'] },
  height:  { icon: '📏', unit: 'cm', titles: ['Größe'] },
};

// ---------- Zeit-Helfer (Ortszeit als "YYYY-MM-DDTHH:mm", wie in der CSV) ----------
const pad = n => String(n).padStart(2, '0');
const toLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const nowLocal = () => toLocal(new Date());
const minutesBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
const fmtDur = min => min >= 60 ? `${Math.floor(min / 60)} Std ${pad(min % 60)} Min` : `${min} Min`;
const fmtTime = s => s.slice(11, 16);
const fmtDay = s => {
  const today = toLocal(new Date()).slice(0, 10);
  const yest = toLocal(new Date(Date.now() - 864e5)).slice(0, 10);
  const day = s.slice(0, 10);
  if (day === today) return 'Heute';
  if (day === yest) return 'Gestern';
  return new Date(day).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
};

// ---------- Einträge ----------
function newEntry(type, title, start, extra = {}) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(), type, title, start, end: null, durationMin: null,
    amount: null, unit: null, rating: null, pauses: null, pauseMin: null,
    note: null, detailsRaw: null, source: 'app', createdBy: window.currentUserName || null,
    createdAt: now, updatedAt: now, deleted: false, ...extra,
  };
}

let entries = [];
let shown = 40;
const runningSleep = () => entries.find(e => e.type === 'sleep' && !e.end);

async function reload() {
  entries = (await DB.all()).sort((a, b) => b.start.localeCompare(a.start) || b.createdAt - a.createdAt);
  render();
}

async function save(entry, message) {
  await DB.put(entry);
  await reload();
  if (message) toast(message, async () => { await DB.put({ ...entry, deleted: true }); await reload(); });
}

// ---------- Anzeige ----------
function describe(e) {
  let main = e.title || TYPES[e.type].titles[0] || e.type;
  if (e.amount != null) main += ` · ${e.amount} ${e.unit || ''}`;
  let sub = '';
  if (e.type === 'sleep') {
    sub = e.end ? fmtDur(e.durationMin ?? minutesBetween(e.start, e.end)) + ` (bis ${fmtTime(e.end)})` : 'läuft …';
  } else if (e.note) sub = e.note;
  if (e.createdBy) sub = sub ? `${sub} · ${e.createdBy}` : e.createdBy;
  return { main, sub };
}

function render(fromTimer = false) {
  renderOverview();
  // Statistik nur bei echten Änderungen neu zeichnen, nicht im 30-Sek.-Takt (sonst springen Eingabefelder zurück)
  if (!fromTimer && !$('#viewStats').hidden) renderStats();

  // Schlaf-Button
  const run = runningSleep();
  $('#sleepBtn').innerHTML = run
    ? `😴 Aufgewacht<small>schläft seit ${fmtTime(run.start)} · ${fmtDur(Math.max(0, minutesBetween(run.start, nowLocal())))}</small>`
    : '😴 Schlaf starten';

  // Verlauf, nach Tagen gruppiert
  const list = $('#list');
  if (!entries.length) { list.innerHTML = '<div class="empty">Noch keine Einträge.</div>'; $('#moreBtn').hidden = true; return; }
  let html = '', lastDay = '';
  for (const e of entries.slice(0, shown)) {
    const day = e.start.slice(0, 10);
    if (day !== lastDay) { html += `<div class="day">${fmtDay(e.start)}</div>`; lastDay = day; }
    const { main, sub } = describe(e);
    html += `<button class="item" data-id="${esc(e.id)}"><span class="ic">${TYPES[e.type].icon}</span>
      <span class="main">${esc(main)}<div class="sub">${esc(sub)}</div></span><span class="time">${fmtTime(e.start)}</span></button>`;
  }
  list.innerHTML = html;
  $('#moreBtn').hidden = entries.length <= shown;
}

// ---------- Toast mit "Rückgängig" ----------
let toastTimer, toastUndo;
function toast(text, undo) {
  $('#toastText').textContent = text;
  $('#toast').hidden = false;
  toastUndo = undo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 6000);
}
$('#toastUndo').onclick = async () => { $('#toast').hidden = true; if (toastUndo) await toastUndo(); };

// ---------- Schnell-Eingabe ----------
// Zeitfeld zeigt "jetzt"; wird es verändert, wird die gewählte Zeit benutzt (Nachtragen).
let timeTouched = false;
const quickStart = () => (timeTouched ? $('#quickTime').value : nowLocal()) || nowLocal();

function openQuick(title, buildBody) {
  $('#quickTitle').textContent = title;
  $('#quickTime').value = nowLocal();
  timeTouched = false;
  const body = $('#quickBody');
  body.innerHTML = '';
  buildBody(body);
  $('#quick').showModal();
}
$('#quickTime').oninput = () => (timeTouched = true);
$('#quickClose').onclick = () => $('#quick').close();
$('#quick').addEventListener('click', e => { if (e.target === $('#quick')) $('#quick').close(); });

async function quickSave(entry, message) {
  $('#quick').close();
  await save(entry, message);
}

function amountSheet(title, titleText, values, unit) {
  openQuick(title, body => {
    body.innerHTML = `<div class="grid">${values.map(v => `<button class="big" data-v="${v}">${v} ${unit}</button>`).join('')}</div>
      <div class="custom"><input id="qAmount" inputmode="decimal" placeholder="Andere Menge (${unit})"><button class="big small ok" id="qOk">OK</button></div>`;
    const done = v => quickSave(newEntry('feeding', titleText, quickStart(), { amount: v, unit }), `${titleText} ${v} ${unit} gespeichert`);
    body.querySelectorAll('[data-v]').forEach(b => (b.onclick = () => done(Number(b.dataset.v))));
    $('#qOk').onclick = () => {
      const v = parseFloat($('#qAmount').value.replace(',', '.'));
      if (v > 0) done(v);
    };
  });
}

function diaperSheet() {
  openQuick('Wickeln', body => {
    body.innerHTML = `<div class="grid"><button class="big" data-t="Pipi">💧 Pipi</button><button class="big" data-t="Kacka">💩 Kacka</button></div>
      <div class="grid"><button class="big" data-t="Beides">💧💩 Beides</button></div>`;
    body.querySelectorAll('[data-t]').forEach(b => (b.onclick = () =>
      quickSave(newEntry('diaper', b.dataset.t, quickStart()), `${b.dataset.t} gespeichert`)));
  });
}

function moreSheet() {
  openQuick('Mehr', body => {
    body.innerHTML = `<div class="grid">
      <button class="big" data-new="weight">⚖️ Gewicht</button><button class="big" data-new="height">📏 Größe</button>
      <button class="big" data-new="custom">📝 Sonstiges</button><button class="big" data-new="memory">⭐ Meilenstein</button>
      <button class="big" data-new="sleep">😴 Schlaf nachtragen</button><button class="big" data-new="feeding">🍼 Füttern nachtragen</button></div>`;
    body.querySelectorAll('[data-new]').forEach(b => (b.onclick = () => {
      const start = quickStart();
      $('#quick').close();
      openEdit(newEntry(b.dataset.new, TYPES[b.dataset.new].titles[0] || '', start, { unit: TYPES[b.dataset.new].unit || null }), true);
    }));
  });
}

document.querySelectorAll('[data-quick]').forEach(b => (b.onclick = () => {
  const k = b.dataset.quick;
  if (k === 'bottle') amountSheet('Flasche', 'Flasche', [120, 150, 180], 'ml');
  if (k === 'solid') amountSheet('Beikost', 'Beikost', [100, 150, 190, 250], 'g');
  if (k === 'diaper') diaperSheet();
  if (k === 'more') moreSheet();
}));

// ---------- Schlaf starten/stoppen ----------
$('#sleepBtn').onclick = async () => {
  const run = runningSleep();
  if (run) {
    const end = nowLocal();
    await save({ ...run, end, durationMin: Math.max(0, minutesBetween(run.start, end) - (run.pauseMin || 0)) },
      `Schlaf beendet (${fmtDur(minutesBetween(run.start, end))})`);
  } else {
    const start = nowLocal();
    const hour = new Date().getHours();
    await save(newEntry('sleep', hour >= 19 || hour < 6 ? 'Nachtschlaf' : 'Nickerchen', start), 'Schlaf gestartet');
  }
};

// ---------- Bearbeiten / Nachtragen ----------
let editing = null, editingIsNew = false;
const f = id => $('#' + id);

function openEdit(entry, isNew = false) {
  editing = entry; editingIsNew = isNew;
  $('#editHead').textContent = isNew ? 'Eintrag nachtragen' : 'Eintrag bearbeiten';
  f('fType').value = entry.type;
  f('fTitle').value = entry.title || '';
  f('fStart').value = entry.start;
  f('fEnd').value = entry.end || '';
  f('fAmount').value = entry.amount ?? '';
  f('fUnit').value = entry.unit || '';
  f('fRating').value = entry.rating || '';
  f('fNote').value = entry.note || '';
  f('fDelete').hidden = isNew;
  syncTypeFields();
  $('#edit').showModal();
}

function syncTypeFields() {
  const t = f('fType').value;
  f('titles').innerHTML = TYPES[t].titles.map(x => `<option value="${esc(x)}">`).join('');
  f('fRatingWrap').hidden = t !== 'sleep';
}
f('fType').onchange = () => {
  const t = f('fType').value;
  syncTypeFields();
  f('fTitle').value = TYPES[t].titles[0] || '';
  f('fUnit').value = TYPES[t].unit;
};

f('fCancel').onclick = () => $('#edit').close();
f('editForm').onsubmit = async ev => {
  ev.preventDefault();
  const e = { ...editing };
  const start = f('fStart').value, end = f('fEnd').value || null;
  const timesChanged = start !== e.start || end !== e.end;
  e.type = f('fType').value;
  e.title = f('fTitle').value.trim();
  e.start = start; e.end = end;
  const amount = parseFloat(f('fAmount').value.replace(',', '.'));
  e.amount = isNaN(amount) ? null : amount;
  e.unit = f('fUnit').value.trim() || null;
  e.rating = f('fRating').value || null;
  e.note = f('fNote').value.trim() || null;
  // Netto-Dauer nur neu berechnen, wenn Zeiten geändert wurden (importierte Werte bleiben sonst erhalten)
  if (timesChanged || editingIsNew) e.durationMin = end ? Math.max(0, minutesBetween(start, end) - (e.pauseMin || 0)) : null;
  $('#edit').close();
  await save(e, editingIsNew ? 'Eintrag gespeichert' : null);
};
f('fDelete').onclick = async () => {
  if (!confirm('Eintrag wirklich löschen?')) return;
  const gone = { ...editing, deleted: true };
  $('#edit').close();
  await DB.put(gone);
  await reload();
  toast('Eintrag gelöscht', async () => { await DB.put({ ...gone, deleted: false }); await reload(); });
};

$('#list').onclick = ev => {
  const item = ev.target.closest('.item');
  if (item) openEdit(entries.find(e => e.id === item.dataset.id));
};
$('#moreBtn').onclick = () => { shown += 40; render(); };

// ---------- Start ----------
window.reloadEntries = reload; // sync.js ruft das auf, wenn Einträge vom anderen Handy angekommen sind
$('#gate').hidden = false;
setTimeout(() => { if (!window.Sync) $('#gateLoading').textContent = 'Anmeldung nicht erreichbar. Bitte einmal mit Internet öffnen.'; }, 8000);
reload();
setInterval(() => render(true), 30000); // laufende Schlafdauer und Vorhersage aktualisieren
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); // Browser soll Daten nicht von selbst löschen
