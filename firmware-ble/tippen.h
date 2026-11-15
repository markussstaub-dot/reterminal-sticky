/**
 * Tippen (SPEC „Eingabe: Tasten, Ziffern, Strich, Sprache“, FW 0.37.0): Karussell-Seite „widget tippen“ in der Gruppe
 * Notieren. Oben die Textzeile, darunter die Reiter Tasten · Ziffern · Strich · Sprache. Die App zeichnet alles
 * (Tastatur, Ziffernfeld, Reiter, Glyphen der Textzeile); der Sticky nimmt Anschläge an und führt den Text.
 *   typ tippen · text <x> <y> <n> (Textzeile, linksbündig, letzte Zelle = Schreibmarke) · glyphen … · tasten …
 *   Aktionen: zeichen <i> (i-te Taste aus „tasten“, „_“ = Leerzeichen) · leer · shift · weg (lang = alles weg) · ok
 *             · art <0–3> (0 Tasten, 1 Ziffern, 2 Strich = Strichschrift-Seite, 3 Sprache)
 * Die Arten Ziffern und Sprache sind eigene Bilder unter widgets/tippen-zf und widgets/tippen-sp; widgetName bleibt
 * „tippen“ (Karussell, Reiter der Gruppe), wPfad nimmt den Ordner der gewählten Art.
 * Wie im Lab (Station 10): Touch in eigener Aufgabe (kein Anschlag geht verloren, Klick sofort), Tasten werden nie neu
 * gezeichnet; nur die Textzeile wird gesammelt aufgefrischt (0,3 s Pause, spätestens 1,5 s). Shift zeigt die
 * Schreibmarke als Block statt Strich (die Tasten bleiben, wie sie sind).
 * KI halten = Diktat wie überall; mit Handy schickt die App den erkannten Text zurück (0x31 (TIPPEN)) an die Schreibmarke.
 * OK = der Text wird eine Notiz (Art „getippt“) im Puffer; ist die App da, holt sie ihn gleich ab.
 */
static char tipText[240] = "";
static bool tipShift = false, tipDreckig = false;
static uint32_t tipLetzter = 0, tipDreckigSeit = 0;
static TaskHandle_t tipAufgabe = nullptr;
static volatile uint8_t tipQ[16];
static volatile int tipQKopf = 0, tipQEnde = 0;
static volatile bool tipLangWeg = false;
static portMUX_TYPE tipSperre = portMUX_INITIALIZER_UNLOCKED;
static char tipNeu[256];                 // Text aus der App (Diktat), übernommen in tippenLoop
static volatile bool tipNeuDa = false;
// tipAn (Touch-Aufgabe läuft) steht in firmware-ble.ino, tipArt und wTippen in widget.h

/** true, wenn ein Diktat jetzt an die Schreibmarke soll (audio.h meldet das der App) */
static bool tippenZiel() { return modus == M_WIDGET && wTippen && !hilfeAn; }

static void tipGeaendert() {
    tipLetzter = millis();
    if (!tipDreckig) tipDreckigSeit = tipLetzter;
    tipDreckig = true;
}

/** UTF-8 anhängen, wenn Platz ist */
static void tipAnhaengen(const char* s) {
    size_t l = strlen(tipText), n = strlen(s);
    if (l + n >= sizeof tipText) { tone(PIN_BUZZER, 900, 60); return; }
    memcpy(tipText + l, s, n + 1);
}

/** Großbuchstabe (ASCII und ä ö ü; ß bleibt) */
static void tipGross(char* z) {
    if (z[0] >= 'a' && z[0] <= 'z') z[0] -= 32;
    else if ((uint8_t)z[0] == 0xC3 && ((uint8_t)z[1] == 0xA4 || (uint8_t)z[1] == 0xB6 || (uint8_t)z[1] == 0xBC)) z[1] -= 0x20;
}

static void tipWeg() {
    size_t l = strlen(tipText);
    while (l > 0 && (tipText[l - 1] & 0xC0) == 0x80) l--;   // UTF-8-Folgebytes
    if (l > 0) l--;
    tipText[l] = 0;
}

/** Textzeile ins Bild: linksbündig, die letzten Zeichen, danach die Schreibmarke (Strich, bei Shift Block) */
static void tipZeichnen() {
    if (!wFeld(0)) return;
    int idx[240], n = 0;
    for (const char* p = tipText; *p && n < 240;) {
        int len = (*p & 0x80) == 0 ? 1 : (*p & 0xE0) == 0xC0 ? 2 : (*p & 0xF0) == 0xE0 ? 3 : 4;
        int g = -1;
        for (int i = 0; i < wGlyphAnzahl; i++) if ((int)strlen(wGlyph[i]) == len && !strncmp(wGlyph[i], p, len)) { g = i; break; }
        idx[n++] = g;
        p += len;
    }
    for (int k = 0; k < wTn; k++) wZelle(wTx + k * wzDx, wTy + k * wzDy, -1);
    int platz = wTn - 1, ab = max(0, n - platz);
    for (int k = ab; k < n; k++) wZelle(wTx + (k - ab) * wzDx, wTy + (k - ab) * wzDy, idx[k]);
    int mx = wTx + (n - ab) * wzDx, my = wTy + (n - ab) * wzDy;
    int bw = tipShift ? wzW - 4 : 4;                          // Block bei Shift, sonst Strich
    for (int r = 4; r < wzH - 4; r++) {
        int y = my + r;
        if (y < 0 || y >= H) continue;
        for (int x = mx + 2; x < mx + 2 + bw && x < W; x++) imgBuf[y * (W / 8) + x / 8] |= 0x80 >> (x & 7);
    }
}

