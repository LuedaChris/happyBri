// Bericht für den Kinderarzt (Goal 11) und Fragen für den Arzt (Einträge vom Typ 'question').
// Der Bericht ist eine eigene Vollbild-Ansicht; "Drucken / als PDF" nutzt den Druckdialog des Browsers,
// die hellen Druckfarben stehen in style.css unter @media print.

// ---------- Fragen ----------
function questionSheet() {
  openQuick('Frage für den Arzt', body => {
    body.innerHTML = `<label>Frage <textarea id="qQuestion" rows="3" placeholder="z. B. Ab wann Kuhmilch aus der Tasse?"></textarea></label>
      <button class="big small ok" id="qQuestionOk">Speichern</button>`;
    $('#qQuestionOk').onclick = () => {
      const text = $('#qQuestion').value.trim();
      if (text) quickSave(newEntry('question', text, quickStart()), 'Frage gespeichert');
    };
  });
}
const openQuestions = () => entries.filter(e => e.type === 'question').reverse(); // älteste zuerst

// ---------- Hilfen ----------
// Alter als "12 Monate, 12 Tage" (Kalendermonate, wie in den Vorsorgeheften üblich)
function ageText(birth, at = new Date()) {
  const b = new Date(birth + 'T00:00');
  let months = (at.getFullYear() - b.getFullYear()) * 12 + at.getMonth() - b.getMonth(), days = at.getDate() - b.getDate();
  if (days < 0) { months--; days += new Date(at.getFullYear(), at.getMonth(), 0).getDate(); }
  return `${months} Monat${months === 1 ? '' : 'e'}, ${days} Tag${days === 1 ? '' : 'e'}`;
}
const dateDe = s => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
const rSection = (title, html) => `<section class="rsec"><h2>${title}</h2>${html}</section>`;
const rTable = (head, rows) => (rows.length
  ? `<table class="rtable"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`
  : '<p>Keine Einträge.</p>');

// Die 14 vollständigen Tage vor heute
function reportDays(n = 14) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), d = now.getDate(), out = [];
  for (let i = n; i >= 1; i--) out.push({ t0: new Date(y, m, d - i).getTime(), t1: new Date(y, m, d - i + 1).getTime(), div: 1 });
  return out;
}

