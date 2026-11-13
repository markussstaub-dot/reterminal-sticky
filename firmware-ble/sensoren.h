/**
 * Eigene Sensoren (SPEC „Zwilling 2.0“, Schritt 3, FW 0.12.0). Beide am Akku-Bus MISC_I2C (SCL GPIO0, SDA GPIO1).
 *
 * Klima SHT40 (0x44): wach jede Minute, im Schlummern alle 15 min (Timer-Wecken zur vollen Minute ist ohnehin da).
 *   /ist/mess/klima-JJJJ-MM-TT.csv  „HH:MM;°C;%rF;Taupunkt °C“
 *   Warnungen in den Fahrtenschreiber: Beschlag droht (Abstand zum Taupunkt < 2 K), Laden zu kalt/heiß (Lader 0–45 °C)
 *
 * Bewegung LSM6DS3TR-C (0x6A): Beschleunigung 26 Hz im Stromsparmodus (±2 g, Kreisel aus). Wake-up-Interrupt
 * (Schwelle 31 mg, gehalten bis WAKE_UP_SRC gelesen) auf INT1 = 6D_INTn = GPIO7, offener Drain, aktiv low – die Leitung
 * teilt er sich mit dem Akku-Chip (BFG_INT).
 *   - weckt aus dem Schlummern (Funk an, dann normale Schlummerregel)
 *   - Fahrt: wach alle 100 ms lesen, je 2-s-Fenster Unruhe (Streuung des Betrags) und Lageänderung bestimmen.
 *     ruhig (< 15 mg) · rüttelt (15–150 mg bei gleicher Lage) · unruhig (getragen, Lage wechselt oder > 150 mg).
 *     Fahrt beginnt nach 15 rüttelnden von 20 Fenstern, endet nach 2 min ohne Rütteln; währenddessen bleibt er wach.
 *   - getragen (unruhig): Bewegungswecken 5 min gesperrt, damit er in der Tasche nicht dauernd aufwacht
 * Schwellen sind Startwerte; der Fahrtenschreiber hält Fensterkennzahlen fest, damit sie sich an echten Fahrten
 * nachstellen lassen.
 */
#include <math.h>

static const int PIN_6D_INT = 7;
static bool shtDa = false, lsmDa = false;
static float klimaT = NAN, klimaRf = NAN, klimaTp = NAN;
static uint32_t klimaZuletzt = 0;
static bool fahrt = false;
static uint32_t bewegtZuletzt = 0, fahrtRuettelnZuletzt = 0, weckSperreBis = 0;
static bool warnBeschlag = false, warnLaden = false;

// ---- I2C-Hilfen -------------------------------------------------------------------------------------
static bool i2cSchreib(uint8_t adr, uint8_t reg, uint8_t wert) {
    Wire.beginTransmission(adr);
    Wire.write(reg);
    Wire.write(wert);
    return Wire.endTransmission() == 0;
}
static bool i2cLies(uint8_t adr, uint8_t reg, uint8_t* ziel, int n) {
    Wire.beginTransmission(adr);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) return false;
    if (Wire.requestFrom(adr, (uint8_t)n) != n) return false;
    for (int i = 0; i < n; i++) ziel[i] = Wire.read();
    return true;
}

// ---- SHT40 ----------------------------------------------------------------------------------------------
static uint8_t shtCrc(const uint8_t* d) {
    uint8_t c = 0xFF;
    for (int i = 0; i < 2; i++) {
        c ^= d[i];
        for (int k = 0; k < 8; k++) c = c & 0x80 ? (c << 1) ^ 0x31 : c << 1;
    }
    return c;
}

static bool klimaLesen() {
    Wire.beginTransmission(0x44);
    Wire.write(0xFD);                            // hohe Genauigkeit, ~8,3 ms
    if (Wire.endTransmission() != 0) return false;
    delay(10);
    uint8_t r[6];
    if (Wire.requestFrom((uint8_t)0x44, (uint8_t)6) != 6) return false;
    for (auto& b : r) b = Wire.read();
    if (shtCrc(r) != r[2] || shtCrc(r + 3) != r[5]) return false;
    klimaT = -45 + 175.0f * (r[0] << 8 | r[1]) / 65535.0f;
    klimaRf = constrain(-6 + 125.0f * (r[3] << 8 | r[4]) / 65535.0f, 0.1f, 100.0f);
    const float a = 17.62f, b = 243.12f;          // Magnus-Formel über Wasser
    float g = logf(klimaRf / 100.0f) + a * klimaT / (b + klimaT);
    klimaTp = b * g / (a - g);
    return true;
}