/** OK: Text als Notiz „getippt“ in den Puffer */
static void tipSpeichern() {
    if (!tipText[0]) { tone(PIN_BUZZER, 900, 120); return; }
    static char j[640];
    int l = snprintf(j, sizeof j, "{\"t\":%llu,\"typ\":\"notiz\",\"quelle\":\"sticky\",\"art\":\"getippt\",\"text\":\"", (unsigned long long)jetztMs());
    for (const char* p = tipText; *p && l < (int)sizeof j - 40; p++) {
        if (*p == '"' || *p == '\\') j[l++] = '\\';
        if ((uint8_t)*p >= 0x20) j[l++] = *p;
    }
    snprintf(j + l, sizeof j - l, "\",\"offline\":true}");
    notizAnhaengen(j);
    protokoll("Getippt: %d Zeichen", (int)strlen(tipText));
    tipText[0] = 0; tipShift = false;
    tone(PIN_BUZZER, 2000, 120);
    if (appDa()) sendEvt("{\"t\":\"puffer\",\"a\":\"neu\"}");   // die App holt gleich ab
    tipGeaendert();
}

/** Aktion auf der Tippen-Seite; true = erledigt */
static bool tippenAktion(const char* a, int wert) {
    if (!wTippen) return false;
    if (!strcmp(a, "zeichen") && wert >= 0 && wert < wTastenAnzahl) {
        char z[6];
        strlcpy(z, !strcmp(wTasten[wert], "_") ? " " : wTasten[wert], sizeof z);
        if (tipShift) { tipGross(z); tipShift = false; }
        tipAnhaengen(z);
    } else if (!strcmp(a, "leer")) tipAnhaengen(" ");
    else if (!strcmp(a, "shift")) tipShift = !tipShift;
    else if (!strcmp(a, "weg")) tipWeg();
    else if (!strcmp(a, "ok")) { tipSpeichern(); return true; }
    else if (!strcmp(a, "art")) {
        if (wert == 2) {                                       // Strich: vorhandene Strichschrift-Seite
            if (sollDa("schrift/alphabet.txt")) modusWunsch = M_SCHRIFT; else tone(PIN_BUZZER, 900, 120);
            return true;
        }
        int art = wert == 1 || wert == 3 ? wert : 0;
        if (art != tipArt) { tipArt = art; neuZeichnen = true; }
        return true;
    } else return false;
    tipGeaendert();
    return true;
}

/** Touch-Aufgabe (wie kzAufgabeFn): Treffer sofort klicken und in die Schlange; abgearbeitet in tippenLoop */
static void tipAufgabeFn(void*) {
    bool unten = false;
    int knopf = -1;
    uint32_t seit = 0;
    while (tipAn) {
        uint8_t st;
        if (tpRead(0x814E, &st, 1) && (st & 0x80)) {
            if ((st & 0x0F) > 0) {
                uint8_t p[7];
                tpRead(0x814F, p, 7);
                int dx, dy;
                touchDisplay(p[1] | p[2] << 8, p[3] | p[4] << 8, dx, dy);
                if (!unten) {
                    unten = true;
                    aktiv();
                    letzteBedienung = millis();
                    knopf = -1;
                    for (int i = 0; i < wKnopfAnzahl; i++) {
                        const WKnopf& k = wKnoepfe[i];
                        if (dx >= k.x0 && dx < k.x1 && dy >= k.y0 && dy < k.y1) { knopf = i; break; }
                    }
                    if (knopf >= 0) {
                        tone(PIN_BUZZER, 2700, 15);
                        seit = millis();
                        portENTER_CRITICAL(&tipSperre);
                        int n = (tipQEnde + 1) % 16;
                        if (n != tipQKopf) { tipQ[tipQEnde] = knopf; tipQEnde = n; }
                        portEXIT_CRITICAL(&tipSperre);
                    }
                }
            } else if (unten) {
                unten = false;
                if (knopf >= 0 && !strcmp(wKnoepfe[knopf].aktion, "weg") && millis() - seit >= 700) tipLangWeg = true;
            }
            tpWrite(0x814E, 0);
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    tipAufgabe = nullptr;
    vTaskDelete(nullptr);
}

/** Aus widgetLoop (vor dem Auffrischen) */
static void tippenLoop() {
    bool soll = modus == M_WIDGET && wTippen && !hilfeAn;
    if (soll && !tipAn) {
        tipAn = true;
        xTaskCreatePinnedToCore(tipAufgabeFn, "tippen", 4096, nullptr, 4, &tipAufgabe, 0);
    } else if (!soll && tipAn) {
        tipAn = false;
        for (int i = 0; i < 30 && tipAufgabe; i++) delay(5);
        tipQKopf = tipQEnde = 0;
    }
    if (tipNeuDa) {                                           // Diktat aus der App an die Schreibmarke
        size_t l = strlen(tipText);
        if (l && tipText[l - 1] != ' ') tipAnhaengen(" ");
        tipAnhaengen(tipNeu);
        tipNeuDa = false;
        tone(PIN_BUZZER, 2700, 30);
        tipGeaendert();
    }
    if (!soll) return;
    while (tipQKopf != tipQEnde) {
        int i = tipQ[tipQKopf];
        tipQKopf = (tipQKopf + 1) % 16;
        if (i < wKnopfAnzahl) widgetAktion(wKnoepfe[i].aktion, wKnoepfe[i].wert);
        if (modus != M_WIDGET || !wTippen || neuZeichnen) { tipQKopf = tipQEnde = 0; return; }   // Seite gewechselt
    }
    if (tipLangWeg) { tipLangWeg = false; if (tipText[0]) { tipText[0] = 0; tone(PIN_BUZZER, 2000, 60); tipGeaendert(); } }
    if (tipDreckig && (millis() - tipLetzter > 300 || millis() - tipDreckigSeit > 1500)) { tipDreckig = false; wTextNeu = true; }
}
