// Roter Popo & Ernährung (Goal 14): Für jede Stuhlwindel mit Popo-Status wird geschaut, welche Beikost-Zutaten im
// Zeitfenster davor gegessen wurden. Je Zutat: Anteil roter Popos "danach" gegen "sonst". Das zeigt Auffälligkeiten,
// keinen Beweis – was Bri oft isst, taucht zwangsläufig oft auf. Gerechnet wird nur aus `entries`.

let popoWindow = 24; // Stunden vor dem Stuhl (12 / 24 / 48 wählbar)

// Popo-Status eines Wickel-Eintrags: 'ok' | 'leicht rot' | 'wund' | null (nicht erfasst, z. B. alte Daten)
const popoState = e => {
  const r = e.rating || '';
  return r.includes('wund') ? 'wund' : r.includes('leicht rot') ? 'leicht rot' : r.includes('unauffällig') ? 'ok' : null;
};
const isThin = e => (e.rating || '').includes('dünn');

// Zutaten = Wörter aus den Gerichten, ohne Füllwörter und Marken, Plural grob angeglichen (Bananen -> Banane)
const POPO_STOP = new Set(['mit', 'und', 'oder', 'dazu', 'danach', 'dann', 'etwas', 'bisschen', 'wenig', 'viel', 'ein', 'eine', 'einem',
  'einen', 'ohne', 'von', 'vom', 'aus', 'im', 'am', 'an', 'auf', 'zum', 'zur', 'der', 'die', 'das', 'den', 'dem', 'des', 'plus', 'brei',
  'abendbrei', 'hipp', 'bebivita', 'bebitia', 'alete', 'milupa', 'holle', 'babylove', 'nestle', 'nestlé', 'gläschen', 'glas', 'portion',
  'stück', 'stk', 'blw', 'rest', 'reste', 'selbstgemacht', 'gekocht', 'frisch', 'klein', 'kleine', 'groß', 'große', 'halb', 'halbe',
  'mehr', 'noch', 'auch', 'nur', 'frucht', 'gemüse']);
const NO_STEM = new Set(['weizen', 'roggen', 'kuchen', 'braten', 'essen', 'fladen']);
const stem = w => (w === 'äpfel' ? 'apfel' : NO_STEM.has(w) || w.endsWith('chen') ? w : /(en|ln|rn)$/.test(w) && w.length >= 5 ? w.slice(0, -1) : w);
const ingredientsOf = dish => [...new Set(dish.toLowerCase().split(/[^a-zäöüß]+/)
  .filter(w => w.length >= 3 && !POPO_STOP.has(w)).map(stem))];
const capital = w => w.charAt(0).toUpperCase() + w.slice(1);

function popoAnalysis(windowH = popoWindow) {
  const stools = entries.filter(e => e.type === 'diaper' && (e.title === 'Kacka' || e.title === 'Beides') && popoState(e)).reverse();
  const solids = entries.filter(e => e.type === 'feeding' && e.title === 'Beikost' && e.note).reverse();
  const events = stools.map(s => {
    const t = ts(s.start), from = t - windowH * 3600e3;
    const foods = solids.filter(e => { const x = ts(e.start); return x >= from && x < t; });
    return { s, red: popoState(s) !== 'ok', thin: isThin(s), foods, ings: new Set(foods.flatMap(e => dishesOf(e).flatMap(ingredientsOf))) };
  });
  const rate = list => ({ n: list.length, red: list.filter(e => e.red).length });
  const rows = [...new Set(events.flatMap(e => [...e.ings]))].map(ing => {
    const exp = rate(events.filter(e => e.ings.has(ing))), not = rate(events.filter(e => !e.ings.has(ing)));
    return { ing, exp, not, diff: exp.red / exp.n - (not.n ? not.red / not.n : 0) };
  }).filter(r => r.exp.n >= 3).sort((a, b) => b.diff - a.diff || b.exp.n - a.exp.n);
  // ▲ nur für Zutaten, die auch ohne die stärkeren ▲-Zutaten auffällig bleiben – einfacher Schutz gegen
  // "wurde am selben Tag wie Kiwi gegessen". Sonst wird die stärkere Zutat genannt, mit der sie meist zusammen vorkam.
  const flagged = [];
  for (const r of rows) {
    const pool = events.filter(e => !flagged.some(f => e.ings.has(f)));
    const exp = rate(pool.filter(e => e.ings.has(r.ing))), not = rate(pool.filter(e => !e.ings.has(r.ing)));
    r.flag = exp.red >= 2 && exp.red / exp.n - (not.n ? not.red / not.n : 0) >= 0.2;
    if (r.flag) flagged.push(r.ing);
    else if (r.exp.red >= 2 && r.diff >= 0.2) r.withOther = flagged.find(f => events.some(e => e.red && e.ings.has(f) && e.ings.has(r.ing)));
  }
  return { events, all: rate(events), rows, thin: rate(events.filter(e => e.thin)), notThin: rate(events.filter(e => !e.thin)), since: stools.length ? stools[0].start : null };
}

