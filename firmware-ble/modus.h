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
static char widgetName[16] = "";       // aktuelles Widget (widget.h)

// Lage je Seite (SPEC „Hoch/Quer in zwei Stufen“, Stufe 1, FW 0.21.0): /soll/einstellungen/lage.txt, je Zeile
// „<seite> hoch|quer“ (Seiten: app, kritzel, Widget-Namen wie menue, timer, waage). Home und Notiz bleiben hochkant,
// Bordbuch und Zettel quer. Die App rendert in der gewählten Lage; die Firmware braucht sie für Statuszeile,
// Ziffern und die Kritzel-Knöpfe.
static char lageSeite[12][16];
static bool lageHochFlag[12], lageAutoFlag[12];
static bool sensorHoch = false;   // Stufe 2 (FW 0.22.0): Lage laut Lagesensor, für Seiten mit „auto“
static int lageAnzahl = 0;
static void lageLaden() {
    lageAnzahl = 0;
    String t;
    if (!sollText("einstellungen/lage.txt", t)) return;
    int start = 0;
    while (start < (int)t.length() && lageAnzahl < 12) {
        int ende = t.indexOf('\n', start);
        if (ende < 0) ende = t.length();
        String z = t.substring(start, ende);
        start = ende + 1;
        char a[16], b[8];
        if (sscanf(z.c_str(), "%15s %7s", a, b) == 2) {
            strlcpy(lageSeite[lageAnzahl], a, 16);
            lageAutoFlag[lageAnzahl] = !strcmp(b, "auto");
            lageHochFlag[lageAnzahl++] = !strcmp(b, "hoch");
        }
    }
}
static bool lageAuto(const char* seite) {
    for (int i = 0; i < lageAnzahl; i++) if (!strcmp(lageSeite[i], seite)) return lageAutoFlag[i];
    return false;
}
static bool lageHoch(const char* seite) {
    for (int i = 0; i < lageAnzahl; i++) if (!strcmp(lageSeite[i], seite)) return lageAutoFlag[i] ? sensorHoch : lageHochFlag[i];
    return false;
}
/**
 * Lage aus der Schwerkraft: hochkant zeigt sie entlang Sensor-y, quer entlang Sensor-x (am Gerät gemessen). Flach liegend (beide klein) oder schräg dazwischen: keine Aussage (-1).
 */
static bool beschleunigung(float& x, float& y, float& z);
/**
 * Winkel in der Displayebene: 0° = quer aufrecht, 90° = hochkant aufrecht; -1, wenn er flach liegt (< 0,5 g in der Ebene).
 * Hysterese (14.11.2026, Markus: „zu träge/zappelig“): nach hochkant erst über 60°, zurück nach quer erst unter 30°
 */
static float lageWinkel() {
    float x, y, z;
    if (!beschleunigung(x, y, z)) return -1;
    float ax = fabsf(x), ay = fabsf(y);
    if (sqrtf(ax * ax + ay * ay) < 0.5f) return -1;
    return atan2f(ay, ax) * 57.2958f;   // gemessen 13.11.2026: hochkant aufrecht y ≈ −0,9 g, also Sensor-y ∥ Display-x
}
static int lageMessen() {
    float w = lageWinkel();
    if (w < 0) return -1;
    if (w > 60) return 1;
    if (w < 30) return 0;
    return sensorHoch ? 1 : 0;   // dazwischen: bleibt, wie es ist
}
/** beim Seitenwechsel: gleich in der richtigen Lage aufbauen (ein Messwert reicht, Grenze 45°) */
static void lageSofort() {
    float x, y, z;
    if (!beschleunigung(x, y, z)) return;
    float w = lageWinkel();
    protokoll("Lage beim Aufbau: x %.2f g, y %.2f g, z %.2f g -> %.0f Grad", x, y, z, w);
    if (w >= 0) sensorHoch = w > 45;
}
static volatile bool neuZeichnen = false;   // Seite neu aufbauen (Hilfe zu, anderes Widget)
static void widgetZeigen();
static bool widgetTaste(int i);
static void widgetLoop();

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
    return modus == M_HOME ? "home" : modus == M_NOTIZ ? "notiz" : modus == M_BESTELL ? "bestell" : modus == M_KRITZEL ? "kritzel" : modus == M_APP ? "app" : modus == M_WIDGET ? "widget" : "bordbuch";
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
    lageLaden();
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
    char j[64];   // hoch: Lage der App-Seite (bei „auto“ vom Sensor), die App zeichnet danach
    snprintf(j, sizeof j, "{\"t\":\"modus\",\"m\":\"%s\",\"zettel\":%d,\"hoch\":%d}", modusName(), bestellAktuell, lageHoch("app") ? 1 : 0);
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
static bool kzHoch();
static uint32_t kzZuletzt = 0;
static portMUX_TYPE kzSperre = portMUX_INITIALIZER_UNLOCKED;
static TaskHandle_t kzAufgabe = nullptr;
// kzAn ist in firmware-ble.ino deklariert (touchPoll braucht es vorher)
static const int KZ_STIFT = 2;   // halbe Strichbreite in Pixeln

