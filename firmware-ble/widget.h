/**
 * Widget-Maschine (SPEC „Widgets ohne ständiges Flashen“, FW 0.18.0): eigene Seiten ohne Handy, aus Dateien der App.
 *   /soll/widgets/<name>/bild.bin     Hintergrund 800 × 480 quer, 1 bpp (rechts oben bleibt die Statuszeile frei)
 *   /soll/widgets/<name>/ziffern.bin  Ziffern 0–9 und „:“ nebeneinander, je Zelle w × h (Breite Vielfaches von 8)
 *   /soll/widgets/<name>/felder.txt   je Zeile ein Eintrag:
 *       typ countdown|stoppuhr        dauer <s>            zeit <x> <y>        ziffern <w> <h>
 *       knopf <x0> <y0> <x1> <y1> <aktion> [wert]        taste up|down <aktion> [wert]
 *     Aktionen: start_stopp · reset · plus <s> · minus <s> · setze <s> · gehe <i> (Karussell-Eintrag i, fürs Menü)
 *     typ menue: keine Uhr (das Menü öffnet KI kurz auf Home)
 *     typ waage: Lagesensor live (FW 0.20.0) – blase <cx> <cy> <r> · wert1/wert2 <x> <y> (Grad, Zellen „-12.3°“) ·
 *       achsen <a> <b> (Sensorachse für Bild-x/-y, z. B. „-y x“) · Aktionen null, halten
 *     ziffern.bin: Zellen 0–9, „:“, „-“, „.“, „°“ (Timer braucht nur die ersten 11)
 * Karussell-Eintrag „widget <name>“. Ein Uhrwerk für alle Widgets: der Timer läuft weiter, wenn man die Seite verlässt;
 * beim Ablauf weckt er den Sticky (leichtSchlaf), piept und holt die Timer-Seite nach vorn.
 */
struct WKnopf { int x0, y0, x1, y1; char aktion[12]; int wert; };
static char tWidget[16] = "";   // widgetName steht in modus.h
static uint8_t* wzZiffern = nullptr;
static int wzW = 64, wzH = 96, wzX = -1, wzY = 0;
static WKnopf wKnoepfe[12];
static int wKnopfAnzahl = 0;
static char wTaste[2][12] = {"", ""};
static int wTasteWert[2] = {0, 0};
static bool wCountdown = true, wHatUhr = false, wWaage = false;
static int wbX = 0, wbY = 0, wbR = 0, wW1x = -1, wW1y = 0, wW2x = -1, wW2y = 0, wZellen = 11;
static char wAchse[2][4] = {"x", "y"};
static float wNull[2] = {0, 0}, wWinkel[2] = {0, 0};
static bool wHalten = false;
static uint8_t* wHintergrund = nullptr;
static uint32_t wWaageZuletzt = 0;
static int wBlaseX = -999, wBlaseY = -999;
static int32_t wDauerS = 300;
// Uhrwerk
static bool tLaeuft = false, tAblauf = false;
static uint32_t tStartMs = 0;
static int32_t tStandMs = 300000;     // Countdown: Rest, Stoppuhr: vergangen (Stand beim letzten Start/Stopp)
static int tGezeigt = -1;
static volatile int wTippX = -1, wTippY = -1;
static volatile int wTasteWunsch = -1;

static int32_t tJetztMs() {
    if (!tLaeuft) return tStandMs;
    int32_t d = (int32_t)(millis() - tStartMs);
    return wCountdown ? max<int32_t>(0, tStandMs - d) : tStandMs + d;
}

