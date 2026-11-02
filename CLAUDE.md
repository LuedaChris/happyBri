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
| `type` | string | feeding, sleep, diaper, custom, memory, weight, height; ab Goal 8 auch medication, temperature |
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
| `substance` | string\|null | ab Goal 8, nur bei `medication`: Wirkstoff (z. B. Ibuprofen); wird **nicht** exportiert |
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
- Lokal testen: `python .claude/devserver.py` (Port 8080, sendet `Cache-Control: no-store`, damit der Vorschau-Browser nie alte Dateien nutzt; `.claude/launch.json`, Name `bri-dev`). Vor Tests trotzdem Service Worker abmelden und CacheStorage leeren.
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

### Goal 7 – Schlafvorhersage (vom Nutzer am 01.11.2026 gestartet, während Goal 6 noch auf die Handy-Abnahme wartet)
Ziel: Die App sagt vorher, wann der nächste Schlaf beginnt (nächstes Nickerchen oder Zubettgehen), und zeigt das auf dem Startbildschirm. Gerechnet wird in der App selbst, ohne externen Dienst.
- [ ] Startbildschirm zeigt Art, Uhrzeit und Zeitspanne des nächsten Schlafs (Handy-Test tagsüber steht aus, nachts zeigt die App bewusst keine Vorhersage)
- [ ] Vorhersage aktualisiert sich, sobald ein Schlaf endet oder nachgetragen wird (Schlaf beenden: auf dem Handy ok; Nachtragen: Test steht aus)
- [ ] Unter 4 Datenpunkten erscheint ein Hinweis statt einer Zahl (am PC geprüft, auf dem Handy mit echten Daten kaum herbeizuführen)
- [x] Backtest ist in der App abrufbar
- [x] Prüfstein: Stichtag 01.11.2026 12:51, importierte Happy-Baby-Daten → 78 Vorhersagen, ca. 28 Min Median-Fehler, ca. 53 % innerhalb ±30 Min (am PC und auf dem Handy bestätigt: 78 / 28 Min / 53 %)
(Stand 01.11.2026 nachts: hochgeladen; App-Update kam laut Nutzer ohne Probleme an. Tests 2 und 4 macht der Nutzer am Folgetag.)

Algorithmus (Vorgabe des Nutzers, auf den Happy-Baby-Daten getestet):
1. Schlafeinträge nach Start sortieren. Wachfenster = Start eines Schlafs minus Ende des vorherigen.
2. Nur Wachfenster vor einem Nickerchen und vor dem Zubettgehen zählen (Zubettgehen = Nachtschlaf direkt nach einem Nickerchen). Nächtliches Aufwachen (Nachtschlaf nach Nachtschlaf) ignorieren. Nur Wachfenster zwischen 20 Min und 8 Std.
3. Slots: Nickerchen 1, 2, 3 … (gezählt ab dem Ende des letzten Nachtschlafs) und Nachtschlaf.
4. Pro Slot die Einträge der 14 Tage vor dem Vorhersagezeitpunkt (mindestens 4). Startzeit per linearer Regression aus der Aufwachzeit des vorherigen Schlafs, Steigung auf 0 bis 1 begrenzt. Uhrzeiten vor 04:00 zählen als +24 Std. Fallback bei weniger als 3 verschiedenen Aufwachzeiten: Median-Startzeit des Slots.
5. Nächster Slot: Nickerchen n+1, wenn es in den letzten 14 Tagen an mindestens der Hälfte der Tage vorkam, sonst Nachtschlaf.
6. Zeitspanne: Vorhersage ± Median-Fehler aus dem Backtest.
Backtest: Für jeden Schlaf der 28 Tage vor einem wählbaren Stichtag die Startzeit vorhersagen, nur mit Daten davor. Fehler = Abstand zwischen vorhergesagter und tatsächlicher Startzeit. Ausgabe: Anzahl, Median-Fehler, Anteil innerhalb ±30 Min.

