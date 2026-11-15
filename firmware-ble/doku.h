/**
 * Dokumente (SPEC „Dokumente: App-Reiter als Dokumenten-Manager, Handbuch und Spickzettel getrennt“, FW 0.38.0):
 * ein allgemeiner Viewer für zwei Seiten im Karussell, beide ohne Handy lesbar, alles auf der SD-Karte. Die App rendert
 * die Bilder; der Sticky blättert, merkt sich, wo man war, und schreibt nur Seitenzahlen selbst ins Bild.
 *
 *   Handbuch   (M_HANDBUCH) /soll/doku/<name>/   ein Ordner je Dokument; neues Handbuch = neuer Ordner, kein Flashen
 *   Spickzettel (M_SPICK)   /soll/spick/          eine Karte je Bildschirm, links die Titel-Liste, rechts die Karte
 *
 * Ordner eines Dokuments: NN.bin (Bildschirme 800 × 480, 1 bpp, %02d) und index.txt:
 *   seiten=N            Anzahl Bildschirme
 *   toc=K               Inhaltsverzeichnis (−1 = keins)
 *   pdf=a,b,c…          PDF-Seite je Bildschirm (für „S. n“ in Bibliothek und Lesezeichen; fehlt = Bildschirm + 1)
 *   f s x0 y0 x1 y1 z   Feld auf Bildschirm s → Bildschirm z (Inhaltsverzeichnis, Titel-Liste der Spickzettel)
 *   e x0 y0 x1 y1 z     wie „f <toc> …“ (Format des alten Bordbuchs)
 *   g s x0 y0 x1 y1 i   Feld auf Bildschirm s (−1 = alle) → Karussell-Eintrag i (Reiter der Gruppe „Nachschlagen“)
 *   lz x0 y0 x1 y1      Lesezeichen-Feld im Inhaltsverzeichnis: der Sticky schreibt „S. n“ hinein, Tippen = dorthin
 * Bibliothek: /soll/doku/bibliothek.bin + bibliothek.txt, je Kachel „d x0 y0 x1 y1 <name>“ (unten in der Kachel schreibt
 *   der Sticky „S. n / m“, die zuletzt gelesene bekommt einen dicken Rahmen), dazu „g …“ für die Reiter. Ohne Bibliothek
 *   oder mit nur einem Dokument geht es gleich ins Inhaltsverzeichnis.
 * Gelesen: /ist/doku.txt (schreibt nur der Sticky): „<name> <bildschirm> <lesezeichen>“ je Dokument, „zuletzt <name>“,
 *   „spick <karte>“.
 * Sprung aus der App (Suche am Fold): /soll/doku/sprung.txt „<name> <bildschirm>“ → der Sticky öffnet dort.
 *
 * Bedienung Handbuch: Bibliothek → Tippen auf eine Kachel = Dokument auf der letzten Seite (neu: Inhaltsverzeichnis).
 *   ▲/▼ kurz blättern (an den Enden weiter im Karussell) · Tippen auf eine Seite = Inhaltsverzeichnis ·
 *   ▲ 1 s auf einer Seite = Lesezeichen · ▲ 1 s im Inhaltsverzeichnis = Bibliothek (ein Dokument: voriger Eintrag)
 * Spickzettel: Tippen auf einen Titel = diese Karte · ▲/▼ nächste Karte · ▲ 1 s = erste Karte, dort voriger Eintrag.
 *
 * Abgelöst: bordbuch.h (Bordbuch bis FW 0.37.0). Beim ersten Start zieht /soll/bordbuch nach /soll/doku/microlino
 * (ablage.h sollUmzug); „bordbuch“ in karussell.txt heißt jetzt Handbuch.
 */

static const int DOK_MAX = 8;              // Dokumente in der Bibliothek
static const int FELD_MAX = 1024;          // Felder je Ordner (Spickzettel: Titel-Liste auf jeder Karte)
static const int SEITEN_MAX = 1000;        // Bildschirme je Dokument

