/**
 * Recorder für Längeres (SPEC „Recorder für Längeres“, FW 0.34.0): eigene Karussell-Seite (Widget „typ recorder“),
 * Tippen auf den großen Knopf = Start/Stopp, Hände frei. Die App liefert Bild, Glyphen und Felder; der Sticky nimmt auf
 * und setzt die Zeilen ein.
 *
 * Format wie das Diktat: IMA-ADPCM 16 kHz in Paketen à 245 Byte (~8 kB/s, ~29 MB je Stunde). Die Aufnahme geht IMMER
 * auf die Karte (Ringpuffer 128 KB → 4-KB-Blöcke, eigene Aufgabe; die Karte teilt sich den SPI-Bus mit dem E-Paper) und,
 * wenn die App zuhört, zusätzlich live. Während der Aufnahme liegt sie unter /ist/recorder/laeuft.adp (das Abholen sieht
 * sie nicht), beim Stopp wandert sie als /ist/puffer/rJJMMTT-hhmmss.adp in den Puffer, dazu eine Notiz-Zeile
 * {"art":"recorder","audio":…,"dauerMs":…,"merker":[ms…]}. Kam live alles an, tippt die App sofort ab und löscht die
 * Datei; sonst holt sie sie wie ein Offline-Diktat ab (dauert etwa so lange wie die Aufnahme).
 *   Stand je Aufnahme: Datei noch im Puffer = ⧗ (wartet aufs Handy), weg = ✓ (die App hat Ton und Text).
 *   /ist/recorder/liste.txt   je Aufnahme „name startS dauerS merker“ (für die Tagesliste)
 * Ereignisse an die App: {"t":"rec","a":"start|merker|stop|abspielen|springe",…}
 * Regeln: KI halten während der Aufnahme = Merker (statt Diktat); nach jeder vollen Stunde Piepton und „!“; unter 15 %
 * Akku (und Spannung unter 3,7 V, oder unter 3,45 V allein) stoppt er selbst; ohne Karte keine Aufnahme.
 * Textfelder (felder.txt): 0 Zustand groß, 1 Zusatz, 2–6 Tagesliste (neueste oben).
 */
static const uint32_t REC_RING = 128 * 1024, REC_BLOCK = 4096;
static const int REC_MERKER_MAX = 40, REC_ZEILEN = 5;
static uint8_t* recRing = nullptr;
static volatile uint32_t recKopf = 0, recSchwanz = 0;
static volatile bool recSchreiberFertig = true, recFehler = false;
static File recDatei;
static char recName[28] = "";
static uint64_t recStartMs = 0;
static uint32_t recT0 = 0, recMerker[REC_MERKER_MAX];
static int recMerkerN = 0, recBatStart = -1, recMvStart = -1, recStundeGewarnt = 0;
static int recGrund = 0;                 // letzter Stopp: 0 normal, 1 Akku, 2 keine Karte, 3 Karte voll/Schreibfehler
static int recWahl = 0;                  // gewählte Zeile der Tagesliste
static bool recSpielt = false;           // Fernbedienung: das Handy spielt die gewählte Aufnahme
static uint32_t recSeiteMinute = 0;
struct RecEintrag { char name[28]; uint32_t startS, dauerS; int merker; };
static RecEintrag recListe[REC_ZEILEN];
static int recListeN = 0;
static const char* REC_ORDNER = "/ist/recorder";
static const char* REC_LAUF = "/ist/recorder/laeuft.adp";

static bool recLaeuftJetzt() { return audioRec && audioLaeuft; }

/** Aus der Audio-Aufgabe: ein Paket in den Ring (läuft er über, zählt es als verworfen) */
static void recPaket(const uint8_t* p) {
    if (recKopf - recSchwanz + AUDIO_PAKET > REC_RING) { audioVerworfen++; return; }
    uint32_t o = recKopf % REC_RING, a = min<uint32_t>(AUDIO_PAKET, REC_RING - o);
    memcpy(recRing + o, p, a);
    if (a < AUDIO_PAKET) memcpy(recRing, p + a, AUDIO_PAKET - a);
    recKopf += AUDIO_PAKET;
    audioPakete++;
}

