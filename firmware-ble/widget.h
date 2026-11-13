/**
 * Widget-Maschine (SPEC „Widgets ohne ständiges Flashen“, FW 0.18.0): eigene Seiten ohne Handy, aus Dateien der App.
 *   /soll/widgets/<name>/bild.bin     Hintergrund 800 × 480 quer, 1 bpp (rechts oben bleibt die Statuszeile frei)
 *   /soll/widgets/<name>/ziffern.bin  Ziffern 0–9 und „:“ nebeneinander, je Zelle w × h (Breite Vielfaches von 8)
 *   /soll/widgets/<name>/felder.txt   je Zeile ein Eintrag:
 *       typ countdown|stoppuhr        dauer <s>            zeit <x> <y>        ziffern <w> <h>
 *       knopf <x0> <y0> <x1> <y1> <aktion> [wert]        taste up|down <aktion> [wert]
 *     Aktionen: start_stopp · reset · plus <s> · minus <s> · setze <s> · gehe <i> (Karussell-Eintrag i, fürs Menü)
 *     typ menue: keine Uhr (das Menü öffnet KI kurz auf Home)
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
static bool wCountdown = true, wHatUhr = false;
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
    wKnopfAnzahl = 0; wzX = -1; wTaste[0][0] = wTaste[1][0] = 0; wHatUhr = false;
    int start = 0;
    while (start < (int)t.length()) {
        int ende = t.indexOf('\n', start);
        if (ende < 0) ende = t.length();
        String z = t.substring(start, ende);
        start = ende + 1;
        z.trim();
        char a[12] = "", b[12] = "";
        int v[5] = {0, 0, 0, 0, 0};
        if (sscanf(z.c_str(), "typ %11s", a) == 1) { wCountdown = strcmp(a, "stoppuhr") != 0; wHatUhr = strcmp(a, "menue") != 0; }
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
    if (!wzZiffern) wzZiffern = (uint8_t*)ps_malloc(11 * 128 * 160 / 8);
    snprintf(rel, sizeof rel, "widgets/%s/ziffern.bin", name);
    size_t n = (size_t)11 * wzW / 8 * wzH;
    if (!wzZiffern || n > (size_t)11 * 128 * 160 / 8 || !sollLesen(rel, wzZiffern, n)) wzX = -1;   // ohne Ziffern keine Zeit
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
    int bz = 11 * wzW / 8;
    for (int k = 0; k < 5; k++) {
        int qx = zeichen[k] * wzW / 8, zx = (wzX + k * wzW) / 8;
        for (int r = 0; r < wzH; r++) {
            if (wzY + r >= H || zx + wzW / 8 > W / 8) continue;
            memcpy(imgBuf + (wzY + r) * (W / 8) + zx, wzZiffern + r * bz + qx, wzW / 8);
        }
    }
    return true;
}

/** Aus setzeModus: Seite aufbauen */
static void widgetZeigen() {
    char rel[48];
    snprintf(rel, sizeof rel, "widgets/%s/bild.bin", widgetName);
    if (!widgetLaden(widgetName) || !sollLesen(rel, imgBuf, IMG_BYTES)) {
        memset(imgBuf, 0, IMG_BYTES);
        tone(PIN_BUZZER, 900, 120);           // Widget noch nicht aufgespielt
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
    if (modus != M_WIDGET || hilfeAn || !wHatUhr) return;
    if (tLaeuft) aktiv();                     // auf der Timer-Seite nicht einschlafen, solange er läuft
    if (widgetZeitZeichnen(false)) {
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.updatePartial(wzX, wzY, 5 * wzW, wzH);
    }
}