struct DokFeld { int16_t s, x0, y0, x1, y1, ziel; uint8_t art; };   // art 0 = Bildschirm, 1 = Karussell-Eintrag
struct Ansicht {
    char ordner[40] = "";      // relativ zu /soll: „doku/microlino“ bzw. „spick“
    char name[24] = "";
    int seiten = 0, toc = -1, aktuell = 0;
    DokFeld* felder = nullptr;
    int nFelder = 0;
    uint16_t* pdf = nullptr;
    bool lzDa = false;
    int16_t lz[4] = {0, 0, 0, 0};
};
static Ansicht hb, sp;                     // Handbuch (ein Dokument offen) und Spickzettel
static bool hbBib = false;                 // Handbuch zeigt gerade die Bibliothek
static bool bibBild = false;               // bibliothek.bin liegt auf der Karte

struct Kachel { int16_t x0, y0, x1, y1; char name[24]; };
static Kachel bibK[DOK_MAX];
static DokFeld bibG[8];
static int bibN = 0, bibGN = 0;
static char dokNamen[DOK_MAX][24];         // Dokumente auf der Karte (Ordner mit index.txt)
static int dokN = 0;

// gelesen: Bildschirm und Lesezeichen je Dokument (−1 = keins)
struct Gelesen { char name[24]; int16_t seite, lz; };
static Gelesen gel[DOK_MAX + 4];
static int gelN = 0;
static char zuletzt[24] = "";
static int spickZuletzt = 0;

// Wünsche aus Touch/BLE, umgesetzt in dokuLoop() bzw. setzeModus() (Display und Karte nur aus loop())
static volatile int hbWunsch = -1;         // Bildschirm im offenen Dokument
static volatile int spWunsch = -1;         // Karte
static volatile int dokWunschBib = 0;      // 1 = Bibliothek zeigen
static char dokWunschName[24] = "";        // Dokument öffnen (mit hbWunsch oder −1 = letzte Seite)
static volatile bool dokWunschDa = false;
static uint8_t* dokBuf = nullptr;

// aus modus.h (dort definiert, doku.h steht davor)
static bool hilfeOffen();
static void seiteNeuZeichnen();
static void modusWuenschen(int m);

static bool dokNameOk(const char* n) { return n[0] && !strchr(n, '/') && !strstr(n, "..") && strlen(n) < 24; }

// ---- Gelesen (/ist/doku.txt) -------------------------------------------------------------------------------
static Gelesen* gelesenVon(const char* name, bool anlegen) {
    for (int i = 0; i < gelN; i++) if (!strcmp(gel[i].name, name)) return &gel[i];
    if (!anlegen) return nullptr;
    if (gelN >= (int)(sizeof gel / sizeof gel[0])) { memmove(gel, gel + 1, sizeof gel - sizeof gel[0]); gelN--; }
    Gelesen* g = &gel[gelN++];
    strlcpy(g->name, name, sizeof g->name);
    g->seite = -1; g->lz = -1;
    return g;
}

static void gelesenLaden() {
    gelN = 0; zuletzt[0] = 0; spickZuletzt = 0;
    if (!sdEin()) return;
    File f = SD.open("/ist/doku.txt", FILE_READ);
    if (!f) return;
    while (f.available()) {
        String z = f.readStringUntil('\n');
        char a[24];
        int s, l;
        if (sscanf(z.c_str(), "zuletzt %23s", a) == 1) strlcpy(zuletzt, a, sizeof zuletzt);
        else if (sscanf(z.c_str(), "spick %d", &s) == 1) spickZuletzt = max(0, s);
        else if (sscanf(z.c_str(), "%23s %d %d", a, &s, &l) == 3) { Gelesen* g = gelesenVon(a, true); g->seite = s; g->lz = l; }
    }
    f.close();
}

static void gelesenSichern() {
    if (!sdEin()) return;
    SD.mkdir("/ist");
    File f = SD.open("/ist/doku.txt", FILE_WRITE);
    if (!f) return;
    for (int i = 0; i < gelN; i++) f.printf("%s %d %d\n", gel[i].name, gel[i].seite, gel[i].lz);
    if (zuletzt[0]) f.printf("zuletzt %s\n", zuletzt);
    f.printf("spick %d\n", spickZuletzt);
    f.close();
}

