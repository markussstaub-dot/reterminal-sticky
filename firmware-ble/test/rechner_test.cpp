// Tests für rechner.h: dieselben Fälle wie sticky-app/tests/rechner.test.js und umrechner.test.js.
// Bauen und laufen lassen (auf dem Fold, mit dem NDK des Android-SDK): firmware-ble/test/laufen.sh
#include "../rechner.h"
#include <stdio.h>

static int fehler = 0, faelle = 0;
static void gleich(const char* ist, const char* soll, const char* was) {
    faelle++;
    if (strcmp(ist, soll)) { fehler++; printf("FEHLER %s: „%s“ statt „%s“\n", was, ist, soll); }
}
static const char* tippe(const char* folge[], int n) {
    static Rechner r;
    rNeu(r);
    for (int i = 0; i < n; i++) rTaste(r, folge[i]);
    return r.anzeige;
}
#define T(erwartet, ...) do { const char* f[] = {__VA_ARGS__}; gleich(tippe(f, sizeof f / sizeof *f), erwartet, #__VA_ARGS__); } while (0)

static void paareSetzen(Umrechner& u) {
    uNeu(u);
    const UPaar p[] = { {"km", "mi", 0.621371, 0}, {"m", "ft", 3.28084, 0}, {"cm", "in", 0.393701, 0}, {"km/h", "mph", 0.621371, 0},
                        {"°C", "°F", 1.8, 32}, {"kg", "lb", 2.20462, 0}, {"l", "gal", 0.264172, 0}, {"bar", "psi", 14.5038, 0} };
    for (const UPaar& x : p) u.paare[u.anzahl++] = x;
}
static Umrechner mit(int paar, const char* folge[], int n) {
    Umrechner u;
    paareSetzen(u);
    uWaehle(u, paar);
    for (int i = 0; i < n; i++) uTaste(u, folge[i]);
    return u;
}
#define U(paar, erwartet, ...) do { const char* f[] = {__VA_ARGS__}; Umrechner u = mit(paar, f, sizeof f / sizeof *f); char e[40]; uErgebnis(u, e, sizeof e); gleich(e, erwartet, #__VA_ARGS__); } while (0)

int main() {
    // rechner.test.js
    T("15", "1", "2", "+", "3", "=");
    T("3,5", "7", "÷", "2", "=");
    T("0,3", "0", ",", "1", "+", "0", ",", "2", "=");
    T("42", "6", "×", "7", "=");
    T("20", "2", "+", "3", "×", "4", "=");
    T("5", "9", "+", "−", "4", "=");
    T("0,5", "5", "0", "%");
    T("3", "9", "√");
    T("12", "1", "2", "3", "⌫");
    T("-4", "4", "±");
    T("Fehler", "1", "÷", "0", "=");
    T("5", "1", "÷", "0", "=", "5");
    T("0", "8", "C");
    T("8,8", "8", "0", "×", "1", "1", "%");
    T("88,8", "8", "0", "+", "1", "1", "%");
    T("71,2", "8", "0", "−", "1", "1", "%");
    {   // Speicher wie beim Braun
        Rechner r; rNeu(r);
        const char* a[] = {"8", "0", "×", "2", "0", "M+"}; for (auto t : a) rTaste(r, t);
        gleich(r.anzeige, "1600", "M+"); char m[40]; rFormat(r.mem, m, sizeof m); gleich(m, "1600", "mem");
        const char* b[] = {"8", "0", "×", "5", "M−"}; for (auto t : b) rTaste(r, t);
        rFormat(r.mem, m, sizeof m); gleich(m, "1200", "M−");
        rTaste(r, "C"); rTaste(r, "MR"); gleich(r.anzeige, "1200", "MR");
        rTaste(r, "MC"); rFormat(r.mem, m, sizeof m); gleich(m, "0", "MC");
    }
    char z[40];
    rFormat(1.0 / 3, z, sizeof z); gleich(z, "0,3333333333", "1/3");
    rFormat(1e15, z, sizeof z); gleich(z, "1,000000e+15", "1e15");
    rFormat(1234.567891234, z, sizeof z); gleich(z, "1,234568e+3", "e+3 ohne Null");
    // umrechner.test.js
    U(0, "62,14", "1", "0", "0");
    U(4, "68", "2", "0");
    U(4, "-40", "4", "0", "±");
    U(7, "31,91", "2", ",", "2");
    U(5, "176,37", "8", "0");
    {
        const char* f[] = {"1", "0", "⇄"}; Umrechner u = mit(0, f, 3);
        gleich(uVon(u), "mi", "⇄ von"); gleich(u.eingabe, "6,21", "⇄ Eingabe");
        char e[40]; uErgebnis(u, e, sizeof e); gleich(e, "9,99", "⇄ Ergebnis");
    }
    U(4, "37", "⇄", "9", "8", ",", "6");
    {
        const char* a[] = {"1", "2", "⌫"}; gleich(mit(0, a, 3).eingabe, "1", "⌫");
        const char* b[] = {"1", ",", ",", "5"}; gleich(mit(0, b, 4).eingabe, "1,5", "Komma");
        const char* c[] = {"5", "C"}; gleich(mit(0, c, 2).eingabe, "0", "C");
        const char* d[] = {"9", "9", "9", "9", "9", "9", "9", "9", "9", "9", "9", "9"};
        char n[8]; snprintf(n, sizeof n, "%d", (int)strlen(mit(0, d, 12).eingabe)); gleich(n, "9", "Länge");
        Umrechner u = mit(0, a, 0); char s[64]; uAnzeige(u, s, sizeof s); gleich(s, "0 km = 0 mi", "Anzeige");
    }
    printf("%d Fälle, %d Fehler\n", faelle, fehler);
    return fehler ? 1 : 0;
}