static void kzPunkt(int x, int y) {
    for (int dy = -KZ_STIFT; dy <= KZ_STIFT; dy++)
        for (int dx = -KZ_STIFT; dx <= KZ_STIFT; dx++) {
            int px = x + dx, py = y + dy;
            if (px < 0 || px >= W || py < 0 || py >= H || (kzHoch() ? px < 62 : py < 62)) continue;   // Kopfstreifen (Knöpfe, Statuszeile) frei
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
// gleiche Größe wie die Reiter der App-Seite (58 px hoch, für Finger; 13.11.2026), rechts ab x 512 die Statuszeile.
// Koordinaten logisch (wie die Seite liegt); hochkant (FW 0.21.0): logisch (lx, ly) ↔ Display (ly, 479 − lx)
static const int KZ_KN_Y0 = 2, KZ_KN_Y1 = 58, KZ_SP_X0 = 16, KZ_SP_X1 = 176, KZ_LE_X0 = 184, KZ_LE_X1 = 344, KZ_KOPF = 62;
static volatile bool kzSpeichernWunsch = false, kzLeerenWunsch = false;

static bool kzLageHoch = false;   // Lage des Blatts, beim neuen Blatt festgelegt (ein bemaltes Blatt dreht nicht mit)
static bool kzHoch() { return kzLageHoch; }
/** logisch → Display */
static void kzD(int lx, int ly, int& x, int& y) { if (kzHoch()) { x = ly; y = H - 1 - lx; } else { x = lx; y = ly; } }
/** logisches Rechteck in imgBuf (schwarz/weiß) */
static void kzRechteck(int lx, int ly, int w, int h, bool schwarz) {
    if (kzHoch()) bildRechteck(ly, H - lx - w, h, w, schwarz); else bildRechteck(lx, ly, w, h, schwarz);
}
static void kzStrich(int x0, int y0, int x1, int y1) {   // 3 px dicke Linie direkt in imgBuf (für die Knopfsymbole), logisch
    kzD(x0, y0, x0, y0); kzD(x1, y1, x1, y1);
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
        kzRechteck(x0, KZ_KN_Y0, x1 - x0, KZ_KN_Y1 - KZ_KN_Y0, true);
        kzRechteck(x0 + 3, KZ_KN_Y0 + 3, x1 - x0 - 6, KZ_KN_Y1 - KZ_KN_Y0 - 6, false);
    }
    int m = (KZ_SP_X0 + KZ_SP_X1) / 2, c = (KZ_KN_Y0 + KZ_KN_Y1) / 2;   // ✓
    kzStrich(m - 20, c, m - 6, c + 14); kzStrich(m - 6, c + 14, m + 20, c - 14);
    m = (KZ_LE_X0 + KZ_LE_X1) / 2;           // ✕
    kzStrich(m - 15, c - 15, m + 15, c + 15); kzStrich(m + 15, c - 15, m - 15, c + 15);
}

/** Touch im Knopfstreifen (aus der Kritzel-Aufgabe): true = war ein Knopf, nicht malen */
static bool kzKnopf(int x, int y, bool neu) {
    if (kzHoch()) { int lx = H - 1 - y, ly = x; x = lx; y = ly; }   // Display → logisch
    if (y >= KZ_KOPF) return false;
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
    snprintf(pfad, sizeof pfad, "/ist/kritzel/%04d-%02d-%02d-%02d%02d%02d%s.bin", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec,
             kzHoch() ? "-h" : "");   // -h: hochkant gemalt, die App dreht das Bild
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
    kzLageHoch = lageHoch("kritzel");
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
    lageSofort();
    if ((m == M_BORDBUCH && bbSeiten == 0) || (m == M_BESTELL && bestellAnzahl == 0)) {
        tone(PIN_BUZZER, 900, 120);   // tiefer Ton: kein Bordbuch aufgespielt
        return;
    }
    hilfeAn = false;
    if (modus == M_KRITZEL && m != M_KRITZEL) { kritzelStopp(); kritzelSpeichern(); }   // Blatt verlassen = speichern
    if (modus == M_WIDGET && m != M_WIDGET) gfxPartialWachHalten = false;
    if (m != modus) protokoll("Modus %s", m == M_HOME ? "home" : m == M_BORDBUCH ? "bordbuch" : m == M_NOTIZ ? "notiz" : m == M_KRITZEL ? "kritzel" : m == M_APP ? "app" : m == M_WIDGET ? "widget" : "bestell");
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
    } else if (m == M_WIDGET) {
        widgetZeigen();
    } else if (m == M_APP) {
        // App-Seite (SPEC „Widgets ohne ständiges Flashen“): die App zeichnet, sobald sie „modus app“ hört;
        // Tipper gehen an die App, ▲/▼ blättern wie überall
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
static char kWidget[8][16];   // Name zum Eintrag „widget <name>“
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
            else if (z.startsWith("widget ")) { strlcpy(kWidget[kAnzahl], z.substring(7).c_str(), 16); karussell[kAnzahl++] = M_WIDGET; }
        }
    }
    bool homeDrin = false;
    for (int i = 0; i < kAnzahl; i++) homeDrin |= karussell[i] == M_HOME;
    if (kAnzahl == 0) { const Modus std[] = {M_HOME, M_NOTIZ, M_BORDBUCH, M_BESTELL}; for (auto m : std) karussell[kAnzahl++] = m; }
    else if (!homeDrin && kAnzahl < 8) {
        memmove(karussell + 1, karussell, kAnzahl * sizeof(Modus));
        memmove(kWidget + 1, kWidget, kAnzahl * sizeof kWidget[0]);
        karussell[0] = M_HOME; kAnzahl++;
    }
    Serial.printf("Karussell: %d Einträge\n", kAnzahl);
}

