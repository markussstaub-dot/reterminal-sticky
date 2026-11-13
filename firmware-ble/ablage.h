/**
 * Soll-Ablage (SPEC „Zwilling 2.0“, SD-Karte als Vertrag, FW 0.11.0): was die App dem Sticky vorgibt, liegt unter
 * /soll/… auf der Karte. Ohne Karte gilt der Flash mit den alten Pfaden (Rückfall):
 *   home/…      ↔ /home/…    Home-Karte 0, Notiz-Seite 1, Ziffern 2, Zettel 3–8, version.txt
 *   bordbuch/…  ↔ /bb/…      Seiten NN.bin, index.txt
 *   notiz/…     ↔ /fahrt/…   layout.txt, Rückmeldungen rNN.bin
 * Home 0–2 (Karte, Notiz-Seite, Ziffern) spiegelt der Sticky zusätzlich in den Flash, damit Uhr und Karte auch
 * ohne Karte gehen. Nur aus loop() benutzen (SPI mit dem Display).
 */

static void sollPfad(char* p, size_t n, const char* rel, bool karte) {
    if (karte) { snprintf(p, n, "/soll/%s", rel); return; }
    if (!strncmp(rel, "bordbuch/", 9)) snprintf(p, n, "/bb/%s", rel + 9);
    else if (!strncmp(rel, "notiz/", 6)) snprintf(p, n, "/fahrt/%s", rel + 6);
    else snprintf(p, n, "/%s", rel);
}

/** Ordner über einer Datei auf der Karte anlegen (/soll/home/0.bin → /soll, /soll/home) */
static void sdOrdnerFuer(const char* p) {
    char o[64];
    strlcpy(o, p, sizeof o);
    for (char* z = o + 1; *z; z++) if (*z == '/') { *z = 0; SD.mkdir(o); *z = '/'; }
}

/** Datei aus dem Soll öffnen (rel z. B. "home/0.bin"); Karte, wenn eingebunden, sonst Flash */
static File sollOeffnen(const char* rel, const char* modus = "r") {
    bool karte = sdEin();
    char p[64];
    sollPfad(p, sizeof p, rel, karte);
    if (karte) { if (*modus != 'r') sdOrdnerFuer(p); return SD.open(p, modus); }
    return LittleFS.open(p, modus);
}

static bool sollDa(const char* rel) {
    bool karte = sdEin();
    char p[64];
    sollPfad(p, sizeof p, rel, karte);
    return karte ? SD.exists(p) : LittleFS.exists(p);
}

/** Ganze Datei in einen Puffer lesen; true, wenn genau n Byte da waren */
static bool sollLesen(const char* rel, uint8_t* ziel, size_t n) {
    File f = sollOeffnen(rel);
    if (!f) return false;
    bool ok = f.read(ziel, n) == n;
    f.close();
    return ok;
}

static bool sollSchreiben(const char* rel, const uint8_t* daten, size_t n) {
    bool karte = sdEin();
    char p[64];
    sollPfad(p, sizeof p, rel, karte);
    if (karte) sdOrdnerFuer(p);
    File f = karte ? SD.open(p, FILE_WRITE) : LittleFS.open(p, "w");
    if (!f) return false;
    bool ok = f.write(daten, n) == n;
    f.close();
    // Home-Karte, Notiz-Seite und Ziffern zusätzlich in den Flash: ohne Karte bleibt der Sticky so benutzbar
    if (ok && karte && (!strcmp(rel, "home/0.bin") || !strcmp(rel, "home/1.bin") || !strcmp(rel, "home/2.bin") || !strcmp(rel, "home/version.txt"))) {
        sollPfad(p, sizeof p, rel, false);
        File g = LittleFS.open(p, "w");
        if (g) { g.write(daten, n); g.close(); }
    }
    return ok;
}

static bool sollText(const char* rel, String& text) {
    File f = sollOeffnen(rel);
    if (!f) return false;
    text = f.readString();
    f.close();
    return true;
}

// ---- Umzug beim Start: Flash → Karte (einmalig) ----------------------------------------------------
static int ordnerKopieren(const char* von, const char* nach) {
    File d = LittleFS.open(von);
    if (!d || !d.isDirectory()) return 0;
    SD.mkdir(nach);
    static uint8_t buf[1024];
    int n = 0;
    for (File f = d.openNextFile(); f; f = d.openNextFile()) {
        String ziel = String(nach) + "/" + f.name();
        if (SD.exists(ziel)) { f.close(); continue; }
        File z = SD.open(ziel, FILE_WRITE);
        bool ok = (bool)z;
        while (ok && f.available()) { int k = f.read(buf, sizeof buf); ok = k > 0 && z.write(buf, k) == (size_t)k; }
        if (z) z.close();
        f.close();
        if (ok) n++; else SD.remove(ziel);
    }
    return n;
}

static void sollUmzug() {
    SD.mkdir("/soll");
    SD.mkdir("/ist");
    if (!SD.exists("/soll/home")) { int n = ordnerKopieren("/home", "/soll/home"); if (n) protokoll("Umzug: %d Home-Dateien auf die Karte", n); }
    if (!SD.exists("/soll/notiz")) { int n = ordnerKopieren("/fahrt", "/soll/notiz"); if (n) protokoll("Umzug: %d Notiz-Dateien auf die Karte", n); }
    if (!SD.exists("/soll/bordbuch")) {
        int n = ordnerKopieren("/bb", "/soll/bordbuch");
        if (n) {
            protokoll("Umzug: %d Bordbuch-Dateien auf die Karte, Flash freigegeben", n);
            File d = LittleFS.open("/bb");
            std::vector<String> weg;
            for (File f = d.openNextFile(); f; f = d.openNextFile()) weg.push_back(String("/bb/") + f.name());
            d.close();
            for (auto& p : weg) LittleFS.remove(p);
        }
    }
    if (SD.exists("/puffer") && !SD.exists("/ist/puffer")) {
        bool ok = SD.rename("/puffer", "/ist/puffer");
        protokoll("Umzug: Puffer nach /ist/puffer %s", ok ? "ok" : "fehlgeschlagen");
    }
    SD.mkdir("/ist/puffer");
}
