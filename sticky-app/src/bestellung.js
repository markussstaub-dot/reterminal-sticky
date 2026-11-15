// Bestellzettel zum Vorzeigen an der Theke (SPEC „Ideensammlung“ → umgesetzt 11.11.2026). Bis zu 3 feste Zettel,
// als Text in der App gepflegt („## Titel“ beginnt einen Zettel), quer und so groß wie möglich gerendert.
import { BREITE, HOEHE } from './protokoll.js';
import { BRAUN_FONT } from './braun.js';
import { T } from './uebersetzen.js';

export const BESTELL_STANDARD = `## Bäcker
2 Laugenbrötchen
1 Cappuccino

## Café
1 Cappuccino
1 Croissant

## Kaffee to go
1 Kaffee schwarz, groß
`;

const FONT = BRAUN_FONT;

export function zettel(text) {
  return text.split(/^## /m).map((b) => b.trim()).filter(Boolean).slice(0, 3).map((b) => {
    const [titel, ...zeilen] = b.split('\n');
    return { titel: titel.trim(), zeilen: zeilen.map((z) => z.trim()).filter(Boolean) };
  }).filter((z) => z.zeilen.length);
}

/** Ein Zettel quer: kleine Kopfzeile, darunter die Positionen so groß wie möglich */
export function zeichneZettel(g, z, nr, von) {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  g.fillStyle = '#000';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = `500 26px ${FONT}`;
  g.fillText(z.titel, 24, 30);
  g.textAlign = 'right';   // rechts oben sitzt die Statuszeile des Sticky (288 × 32), der Zähler darunter
  g.font = `16px ${FONT}`;
  g.fillText(T(`Zettel ${nr}/${von}`, `Card ${nr}/${von}`), BREITE - 24, 44);
  g.fillRect(24, 54, BREITE - 48, 3);
  const oben = 70, unten = HOEHE - 16;
  const n = z.zeilen.length;
  let gr = Math.min(120, Math.floor((unten - oben) / n / 1.18));
  const breiteste = () => Math.max(...z.zeilen.map((t) => g.measureText(t).width));
  for (; gr > 24; gr -= 2) {
    g.font = `500 ${gr}px ${FONT}`;
    if (breiteste() <= BREITE - 48) break;
  }
  const zeilenH = gr * 1.18;
  let y = oben + (unten - oben - n * zeilenH) / 2 + zeilenH / 2;
  g.textAlign = 'left';
  for (const t of z.zeilen) {
    g.fillText(t, 24, y);
    y += zeilenH;
  }
}
