/**
 * reTerminal Sticky – BLE-Durchstich (dünnes Terminal, die Handy-App ist der Zwilling)
 *
 * Die App schickt ein fertiges 1-bpp-Bild (800x480 = 48000 Byte), der Sticky zeigt es an und
 * meldet Tasten, Touch und Zustand zurück. Ohne Verbindung zeigt er die Visitenkarte.
 *
 * Protokoll „Sticky-BLE v1“ (siehe PROTOKOLL.md):
 *   Dienst   b1e50001-7374-6963-6b79-7465726d6e6c
 *   CMD      b1e50002-…  write / write-no-response   App → Gerät, Befehle und Bilddaten
 *   EVT      b1e50003-…  notify                     Gerät → App, JSON-Ereignisse
 *   STATE    b1e50004-…  read / notify              Gerät → App, JSON-Zustand
 *   AUDIO    b1e50005-…  notify                     Gerät → App, IMA-ADPCM 16 kHz (audio.h)
 *
 * Pins laut Schaltplan reTerminal_Sticky_Schematic_diagram_260609.pdf (Blatt SCH_TOP), Tasten am Gerät bestätigt:
 *   Tasten (aktiv low): KI GPIO4, UP GPIO5, DOWN GPIO6 · PWR_HOLD GPIO45 · Summer GPIO48
 *   Touch GT911: SCL GPIO2, SDA GPIO3, INT GPIO21, RST GPIO41, TP_PWR_EN GPIO42
 *   Akku BQ27220 (0x55): SCL GPIO0, SDA GPIO1 · CHARGE_STATE GPIO40 (low = lädt)
 *
 * Rücksichtsvoll funken: getrennt langsam werben (~600 ms), verbunden langes Intervall (150–200 ms,
 * Latenz 4). Nur während eines Bildes kurz schnell (7,5–15 ms, 2M PHY), danach wieder träge.
 */
#include <Seeed_GFX.h>
#include <font/GFXFF/FreeSansBold24pt7b.h>
#include <font/GFXFF/FreeSans12pt7b.h>
#include <NimBLEDevice.h>
#include <Wire.h>
#include "qrcode.h"
#include <esp_mac.h>

static const char* FW_VERSION = "0.17.0";

// ---- Visitenkarte -----------------------------------------------------------
static const char* NAME     = "Markus";
static const char* QR_TEXT  = "https://github.com/markussstaub-dot";
static const char* QR_LABEL = "github.com/markussstaub-dot";

// ---- Pins ------------------------------------------------------------------
static const int PIN_BTN_PWR  = 4;
static const int PIN_BTN_UP   = 5;
static const int PIN_BTN_DOWN = 6;
static const int PIN_PWR_HOLD = 45;
static const int PIN_TP_SCL = 2, PIN_TP_SDA = 3, PIN_TP_INT = 21, PIN_TP_RST = 41, PIN_TP_EN = 42;
static const int PIN_BFG_SCL = 0, PIN_BFG_SDA = 1;
static const int PIN_CHG_STATE = 40;
static const int PIN_BUZZER = 48;
// PWR_IN_VOLT = VIN_5V über Teiler 5,1k/5,1k, also ~2,5 V bei USB. Digital lag das genau an der Schwelle des ESP32-S3
// (0,75 × 3,3 V = 2,48 V) und las am PC-Port LOW. Darum per ADC (12.11.2026).
static const int PIN_USB = 9;
static bool usbDa() { return analogReadMilliVolts(PIN_USB) > 1500; }
// EN_BAT_CHGn → /CE des Laders BQ25616 (100k nach GND = lädt). GPIO39 ist aber MTCK mit internem Pull-up, das hob /CE
// an und der Akku lud nie (Markus, 12.11.2026: „lädt nicht“, 0 mA am Kabel). Darum aktiv LOW treiben, auch im Schlaf.
static const int PIN_CHG_EN_N = 39;
// Letzte Bedienung (Taste, Touch, Befehl der App außer Ping) – danach zählt die Schlummer-Frist (schlaf.h)
static volatile uint32_t letzteAktivitaet = 0, letzteTaste = 0;
static void aktiv() { letzteAktivitaet = millis(); }
static void protokoll(const char* fmt, ...);   // Fahrtenschreiber, fahrtenschreiber.h
static void statusPruefen(bool teil, bool erzwingen);   // Statuszeile, status.h
static void statusLaden();

// ---- BLE ---------------------------------------------------------------------
#define UUID_SVC   "b1e50001-7374-6963-6b79-7465726d6e6c"
#define UUID_CMD   "b1e50002-7374-6963-6b79-7465726d6e6c"
#define UUID_EVT   "b1e50003-7374-6963-6b79-7465726d6e6c"
#define UUID_STATE "b1e50004-7374-6963-6b79-7465726d6e6c"
#define UUID_AUDIO "b1e50005-7374-6963-6b79-7465726d6e6c"

enum : uint8_t { OP_IMG_BEGIN = 0x01, OP_IMG_DATA = 0x02, OP_IMG_END = 0x03, OP_PING = 0x10, OP_KARTE = 0x11,
                 OP_BB_INDEX = 0x13, OP_BB_MODUS = 0x14, OP_ZEIT = 0x15, OP_FAHRT_LAYOUT = 0x16,
                 OP_PUFFER_LISTE = 0x17, OP_PUFFER_HOLEN = 0x18, OP_PUFFER_LOESCHEN = 0x19, OP_HOME_VERSION = 0x1A };

