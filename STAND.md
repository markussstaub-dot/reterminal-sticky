---
name: reTerminal Sticky
tag: reterminal-sticky
status: aktiv
kurz: Seeed reTerminal Sticky (3,97" E-Paper mit Touch, ESP32-S3) als Handy-Erweiterung, Fold6-App als Digital Twin.
version: Durchstiche laufen – Bild, Tasten/Touch, Audio per BLE, Spracherkennung offline (Text ~0,8 s nach Loslassen) (11.11.2026)
wartet: Markus wählt den nächsten Schritt (eigene Android-Tastatur fürs Diktat, Visitenkarte in der App, E-Book …)
---

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
- Akkustrom `ma` aus Register 0x0C wirkt unplausibel (mehrere A beim Laden), noch nicht geprüft

## Technik
- Bauen: `arduino-cli compile -b "esp32:esp32:XIAO_ESP32S3:PSRAM=opi,CDCOnBoot=cdc" --build-path
  "%LOCALAPPDATA%\sticky-build\firmware-ble" firmware-ble`, aufspielen mit
  `-p COM7 --upload-property upload.speed=460800 --input-dir …` (921600 bricht ab)
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
