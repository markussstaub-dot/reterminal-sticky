/**
 * Notfall (SPEC „SD-Karte als Bibliothek und Bugout-Sticky“, Schritt 1, FW 0.40.0)
 *   /soll/widgets/notfall/bild.bin    Notfallblatt 800 × 480 quer, 1 bpp (rendert das Zenbook: sticky-app/tools/notfallblatt.py)
 *   /soll/widgets/notfall/felder.txt  typ notfall · knopf <x0> <y0> <x1> <y1> sos|spar
 *   /ist/notfall.txt                  „spar 1“ bzw. „spar 0“ (überlebt einen leeren Akku)
 * Liegt das Blatt auf der Karte, hängt der Sticky „widget notfall“ selbst ans Karussell (▲/▼), die App muss es nicht kennen.
 * Sparmodus: Funk bleibt aus (auch am USB), kein Bewegungswecken, kein Klima, kein Stundenfenster; geschlafen wird bis zur
 * vollen Stunde (bzw. bis Timer oder Wecker), und vor dem Einschlafen steht immer das Notfallblatt da.
 * Akku fast leer (≤ 3 % oder < 3450 mV, ohne USB): Sparmodus an und Notfallblatt zeigen – e-Ink hält es ohne Strom.
 * SOS: Morse … – – – … über den Summer, bis eine Taste oder SOS erneut gedrückt wird.
 *
 * Notfalldokumente mit PIN (Schritt 2, FW 0.41.0):
 *   /soll/notfall/doku/sNNN.bin       je Seite nonce(12) | tag(16) | AES-256-GCM(48000 Byte Bild), AAD „sNNN“; s000 = Inhalt
 *   /soll/widgets/nf-pin/             PIN-Seite: typ nfpin · punkte <x> <y> · knopf … ziffer <0–9> | zurueck | ok
 *   /soll/widgets/nf-doku/            Betrachter: typ nfdoku · seiten <n> · knopf … seite <i> (nur auf s000) ·
 *                                     taste up blatt -1 · taste down blatt 1; bild.bin = „gesperrt“
 *   NVS „notfall“: blob = salt(16) | nonce(12) | tag(16) | AES-GCM(Schlüssel 32 Byte) mit PBKDF2-SHA256(PIN, salt),
 *   fehl = Fehlversuche. 10 falsche PINs → blob gelöscht (Karte allein ist wertlos, Backup bleibt am Zenbook).
 *   Der Schlüssel kommt per USB-Zeile „SCHLUESSEL <152 Hex>“ (fertig verpackt, die PIN tippt man am Zenbook).
 *   Entschlüsselt wird nur in den RAM; wer den Betrachter verlässt, einschläft oder 2 min nichts tut, sperrt wieder.
 */
static bool notSpar = false, notSparGeladen = false, notLeerGezeigt = false, notLeise = false;
static bool sosAn = false;
static int sosSchritt = 0;
static uint32_t sosNaechster = 0;
static bool sosTon = false;

static bool notfallSpar();
static bool notfallLeise() { return notLeise; }
// Notfalldokumente (FW 0.41.0)
static uint8_t nfKey[32];
static bool nfKeyDa = false;
static char nfPin[8] = "";
static int nfSeite = 0;
static const int NF_BLOB = 76, NF_PIN_MAX = 6, NF_FEHL_MAX = 10, NF_ITER = 10000;
static bool nfBlobDa();
static bool notfallDa() { return sollDa("widgets/notfall/felder.txt") && sollDa("widgets/notfall/bild.bin"); }
static bool notfallSichtbar() { return modus == M_WIDGET && !strcmp(widgetName, "notfall") && !hilfeAn; }

static void notSparLaden() {
    if (notSparGeladen) return;
    notSparGeladen = true;
    if (!sdEin()) return;
    File f = SD.open("/ist/notfall.txt", FILE_READ);
    if (!f) return;
    String z = f.readStringUntil('\n');
    f.close();
    notSpar = z.startsWith("spar 1");
}
static void notSparSetzen(bool an, const char* grund) {
    notSparLaden();
    if (an == notSpar) return;
    notSpar = an;
    if (sdEin()) {
        SD.mkdir("/ist");
        File f = SD.open("/ist/notfall.txt", FILE_WRITE);
        if (f) { f.printf("spar %d\n", an ? 1 : 0); f.close(); }
    }
    protokoll("Notfall-Sparmodus %s (%s, Akku %d %% %d mV)", an ? "an" : "aus", grund, batPct, batMv);
}