static bool widgetLaden(const char* name) {
    char rel[48];
    String t;
    snprintf(rel, sizeof rel, "widgets/%s/felder.txt", name);
    if (!sollText(rel, t)) return false;
    strlcpy(widgetName, name, sizeof widgetName);
    wKnopfAnzahl = 0; wzX = -1; wTaste[0][0] = wTaste[1][0] = 0; wHatUhr = false; wWaage = false; wbR = 0; wW1x = wW2x = -1;
    int start = 0;
    while (start < (int)t.length()) {
        int ende = t.indexOf('\n', start);
        if (ende < 0) ende = t.length();
        String z = t.substring(start, ende);
        start = ende + 1;
        z.trim();
        char a[12] = "", b[12] = "";
        int v[5] = {0, 0, 0, 0, 0};
        if (sscanf(z.c_str(), "typ %11s", a) == 1) {
            wCountdown = strcmp(a, "stoppuhr") != 0; wWaage = !strcmp(a, "waage"); wHatUhr = strcmp(a, "menue") && !wWaage;
        }
        else if (sscanf(z.c_str(), "blase %d %d %d", &v[0], &v[1], &v[2]) == 3) { wbX = v[0]; wbY = v[1]; wbR = v[2]; }
        else if (sscanf(z.c_str(), "wert1 %d %d", &v[0], &v[1]) == 2) { wW1x = v[0] & ~7; wW1y = v[1]; }
        else if (sscanf(z.c_str(), "wert2 %d %d", &v[0], &v[1]) == 2) { wW2x = v[0] & ~7; wW2y = v[1]; }
        else if (sscanf(z.c_str(), "achsen %3s %3s", a, b) == 2) { strlcpy(wAchse[0], a, 4); strlcpy(wAchse[1], b, 4); }
        else if (sscanf(z.c_str(), "dauer %d", &v[0]) == 1) wDauerS = v[0];
        else if (sscanf(z.c_str(), "zeit %d %d", &v[0], &v[1]) == 2) { wzX = v[0] & ~7; wzY = v[1]; }
        else if (sscanf(z.c_str(), "ziffern %d %d", &v[0], &v[1]) == 2) { wzW = v[0] & ~7; wzH = v[1]; }
        else if (sscanf(z.c_str(), "knopf %d %d %d %d %11s %d", &v[0], &v[1], &v[2], &v[3], a, &v[4]) >= 5 && wKnopfAnzahl < 12) {
            WKnopf& k = wKnoepfe[wKnopfAnzahl++];
            k.x0 = v[0]; k.y0 = v[1]; k.x1 = v[2]; k.y1 = v[3]; strlcpy(k.aktion, a, sizeof k.aktion); k.wert = v[4];
        } else if (sscanf(z.c_str(), "taste %11s %11s %d", b, a, &v[0]) >= 2) {
            int i = !strcmp(b, "up") ? 0 : !strcmp(b, "down") ? 1 : -1;
            if (i >= 0) { strlcpy(wTaste[i], a, sizeof wTaste[i]); wTasteWert[i] = v[0]; }
        }
    }
    if (!wzZiffern) wzZiffern = (uint8_t*)ps_malloc(14 * 128 * 160 / 8);
    snprintf(rel, sizeof rel, "widgets/%s/ziffern.bin", name);
    wZellen = wWaage ? 14 : 11;
    size_t n = (size_t)wZellen * wzW / 8 * wzH;
    if (!wzZiffern || n > (size_t)14 * 128 * 160 / 8 || !sollLesen(rel, wzZiffern, n)) { wzX = -1; wW1x = wW2x = -1; }   // ohne Ziffern keine Zahlen
    // Uhrwerk gehört diesem Widget, solange es nicht läuft
    if (wHatUhr && !tLaeuft && strcmp(tWidget, name)) { strlcpy(tWidget, name, sizeof tWidget); tStandMs = wCountdown ? wDauerS * 1000 : 0; }
    return true;
}

