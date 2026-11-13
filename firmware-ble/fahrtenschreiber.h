/**
 * Fahrtenschreiber (SPEC „Zwilling 2.0“, Schritt 1, 13.11.2026): was der Sticky erlebt, Zeile für Zeile auf der Karte.
 *   /ist/log/JJJJ-MM-TT.txt   „HH:MM:SS Text“ in Ortszeit, ein Tag je Datei
 *   /ist/log/ohne-zeit.txt    solange die Uhr nicht gestellt ist: „+Sekunden seit Start Text“
 * Festgehalten werden Ereignisse, keine Messreihen: Start, Tasten, Modus, Verbindung, App hört zu/nicht, Schlummern,
 * Akku (alle 10 min und bei Laden/USB), Diktate, Abholen, Fehler.
 *
 * protokoll() darf aus jedem Task kommen (BLE-Rückrufe, ISR nicht): die Zeile geht in einen RAM-Ring, geschrieben wird
 * in loop() bzw. vor dem Schlummern, weil SD und Display sich den SPI-Bus teilen. Ohne Karte nur auf die serielle
 * Schnittstelle. Die App holt per LISTE/HOLEN ab (ab dem Stand, den sie schon hat) und löscht vergangene Tage.
 */
#include <stdarg.h>

static const int PROT_ZEILEN = 48, PROT_LAENGE = 120;
static const uint32_t PROT_MAX_TAG = 2UL << 20;   // 2 MB je Tag, dann ist etwas faul: nicht die Karte zumüllen
static char protRing[PROT_ZEILEN][PROT_LAENGE];
static int protKopf = 0, protFuss = 0, protVerloren = 0;
static portMUX_TYPE protSperre = portMUX_INITIALIZER_UNLOCKED;

static void protokoll(const char* fmt, ...) {
    char text[PROT_LAENGE - 12];
    va_list a;
    va_start(a, fmt);
    vsnprintf(text, sizeof text, fmt, a);
    va_end(a);
    char z[PROT_LAENGE];
    time_t s = time(nullptr);
    tm t;
    localtime_r(&s, &t);
    if (zeitGesetzt && t.tm_year > 120) snprintf(z, sizeof z, "%02d:%02d:%02d %s", t.tm_hour, t.tm_min, t.tm_sec, text);
    else snprintf(z, sizeof z, "+%lu %s", (unsigned long)(millis() / 1000), text);
    Serial.printf("LOG %s\n", z);
    portENTER_CRITICAL(&protSperre);
    int n = (protKopf + 1) % PROT_ZEILEN;
    if (n == protFuss) protVerloren++;
    else { strlcpy(protRing[protKopf], z, PROT_LAENGE); protKopf = n; }
    portEXIT_CRITICAL(&protSperre);
}

static void protTagesPfad(char* p, size_t n) {
    time_t s = time(nullptr);
    tm t;
    localtime_r(&s, &t);
    if (zeitGesetzt && t.tm_year > 120) snprintf(p, n, "/ist/log/%04d-%02d-%02d.txt", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday);
    else strlcpy(p, "/ist/log/ohne-zeit.txt", n);
}

/** Ring auf die Karte schreiben. Aus loop() (gedrosselt) und vor dem Schlummern. */
static void protokollSchreiben() {
    if (protKopf == protFuss) return;
    if (!sdEin()) {                           // ohne Karte: verwerfen, steht schon auf Serial
        portENTER_CRITICAL(&protSperre); protFuss = protKopf; portEXIT_CRITICAL(&protSperre);
        return;
    }
    char pfad[40];
    protTagesPfad(pfad, sizeof pfad);
    File f = SD.open(pfad, FILE_APPEND);
    if (!f) { SD.mkdir("/ist"); SD.mkdir("/ist/log"); f = SD.open(pfad, FILE_APPEND); }
    if (!f) return;
    bool voll = f.size() > PROT_MAX_TAG;
    static char z[PROT_LAENGE];
    while (protKopf != protFuss) {
        portENTER_CRITICAL(&protSperre);
        strlcpy(z, protRing[protFuss], sizeof z);
        protFuss = (protFuss + 1) % PROT_ZEILEN;
        portEXIT_CRITICAL(&protSperre);
        if (!voll) f.println(z);
    }
    if (protVerloren && !voll) { f.printf("(%d Zeilen verloren, Ring voll)\n", protVerloren); protVerloren = 0; }
    f.close();
}

static void protokollLoop() {
    static uint32_t zuletzt = 0, akkuZuletzt = 0;
    static int8_t laedtVorher = -1, usbVorher = -1;
    bool u = usbDa();
    if (laedt != laedtVorher || u != usbVorher) {
        if (laedtVorher >= 0) protokoll("Akku %d %% %d mV%s%s", batPct, batMv, u ? " · USB" : "", laedt ? " · lädt" : "");
        laedtVorher = laedt;
        usbVorher = u;
    }
    if (millis() - akkuZuletzt > 600000) { akkuZuletzt = millis(); protokoll("Akku %d %% %d mV %d mA%s", batPct, batMv, batMa, u ? " · USB" : ""); }
    // nicht bei jeder Zeile die Karte anfassen: Bündeln, außer der Ring wird voll
    int belegt = (protKopf - protFuss + PROT_ZEILEN) % PROT_ZEILEN;
    if (belegt && (millis() - zuletzt > 5000 || belegt > PROT_ZEILEN / 2) && !audioLaeuft && !imgActive) {
        zuletzt = millis();
        protokollSchreiben();
    }
}
