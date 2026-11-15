# Altlasten EDC – Durchsicht 15.11.2026

Blick von außen (neuer Nutzer + Reviewer) nach den Umbauten vom 15.11. (Gruppen, Knopf-Notizseite raus,
„Modus am Sticky“ raus, Tippen FW 0.37.0). Nur gelesen, nichts geändert. Behauptungen per grep geprüft.

- Stand: Commit `c02a958`. **Achtung:** Die Dokumente-Session ändert gerade `firmware-ble.ino`, `modus.h`,
  `abgleich.h`, `ablage.h` (und ersetzt `bordbuch.h` durch `doku.h`). Zeilennummern dort können sich verschieben;
  Punkte in diesen Dateien erst nach deren Abschluss anfassen. Mit **[Doku-S]** markiert.
- Nicht bewertet (gehört der Dokumente-Session): Bordbuch → Handbuch, Dokumente-Reiter, Spickzettel-Trennung,
  SPEC-Abschnitte ab ~647–745, `docs/dokumente-mockup.html`.
- Spalten: **W** = Wichtigkeit (1 = Nutzer/Leser stolpert, 2 = Aufräumen mit Nutzen, 3 = nur innen),
  **A** = Aufwand (k/m/g).
- Gute Nachricht vorweg: Kein App-Modul ist verwaist, alle Tests grün (67/67), `test/` und
  `bibliothek-patch/` werden gebraucht, keine NVS-Reste. Tot ist nur Code *innerhalb* von Modulen.

## Top 10

