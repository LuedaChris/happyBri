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

// ---------- Excel (.xlsx) ----------
// Eine .xlsx-Datei ist ein ZIP mit ein paar XML-Dateien. Sie hat feste Kodierung (UTF-8) und echte Datums-/Zahlenwerte,
// deshalb öffnet Google Sheets sie ohne die Zeichensatz-Probleme der CSV. Hier wird das ZIP ohne Kompression geschrieben.
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_COLS = ['text', 'dt', 'dt', 'num', 'text', 'text', 'num', 'text', 'text', 'num', 'num', 'text', 'text', 'text', 'text'];
const XLSX_WIDTHS = [14, 17, 17, 10, 10, 18, 8, 8, 11, 8, 10, 28, 24, 12, 16];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = bytes => {
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

function zipStored(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(12, dosTime, true); cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: XLSX_MIME });
}

const xmlText = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const colLetter = i => String.fromCharCode(65 + i); // reicht für A bis O

// "2026-11-01T03:37" -> Excel-Zahl (Tage seit 1899-12-30, Nachkommastellen = Uhrzeit)
function excelDate(s) {
  const [y, mo, d, h, mi] = s.split(/[-T:]/).map(Number);
  return Date.UTC(y, mo - 1, d) / 864e5 + 25569 + (h * 60 + mi) / 1440;
}

function buildXlsx(list) {
  const cell = (i, r, v) => {
    if (v == null || v === '') return '';
    const ref = colLetter(i) + r;
    const kind = XLSX_COLS[i];
    if (kind === 'dt') return `<c r="${ref}" s="1"><v>${excelDate(v)}</v></c>`;
    if (kind === 'num') return `<c r="${ref}"><v>${Number(v)}</v></c>`;
    return `<c r="${ref}"${style}  t="inlineStr"><is><t xml:space="preserve">${xmlText(v)}</t></is></c>`;
  };
  const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
  let rows = `<row r="1">${CSV_HEAD.map((h, i) => `<c r="${colLetter(i)}1" s="2" t="inlineStr"><is><t>${h}</t></is></c>`).join('')}</row>`;
  sorted.forEach((e, n) => {
    const r = n + 2;
    const vals = [e.id, e.start, e.end, e.durationMin, e.type, e.title, e.amount, e.unit, e.rating,
      e.pauses, e.pauseMin, e.note, e.detailsRaw, e.source, e.createdBy];
    rows += `<row r="${r}">${vals.map((v, i) => cell(i, r, v)).join('')}</row>`;
  });
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const cols = XLSX_WIDTHS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  return zipStored([
    { name: '[Content_Types].xml', text: head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', text: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: head + `<workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="happyBri" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', text: head + `<styleSheet ${ns}><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd\\ hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    { name: 'xl/worksheets/sheet1.xml', text: head + `<worksheet ${ns}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>` },
  ]);
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
  const xlsx = $('#exFormat').value === 'xlsx';
  const blob = xlsx ? buildXlsx(list) : new Blob([buildCsv(list)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `happybri-export-${nowLocal().slice(0, 10)}.${xlsx ? 'xlsx' : 'csv'}`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  $('#exportDlg').close();
  toast(`${list.length} Einträge exportiert`);
};
