/**
 * Rechner und Umrechner als reine Logik (SPEC „Rechner und Umrechner lokal, gekapselt“, FW 0.28.0).
 * Kein Arduino, keine Anzeige: 1:1 aus sticky-app/src/rechner.js und umrechner.js, deren Tests die Spezifikation sind.
 * Geprüft wird derselbe Code auf dem PC/Handy mit firmware-ble/test/rechner_test.cpp.
 * Tasten als UTF-8: Ziffern, „,“, „+“ „−“ „×“ „÷“, „=“, „%“, „√“, „±“, „⌫“, „C“, „M+“ „M−“ „MR“ „MC“, beim Umrechner „⇄“.
 */
#pragma once
#include <math.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

/** Zahl für die Anzeige: deutsch mit Komma, höchstens 12 Stellen, sonst wissenschaftlich (wie format() in rechner.js) */
static void rFormat(double z, char* aus, size_t n) {
    if (!isfinite(z)) { snprintf(aus, n, "Fehler"); return; }
    double r = round(z * 1e10) / 1e10;
    if (r == 0) r = 0;                                  // keine „-0“
    char t[48];
    snprintf(t, sizeof t, "%.10f", r);
    if (strchr(t, '.')) {                               // kürzeste Form wie String(r) in JS
        char* e = t + strlen(t) - 1;
        while (*e == '0') *e-- = 0;
        if (*e == '.') *e = 0;
    }
    int ziffern = 0;
    for (const char* p = t; *p; p++) if (*p >= '0' && *p <= '9') ziffern++;
    if (ziffern > 12) {                                 // wie toExponential(6): „1.234568e+3“, Exponent ohne führende Null
        char m[48];
        snprintf(m, sizeof m, "%.6e", r);
        char* e = strchr(m, 'e');
        if (e) {
            char vz = e[1];
            int ex = atoi(e + 2);
            snprintf(e, sizeof m - (e - m), "e%c%d", vz, ex);
        }
        strlcpy(t, m, sizeof t);
    }
    for (char* p = t; *p; p++) if (*p == '.') *p = ',';
    strlcpy(aus, t, n);
}

static double rWert(const char* s) {
    char t[40];
    strlcpy(t, s, sizeof t);
    for (char* p = t; *p; p++) if (*p == ',') *p = '.';
    return atof(t);
}
static bool rIstZiffer(const char* t) { return t[0] >= '0' && t[0] <= '9' && !t[1]; }
static int rStellen(const char* s) { int n = 0; for (; *s; s++) if (*s != '-' && *s != ',') n++; return n; }

// ---- Taschenrechner -------------------------------------------------------------------------------------------------
struct Rechner {
    char anzeige[40];
    double speicher;
    bool hatSpeicher;
    char op[4];          // „“ oder UTF-8 von + − × ÷
    bool neu;
    double mem;
};

static double rRechne(double a, const char* op, double b) {
    if (!strcmp(op, "+")) return a + b;
    if (!strcmp(op, "−")) return a - b;
    if (!strcmp(op, "×")) return a * b;
    if (!strcmp(op, "÷")) return b == 0 ? NAN : a / b;
    return b;
}

static void rLoeschen(Rechner& r) {
    strlcpy(r.anzeige, "0", sizeof r.anzeige);
    r.hatSpeicher = false; r.speicher = 0; r.op[0] = 0; r.neu = true;
}
static void rNeu(Rechner& r) { rLoeschen(r); r.mem = 0; }

static void rTaste(Rechner& r, const char* t) {
    if (!strcmp(r.anzeige, "Fehler") && strcmp(t, "C")) rLoeschen(r);
    double w = rWert(r.anzeige);
    if (rIstZiffer(t)) {
        if (r.neu || !strcmp(r.anzeige, "0")) { strlcpy(r.anzeige, t, sizeof r.anzeige); r.neu = false; }
        else if (rStellen(r.anzeige) < 12) strlcat(r.anzeige, t, sizeof r.anzeige);
    } else if (!strcmp(t, ",")) {
        if (r.neu) { strlcpy(r.anzeige, "0,", sizeof r.anzeige); r.neu = false; }
        else if (!strchr(r.anzeige, ',')) strlcat(r.anzeige, ",", sizeof r.anzeige);
    } else if (!strcmp(t, "C")) {
        rLoeschen(r);
    } else if (!strcmp(t, "⌫")) {
        if (!r.neu) {
            size_t n = strlen(r.anzeige);
            if (n > 1 && strcmp(r.anzeige, "-0")) { r.anzeige[n - 1] = 0; if (!strcmp(r.anzeige, "-")) strlcpy(r.anzeige, "0", sizeof r.anzeige); }
            else strlcpy(r.anzeige, "0", sizeof r.anzeige);
        }
    } else if (!strcmp(t, "±")) {
        if (strcmp(r.anzeige, "0")) {
            if (r.anzeige[0] == '-') memmove(r.anzeige, r.anzeige + 1, strlen(r.anzeige));
            else { char t2[40]; snprintf(t2, sizeof t2, "-%s", r.anzeige); strlcpy(r.anzeige, t2, sizeof r.anzeige); }
        }
    } else if (!strcmp(t, "%")) {   // wie Braun: Ergebnis sofort, Aufschlag und Rabatt in einem Schritt
        double a = r.speicher, b = w, e;
        if (!r.op[0]) e = b / 100;
        else if (!strcmp(r.op, "×")) e = a * b / 100;
        else if (!strcmp(r.op, "+")) e = a + a * b / 100;
        else if (!strcmp(r.op, "−")) e = a - a * b / 100;
        else e = a / b * 100;
        rFormat(e, r.anzeige, sizeof r.anzeige);
        r.hatSpeicher = false; r.op[0] = 0; r.neu = true;
    } else if (!strcmp(t, "√")) {
        rFormat(w < 0 ? NAN : sqrt(w), r.anzeige, sizeof r.anzeige);
        r.neu = true;
    } else if (!strcmp(t, "M+") || !strcmp(t, "M−")) {   // laufende Rechnung abschließen, Ergebnis in den Speicher
        if (r.op[0]) rTaste(r, "=");
        double v = rWert(r.anzeige);
        r.mem += !strcmp(t, "M+") ? v : -v;
        r.neu = true;
    } else if (!strcmp(t, "MR")) {
        rFormat(r.mem, r.anzeige, sizeof r.anzeige);
        r.neu = true;
    } else if (!strcmp(t, "MC")) {
        r.mem = 0;
    } else if (!strcmp(t, "+") || !strcmp(t, "−") || !strcmp(t, "×") || !strcmp(t, "÷")) {
        if (r.op[0] && !r.neu) { r.speicher = rRechne(r.speicher, r.op, w); rFormat(r.speicher, r.anzeige, sizeof r.anzeige); }
        else if (!r.op[0]) { r.speicher = w; r.hatSpeicher = true; }
        strlcpy(r.op, t, sizeof r.op);
        r.neu = true;
    } else if (!strcmp(t, "=")) {
        if (r.op[0]) {
            rFormat(rRechne(r.speicher, r.op, w), r.anzeige, sizeof r.anzeige);
            r.hatSpeicher = false; r.op[0] = 0; r.neu = true;
        }
    }
}