const pctText = r => (r.n ? `${r.red} von ${r.n} (${Math.round((r.red / r.n) * 100)} %)` : '–');

function popoCard() {
  const a = popoAnalysis();
  const intro = '<p>Beim Wickeln „leicht rot“ oder „wund“ (und bei Bedarf „dünner Stuhl“) antippen. Die App vergleicht dann, was Bri vor roten und vor unauffälligen Stuhlwindeln gegessen hat.</p>';
  if (!a.all.n) return card('Popo & Ernährung', `${intro}<p class="who">Noch keine Stuhlwindel mit Popo-Status erfasst.</p>`);
  const seg = `<div class="seg">${[12, 24, 48].map(h => `<button data-popowin="${h}" class="${h === popoWindow ? 'on' : ''}">${h} Std vorher</button>`).join('')}</div>`;
  let body = `<p>Seit ${fmtDay(a.since)}: ${a.all.n} Stuhlwindeln erfasst, davon <b>${pctText(a.all)}</b> rot.</p>${seg}`;
  if (a.all.n < 10 || a.all.red < 3) body += '<p class="who">Noch wenig Daten – die Auswertung wird mit jeder erfassten Windel genauer.</p>';
  body += a.rows.length
    ? `<table class="rtable"><tr><th>Zutat</th><th>danach rot</th><th>sonst rot</th></tr>${a.rows.slice(0, 10).map(r =>
      `<tr><td>${r.flag ? '▲ ' : ''}${esc(capital(r.ing))}${r.withOther ? `<br><small class="who">meist zusammen mit ${esc(capital(r.withOther))}</small>` : ''}</td><td>${pctText(r.exp)}</td><td>${pctText(r.not)}</td></tr>`).join('')}</table>`
    : '<p class="who">Noch keine Zutat, die mindestens 3-mal vor einer erfassten Stuhlwindel gegessen wurde.</p>';
  if (a.thin.n) body += `<p>Dünner Stuhl: rot ${pctText(a.thin)} · sonst ${pctText(a.notThin)}</p>`;
  body += '<button class="big small" data-popodiary>Popo-Tagebuch</button>';
  return card('Popo & Ernährung', body,
    '▲ = deutlich häufiger rot danach (mind. 2-mal, +20 Prozentpunkte), auch ohne die ▲-Zutaten weiter oben. Auffälligkeit, kein Beweis: Was Bri oft isst, taucht zwangsläufig oft auf – deshalb beide Spalten vergleichen. Bleibt der Popo länger wund, zum Kinderarzt.');
}

// Jeder rote Popo mit den Gerichten im Zeitfenster davor (neueste zuerst)
function openPopoDiary() {
  const red = popoAnalysis().events.filter(e => e.red).reverse();
  showInfo('Popo-Tagebuch', `<p class="who">Gerichte in den ${popoWindow} Std vor dem Stuhl.</p>` + (red.length ? red.map(e =>
    `<div class="handover popodiary"><p><b>${fmtDay(e.s.start)} ${fmtTime(e.s.start)}</b> · ${esc(e.s.rating)}</p>${e.foods.length
      ? e.foods.slice().reverse().map(f => `<p>🥣 ${fmtTime(f.start)} ${esc(f.note)}${f.amount ? ` (${fmtNum(f.amount)} g)` : ''}</p>`).join('')
      : '<p>keine Beikost mit Gericht im Zeitfenster</p>'}</div>`).join('') : '<p>Noch kein roter Popo erfasst.</p>'));
}
