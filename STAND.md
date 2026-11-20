---
name: reTerminal Sticky
tag: reterminal-sticky
status: hold
bereich: werkstatt
community: GitHub (MIT) · Seeed Playground-Registry (0.43) · FB-Post geplant
kurz: Seeed reTerminal Sticky (3,97" E-Paper mit Touch, ESP32-S3) als Handy-Erweiterung, Fold6-App als Digital Twin.
version: FW 0.44.0 auf beiden Stickys, APK 2026.11.18-1254 auf dem Fold; Playground zeigt 0.43
wartet: Markus: FB-Post, Sleeve drucken, echte Notfalldaten, Laufzeit im Sparmodus messen; Seeed: 0.44.0 noch nicht im Playground; Rest in VORSCHLAEGE-2026-11-18.md
---

Repo: github.com/markussstaub-dot/reterminal-sticky (öffentlich seit 15.11.2026, Geschichte vorher gesäubert: Name und Hinweis auf Angehörige, MAC; Sicherung der alten Geschichte lokal unter `%LOCALAPPDATA%\sticky-backup`). `backup/`, Modelle und
Build-Ausgaben sind per `.gitignore` draußen.

## Zwei Geräte
- **Markus' Sticky** (BLE-Name `Sticky-559D`, COM7): EDC 0.44.0, Alltagsgerät
- **Katjas Sticky** (`Sticky-5695`, COM10): EDC 0.44.0 in app0, Sticky Lab in app1; bis Weihnachten Lab-Gerät, dann Übergabe (To-do)
- Werks-Firmware beider Geräte liegt in `backup/` (gerätespezifisch, nicht das eine Image auf das andere spielen)

Konzept und offene Fragen: `SPEC.md`. BLE-Protokoll: `PROTOKOLL.md`. Bauverlauf mit Messwerten und Lehren seit
11.11.2026: `VERLAUF.md` (hier nur der aktuelle Stand, neue Einträge dort anhängen).

## Was er kann
- EDC-Sticky allein nützlich: Gruppen-Menü, Zeit, Messen, Notieren, Rechnen, Nachschlagen, Burgduell, DE/EN, Braun-Optik; mit App schlauer
- Erweiterung **Notfall**: Blatt bleibt bei leerem Akku stehen, SOS, Sparmodus, Dokumente mit PIN, Offline-Karten (OpenFreeMap, Zoom bis 1:12.500), Sonnenkompass, Papierkarte, Grund-Menü ohne App
- Console-Reiter „Notfall“ ohne Python, Bauanleitung `docs/NOTFALL.md`; Gehäuse-Baukasten (OpenSCAD, Sleeve v1)
- MIT, Repo öffentlich; Release v0.43.0 im Playground-Registry (PR #136, 18.11.2026)

## Nächstes
- Nächste APK-Runde nimmt den Fix „Lab-Kachel je Gerät“ mit (20.11.2026, `sticky-app/src/geraete.js`, noch nicht gebaut)
- `VORSCHLAEGE-2026-11-18.md`, v. a. Nr. 0: Notfall-Sparmodus sichtbar machen
- Spickzettel #notfall gegenlesen; Powerbank: Pass-Through/Kleinstrom prüfen
- Danach: zwei XIAO ESP32-C3 per ESP-NOW (Station 12), Tauch-Gehäuse, Bibliothek

## Technik
- Bauen und aufspielen (seit 0.4.0 mit 32 MB): `arduino-cli compile -u -p COM7 -b
  "esp32:esp32:XIAO_ESP32S3:PSRAM=opi,CDCOnBoot=cdc" --build-property build.flash_size=32MB --build-path
  "%LOCALAPPDATA%\sticky-build\firmware-ble" firmware-ble` (lief mit 921600 durch; bei Abbrüchen 460800).
  Neue Firmware lässt die Bordbuch-Seiten im Flash stehen
- App: `sticky-app\apk.ps1` (Tests → Build → Gradle → `adb install -r` → App starten). OneDrive vorher anhalten
  (15.11.2026: adb läuft auch über den magnetischen USB-Adapter am USB-A des Zenbook, nicht nur Laden. Legt OneDrive
  die Web-Dateien als Platzhalter ab, scheitert Gradle mit „not a regular file“ → vorher
  `attrib +P -U android\app\src\main\assets\* /S /D`)
  (`OneDrive.exe /shutdown`, danach `/background`), Build-Ausgaben liegen in `%LOCALAPPDATA%\sticky-app-build`
- Pins (Schaltplan `reTerminal_Sticky_Schematic_diagram_260609.pdf`, Blatt SCH_TOP; Tasten am Gerät bestätigt):
  Tasten aktiv low KI GPIO4, ▲ GPIO5, ▼ GPIO6 · PWR_HOLD GPIO45 + PWR_LOCK GPIO46 (beide HIGH, sonst geht manches Gerät ohne USB aus) · Summer GPIO48 · Touch SCL 2 / SDA 3 / INT 21 /
  RST 41 / EN 42 · Akku-Chip BQ27220 (0x55) SCL 0 / SDA 1 · CHARGE_STATE GPIO40 · Display wie Seeed_GFX2
- **Stolperfalle:** Tasten und Touch erst **nach** `display.begin()` einrichten, sonst kommen keine Tastendrücke an
- GT911 bringt eine eigene Konfiguration mit (ab Werk 0x41). Die Firmware schreibt die Seeed-Konfiguration nur,
  wenn keine da ist (Blob aus `backup/`, Offset 0xE1B18, Version 0x63). Bei einem frühen Test ist 0x63 im Chip
  gelandet, Touch geht damit
- ESP32-S3, 32 MB Flash, 8 MB Octal-PSRAM; USB über CH343 → COM7 (17.11.2026: COM10)
- Werks-Firmware: `reterminal_template` v1.2.0, ESP-IDF 5.4, OTA-Partitionen app0/app1 (je 6 MB);
  zurück mit `esptool --port COM7 -b 460800 write-flash 0 backup/werksfirmware-32MB_c49e7e19559c.bin`

## Idee: Diktier-Knopf à la Wispr Flow (geparkt)
- Siehe SPEC.md (Diktat über BLE-Audio an die App). Der ESP32-S3 kann nur BLE, kein klassisches BT
