// Home (Markus, 11.11.2026): Visitenkarte hochkant mit Uhrzeit. Die App rendert Karte und Ziffern einmalig, der Sticky
// setzt die Uhr jede Minute selbst aus dem Ziffernblatt zusammen (firmware-ble/modus.h) – auch ohne Handy.
// Gleiche Lage wie die Notiz-Seite: Tasten oben rechts, USB unten.
import { uhrzeit } from './zeit.js';
import qrcode from 'qrcode-generator';
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';
import { drehe, PB, PH } from './fahrtseite.js';
import { wetterZeile } from './wetter.js';
import { T, lang } from './uebersetzen.js';
/** °F statt °C (Einheit am Sticky bzw. vom Handy, FW ≥ 0.31.0) */
let einheitUs = false;
export const setzeEinheitUs = (v) => { einheitUs = !!v; };

export const KARTE = { name: 'Markus', qr: 'https://github.com/markussstaub-dot', zeile: 'github.com/markussstaub-dot' };

// Uhrfeld hochkant: 5 Felder à 80 × 112 ab x = 40, y = 352 („HH:MM“). Muss zu firmware-ble/modus.h passen.
export const UHR = { x: 40, y: 352, feldB: 80, h: 112 };
const ZEICHEN = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', 'PM:'];   // PM: Doppelpunkt mit „PM“ für 12 h (FW ≥ 0.30.0)

const leinwand = (b, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b, h) : Object.assign(document.createElement('canvas'), { width: b, height: h }));

/** Home-Karte (Uhrfeld bleibt leer) gedreht in den 800×480-Kontext g; mit beispielZeit zur Vorschau gefüllt */
export function zeichneHome(g, karte = KARTE, beispielZeit = null, wetter = null) {
  const c = homeHochkant(karte, beispielZeit, wetter);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  drehe(c, g, PB, PH);
}

/** Home-Karte hochkant (480×800), wie man sie am Sticky sieht – für die Vorschau in der App */
export function homeHochkant(karte = KARTE, beispielZeit = null, wetter = null) {
  const c = leinwand(PB, PH);
  const p = c.getContext('2d');
  p.fillStyle = '#fff';
  p.fillRect(0, 0, PB, PH);
  p.fillStyle = '#000';
  p.textAlign = 'center';
  p.textBaseline = 'middle';
  let gr = 84;
  do { p.font = `bold ${gr}px system-ui, sans-serif`; gr -= 4; } while (p.measureText(karte.name).width > PB - 60 && gr > 30);
  p.fillText(karte.name, PB / 2, 92);
  p.fillRect(60, 160, PB - 120, 4);
  p.font = '22px system-ui, sans-serif';
  p.fillText(T('▲▼ blättern · ▼ lang = weiter', '▲▼ scroll · hold ▼ = next'), PB / 2, 192);
  p.fillText(T('KI = Home · KI halten = Diktat', 'AI = Home · hold AI = dictate'), PB / 2, 220);
  // Datum (Markus, 12.11.2026); um Mitternacht schickt der Abgleich im Stundenfenster die neue Karte
  p.font = 'bold 30px system-ui, sans-serif';
  p.fillText(new Date().toLocaleDateString(lang(), { weekday: 'long', day: 'numeric', month: 'long' }), PB / 2, 260);
  // Wetter zwischen Datum und Uhr (Uhrfeld beginnt bei y = 352)
  const zeile = wetterZeile(wetter, einheitUs);
  if (zeile) {
    let gr = 26;
    do { p.font = `${gr}px system-ui, sans-serif`; gr -= 2; } while (p.measureText(zeile).width > PB - 30 && gr > 16);
    p.fillText(zeile, PB / 2, 300);
    p.font = '16px system-ui, sans-serif';
    p.fillText(T(`Wetter, Stand ${uhrzeit(wetter.zeit)}`, `Weather as of ${uhrzeit(wetter.zeit)}`), PB / 2, 330);
  }
  // QR-Code unter der Uhr (nur mit Link; Multiclient: weitere Stickys haben erst einmal keinen)
  if (!karte.qr) { if (beispielZeit) zeichneZeit(p, beispielZeit); return c; }
  const qr = qrcode(0, 'M');
  qr.addData(karte.qr);
  qr.make();
  const n = qr.getModuleCount();
  const feld = 196;
  const m = Math.floor(feld / (n + 2));
  const qx = Math.round((PB - n * m) / 2), qy = 492;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) p.fillRect(qx + x * m, qy + y * m, m, m);
  p.font = '20px system-ui, sans-serif';
  p.fillText(karte.zeile ?? '', PB / 2, qy + n * m + 22);
  if (beispielZeit) zeichneZeit(p, beispielZeit);
  return c;
}

