/**
 * Audio-Durchstich: KI-Taste halten → PDM-Mikro (MSM261) → IMA-ADPCM 16 kHz mono → BLE-Notify an die App.
 *
 * Mikro laut Schaltplan: PDM_CLK GPIO19, PDM_DATA GPIO20, PDM_EN GPIO38 (TPS22916, HIGH = Strom an).
 * Der Arduino-Core kann bei PDM keinen Kanal wählen → Stereo lesen, beim Start messen, wo das Mikro sitzt.
 *
 * Paket auf AUDIO (b1e50005, notify): seq:u16 · prädiktor:i16 · index:u8 · 240 Byte ADPCM (480 Samples = 30 ms).
 * Jedes Paket trägt den Decoder-Zustand, ein verlorenes Paket stört die folgenden also nicht.
 */
#include <ESP_I2S.h>

static const int PIN_PDM_CLK = 19, PIN_PDM_DATA = 20, PIN_PDM_EN = 38;
static const int AUDIO_RATE = 16000;
static const int AUDIO_SAMPLES = 480;                 // pro Paket, 30 ms
static const int AUDIO_PAKET = 5 + AUDIO_SAMPLES / 2; // 245 Byte
static const uint32_t AUDIO_MAX_MS = 60000;
static const uint16_t AUDIO_MIN = 12, AUDIO_MAX = 24; // 15–30 ms reichen für 8 KB/s

static I2SClass i2s;
static NimBLECharacteristic* chAudio;
static volatile bool audioLaeuft = false, audioStopp = false, audioFertig = false;
static volatile uint32_t audioPakete = 0, audioVerworfen = 0, audioMs = 0;
static volatile int audioSpitze = 0;
static int micKanal = 0;      // 0 = links, 1 = rechts (Selbsttest)
static int micVerstaerkung = 4;
static volatile int indikator = 0;  // 1 = einblenden, 2 = ausblenden (erledigt loop())

// ---- IMA-ADPCM ---------------------------------------------------------------------------
static const int16_t ADPCM_STEP[89] = {
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97,
    107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
    876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871,
    5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623,
    27086, 29794, 32767};
static const int8_t ADPCM_INDEX[16] = {-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8};
struct AdpcmZustand { int pred = 0; int index = 0; };

static uint8_t adpcmCode(AdpcmZustand& z, int s) {
    int step = ADPCM_STEP[z.index];
    int diff = s - z.pred;
    uint8_t code = 0;
    if (diff < 0) { code = 8; diff = -diff; }
    int vp = step >> 3;
    if (diff >= step) { code |= 4; diff -= step; vp += step; }
    step >>= 1;
    if (diff >= step) { code |= 2; diff -= step; vp += step; }
    step >>= 1;
    if (diff >= step) { code |= 1; vp += step; }
    z.pred += (code & 8) ? -vp : vp;
    if (z.pred > 32767) z.pred = 32767;
    if (z.pred < -32768) z.pred = -32768;
    z.index += ADPCM_INDEX[code];
    if (z.index < 0) z.index = 0;
    if (z.index > 88) z.index = 88;
    return code;
}

// ---- Mikro ---------------------------------------------------------------------------------
static bool micAn() {
    digitalWrite(PIN_PDM_EN, HIGH);
    delay(30);
    i2s.setPinsPdmRx(PIN_PDM_CLK, PIN_PDM_DATA);
    if (!i2s.begin(I2S_MODE_PDM_RX, AUDIO_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO)) {
        Serial.println("Mikro: I2S-Start fehlgeschlagen");
        digitalWrite(PIN_PDM_EN, LOW);
        return false;
    }
    return true;
}
static void micAus() {
    i2s.end();
    digitalWrite(PIN_PDM_EN, LOW);
}