// Verbindungsintervalle in 1,25-ms-Schritten
// Ruhe ohne Latenz: sonst dauert der Wechsel auf schnell mehrere Sekunden (gemessen 11.11.2026)
static const uint16_t SLOW_MIN = 80,  SLOW_MAX = 100, SLOW_LAT = 0, SLOW_TO = 400;   // 100–125 ms
static const uint16_t FAST_MIN = 6,   FAST_MAX = 12,  FAST_LAT = 0, FAST_TO = 400;   // 7,5–15 ms
// Werbeintervall in 0,625-ms-Schritten
static const uint16_t ADV_SLOW = 960;   // 600 ms
static const uint16_t ADV_FAST = 160;   // 100 ms, nach Tastendruck ohne Verbindung für 30 s

static const int W = 800, H = 480;
static const uint32_t IMG_BYTES = W / 8 * H;   // 48000

Seeed_GFX display(Seeed_Product::reTerminal_Sticky);
TwoWire wireTp = TwoWire(1);

static NimBLEServer* server;
static NimBLECharacteristic *chEvt, *chState;
static volatile bool connected = false;
static volatile bool appHoert = false;   // Abo auf AUDIO gesetzt, s. AboCb
static bool appDa() { return connected && appHoert; }
static volatile uint16_t connHandle = 0xFFFF;
static volatile uint16_t mtu = 23;
static volatile uint8_t phy = 1;
static volatile uint16_t connItvl = 0;

// Bildempfang (Puffer im PSRAM, befüllt im NimBLE-Task, angezeigt in loop()).
// rxBuf = Empfang, imgBuf = was die Seite gerade zeigt (für Teilbilder und zum Wiederherstellen nach Hinweisen)
static uint8_t* imgBuf;
static uint8_t* rxBuf;
static uint8_t* hinweisBuf;   // eigener Puffer für Einblendungen, damit sie kein ankommendes Bild in rxBuf zerschießen
static volatile uint16_t imgX = 0, imgY = 0, imgW = 800, imgH = 480;
static volatile uint32_t imgLen = 0, imgCrc = 0, imgGot = 0, imgT0 = 0, imgT1 = 0, imgFrames = 0;
static volatile uint16_t dleTx = 27, dleRx = 27;
static volatile bool imgActive = false, imgReady = false, imgFast = false;
static volatile int imgSpeichern = -1;   // >= 0: Bild als Bordbuch-Seite n speichern statt zeigen
static volatile int imgRueckSlot = -1;   // >= 0: Teilbild als Rückmeldung für den Offline-Betrieb speichern
static volatile int imgHome = -1;        // >= 0: Bild als Home-Bild n speichern (0 Karte, 1 Notiz-Seite, 2 Ziffern)
static char homeVersionNeu[24];
static volatile int bestellWunsch = -1;   // Zettel, den die App per Fernbedienung zeigen will
static volatile bool homeVersionDa = false;
static volatile bool wantFast = false, wantSlow = false, wantKarte = false, wantState = false;
static volatile uint32_t slowAt = 0;
static uint32_t advFastUntil = 0;
static const char* seite = "karte";
enum Modus { M_HOME = 0, M_BORDBUCH = 1, M_NOTIZ = 2, M_BESTELL = 3, M_KRITZEL = 4, M_APP = 5 };
static Modus modus = M_HOME;

// ---- Hilfen ------------------------------------------------------------------
static uint32_t crc32(const uint8_t* d, size_t n) {
    uint32_t c = 0xFFFFFFFF;
    for (size_t i = 0; i < n; i++) {
        c ^= d[i];
        for (int k = 0; k < 8; k++) c = (c >> 1) ^ (0xEDB88320 & (-(int32_t)(c & 1)));
    }
    return ~c;
}
static uint32_t rd32(const uint8_t* p) { return p[0] | p[1] << 8 | p[2] << 16 | (uint32_t)p[3] << 24; }
static uint16_t rd16(const uint8_t* p) { return p[0] | p[1] << 8; }

static void sendEvt(const char* json) {
    Serial.printf("EVT %s\n", json);
    if (!connected) return;
    // loop() und der BLE-Task senden beide: ohne Sperre überschreibt einer den Wert, während der andere ihn
    // verschickt (12.11.2026: „\0"t":"seite"…“ kam nach dem Aufwachen in der App an)
    static SemaphoreHandle_t sperre = xSemaphoreCreateMutex();
    xSemaphoreTake(sperre, portMAX_DELAY);
    chEvt->setValue((const uint8_t*)json, strlen(json));
    // Nach vielen Datenpaketen (Puffer-Abholung) ist der Sendepuffer voll: dann kurz warten statt die Meldung zu
    // verlieren (11.11.2026: „datei“-Abschluss kam nie an, die App wartete 60 s)
    for (int i = 0; i < 40 && !chEvt->notify(); i++) delay(10);
    xSemaphoreGive(sperre);
}

// ---- Akku (BQ27220) --------------------------------------------------------------
static bool bfgOk = false;
static int bfgRead16(uint8_t reg, int16_t& out) {
    Wire.beginTransmission(0x55);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) return -1;
    if (Wire.requestFrom(0x55, 2) != 2) return -1;
    out = Wire.read() | (Wire.read() << 8);
    return 0;
}
static int batPct = -1, batMv = -1, batMa = 0;
static bool laedt = false;
static void readBattery() {
    int16_t v;
    if (bfgRead16(0x2C, v) == 0) { batPct = v; bfgOk = true; }
    if (bfgRead16(0x08, v) == 0) batMv = (uint16_t)v;
    if (bfgRead16(0x0C, v) == 0) batMa = v;
    laedt = digitalRead(PIN_CHG_STATE) == LOW;
}

