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

  return {
    // Gelöschte Einträge bleiben als Markierung (deleted) erhalten, damit sich Löschungen später synchronisieren lassen.
    all: async () => (await run('readonly', s => s.getAll())).filter(e => !e.deleted),
    get: id => run('readonly', s => s.get(id)),
    put: entry => run('readwrite', s => s.put({ ...entry, updatedAt: Date.now() })),
  };
})();
