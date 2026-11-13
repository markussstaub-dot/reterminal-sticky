/**
 * Strichschrift (SPEC „Strichschrift statt Tastatur zuerst probieren“, FW 0.27.0): ein Strich je Zeichen, erkannt im
 * Sticky ohne Handy. Läuft als Spielart des Kritzelblocks (gleiche Touch-Aufgabe, Tinte, Knöpfe ✓/✕).
 * Alles Inhaltliche kommt von der App (sticky-app/src/strichschrift.js) als Dateien unter /soll/schrift/:
 *   alphabet.txt  „n 32“, „glyphen A B … _ .“ (Reihenfolge im Glyphenblatt, _ = Leerzeichen), „umlaut A Ä“,
 *                 je Vorlage „links|rechts <zeichen> x,y …“ (vorbereitet: nachgezogen, normiert, ×1000)
 *   zeichen.bin   Glyphenblatt: Zellen SCH_ZW × SCH_ZH nebeneinander, 1 bpp (Braun-Schrift)
 *   bild.bin      Hintergrund 800 × 480 (Schreibfeld links Buchstaben, rechts Ziffern, Textzeile oben)
 * Erkennung wie der „$1-Erkenner“ ohne Drehung: Strich auf n Punkte nachziehen, aufs Begrenzungsquadrat normieren,
 * mittlerer Punktabstand zu jeder Vorlage, kleinster gewinnt, über SCH_GRENZE = abgelehnt (tiefer Ton).
 * Gesten: waagrecht rechts = Leerzeichen, links = löschen, kurzer Tipp = Umlaut nach A/O/U/S, sonst Punkt.
 * ✓ speichert den Text nach /ist/schrift/JJJJ-MM-TT-hhmmss.txt (UTF-8), ✕ leert ihn; Verlassen speichert auch.
 */
static const int SCH_N_MAX = 48, SCH_V_MAX = 48, SCH_G_MAX = 48;
static const int SCH_TEILUNG_X = 560;            // rechts ab x 560 Ziffern (SCH_FELD_Y steht in modus.h)
static const int SCH_TEXT_X = 16, SCH_TEXT_Y = 72, SCH_ZW = 32, SCH_ZH = 48, SCH_SICHTBAR = 24;
static float SCH_GRENZE = 0.20f;   // Abstandsgrenze; „grenze 0.20“ in alphabet.txt stellt sie ohne Flashen (FW 0.27.1)

static int schN = 32, schVAnzahl = 0, schGAnzahl = 0;
static float (*schV)[SCH_N_MAX][2] = nullptr;      // Vorlagen
static char schVZeichen[SCH_V_MAX][8];
static bool schVRechts[SCH_V_MAX];
static char schGlyph[SCH_G_MAX][5];                 // UTF-8 je Glyphe
static char schUmlautVon[8][5], schUmlautNach[8][5];
static int schUmlautAnzahl = 0;
static uint8_t* schBlatt = nullptr;                 // Glyphenblatt
static uint8_t* schGrund = nullptr;                 // Hintergrund (zum Wegwischen der Tinte)
static bool schBereit = false;

static uint8_t schText[128];                        // Glyphen-Indizes
// schLaenge (Länge des Texts) steht in modus.h, weil der Kritzelblock ihn braucht

// Strich, den die Kritzel-Aufgabe sammelt (Display-Koordinaten); fertig wird er beim Abheben
static int16_t schPx[512], schPy[512];
static volatile int schPAnzahl = 0;
static volatile bool schStrichFertig = false;

static int schGlyphIndex(const char* z) {
    for (int i = 0; i < schGAnzahl; i++) if (!strcmp(schGlyph[i], z)) return i;
    return -1;
}