// ---- Touch (GT911) ---------------------------------------------------------------
static uint8_t tpAddr = 0;
// GT911-Konfiguration 0x8047–0x80FE aus der Werks-Firmware (Version 0x63, 480x800, 5 Finger). Nur Rückfall:
// Der Chip bringt eine eigene mit (0x41). Früher las sich 0 – der Chip war nach dem Reset noch nicht hochgefahren.
static const uint8_t GT911_CFG[184] = {
    0x63, 0xE0, 0x01, 0x20, 0x03, 0x05, 0x35, 0x00, 0x01, 0x0A, 0x28, 0x0F, 0x50, 0x3C, 0x03, 0x05,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17, 0x18, 0x1E, 0x14, 0x86, 0x27, 0x08, 0x33, 0x35,
    0x02, 0x08, 0x00, 0x00, 0x01, 0x02, 0x42, 0x1C, 0x00, 0x01, 0x00, 0x0F, 0x00, 0x2A, 0xFF, 0x7F,
    0x00, 0x46, 0x32, 0x28, 0x55, 0x94, 0xD5, 0x02, 0x07, 0x00, 0x00, 0x04, 0x90, 0x2B, 0x00, 0x80,
    0x32, 0x00, 0x71, 0x3A, 0x00, 0x65, 0x43, 0x00, 0x5B, 0x4F, 0x00, 0x5B, 0x00, 0x00, 0x00, 0x00,
    0xF0, 0x4A, 0x3A, 0xFF, 0xFF, 0x27, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x10, 0x0E, 0x0C, 0x0A, 0x08, 0x06, 0x04, 0x02, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x24, 0x22,
    0x21, 0x20, 0x1F, 0x1E, 0x1D, 0x0A, 0x08, 0x06, 0x04, 0x02, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
};
static uint16_t tpResX = 0, tpResY = 0;
static bool tpWrite(uint16_t reg, uint8_t val) {
    wireTp.beginTransmission(tpAddr);
    wireTp.write(reg >> 8); wireTp.write(reg & 0xFF); wireTp.write(val);
    return wireTp.endTransmission() == 0;
}
static bool tpRead(uint16_t reg, uint8_t* buf, uint8_t n) {
    wireTp.beginTransmission(tpAddr);
    wireTp.write(reg >> 8); wireTp.write(reg & 0xFF);
    if (wireTp.endTransmission(false) != 0) return false;
    if (wireTp.requestFrom((int)tpAddr, (int)n) != n) return false;
    for (int i = 0; i < n; i++) buf[i] = wireTp.read();
    return true;
}
static void tpDump(const char* wann) {
    uint8_t info[15] = {0}, cfg[6] = {0};
    bool ok1 = tpRead(0x8140, info, 15);       // ID, FW, Auflösung laut Chip, Vendor, Status
    bool ok2 = tpRead(0x8047, cfg, 6);         // Konfig: Version, X, Y, Finger
    Serial.printf("TP %s: ok=%d/%d id=%c%c%c fw=%02X%02X res=%ux%u vendor=%02X st=%02X | cfg ver=%02X %ux%u n=%u INT=%d\n",
                  wann, ok1, ok2, info[0], info[1], info[2], info[5], info[4], info[6] | info[7] << 8, info[8] | info[9] << 8,
                  info[10], info[14], cfg[0], cfg[1] | cfg[2] << 8, cfg[3] | cfg[4] << 8, cfg[5], digitalRead(PIN_TP_INT));
}
static void touchInit() {
    // sauberer Stromzyklus wie in der Werks-Firmware („power cycle GT911 controller“)
    pinMode(PIN_TP_RST, OUTPUT);
    pinMode(PIN_TP_INT, OUTPUT);
    digitalWrite(PIN_TP_RST, LOW);
    digitalWrite(PIN_TP_INT, LOW);
    pinMode(PIN_TP_EN, OUTPUT);
    digitalWrite(PIN_TP_EN, LOW);
    delay(50);
    digitalWrite(PIN_TP_EN, HIGH);
    delay(20);
    // Goodix-Reset: INT low während RST steigt → Adresse 0x5D, INT noch 50 ms halten, dann loslassen
    delay(10);
    digitalWrite(PIN_TP_RST, HIGH);
    delay(6);
    digitalWrite(PIN_TP_INT, LOW);
    delay(55);
    pinMode(PIN_TP_INT, INPUT);
    delay(100);
    wireTp.begin(PIN_TP_SDA, PIN_TP_SCL, 400000);
    for (uint8_t a : {0x5D, 0x14}) {
        wireTp.beginTransmission(a);
        if (wireTp.endTransmission() == 0) { tpAddr = a; break; }
    }
    if (!tpAddr) { Serial.println("Touch: kein GT911 gefunden"); return; }
    tpDump("nach Reset");
    // Der Chip hat eine eigene Konfiguration (Version 0x41). Nur wenn sie fehlt, die aus der Werks-Firmware schreiben.
    uint8_t ver = 0;
    tpRead(0x8047, &ver, 1);
    if (ver == 0) {
        // Konfiguration schreiben (in 16-Byte-Stücken), dann Prüfsumme und „neu“-Flag
        for (int off = 0; off < 184; off += 16) {
            int n = min(16, 184 - off);
            uint16_t reg = 0x8047 + off;
            wireTp.beginTransmission(tpAddr);
            wireTp.write(reg >> 8); wireTp.write(reg & 0xFF);
            wireTp.write(GT911_CFG + off, n);
            wireTp.endTransmission();
        }
        uint8_t sum = 0;
        for (int i = 0; i < 184; i++) sum += GT911_CFG[i];
        tpWrite(0x80FF, (uint8_t)(~sum + 1));
        tpWrite(0x8100, 1);
        delay(200);
        tpDump("nach Konfig");
    }
    tpWrite(0x8040, 0);                       // Befehl: normaler Lesemodus
    tpWrite(0x814E, 0);                       // Statuspuffer leeren, sonst bleibt er stehen
    delay(20);
    uint8_t id[4] = {0}, cfg[4] = {0};
    tpRead(0x8140, id, 4);
    tpRead(0x8048, cfg, 4);
    tpResX = cfg[0] | cfg[1] << 8;
    tpResY = cfg[2] | cfg[3] << 8;
    Serial.printf("Touch: GT%c%c%c%c an 0x%02X, %ux%u\n", id[0], id[1], id[2], id[3] ? id[3] : ' ', tpAddr, tpResX, tpResY);
}
// GT911 liefert hochkant (480x800); x/y im Querformat des Displays (am Gerät geprüft 11.11.2026), rx/ry = roh
static void bbTouch(int x, int y);
static void pufferTouch(int x, int y);
static void rahmenAntippen(int x, int y);
static void kritzelPunkt(int x, int y, bool neu);
static void kritzelLos();
static uint64_t jetztMs();
static void sendTouch(const char* a, int x, int y) {
    aktiv();
    int dx = 799 - y, dy = 479 - x;
    if (a[0] == 'd') { rahmenAntippen(dx, dy); bbTouch(dx, dy); pufferTouch(dx, dy); }
    char j[128];
    snprintf(j, sizeof j, "{\"t\":\"touch\",\"a\":\"%s\",\"x\":%d,\"y\":%d,\"rx\":%d,\"ry\":%d,\"ms\":%llu}", a, dx, dy, x, y, (unsigned long long)jetztMs());
    sendEvt(j);
}
static bool tpDown = false;
static int tpLastX = 0, tpLastY = 0;
static volatile bool kzAn;   // Kritzelblock: eigene Aufgabe liest den Touch (modus.h)
static void touchPoll() {
    if (!tpAddr || kzAn) return;
    uint8_t st;
    static int tpFehler = 0;
    if (!tpRead(0x814E, &st, 1)) { if (++tpFehler % 200 == 1) Serial.println("Touch: Lesefehler"); return; }
    if (!(st & 0x80)) return;                 // keine neuen Daten
    uint8_t n = st & 0x0F;
    if (n > 0) {
        uint8_t p[7];
        tpRead(0x814F, p, 7);                  // id, x lo/hi, y lo/hi, size lo/hi
        int x = p[1] | p[2] << 8, y = p[3] | p[4] << 8;
        tpLastX = x; tpLastY = y;
        if (!tpDown) {
            tpDown = true;
            sendTouch("down", x, y);
        }
    } else if (tpDown) {
        tpDown = false;
        sendTouch("up", tpLastX, tpLastY);
    }
    tpWrite(0x814E, 0);                       // Puffer quittieren
}

