// Widgets für die Widget-Maschine des Sticky (firmware-ble/widget.h, FW ≥ 0.18.0): die App zeichnet Hintergrund und Ziffern
// und beschreibt Felder und Knöpfe; der Sticky läuft danach ohne Handy. Ablage: /soll/widgets/<name>/.
// Hochkant (FW ≥ 0.21.0): logisch 480 × 800 zeichnen, Bild und Rechtecke fürs Display drehen, Ziffern als gedrehte
// Zellen mit „schritt 0 −w“ (die Zahl läuft auf dem Display von unten nach oben).
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';
import { groesse, zuDisplay, punktZuDisplay, aufsDisplay } from './lage.js';
import { braunKnopf, BRAUN_FONT } from './braun.js';
import { TASTEN as R_TASTEN, ROLLE as R_ROLLE } from './rechner.js';
import { PAARE } from './umrechner.js';
import { HANDY_12H, HANDY_US } from './zeit.js';
import { schluessel } from './geraete.js';
import { T, appIstEn } from './uebersetzen.js';
import { menueKacheln, kachelAktion } from './gruppen.js';
// Zweisprachig (SPEC „Zweisprachig Deutsch/Englisch“): Texte im Bild per T() beim Bauen (main.js baut im Sticky-Kontext).
// felder.txt bleibt deutsch/Protokoll; Glyphenblätter enthalten die Zeichen beider Sprachen, denn der Sticky kann die
// Sprache ohne Handy umschalten und setzt dann sofort „on/off“, „EN“, Punkt statt Komma und „Error“.
/** Beschriftung einer Taste: die Kommataste zeigt auf Englisch „.“ (Aktion in felder.txt bleibt „,“) */
const tastenText = (t) => (t === ',' ? T(',', '.') : t);

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

