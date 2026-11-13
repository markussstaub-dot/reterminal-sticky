/**
 * Modi (Markus, 11.11.2026): Home = Visitenkarte hochkant mit Uhrzeit · Notiz = Fahrt-Seite · Bordbuch.
 *
 * Tasten (SPEC „Bedienung und Oberfläche“, FW 0.13.0), überall gleich:
 *   KI kurz = Home · KI halten (≥ 0,5 s) = Diktat
 *   ▲/▼ kurz = eine Seite zurück/vor; am Ende von Bordbuch oder Zetteln weiter zum nächsten Eintrag im Karussell (rundum)
 *   ▼ 1 s = nächster Eintrag · ▲ 1 s = Anfang des Eintrags (Inhaltsverzeichnis, erster Zettel), dort: voriger Eintrag
 *   Tippen = Hauptaktion der Seite (Inhaltsverzeichnis: Kapitel, Notiz: Streifen)
 * Karussell: Reihe aus /soll/einstellungen/karussell.txt (je Zeile home|notiz|bordbuch|zettel), sonst
 *   home, notiz, bordbuch, zettel. Leere Einträge (kein Bordbuch, keine Zettel) werden übersprungen.
 * Rückweg: KI kurz oder 5 min ohne Bedienung → Home.
 *
 * Bestellzettel (11.11.2026): ▼ auf Home → erster Zettel, ▼/▲ blättern (rundum), KI kurz → Home. Quer, große Schrift,
 * zum Vorzeigen an der Theke; ohne Handy lesbar.
 *
 * Bilder von der App (SCHREIBEN /soll/home/… oder BILD_ENDE Modus 5 + Nummer), auf der Karte unter /soll/home/,
 * ohne Karte im Flash unter /home/ (0–2 und version.txt liegen immer auch dort):
 *   0.bin Home-Karte (Uhrfeld leer) · 1.bin Notiz-Seite · 2.bin Ziffernblatt (Ziffern 0–9 und „:“, schon gedreht)
 *   3.bin–8.bin Bestellzettel und Karten (Lidl Plus u. Ä.); ihre Anzahl steht in version.txt hinter „;“
 *   version.txt  Kennung, die die App vergleicht (OP_HOME_VERSION)
 * Uhr: hochkant ab x = 40, y = 352, 5 Felder à 80 × 112 („HH:MM“); auf dem Display x = 352, w = 112, y = 40, h = 400.
 * Jede Minute nur dieses Feld per Teil-Refresh, zur vollen Stunde einmal voll (gegen Geisterbilder).
 */

static const int UHR_X = 352, UHR_Y = 40, UHR_W = 112, UHR_H = 400;   // Display-Koordinaten
static const int ZIFFER_ZEILEN = 80;                                    // Zeilen je Ziffer auf dem Display
static bool homeDa = false, notizDa = false, ziffernDa = false;
static char homeVersion[24] = "";
static uint8_t* ziffernBuf;
static int uhrMinute = -1;
static uint32_t letzteBedienung = 0;
static const uint32_t ZURUECK_MS = 5UL * 60 * 1000;
static volatile int modusWunsch = -1;     // von der App (OP_BB_MODUS) oder Tasten, umgesetzt in loop()
static int bestellAnzahl = 0, bestellAktuell = 0;
static bool hilfeAn = false;          // Tastenhilfe gerade sichtbar (▲+▼)

static void bestellZaehlen() {
    const char* semi = strchr(homeVersion, ';');
    int n = semi ? atoi(semi + 1) : 0;
    bestellAnzahl = 0;
    for (int i = 0; i < n && i < 6; i++) {
        char pfad[20];
        snprintf(pfad, sizeof pfad, "home/%d.bin", 3 + i);
        if (sollDa(pfad)) bestellAnzahl++;
    }
    if (bestellAktuell >= bestellAnzahl) bestellAktuell = 0;
}

static const char* modusName() {
    return modus == M_HOME ? "home" : modus == M_NOTIZ ? "notiz" : modus == M_BESTELL ? "bestell" : modus == M_KRITZEL ? "kritzel" : modus == M_APP ? "app" : "bordbuch";
}

static bool homeLaden(int n, uint8_t* ziel) {
    char pfad[20];
    snprintf(pfad, sizeof pfad, "home/%d.bin", n);
    return sollLesen(pfad, ziel, IMG_BYTES);
}

static bool homeSpeichern(int n, const uint8_t* daten) {
    char pfad[20];
    snprintf(pfad, sizeof pfad, "home/%d.bin", n);
    bool ok = sollSchreiben(pfad, daten, IMG_BYTES);
    if (n == 2) ziffernDa = homeLaden(2, ziffernBuf);
    if (n == 0) homeDa = true;
    if (n == 1) notizDa = true;
    return ok;
}