// ---- Tasten ------------------------------------------------------------------
// Tasten: Abfrage in loop() plus Interrupt, der einen Druck festhält. Während eines E-Paper-Refreshs (bis 2,3 s)
// steht loop(); ein kurzer Druck in dieser Zeit ging sonst verloren („Navigation hakt“, 11.11.2026).
struct Taste { int pin; const char* name; int ruhe; int stand; uint32_t seit; volatile bool gedrueckt; };
static Taste tasten[] = { {PIN_BTN_PWR, "ki"}, {PIN_BTN_UP, "up"}, {PIN_BTN_DOWN, "down"} };

static void IRAM_ATTR tasteIsr(void* arg) { ((Taste*)arg)->gedrueckt = true; }
static void tastenInit() {
    for (auto& t : tasten) pinMode(t.pin, INPUT_PULLUP);
    delay(5);
    // Ruhepegel beim Start lernen (der Einschaltknopf kann aktiv-high sein)
    for (auto& t : tasten) {
        t.ruhe = digitalRead(t.pin);
        t.stand = t.ruhe;
        t.seit = millis();
        Serial.printf("Taste %s GPIO%d Ruhepegel %d\n", t.name, t.pin, t.ruhe);
        t.gedrueckt = false;
        attachInterruptArg(digitalPinToInterrupt(t.pin), tasteIsr, &t, t.ruhe == HIGH ? FALLING : RISING);
    }
}
static void startAdvertising(bool schnell);
static void tasteAktion(const char* name, bool gedrueckt);
static void tastenPoll() {
    for (auto& t : tasten) {
        int v = digitalRead(t.pin);
        if (v != t.ruhe || t.gedrueckt) { aktiv(); letzteTaste = millis(); }
        // Druck, der komplett in eine Blockade fiel (gedrückt und wieder los, ohne dass loop() lief): nachholen
        if (t.gedrueckt && v == t.ruhe && t.stand == t.ruhe) {
            t.gedrueckt = false;
            char j[80];
            snprintf(j, sizeof j, "{\"t\":\"key\",\"k\":\"%s\",\"a\":\"down\",\"nachgeholt\":true}", t.name);
            sendEvt(j);
            tone(PIN_BUZZER, 2700, 30);
            if (!connected) startAdvertising(true);
            protokoll("Taste %s (nachgeholt)", t.name);
            tasteAktion(t.name, true);
            snprintf(j, sizeof j, "{\"t\":\"key\",\"k\":\"%s\",\"a\":\"up\"}", t.name);
            sendEvt(j);
            tasteAktion(t.name, false);
            t.seit = millis();
            continue;
        }
        if (v == t.stand) continue;
        if (millis() - t.seit < 30) continue;  // entprellen
        t.stand = v;
        t.seit = millis();
        bool gedrueckt = v != t.ruhe;
        t.gedrueckt = false;   // regulär erkannt, nicht noch einmal nachholen
        char j[64];
        snprintf(j, sizeof j, "{\"t\":\"key\",\"k\":\"%s\",\"a\":\"%s\"}", t.name, gedrueckt ? "down" : "up");
        sendEvt(j);
        if (gedrueckt) protokoll("Taste %s", t.name);
        if (gedrueckt) tone(PIN_BUZZER, 2700, 30);   // kurzer Klick als Rückmeldung am Gerät
        if (gedrueckt && !connected) startAdvertising(true);
        tasteAktion(t.name, gedrueckt);
    }
}

