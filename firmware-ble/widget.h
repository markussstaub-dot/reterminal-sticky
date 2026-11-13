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
 *     schritt <dx> <dy>: Abstand von Zelle zu Zelle auf dem Display (Standard w 0; hochkant 0 −h, FW 0.21.0)
 *     typ rechner|umrechner (FW 0.28.0): Logik im Sticky (rechner.h), die App liefert Optik und Tasten –
 *       glyphen <z> <z> … (Zellen in ziffern.bin, „_“ = Leerzeichen) · text <x> <y> <n> (Anzeige, n Zellen, rechtsbündig,
 *       mit schritt auch hochkant) · tasten <t> <t> … · knopf … taste <i> (i-te Taste) · paar <von> <nach> <a> <b>
 *       (y = a·x + b) · knopf … paar <i> (Einheitenpaar wählen, wird invertiert markiert)
 *     typ weltzeit (FW 0.29.0): stadt <Versatz zu UTC in min> je Stadt (die App liefert sie bei jedem Abgleich, kennt
 *       also die Sommerzeit überall), je Stadt eine Zeile text <x> <y> <n> mit „HH:MM ☀|☾“, jede Minute neu
 *     typ wecker (FW 0.29.0): text 1 = Weckzeit „HH:MM“, text 2 = „an“/„aus“; Aktion weck <code> (1 +1 h, 2 −1 h,
 *       3 +10 min, 4 −10 min, 5 +1 min, 6 −1 min, 9 an/aus). Die Weckzeit liegt in /ist/wecker.txt; geprüft wird jede
 *       Minute, auch aus dem Schlummer (der Sticky wacht zur vollen Minute ohnehin auf); klingelt bis zu 1 min, jede
 *       Taste beendet es
 *     typ einstellungen (FW 0.30.0): Einstellungen am Sticky, ohne Handy. Aktion set <code> (1 = Uhr: automatisch →
 *       24 h → 12 h); text 1 zeigt den Wert („auto“, „24 h“, „12 h“)
 *       Uhr stellen (FW 0.31.0, für den Fall: Akku ganz leer und kein Handy da): text 2 zeigt „TT.MM.JJ hh:mm“ bzw.
 *       „--.--.-- --:--“, set 11/12 ±1 h, 13/14 ±10 min, 15/16 ±1 min, 21/22 ±Tag, 23/24 ±Monat, 25/26 ±Jahr
 *       (Sekunden auf 0, geht in den Uhrenchip; das Handy korrigiert beim nächsten Verbinden sekundengenau)
 * Karussell-Eintrag „widget <name>“. Ein Uhrwerk für alle Widgets: der Timer läuft weiter, wenn man die Seite verlässt;
 * beim Ablauf weckt er den Sticky (leichtSchlaf), piept und holt die Timer-Seite nach vorn.
 */
#include "rechner.h"
static bool statusHoch();
struct WKnopf { int x0, y0, x1, y1; char aktion[12]; int wert; };
static const int W_KNOPF_MAX = 48;
static char tWidget[16] = "";   // widgetName steht in modus.h
static uint8_t* wzZiffern = nullptr;
static int wzW = 64, wzH = 96, wzX = -1, wzY = 0, wzDx = 64, wzDy = 0;
static bool wzSchrittGesetzt = false;
static WKnopf wKnoepfe[W_KNOPF_MAX];
// Rechner/Umrechner (FW 0.28.0)
static bool wRechner = false, wUmrechner = false, wTextNeu = false, wPaarNeu = false;
static int wTx = -1, wTy = 0, wTn = 0, wGlyphAnzahl = 0, wTastenAnzahl = 0;
static int wTxA[6], wTyA[6], wTnA[6], wTextAnzahl = 0;    // alle text-Zeilen; wTx/wTy/wTn ist die gerade gezeichnete
static bool wWeltzeit = false, wWecker = false, wEinst = false;
static int wStadtOff[6], wStadtAnzahl = 0, wMinuteGezeigt = -1;
// Wecker
static int weckH = 7, weckM = 0, weckGefeuert = -1;
static bool weckAn = false, weckGeladen = false;
static char wGlyph[64][5], wTasten[W_KNOPF_MAX][5];
static Rechner wRe;
static Umrechner wUm;
static bool wReBereit = false, wUmBereit = false;
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

