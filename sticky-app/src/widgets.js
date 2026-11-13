// Widgets für die Widget-Maschine des Sticky (firmware-ble/widget.h, FW ≥ 0.18.0): die App zeichnet Hintergrund und Ziffern
// und beschreibt Felder und Knöpfe; der Sticky läuft danach ohne Handy. Ablage: /soll/widgets/<name>/.
// Hochkant (FW ≥ 0.21.0): logisch 480 × 800 zeichnen, Bild und Rechtecke fürs Display drehen, Ziffern als gedrehte
// Zellen mit „schritt 0 −w“ (die Zahl läuft auf dem Display von unten nach oben).
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';
import { groesse, zuDisplay, punktZuDisplay, aufsDisplay } from './lage.js';
import { braunKnopf, BRAUN_FONT } from './braun.js';
import { TASTEN as R_TASTEN, ROLLE as R_ROLLE } from './rechner.js';
import { PAARE } from './umrechner.js';

const FONT = BRAUN_FONT;
const leinwand = (b, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b, h) : Object.assign(document.createElement('canvas'), { width: b, height: h }));
const text = (zeilen) => new TextEncoder().encode(zeilen.join('\n') + '\n');

/** Knopf im Braun-Stil (braun.js); rolle: haupt | wahl | werkzeug | neben */
function knopf(g, x0, y0, x1, y1, text, rolle = 'neben', gr = null) {
  braunKnopf(g, x0, y0, x1 - x0, y1 - y0, text, rolle, { gr, rand: 6 });
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
  g.font = `500 ${Math.round(h * 0.95)}px ${FONT}`;
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
  g.font = `500 24px ${FONT}`;
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
    k(x0, y0, x1, y1, t, aktion, rolle, gr) {
      knopf(g, x0, y0, x1, y1, t, rolle, gr);
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
    p.k(16, 236, 464, 360, 'Start / Stopp', 'start_stopp', 'haupt', 40);
    p.k(16, 372, 240, 480, '− 1 min', 'minus 60', 'werkzeug', 30);
    p.k(240, 372, 464, 480, '+ 1 min', 'plus 60', 'werkzeug', 30);
    vorlagen.forEach(([m, t], i) => {
      const x = 16 + (i % 3) * 149, y = 496 + Math.floor(i / 3) * 136;
      p.k(x, y, x + 149, y + 136, t, `setze ${m * 60}`, 'wahl', 34);
    });
    p.k(314, 632, 464, 768, 'Reset', 'reset', 'werkzeug', 28);
  } else {
    p.k(16, 222, 208, 330, '− 1 min', 'minus 60', 'werkzeug', 30);
    p.k(224, 222, 576, 330, 'Start / Stopp', 'start_stopp', 'haupt', 36);
    p.k(592, 222, 784, 330, '+ 1 min', 'plus 60', 'werkzeug', 30);
    vorlagen.forEach(([m, t], i) => p.k(16 + i * 128, 346, 144 + i * 128, 464, t, `setze ${m * 60}`, 'wahl', 34));
    p.k(656, 346, 784, 464, 'Reset', 'reset', 'werkzeug', 28);
  }
  return [
    { n: 'ziffern.bin', daten: ziffernBlatt(Z.w, Z.h, '0123456789:', hoch) },
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

const NAMEN = { home: 'Home', notiz: 'Notiz', bordbuch: 'Bordbuch', zettel: 'Zettel', kritzel: 'Kritzel', schrift: 'Schrift', app: 'Rechner' };

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
    p.k(x, y, Math.round(x + w), Math.round(y + h), name, `gehe ${i}`, e === 'home' ? 'wahl' : 'neben', 34);
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
    `blase ${b.x} ${b.y} ${K.r}`, `wert1 ${w1.x} ${w1.y}`, `wert2 ${w2.x} ${w2.y}`, 'achsen y x');   // Sensor-y ∥ Display-x (gemessen 13.11.2026)
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
    p.k(16, 700, 240, 790, 'Null setzen', 'null', 'haupt', 30);
    p.k(240, 700, 464, 790, 'Halten', 'halten', 'neben', 30);
  } else {
    p.k(448, 296, 784, 380, 'Null setzen', 'null', 'haupt', 30);
    p.k(448, 386, 784, 470, 'Halten', 'halten', 'neben', 30);
  }
  return [
    { n: 'ziffern.bin', daten: ziffernBlatt(Z.w, Z.h, '0123456789:-.°', hoch) },
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

// ---- Lineal (SPEC „EDC-Ideen“, 13.11.2026) -------------------------------------------------------------------------
// Statische Seite ohne Uhr (typ menue, keine Knöpfe): mm-Skala am unteren Rand (0 links unten, bis ~8 cm) und am linken
// Rand (nach oben, bis ~5 cm). Panel 3,97″ bei 800 × 480 → 9,25 px/mm; kalibriert über „80 mm messen in echt …“.
export const PX_PRO_MM = 9.25;
export function linealWidget(echtBei80 = 80) {
  const pxmm = PX_PRO_MM * 80 / (echtBei80 || 80);
  const p = seite(false, 'Lineal', '0 = Ecke links unten · mm');
  const { g } = p;
  p.felder.push('typ menue');
  const x0 = 8, y0 = HOEHE - 8;   // Nullpunkt: 8 px vom linken und unteren Rand
  g.strokeStyle = '#000';
  g.fillStyle = '#000';
  g.lineCap = 'butt';
  const strich = (mm) => (mm % 10 === 0 ? 46 : mm % 5 === 0 ? 30 : 18);
  // unten, waagrecht
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(x0, y0 + 1); g.lineTo(BREITE, y0 + 1); g.stroke();
  for (let mm = 0; x0 + mm * pxmm <= BREITE - 2; mm++) {
    const x = Math.round(x0 + mm * pxmm) + 0.5;
    g.lineWidth = mm % 10 === 0 ? 3 : 1.5;
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 - strich(mm)); g.stroke();
    if (mm % 10 === 0 && mm > 0) {
      g.font = `500 26px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(String(mm / 10), x, y0 - 50);
    }
  }
  // links, senkrecht
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(x0 - 1, y0); g.lineTo(x0 - 1, 40); g.stroke();
  for (let mm = 1; y0 - mm * pxmm >= 44; mm++) {
    const y = Math.round(y0 - mm * pxmm) + 0.5;
    g.lineWidth = mm % 10 === 0 ? 3 : 1.5;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + strich(mm), y); g.stroke();
    if (mm % 10 === 0) {
      g.font = `500 26px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(String(mm / 10), x0 + 54, y);
    }
  }
  g.font = `400 20px ${FONT}`; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillText('cm', BREITE - 16, y0 - 100);
  return [
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

// ---- Rechner und Umrechner im Sticky (FW ≥ 0.28.0) -----------------------------------------------------------------
// Die Logik läuft im Sticky (firmware-ble/rechner.h, getestet gegen dieselben Fälle wie rechner.js); hier entstehen nur
// Optik (Braun-Tasten), Glyphen für die Anzeige und die Felder. Lagen wie auf der App-Seite.

/** Glyphenblatt für die Anzeige: Schrift passt sich der Zellbreite an (Einheiten wie „m“ sind breit) */
function textBlatt(w, h, glyphen, hoch) {
  const n = glyphen.length, zw = hoch ? h : w, zh = hoch ? w : h;
  const c = leinwand(n * zw, zh);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, n * zw, zh);
  g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let gr = Math.round(h * 0.9);
  const breiteste = () => Math.max(...glyphen.map((z) => g.measureText(z === '-' ? '−' : z).width));
  do { g.font = `500 ${gr}px ${FONT}`; gr -= 1; } while (breiteste() > w - 2 && gr > 10);
  glyphen.forEach((z, i) => {
    g.save();
    if (hoch) { g.translate(i * zw, w); g.rotate(-Math.PI / 2); } else g.translate(i * w, 0);
    g.fillText(z === '-' ? '−' : z, w / 2, h / 2 + h * 0.04);
    g.restore();
  });
  return rgbaZu1bpp(g.getImageData(0, 0, n * zw, zh).data, n * zw, zh);
}

/** Anzeige-Fenster wie das LCD beim Braun */
function fenster(g, x, y, w, h) {
  g.fillStyle = '#fff'; g.fillRect(x, y, w, h);
  g.strokeStyle = '#000'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
}

/** Taschenrechner: 5er-Raster wie der Braun BNE001, Anzeige rechtsbündig mit „M“ links, wenn der Speicher belegt ist */
export function rechnerWidget(hoch = false) {
  const p = seite(hoch, 'Rechner', 'rechnet im Sticky · ▲▼ = blättern · KI = Home');
  const { g } = p;
  const A = hoch ? { x: 16, y: 48, w: 448, h: 112 } : { x: 16, y: 44, w: 768, h: 84 };
  const Z = hoch ? { w: 32, h: 72 } : { w: 40, h: 64 };                   // logische Zelle
  const n = Math.floor((A.w - 32) / Z.w);
  const tx = (A.x + A.w - 16 - n * Z.w) & ~7, ty = hoch ? 72 : A.y + 10;  // hochkant: ty wird Display-x (Vielfaches von 8)
  fenster(g, A.x, A.y, A.w, A.h);
  const F = hoch ? { x: 16, y: 176, w: 448, h: 608 } : { x: 16, y: 136, w: 768, h: 336 };
  const tw = F.w / R_TASTEN[0].length, th = F.h / R_TASTEN.length;
  const liste = R_TASTEN.flat();
  R_TASTEN.forEach((zeile, ze) => zeile.forEach((t, sp) => {
    const x = F.x + sp * tw, y = F.y + ze * th;
    braunKnopf(g, x, y, tw, th, t, R_ROLLE(t), { rund: true });
    const d = zuDisplay({ x: Math.round(x), y: Math.round(y), w: Math.round(tw), h: Math.round(th) }, hoch);
    p.felder.push(`knopf ${d.x} ${d.y} ${d.x + d.w} ${d.y + d.h} taste ${liste.indexOf(t)}`);
  }));
  const glyphen = [...'0123456789,-+eFhlrM', ' '];
  const z = p.ziffernPos(tx, ty, Z.w);
  p.felder.unshift('typ rechner', hoch ? `ziffern ${Z.h} ${Z.w}` : `ziffern ${Z.w} ${Z.h}`, ...(hoch ? [`schritt 0 ${-Z.w}`] : []),
    `glyphen ${glyphen.map((x) => (x === ' ' ? '_' : x)).join(' ')}`, `text ${z.x} ${z.y} ${n}`, `tasten ${liste.join(' ')}`);
  return [
    { n: 'ziffern.bin', daten: textBlatt(Z.w, Z.h, glyphen, hoch) },
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

/** Umrechner: Einheitenpaare (gewähltes invertiert), Ziffernblock, Anzeige „12,5 km = 7,77 mi“ */
export function umrechnerWidget(hoch = false) {
  const p = seite(hoch, 'Umrechner', 'rechnet im Sticky · ▲▼ = blättern · KI = Home');
  const { g } = p;
  const A = hoch ? { x: 16, y: 48, w: 448, h: 96 } : { x: 16, y: 44, w: 768, h: 72 };
  const Z = hoch ? { w: 18, h: 48 } : { w: 24, h: 48 };
  const n = Math.floor((A.w - 16) / Z.w);
  const tx = (A.x + A.w - 8 - n * Z.w) & ~7, ty = hoch ? 72 : A.y + 12;
  fenster(g, A.x, A.y, A.w, A.h);
  const L = hoch ? { x: 16, y: 152, w: 448, h: 256 } : { x: 16, y: 124, w: 280, h: 352 };
  const T = hoch ? { x: 16, y: 416, w: 448, h: 368 } : { x: 304, y: 124, w: 480, h: 352 };
  const zeilen = Math.ceil(PAARE.length / 2), lw = L.w / 2, lh = L.h / zeilen;
  PAARE.forEach((pa, i) => {
    const x = L.x + (i % 2) * lw, y = L.y + Math.floor(i / 2) * lh;
    braunKnopf(g, x, y, lw, lh, `${pa.a}↔${pa.b}`, 'neben', { rand: 6, gr: 22 });
    const d = zuDisplay({ x: Math.round(x), y: Math.round(y), w: Math.round(lw), h: Math.round(lh) }, hoch);
    p.felder.push(`knopf ${d.x} ${d.y} ${d.x + d.w} ${d.y + d.h} paar ${i}`);
  });
  const U = [['7', '8', '9', '⌫'], ['4', '5', '6', 'C'], ['1', '2', '3', '⇄'], ['±', '0', ',', '']];
  const liste = U.flat().filter(Boolean);
  const tw = T.w / 4, th = T.h / U.length;
  U.forEach((zeile, ze) => zeile.forEach((t, sp) => {
    if (!t) return;
    const x = T.x + sp * tw, y = T.y + ze * th;
    braunKnopf(g, x, y, tw, th, t, t === '⇄' ? 'haupt' : /^[\d,]$/.test(t) ? 'wahl' : 'werkzeug', { rund: true });
    const d = zuDisplay({ x: Math.round(x), y: Math.round(y), w: Math.round(tw), h: Math.round(th) }, hoch);
    p.felder.push(`knopf ${d.x} ${d.y} ${d.x + d.w} ${d.y + d.h} taste ${liste.indexOf(t)}`);
  }));
  // Glyphen: Ziffern, Zeichen und alle Buchstaben der Einheiten (°, /)
  const einheiten = new Set(PAARE.flatMap((pa) => [...pa.a, ...pa.b]));
  const glyphen = [...new Set([...'0123456789,-=', ...einheiten, ...'Fehlr', ' '])];
  // Paare für die Firmware: y = a·x + b, aus hin(0) und hin(1) bestimmt
  const paare = PAARE.map((pa) => { const b = pa.hin(0), a = pa.hin(1) - b; return `paar ${pa.a} ${pa.b} ${+a.toPrecision(9)} ${+b.toPrecision(9)}`; });
  const z = p.ziffernPos(tx, ty, Z.w);
  p.felder.unshift('typ umrechner', hoch ? `ziffern ${Z.h} ${Z.w}` : `ziffern ${Z.w} ${Z.h}`, ...(hoch ? [`schritt 0 ${-Z.w}`] : []),
    `glyphen ${glyphen.map((x) => (x === ' ' ? '_' : x)).join(' ')}`, `text ${z.x} ${z.y} ${n}`, `tasten ${liste.join(' ')}`, ...paare);
  return [
    { n: 'ziffern.bin', daten: textBlatt(Z.w, Z.h, glyphen, hoch) },
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

export const WIDGETS = { timer: timerWidget, waage: waageWidget, lineal: () => linealWidget(linealEcht()), rechner: rechnerWidget, umrechner: umrechnerWidget };
/** Kalibrierung aus der App (Mehr → Lineal): so viele echte mm misst die 80-mm-Marke */
function linealEcht() { try { return parseFloat(localStorage.getItem('sticky.lineal80')) || 80; } catch { return 80; } }