// ---- Display -------------------------------------------------------------------
static int qrX0, qrY0;
static const int QR_AREA = 420;
static void drawQr(esp_qrcode_handle_t qr) {
    const int n = esp_qrcode_get_size(qr);
    const int scale = QR_AREA / (n + 4);
    const int px = n * scale;
    const int x0 = qrX0 + (QR_AREA - px) / 2, y0 = qrY0 + (QR_AREA - px) / 2;
    for (int y = 0; y < n; y++)
        for (int x = 0; x < n; x++)
            if (esp_qrcode_get_module(qr, x, y)) display.fillRect(x0 + x * scale, y0 + y * scale, scale, scale, TFT_BLACK);
}
static void zeichneKarte() {   // nur in den Bildpuffer, ohne Refresh
    display.fillScreen(TFT_WHITE);
    qrX0 = W - QR_AREA - 30;
    qrY0 = (H - QR_AREA) / 2;
    esp_qrcode_config_t cfg = ESP_QRCODE_CONFIG_DEFAULT();
    cfg.display_func = drawQr;
    cfg.max_qrcode_version = 10;
    cfg.qrcode_ecc_level = ESP_QRCODE_ECC_MED;
    esp_qrcode_generate(&cfg, QR_TEXT);
    const int leftW = qrX0 - 20;
    display.setTextColor(TFT_BLACK);
    display.setTextDatum(MC_DATUM);
    display.setFreeFont(&FreeSansBold24pt7b);
    display.setTextSize(2);
    display.drawString(NAME, leftW / 2 + 10, H / 2 - 30);
    display.setTextSize(1);
    display.fillRect(40, H / 2 + 40, leftW - 60, 4, TFT_BLACK);
    display.setFreeFont(&FreeSans12pt7b);
    display.drawString("Scan mich", leftW / 2 + 10, H / 2 + 80);
    display.setFreeFont(nullptr);
    display.drawString(QR_LABEL, leftW / 2 + 10, H / 2 + 115, 2);
}
static void zeigeKarte() {
    zeichneKarte();
    display.update();
    seite = "karte";
}

#include <LittleFS.h>
#include <vector>
#include "karte.h"
#include "ablage.h"
#include "bordbuch.h"
#include "puffer.h"
#include "audio.h"
#include "modus.h"
#include "fahrtenschreiber.h"
#include "abgleich.h"
#include "sensoren.h"

// ---- Zustand -------------------------------------------------------------------
static void sendState() {
    readBattery();
    char j[480];
    snprintf(j, sizeof j,
             "{\"fw\":\"%s\",\"seite\":\"%s\",\"bat\":%d,\"mv\":%d,\"ma\":%d,\"chg\":%s,\"mtu\":%u,\"phy\":%u,\"itvl\":%u,\"tp\":\"%ux%u\",\"fahrtv\":\"%08lx\",\"offen\":%d,\"uhr\":%s,\"modus\":\"%s\",\"homev\":\"%s\",\"usb\":%s,\"bb\":%d,\"zettel\":%d,\"temp\":%.1f,\"rf\":%.0f,\"taupunkt\":%.1f,\"fahrt\":%s,\"sensoren\":\"%s%s\"}",
             FW_VERSION, seite, batPct, batMv, batMa, laedt ? "true" : "false", mtu, phy, connItvl, tpResX, tpResY,
             (unsigned long)fahrtVersion, offeneNotizen, rtcDa ? "true" : "false",
             modusName(), homeVersion, usbDa() ? "true" : "false", bbAktuell, bestellAktuell,
             isnan(klimaT) ? -99.0f : klimaT, isnan(klimaRf) ? -1.0f : klimaRf, isnan(klimaTp) ? -99.0f : klimaTp,
             fahrt ? "true" : "false", lsmDa ? "b" : "", shtDa ? "k" : "");
    if (connected && chState) {
        chState->setValue((const uint8_t*)j, strlen(j));
        chState->notify();
    }
    Serial.printf("STATE %s\n", j);
}

// ---- BLE-Rückrufe ----------------------------------------------------------------
class ServerCb : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* s, NimBLEConnInfo& ci) override {
        connected = true;
        connHandle = ci.getConnHandle();
        mtu = ci.getMTU();
        connItvl = ci.getConnInterval();
        Serial.printf("Verbunden mit %s, Intervall %u\n", ci.getAddress().toString().c_str(), connItvl);
        protokoll("verbunden");
        s->updatePhy(connHandle, BLE_GAP_LE_PHY_2M_MASK, BLE_GAP_LE_PHY_2M_MASK, 0);
        s->setDataLen(connHandle, 251);
        // gleich nach dem Verbinden fragt die App nach Zustand/Dienst → kurz schnell, dann träge
        wantFast = true;
        slowAt = millis() + 4000;
        wantState = true;
    }
    void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int reason) override {
        connected = false;
        appHoert = false;
        connHandle = 0xFFFF;
        imgActive = false;
        Serial.printf("Getrennt (Grund 0x%02X)\n", reason);
        protokoll("getrennt (Grund 0x%02X)", reason);
        startAdvertising(false);
    }
    void onMTUChange(uint16_t m, NimBLEConnInfo&) override {
        mtu = m;
        Serial.printf("MTU %u\n", m);
    }
    void onConnParamsUpdate(NimBLEConnInfo& ci) override {
        connItvl = ci.getConnInterval();
        Serial.printf("Intervall %u (%.1f ms), Latenz %u\n", connItvl, connItvl * 1.25f, ci.getConnLatency());
        char j[48];
        snprintf(j, sizeof j, "{\"t\":\"itvl\",\"v\":%u,\"lat\":%u}", connItvl, ci.getConnLatency());
        sendEvt(j);   // die App wartet darauf, bevor sie ein Bild streamt
    }
    void onPhyUpdate(NimBLEConnInfo&, uint8_t tx, uint8_t rx) override {
        phy = tx;
        Serial.printf("PHY tx %u rx %u\n", tx, rx);
    }
};

