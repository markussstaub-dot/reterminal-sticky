// Lage je Seite (SPEC „Hoch/Quer in zwei Stufen“, Stufe 1): Seiten werden logisch gezeichnet (quer 800 × 480 oder
// hochkant 480 × 800) und für das Display gedreht. Hochkant: logisch (lx, ly) ↔ Display (ly, 479 − lx), wie bei Home.

export const LAGE_STANDARD = { menue: 'quer', timer: 'quer', wecker: 'quer', weltzeit: 'quer', waage: 'quer', rechner: 'hoch', umrechner: 'hoch', app: 'hoch', kritzel: 'quer' };
export const LAGE_NAMEN = { menue: 'Menü', timer: 'Timer', wecker: 'Wecker', weltzeit: 'Weltzeit', waage: 'Wasserwaage', rechner: 'Rechner', umrechner: 'Umrechner', app: 'App-Seite', kritzel: 'Kritzelblock' };

/** logische Größe */
export const groesse = (hoch) => (hoch ? { w: 480, h: 800 } : { w: 800, h: 480 });

/** logisches Rechteck → Display-Rechteck */
export const zuDisplay = (r, hoch) => (hoch ? { x: r.y, y: 480 - r.x - r.w, w: r.h, h: r.w } : { ...r });

/** Display-Punkt (Touch) → logisch */
export const vonDisplay = (x, y, hoch) => (hoch ? { x: 479 - y, y: x } : { x, y });

/** logischer Punkt → Display */
export const punktZuDisplay = (x, y, hoch) => (hoch ? { x: y, y: 479 - x } : { x, y });

const leinwand = (b, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b, h) : Object.assign(document.createElement('canvas'), { width: b, height: h }));

/** logische Leinwand → Display-Leinwand 800 × 480 (bei quer unverändert) */
export function aufsDisplay(c, hoch) {
  if (!hoch) return c;
  const d = leinwand(800, 480);
  const g = d.getContext('2d', { willReadFrequently: true });
  g.translate(0, 480);
  g.rotate(-Math.PI / 2);
  g.drawImage(c, 0, 0);
  return d;
}

/** Ausschnitt einer logischen Leinwand → Display-Leinwand dieses Ausschnitts (für Teilbilder) */
export function ausschnittAufsDisplay(c, r, hoch) {
  const d = zuDisplay(r, hoch);
  const z = leinwand(d.w, d.h);
  const g = z.getContext('2d', { willReadFrequently: true });
  if (hoch) { g.translate(0, d.h); g.rotate(-Math.PI / 2); }
  g.drawImage(c, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return { canvas: z, bereich: d };
}

/** Display-Bild eines hochkant gemalten Kritzels → logisch 480 × 800 */
export function vomDisplay(c) {
  const z = leinwand(480, 800);
  const g = z.getContext('2d');
  g.translate(480, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(c, 0, 0);
  return z;
}
