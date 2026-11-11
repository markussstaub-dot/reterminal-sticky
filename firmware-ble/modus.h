/**
 * Modi (Markus, 11.11.2026): Home = Visitenkarte hochkant mit Uhrzeit · Notiz = Fahrt-Seite · Bordbuch.
 *
 * Tasten:  KI kurz = Home ↔ Notiz (aus dem Bordbuch: Home) · KI halten (≥ 0,5 s) = Diktat, in jedem Modus
 *          ▲ kurz = Bordbuch (im Bordbuch: zurückblättern) · ▲ 1 s im Bordbuch = Inhaltsverzeichnis · ▼ = weiterblättern
 * Rückweg: KI kurz oder 5 min ohne Bedienung → Home.
 *
 * Bestellzettel (11.11.2026): ▼ auf Home → erster Zettel, ▼/▲ blättern (rundum), KI kurz → Home. Quer, große Schrift,
 * zum Vorzeigen an der Theke; ohne Handy lesbar.
 *
 * Bilder von der App (BILD_ENDE Modus 5 + Nummer), im Flash unter /home/:
 *   0.bin Home-Karte (Uhrfeld leer) · 1.bin Notiz-Seite · 2.bin Ziffernblatt (Ziffern 0–9 und „:“, schon gedreht)
 *   3.bin–5.bin Bestellzettel; ihre Anzahl steht in version.txt hinter „;“
 *   version.txt  Kennung, die die App vergleicht (OP_HOME_VERSION)
 * Uhr: hochkant ab x = 40, y = 352, 5 Felder à 80 × 112 („HH:MM“); auf dem Display x = 352, w = 112, y = 40, h = 400.
 * Jede Minute nur dieses Feld per Teil-Refresh, zur vollen Stunde einmal voll (gegen Geisterbilder).
 */

static const int UHR_X = 352, UHR_Y = 40, UHR_W = 112, UHR_H = 400;   // Display-Koordinaten
static const int ZIFFER_ZEILEN = 80;                                    // Zeilen je Ziffer auf dem Display
static bool homeDa = false, notizDa = false, ziffernDa = false;
static char homeVersion[24] = "";
static uint8_t* ziffernBuf;
static int uhrMinute = -1;
static uint32_t letzteBedienung = 0;
static const uint32_t ZURUECK_MS = 5UL * 60 * 1000;
static volatile int modusWunsch = -1;     // von der App (OP_BB_MODUS) oder Tasten, umgesetzt in loop()
static int bestellAnzahl = 0, bestellAktuell = 0;

static void bestellZaehlen() {
    const char* semi = strchr(homeVersion, ';');
    int n = semi ? atoi(semi + 1) : 0;
    bestellAnzahl = 0;
    for (int i = 0; i < n && i < 3; i++) {
        char pfad[20];
        snprintf(pfad, sizeof pfad, "/home/%d.bin", 3 + i);
        if (LittleFS.exists(pfad)) bestellAnzahl++;
    }
    if (bestellAktuell >= bestellAnzahl) bestellAktuell = 0;
}

static const char* modusName() {
    return modus == M_HOME ? "home" : modus == M_NOTIZ ? "notiz" : modus == M_BESTELL ? "bestell" : "bordbuch";
}

static bool homeLaden(int n, uint8_t* ziel) {
    char pfad[20];
    snprintf(pfad, sizeof pfad, "/home/%d.bin", n);
    File f = LittleFS.open(pfad, "r");
    if (!f) return false;
    bool ok = f.read(ziel, IMG_BYTES) == IMG_BYTES;
    f.close();
    return ok;
}

static bool homeSpeichern(int n, const uint8_t* daten) {
    char pfad[20];
    snprintf(pfad, sizeof pfad, "/home/%d.bin", n);
    File f = LittleFS.open(pfad, "w");
    if (!f) return false;
    bool ok = f.write(daten, IMG_BYTES) == IMG_BYTES;
    f.close();
    if (n == 2) ziffernDa = homeLaden(2, ziffernBuf);
    if (n == 0) homeDa = true;
    if (n == 1) notizDa = true;
    return ok;
}

static void homeInit() {
    ziffernBuf = (uint8_t*)ps_malloc(IMG_BYTES);
    LittleFS.mkdir("/home");
    homeDa = LittleFS.exists("/home/0.bin");
    notizDa = LittleFS.exists("/home/1.bin");
    ziffernDa = homeLaden(2, ziffernBuf);
    File f = LittleFS.open("/home/version.txt", "r");
    if (f) { size_t n = f.readBytes(homeVersion, sizeof homeVersion - 1); homeVersion[n] = 0; f.close(); }
    // Ortszeit Deutschland (die Uhr läuft in UTC)
    setenv("TZ", "CET-1CEST,M3.5.0,M10.5.0/3", 1);
    tzset();
    bestellZaehlen();
    Serial.printf("Home: Karte %d, Notiz %d, Ziffern %d, Bestellzettel %d, Version %s\n", homeDa, notizDa, ziffernDa, bestellAnzahl, homeVersion);
}

/** Uhrzeit aus dem Ziffernblatt ins Uhrfeld von imgBuf setzen; true, wenn sich etwas geändert hat */
static bool uhrZeichnen() {
    if (!ziffernDa || !zeitGesetzt) return false;
    time_t s = time(nullptr);
    tm t;
    localtime_r(&s, &t);
    if (t.tm_min == uhrMinute) return false;
    uhrMinute = t.tm_min;
    const int zeichen[5] = {t.tm_hour / 10, t.tm_hour % 10, 10, t.tm_min / 10, t.tm_min % 10};
    for (int k = 0; k < 5; k++) {
        // Ziffer z liegt im Ziffernblatt in Spalte z / 6 (x = 0 bzw. 112), Zeilen (z % 6) * 80
        int z = zeichen[k];
        int quelleX = (z / 6) * UHR_W, quelleY = (z % 6) * ZIFFER_ZEILEN;
        // Feld k (hochkant von links) liegt auf dem Display von unten nach oben
        int zielY = UHR_Y + UHR_H - (k + 1) * ZIFFER_ZEILEN;
        for (int r = 0; r < ZIFFER_ZEILEN; r++)
            memcpy(imgBuf + (zielY + r) * (W / 8) + UHR_X / 8, ziffernBuf + (quelleY + r) * (W / 8) + quelleX / 8, UHR_W / 8);
    }
    return true;
}