static int shtFehler = 0, lsmFehler = 0;
static uint32_t probeZuletzt = 0;

/** I2C-Bus lösen: hält ein Baustein SDA fest (13.11.2026 nach dem Anstecken: Akku, Klima und Bewegung eingefroren),
 *  helfen bis zu 9 Takte auf SCL und ein STOP, danach Wire neu starten. */
static void busRetten() {
    int sdaVorher = digitalRead(PIN_BFG_SDA);
    Wire.end();
    pinMode(PIN_BFG_SDA, INPUT_PULLUP);
    pinMode(PIN_BFG_SCL, OUTPUT_OPEN_DRAIN);
    for (int i = 0; i < 9 && digitalRead(PIN_BFG_SDA) == LOW; i++) {
        digitalWrite(PIN_BFG_SCL, LOW); delayMicroseconds(10);
        digitalWrite(PIN_BFG_SCL, HIGH); delayMicroseconds(10);
    }
    pinMode(PIN_BFG_SDA, OUTPUT_OPEN_DRAIN);          // STOP: SDA low → high, während SCL high ist
    digitalWrite(PIN_BFG_SDA, LOW); delayMicroseconds(10);
    digitalWrite(PIN_BFG_SDA, HIGH); delayMicroseconds(10);
    Wire.begin(PIN_BFG_SDA, PIN_BFG_SCL, 100000);
    Wire.beginTransmission(0x55);
    int akku = Wire.endTransmission();
    protokoll("I2C-Bus gerettet (SDA vorher %s): Akku-Chip %s", sdaVorher ? "frei" : "festgehalten", akku == 0 ? "antwortet" : "weiter stumm");
}

/** Fehler zählen und nur beim Wechsel ins Fahrtenschreiber (am 13.11. standen beide Sensoren nach dem Anstecken still) */
static void sensorStatus(const char* name, int& fehler, bool ok, int schwelle) {
    if (ok) {
        if (fehler >= schwelle) protokoll("%s antwortet wieder", name);
        fehler = 0;
        return;
    }
    if (++fehler == schwelle) {
        Wire.beginTransmission(0x55);
        int akku = Wire.endTransmission();
        protokoll("%s antwortet nicht (Akku-Chip: %s)", name, akku == 0 ? "ok" : "auch nicht");
    }
}

static void klimaMessen() {
    klimaZuletzt = millis();
    if (!shtDa) return;
    bool ok = klimaLesen();
    sensorStatus("Klima-Sensor", shtFehler, ok, 3);
    if (!ok) return;
    time_t s = time(nullptr);
    tm t;
    localtime_r(&s, &t);
    if (zeitGesetzt && t.tm_year > 120 && sdEin()) {
        char pfad[44];
        snprintf(pfad, sizeof pfad, "/ist/mess/klima-%04d-%02d-%02d.csv", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday);
        bool neu = !SD.exists(pfad);
        if (neu) { SD.mkdir("/ist"); SD.mkdir("/ist/mess"); }
        File f = SD.open(pfad, FILE_APPEND);
        if (f) {
            if (neu) f.println("zeit;temp;rf;taupunkt");
            f.printf("%02d:%02d;%.1f;%.0f;%.1f\n", t.tm_hour, t.tm_min, klimaT, klimaRf, klimaTp);
            f.close();
        }
    }
    bool beschlag = klimaT - klimaTp < 2.0f;
    if (beschlag != warnBeschlag) {
        warnBeschlag = beschlag;
        protokoll(beschlag ? "Warnung: Beschlag droht (%.1f °C, %.0f %%, Taupunkt %.1f °C)" : "Beschlag-Warnung vorbei (%.1f °C, %.0f %%, Taupunkt %.1f °C)",
                  klimaT, klimaRf, klimaTp);
    }
    bool laden = usbDa() && (klimaT < 0.0f || klimaT > 45.0f);
    if (laden != warnLaden) {
        warnLaden = laden;
        if (laden) protokoll("Warnung: zu %s zum Laden (%.1f °C)", klimaT < 0 ? "kalt" : "heiß", klimaT);
    }
}

// ---- LSM6DS3TR-C ----------------------------------------------------------------------------------------
static const uint8_t LSM = 0x6A;