static bool notfallSpar() { notSparLaden(); return notSpar; }

/** Notfallblatt nach vorn holen; leise = ohne Doppelklick (vor dem Einschlafen) */
static void notfallZeigen(bool leise) {
    if (!notfallDa() || notfallSichtbar()) return;
    strlcpy(widgetName, "notfall", sizeof widgetName);
    notLeise = leise;
    setzeModus(M_WIDGET);
    notLeise = false;
}

/** Aus widgetZeigen: gewählten Sparmodus am Knopf „spar“ mit dickem Rahmen zeigen */
static void notfallMarkieren() {
    notSparLaden();
    if (!notSpar) return;
    for (int i = 0; i < wKnopfAnzahl; i++) {
        const WKnopf& k = wKnoepfe[i];
        if (strcmp(k.aktion, "spar")) continue;
        const int d = 6;
        int x0 = max(0, k.x0 & ~7), x1 = min(W, (k.x1 + 7) & ~7), y0 = max(0, k.y0), y1 = min(H, k.y1);
        bildRechteck(x0, y0, x1 - x0, d, true);
        bildRechteck(x0, y1 - d, x1 - x0, d, true);
        bildRechteck(x0, y0, d, y1 - y0, true);
        bildRechteck(x1 - d, y0, d, y1 - y0, true);
    }
}

// SOS: Paare (Ton ms, Pause ms); Punkt 200, Strich 600, Buchstabenpause 600, Wortpause 1400
static const uint16_t SOS_FOLGE[][2] = {
    {200, 200}, {200, 200}, {200, 600}, {600, 200}, {600, 200}, {600, 600}, {200, 200}, {200, 200}, {200, 1400}};
static const int SOS_N = sizeof SOS_FOLGE / sizeof SOS_FOLGE[0];

static void sosStopp() {
    if (!sosAn) return;
    sosAn = false;
    noTone(PIN_BUZZER);
    protokoll("SOS aus");
}
static void sosStart() {
    sosAn = true; sosSchritt = 0; sosTon = false; sosNaechster = millis() + 300;
    protokoll("SOS an (Akku %d %%)", batPct);
}

/** Aus widgetAktion (typ notfall): true = Aktion gehört dem Notfall */
static bool notfallAktion(const char* a, int wert) {
    (void)wert;
    if (!strcmp(a, "sos")) { if (sosAn) sosStopp(); else sosStart(); return true; }
    if (!strcmp(a, "doku")) {                      // Notfalldokumente: PIN bzw. gleich der Betrachter
        if (!nfBlobDa() || !sollDa("widgets/nf-pin/felder.txt")) { tone(PIN_BUZZER, 900, 200); protokoll("Notfall-Dokumente: kein Schlüssel bzw. keine PIN-Seite"); return true; }
        nfPin[0] = 0; nfSeite = 0;
        strlcpy(widgetName, nfKeyDa ? "nf-doku" : "nf-pin", sizeof widgetName);
        neuZeichnen = true;
        return true;
    }
    if (!strcmp(a, "spar")) {
        notSparLaden();
        notSparSetzen(!notSpar, "Knopf");
        tone(PIN_BUZZER, notSpar ? 1500 : 3300, 80);
        if (!notSpar && !funkAn) funkEin(true);
        neuZeichnen = true;                         // Seite neu, mit bzw. ohne Rahmen
        return true;
    }
    return false;
}

/** Aus tasteAktion: jede Taste beendet SOS (wie das Suchen-Piepen) */
static bool notfallTaste(bool gedrueckt) {
    if (!sosAn || !gedrueckt) return false;
    sosStopp();
    return true;
}

/** Ms bis zum nächsten Wecken im Sparmodus: volle Stunde, Wecker (falls an) */
static uint64_t notfallSchlafMs(uint64_t standard) {
    if (!notSpar) return standard;
    time_t jetzt = time(nullptr);
    tm t;
    localtime_r(&jetzt, &t);
    if (t.tm_year < 120) return 3600000ULL;
    int jetztS = t.tm_min * 60 + t.tm_sec;
    uint64_t ms = (3600 - jetztS) * 1000ULL + 300;
    if (weckAn) {
        int d = ((weckH * 60 + weckM) - (t.tm_hour * 60 + t.tm_min) + 1440) % 1440;
        if (d == 0) d = 1440;
        uint64_t w = (uint64_t)d * 60000ULL - t.tm_sec * 1000ULL + 300;
        if (w < ms) ms = w;
    }
    return ms;
}