/** Zeit „MM:SS“ (bis 99:59) ins Bild setzen; true, wenn sich die Anzeige geändert hat */
static bool widgetZeitZeichnen(bool immer) {
    if (wzX < 0) return false;
    int s = (tJetztMs() + (wCountdown && tLaeuft ? 999 : 0)) / 1000;   // Countdown rundet auf (zeigt 0:01 bis zum Schluss)
    if (s > 99 * 60 + 59) s = 99 * 60 + 59;
    if (s == tGezeigt && !immer) return false;
    tGezeigt = s;
    const int zeichen[5] = {s / 600, s / 60 % 10, 10, s % 60 / 10, s % 10};
    int bz = wZellen * wzW / 8;
    for (int k = 0; k < 5; k++) {
        int qx = zeichen[k] * wzW / 8, zx = (wzX + k * wzW) / 8;
        for (int r = 0; r < wzH; r++) {
            if (wzY + r >= H || zx + wzW / 8 > W / 8) continue;
            memcpy(imgBuf + (wzY + r) * (W / 8) + zx, wzZiffern + r * bz + qx, wzW / 8);
        }
    }
    return true;
}

// ---- Wasserwaage ------------------------------------------------------------------------------
/** Zelle idx (0–9, 10 „:“, 11 „-“, 12 „.“, 13 „°“, -1 leer) an x, y ins Bild */
static void wZelle(int x, int y, int idx) {
    int bz = wZellen * wzW / 8, zx = x / 8;
    for (int r = 0; r < wzH && y + r < H; r++) {
        uint8_t* ziel = imgBuf + (y + r) * (W / 8) + zx;
        if (idx < 0) memset(ziel, 0, wzW / 8);
        else memcpy(ziel, wzZiffern + r * bz + idx * wzW / 8, wzW / 8);
    }
}

/** Winkel als „-12.3°“ (6 Zellen, Vorzeichen und Zehner leer, wenn nicht nötig) */
static void wWinkelZeichnen(int x, int y, float g) {
    if (x < 0) return;
    int z = (int)lroundf(fabsf(g) * 10);
    if (z > 999) z = 999;
    int zellen[6] = {g <= -0.05f ? 11 : -1, z >= 100 ? z / 100 : -1, z / 10 % 10, 12, z % 10, 13};
    for (int k = 0; k < 6; k++) wZelle(x + k * wzW, y, zellen[k]);
}

static float wAchseWert(const char* a, float x, float y, float z) {
    float v = a[strlen(a) - 1] == 'x' ? x : a[strlen(a) - 1] == 'y' ? y : z;
    return a[0] == '-' ? -v : v;
}

/** Lage messen (Mittel aus 8 Proben) → Winkel in Grad um Bild-x und Bild-y */
static bool waageMessen() {
    float sx = 0, sy = 0, sz = 0;
    int n = 0;
    for (int i = 0; i < 8; i++) {
        float x, y, z;
        if (beschleunigung(x, y, z)) { sx += x; sy += y; sz += z; n++; }
        delay(5);
    }
    if (!n) return false;
    sx /= n; sy /= n; sz /= n;
    float bx = wAchseWert(wAchse[0], sx, sy, sz), by = wAchseWert(wAchse[1], sx, sy, sz);
    float rest = sqrtf(sx * sx + sy * sy + sz * sz);
    wWinkel[0] = atan2f(bx, sqrtf(fmaxf(0, rest * rest - bx * bx))) * 57.2958f - wNull[0];
    wWinkel[1] = atan2f(by, sqrtf(fmaxf(0, rest * rest - by * by))) * 57.2958f - wNull[1];
    return true;
}

static void waageZeichnen() {
    if (wHintergrund && wbR > 0) {        // Kreisbereich aus dem Hintergrund zurückholen
        int y0 = max(0, wbY - wbR), y1 = min(H, wbY + wbR + 1), x0 = max(0, wbX - wbR) / 8, x1 = min(W, wbX + wbR + 8) / 8;
        for (int r = y0; r < y1; r++) memcpy(imgBuf + r * (W / 8) + x0, wHintergrund + r * (W / 8) + x0, x1 - x0);
        // Blase: 1° = r/15 Pixel, am Rand festhalten
        float px = wWinkel[0] * wbR / 15.0f, py = wWinkel[1] * wbR / 15.0f, d = sqrtf(px * px + py * py), max_ = wbR - 26;
        if (d > max_) { px *= max_ / d; py *= max_ / d; }
        int bx = wbX + (int)px, by = wbY + (int)py;
        for (int yy = -24; yy <= 24; yy++) for (int xx = -24; xx <= 24; xx++) {
            int q = xx * xx + yy * yy;
            if (q > 24 * 24) continue;
            bool schwarz = q > 16 * 16 || q < 5 * 5;   // Ring mit Punkt in der Mitte
            int X = bx + xx, Y = by + yy;
            if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
            uint8_t& b = imgBuf[Y * (W / 8) + X / 8];
            if (schwarz) b |= 0x80 >> (X & 7); else b &= ~(0x80 >> (X & 7));
        }
        wBlaseX = bx; wBlaseY = by;
    }
    wWinkelZeichnen(wW1x, wW1y, wWinkel[0]);
    wWinkelZeichnen(wW2x, wW2y, wWinkel[1]);
}

