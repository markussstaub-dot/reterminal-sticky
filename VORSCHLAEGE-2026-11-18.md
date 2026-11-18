# Verbesserungsvorschläge App + EDC-Firmware (18.11.2026)

Außenblick auf `sticky-app` (APK 2026.11.17-1335) und `firmware-ble` (0.43.0). Nur gelesen, nichts geändert.
Sortiert nach Nutzen. Aufwand grob: **XS** < 1 h · **S** ein halber Abend · **M** ein Abend · **L** mehrere.

Geräte hier nur mit BLE-Namen: **Sticky-559D** (Hauptgerät, noch FW 0.39.2) und **Sticky-5695** (Zweitgerät, FW 0.43.0).

---

## Kurz: Was hinter den drei Fehlerbildern von heute steckt

| Fehlerbild | Ursache (aus dem Code) | Vorschlag |
|---|---|---|
| 2 – Sticky schläft direkt nach dem Verbinden | **Ursache (nachgetragen, aus einer Nachbar-Session bestätigt):** Sticky-5695 steht im **Notfall-Sparmodus** (`/ist/notfall.txt` = `spar 1`). `schlafPruefen()` ruft dann auch **am USB** sofort `funkAus()`: `EVT schlaf`, selbst trennen (0x216 = 0x200 + 0x16 „lokal getrennt“), BLE aus. Das ist kein Fehler, sondern der Sparmodus. Er geht nur über den Knopf „spar“ auf dem Notfallblatt aus (`notfall.h` Z. 121) und schaltet sich bei leerem Akku von selbst ein (Z. 185). Für Markus war das nicht zu erkennen, weil nirgends „Sparmodus“ stand. Unabhängig davon: `onConnect` ruft `aktiv()` nicht auf, ein lange unbedienter Sticky im Akkubetrieb kann so ebenfalls gleich nach dem `STATE` einschlafen. | **0**, 1, 6 (2 nur vorsorglich) |
| 1 – App versucht ständig den zweiten Sticky | Jeder bekannte Sticky läuft als Hintergrund-Sitzung mit. Nach jedem Fehlschlag neuer Versuch nach 15 s, nach jedem Abriss nach 3 s, ohne Obergrenze. Das Ereignis `schlaf` wertet nur der aktive Sticky aus (`hgEreignis` kennt es nicht), also wird ein schlafender Hintergrund-Sticky weiter bestürmt. Parallel hält `StickyDienst` je Adresse eine eigene `connectGatt(autoConnect=true)`: zwei Verbindungswege zum selben Gerät → „already in accept list“ / „Failed to remove background connection“. | 3, 4, 7 |
| 3 – COM10 setzt beim Öffnen zurück | Der CH343 hängt mit DTR/RTS an EN/IO0 (Auto-Reset). Der Windows-Treiber zieht die Leitungen beim Öffnen kurz, bevor ein Programm sie abschalten kann. Ist Hardware, nicht Firmware. | 9 |

---

## Die Vorschläge

### 0. Notfall-Sparmodus sichtbar machen und ohne Notfallblatt beenden — **S** (nachgetragen)
- **Problem:** Fehlerbild 2. Im Sparmodus meldet der Sticky nur `schlaf` und ist weg, auch am USB. Weder App noch
  Startprotokoll sagen „Sparmodus“. Beenden geht nur am Gerät über den Knopf „spar“ auf dem Notfallblatt; nach leerem
  Akku ist er von selbst an und bleibt an.
- **Vorschlag:**
  - Firmware: vor `funkAus()` im Sparmodus `EVT {"t":"schlaf","spar":1}` schicken, im `STATE` ein Feld `spar`, im
    Startprotokoll und seriell eine Zeile „Notfall-Sparmodus an, Funk aus (Grund: Knopf/Akku leer)“.
  - App: bei `spar` statt „Sticky schlummert“ deutlich „Notfall-Sparmodus an – Funk aus. Beenden: am Notfallblatt
    ‚spar‘ tippen“; in der Kopfzeile ein eigenes Zeichen (z. B. ⚠) statt ◐; die Hintergrund-Sitzung nicht weiter versuchen.
  - Beenden ohne Notfallblatt: eine USB-Zeile `SPAR 0` (wie die vorhandene `DATEI`-Zeile in `notfall.h`). Achtung
    Fehlerbild 3: Das Öffnen von COM startet den Sticky neu; der Sparmodus überlebt das (Datei), die Zeile muss also nach
    dem Neustart kommen, das Werkzeug wartet auf die Startmeldung. Denkbar zusätzlich: am USB ein kurzes Funkfenster
    (z. B. 60 s nach dem Start) mit BLE-Befehl „Sparmodus aus“ – dann ginge es auch von der App aus. Das ist eine
    Abwägung (Sparmodus soll gerade nicht funken) und Markus' Entscheidung.

