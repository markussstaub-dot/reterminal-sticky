// Dokumente (SPEC „Dokumente: App-Reiter als Dokumenten-Manager, Handbuch und Spickzettel getrennt“, abgenommen
// 15.11.2026). Aus dem Bordbuch werden zwei Seiten am Sticky: Handbuch (große PDFs, /soll/doku/<name>/, Bibliothek →
// Inhaltsverzeichnis → Seite) und Spickzettel (kurze Karten, /soll/spick/). Die App rendert alle Bilder; die Firmware
// (doku.h) blättert und schreibt nur Seitenzahlen selbst hinein. Logik ohne DOM ist in Node testbar (tests/dokumente.test.js);
// die Zeichenfunktionen bekommen einen 2D-Kontext.
import { braunKnopf, BRAUN_FONT } from './braun.js';
import { T } from './uebersetzen.js';

export const BREITE = 800, HOEHE = 480;
const REITER_B = 800 - 368 - 16;   // links neben der Statuszeile des Sticky (wie widgets.js)

/** Szenen-Marken zum Start (SPEC „Spickzettel-Konsole“); weitere entstehen durch Eintippen */
export const SZENEN_START = ['micro', 'werkstatt', 'lab', 'notfall', 'unterwegs'];

// ---- Karten ----------------------------------------------------------------------------------------------------
/**
 * Spickzettel-Text → Karten [{ titel, marken, zeilen }]. Format wie in der Konsole: „## Titel #marke #marke“, darunter
 * Zeilen, „!“ am Anfang = fett. Text vor der ersten Karte zählt nicht.
 */