static bool karussellDa(Modus m) {
    if (m == M_BORDBUCH) return bbSeiten > 0;
    if (m == M_BESTELL) return bestellAnzahl > 0;
    if (m == M_NOTIZ) return notizDa;
    if (m == M_APP) return appDa();   // ohne zuhörende App gibt es nichts zu zeigen
    return true;
}
static bool karussellDaI(int i) {
    if (karussell[i] != M_WIDGET) return karussellDa(karussell[i]);
    char rel[48];
    snprintf(rel, sizeof rel, "widgets/%s/felder.txt", kWidget[i]);
    return sollDa(rel);
}

/** Zum nächsten (richtung +1) bzw. vorigen (−1) Eintrag; rückwärts landet man auf dessen letzter Seite */
static void karussellSchritt(int richtung) {
    int pos = 0;
    for (int i = 0; i < kAnzahl; i++) if (karussell[i] == modus && (modus != M_WIDGET || !strcmp(kWidget[i], widgetName))) { pos = i; break; }
    for (int i = 1; i <= kAnzahl; i++) {
        int k = ((pos + richtung * i) % kAnzahl + kAnzahl) % kAnzahl;
        Modus m = karussell[k];
        if (!karussellDaI(k) || (m == modus && (m != M_WIDGET || !strcmp(kWidget[k], widgetName)))) continue;
        if (m == M_WIDGET) { strlcpy(widgetName, kWidget[k], sizeof widgetName); if (modus == M_WIDGET) neuZeichnen = true; }
        if (m == M_BORDBUCH) bbWunsch = richtung > 0 ? bbToc : bbSeiten - 1;
        if (m == M_BESTELL) bestellAktuell = richtung > 0 ? 0 : bestellAnzahl - 1;
        modusWunsch = m;
        return;
    }
}