/** Aus widgetLoop: etwa jede Sekunde messen und neu zeichnen (schneller kann das E-Paper nicht) */
static void waageLoop() {
    if (!wWaage || wHalten || millis() - wWaageZuletzt < 900) return;
    wWaageZuletzt = millis();
    aktiv();
    float alt0 = wWinkel[0], alt1 = wWinkel[1];
    if (!waageMessen()) return;
    if (fabsf(wWinkel[0] - alt0) < 0.05f && fabsf(wWinkel[1] - alt1) < 0.05f && wBlaseX != -999) return;
    waageZeichnen();
    display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    display.updatePartial(0, 62, W, H - 62);
}

/** Aus setzeModus: Seite aufbauen */
static void widgetZeigen() {
    char rel[48];
    snprintf(rel, sizeof rel, "widgets/%s/bild.bin", widgetName);
    if (!widgetLaden(widgetName) || !sollLesen(rel, imgBuf, IMG_BYTES)) {
        memset(imgBuf, 0, IMG_BYTES);
        tone(PIN_BUZZER, 900, 120);           // Widget noch nicht aufgespielt
    }
    if (wWaage) {
        if (!wHintergrund) wHintergrund = (uint8_t*)ps_malloc(IMG_BYTES);
        if (wHintergrund) memcpy(wHintergrund, imgBuf, IMG_BYTES);
        wHalten = false; wBlaseX = -999;
        if (waageMessen()) waageZeichnen();
    }
    widgetZeitZeichnen(true);
    gfxPartialWachHalten = true;            // Teil-Refresh ohne die 100-ms-Pausen (Bibliotheks-Patch), wie im Kritzelblock
    statusPruefen(false, true);
    display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    display.update();
    seite = "widget";
}

static void karussellGehe(int i);
static void widgetAktion(const char* a, int wert) {
    if (!strcmp(a, "gehe")) { karussellGehe(wert); return; }
    if (wWaage && !strcmp(a, "null")) {                 // aktuelle Lage als Null (schräge Unterlage)
        float n0 = wNull[0], n1 = wNull[1];
        wNull[0] = wNull[1] = 0;
        if (waageMessen()) { wNull[0] = wWinkel[0]; wNull[1] = wWinkel[1]; protokoll("Waage: Null gesetzt (%.1f°, %.1f°)", wNull[0], wNull[1]); }
        else { wNull[0] = n0; wNull[1] = n1; }
        wHalten = false; wWaageZuletzt = 0; wBlaseX = -999;
        return;
    }
    if (wWaage && !strcmp(a, "halten")) { wHalten = !wHalten; tone(PIN_BUZZER, wHalten ? 1500 : 3300, 60); wWaageZuletzt = 0; return; }
    if (!wHatUhr) return;
    int32_t jetzt = tJetztMs();
    if (!strcmp(a, "start_stopp")) {
        if (tLaeuft) { tStandMs = jetzt; tLaeuft = false; protokoll("Timer %s angehalten bei %ld s", widgetName, (long)(jetzt / 1000)); }
        else {
            if (wCountdown && jetzt <= 0) jetzt = wDauerS * 1000;
            tStandMs = jetzt; tStartMs = millis(); tLaeuft = true; tAblauf = false;
            strlcpy(tWidget, widgetName, sizeof tWidget);
            protokoll("Timer %s gestartet (%ld s)", widgetName, (long)(jetzt / 1000));
        }
    } else if (!strcmp(a, "reset")) {
        tLaeuft = false; tStandMs = wCountdown ? wDauerS * 1000 : 0;
    } else if (!strcmp(a, "setze")) {
        wDauerS = wert; tLaeuft = false; tStandMs = wert * 1000;
    } else if (!strcmp(a, "plus") || !strcmp(a, "minus")) {
        int32_t d = (!strcmp(a, "plus") ? 1 : -1) * wert * 1000;
        if (tLaeuft) { tStandMs = max<int32_t>(0, jetzt + d); tStartMs = millis(); }
        else tStandMs = max<int32_t>(0, tStandMs + d);
        if (wCountdown && !tLaeuft) wDauerS = tStandMs / 1000;
    }
}

