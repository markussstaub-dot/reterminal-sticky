/**
 * Modi (Markus, 11.11.2026): Home = Visitenkarte hochkant mit Uhrzeit · Notiz = Fahrt-Seite · Bordbuch.
 *
 * Tasten (SPEC „Bedienung und Oberfläche“, FW 0.13.0), überall gleich:
 *   KI kurz = Home · KI halten (≥ 0,5 s) = Diktat
 *   ▲/▼ kurz = eine Seite zurück/vor; am Ende von Bordbuch oder Zetteln weiter zum nächsten Eintrag im Karussell (rundum)
 *   ▼ 1 s = nächster Eintrag · ▲ 1 s = Anfang des Eintrags (Inhaltsverzeichnis, erster Zettel), dort: voriger Eintrag
 *   Tippen = Hauptaktion der Seite (Inhaltsverzeichnis: Kapitel, Notiz: Streifen)
 * Karussell: Reihe aus /soll/einstellungen/karussell.txt (je Zeile home|notiz|bordbuch|zettel), sonst
 *   home, notiz, bordbuch, zettel. Leere Einträge (kein Bordbuch, keine Zettel) werden übersprungen.
 * Rückweg: KI kurz oder 5 min ohne Bedienung → Home.
 *
 * Bestellzettel (11.11.2026): ▼ auf Home → erster Zettel, ▼/▲ blättern (rundum), KI kurz → Home. Quer, große Schrift,
 * zum Vorzeigen an der Theke; ohne Handy lesbar.
 *
 * Bilder von der App (SCHREIBEN /soll/home/… oder BILD_ENDE Modus 5 + Nummer), auf der Karte unter /soll/home/,
 * ohne Karte im Flash unter /home/ (0–2 und version.txt liegen immer auch dort):
 *   0.bin Home-Karte (Uhrfeld leer) · 1.bin Notiz-Seite · 2.bin Ziffernblatt (Ziffern 0–9 und „:“, schon gedreht)
 *   3.bin–8.bin Bestellzettel und Karten (Lidl Plus u. Ä.); ihre Anzahl steht in version.txt hinter „;“
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
static bool hilfeAn = false;          // Tastenhilfe gerade sichtbar (▲+▼)

static void bestellZaehlen() {
    const char* semi = strchr(homeVersion, ';');
    int n = semi ? atoi(semi + 1) : 0;
    bestellAnzahl = 0;
    for (int i = 0; i < n && i < 6; i++) {
        char pfad[20];
        snprintf(pfad, sizeof pfad, "home/%d.bin", 3 + i);
        if (sollDa(pfad)) bestellAnzahl++;
    }
    if (bestellAktuell >= bestellAnzahl) bestellAktuell = 0;
}

static const char* modusName() {
    return modus == M_HOME ? "home" : modus == M_NOTIZ ? "notiz" : modus == M_BESTELL ? "bestell" : "bordbuch";
}

static bool homeLaden(int n, uint8_t* ziel) {
    char pfad[20];
    snprintf(pfad, sizeof pfad, "home/%d.bin", n);
    return sollLesen(pfad, ziel, IMG_BYTES);
}

static bool homeSpeichern(int n, const uint8_t* daten) {
    char pfad[20];
    snprintf(pfad, sizeof pfad, "home/%d.bin", n);
    bool ok = sollSchreiben(pfad, daten, IMG_BYTES);
    if (n == 2) ziffernDa = homeLaden(2, ziffernBuf);
    if (n == 0) homeDa = true;
    if (n == 1) notizDa = true;
    return ok;
}

/** Home-Bilder und Version (neu) einlesen: beim Start und wenn die App etwas unter /soll/home geschrieben hat */
static void homeLesen() {
    homeDa = sollDa("home/0.bin");
    notizDa = sollDa("home/1.bin");
    ziffernDa = homeLaden(2, ziffernBuf);
    homeVersion[0] = 0;
    File f = sollOeffnen("home/version.txt");
    if (f) { size_t n = f.readBytes(homeVersion, sizeof homeVersion - 1); homeVersion[n] = 0; f.close(); }
    bestellZaehlen();
    statusLaden();
}

