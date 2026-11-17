/**
 * Sonnenkompass (SPEC „Bugout-Sticky“, Schritt 3b, FW 0.43.0): Sonnenrichtung und -höhe aus Uhr (RTC), Datum und Ort,
 * dazu Auf- und Untergang. Bedienung: Sticky drehen, bis der Strahl zur Sonne zeigt – dann zeigt N nach Norden.
 * Ort: /soll/notfall/ort.txt „<breite> <länge> <name>“ (schreibt notfallkarten.py mit dem ersten Kartenort); ohne Datei
 * die Mitte Deutschlands (51,0 / 10,0), dann ist die Richtung auf ein paar Grad ungenau.
 * Seite: Widget „sonne“ (typ sonne), legt der Sticky selbst an (felder.txt + leeres bild.bin), gezeichnet wird hier.
 * Rechnung: NOAA-Näherung (Deklination, Zeitgleichung, Stundenwinkel), Auf-/Untergang bei −0,833°.
 * Texte ohne Umlaute und ohne Gradzeichen: die eingebauten Schriften kennen nur ASCII.
 */
static float soBreite = 51.0f, soLaenge = 10.0f;
static char soOrt[24] = "Deutschland (ungefaehr)";
static bool soOrtGeladen = false, soOrtGenau = false;
static int soMinuteGezeigt = -1;

static void soOrtNeu() { soOrtGeladen = false; }
static void soOrtLaden() {
    if (soOrtGeladen) return;
    soOrtGeladen = true;
    String t;
    if (!sollText("notfall/ort.txt", t)) return;
    float a, b;
    char n[24] = "";
    if (sscanf(t.c_str(), "%f %f %23[^\n]", &a, &b, n) >= 2 && fabsf(a) <= 90 && fabsf(b) <= 180) {
        soBreite = a; soLaenge = b; soOrtGenau = true;
        if (n[0]) strlcpy(soOrt, n, sizeof soOrt);
    }
}

/** Sonnenstand zur Unix-Zeit t (UTC): Azimut (0 = Nord, im Uhrzeigersinn) und Höhe in Grad */
static void soStand(time_t t, float& azimut, float& hoehe) {
    const double rad = M_PI / 180;
    double jd = t / 86400.0 + 2440587.5, n = jd - 2451545.0;
    double L = fmod(280.460 + 0.9856474 * n, 360), g = fmod(357.528 + 0.9856003 * n, 360) * rad;
    double lam = (L + 1.915 * sin(g) + 0.020 * sin(2 * g)) * rad, eps = (23.439 - 0.0000004 * n) * rad;
    double ra = atan2(cos(eps) * sin(lam), cos(lam)), dek = asin(sin(eps) * sin(lam));
    double gmst = fmod(280.46061837 + 360.98564736629 * n, 360);
    double H = (gmst + soLaenge) * rad - ra, phi = soBreite * rad;
    hoehe = asin(sin(phi) * sin(dek) + cos(phi) * cos(dek) * cos(H)) / rad;
    double az = atan2(-sin(H), tan(dek) * cos(phi) - sin(phi) * cos(H)) / rad;
    azimut = fmod(az + 360, 360);
}

/** Nächster Zeitpunkt (ab t, innerhalb 24 h), an dem die Sonne die Höhe −0,833° kreuzt; steigend = Aufgang */
static time_t soKreuzung(time_t t, bool steigend) {
    float az, h0, h1;
    soStand(t, az, h0);
    for (int m = 5; m <= 24 * 60; m += 5) {
        soStand(t + m * 60, az, h1);
        if ((steigend && h0 < -0.833f && h1 >= -0.833f) || (!steigend && h0 >= -0.833f && h1 < -0.833f)) return t + m * 60;
        h0 = h1;
    }
    return 0;
}

static const char* soRichtung(float az) {
    static const char* r[] = {"N", "NO", "O", "SO", "S", "SW", "W", "NW"};
    return r[(int)((az + 22.5f) / 45) % 8];
}

// kleine Zeichenhilfen auf imgBuf (1 = schwarz)
static void soPunkt(int x, int y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    imgBuf[y * (W / 8) + x / 8] |= 0x80 >> (x & 7);
}
static void soScheibe(int cx, int cy, int r) {
    for (int y = -r; y <= r; y++)
        for (int x = -r; x <= r; x++)
            if (x * x + y * y <= r * r) soPunkt(cx + x, cy + y);
}
static void soLinie(float x0, float y0, float x1, float y1, int dicke) {
    int n = (int)max(fabsf(x1 - x0), fabsf(y1 - y0)) + 1;
    for (int i = 0; i <= n; i++) soScheibe((int)(x0 + (x1 - x0) * i / n), (int)(y0 + (y1 - y0) * i / n), dicke / 2);
}
static void soRing(int cx, int cy, int r, int dicke) {
    for (int a = 0; a < 720; a++) {
        float w = a * M_PI / 360;
        for (int d = 0; d < dicke; d++) soPunkt(cx + (int)roundf((r - d) * sinf(w)), cy - (int)roundf((r - d) * cosf(w)));
    }
}

