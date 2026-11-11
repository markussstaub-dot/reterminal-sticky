---
name: reTerminal Sticky
tag: reterminal-sticky
status: aktiv
kurz: Seeed reTerminal Sticky (3,97" E-Paper mit Touch, ESP32-S3) als Handy-Erweiterung, Fold6-App als Digital Twin.
version: MVP läuft – Testnotizen (auch ohne Handy, gepuffert) und Bordbuch offline (11.11.2026)
wartet: Markus prüft die Spickzettel (Felgen des Pioneer, Pannenhilfe-Nummer) und testet im Auto
---

Repo: github.com/markussstaub-dot/reterminal-sticky (privat, seit 11.11.2026). `backup/`, Modelle und
Build-Ausgaben sind per `.gitignore` draußen.

## Zwei Geräte
- **Bastel-Sticky** (MAC `xx:xx:xx:xx:xx:xx`, BLE-Name `Sticky-559D`): trägt seit 11.11.2026 die eigene
  Firmware `firmware-ble/`. Die Werks-Firmware dieses Geräts liegt in `backup/`
- **Zweites Gerät** bleibt in Folie. Vor dem ersten Flashen ebenfalls sichern (gerätespezifische Daten),
  nicht das eine Image auf das andere spielen

Konzept und offene Fragen: `SPEC.md`. BLE-Protokoll: `PROTOKOLL.md`.

## Durchstich (11.11.2026)
- `firmware-ble/`: Startbild Visitenkarte, BLE-Dienst „Sticky-BLE v1“ (NimBLE), Bild 800×480 1 bpp empfangen,
  Tasten/Touch als Ereignis, Zustand mit Akku (BQ27220). Rücksichtsvoll: Werbung ~600 ms, Ruhe 100–125 ms,
  nur beim Bild kurz 7,5–15 ms, BLE 2M
- `sticky-app/`: Capacitor 8 + Vite, App-ID `app.sticky.zwilling`. Vorschau 800×480 mit Stift, Text, Muster,
  „Senden“, „Visitenkarte“, Ereignisliste. Im Browser mit Simulator (`.claude/launch.json` „sticky-app“, Port 5205)
- Gemessen: Funk ~0,5 s, gesamt ~2,7 s für ein Vollbild (Details in `SPEC.md`)
- **Touch** (GT911, an 0x5D) läuft. Bezugslage: Querformat, USB-Anschluss oben rechts; Umrechnung
  x = 799 − ry, y = 479 − rx (am Gerät geprüft). Ursache des Ausfalls: Der Chip war nach dem Reset noch
  nicht hochgefahren. Jetzt kommt erst ein Stromzyklus (EN 50 ms aus), dann der Goodix-Reset (INT 55 ms low),
  danach 100 ms warten
- **Audio** (`firmware-ble/audio.h`, Firmware 0.2.0): KI-Taste halten → Aufnahme. Mikro MSM261 (PDM) an CLK GPIO19,
  DATA GPIO20, Strom PDM_EN GPIO38 (HIGH = an). Es liegt auf dem **rechten** PDM-Kanal; der Selbsttest beim Start
  wählt ihn automatisch (Streuung statt Effektivwert, links steht ein fester Wert). App: Aufnahmen-Liste mit Player,
  WAV im App-Speicher `files/aufnahmen/` (`adb exec-out run-as app.sticky.zwilling cat files/aufnahmen/…`)
- **Spracherkennung** (Stufe 1, offline): Plugin `Spracherkennung` (`android/app/src/main/java/app/sticky/zwilling/`,
  JNI in `android/app/src/main/cpp/`) mit whisper.cpp. Quellcode liegt außerhalb von OneDrive in
  `%LOCALAPPDATA%\sticky-whisper\whisper.cpp` (git clone --depth 1, Stand 10.11.2026), Modelle in
  `%LOCALAPPDATA%\sticky-whisper\modelle`. Aufs Fold: `adb push <modell> /data/local/tmp/`, dann
  `adb shell "run-as app.sticky.zwilling cp /data/local/tmp/<modell> files/modelle/"` (in Git-Bash vorher
  `MSYS_NO_PATHCONV=1`, sonst verbiegt es den Handy-Pfad). `adb install -r` behält die Modelle
- Build braucht NDK 28.2.13676358 + CMake 3.31.6 (im Android-SDK). Erster Build ~5 min, danach schnell
- **MVP 1 Testnotizen** (Firmware 0.3.0): Beim Verbinden zeichnet die App die Seite „Fahrt“ (5 Schnellknöpfe, per App
  änderbar) und schickt sie. Ein Tipp auf eine Kachel oder ein Diktat (KI halten) ergibt eine Notiz mit Zeit und GPS.
  Am Sticky erscheint „✓ Bug 14:32“ als **Teilbild** (neu: BILD_START mit x/y, Teil-Refresh). Notizen liegen in
  `files/notizen/sticky-notizen-JJJJ-MM-TT.jsonl`, Zeilen `{"t","typ":"notiz","quelle":"sticky","art":"knopf|diktat",
  "knopf"|"text","audio","lat","lon","gen","tempo"}` wie im Bubble-Log-Entwickler-Log; „Notizen teilen“ öffnet Android-Teilen
- whisper mit gekürztem Fenster kann in eine **Wiederholschleife** kippen (1,9-s-Diktat hing minutenlang). Abhilfe:
  temperature_inc 0, max_tokens nach Länge, Abbruch nach 15 s, Rand 128 Frames; erkennt die App eine Schleife, rechnet
  sie mit vollem Fenster nach (~4 s). Danach 3 Diktate in 0,6–0,7 s, kurze Sätze teils schwach erkannt
- Moduswechsel Fahrt/Bordbuch per **▲ lang** (nicht KI lang: KI halten ist schon Diktat)
- **Fahrt-Seite hochkant** (seit 11.11.2026 abends): Sticky aus der Querlage im Uhrzeigersinn gedreht → Tasten oben
  rechts, USB unten. Die App zeichnet 480×800 und dreht fürs Display, Touch rechnet sie zurück
  (`src/fahrtseite.js`, Firmware unverändert). Bordbuch bleibt quer (Handbuch A4 quer). Kein Autorotate
  (Lagesensor LSM6DS3 wäre da, falls später gewünscht)
- Offen: Läuft die App im Hintergrund weiter (BLE, Notizen), wenn Bubble Log/Android Auto vorne ist? Bei der
  ersten Testfahrt prüfen
- **MVP 2 Bordbuch** (Firmware 0.4.0): **32 MB Flash** mit eigener `firmware-ble/partitions.csv` (app0/app1 je 4 MB,
  LittleFS „spiffs“ 23,9 MB). Die App rendert Inhalt + 5 Spickzettel (Text in der App, aus dem Handbuch vorbefüllt)
  + das Handbuch-PDF mit pdf.js (jede A4-Querseite in 4 Ausschnitten, ~1,6-fach, Floyd-Steinberg) und spielt sie
  einmalig auf: 150 Seiten, 7,2 MB, **290 s**. Bedienung am Sticky ohne Handy: ▲ 1 s = Modus Fahrt/Bordbuch,
  ▼/▲ blättern, KI = Inhalt, Tipp im Inhalt = Kapitel. Blättern **2,2 s** je Seite (normaler Refresh; `updateFast`
  gab eine falsche Anzeige). Das Handbuch-PDF bleibt privat: PC `%LOCALAPPDATA%\sticky-bordbuch\handbuch.pdf`,
  Fold `files/bordbuch/handbuch.pdf` (per adb oder „Handbuch-PDF wählen“), nicht im Repo
- Im ausgeblendeten Browser-Fenster läuft pdf.js nicht (Animationstakt steht) → zum Testen das Fenster einblenden
- **Notizen puffern** (Firmware 0.5.0): Ohne Verbindung legt der Sticky Knopf-Notizen und Diktate selbst ab
  (`firmware-ble/puffer.h`, LittleFS `/puffer/`), mit Zeit aus der eingebauten Uhr **PCF8563 (0x51, am Akku-Bus
  GPIO0/1)**, die App stellt sie bei jedem Verbinden. Fahrt-Layout und Rückmeldebilder („✓ Bug“, „● Aufnahme“,
  „✓ Diktat gespeichert“) rendert die App und spielt sie einmalig auf (Version über CRC im Zustand). Beim Verbinden
  holt die App alles ab, erkennt die Diktate und löscht den Puffer. Gemessen: Diktat 2,9 s (21 KB) in 3,1 s abgeholt
- **Lehre:** Viele Notifications am Stück kommen am Fold nur zu einem Fünftel an (15 von 84). Abholen deshalb als
  Anfrage/Antwort je 480 Byte mit Wiederholung; `sendEvt` wartet bei vollem Sendepuffer, statt Meldungen zu verwerfen
- SD-Karte: Slot vorhanden (CS 8, EN 10, DETECT 11, SPI geteilt mit dem Display), noch nicht genutzt; der Puffer liegt
  im internen Flash (~16 MB frei ≈ 30 min Diktat)
- Akkustrom `ma` aus Register 0x0C wirkt unplausibel (mehrere A beim Laden), noch nicht geprüft

## Technik
- Bauen und aufspielen (seit 0.4.0 mit 32 MB): `arduino-cli compile -u -p COM7 -b
  "esp32:esp32:XIAO_ESP32S3:PSRAM=opi,CDCOnBoot=cdc" --build-property build.flash_size=32MB --build-path
  "%LOCALAPPDATA%\sticky-build\firmware-ble" firmware-ble` (lief mit 921600 durch; bei Abbrüchen 460800).
  Neue Firmware lässt die Bordbuch-Seiten im Flash stehen
- App: `sticky-app\apk.ps1` (Tests → Build → Gradle → `adb install -r` → App starten). OneDrive vorher anhalten
  (`OneDrive.exe /shutdown`, danach `/background`), Build-Ausgaben liegen in `%LOCALAPPDATA%\sticky-app-build`
- Pins (Schaltplan `reTerminal_Sticky_Schematic_diagram_260609.pdf`, Blatt SCH_TOP; Tasten am Gerät bestätigt):
  Tasten aktiv low KI GPIO4, ▲ GPIO5, ▼ GPIO6 · PWR_HOLD GPIO45 · Summer GPIO48 · Touch SCL 2 / SDA 3 / INT 21 /
  RST 41 / EN 42 · Akku-Chip BQ27220 (0x55) SCL 0 / SDA 1 · CHARGE_STATE GPIO40 · Display wie Seeed_GFX2
- **Stolperfalle:** Tasten und Touch erst **nach** `display.begin()` einrichten, sonst kommen keine Tastendrücke an
- GT911 bringt eine eigene Konfiguration mit (ab Werk 0x41). Die Firmware schreibt die Seeed-Konfiguration nur,
  wenn keine da ist (Blob aus `backup/`, Offset 0xE1B18, Version 0x63). Bei einem frühen Test ist 0x63 im Chip
  gelandet, Touch geht damit
- ESP32-S3, 32 MB Flash, 8 MB Octal-PSRAM; USB über CH343 → COM7
- Werks-Firmware: `reterminal_template` v1.2.0, ESP-IDF 5.4, OTA-Partitionen app0/app1 (je 6 MB);
  zurück mit `esptool --port COM7 -b 460800 write-flash 0 backup/werksfirmware-32MB_c49e7e19559c.bin`

## Idee: Diktier-Knopf à la Wispr Flow (geparkt)
- Siehe SPEC.md (Diktat über BLE-Audio an die App). Der ESP32-S3 kann nur BLE, kein klassisches BT
