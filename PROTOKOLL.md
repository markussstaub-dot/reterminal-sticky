# Sticky-BLE v1 (Durchstich, 11.11.2026)

Ein GATT-Dienst, drei Kennlinien. Gerät = dünnes Terminal (Peripheral), App = Zwilling (Central).
Gedacht auch für den Microlino-Knopf: gleiche Rahmen, nur andere Bildgröße im START-Rahmen.

| Kennlinie | UUID | Richtung | Inhalt |
|---|---|---|---|
| Dienst | `b1e50001-7374-6963-6b79-7465726d6e6c` | | |
| BEFEHL | `b1e50002-…` | App → Gerät, write / write-no-response | binäre Rahmen (unten) |
| EREIGNIS | `b1e50003-…` | Gerät → App, notify | JSON |
| ZUSTAND | `b1e50004-…` | Gerät → App, read / notify | JSON |
| AUDIO | `b1e50005-…` | Gerät → App, notify | ADPCM-Pakete (unten) |
| DATEI | `b1e50006-…` | Gerät → App, notify | Puffer-Stück: `offset:u32` + bis 480 Byte (0 Byte = Ende) |

## Rahmen auf BEFEHL (Little Endian)
| Op | Name | Aufbau |
|---|---|---|
| `01` | BILD_START | `01 fmt w:u16 h:u16 len:u32 crc32:u32 [x:u16 y:u16]` – fmt 0 = 1 bpp; 800×480 → len 48000. Mit x/y ein **Teilbild** (x, w Vielfache von 8, Teil-Refresh; unter 4 KB ohne Umschalten auf schnell) |
| `02` | BILD_DATEN | `02 offset:u32 daten…` – Nutzlast = min(MTU−3, 512) − 5, write-no-response |
| `03` | BILD_ENDE | `03 modus [seite]` – 0 = Vollbild-Refresh, 1 = schnell, **3 = nicht zeigen, als Bordbuch-Seite `seite` speichern**, **4 = Teilbild als Offline-Rückmeldung `seite` (0–4 Knöpfe, 5 Diktat, 6 Aufnahme) speichern**, **5 = Home-Bild `seite` speichern (0 Karte, 1 Notiz-Seite, 2 Ziffernblatt, 3–5 Bestellzettel)** |
| `10` | PING | Gerät antwortet `{"t":"pong"}` und schickt den Zustand |
| `11` | KARTE | Gerät zeigt die eingebaute Visitenkarte |
| `13` | BB_INDEX | Text: `seiten=N`, `toc=K`, `e x0 y0 x1 y1 seite` je Eintrag im Inhaltsverzeichnis (≤ 512 Byte) |
| `15` | ZEIT | `15 unix-ms:u64` – stellt Systemzeit und Uhr (PCF8563) |
| `16` | FAHRT_LAYOUT | Text `e x0 y0 x1 y1 Name` je Streifen (Display-Koordinaten) für Notizen ohne Handy |
| `17` | PUFFER_LISTE | Antwort `{"t":"puffer","dateien":[{"n","b"}]}` |
| `18` | PUFFER_HOLEN | `18 offset:u32 Name` → ein Stück auf DATEI (Anfrage/Antwort, App wiederholt bei Verlust) |
| `19` | PUFFER_LOESCHEN | `19 Name` |
| `14` | MODUS | `14 m [seite]` – 0 Home, 1 Bordbuch, 2 Notiz, 3 Bestellzettel; `seite` = Bordbuch-Seite bzw. Zettel (Fernbedienung aus der App) |
| `1A` | HOME_VERSION | Text „crc;Anzahl Zettel“ nach dem Aufspielen der Home-Bilder |
| `20` | LISTE | `20 pfad[|ab]` (unter `/ist` und `/soll`; mit `|ab` ab dem n-ten Eintrag weiterblättern) → `{"t":"liste","p","d":[{"n","b","ordner"?}],"mehr":bool}` (ab FW 0.10.0) |
| `21` | HOLEN | `21 offset:u32 pfad` → ein Stück auf DATEI wie PUFFER_HOLEN |
| `22` | LOESCHEN | `22 pfad` → `{"t":"geloescht","p","ok"}`; falscher Pfad: `{"t":"abgleich","ok":false,"err":"pfad"}` |
| `23` | SCHREIBEN_START | `23 größe:u32 crc32:u32 pfad` – nur unter `/soll/`, bis 1 MB (FW 0.11.0) |
| `24` | SCHREIBEN_DATEN | `24 offset:u32 daten…` wie BILD_DATEN, write-no-response |
| `25` | SCHREIBEN_ENDE | → CRC prüfen, ablegen, `{"t":"geschrieben","p","ok","b"\|"err":"crc\|unvollstaendig\|ablage\|pfad\|groesse"}` |

Bild: Zeilen à 100 Byte, MSB = linkes Pixel, Bit 1 = schwarz. CRC-32 wie zlib.