static void karussellLaden();
static void homeInit() {
    ziffernBuf = (uint8_t*)ps_malloc(IMG_BYTES);
    LittleFS.mkdir("/home");
    LittleFS.mkdir("/einstellungen");
    homeLesen();
    karussellLaden();
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

// ---- Akkusymbol auf Home (Markus, 12.11.2026) -------------------------------------------------
// Hochkant oben rechts: Batterie mit 4 Balken (je 25 %), Blitz bei USB. Der Sticky zeichnet es selbst in imgBuf
// (damit es auch Voll-Refreshes übersteht) und frischt nur dieses Feld auf, wenn sich Stufe oder USB ändern.
// Feld hochkant x 400–468, y 8–40 → Display x 8, w 32 (Vielfache von 8), y 12, h 68.
static const int AKKU_X = 8, AKKU_Y = 12, AKKU_W = 32, AKKU_H = 68;
static int akkuStufe = -1;
static bool akkuUsb = false;

/** Rechteck in imgBuf (Display-Koordinaten), Bit 1 = schwarz */
static void bildRechteck(int x, int y, int w, int h, bool schwarz) {
    for (int r = y; r < y + h; r++) {
        if (r < 0 || r >= H) continue;
        for (int c = x; c < x + w; c++) {
            if (c < 0 || c >= W) continue;
            uint8_t& b = imgBuf[r * (W / 8) + c / 8];
            uint8_t m = 0x80 >> (c & 7);
            if (schwarz) b |= m; else b &= ~m;
        }
    }
}
/** Rechteck in Hochkant-Koordinaten (wie die App die Karte zeichnet) */
static void hochRechteck(int px, int py, int w, int h, bool schwarz) { bildRechteck(py, H - (px + w), h, w, schwarz); }

static void akkuZeichnen(int stufe, bool usb) {
    hochRechteck(400, 8, 68, 32, false);              // Feld leeren
    hochRechteck(404, 12, 52, 24, true);              // Gehäuse
    hochRechteck(407, 15, 46, 18, false);
    hochRechteck(456, 18, 6, 12, true);               // Pluspol
    for (int i = 0; i < stufe && i < 4; i++) hochRechteck(409 + i * 11, 17, 9, 14, true);
    if (usb) {                                        // Blitz: weißer Rand, schwarzer Zickzack
        hochRechteck(423, 13, 14, 22, false);
        hochRechteck(429, 14, 5, 9, true);
        hochRechteck(426, 21, 8, 3, true);
        hochRechteck(426, 23, 5, 10, true);
    }
}

/** Liest den Akku und zeichnet neu, wenn sich etwas geändert hat; teil = gleich auffrischen */
static void akkuPruefen(bool teil) {
    readBattery();
    if (batPct < 0) return;                           // kein Akku-Chip
    int stufe = (batPct + 12) / 25;                   // 0–4
    bool usb = usbDa();
    if (stufe == akkuStufe && usb == akkuUsb) return;
    akkuStufe = stufe;
    akkuUsb = usb;
    akkuZeichnen(stufe, usb);
    if (teil) {
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.updatePartial(AKKU_X, AKKU_Y, AKKU_W, AKKU_H);
    }
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
    hilfeAn = false;
    if (m != modus) protokoll("Modus %s", m == M_HOME ? "home" : m == M_BORDBUCH ? "bordbuch" : m == M_NOTIZ ? "notiz" : "bestell");
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
        statusPruefen(false, true);
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.update();
        seite = "bild";
    } else if (m == M_BORDBUCH) {
        bbZeige(bbAktuell);
    } else if (m == M_NOTIZ && notizDa && homeLaden(1, imgBuf)) {
        statusPruefen(false, true);
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.update();
        seite = "bild";
    } else if (m == M_HOME && homeDa && homeLaden(0, imgBuf)) {
        uhrMinute = -1;
        uhrZeichnen();
        statusPruefen(false, true);   // Statuszeile ins Bild, kommt mit dem Voll-Refresh
        uhrAuffrischen(true);
        seite = "home";
    } else if (m != M_NOTIZ || !notizDa) {
        zeigeKarte();   // Rückfall: eingebaute Visitenkarte (quer, ohne Uhr), solange die App noch nichts geschickt hat
    }
    meldeModus();
}

