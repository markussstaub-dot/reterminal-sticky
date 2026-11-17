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
 */
static bool notSpar = false, notSparGeladen = false, notLeerGezeigt = false, notLeise = false;
static bool sosAn = false;
static int sosSchritt = 0;
static uint32_t sosNaechster = 0;
static bool sosTon = false;

static bool notfallSpar();
static bool notfallLeise() { return notLeise; }
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
static void notfallLoop() {
    notSparLaden();
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
static void serielleDatei() {
    static char zeile[96];
    static int n = 0;
    while (Serial0.available()) {
        int c = Serial0.read();
        if (c < 0) return;
        if (c == '\r') continue;
        if (c != '\n') { if (n < (int)sizeof zeile - 1) zeile[n++] = (char)c; continue; }
        zeile[n] = 0;
        n = 0;
        char rel[64];
        long len = 0;
        if (sscanf(zeile, "DATEI %63s %ld", rel, &len) != 2) continue;
        if (len <= 0 || len > 1048576 || strstr(rel, "..") || rel[0] == '/') { Serial0.println("DATEI FEHLER pfad oder laenge"); continue; }
        uint8_t* buf = (uint8_t*)ps_malloc(len);
        if (!buf) { Serial0.println("DATEI FEHLER speicher"); continue; }
        Serial0.setTimeout(10000);
        size_t got = Serial0.readBytes(buf, len);
        bool ok = got == (size_t)len && sollSchreiben(rel, buf, len);
        free(buf);
        aktiv();
        if (!ok) { Serial0.printf("DATEI FEHLER %u von %ld Byte\n", (unsigned)got, len); continue; }
        protokoll("USB: %s (%ld Byte)", rel, len);
        Serial0.printf("DATEI OK %s\n", rel);
        if (!strncmp(rel, "widgets/", 8)) {
            karussellLaden();
            if (modus == M_WIDGET) neuZeichnen = true;
        }
    }
}