/** Datei eines Widgets; bei Lage „auto“ und hochkant aus widgets/<name>-h/ (die App legt beide Lagen ab, FW 0.22.0) */
static void wPfad(char* rel, size_t n, const char* name, const char* datei) {
    if (einhUs) {                                  // US-Fassung (z. B. Lineal in Zoll), FW 0.31.0
        snprintf(rel, n, "widgets/%s-us/felder.txt", name);
        if (sollDa(rel)) { snprintf(rel, n, "widgets/%s-us/%s", name, datei); return; }
    }
    snprintf(rel, n, "widgets/%s-h/felder.txt", name);
    if (lageAuto(name) && lageHoch(name) && sollDa(rel)) snprintf(rel, n, "widgets/%s-h/%s", name, datei);
    else snprintf(rel, n, "widgets/%s/%s", name, datei);
}

static bool widgetLaden(const char* name) {
    char rel[48];
    String t;
    wPfad(rel, sizeof rel, name, "felder.txt");
    if (!sollText(rel, t)) return false;
    strlcpy(widgetName, name, sizeof widgetName);
    wKnopfAnzahl = 0; wzX = -1; wTaste[0][0] = wTaste[1][0] = 0; wHatUhr = false; wWaage = false; wbR = 0; wW1x = wW2x = -1;
    wzSchrittGesetzt = false;
    wRechner = wUmrechner = false; wTx = -1; wGlyphAnzahl = wTastenAnzahl = 0;
    wWeltzeit = wWecker = wEinst = false; wTextAnzahl = 0; wStadtAnzahl = 0; wMinuteGezeigt = -1;
    if (!wReBereit) { rNeu(wRe); wReBereit = true; }
    if (!wUmBereit) { uNeu(wUm); wUmBereit = true; }
    int altPaar = wUm.paar;
    wUm.anzahl = 0;
    int start = 0;
    while (start < (int)t.length()) {
        int ende = t.indexOf('\n', start);
        if (ende < 0) ende = t.length();
        String z = t.substring(start, ende);
        start = ende + 1;
        z.trim();
        char a[16] = "", b[12] = "";   // a: auch lange Typnamen wie „einstellungen“ (FW 0.30.1)
        int v[5] = {0, 0, 0, 0, 0};
        if (sscanf(z.c_str(), "typ %15s", a) == 1) {
            wCountdown = strcmp(a, "stoppuhr") != 0; wWaage = !strcmp(a, "waage");
            wRechner = !strcmp(a, "rechner"); wUmrechner = !strcmp(a, "umrechner");
            wWeltzeit = !strcmp(a, "weltzeit"); wWecker = !strcmp(a, "wecker"); wEinst = !strcmp(a, "einstellungen");
            wHatUhr = strcmp(a, "menue") && !wWaage && !wRechner && !wUmrechner && !wWeltzeit && !wWecker && !wEinst;
        }
        else if (z.startsWith("glyphen ") || z.startsWith("tasten ")) {   // Wortliste (UTF-8), „_“ = Leerzeichen
            bool g = z.startsWith("glyphen ");
            int p = g ? 8 : 7;
            while (p < (int)z.length()) {
                int q = z.indexOf(' ', p);
                if (q < 0) q = z.length();
                String w = z.substring(p, q);
                if (g && wGlyphAnzahl < 64) strlcpy(wGlyph[wGlyphAnzahl++], w == "_" ? " " : w.c_str(), 5);
                if (!g && wTastenAnzahl < W_KNOPF_MAX) strlcpy(wTasten[wTastenAnzahl++], w.c_str(), 5);
                p = q + 1;
            }
        }
        else if (sscanf(z.c_str(), "text %d %d %d", &v[0], &v[1], &v[2]) == 3) {
            if (wTextAnzahl < 6) { wTxA[wTextAnzahl] = v[0] & ~7; wTyA[wTextAnzahl] = v[1]; wTnA[wTextAnzahl++] = v[2]; }
            if (wTextAnzahl == 1) { wTx = v[0] & ~7; wTy = v[1]; wTn = v[2]; }
        }
        else if (sscanf(z.c_str(), "stadt %d", &v[0]) == 1 && wStadtAnzahl < 6) wStadtOff[wStadtAnzahl++] = v[0];
        else if (z.startsWith("paar ") && wUm.anzahl < 12) {
            char von[8], nach[8]; double pa, pb;
            if (sscanf(z.c_str(), "paar %7s %7s %lf %lf", von, nach, &pa, &pb) == 4 && pa != 0) {
                UPaar& p = wUm.paare[wUm.anzahl++];
                strlcpy(p.von, von, sizeof p.von); strlcpy(p.nach, nach, sizeof p.nach); p.a = pa; p.b = pb;
            }
        }
        else if (sscanf(z.c_str(), "blase %d %d %d", &v[0], &v[1], &v[2]) == 3) { wbX = v[0]; wbY = v[1]; wbR = v[2]; }
        else if (sscanf(z.c_str(), "wert1 %d %d", &v[0], &v[1]) == 2) { wW1x = v[0] & ~7; wW1y = v[1]; }
        else if (sscanf(z.c_str(), "wert2 %d %d", &v[0], &v[1]) == 2) { wW2x = v[0] & ~7; wW2y = v[1]; }
        else if (sscanf(z.c_str(), "achsen %3s %3s", a, b) == 2) { strlcpy(wAchse[0], a, 4); strlcpy(wAchse[1], b, 4); }
        else if (sscanf(z.c_str(), "dauer %d", &v[0]) == 1) wDauerS = v[0];
        else if (sscanf(z.c_str(), "zeit %d %d", &v[0], &v[1]) == 2) { wzX = v[0] & ~7; wzY = v[1]; }
        else if (sscanf(z.c_str(), "ziffern %d %d", &v[0], &v[1]) == 2) { wzW = v[0] & ~7; wzH = v[1]; }
        else if (sscanf(z.c_str(), "schritt %d %d", &v[0], &v[1]) == 2) { wzDx = v[0]; wzDy = v[1]; wzSchrittGesetzt = true; }
        else if (sscanf(z.c_str(), "knopf %d %d %d %d %11s %d", &v[0], &v[1], &v[2], &v[3], a, &v[4]) >= 5 && wKnopfAnzahl < W_KNOPF_MAX) {
            WKnopf& k = wKnoepfe[wKnopfAnzahl++];
            k.x0 = v[0]; k.y0 = v[1]; k.x1 = v[2]; k.y1 = v[3]; strlcpy(k.aktion, a, sizeof k.aktion); k.wert = v[4];
        } else if (sscanf(z.c_str(), "taste %11s %11s %d", b, a, &v[0]) >= 2) {
            int i = !strcmp(b, "up") ? 0 : !strcmp(b, "down") ? 1 : -1;
            if (i >= 0) { strlcpy(wTaste[i], a, sizeof wTaste[i]); wTasteWert[i] = v[0]; }
        }
    }
    if (!wzSchrittGesetzt) { wzDx = wzW; wzDy = 0; }
    if (!wzZiffern) wzZiffern = (uint8_t*)ps_malloc(14 * 128 * 160 / 8);
    wPfad(rel, sizeof rel, name, "ziffern.bin");
    wZellen = wGlyphAnzahl ? wGlyphAnzahl : wWaage ? 14 : 11;
    if (wUmrechner) wUm.paar = altPaar < wUm.anzahl ? altPaar : 0;
    size_t n = (size_t)wZellen * wzW / 8 * wzH;
    if (!wzZiffern || n > (size_t)14 * 128 * 160 / 8 || !sollLesen(rel, wzZiffern, n)) { wzX = -1; wW1x = wW2x = -1; wTx = -1; }   // ohne Ziffern keine Zahlen
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
        int qx = zeichen[k] * wzW / 8, zx = (wzX + k * wzDx) / 8, zy = wzY + k * wzDy;
        for (int r = 0; r < wzH; r++) {
            if (zy + r < 0 || zy + r >= H || zx < 0 || zx + wzW / 8 > W / 8) continue;
            memcpy(imgBuf + (zy + r) * (W / 8) + zx, wzZiffern + r * bz + qx, wzW / 8);
        }
    }
    return true;
}

