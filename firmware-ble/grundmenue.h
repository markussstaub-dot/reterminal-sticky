/**
 * Grund-Menü ohne App (SPEC „DAU-Block“, FW 0.42.0): Fehlt das Menü der App (/soll/widgets/menue), baut der Sticky
 * sich selbst eins – eine Kachel je Seite der Reihe (Karussell), „Notfall“ schwarz hervorgehoben. Es ist ein normales
 * Widget (/soll/widgets/grundmenue/bild.bin + felder.txt, typ menue, knopf … gehe <i>), KI kurz auf Home öffnet es.
 * Neu gezeichnet wird nur, wenn sich die Reihe geändert hat (Zeile „sig …“ in felder.txt).
 */
static const char* gmName(int i) {
    static char n[20];
    switch (karussell[i]) {
        case M_HOME: return "Home";
        case M_NOTIZ: return T("Notiz", "Note");
        case M_HANDBUCH: return T("Handbuch", "Manual");
        case M_SPICK: return T("Spickzettel", "Cheat sheets");
        case M_BESTELL: return T("Zettel", "Lists");
        case M_KRITZEL: return T("Kritzel", "Doodle");
        case M_SCHRIFT: return T("Schrift", "Writing");
        case M_APP: return T("Spiel", "Game");
        default: break;
    }
    const char* w = kWidget[i];
    struct { const char *k, *de, *en; } namen[] = {
        {"notfall", "NOTFALL", "EMERGENCY"}, {"timer", "Timer", "Timer"}, {"wecker", "Wecker", "Alarm"},
        {"weltzeit", "Weltzeit", "World clock"}, {"waage", "Waage", "Level"}, {"lineal", "Lineal", "Ruler"},
        {"recorder", "Recorder", "Recorder"}, {"tippen", "Tippen", "Type"}, {"rechner", "Rechner", "Calculator"},
        {"umrechner", "Umrechner", "Converter"}, {"einstellungen", "Einstellung", "Settings"}};
    for (auto& x : namen) if (!strcmp(w, x.k)) return T(x.de, x.en);
    strlcpy(n, w, sizeof n);
    if (n[0] >= 'a' && n[0] <= 'z') n[0] -= 32;
    return n;
}

/** Aus karussellLaden: Grund-Menü bauen bzw. auffrischen, solange die App keins geliefert hat */
static void grundmenueBauen() {
    if (!imgBuf || sollDa("widgets/menue/felder.txt")) return;
    int idx[16], n = 0;
    uint32_t sig = 2166136261u;                             // FNV-1a über die Reihe und die Sprache
    for (int i = 0; i < kAnzahl && n < 12; i++) {
        if (karussell[i] == M_HOME || !karussellDaI(i)) continue;
        idx[n++] = i;
        const char* s = gmName(i);
        for (const char* p = s; *p; p++) { sig ^= (uint8_t)*p; sig *= 16777619u; }
        sig ^= (uint32_t)i; sig *= 16777619u;
    }
    if (!n) return;
    String alt;
    char sigZeile[24];
    snprintf(sigZeile, sizeof sigZeile, "sig %08lx", (unsigned long)sig);
    if (sollText("widgets/grundmenue/felder.txt", alt) && alt.indexOf(sigZeile) >= 0 && sollDa("widgets/grundmenue/bild.bin")) return;

    uint8_t* sicher = (uint8_t*)ps_malloc(IMG_BYTES);       // imgBuf gehört der sichtbaren Seite: sichern und zurück
    if (!sicher) return;
    memcpy(sicher, imgBuf, IMG_BYTES);
    memset(imgBuf, 0, IMG_BYTES);
    bildRechteck(0, 0, W, 56, true);
    textInsBild(T("Seiten", "Pages"), 16, 0, 300, 56, true, &FreeSansBold24pt7b);
    int sp = n <= 4 ? 2 : n <= 9 ? 3 : 4, ze = (n + sp - 1) / sp;
    int x0 = 16, y0 = 68, bw = (W - 32) / sp, bh = min(132, (H - y0 - 8) / ze);
    String felder = "typ menue\n";
    felder += sigZeile; felder += "\n";
    for (int k = 0; k < n; k++) {
        int i = idx[k];
        int x = x0 + (k % sp) * bw, y = y0 + (k / sp) * bh;
        int a = x + 6, b = y + 6, c = x + bw - 6, d = y + bh - 6;
        bool notfall = karussell[i] == M_WIDGET && !strcmp(kWidget[i], "notfall");
        if (notfall) bildRechteck(a, b, c - a, d - b, true);
        else {
            bildRechteck(a, b, c - a, 3, true); bildRechteck(a, d - 3, c - a, 3, true);
            bildRechteck(a, b, 3, d - b, true); bildRechteck(c - 3, b, 3, d - b, true);
        }
        int th = min(56, d - b - 12);
        textInsBild(gmName(i), a + 6, b + (d - b - th) / 2, c - 6, b + (d - b - th) / 2 + th, notfall, &FreeSansBold24pt7b);
        char z[48];
        snprintf(z, sizeof z, "knopf %d %d %d %d gehe %d\n", x, y, x + bw, y + bh, i);
        felder += z;
    }
    bool ok = sollSchreiben("widgets/grundmenue/bild.bin", imgBuf, IMG_BYTES) &&
              sollSchreiben("widgets/grundmenue/felder.txt", (const uint8_t*)felder.c_str(), felder.length());
    memcpy(imgBuf, sicher, IMG_BYTES);
    free(sicher);
    protokoll("Grund-Menü %s (%d Kacheln)", ok ? "gebaut" : "nicht gespeichert", n);
}