/** Home-Bilder und Version (neu) einlesen: beim Start und wenn die App etwas unter /soll/home geschrieben hat */
static void homeLesen() {
    homeDa = sollDa("home/0.bin");
    notizDa = sollDa("home/1.bin");
    ziffernDa = homeLaden(2, ziffernBuf);
    homeVersion[0] = 0;
    File f = sollOeffnen("home/version.txt");
    if (f) { size_t n = f.readBytes(homeVersion, sizeof homeVersion - 1); homeVersion[n] = 0; f.close(); }
    bestellZaehlen();
    statusLaden();
}

static void karussellLaden();
static void homeInit() {
    ziffernBuf = (uint8_t*)ps_malloc(IMG_BYTES);
    LittleFS.mkdir("/home");
    LittleFS.mkdir("/einstellungen");
    homeLesen();
    karussellLaden();
    // Ortszeit Deutschland (die Uhr läuft in UTC)
    setenv("TZ", "CET-1CEST,M3.5.0,M10.5.0/3", 1);
    tzset();
    bestellZaehlen();
    Serial.printf("Home: Karte %d, Notiz %d, Ziffern %d, Bestellzettel %d, Version %s\n", homeDa, notizDa, ziffernDa, bestellAnzahl, homeVersion);
}

/** Uhrzeit aus dem Ziffernblatt ins Uhrfeld von imgBuf setzen; true, wenn sich etwas geändert hat */
static bool uhrZeichnen() {
    if (!ziffernDa || !zeitGesetzt) return false;
    time_t s = time(nullptr);
    tm t;
    localtime_r(&s, &t);
    if (t.tm_min == uhrMinute) return false;
    uhrMinute = t.tm_min;
    const int zeichen[5] = {t.tm_hour / 10, t.tm_hour % 10, 10, t.tm_min / 10, t.tm_min % 10};
    for (int k = 0; k < 5; k++) {
        // Ziffer z liegt im Ziffernblatt in Spalte z / 6 (x = 0 bzw. 112), Zeilen (z % 6) * 80
        int z = zeichen[k];
        int quelleX = (z / 6) * UHR_W, quelleY = (z % 6) * ZIFFER_ZEILEN;
        // Feld k (hochkant von links) liegt auf dem Display von unten nach oben
        int zielY = UHR_Y + UHR_H - (k + 1) * ZIFFER_ZEILEN;
        for (int r = 0; r < ZIFFER_ZEILEN; r++)
            memcpy(imgBuf + (zielY + r) * (W / 8) + UHR_X / 8, ziffernBuf + (quelleY + r) * (W / 8) + quelleX / 8, UHR_W / 8);
    }
    return true;
}

// ---- Akkusymbol auf Home (Markus, 12.11.2026) -------------------------------------------------
// Hochkant oben rechts: Batterie mit 4 Balken (je 25 %), Blitz bei USB. Der Sticky zeichnet es selbst in imgBuf
// (damit es auch Voll-Refreshes übersteht) und frischt nur dieses Feld auf, wenn sich Stufe oder USB ändern.
// Feld hochkant x 400–468, y 8–40 → Display x 8, w 32 (Vielfache von 8), y 12, h 68.
static const int AKKU_X = 8, AKKU_Y = 12, AKKU_W = 32, AKKU_H = 68;
static int akkuStufe = -1;
static bool akkuUsb = false;

/** Rechteck in imgBuf (Display-Koordinaten), Bit 1 = schwarz */
static void bildRechteck(int x, int y, int w, int h, bool schwarz) {
    for (int r = y; r < y + h; r++) {
        if (r < 0 || r >= H) continue;
        for (int c = x; c < x + w; c++) {
            if (c < 0 || c >= W) continue;
            uint8_t& b = imgBuf[r * (W / 8) + c / 8];
            uint8_t m = 0x80 >> (c & 7);
            if (schwarz) b |= m; else b &= ~m;
        }
    }
}
/** Rechteck in Hochkant-Koordinaten (wie die App die Karte zeichnet) */
static void hochRechteck(int px, int py, int w, int h, bool schwarz) { bildRechteck(py, H - (px + w), h, w, schwarz); }

static void akkuZeichnen(int stufe, bool usb) {
    hochRechteck(400, 8, 68, 32, false);              // Feld leeren
    hochRechteck(404, 12, 52, 24, true);              // Gehäuse
    hochRechteck(407, 15, 46, 18, false);
    hochRechteck(456, 18, 6, 12, true);               // Pluspol
    for (int i = 0; i < stufe && i < 4; i++) hochRechteck(409 + i * 11, 17, 9, 14, true);
    if (usb) {                                        // Blitz: weißer Rand, schwarzer Zickzack
        hochRechteck(423, 13, 14, 22, false);
        hochRechteck(429, 14, 5, 9, true);
        hochRechteck(426, 21, 8, 3, true);
        hochRechteck(426, 23, 5, 10, true);
    }
}

