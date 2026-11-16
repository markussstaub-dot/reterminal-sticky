# reTerminal Sticky – Spec

> **Leitsatz (Markus, 13.11.2026): Der Sticky ist allein nützlich – die App macht ihn beliebig smart.**
> Ohne Handy ein vollwertiges EDC-Werkzeug (Uhr, Wecker, Weltzeit, Timer, Rechner, Waage, Lineal, Zettel, Schrift,
> Diktat-Puffer, Fahrtenschreiber); mit Handy kommen Spracherkennung, Ort, Wetter, neue Seiten und Abgleich dazu.

Grundidee (Markus, 11.11.2026): **Der Sticky als Erweiterung des Handys**, nicht in erster Linie als
Smart-Home-Tafel. Handy (Fold6) = Rechenleistung und Internet; Sticky = Knopf, Mikro und stromsparendes
Papier-Display, das man auf den Tisch legt oder irgendwo ranpappt.

Legende: **fest** = entschieden · **Vorschlag** = Claudes Idee, Markus entscheidet · **offen** = Frage ·
**geparkt** / **Idee** = gesammelt, nicht entschieden · **Merker** = später prüfen · **umgesetzt FW x** / **abgenommen** =
gebaut bzw. von Markus bestätigt · **abgelöst** = gilt nicht mehr, steht nur noch zur Geschichte da

## Rolle
- Spitzname (Markus, 11.11.2026): **Bordcomputer-Beiboot**. Sitzt per Magnet im Microlino, wird für Theke,
  Werkstatt oder Sofa abgedockt
- fest: Handy-Erweiterung zuerst; Smart-Home-Anzeige nur nebenbei (siehe `../homeserver/SPEC.md`)
- fest: Werks-Firmware kann KI-Notizen, ist aber träge → eigene Firmware auf dem Bastel-Sticky
- erledigt (14.11.2026): das zweite Gerät (5695) ist ausgepackt und im Betrieb, siehe Multiclient
- Merker (Markus, 14.11.2026): **Mehrere Stickys an einer App** („Multiclient“) als nächste Baustelle für die APK, Start
  14.11.: Geräteliste mit Namen/MAC, je Gerät eigener Zwilling (Soll/Ist), Abgleich je Gerät. Anlass: der zweite
  Sticky bekommt zum Test die EDC-Firmware aus dem Playground. Vorher ein **Architekturbild** (App, Zwillinge, Stickys, Abgleich) als Grundlage → `docs/architektur-multiclient.svg` (14.11.2026). Entschieden: alle gleichzeitig verbunden, Bibliothek geteilt (nur Unpersönliches),
  Profile als Vorlagen, Altdaten zu Sticky A. Erst beide Stickys für Markus selbst, **Familie und Privatsphäre mitdenken**:
  Besitzer je Gerät, persönliche Daten nie auf fremde Geräte, „Gerät vergessen“ vor dem Verschenken, alles lokal.
  **Lücke:** BLE heute ohne Kopplung (jedes Handy in Reichweite könnte /ist lesen) → Kopplung mit Tastenbestätigung, eigener Firmware-Schritt
  - **Stufe 1 umgesetzt (14.11.2026):** Geräteliste (Mehr → Stickys: Name, Profil, Wechseln, Vergessen, „Sticky
    hinzufügen“ überspringt bekannte), verbunden ist einer zur Zeit; Wechseln lädt die App neu. Einstellungen je Profil
    (`sticky.p.<profil>.…`: Karussell, Lage, Zettel, Karten, Spickzettel, Handgriffe, Wörterbuch, Notiz-Knöpfe) bzw. je
    Gerät (`sticky.g.<mac>.…`: Abgleich-Stand, Spiegel, Lineal-Kalibrierung, Bordbuch-Plan); `src/geraete.js`. Altdaten
    wandern einmalig zu Sticky A (Profil „EDC“). Notizen tragen `geraet`, Fahrtenschreiber/Messreihen weiterer Geräte
    liegen in einem Unterordner mit Kurznamen. Wiederverbinden sucht nur den aktiven Sticky, nie einen anderen
  - **Stufe 2 umgesetzt (14.11.2026, Weg B „Vordergrund + Hintergrund“):** der aktive Sticky wie bisher (Vorschau,
    Fernbedienung, Bordbuch); jeder weitere bekannte Sticky läuft als Hintergrund-Sitzung mit eigener Verbindung und
    eigenem Zwilling: liefert Live-Diktate, Notiz-Knöpfe, Puffer, Kritzel, Schrift, Fahrtenschreiber und Messreihen ab,
    bekommt Home (mit Wetter), Zettel, Notiz-Seite, Karussell, Widgets, Hilfe und Schrift nach SEINEM Profil
    (`baue()`/`mitGeraet()`: Bau-Kontext nur für synchrone Bauschritte). StickyDienst: ein Wecker je MAC. Geräteliste
    zeigt „im Hintergrund verbunden · Akku“ bzw. „zuletzt“. Am Gerät geprüft: beide gleichzeitig verbunden, Live-Diktat
    von beiden mit richtigem Gerät. Hintergrund funkt „bescheiden“ (kein Schnellmodus aus der App), weil zwei schnelle
    Verbindungen Abrisse brachten (Grund 0x222); ob das reicht, zeigt der Alltag – sonst Firmware-Wunsch nach schnellem
    Takt für Hintergrund-Abgleich abschalten
  - **Benachrichtigungen ans Sticky (Test, 14.11.2026):** Android-NotificationListener „Melder“ mit Positivliste
    (zum Test nur die Sticky-App; Bubble Log später), nur nach Freigabe durch Markus (Mehr → Benachrichtigungen); Titel
    und Text erscheinen kurz im Rückmeldefeld auf Home/Notiz, beim aktiven und bei Hintergrund-Stickys; nichts wird
    gespeichert. Am Gerät geprüft: Test-Meldung kam an. offen: Bubble-Log-Paketname, Symbol in der Statuszeile und Liste
    der letzten Meldungen (Firmware), Anzeige auch auf anderen Seiten
  - fest (Markus, 14.11.2026): **mehrere Handys/Apps mit mehreren Stickys** (n:m) bauen wir nicht – wer das braucht,
    baut es selbst (Protokoll und SD-Vertrag stehen unter „Für Fremd-Apps“)
  - **Leeren vor der Weitergabe (14.11.2026, FW 0.31.6):** Befehl 0x26 „LEEREN“ löscht /soll und /ist auf der Karte
    samt Unterordnern, formatiert LittleFS und startet neu; in der App bei „Vergessen“ als Rückfrage, wenn der Sticky
    verbunden ist. Am zweiten Sticky (5695) geprüft: 93 Dateien weg, Karte 0 MB, LittleFS leer
  - offen: Wechsel des aktiven Sticky ohne Neuladen; Kopplung/Verschlüsselung

## MVP (Markus, 11.11.2026)

fest: Das MVP sind **zwei Funktionen für den Microlino**, alles andere wartet:

### 1. Testnotizen für Bubble-Log-Testfahrten
- fest: Notiz per **Schnellknopf** (ein Tipp) oder **Diktat** (Taste halten), App stempelt Zeit + GPS
- Vorschlag Schnellknöpfe (5, groß, per App änderbar): „Bug“, „Erkennung falsch“, „Ampel“, „holprig“, „Merken“
- gemerkt (Markus, 11.11.2026): Knöpfe sollen **frei editierbar** sein, damit der Notizmodus nicht nur für
  Testfahrten taugt. Texte ändern geht in der App schon. Vorschlag: **Knopf-Sätze** wie „Testfahrt“,
  „Alltag“ (Tanken/Laden, Parkplatz, Merken …) oder „Werkstatt“, in der App gewählt; im JSONL steht dann
  der Satzname mit
  - Beispiel (Markus): Satz **„Reichweite“** für die Bubble-Log-Schätzung: „zu niedrig“, „passt“, „zu hoch“.
    Jeder Tipp ist eine Bewertung mit Zeit, GPS und Akkustand und lässt sich später mit der Prognose im
    Bubble-Log-Log vergleichen
  - fest (Markus, 11.11.2026): **Akkustand des Microlino gehört zur Notiz**, vorerst **Stufe 1**: bei der
    Auswertung über den Zeitstempel aus dem Bubble-Log-Log holen (kein Umbau). Stufe 2 (geparkt), falls er live in der
    JSONL stehen soll: Bubble Log gibt Akku/Prognose ans Handy weiter (Broadcast), Sticky-App schreibt `akku`
    und `prognose_km` mit. Das ist ein kleiner Eingriff in Bubble Log
- Vorschlag Diktat: whisper Stufe 1 (läuft schon); Audio zusätzlich aufheben, falls der Text danebenliegt
- Vorschlag **Übergabe ohne Umbau von Bubble Log**: Die Sticky-App schreibt die Notizen als JSONL
  (gleiches Format wie das Entwickler-Log: Zeit, Lage, Typ, Text) und teilt sie wie die Bubble-Log-Logs.
  Zusammengeführt wird bei der Auswertung über die Zeitstempel. Eine direkte Einspeisung in Bubble Log
  kommt erst, wenn sich das bewährt
- Vorschlag Rückmeldung am Sticky: kurzes „✓ Bug 14:32“ unten in der Ecke (Teil-Refresh), keine Ablenkung
- fest: Fahrsicherheit – ein Tipp bzw. ein Knopf, nichts lesen während der Fahrt
- fest (Markus, 15.11.2026 abends): **Knopf-Notizseite ist Altlast** – während der Fahrt gehen ohnehin nur
  Sprachnotizen (KI halten, überall). Sie fliegt aus dem Standard-Karussell und einmalig aus eigenen Listen; in der
  Gruppe „Notieren“ steht der Recorder vorn (Recorder · Kritzel · Schrift). Für Testfahrten per Häkchen in
  Mehr → Karussell wieder einschaltbar. Später evtl. Umbau zur Seite „Heute“ (siehe Sprachnotizen 2.0)

### 2. Digitales Bordbuch mit Handbuch
- fest: **Betriebsanleitung** des Microlino zum Blättern; die App rendert die PDF-Seiten für 800×480 und
  legt sie im Flash ab → lesbar ohne Handy
- Vorschlag Bedienung: ▲/▼ blättern, Touch aufs Inhaltsverzeichnis springt zum Kapitel, KI-Taste = zurück
- Vorschlag **Spickzettel-Seiten** vorne: Warnleuchten, Laden (Typ 2/Schuko, 8 A), Reifendruck,
  Sicherungen, Pannenhilfe/Notfallnummern – in der App als Text gepflegt
- Vorschlag Startseite im Bordbuch: schlichte Titelseite „Microlino – Bordbuch“ mit Inhaltsverzeichnis,
  ohne Kennzeichen und ohne QR
- nicht im MVP: Bordbuch-Seiten aus Bubble Log (Fahrten, Akku, Wartung)

### Umschalten und Betrieb
- **abgelöst:** Modi und Tastenregeln gelten nicht mehr – heute „Bedienung und Oberfläche“ und „Gruppen im Menü“
- Vorschlag (11.11.): zwei Modi „Fahrt“ (Schnellknöpfe) und „Bordbuch“ (Lesen), Wechsel per langem Druck auf die KI-Taste
- Vorschlag: im Auto magnetisch, mit Akku; Halterung/Strom per USB-C erst nach dem MVP
- fest: **Claude lädt die offizielle Betriebsanleitung** vom Hersteller (passend zum Pioneer; Quelle und
  Größe vorher Markus nennen). Bleibt privat, nicht im Repo
- fest: **Claude füllt die Spickzettel** aus dem Handbuch vor, Markus prüft

### Nicht im MVP
Eigene Tastatur, E-Book allgemein, Benachrichtigungen, Cloud-Stufe, Knopf-Kopplung, Ideensammlung.

## Architektur: Handy-App als Digital Twin (Markus, 11.11.2026)

Leitbild: **Der Sticky ist ein dünnes Terminal, die App ist sein Zwilling und sein Gehirn.**
Rechenarbeit im Handy, KI und Cloud nur als zuschaltbare Zusatzstufe.

```
 ┌──────────── Sticky (Edge) ────────────┐        ┌──────────── Fold6-App (Twin) ─────────────┐
 │ E-Paper 800×480 · Touch · Mikro       │  BLE   │ Zwillings-Zustand (Quelle der Wahrheit)   │
 │ Tasten · Sensoren · Akku              │◄──────►│ Seiten-Renderer → Bitmaps                 │
 │ Seiten-Cache im Flash (offline)       │  WLAN  │ Live-Vorschau des Displays in der App     │
 │ dünne, stabile Firmware               │ (Bulk) │ Funktionen: Karte, Buch, Diktat, Hinweise │
 └───────────────────────────────────────┘        └───────────────┬───────────────────────────┘
                                                                  │ nur bei Bedarf
                                              ┌───────────────────┴───────────────────┐
                                              │ Stufe 1: auf dem Handy (offline)      │
                                              │ Stufe 2: zu Hause (Zenbook/Homeserver │
                                              │          über Tailscale, Ollama/Whisper)│
                                              │ Stufe 3: Cloud (z. B. Claude-API)     │
                                              └───────────────────────────────────────┘
```

### Aufgabenteilung
- Vorschlag **Sticky = Ein- und Ausgabe, sonst nichts**: Er zeigt fertige Bilder, meldet Eingaben
  (Touch, Tasten, Audio, Sensorwerte, Akku) und hält ein paar Seiten im Flash, die ohne Handy
  funktionieren (Visitenkarte, zuletzt gelesene Buchseiten). Neue Funktionen = App-Update, kein Flashen
- Vorschlag **App = Zwilling**: Sie führt den Zustand des Sticky (welche Seite, Einstellungen, Akku, Sensoren)
  als Quelle der Wahrheit, rendert jede Seite pixelgenau und schickt nur das Bild bzw. die Änderung.
  Die App zeigt den Sticky als Live-Vorschau; geht damit auch ohne Gerät (Simulator, wie bei Bubble Log)
- Vorschlag **Abgleich**: Zwilling hat Soll-Zustand, Sticky meldet Ist-Zustand; bei Wiederverbindung
  gleicht die App ab (welche Seite fehlt im Cache, wurde offline geblättert?)

### Verbindung
- fest: ESP32-S3 kann nur **Bluetooth LE**, kein klassisches BT → kein Headset-Profil fürs Fold
- Vorschlag: **BLE als Dauerleitung** (wenig Strom): Ereignisse, Zustand, Bilder. Ein Vollbild s/w =
  48 KB → mit BLE 2M etwa 1 s; Graustufen (2 bit) doppelt
- Vorschlag: **Audio über BLE** geht mit eigener App doch: komprimiert (Opus/ADPCM, 16 kHz) reichen
  ~30–60 kbit/s. Damit braucht das Diktat kein WLAN
- Vorschlag: **WLAN nur auf Abruf** (Heimnetz oder Hotspot des Fold) für große Dinge: ganze Bücher,
  Firmware-Update über die App (OTA)
- Vorschlag: **BLE-Tastatur** (HID) bleibt als Notweg ohne App, z. B. Diktat in fremde Geräte
- fest: **Rücksichtsvoll funken** – das Fold6 hat schon Batteriewächter (BLE), Android Auto, Lautsprecher (A2DP).
  Sticky im Ruhezustand nur langsames Werben oder lange Verbindungsintervalle; erst bei Tastendruck/neuem Bild
  für Sekunden schnell (BLE 2M, kurzes Intervall), dann wieder träge. Im Durchstich messen: parallel zu
  Batteriewächter und Musik auf dem Lautsprecher

### Rechenstufen (KI und Cloud als Zusatz)
- Vorschlag: Jede Funktion bekommt einen Schalter **Handy / Zuhause / Cloud**; Standard ist die
  niedrigste Stufe, die es kann. „Cloud nur wo nötig“ gilt wie im Homeserver-Plan
- Stufe 1 Handy: Spracherkennung auf dem Gerät (whisper.cpp oder Androids eigene Erkennung),
  Seitenumbruch fürs Buch, Benachrichtigungen lesen
- Stufe 2 Zuhause: größeres Whisper/Ollama auf Zenbook oder Homeserver, erreichbar über Tailscale
- Stufe 3 Cloud: Zusammenfassen, Umformulieren, Fragen an die KI („mach aus dem Diktat eine Mail“)
- offen: Was darf überhaupt in die Cloud (Diktate, Benachrichtigungsinhalte)? Pro Funktion festlegen

### Funktionen in diesem Bild
- fest **Visitenkarte** = erster Pilot (11.11.2026), läuft heute ohne App (`visitenkarte/`). Mit App:
  in der App gestalten, als feste Seite in den Cache des Sticky schicken
- Vorschlag **Diktat** (à la Wispr Flow): Taste → Audio per BLE an die App → Text → landet im gerade
  offenen Feld. Weg dahin: die App als **eigene Android-Tastatur** (so macht es Wispr Flow) oder
  Zwischenablage. Optional Stufe 3: „Aufräumen“ des Textes per KI
- Vorschlag **E-Book**: App öffnet EPUB, bricht für 800×480 um, schickt die nächsten Seiten voraus in den
  Cache → Lesen geht auch, wenn das Handy weg ist. Blättern per Taste/Touch
- Vorschlag **Benachrichtigungen**: App liest sie per Android-Benachrichtigungszugriff, filtert
  (nur ausgewählte Apps), rendert und schickt; Antworten später per Diktat
- Idee **Testnotizen für Bubble Log** (Markus, 11.11.2026, geparkt): Sticky im Microlino; beim Testfahren
  per Tipp auf große Schnellknöpfe („Bug“, „Erkennung falsch“, „Ampel“, „holprig“, „Akku ablesen“) oder per
  Diktat eine Notiz. Die Sticky-App stempelt Zeit + GPS dazu und reicht sie an Bubble Log weiter (z. B. als
  Eintrag im Entwicklermodus-Log), damit Claude sie später neben den Fahrt-Logs auswerten kann.
  Fahrsicherheit: nur ein Tipper bzw. ein Knopf, nichts lesen während der Fahrt.
  offen: Übergabe an Bubble Log (Android-Intent, geteilte Datei, oder Bubble Log liest die Notizen der Sticky-App)
- Idee **Bordbuch für den Microlino** (Markus, 11.11.2026, geparkt), Hauptzweck des E-Readers:
  - digitales Handbuch: Betriebsanleitung (PDF des Herstellers, nur privat) – die App rendert PDF-Seiten
    für 800×480 und legt sie in den Cache, also auch ohne Handy lesbar; Inhaltsverzeichnis per Touch
  - Spickzettel: Warnleuchten, Sicherungen, Reifendruck, Laden (Typ 2/Schuko, 8 A), Pannenhilfe, Notfallnummern
  - Bordbuch-Seiten aus Bubble Log: letzte Fahrten, Akku, Ladepunkte, offene Wartung/TÜV
  - passt zu den Testnotizen: gleiches Gerät, gleicher Platz im Auto
  - fest (Markus, 11.11.2026): Der Sticky bekommt **vorläufig einen festen Platz im Microlino**, Strom per
    USB-Spiralkabel (zwei Kabel vorhanden)
  - Magnetring liegt bei → Vorschlag: statt eigener Halterung nur eine Gegenplatte bzw. ein MagSafe-Halter am
    Armaturenbrett (Stahlplatte aufkleben oder flache Aufnahme auf dem X1C drucken); USB im Auto ist meist nur mit Zündung an → der Akku überbrückt die
    Standzeit, Stromsparen nur ohne USB (CHARGE_STATE GPIO40 bzw. BQ27220 zeigt, ob Strom da ist)
  - offen: wie teilt er sich die Rolle mit dem Knopf-Display?
- offen: Reihenfolge nach der Visitenkarte (eine Baustelle zur Zeit)

### Ideensammlung (11.11.2026, alles geparkt, sortiert wird später)
- **Einkaufs-/Merkzettel**: ans Handy diktieren → Liste am Kühlschrank, abhaken per Tipp
- **Tagesansicht**: morgens Termine, Wetter, Müll; bleibt den Tag über ohne Strom stehen
- **Werkstatt-Begleiter**: Druckstatus X1C, Lasergravierer-Einstellungen, Anleitungen, die man mit
  schmutzigen Fingern per Taste weiterblättert
- **Gesprächs-/Meeting-Notizen**: Taste → Aufnahme, Handy transkribiert, auf Wunsch Zusammenfassung
  → ausgearbeitet als „Recorder für Längeres“ (15.11.2026)
  (Stufe Zuhause oder Cloud)
- **Uhrenbox-Begleiter**: Gangwerte aus dem Zeitwaage-Labor neben der Uhr
- **„Bitte nicht stören“-Schild**: an der Tür, per Handy oder Kalender umgeschaltet
- **Handbuch verschlanken** (Markus, 12.11.2026): statt 150 gerenderter PDF-Bildschirme nur das Nötige fürs
  Fahren, knapper umformuliert; Bilder ggf. als **Vektorgrafiken** neu (gestochen scharf in 1 bpp, kein
  Rastermatsch, kleiner im Flash)
- ~~Bestellzettel zum Vorzeigen~~ → umgesetzt, siehe „Home, Modi und Bestellzettel“ unten

