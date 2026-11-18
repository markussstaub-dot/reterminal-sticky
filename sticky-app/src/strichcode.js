// Strichcodes für Zettel (SPEC „Zettel überarbeiten …“, 18.11.2026): EAN-13 (auch UPC-A mit führender 0) und Code128.
// Zeichnen (Module als 0/1-Folge) und Lesen aus einem Foto, beides offline und ohne Bibliothek: jsQR kann nur QR, und
// eine fremde Lese-Bibliothek wollten wir nicht einschleppen. Lesen = mehrere Scanzeilen quer und hochkant, je Zeile
// Hell/Dunkel-Läufe, Muster gegen die Tabellen, Prüfziffer muss stimmen; die häufigste Lesung gewinnt.

// ---- EAN-13 -----------------------------------------------------------------------------------------------------
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_PARITAET = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const umkehren = (s) => [...s].reverse().join('');
const kippen = (s) => [...s].map((c) => (c === '1' ? '0' : '1')).join('');
const EAN_R = EAN_L.map(kippen);
const EAN_G = EAN_R.map(umkehren);

/** Prüfziffer zu 12 Ziffern */
export function eanPruefziffer(zwoelf) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(zwoelf[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10;
}
export const istEan13 = (t) => /^\d{13}$/.test(t) && eanPruefziffer(t) === Number(t[12]);

/** 13 Ziffern (oder 12, Prüfziffer wird ergänzt) → 95 Module als '0'/'1' */
export function ean13Module(text) {
  let t = String(text).replace(/\s/g, '');
  if (/^\d{12}$/.test(t)) t += eanPruefziffer(t);
  if (!istEan13(t)) throw new Error('EAN-13: 13 Ziffern mit gültiger Prüfziffer');
  const par = EAN_PARITAET[Number(t[0])];
  let m = '101';
  for (let i = 1; i <= 6; i++) m += (par[i - 1] === 'L' ? EAN_L : EAN_G)[Number(t[i])];
  m += '01010';
  for (let i = 7; i <= 12; i++) m += EAN_R[Number(t[i])];
  return m + '101';
}

// ---- Code128 ----------------------------------------------------------------------------------------------------
// Breiten (Strich, Lücke, …) je Wert 0–106; 103–105 Start A/B/C, 106 Stopp (7 Elemente, 13 Module)
const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 '
  + '113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 '
  + '212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 '
  + '133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 '
  + '111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 '
  + '134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 '
  + '114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');
export const CODE128_TABELLE = C128;

const breitenZuModulen = (b) => [...b].map((w, i) => (i % 2 ? '0' : '1').repeat(Number(w))).join('');

/** Text → Module; nur Ziffern (gerade Anzahl, ≥ 4) in Satz C, sonst Satz B (ASCII 32–127) */
export function code128Module(text) {
  const t = String(text);
  let werte;
  if (/^\d+$/.test(t) && t.length >= 4 && t.length % 2 === 0) {
    werte = [105];
    for (let i = 0; i < t.length; i += 2) werte.push(Number(t.slice(i, i + 2)));
  } else {
    if (!t || [...t].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 127)) throw new Error('Code128: nur ASCII-Zeichen');
    werte = [104, ...[...t].map((c) => c.charCodeAt(0) - 32)];
  }
  const pruef = werte.reduce((s, w, i) => s + w * (i || 1), 0) % 103;
  return [...werte, pruef, 106].map((w) => breitenZuModulen(C128[w])).join('');
}

/** Format zum Inhalt: 13 Ziffern mit gültiger Prüfziffer (oder 12) = EAN-13, sonst Code128 */
export function strichFormat(code) {
  const t = String(code).replace(/\s/g, '');
  return istEan13(t) || /^\d{12}$/.test(t) ? 'EAN13' : 'CODE128';
}
/** { format, code } → Module */
export const strichModule = ({ format, code }) => (format === 'EAN13' ? ean13Module(code) : code128Module(code));
/** Lesbare Nummer unter dem Strich: EAN-13 als „4 012345 678901“ */
export const strichNummer = ({ format, code }) => {
  const t = String(code).replace(/\s/g, '');
  return format === 'EAN13' && t.length === 13 ? `${t[0]} ${t.slice(1, 7)} ${t.slice(7)}` : t;
};