/** Aus loop(): SOS takten, Akku beobachten */
static void nfLoop();
static void notfallLoop() {
    notSparLaden();
    nfLoop();
    if (sosAn) {
        aktiv();                                    // während SOS nicht einschlafen
        if ((int32_t)(millis() - sosNaechster) >= 0) {
            if (!sosTon) {
                tone(PIN_BUZZER, 2700, SOS_FOLGE[sosSchritt][0]);
                sosNaechster = millis() + SOS_FOLGE[sosSchritt][0];
                sosTon = true;
            } else {
                sosNaechster = millis() + SOS_FOLGE[sosSchritt][1];
                sosTon = false;
                sosSchritt = (sosSchritt + 1) % SOS_N;
            }
        }
    }
    static uint32_t zuletzt = 0;
    if (millis() - zuletzt < 10000) return;
    zuletzt = millis();
    if (usbDa()) { notLeerGezeigt = false; return; }
    bool leer = (batPct >= 0 && batPct <= 3) || (batMv > 0 && batMv < 3450);
    if (!leer || notLeerGezeigt) return;
    notLeerGezeigt = true;
    protokoll("Akku fast leer (%d %% %d mV): Notfallblatt", batPct, batMv);
    sosStopp();
    notSparSetzen(true, "Akku leer");
    notfallZeigen(false);
}

// ---- Dateien per USB-Kabel vom Zenbook (FW 0.40.0) ---------------------------------------------------------------------
// Zeile „DATEI <pfad unter /soll> <länge>\n“, danach genau <länge> Byte. Antwort „DATEI OK <pfad>“ bzw. „DATEI FEHLER <grund>“.
// Über UART0 (Serial0): der USB-Stecker hängt am CH343-Wandler, nicht am USB des ESP32. Nur unter /soll, kein „..“, höchstens 1 MB. Danach Karussell neu laden (das Notfallblatt hängt sich selbst an).
static void nfSchluesselZeile(const char* hex);
static void serielleDatei() {
    static char zeile[200];
    static int n = 0;
    while (Serial0.available()) {
        int c = Serial0.read();
        if (c < 0) return;
        if (c == '\r') continue;
        if (c != '\n') { if (n < (int)sizeof zeile - 1) zeile[n++] = (char)c; continue; }
        zeile[n] = 0;
        n = 0;
        if (!strncmp(zeile, "SCHLUESSEL ", 11)) { nfSchluesselZeile(zeile + 11); continue; }
        char rel[64];
        long len = 0;
        if (sscanf(zeile, "DATEI %63s %ld", rel, &len) != 2) continue;
        if (len <= 0 || len > 1048576 || strstr(rel, "..") || rel[0] == '/') { Serial0.println("DATEI FEHLER pfad oder laenge"); continue; }
        uint8_t* buf = (uint8_t*)ps_malloc(len);
        if (!buf) { Serial0.println("DATEI FEHLER speicher"); continue; }
        // Handschlag (FW 0.41.0): erst jetzt schickt das Zenbook die Bytes – sonst lief der Puffer über, während die
        // Schleife noch mit Display oder Karte beschäftigt war (17.11.2026: 23 von 48 KB angekommen)
        while (Serial0.available()) Serial0.read();
        Serial0.println("DATEI BEREIT");
        Serial0.setTimeout(10000);
        size_t got = Serial0.readBytes(buf, len);
        bool ok = got == (size_t)len && sollSchreiben(rel, buf, len);
        free(buf);
        aktiv();
        if (!ok) { Serial0.printf("DATEI FEHLER %u von %ld Byte\n", (unsigned)got, len); continue; }
        protokoll("USB: %s (%ld Byte)", rel, len);
        Serial0.printf("DATEI OK %s\n", rel);
        sollGeaendert(rel);                         // wie nach einem Bluetooth-Abgleich: Dokumente, Sprung, Lage, Karussell …
        if (!strncmp(rel, "widgets/", 8)) {
            karussellLaden();
            if (modus == M_WIDGET) neuZeichnen = true;
        }
    }
}

// ---- Notfalldokumente mit PIN (FW 0.41.0) -------------------------------------------------------------------------------
#include <Preferences.h>
#include "mbedtls/gcm.h"
#include "mbedtls/pkcs5.h"

static bool nfBlobDa() {
    Preferences p;
    if (!p.begin("notfall", true)) return false;
    bool da = p.getBytesLength("blob") == (size_t)NF_BLOB;
    p.end();
    return da;
}