/** Misst kurz beide Kanäle; der mit Rauschen ist das Mikro. */
static void micSelbsttest() {
    pinMode(PIN_PDM_EN, OUTPUT);
    digitalWrite(PIN_PDM_EN, LOW);
    if (!micAn()) return;
    static int16_t buf[2 * 512];
    double summe[2] = {0, 0}, quad[2] = {0, 0};
    int lo[2] = {32767, 32767}, hi[2] = {-32768, -32768};
    long n = 0;
    uint32_t t0 = millis();
    while (millis() - t0 < 500) {
        size_t b = i2s.readBytes((char*)buf, sizeof buf);
        if (millis() - t0 < 150) continue;     // Einschwingen verwerfen
        for (size_t i = 0; i + 1 < b / 2; i += 2) {
            for (int k = 0; k < 2; k++) {
                int v = buf[i + k];
                summe[k] += v;
                quad[k] += (double)v * v;
                if (v < lo[k]) lo[k] = v;
                if (v > hi[k]) hi[k] = v;
            }
            n++;
        }
    }
    micAus();
    // Streuung ohne Gleichanteil: das echte Mikro rauscht, ein toter Kanal steht still
    double mittel[2], sd[2];
    for (int k = 0; k < 2; k++) {
        mittel[k] = n ? summe[k] / n : 0;
        sd[k] = n ? sqrt(max(0.0, quad[k] / n - mittel[k] * mittel[k])) : 0;
    }
    micKanal = sd[1] > sd[0] ? 1 : 0;
    Serial.printf("Mikro: links mittel %.0f sd %.1f [%d..%d] / rechts mittel %.0f sd %.1f [%d..%d] -> %s\n",
                  mittel[0], sd[0], lo[0], hi[0], mittel[1], sd[1], lo[1], hi[1], micKanal ? "rechts" : "links");
}

// ---- Aufnahme ------------------------------------------------------------------------------
static void audioTask(void*) {
    static int16_t roh[2 * AUDIO_SAMPLES];
    static uint8_t paket[AUDIO_PAKET];
    AdpcmZustand z;
    uint16_t seq = 0;
    float dcX = 0, dcY = 0;   // Gleichanteil-Filter (Hochpass ~20 Hz)
    bool erstes = true;
    int vorlauf = 4;          // erste 120 ms verwerfen: Mikro und Filter schwingen ein (Knacks, gemessen 11.11.2026)
    uint32_t t0 = millis();
    audioPakete = audioVerworfen = 0;
    audioSpitze = 0;
    while (!audioStopp && millis() - t0 < AUDIO_MAX_MS && (connected || audioOffline)) {
        size_t b = i2s.readBytes((char*)roh, sizeof roh);
        if (b < sizeof roh) continue;
        paket[0] = seq & 0xFF; paket[1] = seq >> 8;
        paket[2] = z.pred & 0xFF; paket[3] = (z.pred >> 8) & 0xFF; paket[4] = z.index;
        for (int i = 0; i < AUDIO_SAMPLES; i++) {
            float x = roh[2 * i + micKanal];
            if (erstes) { dcX = x; erstes = false; }
            dcY = x - dcX + 0.992f * dcY;
            dcX = x;
            int s = (int)(dcY * micVerstaerkung);
            if (s > 32767) s = 32767;
            if (s < -32768) s = -32768;
            if (!vorlauf && abs(s) > audioSpitze) audioSpitze = abs(s);
            uint8_t c = adpcmCode(z, s);
            if (i & 1) paket[5 + i / 2] |= c << 4; else paket[5 + i / 2] = c;
        }
        if (vorlauf) { vorlauf--; continue; }
        seq++;
        if (audioOffline) {
            if (audioDatei.write(paket, AUDIO_PAKET) == AUDIO_PAKET) audioPakete++; else audioVerworfen++;
            continue;
        }
        chAudio->setValue(paket, AUDIO_PAKET);
        if (chAudio->notify()) audioPakete++; else audioVerworfen++;
    }
    audioMs = millis() - t0;
    micAus();
    audioLaeuft = false;
    audioFertig = true;
    vTaskDelete(nullptr);
}

static void aufnahmeStart() {
    if (audioLaeuft) return;
    if (!connected) {
        // Ohne Handy: in den Puffer aufnehmen, die App holt es später ab
        if (!offlineAufnahmeOeffnen()) return;
        if (!micAn()) { audioDatei.close(); return; }
        audioOffline = true;
        audioStopp = false;
        audioLaeuft = true;
        xTaskCreatePinnedToCore(audioTask, "audio", 6144, nullptr, 5, nullptr, 1);
        indikator = 1;
        return;
    }
    audioOffline = false;
    if (mtu < AUDIO_PAKET + 3) { sendEvt("{\"t\":\"audio\",\"a\":\"fehler\",\"err\":\"mtu\"}"); return; }
    if (!micAn()) { sendEvt("{\"t\":\"audio\",\"a\":\"fehler\",\"err\":\"mikro\"}"); return; }
    audioStopp = false;
    audioLaeuft = true;
    slowAt = 0;
    server->updateConnParams(connHandle, AUDIO_MIN, AUDIO_MAX, 0, 400);
    char j[140];
    snprintf(j, sizeof j, "{\"t\":\"audio\",\"a\":\"start\",\"rate\":%d,\"codec\":\"ima-adpcm\",\"n\":%d,\"ms\":%llu}", AUDIO_RATE, AUDIO_SAMPLES, (unsigned long long)jetztMs());
    sendEvt(j);
    xTaskCreatePinnedToCore(audioTask, "audio", 6144, nullptr, 5, nullptr, 1);
    indikator = 1;
}

