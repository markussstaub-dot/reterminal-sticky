# reTerminal Sticky – Spec

Grundidee (Markus, 11.11.2026): **Der Sticky als Erweiterung des Handys**, nicht in erster Linie als
Smart-Home-Tafel. Handy (Fold6) = Rechenleistung und Internet; Sticky = Knopf, Mikro und stromsparendes
Papier-Display, das man auf den Tisch legt oder irgendwo ranpappt.

Legende: **fest** = entschieden · **Vorschlag** = Claudes Idee, Markus entscheidet · **offen** = Frage

## Rolle
- Spitzname (Markus, 11.11.2026): **Bordcomputer-Beiboot**. Sitzt per Magnet im Microlino, wird für Theke,
  Werkstatt oder Sofa abgedockt
- fest: Handy-Erweiterung zuerst; Smart-Home-Anzeige nur nebenbei (siehe `../homeserver/SPEC.md`)
- fest: Werks-Firmware kann KI-Notizen, ist aber träge → eigene Firmware auf dem Bastel-Sticky
- Vorschlag: das zweite Gerät bleibt in Folie, bis klar ist, ob es gebraucht wird

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
- Vorschlag: zwei Modi „Fahrt“ (Schnellknöpfe) und „Bordbuch“ (Lesen), Wechsel per langem Druck auf die KI-Taste
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
  (Stufe Zuhause oder Cloud)
- **Uhrenbox-Begleiter**: Gangwerte aus dem Zeitwaage-Labor neben der Uhr
- **„Bitte nicht stören“-Schild**: an der Tür, per Handy oder Kalender umgeschaltet
- **Handbuch verschlanken** (Markus, 12.11.2026): statt 150 gerenderter PDF-Bildschirme nur das Nötige fürs
  Fahren, knapper umformuliert; Bilder ggf. als **Vektorgrafiken** neu (gestochen scharf in 1 bpp, kein
  Rastermatsch, kleiner im Flash)
- ~~Bestellzettel zum Vorzeigen~~ → umgesetzt, siehe „Home, Modi und Bestellzettel“ unten

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
- Vorschlag Lizenz: **MIT**. Steht in Seeeds Liste, ist am einfachsten und passt zu den Bausteinen
  (whisper.cpp MIT, NimBLE und pdf.js Apache-2.0). Anders als bei der Uhrenbox (bewusst ohne Lizenz), weil
  Teilen hier heißt: andere dürfen es nutzen. offen: Entscheidung Markus
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
- Ideen, aus der App: **Tagesübersicht** (Termine, Wetter, Micro-Akku aus Bubble Log) · **Hanshin-Tigers-Ergebnis**
- fest **Eingabe am Sticky nur für Kleinkram** (Markus, 13.11.2026): längere Texte tippt man am Fold/Zenbook oder
  diktiert. Am Sticky:
  - **Zahlenfeld** (Touch, große Tasten, Teil-Refresh je Taste): Minuten für den Timer, Zähler, kurze Zahlen
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
  - dazu **Firmware-Update von der Karte** (`/soll/firmware.bin`, OTA-Partitionen vorhanden) als Sicherheitsnetz:
    künftige Updates per App statt Kabel
  - geparkt: Skriptsprache auf dem Sticky (z. B. Berry wie in Tasmota), maximal flexibel, aber zu viel Dauerpflege
- offen: Wie man zwischen Widgets wechselt (eigener Modus mit ▲/▼ wie die Bestellzettel?); Reihenfolge nach den Szenen
  oder davor

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
- fest **Tastenhilfe**: ▲ und ▼ gleichzeitig zeigt, was die Tasten auf dieser Seite tun (auch für Übergabe)
- Vorschlag **Rückmeldung**: Klick sofort (gibt es), dazu Rahmen ums gedrückte Feld per Teil-Refresh (~0,3 s),
  Sanduhr in der Statuszeile bei allem über 1 s