/** Aus sendTouch (down): Knopf getroffen? */
static void widgetTipp(int x, int y) {
    // App-Seite: welche Taste getroffen ist, weiß nur die App; der Klick kommt trotzdem sofort vom Sticky
    if (modus == M_APP && !hilfeAn) { tone(PIN_BUZZER, 2700, 25); return; }
    if (modus != M_WIDGET || hilfeAn) return;
    for (int i = 0; i < wKnopfAnzahl; i++) {
        const WKnopf& k = wKnoepfe[i];
        if (x >= k.x0 && x < k.x1 && y >= k.y0 && y < k.y1) {
            tone(PIN_BUZZER, 2700, 25);   // sofort hörbar, die Anzeige folgt nach dem Refresh (~0,7 s)
            wTippX = x; wTippY = y;
            return;
        }
    }
}

/** Aus tasteAktion (▲/▼ kurz): true, wenn das Widget die Taste belegt hat */
static bool widgetTaste(int i) {
    if (modus != M_WIDGET || !wTaste[i][0]) return false;
    wTasteWunsch = i;
    return true;
}

/** Ms bis zum Ablauf eines laufenden Countdowns (für den Leichtschlaf), sonst 0 */
static uint32_t widgetWeckenInMs() {
    if (!tLaeuft || !wCountdown) return 0;
    return (uint32_t)max<int32_t>(1, tJetztMs());
}

/** Aus modusLoop */
static void widgetLoop() {
    if (wTippX >= 0) {
        int x = wTippX, y = wTippY;
        wTippX = wTippY = -1;
        for (int i = 0; i < wKnopfAnzahl; i++) {
            const WKnopf& k = wKnoepfe[i];
            if (x >= k.x0 && x < k.x1 && y >= k.y0 && y < k.y1) { widgetAktion(k.aktion, k.wert); break; }
        }
    }
    if (wTasteWunsch >= 0) { int i = wTasteWunsch; wTasteWunsch = -1; widgetAktion(wTaste[i], wTasteWert[i]); }
    // Ablauf: piepen, Seite nach vorn holen
    if (tLaeuft && wCountdown && tJetztMs() <= 0) {   // Uhrwerk des Timers (nicht des Menüs)
        tLaeuft = false; tStandMs = 0; tAblauf = true;
        protokoll("Timer %s abgelaufen", tWidget);
        aktiv();
        for (int k = 0; k < 3; k++) { tone(PIN_BUZZER, 2700, 150); delay(250); tone(PIN_BUZZER, 3300, 150); delay(350); }
        if (modus != M_WIDGET || strcmp(widgetName, tWidget)) { strlcpy(widgetName, tWidget, sizeof widgetName); modusWunsch = M_WIDGET; }
    }
    if (modus == M_WIDGET && !hilfeAn) waageLoop();
    if (modus != M_WIDGET || hilfeAn || !wHatUhr) return;
    if (tLaeuft) aktiv();                     // auf der Timer-Seite nicht einschlafen, solange er läuft
    if (widgetZeitZeichnen(false)) {
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.updatePartial(wzX, wzY, 5 * wzW, wzH);
    }
}
