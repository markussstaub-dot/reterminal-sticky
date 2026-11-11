// Vorschau = Spiegel des Sticky (Markus, 11.11.2026: „Vorschau mit dem Sticky synchronisieren“ + Fernbedienung).
// Der Sticky meldet nur Modus und Seite (kleine Ereignisse), die App zeichnet das Bild aus ihrem eigenen Vorrat –
// es fließen keine Bilder zurück. Tipps auf die Vorschau und ▲/▼ werden zu kleinen Befehlen an den Sticky.
import { BREITE, HOEHE } from './protokoll.js';
import { homeHochkant, KARTE } from './homeseite.js';
import { fahrtHochkant, vonHochkant, PB, PH, RUECK_HOCH } from './fahrtseite.js';
import { zettel as zettelListe, zeichneZettel } from './bestellung.js';

export function spiegelEinrichten({ canvas, hinweisEl, quelle, befehl, notizTipp }) {
  const z = { modus: null, bb: 0, zettel: 0, verbunden: false, aufnahme: false, meldung: null };
  let meldungTimer = 0, uhrTimer = 0, zeichnet = 0;

  const ziel = (b, h) => {
    if (canvas.width !== b || canvas.height !== h) { canvas.width = b; canvas.height = h; }
    canvas.classList.toggle('hochkant', h > b);
    return canvas.getContext('2d');
  };

  async function zeichne() {
    const nr = ++zeichnet;
    const m = z.modus;
    if (m === 'home' || m === 'notiz') {
      const g = ziel(PB, PH);
      const jetzt = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      g.drawImage(m === 'home' ? homeHochkant(KARTE, jetzt) : fahrtHochkant(quelle.knoepfe()), 0, 0);
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
      const liste = zettelListe(quelle.bestellText());
      const zt = liste[z.zettel] ?? liste[0];
      if (zt) zeichneZettel(g, zt, z.zettel + 1, liste.length);
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
      const g = ziel(BREITE, HOEHE);
      g.fillStyle = '#fff';
      g.fillRect(0, 0, BREITE, HOEHE);
      g.fillStyle = '#000';
      g.font = 'bold 36px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Sticky noch nicht verbunden', BREITE / 2, HOEHE / 2);
    }
    hinweisEl.textContent = z.verbunden ? `Sticky zeigt: ${{ home: 'Home', notiz: 'Notiz', bordbuch: `Bordbuch, Seite ${z.bb + 1}`, bestell: `Bestellzettel ${z.zettel + 1}` }[m] ?? '–'}` : 'nicht verbunden (letzter Stand)';
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
    setze(teile) { Object.assign(z, teile); zeichne(); },
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
        const n = Math.max(1, zettelListe(quelle.bestellText()).length);
        befehl(3, (z.zettel + (k === 'down' ? 1 : n - 1)) % n);
      } else if (k === 'down') befehl(3, 0);
      else befehl(1);
    },
    zustand: () => ({ ...z }),
    stopp() { clearInterval(uhrTimer); },
  };
}
