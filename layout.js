// Eigene Anordnung (Goal 15): Reihenfolge und Sichtbarkeit von Startseite-Bereichen, Status-Zeilen,
// "Mehr"-Menü und Statistik-Karten. Gilt je Person: lokal unter "layout:<Name>" und in Firestore users/<uid> (sync.js).
// Gespeichert wird je Bereich { order: [ids], hidden: [ids] }; neue Elemente, die es beim Speichern noch nicht gab, kommen ans Ende.

const LAYOUT_SECTIONS = {
  home: { label: 'Start', items: [
    ['status', 'Status-Karte'], ['sleep', 'Schlaf-Knopf'], ['quick', 'Knöpfe Flasche / Beikost / Wickeln / Mehr'],
    ['today', 'Heute'], ['timeline', 'Letzte 24 Stunden'], ['list', 'Verlauf'],
  ] },
  status: { label: 'Status', items: [
    ['feed', '🍼 Letzte Fütterung'], ['diaper', '🧷 Letzter Wickel'], ['sleep', '😴 Schlaf'],
    ['predict', '🔮 Nächster Schlaf'], ['meds', '💊 Medikamente & Fieber (nur wenn erfasst)'],
  ] },
  more: { label: 'Mehr', items: [
    ['weight', '⚖️ Gewicht'], ['height', '📏 Größe'], ['custom', '📝 Sonstiges'], ['memory', '⭐ Meilenstein'],
    ['sleep', '😴 Schlaf nachtragen'], ['feeding', '🍼 Füttern nachtragen'], ['med', '💊 Medikament'],
    ['temp', '🌡️ Temperatur'], ['handover', '📋 Übergabe'], ['question', '❓ Frage für den Arzt'],
  ] },
  stats: { label: 'Statistik', items: [
    ['fever', 'Fieber & Medikamente (nur wenn erfasst)'], ['sleepplan', 'Schlafplan (nur täglich)'], ['sleeptotal', 'Gesamtschlaf'],
    ['wake', 'Wachfenster und Nickerchen'], ['report', 'Bericht für den Kinderarzt'], ['backtest', 'Schlafvorhersage prüfen'],
    ['bottle', 'Flasche'], ['solid', 'Beikost'], ['popo', 'Popo & Ernährung'], ['growth', 'Gewicht und Größe'],
  ] },
};

const layoutKey = () => 'layout:' + (window.currentUserName || localStorage.getItem('userName') || '');
function getLayout() {
  try { return JSON.parse(localStorage.getItem(layoutKey())) || {}; } catch { return {}; }
}
function setLayout(layout) {
  try { localStorage.setItem(layoutKey(), JSON.stringify(layout)); } catch { /* egal */ }
  if (window.Sync && Sync.saveLayout) Sync.saveLayout(layout);
  layoutChanged();
}

// Elemente eines Bereichs in der gewählten Reihenfolge: [{ id, label, hidden }]
function layoutOf(section) {
  const saved = getLayout()[section] || {}, all = LAYOUT_SECTIONS[section].items;
  const ids = all.map(([id]) => id);
  const order = (saved.order || []).filter(id => ids.includes(id));
  for (const id of ids) if (!order.includes(id)) order.push(id);
  const hidden = saved.hidden || [];
  return order.map(id => ({ id, label: all.find(([x]) => x === id)[1], hidden: hidden.includes(id) }));
}

// HTML-Teile ({ id: html }) in der gewählten Reihenfolge zusammensetzen, ausgeblendete weglassen
const arrange = (section, parts) => layoutOf(section).filter(x => !x.hidden).map(x => parts[x.id] || '').join('');

// Startseite: die Bereiche (<section data-block>) im DOM umstellen und ein-/ausblenden
function applyHomeLayout() {
  const box = $('#homeBlocks');
  for (const { id, hidden } of layoutOf('home')) {
    const el = box.querySelector(`[data-block="${id}"]`);
    el.hidden = hidden;
    box.appendChild(el);
  }
}

function layoutChanged() {
  applyHomeLayout();
  render(); // zeichnet Status-Zeilen und (falls offen) die Statistik neu
}
window.onLayout = layoutChanged; // sync.js ruft das nach dem Login bzw. wenn die Anordnung aus der Cloud kam

// ---------- Anordnen-Dialog: je Element "anzeigen" und ↑ ↓ ----------
function openLayoutEditor(section = 'home') {
  const draw = () => {
    const list = layoutOf(section);
    const seg = `<div class="seg">${Object.entries(LAYOUT_SECTIONS).map(([k, s]) => `<button data-lsec="${k}" class="${k === section ? 'on' : ''}">${s.label}</button>`).join('')}</div>`;
    const rows = list.map((x, i) => `<div class="lrow${x.hidden ? ' off' : ''}">
      <label><input type="checkbox" data-lshow="${x.id}"${x.hidden ? '' : ' checked'}>${esc(x.label)}</label>
      <button data-lmove="${x.id}" data-dir="-1" aria-label="nach oben"${i ? '' : ' disabled'}>↑</button>
      <button data-lmove="${x.id}" data-dir="1" aria-label="nach unten"${i < list.length - 1 ? '' : ' disabled'}>↓</button></div>`).join('');
    $('#layoutEd').innerHTML = `${seg}<p class="who">Haken = anzeigen. Mit ↑ ↓ die Reihenfolge ändern. Gilt nur für dich (${esc(window.currentUserName || 'dieses Konto')}).</p>
      ${rows}<button class="link" data-lreset>Standard wiederherstellen</button>`;
  };
  const update = change => {
    const layout = getLayout(), list = layoutOf(section);
    change(list);
    layout[section] = { order: list.map(x => x.id), hidden: list.filter(x => x.hidden).map(x => x.id) };
    setLayout(layout);
    draw();
  };
  showInfo('Anordnen', '<div id="layoutEd"></div>');
  const ed = $('#layoutEd');
  ed.onclick = ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.lsec) { section = b.dataset.lsec; draw(); }
    if (b.dataset.lmove) update(list => {
      const i = list.findIndex(x => x.id === b.dataset.lmove), j = i + Number(b.dataset.dir);
      [list[i], list[j]] = [list[j], list[i]];
    });
    if (b.dataset.lreset !== undefined) {
      const layout = getLayout();
      delete layout[section];
      setLayout(layout);
      draw();
    }
  };
  ed.onchange = ev => {
    const id = ev.target.dataset.lshow;
    if (id) update(list => { list.find(x => x.id === id).hidden = !ev.target.checked; });
  };
  draw();
}
applyHomeLayout(); // gespeicherte Anordnung sofort beim Laden anwenden

// "Anordnen"-Links (Startseite unten, Mehr-Menü, Statistik) öffnen den Dialog beim passenden Bereich
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-layout]');
  if (!b) return;
  if ($('#quick').open) $('#quick').close();
  openLayoutEditor(b.dataset.layout);
});