/** Alphabet, Glyphen und Hintergrund von der Karte laden; false = noch nichts aufgespielt */
static bool schriftLaden() {
    String t;
    if (!sollText("schrift/alphabet.txt", t)) return false;
    if (!schV) schV = (float(*)[SCH_N_MAX][2])ps_malloc(sizeof(float) * SCH_V_MAX * SCH_N_MAX * 2);
    if (!schBlatt) schBlatt = (uint8_t*)ps_malloc(SCH_G_MAX * SCH_ZW / 8 * SCH_ZH);
    if (!schGrund) schGrund = (uint8_t*)ps_malloc(IMG_BYTES);
    if (!schV || !schBlatt || !schGrund) return false;
    schVAnzahl = schGAnzahl = schUmlautAnzahl = 0;
    int start = 0;
    while (start < (int)t.length()) {
        int ende = t.indexOf('\n', start);
        if (ende < 0) ende = t.length();
        String z = t.substring(start, ende);
        start = ende + 1;
        char feld[8], zeichen[8];
        if (z.startsWith("n ")) { schN = constrain(z.substring(2).toInt(), 8, SCH_N_MAX); continue; }
        if (z.startsWith("grenze ")) { SCH_GRENZE = constrain(z.substring(7).toFloat(), 0.05f, 0.5f); continue; }
        if (z.startsWith("glyphen ")) {
            int p = 8;
            while (p < (int)z.length() && schGAnzahl < SCH_G_MAX) {
                int q = z.indexOf(' ', p);
                if (q < 0) q = z.length();
                String g = z.substring(p, q);
                strlcpy(schGlyph[schGAnzahl++], g == "_" ? " " : g.c_str(), 5);
                p = q + 1;
            }
            continue;
        }
        if (z.startsWith("umlaut ") && schUmlautAnzahl < 8) {
            if (sscanf(z.c_str(), "umlaut %7s %7s", feld, zeichen) == 2) {
                strlcpy(schUmlautVon[schUmlautAnzahl], feld, 5); strlcpy(schUmlautNach[schUmlautAnzahl++], zeichen, 5);
            }
            continue;
        }
        if (schVAnzahl >= SCH_V_MAX || sscanf(z.c_str(), "%7s %7s", feld, zeichen) != 2) continue;
        if (strcmp(feld, "links") && strcmp(feld, "rechts")) continue;
        const char* p = z.c_str() + strlen(feld) + 1 + strlen(zeichen) + 1;
        int k = 0, x, y, gelesen;
        while (k < schN && sscanf(p, "%d,%d%n", &x, &y, &gelesen) == 2) { schV[schVAnzahl][k][0] = x / 1000.0f; schV[schVAnzahl][k][1] = y / 1000.0f; k++; p += gelesen; }
        if (k != schN) continue;
        strlcpy(schVZeichen[schVAnzahl], zeichen, 8);
        schVRechts[schVAnzahl++] = !strcmp(feld, "rechts");
    }
    size_t n = (size_t)schGAnzahl * SCH_ZW / 8 * SCH_ZH;
    if (!schGAnzahl || !sollLesen("schrift/zeichen.bin", schBlatt, n)) return false;
    if (!sollLesen("schrift/bild.bin", schGrund, IMG_BYTES)) memset(schGrund, 0, IMG_BYTES);
    protokoll("Schrift: %d Vorlagen, %d Glyphen", schVAnzahl, schGAnzahl);
    return schVAnzahl > 0;
}