/** Liest den Akku und zeichnet neu, wenn sich etwas geändert hat; teil = gleich auffrischen */
static void akkuPruefen(bool teil) {
    readBattery();
    if (batPct < 0) return;                           // kein Akku-Chip
    int stufe = (batPct + 12) / 25;                   // 0–4
    bool usb = usbDa();
    if (stufe == akkuStufe && usb == akkuUsb) return;
    akkuStufe = stufe;
    akkuUsb = usb;
    akkuZeichnen(stufe, usb);
    if (teil) {
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.updatePartial(AKKU_X, AKKU_Y, AKKU_W, AKKU_H);
    }
}

static void uhrAuffrischen(bool voll) {
    display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    if (voll) display.update();
    else display.updatePartial(UHR_X, UHR_Y, UHR_W, UHR_H);
}

static void meldeModus() {
    char j[48];
    snprintf(j, sizeof j, "{\"t\":\"modus\",\"m\":\"%s\",\"zettel\":%d}", modusName(), bestellAktuell);
    sendEvt(j);
    wantState = true;
}

// ---- Kritzelblock (SPEC „Eingabe am Sticky nur für Kleinkram“, FW 0.16.0) ------------------------------------
// Mit dem Finger auf das leere Blatt zeichnen; die Striche sammeln sich in imgBuf, alle 150 ms per Teil-Refresh.
// Beim Verlassen der Seite wird ein bemaltes Blatt nach /ist/kritzel/JJJJ-MM-TT-hhmmss.bin gespeichert (1 bpp,
// 800 × 480 wie ein Bild), die App holt es ab. Wiederkommen = neues Blatt.
static int kzLetztX = -1, kzLetztY = -1, kzX0 = W, kzY0 = H, kzX1 = 0, kzY1 = 0;
static bool kzBemalt = false;
extern bool gfxPartialWachHalten;   // Seeed_GFX2 mit Sticky-Patch (bibliothek-patch/)
static void kzPanelSchlaf();
static uint32_t kzZuletzt = 0;
static portMUX_TYPE kzSperre = portMUX_INITIALIZER_UNLOCKED;
static TaskHandle_t kzAufgabe = nullptr;
// kzAn ist in firmware-ble.ino deklariert (touchPoll braucht es vorher)
static const int KZ_STIFT = 2;   // halbe Strichbreite in Pixeln

static void kzPunkt(int x, int y) {
    for (int dy = -KZ_STIFT; dy <= KZ_STIFT; dy++)
        for (int dx = -KZ_STIFT; dx <= KZ_STIFT; dx++) {
            int px = x + dx, py = y + dy;
            if (px < 0 || px >= W || py < 32 || py >= H) continue;   // oben bleibt die Statuszeile frei
            imgBuf[py * (W / 8) + px / 8] |= 0x80 >> (px & 7);
        }
    portENTER_CRITICAL(&kzSperre);
    kzX0 = min(kzX0, x - KZ_STIFT); kzY0 = min(kzY0, y - KZ_STIFT);
    kzX1 = max(kzX1, x + KZ_STIFT + 1); kzY1 = max(kzY1, y + KZ_STIFT + 1);
    portEXIT_CRITICAL(&kzSperre);
}

/** Aus touchPoll: neuer Berührungspunkt; neu = Finger gerade aufgesetzt */
static void kritzelPunkt(int x, int y, bool neu) {
    if (hilfeAn) return;
    aktiv();
    letzteBedienung = millis();
    if (neu || kzLetztX < 0) { kzPunkt(x, y); }
    else {
        // Linie vom letzten Punkt (Bresenham)
        int x0 = kzLetztX, y0 = kzLetztY, dx = abs(x - x0), dy = -abs(y - y0), sx = x0 < x ? 1 : -1, sy = y0 < y ? 1 : -1, e = dx + dy;
        while (true) {
            kzPunkt(x0, y0);
            if (x0 == x && y0 == y) break;
            int e2 = 2 * e;
            if (e2 >= dy) { e += dy; x0 += sx; }
            if (e2 <= dx) { e += dx; y0 += sy; }
        }
    }
    kzLetztX = x; kzLetztY = y;
    kzBemalt = true;
}
static void kritzelLos() { kzLetztX = kzLetztY = -1; }

// Knöpfe links oben in der Statuszeilen-Höhe (dort wird nicht gemalt): ✓ Speichern bei x 8–80, ✕ Leeren bei x 96–168
static const int KZ_KN_Y0 = 2, KZ_KN_Y1 = 30, KZ_SP_X0 = 8, KZ_SP_X1 = 80, KZ_LE_X0 = 96, KZ_LE_X1 = 168;
static volatile bool kzSpeichernWunsch = false, kzLeerenWunsch = false;