// Hört die App zu? Seit dem Wecker (StickyDienst) hält das Fold auch ohne App eine GATT-Verbindung: „connected“
// allein heißt nicht mehr, dass jemand Audio abnimmt (13.11.2026: drei Diktate mit „err mtu“ verloren statt gepuffert).
// Maßstab ist das Abo auf AUDIO, das nur die App setzt.
class AboCb : public NimBLECharacteristicCallbacks {
    void onSubscribe(NimBLECharacteristic*, NimBLEConnInfo&, uint16_t sub) override {
        appHoert = sub != 0;
        Serial.printf("App %s\n", appHoert ? "hört zu" : "hört nicht mehr zu");
        protokoll("App %s", appHoert ? "hört zu" : "hört nicht mehr zu");
    }
};

class CmdCb : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
        NimBLEAttValue v = c->getValue();
        const uint8_t* d = v.data();
        size_t n = v.length();
        if (n < 1) return;
        if (d[0] != OP_PING) aktiv();
        if (abgleichBefehl(d, n)) return;
        switch (d[0]) {
        case OP_IMG_BEGIN: { // 01 fmt w16 h16 len32 crc32 [x16 y16] – mit x/y ein Teilbild (x, w Vielfache von 8)
            if (n < 14) return;
            uint16_t w = rd16(d + 2), h = rd16(d + 4);
            uint16_t x = n >= 18 ? rd16(d + 14) : 0, y = n >= 18 ? rd16(d + 16) : 0;
            imgLen = rd32(d + 6);
            imgCrc = rd32(d + 10);
            if (d[1] != 0 || w == 0 || h == 0 || (w & 7) || (x & 7) || x + w > W || y + h > H || imgLen != (uint32_t)w / 8 * h) {
                sendEvt("{\"t\":\"img\",\"ok\":false,\"err\":\"format\"}");
                return;
            }
            imgX = x; imgY = y; imgW = w; imgH = h;
            imgGot = 0;
            imgFrames = 0;
            imgT0 = millis();
            imgActive = true;
            if (imgLen > 4000) { wantFast = true; slowAt = 0; }   // kleine Teilbilder gehen auch im Ruhetakt schnell genug
            break;
        }
        case OP_IMG_DATA: {  // 02 off32 bytes…
            if (!imgActive || n < 5) return;
            imgFrames++;
            uint32_t off = rd32(d + 1);
            size_t k = n - 5;
            if (off + k > imgLen) return;
            memcpy(rxBuf + off, d + 5, k);
            if (off + k > imgGot) imgGot = off + k;
            break;
        }
        case OP_IMG_END:     // 03 modus (0 = voll, 1 = schnell)
            if (!imgActive) return;
            imgActive = false;
            imgT1 = millis();
            imgFast = n > 1 && d[1] == 1;
            imgSpeichern = (n > 2 && d[1] == 3) ? d[2] : -1;   // Modus 3: als Bordbuch-Seite d[2] speichern
            imgRueckSlot = (n > 2 && d[1] == 4) ? d[2] : -1;   // Modus 4: Teilbild als Rückmeldung d[2] speichern
            imgHome = (n > 2 && d[1] == 5) ? d[2] : -1;        // Modus 5: Home-Bild d[2] speichern (3–8 Bestellzettel und Karten)
            imgReady = true;
            break;
        case OP_PING:
            sendEvt("{\"t\":\"pong\"}");
            wantState = true;
            break;
        case OP_KARTE:
            wantKarte = true;
            break;
        case OP_BB_INDEX:    // 13 Text (Zeilen „seiten=N“, „toc=K“, „e y0 y1 seite“)
            if (n - 1 < sizeof bbIndexNeu) { memcpy(bbIndexNeu, d + 1, n - 1); bbIndexNeu[n - 1] = 0; bbIndexDa = true; }
            break;
        case OP_ZEIT:        // 15 unix-ms:u64
            if (n >= 9) { uint64_t ms = 0; for (int i = 7; i >= 0; i--) ms = ms << 8 | d[1 + i]; zeitSetzen(ms); }
            break;
        case OP_FAHRT_LAYOUT: // 16 Text „e x0 y0 x1 y1 Name“ je Streifen
            if (n - 1 < sizeof fahrtLayoutNeu) { memcpy(fahrtLayoutNeu, d + 1, n - 1); fahrtLayoutNeu[n - 1] = 0; fahrtLayoutDa = true; }
            break;
        case OP_PUFFER_LISTE:
            listeWunsch = true;
            break;
        case OP_PUFFER_HOLEN:      // 18 offset:u32 Name → ein Stück auf DATEI
            if (n > 5 && n - 5 < 40) {
                holOffset = rd32(d + 1);
                memcpy(holName, d + 5, n - 5); holName[n - 5] = 0;
                if (!strchr(holName, '/')) holWunsch = true;
            }
            break;
        case OP_PUFFER_LOESCHEN:   // 19 Name
            if (n > 1 && n - 1 < 40) {
                memcpy(loeschName, d + 1, n - 1); loeschName[n - 1] = 0;
                if (!strchr(loeschName, '/')) loeschWunsch = true;
            }
            break;
        case OP_BB_MODUS:    // 14 modus [seite] – 0 Home, 1 Bordbuch, 2 Notiz
            // Fernbedienung aus der App: Modus und optional Seite (Bordbuch) bzw. Zettel (Bestellen)
            if (n > 1 && d[1] <= 5) {
                modusWunsch = d[1];
                if (n > 2 && d[1] == M_BESTELL) bestellWunsch = d[2];
                else if (n > 2) bbWunsch = d[2];
            }
            break;
        case OP_HOME_VERSION: // 1A Text
            if (n > 1 && n - 1 < sizeof homeVersionNeu) { memcpy(homeVersionNeu, d + 1, n - 1); homeVersionNeu[n - 1] = 0; homeVersionDa = true; }
            break;
        }
    }
};