### 1. Firmware: Verbinden zählt als Aktivität — **XS**
- **Problem:** Fehlerbild 2. Ein per Stundenfenster oder Bewegung erreichbarer Sticky kann nach dem Verbinden sofort
  einschlafen, bevor die App die Uhr gestellt oder abgeglichen hat. Gilt für jeden Sticky im Akkubetrieb.
- **Vorschlag:** In `ServerCb::onConnect` `aktiv()` aufrufen (gibt der App 60 s). Optional: solange `connected` und die
  App in den letzten 60 s etwas geschickt hat, nicht schlafen.
- Prüfen: Sticky am Akku > 1 min liegen lassen, dann verbinden → bleibt verbunden, Uhr wird gestellt.

### 2. Firmware: „Strom da“ robuster erkennen — **S** (vorsorglich)
- **Problem:** Ursprünglich als Ursache von Fehlerbild 2 vermutet; das war der Sparmodus (Punkt 0), nicht die
  USB-Erkennung. Bleibt als Vorsorge: `usbDa()` hängt allein an einer ADC-Schwelle (Kabel, Netzteil, Bauteilstreuung).
- **Vorschlag:** `strom = usbDa() || laedt` (Ladezustandspin) für alle „am USB nie schlafen“-Stellen
  (`schlaf.h`, Werbe-Intervall, `notfall.h`, `recorder.h`). Den gemessenen USB-Wert als `usbmv` in `STATE` und beim
  Akku-Wechsel ins Protokoll schreiben, damit man Streuung sieht. Schwelle danach ggf. auf ~1000 mV senken.
- Prüfen: Zweitgerät mit dem heutigen Kabel/Netzteil anstecken, `usbmv` in der App ablesen.

### 3. App: Hintergrund-Sticky in Ruhe lassen, wenn er schläft oder fehlt — **S**
- **Problem:** Fehlerbild 1. Alle paar Sekunden ein 8-s-Verbindungsversuch kostet Funkzeit beim aktiven Sticky und Akku
  am Fold, und füllt die Ereignisliste.
- **Vorschlag:** In `hgEreignis` `schlaf` auswerten (wie beim aktiven: `s.schlaeft = true`, nicht neu planen; der Wecker
  im Dienst meldet, wenn er wieder funkt). Fehlversuche mit wachsender Pause: 15 s → 30 s → 1 min → 5 min, Deckel 5 min,
  Rücksetzen bei Erfolg oder Wecker-Meldung. Hintergrund-Versuche nicht als Einträge loggen, nur Zustandswechsel.

### 4. App: Immer sichtbar, welcher Sticky aktiv ist — **S**
- **Problem:** Fehlerbild 1, „unklar, welcher aktiv ist“. Kopfzeile zeigt nur den Namen des verbundenen; ob und wie ein
  zweiter mitläuft, steht nur tief im Mehr-Tab.
- **Vorschlag:** Kopfzeile als kleine Geräteleiste: `● 559D` (aktiv, verbunden) `◐ 5695` (läuft mit, schläft) `○`
  (wartet). Tippen öffnet die Geräteliste. Je Gerät ein Schalter **„läuft mit“** (Standard aus für neu hinzugefügte),
  damit ein Test- oder Notfallgerät nicht automatisch dauernd gesucht wird.
- Begriffe vereinheitlichen: „aktiv“ / „läuft mit“ / „schläft“ / „nicht erreichbar“ statt „im Hintergrund verbunden“,
  „wartet auf den Sticky“, „zuletzt …“.

