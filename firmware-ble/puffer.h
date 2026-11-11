/**
 * Notizen puffern (ohne Handy): Ist die App nicht verbunden, legt der Sticky Knopf-Notizen und Diktate selbst ab
 * und die App holt sie beim nächsten Verbinden ab (SPEC „Notizen puffern“).
 *
 * Ablage im Flash (LittleFS, dasselbe wie das Bordbuch):
 *   /puffer/notizen.jsonl   je Zeile {"t":ms,"typ":"notiz","quelle":"sticky","art":"knopf|diktat","knopf"|"audio",…,"offline":true}
 *   /puffer/aNNNN.adp       Diktat: aneinandergereihte Audio-Pakete (je 245 Byte, wie über BLE)
 *   /fahrt/layout.txt       Streifen der Fahrt-Seite in Display-Koordinaten („e x0 y0 x1 y1 Name“), von der App
 *   /fahrt/rNN.bin          Rückmelde-Teilbilder (Kopf x,y,w,h je u16 + 1 bpp), von der App gerendert
 * Zeit: von der App bei jeder Verbindung gesetzt (OP_ZEIT); hält die Uhr PCF8563 (0x51) sie, übersteht sie auch Neustarts.
 */
#include <sys/time.h>

#define UUID_DATEI "b1e50006-7374-6963-6b79-7465726d6e6c"
static NimBLECharacteristic* chDatei;

// ---- Zeit ------------------------------------------------------------------------------------
static bool rtcDa = false;
static bool zeitGesetzt = false;
static uint8_t bcd(uint8_t v) { return (v / 10) << 4 | (v % 10); }
static uint8_t unbcd(uint8_t v) { return (v >> 4) * 10 + (v & 0x0F); }

static void zeitSetzen(uint64_t ms) {
    timeval tv = {(time_t)(ms / 1000), (suseconds_t)((ms % 1000) * 1000)};
    settimeofday(&tv, nullptr);
    zeitGesetzt = true;
    if (rtcDa) {
        time_t s = tv.tv_sec;
        tm u;
        gmtime_r(&s, &u);
        Wire.beginTransmission(0x51);
        Wire.write(0x02);
        Wire.write(bcd(u.tm_sec)); Wire.write(bcd(u.tm_min)); Wire.write(bcd(u.tm_hour));
        Wire.write(bcd(u.tm_mday)); Wire.write(u.tm_wday); Wire.write(bcd(u.tm_mon + 1)); Wire.write(bcd(u.tm_year - 100));
        Wire.endTransmission();
    }
}

static void zeitInit() {
    Wire.beginTransmission(0x51);
    rtcDa = Wire.endTransmission() == 0;
    if (!rtcDa) { Serial.println("Uhr: keine PCF8563 auf GPIO0/1, Zeit nur nach Abgleich mit der App"); return; }
    Wire.beginTransmission(0x51);
    Wire.write(0x02);
    Wire.endTransmission(false);
    if (Wire.requestFrom(0x51, 7) != 7) return;
    uint8_t r[7];
    for (auto& b : r) b = Wire.read();
    if (r[0] & 0x80) { Serial.println("Uhr: PCF8563 gefunden, aber noch nicht gestellt"); return; }   // VL-Bit: Zeit ungültig
    tm u = {};
    u.tm_sec = unbcd(r[0] & 0x7F); u.tm_min = unbcd(r[1] & 0x7F); u.tm_hour = unbcd(r[2] & 0x3F);
    u.tm_mday = unbcd(r[3] & 0x3F); u.tm_mon = unbcd(r[5] & 0x1F) - 1; u.tm_year = unbcd(r[6]) + 100;
    setenv("TZ", "UTC0", 1); tzset();
    time_t s = mktime(&u);
    timeval tv = {s, 0};
    settimeofday(&tv, nullptr);
    zeitGesetzt = true;
    Serial.printf("Uhr: PCF8563 %04d-%02d-%02d %02d:%02d UTC\n", u.tm_year + 1900, u.tm_mon + 1, u.tm_mday, u.tm_hour, u.tm_min);
}

