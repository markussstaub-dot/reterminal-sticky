// Braun-Stil für alle Bedienelemente des Sticky (Vorbild Braun ET66/BNE001 von Dietrich Lubs und Dieter Rams,
// Markus 13.11.2026). E-Ink kennt nur Schwarz und Weiß, deshalb werden die Farben zu Füllungen. Die Rolle eines Knopfs
// entscheidet, nicht der Platz:
//   haupt    Doppelring auf Weiß (Braun-Gelb: „=“)           Hauptaktion: =, Start/Stopp, Null setzen, ⇄
//   wahl     voll schwarz, weiße Schrift (schwarze Tasten)   Zahlen und Auswahl: Ziffern, Vorlagen, gewählte Einheit
//   werkzeug gerasterter Rand (Braun-Braun)                  Rechenzeichen, C, ⌫, ±1 min, Reset
//   neben    dünner Ring (Braun-Grün)                        Speicher, Halten, übrige Kacheln, nicht gewählte Reiter

export const BRAUN_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const leinwand = (b, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(b, h) : Object.assign(document.createElement('canvas'), { width: b, height: h }));

let raster = null;
function rasterMuster(g) {
  if (!raster) {
    raster = leinwand(2, 2);
    const r = raster.getContext('2d');
    r.fillStyle = '#fff'; r.fillRect(0, 0, 2, 2);
    r.fillStyle = '#000'; r.fillRect(0, 0, 1, 1); r.fillRect(1, 1, 1, 1);
  }
  return g.createPattern(raster, 'repeat');
}

/**
 * Knopf im Braun-Stil ins Feld (x, y, w, h).
 * rund: kompakt wie eine Rechnertaste (Kreis bzw. kurze Pille, mittig); sonst füllt er das Feld (mit Rand) als Pille.
 */
export function braunKnopf(g, x, y, w, h, text, rolle = 'neben', { rund = false, gr = null, rand = 6 } = {}) {
  let x0, y0, kw, kh;
  if (rund) {
    const d = Math.min(w, h) - 12;
    kw = Math.min(w - 14, d * 1.6); kh = d;
    x0 = x + (w - kw) / 2; y0 = y + (h - kh) / 2;
  } else {
    x0 = x + rand; y0 = y + rand; kw = w - 2 * rand; kh = h - 2 * rand;
  }
  const r = Math.min(kh / 2, kw / 2, rund ? 999 : 40);
  const form = (ein = 0) => { g.beginPath(); g.roundRect(x0 + ein, y0 + ein, kw - 2 * ein, kh - 2 * ein, Math.max(1, r - ein)); };
  const kurz = Math.min(kw, kh);
  let schrift = '#000';
  if (rolle === 'wahl') {
    form(); g.fillStyle = '#000'; g.fill(); schrift = '#fff';
  } else if (rolle === 'werkzeug') {
    const band = Math.max(8, Math.round(Math.min(kurz * 0.16, 14)));
    form(); g.fillStyle = rasterMuster(g); g.fill();
    form(band); g.fillStyle = '#fff'; g.fill();
    form(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke();
  } else if (rolle === 'haupt') {
    form(); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#000'; g.stroke();
    form(10); g.lineWidth = 2; g.stroke();
  } else {
    form(1); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke();
  }
  g.fillStyle = schrift;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let groesse = gr ?? Math.round(kurz * (text.length > 1 ? 0.34 : rolle === 'wahl' ? 0.5 : 0.46));
  const gewicht = rolle === 'neben' ? 400 : 500;
  do { g.font = `${gewicht} ${groesse}px ${BRAUN_FONT}`; groesse -= 2; } while (g.measureText(text).width > kw - 24 && groesse > 14);
  g.fillText(text, x0 + kw / 2, y0 + kh / 2 + 1);
}