/** Schreibt den Ring in Blöcken auf die Karte, bis die Audio-Aufgabe fertig und der Ring leer ist */
static void recSchreiber(void*) {
    static uint8_t blk[REC_BLOCK];
    int bloecke = 0;
    for (;;) {
        bool ende = !audioLaeuft;                 // erst das Ende lesen, dann den Füllstand (danach wächst nichts mehr)
        uint32_t da = recKopf - recSchwanz;
        if (da >= REC_BLOCK || (ende && da)) {
            uint32_t n = min<uint32_t>(da, REC_BLOCK), o = recSchwanz % REC_RING, a = min<uint32_t>(n, REC_RING - o);
            memcpy(blk, recRing + o, a);
            if (a < n) memcpy(blk + a, recRing, n - a);
            if (recDatei.write(blk, n) != n) { recFehler = true; audioStopp = true; recSchwanz = recKopf; continue; }
            recSchwanz += n;
            if (++bloecke % 64 == 0) recDatei.flush();   // ~30 s: Verzeichniseintrag nachziehen (falls der Strom wegbricht)
            continue;
        }
        if (ende) break;
        vTaskDelay(pdMS_TO_TICKS(40));
    }
    recSchreiberFertig = true;
    vTaskDelete(nullptr);
}

static void recNameBauen() {
    char pfad[48];
    for (int i = 0; i < 100; i++) {
        if (zeitGesetzt) {
            time_t s = (time_t)(recStartMs / 1000) + i;
            tm t;
            localtime_r(&s, &t);
            snprintf(recName, sizeof recName, "r%02d%02d%02d-%02d%02d%02d.adp", t.tm_year % 100, t.tm_mon + 1, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec);
        } else snprintf(recName, sizeof recName, "r000000-%06lu.adp", (unsigned long)(millis() / 1000 + i));
        snprintf(pfad, sizeof pfad, "/ist/puffer/%s", recName);
        if (!SD.exists(pfad)) return;
    }
}

static void recStart() {
    if (audioLaeuft) { tone(PIN_BUZZER, 900, 120); return; }    // Diktat läuft gerade
    recGrund = 0;
    if (!sdEin()) { recGrund = 2; tone(PIN_BUZZER, 900, 300); protokoll("Recorder: keine Karte"); return; }
    if (!recRing) recRing = (uint8_t*)ps_malloc(REC_RING);
    if (!recRing) { tone(PIN_BUZZER, 900, 300); protokoll("Recorder: kein Speicher"); return; }
    SD.mkdir("/ist"); SD.mkdir(REC_ORDNER); SD.mkdir("/ist/puffer");
    if (SD.exists(REC_LAUF)) {                // Rest einer abgebrochenen Aufnahme (Absturz, Akku) in den Puffer retten
        char ziel[48];
        snprintf(ziel, sizeof ziel, "/ist/puffer/r000000-gerettet%lu.adp", (unsigned long)(millis() % 100000));
        SD.rename(REC_LAUF, ziel);
        protokoll("Recorder: Rest gerettet als %s", ziel + 12);
    }
    recDatei = SD.open(REC_LAUF, FILE_WRITE);
    if (!recDatei) { recGrund = 3; tone(PIN_BUZZER, 900, 300); protokoll("Recorder: Datei lässt sich nicht anlegen"); return; }
    if (!micAn()) { recDatei.close(); tone(PIN_BUZZER, 900, 300); protokoll("Fehler: Mikro startet nicht"); return; }
    recStartMs = jetztMs();
    recT0 = millis();
    recNameBauen();
    recMerkerN = 0; recStundeGewarnt = 0; recFehler = false;
    recKopf = recSchwanz = 0;
    recLiveVerlust = 0;
    readBattery();
    recBatStart = batPct; recMvStart = batMv;
    recLive = appDa() && mtu >= AUDIO_PAKET + 3;
    if (recLive) { slowAt = 0; server->updateConnParams(connHandle, AUDIO_MIN, AUDIO_MAX, 0, 400); }
    if (connected) {
        char j[200];
        snprintf(j, sizeof j, "{\"t\":\"rec\",\"a\":\"start\",\"rate\":%d,\"codec\":\"ima-adpcm\",\"n\":%d,\"ms\":%llu,\"datei\":\"%s\",\"live\":%d}",
                 AUDIO_RATE, AUDIO_SAMPLES, (unsigned long long)recStartMs, recName, recLive ? 1 : 0);
        sendEvt(j);
    }
    audioOffline = false;
    audioStopp = false;
    audioRec = true;
    audioLaeuft = true;
    recSchreiberFertig = false;
    xTaskCreatePinnedToCore(audioTask, "audio", 6144, nullptr, 5, nullptr, 1);
    xTaskCreatePinnedToCore(recSchreiber, "rec", 4096, nullptr, 2, nullptr, 1);
    recSpielt = false;
    tone(PIN_BUZZER, 2000, 60); delay(80); tone(PIN_BUZZER, 3000, 80);
    protokoll("Recorder läuft (%s, %s, Akku %d %% %d mV)", recName, recLive ? "live" : "nur Karte", batPct, batMv);
}