### 5. Mehr-Tab neu gliedern — **M** (Skizze unten)
- **Problem:** Elf Abschnitte auf einer langen Seite, Reihenfolge historisch gewachsen: Sprache, Stickys,
  Spracherkennung, Wörterbuch, Benachrichtigungen, Orte, Push-to-Talk + Hauslurch, Karussell, Lage, Fahrtenschreiber,
  Ereignisse. Dazu mischt sich, **wofür** eine Einstellung gilt: „Lage der Seiten“ ist Profil, „180° gedreht“ und
  „Lineal“ im selben Abschnitt sind Gerät, „Sprache“ ist App + Sticky. Lange Hilfetexte (Benachrichtigungen, Orte,
  Hauslurch) stehen dauerhaft offen.
- **Vorschlag:** Mehr wird ein kurzes Menü mit fünf Unterseiten (siehe Skizze). Jede Einstellung trägt ein kleines
  Schild **Gerät** / **Profil** / **App**. Hilfetexte hinter ⓘ einklappen.

### 6. Firmware: Ohne gestellte Uhr trotzdem erreichbar — **S**
- **Problem:** Das Stundenfenster hängt an `t.tm_year > 120`. Hat der Sticky keine Uhrzeit (nach leerem Akku, neues
  Gerät), öffnet er den Funk nie von selbst, nur per Taste. Kommt Vorschlag 1 nicht, kann er sich so dauerhaft
  aussperren: Verbinden → sofort Schlaf → Uhr nie gestellt → kein Fenster.
- **Vorschlag:** Ohne Uhr alle 60 Schlafminuten (`schlafZaehler`) ein Fenster öffnen, oder bis zur ersten gestellten
  Uhr gar nicht schlafen (Statuszeile „Uhr fehlt“).

### 7. App/nativ: Nur ein Verbindungsweg je Sticky — **M**
- **Problem:** Fold-Log „already in accept list“, „Failed to remove background connection“. `StickyDienst` hält per
  `connectGatt(autoConnect=true)` je bekannter Adresse einen Wecker, während das Plugin `BleClient.connect` aufs
  selbe Gerät macht. Android verwaltet die beiden schlecht, ein hängender Hintergrund-Eintrag kann spätere
  Verbindungen bremsen.
- **Vorschlag:** Wecker nur für Stickys stellen, die gerade **nicht** verbunden sind: beim JS-Verbinden die Adresse
  an den Dienst melden (`Hintergrund.weckerAus(adresse)`), bei Trennung wieder an. Oder umgekehrt: JS verbindet einen
  Hintergrund-Sticky nur noch nach der Wecker-Meldung „funkt“, nicht mehr auf Zeit.

### 8. App: Rückmeldungen dort, wo man hinschaut — **S**
- **Problem:** Die Ereignisliste (133 Stellen schreiben hinein, auch Fehler) steht ganz unten im Mehr-Tab. Am
  Sticky-Tab sieht man nicht, dass ein Abgleich scheitert oder ein Sticky schlafen ging.
- **Vorschlag:** Unter der Statuszeile am Sticky-Tab die letzte Meldung als eine Zeile (Fehler rot), Tippen öffnet
  die volle Liste (in „Diagnose“). Technikwerte (MTU, 2M, Intervall-ms) aus der Statuszeile in Diagnose verschieben;
  am Sticky-Tab nur Akku, Laden, FW.

### 9. Seriell mitlesen ohne Neustart — **S** (Doku) / **M** (Firmware)
- **Problem:** Fehlerbild 3. Jedes Werkzeug, das COM öffnet, startet den Sticky neu und zerstört genau den Zustand,
  den man beobachten wollte.
- **Vorschlag:**
  - Doku-Zeile in `docs/` und in den Tools: „COM öffnen = Neustart“. In Python lohnt ein Versuch: `serial.Serial()`
    ohne Port anlegen, `dtr = rts = False` setzen, dann `port` zuweisen und `open()`. Hilft bei manchen
    Treibern, beim CH343 unter Windows oft nicht. Dann ist es Hardware (Auto-Reset-Schaltung) und bleibt so.
  - Nicht mehr auf Seriell angewiesen sein: Ein „Live-Protokoll“ über BLE (die `protokoll()`-Zeilen zusätzlich als
    `EVT {"t":"log"}`, nur wenn die App es anfordert) und in der App unter Diagnose anzeigen.
  - **Letzte Worte:** die letzten ~20 Protokollzeilen und den Schlafgrund in `RTC_NOINIT_ATTR`-Speicher halten und beim
    Start ausgeben/ins Tagesprotokoll schreiben. Ein Reset durch das Öffnen verliert dann nichts mehr.

