# The EDC Sticky – reTerminal Sticky as an everyday-carry companion

> **Useful on its own – the phone app makes it as smart as you like.**

Custom firmware and an Android companion app for the **Seeed reTerminal Sticky** (ESP32-S3, 3.97″ e-paper 800 × 480
with touch, microphone, buzzer, motion and climate sensors). The Sticky becomes a pocket helper that runs on its own
for days and syncs with the phone when it is near.

**Status: beta, used daily** on one device (Galaxy Z Fold6 + Sticky). Hobby project – feedback is welcome via GitHub
Issues, answers without guarantee.

## What it does

**On the Sticky, without the phone**
- Home with clock and status line, notes page, order slips and **QR cards** (guest Wi-Fi, links, loyalty cards)
- **Alarm** (rings even while dozing), **world time**, **timer**
- **Calculator** and **unit converter** – computed on the Sticky (Braun ET66-style keys, % and memory like the original)
- **Spirit level**, **ruler** in mm or inch, menu
- **Scribble pad**, **single-stroke handwriting** (recognised on the Sticky), **voice notes** buffered on the microSD
  card (IMA-ADPCM), button notes with timestamps
- **Trip logger** and climate (motion sensor detects driving; temperature, humidity, dew point)
- **Settings on the device:** 12/24 h, metric/US, set the clock (in case the battery ran flat and no phone is near)
- Portrait/landscape per page, automatic via the motion sensor, or rotated 180° for upside-down mounting
- One consistent look inspired by the Braun ET66 / BNE001 calculator (Dietrich Lubs, Dieter Rams)

**Together with the phone**
- Offline speech-to-text on the phone (whisper.cpp), optional copy to clipboard ("push-to-talk")
- Weather on Home, logbook pages, new pages and widgets, time zones for the world clock
- **Find each other**: the app makes the Sticky beep; pressing the AI key 3× makes the phone ring
- Content (slips, logbook pages, widgets, settings) is synced to the card; logs, notes and recordings are collected back

## How it works

- **BLE GATT service** `b1e50001-7374-6963-6b79-7465726d6e6c` (command, event, state, audio, file). Bytes in
  [`PROTOKOLL.md`](PROTOKOLL.md) (German).
- **The SD card is the contract:** `/soll/…` is written only by the app, `/ist/…` only by the Sticky. New features are new
  files, not new commands. Overview for anyone building their own app (e.g. iOS): [`SPEC.md`](SPEC.md), section
  "Für Fremd-Apps" (German).

| Folder | Content |
|---|---|
| `firmware-ble/` | Firmware (Arduino, ESP32-S3): display, keys/touch, sensors, BLE, card sync, widgets |
| `firmware-ble/bibliothek-patch/` | Small patch for the Seeed_GFX2 library (faster partial refresh) |
| `sticky-app/` | Android app (Capacitor 8 + Vite), whisper.cpp via JNI |
| `visitenkarte/` | First pilot: business card with QR code, no app |

## Build it yourself

You need a reTerminal Sticky with a microSD card, an Android phone (arm64), and on the PC: Arduino CLI with the ESP32
core, Node.js, Android SDK (NDK 28.2, CMake 3.31) and JDK 21.

**Back up the factory firmware first** (`esptool read-flash 0 0x2000000 backup.bin`) – it contains device-specific data.

### Firmware
1. Libraries: Seeed_GFX2 1.0.0 and NimBLE-Arduino. Apply `firmware-ble/bibliothek-patch/seeed_gfx2-sticky.patch` inside
   the Seeed_GFX2 folder (`git apply --unsafe-paths …`) – without it linking fails on purpose.
2. Adjust the business card in `firmware-ble/firmware-ble.ino` (`NAME`, `QR_TEXT`, `QR_LABEL`).
3. Build and flash:
   ```
   arduino-cli compile -u -p <PORT> -b "esp32:esp32:XIAO_ESP32S3:PSRAM=opi,CDCOnBoot=cdc" --build-property build.flash_size=32MB firmware-ble
   ```

### App
1. `cd sticky-app && npm install`
2. Speech recognition: clone whisper.cpp outside the repo to `%LOCALAPPDATA%\sticky-whisper\whisper.cpp`
   (`git clone --depth 1 https://github.com/ggml-org/whisper.cpp`), or change `WHISPER_DIR` in
   `sticky-app/android/app/build.gradle`.
   Models (e.g. `ggml-base-q5_1.bin`) go to the app's `files/modelle/` (via `adb push` + `run-as`, see `STAND.md`).
3. Build: `npx cap sync android`, then Gradle (`sticky-app/apk.ps1` does tests, build, install on Windows).
4. In the app: connect, then the app sets the clock and syncs everything to the card.

Most texts, comments and docs are in German – the project grew that way. The code is plain JavaScript and Arduino C++.

## Environmental footprint (rough)

Back-of-the-envelope, not a measurement (November 2026): building this took about **6–45 kWh** – roughly what my small
electric car (Microlino, ≈ 8 kWh/100 km) needs for **75–560 km**. Most of it, and the most uncertain part, are the AI
coding sessions (estimated 5–40 kWh over three intensive days; Anthropic publishes no per-request figures), plus about
1–2 kWh for the laptop. Running it costs almost nothing: the Sticky's battery holds a few watt-hours, so even a daily
charge stays below 2 kWh a year; the phone app needs no server. The hardware itself is not included.

## License

MIT, see [`LICENSE`](LICENSE). The Seeed_GFX2 patch applies to Seeed's library under its own license; whisper.cpp
(MIT) and the models are not included. Not affiliated with Seeed Studio or Braun.

---

*Deutsch: Eigene Firmware und Android-App für den Seeed reTerminal Sticky als Immer-dabei-Helfer. Konzept in
`SPEC.md`, Stand und Build-Details in `STAND.md`, Protokoll in `PROTOKOLL.md`.*
