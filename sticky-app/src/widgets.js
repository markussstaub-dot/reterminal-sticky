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

/** Ziffern 0–9, „:“ (und für die Waage „-“, „.“, „°“) nebeneinander, je Zelle w × h → 1 bpp */
function ziffernBlatt(w, h, zeichen = '0123456789:') {
  const n = zeichen.length;
  const c = leinwand(n * w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, n * w, h);
  g.fillStyle = '#000';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * 0.95)}px ${FONT}`;
  [...zeichen].forEach((z, i) => g.fillText(z === '-' ? '−' : z, i * w + w / 2, h / 2 + h * 0.04));
  return rgbaZu1bpp(g.getImageData(0, 0, n * w, h).data, n * w, h);
}

/** Timer (Countdown): große Knöpfe zum Tippen (±1 min, Start/Stopp, Vorlagen), ▲/▼ blättern wie überall. → [{ n, daten }] mit felder.txt zuletzt */
export function timerWidget() {
  const Z = { w: 96, h: 144, x: 160, y: 60 };   // 5 Zellen „MM:SS“ = 480 px breit
  const felder = ['typ countdown', 'dauer 300', `ziffern ${Z.w} ${Z.h}`, `zeit ${Z.x} ${Z.y}`];   // ▲/▼ blättern wie überall, Bedienung per Tippen
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
  g.fillText('Tippen zum Bedienen · ▲▼ = blättern · KI = Home', 100, 19);
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

const NAMEN = { home: 'Home', notiz: 'Notiz', bordbuch: 'Bordbuch', zettel: 'Zettel', kritzel: 'Kritzel', app: 'Rechner' };

/**
 * Menü (KI kurz auf Home): eine Kachel je Karussell-Eintrag, Tippen springt direkt hin (Aktion „gehe <i>“).
 * eintraege: Zeilen wie in karussell.txt („home“, „widget timer“, …), Reihenfolge = Index im Karussell.
 */
export function menueWidget(eintraege) {
  const felder = ['typ menue'];
  const c = leinwand(BREITE, HOEHE);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  g.fillStyle = '#000';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = `bold 24px ${FONT}`;
  g.fillText('Menü', 16, 18);
  g.font = `16px ${FONT}`;
  g.fillText('Tippen = hin · KI = Home · ▲▼ = blättern', 100, 19);
  const spalten = eintraege.length > 6 ? 3 : 2;
  const zeilen = Math.ceil(eintraege.length / spalten);
  const x0 = 16, y0 = 44, w = (BREITE - 32) / spalten, h = Math.min(140, (HOEHE - y0 - 12) / zeilen);
  eintraege.forEach((e, i) => {
    const name = e.startsWith('widget ') ? e.slice(7).replace(/^./, (b) => b.toUpperCase()) : NAMEN[e] ?? e;
    const x = Math.round(x0 + (i % spalten) * w), y = Math.round(y0 + Math.floor(i / spalten) * h);
    knopf(g, x, y, Math.round(x + w), Math.round(y + h), name, e === 'home', 36);
    felder.push(`knopf ${x} ${y} ${Math.round(x + w)} ${Math.round(y + h)} gehe ${i}`);
  });
  return [
    { n: 'bild.bin', daten: rgbaZu1bpp(g.getImageData(0, 0, BREITE, HOEHE).data) },
    { n: 'felder.txt', daten: new TextEncoder().encode(felder.join('\n') + '\n') },
  ];
}

/** Wasserwaage: Blase im Kreis (1° = r/15 px, Ringe bei 1°, 5°, 10°), Grad für beide Achsen, Null setzen, Halten */
export function waageWidget() {
  const K = { x: 232, y: 272, r: 190 };
  const Z = { w: 48, h: 72 };
  const felder = ['typ waage', `ziffern ${Z.w} ${Z.h}`, `blase ${K.x} ${K.y} ${K.r}`, 'wert1 496 92', 'wert2 496 196', 'achsen x y'];
  const c = leinwand(BREITE, HOEHE);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  g.fillStyle = '#000';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = `bold 24px ${FONT}`;
  g.fillText('Wasserwaage', 16, 18);
  g.font = `16px ${FONT}`;
  g.fillText('flach hinlegen · ▲▼ = blättern · KI = Home', 180, 19);
  g.strokeStyle = '#000';
  g.lineWidth = 4;
  g.beginPath(); g.arc(K.x, K.y, K.r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2;
  for (const grad of [1, 5, 10]) { g.beginPath(); g.arc(K.x, K.y, (grad * K.r) / 15 + 24, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.moveTo(K.x - K.r, K.y); g.lineTo(K.x + K.r, K.y); g.moveTo(K.x, K.y - K.r); g.lineTo(K.x, K.y + K.r); g.stroke();
  g.font = `bold 40px ${FONT}`;
  g.fillText('↔', 448, 128);
  g.fillText('↕', 448, 232);
  const k = (x0, y0, x1, y1, text, aktion, dunkel, gr) => { knopf(g, x0, y0, x1, y1, text, dunkel, gr); felder.push(`knopf ${x0} ${y0} ${x1} ${y1} ${aktion}`); };
  k(448, 296, 784, 380, 'Null setzen', 'null', true, 32);
  k(448, 386, 784, 470, 'Halten', 'halten', false, 32);
  return [
    { n: 'ziffern.bin', daten: ziffernBlatt(Z.w, Z.h, '0123456789:-.°') },
    { n: 'bild.bin', daten: rgbaZu1bpp(g.getImageData(0, 0, BREITE, HOEHE).data) },
    { n: 'felder.txt', daten: new TextEncoder().encode(felder.join('\n') + '\n') },
  ];
}

export const WIDGETS = { timer: timerWidget, waage: waageWidget };