/** Menü: direkt zum Karussell-Eintrag i */
static void karussellGehe(int i) {
    if (i < 0 || i >= kAnzahl || !karussellDaI(i)) { tone(PIN_BUZZER, 900, 120); return; }
    Modus m = karussell[i];
    if (m == M_BORDBUCH) bbWunsch = bbToc;
    if (m == M_BESTELL) bestellAktuell = 0;
    if (m == M_WIDGET) { strlcpy(widgetName, kWidget[i], sizeof widgetName); if (modus == M_WIDGET) neuZeichnen = true; }
    modusWunsch = m;
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
static volatile bool hilfeWunsch = false;

/** Hilfe je Widget: hilfe/w-<name>.bin (z. B. w-timer, w-waage) */
static const char* widgetHilfe() {
    static char p[40];
    snprintf(p, sizeof p, "hilfe/w-%s.bin", widgetName);
    return p;
}

static const char* hilfeName() {
    return modus == M_HOME ? "hilfe/home.bin" : modus == M_NOTIZ ? "hilfe/notiz.bin" : modus == M_BORDBUCH ? "hilfe/bordbuch.bin"
         : modus == M_KRITZEL ? "hilfe/kritzel.bin" : modus == M_WIDGET ? widgetHilfe() : "hilfe/zettel.bin";
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
        else if (sollDa("widgets/menue/felder.txt")) { strlcpy(widgetName, "menue", sizeof widgetName); modusWunsch = M_WIDGET; }   // auf Home: Menü
        return;
    }
    if (strcmp(name, "up") == 0) {
        if (gedrueckt) { upSeit = millis(); upLang = false; return; }
        upSeit = 0;
        if (!upLang && !widgetTaste(0)) blaettern(-1);   // ▲/▼ kurz blättern überall (Widgets nur per Tippen, 13.11.2026)
        return;
    }
    if (strcmp(name, "down") == 0) {
        if (gedrueckt) { downSeit = millis(); downLang = false; return; }
        downSeit = 0;
        if (!downLang && !widgetTaste(1)) blaettern(+1);
    }
}

/** Aus loop(): Halten erkennen, Moduswünsche umsetzen, Uhr, Rückfall nach Home */
/** Stufe 2: Seite mit Lage „auto“ dreht mit, sobald der Sensor 3 × hintereinander dieselbe Lage misst (~0,75 s) */
static void lageLoop() {
    static uint32_t zuletzt = 0;
    static int kandidat = -1, gleich = 0;
    if (hilfeAn || audioLaeuft || millis() - zuletzt < 250) return;   // ein I2C-Lesen (6 Byte, < 1 ms) je 0,25 s, nur auf „auto“-Seiten
    zuletzt = millis();
    const char* s = modus == M_APP ? "app" : modus == M_KRITZEL ? "kritzel" : modus == M_WIDGET ? widgetName : nullptr;
    if (!s || !lageAuto(s)) { gleich = 0; return; }
    int k = lageMessen();
    if (k < 0) { gleich = 0; return; }
    if (k != kandidat) { kandidat = k; gleich = 1; return; }
    if (++gleich < 3 || (k == 1) == sensorHoch) return;
    sensorHoch = k == 1;
    protokoll("Lage %s (Sensor, %.0f Grad)", sensorHoch ? "hoch" : "quer", lageWinkel());
    if (modus == M_KRITZEL && kzBemalt) return;   // bemaltes Blatt bleibt, wie es ist
    neuZeichnen = true;
}

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
    widgetLoop();
    lageLoop();
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