// ---- Index lesen -----------------------------------------------------------------------------------------------
static void ansichtLaden(Ansicht& a, const char* ordner, const char* name) {
    if (!a.felder) a.felder = (DokFeld*)ps_malloc(FELD_MAX * sizeof(DokFeld));
    if (!a.pdf) a.pdf = (uint16_t*)ps_malloc(SEITEN_MAX * sizeof(uint16_t));
    strlcpy(a.ordner, ordner, sizeof a.ordner);
    strlcpy(a.name, name, sizeof a.name);
    a.seiten = 0; a.toc = -1; a.nFelder = 0; a.lzDa = false;
    if (a.pdf) memset(a.pdf, 0, SEITEN_MAX * sizeof(uint16_t));
    char rel[64];
    snprintf(rel, sizeof rel, "%s/index.txt", ordner);
    File f = sollOeffnen(rel);
    if (!f) return;
    while (f.available()) {
        String z = f.readStringUntil('\n');
        z.trim();
        const char* c = z.c_str();
        int s, x0, y0, x1, y1, ziel;
        if (z.startsWith("seiten=")) a.seiten = min(SEITEN_MAX, (int)z.substring(7).toInt());
        else if (z.startsWith("toc=")) a.toc = z.substring(4).toInt();
        else if (z.startsWith("pdf=") && a.pdf) {
            int i = 0;
            for (const char* p = c + 4; *p && i < SEITEN_MAX; i++) { a.pdf[i] = atoi(p); p = strchr(p, ','); if (!p) break; p++; }
        } else if (a.felder && a.nFelder < FELD_MAX && !strncmp(c, "f ", 2) && sscanf(c + 2, "%d %d %d %d %d %d", &s, &x0, &y0, &x1, &y1, &ziel) == 6)
            a.felder[a.nFelder++] = {(int16_t)s, (int16_t)x0, (int16_t)y0, (int16_t)x1, (int16_t)y1, (int16_t)ziel, 0};
        else if (a.felder && a.nFelder < FELD_MAX && !strncmp(c, "g ", 2) && sscanf(c + 2, "%d %d %d %d %d %d", &s, &x0, &y0, &x1, &y1, &ziel) == 6)
            a.felder[a.nFelder++] = {(int16_t)s, (int16_t)x0, (int16_t)y0, (int16_t)x1, (int16_t)y1, (int16_t)ziel, 1};
        else if (a.felder && a.nFelder < FELD_MAX && !strncmp(c, "e ", 2) && sscanf(c + 2, "%d %d %d %d %d", &x0, &y0, &x1, &y1, &ziel) == 5)
            a.felder[a.nFelder++] = {-2, (int16_t)x0, (int16_t)y0, (int16_t)x1, (int16_t)y1, (int16_t)ziel, 0};   // −2 = Inhaltsverzeichnis
        else if (!strncmp(c, "lz ", 3) && sscanf(c + 3, "%d %d %d %d", &x0, &y0, &x1, &y1) == 4) {
            a.lzDa = true; a.lz[0] = x0; a.lz[1] = y0; a.lz[2] = x1; a.lz[3] = y1;
        }
    }
    f.close();
    for (int i = 0; i < a.nFelder; i++) if (a.felder[i].s == -2) a.felder[i].s = a.toc;
    if (a.aktuell >= a.seiten) a.aktuell = 0;
}

/** PDF-Seite (für die Anzeige) zum Bildschirm n */
static int pdfSeite(const Ansicht& a, int n) { return a.pdf && n >= 0 && n < SEITEN_MAX && a.pdf[n] ? a.pdf[n] : n + 1; }

