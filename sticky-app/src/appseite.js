// App-Seite im Karussell (SPEC „Widgets ohne ständiges Flashen“, FW ≥ 0.17.0): die App zeichnet, der Sticky zeigt und
// meldet Tipper. Widgets: Taschenrechner und Umrechner, ▲/▼ kurz wechselt. Quer 800 × 480, rechts oben bleibt die
// Statuszeile (288 × 32) frei. Nach einem Tipp geht nur das Nötige als Teilbild rüber.
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';
import { Rechner, TASTEN } from './rechner.js';
import { Umrechner, PAARE } from './umrechner.js';

const FONT = 'system-ui, sans-serif';
export const ANZEIGE = { x: 16, y: 66, w: 768, h: 80 };   // x und w Vielfache von 8 (Teil-Refresh)
const UNTEN = { x: 0, y: 64, w: 800, h: 416 };            // alles unter den Reitern
const leinwand = (b, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b, h) : Object.assign(document.createElement('canvas'), { width: b, height: h }));

function taste(g, x, y, w, h, t, dunkel, gr = 34) {
  g.lineWidth = 3;
  g.strokeStyle = '#000';
  g.fillStyle = dunkel ? '#000' : '#fff';
  g.beginPath();
  g.roundRect(x + 4, y + 4, w - 8, h - 8, 10);
  g.fill();
  g.stroke();
  g.fillStyle = dunkel ? '#fff' : '#000';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${gr}px ${FONT}`;
  g.fillText(t, x + w / 2, y + h / 2 + 2);
}

/** Kopf mit Reitern zum Antippen (▲/▼ blättern im Karussell wie überall) */
function kopf(g, aktiv) {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  REITER.forEach((r, i) => {
    g.fillStyle = i === aktiv ? '#000' : '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(r.x0, 2, r.x1 - r.x0 - 4, REITER_H - 4, 10);
    g.fill();
    g.stroke();
    g.fillStyle = i === aktiv ? '#fff' : '#000';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 28px ${FONT}`;
    g.fillText(r.text, (r.x0 + r.x1 - 4) / 2, REITER_H / 2 + 1);
  });
}

function anzeigeRahmen(g, oben, gross) {
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
  g.fillText(oben, x + 14, y + 20);
  g.textAlign = 'right';
  let gr = 56;
  do { g.font = `bold ${gr}px ${FONT}`; gr -= 4; } while (g.measureText(gross).width > w - 40 && gr > 24);
  g.fillText(gross, x + w - 18, y + h / 2 + 10);
}

// Reiter oben links, groß genug für Finger (13.11.2026: vorher 30 px hoch); rechts daneben ab x 512 die Statuszeile
const REITER = [{ x0: 16, x1: 256, text: 'Rechner' }, { x0: 264, x1: 504, text: 'Umrechner' }];
const REITER_H = 58;

// ---- Taschenrechner ---------------------------------------------------------------------------
const R_FELD = { x: 16, y: 154, w: 768, h: 320 };
export const rechnerWidget = {
  name: 'Rechner',
  neu() { return new Rechner(); },
  anzeige(g, r) { anzeigeRahmen(g, r.zeile, r.anzeige); },
  seite(g, r) {
    kopf(g, 0);
    this.anzeige(g, r);
    const tw = R_FELD.w / 4, th = R_FELD.h / TASTEN.length;
    TASTEN.forEach((zeile, ze) => zeile.forEach((t, sp) => taste(g, R_FELD.x + sp * tw, R_FELD.y + ze * th, tw, th, t, /[÷×−+=]/.test(t), t.length > 1 ? 26 : 34)));
  },
  /** → 'anzeige' | 'seite' | null */
  tipp(r, x, y) {
    if (x < R_FELD.x || x >= R_FELD.x + R_FELD.w || y < R_FELD.y || y >= R_FELD.y + R_FELD.h) return null;
    const t = TASTEN[Math.floor((y - R_FELD.y) / (R_FELD.h / TASTEN.length))]?.[Math.floor((x - R_FELD.x) / (R_FELD.w / 4))];
    if (!t) return null;
    r.taste(t);
    return 'anzeige';
  },
};