Plan (Umsetzung):
- Neue Datei `predict.js`: Slots aus allen abgeschlossenen Schlafeinträgen bilden, Regression je Slot, `predictNextSleep()` für jetzt und `sleepBacktest(stichtag)`. Reines Rechnen auf `entries`, keine neuen Daten.
- Startbildschirm: vierte Zeile in der Status-Karte „Nächster Schlaf“ (Art, ca. Uhrzeit, Spanne). Aktualisierung automatisch, weil jede Änderung `render()` auslöst.
- Statistik: Karte „Schlafvorhersage prüfen“ mit Knopf; der Backtest läuft in einem Dialog mit wählbarem Stichtag (Standard: jetzt).
- Prüfung zuerst am PC mit den importierten Daten gegen den Prüfstein, erst dann Oberfläche.
Auslegungen (gegen den Prüfstein zu bestätigen):
- „Vorheriger Schlaf“ = der direkt davor liegende Schlafeintrag jeder Art (beim 1. Nickerchen also das Ende des letzten Nachtschlaf-Abschnitts am Morgen).
- Backtest (gegen den Prüfstein bestätigt): Zeitraum = 28 Tage bis **einschließlich** Stichtag (das Nickerchen um 12:51 zählt mit); „Daten davor“ = Slot-Einträge der 14 Tage vor dem **Beginn** des vorhergesagten Schlafs; es zählt der tatsächliche Slot des Schlafs. Ergebnis am PC: 78 Vorhersagen, Median-Fehler 28,0 Min, 52,6 % innerhalb ±30 Min (Nickerchen 1: 28, Nickerchen 2: 22, Nickerchen 3: 1, Zubettgehen: 27). Andere Auslegungen (Bezug Ende des vorherigen Schlafs, 14 Tage als feste 336 Std) weichen um weniger als 1 Min ab.
- „Hälfte der Tage“ (Schritt 5) = Tage mit Schlafeinträgen im 14-Tage-Fenster; Tag = Kalendertag mit Tageswechsel um 04:00.
- Während Bri schläft, zeigt der Startbildschirm keine Vorhersage („nach dem Aufwachen“). Liegt das letzte Aufwachen über 8 Std zurück, erscheint „keine aktuellen Schlafdaten“. Endete der letzte Nachtschlaf zwischen 18:00 und 04:00 (nächtliches Aufwachen), erscheint „nachts keine Vorhersage“ (sonst würde nachts ein „1. Nickerchen“ vorhergesagt). Unter 4 Slot-Einträgen: „noch zu wenig Daten · x von mind. 4 Einträgen“.
- Untergrenze nur in der Anzeige (nicht im Backtest): vorhergesagter Beginn frühestens 20 Min nach dem Aufwachen. Grund: Mit Steigung < 1 kann die Regression nach sehr späten Nickerchen vor dem Aufwachen landen (echter Fall 30.10.: wach 21:18, Vorhersage 21:17, tatsächlich 21:35). Im Prüfstein-Zeitraum betrifft das 0 von 78 Vorhersagen.
- Die Spanne auf dem Startbildschirm = ± Median-Fehler des Backtests mit Stichtag „jetzt“; ist die Spanne vorbei, steht „überfällig“.
- Service Worker lädt beim Installieren mit `cache: 'reload'` (frisch vom Server statt aus dem Browser-Cache), damit neue Versionen zuverlässig ankommen.

### Goals 8–12 – Zusatzfunktionen (vom Nutzer am 01.11.2026 nachts beauftragt: „so viel wie möglich der Reihe nach“)
Abweichung von „immer nur ein Goal“: ausdrücklich gewünscht. Jedes Goal wird einzeln gebaut, am PC geprüft, committed und **ohne Rückfrage gepusht** (Freigabe des Nutzers). Handy-Abnahme folgt gesammelt.

#### Goal 8 – Medikamente & Fieber
- [ ] Medikamentenliste (Name, Wirkstoff, Dosis, Einheit, Mindestabstand, max. Gaben/24 Std) anlegen/ändern, auf beiden Handys gleich
- [ ] Gabe erfassen über „Mehr → Medikament“ mit einem Tap aufs Medikament; Nachtragen über das Zeitfeld
- [ ] „wieder ab …“ je Wirkstoff (auch über verschiedene Präparate); Warnung bei zu früher Gabe oder erreichter Höchstzahl (nicht blockierend)
- [ ] Temperatur erfassen (°C, Komma erlaubt)
- [ ] Startbildschirm-Zeile „Medikamente & Fieber“ nur, wenn in den letzten 24 Std etwas erfasst wurde
- [ ] Statistik-Karte „Fieber & Medikamente“: Temperaturverlauf 7 Tage mit Markierungen der Gaben

