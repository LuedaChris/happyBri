// Übergabe-Zusammenfassung (Goal 10): was seit einem Zeitpunkt passiert ist – zum Lesen beim Schichtwechsel
// und zum Teilen (z. B. an Oma oder Babysitter). Rechnet nur aus `entries`.

function handoverLines(fromMs, toMs = Date.now()) {
  const today = nowLocal().slice(0, 10);
  // Uhrzeit, bei anderen Tagen mit Datum davor
  const when = s => (s.slice(0, 10) === today ? fmtTime(s) : `${Number(s.slice(8, 10))}.${Number(s.slice(5, 7))}. ${fmtTime(s)}`);
  const list = entries.filter(e => { const s = ts(e.start); return s >= fromMs && s <= toMs; });
  const of = (type, title) => list.filter(e => e.type === type && (!title || e.title === title));
  const sum = (arr, unit) => arr.reduce((s, e) => s + (e.unit === unit && e.amount ? e.amount : 0), 0);
  const who = e => (e.createdBy ? ` (${e.createdBy})` : '');
  const lines = [`Übergabe seit ${when(toLocal(new Date(fromMs)))}`];

  const bottles = of('feeding', 'Flasche'), solids = of('feeding', 'Beikost');
  lines.push(`🍼 Flasche: ${bottles.length}×${sum(bottles, 'ml') ? `, ${sum(bottles, 'ml')} ml` : ''}${bottles.length ? `, zuletzt ${when(bottles[0].start)}` : ''}`);
  const dishes = [...new Set(solids.slice().reverse().flatMap(dishesOf))]; // Gerichte in zeitlicher Reihenfolge (solids.js)
  lines.push(`🥣 Beikost: ${solids.length}×${sum(solids, 'g') ? `, ${sum(solids, 'g')} g` : ''}${solids.length ? `, zuletzt ${when(solids[0].start)}` : ''}${dishes.length ? ` – ${dishes.join(', ')}` : ''}`);

  const diapers = of('diaper'), kinds = {};
  for (const e of diapers) kinds[e.title] = (kinds[e.title] || 0) + 1;
  const red = diapers.filter(e => popoState(e) === 'leicht rot' || popoState(e) === 'wund').length; // popo.js
  lines.push(`🧷 Wickel: ${diapers.length}×${diapers.length ? ` (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}), zuletzt ${when(diapers[0].start)}` : ''}${red ? `, davon ${red}× Popo rot` : ''}`);

  // Schlaf im Zeitraum: Netto-Dauer anteilig wie in der Statistik (aggregate in stats.js)
  const r = aggregate([{ t0: fromMs, t1: toMs, div: 1 }])[0];
  const run = runningSleep();
  const lastSleep = entries.find(e => e.type === 'sleep' && e.end && e.end <= nowLocal());
  const state = run ? `schläft seit ${when(run.start)}` : lastSleep ? `wach seit ${when(lastSleep.end)}` : '';
  lines.push(`😴 Schlaf: ${fmtDur(Math.round(r.nap + r.night))}${state ? ` · ${state}` : ''}`);
  const p = predictNextSleep();
  if (p.state === 'ok') lines.push(`🔮 Nächster Schlaf: ${slotName(p.slot)} ca. ${fmtTime(toLocal(new Date(p.at)))}`);

  for (const e of of('medication').reverse()) {
    lines.push(`💊 ${when(e.start)} ${e.title}${e.amount ? ` ${fmtNum(e.amount)} ${e.unit || ''}`.trimEnd() : ''}${who(e)}`);
  }
  if (list.some(e => e.type === 'medication')) {
    const subs = [...new Set(of('medication').map(e => e.substance || e.title))];
    lines.push(`   Stand: ${subs.map(s => substanceShort(s)).join(' · ')}`);
  }
  for (const e of of('temperature').reverse()) lines.push(`🌡️ ${when(e.start)} ${fmtNum(e.amount)} °C${who(e)}`);
  for (const e of list.filter(e => e.type === 'custom' || e.type === 'memory').reverse()) {
    lines.push(`📝 ${when(e.start)} ${e.title || 'Notiz'}${e.note ? `: ${e.note}` : ''}${who(e)}`);
  }
  return lines;
}

// Teilen über das Android-Teilen-Menü, sonst in die Zwischenablage
async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('In die Zwischenablage kopiert'); } catch { toast('Teilen nicht möglich'); }
}

function openHandover() {
  showInfo('Übergabe', `<div class="seg"><button data-h="6">6 Std</button><button data-h="12" class="on">12 Std</button><button data-h="24">24 Std</button></div>
    <label>Seit <input type="datetime-local" id="hoFrom"></label>
    <div id="hoOut" class="handover"></div>
    <button class="big small" id="hoShare">Teilen</button>`);
  const setHours = h => {
    $('#hoFrom').value = toLocal(new Date(Date.now() - h * 3600e3));
    $('#infoBody').querySelectorAll('[data-h]').forEach(b => b.classList.toggle('on', Number(b.dataset.h) === h));
    update();
  };
  const update = () => {
    const from = $('#hoFrom').value;
    if (!from) return;
    $('#hoOut').innerHTML = handoverLines(ts(from)).map(l => `<p>${esc(l)}</p>`).join('');
  };
  $('#infoBody').querySelectorAll('[data-h]').forEach(b => (b.onclick = () => setHours(Number(b.dataset.h))));
  $('#hoFrom').oninput = () => { $('#infoBody').querySelectorAll('[data-h]').forEach(b => b.classList.remove('on')); update(); };
  $('#hoShare').onclick = () => { const from = $('#hoFrom').value; if (from) shareText(handoverLines(ts(from)).join('\n')); };
  setHours(12);
}