| # | Was | Wo | Warum Altlast | Vorschlag | W | A |
|---|-----|----|---------------|-----------|---|---|
| 1 | Fahrtbeginn springt auf die abgeschaffte Knopf-Notizseite | `sticky-app/src/main.js:1911–1913` (`modusSetzen(2)`), Rückfrage `main.js:1879`, Ortsziel „Notiz“ `main.js:1925`, `src/kontext.js:47–51`, Text `index.html:179` | Notizseite ist seit heute nur noch per Häkchen da; Firmware prüft Moduswünsche nicht gegen das Karussell (`firmware-ble.ino:630–633`), die Seite taucht also trotzdem auf | Sprung weglassen oder auf Recorder/Tippen legen; Orte-Ziel und Text anpassen | 1 | k |
| 2 | App-Texte beschreiben alte Bedienung | `index.html:124` („▼ auf Home, dann ▼/▲“), `src/hilfe.js:161` („Kacheln kommen aus dem Karussell“ – heute Kachel = Gruppe), `hilfe.js:189` (Reiter „Karten“ gibt's nicht), `index.html:198` („Home und Notiz bleiben hochkant … ab FW 0.21.0“), `hilfe.js:52` (Timer: Zeit antippen = Ziffern fehlt), `hilfe.js:179/182` (offline: Recorder/Tippen fehlen) | Sonderbelegung ▼=Zettel abgelöst (SPEC:802), Menü seit 0.36 nach Gruppen | Texte nachziehen | 1 | k |
| 3 | README zeigt den Stand von vor zwei Tagen | `README.md:9, 15, 19, 22, 45` | „one device“, „notes page“, „button notes“; fehlen Gruppen, Recorder, Tippen, Ja/Nein, DE/EN, zwei Stickys; verweist auf `visitenkarte/` | „What it does“ nach den fünf Gruppen gliedern | 1 | k |
| 4 | SPEC: alte Tastenregeln stehen da wie gültig | `SPEC.md:1285–1297` („Home, Modi und Bestellzettel“: KI kurz = Home↔Notiz, ▲ = Bordbuch, ▼ = Zettel, 3 Zettel), `SPEC.md:92–97` (Modi per KI lang) | abgelöst durch „Bedienung und Oberfläche“ (FW 0.13) und „Gruppen“ (FW 0.36); SPEC:802 sagt's selbst | ins Archiv mit Zeiger „abgelöst durch …“ | 1 | k |
| 5 | Lizenz in der SPEC widerspricht dem Repo | `SPEC.md:1162` („ohne Lizenz, wer mehr will, fragt“), `SPEC.md:330–332` („offen“) | `LICENSE` ist MIT, README/STAND sagen MIT; der Abschnitt richtet sich ausgerechnet an Fremd-Entwickler | auf MIT korrigieren | 1 | k |
| 6 | Knopf „Visitenkarte“ zeigt keine Visitenkarte; Ordner `visitenkarte/` | `index.html:71`, `main.js:591`; Firmware `OP_KARTE` → `M_HOME` (`firmware-ble.ino:602, 825`) [Doku-S]; `PROTOKOLL.md:22`; Ordner `visitenkarte/` (Pilot-Sketch 11.11., nicht im Build, mit Name + persönlicher GitHub-Adresse im öffentlichen Repo) | Knopf tut etwas anderes als er sagt; Sketch ohne Zweck | Knopf weg oder „Home zeigen“; `visitenkarte/` löschen (bleibt in Git), README:45 + SPEC:157 anpassen | 1 | k |
| 7 | Doppelte/überholte Bedienelemente im Reiter Notizen/Zettel | „Schnellknöpfe der Notiz-Seite“ ganz oben `index.html:82–87` / `main.js:651–660`; „Zettel zeigen“ `index.html:126` / `main.js:686` | gehört zur Altlast-Notizseite; zweiter Weg zum Zettel, obwohl der Spiegel den Sticky bedient (gleicher Grund wie db8ff88) | Schnellknöpfe nach Mehr (oder weg mit der Notizseite); „Zettel zeigen“ weg | 1 | k |
| 8 | Schnittstellen-Doku für Fremd-Apps veraltet | `PROTOKOLL.md` (:1 Titel „Durchstich“, :3 „drei Kennlinien“ statt fünf, :20 „3–5 Zettel“ statt 0–8, :82 „Audio nur mit Verbindung“, 0x26 LEEREN und 0x1B WACH fehlen); `SPEC.md:1129–1143` „Dateien auf der Karte (Stand FW 0.23.1)“ ohne `schrift`, `/ist/zeit.txt`, `/ist/recorder/`, `-us`-Ordner, Widget-Typen recorder/tippen/janein/ziffern; `SPEC.md:1148` zählt `14` zur Altlast, die App nutzt ihn aktiv | öffentliches Repo, Fremd-Entwickler bauen danach | auf FW 0.37 ziehen, `14` aus der Altlast-Liste | 1 | m |
| 9 | Ein Name je Sache – EN und intern nicht eingehalten | EN: Zettel = „Cards“ (`widgets.js:154`, `hilfe.js:191`) vs. Reiter „Lists“ (`index.html:220`); Waage = „Level“ (`widgets.js:156`) vs. „Spirit level“ (`lage.js:7`, `main.js:906`); Schrift = „Writing“ vs. „Handwriting“ (`main.js:339, 906`); DE „Wasserwaage“ vs. „Waage“. SPEC:887 noch „Schreiben“ statt „Notieren“, `docs/gruppen-mockup.html:87` dito | SPEC:841 „ein Name je Sache, der vom Sticky“ | Namen angleichen | 2 | k |
| 10 | Toter Code (App + Firmware) | App: `appseite.js:22–33, 64–115` (`rechnerWidget`/`umrechnerWidget`, Kommentar „für alte FW“ stimmt nicht – kein Aufrufer); `main.js:665–673` `zeigeFahrtSeite` + `fahrtCrc`; `zwilling.ping()` `zwilling.js:142`, `bordbuchModus()` `zwilling.js:301`, `rahmenPing`/`rahmenBbModus` `protokoll.js:148–149`; Exporte `eintraegeAus` (`karussellListe.js:52`), `aktivesProfil` (`geraete.js:30`); IDs `#fahrt`, `#bestellung`. Firmware: `akkuPruefen`/`akkuZeichnen`/`AKKU_*` `modus.h:259–310` + `akkuZuletzt` `:1007` [Doku-S]; `wantSlow` `firmware-ble.ino:158` [Doku-S]; `bewegtZuletzt` `sensoren.h:26` | grep: keine Aufrufer/Leser | weg | 3 | k |

## Weitere Punkte

### App (`sticky-app/`)

| Was | Wo | Warum | Vorschlag | W | A |
|-----|----|-------|-----------|---|---|
| Werkstatt-Werkzeuge im Haupt-Reiter Sticky | `index.html:46–73` (zeichnen, Text, Muster, Senden, schnell, Visitenkarte) | Entwicklerwerkzeug; SPEC:836 schlägt „Mehr: Einrichten / Werkstatt“ vor | nach Mehr → Werkstatt | 2 | m |
| „Mehr“ ungegliedert, zwei Logs nebeneinander | `index.html:156–211` („Fahrtenschreiber“ + „Ereignisse vom Sticky“, „Spracherkennung“) | „Fahrtenschreiber“ verwechselt man mit Fahrt/Recorder | in Gruppe Werkstatt; umbenennen z. B. „Protokoll vom Sticky“ | 2 | m |
| Firmware-Weichen für überholte Stände | 27 von 35 `fwAb()` in `main.js` prüfen < 0.31.6; Altpfade < 0.11: `main.js:841–884`, `:1298–1300`, `:1535–1546`, `zwilling.js:94–123` (`rueck`, `home`), `KARUSSELL_WOERTER`/`KARUSSELL_LOKAL` `main.js:909–917`, Lage `app→rechner` `:962` | öffentliches Release ist 0.31.6, eigene Geräte 0.37 | Mindest-FW 0.31.6 festlegen, Weichen weg (Voraussetzung für das Entfernen der Altbefehle in der Firmware) | 2 | m |
| Alte Namen im Code | `data-tab="bestellen"`, `bestellZeigen`, `BESTELL_STANDARD`, `bestellung.js`; „Fahrt…“ für die Notizseite (`fahrtseite.js`, `zeichneFahrt`, `main.js:671`) | Sticky sagt „Zettel“ bzw. „Notiz“ | umbenennen (mit Firmware abstimmen) | 3 | m |
| Überholte Kommentare | `main.js:339` („Modus:“), `main.js:616` (App-Seite „zeichnet den Rechner“), `burgduell.js:1, 296` („App-Seite“ statt „Spiel“) | | Text anpassen | 3 | k |
| Einmal-Umzüge | `recorderNachtragen`, `tippenNachtragen`, `notizSeiteRaus` (`main.js:1057–1094`), `zettelUmzug` (`main.js:692` + Test) | auf eigenen Geräten gelaufen | nach dem nächsten öffentlichen Release entfernen | 3 | k |
| [Doku-S] Hinweise | `karten()` (`karten.js:15`) nur noch im Test benutzt; `index.html:152` nennt „Spickzettel, Handgriffe“; `id="bordbuch"` (`index.html:99`) unbenutzt | | an Dokumente-Session geben | – | k |

### Firmware (`firmware-ble/`)

| Was | Wo | Warum | Vorschlag | W | A |
|-----|----|-------|-----------|---|---|
| Standard-Karussell veraltet [Doku-S] | `modus.h:704` (ohne `karussell.txt`: Home, Notiz, Bordbuch, Zettel) | greift bei neuer Karte; enthält die Altlast-Notizseite | an Standardgruppen angleichen (Home, Recorder, Tippen, Kritzel, Timer) | 2 | k |
| Knopf-Notizseite als Ganzes | `M_NOTIZ`/`notizDa` `modus.h:27, 647, 716`; `rahmenAntippen` `modus.h:797`; `puffer.h:73–150, 225–241`; 0x16, BILD_ENDE 4; `hilfe/notiz.bin` | Altlast, nur per Häkchen | **vorerst lassen.** Achtung: `notiz/r05.bin`/`r06.bin` braucht die Diktat-Anzeige überall (`audio.h:250, 264`) – erst herauslösen, dann entfernen | 2 | g |
| Zwei Speicherwege für Text-Notizen | Strichschrift → `/ist/schrift/*.txt` (`schrift.h:201`); Tippen → `notizen.jsonl` (`tippen.h:81`); Reiter „Strich“ springt nur zur Schrift-Seite (`tippen.h:112`) | SPEC: „noch nicht dieselbe Zeile“ | Strich als Unterseite von Tippen, ein Speicherweg | 2 | g |
| Alte Spezialbefehle 13, 16–19, 1A, BILD_ENDE 3–5 [Doku-S] | `firmware-ble.ino:588–590, 605–643, 780–803`; `puffer.h:186–250`; `homeSpeichern` `modus.h:197`; `homeVersionNeu` | App sendet sie nur für FW < 0.11; SPEC:1148 verspricht Fremd-Apps aber, dass sie bleiben | **Entscheidung Markus.** Erst App-Weichen weg, dann Firmware. 13/BILD_ENDE 3 gehören der Dokumente-Session | 3 | m |
| 0x14 falsch benannt [Doku-S] | `OP_BB_MODUS`, Kommentar „0 Home, 1 Bordbuch, 2 Notiz“ (`firmware-ble.ino:76, 630`), nimmt nur Modus ≤ 5 | aktiv genutzt (Rückfrage, Spiegel, Orte) | `OP_MODUS`, Kommentar korrigieren | 3 | k |
| 0x1B WACH ohne eigenen Fall | wirkt nur über `aktiv()` vor dem switch (`firmware-ble.ino:552`) [Doku-S] | undokumentiert | leerer `case` mit Kommentar + PROTOKOLL | 3 | k |
| Kopfkommentare alte Bedienung [Doku-S] | `modus.h:1–22` (KI kurz = Home ohne Menü, ▼ auf Home = Zettel, Home = Visitenkarte), `firmware-ble.ino:5` | | neu schreiben | 3 | k |
| Doppelte Logik | `statusHoch()` (`status.h:28`) vs. `seiteHoch()` (`modus.h:320`); `modusName()` (`modus.h:188`) vs. Namenskette in `setzeModus` (`:611`); zwei Ziffernfelder (`eingabe.h` vs. `tippen-zf`); zwei Touch-Aufgaben `kzAufgabeFn`/`tipAufgabeFn` + `kzAn`/`tipAn` | | zusammenlegen | 3 | k–m |
| Doppelte Deklarationen | `extern gfxPartialWachHalten` (`modus.h:344, 514`), `kzHoch` (`:318, 346`), `bestellZaehlen()` zweimal in `homeInit` (`:215, 231`) | | aufräumen | 3 | k |
| Interne Namen | `M_BESTELL`/„bestell“ (Sticky: Zettel), `M_APP`/„app“ (Spiel), „Fahrt-Seite“/`fahrtv`/`/fahrt/` in `puffer.h:8–9, 146` | | intern umbenennen; Ereignistexte nur zusammen mit der App | 3 | m |
| Einmal-Umzug Flash → SD | `sollUmzug` (`ablage.h:96–117`) [Doku-S], `LittleFS.mkdir("/fahrt")` (`puffer.h:173`) | nur für Geräte < 0.11 | weg, wenn kein alter Sticky mehr existiert (prüfen) | 3 | k |
| Patch-Doku | `bibliothek-patch/LIESMICH.md:1, 7` („nur im Kritzelblock“) | gilt auch für Widgets/Tippen (`widget.h:473`) | Satz anpassen | 3 | k |

### Doku

| Was | Wo | Warum | Vorschlag | W | A |
|-----|----|-------|-----------|---|---|
| Sensor-Tabelle sagt „ungenutzt“ | `SPEC.md:1054–1055` | LSM6DS3/SHT40 laufen seit FW 0.12 | aktualisieren oder auf `sensoren.h` verweisen | 1 | k |
| „Wie autark ist der Sticky? (FW 0.26.0)“ | `SPEC.md:367–381` | Rechner/Umrechner seit 0.28 lokal; Wecker, Weltzeit, Recorder, Tippen fehlen | neu als „geht ohne Handy (FW 0.37)“, mit SPEC:834–836 zusammenlegen | 1 | k |
| Zweites Gerät „in Folie“ | `SPEC.md:18`, `STAND.md:16–17` | 5695 seit 14.11. im Betrieb | neu fassen | 2 | k |
| Alte Menü-/Karussell-Regeln neben neuen | `SPEC.md:803–806` (Karussell je Szene), `:811` (Kachel je Karussell-Eintrag), `:830` („später hoch/quer“, obwohl :828 „umgesetzt“) | abgelöst durch Gruppen | als „abgelöst“ markieren, :830 streichen | 2 | k |
| „Nächstes Flash-Paket (geparkt)“ größtenteils umgesetzt | `SPEC.md:430–458` | Rechner, Weltzeit, Wecker, Strichschrift, Tastatur (= Tippen), Hilfe-Merker erledigt | Reste (Strichliste, Klimakurve, Würfel, „8/B“) in eine Offen-Liste, Rest ins Archiv | 2 | k |
| Erledigte „Vorschlag/Idee/geparkt“ | `SPEC.md:99–100` (Benachrichtigungen „nicht im MVP“ – gibt's), `:124–131`, `:166–184`, `:478–489`, `:1179–1193` | längst umgesetzt | „fest, umgesetzt FW x“ oder Archiv | 2 | k |
| „### Offen“ enthält kaum Offenes | `SPEC.md:1060–1107` | Hardware-Fakten, Erledigtes (Spiegel, Sticky Lab, Sync); `:1086` doppelt mit `:793` | aufteilen: Hardware-Fakten / Archiv / echte Offen-Liste | 2 | m |
| STAND.md ist eine Chronik | `STAND.md:21–433` | 380 Zeilen Verlauf; `:422` „Idee geparkt“ zwischen Umgesetztem; alte „Offen:“ teils beantwortet | auf ~60 Zeilen Stand kürzen (Geräte, Versionen, Bauen, Stolperfallen), Verlauf nach `CHRONIK.md` oder git log | 2 | m |
| Messprotokolle am SPEC-Ende | `SPEC.md:1196–1283` | Messwerte wertvoll, Aussagen überholt (:1217, :1268, :1281) | nach `docs/messungen.md` | 3 | k |
| Legende zu knapp | `SPEC.md:11` | erklärt nur fest/Vorschlag/offen; benutzt werden auch geparkt, Idee, Merker, umgesetzt, abgenommen, verworfen | ergänzen | 3 | k |
| Kleinkram in „umgesetzt“-Abschnitten | `SPEC.md:394` (Aufwandsschätzung), `:779` („▼ = speichern“ Kritzel – heute speichert Verlassen), `:849` (Wetter ausgrauen halb erledigt) | | nachziehen | 3 | k |
| Mockups mit altem Stand | `docs/gruppen-mockup.html:87` („Schreiben: Notiz, …“), `docs/eingabe-mockup.html:215–216` (Taste DE/EN statt „?“), `:101` | | nur Kopfband „Entwurf 15.11., Abweichungen siehe SPEC“ | 3 | k |
| `spickzettel-strichschrift.png` in der Wurzel | Ausgabe von `sticky-app/tools/spickzettel-schrift.py:9`, nirgends verlinkt | liegt lose herum | nach `docs/`, Skript-Ziel anpassen, in README verlinken | 3 | k |

## Strukturvorschlag SPEC.md (groß, eigener Durchlauf)

1. **Teil A „Gilt“** nach Themen statt Datum: Rolle · Architektur (Zwilling 2.0, SD-Vertrag) · Bedienung (Tasten,
   Gruppen, Statuszeile, Hilfe, Braun, Lage) · Seiten je Gruppe · Notiz-Kette (Sprachnotizen 2.0, PTT) · App ·
   DE/EN · Hardware-Fakten · Für Fremd-Apps. Jeder Abschnitt endet mit „umgesetzt FW x“ + kurzer Offen-Liste.
2. **Teil B „Offen und geparkt“**: eine Liste nach Wichtigkeit (Ideensammlungen, Playground, App-Store,
   EDC-Ideen, Einfach-Profil, Microlino-Knopf, Teilen).
3. **Teil C „Archiv“** als `SPEC-archiv.md`: MVP 11.11., „Umschalten“, „Home, Modi und Bestellzettel“, alte
   Vorschläge, Durchstich-/Messprotokolle – je mit Zeiger „abgelöst durch …“.
4. Dokumente-Abschnitte bleiben unberührt, bis die Dokumente-Session fertig ist.

Schätzung: Top 1–8 zusammen 1–2 h. SPEC-Umbau A/B/C etwa ein halber Tag.