// ---- Tasten ----------------------------------------------------------------------------------
static uint32_t kiSeit = 0, upSeit = 0, downSeit = 0;
static bool kiDiktat = false, upLang = false, downLang = false;

// ---- Karussell -------------------------------------------------------------------------------
static Modus karussell[8];
static int kAnzahl = 0;

static void karussellLaden() {
    kAnzahl = 0;
    String t;
    if (sollText("einstellungen/karussell.txt", t)) {
        int start = 0;
        while (start < (int)t.length() && kAnzahl < 8) {
            int ende = t.indexOf('\n', start);
            if (ende < 0) ende = t.length();
            String z = t.substring(start, ende);
            start = ende + 1;
            z.trim();
            z.toLowerCase();
            if (z == "home") karussell[kAnzahl++] = M_HOME;
            else if (z == "notiz") karussell[kAnzahl++] = M_NOTIZ;
            else if (z == "bordbuch") karussell[kAnzahl++] = M_BORDBUCH;
            else if (z == "zettel") karussell[kAnzahl++] = M_BESTELL;
        }
    }
    bool homeDrin = false;
    for (int i = 0; i < kAnzahl; i++) homeDrin |= karussell[i] == M_HOME;
    if (kAnzahl == 0) { const Modus std[] = {M_HOME, M_NOTIZ, M_BORDBUCH, M_BESTELL}; for (auto m : std) karussell[kAnzahl++] = m; }
    else if (!homeDrin && kAnzahl < 8) { memmove(karussell + 1, karussell, kAnzahl * sizeof(Modus)); karussell[0] = M_HOME; kAnzahl++; }
    Serial.printf("Karussell: %d Einträge\n", kAnzahl);
}

static bool karussellDa(Modus m) {
    if (m == M_BORDBUCH) return bbSeiten > 0;
    if (m == M_BESTELL) return bestellAnzahl > 0;
    if (m == M_NOTIZ) return notizDa;
    return true;
}

/** Zum nächsten (richtung +1) bzw. vorigen (−1) Eintrag; rückwärts landet man auf dessen letzter Seite */
static void karussellSchritt(int richtung) {
    int pos = 0;
    for (int i = 0; i < kAnzahl; i++) if (karussell[i] == modus) { pos = i; break; }
    for (int i = 1; i <= kAnzahl; i++) {
        Modus m = karussell[((pos + richtung * i) % kAnzahl + kAnzahl) % kAnzahl];
        if (!karussellDa(m) || m == modus) continue;
        if (m == M_BORDBUCH) bbWunsch = richtung > 0 ? bbToc : bbSeiten - 1;
        if (m == M_BESTELL) bestellAktuell = richtung > 0 ? 0 : bestellAnzahl - 1;
        modusWunsch = m;
        return;
    }
}

/** ▲/▼ kurz: innerhalb von Bordbuch und Zetteln blättern, an den Enden weiter im Karussell */
static void blaettern(int richtung) {
    if (modus == M_BORDBUCH) {
        int n = bbAktuell + richtung;
        if (n >= 0 && n < bbSeiten) { bbWunsch = n; return; }
    } else if (modus == M_BESTELL) {
        int n = bestellAktuell + richtung;
        if (n >= 0 && n < bestellAnzahl) { bestellAktuell = n; modusWunsch = M_BESTELL; return; }
    }
    karussellSchritt(richtung);
}