// ---- Lesen ------------------------------------------------------------------------------------------------------
/** Läufe vergleichen: beobachtete Breiten auf die Summe des Musters normieren, Abstand = Summe der Abweichungen */
function abstand(laeufe, muster) {
  let summe = 0, soll = 0;
  for (let i = 0; i < muster.length; i++) { summe += laeufe[i]; soll += Number(muster[i]); }
  const f = soll / summe;
  let d = 0;
  for (let i = 0; i < muster.length; i++) d += Math.abs(laeufe[i] * f - Number(muster[i]));
  return d;
}
const alsLaeufe = (module) => {
  const r = [];
  for (let i = 0; i < module.length;) { let j = i; while (j < module.length && module[j] === module[i]) j++; r.push(String(j - i)); i = j; }
  return r.join('');
};
const EAN_L_LAEUFE = EAN_L.map(alsLaeufe);                 // beginnen mit Lücke (L, G) bzw. Strich (R): gleiche Läufe
const EAN_G_LAEUFE = EAN_L_LAEUFE.map(umkehren);

/** Läufe ab Index i (i = ein Strich) als EAN-13 lesen → Text oder null */
function eanAb(l, i) {
  if (i + 59 > l.length) return null;
  const modul = l.slice(i, i + 59).reduce((a, b) => a + b, 0) / 95;
  for (const k of [0, 1, 2, 27, 28, 29, 30, 31, 56, 57, 58]) if (Math.abs(l[i + k] / modul - 1) > 0.7) return null;   // Wächter
  let par = '', ziffern = '';
  for (let z = 0; z < 6; z++) {
    const w = l.slice(i + 3 + z * 4, i + 7 + z * 4);
    let best = null;
    for (let d = 0; d < 10; d++) {
      for (const [p, tab] of [['L', EAN_L_LAEUFE], ['G', EAN_G_LAEUFE]]) {
        const a = abstand(w, tab[d]);
        if (!best || a < best.a) best = { a, d, p };
      }
    }
    if (best.a > 1.6) return null;
    ziffern += best.d; par += best.p;
  }
  for (let z = 0; z < 6; z++) {
    const w = l.slice(i + 32 + z * 4, i + 36 + z * 4);
    let best = null;
    for (let d = 0; d < 10; d++) { const a = abstand(w, EAN_L_LAEUFE[d]); if (!best || a < best.a) best = { a, d }; }
    if (best.a > 1.6) return null;
    ziffern += best.d;
  }
  const erste = EAN_PARITAET.indexOf(par);
  if (erste < 0) return null;
  const t = erste + ziffern;
  return istEan13(t) ? t : null;
}

/** Läufe ab Index i (Strich) als Code128 → Text oder null */
function code128Ab(l, i) {
  const symbol = (k, kandidaten) => {
    const w = l.slice(k, k + 6);
    if (w.length < 6) return null;
    let best = null;
    for (const v of kandidaten) { const a = abstand(w, C128[v].slice(0, 6)); if (!best || a < best.a) best = { a, v }; }
    return best && best.a <= 1.8 ? best.v : null;
  };
  const alle = [...C128.keys()].slice(0, 106);
  const start = symbol(i, [103, 104, 105]);
  if (start == null) return null;
  const werte = [start];
  for (let k = i + 6; k + 6 <= l.length; k += 6) {
    // Stopp: 7 Läufe, 2331112
    if (k + 7 <= l.length && abstand(l.slice(k, k + 7), C128[106]) <= 2.0 && werte.length >= 3) {
      const daten = werte.slice(0, -1), pruef = werte[werte.length - 1];
      const soll = daten.reduce((s, w, j) => s + w * (j || 1), 0) % 103;
      if (pruef === soll) return code128Text(daten);   // sonst war es ein Zeichen, das dem Stopp ähnelt: weiter
    }
    const v = symbol(k, alle);
    if (v == null) return null;
    werte.push(v);
    if (werte.length > 60) return null;
  }
  return null;
}

