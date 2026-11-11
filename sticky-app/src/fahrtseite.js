// Seite „Fahrt“ für den Sticky (SPEC „MVP 1“): 5 große Schnellknöpfe, unten rechts Platz für die Rückmeldung.
// Die App zeichnet die Seite (Zwilling), der Sticky zeigt sie nur und meldet Touch-Koordinaten zurück.
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';

export const STANDARD_KNOEPFE = ['Bug', 'Erkennung falsch', 'Ampel', 'holprig', 'Merken'];

// Kacheln: oben drei, unten zwei; rechts unten Hinweis + Rückmeldefeld
const KACHELN = [
  { x: 12, y: 76, w: 252, h: 188 }, { x: 274, y: 76, w: 252, h: 188 }, { x: 536, y: 76, w: 252, h: 188 },
  { x: 12, y: 276, w: 252, h: 192 }, { x: 274, y: 276, w: 252, h: 192 },
];
/** Rückmeldefeld (x und w Vielfache von 8, damit es als Teilbild passt) */
export const RUECKMELDUNG = { x: 544, y: 400, w: 240, h: 64 };

function passeText(g, text, maxB, start) {
  let gr = start;
  do { g.font = `bold ${gr}px system-ui, sans-serif`; gr -= 2; } while (g.measureText(text).width > maxB && gr > 18);
}

/** Zeichnet die Fahrt-Seite in einen 2D-Kontext (800×480) */
export function zeichneFahrt(g, knoepfe = STANDARD_KNOEPFE) {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  g.fillStyle = '#000';
  g.fillRect(0, 0, BREITE, 62);
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = 'bold 32px system-ui, sans-serif';
  g.fillText('Fahrt · Testnotiz', 20, 32);
  g.textAlign = 'right';
  g.font = '22px system-ui, sans-serif';
  g.fillText('tippen = Notiz', BREITE - 20, 32);
  KACHELN.forEach((k, i) => {
    const t = knoepfe[i];
    if (!t) return;
    g.fillStyle = '#000';
    g.beginPath();
    g.roundRect(k.x, k.y, k.w, k.h, 18);
    g.lineWidth = 5;
    g.stroke();
    g.textAlign = 'center';
    passeText(g, t, k.w - 30, 48);
    // Zwei Wörter dürfen umbrechen
    const woerter = t.split(' ');
    if (woerter.length > 1 && g.measureText(t).width > k.w - 30) {
      passeText(g, woerter.reduce((a, b) => (a.length > b.length ? a : b)), k.w - 30, 44);
      g.fillText(woerter[0], k.x + k.w / 2, k.y + k.h / 2 - 26);
      g.fillText(woerter.slice(1).join(' '), k.x + k.w / 2, k.y + k.h / 2 + 26);
    } else {
      g.fillText(t, k.x + k.w / 2, k.y + k.h / 2);
    }
  });
  // Hinweis rechts unten
  g.textAlign = 'left';
  g.font = 'bold 26px system-ui, sans-serif';
  g.fillText('KI halten', 548, 300);
  g.font = '24px system-ui, sans-serif';
  g.fillText('= Diktat', 548, 334);
  g.fillText('▲ lang = Bordbuch', 548, 368);
}

/** Welcher Knopf liegt unter dem Touch-Punkt? → Index oder -1 */
export function trefferKnopf(x, y, knoepfe = STANDARD_KNOEPFE) {
  return KACHELN.findIndex((k, i) => knoepfe[i] && x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h);
}

/** Rückmeldung „✓ Bug 14:32“ als 1-bpp-Teilbild (Bytes + Bereich) */
export function rueckmeldung(text) {
  const { w, h } = RUECKMELDUNG;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.beginPath();
  g.roundRect(0, 0, w, h, 12);
  g.fill();
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  let gr = 28;
  do { g.font = `bold ${gr}px system-ui, sans-serif`; gr -= 2; } while (g.measureText(text).width > w - 16 && gr > 14);
  g.fillText(text, w / 2, h / 2 + 1);
  return { bytes: rgbaZu1bpp(g.getImageData(0, 0, w, h).data, w, h), bereich: { ...RUECKMELDUNG } };
}
