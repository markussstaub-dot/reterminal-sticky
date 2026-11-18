// Sticky-Seiten für Listen und Strichcodes (SPEC „Zettel überarbeiten …“, 18.11.2026). Quer wie die anderen Zettel.
// Liste: große Zeilen mit Kästchen. Abgehakt = Kästchen voll schwarz und ein Strich durch den Text, beides als
// Umkehrung (XOR) gezeichnet – so kann die Firmware beim Abhaken am Sticky genau dieselben Rechtecke umkehren und
// trifft das Bild der App Pixel für Pixel (Felder in /soll/home/zettel.txt, siehe zettelFelder).
import { BREITE, HOEHE } from './protokoll.js';
import { BRAUN_FONT } from './braun.js';
import { T } from './uebersetzen.js';
import { strichModule, strichNummer } from './strichcode.js';
import { zeichneKarte } from './karten.js';
import { zeichneZettel } from './bestellung.js';

function kopf(g, titel, nr, von) {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  g.fillStyle = '#000';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = `500 26px ${BRAUN_FONT}`;
  g.fillText(titel, 24, 30);
  g.textAlign = 'right';   // rechts oben sitzt die Statuszeile des Sticky, der Zähler darunter
  g.font = `16px ${BRAUN_FONT}`;
  g.fillText(T(`Zettel ${nr}/${von}`, `Card ${nr}/${von}`), BREITE - 24, 44);
  g.fillRect(24, 54, BREITE - 48, 3);
}

/** Rechteck umkehren (schwarz ↔ weiß) */
function umkehren(g, x0, y0, x1, y1) {
  g.save();
  g.globalCompositeOperation = 'difference';
  g.fillStyle = '#fff';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.restore();
}

/**
 * Liste mit Kästchen → Zeilen-Geometrie [{ ab, x0, y0, x1, y1, box: [x0,y0,x1,y1], strich: [x0,y0,x1,y1] }]
 * (box = Innenfläche des Kästchens, strich = Band durch den Text; beide werden beim Abhaken umgekehrt)
 */
export function zeichneListe(g, z, nr, von) {
  kopf(g, z.titel, nr, von);
  const p = z.punkte ?? [];
  const spalten = p.length > 8 ? 2 : 1;
  const proSpalte = Math.max(1, Math.ceil(p.length / spalten));
  const oben = 66, unten = HOEHE - 8;
  const zeileH = Math.floor(Math.min(84, (unten - oben) / proSpalte));
  const spalteB = Math.floor((BREITE - 32) / spalten);
  const box = Math.max(18, Math.min(40, Math.round(zeileH * 0.55)));
  let gr = Math.max(16, Math.min(40, Math.round(zeileH * 0.5)));
  const textB = spalteB - box - 40;
  g.font = `500 ${gr}px ${BRAUN_FONT}`;
  while (gr > 16 && Math.max(0, ...p.map((x) => g.measureText(x.text).width)) > textB) { gr -= 2; g.font = `500 ${gr}px ${BRAUN_FONT}`; }
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  return p.map((x, i) => {
    const sp = Math.floor(i / proSpalte), r = i % proSpalte;
    const x0 = 16 + sp * spalteB, y0 = oben + r * zeileH, y1 = y0 + zeileH, ym = Math.round(y0 + zeileH / 2);
    const bx = x0 + 10, by = Math.round(ym - box / 2), rand = 3;
    g.fillStyle = '#000';
    g.fillRect(bx, by, box, rand); g.fillRect(bx, by + box - rand, box, rand);
    g.fillRect(bx, by, rand, box); g.fillRect(bx + box - rand, by, rand, box);
    const tx = bx + box + 16;
    let text = x.text;
    while (text.length > 1 && g.measureText(text).width > textB) text = `${text.slice(0, -2)}…`;
    g.fillText(text, tx, ym);
    if (r < proSpalte - 1 && i < p.length - 1) { g.fillStyle = '#000'; g.fillRect(x0 + 10, y1 - 1, spalteB - 20, 1); }
    const innen = [bx + rand, by + rand, bx + box - rand, by + box - rand];
    const tb = Math.ceil(Math.min(textB, g.measureText(text).width));
    const strich = [tx - 4, ym - 2, tx + tb + 4, ym + 2];
    if (x.ab) { umkehren(g, ...innen); umkehren(g, ...strich); }
    return { ab: x.ab, x0, y0, x1: x0 + spalteB, y1, box: innen, strich };
  });
}

/** Feld-Datei für den Sticky: „z <platz> <punkte> <titel>“ und je Punkt „h <platz> <i> <ab> x0 y0 x1 y1 bx0 by0 bx1 by1 sx0 sy0 sx1 sy1“ */
export function zettelFelder(listen) {
  const zeilen = [];
  for (const { platz, titel, felder } of listen) {
    zeilen.push(`z ${platz} ${felder.length} ${titel}`);
    felder.forEach((f, i) => zeilen.push(`h ${platz} ${i} ${f.ab ? 1 : 0} ${[f.x0, f.y0, f.x1, f.y1, ...f.box, ...f.strich].join(' ')}`));
  }
  return zeilen.join('\n') + '\n';
}

/** Strichcode quer über die Breite, Nummer darunter, Zusatzzeilen klein */
export function zeichneStrich(g, z, nr, von) {
  kopf(g, z.titel, nr, von);
  let module;
  try { module = strichModule(z.strich); } catch (e) {
    g.textAlign = 'center';
    g.font = `26px ${BRAUN_FONT}`;
    g.fillText(T('Strichcode ungültig', 'Invalid barcode'), BREITE / 2, HOEHE / 2);
    return [];
  }
  const ruhe = z.strich.format === 'EAN13' ? 11 : 10;
  const modul = Math.max(1, Math.floor((BREITE - 32) / (module.length + 2 * ruhe)));   // ganze Pixel je Modul
  const breite = module.length * modul;
  const x0 = Math.floor((BREITE - breite) / 2), y0 = 90, h = z.zeilen.length ? 230 : 270;
  g.fillStyle = '#000';
  for (let i = 0; i < module.length;) {
    if (module[i] !== '1') { i++; continue; }
    let j = i;
    while (j < module.length && module[j] === '1') j++;
    g.fillRect(x0 + i * modul, y0, (j - i) * modul, h);
    i = j;
  }
  g.textAlign = 'center';
  g.font = `500 32px ${BRAUN_FONT}`;
  g.fillText(strichNummer(z.strich), BREITE / 2, y0 + h + 30);
  g.font = `22px ${BRAUN_FONT}`;
  z.zeilen.slice(0, 2).forEach((t, i) => g.fillText(t, BREITE / 2, y0 + h + 72 + i * 30));
  return [];
}

/** Eine Zettel-Seite nach Art zeichnen → Zeilen-Geometrie (nur Listen, sonst []) */
export function zeichneZettelSeite(g, x, nr, von) {
  if (x.strich) return zeichneStrich(g, x, nr, von);
  if (x.punkte) return zeichneListe(g, x, nr, von);
  if (x.qr) { zeichneKarte(g, x, nr, von); return []; }
  zeichneZettel(g, x, nr, von);
  return [];
}