static void recStopp() { if (recLaeuftJetzt()) audioStopp = true; }

static void recMerkerSetzen() {
    if (!recLaeuftJetzt()) return;
    uint32_t ms = millis() - recT0;
    if (recMerkerN < REC_MERKER_MAX) recMerker[recMerkerN++] = ms;
    tone(PIN_BUZZER, 3300, 40); delay(70); tone(PIN_BUZZER, 3300, 40);
    if (recLive && connected) { char j[64]; snprintf(j, sizeof j, "{\"t\":\"rec\",\"a\":\"merker\",\"ms\":%lu}", (unsigned long)ms); sendEvt(j); }
    protokoll("Recorder: Merker %d bei %lu s", recMerkerN, (unsigned long)(ms / 1000));
    if (modus == M_WIDGET && wRecorder) wTextNeu = true;
}

static void recListeLaden() {
    recListeN = 0;
    if (!sdEin()) return;
    File f = SD.open("/ist/recorder/liste.txt", FILE_READ);
    if (!f) return;
    time_t jetzt = time(nullptr);
    tm h;
    localtime_r(&jetzt, &h);
    RecEintrag ring[REC_ZEILEN];
    int n = 0;
    while (f.available()) {
        String z = f.readStringUntil('\n');
        RecEintrag e;
        unsigned long s, d;
        if (sscanf(z.c_str(), "%27s %lu %lu %d", e.name, &s, &d, &e.merker) != 4) continue;
        e.startS = s; e.dauerS = d;
        if (zeitGesetzt && s > 1700000000UL) {   // nur heute (ohne Uhr: alle, die letzten zuerst)
            time_t ts = s;
            tm t;
            localtime_r(&ts, &t);
            if (t.tm_yday != h.tm_yday || t.tm_year != h.tm_year) continue;
        }
        ring[n % REC_ZEILEN] = e;
        n++;
    }
    f.close();
    for (int i = 0; i < min(n, REC_ZEILEN); i++) recListe[i] = ring[(n - 1 - i) % REC_ZEILEN];   // neueste zuerst
    recListeN = min(n, REC_ZEILEN);
    if (recWahl >= recListeN) recWahl = max(0, recListeN - 1);
}

static void recUhr(char* z, size_t n, uint32_t startS) {
    if (!startS || startS < 1700000000UL) { strlcpy(z, "--:--", n); return; }
    time_t s = startS;
    tm t;
    localtime_r(&s, &t);
    if (uhr12) snprintf(z, n, "%d:%02d%c", stundeZeigen(t.tm_hour), t.tm_min, t.tm_hour >= 12 ? 'p' : 'a');
    else snprintf(z, n, "%02d:%02d", t.tm_hour, t.tm_min);
}