/** Dokumente auf der Karte: aus der Bibliothek, sonst die Ordner unter /soll/doku mit index.txt */
static void dokListeLaden() {
    dokN = 0; bibN = 0; bibGN = 0;
    bibBild = sollDa("doku/bibliothek.bin");
    File f = sollOeffnen("doku/bibliothek.txt");
    const bool hatListe = (bool)f;   // FW 0.39.1: leere Liste = alles ausgeblendet, nicht „Ordner durchsuchen“
    if (f) {
        while (f.available()) {
            String z = f.readStringUntil('\n');
            z.trim();
            int s, x0, y0, x1, y1, i;
            char n[24];
            if (bibN < DOK_MAX && sscanf(z.c_str(), "d %d %d %d %d %23s", &x0, &y0, &x1, &y1, n) == 5 && dokNameOk(n)) {
                char rel[64];
                snprintf(rel, sizeof rel, "doku/%s/index.txt", n);
                if (!sollDa(rel)) continue;   // noch nicht (ganz) aufgespielt
                bibK[bibN] = {(int16_t)x0, (int16_t)y0, (int16_t)x1, (int16_t)y1, ""};
                strlcpy(bibK[bibN++].name, n, 24);
                strlcpy(dokNamen[dokN++], n, 24);
            } else if (bibGN < 8 && sscanf(z.c_str(), "g %d %d %d %d %d %d", &s, &x0, &y0, &x1, &y1, &i) == 6)
                bibG[bibGN++] = {(int16_t)s, (int16_t)x0, (int16_t)y0, (int16_t)x1, (int16_t)y1, (int16_t)i, 1};
        }
        f.close();
    }
    if (!dokN && !hatListe && sdEin()) {
        File d = SD.open("/soll/doku");
        if (d && d.isDirectory())
            for (File e = d.openNextFile(); e && dokN < DOK_MAX; e = d.openNextFile()) {
                if (!e.isDirectory() || !dokNameOk(e.name())) continue;
                char p[72];
                snprintf(p, sizeof p, "/soll/doku/%s/index.txt", e.name());
                if (SD.exists(p)) strlcpy(dokNamen[dokN++], e.name(), 24);
            }
        bibN = 0;   // ohne bibliothek.txt keine Kacheln
    }
    Serial.printf("Handbuch: %d Dokumente%s\n", dokN, bibBild ? ", Bibliothek" : "");
}

static void spickLaden() {
    ansichtLaden(sp, "spick", "spick");
    if (spickZuletzt < sp.seiten) sp.aktuell = spickZuletzt;
    Serial.printf("Spickzettel: %d Karten\n", sp.seiten);
}

/** Dokument öffnen (Index laden); seite −1 = wo man war, sonst Inhaltsverzeichnis */
static bool hbLaden(const char* name) {
    char ordner[40];
    snprintf(ordner, sizeof ordner, "doku/%s", name);
    if (strcmp(hb.ordner, ordner)) ansichtLaden(hb, ordner, name);
    return hb.seiten > 0;
}

// ---- Zeichnen ------------------------------------------------------------------------------------------------
static void bildRechteck(int x, int y, int w, int h, bool schwarz);
/** ASCII-Text in imgBuf schreiben (Feld in Display-Koordinaten; die Bibliothek kann kein 1-bpp-Sprite, darum 8 bpp) */
static void textInsBild(const char* text, int x0, int y0, int x1, int y1, bool schwarzerGrund) {
    static Seeed_Sprite spr;
    const int w = min(x1 - x0, 400), h = min(y1 - y0, 56);
    if (w <= 0 || h <= 0) return;
    if (!spr.created() || spr.width() != w || spr.height() != h) {
        spr.deleteSprite();
        spr.setColorDepth(8);
        if (!spr.createSprite(&display, w, h)) return;
    }
    spr.fillScreen(schwarzerGrund ? TFT_BLACK : TFT_WHITE);
    spr.setTextColor(schwarzerGrund ? TFT_WHITE : TFT_BLACK);
    spr.setTextDatum(MC_DATUM);
    spr.setFreeFont(&FreeSans12pt7b);
    spr.drawString(text, w / 2, h / 2);
    spr.setFreeFont(nullptr);
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++) {
            int px = x0 + x, py = y0 + y;
            if (px < 0 || px >= W || py < 0 || py >= H) continue;
            uint8_t& b = imgBuf[py * (W / 8) + px / 8];
            uint8_t m = 0x80 >> (px & 7);
            if (spr.readPixel(x, y) < 0x8000) b |= m; else b &= ~m;   // dunkel = Bit 1 = schwarz
        }
}