### 10. Kleinigkeiten
- **Firmware-Stände angleichen sichtbar machen:** In der Geräteliste je Sticky die FW zeigen und markieren, wenn sie
  älter ist als die, die die App kennt (559D steht auf 0.39.2, 5695 auf 0.43.0). **XS**
- **„Sticky suchen“** neben „Verbinden“ klingt nach Verbindungssuche, lässt aber den Sticky piepen → „Sticky piepen
  lassen“ und zu den Geräten. **XS**
- **Werkstatt** (frei zeichnen und senden) vom Sticky-Tab nach Diagnose; sie ist Entwicklerwerkzeug. **XS**
- **Trenngrund lesbar:** 0x216 in der App als „Sticky hat sich schlafen gelegt“, 0x213 „vom Handy getrennt“,
  0x208 „Funk abgerissen“. **XS**
- **Profil-Wechsel lädt die App neu** (`location.reload`) und stoppt dabei die Hintergrund-Sitzungen. Vor dem Neuladen
  kurz ansagen („App lädt neu …“), sonst wirkt es wie ein Absturz. **XS**
- Platzhalter im Hauslurch-Adressfeld zeigt eine konkrete Heimnetz-Adresse; im öffentlichen Repo besser `192.168.x.y`. **XS**

---

## Skizze: Mehr-Tab neu

Leitidee: oben das, was man am Gerät öfter anfasst, unten Technik. Jede Zeile öffnet eine Unterseite mit
Zurück-Pfeil. Schild hinter jeder Einstellung: **[G]** gilt für dieses Gerät, **[P]** für das Profil, **[A]** für die App.

```
Mehr
─────────────────────────────────────────────
 Stickys                    559D ● · 5695 ◐   ›
   Liste: Name, Profil, Link, FW, Akku, „läuft mit“
   Sticky hinzufügen · Piepen lassen · Vergessen/Leeren
   Dieser Sticky [G]: 180° gedreht · Lineal-Kalibrierung

 Am Sticky                  Profil EDC        ›
   Karussell und Gruppen [P]
   Lage der Seiten [P]
   Knöpfe der alten Notiz-Seite [P] (eingeklappt)
   Sprache [A + Sticky]

 Diktat und Erkennung                         ›
   Modell [A] · Wortliste [P] · Wörterbuch [P]
   Diktat auch in die Zwischenablage [A]

 Verknüpfungen                                ›
   Benachrichtigungen [A]  (Liste, Zugriff, Test)
   Orte [A]                (Liste, Hier merken, Test-Rückfrage)
   Hauslurch [A]           (an/aus, Adresse, Schlüssel, QR, Stimme, Vergleich, Test)

 Diagnose                                     ›
   Ereignisse (volle Liste)
   Fahrtenschreiber abholen
   Verbindung: MTU, PHY, Intervall, Trenngründe
   Werkstatt: frei zeichnen und senden
   Version · Messung
─────────────────────────────────────────────
```

Tableiste dazu (optional, eigener Schritt): Die Gruppen am Sticky heißen Zeit · Messen · Notieren · Rechnen ·
**Nachschlagen** (Handbuch, Spickzettel, Zettel). Die App könnte das spiegeln: **Sticky · Notizen · Nachschlagen · Mehr**
— „Dokumente“ und „Zettel“ als Reiter in einem Tab „Nachschlagen“. Ein Tab weniger, gleiche Begriffe auf beiden Seiten.

---

## Reihenfolge, wenn alles käme

0 → 1 → 6 (+ 2 vorsorglich) (Firmware, ein Flash; 0 erklärt Fehlerbild 2, 1 und 6 verhindern ähnliche Fälle im Akkubetrieb) · 3 → 4 (App, behebt den Eindruck von Fehlerbild 1) ·
5 + 8 (Mehr-Tab, Diagnose) · 7, 9, 10 nach Lust.