static void kzStrich(int x0, int y0, int x1, int y1) {   // 3 px dicke Linie direkt in imgBuf (für die Knopfsymbole)
    int dx = abs(x1 - x0), dy = -abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
    while (true) {
        for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) {
            int px = x0 + a, py = y0 + b;
            if (px >= 0 && px < W && py >= 0 && py < H) imgBuf[py * (W / 8) + px / 8] |= 0x80 >> (px & 7);
        }
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * e;
        if (e2 >= dy) { e += dy; x0 += sx; }
        if (e2 <= dx) { e += dx; y0 += sy; }
    }
}

static void kzKnoepfeZeichnen() {
    for (int k = 0; k < 2; k++) {
        int x0 = k ? KZ_LE_X0 : KZ_SP_X0, x1 = k ? KZ_LE_X1 : KZ_SP_X1;
        bildRechteck(x0, KZ_KN_Y0, x1 - x0, KZ_KN_Y1 - KZ_KN_Y0, true);
        bildRechteck(x0 + 3, KZ_KN_Y0 + 3, x1 - x0 - 6, KZ_KN_Y1 - KZ_KN_Y0 - 6, false);
    }
    int m = (KZ_SP_X0 + KZ_SP_X1) / 2;       // ✓
    kzStrich(m - 12, 16, m - 4, 24); kzStrich(m - 4, 24, m + 12, 8);
    m = (KZ_LE_X0 + KZ_LE_X1) / 2;           // ✕
    kzStrich(m - 9, 7, m + 9, 25); kzStrich(m + 9, 7, m - 9, 25);
}

/** Touch im Knopfstreifen (aus der Kritzel-Aufgabe): true = war ein Knopf, nicht malen */
static bool kzKnopf(int x, int y, bool neu) {
    if (y >= 32) return false;
    if (!neu) return true;                   // nur beim Aufsetzen auslösen
    if (x >= KZ_SP_X0 && x < KZ_SP_X1) kzSpeichernWunsch = true;
    else if (x >= KZ_LE_X0 && x < KZ_LE_X1) kzLeerenWunsch = true;
    return true;
}

// Eigene Aufgabe liest den Touch (eigener I2C-Bus wireTp), auch während loop() im Teil-Refresh wartet (~0,3 s).
// Vorher gingen in dieser Zeit alle Punkte verloren, die Striche wurden zäh und eckig (Markus, 13.11.2026).
static void kzAufgabeFn(void*) {
    bool unten = false;
    while (kzAn) {
        uint8_t st;
        if (tpRead(0x814E, &st, 1) && (st & 0x80)) {
            if ((st & 0x0F) > 0) {
                uint8_t p[7];
                tpRead(0x814F, p, 7);
                int x = p[1] | p[2] << 8, y = p[3] | p[4] << 8;
                if (!kzKnopf(799 - y, 479 - x, !unten)) kritzelPunkt(799 - y, 479 - x, !unten);
                unten = true;
            } else if (unten) { unten = false; kritzelLos(); }
            tpWrite(0x814E, 0);
        }
        vTaskDelay(pdMS_TO_TICKS(8));
    }
    kzAufgabe = nullptr;
    vTaskDelete(nullptr);
}
static void kritzelStart() {
    setCpuFrequencyMhz(240);   // im Kritzelblock zählt jede Millisekunde, sonst sparsam 80 MHz
    gfxPartialWachHalten = true;   // ohne Neuwecken und Tiefschlaf je Refresh (gemessen vorher ~840 ms)
    if (kzAufgabe) return;
    kzAn = true;
    xTaskCreatePinnedToCore(kzAufgabeFn, "kritzel", 4096, nullptr, 4, &kzAufgabe, 0);
}
static void kritzelStopp() {
    kzAn = false;
    for (int i = 0; i < 30 && kzAufgabe; i++) delay(5);
    kzPanelSchlaf();
    setCpuFrequencyMhz(80);
}

/** Aus modusLoop: gesammelte Striche zeigen */
static uint8_t* kzAusschnitt = nullptr;
static uint8_t* kzBlatt = nullptr;   // Sicherung des Blatts, solange die Hilfe offen ist
static bool kzBlattGesichert = false;
extern bool gfxPartialWachHalten;    // Seeed_GFX2 mit Sticky-Patch (firmware-ble/bibliothek-patch): Panel bleibt wach

