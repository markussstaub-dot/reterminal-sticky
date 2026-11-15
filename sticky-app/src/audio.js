// Audio-Teil von Sticky-BLE v1: IMA-ADPCM 16 kHz mono, Pakete mit eigenem Decoder-Zustand, WAV-Bau.
// Paket: seq:u16 · prädiktor:i16 · index:u8 · ADPCM (2 Samples je Byte, erstes im unteren Nibble)

export const RATE = 16000;
export const SAMPLES_JE_PAKET = 480; // 30 ms

const STEP = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97,
  107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
  876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871,
  5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623,
  27086, 29794, 32767];
const INDEX = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
const klemme = (v, a, b) => (v < a ? a : v > b ? b : v);

function schritt(z, code) {
  const step = STEP[z.index];
  let vp = step >> 3;
  if (code & 4) vp += step;
  if (code & 2) vp += step >> 1;
  if (code & 1) vp += step >> 2;
  z.pred = klemme(z.pred + (code & 8 ? -vp : vp), -32768, 32767);
  z.index = klemme(z.index + INDEX[code], 0, 88);
  return z.pred;
}

/** Zerlegt ein Audio-Paket in seq und PCM-Samples. */
export function dekodiere(paket) {
  const seq = paket[0] | (paket[1] << 8);
  let pred = paket[2] | (paket[3] << 8);
  if (pred & 0x8000) pred -= 0x10000;
  const z = { pred, index: klemme(paket[4], 0, 88) };
  const n = (paket.length - 5) * 2;
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const b = paket[5 + (i >> 1)];
    pcm[i] = schritt(z, i & 1 ? b >> 4 : b & 0x0f);
  }
  return { seq, pcm };
}

/** Encoder wie in der Firmware (für Simulator und Tests). */
export function kodiere(pcm, seq, z = { pred: 0, index: 0 }) {
  const p = new Uint8Array(5 + pcm.length / 2);
  p[0] = seq & 0xff; p[1] = (seq >> 8) & 0xff;
  p[2] = z.pred & 0xff; p[3] = (z.pred >> 8) & 0xff; p[4] = z.index;
  for (let i = 0; i < pcm.length; i++) {
    let step = STEP[z.index];
    let diff = pcm[i] - z.pred;
    let code = 0;
    if (diff < 0) { code = 8; diff = -diff; }
    let vp = step >> 3;
    if (diff >= step) { code |= 4; diff -= step; vp += step; }
    step >>= 1;
    if (diff >= step) { code |= 2; diff -= step; vp += step; }
    step >>= 1;
    if (diff >= step) { code |= 1; vp += step; }
    z.pred = klemme(z.pred + (code & 8 ? -vp : vp), -32768, 32767);
    z.index = klemme(z.index + INDEX[code], 0, 88);
    if (i & 1) p[5 + (i >> 1)] |= code << 4; else p[5 + (i >> 1)] = code;
  }
  return p;
}

/** Sammelt Pakete einer Aufnahme; Lücken (verlorene Pakete) werden zu Stille. */
export class Aufnahme {
  constructor() {
    this.teile = new Map();
    this.bytes = 0;
    this.tErstes = null;
    this.tLetztes = null;
    this.basis = 0;          // seq ist u16: nach 65536 Paketen (~33 min, Recorder) läuft sie über
    this.letzte = null;
  }
  paket(p, jetzt = performance.now()) {
    const { seq: roh, pcm } = dekodiere(p);
    if (this.letzte != null && roh < this.letzte - 32768) this.basis += 65536;
    this.letzte = roh;
    const seq = this.basis + roh;
    this.teile.set(seq, pcm);
    this.bytes += p.length;
    this.tErstes ??= jetzt;
    this.tLetztes = jetzt;
  }
  ergebnis() {
    let max = -1;   // ohne Math.max(...): bei einer Stunde sind es 120 000 Pakete
    for (const s of this.teile.keys()) if (s > max) max = s;
    const pcm = new Int16Array((max + 1) * SAMPLES_JE_PAKET);
    let fehlend = 0;
    for (let s = 0; s <= max; s++) {
      const t = this.teile.get(s);
      if (t) pcm.set(t, s * SAMPLES_JE_PAKET); else fehlend++;
    }
    let spitze = 0;
    for (const v of pcm) if (Math.abs(v) > spitze) spitze = Math.abs(v);
    const dauerMs = Math.round(pcm.length / RATE * 1000);
    const funkMs = this.tLetztes != null ? this.tLetztes - this.tErstes : 0;
    return {
      pcm,
      pakete: this.teile.size,
      fehlend,
      dauerMs,
      bytes: this.bytes,
      kbitS: funkMs > 0 ? Math.round(this.bytes * 8 / funkMs) : 0, // Bytes·8/ms = kbit/s
      spitze,
    };
  }
}

/** nur der 44-Byte-Kopf einer WAV-Datei mit n Samples (zum Schreiben in Teilen) */
export function wavKopf(n, rate = RATE) {
  const k = wav(new Int16Array(0), rate), v = new DataView(k.buffer);
  v.setUint32(4, 36 + n * 2, true);
  v.setUint32(40, n * 2, true);
  return k;
}

