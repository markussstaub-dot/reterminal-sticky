# reTerminal Sticky – Handy-Erweiterung

Seeed reTerminal Sticky (ESP32-S3, 3,97″ E-Paper 800×480 mit Touch und Mikro) als dünnes Terminal,
die Android-App auf dem Fold6 als sein Digital Twin.

| Ordner | Inhalt |
|---|---|
| `firmware-ble/` | Firmware: Display, Tasten/Touch, Mikro (ADPCM), BLE-Dienst „Sticky-BLE v1“ |
| `sticky-app/` | App (Capacitor 8 + Vite): Live-Vorschau, Bild senden, Audio, Spracherkennung (whisper.cpp) |
| `visitenkarte/` | Erster Pilot ohne App: Visitenkarte mit QR-Code |

Konzept: `SPEC.md` · Protokoll: `PROTOKOLL.md` · Stand, Pins und Build-Befehle: `STAND.md`

Nicht im Repo: Werks-Firmware-Sicherungen (gerätespezifisch), whisper-Modelle, whisper.cpp-Quellcode
(liegt unter `%LOCALAPPDATA%\sticky-whisper`), Build-Ausgaben.