// ---- Rückmeldung beim Tippen (SPEC „Bedienung und Oberfläche“): Rahmen ums getroffene Feld, nach 1,5 s weg --------
static int rhX0 = 0, rhY0 = 0, rhX1 = 0, rhY1 = 0, rhModus = -1, rhSeite = -1;
static uint32_t rahmenBis = 0;
static uint8_t* rahmenSicher = nullptr;
static volatile bool rahmenNeu = false;

/** Aus sendTouch (down): welches Feld wurde getroffen? Streifen der Notiz-Seite oder Kapitel im Inhaltsverzeichnis */
static void rahmenAntippen(int x, int y) {
    if (hilfeAn || rahmenBis) return;
    auto treffer = [&](int x0, int y0, int x1, int y1) {
        if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
        rhX0 = max(0, x0 & ~7); rhX1 = min(W, (x1 + 7) & ~7); rhY0 = max(0, y0); rhY1 = min(H, y1);
        return true;
    };
    bool getroffen = false;
    if (modus == M_NOTIZ) for (int i = 0; i < streifenAnzahl && !getroffen; i++) getroffen = treffer(streifen[i].x0, streifen[i].y0, streifen[i].x1, streifen[i].y1);
    else if (bordbuch && bbAktuell == bbToc) for (int i = 0; i < bbAnzahl && !getroffen; i++) getroffen = treffer(bbEintraege[i].x0, bbEintraege[i].y0, bbEintraege[i].x1, bbEintraege[i].y1);
    if (getroffen) rahmenNeu = true;
}

static void rahmenLoop() {
    if (rahmenNeu) {
        rahmenNeu = false;
        int bpz = (rhX1 - rhX0) / 8, h = rhY1 - rhY0;
        if (bpz <= 0 || h <= 0) return;
        if (!rahmenSicher) rahmenSicher = (uint8_t*)ps_malloc(IMG_BYTES);
        if (!rahmenSicher) return;
        for (int r = 0; r < h; r++) memcpy(rahmenSicher + r * bpz, imgBuf + (rhY0 + r) * (W / 8) + rhX0 / 8, bpz);
        const int d = 6;   // dicker schwarzer Rand innen am Feld
        bildRechteck(rhX0, rhY0, rhX1 - rhX0, d, true);
        bildRechteck(rhX0, rhY1 - d, rhX1 - rhX0, d, true);
        bildRechteck(rhX0, rhY0, d, h, true);
        bildRechteck(rhX1 - d, rhY0, d, h, true);
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.updatePartial(rhX0, rhY0, rhX1 - rhX0, h);
        rhModus = modus; rhSeite = bbAktuell;
        rahmenBis = millis() + 1500;
    }
    if (rahmenBis && millis() > rahmenBis) {
        rahmenBis = 0;
        if (modus != rhModus || bbAktuell != rhSeite || hilfeAn) return;   // Seite schon gewechselt: nichts zurückzumalen
        int bpz = (rhX1 - rhX0) / 8, h = rhY1 - rhY0;
        for (int r = 0; r < h; r++) memcpy(imgBuf + (rhY0 + r) * (W / 8) + rhX0 / 8, rahmenSicher + r * bpz, bpz);
        display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
        display.updatePartial(rhX0, rhY0, rhX1 - rhX0, h);
    }
}

// ---- Tastenhilfe (SPEC „Bedienung und Oberfläche“): ▲ und ▼ zusammen zeigen /soll/hilfe/<modus>.bin -----------
static bool upUnten = false, downUnten = false, kombi = false;
static volatile bool hilfeWunsch = false, neuZeichnen = false;

static const char* hilfeName() {
    return modus == M_HOME ? "hilfe/home.bin" : modus == M_NOTIZ ? "hilfe/notiz.bin" : modus == M_BORDBUCH ? "hilfe/bordbuch.bin" : "hilfe/zettel.bin";
}

static void hilfeZeigen() {
    if (!sollLesen(hilfeName(), imgBuf, IMG_BYTES)) { tone(PIN_BUZZER, 900, 120); return; }   // noch keine Hilfe aufgespielt
    hilfeAn = true;
    protokoll("Hilfe %s", hilfeName() + 6);
    display.drawBitmap(0, 0, imgBuf, W, H, TFT_BLACK, TFT_WHITE);
    display.update();
    seite = "hilfe";
}