Goal-8-Entscheidungen: Code in `meds.js`. Medikamentenliste in Firestore `settings/meds` ({ items: [{ name, substance, dose, unit, minHours, maxPerDay }] }), live per `onSnapshot`, lokal in `localStorage.meds`. **Die App gibt keine Dosis, keine Abstände und keine Höchstzahlen vor**; ohne Angaben zeigt sie nur „zuletzt“. Regeln gelten je Wirkstoff über alle Präparate (strengster Wert). Warnung per Bestätigungsdialog, nicht blockierend. Vorbelegung einmalig, nur wenn der Server noch keine Liste hat: allgemeine Markennamen-Tabelle (Nurofen → Ibuprofen, ben-u-ron → Paracetamol, Dentinox → Lidocain …) gegen die eigenen alten `custom`-Einträge; nur Name + Wirkstoff. Keine Fieber-Schwellenlinie (keine verifizierte Referenz). Am PC geprüft (01.11.2026): Vorbelegung fand Nurofen Junior, ben-u-ron, Dentinox; Gabe, Warnung bei zu früher zweiter Gabe, Temperatur, Startbildschirm-Zeile (Seite passt weiter ohne Scrollen), Fieberkurve, Verwalten-Dialog.

#### Goal 9 – App-Shortcuts
- [ ] Langes Drücken aufs App-Symbol zeigt Schlaf, Flasche, Wickeln, Medikament
- [ ] „Schlaf“ startet bzw. beendet direkt (mit Rückgängig), die anderen öffnen das passende Eingabefenster
- [ ] Die Aktion läuft nur einmal (kein Wiederholen beim Neuladen)

Goal-9-Entscheidungen: `shortcuts` im `manifest.webmanifest` → `./index.html?action=sleep|bottle|diaper|med`, Symbole `icons/sc-*.png` (96 px, per System.Drawing erzeugt). `app.js` liest `?action=` beim Laden, entfernt es sofort aus der Adresse und führt es über `runPendingAction()` erst nach dem Login aus (`sync.js`). Schlaf schaltet direkt um (mit Rückgängig), die anderen öffnen ihr Eingabefenster. Android übernimmt neue Shortcuts erst, wenn Chrome das Manifest der installierten App aktualisiert (kann bis zu einem Tag dauern; sonst App vom Startbildschirm entfernen und neu hinzufügen – Daten bleiben, sie liegen in IndexedDB/Firestore). Am PC geprüft (01.11.2026): alle vier Aktionen, Adresse danach ohne Parameter, zweiter Aufruf ohne Wirkung.

#### Goal 10 – Übergabe-Zusammenfassung
- [ ] „Mehr → Übergabe“ zeigt für „seit 6/12/24 Std“ oder eine gewählte Zeit: Flaschen, Beikost, Wickel, Schlaf, Medikamente, Temperaturen, Sonstiges, aktuellen Stand, nächsten Schlaf
- [ ] Zahlen stimmen mit dem Verlauf überein
- [ ] „Teilen“ öffnet das Android-Teilen-Menü (sonst Kopieren)

Goal-10-Entscheidungen: Code in `handover.js`, erreichbar über „Mehr → Übergabe“. Zeitraum über 6/12/24 Std (Standard 12) oder „Seit“-Feld. Schlafsumme mit `aggregate()` aus `stats.js` (anteilige Netto-Dauer wie in der Statistik). Teilen per `navigator.share`, sonst Zwischenablage. Toast zeigt „Rückgängig“ nur noch, wenn es etwas rückgängig zu machen gibt. Am PC geprüft (01.11.2026, Zeitraum ab 00:00 gegen die CSV von Hand gezählt): 2 Flaschen/280 ml, 2× Beikost/260 g, 4 Wickel (Kacka 2, Beides 2), Schlaf 8 Std 45 Min – stimmt; Medikament- und Temperaturzeilen mit Person.