static void sonneZeichnen() {
    soOrtLaden();
    memset(imgBuf, 0, IMG_BYTES);
    bildRechteck(0, 0, W, 56, true);
    textInsBild(T("Sonnenkompass", "Sun compass"), 16, 0, 400, 56, true, &FreeSansBold24pt7b);
    time_t jetzt = time(nullptr);
    bool zeitOk = zeitGesetzt && jetzt > 1700000000;
    const int cx = 210, cy = 268, r = 186;
    soRing(cx, cy, r, 6);
    for (int i = 0; i < 8; i++) {                        // Marken je 45 Grad
        float w = i * M_PI / 4;
        soLinie(cx + (r - 6) * sinf(w), cy - (r - 6) * cosf(w), cx + (r - (i % 2 ? 22 : 34)) * sinf(w), cy - (r - (i % 2 ? 22 : 34)) * cosf(w), 4);
    }
    bildRechteck(cx - 30, cy - r + 40, 60, 56, false);
    textInsBild("N", cx - 30, cy - r + 40, cx + 30, cy - r + 96, false, &FreeSansBold24pt7b);
    textInsBild("S", cx - 30, cy + r - 92, cx + 30, cy + r - 40, false, &FreeSans12pt7b);
    textInsBild("W", cx - r + 36, cy - 26, cx - r + 86, cy + 26, false, &FreeSans12pt7b);
    textInsBild(T("O", "E"), cx + r - 86, cy - 26, cx + r - 36, cy + 26, false, &FreeSans12pt7b);
    char z[64];
    if (!zeitOk) {
        textInsBild(T("Uhr nicht gestellt", "Clock not set"), 430, 120, 790, 176, false, &FreeSansBold24pt7b);
        textInsBild(T("Einstellungen: Uhr stellen", "Settings: set clock"), 430, 190, 790, 246, false);
        return;
    }
    float az, h;
    soStand(jetzt, az, h);
    float w = az * M_PI / 180;
    if (h > -0.833f) {                                   // Strahl von der Mitte zur Sonne, Sonne als Scheibe am Rand
        soLinie(cx, cy, cx + (r - 50) * sinf(w), cy - (r - 50) * cosf(w), 8);
        soScheibe(cx + (r - 34) * sinf(w), cy - (r - 34) * cosf(w), 22);
    }
    soScheibe(cx, cy, 8);
    tm lt;
    localtime_r(&jetzt, &lt);
    if (h > -0.833f) {
        snprintf(z, sizeof z, T("Sonne im %s", "Sun in the %s"), soRichtung(az));
        textInsBild(z, 430, 70, 790, 126, false, &FreeSansBold24pt7b);
        snprintf(z, sizeof z, T("%d Grad, %d Grad hoch", "%d deg, %d deg high"), (int)roundf(az), (int)roundf(h));
        textInsBild(z, 430, 126, 790, 168, false);
        textInsBild(T("Drehen, bis der Strahl", "Turn until the ray"), 430, 186, 790, 222, false);
        textInsBild(T("zur Sonne zeigt: N = Norden", "points at the sun: N = north"), 430, 218, 790, 254, false);
        time_t u = soKreuzung(jetzt, false);
        if (u) {
            tm ut; localtime_r(&u, &ut);
            snprintf(z, sizeof z, T("Untergang %02d:%02d", "Sunset %02d:%02d"), ut.tm_hour, ut.tm_min);
            textInsBild(z, 430, 276, 790, 332, false, &FreeSansBold24pt7b);
        }
    } else {
        textInsBild(T("Sonne unter dem Horizont", "Sun below the horizon"), 430, 70, 790, 126, false);
        textInsBild(T("Nachts: Polarstern = Norden", "At night: Pole Star = north"), 430, 126, 790, 168, false);
        time_t a = soKreuzung(jetzt, true);
        if (a) {
            tm at; localtime_r(&a, &at);
            snprintf(z, sizeof z, T("Aufgang %02d:%02d", "Sunrise %02d:%02d"), at.tm_hour, at.tm_min);
            textInsBild(z, 430, 276, 790, 332, false, &FreeSansBold24pt7b);
        }
    }
    snprintf(z, sizeof z, T("%02d:%02d Uhr  -  %s", "%02d:%02d  -  %s"), lt.tm_hour, lt.tm_min, soOrt);
    textInsBild(z, 430, 360, 790, 396, false);
    textInsBild(T("Antippen = zurueck", "Tap = back"), 430, 420, 790, 456, false);
    soMinuteGezeigt = lt.tm_hour * 60 + lt.tm_min;
}

/** Aus karussellLaden: Widget-Dateien anlegen, falls sie fehlen (die Seite zeichnet der Sticky selbst) */
static void sonneAnlegen() {
    if (!imgBuf || (sollDa("widgets/sonne/felder.txt") && sollDa("widgets/sonne/bild.bin"))) return;
    const char* f = "typ sonne\nknopf 0 56 800 480 zurueck\n";
    uint8_t* leer = (uint8_t*)ps_calloc(1, IMG_BYTES);
    if (!leer) return;
    bool ok = sollSchreiben("widgets/sonne/bild.bin", leer, IMG_BYTES) && sollSchreiben("widgets/sonne/felder.txt", (const uint8_t*)f, strlen(f));
    free(leer);
    protokoll("Sonnenkompass-Seite %s", ok ? "angelegt" : "nicht angelegt");
}

/** Aus widgetLoop: alle 5 min neu (die Sonne wandert ~1,25 Grad), im Sparmodus nur beim Öffnen */
static void sonneLoop() {
    if (!(modus == M_WIDGET && wSonne) || hilfeAn || notfallSpar()) return;
    time_t jetzt = time(nullptr);
    tm lt;
    localtime_r(&jetzt, &lt);
    int m = lt.tm_hour * 60 + lt.tm_min;
    if (m - soMinuteGezeigt >= 5 || m < soMinuteGezeigt) neuZeichnen = true;
}