static void tasteAktion(const char* name, bool gedrueckt) {
    letzteBedienung = millis();
    bool up = strcmp(name, "up") == 0, down = strcmp(name, "down") == 0;
    if (up) upUnten = gedrueckt;
    if (down) downUnten = gedrueckt;
    // Hilfe offen: der nächste Tastendruck schließt sie (losgelassen wird erst danach, damit nichts doppelt passiert)
    if (hilfeAn) {
        if (!gedrueckt && !upUnten && !downUnten) { hilfeAn = false; kombi = false; neuZeichnen = true; }
        kiSeit = upSeit = downSeit = 0;
        return;
    }
    if ((up || down) && gedrueckt && upUnten && downUnten) {   // ▲+▼ zusammen
        kombi = true;
        upSeit = downSeit = 0;
        hilfeWunsch = true;
        return;
    }
    if (kombi) {                                                // eine der beiden noch unten: nichts blättern
        if (!upUnten && !downUnten) kombi = false;
        upSeit = downSeit = 0;
        return;
    }
    if (strcmp(name, "ki") == 0) {
        if (gedrueckt) { kiSeit = millis(); kiDiktat = false; return; }
        kiSeit = 0;
        if (kiDiktat) { aufnahmeStopp(); return; }
        if (modus != M_HOME) modusWunsch = M_HOME;   // kurz: immer nach Home
        return;
    }
    if (strcmp(name, "up") == 0) {
        if (gedrueckt) { upSeit = millis(); upLang = false; return; }
        upSeit = 0;
        if (!upLang) blaettern(-1);
        return;
    }
    if (strcmp(name, "down") == 0) {
        if (gedrueckt) { downSeit = millis(); downLang = false; return; }
        downSeit = 0;
        if (!downLang) blaettern(+1);
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
        protokoll("Taste up lang");
        // ▲ 1 s: an den Anfang des Eintrags, steht man schon dort: voriger Eintrag
        if (modus == M_BORDBUCH && bbAktuell != bbToc) bbWunsch = bbToc;
        else if (modus == M_BESTELL && bestellAktuell != 0) { bestellAktuell = 0; modusWunsch = M_BESTELL; }
        else karussellSchritt(-1);
    }
    if (downSeit && !downLang && millis() - downSeit > 1000) {
        downLang = true;                 // ▼ 1 s: nächster Eintrag im Karussell
        tone(PIN_BUZZER, 2000, 60);
        protokoll("Taste down lang");
        karussellSchritt(+1);
    }
    if (bestellWunsch >= 0) {
        if (bestellWunsch < bestellAnzahl) bestellAktuell = bestellWunsch;
        bestellWunsch = -1;
    }
    rahmenLoop();
    if (hilfeWunsch) { hilfeWunsch = false; hilfeZeigen(); }
    if (neuZeichnen) {                    // Hilfe zu: dieselbe Seite wieder zeigen
        neuZeichnen = false;
        if (modus == M_BORDBUCH) bbWunsch = bbAktuell;
        setzeModus(modus);
    }
    if (modusWunsch >= 0) {
        Modus m = (Modus)modusWunsch;
        modusWunsch = -1;
        if (m != modus || m == M_NOTIZ || m == M_BESTELL) setzeModus(m);
    }
    if (modus != M_HOME && !audioLaeuft && millis() - letzteBedienung > ZURUECK_MS) setzeModus(M_HOME);
    if (modus == M_HOME && homeDa && !audioLaeuft && !hilfeAn && uhrZeichnen()) uhrAuffrischen(uhrMinute == 0);
    static uint32_t akkuZuletzt = 0;
    (void)akkuZuletzt;
    if (!hilfeAn) statusPruefen(true, false);   // Statuszeile auf jeder Seite (Akku, Uhr, Handy, Notizen, Warnung)
}
