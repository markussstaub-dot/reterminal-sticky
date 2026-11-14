// Vorschau = Spiegel des Sticky (Markus, 11.11.2026: „Vorschau mit dem Sticky synchronisieren“ + Fernbedienung).
// Der Sticky meldet nur Modus und Seite (kleine Ereignisse), die App zeichnet das Bild aus ihrem eigenen Vorrat –
// es fließen keine Bilder zurück. Tipps auf die Vorschau und ▲/▼ werden zu kleinen Befehlen an den Sticky.
import { uhrzeit } from './zeit.js';
import { BREITE, HOEHE } from './protokoll.js';
import { homeHochkant, KARTE } from './homeseite.js';
import { fahrtHochkant, vonHochkant, PB, PH, RUECK_HOCH } from './fahrtseite.js';

/** Akkusymbol wie am Sticky (firmware-ble/modus.h, gleiche Hochkant-Maße) */
function akkuSymbol(g, stufe, usb) {
  const r = (x, y, w, h, schwarz) => { g.fillStyle = schwarz ? '#000' : '#fff'; g.fillRect(x, y, w, h); };
  r(400, 8, 68, 32, false);
  r(404, 12, 52, 24, true);
  r(407, 15, 46, 18, false);
  r(456, 18, 6, 12, true);
  for (let i = 0; i < Math.min(stufe, 4); i++) r(409 + i * 11, 17, 9, 14, true);
  if (usb) { r(423, 13, 14, 22, false); r(429, 14, 5, 9, true); r(426, 21, 8, 3, true); r(426, 23, 5, 10, true); }
}

/** Namen der Widgets für den Hinweis unter der Vorschau */
const WIDGET_NAMEN = { menue: 'Menü', timer: 'Timer', wecker: 'Wecker', weltzeit: 'Weltzeit', waage: 'Wasserwaage', lineal: 'Lineal',
  'lineal-us': 'Lineal (Zoll)', rechner: 'Rechner', umrechner: 'Umrechner', einstellungen: 'Einstellungen' };
const SEITEN_NAMEN = { home: 'Home', notiz: 'Notiz', kritzel: 'Kritzelblock', schrift: 'Strichschrift', app: 'App-Seite' };

