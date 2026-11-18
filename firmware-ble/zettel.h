/**
 * Abhaken am Sticky (SPEC „Zettel überarbeiten: Karten statt Textfeld …“, abgenommen 18.11.2026, FW 0.44.0).
 * Die App zeichnet Listen-Zettel mit Kästchen und legt dazu /soll/home/zettel.txt ab:
 *   z <platz> <punkte> <titel>                                         je Listen-Zettel (platz 0–5 = home/3.bin …)
 *   h <platz> <i> <ab> x0 y0 x1 y1 bx0 by0 bx1 by1 sx0 sy0 sx1 sy1     je Punkt: Zeile (Tippfläche), Innenfläche des
 *                                                                      Kästchens, Band durch den Text; ab = so gezeichnet
 * Abgehakt heißt: Kästchen voll schwarz und ein Strich durch den Text – beides zeichnet die App als Umkehrung (XOR).
 * Tippen auf eine Zeile kehrt hier genau dieselben zwei Rechtecke um (noch mal tippen = zurück), frischt nur die Zeile
 * auf und schreibt den Stand nach /ist/zettel/<platz>.txt: erste Zeile Titel, zweite je Punkt 0/1 („0110“).
 * Die App übernimmt die Häkchen beim Abgleich, zeichnet neu und löscht die Datei (quittieren). Bis dahin liest der
 * Sticky seinen Stand beim Start aus derselben Datei. Ereignis an die App: {"t":"zettel","platz","i","ab"}.
 */
static const int ZT_PUNKTE = 20;
struct ZtPunkt { int16_t r[12]; uint8_t ab; };   // r: Zeile x0 y0 x1 y1, Kästchen, Strich
struct ZtListe { char titel[48]; int n; ZtPunkt p[ZT_PUNKTE]; uint8_t jetzt[ZT_PUNKTE]; };
static ZtListe zt[6];
static volatile int ztWunschPlatz = -1, ztWunschI = -1;

static ZtListe* ztVon(int platz) { return platz >= 0 && platz < 6 && zt[platz].n > 0 ? &zt[platz] : nullptr; }

/** /ist/zettel/<platz>.txt passt noch zum Zettel? Dann gilt dieser Stand (Häkchen ohne Handy) */
static void ztIstLesen(int platz) {
    ZtListe& l = zt[platz];
    for (int i = 0; i < l.n; i++) l.jetzt[i] = l.p[i].ab;
    if (!sdEin()) return;
    char pfad[32];
    snprintf(pfad, sizeof pfad, "/ist/zettel/%d.txt", platz);
    File f = SD.open(pfad, FILE_READ);
    if (!f) return;
    String titel = f.readStringUntil('\n'), stand = f.readStringUntil('\n');
    f.close();
    titel.trim(); stand.trim();
    if (titel != l.titel || (int)stand.length() != l.n) return;
    for (int i = 0; i < l.n; i++) l.jetzt[i] = stand[i] == '1';
}

static void ztIstSchreiben(int platz) {
    ZtListe& l = zt[platz];
    if (!sdEin()) return;
    SD.mkdir("/ist");
    SD.mkdir("/ist/zettel");
    char pfad[32];
    snprintf(pfad, sizeof pfad, "/ist/zettel/%d.txt", platz);
    File f = SD.open(pfad, FILE_WRITE);
    if (!f) return;
    f.print(l.titel);
    f.print('\n');
    for (int i = 0; i < l.n; i++) f.print(l.jetzt[i] ? '1' : '0');
    f.print('\n');
    f.close();
}

