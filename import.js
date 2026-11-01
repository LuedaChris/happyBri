// Import der Happy-Baby-CSV (Datei kommt über die Dateiauswahl, nichts davon liegt im Repository).

// Liest CSV-Text in Zeilen aus Feldern. Kann Anführungszeichen, Kommas und Zeilenumbrüche in Feldern.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM entfernen
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

// Wandelt die CSV-Spalten in Einträge des App-Datenmodells um. Ungültige Zeilen werden gezählt, nicht importiert.
function csvToEntries(text) {
  const [head, ...rows] = parseCsv(text);
  const col = Object.fromEntries((head || []).map((h, i) => [h.trim(), i]));
  for (const name of ['id', 'start', 'ende', 'dauer_min', 'typ', 'titel']) {
    if (!(name in col)) throw new Error(`Das ist keine Happy-Baby-Datei (Spalte „${name}“ fehlt).`);
  }
  const num = v => { const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? null : n; };
  const now = Date.now();
  const entries = [];
  let invalid = 0;
  for (const r of rows) {
    const g = k => (r[col[k]] ?? '').trim();
    const e = {
      id: g('id'), type: g('typ'), title: g('titel'), start: g('start'), end: g('ende') || null,
      durationMin: num(g('dauer_min')), amount: num(g('menge')), unit: g('einheit') || null,
      rating: g('bewertung') || null, pauses: num(g('pausen')), pauseMin: num(g('pause_min')),
      // {babyName} ist ein Platzhalter aus den Happy-Baby-Meilensteinen
      note: g('notiz').replaceAll('{babyName}', 'Bri') || null,
      detailsRaw: g('details_roh') || null, source: g('quelle') || 'happy-baby',
      createdBy: null, createdAt: now, updatedAt: now, deleted: false,
    };
    if (!e.id || !TYPES[e.type] || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(e.start)) { invalid++; continue; }
    entries.push(e);
  }
  return { entries, invalid };
}

async function importCsvFile(file) {
  const { entries: parsed, invalid } = csvToEntries(await file.text());
  // Abgleich über die id: was schon da ist (auch als gelöscht markiert), wird nicht noch einmal angelegt
  const known = new Set((await DB.allRaw()).map(e => e.id));
  const fresh = parsed.filter(e => !known.has(e.id) && known.add(e.id));
  await DB.putMany(fresh);
  await reload();
  return { total: parsed.length, added: fresh.length, skipped: parsed.length - fresh.length, invalid, fresh };
}

function showInfo(title, html) {
  $('#infoTitle').textContent = title;
  $('#infoBody').innerHTML = html;
  if (!$('#info').open) $('#info').showModal();
}
$('#infoClose').onclick = () => $('#info').close();

$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async ev => {
  const file = ev.target.files[0];
  ev.target.value = ''; // dieselbe Datei später nochmal wählbar
  if (!file) return;
  showInfo('Import', 'Lese Datei …');
  try {
    const r = await importCsvFile(file);
    const counts = {};
    for (const e of entries) counts[e.type] = (counts[e.type] || 0) + 1;
    const rows = Object.keys(TYPES).map(t => `<tr><td>${TYPES[t].icon} ${t}</td><td>${counts[t] || 0}</td></tr>`).join('');
    showInfo('Import fertig', `<p>${r.added} neu importiert, ${r.skipped} schon vorhanden${r.invalid ? `, ${r.invalid} ungültig` : ''}.</p>
      <p>Einträge in der App jetzt: <b>${entries.length}</b></p><table>${rows}</table><p id="cloudState"></p>`);
    // In die Cloud: das andere Handy bekommt die Einträge dadurch automatisch
    if (r.fresh.length && window.Sync && Sync.pushMany) {
      Sync.pushMany(r.fresh, done => { $('#cloudState').textContent = `Cloud: ${done} von ${r.fresh.length} hochgeladen …`; })
        .then(() => { $('#cloudState').textContent = 'Cloud: alles hochgeladen ✓'; })
        .catch(err => { $('#cloudState').textContent = 'Cloud-Upload fehlgeschlagen: ' + err.message; });
    }
  } catch (err) {
    showInfo('Import fehlgeschlagen', `<p>${esc(err.message)}</p>`);
  }
};
