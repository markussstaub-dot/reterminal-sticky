// Tastenhilfe am Sticky (SPEC „Bedienung und Oberfläche“): ▲ und ▼ gleichzeitig zeigt, was die Tasten auf dieser Seite
// tun. Je Modus eine Seite, gerendert wie die Spickzettel, auf der Karte unter /soll/hilfe/<modus>.bin.
// „!“ am Zeilenanfang = fett (wie im Spickzettel).

export const HILFE = {
  home: {
    titel: 'Hilfe · Home',
    zeilen: ['!Tasten', '▲ ▼ kurz   blättern im Karussell', '▲ ▼ 1 s halten   voriger / nächster Eintrag', 'KI kurz   Menü (sonst überall: Home)',
      'KI halten   Diktat (loslassen = fertig)', 'KI 3× schnell   Handy klingelt',
      '!Oben rechts', 'Akku · Uhr · Handy verbunden · Notizen offen · Warnung', 'Zzz = schlummert, Taste weckt',
      '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  notiz: {
    titel: 'Hilfe · Notiz',
    zeilen: ['!Tippen', 'auf einen Streifen = Notiz mit diesem Text', '!Tasten', '▲ ▼ kurz   blättern im Karussell', '▼ 1 s halten   nächster Eintrag', 'KI kurz   Home',
      'KI halten   Diktat', '!Ohne Handy', 'Notizen und Diktate landen auf der Karte, die App holt sie später ab',
      '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  bordbuch: {
    titel: 'Hilfe · Bordbuch',
    zeilen: ['!Tippen', 'im Inhaltsverzeichnis auf ein Kapitel = dorthin', '!Tasten', '▲ ▼ kurz   Seite zurück / vor', '▲ 1 s halten   Inhaltsverzeichnis',
      '▼ 1 s halten   nächster Eintrag im Karussell', 'KI kurz   Home · KI halten   Diktat', '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  kritzel: {
    titel: 'Hilfe · Kritzelblock',
    zeilen: ['!Zeichnen', 'mit dem Finger auf das Blatt', '!Speichern', 'Seite verlassen (▲ ▼ oder KI) = Blatt speichern',
      'wiederkommen = neues, leeres Blatt', 'die App holt es ab, es erscheint als Notiz', '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  'w-timer': {
    titel: 'Hilfe · Timer',
    zeilen: ['!Tippen', 'Start / Stopp, ± 1 min, Vorlage (1, 3, 5, 10, 25 min), Reset', '!Tasten', '▲ ▼   blättern wie überall · KI   Home', '!Läuft weiter', 'auch wenn du die Seite verlässt; beim Ablauf piept er',
      'und holt die Timer-Seite nach vorn (auch ohne Handy)', '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  'w-waage': {
    titel: 'Hilfe · Wasserwaage',
    zeilen: ['!Messen', 'Sticky flach hinlegen, die Blase zeigt die Neigung', '↔ und ↕: Neigung in Grad für beide Richtungen',
      '!Null setzen', 'aktuelle Lage als Null (schräge Unterlage ausgleichen)', '!Halten', 'Wert einfrieren, zum Ablesen wegnehmen',
      '!Tasten', '▲ ▼   blättern · KI   Home', '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  'w-lineal': {
    titel: 'Hilfe · Lineal',
    zeilen: ['!Messen', 'Gegenstand an die Ecke links unten (0) legen, Skala mm/cm', 'unten bis gut 8 cm, links bis gut 4 cm',
      '!Genauigkeit', 'einmal mit echtem Lineal nachmessen: App → Mehr → Lineal', '!Tasten', '▲ ▼   blättern · KI   Home',
      '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  'w-rechner': {
    titel: 'Hilfe · Rechner',
    zeilen: ['!Rechnen im Sticky', 'auch ohne Handy · Tasten wie beim Braun-Rechner', '!Prozent', '80 + 11 % = 88,8 (Aufschlag) · 80 × 11 % = 8,8',
      '!Speicher', 'M+ / M− buchen · MR holt · MC löscht · „M“ links = belegt', '!Tasten', '▲ ▼   blättern · KI   Home',
      '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  'w-umrechner': {
    titel: 'Hilfe · Umrechner',
    zeilen: ['!Rechnen im Sticky', 'auch ohne Handy', '!Paar wählen', 'links bzw. oben antippen, das gewählte ist schwarz',
      '!⇄', 'Richtung tauschen, das Ergebnis wird die neue Eingabe', '!Tasten', '▲ ▼   blättern · KI   Home',
      '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  'w-weltzeit': {
    titel: 'Hilfe · Weltzeit',
    zeilen: ['!Städte', 'Zuhause, Tokio, New York, Los Angeles · ☀ = Tag, ☾ = Nacht', '!Ohne Handy',
      'der Sticky zählt selbst weiter; Sommerzeit-Wechsel kommen beim nächsten Abgleich', '!Tasten', '▲ ▼   blättern · KI   Home',
      '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  'w-wecker': {
    titel: 'Hilfe · Wecker',
    zeilen: ['!Stellen', '± 1 h, ± 10 min, ± 1 min · Stellen schaltet ihn ein', '!An / Aus', 'unten, „an“/„aus“ steht unter der Zeit',
      '!Klingeln', 'auch im Schlummer, bis zu 1 min · jede Taste stellt ab', '!Tasten', '▲ ▼   blättern · KI   Home', '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  'w-einstellungen': {
    titel: 'Hilfe · Einstellungen',
    zeilen: ['!Uhrzeit', 'auto = wie das Handy · 24 h · 12 h (AM/PM) – Home-Uhr, Statuszeile, Weltzeit, Wecker',
      '!Einheiten', 'auto · metr · US – Wetter in °C/°F, Lineal in mm/Zoll',
      '!Uhr stellen', 'nur nötig, wenn der Akku ganz leer war und kein Handy da ist · das Handy korrigiert später',
      '!Gespeichert', 'auf dem Sticky, gilt auch ohne Handy', '!Tasten', '▲ ▼   blättern · KI   Home', '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  'w-menue': {
    titel: 'Hilfe · Menü',
    zeilen: ['!Öffnen', 'KI kurz auf Home', '!Tippen', 'auf eine Kachel = direkt dorthin', '!Kacheln', 'kommen aus dem Karussell (App → Mehr → Karussell)',
      '!Tasten', '▲ ▼   blättern · KI   Home', '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  app: {
    titel: 'Hilfe · App-Seite',
    zeilen: ['!Tippen', 'die App auf dem Handy antwortet (nur mit Verbindung)', '!Tasten', '▲ ▼ kurz   blättern im Karussell', 'KI kurz   Home · KI halten   Diktat',
      '!Ohne Handy', 'gibt es hier nichts zu zeigen, der Sticky geht zurück nach Home', '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  zettel: {
    titel: 'Hilfe · Zettel',
    zeilen: ['!Tasten', '▲ ▼ kurz   Zettel zurück / vor', '▲ 1 s halten   erster Zettel', '▼ 1 s halten   nächster Eintrag im Karussell',
      'KI kurz   Home · KI halten   Diktat', '!Zettel ändern', 'in der App unter „Bestellen“ bzw. „Karten“',
      '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
};
// Lineal in Zoll: dieselbe Hilfe wie das Lineal
HILFE['w-lineal-us'] = { ...HILFE['w-lineal'], titel: 'Hilfe · Lineal (Zoll)',
  zeilen: HILFE['w-lineal'].zeilen.map((z) => ({ 'Gegenstand an die Ecke links unten (0) legen, Skala mm/cm': 'Gegenstand an die Ecke links unten (0) legen, Skala in Zoll',
    'unten bis gut 8 cm, links bis gut 4 cm': 'unten bis gut 3 Zoll, links bis gut 1½ Zoll' }[z] ?? z)) };
