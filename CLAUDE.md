# Baby-Tracker (PWA)

## Projektziel
Eine Baby-Tracker-App (ähnlich „Happy Baby“), die zwei Eltern auf ihren Handys nutzen.
Die bisherigen Happy-Baby-Daten werden übernommen. Der Nutzer lernt dabei Claude Code kennen:
Wenn etwas Neues eingeführt wird (Git, Hosting, Datenbank …), wird es in 1–2 Sätzen erklärt.
Kommunikation und App-Oberfläche: Deutsch.

## Rahmen
- Installierbare Web-App (PWA), kein App-Store, läuft auf Android und iPhone
- Kostenlos betreibbar (Free Tier), wenig Wartung
- Nachts einhändig bedienbar: dunkles Design, große Buttons, Eintrag in max. 2 Taps
- Erfassen funktioniert offline
- Nur die beiden Eltern sehen die Daten
- So einfacher Stack wie möglich; der Code soll nachvollziehbar bleiben
- Immer nur an einem Goal arbeiten. Ein Goal ist fertig, wenn alle Kriterien erfüllt sind
  **und** der Nutzer sie auf dem Handy geprüft hat. Am Ende jedes Arbeitsschritts sagen, was wie zu testen ist.

## Altdaten (happy-baby-import.csv)
- **Privat:** Die Datei darf nie ins Git-Repository (steht in `.gitignore`) und nie öffentlich ins Netz.
  Aktueller Ort: `C:\Users\chris\Downloads\happy-baby-import.csv` (wird erst für Goal 3 gebraucht).
- 5.539 Einträge, UTF-8 mit BOM, Komma-getrennt, Felder ggf. in Anführungszeichen.
- Spalten: `id, start, ende, dauer_min, typ, titel, menge, einheit, bewertung, pausen, pause_min, notiz, details_roh, quelle`
- `id`: z. B. `hb-00001` – eindeutig, Grundlage für den Dubletten-Abgleich
- `typ`: feeding, sleep, diaper, custom, memory, weight, height
- `start`/`ende`: Ortszeit Europe/Berlin ohne Offset, z. B. `2026-11-01T03:37`; `ende` kann am Folgetag liegen
- `dauer_min`: Netto-Dauer ohne Pausen, über Zeitumstellungen korrekt – **nicht** aus ende − start neu berechnen
- Wachfenster sind nicht enthalten; die App berechnet sie aus den Schlafeinträgen
- Beobachtete Werte (Analyse 01.11.2026):
  - feeding: titel `Flasche` (ml), `Beikost` (g); menge teils leer
  - diaper: titel `Pipi`, `Kacka`, `Beides`, `Windel`, `Trocken`
  - sleep: titel `Nickerchen`, `Nachtschlaf`; `bewertung` ∈ {Super, Okay, Nicht gut}; `pausen` (Anzahl), `pause_min`
  - custom: freier titel (Baden, Zähne putzen, Medikamente, Fieber …), teils leer
  - memory: Meilenstein-Titel, notiz kann Platzhalter `{babyName}` enthalten; ende kann Monate nach start liegen
  - weight: kg, height: cm
  - `details_roh`: Originaltext aus Happy Baby (z. B. „3 Pause(n) · 20m wach“), `quelle`: `happy-baby`

## Datenmodell (ein Eintrag = ein Objekt, alle Arten in einer Sammlung)
| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | string | Neue Einträge: UUID; importierte: CSV-`id` (`hb-…`) |
| `type` | string | feeding, sleep, diaper, custom, memory, weight, height |
| `title` | string | Unterart/Bezeichnung (Flasche, Pipi, Nachtschlaf, freier Text …) |
| `start` | string | Ortszeit `YYYY-MM-DDTHH:mm` (wie CSV) |
| `end` | string\|null | Ortszeit; `null` = läuft noch (laufender Schlaf) |
| `durationMin` | number\|null | Netto-Dauer; bei Import aus CSV übernommen, sonst berechnet |
| `amount` | number\|null | Menge |
| `unit` | string\|null | ml, g, kg, cm |
| `rating` | string\|null | Super / Okay / Nicht gut |
| `pauses` | number\|null | Anzahl Pausen |
| `pauseMin` | number\|null | Pausen-Minuten |
| `note` | string\|null | Notiz |
| `detailsRaw` | string\|null | Originaltext aus Happy Baby |
| `source` | string | `app` oder `happy-baby` |
| `createdBy` | string\|null | ab Goal 2: wer den Eintrag gemacht hat |
| `createdAt` / `updatedAt` | number | Zeitstempel (ms), für Sync/Konflikte |
| `deleted` | boolean | Löschen als Markierung („Tombstone“), damit Löschungen sich ab Goal 2 synchronisieren |

