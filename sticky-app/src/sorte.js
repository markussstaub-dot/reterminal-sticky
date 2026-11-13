// Notizen sortieren (SPEC „Sprachnotizen 2.0“, Schritt 1): das Handy entscheidet aus Inhalt und Lage, ein Stichwort
// am Anfang geht immer vor, Unsicheres kommt in den Eingang. Offline, ohne KI; Claude räumt später den Eingang auf.
// Ohne Abhängigkeiten, damit es in node --test läuft.

export const SORTEN = {
  fahrt: { name: 'Fahrt', ziel: 'Testnotiz zur Fahrt (Bubble Log)' },
  erledigung: { name: 'Erledigung', ziel: 'Zettel' },
  erinnerung: { name: 'Erinnerung', ziel: 'Kalender' },
  idee: { name: 'Idee', ziel: 'Vault' },
  erzaehlung: { name: 'Erzählung', ziel: 'Vault, Lebensstationen' },
  eingang: { name: 'Eingang', ziel: 'abends aufräumen' },
};
export const SORTEN_REIHE = Object.keys(SORTEN);

// Stichwort am Anfang (gesprochen, also ohne Doppelpunkt-Garantie): „Einkauf Milch“, „Idee: …“, „Erinnere mich …“
const STICHWORTE = [
  [/^(einkauf(en)?|einkaufsliste|erledigung|besorgen|zettel)\b[\s:,.-]*/i, 'erledigung'],
  [/^(idee|gedanke|notiz für mich)\b[\s:,.-]*/i, 'idee'],
  [/^(erinnerung|erinnere mich( daran)?|nicht vergessen)\b[\s:,.-]*/i, 'erinnerung'],
  [/^(fahrt|testnotiz|bubble log|micro)\b[\s:,.-]*/i, 'fahrt'],
  [/^(erzählung|geschichte|memoiren|früher)\b[\s:,.-]*/i, 'erzaehlung'],
];

const HINWEISE = {
  erinnerung: [/\b(um|bis) \d{1,2}([.:]\d{2})? ?uhr\b/i, /\b(morgen|übermorgen|nächste woche|am (montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag))\b/i, /\b(anrufen|termin)\b/i],
  erledigung: [/\b(kaufen|besorgen|holen|bestellen|mitnehmen|abholen)\b/i, /\b(milch|brot|eier|butter|schrauben|batterien)\b/i],
  idee: [/\b(idee|man könnte|wäre (cool|schön|gut)|feature|vielleicht sollten wir)\b/i],
  fahrt: [/\b(ampel|kreisel|tempo|km\/h|akku|ladesäule|heizung|bubble log|reichweite)\b/i],
};

/**
 * Sorte bestimmen → { sorte, grund, text } (text ohne Stichwort)
 * lage: { tempo (m/s, aus dem Ort), faehrt (Sticky meldet Fahrt), dauerMs }
 */
export function sortiere(text, lage = {}) {
  const t = String(text || '').trim();
  for (const [re, sorte] of STICHWORTE) {
    const m = t.match(re);
    if (m && t.length > m[0].length) {
      const rest = t.slice(m[0].length).trim();
      return { sorte, grund: 'Stichwort', text: rest.charAt(0).toUpperCase() + rest.slice(1) };
    }
  }
  const treffer = (s) => HINWEISE[s].filter((re) => re.test(t)).length;
  const faehrt = lage.faehrt || (lage.tempo ?? 0) > 2;
  const woerter = t.split(/\s+/).filter(Boolean).length;
  if ((lage.dauerMs ?? 0) > 25000 || woerter > 60) {
    return treffer('fahrt') || faehrt ? { sorte: 'fahrt', grund: 'lang, während der Fahrt', text: t } : { sorte: 'erzaehlung', grund: 'lang', text: t };
  }
  if (treffer('erinnerung')) return { sorte: 'erinnerung', grund: 'Zeitangabe', text: t };
  if (treffer('erledigung')) return { sorte: 'erledigung', grund: 'Einkauf/Besorgung', text: t };
  if (treffer('idee')) return { sorte: 'idee', grund: 'klingt nach Idee', text: t };
  if (faehrt) return { sorte: 'fahrt', grund: 'während der Fahrt', text: t };
  if (treffer('fahrt')) return { sorte: 'fahrt', grund: 'Fahrt-Wörter', text: t };
  return { sorte: 'eingang', grund: 'unsicher', text: t };
}

export const naechsteSorte = (s) => SORTEN_REIHE[(SORTEN_REIHE.indexOf(s) + 1) % SORTEN_REIHE.length];
