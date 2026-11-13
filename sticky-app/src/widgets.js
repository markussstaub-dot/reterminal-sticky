// Widgets für die Widget-Maschine des Sticky (firmware-ble/widget.h, FW ≥ 0.18.0): die App zeichnet Hintergrund und Ziffern
// und beschreibt Felder und Knöpfe; der Sticky läuft danach ohne Handy. Ablage: /soll/widgets/<name>/.
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';

const FONT = 'system-ui, sans-serif';
const leinwand = (b, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b, h) : Object.assign(document.createElement('canvas'), { width: b, height: h }));

function knopf(g, x0, y0, x1, y1, text, dunkel = false, gr = 30) {
  g.lineWidth = 3;
  g.strokeStyle = '#000';
  g.fillStyle = dunkel ? '#000' : '#fff';
  g.beginPath();
  g.roundRect(x0 + 4, y0 + 4, x1 - x0 - 8, y1 - y0 - 8, 12);
  g.fill();
  g.stroke();
  g.fillStyle = dunkel ? '#fff' : '#000';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${gr}px ${FONT}`;
  g.fillText(text, (x0 + x1) / 2, (y0 + y1) / 2 + 2);
}

/** Ziffern 0–9 und „:“ nebeneinander, je Zelle w × h → 1 bpp */
function ziffernBlatt(w, h) {
  const c = leinwand(11 * w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 11 * w, h);
  g.fillStyle = '#000';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * 0.95)}px ${FONT}`;
  for (let i = 0; i <= 10; i++) g.fillText(i === 10 ? ':' : String(i), i * w + w / 2, h / 2 + h * 0.04);
  return rgbaZu1bpp(g.getImageData(0, 0, 11 * w, h).data, 11 * w, h);
}

/** Timer (Countdown): ▲/▼ = ±1 min, große Knöpfe zum Tippen, Vorlagen. → [{ n, daten }] mit felder.txt zuletzt */
export function timerWidget() {
  const Z = { w: 96, h: 144, x: 160, y: 60 };   // 5 Zellen „MM:SS“ = 480 px breit
  const felder = ['typ countdown', 'dauer 300', `ziffern ${Z.w} ${Z.h}`, `zeit ${Z.x} ${Z.y}`, 'taste up plus 60', 'taste down minus 60'];
  const c = leinwand(BREITE, HOEHE);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  g.fillStyle = '#000';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = `bold 24px ${FONT}`;
  g.fillText('Timer', 16, 18);
  g.font = `16px ${FONT}`;
  g.fillText('▲▼ = ±1 min · ▼ 1 s = weiter · KI = Home', 100, 19);
  const k = (x0, y0, x1, y1, text, aktion, dunkel, gr) => { knopf(g, x0, y0, x1, y1, text, dunkel, gr); felder.push(`knopf ${x0} ${y0} ${x1} ${y1} ${aktion}`); };
  k(16, 222, 208, 330, '− 1 min', 'minus 60');
  k(224, 222, 576, 330, 'Start / Stopp', 'start_stopp', true, 36);
  k(592, 222, 784, 330, '+ 1 min', 'plus 60');
  [[1, '1 min'], [3, '3'], [5, '5'], [10, '10'], [25, '25']].forEach(([m, t], i) => k(16 + i * 128, 346, 144 + i * 128, 464, t, `setze ${m * 60}`, false, 34));
  k(656, 346, 784, 464, 'Reset', 'reset', false, 28);
  return [
    { n: 'ziffern.bin', daten: ziffernBlatt(Z.w, Z.h) },
    { n: 'bild.bin', daten: rgbaZu1bpp(g.getImageData(0, 0, BREITE, HOEHE).data) },
    { n: 'felder.txt', daten: new TextEncoder().encode(felder.join('\n') + '\n') },
  ];
}

export const WIDGETS = { timer: timerWidget };
