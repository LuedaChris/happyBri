// Login und Sync mit Firebase. Die Oberfläche arbeitet weiter nur mit der lokalen Datenbank (db.js);
// dieses Modul schickt lokale Änderungen in die Cloud und holt Änderungen vom anderen Handy.
// Der Config-Block ist kein Geheimnis: Geschützt sind die Daten durch Login + Firestore-Regeln.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, getDoc, query, where, onSnapshot, writeBatch }
  from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyCtMtmZFQVE79GhxpdbehUi4TkhRAToxK8',
  authDomain: 'happybri-99e50.firebaseapp.com',
  projectId: 'happybri-99e50',
  storageBucket: 'happybri-99e50.firebasestorage.app',
  messagingSenderId: '145035724890',
  appId: '1:145035724890:web:ad587ef3b0efee3e1b7063',
});
const auth = getAuth(app);
// Mit lokalem Cache: Schreibvorgänge im Flugmodus werden zwischengespeichert und später automatisch nachgereicht.
const fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const entries = collection(fs, 'entries');
const $ = sel => document.querySelector(sel);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } },
};

window.Sync = { ready: true };
let stopListening = null;

// Jede lokale Änderung geht zusätzlich an Firestore (nicht abwarten: offline wartet sie in der Warteschlange).
DB.onLocalChange = entry => {
  if (auth.currentUser) setDoc(doc(entries, entry.id), entry).catch(err => console.error('Sync-Fehler', err));
};

// Viele Einträge auf einmal hochladen (z. B. Import): in Paketen zu 400, Firestore erlaubt höchstens 500 je Paket.
window.Sync.pushMany = async (list, onProgress) => {
  if (!auth.currentUser) throw new Error('nicht angemeldet');
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(fs);
    list.slice(i, i + 400).forEach(e => batch.set(doc(entries, e.id), e));
    await batch.commit();
    onProgress(Math.min(i + 400, list.length));
  }
};

const show = which => {
  $('#gate').hidden = which === null;
  for (const id of ['gateLoading', 'loginForm', 'nameBox']) $('#' + id).hidden = id !== which;
};

const LOGIN_ERRORS = {
  'auth/invalid-credential': 'E-Mail oder Passwort stimmt nicht.',
  'auth/invalid-email': 'Das ist keine gültige E-Mail-Adresse.',
  'auth/too-many-requests': 'Zu viele Versuche. Bitte kurz warten.',
  'auth/network-request-failed': 'Keine Verbindung. Zum Anmelden brauchst du Internet.',
};
$('#loginForm').onsubmit = async ev => {
  ev.preventDefault();
  $('#loginMsg').textContent = '';
  try {
    await signInWithEmailAndPassword(auth, $('#loginEmail').value.trim(), $('#loginPass').value);
  } catch (err) {
    $('#loginMsg').textContent = LOGIN_ERRORS[err.code] || 'Anmeldung fehlgeschlagen.';
  }
};
$('#logoutBtn').onclick = () => signOut(auth);

// Name für "eingetragen von": einmal pro Konto gewählt, in Firestore (users/<uid>) und lokal gemerkt.
async function ensureName(user) {
  let name = store.get('name:' + user.uid);
  if (!name) {
    try {
      const snap = await getDoc(doc(fs, 'users', user.uid));
      name = snap.exists() ? snap.data().name : null;
    } catch { return null; } // offline ohne gemerkten Namen: später nochmal versuchen
  }
  if (!name) {
    name = await new Promise(resolve => {
      show('nameBox');
      document.querySelectorAll('[data-name]').forEach(b => (b.onclick = () => resolve(b.dataset.name)));
    });
    await setDoc(doc(fs, 'users', user.uid), { name });
  }
  store.set('name:' + user.uid, name);
  return name;
}

async function startSync(user, name) {
  // Einmalig: Einträge, die vor dem Login entstanden sind, bekommen den Namen und gehen in die Cloud.
  if (!store.get('pushed:' + user.uid)) {
    for (const e of await DB.allRaw()) {
      const mine = e.source === 'app' && !e.createdBy && name ? { ...e, createdBy: name } : e;
      if (mine !== e) await DB.putRaw(mine);
      setDoc(doc(entries, mine.id), mine).catch(err => console.error('Sync-Fehler', err));
    }
    store.set('pushed:' + user.uid, '1');
  }

  // Nur Einträge holen, die seit dem letzten Sync geändert wurden (10 Min. Puffer wegen unterschiedlicher Handy-Uhren).
  const since = Number(store.get('lastSync') || 0) - 10 * 60 * 1000;
  stopListening = onSnapshot(query(entries, where('updatedAt', '>', Math.max(0, since))), async snap => {
    let changed = false, newest = Number(store.get('lastSync') || 0);
    for (const ch of snap.docChanges()) {
      if (ch.type === 'removed') continue;
      const remote = ch.doc.data();
      newest = Math.max(newest, remote.updatedAt || 0);
      const local = await DB.get(remote.id);
      if (!local || remote.updatedAt > local.updatedAt) { await DB.putRaw(remote); changed = true; }
    }
    store.set('lastSync', String(newest));
    if (changed && window.reloadEntries) window.reloadEntries();
  }, err => console.error('Sync-Fehler', err));
}

onAuthStateChanged(auth, async user => {
  if (stopListening) { stopListening(); stopListening = null; }
  if (!user) { window.currentUserName = null; show('loginForm'); return; }
  const name = await ensureName(user);
  window.currentUserName = name;
  if (name) store.set('userName', name);
  show(null);
  $('#who').textContent = name ? `Angemeldet als ${name}` : 'Angemeldet';
  await startSync(user, name);
});
