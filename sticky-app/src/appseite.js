// App-Seite im Karussell (SPEC „Widgets ohne ständiges Flashen“, FW ≥ 0.17.0): die App zeichnet, der Sticky zeigt und
// meldet Tipper. Erstes Widget: Taschenrechner. Quer 800 × 480, rechts oben bleibt die Statuszeile (288 × 32) frei.
// Nach dem Tippen geht nur das Anzeigefeld als Teilbild rüber (schneller als die ganze Seite).
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';
import { Rechner, TASTEN } from './rechner.js';

const FONT = 'system-ui, sans-serif';
export const ANZEIGE = { x: 16, y: 40, w: 768, h: 88 };   // x und w Vielfache von 8 (Teil-Refresh)
const FELD = { x: 16, y: 140, w: 768, h: 332 };
const leinwand = (b, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b, h) : Object.assign(document.createElement('canvas'), { width: b, height: h }));

/** Welche Taste liegt unter (x, y)? → Zeichen oder null */
export function tasteBei(x, y) {
  if (x < FELD.x || x >= FELD.x + FELD.w || y < FELD.y || y >= FELD.y + FELD.h) return null;
  const sp = Math.floor((x - FELD.x) / (FELD.w / 4)), ze = Math.floor((y - FELD.y) / (FELD.h / TASTEN.length));
  return TASTEN[ze]?.[sp] ?? null;
}

function anzeigeZeichnen(g, r) {
  const { x, y, w, h } = ANZEIGE;
  g.fillStyle = '#fff';
  g.fillRect(x, y, w, h);
  g.strokeStyle = '#000';
  g.lineWidth = 4;
  g.strokeRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle = '#000';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = `20px ${FONT}`;
  g.fillText(r.zeile, x + 14, y + 20);
  g.textAlign = 'right';
  let gr = 56;
  do { g.font = `bold ${gr}px ${FONT}`; gr -= 4; } while (g.measureText(r.anzeige).width > w - 40 && gr > 24);
  g.fillText(r.anzeige, x + w - 18, y + h / 2 + 10);
}

export class AppSeite {
  /** senden(bytes, bereich|null): ganzes Bild oder Teilbild an den Sticky */
  constructor(senden) {
    this.senden = senden;
    this.r = new Rechner();
  }

  /** ganze Seite (beim Betreten) */
  seite() {
    const c = leinwand(BREITE, HOEHE);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff';
    g.fillRect(0, 0, BREITE, HOEHE);
    g.fillStyle = '#000';
    g.textBaseline = 'middle';
    g.font = `bold 24px ${FONT}`;
    g.fillText('Rechner', 16, 18);
    g.font = `16px ${FONT}`;
    g.fillText('▼ 1 s = weiter · KI = Home', 130, 19);
    anzeigeZeichnen(g, this.r);
    const tw = FELD.w / 4, th = FELD.h / TASTEN.length;
    TASTEN.forEach((zeile, ze) => zeile.forEach((t, sp) => {
      const x = FELD.x + sp * tw, y = FELD.y + ze * th;
      const op = /[÷×−+=]/.test(t);
      g.lineWidth = 3;
      g.strokeStyle = '#000';
      g.fillStyle = op ? '#000' : '#fff';
      g.beginPath();
      g.roundRect(x + 4, y + 4, tw - 8, th - 8, 10);
      g.fill();
      g.stroke();
      g.fillStyle = op ? '#fff' : '#000';
      g.textAlign = 'center';
      g.font = `bold ${t.length > 1 ? 26 : 34}px ${FONT}`;
      g.fillText(t, x + tw / 2, y + th / 2 + 2);
    }));
    return { bytes: rgbaZu1bpp(g.getImageData(0, 0, BREITE, HOEHE).data), canvas: c };
  }

  /** nur das Anzeigefeld */
  anzeige() {
    const c = leinwand(ANZEIGE.w, ANZEIGE.h);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.translate(-ANZEIGE.x, -ANZEIGE.y);
    anzeigeZeichnen(g, this.r);
    return rgbaZu1bpp(g.getImageData(0, 0, ANZEIGE.w, ANZEIGE.h).data, ANZEIGE.w, ANZEIGE.h);
  }

  async zeigen() { await this.senden(this.seite().bytes, null); }

  /** Tipper vom Sticky (Display-Koordinaten); true, wenn eine Taste getroffen wurde */
  async tipp(x, y) {
    const t = tasteBei(x, y);
    if (!t) return false;
    this.r.taste(t);
    await this.senden(this.anzeige(), ANZEIGE);
    return true;
  }
}