function zeichneZiffer(p, z, x, y) {
  p.fillStyle = '#000';
  p.textAlign = 'center';
  p.textBaseline = 'middle';
  if (z === 'PM:') {                       // Doppelpunkt etwas tiefer, „PM“ klein darüber (wie der PM-Punkt am Radiowecker)
    p.font = 'bold 96px system-ui, sans-serif';
    p.fillText(':', x + UHR.feldB / 2, y + UHR.h / 2 + 14);
    p.font = 'bold 22px system-ui, sans-serif';
    p.fillText('PM', x + UHR.feldB / 2, y + 16);
    return;
  }
  p.font = `bold ${z === ':' ? 96 : 104}px system-ui, sans-serif`;
  p.fillText(z, x + UHR.feldB / 2, y + UHR.h / 2 + 4);
}

/** Nur für die Vorschau in der App: „21:47“ ins Uhrfeld eines hochkant-Kontexts */
function zeichneZeit(p, text) {
  [...text].forEach((z, k) => zeichneZiffer(p, z, UHR.x + k * UHR.feldB, UHR.y));
}

/** Ziffernblatt: Zeichen z liegt gedreht bei Display x = (z / 6 | 0) * 112, Zeilen (z % 6) * 80 */
/**
 * Glyphen der Statuszeile (firmware-ble/status.h): 336 × 32, Ziffern 0–9 je 16 breit, „:“ bei 160, dann je 32 breit
 * Handy, Zzz, Notiz, Tropfen, Thermometer. Einmal quer (Zeilen à 42 Byte) und einmal gedreht für hochkante Seiten.
 * → { quer, hoch } als 1 bpp
 */
export function statusGlyphen() {
  const B = 368, H = 32;   // ab FW 0.30.0 mit „a“ und „p“ (12 h) bei 336 und 352
  const c = leinwand(B, H);
  const p = c.getContext('2d');
  p.fillStyle = '#fff';
  p.fillRect(0, 0, B, H);
  p.fillStyle = '#000';
  p.strokeStyle = '#000';
  p.textAlign = 'center';
  p.textBaseline = 'middle';
  p.font = 'bold 25px system-ui, sans-serif';
  for (let i = 0; i <= 9; i++) p.fillText(String(i), i * 16 + 8, 17);
  p.fillText(':', 168, 15);
  p.lineWidth = 3;
  // Handy
  p.beginPath(); p.roundRect(186, 4, 13, 24, 3); p.stroke(); p.fillRect(190, 23, 5, 2);
  // Zzz
  p.font = 'bold 15px system-ui, sans-serif';
  p.fillText('z', 214, 22); p.fillText('z', 223, 15); p.font = 'bold 19px system-ui, sans-serif'; p.fillText('Z', 233, 9);
  // Notiz: Blatt mit Zeilen
  p.strokeRect(246, 5, 18, 22); p.fillRect(250, 11, 10, 2); p.fillRect(250, 16, 10, 2); p.fillRect(250, 21, 7, 2);
  // Tropfen (Beschlag)
  p.beginPath(); p.moveTo(288, 4); p.bezierCurveTo(281, 14, 278, 19, 278, 22); p.arc(288, 21, 10, Math.PI, 0, true); p.bezierCurveTo(298, 19, 295, 14, 288, 4); p.fill();
  // Thermometer (Laden zu kalt/heiß)
  p.beginPath(); p.roundRect(316, 3, 8, 20, 4); p.stroke(); p.beginPath(); p.arc(320, 25, 5, 0, Math.PI * 2); p.fill(); p.fillRect(318, 10, 4, 14);
  // a / p für 12 h
  p.font = 'bold 21px system-ui, sans-serif';
  p.fillText('a', 344, 17); p.fillText('p', 360, 16);
  const quer = rgbaZu1bpp(p.getImageData(0, 0, B, H).data, B, H);
  const d = leinwand(H, B);
  const q = d.getContext('2d');
  q.fillStyle = '#fff';
  q.fillRect(0, 0, H, B);
  drehe(c, q, B, H);
  const hoch = rgbaZu1bpp(q.getImageData(0, 0, H, B).data, H, B);
  return { quer, hoch };
}

export function zeichneZiffern(g) {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  ZEICHEN.forEach((z, i) => {
    const c = leinwand(UHR.feldB, UHR.h);
    const p = c.getContext('2d');
    p.fillStyle = '#fff';
    p.fillRect(0, 0, UHR.feldB, UHR.h);
    zeichneZiffer(p, z, 0, 0);
    const d = leinwand(UHR.h, UHR.feldB);
    const q = d.getContext('2d');
    drehe(c, q, UHR.feldB, UHR.h);
    g.drawImage(d, Math.floor(i / 6) * UHR.h, (i % 6) * UHR.feldB);
  });
}