static bool beschleunigung(float& x, float& y, float& z) {
    uint8_t r[6];
    if (!i2cLies(LSM, 0x28, r, 6)) return false;
    const float g = 0.061f / 1000;   // mg/LSB bei ±2 g
    x = (int16_t)(r[1] << 8 | r[0]) * g;
    y = (int16_t)(r[3] << 8 | r[2]) * g;
    z = (int16_t)(r[5] << 8 | r[4]) * g;
    return true;
}

static void bewegungInit() {
    pinMode(PIN_6D_INT, INPUT_PULLUP);
    uint8_t id = 0;
    lsmDa = i2cLies(LSM, 0x0F, &id, 1) && id == 0x6A;
    Wire.beginTransmission(0x44);
    shtDa = Wire.endTransmission() == 0;
    protokoll("Sensoren: Bewegung %s (WHO_AM_I %02X), Klima %s", lsmDa ? "LSM6DS3TR-C" : "fehlt", id, shtDa ? "SHT40" : "fehlt");
    if (!lsmDa) return;
    i2cSchreib(LSM, 0x12, 0x74);   // CTRL3_C: BDU, INT aktiv low, offener Drain, Adressen weiterzählen
    i2cSchreib(LSM, 0x10, 0x20);   // CTRL1_XL: 26 Hz, ±2 g
    i2cSchreib(LSM, 0x11, 0x00);   // CTRL2_G: Kreisel aus
    i2cSchreib(LSM, 0x15, 0x10);   // CTRL6_C: XL_HM_MODE = Stromsparmodus
    i2cSchreib(LSM, 0x5B, 0x01);   // WAKE_UP_THS: 1 × 31,25 mg (Minimum; Micro rüttelt beim Fahren nur ~21 mg, 62 mg weckte nicht, 13.11.2026)
    i2cSchreib(LSM, 0x5C, 0x00);   // WAKE_UP_DUR
    i2cSchreib(LSM, 0x58, 0x91);   // TAP_CFG: Interrupts an, Steigungsfilter, gehalten (LIR)
    i2cSchreib(LSM, 0x5E, 0x20);   // MD1_CFG: Wake-up auf INT1
    uint8_t q;
    i2cLies(LSM, 0x1B, &q, 1);     // anhängende Meldung löschen
    delay(120);                    // erste Messung abwarten (26 Hz)
    float x, y, z;
    if (beschleunigung(x, y, z)) protokoll("Bewegung: Lage x %.2f y %.2f z %.2f g, Betrag %.2f g", x, y, z, sqrtf(x * x + y * y + z * z));
}

/** Wake-up seit dem letzten Lesen? (löscht die gehaltene Meldung) */
static bool bewegtSeither() {
    uint8_t q = 0;
    return lsmDa && i2cLies(LSM, 0x1B, &q, 1) && (q & 0x08);
}


// Fenster-Statistik (2 s, ~20 Proben)
static float fSum = 0, fSum2 = 0, fX = 0, fY = 0, fZ = 0, lageX = 0, lageY = 0, lageZ = 0;
static int fN = 0;
static uint8_t fensterRuetteln[20];
static int fensterPos = 0;
static uint32_t fensterStart = 0;

static void fensterAuswerten() {
    if (fN < 5) { fN = 0; fSum = fSum2 = fX = fY = fZ = 0; return; }
    float m = fSum / fN, streu = sqrtf(fmaxf(0, fSum2 / fN - m * m));
    float mx = fX / fN, my = fY / fN, mz = fZ / fN;
    float lage = sqrtf((mx - lageX) * (mx - lageX) + (my - lageY) * (my - lageY) + (mz - lageZ) * (mz - lageZ));
    lageX = mx; lageY = my; lageZ = mz;
    fN = 0; fSum = fSum2 = fX = fY = fZ = 0;
    // ruhig 0 · rüttelt 1 · unruhig 2
    int art = streu < 0.015f ? 0 :   // unter 15 mg ruhig (Café-Tisch mit Tippen: 11 mg, Fahrten 21–25 mg)
              (streu < 0.15f && lage < 0.1f) ? 1 : 2;
    fensterRuetteln[fensterPos] = art == 1;
    fensterPos = (fensterPos + 1) % 20;
    if (art == 1) fahrtRuettelnZuletzt = millis();
    if (art == 2) {
        if (weckSperreBis < millis()) protokoll("getragen (Streuung %.0f mg, Lage %.2f g): Bewegungswecken 5 min aus", streu * 1000, lage);
        weckSperreBis = millis() + 300000;
    }
    int n = 0;
    for (auto r : fensterRuetteln) n += r;
    if (!fahrt && n >= 15) {
        fahrt = true;
        protokoll("Fahrt erkannt (Streuung %.0f mg, %d von 20 Fenstern rütteln)", streu * 1000, n);
        wantState = true;
    }
    if (fahrt && millis() - fahrtRuettelnZuletzt > 120000) {
        fahrt = false;
        protokoll("Fahrt vorbei (2 min ohne Rütteln)");
        memset(fensterRuetteln, 0, sizeof fensterRuetteln);
        wantState = true;
    }
    if (fahrt) aktiv();                           // während der Fahrt nicht schlummern
}