/** Werte (mit Start) → Text, Sätze A/B/C mit Wechsel und Umschalter */
function code128Text(werte) {
  let satz = { 103: 'A', 104: 'B', 105: 'C' }[werte[0]];
  let t = '', shift = false;
  for (const v of werte.slice(1)) {
    const s = shift ? (satz === 'A' ? 'B' : 'A') : satz;
    shift = false;
    if (s === 'C') {
      if (v < 100) t += String(v).padStart(2, '0');
      else if (v === 100) satz = 'B'; else if (v === 101) satz = 'A';
      continue;
    }
    if (v < 96) t += String.fromCharCode(s === 'A' ? (v < 64 ? v + 32 : v - 64) : v + 32);
    else if (v === 98) shift = true;
    else if (v === 99) satz = 'C';
    else if (v === 100 && s === 'A') satz = 'B';
    else if (v === 101 && s === 'B') satz = 'A';
    // 96, 97, 102 (FNC) und FNC4 ignorieren
  }
  return t;
}

/** Helligkeitszeile → Läufe [Breite …] ab dem ersten dunklen Lauf (lokale Schwelle, damit Schatten nicht stören) */
function laeufeAus(zeile) {
  const n = zeile.length;
  const fenster = Math.max(15, Math.round(n / 10));
  const summe = new Float64Array(n + 1);
  let min = 255, max = 0;
  for (let i = 0; i < n; i++) { summe[i + 1] = summe[i] + zeile[i]; if (zeile[i] < min) min = zeile[i]; if (zeile[i] > max) max = zeile[i]; }
  if (max - min < 40) return [];
  const mitte = (min + max) / 2;
  const l = [];
  let farbe = null, lauf = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - fenster), b = Math.min(n, i + fenster);
    const lokal = (summe[b] - summe[a]) / (b - a);
    const dunkel = zeile[i] < (lokal + mitte) / 2;
    if (farbe === null) { if (!dunkel) continue; farbe = true; lauf = 1; continue; }
    if (dunkel === farbe) lauf++;
    else { l.push(lauf); farbe = dunkel; lauf = 1; }
  }
  if (farbe) l.push(lauf);
  return l;   // gerade Indizes = dunkel
}

function zeileLesen(zeile) {
  const funde = [];
  for (const l of [laeufeAus(zeile), laeufeAus(zeile.slice().reverse())]) {
    for (let i = 0; i < l.length; i += 2) {
      const e = eanAb(l, i);
      if (e) { funde.push({ format: 'EAN13', code: e }); break; }
      const c = code128Ab(l, i);
      if (c) { funde.push({ format: 'CODE128', code: c }); break; }
    }
  }
  return funde;
}

/** Helligkeit (w × h, 0–255) → { format, code } oder null */
export function strichAusHelligkeit(hell, w, h) {
  const stimmen = new Map();
  const zaehle = (f) => { const k = `${f.format}|${f.code}`; stimmen.set(k, (stimmen.get(k) ?? 0) + 1); };
  const zeilen = 24;
  for (let k = 1; k < zeilen; k++) {
    const y = Math.round((h * k) / zeilen);
    zeileLesen(hell.subarray(y * w, y * w + w)).forEach(zaehle);
  }
  if (!stimmen.size) {   // hochkant fotografiert
    const spalte = new Uint8ClampedArray(h);
    for (let k = 1; k < zeilen; k++) {
      const x = Math.round((w * k) / zeilen);
      for (let y = 0; y < h; y++) spalte[y] = hell[y * w + x];
      zeileLesen(spalte).forEach(zaehle);
    }
  }
  if (!stimmen.size) return null;
  const [k] = [...stimmen.entries()].sort((a, b) => b[1] - a[1])[0];
  const [format, code] = k.split('|');
  return { format, code: k.slice(format.length + 1) || code };
}

/** RGBA → Helligkeit */
export function helligkeit(rgba, w, h) {
  const hell = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; j < hell.length; i += 4, j++) hell[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  return hell;
}
