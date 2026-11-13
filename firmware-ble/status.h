/**
 * Statuszeile (SPEC „Bedienung und Oberfläche“, FW 0.14.0): rechts oben auf jeder Seite, 288 × 32 px, vom Sticky selbst
 * gesetzt. Von rechts: Akku (Balken, Blitz an USB) · Uhr (außer auf Home, dort steht sie groß) · Handy verbunden bzw.
 * Zzz im Schlummern · offene Notizen mit Zahl · Warnung (Tropfen = Beschlag, Thermometer = Laden zu kalt/heiß).
 *
 * Glyphen von der App (wie das Ziffernblatt), /soll/home/:
 *   status-quer.bin  336 × 32, 1 bpp, Zeilen à 42 Byte (Seiten quer: Bordbuch, Zettel)
 *   status-hoch.bin  dieselben Glyphen schon gedreht: 32 × 336, Zeilen à 4 Byte (Seiten hochkant: Home, Notiz)
 *   Zellen: Ziffer i bei x = 16·i (16 breit), „:“ bei 160 (16), Handy 176, Zzz 208, Notiz 240, Tropfen 272,
 *   Thermometer 304 (je 32)
 * Liegt unter dem Feld ein schwarzer Kopfbalken, zeichnet er weiß auf schwarz.
 */
static const int ST_B = 288, ST_H = 32, SH_B = 336;
static const int G_DOPPEL = 160, G_HANDY = 176, G_ZZZ = 208, G_NOTIZ = 240, G_TROPFEN = 272, G_THERMO = 304;
static uint8_t* stQuer = nullptr;
static uint8_t* stHoch = nullptr;
static bool statusDa = false;
static uint32_t statusSig = 0, statusZuletzt = 0;

static void statusLaden() {
    if (!stQuer) stQuer = (uint8_t*)ps_malloc(SH_B / 8 * ST_H);
    if (!stHoch) stHoch = (uint8_t*)ps_malloc(ST_H / 8 * SH_B);
    statusDa = stQuer && stHoch && sollLesen("home/status-quer.bin", stQuer, SH_B / 8 * ST_H)
               && sollLesen("home/status-hoch.bin", stHoch, ST_H / 8 * SH_B);
    statusSig = 0;
}

static bool statusHoch() {
    if (modus == M_HOME || modus == M_NOTIZ) return true;
    if (modus == M_APP) return lageHoch("app");
    if (modus == M_KRITZEL || modus == M_SCHRIFT) return kzHoch();
    if (modus == M_WIDGET) return lageHoch(widgetName);
    return false;
}

/** Rechteck in Seitenkoordinaten (hochkant oder quer) */
static void stRechteck(bool hoch, int x, int y, int w, int h, bool schwarz) {
    if (hoch) hochRechteck(x, y, w, h, schwarz); else bildRechteck(x, y, w, h, schwarz);
}

/** Glyphe (Zelle ab ox, Breite w) an Seiten-x lx setzen; invers = weiß auf schwarz */
static void stGlyphe(bool hoch, int ox, int w, int lx, bool invers) {
    if (hoch) {
        // hochkant (x, y) → Display (y, 479 − x); im gedrehten Glyphensatz Zeile 335 − x
        for (int k = 0; k < w; k++) {
            uint8_t* ziel = imgBuf + (H - 1 - lx - k) * (W / 8);
            const uint8_t* quelle = stHoch + (SH_B - 1 - ox - k) * (ST_H / 8);
            for (int b = 0; b < ST_H / 8; b++) ziel[b] = invers ? ~quelle[b] : quelle[b];
        }
    } else {
        for (int r = 0; r < ST_H; r++) {
            uint8_t* ziel = imgBuf + r * (W / 8) + lx / 8;
            const uint8_t* quelle = stQuer + r * (SH_B / 8) + ox / 8;
            for (int b = 0; b < w / 8; b++) ziel[b] = invers ? ~quelle[b] : quelle[b];
        }
    }
}

static int stZahl(bool hoch, int wert, int x, bool invers, int stellen) {   // rechtsbündig endend bei x, liefert neues x
    for (int i = 0; i < stellen; i++) {
        x -= 16;
        stGlyphe(hoch, (wert % 10) * 16, 16, x, invers);
        wert /= 10;
        if (wert == 0 && stellen > 2) break;
    }
    return x;
}

