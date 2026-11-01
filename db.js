// Lokale Datenbank im Browser (IndexedDB): bleibt auf dem Handy, auch ohne Internet.
// Alle Arten von Einträgen liegen in einer Sammlung "entries".
const DB = (() => {
  let opened;
  const open = () => opened ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('babytracker', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('entries', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  // Führt eine Operation in einer Transaktion aus und liefert deren Ergebnis.
  async function run(mode, op) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('entries', mode);
      const req = op(tx.objectStore('entries'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  const db = {
    // Gelöschte Einträge bleiben als Markierung (deleted) erhalten, damit sich Löschungen synchronisieren lassen.
    all: async () => (await db.allRaw()).filter(e => !e.deleted),
    allRaw: () => run('readonly', s => s.getAll()),
    get: id => run('readonly', s => s.get(id)),
    // Lokale Änderung: Zeitstempel setzen, speichern, dann an den Sync melden (sync.js setzt onLocalChange).
    put: async entry => {
      const stamped = { ...entry, updatedAt: Date.now() };
      await run('readwrite', s => s.put(stamped));
      if (db.onLocalChange) db.onLocalChange(stamped);
    },
    // Änderung aus der Cloud: unverändert speichern (Zeitstempel bleibt, nichts wird zurückgeschickt).
    putRaw: entry => run('readwrite', s => s.put(entry)),
    putMany: list => run('readwrite', s => { list.forEach(e => s.put(e)); }),
    onLocalChange: null,
  };
  return db;
})();
