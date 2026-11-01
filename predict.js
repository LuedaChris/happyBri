// Schlafvorhersage (Goal 7): sagt den Beginn des nächsten Schlafs voraus und prüft sich per Backtest selbst.
// Rechnet nur auf den Schlafeinträgen in `entries`; es wird nichts gespeichert oder verschickt.

const SLEEP_PRED = {
  minWake: 20, maxWake: 8 * 60, // nur Wachfenster zwischen 20 Min und 8 Std zählen
  histDays: 14, minPoints: 4,    // je Slot die Einträge der letzten 14 Tage, mindestens 4
  minDistinct: 3,                // weniger verschiedene Aufwachzeiten -> Median statt Regression
  dayStart: 4 * 60,              // Uhrzeiten vor 04:00 zählen als +24 Std
  backtestDays: 28,
};

const spDaysBefore = (ms, n) => { const d = new Date(ms); d.setDate(d.getDate() - n); return d.getTime(); };
// Uhrzeit in Minuten seit Mitternacht, vor 04:00 als +24 Std (gehört noch zum Vortag)
const spClock = ms => { const d = new Date(ms), m = d.getHours() * 60 + d.getMinutes(); return m < SLEEP_PRED.dayStart ? m + 1440 : m; };
// "Baby-Tag": Datum mit Tageswechsel um 04:00
const spDay = ms => toLocal(new Date(ms - SLEEP_PRED.dayStart * 60000)).slice(0, 10);
const spMean = list => list.reduce((a, b) => a + b, 0) / list.length;
const spMedian = list => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b), h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

// Alle abgeschlossenen Schlafeinträge, nach Start sortiert, mit Slot:
// 'nap1', 'nap2' … (Nickerchen seit dem letzten Nachtschlaf), 'night' (Zubettgehen = Nachtschlaf direkt nach einem
// Nickerchen) oder null (Nachtschlaf nach Nachtschlaf = nächtliches Aufwachen, zählt nicht).
function sleepEvents() {
  const sleeps = entries.filter(e => e.type === 'sleep' && e.end)
    .map(e => ({ s: ts(e.start), en: ts(e.end), night: e.title === 'Nachtschlaf' }))
    .sort((a, b) => a.s - b.s);
  let naps = 0;
  return sleeps.map((cur, i) => {
    const prev = sleeps[i - 1];
    let slot = null;
    if (cur.night) {
      if (prev && !prev.night) slot = 'night';
      naps = 0;
    } else {
      slot = 'nap' + ++naps;
    }
    const wake = prev ? (cur.s - prev.en) / 60000 : null; // Wachfenster davor
    return {
      ...cur, slot, napsSince: naps, prevEnd: prev ? prev.en : null,
      valid: !!slot && wake != null && wake >= SLEEP_PRED.minWake && wake <= SLEEP_PRED.maxWake,
      x: prev ? spClock(prev.en) : null, // Aufwachzeit des vorherigen Schlafs
      y: spClock(cur.s),                 // Startzeit dieses Schlafs
    };
  });
}

// Einträge eines Slots aus den 14 Tagen vor dem Zeitpunkt t (nur gültige Wachfenster)
const slotHistory = (events, slot, t) => {
  const from = spDaysBefore(t, SLEEP_PRED.histDays);
  return events.filter(e => e.slot === slot && e.valid && e.s < t && e.s >= from);
};

// Startzeit (Minuten, ggf. über 24 Std) aus der Aufwachzeit x0 vorhersagen:
// lineare Regression Start ~ Aufwachzeit, Steigung auf 0 bis 1 begrenzt; bei < 3 verschiedenen Aufwachzeiten der Median
function predictSlot(samples, x0) {
  const xs = samples.map(s => s.x), ys = samples.map(s => s.y);
  if (new Set(xs).size < SLEEP_PRED.minDistinct) return spMedian(ys);
  const mx = spMean(xs), my = spMean(ys);
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  const slope = Math.min(1, Math.max(0, sxy / sxx));
  return my + slope * (x0 - mx);
}

// Backtest: jeden zählenden Schlaf der 28 Tage bis einschließlich Stichtag vorhersagen, nur mit Daten von vor
// seinem Beginn. Fehler = Abstand vorhergesagt/tatsächlich in Minuten.
function sleepBacktest(stichtag) {
  const events = sleepEvents(), from = spDaysBefore(stichtag, SLEEP_PRED.backtestDays);
  const errors = [], bySlot = {};
  for (const target of events) {
    if (!target.valid || target.s < from || target.s > stichtag) continue;
    const hist = slotHistory(events, target.slot, target.s);
    if (hist.length < SLEEP_PRED.minPoints) continue;
    const err = Math.abs(predictSlot(hist, target.x) - target.y);
    errors.push(err);
    (bySlot[target.slot] ||= []).push(err);
  }
  return {
    n: errors.length,
    medianErr: spMedian(errors),
    within30: errors.length ? errors.filter(e => e <= 30).length / errors.length : null,
    bySlot,
  };
}

// Vorhersage für jetzt. Ergebnis: { state: 'ok', slot, at (ms), spread (Min) } oder ein Zustand mit Hinweis.
function predictNextSleep(now = Date.now()) {
  if (runningSleep()) return { state: 'sleeping' };
  const events = sleepEvents().filter(e => e.s < now);
  const last = events[events.length - 1];
  if (!last) return { state: 'nodata' };
  if ((now - last.en) / 60000 > SLEEP_PRED.maxWake) return { state: 'stale' };
  // Aus einem Nachtschlaf zwischen 18:00 und 04:00 aufgewacht = nächtliches Aufwachen: kein Tages-Slot vorhersagen
  if (last.night && spClock(last.en) >= 18 * 60) return { state: 'night' };

  // Nächster Slot: Nickerchen n+1, wenn es an mindestens der Hälfte der Tage (mit Schlafdaten) der letzten 14 Tage vorkam
  const next = 'nap' + (last.napsSince + 1), from = spDaysBefore(now, SLEEP_PRED.histDays);
  const recent = events.filter(e => e.s >= from);
  const days = new Set(recent.map(e => spDay(e.s)));
  const napDays = new Set(recent.filter(e => e.slot === next).map(e => spDay(e.s)));
  const slot = days.size && napDays.size >= days.size / 2 ? next : 'night';

  const hist = slotHistory(events, slot, now);
  if (hist.length < SLEEP_PRED.minPoints) return { state: 'few', slot, points: hist.length };
  // Anzeige: frühestens 20 Min nach dem Aufwachen (die Regression kann bei sehr späten Nickerchen davor landen)
  const startMin = Math.max(Math.round(predictSlot(hist, spClock(last.en))), spClock(last.en) + SLEEP_PRED.minWake);
  const at = new Date(spDay(last.en) + 'T00:00');
  at.setMinutes(startMin); // läuft korrekt über Mitternacht und Zeitumstellung
  const bt = sleepBacktest(now);
  return { state: 'ok', slot, at: at.getTime(), spread: bt.n ? Math.round(bt.medianErr) : null };
}

// Anzeigename eines Slots
const slotName = slot => (slot === 'night' ? 'Zubettgehen' : `${slot.slice(3)}. Nickerchen`);
