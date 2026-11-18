// Zettel zum Vorzeigen (Markus, 13.11.2026: „Ordnung in die Zettel mit QR“; 18.11.2026: Karten statt Textfeld).
// Gespeichert wird weiter ein Text, „## Titel“ je Zettel – so gehen Copy-Paste und die Zenbook-Konsole wie bisher.
// Die App zeigt daraus Karten mit einer Art; die Art ergibt sich aus den Zeilen:
//   qr: Inhalt               QR wörtlich (z. B. Kundenkarte; echte Nummern nur in der App, nie im Repo)
//   strich: [EAN13|CODE128] Nummer   Strichcode (ohne Format: 13 Ziffern = EAN-13, sonst Code128)
//   wlan: Name | Passwort    Gast-WLAN zum Scannen (WPA), Name und Passwort stehen zusätzlich als Text daneben
//   link: https://…          Link als QR
//   [ ] Milch / [x] Brot     Liste zum Abhaken (auch am Sticky, FW ≥ 0.44.0)
//   sticky: aus              Zettel bleibt in der App (Schalter „auf dem Sticky“); höchstens 6 kommen auf den Sticky
//   sonst                    Text (Bestellung zum Vorzeigen)
// Reihenfolge am Sticky = Reihenfolge im Text.
import { T } from './uebersetzen.js';
import { strichFormat } from './strichcode.js';

export const MAX_ZETTEL = 6;
export const MAX_PUNKTE = 20;   // Listenpunkte am Sticky (zwei Spalten à 10)
export const ARTEN = ['qr', 'strich', 'liste', 'text', 'wlan', 'link'];

