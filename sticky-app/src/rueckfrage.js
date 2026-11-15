// Rückfragen der App (SPEC „Die drei naheliegenden“, B, abgenommen 15.11.2026): Stufe 1 als App-Seite ohne Flashen.
// Die App schickt den Sticky auf die Spielseite, zeichnet dort die Frage mit den kleinen Eingaben aus „Eingabe →
// Kleine Eingaben“ (Ja/Nein, Auswahl, Stufe 1–5) und wertet den Tipp selbst aus. Nur Touch: ▲/▼ blättern auf der
// Spielseite wie überall (die Firmware reicht sie nicht durch), KI kurz = Home = „nicht jetzt“.
import { braunKnopf, BRAUN_FONT } from './braun.js';
import { groesse, vonDisplay } from './lage.js';
import { T } from './uebersetzen.js';

export const FRAGE_DAUER_MS = 2 * 60 * 1000;

/**
 * Knöpfe einer Frage in logischen Koordinaten der Lage → [{ x, y, w, h, text, rolle, wert }].
 * frage: { art: 'janein' | 'auswahl' | 'stufe', text, antworten?: [..] }
 */
export function frageKnoepfe(frage, hoch) {
  const { w } = groesse(hoch);
  const k = [];
  if (frage.art === 'janein') {
    const ja = { text: T('Ja', 'Yes'), rolle: 'haupt', wert: true }, nein = { text: T('Nein', 'No'), rolle: 'neben', wert: false };
    if (hoch) { k.push({ x: 32, y: 300, w: 416, h: 150, ...ja }, { x: 32, y: 480, w: 416, h: 150, ...nein }); }
    else { k.push({ x: 40, y: 220, w: 340, h: 160, ...ja }, { x: 420, y: 220, w: 340, h: 160, ...nein }); }
  } else if (frage.art === 'stufe') {
    for (let i = 0; i < 5; i++) {
      if (hoch) k.push({ x: 32, y: 250 + i * 104, w: 416, h: 96, text: String(i + 1), rolle: 'wahl', wert: i + 1 });
      else k.push({ x: 20 + i * 152, y: 220, w: 152, h: 152, text: String(i + 1), rolle: 'wahl', wert: i + 1, rund: true });
    }
  } else {
    const l = (frage.antworten ?? []).slice(0, 6);
    const y0 = hoch ? 250 : 170, zh = hoch ? Math.min(96, Math.floor(500 / Math.max(1, l.length))) : Math.min(72, Math.floor(290 / Math.max(1, l.length)));
    l.forEach((a, i) => k.push({ x: 32, y: y0 + i * zh, w: w - 64, h: Math.max(58, zh), text: String(a), rolle: 'neben', wert: a }));
  }
  return k;
}

/** Tipper (Display-Koordinaten) → getroffener Knopf oder null */
export function frageTreffer(frage, dx, dy, hoch) {
  const { x, y } = vonDisplay(dx, dy, hoch);
  return frageKnoepfe(frage, hoch).find((k) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h) ?? null;
}

/** Frage auf die logische Leinwand g (Lage hoch/quer) zeichnen */
export function frageZeichnen(g, frage, hoch) {
  const { w, h } = groesse(hoch);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#000';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Frage, notfalls auf zwei Zeilen (oben rechts bleibt die Statuszeile frei)
  const worte = String(frage.text).split(/\s+/);
  let gr = 44, zeilen;
  do {
    g.font = `500 ${gr}px ${BRAUN_FONT}`;
    zeilen = [''];
    for (const wort of worte) {
      const probe = zeilen.at(-1) ? `${zeilen.at(-1)} ${wort}` : wort;
      if (g.measureText(probe).width > w - 60 && zeilen.at(-1)) zeilen.push(wort); else zeilen[zeilen.length - 1] = probe;
    }
    gr -= 2;
  } while ((zeilen.length > 2 || zeilen.some((z) => g.measureText(z).width > w - 60)) && gr > 24);
  const y0 = hoch ? 150 : 110;
  zeilen.slice(0, 2).forEach((z, i) => g.fillText(z, w / 2, y0 + (i - (Math.min(2, zeilen.length) - 1) / 2) * (gr + 12)));
  for (const k of frageKnoepfe(frage, hoch)) braunKnopf(g, k.x, k.y, k.w, k.h, k.text, k.rolle, { rund: !!k.rund, gr: frage.art === 'auswahl' ? 30 : null });
  g.font = `400 22px ${BRAUN_FONT}`;
  g.fillStyle = '#000';
  g.fillText(T('KI = nicht jetzt', 'AI = not now'), w / 2, h - 30);
}