static void uhrAuffrischen(bool voll) {
    display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    if (voll) display.update();
    else display.updatePartial(UHR_X, UHR_Y, UHR_W, UHR_H);
}

static void meldeModus() {
    char j[48];
    snprintf(j, sizeof j, "{\"t\":\"modus\",\"m\":\"%s\",\"zettel\":%d}", modusName(), bestellAktuell);
    sendEvt(j);
    wantState = true;
}

static void setzeModus(Modus m) {
    if ((m == M_BORDBUCH && bbSeiten == 0) || (m == M_BESTELL && bestellAnzahl == 0)) {
        tone(PIN_BUZZER, 900, 120);   // tiefer Ton: kein Bordbuch aufgespielt
        return;
    }
    modus = m;
    bordbuch = m == M_BORDBUCH;
    letzteBedienung = millis();
    tone(PIN_BUZZER, 3300, 25);   // heller Doppelklick: Wechsel angenommen, das Bild kommt gleich
    delay(60);
    tone(PIN_BUZZER, 3300, 25);
    if (m == M_BORDBUCH) {
        // Ins Bordbuch kommt man immer auf das Inhaltsverzeichnis – außer die App springt gezielt auf eine Seite
        if (bbWunsch >= 0) { bbAktuell = bbWunsch; bbWunsch = -1; }
        else bbAktuell = bbToc;
    }
    if (m == M_BESTELL && homeLaden(3 + bestellAktuell, imgBuf)) {
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.update();
        seite = "bild";
    } else if (m == M_BORDBUCH) {
        bbZeige(bbAktuell);
    } else if (m == M_NOTIZ && notizDa && homeLaden(1, imgBuf)) {
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.update();
        seite = "bild";
    } else if (m == M_HOME && homeDa && homeLaden(0, imgBuf)) {
        uhrMinute = -1;
        uhrZeichnen();
        uhrAuffrischen(true);
        seite = "home";
    } else if (m != M_NOTIZ || !notizDa) {
        zeigeKarte();   // Rückfall: eingebaute Visitenkarte (quer, ohne Uhr), solange die App noch nichts geschickt hat
    }
    meldeModus();
}

// ---- Tasten ----------------------------------------------------------------------------------
static uint32_t kiSeit = 0, upSeit = 0;
static bool kiDiktat = false, upLang = false;

static void tasteAktion(const char* name, bool gedrueckt) {
    letzteBedienung = millis();
    if (strcmp(name, "ki") == 0) {
        if (gedrueckt) { kiSeit = millis(); kiDiktat = false; return; }
        kiSeit = 0;
        if (kiDiktat) { aufnahmeStopp(); return; }
        modusWunsch = modus == M_HOME ? M_NOTIZ : M_HOME;   // kurz: Home ↔ Notiz, aus dem Bordbuch nach Home
        return;
    }
    if (strcmp(name, "up") == 0) {
        if (gedrueckt) { upSeit = millis(); upLang = false; return; }
        upSeit = 0;
        if (upLang) return;
        if (modus == M_BORDBUCH) bbWunsch = bbAktuell - 1;
        else if (modus == M_BESTELL) { bestellAktuell = (bestellAktuell + bestellAnzahl - 1) % bestellAnzahl; modusWunsch = M_BESTELL; }
        else modusWunsch = M_BORDBUCH;
        return;
    }
    if (strcmp(name, "down") == 0 && gedrueckt) {
        if (modus == M_BORDBUCH) bbWunsch = bbAktuell + 1;
        else if (modus == M_BESTELL) { bestellAktuell = (bestellAktuell + 1) % bestellAnzahl; modusWunsch = M_BESTELL; }
        else if (modus == M_HOME) { bestellAktuell = 0; modusWunsch = M_BESTELL; }   // ▼ auf Home = Bestellzettel
    }
}

/** Aus loop(): Halten erkennen, Moduswünsche umsetzen, Uhr, Rückfall nach Home */
static void modusLoop() {
    if (kiSeit && !kiDiktat && millis() - kiSeit > 500) {
        kiDiktat = true;                 // KI gehalten → Diktat (mit oder ohne Handy)
        aufnahmeStart();
    }
    if (upSeit && !upLang && millis() - upSeit > 1000) {
        upLang = true;
        tone(PIN_BUZZER, 2000, 60);
        if (modus == M_BORDBUCH) bbWunsch = bbToc;   // ▲ 1 s im Bordbuch = Inhaltsverzeichnis
    }
    if (bestellWunsch >= 0) {
        if (bestellWunsch < bestellAnzahl) bestellAktuell = bestellWunsch;
        bestellWunsch = -1;
    }
    if (modusWunsch >= 0) {
        Modus m = (Modus)modusWunsch;
        modusWunsch = -1;
        if (m != modus || m == M_NOTIZ || m == M_BESTELL) setzeModus(m);
    }
    if (modus != M_HOME && !audioLaeuft && millis() - letzteBedienung > ZURUECK_MS) setzeModus(M_HOME);
    if (modus == M_HOME && homeDa && !audioLaeuft && uhrZeichnen()) uhrAuffrischen(uhrMinute == 0);
}