static uint64_t jetztMs() {
    timeval tv;
    gettimeofday(&tv, nullptr);
    return zeitGesetzt ? (uint64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000 : 0;
}

// ---- Fahrt-Layout und Rückmeldungen (von der App) --------------------------------------------
struct Streifen { int x0, y0, x1, y1; char name[24]; };
static Streifen streifen[8];
static int streifenAnzahl = 0;
static char fahrtLayoutNeu[520];
static volatile bool fahrtLayoutDa = false;
static uint32_t fahrtVersion = 0;   // CRC des Layout-Texts, meldet der Zustand → App weiß, ob neu senden

static void fahrtLayoutLaden() {
    streifenAnzahl = 0;
    File f = LittleFS.open("/fahrt/layout.txt", "r");
    if (!f) return;
    String alles = f.readString();
    f.close();
    fahrtVersion = crc32((const uint8_t*)alles.c_str(), alles.length());
    int start = 0;
    while (start < (int)alles.length() && streifenAnzahl < 8) {
        int ende = alles.indexOf('\n', start);
        if (ende < 0) ende = alles.length();
        String z = alles.substring(start, ende);
        start = ende + 1;
        Streifen s;
        int pos = 0;
        if (sscanf(z.c_str(), "e %d %d %d %d %n", &s.x0, &s.y0, &s.x1, &s.y1, &pos) == 4 && pos > 0) {
            strlcpy(s.name, z.c_str() + pos, sizeof s.name);
            streifen[streifenAnzahl++] = s;
        }
    }
    Serial.printf("Fahrt: %d Streifen, Version %08lx\n", streifenAnzahl, (unsigned long)fahrtVersion);
}

static bool rueckSpeichern(int slot, const uint8_t* daten, uint16_t x, uint16_t y, uint16_t w, uint16_t h) {
    char pfad[24];
    snprintf(pfad, sizeof pfad, "/fahrt/r%02d.bin", slot);
    File f = LittleFS.open(pfad, "w");
    if (!f) return false;
    uint16_t kopf[4] = {x, y, w, h};
    f.write((uint8_t*)kopf, 8);
    size_t n = (size_t)w / 8 * h;
    bool ok = f.write(daten, n) == n;
    f.close();
    return ok;
}

/** Rückmeldung slot (0–4 Knopf, 5 Diktat gespeichert, 6 Aufnahme läuft) als Teilbild zeigen */
static void rueckZeigen(int slot) {
    char pfad[24];
    snprintf(pfad, sizeof pfad, "/fahrt/r%02d.bin", slot);
    File f = LittleFS.open(pfad, "r");
    if (!f) return;
    uint16_t k[4];
    f.read((uint8_t*)k, 8);
    size_t n = (size_t)k[2] / 8 * k[3];
    if (n > IMG_BYTES) { f.close(); return; }
    f.read(rxBuf, n);
    f.close();
    for (int r = 0; r < k[3]; r++) memcpy(imgBuf + (k[1] + r) * (W / 8) + k[0] / 8, rxBuf + r * (k[2] / 8), k[2] / 8);
    display.drawBitmap(k[0], k[1], rxBuf, k[2], k[3], TFT_BLACK, TFT_WHITE);
    display.updatePartial(k[0], k[1], k[2], k[3]);
}

// ---- Offline-Notizen ---------------------------------------------------------------------------
static volatile int offlineKnopf = -1;     // Touch-Treffer, umgesetzt in loop()
static int offeneNotizen = 0;

static void notizAnhaengen(const char* json) {
    File f = LittleFS.open("/puffer/notizen.jsonl", "a");
    if (!f) return;
    f.println(json);
    f.close();
    offeneNotizen++;
}

/** Touch ohne Verbindung auf der Fahrt-Seite */
static void pufferTouch(int x, int y) {
    if (connected || bordbuch || strcmp(seite, "bild") != 0) return;
    for (int i = 0; i < streifenAnzahl; i++)
        if (x >= streifen[i].x0 && x < streifen[i].x1 && y >= streifen[i].y0 && y < streifen[i].y1) { offlineKnopf = i; return; }
}

// Diktat offline: Pakete in eine Datei statt per BLE
static File audioDatei;
static char audioName[16];
static volatile bool audioOffline = false;

static bool offlineAufnahmeOeffnen() {
    for (int i = 1; i < 10000; i++) {
        snprintf(audioName, sizeof audioName, "a%04d.adp", i);
        char pfad[32];
        snprintf(pfad, sizeof pfad, "/puffer/%s", audioName);
        if (!LittleFS.exists(pfad)) {
            audioDatei = LittleFS.open(pfad, "w");
            return (bool)audioDatei;
        }
    }
    return false;
}

static void pufferInit() {
    LittleFS.mkdir("/puffer");
    LittleFS.mkdir("/fahrt");
    fahrtLayoutLaden();
    File d = LittleFS.open("/puffer");
    for (File f = d.openNextFile(); f; f = d.openNextFile())
        if (String(f.name()).endsWith(".jsonl")) { while (f.available()) if (f.read() == '\n') offeneNotizen++; }
    Serial.printf("Puffer: %d offene Notizen\n", offeneNotizen);
}

// ---- Abholen über BLE (DATEI-Kennlinie, notify) ---------------------------------------------
static char holName[40];
static volatile uint32_t holOffset = 0;
static volatile bool holWunsch = false, listeWunsch = false;
static char loeschName[40];
static volatile bool loeschWunsch = false;

static void pufferListe() {
    String j = "{\"t\":\"puffer\",\"dateien\":[";
    File d = LittleFS.open("/puffer");
    bool erst = true;
    for (File f = d.openNextFile(); f; f = d.openNextFile()) {
        if (!erst) j += ",";
        erst = false;
        j += "{\"n\":\"" + String(f.name()) + "\",\"b\":" + String(f.size()) + "}";
    }
    j += "]}";
    if (j.length() > 500) j = "{\"t\":\"puffer\",\"zuviel\":true}";
    sendEvt(j.c_str());
}

/** Ein Stück einer Puffer-Datei auf DATEI schicken: offset:u32 + bis zu 480 Byte (0 Byte = Ende).
 *  Die App fragt Stück für Stück an und wiederholt bei Verlust – ein Datenstrom ohne Quittung kam am Fold
 *  nur zu einem Fünftel an (15 von 84 Paketen, 11.11.2026). */
static void pufferStueck(const char* name, uint32_t off) {
    char pfad[48];
    snprintf(pfad, sizeof pfad, "/puffer/%s", name);
    static uint8_t paket[4 + 480];
    int n = 0;
    File f = LittleFS.open(pfad, "r");
    if (f) {
        if (f.seek(off)) n = f.read(paket + 4, 480);
        f.close();
    }
    if (n < 0) n = 0;
    if (off == 0) wantFast = true;   // für die Dauer des Abholens kurzes Intervall
    slowAt = millis() + 1500;
    memcpy(paket, &off, 4);
    chDatei->setValue(paket, 4 + n);
    for (int i = 0; i < 40 && !chDatei->notify(); i++) delay(10);
}

/** Aus loop() */
static void pufferLoop() {
    if (fahrtLayoutDa) {
        fahrtLayoutDa = false;
        File f = LittleFS.open("/fahrt/layout.txt", "w");
        if (f) { f.print(fahrtLayoutNeu); f.close(); }
        fahrtLayoutLaden();
        wantState = true;
    }
    if (offlineKnopf >= 0) {
        int i = offlineKnopf;
        offlineKnopf = -1;
        char j[160];
        snprintf(j, sizeof j, "{\"t\":%llu,\"typ\":\"notiz\",\"quelle\":\"sticky\",\"art\":\"knopf\",\"knopf\":\"%s\",\"offline\":true}",
                 (unsigned long long)jetztMs(), streifen[i].name);
        notizAnhaengen(j);
        tone(PIN_BUZZER, 2700, 30);
        rueckZeigen(i);
        Serial.printf("Offline-Notiz: %s\n", j);
    }
    if (listeWunsch) { listeWunsch = false; pufferListe(); }
    if (holWunsch) { holWunsch = false; pufferStueck(holName, holOffset); }
    if (loeschWunsch) {
        loeschWunsch = false;
        char pfad[48];
        snprintf(pfad, sizeof pfad, "/puffer/%s", loeschName);
        LittleFS.remove(pfad);
        if (strcmp(loeschName, "notizen.jsonl") == 0) offeneNotizen = 0;
        wantState = true;
    }
}