/** AES-256-GCM entschlüsseln; false bei falschem Schlüssel oder veränderten Daten */
static bool nfGcmAuf(const uint8_t* key, const uint8_t* nonce, const uint8_t* tag, const uint8_t* ct, size_t n, uint8_t* out,
                     const uint8_t* aad, size_t aadN) {
    mbedtls_gcm_context c;
    mbedtls_gcm_init(&c);
    bool ok = mbedtls_gcm_setkey(&c, MBEDTLS_CIPHER_ID_AES, key, 256) == 0 &&
              mbedtls_gcm_auth_decrypt(&c, n, nonce, 12, aad, aadN, tag, 16, ct, out) == 0;
    mbedtls_gcm_free(&c);
    return ok;
}

/** „SCHLUESSEL <hex>“ bzw. „SCHLUESSEL LOESCHEN“ von der USB-Zeile */
static void nfSchluesselZeile(const char* hex) {
    Preferences p;
    if (!strcmp(hex, "LOESCHEN")) {
        p.begin("notfall", false); p.remove("blob"); p.putInt("fehl", 0); p.end();
        memset(nfKey, 0, sizeof nfKey); nfKeyDa = false;
        protokoll("Notfall: Schlüssel per USB gelöscht");
        Serial0.println("SCHLUESSEL OK geloescht");
        return;
    }
    uint8_t blob[NF_BLOB];
    if (strlen(hex) != NF_BLOB * 2) { Serial0.println("SCHLUESSEL FEHLER laenge"); return; }
    for (int i = 0; i < NF_BLOB; i++) {
        unsigned v;
        if (sscanf(hex + 2 * i, "%2x", &v) != 1) { Serial0.println("SCHLUESSEL FEHLER hex"); return; }
        blob[i] = (uint8_t)v;
    }
    p.begin("notfall", false);
    bool ok = p.putBytes("blob", blob, NF_BLOB) == (size_t)NF_BLOB;
    p.putInt("fehl", 0);
    p.end();
    memset(nfKey, 0, sizeof nfKey); nfKeyDa = false;
    aktiv();
    protokoll("Notfall: neuer Schlüssel per USB (%s)", ok ? "gespeichert" : "Fehler");
    Serial0.println(ok ? "SCHLUESSEL OK" : "SCHLUESSEL FEHLER nvs");
}

/** PIN prüfen und den Schlüssel in den RAM holen; zählt Fehlversuche, löscht nach NF_FEHL_MAX */
static bool nfEntsperren(const char* pin) {
    Preferences p;
    p.begin("notfall", false);
    uint8_t blob[NF_BLOB];
    if (p.getBytes("blob", blob, NF_BLOB) != (size_t)NF_BLOB) { p.end(); return false; }
    int fehl = p.getInt("fehl", 0);
    uint8_t kek[32];
    uint32_t t0 = millis();
    mbedtls_pkcs5_pbkdf2_hmac_ext(MBEDTLS_MD_SHA256, (const uint8_t*)pin, strlen(pin), blob, 16, NF_ITER, 32, kek);
    bool ok = nfGcmAuf(kek, blob + 16, blob + 28, blob + 44, 32, nfKey, nullptr, 0);
    memset(kek, 0, sizeof kek);
    if (ok) { nfKeyDa = true; p.putInt("fehl", 0); protokoll("Notfall-Dokumente entsperrt (%lu ms)", (unsigned long)(millis() - t0)); }
    else {
        memset(nfKey, 0, sizeof nfKey);
        fehl++;
        if (fehl >= NF_FEHL_MAX) { p.remove("blob"); p.putInt("fehl", 0); protokoll("Notfall: %d falsche PINs, Schlüssel gelöscht", fehl); }
        else { p.putInt("fehl", fehl); protokoll("Notfall: falsche PIN (%d von %d)", fehl, NF_FEHL_MAX); }
    }
    p.end();
    if (!ok && fehl >= 3 && fehl < NF_FEHL_MAX) delay(min(8000, (fehl - 2) * 1000));   // ab dem 3. Fehler bremsen
    return ok;
}

static void nfZu(const char* grund) {
    if (!nfKeyDa && !nfPin[0]) return;
    memset(nfKey, 0, sizeof nfKey);
    nfKeyDa = false;
    memset(nfPin, 0, sizeof nfPin);
    protokoll("Notfall-Dokumente gesperrt (%s)", grund);
}
static bool nfImBetrachter() { return modus == M_WIDGET && (!strcmp(widgetName, "nf-doku") || !strcmp(widgetName, "nf-pin")); }

