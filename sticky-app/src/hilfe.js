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
  zettel: {
    titel: 'Hilfe · Zettel',
    zeilen: ['!Tasten', '▲ ▼ kurz   Zettel zurück / vor', '▲ 1 s halten   erster Zettel', '▼ 1 s halten   nächster Eintrag im Karussell',
      'KI kurz   Home · KI halten   Diktat', '!Zettel ändern', 'in der App unter „Bestellen“ bzw. „Karten“',
      '!Zurück', 'beliebige Taste schließt diese Hilfe'],
  },
};