/** Panel aus dem Wach-Modus holen und schlafen legen (vor Voll-Refreshs und beim Verlassen) */
static void kzPanelSchlaf() {
    if (!gfxPartialWachHalten) return;
    gfxPartialWachHalten = false;
    display.panel().sleep();
}
static void kzBlattNeu();
static void kritzelSpeichern();
static void kritzelLoop() {
    if (modus == M_KRITZEL && (kzSpeichernWunsch || kzLeerenWunsch)) {
        bool speichern = kzSpeichernWunsch;
        kzSpeichernWunsch = kzLeerenWunsch = false;
        if (speichern && !kzBemalt) { tone(PIN_BUZZER, 900, 80); return; }   // leeres Blatt: nichts zu speichern
        if (speichern) kritzelSpeichern();
        tone(PIN_BUZZER, speichern ? 3300 : 1500, 40);
        kzBlattNeu();
        return;
    }
    // sofort auffrischen, sobald neue Striche da sind (vorher 150 ms gesammelt); der Refresh selbst dauert ohnehin
    if (modus != M_KRITZEL || kzX1 <= kzX0 || millis() - kzZuletzt < 15) return;
    kzZuletzt = millis();
    portENTER_CRITICAL(&kzSperre);
    int x0 = max(0, kzX0) & ~7, x1 = min(W, (kzX1 + 7) & ~7), y0 = max(0, kzY0), y1 = min(H, kzY1);
    kzX0 = W; kzY0 = H; kzX1 = 0; kzY1 = 0;
    portEXIT_CRITICAL(&kzSperre);
    if (x1 <= x0 || y1 <= y0) return;
    // nur den bemalten Ausschnitt an die Bibliothek geben (das ganze Bild kostete jedes Mal Rechenzeit)
    if (!kzAusschnitt) kzAusschnitt = (uint8_t*)ps_malloc(IMG_BYTES);
    int bpz = (x1 - x0) / 8, h = y1 - y0;
    uint32_t t0 = millis();
    if (kzAusschnitt) {
        for (int r = 0; r < h; r++) memcpy(kzAusschnitt + r * bpz, imgBuf + (y0 + r) * (W / 8) + x0 / 8, bpz);
        display.drawBitmap(x0, y0, kzAusschnitt, x1 - x0, h, TFT_BLACK, TFT_WHITE);
    } else display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    uint32_t t1 = millis();
    display.updatePartial(x0, y0, x1 - x0, h);
    static uint32_t gemeldet = 0;
    if (millis() - gemeldet > 2000) { gemeldet = millis(); Serial.printf("Kritzel: zeichnen %lu ms, Refresh %lu ms (%dx%d)\n", (unsigned long)(t1 - t0), (unsigned long)(millis() - t1), x1 - x0, h); }
}

/** Bemaltes Blatt auf die Karte (beim Verlassen) */
static void kritzelSpeichern() {
    if (!kzBemalt) return;
    kzBemalt = false;
    time_t s = time(nullptr);
    tm t;
    localtime_r(&s, &t);
    char pfad[48];
    snprintf(pfad, sizeof pfad, "/ist/kritzel/%04d-%02d-%02d-%02d%02d%02d.bin", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec);
    bool ok = false;
    if (sdEin()) {
        SD.mkdir("/ist"); SD.mkdir("/ist/kritzel");
        File f = SD.open(pfad, FILE_WRITE);
        if (f) { ok = f.write(imgBuf, IMG_BYTES) == IMG_BYTES; f.close(); }
    }
    protokoll(ok ? "Kritzel gespeichert: %s" : "Kritzel nicht gespeichert (%s)", pfad + 13);
}

/** Leeres Blatt mit Knöpfen und Statuszeile zeigen (Voll-Refresh, damit nichts nachleuchtet) */
static void kzBlattNeu() {
    memset(imgBuf, 0, IMG_BYTES);
    kzBemalt = false;
    kritzelLos();
    portENTER_CRITICAL(&kzSperre);
    kzX0 = W; kzY0 = H; kzX1 = 0; kzY1 = 0;
    portEXIT_CRITICAL(&kzSperre);
    kzKnoepfeZeichnen();
    statusPruefen(false, true);
    display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    display.update();
}

