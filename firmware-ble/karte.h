// ---- microSD (Markus, 13.11.2026: 32-GB-Karte eingesteckt) -----------------------------------------------
// Laut Schaltplan (Blatt USB&POGOPIN&MicroSD) im SPI-Modus am selben Bus wie das E-Paper: SCK GPIO13, MOSI GPIO14,
// MISO GPIO12, CS GPIO8. Strom über SD_PWR_EN GPIO10 (HIGH = an, 100k nach GND), Kartenerkennung GPIO11 (Schalter im
// Halter nach GND, Pull-up R45 nicht bestückt → interner Pull-up). Erst nur eine Leseprüfung beim Start, vor
// display.begin(): eigener SPI-Host, danach Bus wieder frei und Karte stromlos.
#include <SD.h>
#include <SPI.h>

static const int PIN_SD_SCK = 13, PIN_SD_MOSI = 14, PIN_SD_MISO = 12, PIN_SD_CS = 8, PIN_SD_PWR = 10, PIN_SD_DET = 11;

static void sdPruefen() {
    pinMode(15, OUTPUT);
    digitalWrite(15, HIGH);                        // EP_CSn: E-Paper hört nicht mit
    pinMode(PIN_SD_DET, INPUT_PULLUP);
    pinMode(PIN_SD_PWR, OUTPUT);
    digitalWrite(PIN_SD_PWR, HIGH);
    delay(50);
    Serial.printf("SD: Erkennung GPIO11 = %d\n", digitalRead(PIN_SD_DET));
    SPIClass spi(HSPI);
    spi.begin(PIN_SD_SCK, PIN_SD_MISO, PIN_SD_MOSI, PIN_SD_CS);
    if (!SD.begin(PIN_SD_CS, spi, 20000000, "/sd", 5)) {
        Serial.println("SD: keine Karte lesbar");
    } else {
        const char* typ[] = {"keine", "MMC", "SD", "SDHC", "unbekannt"};
        uint8_t t = SD.cardType();
        Serial.printf("SD: %s, %llu MB, Dateisystem %llu MB, belegt %llu MB\n", typ[t < 4 ? t : 4],
                      SD.cardSize() >> 20, SD.totalBytes() >> 20, SD.usedBytes() >> 20);
        File w = SD.open("/");
        int n = 0;
        for (File f = w.openNextFile(); f && n < 10; f = w.openNextFile(), n++)
            Serial.printf("SD:   %s%s %u\n", f.name(), f.isDirectory() ? "/" : "", (unsigned)f.size());
        w.close();
        // Lesegeschwindigkeit grob: 1 MB aus dem Rohsektor-Bereich ist ohne Datei nicht möglich, darum Schreibtest weglassen
        SD.end();
    }
    spi.end();
    digitalWrite(PIN_SD_PWR, LOW);
}