export function karten(text) {
  const liste = [];
  for (const block of String(text ?? '').split(/^## /m).slice(1)) {
    const [kopf, ...zeilen] = block.split('\n');
    const marken = [...kopf.matchAll(/(?:^|\s)#([\p{L}\d_-]+)/gu)].map((m) => m[1].toLowerCase());
    const titel = kopf.replace(/(?:^|\s)#[\p{L}\d_-]+/gu, '').trim();
    if (!titel) continue;
    liste.push({ titel, marken, zeilen: zeilen.map((z) => z.trimEnd()).filter((z) => z.trim()) });
  }
  return liste;
}

/** Karten einer Szene: ohne Marke = in jeder Szene; Szene „“ (Alle) = alle */
export const kartenDerSzene = (liste, szene) => (szene ? liste.filter((k) => !k.marken.length || k.marken.includes(szene)) : liste);

/** alle Marken im Vorrat plus die Start-Szenen, in fester Reihenfolge */
export function alleMarken(liste) {
  const s = new Set(SZENEN_START);
  for (const k of liste) for (const m of k.marken) s.add(m);
  return [...s];
}

/** Karten fremder Herkunft (Handgriffe) anhängen, gleiche Titel überspringen → neuer Text */
export function kartenAnhaengen(text, dazu) {
  const da = new Set(karten(text).map((k) => k.titel.toLowerCase()));
  const neu = String(dazu ?? '').split(/^(?=## )/m).filter((b) => b.startsWith('## ') && !da.has(karten(b)[0]?.titel.toLowerCase()));
  if (!neu.length) return text;
  return `${String(text ?? '').trimEnd()}\n\n${neu.map((b) => b.trim()).join('\n\n')}\n`;
}

// ---- Namen und Inhaltsverzeichnis --------------------------------------------------------------------------------
/** Ordnername am Sticky aus dem Titel: klein, ASCII, Bindestriche, höchstens 20 Zeichen */
export function ordnerName(titel, belegt = []) {
  const basis = String(titel ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[^\x00-\x7f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'dokument';
  let n = basis, i = 2;
  while (belegt.includes(n)) n = `${basis.slice(0, 17)}-${i++}`;
  return n;
}

/** Inhaltsverzeichnis als Text „Titel | Seite“ je Zeile ↔ [{ titel, seite }] (PDF-Seiten) */
export function inhaltLesen(text) {
  return String(text ?? '').split('\n').map((z) => z.match(/^(.+?)\s*\|\s*(\d{1,4})\s*$/)).filter(Boolean)
    .map((m) => ({ titel: m[1].trim(), seite: +m[2] }));
}
export const inhaltText = (liste) => liste.map((e) => `${e.titel} | ${e.seite}`).join('\n');

/** höchstens so viele Einträge passen ins Inhaltsverzeichnis am Sticky (zwei Spalten à 7) */
export const INHALT_MAX = 14;

// ---- Index-Dateien für die Firmware (doku.h) ------------------------------------------------------------------------
const feldZeile = (art, s, f) => `${art} ${s} ${Math.round(f.x0)} ${Math.round(f.y0)} ${Math.round(f.x1)} ${Math.round(f.y1)} ${f.ziel}`;

/** index.txt eines Handbuchs: Bildschirm 0 = Inhaltsverzeichnis, danach die PDF-Ausschnitte */
export function dokIndex({ seiten, pdf, felder, lz, reiter = [] }) {
  return [`seiten=${seiten}`, 'toc=0', `pdf=${pdf.join(',')}`,
    ...felder.map((f) => feldZeile('f', 0, f)),
    ...reiter.map((f) => feldZeile('g', 0, f)),
    ...(lz ? [`lz ${lz.x0} ${lz.y0} ${lz.x1} ${lz.y1}`] : [])].join('\n') + '\n';
}

/** index.txt der Spickzettel: je Karte die Felder der Titel-Liste, Reiter auf allen */
export function spickIndex(seiten, felderJeKarte, reiter = []) {
  return [`seiten=${seiten}`, 'toc=-1',
    ...felderJeKarte.flatMap((fs, i) => fs.map((f) => feldZeile('f', i, f))),
    ...reiter.map((f) => feldZeile('g', -1, f))].join('\n') + '\n';
}

/** bibliothek.txt: je Kachel „d x0 y0 x1 y1 name“, Reiter als „g -1 …“ */
export function bibIndex(kacheln, reiter = []) {
  return [...kacheln.map((k) => `d ${k.x0} ${k.y0} ${k.x1} ${k.y1} ${k.name}`), ...reiter.map((f) => feldZeile('g', -1, f))].join('\n') + '\n';
}

/** Fenster der Titel-Liste: bis zu n Titel, die gewählte Karte möglichst an dritter Stelle */
export function listenFenster(anzahl, aktiv, n = 6) {
  const start = Math.max(0, Math.min(aktiv - 2, anzahl - n));
  return { start, ende: Math.min(anzahl, start + n) };
}

// ---- Umbenennen statt neu übertragen (FW ≥ 0.38.0, <ordner>/umbenennen.txt) ---------------------------------------
/**
 * alt: { name: crc } aus stand.txt (nur Dateien, die wirklich da sind), neu: [{ n, crc }].
 * → [[alt, neu], …]: Dateien, deren Inhalt schon unter anderem Namen auf der Karte liegt. Was schon richtig liegt, bleibt.
 */
export function umbenennenPlan(alt, neu) {
  const bleibt = new Set(neu.filter((d) => alt[d.n] === d.crc).map((d) => d.n));
  const quellen = new Map();
  for (const [n, c] of Object.entries(alt)) if (!bleibt.has(n) && n !== 'stand.txt') (quellen.get(c) ?? quellen.set(c, []).get(c)).push(n);
  const paare = [];
  for (const d of neu) {
    if (bleibt.has(d.n)) continue;
    const q = quellen.get(d.crc);
    if (q?.length) paare.push([q.shift(), d.n]);
  }
  return paare;
}

// ---- Karussell-Umstellung ------------------------------------------------------------------------------------------
/** Einmalig: „Bordbuch“ in einer eigenen Karussell-Liste wird „Handbuch, Spickzettel“ (Wörter durch Komma) */
export function karussellOhneBordbuch(text, en = false) {
  const w = String(text ?? '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  const i = w.findIndex((x) => ['bordbuch', 'logbook'].includes(x.toLowerCase()));
  if (i < 0) return text;
  const neu = en ? ['Manual', 'Cheat sheets'] : ['Handbuch', 'Spickzettel'];
  w.splice(i, 1, ...neu.filter((n) => !w.some((x) => x.toLowerCase() === n.toLowerCase())));
  return w.join(', ');
}

// ---- Zeichnen (800 × 480, quer) --------------------------------------------------------------------------------
function leer(g) {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  g.fillStyle = '#000';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
}

/** Kopf: Reiter der Gruppe (glieder [{ name, i }], aktiv) oder Titel; → Felder für die Reiter */
function kopf(g, titel, reiter) {
  if (!reiter) {
    g.font = `500 24px ${BRAUN_FONT}`;
    g.fillText(titel, 16, 18);
    return [];
  }
  const felder = [], n = reiter.glieder.length, b = Math.floor(REITER_B / n);
  reiter.glieder.forEach((x, j) => {
    braunKnopf(g, 8 + j * b, 0, b, 36, x.name, j === reiter.aktiv ? 'wahl' : 'neben', { gr: n > 3 ? 18 : 22, rand: 3 });
    if (j !== reiter.aktiv) felder.push({ x0: 8 + j * b, y0: 0, x1: 8 + (j + 1) * b, y1: 44, ziel: x.i });
  });
  g.fillStyle = '#000';
  g.textAlign = 'left';   // braunKnopf lässt „center“ stehen
  g.textBaseline = 'middle';
  return felder;
}

function passend(g, text, breite, gross, klein = 14, gewicht = '') {
  let gr = gross;
  do { g.font = `${gewicht}${gr}px ${BRAUN_FONT}`; gr -= 1; } while (g.measureText(text).width > breite && gr >= klein);
  let t = text;
  while (g.measureText(t).width > breite && t.length > 3) t = t.slice(0, -2) + '…';
  return t;
}

/**
 * Bibliothek: eine Kachel je Dokument ([{ name, titel, seiten }]); unten in der Kachel bleibt Platz für „S. n / m“
 * (schreibt der Sticky). → { kacheln: [{ x0, y0, x1, y1, name }], reiter }
 */
export function zeichneBibliothek(g, doks, reiter = null) {
  leer(g);
  const rf = kopf(g, T('Handbuch', 'Manual'), reiter);
  const n = Math.max(1, doks.length), spalten = n <= 3 ? n : n <= 6 ? 3 : 4, zeilen = Math.ceil(n / spalten);
  const top = 56, unten = 470, luecke = 16;
  const kb = Math.min(240, Math.floor((BREITE - 32 - luecke * (spalten - 1)) / spalten));
  const kh = Math.floor((unten - top - luecke * (zeilen - 1)) / zeilen);
  const x0 = Math.round((BREITE - (kb * spalten + luecke * (spalten - 1))) / 2);
  const kacheln = doks.map((d, i) => {
    const x = x0 + (i % spalten) * (kb + luecke), y = top + Math.floor(i / spalten) * (kh + luecke);
    g.lineWidth = 2;
    g.strokeStyle = '#000';
    g.beginPath(); g.roundRect(x + 3, y + 3, kb - 6, kh - 6, 22); g.stroke();
    if (kh > 260) for (let l = 0; l < 5; l++) {   // angedeutete Zeilen wie im Mockup
      g.fillStyle = '#999';
      g.fillRect(x + 40, y + 58 + l * 26, kb - 80 - (l % 3) * 30, 6);
    }
    g.fillStyle = '#000';
    g.textAlign = 'center';
    const ty = kh > 260 ? y + kh - 120 : y + kh / 2 - 34;
    g.fillText(passend(g, d.titel, kb - 28, 28, 16, 'bold '), x + kb / 2, ty);
    g.font = `18px ${BRAUN_FONT}`;
    if (d.seiten) g.fillText(T(`${d.seiten} Seiten`, `${d.seiten} pages`), x + kb / 2, ty + 34);
    g.textAlign = 'left';
    return { x0: x, y0: y, x1: x + kb, y1: y + kh, name: d.name };
  });
  return { kacheln, reiter: rf };
}

/**
 * Inhaltsverzeichnis (Bildschirm 0 eines Handbuchs): eintraege [{ titel, seite (PDF), ziel (Bildschirm) }], höchstens 14.
 * Rechts oben das Lesezeichen-Feld (leer, der Sticky schreibt hinein). → { felder, lz, reiter }
 */
export function zeichneInhaltsverzeichnis(g, titel, eintraege, reiter = null) {
  leer(g);
  const rf = kopf(g, titel, reiter);
  g.font = `bold 24px ${BRAUN_FONT}`;
  g.fillText(passend(g, `${titel} · ${T('Inhalt', 'Contents')}`, 410, 24, 16, 'bold '), 16, 66);
  const lz = { x0: 440, y0: 48, x1: 792, y1: 86 };
  const liste = eintraege.slice(0, INHALT_MAX);
  const spalten = liste.length > 7 ? 2 : 1, proSpalte = Math.ceil(liste.length / spalten) || 1;
  const sb = spalten === 2 ? 384 : 768, h = Math.min(54, Math.floor((470 - 96) / proSpalte));
  const felder = liste.map((e, i) => {
    const xx = 16 + Math.floor(i / proSpalte) * sb, y = 96 + (i % proSpalte) * h;
    g.lineWidth = 2;
    g.strokeStyle = '#000';
    g.beginPath(); g.roundRect(xx, y, sb - (spalten === 2 ? 8 : 0), h - 6, (h - 6) / 2); g.stroke();
    const gr = Math.min(24, h - 22);
    g.font = `${gr}px ${BRAUN_FONT}`;
    g.textAlign = 'right';
    const s = String(e.seite);
    g.fillText(s, xx + sb - (spalten === 2 ? 8 : 0) - 22, y + (h - 6) / 2 + 1);
    const sw = g.measureText(s).width;
    g.textAlign = 'left';
    g.fillText(passend(g, e.titel, sb - sw - 70, gr, 14), xx + 22, y + (h - 6) / 2 + 1);
    return { x0: xx, y0: y, x1: xx + sb - (spalten === 2 ? 8 : 0), y1: y + h - 6, ziel: e.ziel };
  });
  if (!liste.length) {
    g.font = `22px ${BRAUN_FONT}`;
    g.fillText(T('Kein Inhaltsverzeichnis – ▼ blättert durch die Seiten', 'No contents – ▼ pages through'), 16, 140);
  }
  return { felder, lz, reiter: rf };
}

/** Zeilen einer Karte in ein Feld setzen (umbrechen, Schrift nur so weit verkleinern, bis alles passt) */
function kartenText(g, zeilen, x, y, breite, hoehe) {
  const umbrechen = (t, fett, gr) => {
    g.font = `${fett ? 'bold ' : ''}${gr}px ${BRAUN_FONT}`;
    const b = breite - (fett ? 0 : 12);
    const teile = [];
    let rest = t;
    while (g.measureText(rest).width > b) {
      let i = rest.length;
      do i = rest.lastIndexOf(' ', i - 1); while (i > 0 && g.measureText(rest.slice(0, i)).width > b);
      if (i <= 0) break;
      teile.push(rest.slice(0, i).trimEnd());
      rest = '  ' + rest.slice(i).trimStart();
    }
    teile.push(rest);
    return teile;
  };
  const setzen = (gr) => zeilen.flatMap((z) => { const fett = z.startsWith('!'); return umbrechen(fett ? z.slice(1) : z, fett, gr).map((t) => ({ t, fett })); });
  const hoeheVon = (zs, gr) => zs.reduce((s, z) => s + gr * (z.fett ? 1.38 : 1.28), 0);
  let gr = 28, zs = setzen(gr);
  while (gr > 16 && hoeheVon(zs, gr) > hoehe) zs = setzen(--gr);
  let yy = y + gr * 0.6;
  for (const { t, fett } of zs) {
    g.font = `${fett ? 'bold ' : ''}${gr}px ${BRAUN_FONT}`;
    g.fillText(t, fett ? x : x + 12, yy);
    yy += gr * (fett ? 1.38 : 1.28);
  }
  return gr;
}

/**
 * Spickzettel-Karte i: links die Titel-Liste (Fenster um die Karte, gewählte schwarz), rechts die Karte.
 * → { felder: Titel → Karte, reiter }
 */
export function zeichneSpickKarte(g, liste, i, reiter = null) {
  leer(g);
  const rf = kopf(g, T('Spickzettel', 'Cheat sheets'), reiter);
  const { start, ende } = listenFenster(liste.length, i);
  const felder = [];
  for (let j = start; j < ende; j++) {
    const y = 50 + (j - start) * 66;   // 6 Zeilen bis y 446, darunter der Hinweis auf weitere
    braunKnopf(g, 8, y, 300, 64, liste[j].titel, j === i ? 'wahl' : 'neben', { gr: 21, rand: 4 });
    if (j !== i) felder.push({ x0: 8, y0: y, x1: 308, y1: y + 64, ziel: j });
  }
  g.fillStyle = '#000';
  g.font = `16px ${BRAUN_FONT}`;
  g.textAlign = 'center';
  const mehr = [start > 0 ? `▲ ${start}` : '', ende < liste.length ? `▼ ${liste.length - ende}` : ''].filter(Boolean).join(' · ');
  if (mehr) g.fillText(T(`${mehr} weitere`, `${mehr} more`), 158, 464);
  g.textAlign = 'left';
  g.fillRect(320, 52, 2, 420);
  const k = liste[i];
  g.font = `bold 30px ${BRAUN_FONT}`;
  g.fillText(passend(g, k.titel, 440, 30, 18, 'bold '), 338, 78);
  kartenText(g, k.zeilen, 338, 112, 446, 330);
  g.font = `16px ${BRAUN_FONT}`;
  g.textAlign = 'right';
  g.fillText(`${i + 1}/${liste.length}`, 790, 466);
  g.textAlign = 'left';
  return { felder, reiter: rf };
}