// ---- Umrechner --------------------------------------------------------------------------------
const U_LISTE = { x: 16, y: 154, w: 248, h: 320 };   // zwei Spalten à 4 Einheitenpaare
const U_FELD = { x: 272, y: 154, w: 512, h: 320 };
const U_TASTEN = [['7', '8', '9', '⌫'], ['4', '5', '6', 'C'], ['1', '2', '3', '⇄'], ['±', '0', ',', '']];
export const umrechnerWidget = {
  name: 'Umrechner',
  neu() { return new Umrechner(); },
  anzeige(g, u) { anzeigeRahmen(g, `${u.von} → ${u.nach}`, `${u.eingabe} ${u.von} = ${u.ergebnis} ${u.nach}`); },
  seite(g, u) {
    kopf(g, 1);
    this.anzeige(g, u);
    const lw = U_LISTE.w / 2, lh = U_LISTE.h / Math.ceil(PAARE.length / 2);
    PAARE.forEach((p, i) => taste(g, U_LISTE.x + (i % 2) * lw, U_LISTE.y + Math.floor(i / 2) * lh, lw, lh, `${p.a}↔${p.b}`, i === u.paar, 23));
    const tw = U_FELD.w / 4, th = U_FELD.h / U_TASTEN.length;
    U_TASTEN.forEach((zeile, ze) => zeile.forEach((t, sp) => { if (t) taste(g, U_FELD.x + sp * tw, U_FELD.y + ze * th, tw, th, t, t === '⇄'); }));
  },
  tipp(u, x, y) {
    if (x >= U_LISTE.x && x < U_LISTE.x + U_LISTE.w && y >= U_LISTE.y && y < U_LISTE.y + U_LISTE.h) {
      const sp = Math.floor((x - U_LISTE.x) / (U_LISTE.w / 2)), ze = Math.floor((y - U_LISTE.y) / (U_LISTE.h / Math.ceil(PAARE.length / 2)));
      u.waehle(ze * 2 + sp);
      return 'seite';
    }
    if (x < U_FELD.x || x >= U_FELD.x + U_FELD.w || y < U_FELD.y || y >= U_FELD.y + U_FELD.h) return null;
    const t = U_TASTEN[Math.floor((y - U_FELD.y) / (U_FELD.h / U_TASTEN.length))]?.[Math.floor((x - U_FELD.x) / (U_FELD.w / 4))];
    if (!t) return null;
    u.taste(t);
    return 'anzeige';
  },
};

export class AppSeite {
  /** senden(bytes, bereich|null): ganzes Bild oder Teilbild an den Sticky */
  constructor(senden) {
    this.senden = senden;
    this.widgets = [rechnerWidget, umrechnerWidget];
    this.zustand = this.widgets.map((w) => w.neu());
    this.aktiv = 0;
  }

  get w() { return this.widgets[this.aktiv]; }
  get z() { return this.zustand[this.aktiv]; }

  #ausschnitt(b) {
    const c = leinwand(b.w, b.h);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.translate(-b.x, -b.y);
    if (b === ANZEIGE) this.w.anzeige(g, this.z); else this.w.seite(g, this.z);
    return rgbaZu1bpp(g.getImageData(0, 0, b.w, b.h).data, b.w, b.h);
  }

  /** ganze Seite → { bytes, canvas } */
  seite() {
    const c = leinwand(BREITE, HOEHE);
    const g = c.getContext('2d', { willReadFrequently: true });
    this.w.seite(g, this.z);
    return { bytes: rgbaZu1bpp(g.getImageData(0, 0, BREITE, HOEHE).data), canvas: c };
  }

  async zeigen() { await this.senden(this.seite().bytes, null); }

  /** ▲ (−1) / ▼ (+1): anderes Widget */
  async wechseln(richtung) {
    this.aktiv = (this.aktiv + richtung + this.widgets.length) % this.widgets.length;
    await this.zeigen();
  }

  /** Tipper vom Sticky (Display-Koordinaten); true, wenn etwas getroffen wurde */
  async tipp(x, y) {
    const reiter = y < REITER_H ? REITER.findIndex((r) => x >= r.x0 && x < r.x1) : -1;
    if (reiter >= 0) {
      if (reiter !== this.aktiv) { this.aktiv = reiter; await this.zeigen(); }
      return true;
    }
    const was = this.w.tipp(this.z, x, y);
    if (was === 'anzeige') await this.senden(this.#ausschnitt(ANZEIGE), ANZEIGE);
    else if (was === 'seite') await this.senden(this.#ausschnitt(UNTEN), UNTEN);
    return !!was;
  }
}
