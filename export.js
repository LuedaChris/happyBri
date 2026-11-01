// CSV-Export (Goal 5): gleiches Format wie die Happy-Baby-Importdatei, dazu die Spalte "eingetragen_von".
// UTF-8 mit BOM (damit Umlaute in Google Sheets stimmen), Komma-getrennt, Zeiten wie in der App (Ortszeit).

const CSV_HEAD = ['id', 'start', 'ende', 'dauer_min', 'typ', 'titel', 'menge', 'einheit', 'bewertung',
  'pausen', 'pause_min', 'notiz', 'details_roh', 'quelle', 'eingetragen_von'];

// Felder mit Komma, Anführungszeichen oder Zeilenumbruch kommen in Anführungszeichen
const csvCell = v => {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

function buildCsv(list) {
  const rows = [...list].sort((a, b) => a.start.localeCompare(b.start)).map(e => [
    e.id, e.start, e.end, e.durationMin, e.type, e.title, e.amount, e.unit, e.rating,
    e.pauses, e.pauseMin, e.note, e.detailsRaw, e.source, e.createdBy,
  ].map(csvCell).join(','));
  return '﻿' + [CSV_HEAD.join(','), ...rows].join('\r\n') + '\r\n';
}

const inRange = (from, to) => entries.filter(e => e.start.slice(0, 10) >= from && e.start.slice(0, 10) <= to);

function updateExportCount() {
  const n = inRange($('#exFrom').value, $('#exTo').value).length;
  $('#exCount').textContent = `${n} Einträge im Zeitraum`;
  $('#exGo').disabled = n === 0;
}

$('#exportBtn').onclick = () => {
  $('#exFrom').value = entries.length ? entries[entries.length - 1].start.slice(0, 10) : nowLocal().slice(0, 10);
  $('#exTo').value = nowLocal().slice(0, 10);
  updateExportCount();
  $('#exportDlg').showModal();
};
$('#exFrom').oninput = $('#exTo').oninput = updateExportCount;
$('#exCancel').onclick = () => $('#exportDlg').close();

$('#exGo').onclick = () => {
  const list = inRange($('#exFrom').value, $('#exTo').value);
  const blob = new Blob([buildCsv(list)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `happybri-export-${nowLocal().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  $('#exportDlg').close();
  toast(`${list.length} Einträge exportiert`);
};
