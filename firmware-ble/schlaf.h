// ---- Schlummern im Akkubetrieb (Markus, 12.11.2026: über Nacht ~50 % Akku weg) -----------------
// Der Arduino-Kern hat kein automatisches Light-Sleep (CONFIG_PM_ENABLE fehlt): solange BLE läuft, läuft die CPU
// durch. Darum nach SCHLAF_NACH ohne Bedienung: Ereignis „schlaf“ an die App, Funk und Touch aus, dann Leichtschlaf
// bis zur nächsten vollen Minute (Uhr, Akkusymbol) oder bis eine Taste gedrückt wird. Zur vollen Stunde geht der
// Funk für STUNDEN_FENSTER an, damit die App abgleichen kann (Wetter, Zettel, Notizen abholen). Am USB nie.
// Touch weckt nicht (Controller stromlos) – eine Taste weckt alles.
#include <esp_sleep.h>
#include <driver/gpio.h>

static const uint32_t SCHLAF_NACH = 120000;      // ms ohne Bedienung bzw. ohne Befehle der App
static const uint32_t STUNDEN_FENSTER = 60000;   // so lange ist der Funk zur vollen Stunde an, wenn niemand kommt
static bool funkAn = true, touchAn = true;
static uint32_t schlafZaehler = 0;

static void funkAus() {
    sendEvt("{\"t\":\"schlaf\"}");
    delay(100);
    if (connected) {
        server->disconnect(connHandle);
        uint32_t t0 = millis();
        while (connected && millis() - t0 < 1500) delay(10);
    }
    NimBLEDevice::getAdvertising()->stop();
    delay(50);
    NimBLEDevice::deinit(true);
    connected = false;
    server = nullptr;
    chEvt = chState = chAudio = chDatei = nullptr;
    funkAn = false;
}
static void funkEin(bool schnell) {
    if (funkAn) return;
    bleInit();
    funkAn = true;
    startAdvertising(schnell);
}
static void touchAus() {
    digitalWrite(PIN_TP_EN, LOW);                  // GT911 stromlos
    touchAn = false;
}
static void touchEin() {
    if (touchAn) return;
    touchInit();
    touchAn = true;
}

static bool tasteGedrueckt() {
    for (auto& t : tasten) if (digitalRead(t.pin) != t.ruhe) return true;
    return false;
}

/** Bis zur nächsten vollen Minute schlafen (oder bis eine Taste oder Bewegung kommt).
 *  Liefert 0 = Zeit (oder Fehlalarm des Akku-Chips auf GPIO7), 1 = Taste, 2 = Bewegung. */
