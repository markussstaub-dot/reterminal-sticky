// Tastenhilfe am Sticky (SPEC „Bedienung und Oberfläche“): ▲ und ▼ gleichzeitig zeigt, was die Tasten auf dieser Seite
// tun. Je Modus eine Seite, gerendert wie die Spickzettel, auf der Karte unter /soll/hilfe/<modus>.bin.
// „!“ am Zeilenanfang = fett (wie im Spickzettel).
// Zweisprachig (SPEC „Zweisprachig Deutsch/Englisch“): HILFE hat je Modus einen Getter, der beim Zugriff in der gerade
// wirksamen Sprache baut (T() zur Zeichenzeit, nicht beim Import). Object.entries(HILFE) in fuerSticky() liefert also
// die Sprache des Sticky. fuss: rechts oben im Kopf (zeichneTextseite nimmt ihn vor dem übergebenen).
import { T } from './uebersetzen.js';

const ZURUECK = () => [T('!Zurück', '!Back'), T('beliebige Taste schließt diese Hilfe', 'any key closes this help')];
const TASTEN_KURZ = () => [T('!Tasten', '!Keys'), T('▲ ▼   blättern · KI   Home', '▲ ▼   scroll · AI   Home')];

/** alle Hilfeseiten in der wirksamen Sprache */
function seiten() {
  const s = {
    home: {
      titel: T('Hilfe · Home', 'Help · Home'),
      zeilen: T(
        ['!Tasten', '▲ ▼ kurz   blättern im Karussell', '▲ ▼ 1 s halten   voriger / nächster Eintrag', 'KI kurz   Menü (sonst überall: Home)',
          'KI halten   Diktat (loslassen = fertig)', 'KI 3× schnell   Handy klingelt',
          '!Oben rechts', 'Akku · Uhr · Handy verbunden · Notizen offen · Warnung', 'Zzz = schlummert, Taste weckt'],
        ['!Keys', '▲ ▼ short   scroll the carousel', '▲ ▼ hold 1 s   previous / next entry', 'AI short   menu (elsewhere: Home)',
          'AI hold   dictate (release = done)', 'AI 3× quickly   phone rings',
          '!Top right', 'battery · clock · phone connected · notes pending · warning', 'Zzz = asleep, any key wakes it']).concat(ZURUECK()),
    },
    notiz: {
      titel: T('Hilfe · Notiz', 'Help · Note'),
      zeilen: T(
        ['!Tippen', 'auf einen Streifen = Notiz mit diesem Text', '!Tasten', '▲ ▼ kurz   blättern im Karussell', '▼ 1 s halten   nächster Eintrag', 'KI kurz   Home',
          'KI halten   Diktat', '!Ohne Handy', 'Notizen und Diktate landen auf der Karte, die App holt sie später ab'],
        ['!Tap', 'a strip = note with this text', '!Keys', '▲ ▼ short   scroll the carousel', '▼ hold 1 s   next entry', 'AI short   Home',
          'AI hold   dictate', '!Without phone', 'notes and dictations are stored on the SD card, the app collects them later']).concat(ZURUECK()),
    },
    bordbuch: {
      titel: T('Hilfe · Bordbuch', 'Help · Logbook'),
      zeilen: T(
        ['!Tippen', 'im Inhaltsverzeichnis auf ein Kapitel = dorthin', '!Tasten', '▲ ▼ kurz   Seite zurück / vor', '▲ 1 s halten   Inhaltsverzeichnis',
          '▼ 1 s halten   nächster Eintrag im Karussell', 'KI kurz   Home · KI halten   Diktat'],
        ['!Tap', 'a chapter in the contents = go there', '!Keys', '▲ ▼ short   page back / forward', '▲ hold 1 s   contents',
          '▼ hold 1 s   next carousel entry', 'AI short   Home · AI hold   dictate']).concat(ZURUECK()),
    },
    // ab FW 0.38.0 (Dokumente): Handbuch und Spickzettel statt Bordbuch
    handbuch: {
      titel: T('Hilfe · Handbuch', 'Help · Manual'),
      zeilen: T(
        ['!Tippen', 'Kachel = Dokument, wo du warst · Kapitel = dorthin', 'auf eine Seite = Inhaltsverzeichnis · Lesezeichen oben rechts',
          '!Tasten', '▲ ▼ kurz   Seite zurück / vor', '▲ 1 s auf einer Seite   Lesezeichen setzen', '▲ 1 s im Inhalt   Bibliothek',
          'KI kurz   Home · KI halten   Diktat'],
        ['!Tap', 'tile = document where you left off · chapter = go there', 'a page = contents · bookmark top right',
          '!Keys', '▲ ▼ short   page back / forward', '▲ hold 1 s on a page   set bookmark', '▲ hold 1 s in contents   library',
          'AI short   Home · AI hold   dictate']).concat(ZURUECK()),
    },
    spick: {
      titel: T('Hilfe · Spickzettel', 'Help · Cheat sheets'),
      zeilen: T(
        ['!Tippen', 'einen Titel links = diese Karte', '!Tasten', '▲ ▼ kurz   vorige / nächste Karte', '▲ 1 s halten   erste Karte',
          'KI kurz   Home · KI halten   Diktat', '!Pflegen', 'in der App unter Dokumente oder am Zenbook (Spickzettel-Konsole)'],
        ['!Tap', 'a title on the left = that card', '!Keys', '▲ ▼ short   previous / next card', '▲ hold 1 s   first card',
          'AI short   Home · AI hold   dictate', '!Edit', 'in the app under Docs or on the laptop (cheat sheet console)']).concat(ZURUECK()),
    },
    kritzel: {
      titel: T('Hilfe · Kritzel', 'Help · Doodle'),
      zeilen: T(
        ['!Zeichnen', 'mit dem Finger auf das Blatt', '!Speichern', 'Seite verlassen (▲ ▼ oder KI) = Blatt speichern',
          'wiederkommen = neues, leeres Blatt', 'die App holt es ab, es erscheint als Notiz'],
        ['!Draw', 'with your finger on the sheet', '!Save', 'leave the page (▲ ▼ or AI) = save the sheet',
          'come back = new, blank sheet', 'the app collects it, it shows up as a note']).concat(ZURUECK()),
    },
    'w-timer': {
      titel: T('Hilfe · Timer', 'Help · Timer'),
      zeilen: T(
        ['!Tippen', 'Start / Stopp, ± 1 min, Vorlage (1, 3, 5, 10, 25 min), Reset', 'auf die Zeit = eigene Zeit mit Ziffern', '!Tasten', '▲ ▼   blättern wie überall · KI   Home', '!Läuft weiter',
          'auch wenn du die Seite verlässt; beim Ablauf piept er', 'und holt die Timer-Seite nach vorn (auch ohne Handy)'],
        ['!Tap', 'Start / Stop, ± 1 min, preset (1, 3, 5, 10, 25 min), Reset', 'the time = your own time with digits', '!Keys', '▲ ▼   scroll as everywhere · AI   Home', '!Keeps running',
          'even when you leave the page; when time is up it beeps', 'and brings the timer page to the front (even without phone)']).concat(ZURUECK()),
    },
    'w-waage': {
      titel: T('Hilfe · Wasserwaage', 'Help · Spirit level'),
      zeilen: T(
        ['!Messen', 'Sticky flach hinlegen, die Blase zeigt die Neigung', '↔ und ↕: Neigung in Grad für beide Richtungen',
          '!Null setzen', 'aktuelle Lage als Null (schräge Unterlage ausgleichen)', '!Halten', 'Wert einfrieren, zum Ablesen wegnehmen'],
        ['!Measure', 'lay the Sticky flat, the bubble shows the tilt', '↔ and ↕: tilt in degrees in both directions',
          '!Set zero', 'current position as zero (evens out a sloping surface)', '!Hold', 'freeze the value, pick it up to read it']).concat(TASTEN_KURZ(), ZURUECK()),
    },
    'w-lineal': {
      titel: T('Hilfe · Lineal', 'Help · Ruler'),
      zeilen: T(
        ['!Messen', 'Gegenstand an die Ecke links unten (0) legen, Skala mm/cm', 'unten bis gut 8 cm, links bis gut 4 cm',
          '!Genauigkeit', 'einmal mit echtem Lineal nachmessen: App → Mehr → Lineal'],
        ['!Measure', 'put the object at the bottom left corner (0), scale mm/cm', 'bottom up to about 8 cm, left up to about 4 cm',
          '!Accuracy', 'check once against a real ruler: app → More → Ruler']).concat(TASTEN_KURZ(), ZURUECK()),
    },
    'w-rechner': {
      titel: T('Hilfe · Rechner', 'Help · Calculator'),
      zeilen: T(
        ['!Rechnen im Sticky', 'auch ohne Handy · Tasten wie beim Braun-Rechner', '!Prozent', '80 + 11 % = 88,8 (Aufschlag) · 80 × 11 % = 8,8',
          '!Speicher', 'M+ / M− buchen · MR holt · MC löscht · „M“ links = belegt'],
        ['!Runs on the Sticky', 'even without phone · keys like the Braun calculator', '!Percent', '80 + 11 % = 88.8 (markup) · 80 × 11 % = 8.8',
          '!Memory', 'M+ / M− add · MR recalls · MC clears · “M” on the left = in use']).concat(TASTEN_KURZ(), ZURUECK()),
    },
    'w-umrechner': {
      titel: T('Hilfe · Umrechner', 'Help · Converter'),
      zeilen: T(
        ['!Rechnen im Sticky', 'auch ohne Handy', '!Paar wählen', 'links bzw. oben antippen, das gewählte ist schwarz',
          '!⇄', 'Richtung tauschen, das Ergebnis wird die neue Eingabe'],
        ['!Runs on the Sticky', 'even without phone', '!Choose a pair', 'tap on the left or at the top, the chosen one is black',
          '!⇄', 'swap direction, the result becomes the new input']).concat(TASTEN_KURZ(), ZURUECK()),
    },
    'w-weltzeit': {
      titel: T('Hilfe · Weltzeit', 'Help · World clock'),
      zeilen: T(
        ['!Städte', 'Zuhause, Tokio, New York, Los Angeles · ☀ = Tag, ☾ = Nacht', '!Ohne Handy',
          'der Sticky zählt selbst weiter; Sommerzeit-Wechsel kommen beim nächsten Abgleich'],
        ['!Cities', 'Home, Tokyo, New York, Los Angeles · ☀ = day, ☾ = night', '!Without phone',
          'the Sticky keeps counting itself; daylight saving changes come with the next sync']).concat(TASTEN_KURZ(), ZURUECK()),
    },
    'w-recorder': {
      titel: T('Hilfe · Recorder', 'Help · Recorder'),
      zeilen: T(
        ['!Aufnehmen', 'großer Knopf = Start / Stopp, Hände frei · läuft weiter, wenn du die Seite verlässt',
          '!Merker', 'KI halten (solange er läuft) oder „Merker“ – die Stelle steht später im Text',
          '!Liste', 'Aufnahmen von heute · ✓ beim Handy und abgetippt · Sanduhr = wartet aufs Handy',
          '!Anhören', 'nur am Handy: Zeile antippen spielt dort ab (noch einmal = Pause), ▲ ▼ springt zum Merker',
          '!Grenzen', 'nach jeder Stunde Piepton · unter 15 % Akku stoppt er · braucht die Karte'],
        ['!Record', 'big button = start / stop, hands free · keeps running when you leave the page',
          '!Marks', 'hold AI (while recording) or “Mark” – the spot shows up in the text later',
          '!List', 'today’s recordings · ✓ on the phone and transcribed · hourglass = waiting for the phone',
          '!Listen', 'on the phone only: tap a row to play it there (again = pause), ▲ ▼ jumps to marks',
          '!Limits', 'beep after every hour · stops below 15 % battery · needs the card']).concat(ZURUECK()),
    },
    'w-tippen': {
      titel: T('Hilfe · Tippen', 'Help · Type'),
      zeilen: T(
        ['!Arten', 'Reiter unter der Textzeile: Tasten · Ziffern · Strich (Strichschrift-Seite) · Sprache',
          '!Tasten', '⇧ = nächster Buchstabe groß (Schreibmarke wird zum Block) · ⌫ löscht, lang gehalten alles',
          '!Sprache', 'KI halten und sprechen · mit Handy kommt der Text an die Schreibmarke, ohne wird es eine Sprachnotiz',
          '!Fertig', 'OK = Notiz (landet in der App im Eingang, ohne Handy gepuffert) · der Text bleibt bis OK stehen'],
        ['!Modes', 'tabs below the text line: Keys · Digits · Stroke (handwriting page) · Voice',
          '!Keys', '⇧ = next letter upper case (the cursor turns into a block) · ⌫ deletes, held long everything',
          '!Voice', 'hold AI and speak · with the phone the text goes to the cursor, without it becomes a voice note',
          '!Done', 'OK = note (lands in the app inbox, buffered without the phone) · the text stays until OK']).concat(TASTEN_KURZ(), ZURUECK()),
    },
    'w-zf-timer': {
      titel: T('Hilfe · Ziffern', 'Help · Digits'),
      zeilen: T(
        ['!Eintippen', 'Ziffern, „:“ trennt Sekunden ab (5:30) · ⌫ löscht eine Stelle, lang gehalten alles',
          '!Fertig', 'OK übernimmt die Zeit in den Timer · KI kurz = abbrechen'],
        ['!Type', 'digits, “:” separates seconds (5:30) · ⌫ deletes one digit, held long everything',
          '!Done', 'OK sets the timer · short AI = cancel']).concat(ZURUECK()),
    },
    'w-jn-rec': {
      titel: T('Hilfe · Ja/Nein', 'Help · Yes/No'),
      zeilen: T(['!Antworten', 'Pille antippen oder ▲ = Ja, ▼ = Nein · KI kurz = abbrechen'],
        ['!Answer', 'tap a pill or ▲ = yes, ▼ = no · short AI = cancel']).concat(ZURUECK()),
    },
    'w-wecker': {
      titel: T('Hilfe · Wecker', 'Help · Alarm'),
      zeilen: T(
        ['!Stellen', '± 1 h, ± 10 min, ± 1 min · Stellen schaltet ihn ein', '!An / Aus', 'unten, „an“/„aus“ steht unter der Zeit',
          '!Klingeln', 'auch im Schlummer, bis zu 1 min · jede Taste stellt ab'],
        ['!Set', '± 1 h, ± 10 min, ± 1 min · setting it switches it on', '!On / Off', 'at the bottom, “on”/“off” shows below the time',
          '!Ringing', 'even when asleep, up to 1 min · any key stops it']).concat(TASTEN_KURZ(), ZURUECK()),
    },
    'w-einstellungen': {
      titel: T('Hilfe · Einstellungen', 'Help · Settings'),
      zeilen: T(
        ['!Uhrzeit', 'auto = wie das Handy · 24 h · 12 h (AM/PM) – Home-Uhr, Statuszeile, Weltzeit, Wecker',
          '!Einheiten', 'auto · metr · US – Wetter in °C/°F, Lineal in mm/Zoll',
          '!Sprache', 'auto = wie die App · DE · EN – die Seiten wechseln beim nächsten Verbinden',
          '!Uhr stellen', 'nur nötig, wenn der Akku ganz leer war und kein Handy da ist · das Handy korrigiert später',
          '!Gespeichert', 'auf dem Sticky, gilt auch ohne Handy'],
        ['!Time', 'auto = like the phone · 24 h · 12 h (AM/PM) – home clock, status bar, world clock, alarm',
          '!Units', 'auto · metr · US – weather in °C/°F, ruler in mm/inches',
          '!Language', 'auto = like the app · DE · EN – pages switch at the next connection',
          '!Set clock', 'only needed if the battery was completely flat and no phone is around · the phone corrects it later',
          '!Saved', 'on the Sticky, works without phone too']).concat(TASTEN_KURZ(), ZURUECK()),
    },
    'w-menue': {
      titel: T('Hilfe · Menü', 'Help · Menu'),
      zeilen: T(
        ['!Öffnen', 'KI kurz auf Home', '!Tippen', 'Kachel = Gruppe, öffnet das zuletzt benutzte Werkzeug', '!Reiter', 'oben = die anderen der Gruppe · Auswahl: App → Mehr'],
        ['!Open', 'AI short on Home', '!Tap', 'tile = group, opens the last used tool', '!Tabs', 'at the top = the rest of the group · choose: app → More']).concat(TASTEN_KURZ(), ZURUECK()),
    },
    app: {
      titel: T('Hilfe · Spiel', 'Help · Game'),
      zeilen: T(
        ['!Burgduell', 'Tippen ins Feld zielt und schießt; die App auf dem Handy rechnet (nur mit Verbindung)',
          '!Zu zweit', 'zeigen zwei verbundene Stickys das Spiel, beginnt das Duell', '!Tasten', '▲ ▼ kurz   blättern im Karussell', 'KI kurz   Home · KI halten   Diktat',
          '!Ohne Handy', 'zeigt der Sticky „braucht das Handy“'],
        ['!Castle Duel', 'tap the field to aim and fire; the app on the phone does the maths (connection needed)',
          '!Two players', 'when two connected Stickys show the game, the duel begins', '!Keys', '▲ ▼ short   scroll the carousel', 'AI short   Home · AI hold   dictate',
          '!Without phone', 'the Sticky shows “needs the phone”']).concat(ZURUECK()),
    },
    // kein Modus: zeigt der Sticky, wenn „Spiel“ ohne Verbindung gewählt wird oder das Handy mitten im Spiel weg ist (FW 0.31.8)
    offline: {
      titel: T('Spiel braucht das Handy', 'Game needs the phone'),
      zeilen: T(
        ['!Gerade nicht verbunden', 'Das Burgduell rechnet die App auf dem Handy.', '!Was hilft', 'App auf dem Handy öffnen, Bluetooth an – dann noch mal antippen',
          '!Ohne Handy geht', 'Uhr, Timer, Wecker, Weltzeit, Rechner, Umrechner, Waage, Lineal, Recorder, Tippen, Diktat, Kritzel, Schrift, Handbuch, Spickzettel, Zettel',
          '!Zurück', 'beliebige Taste'],
        ['!Not connected right now', 'Castle Duel is computed by the app on the phone.', '!What helps', 'open the app on the phone, Bluetooth on – then tap again',
          '!Works without phone', 'clock, timer, alarm, world clock, calculator, converter, level, ruler, recorder, typing, dictation, doodle, writing, manual, cheat sheets, lists',
          '!Back', 'any key']),
    },
    zettel: {
      titel: T('Hilfe · Zettel', 'Help · Lists'),
      zeilen: T(
        ['!Tasten', '▲ ▼ kurz   Zettel zurück / vor', '▲ 1 s halten   erster Zettel', '▼ 1 s halten   nächster Eintrag im Karussell',
          'KI kurz   Home · KI halten   Diktat', '!Zettel ändern', 'in der App unter „Zettel“'],
        ['!Keys', '▲ ▼ short   list back / forward', '▲ hold 1 s   first list', '▼ hold 1 s   next carousel entry',
          'AI short   Home · AI hold   dictate', '!Change lists', 'in the app under “Lists”']).concat(ZURUECK()),
    },
  };
  // Lineal in Zoll: dieselbe Hilfe wie das Lineal
  const zoll = {
    'Gegenstand an die Ecke links unten (0) legen, Skala mm/cm': 'Gegenstand an die Ecke links unten (0) legen, Skala in Zoll',
    'unten bis gut 8 cm, links bis gut 4 cm': 'unten bis gut 3 Zoll, links bis gut 1½ Zoll',
    'put the object at the bottom left corner (0), scale mm/cm': 'put the object at the bottom left corner (0), scale in inches',
    'bottom up to about 8 cm, left up to about 4 cm': 'bottom up to about 3 in, left up to about 1½ in',
  };
  s['w-lineal-us'] = { ...s['w-lineal'], titel: T('Hilfe · Lineal (Zoll)', 'Help · Ruler (inches)'), zeilen: s['w-lineal'].zeilen.map((z) => zoll[z] ?? z) };
  const fuss = T('▲+▼ = Hilfe', '▲+▼ = Help');
  for (const seite of Object.values(s)) seite.fuss = fuss;
  return s;
}

/** { modus: { titel, zeilen, fuss } } – jeder Zugriff baut in der wirksamen Sprache (Reihenfolge der Schlüssel fest) */
export const HILFE = {};
for (const modus of Object.keys(seiten())) Object.defineProperty(HILFE, modus, { enumerable: true, get: () => seiten()[modus] });
