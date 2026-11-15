/**
 * Burgduell lokal (SPEC „Spiel“, FW 0.39.0): Ballerburg-Hommage ohne Handy, gegen den Sticky oder zu zweit am Gerät.
 * Übernommen aus dem Sticky Lab (sticky-lab/firmware/stationen/burgduell.h, MIT wie EDC), angepasst ans Zeichenmodell
 * von EDC: Das Lab malt direkt aufs Display, EDC hält die Seite in imgBuf (Statuszeile, Hilfe, 180°-Drehung hängen daran).
 * Darum malt das Spiel in ein 1-bpp-Sprite (gleiches Format wie imgBuf: Zeilen à 100 Byte, Bit 1 = schwarz), kopiert es
 * nach imgBuf, setzt die Statuszeile darüber und zeigt den geänderten Streifen per Teil-Refresh.
 *
 * Bedienung wie im Lab: Tipp ins Feld zielt (Richtung und Abstand von der eigenen Kanone = Winkel und Pulver), runde
 * Regler unten für Winkel und Pulver, Doppelring „Feuer“ schießt, ▲/▼ kurz = Winkel fein. Pille unten links wechselt
 * „gegen Sticky“ / „2 Spieler“. Die EDC-Tastenregeln bleiben: KI kurz = Home, KI halten = Diktat, ▲/▼ 1 s = Karussell.
 * Mit Handy zeigt der Eintrag „Spiel“ weiter die App-Seite (Duell zweier Stickys); siehe modus.h (spielLokal).
 */
#pragma once
#include <font/GFXFF/FreeSans9pt7b.h>
#include <font/GFXFF/FreeSansBold9pt7b.h>
#include <font/GFXFF/FreeSansBold12pt7b.h>

