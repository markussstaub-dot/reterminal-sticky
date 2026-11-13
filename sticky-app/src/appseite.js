// App-Seite im Karussell (SPEC „Widgets ohne ständiges Flashen“, FW ≥ 0.17.0): die App zeichnet, der Sticky zeigt und
// meldet Tipper. Widgets: Taschenrechner und Umrechner, ▲/▼ kurz wechselt. Quer 800 × 480, rechts oben bleibt die
// Statuszeile (288 × 32) frei. Nach einem Tipp geht nur das Nötige als Teilbild rüber.
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';
import { Rechner, TASTEN } from './rechner.js';
import { Umrechner, PAARE } from './umrechner.js';
import { groesse, vonDisplay, aufsDisplay, ausschnittAufsDisplay } from './lage.js';

const FONT = 'system-ui, sans-serif';
// Maße je Lage (logisch). Teil-Refresh: auf dem Display x und w Vielfache von 8 (hochkant: logisch y und h).
// Quer: Reiter oben links, rechts ab x 512 die Statuszeile. Hochkant: Statuszeile oben rechts (x 192–480, y 0–32),
// darunter die Reiter über die ganze Breite.
const LAGEN = {
  quer: {
    REITER: [{ x0: 16, x1: 256, text: 'Rechner' }, { x0: 264, x1: 504, text: 'Umrechner' }], REITER_Y: 0, REITER_H: 58,
    ANZEIGE: { x: 16, y: 66, w: 768, h: 80 }, UNTEN: { x: 0, y: 64, w: 800, h: 416 },
    R_FELD: { x: 16, y: 154, w: 768, h: 320 },
    U_LISTE: { x: 16, y: 154, w: 248, h: 320 }, U_FELD: { x: 272, y: 154, w: 512, h: 320 },
  },
  hoch: {
    REITER: [{ x0: 16, x1: 240, text: 'Rechner' }, { x0: 244, x1: 468, text: 'Umrechner' }], REITER_Y: 38, REITER_H: 58,
    ANZEIGE: { x: 16, y: 104, w: 448, h: 96 }, UNTEN: { x: 0, y: 104, w: 480, h: 696 },
    R_FELD: { x: 16, y: 208, w: 448, h: 576 },
    U_LISTE: { x: 16, y: 208, w: 448, h: 232 }, U_FELD: { x: 16, y: 448, w: 448, h: 336 },
  },
};
let L = LAGEN.quer;
export const ANZEIGE = LAGEN.quer.ANZEIGE;
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
  g.fillRect(0, 0, 800, 800);
  const { REITER, REITER_Y, REITER_H } = L;
  REITER.forEach((r, i) => {
    g.fillStyle = i === aktiv ? '#000' : '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(r.x0, REITER_Y + 2, r.x1 - r.x0 - 4, REITER_H - 4, 10);
    g.fill();
    g.stroke();
    g.fillStyle = i === aktiv ? '#fff' : '#000';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 28px ${FONT}`;
    g.fillText(r.text, (r.x0 + r.x1 - 4) / 2, REITER_Y + REITER_H / 2 + 1);
  });
}

function anzeigeRahmen(g, oben, gross) {
  const { x, y, w, h } = L.ANZEIGE;
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

// Reiter groß genug für Finger (13.11.2026: vorher 30 px hoch)

// ---- Taschenrechner ---------------------------------------------------------------------------
export const rechnerWidget = {
  name: 'Rechner',
  neu() { return new Rechner(); },
  anzeige(g, r) { anzeigeRahmen(g, r.zeile, r.anzeige); },
  seite(g, r) {
    kopf(g, 0);
    this.anzeige(g, r);
    const { R_FELD } = L;
    const tw = R_FELD.w / 4, th = R_FELD.h / TASTEN.length;
    TASTEN.forEach((zeile, ze) => zeile.forEach((t, sp) => taste(g, R_FELD.x + sp * tw, R_FELD.y + ze * th, tw, th, t, /[÷×−+=]/.test(t), t.length > 1 ? 26 : 34)));
  },
  /** → 'anzeige' | 'seite' | null */
  tipp(r, x, y) {
    const { R_FELD } = L;
    if (x < R_FELD.x || x >= R_FELD.x + R_FELD.w || y < R_FELD.y || y >= R_FELD.y + R_FELD.h) return null;
    const t = TASTEN[Math.floor((y - R_FELD.y) / (R_FELD.h / TASTEN.length))]?.[Math.floor((x - R_FELD.x) / (R_FELD.w / 4))];
    if (!t) return null;
    r.taste(t);
    return 'anzeige';
  },
};

// ---- Umrechner --------------------------------------------------------------------------------
// Einheitenpaare in zwei Spalten, daneben (quer) bzw. darunter (hochkant) die Tasten
const U_TASTEN = [['7', '8', '9', '⌫'], ['4', '5', '6', 'C'], ['1', '2', '3', '⇄'], ['±', '0', ',', '']];
export const umrechnerWidget = {
  name: 'Umrechner',
  neu() { return new Umrechner(); },
  anzeige(g, u) { anzeigeRahmen(g, `${u.von} → ${u.nach}`, `${u.eingabe} ${u.von} = ${u.ergebnis} ${u.nach}`); },
  seite(g, u) {
    kopf(g, 1);
    this.anzeige(g, u);
    const { U_LISTE, U_FELD } = L;
    const lw = U_LISTE.w / 2, lh = U_LISTE.h / Math.ceil(PAARE.length / 2);
    PAARE.forEach((p, i) => taste(g, U_LISTE.x + (i % 2) * lw, U_LISTE.y + Math.floor(i / 2) * lh, lw, lh, `${p.a}↔${p.b}`, i === u.paar, 23));
    const tw = U_FELD.w / 4, th = U_FELD.h / U_TASTEN.length;
    U_TASTEN.forEach((zeile, ze) => zeile.forEach((t, sp) => { if (t) taste(g, U_FELD.x + sp * tw, U_FELD.y + ze * th, tw, th, t, t === '⇄'); }));
  },
  tipp(u, x, y) {
    const { U_LISTE, U_FELD } = L;
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
    this.hoch = false;   // Lage (Mehr → Lage der Seiten), FW ≥ 0.21.0
  }

  #lage() { L = this.hoch ? LAGEN.hoch : LAGEN.quer; return groesse(this.hoch); }

  get w() { return this.widgets[this.aktiv]; }
  get z() { return this.zustand[this.aktiv]; }

  /** Teilbild: logischen Bereich zeichnen, fürs Display drehen → { bytes, bereich } in Display-Koordinaten */
  #ausschnitt(welcher) {
    const { w: lw, h: lh } = this.#lage();
    const b = L[welcher];
    const c = leinwand(lw, lh);
    const g = c.getContext('2d', { willReadFrequently: true });
    if (welcher === 'ANZEIGE') this.w.anzeige(g, this.z); else this.w.seite(g, this.z);
    const { canvas: d, bereich } = ausschnittAufsDisplay(c, b, this.hoch);
    return { bytes: rgbaZu1bpp(d.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, bereich.w, bereich.h).data, bereich.w, bereich.h), bereich };
  }

  /** ganze Seite → { bytes, canvas } (canvas schon fürs Display gedreht) */
  seite() {
    const { w, h } = this.#lage();
    const c = leinwand(w, h);
    const g = c.getContext('2d', { willReadFrequently: true });
    this.w.seite(g, this.z);
    const d = aufsDisplay(c, this.hoch);
    return { bytes: rgbaZu1bpp(d.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, BREITE, HOEHE).data), canvas: d };
  }

  async zeigen() { await this.senden(this.seite().bytes, null); }

  /** ▲ (−1) / ▼ (+1): anderes Widget */
  async wechseln(richtung) {
    this.aktiv = (this.aktiv + richtung + this.widgets.length) % this.widgets.length;
    await this.zeigen();
  }

  /** Tipper vom Sticky (Display-Koordinaten); true, wenn etwas getroffen wurde */
  async tipp(dx, dy) {
    this.#lage();
    const { x, y } = vonDisplay(dx, dy, this.hoch);
    const reiter = y >= L.REITER_Y && y < L.REITER_Y + L.REITER_H ? L.REITER.findIndex((r) => x >= r.x0 && x < r.x1) : -1;
    if (reiter >= 0) {
      if (reiter !== this.aktiv) { this.aktiv = reiter; await this.zeigen(); }
      return true;
    }
    const was = this.w.tipp(this.z, x, y);
    if (was) { const t = this.#ausschnitt(was === 'anzeige' ? 'ANZEIGE' : 'UNTEN'); await this.senden(t.bytes, t.bereich); }
    return !!was;
  }
}