/** Strich nachziehen und normieren (wie strichschrift.js) */
static void schVorbereiten(const int16_t* xs, const int16_t* ys, int n, float aus[][2]) {
    float laenge = 0;
    for (int i = 1; i < n; i++) laenge += hypotf(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    float px = xs[0], py = ys[0];
    int k = 0;
    aus[k][0] = px; aus[k][1] = py; k++;
    if (laenge > 0) {
        float schritt = laenge / (schN - 1), rest = 0;
        for (int i = 1; i < n && k < schN; i++) {
            float qx = xs[i], qy = ys[i], d = hypotf(qx - px, qy - py);
            while (rest + d >= schritt && k < schN && d > 0) {
                float t = (schritt - rest) / d;
                px = px + t * (qx - px); py = py + t * (qy - py);
                aus[k][0] = px; aus[k][1] = py; k++;
                d = hypotf(qx - px, qy - py);
                rest = 0;
            }
            rest += d;
            px = qx; py = qy;
        }
    }
    while (k < schN) { aus[k][0] = xs[n - 1]; aus[k][1] = ys[n - 1]; k++; }
    float x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (int i = 0; i < schN; i++) { x0 = fminf(x0, aus[i][0]); y0 = fminf(y0, aus[i][1]); x1 = fmaxf(x1, aus[i][0]); y1 = fmaxf(y1, aus[i][1]); }
    float s = fmaxf(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if (s <= 0) s = 1;
    for (int i = 0; i < schN; i++) { aus[i][0] = (aus[i][0] - mx) / s; aus[i][1] = (aus[i][1] - my) / s; }
}

/** Zeichen in den Text übernehmen (Glyphe, „leer“, „weg“, „tipp“); false = nichts erkannt */
static bool schreibeZeichen(const char* z) {
    if (!strcmp(z, "weg")) { if (schLaenge) schLaenge--; return true; }
    if (!strcmp(z, "tipp")) {
        if (schLaenge) for (int i = 0; i < schUmlautAnzahl; i++) if (!strcmp(schGlyph[schText[schLaenge - 1]], schUmlautVon[i])) {
            int u = schGlyphIndex(schUmlautNach[i]);
            if (u >= 0) { schText[schLaenge - 1] = u; return true; }
        }
        z = ".";
    }
    int g = schGlyphIndex(!strcmp(z, "leer") ? " " : z);
    if (g < 0 || schLaenge >= (int)sizeof schText) return false;
    schText[schLaenge++] = g;
    return true;
}

/** Textzeile (die letzten SCH_SICHTBAR Zeichen) in imgBuf, mit Strich als Schreibmarke */
static void schTextZeichnen() {
    bildRechteck(SCH_TEXT_X, SCH_TEXT_Y - 4, SCH_SICHTBAR * SCH_ZW + 8, SCH_ZH + 8, false);
    if (!schBereit) return;
    int ab = max(0, schLaenge - SCH_SICHTBAR), bz = schGAnzahl * SCH_ZW / 8;
    for (int k = ab; k < schLaenge; k++) {
        int zx = (SCH_TEXT_X + (k - ab) * SCH_ZW) / 8, qx = schText[k] * SCH_ZW / 8;
        for (int r = 0; r < SCH_ZH; r++) memcpy(imgBuf + (SCH_TEXT_Y + r) * (W / 8) + zx, schBlatt + r * bz + qx, SCH_ZW / 8);
    }
    bildRechteck(SCH_TEXT_X + (schLaenge - ab) * SCH_ZW + 2, SCH_TEXT_Y + 2, 3, SCH_ZH - 4, true);   // Schreibmarke
}

/** Aus kritzelPunkt (Kritzel-Aufgabe): Punkt des laufenden Strichs merken */
static void schriftPunkt(int x, int y, bool neu) {
    if (neu) schPAnzahl = 0;
    if (schPAnzahl < 512) { schPx[schPAnzahl] = x; schPy[schPAnzahl] = y; schPAnzahl = schPAnzahl + 1; }
}
/** Aus kritzelLos (Finger abgehoben) */
static void schriftAbgehoben() { if (schPAnzahl > 0) schStrichFertig = true; }

/** Aus kritzelLoop: fertigen Strich erkennen, Text nachziehen, Tinte wegwischen; true = Bild neu gezeigt */
static bool schriftLoop() {
    if (!schStrichFertig) return false;
    static int16_t xs[512], ys[512];
    int n;
    portENTER_CRITICAL(&kzSperre);
    n = schPAnzahl;
    memcpy(xs, schPx, n * sizeof(int16_t)); memcpy(ys, schPy, n * sizeof(int16_t));
    schPAnzahl = 0; schStrichFertig = false;
    portEXIT_CRITICAL(&kzSperre);
    if (n < 1) return false;
    int16_t bx0 = 9999, by0 = 9999, bx1 = -1, by1 = -1;
    for (int i = 0; i < n; i++) { bx0 = min(bx0, xs[i]); by0 = min(by0, ys[i]); bx1 = max(bx1, xs[i]); by1 = max(by1, ys[i]); }
    const char* erkannt = nullptr;
    float bestD = 1e9;
    if (max(bx1 - bx0, by1 - by0) < 12) erkannt = "tipp";
    else {
        static float s[SCH_N_MAX][2];
        schVorbereiten(xs, ys, n, s);
        bool rechts = xs[0] >= SCH_TEILUNG_X;
        for (int v = 0; v < schVAnzahl; v++) {
            if (schVRechts[v] != rechts) continue;
            float d = 0;
            for (int i = 0; i < schN; i++) d += hypotf(s[i][0] - schV[v][i][0], s[i][1] - schV[v][i][1]);
            d /= schN;
            if (d < bestD) { bestD = d; erkannt = schVZeichen[v]; }
        }
        if (bestD > SCH_GRENZE) erkannt = nullptr;
    }
    bool ok = erkannt && schreibeZeichen(erkannt);
    if (ok) tone(PIN_BUZZER, 2700, 20); else tone(PIN_BUZZER, 700, 120);
    // Tinte im Schreibfeld wegwischen (Hintergrund zurück), Textzeile neu
    memcpy(imgBuf + SCH_FELD_Y * (W / 8), schGrund + SCH_FELD_Y * (W / 8), (H - SCH_FELD_Y) * (W / 8));
    schTextZeichnen();
    portENTER_CRITICAL(&kzSperre);
    kzX0 = 0; kzY0 = SCH_TEXT_Y - 4; kzX1 = W; kzY1 = H;   // kritzelLoop frischt den ganzen Bereich auf
    portEXIT_CRITICAL(&kzSperre);
    return true;
}

/** Text auf die Karte (✓ oder beim Verlassen) */
static void schriftSpeichern() {
    if (!schLaenge) return;
    time_t sek = time(nullptr);
    tm t;
    localtime_r(&sek, &t);
    char pfad[48];
    snprintf(pfad, sizeof pfad, "/ist/schrift/%04d-%02d-%02d-%02d%02d%02d.txt", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec);
    String text;
    for (int k = 0; k < schLaenge; k++) text += schGlyph[schText[k]];
    bool ok = false;
    if (sdEin()) {
        SD.mkdir("/ist"); SD.mkdir("/ist/schrift");
        File f = SD.open(pfad, FILE_WRITE);
        if (f) { ok = f.print(text) == text.length(); f.close(); }
    }
    protokoll(ok ? "Schrift gespeichert: %s" : "Schrift nicht gespeichert (%s)", pfad + 13);
    if (ok) schLaenge = 0;
}

/** Aus kzBlattNeu: Hintergrund statt leerem Blatt, Textzeile */
static void schriftBlatt() {
    if (!schBereit) schBereit = schriftLaden();
    if (schBereit) memcpy(imgBuf, schGrund, IMG_BYTES);
    schTextZeichnen();
}
