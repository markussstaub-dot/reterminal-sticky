/**
 * Allgemeiner Datei-Abgleich (SPEC „Zwilling 2.0“, SD-Karte als Vertrag). Neue Funktionen = neue Dateien, kein neuer Befehl.
 *   20 LISTE    pfad[|ab]                  → EVT {"t":"liste","p":pfad,"ab":n,"d":[{"n":name,"b":größe,"ordner"?}…],"mehr":bool}
 *               (passt nicht alles in ein Paket: mit „pfad|ab“ ab dem n-ten Eintrag weiterblättern)
 *   21 HOLEN    offset:u32 pfad            → ein Stück auf DATEI (offset:u32 + bis 480 Byte, 0 Byte = Ende)
 *   22 LOESCHEN pfad                       → EVT {"t":"geloescht","p":pfad,"ok":bool}
 *   23 SCHREIBEN_START größe:u32 crc:u32 pfad   (nur /soll/…, bis 1 MB, landet erst im PSRAM)
 *   24 SCHREIBEN_DATEN offset:u32 daten…        (write-no-response, wie BILD_DATEN)
 *   25 SCHREIBEN_ENDE                           → CRC prüfen, ablegen, EVT {"t":"geschrieben","p","ok","err"?}
 * /ist/… schreibt nur der Sticky (die App holt ab und quittiert mit LOESCHEN), /soll/… nur die App.
 * Ohne Karte landet /soll/home|bordbuch|notiz im Flash (ablage.h). Die Befehle kommen im BLE-Task an,
 * die Karte wird nur aus loop() angefasst (SPI mit dem Display).
 */
static const uint8_t OP_LISTE = 0x20, OP_HOLEN = 0x21, OP_LOESCHEN = 0x22,
                     OP_SCHR_START = 0x23, OP_SCHR_DATEN = 0x24, OP_SCHR_ENDE = 0x25;
static const uint32_t SCHR_MAX = 1UL << 20;

static char abgPfad[64];
static volatile uint32_t abgOffset = 0;
static volatile uint16_t abgAb = 0;
static volatile uint8_t abgWunsch = 0;   // 0 nichts, sonst der Befehl

static uint8_t* schrBuf = nullptr;
static char schrPfad[64];
static volatile uint32_t schrLen = 0, schrCrc = 0, schrGot = 0;
static volatile bool schrAktiv = false;

static bool abgPfadOk(const char* p, bool auchSoll) {
    if (strstr(p, "..")) return false;
    if (!strncmp(p, "/ist", 4) && (p[4] == 0 || p[4] == '/')) return true;
    return auchSoll && !strncmp(p, "/soll", 5) && (p[5] == 0 || p[5] == '/');
}

/** Aus CmdCb::onWrite. Liefert true, wenn der Befehl hierher gehörte. */
static bool abgleichBefehl(const uint8_t* d, size_t n) {
    switch (d[0]) {
    case OP_SCHR_DATEN: {
        if (!schrAktiv || n < 5) return true;
        uint32_t off = rd32(d + 1), k = n - 5;
        if (off + k <= schrLen) { memcpy(schrBuf + off, d + 5, k); if (off + k > schrGot) schrGot = off + k; }
        return true;
    }
    case OP_SCHR_START: {
        if (n < 10 || n - 9 >= sizeof schrPfad) return true;
        uint32_t len = rd32(d + 1);
        char p[64];
        memcpy(p, d + 9, n - 9);
        p[n - 9] = 0;
        if (!abgPfadOk(p, true) || strncmp(p, "/soll/", 6)) { sendEvt("{\"t\":\"geschrieben\",\"ok\":false,\"err\":\"pfad\"}"); return true; }
        if (len == 0 || len > SCHR_MAX) { sendEvt("{\"t\":\"geschrieben\",\"ok\":false,\"err\":\"groesse\"}"); return true; }
        if (!schrBuf) schrBuf = (uint8_t*)ps_malloc(SCHR_MAX);
        if (!schrBuf) { sendEvt("{\"t\":\"geschrieben\",\"ok\":false,\"err\":\"speicher\"}"); return true; }
        strlcpy(schrPfad, p, sizeof schrPfad);
        schrLen = len;
        schrCrc = rd32(d + 5);
        schrGot = 0;
        schrAktiv = true;
        if (len > 4000) { wantFast = true; slowAt = 0; }   // wie beim Bild: kurzes Intervall fürs Streamen
        return true;
    }
    case OP_SCHR_ENDE:
        if (schrAktiv) abgWunsch = OP_SCHR_ENDE;
        return true;
    case OP_LISTE: case OP_HOLEN: case OP_LOESCHEN: {
        size_t kopf = d[0] == OP_HOLEN ? 5 : 1;
        if (n <= kopf || n - kopf >= sizeof abgPfad || abgWunsch) return true;
        if (d[0] == OP_HOLEN) abgOffset = rd32(d + 1);
        memcpy(abgPfad, d + kopf, n - kopf);
        abgPfad[n - kopf] = 0;
        abgAb = 0;
        if (char* trenn = strchr(abgPfad, '|')) { abgAb = atoi(trenn + 1); *trenn = 0; }
        if (abgPfadOk(abgPfad, true)) abgWunsch = d[0];
        else sendEvt("{\"t\":\"abgleich\",\"ok\":false,\"err\":\"pfad\"}");
        return true;
    }
    }
    return false;
}