/** 16-bit-PCM mono → WAV-Datei. */
export function wav(pcm, rate = RATE) {
  const b = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(b);
  const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); s(8, 'WAVE');
  s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(b, 44).set(pcm);
  return new Uint8Array(b);
}

/**
 * Lohnt sich die Erkennung? Kurze oder kaum hörbare Aufnahmen lässt whisper sonst Wörter erfinden – mit Wortliste
 * z. B. ein Ortsname zweimal („X. X.“) aus 0,9 s Rauschen (Messung 11.11.2026). Rahmen à 30 ms, Pegel in dBFS.
 * → { ok, grund, dauerMs, spitzeDb, grundDb }
 */
/** Leise Diktate anheben (12.11.2026: Sticky weiter weg, Sprache bei −30…−38 dBFS): Spitze auf ~−6 dBFS, höchstens ×8 */
export function angehoben(pcm) {
  let spitze = 0;
  for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > spitze) spitze = a; }
  if (spitze < 1) return pcm;
  const faktor = Math.min(8, 16384 / spitze);
  if (faktor <= 1.2) return pcm;
  const aus = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) aus[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * faktor)));
  return aus;
}

export function sprachPruefung(pcm, rate = RATE) {
  const dauerMs = Math.round(pcm.length / rate * 1000);
  const n = Math.floor(rate * 0.03);
  const pegel = [];
  for (let o = 0; o + n <= pcm.length; o += n) {
    let q = 0;
    for (let i = o; i < o + n; i++) q += pcm[i] * pcm[i];
    pegel.push(20 * Math.log10(Math.sqrt(q / n) / 32768 + 1e-9));
  }
  pegel.sort((a, b) => a - b);
  const quantil = (p) => (pegel.length ? pegel[Math.min(pegel.length - 1, Math.floor(p * pegel.length))] : -120);
  const spitzeDb = Math.round(quantil(0.9)), grundDb = Math.round(quantil(0.2));
  let grund = null;
  if (dauerMs < 1000) grund = 'zu kurz';
  else if (spitzeDb < -38) grund = 'zu leise';
  else if (spitzeDb - grundDb < 8) grund = 'keine klare Sprache';
  return { ok: !grund, grund, dauerMs, spitzeDb, grundDb };
}

/** Besteht der Text nur aus Wörtern der Wortliste, hat whisper die Vorgabe nachgeplappert */
export function nurWortliste(text, liste) {
  const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const erlaubt = new Set(norm(liste));
  const woerter = norm(text);
  return woerter.length > 0 && woerter.every((w) => erlaubt.has(w));
}

/** Puffer-Datei (Pakete à 5 + 240 Byte hintereinander) der Reihe nach → PCM; seq zählt nicht (läuft nach ~33 min über) */
export function dekodiereDatei(daten, paketBytes = 5 + SAMPLES_JE_PAKET / 2) {
  const n = Math.floor(daten.length / paketBytes);
  const pcm = new Int16Array(n * SAMPLES_JE_PAKET);
  for (let k = 0; k < n; k++) pcm.set(dekodiere(daten.subarray(k * paketBytes, (k + 1) * paketBytes)).pcm, k * SAMPLES_JE_PAKET);
  return pcm;
}

/**
 * Lange Aufnahmen (Recorder) in Stücke für die Erkennung schneiden: whisper hört in 30-s-Fenstern, ein Stück der
 * ganzen Stunde wäre zu groß. Geschnitten wird an der leisesten 30-ms-Stelle zwischen min und max Sekunden.
 * → [[start, ende], …] in Samples
 */
export function stuecke(pcm, { minS = 20, maxS = 29, rate = RATE } = {}) {
  const rahmen = Math.floor(rate * 0.03), aus = [];
  let a = 0;
  while (pcm.length - a > maxS * rate) {
    let besterPegel = Infinity, schnitt = a + maxS * rate;
    for (let o = a + minS * rate; o + rahmen <= a + maxS * rate; o += rahmen) {
      let q = 0;
      for (let i = o; i < o + rahmen; i++) q += pcm[i] * pcm[i];
      if (q < besterPegel) { besterPegel = q; schnitt = o + (rahmen >> 1); }
    }
    aus.push([a, schnitt]);
    a = schnitt;
  }
  if (pcm.length > a) aus.push([a, pcm.length]);
  return aus;
}

/** „mm:ss“ bzw. „h:mm:ss“ */
export function zeitmarke(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
}

/** Texte der Stücke zusammensetzen, Merker (ms ab Beginn) als „⚑ mm:ss“ vor das Stück, in dem sie liegen */
export function mitMerkern(teile, merker = [], rate = RATE) {
  const rest = [...merker].sort((x, y) => x - y);
  const aus = [];
  for (const { von, bis, text } of teile) {
    while (rest.length && rest[0] < (bis / rate) * 1000) aus.push(`⚑ ${zeitmarke(rest.shift())}`);
    if (text) aus.push(text);
  }
  for (const m of rest) aus.push(`⚑ ${zeitmarke(m)}`);
  return aus.join(' ').trim();
}
