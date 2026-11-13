---
name: reTerminal Sticky
tag: reterminal-sticky
status: aktiv
kurz: Seeed reTerminal Sticky (3,97" E-Paper mit Touch, ESP32-S3) als Handy-Erweiterung, Fold6-App als Digital Twin.
version: FW 0.15.0 – Tastenhilfe (▲+▼), Rahmen beim Tippen, Statuszeile auf jeder Seite, Karussell und einheitliche Tastenregeln, eigene Sensoren (Klima SHT40 mit Taupunkt, Bewegung LSM6DS3 für Fahrt und Wecken), SD-Karte als Vertrag (/soll, /ist), Fahrtenschreiber, Puffer auf microSD, Schlummermodus, Home, Notizen, Bordbuch, Bestellzettel (13.11.2026)
wartet: Markus: Bewegungswecken von Hand prüfen (USB ab, 3 min liegen lassen, hochnehmen) und Fahrterkennung bei der nächsten Microlino-Fahrt; Offline-Diktat auf /ist/puffer einmal prüfen; Spickzettel prüfen (Felgen, Pannenhilfe-Nr.); Nachtverbrauch messen
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
- **Home, Modi, Bestellzettel** (Firmware 0.7.0, `firmware-ble/modus.h`): Start im Modus Home (Visitenkarte
  hochkant + Uhr). KI kurz = Home ↔ Notiz, KI halten = Diktat, ▲ = Bordbuch, ▼ auf Home = Bestellzettel, 5 min → Home.
  Bilder im Flash `/home/0–5.bin` (Karte, Notiz-Seite, Ziffernblatt, 3 Zettel), Kennung in `/home/version.txt`
  („crc;Anzahl Zettel“), die App spielt nur bei Änderung neu auf. Uhr: Ziffern aus dem Ziffernblatt ins Uhrfeld
  (Display x 352, y 40, 112 × 400), Teil-Refresh jede Minute, Voll-Refresh zur vollen Stunde; Ortszeit CET/CEST
- **Fester Platz im Microlino** mit USB-Spiralkabel (vermutlich nur Strom bei Zündung). Firmware liest GPIO9
  (PWR_IN_VOLT) als „USB da“ und meldet `usb` im Zustand – am Kabel stand `true`, **beim Abziehen noch bestätigen**.
  Mit USB wirbt der Sticky dauerhaft schnell, ohne sparsam; CPU läuft auf 80 MHz. Tiefschlaf gibt es noch nicht
- **Erste echte Testfahrt (11.11.2026 abends) und Fixes** (Firmware 0.7.1):
  - Fahrt 1 lief live auch mit Bubble Log im Hintergrund und Fold-Bildschirm aus; Puffern griff bei Abbrüchen
  - Fahrt 2: Bubble Log im Vordergrund (Wakelock) → Android hat die Sticky-App **eingefroren**, BLE-Meldungen stauten
    sich 8 min und kamen beim Öffnen auf einmal (mit falscher Zeit und Heim-GPS). Fix: **Vordergrund-Dienst**
    `StickyDienst` (connectedDevice|location, Benachrichtigung „Sticky verbunden“) solange verbunden, plus
    **Wiederverbinden** alle 15 s nur zum gemerkten Sticky (kein Scan). Am Tisch geprüft: Bubble Log vorne, Sticky
    neu gestartet → nach 5 s wieder verbunden
  - Ereignisse tragen jetzt die **Sticky-Zeit** (`ms`); Notizen bekommen Aufnahme- statt Ankunftszeit, und was > 60 s
    zu spät ankommt, bekommt kein GPS, sondern `offline:true`
  - WAV-Namen waren sekundengenau in UTC → 3 bzw. 5 Diktate teilten sich eine Datei; die „doppelte Notiz“ (gelbe Tonne)
    waren zwei Aufnahmen mit demselben Dateinamen. Jetzt Aufnahmezeit Ortszeit mit ms (`sticky-JJJJ-MM-TT-hh-mm-ss-mmm.wav`)
  - **Wortliste** als whisper-`initial_prompt` (in der App änderbar): Bexbach, Homburg, Tanke, Bubble Log werden mit
    den Testfahrt-Aufnahmen richtig erkannt; kostet +0,1–0,3 s
- **Wächter und Mikro** (Firmware 0.7.2): Aufnahmen unter 1 s, zu leise (Spitze < −38 dBFS) oder ohne Pegelabstand
  (< 8 dB zwischen 90 %- und 20 %-Quantil) gehen nicht an whisper, Text „(unklar)“, Ton bleibt; Text nur aus
  Wortlisten-Wörtern gilt auch als „(unklar)“. Mikro: Verstärkung ×2 statt ×4 (6 von 16 Fahrt-Aufnahmen übersteuert),
  weicher Begrenzer ab 20000, Hochpass ~120 Hz zweistufig gegen Fahrbrummen. Messung mit kühlem Fold: 14/14
  Sprachaufnahmen der Testfahrt erkannt in 1,3–3,2 s, die zwei 0,9-s-Schnipsel „(unklar)“. **Achtung:** Läuft parallel
  ein anderer whisper (z. B. whisper-cli-Tests) oder ist das Fold heiß (Thermal Status ≥ 2), dauert jede Erkennung bis
  zur 15-s-Notbremse und liefert leeren Text
- **App in Tabs** (unten: Sticky, Notizen, Bordbuch, Bestellen, Mehr; letzter Tab wird gemerkt), Logik unverändert
- **Vorschau = Spiegel des Sticky + Fernbedienung** (Firmware 0.7.3/0.7.4, `sticky-app/src/spiegel.js`): Der Sticky meldet
  nur Modus, Bordbuch-Seite und Zettel (Ereignisse `modus`/`seite`, Zustand `bb`/`zettel`); die App zeichnet das Bild
  selbst (Home/Notiz hochkant mit laufender Uhr, Bestellzettel, Bordbuch aus dem gemerkten Plan `sticky.bbplan`,
  der beim Aufspielen entsteht). Ohne Verbindung: letzter Stand + „nicht verbunden“. Fernbedienung: ▲/▼ und
  Modus-Knöpfe senden `MODUS m [seite]`, Tipp auf Notiz-Streifen = Notiz, Tipp im Bordbuch-Inhalt = Kapitel
- **Navigation hakte**: Während eines E-Paper-Refreshs (bis 2,3 s) steht loop(), kurze Drücke gingen verloren. Jetzt
  hält ein Interrupt je Taste den Druck fest und loop() holt ihn nach; Moduswechsel quittiert ein heller Doppelklick
- **Wetter auf der Home-Karte** (12.11.2026, nur App): Open-Meteo (frei, ohne Konto), Standort vom Handy auf ~1 km
  gerundet, sonst letzter bekannter Ort. Zeile „bewölkt 11° · 4–12° · Regen 22 %“ + „Stand hh:mm“ zwischen Hinweis und
  Uhr; beim Verbinden und stündlich, es wird nur das geänderte Home-Bild aufgespielt (CRCs in `sticky.homecrcs`)
- **Karten zum Vorzeigen** (Firmware 0.7.6, `sticky-app/src/karten.js`): Kundenkarten wie Lidl Plus als QR, in der
  Reihe nach den Bestellzetteln (▼ auf Home), zusammen höchstens 6 (`/home/3–8.bin`). QR mit ganzen Pixeln je Modul,
  keine Rasterung, Ruhezone 4 Module. Eintrag im Tab „Bestellen“ („## Titel“, „qr: Inhalt“); im Repo nur Platzhalter.
  **Offen:** echten Lidl-Code eintragen und an der Kasse testen (ist der Code statisch?)
  Bäckerei-Karte (Zettel 6, 12.11.): QR vom Sticky an der Kasse **nicht erkannt**, die Filiale liest offenbar per
  NFC, obwohl die Originalkarte auch einen QR hat. Erst mal so lassen, in anderen Filialen probieren
- **Akkusymbol auf Home** (Firmware 0.7.7, `firmware-ble/modus.h`): oben rechts, 4 Balken à 25 %, Blitz bei USB. Der
  Sticky zeichnet es selbst (offline), prüft minütlich und frischt nur das Feld auf, wenn sich Stufe oder USB ändern;
  der App-Spiegel zeigt es gleich. **Offen:** Blitz verschwindet beim Abstecken (USB-Erkennung GPIO9)?
- Zweite Meinung (Google KI, 12.11.2026) zur Aufgabenteilung: bestätigt. Neu notiert: **Winter** – E-Paper wird bei
  Frost träge, Teil-Refreshes (Uhr) können Schatten lassen → beobachten, ggf. bei Kälte öfter voll auffrischen
  (Temperatur liefert der Display-Chip); **„Teilen → Sticky“** aus jeder Android-App als Idee (SPEC)
- Bordbuch öffnet immer mit dem **Inhaltsverzeichnis** (Firmware 0.7.5); gezielte Sprünge aus der App bleiben; im
  Bordbuch ▲ 1 s = zurück zum Inhalt
- **Akku zieht zu viel** (Markus, 12.11.2026): über Nacht ohne USB ca. **50 %** weg (FW 0.7.7, mit dem Fold verbunden).
  Verdacht: kein Light-Sleep (CPU läuft durch), Ruhe-Verbindung 100–125 ms ohne Latenz, Mikro-Versorgung (GPIO38)
  evtl. dauernd an, minütliche Uhr-Teil-Refreshes. Ziel: Nacht < 5 %. Zuerst Strom je Zustand messen (BQ27220), dann
  Light-Sleep, Latenz in Ruhe hoch (schnell wecken bei Bild/Taste), Mikro nur bei Aufnahme an, nachts Uhr seltener
- **Schlummermodus** (Firmware 0.8.0, `firmware-ble/schlaf.h`): Befund: der Arduino-Kern hat kein automatisches
  Light-Sleep (CONFIG_PM_ENABLE aus), mit BLE-Verbindung läuft die CPU also immer; Display schläft schon nach jedem
  Refresh, Mikro ist aus. Darum im Akkubetrieb nach **2 min ohne Bedienung**: Ereignis „schlaf“ an die App, BLE ganz
  aus (deinit), Touch stromlos, Leichtschlaf bis zur nächsten Minute (Uhr, Akkusymbol) oder bis eine **Taste** weckt
  (Druck wird festgehalten, Touch weckt nicht). **Zur vollen Stunde 60 s Funk** für den Abgleich der App. Am USB nie.
  App zeigt „Sticky schlummert“ statt Fehler. Getestet 12.11. auf Akku: schlummert genau 2 min nach der letzten
  Berührung, Taste weckt sofort (Druck kommt an), App nach 4 s verbunden, Touch wieder da. App verbindet sich jetzt
  auch beim Start selbst mit dem bekannten Sticky. Stundenfenster klappt (09:00:10 verbunden, Abgleich, danach wieder Schlummern). **Offen:** Verbrauch über Nacht; einmal kam eine
  Meldung mit kaputtem erstem Byte („Unlesbar“) gleich nach dem Wecken
- **Testfahrt 12.11. vormittags** (Sticky auf Akku): bis 09:17 Diktate live, danach nur offline, App stumm. Ursache:
  Schlummermodus – zwischen zwei Diktaten > 2 min, der Druck auf KI weckte den Sticky, die Aufnahme lief aber, bevor
  das Fold verbunden war. Dazu um 09:44 WebView-Renderer von Android beendet (Speicher), App tot bis zum Öffnen.
  Diktate 10–15 dB leiser als gestern (Sticky lag vermutlich weiter weg). Behoben in der App: **Fahrt erkennen** (GPS,
  > 2 m/s) → jede Minute „wach“ (Op 0x1B, zählt am Sticky als Bedienung) bis 10 min nach dem Fahren; **leise
  Diktate anheben** (bis ×8) vor der Erkennung; **Renderer weg → Activity neu**, App verbindet selbst wieder (getestet
  mit Page.crash: nach 3 s wieder verbunden). **Offen:** nächste Testfahrt; einmal „Puffer-Liste antwortet nicht“
  direkt nach dem Neuaufbau
- **Testfahrt 2, 12.11. ~10–11 Uhr**: deutlich besser, hakte aber beim Wiederverbinden. Logs: Wer den Sticky per KI
  weckt und gleich diktiert, überschrieb mit der Einblendung „Aufnahme läuft“ (und den Knopf-Rückmeldungen) den
  Empfangspuffer `rxBuf`, während die App gerade das Abgleich-Bild schickte → „crc (48000 Byte angekommen)“, Bild
  nicht aktualisiert (10:57 und 11:21). Dazu wieder eine Meldung mit erstem Byte `\0`. Behoben in **FW 0.8.1**:
  eigener Puffer `hinweisBuf` für Einblendungen, Sperre um `sendEvt` (loop und BLE-Task senden beide); App liest
  `\0"…` trotzdem, Wiederverbinden alle ~13 s statt ~23 s (8 s Versuch + 5 s Pause). Logcat reichte nur bis 10:34;
  davor war die App im Hintergrund offenbar eingefroren (10:34:32 kamen alle Meldungen auf einmal). **Offen:**
  nächste Fahrt beobachten
- **Abgleich mit Bubble Log (12.11.)**: Rückfahrt 11:05–11:20 komplett offline, weil die App im Doze stillstand
  (keine Zeitgeber, kein Verbindungsversuch, obwohl der Vordergrund-Dienst lief). Behoben mit einem **Wecker** im
  `StickyDienst`: eigene GATT-Verbindung mit `autoConnect = true`, der Bluetooth-Stack verbindet von selbst, sobald
  der Sticky funkt, dann 60 s Wakelock und Ereignis `sticky` an die App → sofort verbinden. Getestet per Neustart des
  Sticky (nach 4 s wieder verbunden). **Offen:** echter Doze-Fall (Bildschirm lange aus, Sticky per Taste wecken)
- **Akku lud nie (12.11., FW 0.8.2)**: Markus' Eindruck „lädt nicht“ stimmte, am Kabel 0 mA. Ursache laut Schaltplan:
  `EN_BAT_CHGn` (GPIO39) geht an /CE des Laders BQ25616, der hat 100k nach GND, aber GPIO39 ist MTCK mit internem
  Pull-up (beim Start gelesen: 1 = Laden gesperrt). Jetzt treibt die Firmware GPIO39 LOW, im Schlaf per `gpio_hold`.
  Danach 30 → 34 % in ~6 min am PC. Dazu die USB-Erkennung: GPIO9 hängt an einem 5,1k/5,1k-Teiler (~2,4 V am PC),
  digital genau an der Schwelle, darum misst sie jetzt per ADC (> 1,5 V = USB). Ladetemperatur laut Schaltplan 0–45 °C
  (NTC), im kalten Auto im Winter lädt er also evtl. nicht
- **Testfahrt 3 (12.11. nachmittags), Sticky nur auf Akku**: Mit Bubble Log im Vordergrund landeten fast alle Diktate
  während der Fahrt offline (ohne Ort). Ursache: Die WebView pausiert im Hintergrund (14:41–15:08 nicht einmal ein
  Verbindungsversuch), ihr „wach“-Zeitgeber lief nicht, der Sticky schlummerte nach 2 min ein. Jetzt sendet der
  `StickyDienst` WACH: liest GPS passiv mit (was Bubble Log ohnehin anfordert), bei > 2 m/s bis 10 min danach alle
  45 s über die Wecker-Verbindung (App 2026.11.12-1612). **Offen:** auf der nächsten Fahrt prüfen (Log „Wach an
  Sticky: ok“); fährt man ohne Bubble Log, greift nur der alte Weg mit der App vorne
- **microSD als Puffer (13.11., FW 0.9.0/0.9.1)**: 32-GB-Karte (SDHC, FAT32) im SPI-Modus am E-Paper-Bus: SCK 13,
  MOSI 14, MISO 12, CS 8, Strom GPIO10 (HIGH = an), Erkennung GPIO11 (LOW = steckt). `karte.h` (nicht `sd.h`, kollidiert
  unter Windows mit `SD.h`) hängt sich wie im Seeed-Beispiel an die SPIClass des Displays. Offline-Diktate und -Notizen
  liegen in `/puffer` auf der Karte, ohne Karte im Flash; Flash-Reste ziehen beim Start um; vor dem Leichtschlaf
  stromlos. **Fehler dabei gefunden:** Über die Wecker-Verbindung allein (MTU 23, keine App) galt der Sticky als
  verbunden, Diktate gingen mit `err mtu` verloren. Jetzt zählt nur „App hört zu“ (Abo auf AUDIO), sonst Puffer.
  Getestet: App ferngetrennt, 2 Diktate auf SD, nach dem Verbinden abgeholt und abgetippt
- **Fahrtenschreiber (FW 0.10.0, 13.11.2026, Zwilling 2.0 Schritt 1):** `/ist/log/JJJJ-MM-TT.txt` auf der Karte,
  eine Zeile je Ereignis (Start mit Reset-Grund, Tasten, Modus, verbunden/getrennt, App hört zu/nicht, Diktat live/
  offline/gepuffert, Schlummern/Wachwerden/Stundenfenster, Akku alle 10 min und bei USB/Laden, Uhr gestellt, Fehler).
  RAM-Ring, geschrieben aus loop() und vor dem Schlummern (SPI geteilt mit dem Display). Erste allgemeine
  Abgleich-Befehle `LISTE/HOLEN/LOESCHEN` (0x20–0x22, nur unter `/ist`, `abgleich.h`). Die App holt beim Abgleich
  nur den neuen Teil, löscht vergangene Tage und zeigt das Protokoll unter „Mehr → Fahrtenschreiber“.
  Am Gerät geprüft: Zeilen landen auf der Karte, App holt sie ab (Fold: `files/fahrtenschreiber/`)
- **SD-Karte als Vertrag (FW 0.11.0, 13.11.2026, Zwilling 2.0 Schritt 2):** `/soll/home|bordbuch|notiz` schreibt nur
  die App (SCHREIBEN 0x23–0x25, bis 1 MB im PSRAM, CRC, dann ablegen), `/ist/log|puffer` nur der Sticky. Je Soll-Ordner
  eine Bestandsliste `stand.txt`; die App schreibt nur Geändertes, räumt Überzähliges ab und schreibt die Auslöser
  (`version.txt`, `index.txt`, `layout.txt`) zuletzt. LISTE blättert (`pfad|ab`). Ablage-Schicht `ablage.h`: ohne Karte
  alte Flash-Pfade, Home 0–2 immer auch im Flash. Beim ersten Start mit 0.11.0 zieht der Inhalt aus dem Flash auf die
  Karte, das Bordbuch im Flash wird danach freigegeben. Alte Spezialbefehle laufen weiter.
  Am Gerät geprüft: 100 KB schreiben/lesen/löschen (3,4 s schreiben), Bordbuch-Abgleich (125 Altlasten abgeräumt,
  zweiter Lauf 0 Dateien), Home (2 von 10 Dateien), Notiz nach Löschen von selbst wiederhergestellt, Puffer über /ist
- **Eigene Sensoren (FW 0.12.0, 13.11.2026, Zwilling 2.0 Schritt 3, `sensoren.h`):** SHT40 (0x44) misst wach jede
  Minute, im Schlummern alle 15 min → `/ist/mess/klima-JJJJ-MM-TT.csv` (Zeit, °C, %rF, Taupunkt); Warnungen „Beschlag
  droht“ (< 2 K zum Taupunkt) und „zu kalt/heiß zum Laden“ in den Fahrtenschreiber; Zustand meldet `temp`, `rf`,
  `taupunkt`, `fahrt`, `sensoren`. LSM6DS3TR-C (0x6A, 26 Hz Stromsparmodus, Kreisel aus): Wake-up auf GPIO7 (offener
  Drain, geteilt mit BFG_INT) weckt aus dem Schlummern; Fahrt = 15 von 20 Zwei-Sekunden-Fenstern „rütteln“ (8–150 mg
  Streuung bei gleicher Lage), Ende nach 2 min Ruhe, dazwischen bleibt er wach; getragen (unruhig) sperrt das
  Bewegungswecken 5 min. Schwellen sind Startwerte. App holt Messreihen ab (`files/messreihen/`) und zeigt Klima im
  Zustand. Am Gerät geprüft: beide Sensoren erkannt, Lage 1,02 g, Klima 22,9 °C / 39 %, Messreihe abgeholt.
  **Noch nicht geprüft:** Wecken durch Bewegung im Akkubetrieb, Fahrterkennung bei echter Fahrt
- **Erste Fahrt mit FW 0.12.0 (13.11.2026, 08:07–08:38):** Wecken durch Bewegung ok (08:07), „getragen“ ok,
  **Fahrt erkannt** nach ~6 min (Streuung 21 mg), Offline-Diktat über /ist/puffer abgeholt und abgetippt, Klima-
  Messreihe zeigt Heizung (bis 28,7 °C) und Lüften (17,9 °C). Drei BLE-Abrisse (0x208, Funkloch/Tasche).
  **Fehler:** Nach dem Anstecken an USB (08:38) hing der I2C-Bus (Akku, Klima, Bewegung eingefroren, `fahrt` blieb an)
  und der Sticky ließ sich erst nach Ab- und Anstecken flashen (GPIO0 ist SCL und Boot-Pin). FW 0.12.1: Bus-Rettung
  (9 SCL-Takte + STOP, Wire neu), Fehler und Rettung landen im Fahrtenschreiber, Fahrt endet nach 2 min ohne
  Messwerte; Klima im Schlummern wirklich nur alle 15 min (vorher jede Minute). Ursache noch offen
- **Tastenregeln und Karussell (FW 0.13.0, 13.11.2026, SPEC „Bedienung und Oberfläche“):** KI kurz = Home, KI halten =
  Diktat; ▲/▼ kurz blättern (im Bordbuch und in den Zetteln seitenweise, an den Enden weiter im Karussell, rundum);
  ▼ 1 s = nächster Eintrag, ▲ 1 s = Anfang des Eintrags bzw. voriger. Reihe aus `/soll/einstellungen/karussell.txt`,
  in der App unter „Mehr → Karussell“ (Standard Home, Notiz, Bordbuch, Zettel). Lange Drücke und Bordbuch-Seiten
  stehen im Fahrtenschreiber. Am Gerät geprüft (Markus): ▼/▲ kurz, ▼ lang, ▲ am Anfang zurück, KI → Home
- **Statuszeile (FW 0.14.0, 13.11.2026, `status.h`):** rechts oben auf jeder Seite (288 × 32), vom Sticky gesetzt: Akku
  mit Blitz, Uhr (außer Home), Handy bzw. Zzz im Schlummern, offene Notizen mit Zahl, Warnung (Tropfen/Thermometer).
  Glyphen von der App (`/soll/home/status-quer.bin`, `status-hoch.bin`), auf schwarzen Kopfbalken weiß auf schwarz,
  Teil-Refresh nur bei Änderung. App: Kopfzeilen rechts freigeräumt (Zähler darunter), Notiz-Titel „Notiz“, Home-Hinweis
  auf die neuen Tasten. Am Gerät geprüft (Foto): Handy und Akku mit Blitz auf Home, Hinweis neu; Symbole nach
  Teil-Refresh etwas blass
- **App im Hintergrund (13.11.2026, aus dem Fahrt-Abgleich `auswertungen/2026-11-13-fahrt.md`):** Mit Bubble Log
  vorne kamen BLE-Meldungen (Tasten, Audio, Zustand) nach ~1 min nicht mehr in JS an, erst beim Öffnen der App. Folgen:
  „App hört nicht zu“ nach dem Wiederverbinden, Diktate erst später verarbeitet und dann als offline ohne Ort gespeichert.
  Ursache: Capacitors Zustellweg über `postMessage` (WebMessageListener) stockt im Hintergrund, Antworten auf eigene
  Aufrufe kamen dagegen an. **Fix:** `android.useLegacyBridge: true` in `capacitor.config.json` (gemessen: Zustand
  weiter alle 30 s), dazu Renderer-Priorität „wichtig“ auch unsichtbar und WebView nach onPause/onStop wieder an
  (`MainActivity.java`), Ort-Rückfall aus dem passiven GPS des Dienstes (`Hintergrund.letzterOrt`, ≤ 2 min alt).
  Geprüft: zwei Diktate mit Homescreen vorne kamen sofort mit Text und Ort an. FW 0.14.1: Offline-Diktat trägt die
  Startzeit der Aufnahme statt des Endes
- **Lernendes Wörterbuch (13.11.2026, `sticky-app/src/woerterbuch.js`, SPEC „lokales Modell flott machen“ Schritt 2):**
  nach jeder Erkennung „falsch → richtig“ ersetzen (ganze Wörter) und Prozente über 100 mit „(?)“ markieren; die
  erkannte Fassung bleibt als `roh` in der Notiz. Notiz antippen → Textfeld in der Liste → Speichern lernt neue Paare
  (nicht: Zahlen, Wörter der Wortliste). Liste unter „Mehr → Wörterbuch“. Ton gemessen: seit ×2/Hochpass/Begrenzer
  sauber (0 gekappt, 23–38 dB), Fehler kommen vom Modell. **Panne beim Test:** der Android-Dialog von `window.prompt`
  verschwand und speicherte leer (3 Notizen, aus `roh` wiederhergestellt) → ersetzt durch Textfeld, leer = Abbrechen.
  Am Fold geprüft: Korrektur gespeichert, „Mikrohogen → Mikrofon“ gelernt
- **Fahrt ins Café (13.11.2026, ~10:17–10:23):** Sticky schlief und wurde von der Fahrt nicht geweckt (erst per Taste
  10:23:40). Ursache: Weckschwelle 62 mg, der Micro rüttelt beim Fahren nur ~21 mg (Wert aus „Fahrt erkannt“ am
  Morgen); dazu die 5-min-Sperre nach „getragen“ bis 10:19. FW 0.14.2: Schwelle auf das Minimum 31 mg. Anstecken an
  USB diesmal ohne I2C-Hänger. Zu prüfen: wacht er jetzt beim Fahren auf, und nicht zu oft auf dem Tisch
- **Café-Tisch mit 31 mg (13.11.2026, 10:33–11:00):** 6× durch Bewegung geweckt (vermutlich Tippen am selben Tisch),
  100 → 97 % in 30 min. FW 0.14.3: nach dem Wecken 3 s prüfen, ohne Funk; ganz wach nur bei Streuung > 12 mg (Micro
  ~21 mg) oder Lageänderung > 0,15 g, sonst weiterschlafen und als Fehlalarm zählen (Zahl steht im Stundenfenster).
- **Notizen sortieren (13.11.2026, `sticky-app/src/sorte.js`, Sprachnotizen 2.0 Schritt 1):** Stichwort am Anfang
  („Einkauf“, „Idee“, „Erinnere mich“, „Fahrt“, „Erzählung“) geht vor und fällt aus dem Text; sonst Zeitangabe →
  Erinnerung, Kaufen/Besorgen → Erledigung, „man könnte/wäre cool“ → Idee, fährt oder Fahrt-Wörter → Fahrt, lang →
  Erzählung, sonst Eingang. Knöpfe = Fahrt. Schild in der Notizliste, Antippen schaltet weiter („von Hand“)
- **Tastenhilfe und Tipp-Rahmen (FW 0.15.0, 13.11.2026):** ▲ und ▼ zusammen zeigen `/soll/hilfe/<modus>.bin` (App
  rendert die Seiten aus `sticky-app/src/hilfe.js` wie Spickzettel), jede Taste schließt sie; Uhr und Statuszeile
  malen währenddessen nicht hinein. Tippen auf Notiz-Streifen oder Kapitel im Inhaltsverzeichnis zeichnet sofort
  einen dicken Rahmen (Teil-Refresh), nach 1,5 s weg. Am Gerät geprüft (Markus). Tischtest mit 0.14.3: 11:08–11:17
  durchgeschlafen trotz Tippen am Tisch, wach erst beim Hochnehmen (203 mg)
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
