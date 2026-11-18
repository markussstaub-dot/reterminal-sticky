// ---- Schlummern im Akkubetrieb (Markus, 12.11.2026: über Nacht ~50 % Akku weg) -----------------
// Der Arduino-Kern hat kein automatisches Light-Sleep (CONFIG_PM_ENABLE fehlt): solange BLE läuft, läuft die CPU
// durch. Darum nach SCHLAF_NACH ohne Bedienung: Ereignis „schlaf“ an die App, Funk und Touch aus, dann Leichtschlaf
// bis zur nächsten vollen Minute (Uhr, Akkusymbol) oder bis eine Taste gedrückt wird. Zur vollen Stunde (nicht 1–5 Uhr) geht der
// Funk für STUNDEN_FENSTER an, damit die App abgleichen kann (Wetter, Zettel, Notizen abholen). Am USB nie.
// Touch weckt nicht (Controller stromlos) – eine Taste weckt alles.
#include <esp_sleep.h>
#include <driver/gpio.h>
// Notfall-Sparmodus (notfall.h, FW 0.40.0): Funk aus, nur zur vollen Stunde wach, vor dem Schlaf das Notfallblatt
static bool notfallSpar();
static uint64_t notfallSchlafMs(uint64_t standard);
static void notfallZeigen(bool leise);
static void notfallVorSchlaf();

static const uint32_t SCHLAF_NACH = 60000;       // ms ohne Bedienung bzw. ohne Befehle der App (15.11.2026: 2 min → 1 min)
static const uint32_t STUNDEN_FENSTER = 30000;   // so lange ist der Funk zur vollen Stunde an, wenn niemand kommt (15.11.2026: 1 min → 30 s)
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
    uint64_t ms = notfallSchlafMs(t.tm_year > 120 ? (60 - t.tm_sec) * 1000ULL + 300 : 60000ULL);
    uint32_t timer = widgetWeckenInMs();          // laufender Countdown: rechtzeitig zum Ablauf wach sein
    if (timer && timer + 20 < ms) ms = timer + 20;
    for (auto& x : tasten) {
        detachInterrupt(digitalPinToInterrupt(x.pin));
        gpio_wakeup_enable((gpio_num_t)x.pin, x.ruhe == HIGH ? GPIO_INTR_LOW_LEVEL : GPIO_INTR_HIGH_LEVEL);
    }
    bool bewegungWeckt = !notfallSpar() && bewegungWecktGleich();
    if (bewegungWeckt) gpio_wakeup_enable((gpio_num_t)PIN_6D_INT, GPIO_INTR_LOW_LEVEL);
    esp_sleep_enable_gpio_wakeup();
    esp_sleep_enable_timer_wakeup(ms * 1000ULL);
    Serial.flush();
    gpio_hold_en((gpio_num_t)PIN_PWR_HOLD);        // Selbsthaltung, sonst geht er aus
    gpio_hold_en((gpio_num_t)PIN_PWR_LOCK);        // zweiter Haltepin (GPIO46)
    gpio_hold_en((gpio_num_t)PIN_CHG_EN_N);        // Laden bleibt erlaubt
    esp_light_sleep_start();
    gpio_hold_dis((gpio_num_t)PIN_CHG_EN_N);
    gpio_hold_dis((gpio_num_t)PIN_PWR_LOCK);
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
    bool spar = notfallSpar();
    if (usbDa()) {                                 // Strom da: alles an, nie schlafen (im Sparmodus bleibt der Funk aus)
        if (spar && funkAn) funkAus();
        if (!funkAn && !spar) funkEin(false);
        if (!touchAn) touchEin();
        return;
    }
    // Touch erst nach der Taste einschalten (touchInit braucht ~½ s, der Klick soll sofort kommen)
    if (!touchAn && (funkAn || spar) && millis() - letzteTaste < 5000) touchEin();
    if (millis() - letzteAktivitaet < (spar ? 15000UL : SCHLAF_NACH)) return;
    if (audioLaeuft || imgActive || imgReady || schrAktiv || tasteGedrueckt()) return;
    if (funkAn) {
        Serial.println("Schlummern: Funk und Touch aus");
        protokoll("schlummert (Akku %d %%)", batPct);
        funkAus();
    }
    if (touchAn) touchAus();
    notfallVorSchlaf();                            // nie ein entschlüsseltes Dokument stehen lassen
    if (spar) notfallZeigen(true);                 // Sparmodus: vor dem Schlaf steht immer das Notfallblatt da
    statusPruefen(true, false);                    // Zzz in die Statuszeile, bevor das Bild stehen bleibt
    protokollSchreiben();
    sdAus();                                       // Karte stromlos, pfs() bindet sie beim nächsten Zugriff ein
    Weckgrund grund = leichtSchlaf();
    if (grund == W_BEWEGUNG) {                     // Bewegung: erst 3 s prüfen (ohne Funk), dann ganz wach
        float streu = 0;
        if (!bewegungPruefen(3000, &streu)) { fehlalarme++; return; }   // Stoß/Tippen: weiterschlafen
        protokoll("wach durch Bewegung (nach %lu Schlafminuten, Streuung %.0f mg)", (unsigned long)schlafZaehler, streu * 1000);
        schlafZaehler = 0;
        if (!spar) funkEin(true);
        aktiv();
        return;
    }
    if (grund == W_TASTE) {                        // Taste: ganz wach (Touch folgt nach dem Tastendruck, s. o.)
        protokoll("wach durch Taste (nach %lu Schlafminuten)", (unsigned long)schlafZaehler);
        schlafZaehler = 0;
        if (!spar) funkEin(true);
        aktiv();
        letzteTaste = millis();
        return;
    }
    if (usbDa()) { protokoll("wach: USB angesteckt"); schlafZaehler = 0; aktiv(); return; }   // während des Schlafs angesteckt
    time_t jetzt = time(nullptr);
    struct tm t;
    localtime_r(&jetzt, &t);
    if (spar) return;                              // Sparmodus: kein Klima, kein Stundenfenster
    if (t.tm_year > 120 && t.tm_min % 15 == 0) klimaMessen();   // Klima alle 15 min auch im Schlummern
    // volle Stunde: kurz erreichbar für den Abgleich; nachts 1–5 Uhr nicht (15.11.2026, Strom sparen),
    // Mitternacht bleibt: da schickt die App die Home-Karte mit dem neuen Datum.
    // Ohne gestellte Uhr (18.11.2026): alle 60 Schlafminuten, sonst wäre er nur per Taste erreichbar und bekäme nie Zeit
    bool fenster = t.tm_year > 120 ? t.tm_min == 0 && (t.tm_hour == 0 || t.tm_hour >= 6)
                                   : schlafZaehler % 60 == 0;
    if (fenster) {
        funkEin(true);
        protokoll("Stundenfenster: Funk %lu s an (Akku %d %%, %lu Fehlalarme Bewegung)", (unsigned long)(STUNDEN_FENSTER / 1000), batPct, (unsigned long)fehlalarme);
        fehlalarme = 0;
        letzteAktivitaet = millis() - (SCHLAF_NACH - STUNDEN_FENSTER);
    }
}
