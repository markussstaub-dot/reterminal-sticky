// Kundenkarten zum Vorzeigen (Markus, 12.11.2026: Lidl Plus ohne App). Liegen wie die Bestellzettel im Flash des
// Sticky (▼ auf Home), offline. Der QR-Code wird gestochen scharf gezeichnet: ganze Pixel je Modul, keine Rasterung,
// Ruhezone ≥ 4 Module – sonst lehnen Kassenscanner ab. Die echte Kundennummer bleibt in der App (localStorage) und
// im Sticky, nie im Repo; hier nur ein Platzhalter.
import qrcode from 'qrcode-generator';
import { BREITE, HOEHE } from './protokoll.js';
import { BRAUN_FONT } from './braun.js';

export const KARTEN_STANDARD = `## Lidl Plus
qr: DUMMY-LIDL-PLUS-0000000000
`;

/** „## Titel“ je Karte, darunter „qr: Inhalt“ und optional weitere Textzeilen (z. B. Kundennummer zum Ablesen) */
export function karten(text) {
  return text.split(/^## /m).map((b) => b.trim()).filter(Boolean).slice(0, 3).map((b) => {
    const [titel, ...rest] = b.split('\n').map((z) => z.trim());
    const qr = rest.find((z) => /^qr:/i.test(z))?.replace(/^qr:\s*/i, '') ?? '';
    const zeilen = rest.filter((z) => z && !/^qr:/i.test(z));
    return { titel, qr, zeilen };
  }).filter((k) => k.qr);
}

/** Karte quer: QR-Code so groß wie möglich links, Titel und Zeilen rechts */
export function zeichneKarte(g, k, nr, von) {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  const q = qrcode(0, 'M');
  q.addData(k.qr);
  q.make();
  const n = q.getModuleCount();
  const ruhe = 4;
  const modul = Math.floor((HOEHE - 16) / (n + 2 * ruhe));   // ganze Pixel je Modul
  const seite = modul * n;
  const x0 = 8 + ruhe * modul, y0 = Math.floor((HOEHE - seite) / 2);
  g.fillStyle = '#000';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect(x0 + x * modul, y0 + y * modul, modul, modul);
  // Text rechts daneben
  const tx = x0 + seite + ruhe * modul + 8, tb = BREITE - tx - 16;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  let gr = 52;
  do { g.font = `500 ${gr}px ${BRAUN_FONT}`; gr -= 2; } while (g.measureText(k.titel).width > tb && gr > 18);
  g.fillText(k.titel, tx, HOEHE / 2 - 40);
  g.font = `26px ${BRAUN_FONT}`;
  k.zeilen.slice(0, 3).forEach((z, i) => g.fillText(z, tx, HOEHE / 2 + 14 + i * 36));
  g.font = `18px ${BRAUN_FONT}`;
  g.fillText(`Zettel ${nr}/${von}`, tx, HOEHE - 30);
}