static bool schlummertGerade();
static int warnungJetzt();          // 0 keine, 1 Beschlag, 2 Laden zu kalt/heiß

/** Statuszeile ins Seitenbild (imgBuf) zeichnen */
static void statusZeichnen() {
    if (!statusDa || !homeDa) return;
    bool hoch = statusHoch();
    int L = hoch ? H : W;           // Breite der Seite in Seitenkoordinaten
    int x0 = L - ST_B;
    // schwarzer Kopfbalken darunter? (Pixel rechts oben im Feld)
    int px = L - 4, py = 2;
    int dx = hoch ? py : px, dy = hoch ? H - 1 - px : py;
    bool invers = imgBuf[dy * (W / 8) + dx / 8] & (0x80 >> (dx & 7));
    stRechteck(hoch, x0, 0, ST_B, ST_H, invers);
    int x = L - 8;
    // Akku
    x -= 64;
    int stufe = batPct < 0 ? 0 : (batPct + 12) / 25;
    stRechteck(hoch, x + 2, 6, 52, 20, !invers);
    stRechteck(hoch, x + 5, 9, 46, 14, invers);
    stRechteck(hoch, x + 54, 11, 6, 10, !invers);
    for (int i = 0; i < stufe && i < 4; i++) stRechteck(hoch, x + 7 + i * 11, 11, 9, 10, !invers);
    if (usbDa()) {
        stRechteck(hoch, x + 20, 4, 14, 24, invers);
        stRechteck(hoch, x + 26, 6, 5, 10, !invers);
        stRechteck(hoch, x + 23, 14, 8, 4, !invers);
        stRechteck(hoch, x + 23, 17, 5, 10, !invers);
    }
    x -= 8;
    // Uhr (nicht auf Home)
    if (modus != M_HOME && zeitGesetzt) {
        time_t s = time(nullptr);
        tm t;
        localtime_r(&s, &t);
        x = stZahl(hoch, t.tm_min, x, invers, 2);
        x -= 16;
        stGlyphe(hoch, G_DOPPEL, 16, x, invers);
        x = stZahl(hoch, t.tm_hour, x, invers, 2);
        x -= 8;
    }
    // Handy oder Zzz
    x -= 32;
    if (schlummertGerade()) stGlyphe(hoch, G_ZZZ, 32, x, invers);
    else if (appDa()) stGlyphe(hoch, G_HANDY, 32, x, invers);
    // offene Notizen
    if (offeneNotizen > 0) {
        x = stZahl(hoch, min(offeneNotizen, 99), x - 4, invers, offeneNotizen > 9 ? 2 : 1);
        x -= 32;
        stGlyphe(hoch, G_NOTIZ, 32, x, invers);
    }
    // Warnung
    int w = warnungJetzt();
    if (w && x - 40 >= x0) { x -= 40; stGlyphe(hoch, w == 1 ? G_TROPFEN : G_THERMO, 32, x, invers); }
}

/** Neu zeichnen, wenn sich etwas geändert hat; teil = gleich per Teil-Refresh zeigen */
static void statusPruefen(bool teil, bool erzwingen) {
    if (!statusDa || !homeDa) return;
    if (!erzwingen && (audioLaeuft || imgActive || (millis() - statusZuletzt < 2000 && statusSig))) return;
    statusZuletzt = millis();
    time_t s = time(nullptr);
    tm t;
    localtime_r(&s, &t);
    readBattery();
    uint32_t sig = (modus != M_HOME ? t.tm_hour * 60 + t.tm_min : 0) ^ (uint32_t)modus << 11 ^ (uint32_t)((batPct + 12) / 25) << 14
                   ^ (uint32_t)usbDa() << 17 ^ (uint32_t)appDa() << 18 ^ (uint32_t)schlummertGerade() << 19
                   ^ (uint32_t)min(offeneNotizen, 99) << 20 ^ (uint32_t)warnungJetzt() << 28 ^ 1u << 31;
    if (sig == statusSig && !erzwingen) return;
    statusSig = sig;
    statusZeichnen();
    if (!teil) return;
    bildZeigen(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    if (statusHoch()) teilZeigen(0, 0, ST_H, ST_B);
    else teilZeigen(W - ST_B, 0, ST_B, ST_H);
}

static bool schlummertGerade() { return !funkAn; }
static int warnungJetzt() { return warnBeschlag ? 1 : warnLaden ? 2 : 0; }