/** Display-Bild (800 × 480, 1 bpp, Bit 1 = schwarz) in die Vorschau; hochkant zurückdrehen: Display (dx, dy) = logisch (479 − dy, dx) */
function zeichne1bpp(g, daten, hoch) {
  const b = hoch ? HOEHE : BREITE, h = hoch ? BREITE : HOEHE;
  const bild = g.createImageData(b, h);
  const px = bild.data;
  for (let dy = 0; dy < HOEHE; dy++) {
    for (let dx = 0; dx < BREITE; dx++) {
      const schwarz = (daten[dy * (BREITE / 8) + (dx >> 3)] >> (7 - (dx & 7))) & 1;
      const x = hoch ? HOEHE - 1 - dy : dx, y = hoch ? dx : dy;
      const i = (y * b + x) * 4;
      const v = schwarz ? 0 : 255;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  g.putImageData(bild, 0, 0);
}

export function spiegelEinrichten({ canvas, hinweisEl, quelle, befehl, notizTipp }) {
  const z = { modus: null, w: '', lh: 0, foto: null, bb: 0, zettel: 0, verbunden: false, aufnahme: false, meldung: null };
  let meldungTimer = 0, uhrTimer = 0, zeichnet = 0;

  const ziel = (b, h) => {
    if (canvas.width !== b || canvas.height !== h) { canvas.width = b; canvas.height = h; }
    canvas.classList.toggle('hochkant', h > b);
    return canvas.getContext('2d');
  };

  async function zeichne() {
    const nr = ++zeichnet;
    const m = z.modus;
    if (z.verbunden && z.foto) {
      // echtes Bild vom Sticky (FW ≥ 0.31.3): Statuszeile, Knöpfe, Striche, Ziffern – alles wie am Gerät.
      // Nach einem Seitenwechsel bleibt das alte Bild blass stehen, bis das neue da ist (kein Platzhalter-Flackern)
      const hoch = z.fotoAlt ? z.fotoLh : !!z.lh;
      const g = ziel(hoch ? HOEHE : BREITE, hoch ? BREITE : HOEHE);
      zeichne1bpp(g, z.foto, hoch);
      if (z.fotoAlt) {
        g.fillStyle = 'rgba(255,255,255,0.65)';
        g.fillRect(0, 0, g.canvas.width, g.canvas.height);
        g.fillStyle = '#000';
        g.font = 'bold 30px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('Bild kommt …', g.canvas.width / 2, g.canvas.height / 2);
      }
    } else if (m === 'home' || m === 'notiz') {
      const g = ziel(PB, PH);
      const jetzt = uhrzeit(new Date());
      g.drawImage(m === 'home' ? homeHochkant(quelle.karte?.() ?? KARTE, jetzt, quelle.wetter?.()) : fahrtHochkant(quelle.knoepfe()), 0, 0);
      if (m === 'home' && z.bat >= 0) akkuSymbol(g, Math.floor((z.bat + 12) / 25), z.usb);
      // Überlagerungen unten im Rückmeldefeld, wie am Sticky
      const text = z.aufnahme ? '● Aufnahme' : z.meldung;
      if (text) {
        const { x, y, w, h } = RUECK_HOCH;
        g.fillStyle = '#000';
        g.beginPath();
        g.roundRect(x, y, w, h, 12);
        g.fill();
        g.fillStyle = '#fff';
        g.font = 'bold 28px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, x + w / 2, y + h / 2 + 1);
      }
    } else if (m === 'bestell') {
      const g = ziel(BREITE, HOEHE);
      const liste = quelle.alleZettel();
      (liste[z.zettel] ?? liste[0])?.zeichne(g);
    } else if (m === 'bordbuch') {
      const g = ziel(BREITE, HOEHE);
      const bild = await quelle.bordbuchSeite(z.bb);   // ImageData oder null
      if (nr !== zeichnet) return;                       // inzwischen weitergeblättert
      if (bild) g.putImageData(bild, 0, 0);
      else {
        g.fillStyle = '#fff';
        g.fillRect(0, 0, BREITE, HOEHE);
        g.fillStyle = '#000';
        g.font = 'bold 34px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(`Bordbuch · Seite ${z.bb + 1}`, BREITE / 2, HOEHE / 2 - 10);
        g.font = '22px system-ui, sans-serif';
        g.fillText('(Vorschau entsteht beim nächsten „Bordbuch aufspielen“)', BREITE / 2, HOEHE / 2 + 30);
      }
    } else {
      // Widgets (Menü, Timer, …), Strichschrift, Kritzelblock, App-Seite: in der gemeldeten Lage (FW ≥ 0.31.2)
      const hoch = !!z.lh;
      const g = ziel(hoch ? HOEHE : BREITE, hoch ? BREITE : HOEHE);
      const daten = m === 'widget' && z.w ? quelle.widgetBild?.(z.w, hoch) : m === 'schrift' ? quelle.schriftBild?.() : null;
      if (daten) zeichne1bpp(g, daten, hoch && m === 'widget');
      else {
        g.fillStyle = '#fff';
        g.fillRect(0, 0, g.canvas.width, g.canvas.height);
        g.fillStyle = '#000';
        g.font = 'bold 36px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(m ? (m === 'widget' ? WIDGET_NAMEN[z.w] ?? 'Widget' : SEITEN_NAMEN[m] ?? m) : 'Sticky noch nicht verbunden', g.canvas.width / 2, g.canvas.height / 2);
      }
    }
    const was = { bordbuch: `Bordbuch, Seite ${z.bb + 1}`, bestell: `Zettel ${z.zettel + 1}`, widget: WIDGET_NAMEN[z.w] ?? (z.w || 'Widget') }[m] ?? SEITEN_NAMEN[m] ?? '–';
    hinweisEl.textContent = z.verbunden ? `Sticky zeigt: ${was}${z.foto && !z.fotoAlt ? '' : z.fotoAlt ? ' (Bild kommt)' : m === 'widget' || m === 'schrift' ? ' (Grundbild)' : ''}` : 'nicht verbunden (letzter Stand)';
    hinweisEl.classList.toggle('gleich', z.verbunden);
  }

  // Home: Uhr in der Vorschau mitlaufen lassen
  uhrTimer = setInterval(() => { if (z.modus === 'home') zeichne(); }, 30000);

  // ---- Fernbedienung ----
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * canvas.width / r.width, py = (e.clientY - r.top) * canvas.height / r.height;
    if (z.modus === 'notiz') {
      const d = vonHochkant(px, py);
      notizTipp(d.x, d.y);
    } else if (z.modus === 'bordbuch' && z.bb === 0) {
      const f = quelle.inhaltsFelder().find((f) => px >= f.x0 && px < f.x1 && py >= f.y0 && py < f.y1);
      if (f) befehl(1, f.seite);
    }
  });

  return {
    setze(teile) {
      // neue Seite oder Lage: das alte Foto passt nicht mehr, bis das nächste kommt zeichnet die App selbst
      if (teile.verbunden === false) z.foto = null;
      else if (z.foto && !z.fotoAlt && ['modus', 'w', 'lh', 'bb', 'zettel'].some((k) => k in teile && teile[k] !== z[k])) { z.fotoAlt = true; z.fotoLh = !!z.lh; }
      Object.assign(z, teile);
      zeichne();
    },
    /** Bildschirmfoto vom Sticky (48000 Byte, Display-Lage) */
    foto(daten) { z.foto = daten; z.fotoAlt = false; zeichne(); },
    hatFoto: () => !!z.foto,
    /** Foto kam nicht: dann zeichnet die App selbst, statt das alte Bild blass stehen zu lassen */
    fotoFehlt() { if (z.fotoAlt) { z.foto = null; z.fotoAlt = false; zeichne(); } },
    meldung(text) {
      z.meldung = text;
      clearTimeout(meldungTimer);
      meldungTimer = setTimeout(() => { z.meldung = null; zeichne(); }, 4000);
      zeichne();
    },
    /** ▲ / ▼ wie am Sticky */
    taste(k) {
      if (z.modus === 'bordbuch') befehl(1, Math.max(0, z.bb + (k === 'down' ? 1 : -1)));
      else if (z.modus === 'bestell') {
        const n = Math.max(1, quelle.alleZettel().length);
        befehl(3, (z.zettel + (k === 'down' ? 1 : n - 1)) % n);
      } else if (k === 'down') befehl(3, 0);
      else befehl(1);
    },
    zustand: () => ({ ...z, foto: undefined }),
    stopp() { clearInterval(uhrTimer); },
  };
}