#### Goal 11 – Bericht für den Kinderarzt
- [ ] Fragen für den Arzt erfassen („Mehr → Frage für den Arzt“) und abhaken
- [ ] Bericht (Statistik → „Bericht für den Kinderarzt“): Kopf mit Alter, Wachstum mit Perzentilen, Schlaf und Ernährung (14 Tage), Medikamente/Temperaturen (28 Tage), offene Fragen
- [ ] „Drucken / als PDF“ ergibt eine helle, lesbare Seite

Goal-11-Entscheidungen: Code in `report.js`. Neuer Typ `question` (❓, Titel = Frage), erfasst über „Mehr → Frage für den Arzt“, erscheint nicht im Verlauf, abhaken = löschen (mit Rückgängig). Bericht als Vollbild-Ansicht `#reportView`, geöffnet über Statistik → „Bericht öffnen“; „Drucken / als PDF“ = `window.print()`. Druckfarben über `@media print` in `style.css` (CSS-Variablen auf hell umgestellt, alles außer dem Bericht ausgeblendet). Inhalte: Alter in Kalendermonaten/-tagen, Wachstum (`growthChart` + letzte 6 Messungen mit WHO-Perzentil), Schlaf/Ernährung/Wickeln als Ø der 14 vollständigen Tage vor heute (nur Tage mit Einträgen; Schlaf über `aggregate`), Medikamente/Temperaturen 28 Tage, offene Fragen. Am PC geprüft (01.11.2026): alle Abschnitte mit echten Daten (z. B. Gesamtschlaf Ø 13 Std 29 Min, Flasche Ø 371 ml in 2,9 Mahlzeiten), Frage erfassen/abhaken, Druckansicht per eingefügter Druck-Regeln simuliert (weiß, schwarz, nur Bericht). **Nicht geprüft:** echter Druckdialog auf dem Handy.
Lehre: Beim Testen im Vorschau-Browser liefert der Service Worker nach einer Korrektur die alte Datei aus – vor jedem Test Service Worker abmelden und Cache leeren.

#### Goal 12 – Wachfenster-Ampel
- [ ] Unter der Vorhersage ein Balken „wach X von ca. Y“; grün < 75 %, gelb 75–100 %, rot darüber
- [ ] Aktualisiert sich im 30-Sek.-Takt; Startbildschirm bleibt ohne Scrollen

Goal-12-Entscheidungen: `predictNextSleep` liefert zusätzlich `wakeSince` (Ende des letzten Schlafs); die Zeile „Nächster Schlaf“ zeigt einen 4-px-Balken (Anteil = wach seit / vorhergesagtes Wachfenster) und rechts „wach h:mm von h:mm“. Status-Zeilen etwas enger (7 px statt 8 px Abstand), damit 5 Zeilen + Ampel auf 375×812 ohne Scrollen passen (gemessen: Buttons enden bei 741 px, Tab-Leiste beginnt bei 751 px). Fehlt `wakeSince` (ältere `predict.js` im Cache), erscheint die Zeile ohne Balken. Am PC geprüft (01.11.2026): 10/17/30 Min wach bei vorhergesagten 20 Min → grün 50 %, gelb 85 %, rot.

### Goal 13 – Beikost mit Gerichten (vom Nutzer am 02.11.2026 gewünscht)
- [ ] Das Beikost-Fenster zeigt bisher gegebene Gerichte als Auswahl (häufigste der letzten 30 Tage zuerst) mit Suche
- [ ] Mehrere Gerichte gleichzeitig auswählbar; neues Gericht eintippen geht auch
- [ ] Gespeichert wird ein Beikost-Eintrag wie bisher mit Menge (oder ohne Menge); die Gerichte stehen darin
- [ ] Ohne Gericht bleibt es bei 2 Taps (Beikost → Menge)
- [ ] Gerichte erscheinen im Verlauf, in der Übergabe und im Arzt-Bericht und kommen per Sync aufs andere Handy
Entscheidungen: Gerichte stehen im Feld `note` des Beikost-Eintrags, durch „, “ getrennt (keine neue Datenstruktur: Export/Import/Sync laufen unverändert; die alten Happy-Baby-Notizen wie „Waffeln mit Apfelmus“ werden so automatisch zu Vorschlägen). Ein Eintrag für alles zusammen mit der Gesamtmenge. „+“ gilt beim Lesen ebenfalls als Trenner (die Eltern haben in Happy Baby mehrere Sachen so notiert, z. B. „Brei + Banane + Keks“); eingetipptes „Mango + Keks“ wird zu zwei Gerichten. Vorschläge werden aus allen Beikost-Einträgen berechnet (Groß-/Kleinschreibung zusammengefasst, neueste Schreibweise gewinnt).

