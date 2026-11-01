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
- Goal 2 Login: Firebase Auth mit E-Mail + Passwort, Konten legen die Eltern selbst in der Firebase-Konsole an (kein Registrierungsformular in der App). Namen für „eingetragen von“: Chris und Nadja (werden beim ersten Login in der App abgefragt und in Firestore gespeichert).
- **Die E-Mail-Adressen der Eltern stehen nicht im Repo** (öffentlich!), nur in den Firestore-Regeln in der Firebase-Konsole.
- Goal 2 Sync-Konzept: IndexedDB bleibt die Quelle für die Oberfläche (offline-fähig). Je Eintrag ein Firestore-Dokument mit gleicher `id`. Schreiben: lokal speichern, dann nach Firestore (Firestore-Offline-Warteschlange reicht Offline-Einträge nach). Lesen: Listener holt nur Dokumente mit `updatedAt` neuer als der letzte Sync (spart Lesezugriffe im Free Tier). Bei Konflikt auf demselben Eintrag gewinnt das höhere `updatedAt`; neue Einträge kollidieren nie, weil jede `id` eine UUID ist.
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
- [x] Login für beide; jeder Eintrag zeigt, wer ihn gemacht hat
- [x] Eintrag auf Handy A nach spätestens 10 Sek. auf Handy B sichtbar, ohne Neuladen
- [x] Offline-Einträge werden nachgereicht; gleichzeitige Einträge gehen nicht verloren
- [x] Ohne Login keine Daten sichtbar, auch nicht mit dem Link
- [x] Einträge aus Goal 1 bleiben erhalten
(Goal 2 abgeschlossen am 01.11.2026, auf beiden Samsung-Handys vom Nutzer geprüft.)

### Goal 3 – Happy-Baby-Daten importieren
- [x] Import über eine Dateiauswahl in der App
- [x] Danach 5.539 Einträge: feeding 2.247, sleep 1.606, diaper 1.446, custom 171, memory 34, weight 29, height 6
- [x] Zweiter Import erzeugt keine Dubletten (Abgleich über id)
- [x] Stichprobe: Nachtschlaf 31.10.2026 20:00 bis 01.11.2026 03:24 korrekt
(Goal 3 abgeschlossen am 01.11.2026, vom Nutzer auf dem Handy geprüft.)

### Goal 4 – Übersicht
- [x] Startbildschirm zeigt ohne Scrollen: letzte Fütterung, letzter Wickel („vor X Std Y Min“), Schlafstatus
- [x] Zeitstrahl der letzten 24 Stunden
- [x] Tagessummen: Fütterungen, Wickel, Schlaf gesamt
(Goal 4 abgeschlossen am 01.11.2026, vom Nutzer auf dem Handy geprüft.)

### Goal 5 (optional) – Export
- [x] CSV-Export im selben Format wie die Importdatei, plus „eingetragen von“; Zeitraum wählbar
- [x] Öffnet sich in Google Sheets mit korrekten Umlauten und Uhrzeiten (mit Einschränkung: in der Sheets-App auf dem Handy zeigt die CSV vereinzelt `Â·` statt `·` – reine Darstellung, die Datei ist korrekt UTF-8; vom Nutzer akzeptiert. Uhrzeiten stimmen.)
(Goal 5 abgeschlossen am 01.11.2026. Das .xlsx-Format im Export ist am Handy nicht abschließend geprüft.)

### Goal 6 – Statistik (nach Abnahme der Goals 1–5 vom Nutzer gewünscht, orientiert an den „Trends“ von Happy Baby)
- [ ] Zweiter Reiter „Statistik“ (Navigation unten: Start / Statistik); Umschalter Täglich (letzte 7 Tage) / Wöchentlich (8 Wochen, Tagesdurchschnitt)
- [ ] Schlafplan (je Tag 00–24 Uhr, Schlaf/Wach), Gesamtschlaf (Nickerchen/Nachtschlaf), Wachfenster und Nickerchen, Flasche (ml), Beikost (g), jeweils mit Durchschnitt
- [ ] Gewicht und Größe als Kurve mit WHO-Perzentilen (3/15/50/85/97) für Mädchen, eigene Messungen als Punkte, Perzentil der letzten Messung und Median im Alter
- [ ] Zahlen stimmen mit Happy Baby überein (Stichprobe: Ø Gesamtschlaf ca. 13 Std 17 Min, Gewicht 8,58 kg, Größe 76 cm)
- [ ] Geburtsdatum liegt nicht im öffentlichen Code, sondern in Firestore (`settings/profile`) und lokal; wird beim ersten Öffnen der Statistik eingegeben

