# Sticky-BLE v1 (seit 11.11.2026, Stand FW 0.44)

Ein GATT-Dienst, fünf Kennlinien. Gerät = dünnes Terminal (Peripheral), App = Zwilling (Central).
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
| `03` | BILD_ENDE | `03 modus [seite]` – 0 = Vollbild-Refresh, 1 = schnell, **3 = nicht zeigen, als Bordbuch-Seite `seite` speichern**, **4 = Teilbild als Offline-Rückmeldung `seite` (0–4 Knöpfe, 5 Diktat, 6 Aufnahme) speichern**, **5 = Home-Bild `seite` speichern (0 Karte, 1 Notiz-Seite, 2 Ziffernblatt, 3–8 Zettel, höchstens 6)** |
| `10` | PING | Gerät antwortet `{"t":"pong"}` und schickt den Zustand |
| `11` | KARTE | Gerät zeigt Home (früher die eingebaute Visitenkarte; Name aus der Durchstich-Zeit) |
| `13` | BB_INDEX | Text: `seiten=N`, `toc=K`, `e x0 y0 x1 y1 seite` je Eintrag im Inhaltsverzeichnis (≤ 512 Byte) |
| `15` | ZEIT | `15 unix-ms:u64` – stellt Systemzeit und Uhr (PCF8563) |
| `16` | FAHRT_LAYOUT | Text `e x0 y0 x1 y1 Name` je Streifen (Display-Koordinaten) für Notizen ohne Handy |
| `17` | PUFFER_LISTE | Antwort `{"t":"puffer","dateien":[{"n","b"}]}` |
| `18` | PUFFER_HOLEN | `18 offset:u32 Name` → ein Stück auf DATEI (Anfrage/Antwort, App wiederholt bei Verlust) |
| `19` | PUFFER_LOESCHEN | `19 Name` |
| `14` | MODUS | `14 m [seite]` – 0 Home, 1 Handbuch (bis FW 0.37.0 Bordbuch), 2 Notiz, 3 Bestellzettel, 8 Spickzettel (ab FW 0.38.0); `seite` = Bildschirm im offenen Handbuch, Karte bzw. Zettel (Fernbedienung aus der App) |
| `30` | SUCHEN | `30 sekunden` – Sticky piept, bis eine Taste kommt → `{"t":"suche","a":"start|gefunden"}`; KI 3× am Sticky → `{"t":"suchen"}` (FW 0.25.0) |
| `31` | TIPPEN | `31 text…` (UTF-8, ≤ 255 Byte) – erkanntes Diktat an die Schreibmarke der Tippen-Seite (FW 0.37.0) |
| `1A` | HOME_VERSION | Text „crc;Anzahl Zettel“ nach dem Aufspielen der Home-Bilder |
| `1B` | WACH | ohne Nutzlast – zählt nur als Aktivität (hält den Sticky wach), keine Antwort |
| `20` | LISTE | `20 pfad[|ab]` (unter `/ist` und `/soll`; mit `|ab` ab dem n-ten Eintrag weiterblättern) → `{"t":"liste","p","d":[{"n","b","ordner"?}],"mehr":bool}` (ab FW 0.10.0) |
| `21` | HOLEN | `21 offset:u32 pfad` → ein Stück auf DATEI wie PUFFER_HOLEN |
| `22` | LOESCHEN | `22 pfad` → `{"t":"geloescht","p","ok"}`; falscher Pfad: `{"t":"abgleich","ok":false,"err":"pfad"}` |
| `23` | SCHREIBEN_START | `23 größe:u32 crc32:u32 pfad` – nur unter `/soll/`, bis 1 MB (FW 0.11.0) |
| `24` | SCHREIBEN_DATEN | `24 offset:u32 daten…` wie BILD_DATEN, write-no-response |
| `25` | SCHREIBEN_ENDE | → CRC prüfen, ablegen, `{"t":"geschrieben","p","ok","b"\|"err":"crc\|unvollstaendig\|ablage\|pfad\|groesse"}` |
| `26` | LEEREN | `26 "LEEREN"` (Kennwort im Rahmen, sonst wirkungslos) – löscht `/soll` und `/ist` auf der Karte, formatiert den internen Speicher, meldet `{"t":"geleert","ok","dateien"}` und startet neu (zum Weitergeben, FW 0.31.6) |

Bild: Zeilen à 100 Byte, MSB = linkes Pixel, Bit 1 = schwarz. CRC-32 wie zlib.