/** PIN-Seite: Kästchen für die eingegebenen Stellen (voll = getippt) */
static void nfPinZeichnen() {
    if (wPunkteX < 0) return;
    int n = strlen(nfPin);
    for (int i = 0; i < NF_PIN_MAX; i++) {
        int x = (wPunkteX & ~7) + i * 56, y = wPunkteY;
        bildRechteck(x, y, 40, 40, false);
        if (i < n) bildRechteck(x, y, 40, 40, true);
        else { bildRechteck(x, y, 40, 4, true); bildRechteck(x, y + 36, 40, 4, true); bildRechteck(x, y, 4, 40, true); bildRechteck(x + 36, y, 4, 40, true); }
    }
}
static void nfPinZeigen() {
    nfPinZeichnen();
    bildZeigen(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    if (wPunkteX >= 0) teilZeigen(wPunkteX & ~7, wPunkteY, NF_PIN_MAX * 56, 40);
}

/** Betrachter: Seite nfSeite entschlüsseln (ohne Schlüssel bleibt das Bild „gesperrt“) */
static void nfDokuZeichnen() {
    if (!nfKeyDa) return;
    static uint8_t* roh = nullptr;
    if (!roh) roh = (uint8_t*)ps_malloc(28 + IMG_BYTES);
    char rel[40], aad[8];
    snprintf(rel, sizeof rel, "notfall/doku/s%03d.bin", nfSeite);
    snprintf(aad, sizeof aad, "s%03d", nfSeite);
    if (!roh || !sollLesen(rel, roh, 28 + IMG_BYTES) || !nfGcmAuf(nfKey, roh, roh + 12, roh + 28, IMG_BYTES, imgBuf, (const uint8_t*)aad, 4)) {
        memset(imgBuf, 0, IMG_BYTES);
        tone(PIN_BUZZER, 900, 200);
        protokoll("Notfall-Dokumente: Seite %d nicht lesbar", nfSeite);
    }
}

/** Aktionen der PIN-Seite und des Betrachters */
static void nfAktion(const char* a, int wert) {
    if (wNfPin) {
        if (!strcmp(a, "ziffer") && wert >= 0 && wert <= 9) {
            int n = strlen(nfPin);
            if (n >= NF_PIN_MAX) { tone(PIN_BUZZER, 900, 60); return; }
            nfPin[n] = '0' + wert; nfPin[n + 1] = 0;
            nfPinZeigen();
            return;
        }
        if (!strcmp(a, "zurueck")) { int n = strlen(nfPin); if (n) nfPin[n - 1] = 0; nfPinZeigen(); return; }
        if (!strcmp(a, "ok")) {
            if (strlen(nfPin) < 4) { tone(PIN_BUZZER, 900, 120); return; }
            bool ok = nfEntsperren(nfPin);
            memset(nfPin, 0, sizeof nfPin);
            if (ok) { tone(PIN_BUZZER, 3300, 60); nfSeite = 0; strlcpy(widgetName, "nf-doku", sizeof widgetName); neuZeichnen = true; }
            else {
                tone(PIN_BUZZER, 900, 400);
                if (!nfBlobDa()) { strlcpy(widgetName, "notfall", sizeof widgetName); neuZeichnen = true; }   // gelöscht: zurück aufs Blatt
                else nfPinZeigen();
            }
        }
        return;
    }
    if (wNfDoku && nfKeyDa) {
        int n = max(1, wSeiten);
        if (!strcmp(a, "blatt")) { nfSeite = ((nfSeite + wert) % n + n) % n; neuZeichnen = true; return; }
        if (!strcmp(a, "seite") && nfSeite == 0 && wert > 0 && wert < n) { nfSeite = wert; neuZeichnen = true; return; }
    }
}

/** Aus notfallLoop: Betrachter verlassen oder 2 min nichts getan → sperren */
static void nfLoop() {
    if (!nfKeyDa && !nfPin[0]) return;
    if (!nfImBetrachter()) { nfZu("verlassen"); return; }
    if (millis() - letzteBedienung > 120000) {
        nfZu("2 min ohne Bedienung");
        if (notfallDa()) notfallZeigen(true); else setzeModus(M_HOME);
    }
}

/** Aus schlafPruefen, bevor das Bild stehen bleibt: nie ein entschlüsseltes Dokument auf dem Display lassen */
static void notfallVorSchlaf() {
    if (!nfImBetrachter()) return;
    nfZu("Schlaf");
    if (notfallDa()) notfallZeigen(true); else setzeModus(M_HOME);
}
