// Strichschrift für den Sticky (SPEC „Strichschrift statt Tastatur zuerst probieren“, 13.11.2026): ein Strich je
// Zeichen, nah an der Druckschrift, im Geist von Graffiti (Palm), aber ein eigenes Alphabet. Erkennung wie der
// „$1-Erkenner“ ohne Drehung: Strich auf N Punkte nachziehen, auf das Begrenzungsquadrat normieren, mit jeder Vorlage
// den mittleren Punktabstand vergleichen. Die Richtung zählt (A wird von unten links nach oben gemalt).
// Dasselbe Verfahren läuft in der Firmware (schrift.h); die Vorlagen kommen von hier als Datei auf die Karte.
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';
import { BRAUN_FONT } from './braun.js';
import { T } from './uebersetzen.js';

/** Vorlagen in einem Einheitsquadrat (x nach rechts, y nach unten); Buchstaben links, Ziffern rechts im Schreibfeld */
export const BUCHSTABEN = {
  A: [[0, 1], [0.5, 0], [1, 1]],
  B: [[0, 1], [0, 0], [0.8, 0.08], [0.85, 0.35], [0.1, 0.5], [0.95, 0.65], [0.9, 0.95], [0, 1]],
  C: [[1, 0.1], [0.5, 0], [0.05, 0.5], [0.5, 1], [1, 0.9]],
  D: [[0, 1], [0, 0], [0.7, 0.1], [1, 0.5], [0.7, 0.9], [0, 1]],
  E: [[1, 0], [0.1, 0.2], [0.7, 0.5], [0.1, 0.8], [1, 1]],
  F: [[1, 0], [0, 0], [0, 1]],
  G: [[1, 0.1], [0.4, 0], [0, 0.5], [0.4, 1], [1, 0.9], [1, 0.55], [0.55, 0.55]],
  H: [[0, 0], [0, 1], [0, 0.6], [0.5, 0.42], [1, 0.6], [1, 1]],
  I: [[0.5, 0], [0.5, 1]],
  J: [[1, 0], [1, 0.75], [0.6, 1], [0.1, 0.8]],
  K: [[1, 0], [0, 0.5], [1, 1]],
  L: [[0, 0], [0, 1], [1, 1]],
  M: [[0, 1], [0.1, 0], [0.5, 0.6], [0.9, 0], [1, 1]],
  N: [[0, 1], [0, 0], [1, 1], [1, 0]],
  O: [[0.5, 0], [0.05, 0.3], [0.05, 0.7], [0.5, 1], [0.95, 0.7], [0.95, 0.3], [0.5, 0]],
  P: [[0, 1], [0, 0], [0.8, 0.05], [0.95, 0.3], [0.7, 0.5], [0, 0.5]],
  Q: [[0.5, 0], [0.05, 0.3], [0.05, 0.7], [0.5, 1], [0.95, 0.7], [0.95, 0.3], [0.5, 0], [0.6, 0.6], [1, 1]],
  R: [[0, 1], [0, 0], [0.8, 0.05], [0.95, 0.3], [0.7, 0.5], [0, 0.5], [1, 1]],
  S: [[1, 0.1], [0.5, 0], [0.05, 0.25], [0.95, 0.75], [0.5, 1], [0, 0.9]],
  T: [[0, 0], [1, 0], [0.5, 0], [0.5, 1]],
  U: [[0, 0], [0, 0.75], [0.5, 1], [1, 0.75], [1, 0]],
  V: [[0, 0], [0.5, 1], [1, 0]],
  W: [[0, 0], [0.25, 1], [0.5, 0.4], [0.75, 1], [1, 0]],
  X: [[0, 0], [1, 1], [1, 0], [0, 1]],
  Y: [[0, 0], [0.5, 0.5], [1, 0], [0.5, 0.5], [0.5, 1]],
  Z: [[0, 0], [1, 0], [0, 1], [1, 1]],
};
export const ZIFFERN = {
  0: [[0.5, 0], [0.05, 0.3], [0.05, 0.7], [0.5, 1], [0.95, 0.7], [0.95, 0.3], [0.5, 0]],
  1: [[0.5, 0], [0.5, 1]],
  2: [[0, 0.2], [0.5, 0], [1, 0.25], [0, 1], [1, 1]],
  3: [[0, 0.05], [0.9, 0.1], [0.4, 0.45], [1, 0.7], [0.5, 1], [0, 0.9]],
  4: [[0.7, 0], [0, 0.65], [1, 0.65]],
  5: [[1, 0], [0.1, 0], [0, 0.45], [0.8, 0.5], [0.95, 0.8], [0.45, 1], [0, 0.9]],
  6: [[0.9, 0], [0.2, 0.4], [0, 0.8], [0.5, 1], [1, 0.75], [0.5, 0.5], [0, 0.7]],
  7: [[0, 0], [1, 0], [0.3, 1]],
  8: [[1, 0.1], [0.5, 0], [0.05, 0.2], [0.95, 0.8], [0.5, 1], [0.05, 0.8], [0.95, 0.2], [0.5, 0]],
  9: [[1, 0.3], [0.5, 0], [0.05, 0.25], [0.5, 0.5], [1, 0.3], [1, 1]],
};
/**
 * Zweite, natürlichere Formen (Markus, 13.11.2026: „wie mach ich ein B?“). Der Erkenner nimmt die passendere;
 * auf dem Spickzettel steht die erste Form aus BUCHSTABEN.
 */