### Ideen mit Handy (Markus, 15.11.2026, geparkt – nur sammeln, nichts entschieden)
Lab und EDC gelten als rund; das hier ist, was Sticky und Handy zusammen noch könnten. Von naheliegend bis Größenwahn.
- naheliegend (Handy liefert, Sticky zeigt):
  - **Kontextseite je Ort** (→ umgesetzt, siehe unten): Micro → Akku, Reichweite, Tempolimit aus Bubble Log; Supermarkt → Zettel nach vorn;
    daheim → Termine, Wetter. Das Handy kennt den Ort, der Sticky wechselt die Szene selbst
  - **Rückfragen der App** mit den kleinen Eingaben („Fahrt beendet – wie war's? 1–5“, „Parkplatz merken? Ja/Nein“)
  - **ausgewählte Benachrichtigungen dauerhaft** auf e-Ink (Paket, Ladeende, eine Person), ohne Handy-Display
- mutiger (Sticky als Fernbedienung und zweiter Bildschirm):
  - **Medienknopf**: Earbuds/Podcast-Kapitel/Recorder-Wiedergabe steuern, Ton vom Handy
  - **Navigation light**: nur nächster Abbiegepfeil und Meter, groß im Micro, keine Karte
  - **Kamera-Auslöser**: Fold auf dem Stativ, Tipp am Sticky = Foto, Vorschau aufs e-Ink
  - **Fold als Rechenknecht**: Kritzel → Handschrift → Text; Foto vom Typenschild → passender Handbuch-Abschnitt
- Größenwahn:
  - **KI-Terminal**: KI halten, fragen, Fold oder Claude antwortet in drei Zeilen aufs e-Ink
  - **Familien-Stickys**: zwei Stickys tauschen über ihre Handys Zettel, Grüße, Kritzel („Kühlschrankzettel über
    600 km“); n:m bleibt verboten, es wären zwei Apps mit einem gemeinsamen Briefkasten
  - **Liegengelassen-Wächter**: Handy piept, wenn Sticky und Handy sich trennen; der Bewegungssensor merkt, wo er
    zuletzt lag

#### Die drei naheliegenden ausgearbeitet (Markus, 15.11.2026, abgenommen, Stufe 1 umgesetzt in der App)
Bestand, auf dem es aufbaut: die App kann den Sticky **auf eine Seite schicken** (Home, Bordbuch-Seite, Notiz, Zettel n,
Kritzel, Spiel – Befehl 0x14), **Teilbilder ins Rückmeldefeld** auf Home/Notiz legen, **Home neu zeichnen** (Bild
liegt auf dem Sticky, bleibt ohne Strom stehen) und auf der **Spielseite** alle Tipper selbst auswerten. Sie kennt
den Ort (eigenes GPS oder passiv mit, wenn Bubble Log läuft) und merkt eine Fahrt am Tempo („Fahrt erkannt“).
Daraus folgt: **alle drei gehen in Stufe 1 ohne Flashen**, nur App (und ein kleines Stück Android). Reihenfolge
nach Aufwand: Benachrichtigungen → Rückfragen → Kontextseite. Code: `src/kontext.js` (Logik, getestet),
`src/rueckfrage.js` (Zeichnen/Treffer), Verdrahtung in `main.js`, Home-Zeilen in `homeseite.js`, Melder in Java.

**A. Ausgewählte Benachrichtigungen dauerhaft** (umgesetzt 15.11.2026, APK nötig)
- fest (Bestand): Melder mit Positivliste, nur nach Freigabe, nichts verlässt das Handy außer zum Sticky
- fest **Positivliste in der App** (Mehr → Benachrichtigungen): je Zeile ein Paketname, Bubble Log
  (`app.bubblelog.microlino`) und die Sticky-App vorbelegt; **„paket: Name, Name“** = nur, wenn einer davon im Titel
  steht (eine Person in einem Messenger). Die App schickt die Pakete an den Melder (Android filtert nach Paket, „nur von“
  prüft die App). Ablage nur auf dem Handy, nie im Repo
- fest **dauerhaft = auf Home**, als **„App · Titel“** ohne Nachrichtentext (Markus: Privatsphäre am Tisch): die letzten
  **3** mit Uhrzeit unter der Uhr. Home wird dafür neu aufgespielt (gesammelt, ein Abgleich für mehrere Meldungen), steht
  danach ohne Strom und ohne Handy. Das kurze Aufblitzen im Rückmeldefeld bleibt
- fest **weg, wenn am Handy weg**: wischt man die Meldung am Handy weg, verschwindet sie auch vom Sticky; spätestens nach
  **12 h** fällt sie von selbst raus. Am Sticky kein Löschen nötig (Grundfaulheit)
- fest: nur auf der Home-Karte des **aktiven** Sticky (Hintergrund-Stickys bekommen nur das Aufblitzen)
- Hinweis Platz: stehen Hinweise (Meldungen, Ort, Parkplatz) an, ersetzen sie **unter der Uhr den QR-Code** der
  Visitenkarte (höchstens 4 Zeilen, darunter liegt das Rückmeldefeld); ohne Hinweise kommt der QR-Code zurück
- offen (später, Firmware): Briefsymbol mit Zahl in der Statuszeile, Liste als eigene Seite

**B. Rückfragen der App** mit den kleinen Eingaben (umgesetzt 15.11.2026, ohne Flashen)
- fest **Stufe 1 als App-Seite, nur Touch** (Markus): die App schickt den Sticky auf die Spielseite und zeichnet dort
  die Frage im Braun-Stil – **Ja/Nein** (zwei große Pillen, Ja als Doppelring), **Auswahl** (3–6 Zeilen),
  **Stufe 1–5** (fünf runde Knöpfe), hoch und quer nach der Lage der Spielseite. Ein Tipp = fertig, danach zurück auf
  die Seite von vorher. KI kurz = Home wie immer (= „nicht jetzt“). ▲/▼ bleiben Blättern (die Firmware reicht sie auf
  der Spielseite nicht durch)
- fest **nur fragen, wenn der Sticky ruht**: verbunden und auf Home oder Notiz, nie während eines Burgduells.
  Unbeantwortet nach **2 min** → zurück, Frage verfällt (kein Stapel)
- fest **erste Frage: „Parkplatz merken?“** Ja/Nein nach Fahrtende (Markus; „Wie war die Fahrt? 1–5“ vorerst nicht).
  Fahrtende = nach erkannter Fahrt (> 2 m/s) zwei Minutenprüfungen in Folge Stillstand. Ja → Notiz „Parkplatz“ mit Zeit
  und Ort (Liste und Bubble Log) und eine Zeile „Geparkt um 14:05“ auf Home; die fällt bei der nächsten Fahrt oder
  nach 24 h weg. Zum Ausprobieren: Mehr → Orte → „Test-Rückfrage“
- offen: steht der Micro länger als 2 min im Stau, fragt er schon dort – im Alltag beobachten
- offen (Stufe 2, Firmware): Rückfragen offline und mit ▲ = Ja / ▼ = Nein über den Baustein `eingabe.h` – erst wenn
  Stufe 1 im Alltag trägt

**C. Kontextseite je Ort** (umgesetzt 15.11.2026, ohne Flashen)
- fest **Orte selbst anlegen** (Mehr → Orte): je Zeile „Name; Breite, Länge; Ziel[; Umkreis m]“, Ziel Home, Notiz,
  Zettel 1–6 oder Bordbuch, Umkreis 150 m. „Hier merken“ hängt den aktuellen Ort als „Neuer Ort“ an, Name und Ziel
  passt man in der Liste an. Der **Micro** ist kein Ort, sondern „Fahrt erkannt“ → Notiz-Seite (Schnellknöpfe)
- fest **springt nur aus Home, einmal je Ankunft** (Markus): Prüfung jede Minute, solange verbunden (Fahrterkennung),
  Wegfallen erst ab dem 1,5-fachen Umkreis, ungenauer Ort (> 100 m) zählt nicht, unterwegs kein Ortswechsel. Wer
  weiterblättert, bleibt, wo er ist
- fest Home zeigt unter der Uhr **„Ort: Supermarkt“**, solange man dort ist
- offen (nicht naheliegend): **Akku, Reichweite, Tempolimit aus Bubble Log** – die Werte liegen in Bubble Logs eigener
  Ablage, die Sticky-App kommt nicht heran. Braucht eine Schnittstelle in Bubble Log (z. B. Rundruf „Fahrtstand“),
  also eine eigene Baustelle im Bubble-Log-Projekt
- offen (nicht naheliegend): **Termine** auf Home braucht Kalenderzugriff (neue Android-Freigabe, neues Plugin)
- offen (Stufe 2): **Karussell je Ort** (die App spielt beim Ortswechsel ein anderes `karussell.txt` auf) – das wären
  die Szenen aus „Nutzung“; kostet je Wechsel einen Abgleich
- offen: Orte und Fahrt werden nur geprüft, solange der Sticky verbunden ist (die Minutenschleife der Fahrterkennung)

### Anregungen aus dem Seeed-Playground (11.11.2026, seeedstudio.com/sticky/playground/firmware/)
Gesichtet: 38 Firmwares. Passend zu unserer Rolle (Handy-Erweiterung, Microlino), alles geparkt:
- **Erinnerung aus Diktat** (vgl. RxNudge, Followup): „dran denken, morgen gelbe Tonne“ (kam so auf der
  Testfahrt!) → App erkennt die Zeitangabe, Sticky piept (Summer GPIO48) und zeigt es zur Zeit an
- **Makro-Tasten** (vgl. Sticky Stream Deck): Touch-Raster als Fernbedienung fürs Handy: Musik, Navi nach
  Hause, Anruf, Bubble-Log-Aktionen. Passt zu den Knopf-Sätzen
- **Microlino-Status beim Parken** (vgl. Bus ETA, TRMNL, Moments): Akku, Reichweite, nächster Ladepunkt aus
  Bubble Log auf dem Startbild, bleibt ohne Strom stehen
- **Startbild mit Zitat** (vgl. CrossNext: Highlights auf dem Ruhebild): z. B. ein Spruch aus dem Weisheitsbuch
- **Handschrift-Notiz** (vgl. Handwriting Pad): Skizze per Finger, als Bild in die Notizen
- **EPUB-Leser** (CrossPoint/CrossInk, quelloffen): für E-Books allgemein; Lizenz prüfen, eher Ideen übernehmen
- **Smart Home** (Voice Companion, OpenDisplay, ESPHome): erst mit Home Assistant, eher Sache des EE05

### „App-Store“: Seitentypen aus der App (Markus, 12.11.2026, geparkt bis nach den Testwochen)
Grundgedanke: Jede „App“ für den Sticky ist nur ein Seitentyp, den das Handy rendert und aufspielt – die Firmware
zeigt Bilder und meldet Tasten. Neue „Apps“ = App-Update, kein Flashen. Vorschlag: nach 2–3 Wochen Alltag die eine
nehmen, die im Auto wirklich gefehlt hat, statt zu sammeln (Pflege!).
- ~~Wetter~~ → umgesetzt als Zeile auf der Home-Karte (12.11.2026, siehe unten)
- **Kalender/Tagesansicht**: nächste Termine aus dem Android-Kalender (Berechtigung nötig)
- **Microlino-Akku und Reichweite** aus Bubble Log (vgl. Ideensammlung „Microlino-Status beim Parken“)
- **Abfahrtszeiten** ÖPNV an der nächsten Haltestelle (offene API nötig)
- **Erinnerungen aus Diktat**, **Makro-Tasten**, **Zitat des Tages** (siehe Playground-Anregungen oben)
- **Einkaufszettel** mit Abhaken per Tipp (siehe Ideensammlung)
- ~~Kundenkarten (Lidl Plus u. Ä.)~~ → als Dummy umgesetzt 12.11.2026 (Karten in der Zettel-Reihe)
- **„Teilen → Sticky“** (Anregung zweite Meinung): aus jeder App über das Android-Teilen-Menü Bild, QR, Ticket oder
  Text als Zettel aufs E-Paper
- Technik dafür: ein Seiten-Register in der App (Name, Renderfunktion, Aktualisierungstakt, braucht Internet ja/nein),
  ein Modus „Seiten“ am Sticky mit ▲/▼ – erst bauen, wenn mehr als eine Seite gebraucht wird

### Teilen: „Beiboot“ verallgemeinert (Idee Markus, 11.11.2026, geparkt)
- Vorschlag: frühestens nach ~1 Monat im Alltag; „wie es ist“, kein Support-Versprechen, Forks willkommen
- Verallgemeinern: Visitenkarte und Knopf-Sätze als Vorlagen, Bubble Log optional, Bordbuch = „beliebiges
  PDF“. Microlino-Handbuch nie mitliefern (fremdes Urheberrecht)
- **Playground-Einreichung** (Registry github.com/Seeed-Projects/reterminal-sticky-playground-registry,
  Leitfaden `docs/contributing-firmware.md`): Formular → öffentlicher PR, Prüfung durch Seeed. Pflicht: Name,
  Kategorie, Satz ≤ 140 Zeichen, Version, Autor, Projektseite (öffentlicher Quellcode/Release), Foto am Sticky
  (1200×900), **Lizenz aus MIT, Apache-2.0, GPL-3.0, LGPL-2.1, BSD-3-Clause, CC-BY-4.0** (keine Empfehlung)
- Firmware: einzelne .bin je Offset (Bootloader 0x0, Partitionen 0x8000, otadata 0xE000, App 0x10000), je
  ≤ 16 MB, zusammen ≤ 32 MB → unser 32-MB-Image nicht als Ganzes, LittleFS-Inhalt nicht mitliefern (die App
  spielt die Seiten auf). Die APK kommt als GitHub-Release, auf der Projektseite verlinkt
  - Merker (Markus, 14.11.2026, Probe mit dem zweiten Sticky): **aus dem Playground geflasht ist der Sticky leer**,
    nur das Titel-Karussell; Menü, Widgets und Schrift kommen erst mit der APK. Für Fremde ohne APK zu wenig.
    Vorschlag: Grundausstattung (Menü, Uhr, Timer, Rechner, Umrechner, Strichschrift) in die Firmware backen und
    beim ersten Start nach /soll schreiben, wenn dort nichts liegt; mindestens im Playground-Text „braucht die APK“ sagen
    - umgesetzt (14.11.2026): `edc-sticky-sd-basekit-0.31.6.zip`, von der App aus einem leeren Profil gebaut
      (`window.__sticky.grundZip()`): Einstellungen (Karussell nur mit Seiten, die ohne App gehen), Hilfe, Schrift,
      alle Widgets, LIESMICH; nichts Persönliches. Release-Paket in `vermarktung/release-0.31.6/`
    - Einfacher (Markus, 14.11.2026): **Grundausstattung als ZIP für die SD-Karte** im GitHub-Release, „auspacken, Karte
      rein, fertig“. Geht ohne Firmware-Änderung, die Firmware liest /soll schon von der Karte. Vorlage: /soll vom
      Bastel-Sticky, aber ohne Persönliches (Bordbuch, Zettel, Kundennummern, Visitenkarte)
    - Befund (14.11.2026): der zweite Sticky kam **ohne microSD-Karte**. Ohne Karte legt die Firmware nur Home, Notiz
      und Bordbuch im Flash ab; Menü, Widgets, Schrift und Hilfe scheitern („ablage“). Mit Karte (30 GB, FAT32) lief
      alles durch. Für Fremde: im Playground-Text „microSD-Karte nötig“ sagen; langfristig Widgets auch im Flash ablegen
- Vorschlag Lizenz: **MIT**. Steht in Seeeds Liste, ist am einfachsten und passt zu den Bausteinen
  (whisper.cpp MIT, NimBLE und pdf.js Apache-2.0). Anders als bei der Uhrenbox (bewusst ohne Lizenz), weil
  Teilen hier heißt: andere dürfen es nutzen. fest: **MIT** (`LICENSE` im Repo)
- Leitfaden gelesen (11.11.2026), das Wichtigste:
  - Zwei Wege: **Quellcode** (`source/` mit LICENSE; Seeeds GitHub Actions bauen, Arduino wird unterstützt,
    Versionen festnageln: esp32-Core 3.3.12, Seeed_GFX2-Commit, NimBLE) oder **fertige .bin** mit `manifest.json`
    (Offset, Größe, SHA-256, `npm run create:manifest`). Je .bin ≤ 32 MB laut Leitfaden (Formular sagt 16 MB)
  - `firmware.json` streng (unbekannte Felder = Fehler), id in kebab-case, z. B. `sticky-beiboot`;
    `compatibility.devices` = `["reterminal-sticky"]`; Kategorie z. B. `productivity`
  - **Widerspruch:** Leitfaden nennt `flashSize` 16 MB, unser Gerät hat 32 MB und wir nutzen eine
    32-MB-Partitionierung. Vor dem Einreichen klären (Variante mit 16-MB-Tabelle, oder bei Seeed nachfragen)
  - Pflichttest am echten Sticky: erster Start, Hauptablauf, Touch + Tasten, Neustart + gespeicherter Zustand,
    USB neu verbinden, Installation wiederholen; Hardware-Revision, Versionen und Ergebnis in den PR
  - Keine Zugangsdaten im Image (haben wir nicht: kein WLAN, BLE ohne Schlüssel)
  - **Companion-App deckt der Leitfaden nicht ab.** Für die APK ggf. zusätzlich eine Karte als
    „External project“ (eigene Richtlinie: Ablauf erklären, Berechtigungen und Datenfluss offenlegen)
- Forum/Ankündigung nicht ins Repo, sondern nach `uhrenbox/Vermarktung/`

## Zwilling 2.0: Soll/Ist, SD-Karte als Vertrag, eigene Sensoren (Markus, 13.11.2026)

Anlass: seit 13.11. steckt eine 32-GB-microSD (Puffer läuft darauf, FW 0.9.1). Markus will das Zwillingsprinzip
verallgemeinern, mit sauberer Arbeitsteilung, und der Sticky soll alles nutzen, was er selbst mitbringt.
Vorbild: Device Shadow / Device Twin aus der Industrie (AWS IoT, Azure).

### Leitbild
- fest: **App = Gehirn, Sticky = Hand und Ohr.** Die App hat die Hoheit über Inhalte, Rendering (pixelgenau, das
  Zwillingsprinzip bleibt), Texte, Ort, Wetter. Der Sticky hat die Hoheit über seine Hardware und seine Roheingaben,
  bis die App sie quittiert hat
- fest: **Jeder kommt ohne den anderen aus.** Ohne Handy laufen Anzeige, Diktat, Notiz, Uhr, Sensoren weiter; ohne
  Sticky sind die Daten der App vollständig, er ist nur „nicht erreichbar“
- Vorschlag **Soll/Ist**: Soll (App → Sticky) = was er zeigen und können soll: Karten, Zettel, Bordbuch, Layouts,
  Einstellungen, Firmware. Ist (Sticky → App) = was er erlebt hat: Diktate, Notizen, Fahrtenschreiber, Messreihen,
  Zustand. Der Zwilling in der App = Soll + zuletzt gemeldetes Ist; Abgleich = Differenzen ausgleichen, beide Richtungen
- Vorschlag **Sensorhoheit beim Sticky, eigene Logik nur für sich selbst**: Entscheidungen über seine Energie und
  seine Reaktion (wach bleiben, schlafen, warnen) trifft er aus seinen Sensoren selbst. Inhaltliches bleibt in der App.
  Die App veredelt Ist-Daten (Ort, Fahrt aus Bubble Log, Wetter) und zeigt Verläufe

### Wie autark ist der Sticky? (Stand 15.11.2026, FW 0.37)
Die App ist Lieferant und Abholer, kaum noch Fernsteuerung. Das Handy ist nur noch zum Einrichten und Abholen nötig.
- **Läuft ohne Handy:** Uhr/Datum (eigene RTC, beim Verbinden gestellt) · Home, Zettel mit QR, Handbuch, Spickzettel
  (liegen auf der Karte) · Timer, Wecker, Weltzeit · Wasserwaage, Lineal · Rechner, Umrechner (FW 0.28) · Recorder,
  Tippen, Kritzelblock, Strichschrift · Diktat (ADPCM in `/ist/puffer`) · Ja/Nein und Ziffern · Fahrtenschreiber und
  Klima (Fahrterkennung per Lagesensor, Temperatur, Feuchte, Taupunkt) · Hoch/Quer automatisch und 180° · Menü mit
  Gruppen, Statuszeile, Tastenhilfe, Schlummer und Wecken · Einstellungen (Sprache, 12/24 h, Einheiten, Uhr)
- **Braucht das Handy zum Erledigen:** Spracherkennung (Diktat und Recorder werden erst am Handy Text) · Ort für
  Notizen (GPS) · Gegenseitig suchen · Push-to-Talk in die Zwischenablage · Wetter · Spiel (Thin Client)
- **Braucht das Handy zum Einrichten:** neue Zettel, Handbücher, Spickzettel, Widget-Bilder, Karussell, Lage,
  Lineal-Kalibrierung, Firmware-Updates
- **Grenzen allein:** Akku und Kartenplatz

#### Rechner und Umrechner lokal, gekapselt (Markus, 13.11.2026, umgesetzt FW 0.28.0)
- Vorschlag **Aufteilung wie Timer/Waage:** Die App liefert nur die Optik (Braun-Tasten als `bild.bin`, Knöpfe in
  `felder.txt` mit Aktion `taste <zeichen>`, Ziffernblatt mit `,` `−` `e` `M`); die Firmware rechnet
- Vorschlag **eigenes Modul `rechner.h`** in reinem C ohne Arduino-Abhängigkeit, schmale Schnittstelle
  (`rechnerTaste("7")`, `rechnerAnzeige()`), Logik 1:1 aus `rechner.js` (Kette, % wie Braun, M+/M−/MR/MC, √).
  Auf dem PC mit denselben Fällen testbar; die JS-Tests sind die Spezifikation. Die Widget-Maschine kennt nur
  „Taste gedrückt, Anzeige neu“
- Vorschlag **Umrechner** gleich mit: Paare als Zeilen in `felder.txt` (`paar km mi 0.621371`, `paar °C °F 1.8 32`),
  die Firmware rechnet nur `a · x + b`; neue Paare ohne Flashen
  - Merker (Markus, 14.11.2026): **Schrift im Umrechner darf größer** – Platz ist da
  - Merker (Markus, 15.11.2026 abends, am Gerät): **Umrechner – Optik der Pillen** nachschärfen, auffällig die Pille „km mi“ → FW 0.36.1: gewählte Pille in Pillenform invertiert statt eckig
- offen: kleine Rechenzeile („80 × 20 =“) braucht eine zweite Schrift, erst weglassen
- Aufwand grob ein halber Tag, ein Flash. Danach braucht der Sticky das Handy nur noch für Spracherkennung und GPS;
  die App-Seite (Thin Client) bleibt als Technik erhalten

#### Einstellungen am Sticky (Markus, 13.11.2026, umgesetzt FW 0.30.1)
- fest: Einstellungen, die man ohne Handy braucht, liegen auf einer eigenen Sticky-Seite „Einstellungen“; Standard
  kommt vom Handy, die Wahl am Sticky gewinnt und liegt auf seiner Karte
- umgesetzt: Uhrzeit auto/24 h/12 h, einheitlich für Home-Uhr, Statuszeile, Weltzeit, Wecker und App; Einheiten
  auto/metrisch/US (°C/°F, Lineal mm/Zoll); Uhr von Hand stellen (FW 0.31.0)
- Vorschlag später auf derselben Seite: 180° gedreht, im Schlummer findbar, Lage je Seite

#### Stiller Modus (Markus, 16.11.2026, Entwurf)
Anlass: Ton-Rückmeldung hilft, ist aber nicht diskret (Café, Besprechung).
- Vorschlag **Einstellung „Ton“** auf der Einstellungsseite, drei Stufen statt Lautstärkeregler:
  **an** (wie heute) · **nur Wecker/Timer** (Klicks und Bestätigungen still, Wecker und Timer-Ende piepen) · **aus**
  (alles still, auch Wecker – dann blinkt der Bildschirm kurz invertiert und ein Hinweis bleibt stehen)
- Vorschlag Standard: **an**; die App kann die Stufe je Szene setzen (z. B. Szene „Café“ = nur Wecker/Timer)
- Vorschlag **stille Rückmeldung**: Tipps quittiert schon der Rahmen ums Feld; dazu ✓ bzw. ! kurz in der Statuszeile
  für „gespeichert“/„Fehler“, solange der Ton nicht an ist
- verworfen: „leiser“ – der Piezo lässt sich nur grob übers Tastverhältnis dämpfen, klingt dann kratzig
- verworfen: Schnellschalter per Tastenkombination (keine neuen Gesten); zwei Tipps über die Einstellungen reichen
- offen: Lade-LED als stilles Signal? Laut Lab hängt sie am Ladechip (GPIO40 = „lädt“) – erst im Lab prüfen, ob die
  Firmware sie schalten kann
- Technik: ein zentraler Wrapper statt der vielen `tone()`-Aufrufe (Art des Tons: Klick, Bestätigung, Fehler, Alarm),
  der je Stufe entscheidet; Wahl auf der Karte wie die anderen Einstellungen

#### Zweisprachig Deutsch/Englisch (Markus, 15.11.2026, abgenommen: Seiten ziehen beim Verbinden nach, Englisch mit Dezimalpunkt)
Bestand: Die Firmware zeichnet selbst kaum Text (Startbild ohne App, „Aufnahme“, „Fehler“, Werte auf der
Einstellungs-Seite und im Wecker). Alles andere am Sticky (Home, Menü, Widgets, Tastenhilfe ▲+▼, Notiz-Layout,
Zettel, Bordbuch-Rahmen, Strichschrift-Spickzettel) rendert die App und legt es unter `/soll/` ab.
- fest: **eine** Sprache je Gerät, gleiches Muster wie 12/24 h und Einheiten: Standard vom Handy
  (`einstellungen/zeit.txt` „sprache de|en“), am Sticky überstimmbar auf der Einstellungs-Seite (auto → DE → EN,
  gespeichert in `/ist/zeit.txt` „spr -1|0|1“). Der Sticky gewinnt und meldet die wirksame Sprache im Zustand
  (`"en":0|1`, wie `us`)
- fest: Übersetzt wird nur die Anzeige. Log- und Protokolltexte, Dateinamen, Protokoll-Schlüssel, CSV-Köpfe und die
  Karussell-Wörter in `karussell.txt` bleiben deutsch
- Vorschlag **App**: Umschalter „Sprache: automatisch / Deutsch / English“ in den App-Einstellungen; automatisch =
  Sprache des Handys (Deutsch bei `de-*`, sonst Englisch). Er gilt für die App-Oberfläche und ist der Standard für
  den Sticky
- Vorschlag **Seiten auf dem Sticky** folgen der wirksamen Sprache des Sticky: Meldet er eine andere Sprache als
  die, in der die Karte bespielt ist, zeichnet die App Hilfe, Widgets, Menü und Home neu und gleicht ab (wie beim
  Wechsel auf US-Einheiten). Ohne Handy wechseln am Sticky sofort nur die Firmware-Texte; die gerenderten Seiten
  ziehen beim nächsten Verbinden nach. Begründung: Sprache wechselt man fast nie, doppelte Seiten auf der Karte
  hießen doppelte Übertragung bei jedem Abgleich
- Vorschlag **Firmware**: Muster aus dem Sticky Lab, globaler Schalter `EN` und `T("deutsch", "english")`; FreeSans
  kann nur ASCII, deshalb keine Umlaute in Firmware-Texten (bisher keine nötig). Startbild ohne App zweisprachig
  („Scan mich · Scan me“), weil dann noch keine Sprache bekannt ist
- Vorschlag **Zahlen**: Rechner/Umrechner auf Englisch mit Dezimalpunkt statt Komma (Taste `,` zeigt dann `.`)
- offen: Spracherkennung (whisper) in der App-Sprache statt fest Deutsch; Strichschrift-Umlaut-Tipp nur auf Deutsch?
  Erst einmal unverändert lassen
- offen: Handbücher/Spickzettel (Bordbuch-Inhalte) sind Inhalt, nicht Oberfläche, und bleiben, wie sie sind

#### Nächstes Flash-Paket: mehr lokal (Markus, 13.11.2026, geparkt)
Alles als neue Widget-Typen der Widget-Maschine: die App liefert Optik (Braun-Stil) und Einstellungen in `felder.txt`,
die Firmware rechnet. Ein Flash für alles.
- fest **im Paket:**
  - **Rechner und Umrechner** (siehe oben) – umgesetzt 13.11.2026, FW 0.28.0
  - **Weltzeit**: z. B. Tokio und zwei weitere Städte, Versätze aus `felder.txt` – umgesetzt 13.11.2026, FW 0.29.0
  - **Wecker/Erinnerung**: Uhrzeit oder „in 2 h“, piept auch im Schlummer (Uhrwerk des Timers) – umgesetzt 13.11.2026, FW 0.29.0
  - **Strichliste**: Tippen zählt hoch, lang tippen setzt zurück
  - **Klimakurve**: letzte 24 h Temperatur, Feuchte, Taupunkt als Grafik aus `/ist/mess` (Beschlag im Micro)
  - **Würfel/Münze** durch Schütteln (nebenbei)
  - **Tastatur** (Markus, 13.11.2026): für Kurzes, das man nicht sagen will (Parkplatz „P3 Reihe 12“, Namen, Nummern,
    Suchbegriff fürs Bordbuch). Quer QWERTZ, 10 Tasten je Reihe (~76 px), Ziffern-/Umlautreihe, Leertaste, Braun-Stil.
    Touch in eigener Aufgabe wie beim Kritzelblock: jeder Tipp sofort erfasst und mit Klick quittiert, die Textzeile
    zieht gesammelt nach (Teil-Refresh ~0,75 s). Ablage als Textnotiz in `/ist/notizen`, auch ohne Handy
  - **Strichschrift statt Tastatur zuerst probieren** (Markus, 13.11.2026, Anlass: Graffiti am Palm): ein Strich je
    Buchstabe, nah an der Druckschrift, ins Schreibfeld gemalt (Buchstaben links, Ziffern rechts). Erkennung im Sticky
    mit einem Einzelstrich-Erkenner (z. B. „$1-Erkenner“, eine Vorlage je Zeichen), ohne Handy. Passt besser zu E-Ink
    als Tasten: kein Refresh je Tipp, nur der erkannte Buchstabe erscheint. **Eigenes Strich-Alphabet** im gleichen
    Geist (keine Kopie des Palm-Originals), Spickzettel mit dem Alphabet; Wisch nach links = letzten Buchstaben löschen.
    Tastatur bleibt Plan B. **Umgesetzt 13.11.2026 (FW 0.27.0), am Gerät „klappt gut“**
  - Merker (Markus, 14.11.2026, beim Ausprobieren): **Spickzettel erst auf Tastendruck wieder ausblenden**, nicht von
    selbst – sonst ist er weg, bevor man nachgeschaut hat
    - erledigt (14.11.2026, FW 0.31.4): alle Hilfeseiten (▲+▼) bleiben stehen, bis eine Taste neu gedrückt wird; vorher
      schloss schon das Loslassen von ▲+▼ sie wieder
    - geprüft (14.11.2026, FW 0.31.5): alle Hilfeseiten gegen die Tastenlogik – Home (KI kurz = Menü, ▲ ▼ 1 s, KI 3× =
      Handy), eigene Hilfe für App-Seite und Lineal (Zoll), Tastenzeile bei Wecker/Einstellungen/Menü; lange Zeilen werden
      jetzt umbrochen statt mit „…“ abgeschnitten
  - Merker (14.11.2026): **„8“ und „B“ werden noch nicht zuverlässig erkannt** – Vorlagen bzw. Zweitformen nachschärfen
    (ähnliche Form, nur über Feld links/rechts getrennt)
- ohne Flash, reine App-Arbeit: **Kritzel-Texterkennung** – die App liest Kritzel-Notizen per Handschrifterkennung aus
  („Eier, Mehl“ wird zusätzlich eine Textnotiz); für Einkaufslisten schneller als Tippen
- später, eigenes Paket: **Schrittzähler** (Hardware-Schrittzähler im LSM6DS3; Zusammenspiel mit Bewegungswecken und
  Fahrterkennung prüfen), **Tagesbilanz** (Fahrten, Notizen, Diktate von heute aus dem Fahrtenschreiber)
- nicht lokal: **Spracherkennung** (Espressifs Offline-Befehle nur Englisch/Chinesisch, feste Befehle) und **Wetter
  über eigenes WLAN** (Akku, WLAN-Zugangsdaten als Pflegebaustelle; das Handy liefert Wetter beim Abgleich)

### Denkmodell: zwei Arten von Seiten (Markus, 13.11.2026)
- fest **App-Seiten** (z. B. Rechner): der Sticky ist **Thin Client** (Bildschirm + Eingabe, wie ein Terminal am
  Großrechner oder ein X11-Display). Logik und Zeichnen in der App, der Sticky meldet Tipper/Tasten und zeigt, was
  kommt. Ohne Handy gibt es sie nicht; jeder Tipp kostet Funk → App → Funk (~1 s)
- fest **eigene Seiten** (Home mit Uhr, Notiz, Kritzel, Bordbuch, Zettel, Diktat): der Sticky ist **eigenständiges
  Gerät**, zeichnet, reagiert und speichert selbst, auch ohne Handy. Die App ist nur **Lieferant** (`/soll`: Bilder,
  Bordbuch, Zettel, Hilfe, Karussell) und **Abholer** (`/ist`: Notizen, Diktate, Kritzel, Fahrtenschreiber, Messreihen)
- fest **Faustregel für neue Ideen**: muss es ohne Handy gehen (Timer im Micro, Uhr, Notizen) → eigene Seite (Firmware,
  später Baustein der Widget-Maschine); ist das Handy ohnehin dabei (Rechner, Tastatur, Nachschlagen) → App-Seite,
  ohne Flashen

### SD-Karte als Vertrag
- Vorschlag **alles ist eine Datei**, zwei Bereiche:
  - `/soll/…` schreibt nur die App (z. B. `/soll/home/`, `/soll/zettel/`, `/soll/bordbuch/`, `/soll/layout/`,
    `/soll/einstellungen.json`, `/soll/firmware.bin`)
  - `/ist/…` schreibt nur der Sticky (z. B. `/ist/puffer/` wie heute, `/ist/log/`, `/ist/mess/`, `/ist/zustand.json`).
    Die App holt ab, quittiert, dann löscht der Sticky
- Vorschlag **ein allgemeines Sync-Protokoll** statt der Spezialbefehle (HOME_VERSION, PUFFER_*, Bordbuch-Upload, …):
  `LISTE pfad` (Name, Größe, CRC) · `SCHREIBEN pfad` (in Stücken, CRC am Ende, erst dann umbenennen) · `HOLEN pfad
  offset` (wie PUFFER_HOLEN heute) · `LOESCHEN pfad`. Neue Funktionen = neue Dateien, kein neuer Befehl
- Vorschlag **Flash nur noch als Rückfall** ohne Karte (Home-Karte, Uhr-Ziffern, Visitenkarte), alles andere auf SD.
  Ganzes Handbuch (~150 Bildschirme) statt Auszügen wird damit möglich (bleibt privat auf der Karte)
- Vorschlag **Fahrtenschreiber** `/ist/log/JJJJ-MM-TT.txt`: Tasten, Verbindungen, App hört zu/nicht, Schlummern,
  Akku, Fehler. Erster kleiner Schritt, hätte die Rätsel vom 12./13.11. in einer Minute gelöst
- fest: SD am SPI-Bus des E-Paper, gleiche SPIClass wie das Display (`karte.h`); Karte vor dem Leichtschlaf stromlos

### Nutzung: der Kleine als Immer-dabei-Helfer (Markus, 13.11.2026)
- fest Motto: **„der EDC-Sticky“** (Everyday Carry: Schlüssel, Geldbeutel, Handy, Sticky)
- fest: Der Sticky ist **nicht nur Microlino-Zubehör**, sondern ein Helfer, den Markus überallhin mitnimmt.
  Der Microlino ist ein Einsatzort unter mehreren
- Vorschlag **Szenarien**:
  - **Microlino**: Bordbuch, Testnotizen, Fahrtenschreiber, Klima/Beschlag-Warnung
  - **Unterwegs ohne Handy-Blick**: Zettel (Einkauf, Erledigungen), Diktat in die Tasche, Uhr, Wetter vom Morgen
  - **Werkstatt** (Bambu, Laser, später CNC): Spickzettel/Maße auf dem Display, Diktat mit schmutzigen Händen
  - **Hütte/Renovierung**: Raumklima und Taupunkt als Messreihe (Schimmel-/Feuchte-Frage), Maße und Notizen vor Ort
  - **Schreibtisch/Nachttisch**: Tagesübersicht, Wecker, Schlafzimmerklima
- Vorschlag **Folge für die Architektur**: Einsatzorte als **Szenen** unter `/soll/szenen/` (Home-Karte, Tasten,
  Messintervall je Szene); der Sticky wechselt selbst (Bewegung: getragen vs. gefahren vs. liegt) oder per Taste,
  die App schlägt anhand des Orts vor. Alles bleibt offline nutzbar, Abgleich wenn das Handy wieder da ist
- Vorschlag **Messreihen tragen Szene und Ort** (Ort ergänzt die App beim Abholen), damit Hütte und Microlino
  nicht in einem Topf landen
- offen: Halterung/Hülle zum Mitnehmen (Druckteil Bambu: Clip für Microlino, Gürtel, Magnet für die Werkstatt)

### EDC-Ideen (Markus, 13.11.2026, geparkt)
Was der Sticky als Immer-dabei-Helfer noch können könnte, sortiert nach Aufwand. Favorit: „gegenseitig suchen“.
- Ohne Flashen (App-Seiten, Zettel):
  - **Lineal** am Displayrand (mm-Skala, einmal kalibrieren): Schrauben, Kabel, Uhrbänder (umgesetzt 13.11.2026, FW 0.26.0)
    - am Gerät bestätigt (Markus, 15.11.2026): **Lage passt** – beim Messen sind keine Tasten im Weg, nur der
      SD-Schlitz liegt an der Kante, und der stört nicht. So lassen
  - **QR-Seiten**: Gast-WLAN, Visitenkarte, Abholcodes; E-Ink zeigt QR gestochen scharf (umgesetzt 13.11.2026 als Zettel mit `wlan:`/`link:`/`qr:`)
  - **Notfallkarte** (Kontakt, Blutgruppe, Medikamente) als Zettel, nur auf dem Gerät
- Kleiner Flash (neuer Widget-Typ für die Widget-Maschine):
  - **Weltzeit** (z. B. Tokio und zwei weitere Städte)
  - **Strichliste** (Tippen zählt hoch)
  - **Würfel/Münze** durch Schütteln (Lagesensor)
- Etwas mehr:
  - **Gegenseitig suchen**: App „Sticky suchen“ lässt ihn piepen; KI 3× schnell lässt das Handy klingeln (umgesetzt
    13.11.2026, FW 0.25.1; offen: im Schlummer findbar, kostet Akku)
  - **Schrittzähler** über den Hardware-Schrittzähler im LSM6DS3 (stromsparend), Werte in den Fahrtenschreiber
  - **Parkplatz merken**: ein Tipp merkt den GPS-Ort vom Handy, optional Parkuhr-Timer
- Kaffee (Markus, 13.11.2026): **Timer-Vorlage „Kaffee“** mit fester Zieh-/Rührzeit, ein Tipp startet; passt zur
  USB-Rührtasse im EDC. Ohne Flashen machbar (Timer-Widget mit Vorgabe)
- Spiel (Markus, 14.11.2026, geparkt): **Artillerie-Duell (lite)**, Hommage an die Burgen-Duelle der Atari-ST-Zeit:
  zwei Burgen auf einem Hügelprofil, abwechselnd Winkel und Pulver wählen, Wind als Fähnchen, Treffer sprengen Steine
  weg. Passt zu E-Paper, weil rundenbasiert: pro Zug ein Teil-Refresh, Flugbahn als Punktspur. Bedienung mit ▲/▼
  (Winkel/Pulver) und Tippen (Feuer), zu zweit am selben Gerät. Eigener Name und eigene Grafik, kein Nachbau.
  Ohne Flashen kaum machbar (braucht Rechnung auf dem Sticky), also eigener Seitentyp in der Firmware
  - **Umgesetzt als Kür (14.11.2026): „Burgduell lite“** als App-Seite (`src/burgduell.js`, erster Reiter neben Rechner
    und Umrechner; Karussell-Wort „Spiel“): Vorlage Markus' Artefakt „Burgduell“, eigene Grafik. Schuss sofort durchgerechnet,
    gepunktete Bahn + Krater, ein Teilbild pro Zug; je Burg zwei Kanonen und König, Wind; Computer-Gegner in der App.
    Braucht das Handy. **Zwei Stickys (umgesetzt 14.11.2026):** zeigen beide die Spielseite, schaltet die App ins Duell –
    West am aktiven, Ost am Hintergrund-Sticky, nur wer am Zug ist, darf tippen, jedes Bild geht an beide. Dazu
    **Computer gegen Computer** (`__sticky.maschinenDuell()`, gleicher Computer-Spieler, Münzwurf entscheidet den Anfang):
    erstes Spiel 5695 gegen 559D, 5695 gewann nach knapp 3 min. „180° gedreht“ gilt jetzt je Gerät statt je Profil
  - **Burgduell lokal (FW 0.39.0, 15.11.2026, Markus: „Ballerburg ist Pflicht, auch ohne Handy“):** der Sticky rechnet
    selbst, übernommen aus dem Sticky Lab (Station 9, `firmware-ble/burgduell.h`). Karussell-Eintrag „Spiel“: **ohne Handy
    beim Betreten lokales Burgduell, mit Handy die App-Seite wie bisher** (Computer-Gegner der App, Duell zweier
    Stickys). Entschieden beim Betreten und bis zum Verlassen fest; geht das Handy mitten im App-Spiel weg, wechselt der
    Sticky ins lokale Spiel, kommt es während des lokalen Spiels, bleibt es lokal (Modus meldet „spiel“, die App
    zeichnet nicht drüber). Warum so und nicht „lokal immer, Duell als Knopf“: das Zwei-Sticky-Duell lebt komplett in der
    App (Zustand, Abwechseln, beide Bilder); ein Knopf im lokalen Spiel müsste den Spielstand an die App übergeben oder
    verwerfen, und mit Handy hat die App-Seite ohnehin den besseren Gegner. Spielstand bleibt im RAM, Zurückkommen
    setzt fort. Bedienung wie im Lab: Tippen ins Feld zielt (Richtung/Abstand = Winkel/Pulver), runde Regler ±5,
    Doppelring „Feuer“, ▲/▼ kurz = Winkel ±3°, Pille unten links „gegen Sticky“ (Standard) / „2 Spieler“; EDC-Tasten
    bleiben (KI kurz Home, KI halten Diktat, ▲/▼ 1 s Karussell). Zeichnen in ein 1-bpp-Sprite → imgBuf, damit
    Statuszeile, Hilfe (`hilfe/burgduell.bin`, ▲+▼) und 180°-Drehung wie überall gehen; je Zug ein Teil-Refresh,
    neues Spiel Voll-Refresh. Immer quer (Lage „app“ gilt nur für die App-Seite)
  - Nur Idee (Markus, 14.11.2026): **wenn Spiele, dann richtig**: auch Weltraum-Felsen-Ballern und Städte-Verteidigung
    (Raketen abfangen) im Stil der Arcade-Zeit, eigene Namen und Grafik. Haken E-Paper: Teil-Refresh ~0,3–0,75 s, also
    2–3 Bilder/s mit Geisterbildern. Vorschlag: bewusst langsame Fassungen („Zeitlupen-Arcade“: Welt bewegt sich nur
    in Ticks von ~0,5 s, Touch zum Zielen statt Tasten), alle paar Züge ein Voll-Refresh; erst mit dem Artillerie-Duell
    ausprobieren, wie sich Bewegung auf dem Panel anfühlt. Mögliche Sammelseite „Spiele“ im Karussell
- Nur Idee (Markus, 14.11.2026): **Sticky aus Titan** (EDC-Gral). Haken: Metall schirmt BLE/WLAN ab (Antennenfenster
  nötig), Titan ist nicht magnetisch (Stahlplättchen für den Microlino-Halter), Herstellung nur gefräst oder SLM-Druck
  per Dienst, grob mehrere hundert Euro. Einfacher: nur Titan-Rahmen/Bumper ums Seeed-Gehäuse, vorher Passform als
  Druck auf dem X1C testen; noch billiger PETG/PLA in Seidengrau mit Titan-Optik
  - Konkreter (Markus, 14.11.2026, beim Rumdösen): **Sleeve vom X1C** zum Überschieben, mit Extras wie einem
    **Bithalter** (1/4"-Bits) auf der Rückseite. Frei bleiben müssen Touchfläche, Tasten, USB und der Antennenbereich;
    Stahlplättchen oder Magnete für den Microlino-Halter gleich mit einplanen. Material z. B. PETG oder PLA in
    Seidengrau (Titan-Optik); passt zur Werkstatt-Seite (Lineal, Wasserwaage) – ggf. Lineal-Skala an der Kante
    Dazu (Markus): Steckplätze für **Victorinox-Ersatzteile** (Zahnstocher, Pinzette, Mini-Kuli wie bei der SwissCard),
    gibt es einzeln nachzukaufen; Schlitze mit leichter Klemmung, damit nichts klappert oder rausfällt
    Dazu (Markus): ein **kleiner Stylus** mit leitender Spitze (Touch ist kapazitiv, der Kuli geht nur auf Papier);
    hilft bei Strichschrift und Kritzelblock. Einen Mini-Stylus mit Gummi- oder Faserspitze im Format des Kulis kaufen,
    nicht selbst drucken (PLA leitet nicht)
    Ausgangspunkte (Playground „3D Printables“, 14.11.2026): **Referenzmodell** des Sticky (Hendra Kusumah, Printables –
    erspart das Vermessen), **Lanyard Case** (Kenta IDA, GitHub, offener Bumper, TPU- und PLA-Variante – Basis für Remix),
    **Case mit Magnetring-Ausschnitt** (Zoltan Szalontay; der MagSafe-Ring liegt dem Sticky bei → Microlino-Halter),
    **Wallet Case** (Dropthetenors). Vor einem Remix jeweils die Lizenz prüfen
    **Maße (aus dem Lanyard Case, github.com/ciniml/epaper-enclosures/sticky, CC BY 4.0 – Remix erlaubt mit Nennung
    Kenta IDA / ciniml; Werte aus Seeeds Hardware-Übersicht, Anschlüsse an einer Referenzhülle abgeglichen):**
    - Gehäuse 65,5 × 106,0 × 7,3 mm, Eckradius R2 (angenommen); Spiel je Seite 0,25 mm (XY), 0,2 mm in der Tiefe
    - Wand 1,6 mm; Rückenlippe 1,2 mm / 2,0 mm Überlappung; Frontlippe 0,8 mm / 1,0 mm Überlappung
    - rechts: KI/▲/▼-Tasten ab 27,5 mm von oben, 39,0 mm lang, 6,2 mm hoch; links: microSD ab 87,0 mm, 16,0 × 6,0 mm
      (Seitenfenster mittig auf 4,2 mm vom Rücken)
    - unten (x von der Mitte): Reset −19,4, Mikro −14,2 (je Ø 3,2), Original-Ösen −2,45 / +2,05 (3,0 × 4,8),
      USB-C + Lade-LED +14,75 (18,5 × 5,8)
    - Hinweis aus dem Projekt: eine Rückenlippe vergrößert den Abstand zum Magneten → Haltekraft am Ring sinkt; für den
      Microlino-Halter den Rücken offen lassen oder den Magnetring in den Sleeve einlassen

### Einfach-Profil für ältere Angehörige (Markus, 13.11.2026, geparkt)
Ein Sticky für jemanden, der mit Technik nichts zu tun haben will; gepflegt von einem Angehörigen aus der Ferne.
- Vorschlag **wenig statt viel**: 3–4 Seiten, große Schrift, jede Taste tut immer dasselbe, keine Menüs, keine Strichschrift
- Vorschlag **Uhr in Worten**: „Freitag, 13. November, Nachmittag“, groß auf E-Ink
- Vorschlag **Erinnerungen mit „Erledigt“**: Termine u. Ä., ein Tipp bestätigt; Angehörige sehen beim nächsten Abgleich,
  was bestätigt ist
- Vorschlag **Finden in beide Richtungen** und Notfallkarte mit Kontakt
- Vorschlag kein Konto, keine Cloud, keine Pflicht-Updates
- offen: eigene Firmware oder nur ein Profil (andere Seiten/Schrift) auf der bestehenden? Hängt davon ab, wer pflegt
  und ob ein Android-Handy in der Nähe ist (sonst Pflege nur beim Besuch per USB/Karte)

### Sprachnotizen 2.0 (Markus, 13.11.2026, abgenommen)
Heute: KI halten = Diktat, live an die App bzw. offline gepuffert, das Fold tippt offline ab, Ort und Zeit dran, alles
in eine Tagesdatei zum Teilen. Funktioniert, ist aber ein einziger Topf.
- fest **Ziele je Sorte**: Testnotiz → zur Fahrt in Bubble Log · Erledigung → Zettel · Idee/Gedanke → Obsidian-Vault
  (`Desktop\Claude\Wissen`) · Erinnerung → Kalender · Erzählung (länger) → Vault, Lebensstationen/Memoiren
- fest **Sortieren: das Handy entscheidet, Stichwort als Abkürzung**: aus Inhalt und Lage (fährt gerade → Fahrt-Notiz,
  klingt nach Einkauf → Zettel); Stichwort am Anfang („Einkauf:“, „Idee:“, „Erinnere mich …“) geht immer vor;
  unsicher → „Eingang“, abends räumt Claude auf
- Vorschlag **Kontext automatisch**: Ort (gibt es), dazu Fahrt ja/nein, Tempo und Akku aus Bubble Log, Szene, Klima
- Vorschlag **Rückmeldung am Sticky**: 5 s erkannter Text plus Ziel („→ Zettel: Milch, Schrauben M4“) als Teilbild;
  ▼ in diesen 5 s = „falsch, in den Eingang“. Offline weiter nur „✓ gespeichert“, die Rückmeldung kommt beim Abholen
- Vorschlag **Wiederfinden**: Seite „Heute“ im Karussell mit den letzten 5 Notizen als Text (ohne Handy nachlesen)
- Vorschlag **Qualität, Stufe 2**: offline abtippen wie heute; mit Netz glättet Claude nach (Eigennamen, Ortsnamen,
  Satzzeichen) und bestätigt Sorte und Ziel. Audio bleibt lokal, nur Text geht raus
- fest **Spracherkennung in drei Schichten** (Markus, 13.11.2026, nach Rechenstufen):
  1. sofort auf dem Fold: whisper small + kurzes Fenster + Wortliste wie heute (~1 s, offline, auch im Funkloch);
     liefert die 5-s-Rückmeldung am Sticky
  2. nachschärfen im Heimnetz: ist das Fold zu Hause, gehen die Audios des Tages ans Zenbook (RTX, faster-whisper
     large-v3-turbo), danach sortiert und glättet Claude nur den Text („Eingang aufräumen“)
  3. Cloud nur als Schalter, Standard aus (gpt-4o-transcribe, ElevenLabs Scribe, Deepgram Nova-3 oder Gemini mit
     Sortieren in einem Schritt; Kosten im Cent-Bereich pro Monat, vor der Wahl Preise neu prüfen). Haken: der Ton
     verlässt das Haus
- verworfen/geparkt: turbo auf dem Fold (6–60 s, Schleifen) · Android-Erkennung auf dem Gerät (Ton kommt per BLE,
  kaum Wortliste) · Vosk/sherpa-onnx (schwächer als small) · Whisper auf dem NPU des Fold (reizvoll, viel Pflege)
- geprüft **Wispr Flow** (Markus, 13.11.2026): passt nicht in die Sticky-Kette. Nimmt nur live vom Mikro auf, kein
  Datei-Upload; die offizielle API (REST/WebSocket, 16-kHz-WAV) gibt es nur nach Freischaltung für Firmenkunden;
  inoffizielle Nachbauten zu wackelig. Gut als eigenes Diktierwerkzeug am Zenbook und am Fold (Android-App seit 2026),
  ohne Sticky. Ton geht in deren Cloud (gleiche Abwägung wie Schicht 3)
- fest **lokales Modell flott machen** (Markus, 13.11.2026), Reihenfolge:
  1. Ton säubern: **erledigt** (seit 11.11. ×2 statt ×4, Hochpass 120 Hz zweistufig, weicher Begrenzer). Gemessen an den
     9 Fahrt-Aufnahmen vom 13.11.: 0 gekappt (vorher 7/16), Spitze −3,6 bis −11 dBFS, Störabstand 23–38 dB (vorher oft
     11–17), unter 150 Hz 1–4 % (vorher bis 47 %). Die Fehler kommen jetzt vom Modell, nicht vom Ton → keine
     Rauschunterdrückung (kann whisper bei sauberem Ton eher schaden)
  2. **umgesetzt 13.11.** lernendes Ersetzungswörterbuch nach der Erkennung (jede Korrektur von Markus oder aus Schicht 2 wird ein Paar,
     z. B. „Mikrolino → Microlino“), dazu Zahlenregeln (unplausible Prozente markieren). Wortliste im Prompt kurz halten
  3. nebenbei: deutsch nachtrainierte Whisper-Varianten in small-Größe gegen den Prüfstand testen (reiner Modelltausch)
  4. später: eigenes Nachtrainieren auf dem Zenbook, wenn genug Daten da sind (einige Stunden); Schicht 2 liefert die
     sauberen Texte als Trainingsdaten nebenbei
- fest **Notiz-Kette geräteunabhängig** (Markus, 13.11.2026): Anlass reSpeaker Clip von Seeed (tragbarer KI-Rekorder,
  nRF54, 2 PDM-Mikros, BLE, ~75–110 €). Jedes „Ohr“ meldet beim Verbinden Typ und Fähigkeiten (Display ja/nein,
  Puffer, Tasten) und liefert Ton im gemeinsamen Format (IMA-ADPCM 16 kHz in Paketen wie AUDIO heute). Abtippen,
  Wörterbuch, Sortieren und Ziele sitzen nur in der App. Clip jetzt nicht kaufen/bauen (zweite Firmware-Kette
  Zephyr/nRF Connect), später ein überschaubares Projekt: Kragen-Mikro, längere Aufnahmen; Display bleibt beim Sticky
- fest **Korrigieren am Zenbook mit Tastatur** (Markus, 13.11.2026): bequemer als am Fold. Vorschlag: hängt an Schicht 2.
  Ist das Fold zu Hause, kommen die Notizen des Tages aufs Zenbook (Weg offen: Syncthing-Ordner im Heimnetz, NAS oder
  adb), turbo + Claude legen eine Tagesnotiz in den Vault (`Wissen`, Obsidian). Markus korrigiert dort; der Abgleich
  vergleicht mit `roh`, lernt Paare ins Wörterbuch (`lernen()` aus `woerterbuch.js`) und schickt Wörterbuch und
  korrigierte Texte zurück aufs Fold. Bis dahin geht Korrigieren in der App-Liste
- offen: Transportweg Fold ↔ Zenbook (Vorschlag Syncthing, kein Cloud-Umweg)
- fest **kein Weckwort** („Hey Sticky“): kostet Strom, die KI-Taste reicht
- umgesetzt 13.11.: Sortieren mit Stichwort + Eingang (`sorte.js`, Schild in der Liste)
- offen: Reihenfolge (Vorschlag: 1. Sortieren mit Stichwort + Eingang, 2. Rückmeldung am Sticky, 3. Seite „Heute“,
  4. Claude-Nachbearbeitung, 5. Ziele Kalender/Vault/Bubble Log anbinden); Zettel aus Diktat = Bestellzettel oder
  eigener Erledigungszettel?

### Push-to-Talk (Markus, 13.11.2026)
- Ziel: KI am Sticky halten, sprechen, loslassen, und der Text landet dort, wo Markus ihn braucht, nicht nur in der Notiz
- fest **Weg 1, über die eigene App** (umgesetzt 13.11.2026): Schalter „Diktat zusätzlich in die Zwischenablage“ in
  „Mehr → Push-to-Talk“. Frisch und sicher erkannter Text geht in die Zwischenablage, die Notiz bleibt. Keine Firmware
- umgesetzt **Ziel Hauslurch** (16.11.2026, App, keine Firmware): Schalter „Diktat zusätzlich an den Hauslurch
  (Zenbook)“ mit Adresse und Schlüssel unter „Mehr → Push-to-Talk“, dazu „Verbindung testen“. Frisch und sicher
  erkannter Text (nicht „unklar“, nicht verspätet, nicht fürs Tippen) geht als `POST /befehl {"text"}` an den
  Hauslurch (`../hauslurch`, Port 8765). Nur Text, nie Ton. Der Lurch führt aus (Timer, Wetter, Qwen …), spricht am
  Zenbook und schickt die Antwort zurück: sie steht in der Aufnahme-Liste (🏠) und als Rückmeldung „Lurch: …“ am
  Sticky, nach dem „✓ Diktat“. Nicht erreicht → „Lurch nicht erreicht“.
  Entscheidung **die Notiz bleibt**: Sie ist das Netz, wenn das Zenbook aus ist oder das Fold nicht zu Hause, und die
  Notiz-Kette (Sortieren, Eingang, Tagesdatei) bleibt unverändert. Sie bekommt `ziel: "hauslurch"`, damit das
  Aufräumen reine Befehle („stell einen Timer …“) erkennt und weglassen kann.
  Technik: in der APK `CapacitorHttp` (nativ, ohne CORS), im Browser `fetch`; `usesCleartextTraffic` im Manifest,
  weil der Lurch im Heimnetz ohne https läuft. Weg: erst Heimnetz-IP, später Tailscale (Konto legt Markus an).
  Simulator-Ton pulsiert jetzt silbenartig, damit Diktate im Browser nicht als „unklar“ hängen bleiben
- umgesetzt **QR-Code abfotografieren** (Markus, 16.11.2026, „nie mehr IP-Adressen tippen“): Knopf unter dem
  Hauslurch-Schalter; die Hauslurch-Konsole (8) zeigt `sticky:hauslurch?adresse=…&schluessel=…`, das Foto füllt
  Adresse und Schlüssel, setzt den Haken und testet. Technik: Datei-Feld mit `capture` (Kamera-Recht im Manifest),
  Auswertung offline mit jsQR (`qrlesen.js`, auch hell auf dunkel), das Foto wird nicht gespeichert.
  Vorschlag: dieselbe Form `sticky:<art>?…` später für Orte, Spickzettel-Karten, Einstellungen fürs zweite Gerät
- geparkt **Weg 2, Sticky als BLE-Taste fürs Handy**: zweites BLE-Profil (HID, Consumer-Taste „Sprachbefehl“ bzw.
  Diktiertaste der Tastatur) neben dem eigenen Dienst. KI halten löst dann am Handy Assistent oder Tastatur-Diktat in
  jeder App aus; gesprochen wird ins Handy-Mikro. Mittlerer Aufwand (Kopplung, zweites Profil, Tastenregel)
- geparkt **Weg 3, Funk-PTT** (z. B. Zello): solche Apps kennen eigene BLE-PTT-Tasten; nur, wenn eine App unsere Taste
  annimmt. Eher Bastelei

### Spickzettel und Handbücher trennen (Markus, 13.11.2026)
Heute steckt beides im Bordbuch (Spickzettel, Handgriffe und PDF-Seiten mit einem Inhaltsverzeichnis). Künftig zwei
Seitentypen, beide eigene Seiten (gehen ohne Handy):
- fest **Spickzettel = flott und variabel**: kurze Karten (3–10 Zeilen), oft geändert (Felgen, Pannenhilfe, Handgriffe,
  Bestellungen). Eigener Karussell-Eintrag; erst Liste der Kartentitel (zuletzt benutzte oben), Tippen öffnet, ▲/▼ zur
  nächsten Karte. Pflege in der App (Textfeld), per Diktat („Spickzettel: Reifendruck vorne 2,2 bar“) und von Claude
  nach gelösten Fragen. Technik: eine Karte = eine Datei, nur Geändertes geht rüber
- fest **Handbücher = Dokumenten-Viewer**: große PDFs, nur lesen (Microlino, später Bambu, Laser, Wallbox …). Eigener
  Eintrag; Bibliothek → Inhaltsverzeichnis → Seite, ▲/▼ blättern, jedes Dokument merkt sich die letzte Seite,
  Lesezeichen per ▲ lang. Suche über die App: am Fold suchen, der Sticky springt auf die Seite (passt zur
  Handbuch-Suche aus der Session „handbuch-vektor“). Technik: `/soll/doku/<name>/` mit Seitenbildern und Inhalt;
  einmal ein allgemeiner Viewer in der Firmware (der Bordbuch-Code ist fast einer), danach neues Handbuch = neuer Ordner
- Vorschlag **mit Szenen**: Szene „Micro“ zeigt Microlino-Handbuch und Auto-Spickzettel, „Werkstatt“ Bambu-Handbuch und
  Werkstatt-Handgriffe
- Vorschlag: der Name „Bordbuch“ geht in diesen zwei Teilen auf (bleibt höchstens als Titel der Micro-Szene)

### Dokumente: App-Reiter als Dokumenten-Manager, Handbuch und Spickzettel getrennt (Markus, 15.11.2026, abgenommen)
Anlass (Markus): „Bordbuch ist eher File-/Doc-Manager?“ – ja; setzt „Spickzettel und Handbücher trennen“ (oben) um.
Mockup: `docs/dokumente-mockup.html`.
- Vorschlag **App-Reiter „Dokumente“** (EN „Docs“) statt „Bordbuch“: Liste aller Handbücher mit Seitenzahl und Größe,
  je Dokument Schalter „auf dem Sticky“, unten Platz auf der Karte (belegt/frei). „+ PDF“ lädt ein Handbuch (Datei
  wählen oder Teilen aus einer anderen App); die App rendert die Seiten wie heute fürs Bordbuch, legt sie unter
  `/soll/doku/<name>/` ab und baut das Inhaltsverzeichnis. Tippen auf ein Dokument: Inhaltsverzeichnis bearbeiten,
  Seite suchen („Reifendruck“ → Sticky springt hin), umbenennen, löschen
- Vorschlag **Spickzettel in der App** bekommen einen eigenen Abschnitt im selben Reiter (Karten-Liste wie in der
  Konsole, mit Szenen-Marken), nicht mehr im Handbuch versteckt; gepflegt wird bevorzugt am Zenbook (Konsole)
- Vorschlag **am Sticky in „Nachschlagen“**: Reiter **Handbuch · Spickzettel · Zettel**.
  - Handbuch: Bibliothek (Kachel je Dokument, zuletzt gelesenes vorn) → Inhaltsverzeichnis → Seite; ▲/▼ blättert,
    jedes Dokument merkt sich die letzte Seite; ▲ lang = Lesezeichen. Ein Dokument allein → gleich das Inhaltsverzeichnis
  - Spickzettel: Liste der Kartentitel (zuletzt benutzte oben), Tippen öffnet, ▲/▼ nächste Karte
  - Zettel bleibt, wie er ist
- Vorschlag **Technik**: einmal ein allgemeiner Viewer in der Firmware (der Bordbuch-Code kann das fast); neues
  Handbuch = neuer Ordner, kein Flashen. Das heutige Bordbuch wird beim ersten Start zum Dokument „Microlino“
  (Seiten bleiben im Flash bzw. ziehen auf die Karte um), Spickzettel und Handgriffe werden Karten
- Vorschlag **Szenen**: Micro zeigt Microlino-Handbuch und Auto-Spickzettel, Werkstatt Bambu-Handbuch und
  Werkstatt-Karten (Marken wie in der Konsole)
- fest (Markus): Handbuch-Seiten **auf der SD-Karte** (`/soll/doku/<name>/`), viel mehr Platz; das heutige Bordbuch
  zieht beim ersten Start aus dem Flash dorthin um
- fest (Markus): am Sticky heißt es **„Handbuch“** (EN „Manual“)
- fest (Markus, 15.11.2026 spät): Schalter in der App = **nur sichtbar in der Bibliothek**; die Seiten bleiben auf der
  Karte (Platz satt, 500 Seiten ≈ 24 MB), weil Hin- und Herschieben über Bluetooth (~8 kB/s) Zeit und Akku kostet.
  Von der Karte entfernt wird nur, was in der App gelöscht wird (umgesetzt App + FW 0.39.1)
- **gebaut 15.11.2026 (FW 0.38.0 + App, nicht geflasht)**: `firmware-ble/doku.h` ersetzt `bordbuch.h`, App
  `src/dokumente.js` (Logik, Zeichnen, Tests) und `src/dokumenteSeite.js` (Reiter). Ablage und Formate: `PROTOKOLL.md`
  „Dokumente“. Selbst entschieden:
  - Vorschlag (umgesetzt) **Die App zeichnet alles**, der Sticky schreibt nur Seitenzahlen selbst ins Bild („S. 87 / 212“
    in der Kachel, „Lesezeichen S. 87“ im Inhaltsverzeichnis; ASCII-Schrift der Firmware, Umlaute kann sie nicht). Neues
    Handbuch = neuer Ordner, kein Flashen
  - Vorschlag (umgesetzt) **Bibliothek**: bis 8 Kacheln, Reihenfolge nach „zuletzt gelesen“, wie die App es beim nächsten
    Aufspielen kennt; die zuletzt gelesene Kachel bekommt am Sticky sofort einen dicken Rahmen. Tippen auf eine Kachel =
    dort weiter, wo man war (neu: Inhaltsverzeichnis)
  - Vorschlag (umgesetzt) **Inhaltsverzeichnis** = Bildschirm 00 jedes Handbuchs, bis 14 Kapitel (zwei Spalten ab 8);
    automatisch aus den PDF-Lesezeichen, sonst aus der INHALT-Seite (Microlino), in der App als „Titel | Seite“ änderbar
  - Vorschlag (umgesetzt) **Bedienung**: Tippen auf eine Handbuch-Seite = Inhaltsverzeichnis (PDF-Seiten haben sonst nichts
    zum Tippen); ▲ 1 s auf einer Seite = Lesezeichen (zwei helle Töne), ▲ 1 s im Inhaltsverzeichnis = Bibliothek
  - Vorschlag (umgesetzt) **Spickzettel am Sticky**: Titel-Liste links in fester Reihenfolge (wie in der App, ein Fenster
    von 6 Titeln um die gewählte Karte), nicht „zuletzt benutzte oben“ – sonst müsste jede Karte bei jedem Blättern neu
    gezeichnet werden. Der Sticky merkt sich die zuletzt gelesene Karte
  - Vorschlag (umgesetzt) **Szene in der App**: Knöpfe „Alle · #micro · #werkstatt …“ über der Karten-Liste; aufgespielt
    werden die Karten der gewählten Szene (ohne Marke = immer). Damit ist Stufe 2 der Spickzettel-Konsole (Marken in der
    App) da; „Aus Zwischenablage übernehmen“ fehlt noch
  - Vorschlag (umgesetzt) **Handgriffe** werden einmalig Karten im Spickzettel (gleiche Titel nicht doppelt), das eigene
    Feld entfällt; die Standard-Karten tragen Marken (#micro, #notfall, #lab, #unterwegs)
  - Vorschlag (umgesetzt) **Umzug ohne Neuübertragung**: die Firmware benennt `/soll/bordbuch` in `/soll/doku/microlino`
    um; die App erkennt am Bestand (`stand.txt`), welche Seiten nur verrutscht sind, und lässt den Sticky sie umbenennen
    (`umbenennen.txt`), statt sie neu zu schicken. Im Simulator geprüft (8 verschobene Karten: nur 2 kleine Dateien)
  - Vorschlag (umgesetzt) **Suche**: in der App je Handbuch, Treffer mit Textstück, Tippen = der Sticky springt hin
    (`/soll/doku/sprung.txt`); die Vektor-Suche aus „handbuch-vektor“ kann später dieselbe Datei schreiben
  - Vorschlag (umgesetzt) **Platz**: die App zeigt, wie viel die Dokumente belegen und wie groß die Karte ist (Zustand
    `sdmb`); freier Platz wäre teuer zu messen (FAT-Scan)
  - geparkt **Teilen-Ziel** („Teilen → Sticky“ aus einer anderen App): braucht ein Capacitor-Plugin und einen
    Intent-Filter, nicht billig; bis dahin „+ PDF“
  - Hinweis: Dokumente brauchen FW ≥ 0.38.0; mit älterer Firmware bleibt im Karussell „Bordbuch“ stehen, der Reiter sagt,
    dass er die neue Firmware braucht. Vorschau (Spiegel) zeigt Handbuch und Spickzettel als Bildschirmfoto

### Spickzettel-Konsole: Karten am Zenbook pflegen (Markus, 15.11.2026, abgenommen)
Anlass: Karten am Fold abzutippen ist mühsam (heute: `sticky-lab/SPICKZETTEL-EDC.md` → App, Bordbuch-Tab → Spickzettel).
Am Zenbook mit Tastatur schreiben, in Sticky-Größe ansehen, dann rüber.
- fest **App = Gehirn**: Die Karten gehören weiter dem Spickzettel-Feld der App (`sticky.p.<profil>.spickzettel`, Format
  „## Titel“, darunter Zeilen, „!“ am Anfang = fett). Die Konsole ist nur Schreibtisch und Vorschau, sie spricht nicht
  selbst mit dem Sticky; aufgespielt wird wie bisher aus der App (Bordbuch „Aufspielen“)
- fest **Alle sammeln, je Szene nur die passenden vorbelegt** (Markus, 15.11.): der Vorrat darf wachsen, „bis er platzt“.
  Jede Karte trägt Szenen-Marken, z. B. `## Reifendruck #micro #notfall`; die Szene wählt aus, was auf den Sticky kommt
- fest **Ort**: neuer Reiter „Spickzettel“ in der Sticky-Console (`sticky-lab/console`, Edge am Zenbook, unterer
  Bildschirm). Die Console ist öffentlich (GitHub Pages), die Karten aber nicht: sie liegen nur im Browser-Speicher
  und in der lokalen Datei, nie im Repo
- Vorschlag **Bildschirm** (groß, Tastatur zuerst):
  ```
  ┌ Karten ──────────────┐ ┌ Karte ──────────────────────┐ ┌ Vorschau 800×480 (wie die App zeichnet) ┐
  │ Szene: [Alle][Micro] │ │ Titel  [Reifendruck       ] │ │ ███ Reifendruck ████████████████████   │
  │ [Werkstatt][Notfall] │ │ Marken [#micro #notfall   ] │ │ Reifendruck (Ladeklappe)               │
  │ ▸ Reifendruck  ↑↓    │ │ Zeilen (! = fett, 3–10)     │ │   Stahlfelge 13": 1,8 bar              │
  │   Sicherungen  ↑↓    │ │ [!Reifendruck (Ladeklappe) ]│ │   …                                    │
  │   Lab bedienen ↑↓    │ │ [Stahlfelge 13": 1,8 bar   ]│ └────────────────────────────────────────┘
  │ [+ Neue Karte]       │ │ 7 Zeilen · passt (26 px)    │ [Datei öffnen] [Speichern] [In Zwischenablage]
  └──────────────────────┘ └─────────────────────────────┘ [Aus Zwischenablage holen]
  ```
  Alt+↑/↓ sortiert, Strg+Enter neue Karte, Warnung ab 11 Zeilen bzw. wenn die Schrift unter 20 px schrumpfen müsste
- Vorschlag **Vorrat = die lokale Datei** `sticky-lab/SPICKZETTEL-EDC.md` (OneDrive, `.gitignore`): Edge öffnet sie
  einmal („Datei öffnen“) und schreibt sie zurück; Text vor der ersten Karte bleibt stehen. Das alte Format
  („## Karte 1: …“, „- “ als Aufzählung) liest sie mit und schreibt dann App-Format
- fest **Weg zum Sticky, Stufe 1 ohne neue APK**: „In Zwischenablage“ kopiert die Karten der gewählten Szene im
  App-Format, ohne Marken (die App kennt sie noch nicht); beim Zurückholen behalten Karten gleichen Titels ihre Marken; die geräteübergreifende Zwischenablage (Windows „Smartphone-Link“ ↔ Samsung „Kopieren und Einfügen
  zwischen Geräten“) bringt sie aufs Fold; dort im Spickzettel-Feld alles markieren → Einfügen → „Aufspielen“.
  Rückweg genauso: Feld kopieren → Console „Aus Zwischenablage holen“ (so kommen die Microlino-Karten aus dem
  App-Standard einmalig in den Vorrat)
- Vorschlag **Stufe 2 (App, später)**: Knopf „Aus Zwischenablage übernehmen“ neben dem Feld (Clipboard-Plugin ist schon
  drin) und Marken in der App: die App kennt die Szene und spielt nur deren Karten auf; dann kopiert die Console immer
  den ganzen Vorrat. Wartet, bis die Session „naheliegende Handy-Ideen“ aus `main.js` heraus ist
- Vorschlag **Notweg ohne Zwischenablage-Abgleich**: die Console zeigt die Karten als QR-Code, die Fold-Kamera liest
  ihn und bietet „Text kopieren“ an (reicht für ein paar KB)
- offen: Ist die geräteübergreifende Zwischenablage zwischen Zenbook und Fold an? (sonst erst einschalten oder QR)
- fest **Szenen-Marken zum Start**: `#micro #werkstatt #lab #notfall #unterwegs`, weitere durch Eintippen; Karte ohne
  Marke = in jeder Szene

### Bordbuch generisch: Objekte als Ordnung, Doku-Viewer für Notfälle (Markus, 13.11.2026, geparkt)
Weiterführung von „Spickzettel und Handbücher trennen“: geordnet wird nach **Objekten**, nicht nach Dokumentart.
- fest **ein Bordbuch pro Objekt** (Micro, Hruodland, Bambu, Hütte, NAS …) mit drei Teilen:
  **Handbuch** (PDF-Seiten, nur lesen) · **Spickzettel** (kurze Karten, oft geändert) · **Logbuch** (Einträge mit
  Datum: beim Micro Fahrten/Ladungen, bei der Uhr Zeitwaagen-Messungen, bei der Hütte Renovierungsschritte, beim NAS
  Backup-Prüfungen)
- fest **generischer Doku-Viewer für Notfälle zum Nachlesen**, auch ohne Objekt: offline auf der Karte, z. B. Erste
  Hilfe, Pannenhilfe/Notrufnummern, Verhalten bei Unfall, Sicherungen. Muss ohne Handy und ohne Netz gehen; schnell
  erreichbar (eigener Menü-Eintrag „Notfall“)
- Vorschlag **am Sticky**: Bibliothek → Objekt → Handbuch | Spickzettel | Logbuch; ▲/▼ blättern, jedes Dokument merkt
  sich die letzte Seite
- Vorschlag **Ablage**: `/soll/objekte/<name>/` mit `handbuch/` (Seitenbilder + Inhalt), `spick/` (eine Karte je
  Datei) und `log.txt`; Notfall-Dokumente unter `/soll/doku/notfall/`. Neues Objekt = neuer Ordner, kein Flash
- Vorschlag **Logbuch füllen**: Diktat „Micro: Reifendruck 2,2 bar geprüft“ landet im Logbuch des Objekts (die App
  erkennt die Sorte schon heute); Einträge, die der Sticky selbst schreibt (Fahrten), wandern über `/ist` dorthin
- Vorschlag: die **Szenen** fallen damit ab (im Micro steht das Objekt „Micro“ vorne)
- offen: Viewer einmal allgemein in die Firmware (der Bordbuch-Code ist fast einer), dann gehört er ins nächste
  Flash-Paket; private Handbücher und Notfalldaten nie ins Repo

### Handgriff-Spickzettel (Markus, 13.11.2026, Idee)
Anlass: Bose-Earbuds am Zenbook koppeln (Taste am Case, Bose-App „Gerät hinzufügen“), solche Handgriffe vergisst man.
- Vorschlag **Was einmal gelöst ist, wird ein Spickzettel**: kurze Anleitungen für Geräte und Abläufe, 3–6 Schritte,
  als Seiten im Bordbuch-Bereich (eigenes Kapitel „Handgriffe“) bzw. später als Szene „Unterwegs“/„Werkstatt“
- Vorschlag Kandidaten: Bose QC Ultra Earbuds an weiteres Gerät koppeln (Multipoint) · Fold per USB-Debugging ans
  Zenbook · Sticky flashen/Reset (Ab- und Anstecken, wenn GPIO0 klemmt) · Microlino Ladeziegel-Muster und Pannenhilfe ·
  NAS-Backup prüfen · Bambu/Laser-Grundeinstellungen · Wi-Fi im Café
- Vorschlag **Claude schreibt sie**: nach einer gelösten Frage bietet Claude an, den Handgriff als Spickzettel
  (Format „## Titel“ + Zeilen wie im Spickzettel-Feld der App) abzulegen; die App spielt ihn beim nächsten Abgleich auf
- umgesetzt 13.11.: eigenes Feld „Handgriffe“ in der App (`handgriffe.js` als Standard, öffentlich, nichts Privates),
  im Bordbuch nach den Spickzetteln
- offen: ob sie im Karussell einen eigenen Eintrag bekommen; Private Handgriffe nur im App-Feld, nie im Standard

### Widgets (Markus, 13.11.2026, Ideensammlung)
- Vorschlag **Weiche**: Was sich sekündlich ändert, rechnet und zeichnet der Sticky selbst (offline); die App liefert
  nur Hintergrundbild und Ziffernsatz, der Sticky setzt die Ziffern ein (wie heute die Uhr)
- Vorschlag **Mechanik**: ein Widget = ein Ordner `/soll/widgets/<name>/` mit Hintergrundbild, `felder.txt` (wo Zeit,
  Zähler, Libelle, Tastenfeld sitzen) und Ziffernsatz. Der Sticky bekommt einmal eine kleine Widget-Maschine, danach
  ist jedes neue Widget nur ein neuer Ordner („neue Funktion = neue Datei“)
- Ideen, Sticky allein (offline):
  - **Timer/Stoppuhr** (▲ Start, ▼ Stopp, KI zurück, Summer am Ende; Vorlagen Eieruhr, Pomodoro, Bambu-Nachkühlen)
  - **Parkuhr** im Micro: beim Abstellen einmal drücken → „seit 14:05, noch 38 min“ (Erinnerung, keine Parkscheibe)
  - **Wasserwaage** aus dem Bewegungssensor (Blase + Grad), für Werkstatt und Hütte
  - **Schrittzähler** (im LSM6DS3 eingebaut, fast stromlos) · **Strichliste** per Touch · **Würfel/Münze** per Schütteln
  - **Taschenrechner** mit Touch-Tastenfeld, rechnet auf dem Sticky (aufwendigster Punkt)
- Ideen, gemischt: **Weltzeituhr** (Tokio, New Jersey, Jacksonville, L.A.; Karte aus der App, Ziffern vom Sticky) ·
  **Klimaverlauf** 24 h mit Taupunkt-Linie (Daten aus `/ist/mess`)
  - → ausgearbeitet in „Weltzeit mit Karte“ (16.11.2026, unten bei den Widgets)
  - Merker (Markus, 15.11.2026 spät): **Weltzeit als Globus-Ansicht** fürs e-Paper – Erdkugel (gerastert, Braun-Stil)
    mit Tag/Nacht-Grenze und den Städten als Punkte mit Uhrzeit; die App rendert Kugel und Schatten z. B. viertelstündlich,
    der Sticky setzt nur die Ziffern ein (wie heute). Idee, nicht entschieden
- Ideen, aus der App: **Tagesübersicht** (Termine, Wetter, Micro-Akku aus Bubble Log) · **Hanshin-Tigers-Ergebnis**
- fest **Eingabe am Sticky nur für Kleinkram** (Markus, 13.11.2026): längere Texte tippt man am Fold/Zenbook oder
  diktiert. Am Sticky:
  - **Zahlenfeld** (Touch, große Tasten, Teil-Refresh je Taste): Minuten für den Timer, Zähler, kurze Zahlen
    → aufgegangen in der Art „Ziffern“ des Bausteins Eingabe (15.11.2026)
  - **Kritzelblock**: mit dem Finger auf dem E-Paper zeichnen (Striche gesammelt alle ~200 ms per Teil-Refresh),
    ▼ = speichern nach `/ist/kritzel/JJJJ-MM-TT-hhmmss.bin`, die App holt es ab und legt es als Bild-Notiz ab
    (später ggf. Handschrift erkennen). Eigener Eintrag im Karussell
  - geparkt: BLE-Tastatur am Sticky (geht technisch, ESP32 als HID-Empfänger; Bastelprojekt); USB-Tastatur geht nicht
    (USB hängt am CH343-Wandler, nicht am ESP32)
- Vorschlag **erster Schwung**: Timer/Stoppuhr, Parkuhr, Wasserwaage (billig, zeigen die Mechanik, im Micro nützlich)
- fest **Widgets ohne ständiges Flashen** (Markus, 13.11.2026):
  - **mit Handy**: geht im Prinzip schon heute (App bekommt Tipper und Tasten, schickt Bilder/Teilbilder; ~1 s je Tipp).
    Fehlt ein Karussell-Eintrag „App-Seite“, der ▲/▼ und Touch an die App durchreicht, statt weiterzublättern →
    letztes kleines Firmware-Update, danach Taschenrechner, Tastatur u. Ä. rein in der App
    → umgesetzt 13.11. (FW 0.17.0), erstes Widget Taschenrechner, ~1 s je Tipp
  - **ohne Handy** (Timer im Micro): einmal eine **Widget-Maschine mit festen Bausteinen** (Countdown, Stoppuhr,
    Zähler, Zahlenfeld, Rechner); die App liefert Bild + `felder.txt` unter `/soll/widgets/<name>/`, neue Widgets sind
    danach nur Dateien
    → umgesetzt 13.11. (FW 0.18.x) mit Countdown/Stoppuhr; erstes Widget Timer
  - dazu **Firmware-Update von der Karte** (`/soll/firmware.bin`, OTA-Partitionen vorhanden) als Sicherheitsnetz:
    künftige Updates per App statt Kabel
  - geparkt: Skriptsprache auf dem Sticky (z. B. Berry wie in Tasmota), maximal flexibel, aber zu viel Dauerpflege
- offen: Wie man zwischen Widgets wechselt (eigener Modus mit ▲/▼ wie die Bestellzettel?); Reihenfolge nach den Szenen
  oder davor

### Weltzeit mit Karte (Markus, 16.11.2026, abgenommen)
Anlass: Merker „Globus-Ansicht“ – „das kann e-Ink ab“. Mockup: `docs/weltzeit-mockup.html`.
- Vorschlag **flache Weltkarte statt Kugel**: eine Kugel zeigt nur die halbe Erde, Tokio, Europa und L.A. wären nie
  zugleich sichtbar. Flache Karte (Plattkarte) mit Tag/Nacht-Schatten wie eine Geochron-Uhr, alle Städte auf einen Blick
- Vorschlag **Aufbau quer**: Karte oben (800 × 300), darunter die Städte als Reihe (Kürzel, Uhrzeit groß, Tag ±1,
  ☀/☾ je nachdem, ob dort Tag ist); hochkant Karte oben schmaler, Städte als Liste
- Vorschlag **Stil**: Land gerastert (feines Punktraster), Meer weiß, Nacht als dunkleres Raster über allem, Tag/Nacht-
  Grenze als weiche Kante; Städte als schwarzer Punkt mit weißem Ring und Kürzel (HIER, TYO, NJ, JAX, LA); „HIER“ betont
- Vorschlag **wer rechnet was**: die App liefert einmal die Landkarte (gemeinfreie Weltkarte, z. B. Natural Earth,
  als 1-bpp-Raster) und die Städte mit Länge/Breite; der **Sticky rechnet den Schatten selbst** (Sonnenstand aus der
  Uhrzeit, je Kartenspalte die Grenze) und frischt ihn alle 15 min per Teil-Refresh auf – geht offline, bleibt richtig.
  Ziffern setzt er wie heute selbst ein
- Vorschlag: bleibt das Widget „Weltzeit“ (Gruppe Zeit); die heutige Liste entfällt zugunsten der Karte
- fest (mit der Abnahme): Kartenmitte **Greenwich** (Europa mittig, vertraut)
- Vorschlag Strom: wach alle 15 min, im Schlummer nur zur vollen Stunde (im vorhandenen Stundenfenster); nach Messung im Lab ggf. anpassen
- umgesetzt **Stufe 1** (App, 16.11.2026): `src/weltkarte.js` zeichnet Karte und Schatten beim Abgleich (quer), Kacheln
  je Stadt mit Ziffernfeld; „HIER“ sitzt am letzten Wetter-Ort (bleibt im Gerät). Schatten steht ohne Handy still bis
  zum nächsten Abgleich. Hochkant bleibt vorerst die Liste. Stufe 2 (Sticky rechnet den Schatten) folgt
- fest (Markus, 16.11.2026, am Gerät): **hochkant bleibt die nüchterne Liste, quer die Karte** – zwei Gesichter je nach
  Lage („wirkt cooler und bietet entweder nüchtern oder aufgepeppt“); mit Lage „auto“ wechselt man durchs Drehen

### Bedienung und Oberfläche (Markus, 13.11.2026, Mockup abgenommen)
- fest **Tastenregeln überall gleich**: KI kurz = Home, KI halten = Diktat (Rettungsanker, nie anders belegt);
  ▲/▼ = blättern in dem, was gerade zu sehen ist; Tippen aufs große Feld = Hauptaktion (Start/Stopp, „jetzt geparkt“).
  Löst die heutige Sonderbelegung ab (▲ auf Home = Bordbuch, ▼ auf Home = Bestellzettel)
- fest **Karussell statt Menü, je Szene**: von Home aus mit ▲/▼ durch eine feste Reihe; die Szene legt Reihe und
  Reihenfolge fest, eingestellt in der App, am Gerät kein Menü. Punktestreifen unten zeigt die Stelle.
  Beispiele: Micro Home → Parkuhr → Timer → Notiz → Bordbuch → Zettel · Werkstatt Home → Timer → Waage → Spickzettel ·
  Unterwegs Home → Zettel → Weltzeit → Strichliste. Home zeigt unten „Szene: …“
- fest **Schlafbild muss ohne Strom stimmen**: was beim Einschlummern stehen bleibt, braucht keine Aktualisierung
  (Parkuhr „geparkt um 14:05, Scheibe bis 15:05“ statt Countdown; Uhr minutengenau); Zzz in der Statuszeile
- fest **eine Statuszeile**: links Uhr (bzw. Seitenname), rechts Handy verbunden, offene Notizen mit Zahl, Akku, bei
  Bedarf Warnzeichen (Beschlag, Laden zu kalt/heiß), im Schlaf Zzz statt Handy. Zeichnet der Sticky selbst
- fest **Menü** (umgesetzt 13.11., FW 0.19): KI kurz auf Home öffnet Kacheln je Karussell-Eintrag, Tipp springt hin
- fest **Braun-Stil für alle Bedienelemente** (Markus, 13.11.2026, Vorbild Braun BNE001/ET66): runde Tasten bzw.
  Pillen, Rolle statt Farbe (Hauptaktion Doppelring, Zahlen/Auswahl schwarz, Werkzeug gerasterter Rand, Nebensache
  dünner Ring), ruhige Helvetica-artige Schrift. Ein Modul für alle Seiten (`sticky-app/src/braun.js`)
- fest **Knöpfe einheitlich groß** (Markus, „Wurstfinger“): Kopf-Knöpfe/Reiter 58 px hoch, mind. ~120 × 58 px
- fest **Tastenhilfe**: ▲ und ▼ gleichzeitig zeigt, was die Tasten auf dieser Seite tun (auch für Übergabe)
- Vorschlag **Rückmeldung**: Klick sofort (gibt es), dazu Rahmen ums gedrückte Feld per Teil-Refresh (~0,3 s),
  Sanduhr in der Statuszeile bei allem über 1 s
- Vorschlag **Lesbarkeit im Micro**: Mindestgröße ~28 px für Fahr-Infos, nur Schwarz/Weiß, dicke Linien
- fest **Hoch/Quer in zwei Stufen** (Markus, 13.11.2026, Mockup im Chat):
  1. **pro Seite einstellbar in der App** („Mehr“), Vorgaben: Home, Notiz, Rechner hochkant; Bordbuch, Zettel, Timer,
     Waage quer; Menü nach Wahl. Dazu Schalter „180° gedreht“ (Einbaulage im Micro). Die App rendert ohnehin in
     Display-Koordinaten und liefert die Knopf-Felder mit; die Firmware braucht je Seite nur die Lage (Statuszeile,
     Ziffern-Einsetzen bei Timer/Waage, Kritzel-Knöpfe). Ablage: Lage je Seite in `/soll/einstellungen/lage.txt`
  2. **danach automatisch per Lagesensor**: jede Seite liegt in beiden Lagen auf der Karte, der Sticky nimmt beim
     Drehen die passende (Voll-Refresh). Baut auf Stufe 1 auf, kostet doppelt Speicher und Übertragung
  - Stand: Stufe 1 umgesetzt (FW 0.21.0, 13.11.2026), ohne „180° gedreht“ (eigener kleiner Schritt). Stufe 2 als
    Lage „automatisch“ je Seite (FW 0.22.1): Hysterese 30°/60°, flach bleibt die Lage, bemaltes Kritzelblatt bleibt.
    „180° gedreht“ umgesetzt (FW 0.23.0): zentral an der Ausgabe, Schalter in der App
- später: hoch/quer automatisch über den Bewegungssensor (jede Seite in beiden Lagen, doppeltes Rendern in der App)
- Tastenregeln und Karussell (FW 0.13.0), Statuszeile (0.14.0), Tastenhilfe und Tipp-Rahmen (0.15.0) umgesetzt ( Szenen noch nicht: ein Karussell für alles)
- Reihenfolge: Tastenregeln, Karussell, Statuszeile zuerst (Grundlage für die Widgets), dann Schlafbild-Regel,
  Rückmeldung, Hilfe
- **Blick von außen** (Markus, 15.11.2026): was geht ohne Handy? Fast alles: Widgets, Notiz/Diktat/Kritzel/Schrift
  (gepuffert), Bordbuch, Zettel. Nur **Spiel** braucht das Handy (rechnet die App), dazu Benachrichtigungen;
  Wetter auf Home veraltet still. **Seit FW 0.39.0 geht auch Spiel ohne Handy** (Burgduell lokal gegen den Sticky),
  nur das Duell zweier Stickys braucht die App
  - fest (umgesetzt FW 0.31.8): **Handy-Zeichen auf Menü-Kacheln**, die nur verbunden gehen (bis 0.38.0: Spiel; seit
    0.39.0 keine mehr, `NUR_MIT_HANDY` in `sticky-app/src/widgets.js` ist leer)
  - fest (umgesetzt FW 0.31.8, abgelöst durch 0.39.0): **Hinweisseite statt stummem Rücksprung**: Spiel ohne Verbindung
    zeigte „braucht das Handy“; jetzt startet das lokale Burgduell (`hilfe/offline.bin` baut die App nur noch für ältere
    Firmware)
  - fest (umgesetzt): **Spielseite nur noch Burgduell** – Rechner/Umrechner gibt es als eigene Widgets (ohne Handy)
  - fest (umgesetzt): **ein Name je Sache, der vom Sticky**: Zettel (App-Reiter hieß „Bestellen“), Spiel (statt
    „App-Seite“), Kritzel (statt „Kritzelblock“)
  - Vorschlag: Statuszeile zeigt **Zeit des letzten Kontakts** („📱 08:44“) statt „verbunden“ – e-Ink behält sonst
    ein falsches „verbunden“ (15.11.: Akku leer, Bild blieb stehen)
  - Vorschlag: App-Reiter **„Mehr“ in zwei Gruppen**: Einrichten (Stickys, Karussell, Lage, Benachrichtigungen,
    PTT) und Werkstatt (Spracherkennung, Wörterbuch, Fahrtenschreiber, Ereignisse)
  - Vorschlag: **Karussell mit Häkchen und Pfeilen** statt Textfeld (Tippfehler fallen heute stumm raus),
    Handy-Zeichen gleich dabei
  - Vorschlag: Wetter auf Home mit Uhrzeit des Stands, ab ~3 h alt ausgegraut

### Gruppen im Menü: Werkzeuge mit Reitern (Markus, 15.11.2026, abgenommen)
Anlass: 15 Kacheln im Menü sind zu viele; manches gehört zusammen (Waage und Lineal, Rechner und Umrechner).
Mockup: `docs/gruppen-mockup.html`.
- fest **Weg A: Reiter statt Untermenü**: eine Kachel je Gruppe; im Werkzeug oben Reiter der Gruppe („Waage · Lineal“),
  Tippen wechselt. Gleiches Muster wie die Eingabe-Arten (Tasten · Ziffern · Strich · Sprache). Untermenüs (Weg B)
  verworfen: ein Tipp mehr für zwei, drei Werkzeuge
- Vorschlag **Gruppen** (Standard, in der App änderbar wie das Karussell):
  | Gruppe | Werkzeuge |
  |---|---|
  | Home | Home |
  | Zeit | Timer · Wecker · Weltzeit |
  | Messen | Waage · Lineal (später Winkel aus dem Bewegungssensor) |
  | Notieren (vorher „Schreiben“) | Recorder · Kritzel · Schrift (Notiz-Knopfseite nur per Häkchen) |
  | Rechnen | Rechner · Umrechner (eine Gruppe, fest) |
  | Nachschlagen | Handbuch · Spickzettel · Zettel (seit FW 0.38.0, „Dokumente“; vorher Bordbuch · Zettel) |
  | Spiel · Einstellungen | je allein |
  → 8 Kacheln statt 15
- Vorschlag **▲/▼ bleibt flach**: das Karussell geht weiter durch jedes Werkzeug einzeln (heutige Reihenfolge, nach
  Gruppen sortiert); am Reiter sieht man, wo man ist. Damit gilt „▲/▼ = blättern“ unverändert, und am letzten Reiter
  geht es in die nächste Gruppe. Gruppen ordnen nur Menü und Reiter
- Vorschlag **Menü-Kachel = zuletzt benutztes Werkzeug der Gruppe** (merkt der Sticky, nicht die App); neue Aktion
  `gruppe <i0> <i1> …` in `felder.txt`, die Firmware springt zum zuletzt besuchten Index daraus
- fest (Markus, 15.11.2026) **ein Ziffernfeld für alles**: Rechner, Umrechner und die Eingabe-Art „Ziffern“ zeigen
  dasselbe Tastenfeld im ET66-Stil – gleiche Tasten an gleicher Stelle (7-8-9 oben, 0 unten Mitte, rechte Spalte für
  Sonder-/Rechentasten). Wer eins kann, kann alle; die App zeichnet es aus einem gemeinsamen Baustein
  - umgesetzt (15.11.2026, App): `ziffernfeld()` in `widgets.js`, 4 × 4 gleiche Zellen: 7-8-9 / 4-5-6 / 1-2-3 /
    [links 0 rechts], rechte Spalte; bei drei Einträgen geht der letzte (Hauptaktion) über zwei Reihen. Rechner: Kern
    rechts unten im 5er-Raster, rechts ÷ × − +, unten „, 0 =“ (Komma und 0 getauscht, damit die 0 in der Mitte sitzt),
    Speicherreihe und √ % ⌫ C bleiben außen. Umrechner: rechts C, ⌫, ⇄; unten „± 0 ,“. Ziffern: rechts Sondertaste, ⌫,
    OK – ⌫ und Hauptaktion sitzen bei Umrechner und Ziffern an derselben Stelle. Firmware unverändert (Tasten per Name)
- fest (Markus, 15.11.2026) **jedes Werkzeug behält seine Lage**: wechselt der Reiter von Waage (quer) zu Lineal
  (hochkant), dreht das Bild mit (voller Refresh ~2 s). Der Sticky ist träge genug, dass das nicht nervt; mit Lage
  „auto“ entscheidet wie bisher der Lagesensor
- Vorschlag **Zeichnen**: die App malt die Reiter in den Kopf jedes Widget-Bilds (Rolle wie Auswahl: aktiver Reiter
  schwarz gefüllt) und legt je Reiter ein Knopffeld `gehe <i>` an – dafür braucht die Firmware nichts Neues. Nur
  Home behält seinen Kopf ohne Reiter
- Vorschlag **Szenen** wählen künftig Gruppen statt einzelner Seiten (Micro: Home, Zeit, Schreiben, Nachschlagen)
- offen: Spiel und Einstellungen als eigene Gruppen oder unter „Mehr“? (Vorschlag: eigene Kacheln, ist ja nur zwei)
- offen: Hilfe ▲+▼ zeigt die Reiter der Gruppe mit?
- umgesetzt FW 0.36.0 + App (15.11.2026): `sticky-app/src/gruppen.js` (Gruppen, Menü-Kacheln, Reiter; Test
  `tests/gruppen.test.js`), Menü mit einer Kachel je Gruppe (Name groß, Glieder klein), Aktion `gruppe <Bitmaske>`;
  die Firmware merkt sich im RAM, welches Glied zuletzt besucht wurde (`kBesucht`, nach Neustart wieder das erste).
  Reiter quer im Kopf links neben der Statuszeile (max. 416 px). Abweichung: **hochkant** ist neben der Statuszeile
  nur Platz für eine Pille „Rechner ›“, Tippen = nächstes Glied. Reiter gibt es nur auf Widgets (Timer, Wecker,
  Weltzeit, Waage, Lineal, Rechner, Umrechner, Recorder); Notiz, Kritzel, Schrift, Bordbuch und Zettel zeichnen ihren
  Kopf anders und bleiben ohne Reiter – die Gruppe gilt dort nur im Menü
- umgesetzt App (15.11.2026, Markus: „Mehr → Karussell mit Gruppen unklar“): **Karussell als Liste nach Gruppen**
  statt Textfeld (`src/karussellListe.js`): Gruppen-Blöcke mit Häkchen (drin/raus) und Pfeilen (Gruppe bzw. Werkzeug
  höher/tiefer), Home immer an und oben. Gespeichert wird weiter die Wortliste. Einmalig wird der Recorder in ältere
  eigene Listen hinter die Notiz eingetragen
- fest (Markus, 15.11.2026 abends): Gruppe **„Notieren“** (EN „Capture“) statt „Schreiben“ – mit dem Recorder
  schreibt man nicht; „Notieren“ passt auf Text, Ton, Bild und Strich

### Eingabe: Tasten, Ziffern, Strich, Sprache (Markus, 15.11.2026, abgenommen)

Anlass: Das Sticky Lab (Station 10) zeigt, dass eine Bildschirmtastatur auf e-Ink trägt – kein Anschlag geht
verloren (Touch-Abfrage in eigener Aufgabe), Klick sofort, Textzeile gesammelt ~0,85 s; erster Mensch 49 Zeichen/min.
Mockup: `docs/eingabe-mockup.html`.

- Vorschlag **ein Baustein „Eingabe“** für alle Textziele (Notiz, Zettel-Eintrag, Spickzettel-Karte, Handbuch-Suche,
  „Parkplatz“): oben die Textzeile, darunter eine der Arten **Tasten · Ziffern · Strich · Sprache**. Ein Modul `eingabe.h`
  mit vier Unterseiten statt vier eigener Seiten. Kritzel bleibt eigene Seite (liefert Bild, keinen Text).
- fest (bestehende Regel) **KI halten = Diktat**, auch mitten im Tippen; der Text landet an der Schreibmarke.
- Vorschlag **Art wählen**: sichtbare Reiter oben rechts (tippen) und ▲/▼. **Keine neuen Wisch-Gesten**
  (Markus skeptisch).
- Vorschlag **jedes Ziel merkt sich die zuletzt genutzte Art** (Parkplatz → Tasten, Notiz → Sprache).
- Vorschlag **Tasten** aus Lab-Station 10 übernehmen (MIT): QWERTZ mit Ä Ö Ü ß bzw. QWERTY, nur quer, Tasten nie neu
  zeichnen, Textzeile gesammelt auffrischen (0,3 s Pause, spätestens 1,5 s), Teil-Refresh „wach“.
- fest (Markus, 15.11.2026) **vierte Art „Ziffern“** (Num-Pad, ET66-Stil), nur in EDC – das Lab braucht keins:
  - fest **Ziele, die direkt mit Ziffern aufgehen**: Timer-Minuten (eigene Zeit), Parkplatz/Etage, Codes (Tür,
    Schließfach – merken, kein Passwort-Tresor), Telefonnummer. Buchstaben dazu (P3) über den Reiter „Tasten“
  - fest **getrennt vom Rechner, gleiche Optik**: Ziffern liefern nur eine Zahl ans Ziel und rechnen nicht; der Rechner
    bleibt eigenes Widget (FW 0.28) und zeigt dieselben Tasten. Löst das „Zahlenfeld“ aus der Widget-Liste ab
  - Vorschlag **Tastenfeld**: runde schwarze Zifferntasten, 7-8-9 oben wie beim Rechner (nicht wie am Telefon), 0
    unten in der Mitte; rechts eine **Sondertaste je Ziel** (gerastert: „,“ bei Zahlen, „+“ bei Telefon, „#“ bei
    Codes, „−“ bei Werten, die negativ sein dürfen), darunter ← (lang = alles weg) und OK als Doppelring
  - Vorschlag: Telefonnummern in Gruppen mit Leerzeichen anzeigen; die App kann sie später anrufbar machen. Englisch:
    „.“ statt „,“ (wie beim Rechner)
- fest **Strich** = vorhandene Strichschrift (FW 0.27). Vorschlag: **Umlaut-Leiste** ä ö ü ß zum Antippen statt
  Umlaut-Gesten (nur im deutschen Modus).
- Vorschlag **Sprache**: Erkennung am Fold (Whisper) **in der App-Sprache** statt fest Deutsch; ohne Handy bleibt es
  eine Sprachnotiz, bis der Abgleich sie zu Text macht.
- Vorschlag **Englisch**: Oberfläche, Reiter („Keys · Digits · Stroke · Voice“) und Tastenbelegung folgen der EDC-Sprache.
- offen: welche Ziele zuerst? (Vorschlag: Notiz und Zettel-Eintrag)
- offen: Umlaute im englischen Tastenmodus (langes Drücken?)
- fest (Markus, 15.11.2026): **Eingabewege sauber getrennt**, in EDC keine neuen Gesten. Umlaut- und andere Gesten
  bleiben ein Kandidat fürs Sticky Lab (erst dort ausprobieren, dann entscheiden); in EDC gilt die Umlaut-Leiste
  - Klarstellung (Markus, 15.11.2026): **„keine neuen Gesten“ meint Wisch-Befehle zum Bedienen** (blättern, Art
    wechseln, zurück) – unsichtbar, überall auf dem Bildschirm, leicht aus Versehen. Die **Strichschrift** sind zwar
    auch Gesten, aber mit festem Ort (Schreibfeld) und festem Zweck (ein Zeichen), sichtbarem Ergebnis und Ausweg
    (Tasten, Ziffern, Sprache); sie bleibt. Umlaut-Gesten liegen dazwischen (mehr auswendig) → Lab
- offen: Diktat später per Ollama nachbessern (Satzzeichen, Groß/klein)?
- offen: Einfach-Profil für ältere Angehörige – nur Sprache und Tasten, keine Strichschrift?
- **umgesetzt FW 0.37.0** (15.11.2026, Markus: „kam sonst gar nicht an Tastatur oder Num-Pad“; gebaut, nicht geflasht):
  Karussell-Seite **„Tippen“** (EN „Type“, `typ tippen`, `firmware-ble/tippen.h`, App `tippenWidget` in `widgets.js`) in
  der Gruppe Notieren: Recorder · Tippen · Kritzel · Schrift · Notiz. Oben die Textzeile (31 Zellen, linksbündig, die
  letzten Zeichen), darunter die Reiter **Tasten · Ziffern · Strich · Sprache**; die Gruppen-Reiter bleiben im Kopf
  - Tasten: QWERTZ mit Ä Ö Ü ß bzw. QWERTY (folgt der EDC-Sprache) wie Lab-Station 10; Touch in eigener Aufgabe (Klick
    sofort, kein Anschlag geht verloren), Tasten nie neu gezeichnet, Textzeile gesammelt (0,3 s Pause, spätestens 1,5 s)
  - Ziffern: das gemeinsame Ziffernfeld (rechts „,“ ⌫ OK, links der 0 Leerzeichen, rechts „:“), schreibt in dieselbe Zeile
  - Strich: öffnet die vorhandene Strichschrift-Seite (eigene Textzeile, speichert als Notiz „schrift“) – noch nicht
    dieselbe Zeile
  - Sprache: KI halten wie überall; der Sticky meldet `ziel: tippen`, die App schickt den erkannten Text zurück an die
    Schreibmarke (Opcode 0x31). Unklar erkannt oder zu spät: wie bisher eine Sprachnotiz; ohne Handy ebenso
  - OK: der Text wird eine Notiz (Art „getippt“) über den Puffer (`notizen.jsonl`), die App holt sie bei Verbindung
    sofort ab (`{"t":"puffer","a":"neu"}`), sonst beim nächsten Abgleich; Sorte „eingang“
  - Vorschlag (umgesetzt) **Shift**: ⇧ macht den nächsten Buchstaben groß; angezeigt als Block-Schreibmarke statt
    Strich, damit die Tasten nicht neu gezeichnet werden müssen (Lab zeichnete die Tastatur neu, ~0,85 s)
  - Vorschlag (umgesetzt) **▲/▼ blättern wie überall** (nicht Art wechseln): die Reiter sind sichtbar, ▲/▼ bleibt
    der Weg zur nächsten Seite
  - Vorschlag (umgesetzt) die Sprachtaste des Labs ist auf EDC ein „?“ (Sprache stellt man in den Einstellungen); die
    zuletzt genutzte Art bleibt (zurück auf „Tippen“ = dieselbe Art)
  - Vorschlag (umgesetzt) der Text bleibt bis OK stehen, auch beim Seitenwechsel (im RAM; Ausschalten verwirft ihn)
  - offen: Strichschrift in dieselbe Zeile; Zeichen außerhalb der Glyphen (z. B. „é“ aus dem Diktat) zeigt die Zeile
    leer, in der Notiz stehen sie; Ziele (Zettel-Eintrag, Parkplatz) statt nur Notiz

#### Kleine Eingaben (Markus, 15.11.2026)
Neben Text und Zahlen braucht EDC ein paar Eingaben, die mit einem Tipp fertig sind – für Einstellungen am Sticky und
für Rückfragen der App. Teil desselben Bausteins `eingabe.h`, alle ohne Handy, Bilder im Mockup.
- fest **Ja/Nein**: zwei große Pillen, Ja als Doppelring; ▲ = Ja, ▼ = Nein (z. B. „Aufnahme löschen?“, „erledigt?“)
- fest **Auswahl**: 3–6 große Zeilen, Tippen wählt, ▲/▼ blättert bei mehr (Szene, Vorlage, Zettel-Eintrag)
- fest **Uhrzeit/Datum**: +/− je Stelle, langes Drücken läuft schneller; Englisch 12 h mit a/p (Wecker, Erinnerung,
  Uhr stellen)
- fest **Stufe 1–5**: ein Tipp = fertig (Fahrt, Laune, wie gut lief's)
- Vorschlag: die App kann jede davon als Rückfrage schicken (Frage + Antworten), die Antwort geht wie eine Notiz zurück
- **umgesetzt FW 0.35.0** (15.11.2026, gebaut, nicht geflasht): **Ja/Nein** und **Ziffern** als Seiten der
  Widget-Maschine (`typ janein`, `typ ziffern`, `firmware-ble/eingabe.h`); die App zeichnet sie (`EINGABEN` in
  `widgets.js`), der Sticky nimmt Tasten an und gibt das Ergebnis ans Ziel. Vorschlag (umgesetzt) **Mechanik**: die
  aufrufende Seite hat einen Knopf `eingabe <code>`, die Eingabe öffnet sich als eigene Seite und kehrt danach zurück;
  KI kurz = Home (bricht ab). Je Ziel eine eigene Seite (Frage bzw. Sondertaste fest im Bild), Namen ≤ 15 Zeichen
  - erste Ziele: **Timer-Minuten** (`zf-timer`: Zeit am Timer antippen; Sondertaste „:“ für Sekunden, „5:30“, bis
    99:59, ungültig = Brummton, bleibt offen) und **Aufnahme löschen** (`jn-rec`: Knopf „Löschen“ auf der
    Recorder-Seite für die gewählte Zeile; löscht die Datei von der Karte, falls noch da, und die Zeile der Tagesliste)
  - ← lang gehalten (≥ 0,7 s) = alles weg (dazu meldet der Touch jetzt auch das Loslassen an die Widget-Maschine)
  - offen: weitere Ziffern-Ziele (Parkplatz/Etage, Codes, Telefon) brauchen einen Ort für das Ergebnis – Vorschlag:
    als Notiz `art: eingabe` mit Ziel, die App legt es ab (Parkplatz → „Geparkt“ auf Home)
  - offen: Rückfrage der App (`rueckfrage.js`, heute Spielseite mit Handy) auf diese Seiten umstellen, dann geht die
    Antwort auch ohne Handy

#### Recorder für Längeres (Markus, 15.11.2026)
Abgrenzung: **Diktat** (KI halten) ist für Kurzes, die Hand ist dabei belegt. Der **Recorder** ist für Minuten:
Gespräch, Gedanke beim Gehen, Werkstatt – Hände frei. Beides läuft danach durch dieselbe Kette (Sprachnotizen 2.0:
abtippen, sortieren, Ziele). Nimmt die Idee „Gesprächs-/Meeting-Notizen“ aus der Ideensammlung auf.
- fest **eigene Seite im Karussell**, kein Eingabe-Modus: großer Knopf (Doppelring), Tippen = Start/Stopp
- fest **Anhören nur am Handy**: der Sticky hat ein PDM-Mikro, aber nur einen Piezo-Summer an GPIO48 (Klicks und
  Pieptöne über `tone()`); Sprache darüber wäre leise und kaum verständlich. Die Seite sagt das ehrlich
- Vorschlag (Markus, 15.11.2026) **Sticky als Fernbedienung fürs Anhören**: Tipp auf eine Aufnahme in der Liste →
  das Handy spielt sie ab, der Ton kommt über dessen Kopfhörer/Earbuds; ▲/▼ springt zum vorigen/nächsten Merker,
  Tipp = Pause. Direkt vom Sticky auf Earbuds geht nicht: der ESP32-S3 kann nur BLE 5.0, kein klassisches BT (A2DP)
  und kein LE Audio (braucht BLE 5.2). Firmware wenig, das meiste in der App; ohne Handy bleibt es stumm
- Vorschlag **Anzeige**: „● läuft seit 14:02, 3 min“, nur minutenweise aufgefrischt (e-Ink); rechts die Aufnahmen des
  Tages mit Uhrzeit, Länge und Stand (✓ beim Handy und als Text da · ⧗ wartet aufs Handy); ▲/▼ blättert die Liste
- Vorschlag **Merker**: kleiner Knopf setzt eine Zeitmarke in die laufende Aufnahme („hier war's wichtig“); die App
  zeigt die Stelle im Text
- Vorschlag **Format und Weg** wie beim Diktat: IMA-ADPCM 16 kHz (~8 kB/s, ~29 MB je Stunde auf der Karte). Ist das
  Handy verbunden, geht der Ton live mit; sonst landet er in `/ist/puffer`. Achtung: BLE schafft gemessen ~66 kbit/s,
  das Abholen einer Offline-Aufnahme dauert also etwa so lange wie die Aufnahme selbst
- Vorschlag: Löschen am Sticky über Ja/Nein; nach dem Abholen bleibt die Datei auf der Karte, bis die App „hat Text“
  meldet
- fest **Dauer**: kein hartes Limit; nach 60 min Piepton und Hinweis, unter 15 % Akku stoppt der Recorder selbst
- fest **KI halten während der Aufnahme = Merker** statt Diktat (der Ton läuft ja schon mit). Einzige Ausnahme von
  der Regel „KI halten = Diktat“, nur solange der Recorder läuft
- ~~offen: Strom während der Aufnahme~~ → **geschätzt** (15.11.2026, nicht gemessen): ESP32-S3 wach bei 80 MHz ohne
  Leichtschlaf ~25–30 mA, PDM-Mikro ~0,6 mA, Karte schreibt alle ~0,5 s 4 KB (~3–5 mA im Mittel), live zusätzlich Funk
  alle 15–30 ms (~5–10 mA) → **~30–40 mA nur Karte, ~40–50 mA live**. Bei ~300 mAh (Lab-Schätzung) etwa **10–17 % je
  Stunde**. Der Akku-Chip misst den Strom nicht verlässlich (Register 0x0C), darum: Vorschlag (umgesetzt) **Messung
  nebenbei** – jede Aufnahme schreibt Akku-% und mV bei Start und Stopp ins Protokoll; die ersten echten Aufnahmen
  liefern den Wert. Lab-Station 8 kann es gezielt nachmessen
- **umgesetzt FW 0.34.0** (15.11.2026, gebaut, noch nicht geflasht), App dazu:
  - Seite = Widget `typ recorder` (Karussell-Wort „Recorder“, im Standard nach „Notiz“; Lage quer, hochkant geht).
    Die App zeichnet Knopf, Liste und Glyphen (Symbole ● ▸ ✓ ⧗ ⚑ selbst gezeichnet, Handy-Schriften haben ⧗ nicht
    sicher); der Sticky setzt Zustand, Zusatz und 5 Listenzeilen ein (`firmware-ble/recorder.h`)
  - Vorschlag (umgesetzt) **Aufnahme immer auf die Karte, live nur zusätzlich**: so geht nichts verloren, wenn der
    Funk abreißt. Während der Aufnahme `/ist/recorder/laeuft.adp` (das Abholen sieht sie nicht), beim Stopp
    `/ist/puffer/rJJMMTT-hhmmss.adp` plus Notiz-Zeile `art: recorder` mit Merkern. Ringpuffer 128 KB (~16 s) im PSRAM,
    eine eigene Aufgabe schreibt 4-KB-Blöcke (die Karte teilt sich den SPI-Bus mit dem E-Paper; ein Refresh darf die
    Aufnahme nicht stören), alle ~30 s `flush`. Ohne Karte keine Aufnahme („! keine Karte“); ein Rest nach Absturz
    wird beim nächsten Start in den Puffer gerettet
  - Vorschlag (umgesetzt) **Stand aus der Datei**: liegt sie noch im Puffer = ⧗, weg = ✓. Die App löscht sie erst,
    wenn der Text da ist – das ist das „hat Text“-Signal, ohne eigenen Befehl
  - live vollständig (keine Lücke, alle Pakete) → die App tippt sofort ab; sonst holt sie die Datei in Stücken à
    256 KB im Hintergrund ab (der übrige Abgleich läuft dazwischen weiter). Abtippen in Stücken ≤ 29 s, geschnitten an
    der leisesten Stelle (`stuecke()` in `audio.js`), Merker als „⚑ mm:ss“ an der Stelle im Text. Die WAV wird in
    1-MB-Teilen geschrieben (eine Stunde ~115 MB). seq (u16) läuft nach ~33 min über: die App zählt weiter bzw. liest
    die Datei der Reihe nach
  - Notiz `art: recorder` mit `datei`, `dauerMs`, `merker`; Sortieren wie beim Diktat (lang → eher „Erzählung“)
  - KI halten während der Aufnahme = Merker (zwei kurze hohe Pieps); der Recorder läuft weiter, wenn man die Seite
    verlässt; KI loslassen stoppt ihn nicht. ▲/▼ blättert die Liste (▲/▼ lang wie überall = Karussell)
  - Vorschlag (umgesetzt) **Akku-Grenze robust**: Stopp, wenn der Chip unter 15 % meldet **und** die Spannung unter
    3,7 V liegt, oder die Spannung allein unter 3,45 V (der Chip meldete nach Tiefentladung schon 3 % bzw. 83 % Unsinn).
    Am USB nie. Geprüft alle 30 s
  - Volle Stunde: zwei Pieps, „!“ vor der Minutenzahl (jede weitere Stunde wieder)
  - **Fernbedienung** (billig, darum mit drin): mit Handy spielt ein Tipp auf eine Zeile die Aufnahme am Handy ab
    (noch einmal = Pause), ▲/▼ springt dann zum vorigen/nächsten Merker. Nur für Aufnahmen, die schon beim Handy sind
    (✓); ohne Handy wählt der Tipp nur die Zeile
  - Löschen am Sticky: Knopf „Löschen“ → Ja/Nein für die gewählte Zeile (umgesetzt FW 0.35.0)
  - offen: Abholen bricht bei Funkabriss ab und beginnt beim nächsten Mal von vorn (Merker gehen dann verloren, weil
    die Notiz-Zeile schon abgeräumt ist); Weiterholen ab Byte n wäre der nächste Schritt
  - offen: am Gerät prüfen – Strom, ob 128 KB Ring reichen, ob der Ton beim Teil-Refresh lückenlos bleibt

### Dateien am Sticky im Atari-ST-Stil (Markus, 16.11.2026, Idee, geparkt)

- Idee: ein **Datei-Schreibtisch** am Sticky, angelehnt an den GEM-Desktop des Atari ST (Laufwerks-Symbole, Fenster
  mit Titelleiste und Dateiliste, Papierkorb). Eigener Look in Schwarz-Weiß, der zu e-Ink und 1 bpp passt wie damals
  zum SM124, kein Nachbau
- Laufwerke: **SD** (Karte) und **FLASH** (LittleFS); Ordner wie `/soll`, `/ist`, `/lab`, Aufnahmen, Puffer
- Vorschlag Bedienung: Tipp wählt (invertiert), Doppeltipp öffnet, ▲/▼ blättert in langen Listen; Datei auf den
  Papierkorb ziehen = löschen nach Ja/Nein (Baustein aus FW 0.35.0); „Info“ zeigt Größe, Datum, Prüfsumme
- Vorschlag Ansicht: `.txt` als Textseite, `.bin` (800 × 480, 1 bpp) als Bild, Aufnahmen mit Länge
- offen: Wozu im Alltag? Kandidaten: Karte prüfen ohne Handy, Speicher aufräumen (Aufnahmen), Diagnose-Logs lesen
  (passt zur Lab-Station 11 „Pins & Neustarts“)
- offen: `/soll` gehört der App (Abgleich überschreibt) → dort nur lesen, Löschen nur in `/ist` und bei Aufnahmen?
- offen: Ziehen auf e-Ink (Teil-Refresh ~0,9 s je Schritt): echtes Ziehen oder „wählen, dann Papierkorb tippen“?
- offen: erst im Sticky Lab als Station ausprobieren, dann entscheiden (Muster wie bei Burgduell und Tastatur)

### Eigene Sensoren (laut Schaltplan, Bus MISC_I2C)
| Baustein | Adresse | heute | Vorschlag |
|---|---|---|---|
| Bewegung LSM6DS3TR-C (6 Achsen) | 0x6A, Interrupt 6D_INTn | Fahrterkennung, hoch/quer automatisch, Wecken (FW 0.12/0.22.1) | Fahrt selbst erkennen → wach bleiben ohne GPS-Umweg im Dienst; Wecken per Bewegung aus dem Schlaf (fast null Verbrauch im Stand, sofort da beim Losfahren); Klopfgeste; hoch/quer |
| Temperatur/Feuchte SHT40 | 0x44 | Klima-Messreihe, Taupunkt (FW 0.12) | Innenraumklima Microlino als Messreihe; Warnung „lädt nicht, zu kalt/heiß“ (Lader nur 0–45 °C); Taupunkt → „Scheibe beschlägt gleich“ |
| Uhr PCF8563 | 0x51, Interrupt RTC_INTn | Uhrzeit | Zeitstempel aller Ist-Daten auch ohne Handy; Wecker für geplantes Aufwachen |
| Akku BQ27220 | 0x55 | Prozent | Verlauf, Restlaufzeit; Strom-Register 0x0C liefert Unsinn (mehrere A), klären |
| Lade-LED rot/grün, Summer, Mikro, Tasten, Touch | – | teils | LED als stille Rückmeldung (z. B. „Diktat gepuffert“) |

### Offen
- fest (15.11.2026, FW 0.31.9): **Stromhaltung braucht zwei Pins**, PWR_HOLD GPIO45 und PWR_LOCK GPIO46, beide HIGH
  (wie Seeeds Beispiele, `pin_config.h`/`demo_board_init()`), im Leichtschlaf beide per `gpio_hold`. Ohne GPIO46 ging ein
  Sticky beim Abziehen des USB-Kabels sofort aus, ein anderes hielt (Platinen-Version oder Zufall)
- fest (Schaltplan 260609, Seite 5): **MISC_I2C = Akku-Bus** (SCL GPIO0, SDA GPIO1), alle Sensoren dort.
  **6D_INTn = GPIO7**, teilt sich die Leitung mit BFG_INT (Akku-Interrupt); GPIO7 ist RTC-fähig, also Wecken aus
  dem Schlaf möglich. **RED_LED = CHARGE_STATE = GPIO40**: die rote LED ist die Lade-Anzeige des Laders, nur bedingt
  frei schaltbar. **RTC_INTn hängt an VDD_3V3_ENn**, nicht an einem GPIO: der Uhr-Wecker schaltet die 3,3 V ein, also
  Einschalten aus „ganz aus“, kein Interrupt im Betrieb
- fest (13.11.2026): **schrittweise**: 1. Fahrtenschreiber (fertig, FW 0.10.0), 2. Sync-Protokoll mit /soll /ist
  und Umzug von Puffer/Home/Bordbuch (fertig, FW 0.11.0, Bestandsliste `stand.txt` je Ordner), 3. Sensoren (FW 0.12.0, Fahrterkennung noch an
  echten Fahrten einzustellen), danach Szenen
  - Merker (Markus, 14.11.2026): **Abgleich in der APK läuft nicht mehr komplett** – z. B. kommt der
    Home-Screen (Menü) nicht an; beim nächsten Mal Logs vom Fold ziehen (adb logcat) und mit der Bestandsliste `stand.txt` vergleichen
    - geklärt (14.11.2026): Abgleich war vollständig; die **Vorschau im Sticky-Tab** kannte nur Home, Notiz, Bordbuch
      und Zettel und zeigte sonst „noch nicht verbunden“. Ab FW 0.31.2 meldet der Sticky Widget-Namen (`w`) und Lage
      (`lh`), die Vorschau zeigt Menü, Widgets und Strichschrift als Grundbild in der richtigen Lage. Offen: Abgleich
      bricht bei Funkabriss mit Folgefehlern ab und wird erst beim nächsten Verbinden nachgeholt
    - fest (Markus, 14.11.2026): **Spiegel per Bildschirmfoto** (FW 0.31.3) statt Nachmalen: die App holt das echte Bild
      (`/ist/bildschirm.rle`, gepackt meist wenige KB) nur bei offenem Sticky-Tab, nach Seitenwechsel/Taste, auf Kritzel,
      Strichschrift und Widgets alle 3 s bis 30 s nach der letzten Bedienung. Zeigt Statuszeile, Knöpfe, Striche und Ziffern
      wie am Gerät; ohne Foto zeichnet die App wie bisher selbst. Weicht bewusst von „es fließen keine Bilder zurück“ ab
- Vorschlag **Messintervalle**: Klima wach 1/min, im Schlummern alle 15 min per Timer-Wecken; Bewegungssensor im
  Schlaf im Weck-Modus (~25 µA); Fahrtenschreiber nur Ereignisse. Ziel < 5 % Akku über Nacht
- Vorschlag **Fahrt**: die Bewegung entscheidet übers Wachbleiben, GPS im `StickyDienst` bleibt Rückfall, bis
  ein paar echte Fahrten gut gelaufen sind
- Vorschlag **Firmware von der Karte** (`/soll/firmware.bin`): eigener Schritt nach den Sensoren
- fest (Markus, 15.11.2026) **EDC und Sticky Lab auf einem Gerät**: EDC fest in `app0`, Lab fest in `app1` (je 4 MB,
  EDC ~1,0 MB, Lab ~0,7 MB; gleiche `partitions.csv`). Details in der Lab-SPEC, Abschnitt 6
  - Vorschlag EDC: Menüeintrag **„Sticky Lab“** (nur sichtbar, wenn in `app1` eine gültige Firmware liegt), setzt den
    Start auf `app1` und startet neu; das Lab hat „zurück zu EDC“
  - Vorschlag **Notausgang**: beim Einschalten ▲ halten startet den anderen Platz
  - fest: Updates schreiben nur in den eigenen Platz (EDC → `app0`), nie „in den freien“. Gilt auch für Firmware von
    der Karte und die Firmware-Bibliothek in der App
  - Daten bleiben getrennt: EDC `/soll` `/ist` und LittleFS, Lab nur `/lab/` und NVS-Namensraum `lab`
  - umgesetzt FW 0.33.0 (15.11.2026, gebaut, noch nicht geflasht): `firmware-ble/platz.h` (gleich im Lab), Zustand
    meldet `platz` und `anders` (Projektname im anderen Platz: `firmware` = Lab); die App hängt dann ans Menü die
    Kachel „→ Sticky Lab“ (Aktion `platz`); ▲ 1 s beim Einschalten = anderer Platz (nur nach echtem Einschalten).
    Lab nach `app1`: `sticky-lab\werkzeuge\lab-nach-app1.ps1 -Port COMx` (nie `arduino-cli upload`, das trifft `app0`)
- Merker (Markus, 15.11.2026): **Akku-Symbol nach Tiefentladung unzuverlässig** – beide Stickys über Nacht leer,
  kurz geladen, abgesteckt: Symbol zeigte halbvoll, trotzdem aus (Neustart beim Einstecken mit `POWERON`, e-Ink
  behielt das alte Bild samt „verbunden“). Der BQ27220 meldete danach Unsinn (45 % bzw. 83 %, „lädt“ mit 3–5 A).
  Vorschlag: Symbol zusätzlich an der Spannung festmachen (unter ~3,5 V „fast leer“, egal was der Chip meldet) und
  beim Abschalten wegen Unterspannung ein „Akku leer“-Bild zeichnen, damit kein veraltetes Bild stehen bleibt.
  Bis dahin: nach Tiefentladung einmal voll laden, dann lernt der Chip neu
- fest (Markus, 15.11.2026): **~24 h Akku reichen als EDC**; sparsamer schlummern (FW 0.31.7): Schlummern nach 1 statt
  2 min, Stundenfenster 30 s statt 1 min, 1–5 Uhr kein Stundenfenster (Mitternacht bleibt für die neue Home-Karte).
  Danach (nach Blick in die Fahrtenschreiber-Logs): Vorschlag **Slave-Latenz** bei stehender Verbindung (`SLOW_LAT` > 0)

## Für Fremd-Apps: eigene App für den Sticky bauen (Markus, 13.11.2026)

Für alle, die eine eigene App bauen wollen, z. B. für das iPhone, gern mit einem KI-Helfer. Ziel: **mit diesem Abschnitt und `PROTOKOLL.md` auskommen, ohne Rückfragen und ohne
unseren App-Code lesen zu müssen.** Die Firmware bleibt dieselbe, Bluetooth LE ist auf iPhone und Android gleich.

### Was fest ist (darauf kann man bauen)
- **Ein GATT-Dienst** `b1e50001-7374-6963-6b79-7465726d6e6c` mit fünf Kennlinien (Endziffer 2–6, sonst gleiche UUID):
  BEFEHL (App → Sticky, write / write-no-response), EREIGNIS (JSON, notify), ZUSTAND (JSON, read / notify),
  AUDIO (Diktat, notify), DATEI (Datei-Stücke, notify). Der Sticky wirbt als `Sticky-XXXX`. Bytes in `PROTOKOLL.md`
- **Bildformat** überall gleich: 800 × 480 quer, 1 bpp, Zeilen à 100 Byte, MSB = linkes Pixel, **Bit 1 = schwarz**.
  CRC-32 wie zlib. Hochkant zeichnet man logisch 480 × 800 und dreht vor dem Senden (logisch (lx, ly) → Display (ly, 479 − lx))
- **Die SD-Karte ist der Vertrag:** Neue Funktionen sind neue Dateien, keine neuen Befehle. Vier Befehle reichen für fast alles:
  LISTE `20`, HOLEN `21`, LOESCHEN `22`, SCHREIBEN `23`/`24`/`25`
  - `/soll/…` schreibt **nur die App**, `/ist/…` schreibt **nur der Sticky**. Die App holt aus `/ist` ab und quittiert mit LOESCHEN
  - Jeder Soll-Ordner hat `stand.txt` („name crc“ je Zeile). Beim Abgleich immer den **ganzen Ordner** schicken:
    Was in der Liste fehlt, gilt als weg (13.11.2026 gelernt: nur `lage.txt` geschickt, `karussell.txt` war weg)
  - `stand.txt` zuletzt schreiben; die Auslöser-Dateien (unten) lassen den Sticky neu laden
- **Uhr stellen:** gleich nach dem Verbinden `15 unix-ms:u64`. Ohne gestellte Uhr schreibt der Sticky Logs ohne Datum
- **Touch und Tasten** kommen als Ereignis (`key`, `touch` in Display-Koordinaten 800 × 480)

### Dateien auf der Karte (Grundstock FW 0.23.1, Nachträge bis FW 0.37 unter der Tabelle)
| Pfad | Wer | Inhalt |
|---|---|---|
| `/soll/home/0–8.bin`, `version.txt` | App | Home-Bilder (hochkant gezeichnet, gedreht gespeichert); `version.txt` = Auslöser |
| `/soll/notiz/layout.txt`, `rNN.bin` | App | Notiz-Seite: Streifen „e x0 y0 x1 y1 Name“, Rückmeldungen (x,y,w,h je u16 + 1 bpp) |
| `/soll/bordbuch/NN.bin`, `index.txt` | App | Bordbuch-Seiten, Inhaltsverzeichnis (Auslöser) |
| `/soll/einstellungen/karussell.txt` | App | Reihenfolge für ▲/▼: `home`, `notiz`, `bordbuch`, `zettel`, `kritzel`, `app`, `widget <name>` |
| `/soll/einstellungen/lage.txt` | App | je Seite `<seite> hoch\|quer\|auto`, dazu `dreh 0\|180` |
| `/soll/einstellungen/zeit.txt` | App | Standards vom Handy: `format 12\|24`, `einheiten us\|metrisch`, `sprache de\|en` (FW 0.32.0); am Sticky überstimmbar, Wahl in `/ist/zeit.txt`, wirksam im Zustand `us`, `en` |
| `/soll/widgets/<name>/bild.bin`, `ziffern.bin`, `felder.txt` | App | eigene Seiten ohne Handy (Timer, Waage, Menü); Format im Kopf von `firmware-ble/widget.h`. Bei Lage `auto` zusätzlich `<name>-h/` hochkant |
| `/soll/hilfe/<modus>.bin`, `w-<name>.bin` | App | Tastenhilfe (▲+▼) je Seite |
| `/ist/log/JJJJ-MM-TT.txt` | Sticky | Fahrtenschreiber, „HH:MM:SS Text“ |
| `/ist/mess/…` | Sticky | Messreihen (Klima) |
| `/ist/puffer/…` | Sticky | Diktate ohne Handy (ADPCM), Knopf-Notizen |
| `/ist/kritzel/…bin` | Sticky | Kritzelblätter 1 bpp, `-h` am Namen = hochkant gemalt |

Nachträge (Stand FW 0.37; genaues Format im Kopf der jeweiligen Firmware-Datei):
- Karussell-Wörter außerdem `schrift`; Widget-Namen auch `recorder`, `tippen`, `rechner`, `umrechner`, `wecker`,
  `weltzeit`; Widget-Typen `recorder`, `tippen`, `janein`, `ziffern` und Menü-Aktion `gruppe <Maske>` (`widget.h`)
- Widget-Ordner für US-Einheiten zusätzlich mit `-us` am Namen (z. B. Lineal in Zoll, FW 0.31.0); Tippen-Arten als
  `tippen-zf` und `tippen-sp`
- `/ist/zeit.txt` (am Sticky gewählte Einstellungen), `/ist/wecker.txt`, `/ist/schrift/*.txt` (Strichschrift),
  `/ist/recorder/` (laufende Aufnahme), `/ist/bildschirm.rle` (keine Datei, liefert das gezeigte Bild),
  `/soll/hilfe/offline.bin`
- Handbuch und Spickzettel (FW 0.38): siehe Abschnitt „Dokumente“

### Was sich noch ändern darf
- Neue Dateien und neue Felder in `felder.txt` kommen dazu; **unbekannte Zeilen ignoriert der Sticky**, eine Fremd-App
  sollte unbekannte JSON-Felder ebenfalls ignorieren
- Die alten Spezialbefehle (`13`, `16`–`19`, `1A`, BILD_ENDE 3–5) bleiben, sind aber Altlast (`14` MODUS ist keine:
  damit bedient die App den Sticky). Neue Apps nehmen
  besser den Datei-Abgleich
- Die App-Seite (Modus `app`) ist **Thin Client**: Der Sticky zeigt, was die App schickt, und meldet Tipps. Ohne eigene
  App-Seite einfach `app` aus dem Karussell lassen
- Der Sticky braucht keine App für den Alltag: Uhr, Timer, Waage, Kritzel, Fahrtenschreiber und Diktat-Puffer laufen allein

### Für eine iOS-App (Vorschlag)
- **Einfachster Weg:** unsere App (Capacitor + Vite, `sticky-app/`) mit `npx cap add ios` auf iOS bringen. Seiten,
  Widgets, Rechner, Protokoll und Abgleich sind Webcode und laufen dort. Neu zu bauen: Hintergrund/Wachhalten (bei uns
  Android-Java) und Spracherkennung (bei uns lokales Whisper; am iPhone besser Apples eigene Erkennung)
- **iOS-Eigenheiten:** Hintergrundmodus „bluetooth-central“ eintragen, sonst kommen keine Ereignisse, wenn die App
  nicht vorn ist. iOS sucht Geräte nach Dienst-UUID, nicht nach Name
- **Voraussetzungen:** Mac mit Xcode. Mit kostenloser Apple-ID läuft die App 7 Tage, dauerhaft nur mit dem
  Entwicklerkonto (99 $ im Jahr)
- **Unser Repo ist öffentlich, Lizenz MIT** (`LICENSE`): nutzen, ändern, weitergeben erlaubt, mit Hinweis auf die Herkunft

## Zusammenhang mit dem Microlino-Knopf
Beide Geräte sind ESP32-S3 mit BLE, beide folgen dem Muster „Handy rechnet, Gerät zeigt“.
- Vorschlag **Rollen im Microlino**: Der **Knopf** (rundes AMOLED, schnell, leuchtet) zeigt live, was beim
  Fahren zählt: Tempo, Akku, Navi-Hinweis. Der **Sticky** (E-Paper, träge, ohne Strom lesbar) ist
  Nachschlagewerk und Notizblock: Bordbuch, Handbuch, Testnotizen, Spickzettel
- Vorschlag **ein Protokoll, zwei Geräte**: gleicher BLE-Grundbaustein (Bild/Seite schicken, Ereignis
  melden, Zustand melden); Gerätetyp und Displaygröße meldet das Gerät beim Verbinden
- Vorschlag **wer spricht mit wem**: Bubble Log bleibt Herr über Fahrdaten und spricht mit dem Knopf;
  die Sticky-App bekommt von Bubble Log, was sie fürs Bordbuch braucht, und gibt Testnotizen zurück.
  Kein Gerät spricht direkt mit dem anderen, alles läuft übers Handy
- offen: Sollen Knopf und Sticky sich gegenseitig ergänzen (z. B. Notiz-Knopf am Knopf-Display,
  Notiz erscheint im Bordbuch)?
- Siehe `../../bubble-log/` (Knopf-Display, Artefakt „Microlino Connect“)

### App-Technik
- Vorschlag: **gleicher Stack wie Bubble Log** (Capacitor 8 + Vite), weil Build, Simulator-im-Browser
  und APK-Weg schon eingespielt sind. BLE über `@capacitor-community/bluetooth-le`;
  Benachrichtigungszugriff, Tastatur und Hintergrund-BLE als kleine eigene Android-Plugins (Java),
  wie schon das Fahrsensoren-Plugin
- Alternative: rein nativ (Kotlin) – sauberer für Tastatur/Hintergrunddienst, aber neuer Stack
- Vorschlag: BLE-Protokoll und Twin-Kern so schneiden, dass auch der **Microlino-Knopf** sie nutzen kann
  (gleiche ESP32-S3-Klasse, gleiche Idee „Handy rechnet, Gerät zeigt“, vgl. Artefakt „Microlino Connect“)
- fest: **eigene App** (Markus, 11.11.2026), nicht Teil von Bubble Log. Gemeinsam nutzbare Teile
  (BLE-Protokoll, Twin-Kern) später als kleines geteiltes Modul, falls der Knopf sie braucht
- Hinweis: Eine eigene App ist Dauerpflege (Android-Updates, Berechtigungen) – bewusst klein halten

## Firmware
- Vorschlag: eigene Firmware (Arduino/ESP-IDF, Seeed_GFX2 + NimBLE) statt ESPHome
- Vorschlag: Firmware-Bausteine: BLE-Dienst (Bild empfangen, Ereignisse senden, Zustand melden),
  Seiten-Cache im Flash, Mikro-Aufnahme + Kompression, OTA-Update, Tiefschlaf mit Wecken per Taste/Touch
- fest: Werks-Firmware gesichert (`backup/`), jederzeit zurückspielbar

## Durchstich (fertig 11.11.2026)
Kleinste App, die per BLE ein in der App gezeichnetes Bild auf den Sticky schickt und einen Tastendruck
zurückmeldet. Läuft: `firmware-ble/`, `sticky-app/`, Protokoll in `PROTOKOLL.md`.

**Gemessen** (Fold6 ↔ Sticky, 48 KB 1 bpp, MTU 517, BLE 2M, Data Length 251, 95 Rahmen à 507 Byte, 3 Läufe):
| Schritt | Zeit |
|---|---|
| Anlauf (Ruhetakt 100–125 ms → 7,5–15 ms) | ~1,4 s |
| Funk (Daten) | ~0,5 s (≈ 95 KB/s) |
| Anzeige (Refresh nach dem ersten Vollbild) | ~0,4 s (erstes Bild nach Start 2,6 s) |
| **gesamt** (Tippen auf „Senden“ bis Bestätigung) | **~2,7 s** |

Erkenntnisse:
- Im Ruhetakt mit Latenz 4 dauerte allein die Umschaltung mehrere Sekunden, und Android brach mit „Write timeout“ ab
  → Ruhe jetzt 100–125 ms ohne Latenz, App wartet vor dem Streamen auf die Meldung „schnell“
- Vorschlag: Anlauf sparen, indem die App schon beim Öffnen des Editors „schnell“ anfordert
- Noch nicht gemessen: parallel zu Batteriewächter und Musik auf dem Lautsprecher
- Touch (GT911) läuft ebenfalls: Berührungen kommen als Ereignis mit Display-Koordinaten in der App an

## Audio-Durchstich (11.11.2026)
KI-Taste halten → PDM-Mikro → IMA-ADPCM 16 kHz mono → BLE-Notify → App speichert WAV und spielt sie ab.
Noch ohne Spracherkennung (nächster Schritt: Stufe Handy, whisper.cpp oder Androids Erkennung).

**Gemessen** (Fold6, 3 Aufnahmen à 1,5–3,2 s, MTU 517, BLE 2M, Intervall 15–30 ms während der Aufnahme):
| Größe | Wert |
|---|---|
| Datenrate | 66–68 kbit/s (245-Byte-Pakete alle 30 ms) |
| Verluste | 0 Pakete (0 %) |
| Loslassen → Wiedergabe startet | 78–92 ms |
| Pegel Sprache | Spitzen 3.000–9.000 von 32.767 (Verstärkung ×4), Ruhe-Rauschen sd ~87 roh |

- Erste ~120 ms nach dem Einschalten waren ein Knacks (Mikro und Gleichanteil-Filter schwingen ein) → werden verworfen
- Noch nicht gemessen: parallel zu Musik auf einem BT-Lautsprecher

## Spracherkennung Stufe 1 – Handy, offline (11.11.2026)
KI-Taste halten, sprechen, loslassen → die App zeigt den deutschen Text, Knopf „Kopieren“ (Zwischenablage).
Engine: **whisper.cpp** als eigenes Capacitor-Plugin (JNI, nur arm64), Modell **ggml-small-q5_1** (190 MB),
Alternative **ggml-base-q5_1** (60 MB) wählbar. Die Modelle liegen nicht in der APK, sondern im App-Speicher
(`files/modelle/`, einmalig per adb). Die APK wächst nur um die Bibliothek.

**Trick:** Whisper rechnet sonst immer ein 30-s-Fenster. `audio_ctx` = Audiolänge (50 Frames/s + 64) macht small
bei kurzen Sätzen etwa 6- bis 10-mal schneller, bei fast gleicher Qualität.

**Gemessen** auf dem Fold6 (6 Threads):
| Fall | Erkennung |
|---|---|
| small, volles 30-s-Fenster, Sätze 1,5–3 s | 3,6–4,6 s |
| small, gekürztes Fenster | 0,4–0,7 s |
| base, volles Fenster | 1,0–1,3 s (gekürzt seltsamerweise ~3 s) |
| Modell laden (small) | ~0,3–1 s, beim App-Start vorab |

**Live-Test** (Markus, 4 Sätze à 3–5 s, small gekürzt): **Loslassen → Text 0,7–0,8 s** (erster Satz 1,8 s, weil das
Modell gerade noch lud). Trefferqualität: Sinn immer richtig, kleine Fehler
- „Morgen um 9 Uhr ~~Termin beim~~ terminen wir beim Zahnarzt.“
- „Der ~~Microlino~~ Mikrolino steht in der Garage und lädt.“ (Eigenname)
- „Bitte ~~Milch, Eier~~ Milcheier und zwei Brote einkaufen.“
- Satz mit Datum: Zahlen richtig, Monatsname verhört
→ Vorschlag: Eigennamen per `initial_prompt` vorgeben (z. B. „Microlino, Fold“); für Diktat ausreichend,
Feinschliff optional über Stufe 3 („Aufräumen“ per KI)

**Modellvergleich mit echten Fahrt-Aufnahmen** (11.11.2026, 16 Diktate, whisper-cli am Fold, 6 Threads):
| Variante | Namen (Ortsnamen, Tanke) | Zeit je Diktat* |
|---|---|---|
| small-q5_1, kurzes Fenster (wie App) | falsch | ~1,5–2 s |
| small-q5_1, volles Fenster | kaum besser | +4 s |
| **small-q5_1, kurzes Fenster + Wortliste** | **richtig** | ~2–3 s |
| large-v3-turbo-q5_0 (574 MB) | richtig, etwas natürlicher | 6–60 s, mit kurzem Fenster Wiederholschleifen |
\*inkl. Modell-Laden der CLI, in der App ~1 s weniger
→ fest: small + kurzes Fenster + Wortliste aufs Handy. turbo nur für Stufe 2 (Zenbook) bzw. Nachbearbeitung.
Ton: Am Mund gehalten übersteuert das Mikro (6/16 Aufnahmen kappen); während der Fahrt SNR nur 11–15 dB.

## MVP umgesetzt (11.11.2026)
**1. Testnotizen** – läuft. Fahrt-Seite mit 5 Kacheln (in der App änderbar), Tipp = Notiz, KI halten = Diktat;
Zeit + GPS (±4–5 m) gestempelt, Rückmeldung „✓ Bug 14:32“ als Teilbild. JSONL im Format des
Bubble-Log-Entwickler-Logs (`typ: "notiz"`, `quelle: "sticky"`), Teilen über Android. Diktat nach dem
Loslassen ~0,6–0,7 s.
- Abweichung vom Vorschlag: Moduswechsel per **▲ lang** statt KI lang (KI halten ist schon Diktat)
- Offen: Läuft die App im Hintergrund weiter, wenn Bubble Log/Android Auto vorne ist? → erste Testfahrt

**2. Bordbuch** – läuft. Offizielle Bedienungsanleitung DE 2026 (36 Seiten A4 quer; von Markus geladen, privat),
dazu 5 Spickzettel aus dem Handbuch (Laden, Warnleuchten, Reifen, Sicherungen, Notfall). 150 Bildschirme im
Flash (7,2 MB von 23,9 MB), Aufspielen 290 s, Blättern 2,2 s. Am Fahrzeug zu prüfen: Felgen des Pioneer
(1,8 bar Stahl 13″ / 2,0 bar Alu 14″), Pannenhilfe-Nummer eintragen.
- Vorschlag: Blättern beschleunigen (Teil-Refresh mit richtigem Vorbild statt Voll-Refresh)

**3. Notizen puffern** (11.11.2026) – läuft. Ohne Handy sammelt der Sticky Knopf-Notizen und Diktate im Flash
(Zeit aus der eingebauten Uhr, kein GPS), die App holt sie beim nächsten Verbinden ab und erkennt die Diktate.
GPS für diese Notizen kommt bei der Auswertung über den Zeitstempel aus der Bubble-Log-Spur.

## Home, Modi und Bestellzettel (11.11.2026)
**abgelöst:** Tastenregeln, Visitenkarte als Home und „bis zu 3 Zettel“ gelten nicht mehr – heute „Bedienung und
Oberfläche“ (FW 0.13), „Gruppen im Menü“ (FW 0.36), bis zu 6 Zettel. Steht nur zur Geschichte da.

Markus: „Visitenkarte quasi als Standardbild (inkl. Uhrzeit), KI-Button → Note-Mode, Up-Button → Bordbuch-Mode“.
- **Home** = Visitenkarte hochkant (Name, Hinweis, große Uhr, QR) – gleiche Lage wie die Notiz-Seite. Die App
  rendert Karte und Ziffernblatt einmalig in den Flash; der Sticky setzt die Uhr jede Minute selbst aus den Ziffern
  zusammen (Teil-Refresh nur des Uhrfelds, zur vollen Stunde ein Voll-Refresh) – ohne Handy, Zeit aus der PCF8563
- **Tasten**: KI kurz = Home ↔ Notiz (aus Bordbuch/Bestellzettel: Home) · KI halten (½ s) = Diktat überall ·
  ▲ = Bordbuch (dort zurückblättern, ▲ 1 s = Inhalt) · ▼ auf Home = Bestellzettel (dort ▼/▲ blättern) ·
  5 min ohne Bedienung → Home
- **Bestellzettel**: bis zu 3 feste Zettel, quer und so groß wie möglich, Text in der App („## Titel“ je Zettel),
  im Flash, ohne Handy vorzeigbar. Bezahlen bleibt außen vor
- **Strom**: CPU 80 MHz; am USB (fester Platz im Microlino, Spiralkabel, vermutlich nur bei Zündung an) wirbt der
  Sticky dauerhaft schnell, am Akku sparsam. Tiefschlaf noch nicht – Akkulaufzeit erst messen
- Vorschlag: Tiefschlaf am Akku mit Wecken per Taste und Minutentakt für die Uhr (BLE dann nur nach Tastendruck)
