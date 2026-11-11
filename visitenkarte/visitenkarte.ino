/**
 * Digitale Visitenkarte fuer den reTerminal Sticky (3,97" E-Paper, 800x480 s/w)
 * Bibliothek: Seeed_GFX2; QR-Code: esp_qrcode aus dem ESP32-Core
 *
 * Inhalt hier aendern und neu aufspielen. Das Bild bleibt ohne Strom stehen.
 */
#include <Seeed_GFX.h>
#include <font/GFXFF/FreeSansBold24pt7b.h>
#include <font/GFXFF/FreeSans12pt7b.h>
#include "qrcode.h"

// ---- Inhalt ---------------------------------------------------------------
static const char* NAME     = "Markus";
static const char* QR_TEXT  = "https://github.com/markussstaub-dot";
static const char* QR_LABEL = "github.com/markussstaub-dot";
// ---------------------------------------------------------------------------

Seeed_GFX display(Seeed_Product::reTerminal_Sticky);

// QR-Feld rechts: Quadrat ueber die volle Hoehe mit Rand
static const int QR_AREA = 420;
static int qrX0, qrY0;

static void drawQr(esp_qrcode_handle_t qr) {
    const int n = esp_qrcode_get_size(qr);
    const int quiet = 2;                               // Ruhezone in Modulen (Feld ist eh weiss)
    const int scale = QR_AREA / (n + 2 * quiet);
    const int px = n * scale;
    const int x0 = qrX0 + (QR_AREA - px) / 2;
    const int y0 = qrY0 + (QR_AREA - px) / 2;
    for (int y = 0; y < n; y++)
        for (int x = 0; x < n; x++)
            if (esp_qrcode_get_module(qr, x, y))
                display.fillRect(x0 + x * scale, y0 + y * scale, scale, scale, TFT_BLACK);
    Serial.printf("QR: %d Module, %d px je Modul\n", n, scale);
}

void setup() {
    Serial.begin(115200);
    if (!display.begin()) {
        Serial.println(display.lastResult().message);
        return;
    }
    const int16_t w = display.width();   // 800
    const int16_t h = display.height();  // 480

    // Einmal komplett weiss blitzen, damit kein Geisterbild der alten Firmware bleibt
    display.fillScreen(TFT_WHITE);
    display.refresh();
    delay(500);
    display.fillScreen(TFT_WHITE);

    // Rechts: QR-Code
    qrX0 = w - QR_AREA - 30;
    qrY0 = (h - QR_AREA) / 2;
    esp_qrcode_config_t cfg = ESP_QRCODE_CONFIG_DEFAULT();
    cfg.display_func = drawQr;
    cfg.max_qrcode_version = 10;
    cfg.qrcode_ecc_level = ESP_QRCODE_ECC_MED;
    if (esp_qrcode_generate(&cfg, QR_TEXT) != ESP_OK) Serial.println("QR fehlgeschlagen");

    // Links: Name gross, Linie, kleine Zeile
    const int leftW = qrX0 - 20;
    display.setTextColor(TFT_BLACK);
    display.setTextDatum(MC_DATUM);
    display.setFreeFont(&FreeSansBold24pt7b);
    display.setTextSize(2);
    display.drawString(NAME, leftW / 2 + 10, h / 2 - 30);
    display.setTextSize(1);

    display.fillRect(40, h / 2 + 40, leftW - 60, 4, TFT_BLACK);

    display.setFreeFont(&FreeSans12pt7b);
    display.drawString("Scan mich", leftW / 2 + 10, h / 2 + 80);
    display.setFreeFont(nullptr);
    display.setTextSize(1);
    display.drawString(QR_LABEL, leftW / 2 + 10, h / 2 + 115, 2);

    display.update();
    Serial.println("Visitenkarte angezeigt.");
}

void loop() {}