## Ereignisse (JSON)
- `{"t":"key","k":"up|down|ki","a":"down|up"}`
- `{"t":"touch","a":"down|up","x":…,"y":…,"rx":…,"ry":…}`: x/y in Display-Koordinaten 800×480 (Querformat, USB oben rechts), rx/ry roh vom GT911
- `{"t":"img","ok":true,"ms":Empfang,"show":Anzeige,"mtu":…,"phy":1|2,"n":Rahmen,"dle":Byte}` bzw. `{"t":"img","ok":false,"err":"crc|format"}`
- `{"t":"itvl","v":Intervall×1,25 ms,"lat":…}` bei jedem Wechsel der Verbindungsparameter
- `{"t":"modus","m":"home|notiz|handbuch|spick|bestell|kritzel|schrift|app|widget","zettel":n,"hoch":0|1,"w":"menue|timer|…","lh":0|1}` (hoch = Lage der App-Seite, ab FW 0.22.0; w = offenes Widget, sonst leer, und lh = Lage der gezeigten Seite, beide ab FW 0.31.2; bis FW 0.37.0 „bordbuch“ statt handbuch/spick)
- Dokumente (FW ≥ 0.38.0): `{"t":"seite","d":Dokument,"n":Bildschirm,"von":…,"bib":0|1}` (Handbuch; in der Bibliothek n = −1),
  `{"t":"spick","n":Karte,"von":…}`. Bis FW 0.37.0: `{"t":"seite","n","von"}` und `{"t":"bordbuch","seiten","belegtKB"}`
- `{"t":"audio","a":"start","rate":16000,"codec":"ima-adpcm","n":480}`, `{"t":"audio","a":"stop","pakete","verworfen","ms","spitze"}`,
  `{"t":"audio","a":"fehler","err":"mtu|mikro"}`
- Recorder (FW ≥ 0.34.0): `{"t":"rec","a":"start","rate","codec","n","ms","datei","live":0|1}` (bei live kommen die Pakete
  auf AUDIO wie beim Diktat; seq läuft nach 65536 über), `{"t":"rec","a":"merker","ms"}` (ms ab Beginn),
  `{"t":"rec","a":"stop","datei","ms","pakete","verlust","live","merker":[ms…]}`; Fernbedienung vom Sticky:
  `{"t":"rec","a":"abspielen|pause","datei"}`, `{"t":"rec","a":"springe","r":-1|1}`. Die Datei liegt danach als
  `/ist/puffer/rJJMMTT-hhmmss.adp` (Pakete à 245 Byte) samt Notiz-Zeile `art: recorder`; Löschen = „hat Text“
- Tippen (FW ≥ 0.37.0): `{"t":"audio","a":"start",…,"ziel":"tippen"}` = Diktat auf der Tippen-Seite, die App schickt den
  Text mit TIPPEN zurück statt eine Notiz anzulegen; `{"t":"puffer","a":"neu"}` = neue Notiz-Zeile im Puffer (OK auf der
  Tippen-Seite, Zeile `{"t","typ":"notiz","quelle":"sticky","art":"getippt","text","offline":true}`), die App holt gleich ab

Fahrtenschreiber (ab FW 0.10.0): `/ist/log/JJJJ-MM-TT.txt` auf der Karte, je Zeile `HH:MM:SS Text` in Ortszeit
(ohne gestellte Uhr `/ist/log/ohne-zeit.txt` mit `+Sekunden`). Die App holt per LISTE/HOLEN ab dem bekannten Stand
und löscht vergangene Tage.

Soll/Ist auf der Karte (ab FW 0.11.0): `/soll/home/` (0–8.bin, version.txt), `/soll/bordbuch/` (NN.bin, index.txt; ab FW 0.38.0
`/soll/doku/<name>/` und `/soll/spick/`, siehe unten),
`/soll/notiz/` (layout.txt, rNN.bin = x,y,w,h je u16 + 1 bpp) schreibt nur die App; `/ist/log/`, `/ist/puffer/`
nur der Sticky. Jeder Soll-Ordner hat eine Bestandsliste `stand.txt` („name crc“ je Zeile), die App schreibt nur,
was sich unterscheidet, und `stand.txt` zuletzt. Auslöser fürs Neuladen: `home/version.txt`, `bordbuch/index.txt`,
`notiz/layout.txt`. Ohne Karte landet das Soll im Flash (alte Pfade), Home 0–2 und version.txt liegen immer auch dort.
Die alten Spezialbefehle (BILD_ENDE 5, FAHRT_LAYOUT, HOME_VERSION, PUFFER_*) gehen weiter; BILD_ENDE 3 und BB_INDEX
(Bordbuch ohne Karte, App vor FW 0.11.0) gibt es seit FW 0.38.0 nicht mehr.