enum Weckgrund { W_ZEIT = 0, W_TASTE = 1, W_BEWEGUNG = 2 };
static Weckgrund leichtSchlaf() {
    time_t jetzt = time(nullptr);
    struct tm t;
    localtime_r(&jetzt, &t);
    uint64_t ms = t.tm_year > 120 ? (60 - t.tm_sec) * 1000ULL + 300 : 60000ULL;
    for (auto& x : tasten) {
        detachInterrupt(digitalPinToInterrupt(x.pin));
        gpio_wakeup_enable((gpio_num_t)x.pin, x.ruhe == HIGH ? GPIO_INTR_LOW_LEVEL : GPIO_INTR_HIGH_LEVEL);
    }
    bool bewegungWeckt = bewegungWecktGleich();
    if (bewegungWeckt) gpio_wakeup_enable((gpio_num_t)PIN_6D_INT, GPIO_INTR_LOW_LEVEL);
    esp_sleep_enable_gpio_wakeup();
    esp_sleep_enable_timer_wakeup(ms * 1000ULL);
    Serial.flush();
    gpio_hold_en((gpio_num_t)PIN_PWR_HOLD);        // Selbsthaltung, sonst geht er aus
    gpio_hold_en((gpio_num_t)PIN_CHG_EN_N);        // Laden bleibt erlaubt
    esp_light_sleep_start();
    gpio_hold_dis((gpio_num_t)PIN_CHG_EN_N);
    gpio_hold_dis((gpio_num_t)PIN_PWR_HOLD);
    bool gpio = esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_GPIO;
    if (bewegungWeckt) gpio_wakeup_disable((gpio_num_t)PIN_6D_INT);
    bool taste = false;
    for (auto& x : tasten) if (gpio && digitalRead(x.pin) != x.ruhe) taste = true;
    bool bewegt = gpio && !taste && bewegungWeckt && bewegtSeither();
    if (gpio && !bewegt && !taste) taste = !bewegungWeckt;   // ohne Bewegungswecken kann nur eine (kurze) Taste geweckt haben
    for (auto& x : tasten) {
        gpio_wakeup_disable((gpio_num_t)x.pin);
        attachInterruptArg(digitalPinToInterrupt(x.pin), tasteIsr, &x, x.ruhe == HIGH ? FALLING : RISING);
        if (taste && digitalRead(x.pin) != x.ruhe) x.gedrueckt = true;   // Druck festhalten, falls er kurz war
    }
    esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
    schlafZaehler++;
    return taste ? W_TASTE : bewegt ? W_BEWEGUNG : W_ZEIT;
}

/** Am Ende von loop(): schlummern, wenn nichts los ist; nach dem Aufwachen Funk/Touch nach Bedarf */
static void schlafPruefen() {
    if (usbDa()) {                                 // Strom da: alles an, nie schlafen
        if (!funkAn) funkEin(false);
        if (!touchAn) touchEin();
        return;
    }
    // Touch erst nach der Taste einschalten (touchInit braucht ~½ s, der Klick soll sofort kommen)
    if (!touchAn && funkAn && millis() - letzteTaste < 5000) touchEin();
    if (millis() - letzteAktivitaet < SCHLAF_NACH) return;
    if (audioLaeuft || imgActive || imgReady || schrAktiv || tasteGedrueckt()) return;
    if (funkAn) {
        Serial.println("Schlummern: Funk und Touch aus");
        protokoll("schlummert (Akku %d %%)", batPct);
        funkAus();
    }
    if (touchAn) touchAus();
    protokollSchreiben();
    sdAus();                                       // Karte stromlos, pfs() bindet sie beim nächsten Zugriff ein
    Weckgrund grund = leichtSchlaf();
    if (grund == W_BEWEGUNG) {                     // Bewegung: Funk an, damit die App gleich da ist; Touch erst mit Taste
        protokoll("wach durch Bewegung (nach %lu Schlafminuten)", (unsigned long)schlafZaehler);
        schlafZaehler = 0;
        funkEin(true);
        aktiv();
        return;
    }
    if (grund == W_TASTE) {                        // Taste: ganz wach (Touch folgt nach dem Tastendruck, s. o.)
        protokoll("wach durch Taste (nach %lu Schlafminuten)", (unsigned long)schlafZaehler);
        schlafZaehler = 0;
        funkEin(true);
        aktiv();
        letzteTaste = millis();
        return;
    }
    if (usbDa()) { protokoll("wach: USB angesteckt"); schlafZaehler = 0; aktiv(); return; }   // während des Schlafs angesteckt
    time_t jetzt = time(nullptr);
    struct tm t;
    localtime_r(&jetzt, &t);
    if (t.tm_year > 120 && t.tm_min % 15 == 0) klimaMessen();   // Klima alle 15 min auch im Schlummern
    if (t.tm_year > 120 && t.tm_min == 0) {        // volle Stunde: kurz erreichbar für den Abgleich
        funkEin(true);
        protokoll("Stundenfenster: Funk 1 min an (Akku %d %%)", batPct);
        letzteAktivitaet = millis() - (SCHLAF_NACH - STUNDEN_FENSTER);
    }
}
