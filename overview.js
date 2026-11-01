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

  $('#status').innerHTML =
    row('🍼', 'Letzte Fütterung', feed ? fmtAgo(minutesAgo(feed.start)) : '–', feed ? detail(feed) : '') +
    row('🧷', 'Letzter Wickel', diaper ? fmtAgo(minutesAgo(diaper.start)) : '–', diaper ? detail(diaper) : '') +
    row('😴', 'Schlaf', sleepValue, sleepDetail) +
    predictionRow(row);
}

// Vorhersage des nächsten Schlafs (predict.js); Spanne = ± Median-Fehler aus dem Backtest der letzten 28 Tage
function predictionRow(row) {
  const p = predictNextSleep();
  const clock = ms => fmtTime(toLocal(new Date(ms)));
  if (p.state === 'ok') {
    const range = p.spread != null ? `${clock(p.at - p.spread * 60000)}–${clock(p.at + p.spread * 60000)}` : '';
    const late = p.spread != null && Date.now() > p.at + p.spread * 60000;
    return row('🔮', `Nächster Schlaf · ${slotName(p.slot)}`, `ca. ${clock(p.at)}`, late ? 'überfällig' : range);
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

// Tagessummen für den heutigen Kalendertag (ab 00:00). Schlaf, der über Mitternacht geht, zählt nur mit dem Teil von heute.
function renderToday() {
  const day = nowLocal().slice(0, 10);
  const d0 = ts(day + 'T00:00'), d1 = Date.now();
  const earliest = toLocal(new Date(d0 - 36 * 3600e3)).slice(0, 10); // früher begonnener Schlaf kann noch hineinreichen
  let feeds = 0, ml = 0, diapers = 0, sleepMin = 0;
  for (const e of entries) {
    if (e.start.slice(0, 10) < earliest) break; // Liste ist nach Start sortiert
    if (e.type === 'feeding' && e.start.slice(0, 10) === day) {
      feeds++;
      if (e.unit === 'ml' && e.amount) ml += e.amount;
    } else if (e.type === 'diaper' && e.start.slice(0, 10) === day) {
      diapers++;
    } else if (e.type === 'sleep') {
      const s = ts(e.start), en = e.end ? ts(e.end) : d1;
      const from = Math.max(s, d0), to = Math.min(en, d1);
      if (to <= from) continue;
      const whole = s >= d0 && en <= d1 && e.durationMin != null; // ganz heute: Netto-Dauer ohne Pausen nehmen
      sleepMin += whole ? e.durationMin : Math.round((to - from) / 60000);
    }
  }
  const tile = (icon, big, small) => `<div><span class="ic">${icon}</span><b>${big}</b><small>${small}</small></div>`;
  $('#today').innerHTML =
    tile('🍼', feeds, ml ? `Fütterungen · ${ml} ml` : 'Fütterungen') +
    tile('🧷', diapers, 'Wickel') +
    tile('😴', fmtDur(sleepMin), 'Schlaf');
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
}
