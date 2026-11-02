// Übersicht (Goal 4): Status der letzten Ereignisse, Tagessummen und Zeitstrahl der letzten 24 Stunden.
// Alles wird aus der Liste `entries` (neueste zuerst) berechnet; es wird nichts extra gespeichert.

const MS_DAY = 864e5;
const ts = s => new Date(s).getTime(); // "2026-11-01T03:24" wird als Ortszeit gelesen

function fmtAgo(min) {
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min`;
  if (min < 1440) return `vor ${fmtDur(min)}`;
  return `vor ${Math.floor(min / 1440)} Tg ${Math.floor((min % 1440) / 60)} Std`;
}

function renderStatus() {
  const now = nowLocal();
  const minutesAgo = s => Math.max(0, minutesBetween(s, now));
  const last = type => entries.find(e => e.type === type && e.start <= now);
  const row = (icon, label, value, detail) =>
    `<div class="srow"><span class="ic">${icon}</span><span class="sbody"><small>${label}</small><b>${esc(value)}</b></span><span class="det">${esc(detail)}</span></div>`;

  const feed = last('feeding'), diaper = last('diaper');
  const run = runningSleep();
  const lastSleep = entries.find(e => e.type === 'sleep' && e.end && e.end <= now);

  let sleepValue = '–', sleepDetail = '';
  if (run) {
    sleepValue = `schläft seit ${fmtDur(minutesAgo(run.start))}`;
    sleepDetail = `seit ${fmtTime(run.start)}`;
  } else if (lastSleep) {
    sleepValue = `wach seit ${fmtDur(minutesAgo(lastSleep.end))}`; // das ist das Wachfenster
    sleepDetail = `zuletzt ${fmtDur(lastSleep.durationMin ?? minutesBetween(lastSleep.start, lastSleep.end))}`;
  }
  const detail = e => [e.title, e.amount != null ? `${e.amount} ${e.unit || ''}`.trim() : ''].filter(Boolean).join(' ');

  const html = arrange('status', { // Reihenfolge/Sichtbarkeit je Person (layout.js)
    feed: row('🍼', 'Letzte Fütterung', feed ? fmtAgo(minutesAgo(feed.start)) : '–', feed ? detail(feed) : ''),
    diaper: row('🧷', 'Letzter Wickel', diaper ? fmtAgo(minutesAgo(diaper.start)) : '–', diaper ? detail(diaper) : ''),
    sleep: row('😴', 'Schlaf', sleepValue, sleepDetail),
    predict: predictionRow(row),
    meds: typeof medsRow === 'function' ? medsRow() : '', // nur sichtbar, wenn in den letzten 24 Std Medikamente/Fieber erfasst wurden
  });
  $('#status').innerHTML = html;
  $('#status').hidden = !html; // alle Zeilen ausgeblendet: keine leere Karte
}

// Vorhersage des nächsten Schlafs (predict.js); Spanne = ± Median-Fehler aus dem Backtest der letzten 28 Tage
function predictionRow(row) {
  if (typeof predictNextSleep !== 'function') return ''; // predict.js fehlt (z. B. halb aktualisierter Cache)
  const p = predictNextSleep();
  const clock = ms => fmtTime(toLocal(new Date(ms)));
  if (p.state === 'ok') {
    const range = p.spread != null ? `${clock(p.at - p.spread * 60000)}–${clock(p.at + p.spread * 60000)}` : '';
    const late = p.spread != null && Date.now() > p.at + p.spread * 60000;
    // Wachfenster-Ampel: wie weit das vorhergesagte Wachfenster schon verbraucht ist (grün < 75 %, gelb bis 100 %, rot darüber)
    if (!p.wakeSince) return row('🔮', `Nächster Schlaf · ${slotName(p.slot)}`, `ca. ${clock(p.at)}`, late ? 'überfällig' : range); // ältere predict.js im Cache
    const total = (p.at - p.wakeSince) / 60000, awake = (Date.now() - p.wakeSince) / 60000;
    const share = total > 0 ? awake / total : 1;
    const level = share < 0.75 ? 'ok' : share <= 1 ? 'warn' : 'late';
    const hm = min => { const m = Math.max(0, Math.round(min)); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };
    return `<div class="srow"><span class="ic">🔮</span><span class="sbody"><small>Nächster Schlaf · ${slotName(p.slot)}</small>
      <b>ca. ${clock(p.at)}</b><span class="ampel ${level}"><i style="width:${Math.min(100, Math.round(share * 100))}%"></i></span></span>
      <span class="det">${late ? 'überfällig' : range}<br><small>wach ${hm(awake)} von ${hm(total)}</small></span></div>`;
  }
  const hints = {
    few: ['noch zu wenig Daten', `${p.points} von mind. 4 Einträgen`],
    sleeping: ['nach dem Aufwachen', ''],
    night: ['nachts keine Vorhersage', ''],
    stale: ['keine aktuellen Schlafdaten', ''],
    nodata: ['noch keine Schlafdaten', ''],
  };
  const [value, detail] = hints[p.state];
  return row('🔮', p.slot ? `Nächster Schlaf · ${slotName(p.slot)}` : 'Nächster Schlaf', value, detail);
}

// Tagessummen je Kalendertag (ab 00:00) für eine Liste von Tagen "YYYY-MM-DD". Schlaf, der über Mitternacht geht, zählt
// anteilig bei beiden Tagen; ganz an einem Tag liegende Schläfe zählen mit der Netto-Dauer aus dem Eintrag.
// Gemeinsame Grundlage für "Heute" auf dem Startbildschirm und den Reiter "Übersicht" (renderDays), damit die Zahlen übereinstimmen.
function dayTotals(days) {
  const res = {}, now = Date.now(), today = nowLocal().slice(0, 10);
  for (const d of days) res[d] = { feeds: 0, ml: 0, diapers: 0, sleepMin: 0 };
  const oldest = days.reduce((a, b) => (a < b ? a : b));
  const earliest = toLocal(new Date(ts(oldest + 'T00:00') - 36 * 3600e3)).slice(0, 10); // früher begonnener Schlaf kann hineinreichen
  for (const e of entries) {
    const day = e.start.slice(0, 10);
    if (day < earliest) break; // Liste ist nach Start sortiert
    const r = res[day];
    if (e.type === 'feeding' && r) {
      r.feeds++;
      if (e.unit === 'ml' && e.amount) r.ml += e.amount;
    } else if (e.type === 'diaper' && r) {
      r.diapers++;
    } else if (e.type === 'sleep') {
      const s = ts(e.start), en = e.end ? ts(e.end) : now;
      for (let d = day, n = 0; d <= (e.end ? e.end.slice(0, 10) : today) && n < 40; d = shiftDay(d, 1), n++) {
        if (!res[d]) continue;
        const d0 = ts(d + 'T00:00'), d1 = ts(shiftDay(d, 1) + 'T00:00');
        const from = Math.max(s, d0), to = Math.min(en, d1, now);
        if (to <= from) continue;
        const whole = s >= d0 && en <= d1 && en <= now && e.durationMin != null;
        res[d].sleepMin += whole ? e.durationMin : Math.round((to - from) / 60000);
      }
    }
  }
  return res;
}

const dayTile = (icon, big, small) => `<div><span class="ic">${icon}</span><b>${big}</b><small>${small}</small></div>`;
const dayTiles = t => dayTile('🍼', t.feeds, t.ml ? `Fütterungen · ${t.ml} ml` : 'Fütterungen') + dayTile('🧷', t.diapers, 'Wickel') + dayTile('😴', fmtDur(t.sleepMin), 'Schlaf');

function renderToday() {
  const day = nowLocal().slice(0, 10);
  $('#today').innerHTML = dayTiles(dayTotals([day])[day]);
}

// Reiter "Übersicht": je Tag dieselben drei Kacheln wie bei "Heute", neueste zuerst; Antippen öffnet den Tag im Verlauf
let daysShown = 14;
function renderDays() {
  const today = nowLocal().slice(0, 10);
  const first = entries.length ? entries[entries.length - 1].start.slice(0, 10) : today; // ältester Eintrag
  const days = [];
  for (let d = today; d >= first && days.length < daysShown; d = shiftDay(d, -1)) days.push(d);
  const totals = dayTotals(days);
  $('#daysBody').innerHTML = days.map(d => `<button class="daycard" data-day="${d}"><div class="dayhead"><b>${fmtDay(d + 'T00:00')}</b>
      <small>${new Date(d + 'T12:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' })}</small></div>
      <div class="daytiles">${dayTiles(totals[d])}</div></button>`).join('')
    + (days[days.length - 1] > first ? '<button class="link" data-moredays>Ältere Tage laden</button>' : '');
}
// Zeitstrahl: drei Bahnen (Schlaf als Balken, Füttern und Wickeln als Punkte), links vor 24 Std, rechts jetzt.
function renderTimeline() {
  const t1 = Date.now(), t0 = t1 - MS_DAY;
  const pct = ms => ((ms - t0) / MS_DAY) * 100;
  let sleep = '', feed = '', diaper = '';
  for (const e of entries) {
    if (ts(e.start) < t0 - MS_DAY) break;
    const s = ts(e.start);
    if (e.type === 'sleep') {
      const en = e.end ? ts(e.end) : t1;
      if (en <= t0 || s >= t1) continue;
      const left = pct(Math.max(s, t0)), width = pct(Math.min(en, t1)) - left;
      sleep += `<i class="blk" style="left:${left}%;width:${Math.max(width, 0.6)}%"></i>`;
    } else if ((e.type === 'feeding' || e.type === 'diaper') && s >= t0 && s <= t1) {
      const dot = `<i class="dot ${e.type}" style="left:${pct(s)}%"></i>`;
      if (e.type === 'feeding') feed += dot; else diaper += dot;
    }
  }
  // Uhrzeit-Markierungen alle 6 Stunden (00, 06, 12, 18 Uhr)
  let ticks = '', labels = '';
  const first = new Date(t0); first.setMinutes(0, 0, 0);
  for (let t = first.getTime() + 3600e3; t < t1; t += 3600e3) {
    const h = new Date(t).getHours();
    if (h % 6) continue;
    ticks += `<u style="left:${pct(t)}%"></u>`;
    labels += `<span style="left:${pct(t)}%">${pad(h)}</span>`;
  }
  const lane = (icon, inner) => `<div class="lane"><span class="ic">${icon}</span><div class="track">${ticks}${inner}</div></div>`;
  $('#timeline').innerHTML = lane('😴', sleep) + lane('🍼', feed) + lane('🧷', diaper) +
    `<div class="lane"><span class="ic"></span><div class="axis">${labels}<span style="left:100%">jetzt</span></div></div>`;
}

function renderOverview() {
  renderStatus();
  renderToday();
  renderTimeline();
  if (typeof renderQuote === 'function') renderQuote(); // quotes.js
}