static void startAdvertising(bool schnell) {
    NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
    adv->stop();
    // Am USB-Kabel (fester Platz im Microlino) ist Strom da: dann immer schnell erreichbar
    uint16_t i = (schnell || usbDa()) ? ADV_FAST : ADV_SLOW;
    adv->setMinInterval(i);
    adv->setMaxInterval(i + 32);
    adv->start();
    advFastUntil = schnell ? millis() + 30000 : 0;
    Serial.printf("Werbung %s\n", schnell ? "schnell (30 s)" : "langsam");
}

// Meldet, ob die Datenlängen-Erweiterung (bis 251 Byte pro Funkpaket) wirklich ausgehandelt wurde
static int gapHook(ble_gap_event* e, void*) {
    if (e->type == BLE_GAP_EVENT_DATA_LEN_CHG) {
        dleTx = e->data_len_chg.max_tx_octets;
        dleRx = e->data_len_chg.max_rx_octets;
        Serial.printf("DLE tx %u rx %u\n", dleTx, dleRx);
    }
    return 0;
}

static void bleInit() {
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_BT);
    char name[16];
    snprintf(name, sizeof name, "Sticky-%02X%02X", mac[4], mac[5]);
    NimBLEDevice::init(name);
    NimBLEDevice::setPower(3);               // dBm, reicht für den Tisch
    NimBLEDevice::setMTU(517);
    NimBLEDevice::setDefaultPhy(BLE_GAP_LE_PHY_2M_MASK | BLE_GAP_LE_PHY_1M_MASK,
                                BLE_GAP_LE_PHY_2M_MASK | BLE_GAP_LE_PHY_1M_MASK);
    NimBLEDevice::setCustomGapHandler(gapHook);
    server = NimBLEDevice::createServer();
    server->setCallbacks(new ServerCb());
    server->advertiseOnDisconnect(false);
    NimBLEService* svc = server->createService(UUID_SVC);
    NimBLECharacteristic* cmd = svc->createCharacteristic(UUID_CMD, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR, 512);
    cmd->setCallbacks(new CmdCb());
    chEvt = svc->createCharacteristic(UUID_EVT, NIMBLE_PROPERTY::NOTIFY);
    chState = svc->createCharacteristic(UUID_STATE, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
    chAudio = svc->createCharacteristic(UUID_AUDIO, NIMBLE_PROPERTY::NOTIFY);
    chAudio->setCallbacks(new AboCb());
    chDatei = svc->createCharacteristic(UUID_DATEI, NIMBLE_PROPERTY::NOTIFY);
    svc->start();
    NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
    adv->addServiceUUID(UUID_SVC);
    adv->setName(name);
    adv->enableScanResponse(false);
    Serial.printf("BLE: %s\n", name);
    startAdvertising(false);
}

#include "schlaf.h"
#include "status.h"

// ---- Ablauf ----------------------------------------------------------------------
void setup() {
    setCpuFrequencyMhz(80);                    // reicht für BLE, Display und ADPCM; spart Strom gegenüber 240 MHz
    pinMode(PIN_PWR_HOLD, OUTPUT);
    digitalWrite(PIN_PWR_HOLD, HIGH);          // Selbsthaltung, sonst geht er im Akkubetrieb aus
    Serial.begin(115200);
    delay(300);
    Serial.printf("\nSticky BLE-Durchstich %s\n", FW_VERSION);

    int ceVorher = digitalRead(PIN_CHG_EN_N);
    pinMode(PIN_CHG_EN_N, OUTPUT);
    digitalWrite(PIN_CHG_EN_N, LOW);           // Laden erlauben
    pinMode(PIN_CHG_STATE, INPUT_PULLUP);
    pinMode(PIN_USB, INPUT);
    analogSetPinAttenuation(PIN_USB, ADC_11db);
    delay(50);
    Serial.printf("Laden: /CE vorher %d, jetzt 0 · USB %d mV\n", ceVorher, analogReadMilliVolts(PIN_USB));
    Wire.begin(PIN_BFG_SDA, PIN_BFG_SCL, 100000);
    readBattery();
    zeitInit();
    bewegungInit();
    Serial.printf("Akku: %s %d %% %d mV %d mA %s\n", bfgOk ? "BQ27220" : "nicht gefunden", batPct, batMv, batMa, laedt ? "lädt" : "");

    imgBuf = (uint8_t*)ps_malloc(IMG_BYTES);
    rxBuf = (uint8_t*)ps_malloc(IMG_BYTES);
    hinweisBuf = (uint8_t*)ps_malloc(IMG_BYTES);
    if (!imgBuf || !rxBuf || !hinweisBuf) Serial.println("Kein PSRAM!");

    if (!display.begin()) {
        Serial.println(display.lastResult().message);
    } else {
        display.fillScreen(TFT_WHITE);
        display.refresh();
        delay(300);
    }
    // Tasten und Touch erst nach display.begin(): vorher eingerichtet, kamen keine Tastendrücke an (11.11.2026)
    bbInit();
    sdStart();
    bbIndexLaden();
    pufferInit();
    homeInit();
    tastenInit();
    touchInit();
    micSelbsttest();
    bleInit();
    setzeModus(M_HOME);
    aktiv();
    protokoll("Start FW %s · Grund %d · Akku %d %% · Karte %s · Uhr %s", FW_VERSION, (int)esp_reset_reason(), batPct,
              sdEingebunden ? "ja" : "nein", zeitGesetzt ? "gestellt" : "nicht gestellt");
}