## Entscheidungen
- Hosting: GitHub Pages (Annahme aus „GitHub- und Google-Konto vorhanden“; Nutzer kann widersprechen)
- Datenspeicher/Sync ab Goal 2: Firebase (Firestore + Auth). Goal 1 lokal in IndexedDB (`db.js`).
- Stack: reines HTML/CSS/JS ohne Build-Schritt (`index.html`, `style.css`, `app.js`, `db.js`, `sw.js`). Kein Node nötig.
- Baby heißt „Bri“ (Ersatz für `{babyName}`); die App heißt „happyBri“. GitHub-Repo: https://github.com/LuedaChris/happyBri (öffentlich, Pages-URL: https://luedachris.github.io/happyBri/). Beide Handys: Android (Samsung).
- Füttern: Flasche 120/150/180 ml, Beikost 100/150/190/250 g, jeweils plus freie Mengeneingabe. Kein Stillen.
- Wickeln: Pipi / Kacka / Beides. Kein „Trocken“-Button.
- Lokal testen: `python -m http.server 8080` im Projektordner (`.claude/launch.json`, Name `bri-dev`).
- Bei Änderungen an App-Dateien `CACHE` in `sw.js` hochzählen, sonst zeigt die installierte App die alte Version.
- Zeiten werden als Ortszeit-Strings gespeichert wie in der CSV (keine Umrechnung nötig, Import/Export 1:1).

## Goals

### Goal 1 – Erfassen auf einem Handy (lokal gespeichert)
- [x] App liegt auf dem Startbildschirm und öffnet ohne Browserleiste
- [x] Füttern und Wickeln in max. 2 Taps erfasst
- [x] Schlaf starten/stoppen, laufender Schlaf mit Dauer sichtbar
- [x] Einträge mit Uhrzeit nachtragen, bearbeiten, löschen
- [x] Einträge überleben einen App-Neustart; Erfassen klappt im Flugmodus
- [x] Datenmodell kann alle Arten aus der CSV speichern
(Goal 1 abgeschlossen am 01.11.2026, auf dem Samsung vom Nutzer geprüft.)

### Goal 2 – Sync zwischen beiden Handys
- [ ] Login für beide; jeder Eintrag zeigt, wer ihn gemacht hat
- [ ] Eintrag auf Handy A nach spätestens 10 Sek. auf Handy B sichtbar, ohne Neuladen
- [ ] Offline-Einträge werden nachgereicht; gleichzeitige Einträge gehen nicht verloren
- [ ] Ohne Login keine Daten sichtbar, auch nicht mit dem Link
- [ ] Einträge aus Goal 1 bleiben erhalten

### Goal 3 – Happy-Baby-Daten importieren
- [ ] Import über eine Dateiauswahl in der App
- [ ] Danach 5.539 Einträge: feeding 2.247, sleep 1.606, diaper 1.446, custom 171, memory 34, weight 29, height 6
- [ ] Zweiter Import erzeugt keine Dubletten (Abgleich über id)
- [ ] Stichprobe: Nachtschlaf 31.10.2026 20:00 bis 01.11.2026 03:24 korrekt

### Goal 4 – Übersicht
- [ ] Startbildschirm zeigt ohne Scrollen: letzte Fütterung, letzter Wickel („vor X Std Y Min“), Schlafstatus
- [ ] Zeitstrahl der letzten 24 Stunden
- [ ] Tagessummen: Fütterungen, Wickel, Schlaf gesamt

### Goal 5 (optional) – Export
- [ ] CSV-Export im selben Format wie die Importdatei, plus „eingetragen von“; Zeitraum wählbar
- [ ] Öffnet sich in Google Sheets mit korrekten Umlauten und Uhrzeiten

## Aktueller Stand
- Goal 1: fertig und auf dem Handy abgenommen. Live unter https://luedachris.github.io/happyBri/ (GitHub Pages, Branch main).
- Nächstes: Goal 2 (Sync mit Firebase). Vorher klären: Firebase-Projekt anlegen, Login-Methode (Google), die zwei erlaubten Konten.