/** Die App hat etwas im Soll geändert: betroffene Teile neu laden (rel ohne „/soll/“) */
static void sollGeaendert(const char* rel) {
    if (!strcmp(rel, "home/version.txt")) {
        homeLesen();
        if (modus == M_HOME) setzeModus(M_HOME);     // neue Karte gleich zeigen
        wantState = true;
    } else if (!strcmp(rel, "home/2.bin")) {
        ziffernDa = homeLaden(2, ziffernBuf);
    } else if (!strcmp(rel, "bordbuch/index.txt")) {
        bbIndexMelden();
    } else if (!strcmp(rel, "einstellungen/karussell.txt")) {
        karussellLaden();
    } else if (!strcmp(rel, "notiz/layout.txt")) {
        fahrtLayoutLaden();
        wantState = true;
    }
}

static void abgListe(const char* pfad, int ab) {
    protokollSchreiben();                     // damit der heutige Fahrtenschreiber vollständig dasteht
    String j = String("{\"t\":\"liste\",\"p\":\"") + pfad + "\",\"ab\":" + String(ab) + ",\"d\":[";
    bool erst = true, mehr = false;
    File d = sdEin() ? SD.open(pfad) : File();
    if (d && d.isDirectory()) {
        int i = 0;
        for (File f = d.openNextFile(); f; f = d.openNextFile()) {
            if (i++ < ab) continue;
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

static void abgSchreibenEnde() {
    schrAktiv = false;
    slowAt = millis() + 1500;
    const char* rel = schrPfad + 6;          // ohne „/soll/“
    const char* err = nullptr;
    if (schrGot != schrLen) err = "unvollstaendig";
    else if (crc32(schrBuf, schrLen) != schrCrc) err = "crc";
    else if (!sollSchreiben(rel, schrBuf, schrLen)) err = "ablage";
    char j[140];
    if (err) {
        snprintf(j, sizeof j, "{\"t\":\"geschrieben\",\"p\":\"%s\",\"ok\":false,\"err\":\"%s\",\"got\":%lu}", schrPfad, err, (unsigned long)schrGot);
        protokoll("Schreiben %s: %s", schrPfad, err);
    } else {
        snprintf(j, sizeof j, "{\"t\":\"geschrieben\",\"p\":\"%s\",\"ok\":true,\"b\":%lu}", schrPfad, (unsigned long)schrLen);
        sollGeaendert(rel);
    }
    sendEvt(j);
}

static void abgleichLoop() {
    uint8_t w = abgWunsch;
    if (!w) return;
    if (w == OP_LISTE) abgListe(abgPfad, abgAb);
    else if (w == OP_HOLEN) abgStueck(abgPfad, abgOffset);
    else if (w == OP_SCHR_ENDE) abgSchreibenEnde();
    else if (w == OP_LOESCHEN) {
        bool ok = sdEin() && SD.remove(abgPfad);
        char j[110];
        snprintf(j, sizeof j, "{\"t\":\"geloescht\",\"p\":\"%s\",\"ok\":%s}", abgPfad, ok ? "true" : "false");
        sendEvt(j);
        if (ok && !strncmp(abgPfad, "/ist/", 5)) protokoll("abgeholt und gelöscht: %s", abgPfad);
        if (ok && !strncmp(abgPfad, "/soll/", 6)) sollGeaendert(abgPfad + 6);
        if (ok && !strncmp(abgPfad, "/ist/puffer/notizen.jsonl", 25)) offeneNotizen = 0;
    }
    abgWunsch = 0;
}