export const ZWEITFORMEN = {
  B: [[0, 0], [0, 1], [0, 0.03], [0.8, 0.08], [0.85, 0.35], [0.1, 0.5], [0.95, 0.65], [0.9, 0.95], [0, 1]],   // Stamm runter, wieder hoch, Bäuche
  F: [[0, 1], [0, 0], [1, 0]],                                                                            // Stamm hoch, dann oben nach rechts
};
/** Gesten in beiden Feldern: waagrecht nach rechts = Leerzeichen, nach links = löschen, Tipp = Umlaut bzw. Punkt */
export const GESTEN = { ' ': [[0, 0.5], [1, 0.5]], '⌫': [[1, 0.5], [0, 0.5]] };
export const UMLAUT = { A: 'Ä', O: 'Ö', U: 'Ü', S: 'ß' };

export const N = 32;
/** Abstandsgrenze: mit Zweitformen bei 200 verwackelten Strichen je Zeichen 99,8 % richtig, 0,1 % verwechselt, Gekritzel
 * abgelehnt (13.11.2026). Geht als „grenze“ mit in alphabet.txt (FW ≥ 0.27.1). */
export const GRENZE = 0.2;

/** Strich (Punkte [x, y]) auf n gleich weit entfernte Punkte nachziehen */
export function nachziehen(punkte, n = N) {
  let laenge = 0;
  for (let i = 1; i < punkte.length; i++) laenge += Math.hypot(punkte[i][0] - punkte[i - 1][0], punkte[i][1] - punkte[i - 1][1]);
  if (laenge === 0) return Array.from({ length: n }, () => [...punkte[0]]);
  const schritt = laenge / (n - 1), aus = [[...punkte[0]]];
  let rest = 0, p = [...punkte[0]];
  for (let i = 1; i < punkte.length && aus.length < n; i++) {
    let q = punkte[i], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    while (rest + d >= schritt && aus.length < n) {
      const t = (schritt - rest) / d;
      p = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
      aus.push(p);
      d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      rest = 0;
    }
    rest += d;
    p = q;
  }
  while (aus.length < n) aus.push([...punkte[punkte.length - 1]]);
  return aus;
}

/** auf das Begrenzungsquadrat normieren (gleiche Skalierung in x und y, mittig), damit „I“ schmal bleibt */
export function normieren(punkte) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of punkte) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const s = Math.max(x1 - x0, y1 - y0) || 1, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  return punkte.map(([x, y]) => [(x - mx) / s, (y - my) / s]);
}