// ---- Umrechner ------------------------------------------------------------------------------------------------------
// Paare als y = a · x + b (Länge, Gewicht … b = 0; °C → °F a = 1,8, b = 32), die Richtung dreht ⇄
struct UPaar { char von[8], nach[8]; double a, b; };
struct Umrechner {
    UPaar paare[12];
    int anzahl, paar;
    bool umgedreht, neu;
    char eingabe[24];
};

static void uNeu(Umrechner& u) { u.anzahl = 0; u.paar = 0; u.umgedreht = false; u.neu = false; strlcpy(u.eingabe, "0", sizeof u.eingabe); }
static const char* uVon(const Umrechner& u) { return u.umgedreht ? u.paare[u.paar].nach : u.paare[u.paar].von; }
static const char* uNach(const Umrechner& u) { return u.umgedreht ? u.paare[u.paar].von : u.paare[u.paar].nach; }

static void uErgebnis(const Umrechner& u, char* aus, size_t n) {
    if (!u.anzahl) { snprintf(aus, n, "Fehler"); return; }
    double x = rWert(u.eingabe);
    const UPaar& p = u.paare[u.paar];
    double y = u.umgedreht ? (x - p.b) / p.a : x * p.a + p.b;
    rFormat(round(y * 100) / 100, aus, n);
}

static void uWaehle(Umrechner& u, int i) { if (i >= 0 && i < u.anzahl) { u.paar = i; u.umgedreht = false; } }

static void uTaste(Umrechner& u, const char* t) {
    if (u.neu && (rIstZiffer(t) || !strcmp(t, ","))) { strlcpy(u.eingabe, "0", sizeof u.eingabe); u.neu = false; }   // nach ⇄ neu beginnen
    if (strcmp(t, "⇄")) u.neu = false;
    if (rIstZiffer(t)) {
        if (!strcmp(u.eingabe, "0")) strlcpy(u.eingabe, t, sizeof u.eingabe);
        else if (rStellen(u.eingabe) < 9) strlcat(u.eingabe, t, sizeof u.eingabe);
    } else if (!strcmp(t, ",")) {
        if (!strchr(u.eingabe, ',')) strlcat(u.eingabe, ",", sizeof u.eingabe);
    } else if (!strcmp(t, "⌫")) {
        size_t n = strlen(u.eingabe);
        if (n > 1 && strcmp(u.eingabe, "-0")) { u.eingabe[n - 1] = 0; if (!strcmp(u.eingabe, "-")) strlcpy(u.eingabe, "0", sizeof u.eingabe); }
        else strlcpy(u.eingabe, "0", sizeof u.eingabe);
    } else if (!strcmp(t, "C")) {
        strlcpy(u.eingabe, "0", sizeof u.eingabe);
    } else if (!strcmp(t, "±")) {
        if (strcmp(u.eingabe, "0")) {
            if (u.eingabe[0] == '-') memmove(u.eingabe, u.eingabe + 1, strlen(u.eingabe));
            else { char t2[24]; snprintf(t2, sizeof t2, "-%s", u.eingabe); strlcpy(u.eingabe, t2, sizeof u.eingabe); }
        }
    } else if (!strcmp(t, "⇄")) {   // Richtung tauschen, das Ergebnis wird zur neuen Eingabe
        char e[40];
        uErgebnis(u, e, sizeof e);
        u.umgedreht = !u.umgedreht;
        if (strcmp(e, "Fehler")) strlcpy(u.eingabe, e, sizeof u.eingabe);
        u.neu = true;
    }
}

/** Anzeige des Umrechners: „12,5 km = 7,77 mi“ */
static void uAnzeige(const Umrechner& u, char* aus, size_t n) {
    char e[40];
    uErgebnis(u, e, sizeof e);
    if (!u.anzahl) { snprintf(aus, n, "Fehler"); return; }
    snprintf(aus, n, "%s %s = %s %s", u.eingabe, uVon(u), e, uNach(u));
}
