// Bordbuch (SPEC „MVP 2“): Die App rendert alle Seiten (Titel + Inhalt, Spickzettel, Handbuch) für 800×480
// und spielt sie einmalig in den Flash des Sticky. Dort sind sie ohne Handy lesbar.
import { BREITE, HOEHE, rgbaZu1bpp } from './protokoll.js';

// Spickzettel: als Text gepflegt (in der App änderbar). „## Titel“ beginnt eine Seite, „!“ am Zeilenanfang = fett.
// Werte aus der Bedienungsanleitung DE 2026 (Seitenangaben in Klammern); „(prüfen)“ = bitte am Fahrzeug bestätigen.
export const SPICKZETTEL_STANDARD = `## Laden
!Schuko (Haushaltssteckdose)
Mode-2-Kabel mit Steuerbox, Dauerstrom max. 8 A (S. 21)
!Typ 2 (Wallbox / Ladesäule)
Kabel Typ 2 an Typ 2, Bordlader max. 2,2 kW (S. 32)
!Ablauf
Zündung 0, Schlüssel ab → Kabel an Strom → Typ-2-Stecker ans Auto
Ladebalken im Kombiinstrument läuft; Signet rot = Ladefehler
!Beenden
Auto entriegeln stoppt das Laden, dann Stecker ziehen
Notentriegelung Ladestecker: Abb. 31 (S. 20)

## Warnleuchten
!Rot = sofort anhalten, Fachwerkstatt
STOP rot: nicht fahrbereit · Bremssystem-Fehler
Antriebsbatterie-Fehler (rot): umgehend anhalten
!Gelb = mit Einschränkung weiter, bald Werkstatt
Temperatur Antriebsstrang zu hoch
!Grün = Info
READY grün: fahrbereit
Handbremse: Leuchte, Warnton ab 4 km/h
Tür vorne offen: Symbol im Kombiinstrument (S. 22)

## Reifen und Räder
!Reifendruck (Aufkleber innen an der Ladeklappe)
Stahlfelge 13": 145/70 R13 → 1,8 bar
Alufelge 14": 155/55 R14 → 2,0 bar   (welche hat der Pioneer? prüfen)
!Radschrauben
Stahlfelge 40 Nm · Alufelge 90 Nm
!Reifenpanne
Kein Reserverad, kein Pannenset → Pannenhilfe/Werkstatt
Zum Prüfen Radzierblende abziehen; Aussparung beim Aufsetzen aufs Ventil (S. 29)

## Sicherungen
Sitzen in der Tür vorne und im Kofferraum (Abb. 42/43, S. 26)
Möglichst vom Fachpersonal tauschen lassen
!Häufig gebraucht
FSH1 7,5 A Hupe · FSH11/12 5 A Blinker links/rechts
FSH14 5 A Abblendlicht · FSH15 7,5 A Fernlicht
FSH17 10 A Türschloss + Ladestecker-Verriegelung
FSH19 7,5 A Scheibenwaschpumpe · FSD2 15 A Wischer
FSD1 5 A OBD · FSD3 20 A Innenraumgebläse
Schlüsselbatterie: CR 2032, 3 V (S. 28)

## Notfall und Pannen
!Notruf 112
Rettungskarte: microlino-car.com bzw. Servicepartner (S. 5)
!Notfahrmodus (Türschloss defekt, Schritttempo)
Zündung an → Warnblinker an → Bremse treten →
Taste Sportmodus 10 s halten; aus: Zündung aus/an (S. 29)
!Fahrzeugreset bei Fehlermeldung
Ablauf im Handbuch S. 29 (Tür dann nur manuell)
!Kontakt
info@microlino-car.com · Pannenhilfe-Nummer: (eintragen)
`;

const FONT = 'system-ui, sans-serif';

