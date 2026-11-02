// Beikost mit Gerichten (Goal 13): Im Beikost-Fenster stehen die bisher gegebenen Gerichte zur Auswahl,
// mehrere gleichzeitig. Gespeichert wird wie bisher ein Beikost-Eintrag mit Menge; die Gerichte stehen
// durch ", " getrennt in `note` (so laufen Export, Import und Sync unverändert, alte Notizen werden zu Vorschlägen).

const SOLID_AMOUNTS = [100, 150, 190, 250];
// Gerichte eines Eintrags; "+" gilt auch als Trenner (so stehen mehrere Sachen in den alten Happy-Baby-Notizen)
const splitDishes = text => (text || '').split(/[,+]/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s && s.length <= 60);
const dishesOf = e => splitDishes(e.note);

// Alle bisherigen Gerichte: häufigste der letzten 30 Tage zuerst, dann zuletzt gegebene
function dishStats() {
  const since = toLocal(new Date(Date.now() - 30 * 864e5)), map = new Map();
  for (const e of entries) { // neueste zuerst -> die neueste Schreibweise gewinnt
    if (e.type !== 'feeding' || e.title !== 'Beikost') continue;
    for (const name of dishesOf(e)) {
      const key = name.toLowerCase();
      const d = map.get(key) || { name, last: e.start, recent: 0, total: 0 };
      d.total++;
      if (e.start >= since) d.recent++;
      map.set(key, d);
    }
  }
  return [...map.values()].sort((a, b) => b.recent - a.recent || b.last.localeCompare(a.last));
}

function solidSheet() {
  const all = dishStats(), selected = [];
  openQuick('Beikost', body => {
    body.innerHTML = `<p class="sheet-label">Was gab es? <small>mehrere möglich</small></p>
      <div class="chips" id="dishChips"></div>
      <div class="custom"><input id="dishInput" placeholder="Suchen oder neues Gericht" autocomplete="off" enterkeyhint="done">
        <button class="big small" id="dishAdd">+</button></div>
      <p class="sheet-label">Menge</p>
      <div class="grid">${SOLID_AMOUNTS.map(v => `<button class="big" data-v="${v}">${v} g</button>`).join('')}</div>
      <div class="custom"><input id="qAmount" inputmode="decimal" placeholder="Andere Menge (g)"><button class="big small ok" id="qOk">OK</button></div>
      <button class="link" id="dishNoAmount">Ohne Menge speichern</button>`;

    const isSel = name => selected.some(s => s.toLowerCase() === name.toLowerCase());
    // Ausgewählte zuerst, dann Vorschläge (gefiltert nach der Eingabe, ohne Filter die ersten 16)
    const drawChips = () => {
      const q = $('#dishInput').value.trim().toLowerCase();
      const rest = all.filter(d => !isSel(d.name) && (!q || d.name.toLowerCase().includes(q))).slice(0, q ? 30 : 16);
      $('#dishChips').innerHTML = selected.map(n => `<button class="chip on" data-dish="${esc(n)}">✓ ${esc(n)}</button>`).join('')
        + rest.map(d => `<button class="chip" data-dish="${esc(d.name)}">${esc(d.name)}</button>`).join('')
        + (!selected.length && !rest.length ? `<span class="who">${all.length ? 'Kein Treffer – mit + als neues Gericht übernehmen.' : 'Noch keine Gerichte – einfach eintippen und mit + übernehmen.'}</span>` : '');
    };
    $('#dishChips').onclick = ev => {
      const chip = ev.target.closest('[data-dish]');
      if (!chip) return;
      const name = chip.dataset.dish, i = selected.findIndex(s => s.toLowerCase() === name.toLowerCase());
      if (i >= 0) selected.splice(i, 1); else selected.push(name);
      drawChips();
    };
    // Eingetipptes übernehmen: "Mango + Keks" oder "Mango, Keks" ergibt zwei Gerichte; bekannte Schreibweise bevorzugen
    const addTyped = () => {
      for (const typed of splitDishes($('#dishInput').value)) {
        const known = all.find(d => d.name.toLowerCase() === typed.toLowerCase());
        if (!isSel(typed)) selected.push(known ? known.name : typed);
      }
      $('#dishInput').value = '';
      drawChips();
    };
    $('#dishInput').oninput = drawChips;
    $('#dishInput').onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); addTyped(); } };
    $('#dishAdd').onclick = addTyped;

    const done = amount => {
      if ($('#dishInput').value.trim()) addTyped(); // noch nicht übernommenes Gericht mitnehmen
      const note = selected.join(', ') || null;
      const label = `Beikost${amount ? ` ${amount} g` : ''}${note ? ` (${note})` : ''}`;
      quickSave(newEntry('feeding', 'Beikost', quickStart(), { amount: amount || null, unit: amount ? 'g' : null, note }), `${label} gespeichert`);
    };
    body.querySelectorAll('[data-v]').forEach(b => (b.onclick = () => done(Number(b.dataset.v))));
    $('#qOk').onclick = () => { const v = parseFloat($('#qAmount').value.replace(',', '.')); if (v > 0) done(v); };
    $('#dishNoAmount').onclick = () => done(null);
    drawChips();
  });
}