export const vorbereiten = (punkte) => normieren(nachziehen(punkte));

function abstand(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
  return d / a.length;
}

const VORLAGEN = {
  links: [...Object.entries({ ...BUCHSTABEN, ...GESTEN }), ...Object.entries(ZWEITFORMEN)].map(([z, p]) => [z, vorbereiten(p)]),
  rechts: Object.entries({ ...ZIFFERN, ...GESTEN }).map(([z, p]) => [z, vorbereiten(p)]),
};

/** Ein Strich → { zeichen, abstand } oder { zeichen: null } wenn zu unsicher. feld: 'links' (Buchstaben) | 'rechts' (Ziffern) */
export function erkenne(punkte, feld = 'links', grenze = GRENZE) {
  let w = 0, h = 0;
  const xs = punkte.map((p) => p[0]), ys = punkte.map((p) => p[1]);
  w = Math.max(...xs) - Math.min(...xs); h = Math.max(...ys) - Math.min(...ys);
  if (Math.max(w, h) < 12) return { zeichen: 'tipp', abstand: 0 };   // kurzer Tipp (Pixel): Umlaut bzw. Punkt
  const s = vorbereiten(punkte);
  let best = null, bestD = Infinity;
  for (const [z, v] of VORLAGEN[feld]) {
    const d = abstand(s, v);
    if (d < bestD) { bestD = d; best = z; }
  }
  return bestD <= grenze ? { zeichen: best, abstand: bestD } : { zeichen: null, abstand: bestD };
}

/** Text weiterschreiben: Zeichen, Löschen, Tipp (Umlaut nach A/O/U/S, sonst Punkt) */
export function schreibe(text, zeichen) {
  if (!zeichen) return text;
  if (zeichen === '⌫') return text.slice(0, -1);
  if (zeichen === 'tipp') {
    const l = text.slice(-1);
    return UMLAUT[l] ? text.slice(0, -1) + UMLAUT[l] : text + '.';
  }
  return text + zeichen;
}