// ---- Rechner / Umrechner (FW 0.28.0) --------------------------------------------------------------------------------
static void wZelle(int x, int y, int idx);
/** Text rechtsbündig in die Anzeige (n Zellen ab text x y, mit schritt); unbekannte Zeichen bleiben leer.
 *  links: optional ein Zeichen in der ersten Zelle (Speicher „M“) */
static void wTextZeichnen(const char* s, const char* links) {
    if (wTx < 0 || !wTn) return;
    int idx[64], n = 0;
    for (const char* p = s; *p && n < 64;) {
        int len = (*p & 0x80) == 0 ? 1 : (*p & 0xE0) == 0xC0 ? 2 : (*p & 0xF0) == 0xE0 ? 3 : 4;
        int g = -1;
        for (int i = 0; i < wGlyphAnzahl; i++) if ((int)strlen(wGlyph[i]) == len && !strncmp(wGlyph[i], p, len)) { g = i; break; }
        idx[n++] = g;
        p += len;
    }
    for (int k = 0; k < wTn; k++) wZelle(wTx + k * wzDx, wTy + k * wzDy, -1);
    int ab = max(0, n - wTn), start = wTn - (n - ab);
    for (int k = 0; k < n - ab; k++) wZelle(wTx + (start + k) * wzDx, wTy + (start + k) * wzDy, idx[ab + k]);
    if (links && *links) {
        int g = -1;
        for (int i = 0; i < wGlyphAnzahl; i++) if (!strcmp(wGlyph[i], links)) g = i;
        if (g >= 0 && start > 1) wZelle(wTx, wTy, g);
    }
}
/** Textzeile i auswählen (für wTextZeichnen) */
static bool wFeld(int i) {
    if (i >= wTextAnzahl) return false;
    wTx = wTxA[i]; wTy = wTyA[i]; wTn = wTnA[i];
    return true;
}
static void weckerLaden();
static void wAnzeigeZeichnen() {
    if (wWeltzeit) {
        time_t jetzt = time(nullptr);
        for (int i = 0; i < wStadtAnzahl && wFeld(i); i++) {
            time_t s = jetzt + wStadtOff[i] * 60;
            tm t;
            gmtime_r(&s, &t);
            char z[16];
            if (uhr12) snprintf(z, sizeof z, "%d:%02d%c %s", stundeZeigen(t.tm_hour), t.tm_min, t.tm_hour >= 12 ? 'p' : 'a', t.tm_hour >= 7 && t.tm_hour < 19 ? "☀" : "☾");
            else snprintf(z, sizeof z, "%02d:%02d %s", t.tm_hour, t.tm_min, t.tm_hour >= 7 && t.tm_hour < 19 ? "☀" : "☾");
            wTextZeichnen(z, nullptr);
        }
        wFeld(0);
    }
    if (wWecker) {
        weckerLaden();
        char z[10];
        if (uhr12) snprintf(z, sizeof z, "%d:%02d%c", stundeZeigen(weckH), weckM, weckH >= 12 ? 'p' : 'a');
        else snprintf(z, sizeof z, "%02d:%02d", weckH, weckM);
        if (wFeld(0)) wTextZeichnen(z, nullptr);
        if (wFeld(1)) wTextZeichnen(weckAn ? "an" : "aus", nullptr);
        wFeld(0);
    }
    if (wEinst && wFeld(0)) { wTextZeichnen(uhr12Lokal < 0 ? "auto" : uhr12 ? "12 h" : "24 h", nullptr); wFeld(0); }
    if (wEinst && wFeld(2)) { wTextZeichnen(einhUsLokal < 0 ? "auto" : einhUs ? "US" : "metr", nullptr); wFeld(0); }
    if (wEinst && wFeld(1)) {
        char z[20] = "--.--.-- --:--";
        if (zeitGesetzt) {
            time_t s = time(nullptr);
            tm t;
            localtime_r(&s, &t);
            snprintf(z, sizeof z, "%02d.%02d.%02d %02d:%02d", t.tm_mday, t.tm_mon + 1, t.tm_year % 100, t.tm_hour, t.tm_min);
        }
        wTextZeichnen(z, nullptr);
        wFeld(0);
    }
    if (wRechner) wTextZeichnen(wRe.anzeige, wRe.mem != 0 ? "M" : nullptr);
    if (wUmrechner) { char a[64]; uAnzeige(wUm, a, sizeof a); wTextZeichnen(a, nullptr); }
}
static void wAnzeigeZeigen() {
    wAnzeigeZeichnen();
    bildZeigen(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    if (wTextAnzahl > 1) { if (statusHoch()) teilZeigen(62, 0, W - 62, H); else teilZeigen(0, 62, W, H - 62); return; }   // mehrere Zeilen: ganze Seite
    int x0 = min(wTx, wTx + (wTn - 1) * wzDx), y0 = min(wTy, wTy + (wTn - 1) * wzDy);
    teilZeigen(max(0, x0), max(0, y0), abs((wTn - 1) * wzDx) + wzW, abs((wTn - 1) * wzDy) + wzH);
}

// ---- Wecker (FW 0.29.0) ---------------------------------------------------------------------------------------------
static void weckerLaden() {
    if (weckGeladen) return;
    weckGeladen = true;
    if (!sdEin()) return;
    File f = SD.open("/ist/wecker.txt", FILE_READ);
    if (!f) return;
    String z = f.readStringUntil('\n');
    f.close();
    int h, m, an;
    if (sscanf(z.c_str(), "%d %d %d", &h, &m, &an) == 3) { weckH = constrain(h, 0, 23); weckM = constrain(m, 0, 59); weckAn = an; }
}
static void weckerSichern() {
    if (!sdEin()) return;
    SD.mkdir("/ist");
    File f = SD.open("/ist/wecker.txt", FILE_WRITE);
    if (f) { f.printf("%d %d %d\n", weckH, weckM, weckAn ? 1 : 0); f.close(); }
}
/** Aus widgetLoop (jede Runde, auch nach dem Minuten-Wecken im Schlummer): Weckzeit erreicht? */
static void weckerPruefen() {
    weckerLaden();
    if (!weckAn) return;
    time_t jetzt = time(nullptr);
    tm t;
    localtime_r(&jetzt, &t);
    if (t.tm_year < 120 || t.tm_hour != weckH || t.tm_min != weckM) return;
    int heute = t.tm_yday * 1440 + t.tm_hour * 60 + t.tm_min;
    if (weckGefeuert == heute) return;
    weckGefeuert = heute;
    protokoll("Wecker %02d:%02d", weckH, weckM);
    aktiv();
    suchenStill = true;                       // klingeln wie „Sticky suchen“, jede Taste beendet es (ohne Meldung an die App)
    suchenBis = millis() + 60000;
    if (modus != M_WIDGET || strcmp(widgetName, "wecker")) { strlcpy(widgetName, "wecker", sizeof widgetName); modusWunsch = M_WIDGET; }
}
/** gewähltes Einheitenpaar invertiert markieren (alle Paar-Knöpfe aus dem Hintergrund, der gewählte umgekehrt) */
static void wPaarMarkieren() {
    if (!wUmrechner || !wHintergrund) return;
    for (int i = 0; i < wKnopfAnzahl; i++) {
        const WKnopf& k = wKnoepfe[i];
        if (strcmp(k.aktion, "paar")) continue;
        for (int y = max(0, k.y0); y < min(H, k.y1); y++) for (int x = max(0, k.x0); x < min(W, k.x1); x++) {
            uint8_t m = 0x80 >> (x & 7);
            bool s = wHintergrund[y * (W / 8) + x / 8] & m;
            bool innen = k.wert == wUm.paar && x >= k.x0 + 8 && x < k.x1 - 8 && y >= k.y0 + 8 && y < k.y1 - 8;
            if (innen) s = !s;
            if (s) imgBuf[y * (W / 8) + x / 8] |= m; else imgBuf[y * (W / 8) + x / 8] &= ~m;
        }
    }
}

// ---- Wasserwaage ------------------------------------------------------------------------------
/** Zelle idx (0–9, 10 „:“, 11 „-“, 12 „.“, 13 „°“, -1 leer) an x, y ins Bild */
static void wZelle(int x, int y, int idx) {
    int bz = wZellen * wzW / 8, zx = x / 8;
    if (zx < 0 || zx + wzW / 8 > W / 8) return;
    for (int r = 0; r < wzH && y + r < H; r++) {
        if (y + r < 0) continue;
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
    for (int k = 0; k < 6; k++) wZelle(x + k * wzDx, y + k * wzDy, zellen[k]);
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
    bildZeigen(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    if (statusHoch()) teilZeigen(62, 0, W - 62, H); else teilZeigen(0, 62, W, H - 62);
}

/** Aus setzeModus: Seite aufbauen */
static void widgetZeigen() {
    char rel[48];
    wPfad(rel, sizeof rel, widgetName, "bild.bin");
    if (!widgetLaden(widgetName) || !sollLesen(rel, imgBuf, IMG_BYTES)) {
        memset(imgBuf, 0, IMG_BYTES);
        tone(PIN_BUZZER, 900, 120);           // Widget noch nicht aufgespielt
    }
    if (wRechner || wUmrechner || wWeltzeit || wWecker || wEinst) {
        if (!wHintergrund) wHintergrund = (uint8_t*)ps_malloc(IMG_BYTES);
        if (wHintergrund) memcpy(wHintergrund, imgBuf, IMG_BYTES);
        wPaarMarkieren();
        wAnzeigeZeichnen();
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
    bildZeigen(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
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
    if ((wRechner || wUmrechner) && !strcmp(a, "taste") && wert >= 0 && wert < wTastenAnzahl) {
        if (wRechner) rTaste(wRe, wTasten[wert]); else uTaste(wUm, wTasten[wert]);
        wTextNeu = true;
        return;
    }
    if (wUmrechner && !strcmp(a, "paar")) { uWaehle(wUm, wert); wPaarNeu = wTextNeu = true; return; }
    if (wEinst && !strcmp(a, "set")) {
        if (wert == 1) { uhrFormatWeiter(); uhrMinute = -1; }
        if (wert == 2) einheitenWeiter();
        if (wert >= 11 && wert <= 26) {   // Uhr von Hand stellen (Ortszeit), ohne gültige Zeit ab heute 12:00 laut Firmware-Datum
            tm t;
            if (zeitGesetzt) { time_t s = time(nullptr); localtime_r(&s, &t); }
            else {
                t = {};
                static const char* mon = "JanFebMarAprMayJunJulAugSepOctNovDec";
                char m[4] = {__DATE__[0], __DATE__[1], __DATE__[2], 0};
                t.tm_mon = (strstr(mon, m) - mon) / 3; t.tm_mday = atoi(__DATE__ + 4); t.tm_year = atoi(__DATE__ + 7) - 1900; t.tm_hour = 12;
            }
            switch (wert) {
                case 11: t.tm_hour++; break;  case 12: t.tm_hour--; break;
                case 13: t.tm_min += 10; break; case 14: t.tm_min -= 10; break;
                case 15: t.tm_min++; break;   case 16: t.tm_min--; break;
                case 21: t.tm_mday++; break;  case 22: t.tm_mday--; break;
                case 23: t.tm_mon++; break;   case 24: t.tm_mon--; break;
                case 25: t.tm_year++; break;  case 26: t.tm_year--; break;
            }
            t.tm_sec = 0; t.tm_isdst = -1;
            time_t neu = mktime(&t);                     // TZ ist Ortszeit (CET/CEST)
            zeitSetzen((uint64_t)neu * 1000);
            uhrMinute = -1;
        }
        wTextNeu = true;
        return;
    }
    if (wWecker && !strcmp(a, "weck")) {
        int m = weckH * 60 + weckM;
        if (wert == 9) weckAn = !weckAn;
        else m += wert == 1 ? 60 : wert == 2 ? -60 : wert == 3 ? 10 : wert == 4 ? -10 : wert == 5 ? 1 : wert == 6 ? -1 : 0;
        m = (m % 1440 + 1440) % 1440;
        weckH = m / 60; weckM = m % 60;
        if (wert != 9) weckAn = true;              // wer die Zeit stellt, will geweckt werden
        weckerSichern();
        protokoll("Wecker %02d:%02d %s", weckH, weckM, weckAn ? "an" : "aus");
        wTextNeu = true;
        return;
    }
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
    if (modus == M_WIDGET && !hilfeAn && wPaarNeu) {   // anderes Einheitenpaar: Liste und Anzeige neu
        wPaarNeu = wTextNeu = false;
        wPaarMarkieren();
        wAnzeigeZeichnen();
        bildZeigen(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        if (statusHoch()) teilZeigen(62, 0, W - 62, H); else teilZeigen(0, 62, W, H - 62);
    }
    if (modus == M_WIDGET && !hilfeAn && wTextNeu) { wTextNeu = false; wAnzeigeZeigen(); }
    weckerPruefen();
    if (modus == M_WIDGET && !hilfeAn && (wWeltzeit || wEinst)) {   // Weltzeit, Einstellungen (Uhr): jede Minute neu
        time_t jetzt = time(nullptr);
        int min_ = (int)(jetzt / 60);
        if (min_ != wMinuteGezeigt) { wMinuteGezeigt = min_; wAnzeigeZeigen(); }
    }
    if (modus != M_WIDGET || hilfeAn || !wHatUhr) return;
    if (tLaeuft) aktiv();                     // auf der Timer-Seite nicht einschlafen, solange er läuft
    if (widgetZeitZeichnen(false)) {
        bildZeigen(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        int x0 = min(wzX, wzX + 4 * wzDx), y0 = min(wzY, wzY + 4 * wzDy);
        teilZeigen(max(0, x0), max(0, y0), abs(4 * wzDx) + wzW, abs(4 * wzDy) + wzH);
    }
}
