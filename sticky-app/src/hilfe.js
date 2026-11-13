// Tastenhilfe am Sticky (SPEC „Bedienung und Oberfläche“): ▲ und ▼ gleichzeitig zeigt, was die Tasten auf dieser Seite
// tun. Je Modus eine Seite, gerendert wie die Spickzettel, auf der Karte unter /soll/hilfe/<modus>.bin.
// „!“ am Zeilenanfang = fett (wie im Spickzettel).

export const HILFE = {
  home: {
    titel: 'Hilfe · Home',
    zeilen: ['!Tasten', '▲ ▼ kurz   blättern im Karussell', '▼ 1 s halten   nächster Eintrag', 'KI kurz   Home', 'KI halten   Diktat (loslassen = fertig)',
      '!Oben rechts', 'Akku · Uhr · Handy verbunden · Notizen offen · Warnung', 'Zzz = schlummert, Taste weckt',
      '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  notiz: {
    titel: 'Hilfe · Notiz',
    zeilen: ['!Tippen', 'auf einen Streifen = Notiz mit diesem Text', '!Tasten', '▲ ▼ kurz   blättern im Karussell', 'KI kurz   Home',
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
    zeilen: ['!Messen', 'Gegenstand an die Ecke links unten legen (0), Skala in mm und cm', 'unten bis gut 8 cm, links bis gut 4 cm',
      '!Genauigkeit', 'einmal mit einem echten Lineal nachmessen: App → Mehr → Lineal', '!Tasten', '▲ ▼   blättern · KI   Home',
      '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  'w-menue': {
    titel: 'Hilfe · Menü',
    zeilen: ['!Öffnen', 'KI kurz auf Home', '!Tippen', 'auf eine Kachel = direkt dorthin', '!Kacheln', 'kommen aus dem Karussell (App → Mehr → Karussell)',
      '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
  zettel: {
    titel: 'Hilfe · Zettel',
    zeilen: ['!Tasten', '▲ ▼ kurz   Zettel zurück / vor', '▲ 1 s halten   erster Zettel', '▼ 1 s halten   nächster Eintrag im Karussell',
      'KI kurz   Home · KI halten   Diktat', '!Zettel ändern', 'in der App unter „Bestellen“ bzw. „Karten“',
      '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
};
