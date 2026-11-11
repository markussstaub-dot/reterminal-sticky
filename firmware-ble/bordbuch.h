/**
 * Bordbuch (SPEC „MVP 2“): Seiten liegen im Flash (LittleFS auf der „spiffs“-Partition, 1,5 MB ≈ 30 Seiten)
 * und sind ohne Handy lesbar. Die App rendert die Seiten und schickt sie einmalig (BILD_ENDE Modus 3 + Seitennummer),
 * dazu einen Index mit den Touch-Feldern des Inhaltsverzeichnisses (OP_BB_INDEX).
 *
 * Bedienung: ▲ lang (1 s) = Modus Fahrt ↔ Bordbuch · im Bordbuch ▲ kurz = zurück, ▼ = weiter,
 * KI = Inhaltsverzeichnis, Touch auf einen Eintrag im Inhaltsverzeichnis = dorthin springen.
 */
#include <LittleFS.h>

static bool bbFs = false;
static volatile bool bordbuch = false;   // Modus: false = Fahrt, true = Bordbuch
static int bbSeiten = 0, bbToc = 0, bbAktuell = 0;
struct BbEintrag { int x0, y0, x1, y1, seite; };
static BbEintrag bbEintraege[32];
static int bbAnzahl = 0;
static uint8_t* bbBuf;
static volatile int bbWunsch = -1;        // Seite, die loop() anzeigen soll
static char bbIndexNeu[520];
static volatile bool bbIndexDa = false;

static void bbIndexLaden() {
    bbSeiten = 0; bbToc = 0; bbAnzahl = 0;
    File f = LittleFS.open("/bb/index.txt", "r");
    if (!f) return;
    while (f.available()) {
        String z = f.readStringUntil('\n');
        z.trim();
        if (z.startsWith("seiten=")) bbSeiten = z.substring(7).toInt();
        else if (z.startsWith("toc=")) bbToc = z.substring(4).toInt();
        else if (z.startsWith("e ") && bbAnzahl < 32) {
            int x0, y0, x1, y1, s;   // „e x0 y0 x1 y1 seite“
            if (sscanf(z.c_str() + 2, "%d %d %d %d %d", &x0, &y0, &x1, &y1, &s) == 5) bbEintraege[bbAnzahl++] = {x0, y0, x1, y1, s};
        }
    }
    f.close();
    Serial.printf("Bordbuch: %d Seiten, Inhalt auf Seite %d, %d Einträge\n", bbSeiten, bbToc, bbAnzahl);
}

static void bbInit() {
    bbBuf = (uint8_t*)ps_malloc(IMG_BYTES);
    bbFs = LittleFS.begin(true, "/littlefs", 10, "spiffs");
    if (!bbFs) { Serial.println("Bordbuch: LittleFS nicht verfügbar"); return; }
    LittleFS.mkdir("/bb");
    Serial.printf("Bordbuch: LittleFS %u/%u KB belegt\n", (unsigned)(LittleFS.usedBytes() / 1024), (unsigned)(LittleFS.totalBytes() / 1024));
    bbIndexLaden();
}

static bool bbSpeichern(int n, const uint8_t* daten) {
    if (!bbFs) return false;
    char pfad[24];
    snprintf(pfad, sizeof pfad, "/bb/%02d.bin", n);
    File f = LittleFS.open(pfad, "w");
    if (!f) return false;
    size_t w = f.write(daten, IMG_BYTES);
    f.close();
    return w == IMG_BYTES;
}

static void bbMeldeSeite() {
    char j[64];
    snprintf(j, sizeof j, "{\"t\":\"seite\",\"n\":%d,\"von\":%d}", bbAktuell, bbSeiten);
    sendEvt(j);
}

static void bbZeige(int n) {
    if (!bbFs || bbSeiten == 0) return;
    if (n < 0) n = 0;
    if (n >= bbSeiten) n = bbSeiten - 1;
    char pfad[24];
    snprintf(pfad, sizeof pfad, "/bb/%02d.bin", n);
    File f = LittleFS.open(pfad, "r");
    if (!f || f.read(bbBuf, IMG_BYTES) != IMG_BYTES) { if (f) f.close(); Serial.printf("Bordbuch: Seite %d fehlt\n", n); return; }
    f.close();
    bbAktuell = n;
    memcpy(imgBuf, bbBuf, IMG_BYTES);   // imgBuf = was gerade zu sehen ist (für Hinweise und Wiederherstellen)
    display.drawBitmap(0, 0, bbBuf, W, H, TFT_BLACK, TFT_WHITE);
    // update() statt updateFast(): der schnelle Modus gab am Gerät eine falsche Anzeige (11.11.2026);
    // update() ist nach dem ersten Bild ohnehin nur ~0,4 s
    uint32_t t0 = millis();
    display.update();
    Serial.printf("Bordbuch: Seite %d in %lu ms\n", n, (unsigned long)(millis() - t0));
    bbMeldeSeite();
}

/** Touch im Bordbuch: auf der Inhaltsseite zum Kapitel springen */
static void bbTouch(int x, int y) {
    if (!bordbuch || bbAktuell != bbToc) return;
    for (int i = 0; i < bbAnzahl; i++)
        if (x >= bbEintraege[i].x0 && x < bbEintraege[i].x1 && y >= bbEintraege[i].y0 && y < bbEintraege[i].y1) {
            bbWunsch = bbEintraege[i].seite;
            return;
        }
}

/** Aus loop(): Wünsche aus Tasten/BLE umsetzen (Display und Flash nur hier anfassen) */
static void bbLoop() {
    if (bbIndexDa) {
        bbIndexDa = false;
        File f = LittleFS.open("/bb/index.txt", "w");
        if (f) { f.print(bbIndexNeu); f.close(); }
        bbIndexLaden();
        char j[96];
        snprintf(j, sizeof j, "{\"t\":\"bordbuch\",\"seiten\":%d,\"belegtKB\":%u}", bbSeiten, (unsigned)(LittleFS.usedBytes() / 1024));
        sendEvt(j);
    }
    if (bbWunsch >= 0) {
        int n = bbWunsch;
        bbWunsch = -1;
        if (bordbuch && n != bbAktuell) bbZeige(n);
    }
}