/** Zerlegt den Spickzettel-Text in Seiten { titel, zeilen } */
export function spickzettelSeiten(text) {
  const seiten = [];
  for (const block of text.split(/^## /m).map((b) => b.trim()).filter(Boolean)) {
    const [titel, ...zeilen] = block.split('\n');
    seiten.push({ titel: titel.trim(), zeilen: zeilen.map((z) => z.trimEnd()).filter((z) => z.trim()) });
  }
  return seiten;
}

function kopf(g, titel, rechts) {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  g.fillStyle = '#000';
  g.fillRect(0, 0, BREITE, 56);
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = `bold 30px ${FONT}`;
  g.fillText(titel, 18, 29);
  g.textAlign = 'right';
  g.font = `22px ${FONT}`;
  g.fillText(rechts, BREITE - 18, 29);
  g.textAlign = 'left';
  g.fillStyle = '#000';
}

/** Textseite (Spickzettel) */
export function zeichneTextseite(g, seite, fuss) {
  kopf(g, seite.titel, fuss);
  let groesse = 26;
  // Schrift verkleinern, bis alles passt
  for (; groesse >= 16; groesse -= 1) {
    if (seite.zeilen.length * groesse * 1.32 + 70 <= HOEHE - 10) break;
  }
  let y = 72 + groesse * 0.6;
  for (const z of seite.zeilen) {
    const fett = z.startsWith('!');
    g.font = `${fett ? 'bold ' : ''}${groesse}px ${FONT}`;
    let t = fett ? z.slice(1) : z;
    while (g.measureText(t).width > BREITE - 40 && t.length > 4) t = t.slice(0, -2) + '…';
    g.fillText(t, fett ? 18 : 30, y);
    y += groesse * (fett ? 1.38 : 1.28);
  }
}

/** Titelseite mit Inhaltsverzeichnis; liefert die Touch-Felder [{x0,y0,x1,y1,seite}] */
export function zeichneInhalt(g, links, rechts) {
  kopf(g, 'Microlino · Bordbuch', '▲▼ blättern · KI = Inhalt');
  const felder = [];
  const spalte = (eintraege, x0, ueber) => {
    g.font = `bold 22px ${FONT}`;
    g.fillStyle = '#000';
    g.fillText(ueber, x0 + 6, 84);
    const h = Math.min(44, Math.floor((HOEHE - 110) / Math.max(1, eintraege.length)));
    eintraege.forEach((e, i) => {
      const y = 104 + i * h;
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.strokeRect(x0, y, 384, h - 6);
      g.font = `${Math.min(24, h - 16)}px ${FONT}`;
      let t = e.titel;
      while (g.measureText(t).width > 300 && t.length > 4) t = t.slice(0, -2) + '…';
      g.fillText(t, x0 + 12, y + (h - 6) / 2 + 1);
      g.textAlign = 'right';
      g.fillText(String(e.anzeige ?? e.seite + 1), x0 + 372, y + (h - 6) / 2 + 1);
      g.textAlign = 'left';
      felder.push({ x0, y0: y, x1: x0 + 384, y1: y + h - 6, seite: e.seite });
    });
  };
  g.textBaseline = 'middle';
  spalte(links, 10, 'Spickzettel');
  if (rechts.length) spalte(rechts, 406, 'Handbuch (Seite)');
  return felder;
}

// ---- Handbuch-PDF (pdf.js) -----------------------------------------------------------------
let pdfjs = null;
async function ladePdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs;
}

export async function oeffnePdf(bytes) {
  const lib = await ladePdfjs();
  // wasmUrl: Decoder für JPEG-2000-Bilder im Handbuch (public/pdfjs-wasm, aus pdfjs-dist/wasm kopiert)
  const wasmUrl = new URL('./pdfjs-wasm/', document.baseURI).href;
  return lib.getDocument({ data: bytes, wasmUrl }).promise;
}

