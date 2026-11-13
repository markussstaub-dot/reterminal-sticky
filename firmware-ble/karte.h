// ---- microSD als Puffer-Ablage (Markus, 13.11.2026: 32-GB-Karte eingesteckt) -----------------------------
// Laut Schaltplan (Blatt USB&POGOPIN&MicroSD) im SPI-Modus am selben Bus wie das E-Paper: SCK GPIO13, MOSI GPIO14,
// MISO GPIO12, CS GPIO8. Strom über SD_PWR_EN GPIO10 (HIGH = an, 100k nach GND), Kartenerkennung GPIO11 (LOW = steckt,
// interner Pull-up, R45 nicht bestückt).
// Wie im Seeed-Beispiel für den E1001: dieselbe SPIClass wie das Display (nicht neu starten!), die Transaktionen
// sperren den Bus gegenseitig. Offline-Diktate und -Notizen landen auf der Karte, ohne Karte wie bisher im Flash.
// Vor dem Leichtschlaf wird die Karte stromlos, beim nächsten Zugriff wieder eingebunden.
#include <SD.h>
#include <SPI.h>
#include "bus/Bus_SPI.h"

static const int PIN_SD_CS = 8, PIN_SD_PWR = 10, PIN_SD_DET = 11;
static bool sdEingebunden = false;

static bool sdSteckt() { return digitalRead(PIN_SD_DET) == LOW; }

static bool sdEin() {
    if (sdEingebunden) return true;
    if (!sdSteckt()) return false;
    SPIClass* spi = static_cast<Bus_SPI&>(display.panel().driver().bus()).spiInstance();
    if (!spi) return false;
    digitalWrite(PIN_SD_PWR, HIGH);
    delay(20);
    sdEingebunden = SD.begin(PIN_SD_CS, *spi, 20000000, "/sd", 5);
    if (!sdEingebunden) { digitalWrite(PIN_SD_PWR, LOW); Serial.println("SD: Einbinden fehlgeschlagen"); }
    return sdEingebunden;
}

static void sdAus() {
    if (!sdEingebunden) return;
    SD.end();
    digitalWrite(PIN_SD_PWR, LOW);
    digitalWrite(PIN_SD_CS, HIGH);
    sdEingebunden = false;
}

/** Ablage für den Puffer: SD, wenn eine Karte steckt und sich einbinden lässt, sonst der Flash */
static fs::FS& pfs() { return sdEin() ? (fs::FS&)SD : (fs::FS&)LittleFS; }

/** Nach display.begin(): Pins einrichten, Karte einbinden, Reste aus dem Flash-Puffer auf die Karte umziehen */
static void sdStart() {
    pinMode(PIN_SD_CS, OUTPUT);
    digitalWrite(PIN_SD_CS, HIGH);
    pinMode(PIN_SD_PWR, OUTPUT);
    pinMode(PIN_SD_DET, INPUT_PULLUP);
    delay(5);
    if (!sdEin()) { Serial.printf("SD: %s, Puffer im Flash\n", sdSteckt() ? "nicht lesbar" : "keine Karte"); return; }
    Serial.printf("SD: %llu MB, belegt %llu MB, Puffer auf der Karte\n", SD.totalBytes() >> 20, SD.usedBytes() >> 20);
    SD.mkdir("/puffer");
    File d = LittleFS.open("/puffer");
    if (!d) return;
    static uint8_t buf[512];
    int n = 0;
    for (File f = d.openNextFile(); f; f = d.openNextFile()) {
        String name = String(f.name());
        String ziel = "/puffer/" + name;
        File z = SD.open(ziel, name.endsWith(".jsonl") ? FILE_APPEND : FILE_WRITE);
        bool ok = (bool)z;
        while (ok && f.available()) { int k = f.read(buf, sizeof buf); ok = k > 0 && z.write(buf, k) == (size_t)k; }
        if (z) z.close();
        f.close();
        if (ok) { LittleFS.remove("/puffer/" + name); n++; }
    }
    if (n) Serial.printf("SD: %d Puffer-Dateien aus dem Flash umgezogen\n", n);
}