namespace burgduell {

static const uint16_t SCHWARZ = TFT_BLACK, WEISS = TFT_WHITE;
static Seeed_Sprite S;                                     // Spielseite, 800 × 480 × 1 bpp
static bool spriteBereit() {
    if (S.created()) return true;
    S.setColorDepth(1);
    if (!S.createSprite(&display, W, H)) return false;
    S.setBitmapColor(SCHWARZ, WEISS);                      // Bit 1 = schwarz wie in imgBuf
    return true;
}

// ---- Text und Braun-Grundformen (aus dem Lab: anzeige.h) ---------------------------------------------------------
// FreeSans kennt nur ASCII: Umlaute setzt text() selbst (Grundbuchstabe + zwei Punkte), „·“ wird ein Mittelpunkt,
// „°“ ein kleiner Ring
static void umwandeln(const char* s, char* a, size_t n, uint8_t* art) {
    size_t j = 0;
    for (const uint8_t* p = (const uint8_t*)s; *p && j + 2 < n; ) {
        uint8_t c = p[0];
        if (c == 0xC3 && p[1]) {
            char b = 0;
            switch (p[1]) { case 0xA4: b = 'a'; break; case 0xB6: b = 'o'; break; case 0xBC: b = 'u'; break;
                            case 0x84: b = 'A'; break; case 0x96: b = 'O'; break; case 0x9C: b = 'U'; break; }
            if (b) { art[j] = 1; a[j++] = b; p += 2; continue; }
            if (p[1] == 0x9F) { art[j] = 0; a[j++] = 's'; art[j] = 0; a[j++] = 's'; p += 2; continue; }
        }
        if (c == 0xC2 && p[1] == 0xB7) { art[j] = 2; a[j++] = ' '; p += 2; continue; }   // ·
        if (c == 0xC2 && p[1] == 0xB0) { art[j] = 5; a[j++] = ' '; p += 2; continue; }   // °
        if (c < 0x80) { art[j] = 0; a[j++] = c; p++; } else p++;
    }
    a[j] = 0;
}
static const GFXglyph* glyphe(const GFXfont* f, char c) {
    if ((uint8_t)c < f->first || (uint8_t)c > f->last) return nullptr;
    return &f->glyph[(uint8_t)c - f->first];
}
static int vorschub(const GFXfont* f, const char* a, int n = -1) {
    int w = 0;
    for (int i = 0; a[i] && (n < 0 || i < n); i++) { const GFXglyph* g = glyphe(f, a[i]); if (g) w += g->xAdvance; }
    return w;
}
static void text(const char* s, int x, int y, const GFXfont* f, uint8_t datum = TL_DATUM, uint16_t farbe = SCHWARZ) {
    char a[96]; uint8_t art[96];
    umwandeln(s, a, sizeof a, art);
    S.setFreeFont(f);
    S.setTextSize(1);
    S.setTextColor(farbe);
    int w = vorschub(f, a);
    const GFXglyph* gH = glyphe(f, 'H');
    int cap = gH ? -gH->yOffset : 10;
    int links = x, basis = y;
    switch (datum) {
        case ML_DATUM: basis = y + cap / 2; break;
        case MC_DATUM: links = x - w / 2; basis = y + cap / 2; break;
        case MR_DATUM: links = x - w;     basis = y + cap / 2; break;
        default:       basis = y + cap; break;   // TL
    }
    S.setTextDatum(L_BASELINE);
    S.drawString(a, links, basis);
    int r = max(1, (int)f->yAdvance / 22);
    for (int i = 0; a[i]; i++) {
        if (!art[i]) continue;
        int cx0 = links + vorschub(f, a, i);
        const GFXglyph* g = glyphe(f, a[i]);
        if (!g) continue;
        if (art[i] == 1) {
            int mitte = cx0 + g->xOffset + g->width / 2, oben = basis + g->yOffset - r * 2 - 1, d = max(r + 1, (int)g->width / 4);
            S.fillCircle(mitte - d, oben, r, farbe);
            S.fillCircle(mitte + d, oben, r, farbe);
        } else if (art[i] == 5) {
            int rr = max(2, (int)f->yAdvance / 12);
            S.drawCircle(cx0 + rr + 1, basis - cap + rr, rr, farbe);
        } else {
            S.fillCircle(cx0 + g->xAdvance / 2, basis - cap / 2, max(2, (int)f->yAdvance / 14), farbe);
        }
    }
    S.setFreeFont(nullptr);
}
/** Nebensache: Pille mit dünnem Ring (Braun-Regeln aus sticky-app/src/braun.js) */
static void pille(int x, int y, int w, int h, const char* s) {
    int r = h / 2;
    S.fillRoundRect(x, y, w, h, r, WEISS);
    for (int i = 0; i < 2; i++) S.drawRoundRect(x + i, y + i, w - 2 * i, h - 2 * i, max(0, r - i), SCHWARZ);
    text(s, x + w / 2, y + h / 2, &FreeSans12pt7b, MC_DATUM);
}
/** Hauptaktion: Doppelring */
static void doppelring(int cx, int cy, int r, const char* s) {
    S.fillCircle(cx, cy, r, WEISS);
    int innen = r < 52 ? 7 : 10;
    for (int i = 0; i < 3; i++) { S.drawCircle(cx, cy, r - i, SCHWARZ); S.drawCircle(cx, cy, r - innen - i, SCHWARZ); }
    text(s, cx, cy, r < 52 ? &FreeSansBold9pt7b : &FreeSansBold12pt7b, MC_DATUM);
}
static bool drin(int x, int y, int x0, int y0, int w, int h) { return x >= x0 && x < x0 + w && y >= y0 && y < y0 + h; }

// ---- Maße ------------------------------------------------------------------------------------------------------
static const int KOPF_H = 46;                               // Kopf: Titel links, rechts die EDC-Statuszeile (288 × 32)
static const int FY = KOPF_H, FH = 410 - KOPF_H;            // Spielfeld
static const int HUD_Y = 412;
static const int FEUER_X = 748, FEUER_Y = 445, FEUER_R = 36;
static const int GX = 8, GY = 420, GW = 150, GH = 52;       // Pille Gegner
static const int RY = 452, RR = 22, WM_X = 200, WP_X = 320, PM_X = 400, PP_X = 520;   // Regler Winkel / Pulver
static const int BW = 46, BH = 40;                          // Burg

static int16_t boden[W];                                    // Geländehöhe (y) je Spalte
static int burgX[2], hp[2];
static int am = 0;                                          // wer ist am Zug
static int winkel[2] = { 45, 45 }, kraft[2] = { 55, 55 };
static int wind = 0;
static bool gegenSticky = true, vorbei = false, begonnen = false;
static int zuege = 0;
static const int MAXSPUR = 400;
static int16_t spurX[MAXSPUR], spurY[MAXSPUR]; static int spurN = 0;
static char meldung[64] = "";

static const char* name(int b) { return b == 0 ? T("Voll-Fahne", "Solid flag") : (gegenSticky ? "Sticky" : T("Ring-Fahne", "Ring flag")); }

// ---- Welt -------------------------------------------------------------------------------------------------------
static void neueWelt() {
    float a1 = random(10, 40), a2 = random(5, 25), p1 = random(0, 628) / 100.0f, p2 = random(0, 628) / 100.0f;
    float f1 = random(6, 14) / 1000.0f, f2 = random(15, 30) / 1000.0f;
    for (int x = 0; x < W; x++) boden[x] = 330 - a1 * sinf(x * f1 + p1) - a2 * sinf(x * f2 + p2) - 40 * sinf(x * PI / W);
    burgX[0] = 70; burgX[1] = W - 70;
    for (int b = 0; b < 2; b++) {   // Bauplatz ebnen
        int y = boden[burgX[b]];
        for (int x = burgX[b] - BW / 2 - 6; x <= burgX[b] + BW / 2 + 6; x++) boden[x] = y;
    }
    hp[0] = hp[1] = 3; am = 0; zuege = 0; vorbei = false; spurN = 0; begonnen = true;
    wind = random(-5, 6);
    winkel[0] = winkel[1] = 45; kraft[0] = kraft[1] = 55;
    snprintf(meldung, sizeof meldung, "%s", T("Voll-Fahne beginnt", "Solid flag starts"));
}
static void kanone(int b, int& x, int& y) { x = burgX[b] + (b == 0 ? 10 : -10); y = boden[burgX[b]] - BH - 10; }

static void burgZeichnen(int b) {
    int x0 = burgX[b] - BW / 2, y0 = boden[burgX[b]] - BH;
    S.fillRect(x0, y0, BW, BH, SCHWARZ);
    for (int i = 0; i < 3; i++) if (i < hp[b]) S.fillRect(x0 + 2 + i * 16, y0 - 8, 10, 8, SCHWARZ);   // je Treffer fehlt eine Zinne
    S.fillRect(burgX[b] - 6, y0 + BH - 16, 12, 16, WEISS);   // Tor
    int tx = burgX[b] + (b == 0 ? 10 : -10);                 // Turm mit Fahne (Spieler 1 voll, Spieler 2 Ring)
    S.fillRect(tx - 5, y0 - 18, 10, 18, SCHWARZ);
    S.drawFastVLine(tx, y0 - 34, 16, SCHWARZ);
    int fx = b == 0 ? tx : tx - 14;
    if (b == 0) S.fillTriangle(fx, y0 - 34, fx + 14, y0 - 29, fx, y0 - 24, SCHWARZ);
    else S.drawTriangle(fx + 14, y0 - 34, fx, y0 - 29, fx + 14, y0 - 24, SCHWARZ);
    if (hp[b] == 0) { S.drawLine(x0 - 4, y0 - 10, x0 + BW + 4, y0 + BH, WEISS); S.drawLine(x0 - 4, y0 + BH, x0 + BW + 4, y0 - 10, WEISS); }
}

static void kopfZeichnen() {
    S.fillRect(0, 0, W, KOPF_H, WEISS);
    char t[48];
    snprintf(t, sizeof t, T("Burgduell  %d : %d", "Castle duel  %d : %d"), hp[0], hp[1]);
    text(t, 16, KOPF_H / 2 - 2, &FreeSansBold12pt7b, ML_DATUM);
    S.fillRect(0, KOPF_H - 2, W, 2, SCHWARZ);
}

static void feldZeichnen() {
    S.fillRect(0, FY, W, FH, WEISS);
    for (int x = 0; x < W; x++) {   // Gelände: Raster 50 %, Kante schwarz
        for (int y = boden[x] + 2; y < FY + FH; y++) if ((x + y) & 1) S.drawPixel(x, y, SCHWARZ);
        S.drawFastVLine(x, boden[x], 2, SCHWARZ);
    }
    burgZeichnen(0); burgZeichnen(1);
    for (int i = 0; i < spurN; i += 3) S.fillCircle(spurX[i], spurY[i], 2, SCHWARZ);   // letzte Flugbahn
    char b[24];
    if (wind == 0) snprintf(b, sizeof b, "%s", T("Wind still", "No wind"));
    else snprintf(b, sizeof b, "Wind %d", abs(wind));
    text(b, W / 2, FY + 16, &FreeSans9pt7b, MC_DATUM);
    if (*meldung) text(meldung, 10, FY + 10, &FreeSans9pt7b);
    if (wind) {
        int l = abs(wind) * 8, x = W / 2 - l / 2, y = FY + 34;
        S.fillRect(x, y - 1, l, 3, SCHWARZ);
        if (wind > 0) S.fillTriangle(x + l, y - 6, x + l + 9, y, x + l, y + 6, SCHWARZ);
        else S.fillTriangle(x, y - 6, x - 9, y, x, y + 6, SCHWARZ);
    }
    if (!vorbei) {   // gestrichelte Ziellinie, Länge ~ Pulver
        int kx, ky; kanone(am, kx, ky);
        float a = winkel[am] * DEG_TO_RAD; int dir = am == 0 ? 1 : -1;
        float l = kraft[am] * 2.6f;
        for (float t = 8; t < l; t += 10) S.fillCircle(kx + dir * cosf(a) * t, ky - sinf(a) * t, 1, SCHWARZ);
    }
}

static void rundKnopf(int cx, const char* s) {
    S.fillCircle(cx, RY, RR, WEISS);
    for (int i = 0; i < 2; i++) S.drawCircle(cx, RY, RR - i, SCHWARZ);
    text(s, cx, RY, &FreeSansBold12pt7b, MC_DATUM);
}
static void hud() {
    S.fillRect(0, HUD_Y, W, H - HUD_Y, WEISS);
    S.drawFastHLine(0, HUD_Y, W, SCHWARZ);
    pille(GX, GY, GW, GH, gegenSticky ? T("gegen Sticky", "vs. Sticky") : T("2 Spieler", "2 players"));
    if (vorbei) {
        text(meldung, 180, GY + 14, &FreeSansBold12pt7b, ML_DATUM);
        text(T("Tippen = neues Spiel", "Tap = new game"), 180, GY + 40, &FreeSans9pt7b, ML_DATUM);
        return;
    }
    char b[24];
    text(T("Winkel", "Angle"), (WM_X + WP_X) / 2, HUD_Y + 10, &FreeSans9pt7b, MC_DATUM);
    rundKnopf(WM_X, "-"); rundKnopf(WP_X, "+");
    snprintf(b, sizeof b, "%d°", winkel[am]); text(b, (WM_X + WP_X) / 2, RY, &FreeSansBold12pt7b, MC_DATUM);
    text(T("Pulver", "Powder"), (PM_X + PP_X) / 2, HUD_Y + 10, &FreeSans9pt7b, MC_DATUM);
    rundKnopf(PM_X, "-"); rundKnopf(PP_X, "+");
    snprintf(b, sizeof b, "%d", kraft[am]); text(b, (PM_X + PP_X) / 2, RY, &FreeSansBold12pt7b, MC_DATUM);
    text(name(am), 640, HUD_Y + 10, &FreeSans9pt7b, MC_DATUM);
    doppelring(FEUER_X, FEUER_Y, FEUER_R, T("Feuer", "Fire"));
}

/** Sprite → imgBuf, Statuszeile darüber, Bereich zeigen (voll = Voll-Refresh der ganzen Seite) */
static void zeigen(int y, int h, bool voll = false) {
    memcpy(imgBuf, S.getPointer(), IMG_BYTES);
    statusPruefen(false, true);
    bildZeigen(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    if (voll) display.update(); else teilZeigen(0, y, W, h);
}
static void allesNeu() { kopfZeichnen(); feldZeichnen(); hud(); }

// ---- Schuss ---------------------------------------------------------------------------------------------------
/** Simuliert einen Schuss; liefert Einschlag (x, y) und welche Burg getroffen wurde (-1 Boden, -2 ins Aus) */
static int simuliere(int b, int w, int k, int& ex, int& ey, bool aufzeichnen) {
    int kx, ky; kanone(b, kx, ky);
    float a = w * DEG_TO_RAD, dir = b == 0 ? 1 : -1;
    float v = k * 0.105f, vx = dir * cosf(a) * v, vy = -sinf(a) * v, x = kx, y = ky;
    if (aufzeichnen) spurN = 0;
    for (int i = 0; i < 2000; i++) {
        vx += wind * 0.004f; vy += 0.12f;
        x += vx; y += vy;
        if (aufzeichnen && spurN < MAXSPUR && (i & 1)) { spurX[spurN] = x; spurY[spurN] = y; spurN++; }
        if (x < 0 || x >= W || y > FY + FH) { ex = x; ey = y; return -2; }
        for (int bb = 0; bb < 2; bb++) {
            int x0 = burgX[bb] - BW / 2, y0 = boden[burgX[bb]] - BH - 34;
            if (i > 6 && x >= x0 && x < x0 + BW && y >= y0 && y < boden[burgX[bb]]) { ex = x; ey = y; return bb; }
        }
        if (y >= FY && y >= boden[(int)x]) { ex = x; ey = y; return -1; }
    }
    ex = x; ey = y; return -2;
}
static void krater(int cx, int cy, int r) {
    for (int x = max(0, cx - r); x < min(W, cx + r); x++) {
        int dy = sqrtf(r * r - (x - cx) * (x - cx));
        boden[x] = max((int)boden[x], min(FY + FH - 4, cy + dy));
    }
}

static void feuer() {
    if (vorbei) return;
    int ex, ey;
    int treffer = simuliere(am, winkel[am], kraft[am], ex, ey, true);
    const char* wer = name(am);
    if (treffer >= 0) {
        hp[treffer] = max(0, hp[treffer] - 1);
        krater(ex, boden[burgX[treffer]], 10);
        if (hp[treffer] == 0) { vorbei = true; snprintf(meldung, sizeof meldung, T("%s gewinnt!", "%s wins!"), name(1 - treffer)); }
        else snprintf(meldung, sizeof meldung, T("%s trifft!", "%s hits!"), wer);
    } else if (treffer == -1) { krater(ex, ey, 16); snprintf(meldung, sizeof meldung, T("%s: daneben", "%s: missed"), wer); }
    else snprintf(meldung, sizeof meldung, T("%s: ins Aus", "%s: out"), wer);
    zuege++;
    if (!vorbei) { am = 1 - am; int dw = random(-2, 3); wind = constrain(wind + dw, -6, 6); }   // random() nie in constrain(): Makro
    allesNeu();
    uint32_t t0 = millis();
    zeigen(0, H);
    protokoll("Burgduell: %s (%lu ms)", meldung, (unsigned long)(millis() - t0));
}

/** Der Sticky zielt: probiert Kräfte, nimmt die beste, mit Streuung, die mit jedem Zug kleiner wird */
static void stickyZieht() {
    int beste = 55, w = random(35, 60), bestAbst = 9999;
    for (int k = 15; k <= 100; k++) {
        int ex, ey; int t = simuliere(1, w, k, ex, ey, false);
        int abst = t == 0 ? 0 : (t == -2 ? 9999 : abs(ex - burgX[0]));   // ins Aus zählt nie als nah
        if (abst < bestAbst) { bestAbst = abst; beste = k; }
    }
    int streu = max(2, 14 - zuege);
    winkel[1] = w; int dk = random(-streu, streu + 1); kraft[1] = constrain(beste + dk, 10, 100);
    snprintf(meldung, sizeof meldung, "%s", T("Sticky zielt ...", "Sticky aims ..."));
    hud(); zeigen(HUD_Y, H - HUD_Y);
    delay(400);
    feuer();
}

// ---- Bedienung (Wünsche aus Touch und Tasten, ausgeführt in spielLoop) -------------------------------------------------
static volatile int tippX = -1, tippY = -1, tasteWunsch = -1;

static void betreten() {
    if (!spriteBereit()) { protokoll("Burgduell: kein Speicher fürs Bild"); tone(PIN_BUZZER, 900, 120); return; }
    if (!begonnen) neueWelt();
    tippX = tippY = tasteWunsch = -1;
    allesNeu();
    zeigen(0, H, true);
}
static void taste(int i) {   // 0 = ▲ (Winkel größer), 1 = ▼
    if (vorbei || (gegenSticky && am == 1)) return;
    winkel[am] = constrain(winkel[am] + (i == 0 ? 3 : -3), 5, 85);
    feldZeichnen(); hud(); zeigen(FY, H - FY);
}
static void tipp(int x, int y) {
    if (vorbei) { neueWelt(); allesNeu(); zeigen(0, H, true); return; }
    if (drin(x, y, GX, GY, GW, GH)) { gegenSticky = !gegenSticky; hud(); zeigen(HUD_Y, H - HUD_Y); if (gegenSticky && am == 1) stickyZieht(); return; }
    auto rund = [&](int cx) { int a = x - cx, b = y - RY; return a * a + b * b <= (RR + 10) * (RR + 10); };
    if (!(gegenSticky && am == 1) && y >= HUD_Y) {   // Regler: Winkel ±5°, Pulver ±5
        int w = winkel[am], k = kraft[am];
        if (rund(WM_X)) w -= 5; else if (rund(WP_X)) w += 5; else if (rund(PM_X)) k -= 5; else if (rund(PP_X)) k += 5;
        w = constrain(w, 5, 85); k = constrain(k, 10, 100);
        if (w != winkel[am] || k != kraft[am]) {
            winkel[am] = w; kraft[am] = k;
            feldZeichnen(); hud(); zeigen(FY, H - FY);
            return;
        }
    }
    int dx = x - FEUER_X, dy = y - FEUER_Y;
    if (dx * dx + dy * dy <= (FEUER_R + 8) * (FEUER_R + 8)) {
        feuer();
        if (gegenSticky && am == 1 && !vorbei) stickyZieht();
        return;
    }
    if (y > FY && y < HUD_Y && !(gegenSticky && am == 1)) {   // zielen: Richtung und Abstand zur eigenen Kanone
        int kx, ky; kanone(am, kx, ky);
        float ddx = (x - kx) * (am == 0 ? 1 : -1), ddy = ky - y;
        winkel[am] = constrain((int)lroundf(atan2f(ddy, max(ddx, 1.0f)) * RAD_TO_DEG), 5, 85);
        kraft[am] = constrain((int)(sqrtf(ddx * ddx + ddy * ddy) / 2.6f), 10, 100);
        snprintf(meldung, sizeof meldung, "%s", T("zielt", "aiming"));
        feldZeichnen(); hud(); zeigen(FY, H - FY);
    }
}

}  // namespace burgduell

// ---- Anschluss an EDC (modus.h) -----------------------------------------------------------------------------------
static void spielBetreten() { burgduell::betreten(); seite = "spiel"; }
static bool spielAktiv() { return modus == M_APP && spielLokal && !hilfeAn; }
/** Aus sendTouch (down) */
static void spielTipp(int x, int y) { if (spielAktiv()) { burgduell::tippX = x; burgduell::tippY = y; } }
/** Aus tasteAktion (▲/▼ kurz): true, wenn das Spiel die Taste nimmt */
static bool spielTaste(int i) { if (!spielAktiv()) return false; burgduell::tasteWunsch = i; return true; }
/** Aus modusLoop */
static void spielLoop() {
    if (!spielAktiv()) { burgduell::tippX = burgduell::tasteWunsch = -1; return; }
    if (burgduell::tippX >= 0 || burgduell::tasteWunsch >= 0) letzteBedienung = millis();   // Spielen zählt: kein Rückfall nach Home
    if (burgduell::tippX >= 0) { int x = burgduell::tippX, y = burgduell::tippY; burgduell::tippX = -1; burgduell::tipp(x, y); }
    if (burgduell::tasteWunsch >= 0) { int i = burgduell::tasteWunsch; burgduell::tasteWunsch = -1; burgduell::taste(i); }
}