/** WLAN-QR nach dem üblichen Format WIFI:T:WPA;S:…;P:…;; (\ ; , : " werden maskiert) */
export function wlanQr(name, passwort) {
  const m = (t) => t.replace(/([\\;,:"])/g, '\\$1');
  return passwort ? `WIFI:T:WPA;S:${m(name)};P:${m(passwort)};;` : `WIFI:T:nopass;S:${m(name)};;`;
}

const RE = {
  qr: /^qr:\s*(.+)$/i, strich: /^strich:\s*(.+)$/i, wlan: /^wlan:\s*(.+)$/i, link: /^link:\s*(.+)$/i,
  punkt: /^\[( |x|X)\]\s*(.*)$/, sticky: /^sticky:\s*(aus|off|nein|no)\s*$/i,
};

/** Art eines Zettels aus seinen Zeilen */
export function zettelArt(zeilen) {
  for (const a of ['qr', 'strich', 'wlan', 'link']) if (zeilen.some((z) => RE[a].test(z))) return a;
  return zeilen.some((z) => RE.punkt.test(z)) ? 'liste' : 'text';
}

/**
 * Text → { vorspann, karten: [{ titel, zeilen, aufSticky, art }] }. zeilen = die Textzeilen ohne „sticky: aus“ und
 * ohne Leerzeilen; vorspann = was vor dem ersten „## “ steht (bleibt beim Zurückschreiben erhalten).
 */
export function zettelKarten(text) {
  const t = String(text ?? '').replace(/\r/g, '');
  const teile = t.split(/^## /m);
  const vorspann = teile.shift().trim();
  const karten = teile.map((b) => {
    const [titel, ...rest] = b.split('\n');
    let aufSticky = true;
    const zeilen = [];
    for (const r of rest) {
      const z = r.trim();
      if (!z) continue;
      if (RE.sticky.test(z)) aufSticky = false; else zeilen.push(z);
    }
    return { titel: titel.trim(), zeilen, aufSticky, art: zettelArt(zeilen) };
  }).filter((k) => k.titel || k.zeilen.length);
  return { vorspann, karten };
}

/** Karten → Text (Gegenstück zu zettelKarten) */
export function zettelText({ vorspann = '', karten }) {
  const bloecke = karten.map((k) => [`## ${k.titel}`, ...(k.aufSticky === false ? ['sticky: aus'] : []), ...k.zeilen].join('\n'));
  return [vorspann.trim(), ...bloecke].filter(Boolean).join('\n\n') + '\n';
}

/** Listenpunkte einer Karte: [{ text, ab, zeile }] (Zeilen ohne Kästchen zählen als offene Punkte) */
export const punkte = (zeilen) => zeilen.map((z, zeile) => {
  const m = z.match(RE.punkt);
  return m ? { text: m[2].trim(), ab: m[1] !== ' ', zeile } : { text: z, ab: false, zeile };
}).filter((p) => p.text);

/** „strich: …“ → { format, code } */
export function strichLesen(wert) {
  const m = String(wert).trim().match(/^(EAN-?13|CODE-?128)\s+(.+)$/i);
  const code = (m ? m[2] : String(wert)).trim();
  const format = m ? (/^ean/i.test(m[1]) ? 'EAN13' : 'CODE128') : strichFormat(code);
  return { format, code: format === 'EAN13' ? code.replace(/\s/g, '') : code };
}
export const strichZeile = ({ format, code }) => `strich: ${format} ${code}`;

/**
 * Text → was auf den Sticky kommt (höchstens 6, nur „auf dem Sticky“):
 * [{ titel, art, qr, strich?, punkte?, zeilen }] (qr leer und kein strich/punkte = Text-Zettel)
 */
export function zettelListe(text) {
  return zettelKarten(text).karten.filter((k) => k.aufSticky).map((k) => {
    let qr = '', strich = null;
    const zeilen = [];
    for (const z of k.zeilen) {
      const q = z.match(RE.qr), s = z.match(RE.strich), w = z.match(RE.wlan), l = z.match(RE.link);
      if (q && !qr && !strich) qr = q[1].trim();
      else if (s && !qr && !strich) strich = strichLesen(s[1]);
      else if (w && !qr && !strich) {
        const [name, pw = ''] = w[1].split('|').map((t) => t.trim());
        qr = wlanQr(name, pw);
        zeilen.push(T(`WLAN: ${name}`, `Wi-Fi: ${name}`));   // Sprache beim Bau der Zettel (main.js: im Sticky-Kontext)
        if (pw) zeilen.push(T(`Passwort: ${pw}`, `Password: ${pw}`));
      } else if (l && !qr && !strich) {
        qr = l[1].trim();
        zeilen.push(qr.replace(/^https?:\/\//, ''));
      } else zeilen.push(z);
    }
    const z = { titel: k.titel, art: k.art, qr, zeilen };
    if (strich) z.strich = strich;
    if (k.art === 'liste') z.punkte = punkte(zeilen).slice(0, MAX_PUNKTE);
    return z;
  }).filter((z) => z.titel && (z.qr || z.strich || z.zeilen.length)).slice(0, MAX_ZETTEL);
}

/** Kurzinfo unter dem Titel einer Karte (App) */
export function kurzinfo(k) {
  const wert = (re) => k.zeilen.map((z) => z.match(re)).find(Boolean)?.[1]?.trim() ?? '';
  const kurz = (t, n = 28) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  switch (k.art) {
    case 'liste': {
      const p = punkte(k.zeilen), ab = p.filter((x) => x.ab).length;
      return T(`Liste · ${p.length} Punkte, ${ab} abgehakt`, `List · ${p.length} items, ${ab} ticked`);
    }
    case 'qr': return `QR · ${kurz(wert(RE.qr), 14)}`;
    case 'strich': { const s = strichLesen(wert(RE.strich)); return `${T('Strichcode', 'Barcode')} ${s.format === 'EAN13' ? 'EAN-13' : 'Code128'} · ${kurz(s.code, 16)}`; }
    case 'wlan': return `${T('WLAN', 'Wi-Fi')} · ${wert(RE.wlan).split('|')[0].trim()}`;
    case 'link': return `Link · ${kurz(wert(RE.link).replace(/^https?:\/\//, ''), 32)}`;
    default: return `Text · „${kurz(k.zeilen.join(', '), 34)}“`;
  }
}

/** Titel-Vorschlag zu einem abfotografierten Inhalt */
export function titelVorschlag(inhalt, art) {
  const t = String(inhalt ?? '').trim();
  const wifi = t.match(/^WIFI:.*?S:((?:\\.|[^;])*)/i);
  if (wifi) return wifi[1].replace(/\\(.)/g, '$1');
  try { const u = new URL(t); if (/^https?:$/.test(u.protocol)) return u.hostname.replace(/^www\./, '').split('.').slice(-2, -1)[0].replace(/^./, (c) => c.toUpperCase()); } catch { /* kein Link */ }
  return art === 'strich' ? T('Strichcode', 'Barcode') : T('QR-Code', 'QR code');
}

/** Abfotografierter QR-Inhalt → Zeilen der Karte (WLAN und Links in ihrer Kurzform, damit sie lesbar bleiben) */
export function qrZeilen(inhalt) {
  const t = String(inhalt ?? '').trim();
  const wifi = t.match(/^WIFI:(.*);;?$/i);
  if (wifi) {
    const feld = (k) => wifi[1].match(new RegExp(`(?:^|;)${k}:((?:\\\\.|[^;])*)`))?.[1]?.replace(/\\(.)/g, '$1') ?? '';
    const name = feld('S'), pw = feld('P');
    if (name && !/[|]/.test(name + pw)) return [`wlan: ${name}${pw ? ` | ${pw}` : ''}`];
  }
  if (/^https?:\/\/\S+$/i.test(t)) return [`link: ${t}`];
  return [`qr: ${t}`];
}

/** Titel eindeutig machen („Einkauf“, „Einkauf 2“ …) – Orte und Häkchen verweisen auf den Namen */
export function eindeutig(titel, vorhanden) {
  const belegt = new Set(vorhanden.map((t) => t.toLowerCase()));
  const basis = String(titel).trim() || T('Zettel', 'Card');
  if (!belegt.has(basis.toLowerCase())) return basis;
  for (let i = 2; ; i++) if (!belegt.has(`${basis} ${i}`.toLowerCase())) return `${basis} ${i}`;
}

/**
 * Häkchen vom Sticky übernehmen: /ist/zettel/<n>.txt = Titel, dann je Punkt 0/1 in einer Zeile („0110“).
 * → neuer Text (unverändert, wenn Titel oder Anzahl nicht mehr passen)
 */
export function haekchenUebernehmen(text, istDatei) {
  const [titel = '', zustand = ''] = String(istDatei).replace(/\r/g, '').split('\n').map((z) => z.trim());
  const d = zettelKarten(text);
  const k = d.karten.find((x) => x.titel === titel && x.art === 'liste');
  if (!k || !/^[01]+$/.test(zustand)) return text;
  const p = punkte(k.zeilen).slice(0, MAX_PUNKTE);
  if (p.length !== zustand.length) return text;
  let geaendert = false;
  p.forEach((x, i) => {
    const ab = zustand[i] === '1';
    if (ab !== x.ab) { k.zeilen[x.zeile] = `[${ab ? 'x' : ' '}] ${x.text}`; geaendert = true; }
  });
  return geaendert ? zettelText(d) : text;
}

/** Umzug aus den alten zwei Feldern (Bestellzettel, Karten); der Platzhalter der Karten fällt weg */
export function zettelUmzug(bestell, karten, kartenPlatzhalter) {
  const k = (karten ?? '').trim();
  return [(bestell ?? '').trim(), k && k !== kartenPlatzhalter.trim() ? k : ''].filter(Boolean).join('\n\n') + '\n';
}