/** Reiter der Gruppe für das Widget, das gerade gebaut wird (gruppen.js reiterFuer → { glieder, aktiv }), gesetzt von main.js */
let reiterJetzt = null;
export function mitReiter(reiter, bauen) { reiterJetzt = reiter; try { return bauen(); } finally { reiterJetzt = null; } }
// Statuszeile des Sticky rechts oben: 288 px breit (24 h), 368 px mit a/p (12 h), 32 px hoch (firmware-ble/status.h)
const REITER_QUER_B = 800 - 368 - 16, REITER_HOCH_B = 480 - 368 - 8;

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
  const reiter = reiterJetzt;
  if (!reiter) g.fillText(titel, 16, 18);
  if (hinweis && !hoch && !reiter) {   // hochkant ist neben der Statuszeile kein Platz; die Hilfe (▲+▼) erklärt es
    const tb = g.measureText(titel).width;
    g.font = `16px ${FONT}`;
    g.fillText(hinweis, 36 + tb, 19);
  }
  const felder = [];
  if (reiter) {   // Gruppe: Reiter statt Seitenname (SPEC „Gruppen im Menü“); Tippen = gehe <Karussell-Index>
    const feld = (x0, y0, x1, y1, ziel) => { const d = zuDisplay({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, hoch); felder.push(`knopf ${d.x} ${d.y} ${d.x + d.w} ${d.y + d.h} gehe ${ziel}`); };
    if (!hoch) {
      const n = reiter.glieder.length, b = Math.floor(REITER_QUER_B / n);
      reiter.glieder.forEach((x, j) => {
        braunKnopf(g, 8 + j * b, 0, b, 36, kachelName(x.e), j === reiter.aktiv ? 'wahl' : 'neben', { gr: n > 3 ? 18 : 22, rand: 3 });
        if (j !== reiter.aktiv) feld(8 + j * b, 0, 8 + (j + 1) * b, 44, x.i);
      });
    } else {   // hochkant ist neben der Statuszeile nur Platz für eine Pille: aktueller Name, Tippen = nächstes Glied
      const nach = reiter.glieder[(reiter.aktiv + 1) % reiter.glieder.length];
      braunKnopf(g, 2, 0, REITER_HOCH_B, 36, `${kachelName(reiter.glieder[reiter.aktiv].e)} ›`, 'wahl', { gr: 17, rand: 3 });
      feld(0, 0, REITER_HOCH_B + 4, 44, nach.i);
    }
  }
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
  const p = seite(hoch, 'Timer', T('Zeit antippen = eigene Zeit · ▲▼ = blättern', 'tap the time = own time · ▲▼ = scroll'));
  const startStopp = T('Start / Stopp', 'Start / Stop');
  // 5 Zellen „MM:SS“; hochkant: Zellenhöhe und y-Position Vielfache von 8 (werden auf dem Display zu Breite und x)
  const Z = hoch ? { w: 88, h: 136, x: 20, y: 80 } : { w: 96, h: 144, x: 160, y: 60 };
  const z = p.ziffernPos(Z.x, Z.y, Z.w);
  p.felder.push('typ countdown', 'dauer 300', hoch ? `ziffern ${Z.h} ${Z.w}` : `ziffern ${Z.w} ${Z.h}`, ...(hoch ? [`schritt 0 ${-Z.w}`] : []), `zeit ${z.x} ${z.y}`);
  // Zeit antippen öffnet das Ziffernfeld (Art „Ziffern“, FW ≥ 0.35.0): unsichtbarer Knopf über den Ziffern
  const zf = zuDisplay({ x: Z.x, y: Z.y, w: 5 * Z.w, h: Z.h }, hoch);
  p.felder.push(`knopf ${zf.x} ${zf.y} ${zf.x + zf.w} ${zf.y + zf.h} eingabe 1`);
  const vorlagen = [[1, '1 min'], [3, '3'], [5, '5'], [10, '10'], [25, '25']];
  if (hoch) {
    p.k(16, 236, 464, 360, startStopp, 'start_stopp', 'haupt', 40);
    p.k(16, 372, 240, 480, '− 1 min', 'minus 60', 'werkzeug', 30);
    p.k(240, 372, 464, 480, '+ 1 min', 'plus 60', 'werkzeug', 30);
    vorlagen.forEach(([m, t], i) => {
      const x = 16 + (i % 3) * 149, y = 496 + Math.floor(i / 3) * 136;
      p.k(x, y, x + 149, y + 136, t, `setze ${m * 60}`, 'wahl', 34);
    });
    p.k(314, 632, 464, 768, 'Reset', 'reset', 'werkzeug', 28);
  } else {
    p.k(16, 222, 208, 330, '− 1 min', 'minus 60', 'werkzeug', 30);
    p.k(224, 222, 576, 330, startStopp, 'start_stopp', 'haupt', 36);
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

/** Seiten, die nur mit verbundenem Handy gehen (SPEC „Blick von außen“, 15.11.2026): Kachel bekommt ein Handy-Zeichen */
const NUR_MIT_HANDY = new Set(['app']);
/** kleines Handy (18 × 28 px) oben rechts in der Kachel */
function handyZeichen(g, x, y) {
  g.save();
  g.fillStyle = '#000';
  g.beginPath(); g.roundRect(x, y, 18, 28, 4); g.fill();
  g.fillStyle = '#fff';
  g.fillRect(x + 3, y + 4, 12, 17);
  g.beginPath(); g.arc(x + 9, y + 24.5, 1.6, 0, Math.PI * 2); g.fill();
  g.restore();
}
/** Kachelname je Karussell-Eintrag; Deutsch wie bisher (Widget-Name groß geschrieben), Englisch übersetzt */
const NAMEN = { home: ['Home', 'Home'], notiz: ['Notiz', 'Note'], bordbuch: ['Bordbuch', 'Logbook'], zettel: ['Zettel', 'Cards'],
  kritzel: ['Kritzel', 'Doodle'], schrift: ['Schrift', 'Writing'], app: ['Spiel', 'Game'] };
const WIDGET_EN = { timer: 'Timer', wecker: 'Alarm', weltzeit: 'World clock', waage: 'Level', lineal: 'Ruler', rechner: 'Calculator',
  umrechner: 'Converter', einstellungen: 'Settings', recorder: 'Recorder' };
export function kachelName(e) {
  if (e.startsWith('widget ')) { const w = e.slice(7); return T(w.replace(/^./, (b) => b.toUpperCase()), WIDGET_EN[w] ?? w.replace(/^./, (b) => b.toUpperCase())); }
  return NAMEN[e] ? T(...NAMEN[e]) : e;
}

/**
 * Menü (KI kurz auf Home): eine Kachel je Gruppe (gruppen.js) bzw. je Eintrag ohne Gruppe. Gruppenkachel → „gruppe <Maske>“
 * (die Firmware öffnet das zuletzt benutzte Glied, FW ≥ 0.36.0), Einzelkachel → „gehe <i>“.
 * eintraege: Zeilen wie in karussell.txt („home“, „widget timer“, …), Reihenfolge = Index im Karussell.
 * platz: Name der Firmware im anderen Platz (z. B. „Sticky Lab“, FW ≥ 0.33.0) → letzte Kachel schaltet dorthin um.
 * gruppen: false = alte Einzelkacheln (Firmware vor 0.36.0 kennt „gruppe“ nicht).
 */
export function menueWidget(eintraege, hoch = false, platz = null, gruppen = true) {
  const p = seite(hoch, T('Menü', 'Menu'), T('Tippen = hin · KI = Home · ▲▼ = blättern', 'tap = go · AI = Home · ▲▼ = scroll'));
  p.felder.push('typ menue');
  const kacheln = gruppen ? menueKacheln(eintraege) : eintraege.map((e, i) => ({ gruppe: null, glieder: [{ e, i }] }));
  const n = kacheln.length + (platz ? 1 : 0);
  const spalten = hoch ? (n > 12 ? 3 : 2) : n > 12 ? 4 : n > 6 ? 3 : 2;
  const zeilen = Math.ceil(n / spalten);
  const x0 = 16, y0 = hoch ? 48 : 44, w = (p.W - 32) / spalten, h = Math.min(hoch ? 180 : 140, (p.H - y0 - 12) / zeilen);
  kacheln.forEach((k, i) => {
    const x = Math.round(x0 + (i % spalten) * w), y = Math.round(y0 + Math.floor(i / spalten) * h);
    const x1 = Math.round(x + w), y1 = Math.round(y + h);
    const e = k.glieder[0].e;
    if (!k.gruppe) {
      p.k(x, y, x1, y1, kachelName(e), kachelAktion(k), e === 'home' ? 'wahl' : 'neben', 34);
      if (NUR_MIT_HANDY.has(e)) handyZeichen(p.g, x1 - 40, Math.round(y + h / 2) - 14);   // rechts innen, mittig (Pillenform: Ecke liegt außerhalb)
      return;
    }
    // Gruppe: Name groß, darunter klein die Glieder (eine Zeile, mit „·“)
    p.k(x, y, x1, y1, '', kachelAktion(k), 'neben', 34);
    const { g } = p;
    g.fillStyle = '#000';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `500 ${h > 100 ? 32 : 26}px ${FONT}`;
    g.fillText(T(k.gruppe.de, k.gruppe.en), (x + x1) / 2, y + h * 0.42);
    let klein = 18;
    const liste = k.glieder.map((x2) => kachelName(x2.e)).join(' · ');
    g.font = `${klein}px ${FONT}`;
    while (klein > 12 && g.measureText(liste).width > w - 40) { klein -= 1; g.font = `${klein}px ${FONT}`; }
    g.fillText(liste, (x + x1) / 2, y + h * 0.7);
  });
  if (platz) {   // Umschalten auf die andere Firmware (Werkzeug-Rolle: gerasterter Rand)
    const i = kacheln.length, x = Math.round(x0 + (i % spalten) * w), y = Math.round(y0 + Math.floor(i / spalten) * h);
    p.k(x, y, Math.round(x + w), Math.round(y + h), `→ ${platz}`, 'platz', 'werkzeug', 34);
  }
  return [
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

/** Wasserwaage: Blase im Kreis (1° = r/15 px, Ringe bei 1°, 5°, 10°), Grad für beide Achsen, Null setzen, Halten */
export function waageWidget(hoch = false) {
  const p = seite(hoch, T('Wasserwaage', 'Spirit level'), T('flach hinlegen · ▲▼ = blättern · KI = Home', 'lay it flat · ▲▼ = scroll · AI = Home'));
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
  const nullSetzen = T('Null setzen', 'Set zero'), halten = T('Halten', 'Hold');
  if (hoch) {
    p.k(16, 700, 240, 790, nullSetzen, 'null', 'haupt', 30);
    p.k(240, 700, 464, 790, halten, 'halten', 'neben', 30);
  } else {
    p.k(448, 296, 784, 380, nullSetzen, 'null', 'haupt', 30);
    p.k(448, 386, 784, 470, halten, 'halten', 'neben', 30);
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
export function linealWidget(echtBei80 = 80, zoll = false) {
  const pxmm = PX_PRO_MM * 80 / (echtBei80 || 80);
  if (zoll) return linealZoll(pxmm);
  const p = seite(false, T('Lineal', 'Ruler'), T('0 = Ecke links unten · mm', '0 = bottom left corner · mm'));
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
function textBlatt(w, h, glyphen, hoch, eigen = {}) {
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
    if (eigen[z]) eigen[z](g, w, h); else g.fillText(z === '-' ? '−' : z, w / 2, h / 2 + h * 0.04);
    g.restore();
  });
  return rgbaZu1bpp(g.getImageData(0, 0, n * zw, zh).data, n * zw, zh);
}

/** Zeichen, die nicht jede Handy-Schrift hat: selbst gezeichnet (Zelle w × h, Ursprung oben links) */
const SYMBOLE = {
  '●': (g, w, h) => { g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2); g.fill(); },
  '▸': (g, w, h) => { g.beginPath(); g.moveTo(w * 0.25, h * 0.28); g.lineTo(w * 0.8, h / 2); g.lineTo(w * 0.25, h * 0.72); g.closePath(); g.fill(); },
  '✓': (g, w, h) => { g.lineWidth = Math.max(3, w / 7); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000'; g.beginPath(); g.moveTo(w * 0.18, h * 0.52); g.lineTo(w * 0.42, h * 0.72); g.lineTo(w * 0.84, h * 0.26); g.stroke(); },
  '⧗': (g, w, h) => {   // Sanduhr
    g.lineWidth = Math.max(2, w / 10); g.strokeStyle = '#000';
    g.beginPath(); g.moveTo(w * 0.2, h * 0.2); g.lineTo(w * 0.8, h * 0.2); g.lineTo(w * 0.2, h * 0.8); g.lineTo(w * 0.8, h * 0.8); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(w * 0.3, h * 0.75); g.lineTo(w * 0.7, h * 0.75); g.lineTo(w * 0.5, h * 0.55); g.closePath(); g.fill();
  },
  '⚑': (g, w, h) => {   // Fähnchen = Merker
    g.fillRect(w * 0.22, h * 0.18, Math.max(2, w / 10), h * 0.66);
    g.beginPath(); g.moveTo(w * 0.3, h * 0.2); g.lineTo(w * 0.85, h * 0.32); g.lineTo(w * 0.3, h * 0.46); g.closePath(); g.fill();
  },
};

// ---- Recorder (SPEC „Recorder für Längeres“, FW ≥ 0.34.0) -----------------------------------------------------------
/** Texte, die die Firmware (recorder.h) in die Zeilen setzt – beide Sprachen, daraus entsteht das Glyphenblatt */
export const RECORDER_TEXTE = ['bereit', 'ready', 'seit', 'since', '! Akku leer', '! battery low', '! keine Karte', '! no card',
  '! Karte voll?', '! card full?', 'Tippen = Start', 'tap = start', ' min', '0123456789:ap', '●▸✓⧗⚑'];
export const recorderGlyphen = () => [...new Set([...RECORDER_TEXTE.join(''), ' '])];

/**
 * Recorder: großer Knopf (Doppelring) = Start/Stopp, darunter Zustand und Zusatz, kleiner Knopf Merker; rechts die
 * Aufnahmen des Tages (Uhrzeit, Minuten, ✓ beim Handy und Text da · ⧗ wartet aufs Handy). Tipp auf eine Zeile mit Handy =
 * dort abspielen (noch einmal = Pause), ▲/▼ blättert die Liste bzw. springt beim Anhören von Merker zu Merker.
 * Textfelder: 0 Zustand, 1 Zusatz (je 16 Zellen), 2–6 Liste (je 14 Zellen) – so liest sie firmware-ble/recorder.h.
 */
export function recorderWidget(hoch = false) {
  const p = seite(hoch, 'Recorder', T('Tippen = Start/Stopp · KI halten = Merker', 'tap = start/stop · hold AI = mark'));
  const { g } = p;
  const Z = { w: 24, h: 40 };
  const glyphen = recorderGlyphen();
  const L = hoch
    ? { knopf: [16, 52, 464, 264], t0: [16, 280], t1: [16, 328], merker: [16, 376, 300, 448], loeschen: [300, 376, 464, 448], kopf: 470, zeilen: { x: 24, y: 504, h: 56, x0: 16, x1: 464 } }
    : { knopf: [16, 52, 392, 292], t0: [16, 304], t1: [16, 352], merker: [16, 400, 248, 472], loeschen: [248, 400, 392, 472], kopf: 60, zeilen: { x: 416, y: 96, h: 64, x0: 404, x1: 784 } };
  p.k(...L.knopf, T('● Aufnahme', '● Record'), 'rec', 'haupt', 40);
  p.k(...L.merker, T('Merker', 'Mark'), 'merker', 'werkzeug', 28);
  p.k(...L.loeschen, T('Löschen', 'Delete'), 'eingabe 2', 'neben', 24);   // Ja/Nein für die gewählte Zeile (FW ≥ 0.35.0)
  g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const R = L.zeilen;
  g.font = `500 24px ${FONT}`; g.fillText(T('Heute', 'Today'), R.x0 + 8, L.kopf);
  // Legende mit denselben selbst gezeichneten Zeichen wie in den Zeilen (Handy-Schriften haben ⧗ nicht sicher)
  g.font = `400 15px ${FONT}`;
  let lx = R.x0 + 8;
  const ly = hoch ? 788 : 462;
  for (const [z, t] of [['✓', T('beim Handy', 'on phone')], ['⧗', T('wartet', 'waiting')], ['', T('Tipp = am Handy hören', 'tap = play on phone')]]) {
    if (z) { g.save(); g.translate(lx, ly - 11); SYMBOLE[z](g, 16, 22); g.restore(); lx += 18; }
    g.fillText(t, lx, ly); lx += g.measureText(t).width + 14;
  }
  const pos = [p.ziffernPos(...L.t0, Z.w), p.ziffernPos(...L.t1, Z.w)];
  for (let i = 0; i < 5; i++) {
    const y = R.y + i * R.h;
    g.fillRect(R.x0, y - 8, R.x1 - R.x0, 1);
    pos.push(p.ziffernPos(R.x, y, Z.w));
    const d = zuDisplay({ x: R.x0, y: y - 8, w: R.x1 - R.x0, h: R.h }, hoch);
    p.felder.push(`knopf ${d.x} ${d.y} ${d.x + d.w} ${d.y + d.h} wahl ${i}`);
  }
  p.felder.unshift('typ recorder', hoch ? `ziffern ${Z.h} ${Z.w}` : `ziffern ${Z.w} ${Z.h}`, ...(hoch ? [`schritt 0 ${-Z.w}`] : []),
    `glyphen ${glyphen.map((x) => (x === ' ' ? '_' : x)).join(' ')}`,
    ...pos.map((z, i) => `text ${z.x} ${z.y} ${i < 2 ? 16 : 14}`), 'taste up hoch', 'taste down runter');
  return [
    { n: 'ziffern.bin', daten: textBlatt(Z.w, Z.h, glyphen, hoch, SYMBOLE) },
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

/**
 * Ein Ziffernfeld für alles (SPEC „ein Ziffernfeld für alles“, Markus 15.11.2026): Rechner, Umrechner und die
 * Eingabe-Art „Ziffern“ haben dieselben Tasten an derselben Stelle – 7-8-9 oben, 0 unten in der Mitte, links und rechts
 * der 0 je ein Platz, rechts eine Spalte für Sonder-/Rechentasten (bei drei Einträgen geht der letzte über zwei Reihen:
 * die Hauptaktion ⇄ bzw. OK). Rolle aus rechner.js (Ziffern schwarz, Hauptaktion Doppelring, Rest gerastert).
 * F = Feld (logisch), 4 × 4 gleich große Zellen. → [{ t, x, y, w, h }]
 */
function ziffernfeld(g, F, rechts, links0 = '', rechts0 = '') {
  const sp = F.w / 4, re = F.h / 4, aus = [];
  [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], [links0, '0', rechts0]].forEach((zeile, r) => zeile.forEach((t, c) => {
    if (t) aus.push({ t, x: F.x + c * sp, y: F.y + r * re, w: sp, h: re });
  }));
  rechts.forEach((t, i) => { if (t) aus.push({ t, x: F.x + 3 * sp, y: F.y + i * re, w: sp, h: rechts.length === 3 && i === 2 ? 2 * re : re }); });
  for (const k of aus) braunKnopf(g, k.x, k.y, k.w, k.h, tastenText(k.t), R_ROLLE(k.t), { rund: k.h <= re + 1, rand: 6 });
  return aus;
}
const feldZuDisplay = (k, hoch) => { const d = zuDisplay({ x: Math.round(k.x), y: Math.round(k.y), w: Math.round(k.w), h: Math.round(k.h) }, hoch); return `${d.x} ${d.y} ${d.x + d.w} ${d.y + d.h}`; };

/** Anzeige-Fenster wie das LCD beim Braun */
function fenster(g, x, y, w, h) {
  g.fillStyle = '#fff'; g.fillRect(x, y, w, h);
  g.strokeStyle = '#000'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
}

/** Taschenrechner: 5er-Raster wie der Braun BNE001, Anzeige rechtsbündig mit „M“ links, wenn der Speicher belegt ist */
export function rechnerWidget(hoch = false) {
  const p = seite(hoch, T('Rechner', 'Calculator'), T('rechnet im Sticky · ▲▼ = blättern · KI = Home', 'runs on the Sticky · ▲▼ = scroll · AI = Home'));
  const { g } = p;
  const A = hoch ? { x: 16, y: 48, w: 448, h: 112 } : { x: 16, y: 44, w: 768, h: 84 };
  const Z = hoch ? { w: 32, h: 72 } : { w: 40, h: 64 };                   // logische Zelle
  const n = Math.floor((A.w - 32) / Z.w);
  const tx = (A.x + A.w - 16 - n * Z.w) & ~7, ty = hoch ? 72 : A.y + 10;  // hochkant: ty wird Display-x (Vielfaches von 8)
  fenster(g, A.x, A.y, A.w, A.h);
  const F = hoch ? { x: 16, y: 176, w: 448, h: 608 } : { x: 16, y: 136, w: 768, h: 336 };
  const tw = F.w / R_TASTEN[0].length, th = F.h / R_TASTEN.length;
  const liste = R_TASTEN.flat();
  // oben die Speicherreihe, links √ % ⌫ C; rechts unten 4 × 4 das gemeinsame Ziffernfeld (Rechenzeichen rechts, , 0 =)
  const rand = [...R_TASTEN[0].map((t, sp) => ({ t, x: F.x + sp * tw, y: F.y, w: tw, h: th })),
    ...R_TASTEN.slice(1).map((z, ze) => ({ t: z[0], x: F.x, y: F.y + (ze + 1) * th, w: tw, h: th }))];
  for (const k of rand) braunKnopf(g, k.x, k.y, k.w, k.h, tastenText(k.t), R_ROLLE(k.t), { rund: true });
  const kern = ziffernfeld(g, { x: F.x + tw, y: F.y + th, w: 4 * tw, h: 4 * th }, ['÷', '×', '−', '+'], ',', '=');
  for (const k of [...rand, ...kern]) p.felder.push(`knopf ${feldZuDisplay(k, hoch)} taste ${liste.indexOf(k.t)}`);
  // „.“, „E“, „o“ (mit „r“): Englisch zeigt die Firmware Punkt statt Komma und „Error“ statt „Fehler“ (FW 0.32.0)
  const glyphen = [...'0123456789,-+eFhlrM.Eo', ' '];
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
  const p = seite(hoch, T('Umrechner', 'Converter'), T('rechnet im Sticky · ▲▼ = blättern · KI = Home', 'runs on the Sticky · ▲▼ = scroll · AI = Home'));
  const { g } = p;
  const A = hoch ? { x: 16, y: 48, w: 448, h: 96 } : { x: 16, y: 44, w: 768, h: 72 };
  const Z = hoch ? { w: 18, h: 48 } : { w: 24, h: 48 };
  const n = Math.floor((A.w - 16) / Z.w);
  const tx = (A.x + A.w - 8 - n * Z.w) & ~7, ty = hoch ? 72 : A.y + 12;
  fenster(g, A.x, A.y, A.w, A.h);
  const L = hoch ? { x: 16, y: 152, w: 448, h: 256 } : { x: 16, y: 124, w: 280, h: 352 };
  const TF = hoch ? { x: 16, y: 416, w: 448, h: 368 } : { x: 304, y: 124, w: 480, h: 352 };   // Tastenfeld (T ist die Übersetzung)
  const zeilen = Math.ceil(PAARE.length / 2), lw = L.w / 2, lh = L.h / zeilen;
  PAARE.forEach((pa, i) => {
    const x = L.x + (i % 2) * lw, y = L.y + Math.floor(i / 2) * lh;
    braunKnopf(g, x, y, lw, lh, `${pa.a}↔${pa.b}`, 'neben', { rand: 6, gr: 22 });
    const d = zuDisplay({ x: Math.round(x), y: Math.round(y), w: Math.round(lw), h: Math.round(lh) }, hoch);
    p.felder.push(`knopf ${d.x} ${d.y} ${d.x + d.w} ${d.y + d.h} paar ${i}`);
  });
  // gemeinsames Ziffernfeld: rechts C, ⌫ und ⇄ (über zwei Reihen, an der Stelle von OK bei „Ziffern“), links der 0 ±
  const kern = ziffernfeld(g, TF, ['C', '⌫', '⇄'], '±', ',');
  const liste = kern.map((k) => k.t);
  for (const k of kern) p.felder.push(`knopf ${feldZuDisplay(k, hoch)} taste ${liste.indexOf(k.t)}`);
  // Glyphen: Ziffern, Zeichen und alle Buchstaben der Einheiten (°, /)
  const einheiten = new Set(PAARE.flatMap((pa) => [...pa.a, ...pa.b]));
  const glyphen = [...new Set([...'0123456789,-=', ...einheiten, ...'Fehlr', ...'.Eo', ' '])];   // .Eo(r): Englisch, s. Rechner
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

// ---- Weltzeit und Wecker (FW ≥ 0.29.0) ------------------------------------------------------------------------------

/** Versatz einer Zeitzone zu UTC in Minuten, jetzt (mit Sommerzeit) – die App kennt das, der Sticky addiert nur */
export function versatzMin(zone, wann = new Date()) {
  const teile = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric',
    day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(wann).map((t) => [t.type, t.value]));
  const dort = Date.UTC(+teile.year, teile.month - 1, +teile.day, +teile.hour, +teile.minute);
  return Math.round((dort - Math.floor(wann.getTime() / 60000) * 60000) / 60000);
}
/** Standard-Städte: Lebensstationen (Kürzel wie auf dem Weltzeitring) */
const stadt = (kurzDe, kurzEn, nameDe, nameEn, zone) => ({ get kurz() { return T(kurzDe, kurzEn); }, get name() { return T(nameDe, nameEn); }, zone });
export const STAEDTE = [
  stadt('HIER', 'HOME', 'Zuhause', 'Home', 'Europe/Berlin'),
  stadt('TYO', 'TYO', 'Tokio', 'Tokyo', 'Asia/Tokyo'),
  stadt('NYC', 'NYC', 'New York', 'New York', 'America/New_York'),
  stadt('LAX', 'LAX', 'Los Angeles', 'Los Angeles', 'America/Los_Angeles'),
];

/** Weltzeit: je Stadt Kürzel und Name links, Uhrzeit mit ☀/☾ rechts (der Sticky zählt jede Minute selbst weiter) */
export function weltzeitWidget(hoch = false, staedte = STAEDTE) {
  const p = seite(hoch, T('Weltzeit', 'World clock'), T('zählt selbst weiter · ▲▼ = blättern · KI = Home', 'runs on the Sticky · ▲▼ = scroll · AI = Home'));
  // Hinweis gekürzt: vorher bis x 532, lief unter die Statuszeile (ab x 512)
  const { g } = p;
  const Z = { w: 40, h: 64 }, n = 8;                   // „23:52 ☾“ bzw. 12 h „11:52p ☾“
  const glyphen = [...'0123456789:ap', ' ', '☀', '☾'];
  const zeilen = [];
  staedte.slice(0, 4).forEach((s, i) => {
    const y = hoch ? 56 + i * 184 : 52 + i * 106;
    g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.font = `500 44px ${FONT}`; g.fillText(s.kurz, 24, y + 6);
    g.font = `400 20px ${FONT}`; g.fillText(s.name, 24, y + 56);
    if (i) { g.fillRect(16, y - 6, p.W - 32, 1); }
    const tx = (p.W - 24 - n * Z.w) & ~7, ty = hoch ? (y + 96) & ~7 : y + 14;
    const z = p.ziffernPos(tx, ty, Z.w);
    zeilen.push(`stadt ${versatzMin(s.zone)}`, `text ${z.x} ${z.y} ${n}`);
  });
  p.felder.unshift('typ weltzeit', hoch ? `ziffern ${Z.h} ${Z.w}` : `ziffern ${Z.w} ${Z.h}`, ...(hoch ? [`schritt 0 ${-Z.w}`] : []),
    `glyphen ${glyphen.map((x) => (x === ' ' ? '_' : x)).join(' ')}`, ...zeilen);
  return [
    { n: 'ziffern.bin', daten: textBlatt(Z.w, Z.h, glyphen, hoch) },
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

/** Wecker: Weckzeit groß, darunter an/aus, Knöpfe ±1 h, ±10 min, ±1 min und An/Aus (der Sticky merkt sich die Zeit) */
export function weckerWidget(hoch = false) {
  const p = seite(hoch, T('Wecker', 'Alarm'), T('klingelt auch im Schlummer · jede Taste stellt ab', 'rings even when asleep · any key stops it'));
  const { g } = p;
  const Z = { w: 64, h: 96 }, Zk = Z;   // ein Glyphenblatt je Widget: „an/aus“ bzw. „on/off“ in derselben Zellgröße
  const glyphen = [...'0123456789:ansupof', ' '];   // o, f: Englisch „on“/„off“ (FW 0.32.0)
  const tx = ((p.W - 6 * Z.w) / 2) & ~7, ty = hoch ? 64 : 56;   // 6 Zellen: 12 h „12:30p“
  const kx = ((p.W - 3 * Zk.w) / 2) & ~7, ky = hoch ? 168 : 160;
  const z = p.ziffernPos(tx, ty, Z.w), zk = p.ziffernPos(kx, ky, Zk.w);
  const knoepfe = hoch
    ? [[16, 280, 240, 410, '− 1 h', 2], [240, 280, 464, 410, '+ 1 h', 1], [16, 410, 240, 540, '− 10', 4], [240, 410, 464, 540, '+ 10', 3],
      [16, 540, 240, 670, '− 1', 6], [240, 540, 464, 670, '+ 1', 5]]
    : [[16, 264, 144, 368, '− 1 h', 2], [144, 264, 272, 368, '+ 1 h', 1], [272, 264, 400, 368, '− 10', 4], [400, 264, 528, 368, '+ 10', 3],
      [528, 264, 656, 368, '− 1', 6], [656, 264, 784, 368, '+ 1', 5]];
  knoepfe.forEach(([x0, y0, x1, y1, t, c]) => p.k(x0, y0, x1, y1, t, `weck ${c}`, 'werkzeug', 30));
  const anAus = T('An / Aus', 'On / Off');
  if (hoch) p.k(16, 684, 464, 790, anAus, 'weck 9', 'haupt', 36); else p.k(16, 372, 784, 472, anAus, 'weck 9', 'haupt', 36);
  p.felder.unshift('typ wecker', hoch ? `ziffern ${Z.h} ${Z.w}` : `ziffern ${Z.w} ${Z.h}`, ...(hoch ? [`schritt 0 ${-Z.w}`] : []),
    `glyphen ${glyphen.map((x) => (x === ' ' ? '_' : x)).join(' ')}`, `text ${z.x} ${z.y} 6`, `text ${zk.x} ${zk.y} 3`);
  return [
    { n: 'ziffern.bin', daten: textBlatt(Z.w, Z.h, glyphen, hoch) },
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

/**
 * Einstellungen am Sticky (FW ≥ 0.31.0): umschaltbar ohne Handy; „auto“ = wie das Handy.
 * Zeile 1 Uhrzeit-Format (set 1), Zeile 2 Einheiten (set 2), Zeile 3 Sprache (set 3: auto → DE → EN, FW ≥ 0.32.0),
 * darunter Uhr stellen für den Notfall (set 11–26).
 * Textfelder in dieser Reihenfolge: 0 Format, 1 Datum/Uhrzeit, 2 Einheiten, 3 Sprache (so liest sie firmware-ble/widget.h;
 * die Firmware setzt „auto“, „12 h“, „metr“, „US“, „DE“, „EN“, „TT.MM.JJ hh:mm“ selbst aus dem Glyphenblatt).
 * Hochkant (Lage „auto“ → widgets/einstellungen-h): kleinere Zellen, damit die 14 Zellen der Uhrzeit in 448 px passen.
 */
export function einstellungenWidget(hoch = false, handy12 = false, handyUs = false) {
  const p = seite(hoch, T('Einstellungen', 'Settings'), T('gelten sofort, auch ohne Handy · ▲+▼ = Hilfe', 'apply at once, even without phone · ▲+▼ = Help'));
  const { g } = p;
  const Z = hoch ? { w: 30, h: 48 } : { w: 40, h: 56 };   // hochkant: Zellhöhe Vielfaches von 8 (wird Display-Breite)
  // alles, was die Firmware hier in beiden Sprachen schreibt: auto, 12 h/24 h, metr, US, DE, EN, an/aus, on/off, Datum
  const glyphen = [...'0123456789:.-autohmerUSDENnsf', ' '];
  const zeilen = [
    { titel: T('Uhrzeit', 'Time'), unter: T(`auto = wie das Handy (${handy12 ? '12 h' : '24 h'})`, `auto = like the phone (${handy12 ? '12 h' : '24 h'})`), set: 1 },
    { titel: T('Einheiten', 'Units'), unter: T(`°C/°F, Lineal · auto = ${handyUs ? 'US' : 'metrisch'}`, `°C/°F, ruler · auto = ${handyUs ? 'US' : 'metric'}`), set: 2 },
    { titel: T('Sprache', 'Language'), unter: T(`auto = wie die App (${appIstEn() ? 'Englisch' : 'Deutsch'})`, `auto = like the app (${appIstEn() ? 'English' : 'German'})`), set: 3 },
  ];
  const kasten = (x, y, n) => { g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeRect(x - 8, y - 2, n * Z.w + 16, Z.h + 4); };
  const aendern = T('ändern', 'change');
  // L: Lage der drei Zeilen (y0 je Zeile, Titel/Unterzeile relativ, Kasten und Knopf), Uhr stellen und Tastenraster
  const L = hoch
    ? { y0: [44, 164, 284], unterY: 34, kx: 32, ky: 60, knopf: [232, 52, 464, 116], linie: 412, uhrY: 420, dx: 30, dy: 448,
      tasten: { x: 16, y: 504, sp: 3, w: 448 / 3, h: 73 } }
    : { y0: [40, 108, 176], unterY: 36, kx: 336, ky: 4, knopf: [560, 0, 784, 64], linie: 246, uhrY: 256, dx: 208, dy: 254,
      tasten: { x: 16, y: 322, sp: 6, w: 128, h: 78 } };
  const pos = [];   // Textfelder in der Reihenfolge der Zeilen (Format, Einheiten, Sprache)
  zeilen.forEach((z, i) => {
    const y0 = L.y0[i];
    g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.font = `500 26px ${FONT}`; g.fillText(z.titel, 24, y0 + 4);
    g.font = `400 15px ${FONT}`; g.fillText(z.unter, 24, y0 + L.unterY);
    const ky = y0 + L.ky;   // hochkant: logisch y wird Display-x, darum Vielfache von 8 (104, 224, 344)
    kasten(L.kx, ky, 4);
    pos.push(p.ziffernPos(L.kx, ky, Z.w));
    p.k(L.knopf[0], y0 + L.knopf[1], L.knopf[2], y0 + L.knopf[3], aendern, `set ${z.set}`, 'werkzeug', 26);
  });
  g.fillRect(16, L.linie, p.W - 32, 1);
  g.font = `500 22px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = '#000';
  if (hoch) g.fillText(T('Uhr stellen', 'Set clock'), 24, L.uhrY);
  else { g.fillText(T('Uhr', 'Set'), 24, L.uhrY); g.font = `400 16px ${FONT}`; g.fillText(T('stellen', 'clock'), 24, L.uhrY + 28); }
  const datum = p.ziffernPos(L.dx, L.dy, Z.w);
  // Tasten: quer zwei Reihen à 6 (wie bisher), hochkant vier Reihen à 3 (Spalten h | 10 min | 1 min bzw. Tag | Monat | Jahr)
  const tasten = hoch
    ? [['− 1 h', 12], ['− 10', 14], ['− 1', 16], ['+ 1 h', 11], ['+ 10', 13], ['+ 1', 15],
      [T('− Tag', '− Day'), 22], ['− Mon', 24], [T('− Jahr', '− Year'), 26], [T('+ Tag', '+ Day'), 21], ['+ Mon', 23], [T('+ Jahr', '+ Year'), 25]]
    : [['− 1 h', 12], ['+ 1 h', 11], ['− 10', 14], ['+ 10', 13], ['− 1', 16], ['+ 1', 15],
      [T('− Tag', '− Day'), 22], [T('+ Tag', '+ Day'), 21], ['− Mon', 24], ['+ Mon', 23], [T('− Jahr', '− Year'), 26], [T('+ Jahr', '+ Year'), 25]];
  const R = L.tasten;
  tasten.forEach(([t, c], i) => {
    const x = Math.round(R.x + (i % R.sp) * R.w), y = R.y + Math.floor(i / R.sp) * R.h;
    p.k(x, y, Math.round(x + R.w), y + R.h, t, `set ${c}`, 'neben', 22);
  });
  // Textfelder: 0 = Format, 1 = Datum/Uhrzeit (14 Zellen), 2 = Einheiten, 3 = Sprache (neu in FW 0.32.0, hinten angehängt)
  p.felder.unshift('typ einstellungen', hoch ? `ziffern ${Z.h} ${Z.w}` : `ziffern ${Z.w} ${Z.h}`, ...(hoch ? [`schritt 0 ${-Z.w}`] : []),
    `glyphen ${glyphen.map((x) => (x === ' ' ? '_' : x)).join(' ')}`,
    `text ${pos[0].x} ${pos[0].y} 4`, `text ${datum.x} ${datum.y} 14`, `text ${pos[1].x} ${pos[1].y} 4`, `text ${pos[2].x} ${pos[2].y} 4`);
  return [
    { n: 'ziffern.bin', daten: textBlatt(Z.w, Z.h, glyphen, hoch) },
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

/** Zoll-Fassung (Einheiten US am Sticky): Striche alle 1/16″, Zahl je Zoll; der Sticky nimmt widgets/lineal-us/ */
function linealZoll(pxmm) {
  const pxz = pxmm * 25.4;
  const p = seite(false, T('Lineal', 'Ruler'), T('0 = Ecke links unten · Zoll', '0 = bottom left corner · inches'));
  const { g } = p;
  p.felder.push('typ menue');
  const x0 = 8, y0 = HOEHE - 8;
  g.strokeStyle = '#000'; g.fillStyle = '#000';
  const strich = (s) => (s % 16 === 0 ? 46 : s % 8 === 0 ? 34 : s % 4 === 0 ? 26 : s % 2 === 0 ? 18 : 11);
  g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0 + 1); g.lineTo(BREITE, y0 + 1); g.stroke();
  for (let s = 0; x0 + s * pxz / 16 <= BREITE - 2; s++) {
    const x = Math.round(x0 + s * pxz / 16) + 0.5;
    g.lineWidth = s % 16 === 0 ? 3 : 1.5;
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 - strich(s)); g.stroke();
    if (s % 16 === 0 && s > 0) { g.font = `500 26px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(String(s / 16), x, y0 - 50); }
  }
  g.lineWidth = 2; g.beginPath(); g.moveTo(x0 - 1, y0); g.lineTo(x0 - 1, 40); g.stroke();
  for (let s = 1; y0 - s * pxz / 16 >= 44; s++) {
    const y = Math.round(y0 - s * pxz / 16) + 0.5;
    g.lineWidth = s % 16 === 0 ? 3 : 1.5;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + strich(s), y); g.stroke();
    if (s % 16 === 0) { g.font = `500 26px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(String(s / 16), x0 + 54, y); }
  }
  g.font = `400 20px ${FONT}`; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillText('in', BREITE - 16, y0 - 100);
  return [
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

// ---- Kleine Eingaben (SPEC „Kleine Eingaben“, Art „Ziffern“, FW ≥ 0.35.0) -----------------------------------------
// Seiten der Widget-Maschine, die eine andere Seite kurz öffnet (firmware-ble/eingabe.h): die Firmware nimmt Tasten an,
// setzt die Eingabezeile ein und gibt das Ergebnis ans Ziel zurück.

/** Ja/Nein: Frage groß, darunter was gemeint ist (Textfeld 0, von der Firmware), zwei große Pillen; ▲ = Ja, ▼ = Nein */
export function janeinWidget(titel, frage, hoch = false) {
  const p = seite(hoch, titel, T('▲ = Ja · ▼ = Nein · KI = abbrechen', '▲ = yes · ▼ = no · AI = cancel'));
  const { g } = p;
  const Z = { w: 40, h: 64 }, n = 10, glyphen = [...'0123456789:map', ' '];
  g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `500 ${hoch ? 40 : 44}px ${FONT}`;
  g.fillText(frage, p.W / 2, hoch ? 150 : 104);
  const tx = ((p.W - n * Z.w) / 2) & ~7, ty = hoch ? 216 : 152;
  const z = p.ziffernPos(tx, ty, Z.w);
  if (hoch) { p.k(16, 330, 464, 550, T('Ja', 'Yes'), 'ja', 'haupt', 48); p.k(16, 570, 464, 790, T('Nein', 'No'), 'nein', 'neben', 48); }
  else { p.k(16, 252, 392, 468, T('Ja', 'Yes'), 'ja', 'haupt', 48); p.k(408, 252, 784, 468, T('Nein', 'No'), 'nein', 'neben', 48); }
  p.felder.unshift('typ janein', hoch ? `ziffern ${Z.h} ${Z.w}` : `ziffern ${Z.w} ${Z.h}`, ...(hoch ? [`schritt 0 ${-Z.w}`] : []),
    `glyphen ${glyphen.map((x) => (x === ' ' ? '_' : x)).join(' ')}`, `text ${z.x} ${z.y} ${n}`, 'taste up ja', 'taste down nein');
  return [
    { n: 'ziffern.bin', daten: textBlatt(Z.w, Z.h, glyphen, hoch) },
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

/**
 * Ziffern (Num-Pad, ET66-Stil): runde schwarze Tasten 7-8-9 oben wie beim Rechner, 0 unten in der Mitte; rechts die
 * Sondertaste des Ziels (gerastert), darunter ← (lang = alles weg) und OK als Doppelring. Liefert nur die Zahl, rechnet nicht.
 * sonder: „,“ Zahlen · „+“ Telefon · „#“ Codes · „-“ negativ · „:“ Minuten:Sekunden (Timer); max = Stellen
 */
export function ziffernWidget(titel, hinweis, sonder = '', max = 6, hoch = false) {
  const p = seite(hoch, titel, hinweis);
  const { g } = p;
  const A = hoch ? { x: 16, y: 48, w: 448, h: 112 } : { x: 16, y: 44, w: 768, h: 84 };
  const Z = hoch ? { w: 32, h: 72 } : { w: 40, h: 64 }, n = 12;
  const tx = (A.x + A.w - 24 - n * Z.w) & ~7, ty = hoch ? 72 : A.y + 10;
  fenster(g, A.x, A.y, A.w, A.h);
  // gemeinsames Ziffernfeld (wie Rechner/Umrechner): rechts Sondertaste des Ziels, ⌫ (lang = alles weg), OK über zwei Reihen
  const F = hoch ? { x: 16, y: 176, w: 448, h: 608 } : { x: 16, y: 136, w: 768, h: 336 };
  const sonderText = sonder === '-' ? '±' : sonder;   // „,“ zeigt tastenText auf Englisch als „.“
  const aktion = { '⌫': 'zurueck', OK: 'ok', [sonderText]: 'sonder' };
  for (const k of ziffernfeld(g, F, [sonderText, '⌫', 'OK'])) p.felder.push(`knopf ${feldZuDisplay(k, hoch)} ${/^\d$/.test(k.t) ? `ziffer ${k.t}` : aktion[k.t]}`);
  const glyphen = [...new Set([...'0123456789.', ...(sonder || ''), ' '])];
  const z = p.ziffernPos(tx, ty, Z.w);
  p.felder.unshift('typ ziffern', hoch ? `ziffern ${Z.h} ${Z.w}` : `ziffern ${Z.w} ${Z.h}`, ...(hoch ? [`schritt 0 ${-Z.w}`] : []),
    `glyphen ${glyphen.map((x) => (x === ' ' ? '_' : x)).join(' ')}`, `text ${z.x} ${z.y} ${n}`, `max ${max}`, ...(sonder ? [`sonder ${sonder}`] : []));
  return [
    { n: 'ziffern.bin', daten: textBlatt(Z.w, Z.h, glyphen, hoch) },
    { n: 'bild.bin', daten: p.bild() },
    { n: 'felder.txt', daten: text(p.felder) },
  ];
}

/** Eingabe-Seiten je Ziel (Namen ≤ 15 Zeichen, so öffnet sie eingabe.h) */
export const EINGABEN = {
  'zf-timer': (h = false) => ziffernWidget(T('Timer · eigene Zeit', 'Timer · own time'), T('Minuten, mit „:“ auch Sekunden · KI = abbrechen', 'minutes, with “:” also seconds · AI = cancel'), ':', 4, h),
  'jn-rec': (h = false) => janeinWidget('Recorder', T('Aufnahme löschen?', 'Delete recording?'), h),
};

export const WIDGETS = { timer: timerWidget, waage: waageWidget, lineal: () => linealWidget(linealEcht()), rechner: rechnerWidget, umrechner: umrechnerWidget,
  weltzeit: weltzeitWidget, wecker: weckerWidget, recorder: recorderWidget, ...EINGABEN, einstellungen: (h = false) => einstellungenWidget(h, HANDY_12H, HANDY_US),
  'lineal-us': () => linealWidget(linealEcht(), true) };
/** Kalibrierung aus der App (Mehr → Lineal): so viele echte mm misst die 80-mm-Marke */
function linealEcht() { try { return parseFloat(localStorage.getItem(schluessel('lineal80'))) || 80; } catch { return 80; } }
