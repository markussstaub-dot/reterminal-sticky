# reTerminal Sticky – Spec

Grundidee (Markus, 11.11.2026): **Der Sticky als Erweiterung des Handys**, nicht in erster Linie als
Smart-Home-Tafel. Handy (Fold6) = Rechenleistung und Internet; Sticky = Knopf, Mikro und stromsparendes
Papier-Display, das man auf den Tisch legt oder irgendwo ranpappt.

Legende: **fest** = entschieden · **Vorschlag** = Claudes Idee, Markus entscheidet · **offen** = Frage

## Rolle
- fest: Handy-Erweiterung zuerst; Smart-Home-Anzeige nur nebenbei (siehe `../homeserver/SPEC.md`)
- fest: Werks-Firmware kann KI-Notizen, ist aber träge → eigene Firmware auf dem Bastel-Sticky
- Vorschlag: das zweite Gerät bleibt in Folie, bis klar ist, ob es gebraucht wird

## MVP (Markus, 11.11.2026)

fest: Das MVP sind **zwei Funktionen für den Microlino**, alles andere wartet:

### 1. Testnotizen für Bubble-Log-Testfahrten
- fest: Notiz per **Schnellknopf** (ein Tipp) oder **Diktat** (Taste halten), App stempelt Zeit + GPS
- Vorschlag Schnellknöpfe (5, groß, per App änderbar): „Bug“, „Erkennung falsch“, „Ampel“, „holprig“, „Merken“
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
  - offen: Gehört der Sticky dann fest in den Microlino (Halterung drucken, Strom per USB-C) – und wie
    teilt er sich die Rolle mit dem Knopf-Display?
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