static void setzeModus(Modus m) {
    if ((m == M_BORDBUCH && bbSeiten == 0) || (m == M_BESTELL && bestellAnzahl == 0)) {
        tone(PIN_BUZZER, 900, 120);   // tiefer Ton: kein Bordbuch aufgespielt
        return;
    }
    hilfeAn = false;
    if (modus == M_KRITZEL && m != M_KRITZEL) { kritzelStopp(); kritzelSpeichern(); }   // Blatt verlassen = speichern
    if (m != modus) protokoll("Modus %s", m == M_HOME ? "home" : m == M_BORDBUCH ? "bordbuch" : m == M_NOTIZ ? "notiz" : m == M_KRITZEL ? "kritzel" : m == M_APP ? "app" : "bestell");
    modus = m;
    bordbuch = m == M_BORDBUCH;
    letzteBedienung = millis();
    tone(PIN_BUZZER, 3300, 25);   // heller Doppelklick: Wechsel angenommen, das Bild kommt gleich
    delay(60);
    tone(PIN_BUZZER, 3300, 25);
    if (m == M_BORDBUCH) {
        // Ins Bordbuch kommt man immer auf das Inhaltsverzeichnis – außer die App springt gezielt auf eine Seite
        if (bbWunsch >= 0) { bbAktuell = bbWunsch; bbWunsch = -1; }
        else bbAktuell = bbToc;
    }
    if (m == M_BESTELL && homeLaden(3 + bestellAktuell, imgBuf)) {
        statusPruefen(false, true);
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.update();
        seite = "bild";
    } else if (m == M_KRITZEL) {
        if (kzBlattGesichert && kzBlatt) {   // zurück aus der Hilfe: Blatt wiederherstellen
            memcpy(imgBuf, kzBlatt, IMG_BYTES);
            kzBlattGesichert = false;
            kritzelLos();
            statusPruefen(false, true);
            display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
            display.update();
        } else kzBlattNeu();
        seite = "kritzel";
        kritzelStart();
    } else if (m == M_APP) {
        // App-Seite (SPEC „Widgets ohne ständiges Flashen“): die App zeichnet, sobald sie „modus app“ hört;
        // Tipper und ▲/▼ kurz gehen nur an die App, ▲/▼ 1 s und KI bleiben der Notausgang
        seite = "app";
    } else if (m == M_BORDBUCH) {
        bbZeige(bbAktuell);
    } else if (m == M_NOTIZ && notizDa && homeLaden(1, imgBuf)) {
        statusPruefen(false, true);
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.update();
        seite = "bild";
    } else if (m == M_HOME && homeDa && homeLaden(0, imgBuf)) {
        uhrMinute = -1;
        uhrZeichnen();
        statusPruefen(false, true);   // Statuszeile ins Bild, kommt mit dem Voll-Refresh
        uhrAuffrischen(true);
        seite = "home";
    } else if (m != M_NOTIZ || !notizDa) {
        zeigeKarte();   // Rückfall: eingebaute Visitenkarte (quer, ohne Uhr), solange die App noch nichts geschickt hat
    }
    meldeModus();
}

// ---- Tasten ----------------------------------------------------------------------------------
static uint32_t kiSeit = 0, upSeit = 0, downSeit = 0;
static bool kiDiktat = false, upLang = false, downLang = false;

// ---- Karussell -------------------------------------------------------------------------------
static Modus karussell[8];
static int kAnzahl = 0;

static void karussellLaden() {
    kAnzahl = 0;
    String t;
    if (sollText("einstellungen/karussell.txt", t)) {
        int start = 0;
        while (start < (int)t.length() && kAnzahl < 8) {
            int ende = t.indexOf('\n', start);
            if (ende < 0) ende = t.length();
            String z = t.substring(start, ende);
            start = ende + 1;
            z.trim();
            z.toLowerCase();
            if (z == "home") karussell[kAnzahl++] = M_HOME;
            else if (z == "notiz") karussell[kAnzahl++] = M_NOTIZ;
            else if (z == "bordbuch") karussell[kAnzahl++] = M_BORDBUCH;
            else if (z == "zettel") karussell[kAnzahl++] = M_BESTELL;
            else if (z == "kritzel") karussell[kAnzahl++] = M_KRITZEL;
            else if (z == "app") karussell[kAnzahl++] = M_APP;
        }
    }
    bool homeDrin = false;
    for (int i = 0; i < kAnzahl; i++) homeDrin |= karussell[i] == M_HOME;
    if (kAnzahl == 0) { const Modus std[] = {M_HOME, M_NOTIZ, M_BORDBUCH, M_BESTELL}; for (auto m : std) karussell[kAnzahl++] = m; }
    else if (!homeDrin && kAnzahl < 8) { memmove(karussell + 1, karussell, kAnzahl * sizeof(Modus)); karussell[0] = M_HOME; kAnzahl++; }
    Serial.printf("Karussell: %d Einträge\n", kAnzahl);
}

static bool karussellDa(Modus m) {
    if (m == M_BORDBUCH) return bbSeiten > 0;
    if (m == M_BESTELL) return bestellAnzahl > 0;
    if (m == M_NOTIZ) return notizDa;
    if (m == M_APP) return appDa();   // ohne zuhörende App gibt es nichts zu zeigen
    return true;
}

/** Zum nächsten (richtung +1) bzw. vorigen (−1) Eintrag; rückwärts landet man auf dessen letzter Seite */
static void karussellSchritt(int richtung) {
    int pos = 0;
    for (int i = 0; i < kAnzahl; i++) if (karussell[i] == modus) { pos = i; break; }
    for (int i = 1; i <= kAnzahl; i++) {
        Modus m = karussell[((pos + richtung * i) % kAnzahl + kAnzahl) % kAnzahl];
        if (!karussellDa(m) || m == modus) continue;
        if (m == M_BORDBUCH) bbWunsch = richtung > 0 ? bbToc : bbSeiten - 1;
        if (m == M_BESTELL) bestellAktuell = richtung > 0 ? 0 : bestellAnzahl - 1;
        modusWunsch = m;
        return;
    }
}