Dokumente (ab FW 0.38.0, `firmware-ble/doku.h`, nur auf der Karte):
- `/soll/doku/<name>/` je Handbuch: `NN.bin` (Bildschirme, 00 = Inhaltsverzeichnis) und `index.txt` mit `seiten=N`,
  `toc=K`, `pdf=a,b,…` (PDF-Seite je Bildschirm), `f s x0 y0 x1 y1 z` (Feld auf Bildschirm s → Bildschirm z),
  `g s x0 y0 x1 y1 i` (Feld → Karussell-Eintrag i, s = −1: überall), `lz x0 y0 x1 y1` (Lesezeichen-Feld, der Sticky schreibt
  „S. n“ hinein). `/soll/doku/bibliothek.bin` + `bibliothek.txt` (`d x0 y0 x1 y1 <name>` je Kachel, `g …`)
- `/soll/spick/`: `NN.bin` je Karte, `index.txt` wie oben (`toc=-1`, `f`-Felder der Titel-Liste)
- `/soll/doku/sprung.txt` „<name> <bildschirm>“: der Sticky öffnet das Handbuch dort und löscht die Datei (Suche in der App)
- `<ordner>/umbenennen.txt` „alt neu“ je Zeile, in jedem Soll-Ordner: der Sticky benennt um (erst alle nach `*.umz`,
  dann ans Ziel) und löscht die Datei; die App schreibt danach `stand.txt` neu. So wandern verschobene Seiten, statt neu
  übertragen zu werden
- `/ist/doku.txt` (schreibt nur der Sticky): `<name> <bildschirm> <lesezeichen>` je Handbuch, `zuletzt <name>`, `spick <karte>`
- Zustand zusätzlich `"sdmb"` (Kartengröße in MB), `"dok"` (Handbücher auf der Karte), `"spick"` (Karten)
- Umzug beim ersten Start: `/soll/bordbuch` wird `/soll/doku/microlino`

Zettel abhaken (ab FW 0.44.0, `firmware-ble/zettel.h`):
- `/soll/home/zettel.txt` (schreibt die App mit den Home-Bildern, vor `version.txt`): `z <platz> <punkte> <titel>` je
  Listen-Zettel (platz 0–5 = `home/3.bin` …), `h <platz> <i> <ab> x0 y0 x1 y1 bx0 by0 bx1 by1 sx0 sy0 sx1 sy1` je Punkt:
  Tippfläche, Innenfläche des Kästchens, Band durch den Text (Display-Koordinaten), `ab` = so gezeichnet. Abgehakt =
  beide Rechtecke umgekehrt (XOR); der Sticky kehrt beim Tippen genau diese um
- `/ist/zettel/<platz>.txt` (schreibt nur der Sticky): Titel, dann je Punkt `0`/`1` in einer Zeile. Die App übernimmt
  die Häkchen über den Titel, spielt neu auf und löscht die Datei (quittieren). Passt Titel oder Anzahl nicht, gilt sie nicht
- Ereignis `{"t":"zettel","platz","i","ab"}` nach jedem Tippen; die App gleicht wenige Sekunden später ab

Datum auf Home (ab FW 0.45.0, `firmware-ble/modus.h`): der Sticky setzt Datum und veraltetes Wetter selbst
- `/soll/home/datum.bin` (mit den Home-Bildern, vor `version.txt`): Kopf 16 Byte (`DAT1`, Jahr u16 LE, Monat, Tag des
  ersten Streifens, Anzahl u16 LE, Byte je Streifen u16 LE = 2400, 4 frei), dann je Tag ein Streifen: die Datumszeile
  hochkant 480 × 40, gedreht wie die Karte (40 × 480, 1 bpp, Bit 1 = schwarz). Die App liefert vom Monatsersten bis
  Ende des übernächsten Monats. Der Sticky odert den Streifen für heute ins Feld Display x 240–280 (hochkant y 240–280)
- Liegt `datum.bin` vor, lässt die App das Datum in `0.bin` weg. Ohne gestellte Uhr oder außerhalb der Streifen bleibt
  das Feld leer
