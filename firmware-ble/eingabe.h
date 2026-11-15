/**
 * Kleine Eingaben (SPEC „Kleine Eingaben“ und Art „Ziffern“, FW 0.35.0): Ja/Nein und Ziffernfeld, ohne Handy.
 * Beides sind Seiten der Widget-Maschine (die App zeichnet Bild, Tasten und Glyphen), die eine andere Seite kurz öffnet
 * und mit dem Ergebnis wieder verlässt:
 *   typ janein   knopf … ja · knopf … nein · taste up ja · taste down nein · text 0 = Detail (z. B. „14:02  12m“)
 *   typ ziffern  text 0 = Eingabezeile · knopf … ziffer <0–9> · knopf … sonder · knopf … zurueck (lang = alles weg)
 *                · knopf … ok · max <n> (Stellen) · sonder <Zeichen> (Sondertaste je Ziel: „,“ „+“ „#“ „−“ „:“)
 * Öffnen per Aktion „eingabe <code>“ auf der aufrufenden Seite: 1 = Timer-Minuten (widgets/zf-timer), 2 = Aufnahme
 * löschen (widgets/jn-rec). KI kurz = Home (verwirft die Eingabe), wie überall.
 */
static char eZurueck[16] = "";      // Seite, die die Eingabe geöffnet hat
static int eZiel = 0;               // 1 Timer-Minuten, 2 Aufnahme löschen
static char ePuffer[24] = "";
static char eDetail[24] = "";       // Ja/Nein: was gemeint ist
static bool recLoeschen(char* name, size_t n);              // recorder.h (gewählte Zeile)
static void recDetail(char* z, size_t n);                   // recorder.h

static void eingabeOeffnen(int ziel) {
    const char* seite = ziel == 1 ? "zf-timer" : ziel == 2 ? "jn-rec" : nullptr;
    char rel[48];
    snprintf(rel, sizeof rel, "widgets/%s/felder.txt", seite ? seite : "-");
    if (!seite || !sollDa(rel)) { tone(PIN_BUZZER, 900, 120); return; }   // Eingabe noch nicht aufgespielt
    if (ziel == 2) { recDetail(eDetail, sizeof eDetail); if (!eDetail[0]) { tone(PIN_BUZZER, 900, 120); return; } }
    strlcpy(eZurueck, widgetName, sizeof eZurueck);
    eZiel = ziel;
    ePuffer[0] = 0;
    strlcpy(widgetName, seite, sizeof widgetName);
    neuZeichnen = true;
    protokoll("Eingabe %s", seite);
}

static void eingabeZurueck() {
    strlcpy(widgetName, eZurueck[0] ? eZurueck : "menue", sizeof widgetName);
    eZiel = 0;
    neuZeichnen = true;
}

/** Ergebnis ans Ziel; ok = Ja bzw. OK */
static void eingabeFertig(bool ok) {
    if (eZiel == 1 && ok && ePuffer[0]) {          // Timer: „m“ oder „m:ss“
        int m = 0, s = 0;
        const char* d = strchr(ePuffer, ':');
        m = atoi(ePuffer);
        if (d) s = atoi(d + 1);
        int32_t ges = m * 60 + s;
        if (ges <= 0 || ges > 99 * 60 + 59 || s > 59) { tone(PIN_BUZZER, 900, 200); ePuffer[0] = 0; wTextNeu = true; return; }   // ungültig: bleibt offen
        wDauerS = ges; tLaeuft = false; tStandMs = ges * 1000; tAblauf = false;
        strlcpy(tWidget, eZurueck[0] ? eZurueck : "timer", sizeof tWidget);
        protokoll("Timer eigene Zeit %d:%02d", m, s);
    }
    if (eZiel == 2 && ok) {
        char name[28];
        if (recLoeschen(name, sizeof name)) { protokoll("Recorder: %s gelöscht", name); tone(PIN_BUZZER, 2000, 120); }
        else tone(PIN_BUZZER, 900, 200);
    }
    eingabeZurueck();
}

/** Textfeld der Eingabe füllen (aus wAnzeigeZeichnen) */
static void eingabeZeichnen() {
    if (!wFeld(0)) return;
    if (wJaNein) wTextZeichnen(eDetail, nullptr);
    if (wZiffern) {
        char z[24];
        strlcpy(z, ePuffer, sizeof z);
        if (EN) for (char* p = z; *p; p++) if (*p == ',') *p = '.';   // Englisch: Punkt statt Komma (wie der Rechner)
        wTextZeichnen(z, nullptr);
    }
}

/** Aktion auf einer Eingabe-Seite; true = erledigt */
static bool eingabeAktion(const char* a, int wert) {
    if (wJaNein) {
        if (!strcmp(a, "ja")) { eingabeFertig(true); return true; }
        if (!strcmp(a, "nein")) { eingabeFertig(false); return true; }
        return false;
    }
    if (!wZiffern) return false;
    size_t n = strlen(ePuffer);
    if (!strcmp(a, "ziffer") && wert >= 0 && wert <= 9) {
        int stellen = 0;
        for (const char* p = ePuffer; *p; p++) stellen += isdigit((unsigned char)*p) ? 1 : 0;
        if (stellen < wEMax && n + 1 < sizeof ePuffer) { ePuffer[n] = '0' + wert; ePuffer[n + 1] = 0; }
        else tone(PIN_BUZZER, 900, 60);
    } else if (!strcmp(a, "sonder") && wESonder[0]) {
        char c = wESonder[0];
        if (c == '-') {                                   // Vorzeichen umschalten
            if (ePuffer[0] == '-') memmove(ePuffer, ePuffer + 1, n); else if (n + 1 < sizeof ePuffer) { memmove(ePuffer + 1, ePuffer, n + 1); ePuffer[0] = '-'; }
        } else if (c == '+') {                            // nur am Anfang (Telefon)
            if (n == 0) strlcpy(ePuffer, "+", sizeof ePuffer); else tone(PIN_BUZZER, 900, 60);
        } else if ((c == ',' || c == ':') && strchr(ePuffer, c)) tone(PIN_BUZZER, 900, 60);   // nur einmal
        else if (n + 1 < sizeof ePuffer) { ePuffer[n] = c; ePuffer[n + 1] = 0; }
    } else if (!strcmp(a, "zurueck")) {
        if (n) ePuffer[n - 1] = 0;
    } else if (!strcmp(a, "ok")) {
        eingabeFertig(true);
        return true;
    } else return false;
    wTextNeu = true;
    return true;
}

/** Aus widgetLoop: ← lange gehalten = alles weg */
static void eingabeLoop() {
    if (!wLangZurueck) return;
    wLangZurueck = false;
    if (modus == M_WIDGET && wZiffern && ePuffer[0]) { ePuffer[0] = 0; tone(PIN_BUZZER, 2000, 60); wTextNeu = true; }
}