// ---------- Bericht ----------
function renderReport() {
  const profile = getProfile(), birth = profile.birth;
  const birthMs = birth ? new Date(birth + 'T00:00').getTime() : null;
  let html = `<h1>Bericht für den Kinderarzt – Bri</h1>
    <p class="rmeta">Erstellt am ${dateDe(nowLocal())}${birth ? ` · geboren am ${dateDe(birth)} · Alter: ${ageText(birth)}` : ' · Geburtsdatum fehlt (in der Statistik eintragen)'}</p>`;

  // Wachstum
  if (birth) {
    const growth = (kind, type, unit, yStep) => {
      const list = entries.filter(e => e.type === type && e.amount > 0);
      const rows = list.slice(0, 6).map(e => {
        const months = (ts(e.start) - birthMs) / (30.4375 * 864e5);
        const pc = months >= 0 && months <= 24 ? Math.round(whoPercentile(kind, months, e.amount)) : '–';
        return [dateDe(e.start), ageText(birth, new Date(ts(e.start))), `${fmtNum(e.amount)} ${unit}`, pc];
      });
      return growthChart(kind, list, birthMs, yStep) + rTable(['Datum', 'Alter', 'Wert', 'Perzentil (WHO)'], rows);
    };
    html += rSection('Wachstum', `<h3>Gewicht</h3>${growth('weight', 'weight', 'kg', 1)}<h3>Länge</h3>${growth('length', 'height', 'cm', 5)}
      <p class="rnote">Perzentile: WHO Child Growth Standards (Mädchen), Linien 3./15./50./85./97. Perzentil.</p>`);
  }

  // Schlaf, Ernährung, Wickeln: Durchschnitt über die 14 Tage vor heute (nur Tage mit Einträgen)
  const days = reportDays(), rows = aggregate(days);
  const sleepDays = rows.filter(r => r.nap + r.night > 0);
  const avgOf = (list, pick) => (list.length ? list.reduce((s, r) => s + pick(r), 0) / list.length : 0);
  const allWake = sleepDays.flatMap(r => r.wake), allNaps = sleepDays.flatMap(r => r.naps);
  const ageM = birth ? babyAgeMonths() : null, ref = ageM != null ? sleepRef(ageM) : null;
  const t0 = days[0].t0, t1 = days[days.length - 1].t1;
  const inDays = e => { const s = ts(e.start); return s >= t0 && s < t1; };
  const perDay = (filter, list) => {
    const byDay = days.map(p => list.filter(e => filter(e) && ts(e.start) >= p.t0 && ts(e.start) < p.t1));
    const used = byDay.filter(x => x.length);
    return { count: used.length ? used.reduce((s, x) => s + x.length, 0) / used.length : 0,
      amount: used.length ? used.reduce((s, x) => s + x.reduce((a, e) => a + (e.amount || 0), 0), 0) / used.length : 0, days: used.length };
  };
  const recent = entries.filter(inDays);
  const bottle = perDay(e => e.type === 'feeding' && e.title === 'Flasche' && e.unit === 'ml', recent);
  const solid = perDay(e => e.type === 'feeding' && e.title === 'Beikost' && e.unit === 'g', recent);
  const diaper = perDay(e => e.type === 'diaper', recent);
  const stool = perDay(e => e.type === 'diaper' && (e.title === 'Kacka' || e.title === 'Beides'), recent);
  const h = min => fmtDur(Math.round(min));
  html += rSection(`Schlaf (Ø pro Tag, ${sleepDays.length} Tage mit Einträgen)`, rTable(['', 'Wert'], [
    ['Gesamtschlaf', h(avgOf(sleepDays, r => r.nap + r.night)) + (ref ? ` (Richtwert ${ref.band[0] / 60}–${ref.band[1] / 60} Std, ${ref.src})` : '')],
    ['Nachtschlaf', h(avgOf(sleepDays, r => r.night))],
    ['Tagschlaf', h(avgOf(sleepDays, r => r.nap))],
    ['Nickerchen pro Tag', fmtNum(Math.round(avgOf(sleepDays, r => r.naps.length) * 10) / 10)],
    ['Ø Nickerchen-Dauer', allNaps.length ? h(allNaps.reduce((a, b) => a + b, 0) / allNaps.length) : '–'],
    ['Ø Wachfenster', allWake.length ? h(allWake.reduce((a, b) => a + b, 0) / allWake.length) : '–'],
  ]));
  html += rSection('Ernährung und Wickeln (Ø pro Tag, 14 Tage)', rTable(['', 'Wert'], [
    ['Flasche', bottle.days ? `${fmtNum(Math.round(bottle.amount))} ml in ${fmtNum(Math.round(bottle.count * 10) / 10)} Mahlzeiten` : '–'],
    ['Beikost', solid.days ? `${fmtNum(Math.round(solid.amount))} g in ${fmtNum(Math.round(solid.count * 10) / 10)} Mahlzeiten` : '–'],
    ['Wickel', diaper.days ? fmtNum(Math.round(diaper.count * 10) / 10) : '–'],
    ['davon mit Stuhl', stool.days ? fmtNum(Math.round(stool.count * 10) / 10) : '–'],
  ]));

  // Krankheit: Medikamente und Temperaturen der letzten 28 Tage
  const since28 = toLocal(new Date(Date.now() - 28 * 864e5));
  const ill = entries.filter(e => (e.type === 'medication' || e.type === 'temperature') && e.start >= since28).reverse();
  html += rSection('Medikamente und Temperaturen (28 Tage)', rTable(['Zeit', 'Art', 'Wert', 'Wer'], ill.map(e => [
    `${dateDe(e.start)} ${fmtTime(e.start)}`,
    e.type === 'temperature' ? 'Temperatur' : `${esc(e.title)}${e.substance ? ` (${esc(e.substance)})` : ''}`,
    e.amount != null ? `${fmtNum(e.amount)} ${esc(e.unit || '')}` : '–', esc(e.createdBy || '')])));

  // Fragen
  const qs = openQuestions();
  html += rSection('Fragen', qs.length ? `<ul class="rquestions">${qs.map(q => `<li><label><input type="checkbox" data-q="${esc(q.id)}"> ${esc(q.title)}</label><span class="rdate">${dateDe(q.start)}</span></li>`).join('')}</ul>`
    : '<p>Keine offenen Fragen. Fragen sammelt ihr über „Mehr → Frage für den Arzt“.</p>');

  html += '<p class="rnote">Alle Werte stammen aus den Einträgen der Eltern (happyBri) und ersetzen keine ärztliche Beurteilung.</p>';
  $('#reportBody').innerHTML = html;
}

function openReport() {
  renderReport();
  $('#reportView').hidden = false;
  $('#reportView').scrollTop = 0;
}
$('#reportClose').onclick = () => ($('#reportView').hidden = true);
$('#reportPrint').onclick = () => window.print();
// Frage abhaken = als erledigt löschen (mit Rückgängig)
$('#reportBody').addEventListener('change', async ev => {
  const id = ev.target.dataset && ev.target.dataset.q;
  if (!id) return;
  const q = entries.find(e => e.id === id);
  await DB.put({ ...q, deleted: true });
  await reload();
  renderReport();
  toast('Frage erledigt', async () => { await DB.put({ ...q, deleted: false }); await reload(); renderReport(); });
});