/** Aus loop() (wach) */
static void sensorenLoop() {
    // Klima jede Minute nur wach; im Schlummern misst schlafPruefen() alle 15 min (loop läuft auch zwischen zwei Schlafminuten)
    bool wach = usbDa() || millis() - letzteAktivitaet < 120000;
    if (shtDa && wach && (klimaZuletzt == 0 || millis() - klimaZuletzt > 60000)) klimaMessen();
    if (!lsmDa) return;
    static uint32_t zuletzt = 0, neuVersuch = 0;
    if (millis() - zuletzt < 100) return;
    zuletzt = millis();
    // Sicherheitsnetz: ohne Messwerte keine Fahrt (sonst bleibt er wach, bis der Akku leer ist)
    if (fahrt && probeZuletzt && millis() - probeZuletzt > 120000) {
        fahrt = false;
        protokoll("Fahrt beendet: seit 2 min keine Messwerte");
        wantState = true;
    }
    if (bewegtSeither()) bewegtZuletzt = millis();
    float x, y, z;
    bool ok = beschleunigung(x, y, z);
    sensorStatus("Bewegungssensor", lsmFehler, ok, 20);
    if (!ok) {
        if (lsmFehler >= 20 && millis() - neuVersuch > 30000) { neuVersuch = millis(); busRetten(); bewegungInit(); }
        return;
    }
    probeZuletzt = millis();
    float b = sqrtf(x * x + y * y + z * z);
    fSum += b; fSum2 += b * b; fX += x; fY += y; fZ += z; fN++;
    if (millis() - fensterStart >= 2000) { fensterStart = millis(); fensterAuswerten(); }
}

static uint32_t fehlalarme = 0;

/**
 * Nach dem Wecken durch Bewegung: ms lang messen, ohne Funk. Echt ist es, wenn es gleichmäßig rüttelt (Micro beim Fahren
 * ~21 mg Streuung) oder er bewegt/getragen wird; ein Stoß oder Tippen am selben Tisch (Café, 13.11.2026: 6 Wecker in
 * 25 min bei 31 mg Schwelle) ist nach einem Augenblick wieder ruhig. → true = ganz wach werden
 */
static bool bewegungPruefen(uint32_t ms, float* streuung) {
    float s = 0, s2 = 0, x0 = 0, y0 = 0, z0 = 0, lage = 0;
    int n = 0;
    uint32_t t0 = millis();
    while (millis() - t0 < ms) {
        float x, y, z;
        if (beschleunigung(x, y, z)) {
            float b = sqrtf(x * x + y * y + z * z);
            s += b; s2 += b * b;
            if (n == 0) { x0 = x; y0 = y; z0 = z; }
            lage = fmaxf(lage, sqrtf((x - x0) * (x - x0) + (y - y0) * (y - y0) + (z - z0) * (z - z0)));
            n++;
        }
        delay(38);                                  // ~26 Hz wie der Sensor
    }
    bewegtSeither();                                // gehaltene Meldung löschen
    if (n < 10) return true;                        // nichts gemessen: lieber wach werden
    float m = s / n, streu = sqrtf(fmaxf(0, s2 / n - m * m));
    if (streuung) *streuung = streu;
    return streu > 0.012f || lage > 0.15f;          // rüttelt wie im Auto oder wird bewegt
}

/** Vor dem Leichtschlaf: soll Bewegung wecken dürfen? (Meldung löschen, Leitung muss frei sein) */
static bool bewegungWecktGleich() {
    if (!lsmDa || millis() < weckSperreBis) return false;
    bewegtSeither();
    return digitalRead(PIN_6D_INT) == HIGH;
}