## Ereignisse (JSON)
- `{"t":"key","k":"up|down|ki","a":"down|up"}`
- `{"t":"touch","a":"down|up","x":…,"y":…,"rx":…,"ry":…}`: x/y in Display-Koordinaten 800×480 (Querformat, USB oben rechts), rx/ry roh vom GT911
- `{"t":"img","ok":true,"ms":Empfang,"show":Anzeige,"mtu":…,"phy":1|2,"n":Rahmen,"dle":Byte}` bzw. `{"t":"img","ok":false,"err":"crc|format"}`
- `{"t":"itvl","v":Intervall×1,25 ms,"lat":…}` bei jedem Wechsel der Verbindungsparameter
- `{"t":"modus","m":"home|notiz|bordbuch|bestell|kritzel|app|widget","zettel":n,"hoch":0|1}` (hoch = Lage der App-Seite, ab FW 0.22.0), `{"t":"seite","n":…,"von":…}`, `{"t":"bordbuch","seiten","belegtKB"}`,
  `{"t":"img","ok":…,"gespeichert":n}` nach BILD_ENDE Modus 3
- `{"t":"audio","a":"start","rate":16000,"codec":"ima-adpcm","n":480}`, `{"t":"audio","a":"stop","pakete","verworfen","ms","spitze"}`,
  `{"t":"audio","a":"fehler","err":"mtu|mikro"}`

Fahrtenschreiber (ab FW 0.10.0): `/ist/log/JJJJ-MM-TT.txt` auf der Karte, je Zeile `HH:MM:SS Text` in Ortszeit
(ohne gestellte Uhr `/ist/log/ohne-zeit.txt` mit `+Sekunden`). Die App holt per LISTE/HOLEN ab dem bekannten Stand
und löscht vergangene Tage.

Soll/Ist auf der Karte (ab FW 0.11.0): `/soll/home/` (0–8.bin, version.txt), `/soll/bordbuch/` (NN.bin, index.txt),
`/soll/notiz/` (layout.txt, rNN.bin = x,y,w,h je u16 + 1 bpp) schreibt nur die App; `/ist/log/`, `/ist/puffer/`
nur der Sticky. Jeder Soll-Ordner hat eine Bestandsliste `stand.txt` („name crc“ je Zeile), die App schreibt nur,
was sich unterscheidet, und `stand.txt` zuletzt. Auslöser fürs Neuladen: `home/version.txt`, `bordbuch/index.txt`,
`notiz/layout.txt`. Ohne Karte landet das Soll im Flash (alte Pfade), Home 0–2 und version.txt liegen immer auch dort.
Die alten Spezialbefehle (BILD_ENDE 3/5, BB_INDEX, FAHRT_LAYOUT, HOME_VERSION, PUFFER_*) gehen weiter.

## Zustand (JSON)
`{"fw","modus","bb":Bordbuch-Seite,"zettel":Bestellzettel,"usb","seite":"karte|bild","bat":%,"mv","ma","chg","mtu","phy","itvl":×1,25 ms,"tp":"BxH","fahrtv":CRC des Layouts,"offen":Notizen im Puffer,"uhr":bool}` – bei Verbindung,
nach jedem Bild und alle 30 s.

## Funkverhalten (rücksichtsvoll)
- Getrennt: Werbung alle ~600 ms; nach Tastendruck 30 s lang alle 100 ms
- Verbunden, Ruhe: Intervall 100–125 ms, Latenz 0. (Mit Latenz 4 dauerte der Wechsel auf schnell mehrere Sekunden)
- Bildübertragung: BILD_START lässt das Gerät 7,5–15 ms anfordern, es meldet jeden Wechsel als
  `{"t":"itvl","v":…}`. Die App streamt erst, wenn `v ≤ 16` (spätestens nach 2,5 s). 2M PHY, Data Length 251;
  1,5 s nach dem Bild wieder träge

## Audio (KI-Taste halten, nur mit Verbindung)
- 16 kHz mono, IMA-ADPCM (4 bit, wie im WAV-Format: erstes Sample im unteren Nibble), ~65 kbit/s
- Paket auf AUDIO: `seq:u16 prädiktor:i16 index:u8` + 240 Byte = 480 Samples (30 ms), 245 Byte, braucht MTU ≥ 248
- Jedes Paket trägt den Decoder-Zustand vom Paketanfang. Fehlende `seq` werden zu Stille, die folgenden Pakete bleiben heil
- Ablauf: Taste runter → `audio start` → Pakete → Taste hoch → `audio stop`. Höchstens 60 s
- Funk: während der Aufnahme 15–30 ms, 1,5 s nach dem Ende wieder Ruhetakt
- Display: „● Aufnahme“ oben rechts per Teil-Refresh, danach wird die Stelle aus der Seite neu gezeichnet

## Spiegel und Fernbedienung (11.11.2026)
- Sticky → App: keine Bilder, nur `modus` (`{"t":"modus","m","zettel"}`), `seite` (Bordbuch) und `audio` start/stop;
  beim Verbinden einmal der Zustand mit `modus`, `bb`, `zettel`. Die App rendert das Bild aus ihrem eigenen Vorrat
- App → Sticky: `MODUS m [seite]` (siehe oben); Tipps auf die Vorschau rechnet die App selbst um (Notiz-Streifen,
  Inhaltsverzeichnis) – kein eigener Touch-Befehl, kein zusätzlicher Schnellmodus
- Ereignisse tragen `ms` (Sticky-Uhr), Tasten nachgeholt nach einer Display-Blockade zusätzlich `"nachgeholt":true`

## Für Fremd-Apps
Überblick, Dateien auf der Karte und was fest ist: SPEC.md, Abschnitt „Für Fremd-Apps“ (13.11.2026).