### Goal 14 – Roter Popo & Ernährung (vom Nutzer am 02.11.2026 gewünscht)
Anlass: Bri hat nach Stuhl öfter einen roten Popo; Vermutung: bestimmte Beikost (z. B. Fruchtsäure).
- [ ] Wickeln-Fenster: „Popo: unauffällig (vorausgewählt) / leicht rot / wund“ und „dünn“; im Normalfall weiter 2 Taps
- [ ] Popo-Status nachträglich im Bearbeiten-Fenster änderbar; im Verlauf sichtbar, wenn auffällig
- [ ] Statistik-Karte „Popo & Ernährung“: je Zutat „danach rot“ gegen „sonst rot“ (mit Anzahlen), Zeitfenster 12/24/48 Std vor dem Stuhl, dünner Stuhl als eigener Vergleich
- [ ] Popo-Tagebuch: jeder rote Popo mit den Gerichten im Zeitfenster davor
- [ ] Hinweis „Auffälligkeit, kein Beweis“; Hinweis auf zu wenig Daten
Entscheidungen: Gespeichert im vorhandenen Feld `rating` des Wickel-Eintrags (`unauffällig` | `leicht rot` | `wund`, bei Stuhl ggf. `, dünn` angehängt) – Export/Import/Sync ohne Umbau. Neue Wickel-Einträge bekommen immer einen Popo-Status (auch „unauffällig“), damit die Auswertung nur Windeln nutzt, bei denen wirklich hingeschaut wurde (alte Happy-Baby-Daten haben keinen Status und zählen nicht). Ausgewertet werden Stuhlwindeln (Kacka/Beides); „leicht rot“ und „wund“ zählen beide als „rot“. Zutaten = Wörter aus den Beikost-Gerichten (Goal 13) ohne Füllwörter/Marken, einfache Pluralangleichung (Bananen → Banane). Zutat erscheint erst ab 3 Stuhlwindeln mit ihr im Zeitfenster. Keine medizinischen Aussagen; Hinweis auf Kinderarzt, wenn der Popo länger wund bleibt.
▲ nur für Zutaten, die auch ohne die stärkeren ▲-Zutaten auffällig bleiben (mind. 2-mal rot, +20 Prozentpunkte); sonst „meist zusammen mit …“. Am PC geprüft (02.11.2026) mit künstlichem Muster (Test-Stuhlwindeln 6 Std nach 151 echten Beikost-Mahlzeiten, rot nach Kiwi): Kiwi ▲ 8 von 16 vs. 0 von 135; Maistiere/Toast/Himbeere „meist zusammen mit Kiwi“. Wickeln-Fenster, Bearbeiten, Verlauf, Übergabe, Bericht geprüft; Testdaten entfernt. Code in `popo.js`; Wickeln-Fenster in `app.js`.