- `/soll/home/wetter.txt`: `tag JJJJMMTT` = Tag der Vorhersage auf der Karte (`tag 0`: kein Wetter). Ist der Tag vorbei
  (ab 1 Uhr des Folgetags), macht der Sticky die Wetterzeile weiß (hochkant y 278–352)
- Home wird um Mitternacht, um 1 Uhr mit altem Wetter und nach dem Stellen der Uhr von selbst neu aufgebaut

## Zustand (JSON)
`{"fw","modus","bb":Bordbuch-Seite,"zettel":Bestellzettel,"usb","seite":"karte|bild","bat":%,"mv","ma","chg","mtu","phy","itvl":×1,25 ms,"tp":"BxH","fahrtv":CRC des Layouts,"offen":Notizen im Puffer,"uhr":bool, …, "us":0|1, "en":0|1, "w", "lh"}` (w und lh wie beim Ereignis modus, ab FW 0.31.2; `us` = US-Einheiten, `en` = wirksame Sprache Englisch, ab FW 0.32.0) – bei Verbindung,
nach jedem Bild und alle 30 s.

## Funkverhalten (rücksichtsvoll)
- Getrennt: Werbung alle ~600 ms; nach Tastendruck 30 s lang alle 100 ms
- Verbunden, Ruhe: Intervall 100–125 ms, Latenz 0. (Mit Latenz 4 dauerte der Wechsel auf schnell mehrere Sekunden)
- Bildübertragung: BILD_START lässt das Gerät 7,5–15 ms anfordern, es meldet jeden Wechsel als
  `{"t":"itvl","v":…}`. Die App streamt erst, wenn `v ≤ 16` (spätestens nach 2,5 s). 2M PHY, Data Length 251;
  1,5 s nach dem Bild wieder träge

## Audio (KI-Taste halten)
- 16 kHz mono, IMA-ADPCM (4 bit, wie im WAV-Format: erstes Sample im unteren Nibble), ~65 kbit/s
- Paket auf AUDIO: `seq:u16 prädiktor:i16 index:u8` + 240 Byte = 480 Samples (30 ms), 245 Byte, braucht MTU ≥ 248
- Jedes Paket trägt den Decoder-Zustand vom Paketanfang. Fehlende `seq` werden zu Stille, die folgenden Pakete bleiben heil
- Ablauf: Taste runter → `audio start` → Pakete → Taste hoch → `audio stop`. Höchstens 60 s
- Ohne Verbindung (oder wenn die App nicht zuhört) landet das Diktat als Datei in `/ist/puffer/`, die App holt es später ab
- Funk: während der Aufnahme 15–30 ms, 1,5 s nach dem Ende wieder Ruhetakt
- Display: „● Aufnahme“ oben rechts per Teil-Refresh, danach wird die Stelle aus der Seite neu gezeichnet

## Spiegel und Fernbedienung (11.11.2026)
- **Bildschirmfoto** (ab FW 0.31.3): HOLEN auf `/ist/bildschirm.rle` (keine Datei auf der Karte) liefert das gerade gezeigte Bild (800 × 480, 1 bpp, Display-Lage) PackBits-gepackt: Kopf k < 128 = k + 1 Bytes wörtlich, k > 128 = nächstes Byte 257 − k mal. Aufgenommen wird bei Offset 0, Länge vorher unbekannt: bis zum leeren Stück holen. Hochkant zurückdrehen mit `lh`
- Sticky → App sonst: keine Bilder, nur `modus` (`{"t":"modus","m","zettel"}`), `seite` (Bordbuch) und `audio` start/stop;
  beim Verbinden einmal der Zustand mit `modus`, `bb`, `zettel`. Die App rendert das Bild aus ihrem eigenen Vorrat
- App → Sticky: `MODUS m [seite]` (siehe oben); Tipps auf die Vorschau rechnet die App selbst um (Notiz-Streifen,
  Inhaltsverzeichnis) – kein eigener Touch-Befehl, kein zusätzlicher Schnellmodus
- Ereignisse tragen `ms` (Sticky-Uhr), Tasten nachgeholt nach einer Display-Blockade zusätzlich `"nachgeholt":true`

## Für Fremd-Apps
Überblick, Dateien auf der Karte und was fest ist: SPEC.md, Abschnitt „Für Fremd-Apps“ (13.11.2026).