- Vorschlag **Lesbarkeit im Micro**: Mindestgröße ~28 px für Fahr-Infos, nur Schwarz/Weiß, dicke Linien
- später: hoch/quer automatisch über den Bewegungssensor (jede Seite in beiden Lagen, doppeltes Rendern in der App)
- Tastenregeln und Karussell (FW 0.13.0), Statuszeile (0.14.0), Tastenhilfe und Tipp-Rahmen (0.15.0) umgesetzt ( Szenen noch nicht: ein Karussell für alles)
- Reihenfolge: Tastenregeln, Karussell, Statuszeile zuerst (Grundlage für die Widgets), dann Schlafbild-Regel,
  Rückmeldung, Hilfe

### Eigene Sensoren (laut Schaltplan, Bus MISC_I2C)
| Baustein | Adresse | heute | Vorschlag |
|---|---|---|---|
| Bewegung LSM6DS3TR-C (6 Achsen) | 0x6A, Interrupt 6D_INTn | ungenutzt | Fahrt selbst erkennen → wach bleiben ohne GPS-Umweg im Dienst; Wecken per Bewegung aus dem Schlaf (fast null Verbrauch im Stand, sofort da beim Losfahren); Klopfgeste; hoch/quer |
| Temperatur/Feuchte SHT40 | 0x44 | ungenutzt | Innenraumklima Microlino als Messreihe; Warnung „lädt nicht, zu kalt/heiß“ (Lader nur 0–45 °C); Taupunkt → „Scheibe beschlägt gleich“ |
| Uhr PCF8563 | 0x51, Interrupt RTC_INTn | Uhrzeit | Zeitstempel aller Ist-Daten auch ohne Handy; Wecker für geplantes Aufwachen |
| Akku BQ27220 | 0x55 | Prozent | Verlauf, Restlaufzeit; Strom-Register 0x0C liefert Unsinn (mehrere A), klären |
| Lade-LED rot/grün, Summer, Mikro, Tasten, Touch | – | teils | LED als stille Rückmeldung (z. B. „Diktat gepuffert“) |

### Offen
- fest (Schaltplan 260609, Seite 5): **MISC_I2C = Akku-Bus** (SCL GPIO0, SDA GPIO1), alle Sensoren dort.
  **6D_INTn = GPIO7**, teilt sich die Leitung mit BFG_INT (Akku-Interrupt); GPIO7 ist RTC-fähig, also Wecken aus
  dem Schlaf möglich. **RED_LED = CHARGE_STATE = GPIO40**: die rote LED ist die Lade-Anzeige des Laders, nur bedingt
  frei schaltbar. **RTC_INTn hängt an VDD_3V3_ENn**, nicht an einem GPIO: der Uhr-Wecker schaltet die 3,3 V ein, also
  Einschalten aus „ganz aus“, kein Interrupt im Betrieb
- fest (13.11.2026): **schrittweise**: 1. Fahrtenschreiber (fertig, FW 0.10.0), 2. Sync-Protokoll mit /soll /ist
  und Umzug von Puffer/Home/Bordbuch (fertig, FW 0.11.0, Bestandsliste `stand.txt` je Ordner), 3. Sensoren (FW 0.12.0, Fahrterkennung noch an
  echten Fahrten einzustellen), danach Szenen
- Vorschlag **Messintervalle**: Klima wach 1/min, im Schlummern alle 15 min per Timer-Wecken; Bewegungssensor im
  Schlaf im Weck-Modus (~25 µA); Fahrtenschreiber nur Ereignisse. Ziel < 5 % Akku über Nacht
- Vorschlag **Fahrt**: die Bewegung entscheidet übers Wachbleiben, GPS im `StickyDienst` bleibt Rückfall, bis
  ein paar echte Fahrten gut gelaufen sind
- Vorschlag **Firmware von der Karte** (`/soll/firmware.bin`): eigener Schritt nach den Sensoren

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
| Variante | Namen (Bexbach/Homburg/Tanke) | Zeit je Diktat* |
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