static void dokZeigenFertig(const char* was) {
    statusPruefen(false, true);   // Statuszeile ins Bild
    bildZeigen(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    uint32_t t0 = millis();
    display.update();             // wie im alten Bordbuch: update() statt updateFast() (schneller Modus zeigte Falsches)
    Serial.printf("%s in %lu ms\n", was, (unsigned long)(millis() - t0));
}

static void hbMeldeSeite() {
    char j[112];
    snprintf(j, sizeof j, "{\"t\":\"seite\",\"d\":\"%s\",\"n\":%d,\"von\":%d,\"bib\":%d}", hbBib ? "" : hb.name, hbBib ? -1 : hb.aktuell, hbBib ? dokN : hb.seiten, hbBib ? 1 : 0);
    sendEvt(j);
}

static void bibZeigen() {
    if (!sollLesen("doku/bibliothek.bin", imgBuf, IMG_BYTES)) { bibBild = false; return; }
    hbBib = true;
    for (int i = 0; i < bibN; i++) {
        const Kachel& k = bibK[i];
        Gelesen* g = gelesenVon(k.name, false);
        char t[32] = "";
        if (g && g->seite >= 0) {
            char ordner[40];
            snprintf(ordner, sizeof ordner, "doku/%s", k.name);
            Ansicht a;   // nur für die PDF-Seiten: kurz laden
            if (!strcmp(hb.ordner, ordner)) snprintf(t, sizeof t, EN ? "p. %d / %d" : "S. %d / %d", pdfSeite(hb, g->seite), pdfSeite(hb, hb.seiten - 1));
            else {
                ansichtLaden(a, ordner, k.name);
                snprintf(t, sizeof t, EN ? "p. %d / %d" : "S. %d / %d", pdfSeite(a, g->seite), pdfSeite(a, a.seiten - 1));
                free(a.felder); free(a.pdf);
            }
        }
        if (t[0]) textInsBild(t, k.x0 + 10, k.y1 - 52, k.x1 - 10, k.y1 - 12, false);
        if (!strcmp(k.name, zuletzt)) {   // zuletzt gelesenes: dicker Rahmen
            bildRechteck(k.x0, k.y0, k.x1 - k.x0, 6, true);
            bildRechteck(k.x0, k.y1 - 6, k.x1 - k.x0, 6, true);
            bildRechteck(k.x0, k.y0, 6, k.y1 - k.y0, true);
            bildRechteck(k.x1 - 6, k.y0, 6, k.y1 - k.y0, true);
        }
    }
    dokZeigenFertig("Bibliothek");
    protokoll("Handbuch: Bibliothek (%d Dokumente)", dokN);
    hbMeldeSeite();
}

static void hbZeige(int n) {
    if (hb.seiten <= 0) return;
    n = constrain(n, 0, hb.seiten - 1);
    char rel[72];
    snprintf(rel, sizeof rel, "%s/%02d.bin", hb.ordner, n);
    if (!sollLesen(rel, imgBuf, IMG_BYTES)) { Serial.printf("Handbuch: %s fehlt\n", rel); tone(PIN_BUZZER, 900, 120); return; }
    hbBib = false;
    hb.aktuell = n;
    Gelesen* g = gelesenVon(hb.name, true);
    if (n == hb.toc && hb.lzDa) {
        char t[40];
        if (g->lz >= 0) snprintf(t, sizeof t, EN ? "Bookmark  p. %d" : "Lesezeichen  S. %d", pdfSeite(hb, g->lz));
        else snprintf(t, sizeof t, "%s", EN ? "no bookmark (hold up 1 s)" : "kein Lesezeichen (hoch 1 s)");
        textInsBild(t, hb.lz[0], hb.lz[1], hb.lz[2], hb.lz[3], g->lz >= 0);
    }
    if (n != hb.toc) g->seite = n;
    if (strcmp(zuletzt, hb.name) || n != hb.toc) { strlcpy(zuletzt, hb.name, sizeof zuletzt); gelesenSichern(); }
    dokZeigenFertig("Handbuch-Seite");
    protokoll("Handbuch %s: Bildschirm %d von %d", hb.name, n + 1, hb.seiten);
    hbMeldeSeite();
}

static void spZeige(int n) {
    if (sp.seiten <= 0) return;
    n = constrain(n, 0, sp.seiten - 1);
    char rel[24];
    snprintf(rel, sizeof rel, "spick/%02d.bin", n);
    if (!sollLesen(rel, imgBuf, IMG_BYTES)) { tone(PIN_BUZZER, 900, 120); return; }
    sp.aktuell = n;
    if (spickZuletzt != n) { spickZuletzt = n; gelesenSichern(); }
    dokZeigenFertig("Spickzettel");
    protokoll("Spickzettel: Karte %d von %d", n + 1, sp.seiten);
    char j[64];
    snprintf(j, sizeof j, "{\"t\":\"spick\",\"n\":%d,\"von\":%d}", n, sp.seiten);
    sendEvt(j);
}

/** Beim Wechsel ins Handbuch: Sprung aus der App, sonst Bibliothek (mehrere Dokumente) bzw. Inhaltsverzeichnis */
static void hbBetreten() {
    if (dokWunschDa) {
        dokWunschDa = false;
        if (hbLaden(dokWunschName)) {
            Gelesen* g = gelesenVon(hb.name, false);
            int n = hbWunsch >= 0 ? hbWunsch : g && g->seite >= 0 ? g->seite : max(0, hb.toc);
            hbWunsch = -1;
            hbZeige(n);
            return;
        }
    }
    if (hbWunsch >= 0 && hb.seiten > 0) { int n = hbWunsch; hbWunsch = -1; hbZeige(n); return; }   // Fernbedienung im offenen Dokument
    if (dokN > 1 && bibBild && bibN > 1) { bibZeigen(); return; }
    if (!dokN) return;
    if (!hb.seiten || strncmp(hb.ordner, "doku/", 5)) hbLaden(dokNamen[0]);
    hbZeige(hb.toc >= 0 ? hb.toc : 0);
}

// ---- Bedienung -------------------------------------------------------------------------------------------------
static bool imFeld(int x, int y, int x0, int y0, int x1, int y1) { return x >= x0 && x < x1 && y >= y0 && y < y1; }

/** Getroffenes Feld der gezeigten Seite (für den Rahmen beim Tippen); false = keins */
static bool dokTreffer(int x, int y, int& x0, int& y0, int& x1, int& y1) {
    auto nimm = [&](int a, int b, int c, int d) { x0 = a; y0 = b; x1 = c; y1 = d; return true; };
    if (modus == M_HANDBUCH && hbBib) {
        for (int i = 0; i < bibN; i++) if (imFeld(x, y, bibK[i].x0, bibK[i].y0, bibK[i].x1, bibK[i].y1)) return nimm(bibK[i].x0, bibK[i].y0, bibK[i].x1, bibK[i].y1);
        for (int i = 0; i < bibGN; i++) if (imFeld(x, y, bibG[i].x0, bibG[i].y0, bibG[i].x1, bibG[i].y1)) return nimm(bibG[i].x0, bibG[i].y0, bibG[i].x1, bibG[i].y1);
        return false;
    }
    Ansicht* a = modus == M_HANDBUCH ? &hb : modus == M_SPICK ? &sp : nullptr;
    if (!a) return false;
    if (a == &hb && hb.aktuell == hb.toc && hb.lzDa && imFeld(x, y, hb.lz[0], hb.lz[1], hb.lz[2], hb.lz[3])) return nimm(hb.lz[0], hb.lz[1], hb.lz[2], hb.lz[3]);
    for (int i = 0; i < a->nFelder; i++) {
        const DokFeld& f = a->felder[i];
        if ((f.s == a->aktuell || f.s == -1) && imFeld(x, y, f.x0, f.y0, f.x1, f.y1)) return nimm(f.x0, f.y0, f.x1, f.y1);
    }
    return false;
}

/** Kennung der gezeigten Dokumentseite (Rahmen beim Tippen: nur zurückmalen, wenn sie noch steht) */
static int dokKennung() { return modus == M_HANDBUCH ? (hbBib ? -2 : hb.aktuell) : modus == M_SPICK ? sp.aktuell : 0; }

static void karussellGehe(int i);
/** Touch (aus sendTouch, „down“) */
static void dokTouch(int x, int y) {
    if (hilfeOffen()) return;
    if (modus == M_HANDBUCH && hbBib) {
        for (int i = 0; i < bibN; i++)
            if (imFeld(x, y, bibK[i].x0, bibK[i].y0, bibK[i].x1, bibK[i].y1)) {
                strlcpy(dokWunschName, bibK[i].name, sizeof dokWunschName);
                hbWunsch = -1;
                dokWunschDa = true;
                return;
            }
        for (int i = 0; i < bibGN; i++) if (imFeld(x, y, bibG[i].x0, bibG[i].y0, bibG[i].x1, bibG[i].y1)) { karussellGehe(bibG[i].ziel); return; }
        return;
    }
    Ansicht* a = modus == M_HANDBUCH ? &hb : modus == M_SPICK ? &sp : nullptr;
    if (!a || a->seiten <= 0) return;
    for (int i = 0; i < a->nFelder; i++) {
        const DokFeld& f = a->felder[i];
        if ((f.s != a->aktuell && f.s != -1) || !imFeld(x, y, f.x0, f.y0, f.x1, f.y1)) continue;
        if (f.art == 1) karussellGehe(f.ziel);
        else if (a == &hb) hbWunsch = f.ziel;
        else spWunsch = f.ziel;
        return;
    }
    if (a == &hb && hb.aktuell == hb.toc && hb.lzDa && imFeld(x, y, hb.lz[0], hb.lz[1], hb.lz[2], hb.lz[3])) {
        Gelesen* g = gelesenVon(hb.name, false);
        if (g && g->lz >= 0) hbWunsch = g->lz; else tone(PIN_BUZZER, 900, 120);
        return;
    }
    if (a == &hb && hb.aktuell != hb.toc && hb.toc >= 0) hbWunsch = hb.toc;   // Tippen auf eine Seite = Inhaltsverzeichnis
}

/** ▲/▼ kurz; false = am Ende, weiter im Karussell */
static bool dokBlaettern(int richtung) {
    if (modus == M_HANDBUCH) {
        if (hbBib) return false;
        int n = hb.aktuell + richtung;
        if (n >= 0 && n < hb.seiten) { hbWunsch = n; return true; }
    } else if (modus == M_SPICK) {
        int n = sp.aktuell + richtung;
        if (n >= 0 && n < sp.seiten) { spWunsch = n; return true; }
    }
    return false;
}

/** ▲ 1 s; false = nichts zu tun hier, voriger Eintrag im Karussell */
static bool dokHochLang() {
    if (modus == M_HANDBUCH && !hbBib) {
        if (hb.aktuell != hb.toc && hb.toc >= 0) {   // Lesezeichen setzen
            Gelesen* g = gelesenVon(hb.name, true);
            g->lz = hb.aktuell;
            gelesenSichern();
            protokoll("Handbuch %s: Lesezeichen auf Bildschirm %d", hb.name, hb.aktuell + 1);
            tone(PIN_BUZZER, 2700, 60); delay(90); tone(PIN_BUZZER, 3300, 60);
            return true;
        }
        if (dokN > 1 && bibBild && bibN > 1) { dokWunschBib = 1; return true; }
        return false;
    }
    if (modus == M_SPICK && sp.aktuell != 0) { spWunsch = 0; return true; }
    return false;
}

// ---- Ablage-Ereignisse -----------------------------------------------------------------------------------------
/** Sprung aus der App: /soll/doku/sprung.txt „<name> <bildschirm>“ */
static void dokSprung() {
    String t;
    if (!sollText("doku/sprung.txt", t)) return;
    if (sdEin()) SD.remove("/soll/doku/sprung.txt");
    char n[24];
    int s = -1;
    if (sscanf(t.c_str(), "%23s %d", n, &s) < 1 || !dokNameOk(n)) return;
    strlcpy(dokWunschName, n, sizeof dokWunschName);
    hbWunsch = s;
    dokWunschDa = true;
    protokoll("Handbuch: Sprung aus der App nach %s, Bildschirm %d", n, s + 1);
    if (modus == M_HANDBUCH) seiteNeuZeichnen(); else modusWuenschen(M_HANDBUCH);
}

/** Umbenennen in einem Soll-Ordner (für die App: umgestellte Seiten nicht neu übertragen). <ordner>/umbenennen.txt,
 *  je Zeile „alt neu“; erst alle nach *.umz, dann ans Ziel (Ringtausch geht so auch). Die Datei wird danach gelöscht. */
static void sollUmbenennen(const char* rel) {
    if (!sdEin()) return;
    String t;
    if (!sollText(rel, t)) return;
    char ordner[56];
    strlcpy(ordner, rel, sizeof ordner);
    char* schnitt = strrchr(ordner, '/');
    if (!schnitt) return;
    *schnitt = 0;
    std::vector<std::pair<String, String>> paare;
    int start = 0;
    while (start < (int)t.length()) {
        int ende = t.indexOf('\n', start);
        if (ende < 0) ende = t.length();
        String z = t.substring(start, ende);
        start = ende + 1;
        z.trim();
        int leer = z.indexOf(' ');
        if (leer <= 0) continue;
        String a = z.substring(0, leer), b = z.substring(leer + 1);
        b.trim();
        if (!dokNameOk(a.c_str()) || !dokNameOk(b.c_str()) || a == b) continue;
        paare.push_back({a, b});
    }
    String basis = String("/soll/") + ordner + "/";
    int n = 0;
    for (auto& p : paare) if (!SD.rename(basis + p.first, basis + p.first + ".umz")) p.first = "";
    for (auto& p : paare) {
        if (!p.first.length()) continue;
        if (SD.exists(basis + p.second)) SD.remove(basis + p.second);
        if (SD.rename(basis + p.first + ".umz", basis + p.second)) n++;
    }
    SD.remove(String("/soll/") + rel);
    protokoll("Umbenannt in %s: %d von %d", ordner, n, (int)paare.size());
}

/** Aus sollGeaendert (abgleich.h): true, wenn die Datei hierher gehörte */
static bool dokSollGeaendert(const char* rel) {
    size_t l = strlen(rel);
    if (l > 15 && !strcmp(rel + l - 15, "/umbenennen.txt")) { sollUmbenennen(rel); return true; }
    if (!strcmp(rel, "doku/sprung.txt")) { dokSprung(); return true; }
    if (!strncmp(rel, "doku/", 5)) {
        if (!strstr(rel, "/index.txt") && strncmp(rel, "doku/bibliothek.", 16)) return true;   // Seiten: erst der Index zählt
        dokListeLaden();
        size_t lo = strlen(hb.ordner);   // offenes Dokument: Index neu, sobald er (als letzte Datei) geschrieben ist
        if (lo && !strncmp(rel, hb.ordner, lo) && !strcmp(rel + lo, "/index.txt")) { hb.ordner[0] = 0; hbLaden(hb.name); }
        if (modus == M_HANDBUCH && (strstr(rel, "/index.txt") || !strcmp(rel, "doku/bibliothek.txt"))) seiteNeuZeichnen();
        wantState = true;
        return true;
    }
    if (!strcmp(rel, "spick/index.txt")) {
        spickLaden();
        if (modus == M_SPICK) seiteNeuZeichnen();
        wantState = true;
        return true;
    }
    return false;
}

static void dokuStart() {
    dokBuf = (uint8_t*)ps_malloc(IMG_BYTES);
    gelesenLaden();
    dokListeLaden();
    spickLaden();
}

/** Aus loop(): Wünsche aus Tasten, Touch und BLE umsetzen */
static void dokuLoop() {
    if (modus == M_HANDBUCH && !hilfeOffen()) {
        if (dokWunschBib) { dokWunschBib = 0; bibZeigen(); }
        if (dokWunschDa) hbBetreten();
        if (hbWunsch >= 0) { int n = hbWunsch; hbWunsch = -1; if (hbBib || n != hb.aktuell) hbZeige(n); }
    } else dokWunschBib = 0;
    if (modus == M_SPICK && !hilfeOffen() && spWunsch >= 0) { int n = spWunsch; spWunsch = -1; if (n != sp.aktuell) spZeige(n); }
}