/** Alphabet als Datei für die Karte: je Zeile „feld zeichen x,y x,y …“ (vorbereitet, N Punkte, ×1000 ganzzahlig) */
/** Reihenfolge im Glyphenblatt (zeichen.bin); „_“ steht in der Datei für das Leerzeichen */
export const GLYPHEN = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜß0123456789', ' ', '.'];
export function alphabetDatei() {
  const zeilen = [`n ${N}`, `grenze ${GRENZE}`, `glyphen ${GLYPHEN.map((g) => (g === ' ' ? '_' : g)).join(' ')}`,
    ...Object.entries(UMLAUT).map(([a, b]) => `umlaut ${a} ${b}`)];
  for (const [feld, liste] of Object.entries(VORLAGEN)) {
    for (const [z, p] of liste) zeilen.push(`${feld} ${z === ' ' ? 'leer' : z === '⌫' ? 'weg' : z} ${p.map(([x, y]) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`).join(' ')}`);
  }
  return new TextEncoder().encode(zeilen.join('\n') + '\n');
}

// ---- Bilder für den Sticky (Braun-Schrift), FW ≥ 0.27.0 --------------------------------------------------------------
export const ZELLE = { w: 32, h: 48 };   // wie SCH_ZW × SCH_ZH in firmware-ble/schrift.h
const leinwand = (b, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b, h) : Object.assign(document.createElement('canvas'), { width: b, height: h }));

/** Glyphenblatt: alle GLYPHEN nebeneinander, je Zelle 32 × 48, 1 bpp */
export function glyphenBlatt() {
  const { w, h } = ZELLE, n = GLYPHEN.length;
  const c = leinwand(n * w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, n * w, h);
  g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  GLYPHEN.forEach((z, i) => {
    let gr = 38;
    do { g.font = `500 ${gr}px ${BRAUN_FONT}`; gr -= 1; } while (g.measureText(z).width > w - 2 && gr > 20);
    g.fillText(z, i * w + w / 2, h - 10);
  });
  return rgbaZu1bpp(g.getImageData(0, 0, n * w, h).data, n * w, h);
}

/** Hintergrund quer: Anzeige-Fenster für den Text, Schreibfeld links Buchstaben, rechts Ziffern */
export function schriftHintergrund() {
  const c = leinwand(BREITE, HOEHE);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, BREITE, HOEHE);
  g.strokeStyle = '#000'; g.fillStyle = '#000';
  g.lineWidth = 3; g.strokeRect(9, 63, 786, 69);                 // Fenster wie beim Braun-LCD (Text: x 16–792, y 68–124)
  g.lineWidth = 2;
  g.setLineDash([6, 6]); g.beginPath(); g.moveTo(560, 146); g.lineTo(560, HOEHE - 32); g.stroke(); g.setLineDash([]);
  g.font = `400 20px ${BRAUN_FONT}`; g.textBaseline = 'top';
  g.textAlign = 'left'; g.fillText('ABC', 16, 146);
  g.textAlign = 'right'; g.fillText('123', BREITE - 16, 146);
  g.font = `400 16px ${BRAUN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText(T('ein Strich je Zeichen · → Leerzeichen · ← löschen · Tipp = Umlaut / Punkt · ▲+▼ Alphabet',
    'one stroke per letter · → space · ← delete · tap = umlaut / dot · ▲+▼ alphabet'), BREITE / 2, HOEHE - 6);
  return rgbaZu1bpp(g.getImageData(0, 0, BREITE, HOEHE).data);
}

/** Hilfe-Seite: das Alphabet als Spickzettel, jeder Strich mit Startpunkt */
export function schriftHilfe() {
  const c = leinwand(BREITE, HOEHE);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, BREITE, HOEHE);
  g.fillStyle = '#000'; g.strokeStyle = '#000';
  g.font = `500 24px ${BRAUN_FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(T('Hilfe · Strichschrift', 'Help · Writing'), 16, 20);   // englisch kurz: ab x 230 folgt die Zeile rechts
  g.font = `400 15px ${BRAUN_FONT}`;
  g.fillText(T('Punkt = Anfang, Pfeil = Richtung · ² = geht auch · beliebige Taste schließt', 'dot = start, arrow = direction · ² = also works · any key closes'), 230, 21);
  const alle = [...Object.entries(BUCHSTABEN), ...Object.entries(ZWEITFORMEN).map(([z, p]) => [`${z}²`, p]), ...Object.entries(ZIFFERN),
    [T('→ Leer', '→ space'), GESTEN[' ']], [T('← weg', '← del'), GESTEN['⌫']]];
  const sp = 10, zw = (BREITE - 16) / sp, zh = (HOEHE - 44) / Math.ceil(alle.length / sp);
  alle.forEach(([z, p], i) => {
    const x = 8 + (i % sp) * zw, y = 40 + Math.floor(i / sp) * zh;
    g.font = `500 18px ${BRAUN_FONT}`; g.textBaseline = 'top'; g.fillText(z, x + 4, y + 2);
    const s = Math.min(zw, zh) - 34, ox = x + (zw - s) / 2 + 8, oy = y + 26;
    g.lineWidth = 3; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); p.forEach(([px, py], k) => (k ? g.lineTo(ox + px * s, oy + py * s) : g.moveTo(ox + px * s, oy + py * s))); g.stroke();
    g.beginPath(); g.arc(ox + p[0][0] * s, oy + p[0][1] * s, 5, 0, Math.PI * 2); g.fill();
    const [ax, ay] = p[p.length - 2], [bx, by] = p[p.length - 1], w = Math.atan2(by - ay, bx - ax);   // Pfeil = Richtung
    g.beginPath();
    for (const d of [2.6, -2.6]) { g.moveTo(ox + bx * s, oy + by * s); g.lineTo(ox + bx * s + 9 * Math.cos(w + d), oy + by * s + 9 * Math.sin(w + d)); }
    g.stroke();
  });
  return rgbaZu1bpp(g.getImageData(0, 0, BREITE, HOEHE).data);
}