/** ▲/▼ kurz: innerhalb von Bordbuch und Zetteln blättern, an den Enden weiter im Karussell */
static void blaettern(int richtung) {
    if (modus == M_BORDBUCH) {
        int n = bbAktuell + richtung;
        if (n >= 0 && n < bbSeiten) { bbWunsch = n; return; }
    } else if (modus == M_BESTELL) {
        int n = bestellAktuell + richtung;
        if (n >= 0 && n < bestellAnzahl) { bestellAktuell = n; modusWunsch = M_BESTELL; return; }
    }
    karussellSchritt(richtung);
}

// ---- Rückmeldung beim Tippen (SPEC „Bedienung und Oberfläche“): Rahmen ums getroffene Feld, nach 1,5 s weg --------
static int rhX0 = 0, rhY0 = 0, rhX1 = 0, rhY1 = 0, rhModus = -1, rhSeite = -1;
static uint32_t rahmenBis = 0;
static uint8_t* rahmenSicher = nullptr;
static volatile bool rahmenNeu = false;

/** Aus sendTouch (down): welches Feld wurde getroffen? Streifen der Notiz-Seite oder Kapitel im Inhaltsverzeichnis */
static void rahmenAntippen(int x, int y) {
    if (hilfeAn || rahmenBis) return;
    auto treffer = [&](int x0, int y0, int x1, int y1) {
        if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
        rhX0 = max(0, x0 & ~7); rhX1 = min(W, (x1 + 7) & ~7); rhY0 = max(0, y0); rhY1 = min(H, y1);
        return true;
    };
    bool getroffen = false;
    if (modus == M_NOTIZ) for (int i = 0; i < streifenAnzahl && !getroffen; i++) getroffen = treffer(streifen[i].x0, streifen[i].y0, streifen[i].x1, streifen[i].y1);
    else if (bordbuch && bbAktuell == bbToc) for (int i = 0; i < bbAnzahl && !getroffen; i++) getroffen = treffer(bbEintraege[i].x0, bbEintraege[i].y0, bbEintraege[i].x1, bbEintraege[i].y1);
    if (getroffen) rahmenNeu = true;
}

static void rahmenLoop() {
    if (rahmenNeu) {
        rahmenNeu = false;
        int bpz = (rhX1 - rhX0) / 8, h = rhY1 - rhY0;
        if (bpz <= 0 || h <= 0) return;
        if (!rahmenSicher) rahmenSicher = (uint8_t*)ps_malloc(IMG_BYTES);
        if (!rahmenSicher) return;
        for (int r = 0; r < h; r++) memcpy(rahmenSicher + r * bpz, imgBuf + (rhY0 + r) * (W / 8) + rhX0 / 8, bpz);
        const int d = 6;   // dicker schwarzer Rand innen am Feld
        bildRechteck(rhX0, rhY0, rhX1 - rhX0, d, true);
        bildRechteck(rhX0, rhY1 - d, rhX1 - rhX0, d, true);
        bildRechteck(rhX0, rhY0, d, h, true);
        bildRechteck(rhX1 - d, rhY0, d, h, true);
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.updatePartial(rhX0, rhY0, rhX1 - rhX0, h);
        rhModus = modus; rhSeite = bbAktuell;
        rahmenBis = millis() + 1500;
    }
    if (rahmenBis && millis() > rahmenBis) {
        rahmenBis = 0;
        if (modus != rhModus || bbAktuell != rhSeite || hilfeAn) return;   // Seite schon gewechselt: nichts zurückzumalen
        int bpz = (rhX1 - rhX0) / 8, h = rhY1 - rhY0;
        for (int r = 0; r < h; r++) memcpy(imgBuf + (rhY0 + r) * (W / 8) + rhX0 / 8, rahmenSicher + r * bpz, bpz);
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.updatePartial(rhX0, rhY0, rhX1 - rhX0, h);
    }
}

// ---- Tastenhilfe (SPEC „Bedienung und Oberfläche“): ▲ und ▼ zusammen zeigen /soll/hilfe/<modus>.bin -----------
static bool upUnten = false, downUnten = false, kombi = false;
static volatile bool hilfeWunsch = false, neuZeichnen = false;

static const char* hilfeName() {
    return modus == M_HOME ? "hilfe/home.bin" : modus == M_NOTIZ ? "hilfe/notiz.bin" : modus == M_BORDBUCH ? "hilfe/bordbuch.bin"
         : modus == M_KRITZEL ? "hilfe/kritzel.bin" : "hilfe/zettel.bin";
}

static void hilfeZeigen() {
    if (modus == M_KRITZEL) {          // Blatt sichern, die Hilfe überschreibt imgBuf
        if (!kzBlatt) kzBlatt = (uint8_t*)ps_malloc(IMG_BYTES);
        if (kzBlatt) { memcpy(kzBlatt, imgBuf, IMG_BYTES); kzBlattGesichert = true; }
        kzPanelSchlaf();
    }
    if (!sollLesen(hilfeName(), imgBuf, IMG_BYTES)) { tone(PIN_BUZZER, 900, 120); return; }   // noch keine Hilfe aufgespielt
    hilfeAn = true;
    protokoll("Hilfe %s", hilfeName() + 6);
    display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    display.update();
    seite = "hilfe";
}

