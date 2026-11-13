// Widgets für die Widget-Maschine des Sticky (firmware-ble/widget.h, FW ≥ 0.18.0): die App zeichnet Hintergrund und Ziffern
// und beschreibt Felder und Knöpfe; der Sticky läuft danach ohne Handy. Ablage: /soll/widgets/<name>/.
// Hochkant (FW ≥ 0.21.0): logisch 480 × 800 zeichnen, Bild und Rechtecke fürs Display drehen, Ziffern als gedrehte
// Zellen mit „schritt 0 −w“ (die Zahl läuft auf dem Display von unten nach oben).
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';
import { groesse, zuDisplay, punktZuDisplay, aufsDisplay } from './lage.js';

const FONT = 'system-ui, sans-serif';
const leinwand = (b, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b, h) : Object.assign(document.createElement('canvas'), { width: b, height: h }));
const text = (zeilen) => new TextEncoder().encode(zeilen.join('\n') + '\n');

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

/**
 * Ziffern 0–9, „:“ (und für die Waage „-“, „.“, „°“) nebeneinander, je Zelle w × h (logisch) → 1 bpp.
 * Hochkant wird jede Zelle gedreht: auf dem Display h × w (h muss dann ein Vielfaches von 8 sein).
 */
export function ziffernBlatt(w, h, zeichen = '0123456789:', hoch = false) {
  const n = zeichen.length;
  const zw = hoch ? h : w, zh = hoch ? w : h;   // Zelle auf dem Display
  const c = leinwand(n * zw, zh);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, n * zw, zh);
  g.fillStyle = '#000';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * 0.95)}px ${FONT}`;
  [...zeichen].forEach((z, i) => {
    g.save();
    if (hoch) { g.translate(i * zw, w); g.rotate(-Math.PI / 2); } else g.translate(i * w, 0);   // hoch: logisch (lx, ly) → (ly, w − lx)
    g.fillText(z === '-' ? '−' : z, w / 2, h / 2 + h * 0.04);
    g.restore();
  });
  return rgbaZu1bpp(g.getImageData(0, 0, n * zw, zh).data, n * zw, zh);
}

/** Seite logisch zeichnen: Leinwand mit Kopf, Knöpfe (Felder in Display-Koordinaten), am Ende gedreht als 1 bpp */
function seite(hoch, titel, hinweis) {
  const { w: W, h: H } = groesse(hoch);
  const c = leinwand(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#000';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = `bold 24px ${FONT}`;
  g.fillText(titel, 16, 18);
  if (hinweis && !hoch) {   // hochkant ist neben der Statuszeile kein Platz; die Hilfe (▲+▼) erklärt es
    const tb = g.measureText(titel).width;
    g.font = `16px ${FONT}`;
    g.fillText(hinweis, 36 + tb, 19);
  }
  const felder = [];
  return {
    g, W, H, felder,
    /** Knopf zeichnen (logisch) und als Feld eintragen (Display) */
    k(x0, y0, x1, y1, t, aktion, dunkel, gr) {
      knopf(g, x0, y0, x1, y1, t, dunkel, gr);
      const d = zuDisplay({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, hoch);
      felder.push(`knopf ${d.x} ${d.y} ${d.x + d.w} ${d.y + d.h} ${aktion}`);
    },
    /** erste Ziffernzelle (logisch ab x, y, Zellbreite zw) → Display-Position */
    ziffernPos(x, y, zw) { return hoch ? { x: y, y: 480 - x - zw } : { x, y }; },
    bild() { const d = aufsDisplay(c, hoch); return rgbaZu1bpp(d.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, BREITE, HOEHE).data); },
  };
}

/** Timer (Countdown): große Knöpfe zum Tippen (±1 min, Start/Stopp, Vorlagen), ▲/▼ blättern wie überall. → [{ n, daten }] mit felder.txt zuletzt */
export function timerWidget(hoch = false) {
  const p = seite(hoch, 'Timer', 'Tippen zum Bedienen · ▲▼ = blättern · KI = Home');
  // 5 Zellen „MM:SS“; hochkant: Zellenhöhe und y-Position Vielfache von 8 (werden auf dem Display zu Breite und x)
  const Z = hoch ? { w: 88, h: 136, x: 20, y: 80 } : { w: 96, h: 144, x: 160, y: 60 };
  const z = p.ziffernPos(Z.x, Z.y, Z.w);
  p.felder.push('typ countdown', 'dauer 300', hoch ? `ziffern ${Z.h} ${Z.w}` : `ziffern ${Z.w} ${Z.h}`, ...(hoch ? [`schritt 0 ${-Z.w}`] : []), `zeit ${z.x} ${z.y}`);
  const vorlagen = [[1, '1 min'], [3, '3'], [5, '5'], [10, '10'], [25, '25']];
  if (hoch) {
    p.k(16, 236, 464, 360, 'Start / Stopp', 'start_stopp', true, 40);
    p.k(16, 372, 240, 480, '− 1 min', 'minus 60');
    p.k(240, 372, 464, 480, '+ 1 min', 'plus 60');
    vorlagen.forEach(([m, t], i) => {
      const x = 16 + (i % 3) * 149, y = 496 + Math.floor(i / 3) * 136;
      p.k(x, y, x + 149, y + 136, t, `setze ${m * 60}`, false, 34);
    });
    p.k(314, 632, 464, 768, 'Reset', 'reset', false, 28);
  } else {
    p.k(16, 222, 208, 330, '− 1 min', 'minus 60');
    p.k(224, 222, 576, 330, 'Start / Stopp', 'start_stopp', true, 36);
    p.k(592, 222, 784, 330, '+ 1 min', 'plus 60');
    vorlagen.forEach(([m, t], i) => p.k(16 + i * 128, 346, 144 + i * 128, 464, t, `setze ${m * 60}`, false, 34));
    p.k(656, 346, 784, 464, 'Reset', 'reset', false, 28);
  }
  return [
    { n: 'ziffern.bin', daten: ziffernBlatt(Z.w, Z.h, '0123456789:', hoch) },
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

const NAMEN = { home: 'Home', notiz: 'Notiz', bordbuch: 'Bordbuch', zettel: 'Zettel', kritzel: 'Kritzel', app: 'Rechner' };

/**
 * Menü (KI kurz auf Home): eine Kachel je Karussell-Eintrag, Tippen springt direkt hin (Aktion „gehe <i>“).
 * eintraege: Zeilen wie in karussell.txt („home“, „widget timer“, …), Reihenfolge = Index im Karussell.
 */
export function menueWidget(eintraege, hoch = false) {
  const p = seite(hoch, 'Menü', 'Tippen = hin · KI = Home · ▲▼ = blättern');
  p.felder.push('typ menue');
  const spalten = !hoch && eintraege.length > 6 ? 3 : 2;
  const zeilen = Math.ceil(eintraege.length / spalten);
  const x0 = 16, y0 = hoch ? 48 : 44, w = (p.W - 32) / spalten, h = Math.min(hoch ? 180 : 140, (p.H - y0 - 12) / zeilen);
  eintraege.forEach((e, i) => {
    const name = e.startsWith('widget ') ? e.slice(7).replace(/^./, (b) => b.toUpperCase()) : NAMEN[e] ?? e;
    const x = Math.round(x0 + (i % spalten) * w), y = Math.round(y0 + Math.floor(i / spalten) * h);
    p.k(x, y, Math.round(x + w), Math.round(y + h), name, `gehe ${i}`, e === 'home', 36);
  });
  return [
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

/** Wasserwaage: Blase im Kreis (1° = r/15 px, Ringe bei 1°, 5°, 10°), Grad für beide Achsen, Null setzen, Halten */
export function waageWidget(hoch = false) {
  const p = seite(hoch, 'Wasserwaage', 'flach hinlegen · ▲▼ = blättern · KI = Home');
  const { g } = p;
  const K = hoch ? { x: 240, y: 290, r: 190 } : { x: 232, y: 272, r: 190 };
  const Z = { w: 48, h: 72 };
  // wert1 = Display-x (quer waagrecht ↔), wert2 = Display-y; hochkant liegt Display-x senkrecht, darum dort ↕ zuerst
  const W1 = hoch ? { x: 96, y: 520 } : { x: 496, y: 92 }, W2 = hoch ? { x: 96, y: 608 } : { x: 496, y: 196 };
  const b = punktZuDisplay(K.x, K.y, hoch), w1 = p.ziffernPos(W1.x, W1.y, Z.w), w2 = p.ziffernPos(W2.x, W2.y, Z.w);
  p.felder.push('typ waage', hoch ? `ziffern ${Z.h} ${Z.w}` : `ziffern ${Z.w} ${Z.h}`, ...(hoch ? [`schritt 0 ${-Z.w}`] : []),
    `blase ${b.x} ${b.y} ${K.r}`, `wert1 ${w1.x} ${w1.y}`, `wert2 ${w2.x} ${w2.y}`, 'achsen x y');
  g.strokeStyle = '#000';
  g.lineWidth = 4;
  g.beginPath(); g.arc(K.x, K.y, K.r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2;
  for (const grad of [1, 5, 10]) { g.beginPath(); g.arc(K.x, K.y, (grad * K.r) / 15 + 24, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.moveTo(K.x - K.r, K.y); g.lineTo(K.x + K.r, K.y); g.moveTo(K.x, K.y - K.r); g.lineTo(K.x, K.y + K.r); g.stroke();
  g.fillStyle = '#000';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = `bold 40px ${FONT}`;
  g.fillText(hoch ? '↕' : '↔', W1.x - 48, W1.y + 36);
  g.fillText(hoch ? '↔' : '↕', W2.x - 48, W2.y + 36);
  if (hoch) {
    p.k(16, 700, 240, 790, 'Null setzen', 'null', true, 32);
    p.k(240, 700, 464, 790, 'Halten', 'halten', false, 32);
  } else {
    p.k(448, 296, 784, 380, 'Null setzen', 'null', true, 32);
    p.k(448, 386, 784, 470, 'Halten', 'halten', false, 32);
  }
  return [
    { n: 'ziffern.bin', daten: ziffernBlatt(Z.w, Z.h, '0123456789:-.°', hoch) },
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

export const WIDGETS = { timer: timerWidget, waage: waageWidget };