/** Textfelder füllen (aus wAnzeigeZeichnen) */
static void recZeichnen() {
    char z[48], uhr[10];
    bool laeuft = recLaeuftJetzt();
    if (wFeld(0)) {
        if (laeuft) {
            uint32_t min_ = (millis() - recT0) / 60000;
            snprintf(z, sizeof z, "%s● %lu min", min_ >= 60 ? "! " : "", (unsigned long)min_);
        } else strlcpy(z, T("bereit", "ready"), sizeof z);
        wTextZeichnen(z, nullptr);
    }
    if (wFeld(1)) {
        if (laeuft) {
            recUhr(uhr, sizeof uhr, (uint32_t)(recStartMs / 1000));
            snprintf(z, sizeof z, "%s %s ⚑%d", T("seit", "since"), uhr, recMerkerN);
        } else strlcpy(z, recGrund == 1 ? T("! Akku leer", "! battery low") : recGrund == 2 ? T("! keine Karte", "! no card")
                          : recGrund == 3 ? T("! Karte voll?", "! card full?") : T("Tippen = Start", "tap = start"), sizeof z);
        wTextZeichnen(z, nullptr);
    }
    for (int i = 0; i < REC_ZEILEN; i++) {
        if (!wFeld(2 + i)) break;
        z[0] = 0;
        if (laeuft && i == 0) {                  // die laufende Aufnahme steht oben
            recUhr(uhr, sizeof uhr, (uint32_t)(recStartMs / 1000));
            snprintf(z, sizeof z, " %s %3lum ●", uhr, (unsigned long)((millis() - recT0) / 60000));
        } else {
            int k = laeuft ? i - 1 : i;
            if (k < recListeN) {
                const RecEintrag& e = recListe[k];
                char pfad[48];
                snprintf(pfad, sizeof pfad, "/ist/puffer/%s", e.name);
                bool wartet = sdEin() && SD.exists(pfad);
                recUhr(uhr, sizeof uhr, e.startS);
                snprintf(z, sizeof z, "%s%s %3lum %s", k == recWahl ? "▸" : " ", uhr, (unsigned long)((e.dauerS + 30) / 60), wartet ? "⧗" : "✓");
            }
        }
        wTextZeichnen(z, nullptr);
    }
    wFeld(0);
}

/** Aus widgetZeigen: Seite frisch aufgebaut */
static void recSeiteNeu() {
    recListeLaden();
    recSpielt = false;
    recSeiteMinute = millis() / 60000;
}

/** Aktion aus felder.txt; true = gehört dem Recorder (Anzeige neu) */
static bool recAktion(const char* a, int wert) {
    if (!strcmp(a, "rec")) { if (recLaeuftJetzt()) recStopp(); else { recStart(); } return true; }
    if (!strcmp(a, "merker")) { if (recLaeuftJetzt()) recMerkerSetzen(); else tone(PIN_BUZZER, 900, 80); return true; }
    int zeile = recLaeuftJetzt() ? wert - 1 : wert;   // Zeilen-Knöpfe zählen auf dem Bild, die laufende Aufnahme steht oben
    if (!strcmp(a, "wahl")) {
        if (zeile < 0 || zeile >= recListeN) return true;
        bool gleich = zeile == recWahl && recSpielt;
        recWahl = zeile;
        if (appDa()) {                           // Fernbedienung: das Handy spielt (noch einmal = Pause)
            char j[96];
            snprintf(j, sizeof j, "{\"t\":\"rec\",\"a\":\"%s\",\"datei\":\"%s\"}", gleich ? "pause" : "abspielen", recListe[zeile].name);
            sendEvt(j);
            recSpielt = true;
        }
        return true;
    }
    if (!strcmp(a, "hoch") || !strcmp(a, "runter")) {
        int r = !strcmp(a, "hoch") ? -1 : 1;
        if (recSpielt && appDa()) {             // beim Anhören: voriger/nächster Merker
            char j[48];
            snprintf(j, sizeof j, "{\"t\":\"rec\",\"a\":\"springe\",\"r\":%d}", r);
            sendEvt(j);
            return false;                       // Anzeige bleibt
        }
        if (recListeN) recWahl = (recWahl + r + recListeN) % recListeN;
        return true;
    }
    return false;
}

