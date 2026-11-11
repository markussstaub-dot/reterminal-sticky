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
  }
  paket(p, jetzt = performance.now()) {
    const { seq, pcm } = dekodiere(p);
    this.teile.set(seq, pcm);
    this.bytes += p.length;
    this.tErstes ??= jetzt;
    this.tLetztes = jetzt;
  }
  ergebnis() {
    const seqs = [...this.teile.keys()];
    const max = seqs.length ? Math.max(...seqs) : -1;
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