## Aktueller Stand
- Goal 6: Code (`stats.js`, `growth.js`) ist geschrieben, am PC mit den echten Daten geprüft (7 Karten, Tages- und Wochenansicht, Perzentile: Gewicht 8,58 kg mit 11,9 Monaten = P37, Größe 76 cm mit 10,9 Monaten = P91; WHO-Median passt zu den „Altersdurchschnitt“-Werten von Happy Baby). Offen: Test auf dem Handy, Geburtsdatum eingeben.
- Goal-6-Entscheidungen: Bri ist ein Mädchen → WHO-Tabellen „girls“ (weight-for-age 0–5 J., length-for-age 0–2 J., als LMS-Werte 0–24 Monate in `growth.js`; Quelle who.int, am 01.11.2026 geladen). Durchschnitte ohne den laufenden Tag/die laufende Woche. „Altersdurchschnitt“ für Schlaf/Füttern wird bewusst nicht angezeigt (keine verlässliche deutsche Referenz). Schlaf über Mitternacht wird mit der Netto-Dauer anteilig auf die Tage verteilt. Wachfenster = Lücke zwischen Ende eines Schlafs und Beginn des nächsten (5 Min bis 12 Std).
- Datenschutz-Hinweis: Das Repository ist öffentlich und enthält den Namen „Bri“ und (durch die WHO-Tabelle) das Geschlecht; Geburtsdatum, Einträge und Mailadressen sind nicht im Code.
- Goal 1: fertig und auf dem Handy abgenommen. Live unter https://luedachris.github.io/happyBri/ (GitHub Pages, Branch main).
- Goal 2: fertig und auf beiden Handys abgenommen (`sync.js`, Firebase-Projekt `happybri-99e50`, Firebase-SDK 11.10.0 per CDN, vom Service Worker gecacht).
- Goal 3: Code (`import.js`) ist geschrieben und hochgeladen. Am PC mit der echten CSV geprüft: 5.539 Einträge, Zahlen je Art stimmen, zweiter Import 0 neu, Stichprobe `hb-05528` (31.10. 20:00 → 01.11. 03:24, 443 Min) korrekt. Offen: echter Import auf einem Handy durch den Nutzer inkl. Cloud-Upload und Anzeige auf dem zweiten Handy.
- Goal 4: fertig und auf dem Handy abgenommen (`overview.js`).
- Alle fünf Goals sind abgenommen (01.11.2026). Neue Arbeit nur nach Absprache; jede Änderung an App-Dateien braucht eine höhere `CACHE`-Nummer in `sw.js`.
- Goal 5: Code (`export.js`) ist geschrieben und hochgeladen. Am PC geprüft: Rundlauf Export → Import-Parser ohne Abweichung (inkl. Komma, Anführungszeichen, Zeilenumbruch, Umlaute); CSV hat BOM, gleiche Spalten wie der Import plus `eingetragen_von`. Offen: Download auf dem Handy und Öffnen in Google Sheets durch den Nutzer.
- Goal 5, Befund vom Handy-Test (01.11.2026): CSV öffnet sich in der Google-Sheets-App mit kaputten Zeichen (`ï»¿id` für das BOM, `Â·` für „·“). Die Datei ist korrekt UTF-8; die App liest sie als Latin-1. Zeiten kamen als Datum+Uhrzeit korrekt an. Gegenmaßnahme: zusätzliches Format **.xlsx** im Export-Dialog (Standard), selbst geschriebenes ZIP ohne Bibliothek, echte Datums-/Zahlenzellen. Am PC geprüft (ZIP-Prüfsummen, XML, Werte); offen: Öffnen der .xlsx in Sheets auf dem Handy. Die CSV bleibt für Sicherung/Re-Import (am PC über Sheets „Datei → Importieren“ sollte sie korrekt sein).
- Export-Entscheidungen: Zeitraum filtert nach Start-Datum (beide Tage inklusive); gelöschte Einträge fehlen; sortiert nach Start aufsteigend; Zeiten bleiben im Format `2026-11-01T03:37` (wie im Import, damit die Datei wieder importierbar ist). Falls Google Sheets die Uhrzeiten oder Dezimalpunkte (z. B. 3.25 kg) falsch zeigt, ist das die erste Stelle zum Nachbessern.
- Übersicht-Entscheidungen: „Wach seit“ = Zeit seit Ende des letzten Schlafs (Wachfenster, nicht gespeichert). Tagessummen = heutiger Kalendertag ab 00:00; Schlaf über Mitternacht zählt nur mit dem Teil von heute; ganz heute liegende Schläge zählen mit der Netto-Dauer aus dem Eintrag. Zeitstrahl: 24 Std bis jetzt, Schlaf als Balken, Füttern/Wickeln als Punkte.
- Import-Entscheidungen: Platzhalter `{babyName}` in Notizen wird zu „Bri“; importierte Einträge haben kein „eingetragen von“; Abgleich nur über `id` (auch gelöschte zählen als vorhanden). Import schreibt ~5.500 Dokumente in die Cloud (Free Tier: 20.000 Schreibzugriffe/Tag) – nur auf **einem** Handy ausführen, das andere bekommt sie per Sync.
- Bekannte Grenze: Konflikte auf demselben Eintrag löst „zuletzt angekommen gewinnt“ (Firestore schreibt Offline-Änderungen blind); neue Einträge gehen nie verloren.