static void tasteAktion(const char* name, bool gedrueckt) {
    letzteBedienung = millis();
    bool up = strcmp(name, "up") == 0, down = strcmp(name, "down") == 0;
    if (up) upUnten = gedrueckt;
    if (down) downUnten = gedrueckt;
    // Hilfe offen: der nächste Tastendruck schließt sie (losgelassen wird erst danach, damit nichts doppelt passiert)
    if (hilfeAn) {
        if (!gedrueckt && !upUnten && !downUnten) { hilfeAn = false; kombi = false; neuZeichnen = true; }
        kiSeit = upSeit = downSeit = 0;
        return;
    }
    if ((up || down) && gedrueckt && upUnten && downUnten) {   // ▲+▼ zusammen
        kombi = true;
        upSeit = downSeit = 0;
        hilfeWunsch = true;
        return;
    }
    if (kombi) {                                                // eine der beiden noch unten: nichts blättern
        if (!upUnten && !downUnten) kombi = false;
        upSeit = downSeit = 0;
        return;
    }
    if (strcmp(name, "ki") == 0) {
        if (gedrueckt) { kiSeit = millis(); kiDiktat = false; return; }
        kiSeit = 0;
        if (kiDiktat) { aufnahmeStopp(); return; }
        if (modus != M_HOME) modusWunsch = M_HOME;   // kurz: immer nach Home
        return;
    }
    if (strcmp(name, "up") == 0) {
        if (gedrueckt) { upSeit = millis(); upLang = false; return; }
        upSeit = 0;
        if (!upLang && modus != M_APP) blaettern(-1);   // App-Seite: kurz gehört der App (kommt als Ereignis an)
        return;
    }
    if (strcmp(name, "down") == 0) {
        if (gedrueckt) { downSeit = millis(); downLang = false; return; }
        downSeit = 0;
        if (!downLang && modus != M_APP) blaettern(+1);
    }
}

/** Aus loop(): Halten erkennen, Moduswünsche umsetzen, Uhr, Rückfall nach Home */
static void modusLoop() {
    if (kiSeit && !kiDiktat && millis() - kiSeit > 500) {
        kiDiktat = true;                 // KI gehalten → Diktat (mit oder ohne Handy)
        aufnahmeStart();
    }
    if (upSeit && !upLang && millis() - upSeit > 1000) {
        upLang = true;
        tone(PIN_BUZZER, 2000, 60);
        protokoll("Taste up lang");
        // ▲ 1 s: an den Anfang des Eintrags, steht man schon dort: voriger Eintrag
        if (modus == M_BORDBUCH && bbAktuell != bbToc) bbWunsch = bbToc;
        else if (modus == M_BESTELL && bestellAktuell != 0) { bestellAktuell = 0; modusWunsch = M_BESTELL; }
        else karussellSchritt(-1);
    }
    if (downSeit && !downLang && millis() - downSeit > 1000) {
        downLang = true;                 // ▼ 1 s: nächster Eintrag im Karussell
        tone(PIN_BUZZER, 2000, 60);
        protokoll("Taste down lang");
        karussellSchritt(+1);
    }
    if (bestellWunsch >= 0) {
        if (bestellWunsch < bestellAnzahl) bestellAktuell = bestellWunsch;
        bestellWunsch = -1;
    }
    rahmenLoop();
    kritzelLoop();
    if (hilfeWunsch) { hilfeWunsch = false; hilfeZeigen(); }
    if (neuZeichnen) {                    // Hilfe zu: dieselbe Seite wieder zeigen
        neuZeichnen = false;
        if (modus == M_BORDBUCH) bbWunsch = bbAktuell;
        setzeModus(modus);
    }
    if (modusWunsch >= 0) {
        Modus m = (Modus)modusWunsch;
        modusWunsch = -1;
        if (m != modus || m == M_NOTIZ || m == M_BESTELL) setzeModus(m);
    }
    if (modus != M_HOME && !audioLaeuft && millis() - letzteBedienung > ZURUECK_MS) setzeModus(M_HOME);
    if (modus == M_APP && !appDa()) { protokoll("App weg, zurück nach Home"); setzeModus(M_HOME); }
    if (modus == M_HOME && homeDa && !audioLaeuft && !hilfeAn && uhrZeichnen()) uhrAuffrischen(uhrMinute == 0);
    static uint32_t akkuZuletzt = 0;
    (void)akkuZuletzt;
    if (!hilfeAn) statusPruefen(true, false);   // Statuszeile auf jeder Seite (Akku, Uhr, Handy, Notizen, Warnung)
}