### Goal 15 – Eigene Anordnung (vom Nutzer am 02.11.2026 gewünscht)
- [ ] „Anordnen“ (Startseite unten, „Mehr → Menü anordnen“, Statistik unten) öffnet einen Dialog mit Reitern Start / Status / Mehr / Statistik
- [ ] Je Element Haken „anzeigen“ und ↑ ↓; Änderung wirkt sofort; „Standard wiederherstellen“ je Reiter
- [ ] Anordnung gilt je Person (Chris und Nadja unabhängig) und bleibt nach Neuladen/Neuinstallation erhalten
- [ ] Ohne eigene Anordnung sieht alles aus wie vorher (Startseite ohne Scrollen)
Entscheidungen: Code in `layout.js`. Ordnen per ↑ ↓ statt Ziehen (nachts einhändig zuverlässiger). Gespeichert je Bereich `{ order, hidden }` lokal unter `layout:<Name>` und in Firestore `users/<uid>.layout` (merge neben `name`); beim Login wird die Cloud-Version übernommen. Neue Elemente späterer Versionen erscheinen automatisch am Ende. Startseite: Bereiche als `<section data-block>` in `#homeBlocks`, werden im DOM umgestellt; Status-Zeilen, Mehr-Knöpfe und Statistik-Karten über `arrange(bereich, { id: html })`. Fußzeile (Abmelden, Import, Export, Anordnen) bleibt immer sichtbar, damit man Ausgeblendetes zurückholen kann. Am PC geprüft (02.11.2026, ohne Login mit lokalen Daten): Umstellen/Ausblenden in allen vier Reitern, Übergabe-Knopf nach Umstellen, Wochenansicht, Neuladen, Zurücksetzen, Standard-Startseite unverändert. **Nicht geprüft:** Speichern in Firestore (Firestore-Regel für `users/<uid>` muss Ändern erlauben; sonst bleibt die Anordnung nur auf dem Handy).

## Aktueller Stand
- **Stand 01.11.2026 nachts:** Goals 8–12 gebaut, am PC geprüft und hochgeladen (Service-Worker-Cache `happybri-v14`). Handy-Abnahme für Goals 6–12 steht aus. Offene Handy-Tests aus Goal 7: Vorhersage tagsüber anzeigen, Nachtragen aktualisiert die Vorhersage.
- Goal 6: Code (`stats.js`, `growth.js`) ist geschrieben, am PC mit den echten Daten geprüft (7 Karten, Tages- und Wochenansicht, Perzentile: Gewicht 8,58 kg mit 11,9 Monaten = P37, Größe 76 cm mit 10,9 Monaten = P91; WHO-Median passt zu den „Altersdurchschnitt“-Werten von Happy Baby). Offen: Test auf dem Handy, Geburtsdatum eingeben.
- Goal-6-Entscheidungen: Bri ist ein Mädchen → WHO-Tabellen „girls“ (weight-for-age 0–5 J., length-for-age 0–2 J., als LMS-Werte 0–24 Monate in `growth.js`; Quelle who.int, am 01.11.2026 geladen). Durchschnitte ohne den laufenden Tag/die laufende Woche. „Altersdurchschnitt“ für Schlaf/Füttern wird bewusst nicht angezeigt (keine verlässliche deutsche Referenz). Schlaf über Mitternacht wird mit der Netto-Dauer anteilig auf die Tage verteilt. Wachfenster = Lücke zwischen Ende eines Schlafs und Beginn des nächsten (5 Min bis 12 Std).
- Referenzen Schlaf (01.11.2026): Gesamtschlaf zeigt eine Richtwert-Zone je Alter: 0–3 Monate 14–17 Std (Apotheken Umschau, „durchschnittlich“), 4–11 Monate 12–16 Std, 1–2 Jahre 11–14 Std, ab 3 Jahren 10–13 Std (AASM-Konsens 2016, Paruthi et al., J Clin Sleep Med 12(11):1549, von der American Academy of Pediatrics mitgetragen; Gesamtschlaf inkl. Nickerchen). Die Apotheken Umschau (Quelle: US National Sleep Foundation, Prof. Schlarb/DGSM) nennt ähnlich: ab ca. 4 Monaten 12–15 Std, 2.–3. Lebensjahr 11–14 Std; meist zwei Nickerchen, später eines am Nachmittag. Für Wachfenster gibt es keine medizinischen Richtwerte – bewusst keine Referenz.
- Referenzen Füttern: **offen.** Ich habe keine verlässlichen deutschen Mengenangaben (ml/g pro Tag) verifizieren können (Ernährungsplan FKE/Netzwerk Gesund ins Leben als PDF/Bild nicht lesbar; Kinderärzte-im-Netz-Auszug von 2013 ohne Zahlen). Nichts aus dem Gedächtnis eintragen. Nächster Schritt: Nutzer liefert eine lesbare Seite/ein Foto des Ernährungsplans (z. B. aus dem Kinderuntersuchungsheft oder der Broschüre), dann Zahlen exakt übernehmen und Quelle nennen.
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
