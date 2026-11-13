/**
 * Allgemeiner Datei-Abgleich (SPEC „Zwilling 2.0“, SD-Karte als Vertrag). Erster Teil: Lesen und Quittieren im Ist-Bereich.
 *   20 LISTE    pfad            → EVT {"t":"liste","p":pfad,"d":[{"n":name,"b":größe}…],"mehr":bool}
 *   21 HOLEN    offset:u32 pfad → ein Stück auf DATEI (offset:u32 + bis 480 Byte, 0 Byte = Ende), wie PUFFER_HOLEN
 *   22 LOESCHEN pfad            → EVT {"t":"geloescht","p":pfad,"ok":bool}
 * Erlaubt sind nur Pfade unter /ist/ (der Sticky schreibt, die App holt ab und quittiert). SCHREIBEN und /soll/ folgen
 * im nächsten Schritt. Die Befehle kommen im BLE-Task an, die Karte wird nur aus loop() angefasst (SPI mit dem Display).
 */
static const uint8_t OP_LISTE = 0x20, OP_HOLEN = 0x21, OP_LOESCHEN = 0x22;

static char abgPfad[64];
static volatile uint32_t abgOffset = 0;
static volatile uint8_t abgWunsch = 0;   // 0 nichts, sonst der Befehl

static bool abgPfadOk(const char* p) { return strncmp(p, "/ist", 4) == 0 && (p[4] == 0 || p[4] == '/') && !strstr(p, ".."); }

/** Aus CmdCb::onWrite. Liefert true, wenn der Befehl hierher gehörte. */
static bool abgleichBefehl(const uint8_t* d, size_t n) {
    if (d[0] != OP_LISTE && d[0] != OP_HOLEN && d[0] != OP_LOESCHEN) return false;
    size_t kopf = d[0] == OP_HOLEN ? 5 : 1;
    if (n <= kopf || n - kopf >= sizeof abgPfad || abgWunsch) return true;
    if (d[0] == OP_HOLEN) abgOffset = rd32(d + 1);
    memcpy(abgPfad, d + kopf, n - kopf);
    abgPfad[n - kopf] = 0;
    if (abgPfadOk(abgPfad)) abgWunsch = d[0];
    else sendEvt("{\"t\":\"abgleich\",\"ok\":false,\"err\":\"pfad\"}");
    return true;
}

static void abgListe(const char* pfad) {
    protokollSchreiben();                     // damit der heutige Fahrtenschreiber vollständig dasteht
    String j = String("{\"t\":\"liste\",\"p\":\"") + pfad + "\",\"d\":[";
    bool erst = true, mehr = false;
    File d = sdEin() ? SD.open(pfad) : File();
    if (d && d.isDirectory()) {
        for (File f = d.openNextFile(); f; f = d.openNextFile()) {
            String e = String(erst ? "" : ",") + "{\"n\":\"" + f.name() + "\",\"b\":" + String(f.size()) + (f.isDirectory() ? ",\"ordner\":true}" : "}");
            if (j.length() + e.length() > 470) { mehr = true; break; }
            j += e;
            erst = false;
        }
    }
    j += String("],\"mehr\":") + (mehr ? "true" : "false") + (d ? "}" : ",\"fehlt\":true}");
    sendEvt(j.c_str());
}

static void abgStueck(const char* pfad, uint32_t off) {
    static uint8_t paket[4 + 480];
    int n = 0;
    if (off == 0) protokollSchreiben();
    File f = sdEin() ? SD.open(pfad, FILE_READ) : File();
    if (f) {
        if (f.seek(off)) n = f.read(paket + 4, 480);
        f.close();
    }
    if (n < 0) n = 0;
    if (off == 0) wantFast = true;
    slowAt = millis() + 1500;
    memcpy(paket, &off, 4);
    if (!chDatei) return;
    chDatei->setValue(paket, 4 + n);
    for (int i = 0; i < 40 && !chDatei->notify(); i++) delay(10);
}

static void abgleichLoop() {
    uint8_t w = abgWunsch;
    if (!w) return;
    if (w == OP_LISTE) abgListe(abgPfad);
    else if (w == OP_HOLEN) abgStueck(abgPfad, abgOffset);
    else if (w == OP_LOESCHEN) {
        bool ok = sdEin() && SD.remove(abgPfad);
        char j[110];
        snprintf(j, sizeof j, "{\"t\":\"geloescht\",\"p\":\"%s\",\"ok\":%s}", abgPfad, ok ? "true" : "false");
        sendEvt(j);
        if (ok) protokoll("abgeholt und gelöscht: %s", abgPfad);
    }
    abgWunsch = 0;
}
