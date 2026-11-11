// Seite „Fahrt“ für den Sticky (SPEC „MVP 1“), **hochkant**: 5 breite Notiz-Streifen untereinander.
// Lage (Markus, 11.11.2026): Sticky aus der Querlage (USB oben rechts) im Uhrzeigersinn gedreht → Tasten oben rechts,
// USB unten. Die App zeichnet hochkant (480×800) und dreht das Bild fürs Display (800×480); der Sticky meldet
// Touch weiter in Display-Koordinaten, die App rechnet zurück. Die Firmware merkt davon nichts.
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';

export const STANDARD_KNOEPFE = ['Bug', 'Erkennung falsch', 'Ampel', 'holprig', 'Merken'];
export const PB = HOEHE, PH = BREITE;   // Hochkant: 480 breit, 800 hoch

// Streifen in Hochkant-Koordinaten
const STREIFEN = [0, 1, 2, 3, 4].map((i) => ({ x: 14, y: 84 + i * 120, w: PB - 28, h: 108 }));
/** Rückmeldefeld hochkant; gedreht muss es auf dem Display bei x/w Vielfachen von 8 liegen */
const RUECK_HOCH = { x: 16, y: 720, w: 448, h: 64 };

/** Hochkant-Punkt → Display (quer) und zurück. Display (x, y) = hochkant (479 − y, x) */
export const zuHochkant = (x, y) => ({ x: PB - 1 - y, y: x });

const leinwand = (b, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b, h) : Object.assign(document.createElement('canvas'), { width: b, height: h }));

/** Hochkant gezeichnete Fläche gegen den Uhrzeigersinn drehen, damit sie auf dem quer eingebauten Display richtig steht */
export function drehe(quelle, ziel, b, h) {
  ziel.save();
  ziel.translate(0, b);
  ziel.rotate(-Math.PI / 2);
  ziel.drawImage(quelle, 0, 0, b, h);
  ziel.restore();
}

function passeText(g, text, maxB, start) {
  let gr = start;
  do { g.font = `bold ${gr}px system-ui, sans-serif`; gr -= 2; } while (g.measureText(text).width > maxB && gr > 18);
}

/** Zeichnet die Fahrt-Seite (gedreht) in den 800×480-Kontext g */
export function zeichneFahrt(g, knoepfe = STANDARD_KNOEPFE) {
  const c = leinwand(PB, PH);
  const p = c.getContext('2d');
  p.fillStyle = '#fff';
  p.fillRect(0, 0, PB, PH);
  p.fillStyle = '#000';
  p.fillRect(0, 0, PB, 66);
  p.fillStyle = '#fff';
  p.textBaseline = 'middle';
  p.textAlign = 'left';
  p.font = 'bold 32px system-ui, sans-serif';
  p.fillText('Fahrt · Notiz', 18, 34);
  STREIFEN.forEach((k, i) => {
    const t = knoepfe[i];
    if (!t) return;
    p.strokeStyle = '#000';
    p.lineWidth = 5;
    p.beginPath();
    p.roundRect(k.x, k.y, k.w, k.h, 18);
    p.stroke();
    p.fillStyle = '#000';
    p.textAlign = 'center';
    passeText(p, t, k.w - 40, 50);
    p.fillText(t, k.x + k.w / 2, k.y + k.h / 2 + 2);
  });
  p.textAlign = 'center';
  p.font = '22px system-ui, sans-serif';
  p.fillStyle = '#000';
  p.fillText('KI halten = Diktat · ▲ 1 s = Bordbuch', PB / 2, 698);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  drehe(c, g, PB, PH);
}

/** Welcher Knopf liegt unter dem Touch-Punkt (Display-Koordinaten)? → Index oder -1 */
export function trefferKnopf(x, y, knoepfe = STANDARD_KNOEPFE) {
  const h = zuHochkant(x, y);
  return STREIFEN.findIndex((k, i) => knoepfe[i] && h.x >= k.x && h.x < k.x + k.w && h.y >= k.y && h.y < k.y + k.h);
}

/** Rückmeldung „✓ Bug 14:32“ als gedrehtes 1-bpp-Teilbild (Bytes + Display-Bereich) */
export function rueckmeldung(text) {
  const { w, h } = RUECK_HOCH;
  const c = leinwand(w, h);
  const p = c.getContext('2d');
  p.fillStyle = '#000';
  p.beginPath();
  p.roundRect(0, 0, w, h, 12);
  p.fill();
  p.fillStyle = '#fff';
  p.textBaseline = 'middle';
  p.textAlign = 'center';
  let gr = 30;
  do { p.font = `bold ${gr}px system-ui, sans-serif`; gr -= 2; } while (p.measureText(text).width > w - 20 && gr > 14);
  p.fillText(text, w / 2, h / 2 + 1);
  // gedreht: Breite und Höhe tauschen
  const d = leinwand(h, w);
  const q = d.getContext('2d');
  q.fillStyle = '#fff';
  q.fillRect(0, 0, h, w);
  drehe(c, q, w, h);
  // Lage auf dem Display: x = hochkant-y, y = 480 − (hochkant-x + Breite)
  const bereich = { x: RUECK_HOCH.y, y: HOEHE - RUECK_HOCH.x - w, w: h, h: w };
  return { bytes: rgbaZu1bpp(q.getImageData(0, 0, h, w).data, h, w), bereich };
}

/** Streifen als Text für den Offline-Betrieb („e x0 y0 x1 y1 Name“ in Display-Koordinaten) */
export function layoutText(knoepfe = STANDARD_KNOEPFE) {
  return STREIFEN.map((k, i) => {
    if (!knoepfe[i]) return null;
    // hochkant (x, y, w, h) → Display: x = hochkant-y, y = 480 − hochkant-x
    const name = knoepfe[i].replace(/["\\\r\n]/g, "'").slice(0, 23);
    return `e ${k.y} ${HOEHE - (k.x + k.w)} ${k.y + k.h} ${HOEHE - k.x} ${name}`;
  }).filter(Boolean).join('\n') + '\n';
}