void loop() {
    if (wantFast && connected) {
        wantFast = false;
        server->updateConnParams(connHandle, FAST_MIN, FAST_MAX, FAST_LAT, FAST_TO);
    }
    if (slowAt && millis() > slowAt && connected && !imgActive && !audioLaeuft) {
        slowAt = 0;
        server->updateConnParams(connHandle, SLOW_MIN, SLOW_MAX, SLOW_LAT, SLOW_TO);
    }
    if (imgReady) {
        imgReady = false;
        uint32_t empfang = imgT1 - imgT0;
        bool ok = imgGot == imgLen && crc32(rxBuf, imgLen) == imgCrc;
        bool teil = !(imgX == 0 && imgY == 0 && imgW == W && imgH == H);
        if (!teil || slowAt) slowAt = millis() + 1500;   // nach dem Bild wieder träge
        if (!ok) {
            char j[96];
            protokoll("Bild: CRC-Fehler (%lu von %lu Byte)", (unsigned long)imgGot, (unsigned long)imgLen);
            snprintf(j, sizeof j, "{\"t\":\"img\",\"ok\":false,\"err\":\"crc\",\"got\":%lu,\"ms\":%lu}", (unsigned long)imgGot, (unsigned long)empfang);
            sendEvt(j);
        } else {
            uint32_t t0 = millis();
            if (imgRueckSlot >= 0) {
                bool gut = teil && rueckSpeichern(imgRueckSlot, rxBuf, imgX, imgY, imgW, imgH);
                char j[96];
                snprintf(j, sizeof j, "{\"t\":\"img\",\"ok\":%s,\"rueck\":%d}", gut ? "true" : "false", imgRueckSlot);
                imgRueckSlot = -1;
                sendEvt(j);
                goto fertig;
            }
            if (imgHome >= 0) {
                bool gut = !teil && imgHome <= 8 && homeSpeichern(imgHome, rxBuf);
                char j[96];
                snprintf(j, sizeof j, "{\"t\":\"img\",\"ok\":%s,\"home\":%d}", gut ? "true" : "false", imgHome);
                imgHome = -1;
                sendEvt(j);
                goto fertig;
            }
            if (imgSpeichern >= 0) {
                bool gut = !teil && bbSpeichern(imgSpeichern, rxBuf);
                char j[96];
                snprintf(j, sizeof j, "{\"t\":\"img\",\"ok\":%s,\"gespeichert\":%d,\"ms\":%lu}", gut ? "true" : "false", imgSpeichern, (unsigned long)empfang);
                imgSpeichern = -1;
                sendEvt(j);
                goto fertig;
            }
            if (bordbuch) {
                // Im Bordbuch nichts überzeichnen (Rückmeldungen gehören zu Home/Notiz)
            } else if (teil) {
                // Teilbild in die gemerkte Seite einsetzen (zeilenweise, x und w sind Byte-genau) und nur den Bereich auffrischen
                for (int r = 0; r < imgH; r++) memcpy(imgBuf + (imgY + r) * (W / 8) + imgX / 8, rxBuf + r * (imgW / 8), imgW / 8);
                display.drawBitmap(imgX, imgY, rxBuf, imgW, imgH, TFT_BLACK, TFT_WHITE);
                display.updatePartial(imgX, imgY, imgW, imgH);
            } else {
                memcpy(imgBuf, rxBuf, IMG_BYTES);
                display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
                if (imgFast) display.updateFast(); else display.update();
                seite = "bild";
            }
            char j[192];
            snprintf(j, sizeof j, "{\"t\":\"img\",\"ok\":true,\"ms\":%lu,\"show\":%lu,\"mtu\":%u,\"phy\":%u,\"n\":%lu,\"dle\":%u,\"teil\":%s}",
                     (unsigned long)empfang, (unsigned long)(millis() - t0), mtu, phy, (unsigned long)imgFrames, dleTx, teil ? "true" : "false");
            sendEvt(j);
            wantState = true;
        }
        fertig:;
    }
    if (wantKarte) {
        wantKarte = false;
        modusWunsch = M_HOME;
    }
    if (homeVersionDa) {
        homeVersionDa = false;
        sollSchreiben("home/version.txt", (const uint8_t*)homeVersionNeu, strlen(homeVersionNeu));
        strlcpy(homeVersion, homeVersionNeu, sizeof homeVersion);
        bestellZaehlen();
        if (modus == M_HOME) setzeModus(M_HOME);     // neue Karte gleich zeigen
        wantState = true;
    }
    static uint32_t lastState = 0;
    if (wantState || (connected && millis() - lastState > 30000)) {
        wantState = false;
        lastState = millis();
        sendState();
    }
    if (advFastUntil && millis() > advFastUntil && !connected) startAdvertising(false);

    tastenPoll();
    modusLoop();
    audioLoop();
    bbLoop();
    pufferLoop();
    abgleichLoop();
    protokollLoop();
    sensorenLoop();
    static uint32_t lastTp = 0;
    if (touchAn && millis() - lastTp > 25) { lastTp = millis(); touchPoll(); }
    schlafPruefen();
    delay(5);
}