/** home/zettel.txt (neu) einlesen; true, wenn sich die Felder des gerade gezeigten Zettels geändert haben */
static bool zettelFelderLaden() {
    static ZtListe alt;
    alt = zt[min(max(bestellAktuell, 0), 5)];
    for (auto& l : zt) { l.n = 0; l.titel[0] = 0; }
    File f = sollOeffnen("home/zettel.txt");
    if (f) {
        while (f.available()) {
            String z = f.readStringUntil('\n');
            z.trim();
            if (z.startsWith("z ")) {
                int platz, n, pos = 0;
                if (sscanf(z.c_str(), "z %d %d %n", &platz, &n, &pos) >= 2 && platz >= 0 && platz < 6 && pos > 0) {
                    strlcpy(zt[platz].titel, z.c_str() + pos, sizeof zt[platz].titel);
                    zt[platz].n = 0;
                }
            } else if (z.startsWith("h ")) {
                int platz, i, ab, r[12];
                if (sscanf(z.c_str(), "h %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d", &platz, &i, &ab,
                           &r[0], &r[1], &r[2], &r[3], &r[4], &r[5], &r[6], &r[7], &r[8], &r[9], &r[10], &r[11]) == 15
                    && platz >= 0 && platz < 6 && i == zt[platz].n && i < ZT_PUNKTE) {
                    ZtPunkt& p = zt[platz].p[i];
                    for (int k = 0; k < 12; k++) p.r[k] = r[k];
                    p.ab = ab ? 1 : 0;
                    zt[platz].n++;
                }
            }
        }
        f.close();
    }
    for (int platz = 0; platz < 6; platz++) if (zt[platz].n) ztIstLesen(platz);
    const ZtListe& neu = zt[min(max(bestellAktuell, 0), 5)];
    if (alt.n != neu.n || strcmp(alt.titel, neu.titel)) return true;
    for (int i = 0; i < neu.n; i++) if (memcmp(alt.p[i].r, neu.p[i].r, sizeof neu.p[i].r) || alt.jetzt[i] != neu.jetzt[i]) return true;
    return false;
}

static void ztUmkehren(int x0, int y0, int x1, int y1) {
    for (int r = max(0, y0); r < min(H, y1); r++)
        for (int c = max(0, x0); c < min(W, x1); c++) imgBuf[r * (W / 8) + c / 8] ^= 0x80 >> (c & 7);
}
static void ztPunktUmkehren(const ZtPunkt& p) {
    ztUmkehren(p.r[4], p.r[5], p.r[6], p.r[7]);
    ztUmkehren(p.r[8], p.r[9], p.r[10], p.r[11]);
}

/** Nach dem Laden des Zettel-Bilds (setzeModus): Punkte, die am Sticky anders abgehakt sind als gezeichnet, umkehren */
static void zettelUeberlagern() {
    ZtListe* l = ztVon(bestellAktuell);
    if (!l) return;
    for (int i = 0; i < l->n; i++) if (l->jetzt[i] != l->p[i].ab) ztPunktUmkehren(l->p[i]);
}

/** Aus sendTouch (Finger runter): Zeile getroffen? (der Rest passiert in loop(), SPI mit dem Display) */
static void zettelTipp(int x, int y) {
    if (modus != M_BESTELL || hilfeAn || ztWunschPlatz >= 0) return;
    ZtListe* l = ztVon(bestellAktuell);
    if (!l) return;
    for (int i = 0; i < l->n; i++) {
        const int16_t* r = l->p[i].r;
        if (x >= r[0] && x < r[2] && y >= r[1] && y < r[3]) { ztWunschI = i; ztWunschPlatz = bestellAktuell; return; }
    }
}

static void zettelLoop() {
    if (ztWunschPlatz < 0) return;
    int platz = ztWunschPlatz, i = ztWunschI;
    ztWunschPlatz = -1;
    ZtListe* l = ztVon(platz);
    if (!l || modus != M_BESTELL || platz != bestellAktuell || i < 0 || i >= l->n || hilfeAn) return;
    ZtPunkt& p = l->p[i];
    l->jetzt[i] ^= 1;
    ztPunktUmkehren(p);
    tone(PIN_BUZZER, l->jetzt[i] ? 3300 : 2200, 20);
    int x0 = max(0, (int)min(p.r[4], p.r[8]) & ~7), x1 = min(W, ((int)max(p.r[6], p.r[10]) + 7) & ~7);
    int y0 = max(0, (int)min(p.r[5], p.r[9])), y1 = min(H, (int)max(p.r[7], p.r[11]));
    bildZeigen(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    teilZeigen(x0, y0, x1 - x0, y1 - y0);
    ztIstSchreiben(platz);
    letzteBedienung = millis();
    protokoll("Zettel %d: Punkt %d %s", platz + 1, i + 1, l->jetzt[i] ? "abgehakt" : "offen");
    char j[80];
    snprintf(j, sizeof j, "{\"t\":\"zettel\",\"platz\":%d,\"i\":%d,\"ab\":%d}", platz, i, l->jetzt[i]);
    sendEvt(j);
}