/** Hauptkapitel aus der INHALT-Seite (Großbuchstaben + Seitenzahl) */
export async function kapitel(pdf) {
  for (let s = 1; s <= Math.min(5, pdf.numPages); s++) {
    const seite = await pdf.getPage(s);
    const inhalt = await seite.getTextContent();
    // Zeilen über die y-Lage zusammensetzen
    const zeilen = new Map();
    for (const it of inhalt.items) {
      const y = Math.round(it.transform[5]);
      zeilen.set(y, (zeilen.get(y) ?? '') + it.str);
    }
    const text = [...zeilen.entries()].sort((a, b) => b[0] - a[0]).map(([, t]) => t.trim());
    if (!text.some((t) => /^INHALT$/.test(t))) continue;
    const liste = [];
    for (const t of text) {
      const m = t.match(/^([A-ZÄÖÜ][A-ZÄÖÜ ,&\-]+?)\s+(\d{1,3})$/);
      if (m && m[1].length > 3) {
        const titel = m[1].trim().toLowerCase().replace(/^\p{L}/u, (a) => a.toUpperCase()).replace(/ (\p{L})(\p{L}{3,})/gu, (_, a, b) => ` ${a.toUpperCase()}${b}`);
        liste.push({ titel, seite: +m[2] });
      }
    }
    // Das INHALT-Blatt ist zweispaltig: nach Seitenzahl sortieren
    return liste.sort((a, b) => a.seite - b.seite);
  }
  return [];
}

/** Rendert eine PDF-Seite als 2×2 Ausschnitte (Querformat-A4 → je 800×480, ~1,6-fach). Leere Ausschnitte fallen weg. */
export async function pdfAusschnitte(pdf, nr) {
  const seite = await pdf.getPage(nr);
  const v0 = seite.getViewport({ scale: 1 });
  const scale = (2 * HOEHE) / v0.height;           // zwei Bildschirmhöhen pro Seite
  const vp = seite.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width);
  c.height = Math.ceil(vp.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  await seite.render({ canvasContext: g, viewport: vp }).promise;
  const xs = [0, Math.max(0, c.width - BREITE)];   // zwei Spalten, in der Mitte überlappend
  const ys = [0, Math.max(0, c.height - HOEHE)];
  const teile = [];
  for (const y of ys) for (const x of xs) {
    const d = g.getImageData(x, y, BREITE, HOEHE);
    if (fastLeer(d.data)) continue;
    teile.push({ daten: d, pos: `${ys.indexOf(y) ? 'unten' : 'oben'} ${xs.indexOf(x) ? 'rechts' : 'links'}` });
  }
  return teile;
}

function fastLeer(rgba) {
  let dunkel = 0;
  for (let i = 0; i < rgba.length; i += 16) if (rgba[i] < 200) dunkel++;
  return dunkel < 40;
}

/** Graustufen → 1 bpp mit Floyd-Steinberg; Kontrast vorher etwas anheben, damit Text klar bleibt */
export function dithern(rgba, breite = BREITE, hoehe = HOEHE) {
  const n = breite * hoehe;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const l = (rgba[4 * i] * 299 + rgba[4 * i + 1] * 587 + rgba[4 * i + 2] * 114) / 1000;
    v[i] = Math.min(255, Math.max(0, (l - 40) * 1.3));
  }
  const out = new Uint8Array(breite / 8 * hoehe);
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      const i = y * breite + x;
      const alt = v[i];
      const neu = alt < 128 ? 0 : 255;
      const f = alt - neu;
      if (neu === 0) out[y * (breite / 8) + (x >> 3)] |= 0x80 >> (x & 7);
      if (x + 1 < breite) v[i + 1] += f * 7 / 16;
      if (y + 1 < hoehe) {
        if (x > 0) v[i + breite - 1] += f * 3 / 16;
        v[i + breite] += f * 5 / 16;
        if (x + 1 < breite) v[i + breite + 1] += f / 16;
      }
    }
  }
  return out;
}

/** Kleine Seitenmarke unten rechts in ein ImageData schreiben (z. B. „S. 12 · oben links“) */
export function marke(daten, text) {
  const c = document.createElement('canvas');
  c.width = BREITE; c.height = HOEHE;
  const g = c.getContext('2d');
  g.putImageData(daten, 0, 0);
  g.font = `bold 18px ${FONT}`;
  const w = g.measureText(text).width + 16;
  g.fillStyle = '#000';
  g.fillRect(BREITE - w, HOEHE - 28, w, 28);
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.fillText(text, BREITE - w + 8, HOEHE - 14);
  return g.getImageData(0, 0, BREITE, HOEHE);
}

export { rgbaZu1bpp };