static void aufnahmeStopp() {
    if (audioLaeuft) audioStopp = true;
}

/** Aus loop(): Abschluss melden und Anzeige pflegen. */
static void audioLoop() {
    if (audioFertig && audioOffline) {
        audioFertig = false;
        audioOffline = false;
        audioDatei.close();
        char j[200];
        snprintf(j, sizeof j, "{\"t\":%llu,\"typ\":\"notiz\",\"quelle\":\"sticky\",\"art\":\"diktat\",\"audio\":\"%s\",\"dauerMs\":%lu,\"offline\":true}",
                 (unsigned long long)jetztMs(), audioName, (unsigned long)audioMs);
        notizAnhaengen(j);
        Serial.printf("Offline-Diktat: %s\n", j);
        indikator = 3;   // Rückmeldung „Diktat gespeichert“
    }
    if (audioFertig) {
        audioFertig = false;
        char j[140];
        snprintf(j, sizeof j, "{\"t\":\"audio\",\"a\":\"stop\",\"pakete\":%lu,\"verworfen\":%lu,\"ms\":%lu,\"spitze\":%d}",
                 (unsigned long)audioPakete, (unsigned long)audioVerworfen, (unsigned long)audioMs, audioSpitze);
        sendEvt(j);
        slowAt = millis() + 1500;
        indikator = 2;
    }
    // Hinweis oben rechts per Teil-Refresh; Ausblenden zeichnet die Seite darunter neu
    static const int IX = 560, IY = 12, IW = 228, IH = 52;
    static bool slotAktiv = false;
    static uint16_t sk[4];
    if (indikator == 1 && LittleFS.exists("/fahrt/r06.bin")) {
        indikator = 0;
        File f = LittleFS.open("/fahrt/r06.bin", "r");
        f.read((uint8_t*)sk, 8);
        size_t n = (size_t)sk[2] / 8 * sk[3];
        if (n <= IMG_BYTES && f.read(rxBuf, n) == n) {
            display.drawBitmap(sk[0], sk[1], rxBuf, sk[2], sk[3], TFT_BLACK, TFT_WHITE);
            display.updatePartial(sk[0], sk[1], sk[2], sk[3]);
            slotAktiv = true;
        }
        f.close();
    } else if (indikator == 3) {
        indikator = 0;
        slotAktiv = false;
        rueckZeigen(5);   // „✓ Diktat“ an derselben Stelle wie die Knopf-Rückmeldungen
    } else if (indikator == 2 && slotAktiv) {
        indikator = 0;
        slotAktiv = false;
        // Stelle aus der gemerkten Seite wiederherstellen
        if (strcmp(seite, "karte") != 0) display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        else zeichneKarte();
        display.updatePartial(sk[0], sk[1], sk[2], sk[3]);
    } else if (indikator == 1) {
        indikator = 0;
        display.fillRoundRect(IX, IY, IW, IH, 10, TFT_BLACK);
        display.fillCircle(IX + 30, IY + IH / 2, 10, TFT_WHITE);
        display.setTextColor(TFT_WHITE);
        display.setTextDatum(ML_DATUM);
        display.setFreeFont(&FreeSans12pt7b);
        display.drawString("Aufnahme", IX + 52, IY + IH / 2);
        display.setFreeFont(nullptr);
        display.updatePartial(IX - 4, IY - 4, IW + 8, IH + 8);
    } else if (indikator == 2) {
        indikator = 0;
        if (strcmp(seite, "bild") == 0) display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        else zeichneKarte();
        display.updatePartial(IX - 4, IY - 4, IW + 8, IH + 8);
    }
}