/** Aus audioLoop, solange audioRec: Abschluss nach dem Stopp */
static void recAbschluss() {
    if (!audioFertig || !recSchreiberFertig) return;
    audioFertig = false;
    audioRec = false;
    recDatei.close();
    uint32_t dauerMs = audioMs;
    char ziel[48];
    snprintf(ziel, sizeof ziel, "/ist/puffer/%s", recName);
    bool ok = SD.rename(REC_LAUF, ziel);
    File f = SD.open("/ist/recorder/liste.txt", FILE_APPEND);
    if (f) { f.printf("%s %lu %lu %d\n", recName, (unsigned long)(recStartMs / 1000), (unsigned long)(dauerMs / 1000), recMerkerN); f.close(); }
    // Notiz-Zeile: die App holt die Datei damit wie ein Offline-Diktat ab (oder überspringt sie, wenn live alles kam)
    String m = "[";
    for (int i = 0; i < recMerkerN; i++) { if (i) m += ","; m += String(recMerker[i]); }
    m += "]";
    char j[200];
    snprintf(j, sizeof j, "{\"t\":%llu,\"typ\":\"notiz\",\"quelle\":\"sticky\",\"art\":\"recorder\",\"audio\":\"%s\",\"dauerMs\":%lu,\"offline\":true,\"merker\":",
             (unsigned long long)recStartMs, recName, (unsigned long)dauerMs);
    notizAnhaengen((String(j) + m + "}").c_str());
    if (connected) {
        snprintf(j, sizeof j, "{\"t\":\"rec\",\"a\":\"stop\",\"datei\":\"%s\",\"ms\":%lu,\"pakete\":%lu,\"verlust\":%lu,\"live\":%d,\"merker\":",
                 recName, (unsigned long)dauerMs, (unsigned long)audioPakete, (unsigned long)(audioVerworfen + recLiveVerlust), recLive ? 1 : 0);
        String e = String(j) + (m.length() < 300 ? m : String("[]")) + "}";
        sendEvt(e.c_str());
    }
    if (recLive) slowAt = millis() + 1500;
    readBattery();
    protokoll("Recorder fertig: %s, %lu s, %lu Pakete, %lu verworfen, live %s (%lu Verlust), %d Merker, Akku %d → %d %% (%d → %d mV)%s",
              recName, (unsigned long)(dauerMs / 1000), (unsigned long)audioPakete, (unsigned long)audioVerworfen, recLive ? "ja" : "nein",
              (unsigned long)recLiveVerlust, recMerkerN, recBatStart, batPct, recMvStart, batMv, ok ? "" : " · Umbenennen fehlgeschlagen");
    if (recFehler) recGrund = 3;
    recLive = false;
    tone(PIN_BUZZER, 3000, 60); delay(80); tone(PIN_BUZZER, 2000, 100);
    recWahl = 0;
    recListeLaden();
    if (modus == M_WIDGET && wRecorder) wTextNeu = true;
    wantState = true;
}

/** Aus widgetLoop (jede Runde): Akku, volle Stunde, Anzeige minutenweise */
static void recLoop() {
    static uint32_t akkuZuletzt = 0;
    if (recLaeuftJetzt()) {
        aktiv();                                  // nicht einschlummern (schlaf.h prüft audioLaeuft ohnehin)
        uint32_t ms = millis() - recT0;
        int stunde = ms / 3600000;
        if (stunde > recStundeGewarnt) {         // nach 60 min (und jeder weiteren Stunde): Piepton und „!“
            recStundeGewarnt = stunde;
            for (int k = 0; k < 2; k++) { tone(PIN_BUZZER, 2700, 150); delay(250); }
            protokoll("Recorder: %d h", stunde);
        }
        if (millis() - akkuZuletzt > 30000) {
            akkuZuletzt = millis();
            readBattery();
            bool leer = !usbDa() && ((batPct >= 0 && batPct < 15 && (batMv <= 0 || batMv < 3700)) || (batMv > 0 && batMv < 3450));
            if (leer) { recGrund = 1; protokoll("Recorder: Akku %d %% %d mV, stoppt", batPct, batMv); recStopp(); }
        }
    }
    if (modus == M_WIDGET && wRecorder && !hilfeAn) {
        uint32_t m = millis() / 60000;
        if (m != recSeiteMinute) { recSeiteMinute = m; wTextNeu = true; }
    }
}
