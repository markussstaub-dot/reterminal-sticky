// Weltkarte für die Weltzeit (SPEC „Weltzeit mit Karte“, abgenommen 16.11.2026): Plattkarte, Greenwich mittig,
// Land gerastert, Nacht als dichteres Raster. Stufe 1: die App zeichnet Karte und Schatten beim Abgleich;
// Stufe 2 (später): der Sticky rechnet den Schatten selbst. Kontinente grob von Hand (Länge, Breite) – später
// gegen eine gemeinfreie Karte (Natural Earth) tauschen.

export const LAND = [
  [[-168, 66], [-140, 70], [-95, 72], [-80, 63], [-60, 55], [-53, 47], [-66, 44], [-75, 35], [-81, 25], [-90, 29], [-97, 26], [-105, 20], [-95, 16], [-83, 9], [-77, 8], [-80, 0], [-81, -6], [-71, -18], [-71, -30], [-74, -45], [-68, -55], [-64, -42], [-57, -37], [-48, -27], [-39, -15], [-35, -6], [-50, 0], [-60, 10], [-75, 12], [-87, 16], [-105, 23], [-112, 31], [-120, 34], [-124, 40], [-124, 48], [-135, 58], [-150, 60], [-165, 62]],
  [[-55, 60], [-45, 60], [-20, 70], [-25, 82], [-60, 82], [-70, 76]],
  [[-10, 36], [-9, 43], [-2, 48], [-5, 58], [5, 62], [15, 69], [28, 71], [40, 67], [60, 69], [80, 73], [110, 77], [140, 72], [170, 70], [180, 66], [162, 58], [140, 48], [130, 42], [122, 31], [121, 23], [108, 18], [105, 9], [100, 13], [98, 8], [93, 20], [80, 13], [77, 8], [72, 20], [66, 25], [57, 26], [50, 30], [52, 23], [59, 22], [52, 12], [43, 12], [33, 28], [30, 31], [35, 36], [27, 37], [26, 40], [18, 40], [15, 38], [12, 44], [3, 43]],
  [[-17, 21], [-16, 12], [-8, 4], [6, 4], [9, -1], [13, -12], [12, -18], [18, -34], [26, -34], [33, -26], [40, -15], [40, -4], [51, 11], [43, 12], [33, 28], [10, 37], [-6, 36]],
  [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [141, -38], [131, -31], [115, -34]],
  [[-180, -72], [180, -72], [180, -90], [-180, -90]],
  [[130, 31], [140, 35], [142, 41], [141, 45], [136, 38]], [[-6, 50], [2, 51], [0, 58], [-6, 58]],
];

/** Sonnenhöhe (Sinus) an Länge/Breite für einen Zeitpunkt (UTC-Millisekunden) – grobe Formel, reicht für die Karte */
export function sonnenhoehe(lon, lat, ms) {
  const d = new Date(ms), tag = Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
  const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (tag + 10)) * Math.PI / 180;
  const minUtc = d.getUTCHours() * 60 + d.getUTCMinutes();
  const subLon = 180 - (minUtc / 1440) * 360;
  const phi = lat * Math.PI / 180, H = (lon - subLon) * Math.PI / 180;
  return Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
}

/** Karte in g zeichnen: Rechteck x0,y0,w,h; Städte [{ kurz, lon, lat, hier }]; ms = Zeitpunkt für den Schatten */
export function zeichneKarte(g, x0, y0, w, h, staedte, ms, leinwand) {
  const xy = (lon, lat) => [x0 + ((lon + 180) / 360) * w, y0 + ((90 - lat) / 180) * h];
  // Landmaske auf einer eigenen Leinwand
  const m = leinwand(w, h), mg = m.getContext('2d', { willReadFrequently: true });
  mg.fillStyle = '#000';
  for (const poly of LAND) {
    mg.beginPath();
    poly.forEach(([a, b], i) => { const [x, y] = xy(a, b); i ? mg.lineTo(x - x0, y - y0) : mg.moveTo(x - x0, y - y0); });
    mg.closePath(); mg.fill();
  }
  const maske = mg.getImageData(0, 0, w, h).data;
  const bild = g.getImageData(x0, y0, w, h), d = bild.data;
  for (let y = 0; y < h; y++) {
    const lat = 90 - (y / h) * 180;
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * 360 - 180, s = sonnenhoehe(lon, lat, ms);
      const nacht = s < -0.05, daemmerung = !nacht && s < 0.05, land = maske[(y * w + x) * 4 + 3] > 128;
      const X = x + x0, Y = y + y0;
      // Land immer dunkler als Meer, Nacht dunkelt beides ab (Markus: „retro flair“)
      const schwarz = land ? (nacht ? (X + Y) % 3 !== 0 : daemmerung ? (X + Y) % 2 === 0 : (X + Y) % 3 === 0)
        : (nacht ? X % 2 === 0 && Y % 2 === 0 : daemmerung ? X % 4 === 0 && Y % 2 === 0 : false);
      const v = schwarz ? 0 : 255, i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
  }
  g.putImageData(bild, x0, y0);
  g.fillStyle = '#000';
  g.fillRect(x0, y0 - 2, w, 2); g.fillRect(x0, y0 + h, w, 2);
  for (const s of staedte) {
    const [x, y] = xy(s.lon, s.lat);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, s.hier ? 11 : 9, 0, 7); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, s.hier ? 6 : 5, 0, 7); g.fill();
    if (s.hier) { g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 13, 0, 7); g.stroke(); }
    g.font = 'bold 16px Helvetica, Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    const b = g.measureText(s.kurz).width, links = x + 14 + b + 6 > x0 + w;
    const tx = links ? x - 14 - b - 6 : x + 14;
    g.fillStyle = '#fff'; g.fillRect(tx - 2, y - 10, b + 8, 20); g.fillStyle = '#000'; g.fillText(s.kurz, tx + 2, y + 1);
  }
}
