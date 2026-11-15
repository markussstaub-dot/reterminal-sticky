// Spielseite im Karussell (SPEC „Widgets ohne ständiges Flashen“, FW ≥ 0.17.0): die App zeichnet, der Sticky zeigt und
// meldet Tipper. Seit 15.11.2026 nur noch das Burgduell (Rechner/Umrechner sind eigene Widgets). Quer 800 × 480, rechts oben bleibt die
// Statuszeile (288 × 32) frei. Nach einem Tipp geht nur das Nötige als Teilbild rüber.
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';
import { braunKnopf } from './braun.js';
import { groesse, vonDisplay, aufsDisplay, ausschnittAufsDisplay } from './lage.js';
import { burgduellWidget } from './burgduell.js';
import { frageZeichnen, frageTreffer } from './rueckfrage.js';
import { T, fuerSticky } from './uebersetzen.js';

const reiter = (x0, x1) => ({ x0, x1, get text() { return T('Burgduell', 'Castle Duel'); } });   // Text erst beim Zeichnen
// Maße je Lage (logisch). Teil-Refresh: auf dem Display x und w Vielfache von 8 (hochkant: logisch y und h).
// Quer: Reiter oben links, rechts ab x 512 die Statuszeile. Hochkant: Statuszeile oben rechts (x 192–480, y 0–32),
// darunter die Reiter über die ganze Breite.
const LAGEN = {
  quer: {
    REITER: [reiter(16, 176)], REITER_Y: 0, REITER_H: 58,
    ANZEIGE: { x: 16, y: 66, w: 768, h: 80 }, UNTEN: { x: 0, y: 64, w: 800, h: 416 },
  },
  hoch: {
    REITER: [reiter(16, 164)], REITER_Y: 38, REITER_H: 58,
    ANZEIGE: { x: 16, y: 104, w: 448, h: 96 }, UNTEN: { x: 0, y: 104, w: 480, h: 696 },
  },
};
let L = LAGEN.quer;
const leinwand = (b, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b, h) : Object.assign(document.createElement('canvas'), { width: b, height: h }));

/** Kopf mit Reitern zum Antippen (▲/▼ blättern im Karussell wie überall); aktiver Reiter schwarz, sonst dünner Ring */
function kopf(g, aktiv) {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 800, 800);
  const { REITER, REITER_Y, REITER_H } = L;
  REITER.forEach((r, i) => braunKnopf(g, r.x0, REITER_Y, r.x1 - r.x0, REITER_H, r.text, i === aktiv ? 'wahl' : 'neben', { rand: 3, gr: 24 }));
}

// Reiter groß genug für Finger (13.11.2026: vorher 30 px hoch)

export class AppSeite {
  /** senden(bytes, bereich|null): ganzes Bild oder Teilbild an den Sticky */
  constructor(senden) {
    this.senden = senden;
    // Nur noch Burgduell (15.11.2026, SPEC „Blick von außen“): Rechner und Umrechner sind eigene Widgets, die ohne
    // Handy laufen – doppelt auf der Spielseite verwirrte nur.
    this.widgets = [burgduellWidget((g) => kopf(g, 0))];
    this.zustand = this.widgets.map((w) => w.neu());
    this.aktiv = 0;
    this.hoch = false;   // Lage (Mehr → Lage der Seiten), FW ≥ 0.21.0
    this.spieler = 0;    // Burgduell auf zwei Stickys: 0 = aktiver, 1 = Hintergrund-Sticky
    this.frage = null;   // Rückfrage der App (src/rueckfrage.js): { art, text, antworten?, antwort(wert) } – geht dem Spiel vor
  }

  #lage() { L = this.hoch ? LAGEN.hoch : LAGEN.quer; return groesse(this.hoch); }

  /** Zeichnen in der Sprache des Ziel-Sticky (Hintergrund-Sticky: seine gemeldete, sonst die des verbundenen) */
  #sprache(fn) { return fuerSticky(fn, this.sitzung?.z?.geraet?.en ?? null); }

  get w() { return this.widgets[this.aktiv]; }
  get z() { return this.zustand[this.aktiv]; }

  /** Teilbild: logischen Bereich zeichnen, fürs Display drehen → { bytes, bereich } in Display-Koordinaten */
  #ausschnitt(welcher) {
    const { w: lw, h: lh } = this.#lage();
    const b = L[welcher];
    const c = leinwand(lw, lh);
    const g = c.getContext('2d', { willReadFrequently: true });
    this.#sprache(() => { if (welcher === 'ANZEIGE') this.w.anzeige(g, this.z); else this.w.seite(g, this.z, this.hoch); });
    const { canvas: d, bereich } = ausschnittAufsDisplay(c, b, this.hoch);
    return { bytes: rgbaZu1bpp(d.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, bereich.w, bereich.h).data, bereich.w, bereich.h), bereich };
  }

  /** ganze Seite → { bytes, canvas } (canvas schon fürs Display gedreht) */
  seite() {
    const { w, h } = this.#lage();
    const c = leinwand(w, h);
    const g = c.getContext('2d', { willReadFrequently: true });
    this.#sprache(() => (this.frage ? frageZeichnen(g, this.frage, this.hoch) : this.w.seite(g, this.z, this.hoch)));
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
    if (this.frage) {
      const f = this.frage, k = this.#sprache(() => frageTreffer(f, dx, dy, this.hoch));
      if (!k) return false;
      this.frage = null;
      await f.antwort(k.wert);
      return true;
    }
    const { x, y } = vonDisplay(dx, dy, this.hoch);
    const reiter = y >= L.REITER_Y && y < L.REITER_Y + L.REITER_H ? L.REITER.findIndex((r) => x >= r.x0 && x < r.x1) : -1;
    if (reiter >= 0) {
      if (reiter !== this.aktiv) { this.aktiv = reiter; await this.zeigen(); }
      return true;
    }
    const was = this.w.tipp(this.z, x, y, this.hoch, this.spieler);
    if (was) { const t = this.#ausschnitt(was === 'anzeige' ? 'ANZEIGE' : 'UNTEN'); await this.senden(t.bytes, t.bereich); }
    // Burgduell: der Computer antwortet mit kurzer Pause, damit man den eigenen Schuss erst sieht
    while (this.w.nachzugBereit?.(this.z)) {
      await new Promise((r) => setTimeout(r, 1500));
      if (!this.w.nachzug(this.z)) break;
      const t = this.#ausschnitt('UNTEN');
      await this.senden(t.bytes, t.bereich);
    }
    return !!was;
  }
}
