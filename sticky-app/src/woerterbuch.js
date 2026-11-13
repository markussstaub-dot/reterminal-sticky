// Lernendes Wörterbuch (SPEC „lokales Modell flott machen“, Schritt 2): nach der Erkennung bekannte Verhörer ersetzen
// und unplausible Zahlen markieren. Jede Korrektur einer Notiz liefert neue Paare („falsch → richtig“).
// Ohne Abhängigkeiten, damit es in node --test läuft.

export const WOERTERBUCH_STANDARD = [
  'Mikrolino → Microlino',
  'Micro Lino → Microlino',
  'Herzzuschlag → Heizzuschlag',
  'Bubble Lock → Bubble Log',
  'Babel Log → Bubble Log',
].join('\n');

/** Text „falsch → richtig“ je Zeile (auch „->“ oder „=“) → [{ falsch, richtig }] */
export function paareLesen(text) {
  return String(text || '').split('\n').map((z) => {
    const m = z.match(/^\s*(.+?)\s*(?:→|->|=)\s*(.+?)\s*$/);
    return m && m[1].toLowerCase() !== m[2].toLowerCase() ? { falsch: m[1], richtig: m[2] } : null;
  }).filter(Boolean);
}

export const paareText = (paare) => paare.map((p) => `${p.falsch} → ${p.richtig}`).join('\n');

const regexWort = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

/** Bekannte Verhörer ersetzen: ganze Wörter, Groß-/Kleinschreibung egal, längste zuerst */
export function anwenden(text, paare) {
  let t = String(text || '');
  for (const p of [...paare].sort((a, b) => b.falsch.length - a.falsch.length)) {
    t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${regexWort(p.falsch)}(?![\\p{L}\\p{N}])`, 'giu'), p.richtig);
  }
  return t;
}

/** Unplausible Prozente (über 100) mit „(?)“ markieren, damit man beim Lesen stutzt statt falsch übernimmt */
export function zahlenPruefen(text) {
  return String(text || '').replace(/(\d+(?:[.,]\d+)?)\s?(%|Prozent)(?!\(\?\))/g, (ganz, zahl, zeichen) =>
    parseFloat(zahl.replace(',', '.')) > 100 ? `${zahl} ${zeichen}(?)` : ganz);
}

export const korrigiere = (text, paare) => zahlenPruefen(anwenden(text, paare));

const woerterVon = (t) => String(t || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];

/**
 * Aus alter und neuer Fassung Paare ableiten: Wortfolgen, die ersetzt wurden (je Seite 1–3 Wörter).
 * Reine Ergänzungen oder Streichungen sind keine Verhörer und werden nicht gelernt, Zahlen auch nicht (Einzelfälle),
 * und Wörter der Wortliste (`geschuetzt`, bewusst echte Namen wie „Sticky“) nie als „falsch“.
 */
export function lernen(alt, neu, geschuetzt = []) {
  const schutz = new Set(geschuetzt.map((w) => w.trim().toLowerCase()).filter(Boolean));
  const a = woerterVon(alt), b = woerterVon(neu);
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = a[i].toLowerCase() === b[j].toLowerCase() ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const paare = [];
  let i = 0, j = 0, va = [], vb = [];
  const abschluss = () => {
    const falsch = va.join(' '), richtig = vb.join(' ');
    const zahl = /\d/.test(falsch) || /\d/.test(richtig);
    if (va.length && vb.length && va.length <= 3 && vb.length <= 3 && !zahl && !va.some((w) => schutz.has(w.toLowerCase()))) paare.push({ falsch, richtig });
    va = []; vb = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i].toLowerCase() === b[j].toLowerCase()) { abschluss(); i++; j++; }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) vb.push(b[j++]);
    else va.push(a[i++]);
  }
  abschluss();
  return paare;
}

/** Neue Paare einpflegen (gleiches „falsch“ wird überschrieben) → neue Liste */
export function einpflegen(paare, neue) {
  const aus = paare.filter((p) => !neue.some((x) => x.falsch.toLowerCase() === p.falsch.toLowerCase()));
  return [...aus, ...neue];
}
