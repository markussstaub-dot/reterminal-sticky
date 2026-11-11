// Home (Markus, 11.11.2026): Visitenkarte hochkant mit Uhrzeit. Die App rendert Karte und Ziffern einmalig, der Sticky
// setzt die Uhr jede Minute selbst aus dem Ziffernblatt zusammen (firmware-ble/modus.h) – auch ohne Handy.
// Gleiche Lage wie die Notiz-Seite: Tasten oben rechts, USB unten.
import qrcode from 'qrcode-generator';
import { BREITE, HOEHE } from './protokoll.js';
import { drehe, PB, PH } from './fahrtseite.js';

export const KARTE = { name: 'Markus', qr: 'https://github.com/markussstaub-dot', zeile: 'github.com/markussstaub-dot' };

// Uhrfeld hochkant: 5 Felder à 80 × 112 ab x = 40, y = 352 („HH:MM“). Muss zu firmware-ble/modus.h passen.
export const UHR = { x: 40, y: 352, feldB: 80, h: 112 };
const ZEICHEN = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':'];

const leinwand = (b, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b, h) : Object.assign(document.createElement('canvas'), { width: b, height: h }));

/** Home-Karte (Uhrfeld bleibt leer) gedreht in den 800×480-Kontext g; mit beispielZeit zur Vorschau gefüllt */
export function zeichneHome(g, karte = KARTE, beispielZeit = null) {
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
  p.fillText('KI = Notiz · ▲ = Bordbuch', PB / 2, 205);
  p.fillText('KI halten = Diktat', PB / 2, 238);
  // QR-Code unter der Uhr
  const qr = qrcode(0, 'M');
  qr.addData(karte.qr);
  qr.make();
  const n = qr.getModuleCount();
  const feld = 196;
  const m = Math.floor(feld / (n + 2));
  const qx = Math.round((PB - n * m) / 2), qy = 492;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) p.fillRect(qx + x * m, qy + y * m, m, m);
  p.font = '20px system-ui, sans-serif';
  p.fillText(karte.zeile, PB / 2, qy + n * m + 22);
  if (beispielZeit) zeichneZeit(p, beispielZeit);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  drehe(c, g, PB, PH);
}

function zeichneZiffer(p, z, x, y) {
  p.fillStyle = '#000';
  p.textAlign = 'center';
  p.textBaseline = 'middle';
  p.font = `bold ${z === ':' ? 96 : 104}px system-ui, sans-serif`;
  p.fillText(z, x + UHR.feldB / 2, y + UHR.h / 2 + 4);
}

/** Nur für die Vorschau in der App: „21:47“ ins Uhrfeld eines hochkant-Kontexts */
function zeichneZeit(p, text) {
  [...text].forEach((z, k) => zeichneZiffer(p, z, UHR.x + k * UHR.feldB, UHR.y));
}

/** Ziffernblatt: Zeichen z liegt gedreht bei Display x = (z / 6 | 0) * 112, Zeilen (z % 6) * 80 */
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
