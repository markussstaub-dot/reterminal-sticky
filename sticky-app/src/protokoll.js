// Sticky-BLE v1 – gemeinsamer Protokollkern (ohne Abhängigkeiten, auch für den Microlino-Knopf gedacht).
// Beschreibung: ../PROTOKOLL.md

export const UUID = {
  dienst:  'b1e50001-7374-6963-6b79-7465726d6e6c',
  befehl:  'b1e50002-7374-6963-6b79-7465726d6e6c', // write / write-no-response, App → Gerät
  ereignis:'b1e50003-7374-6963-6b79-7465726d6e6c', // notify, JSON
  zustand: 'b1e50004-7374-6963-6b79-7465726d6e6c', // read / notify, JSON
  audio:   'b1e50005-7374-6963-6b79-7465726d6e6c', // notify, IMA-ADPCM-Pakete (audio.js)
  datei:   'b1e50006-7374-6963-6b79-7465726d6e6c', // notify, Puffer-Dateien in Stücken (seq:u16 + Daten)
};

export const OP = { BILD_START: 0x01, BILD_DATEN: 0x02, BILD_ENDE: 0x03, PING: 0x10, KARTE: 0x11, BB_INDEX: 0x13, BB_MODUS: 0x14,
  ZEIT: 0x15, FAHRT_LAYOUT: 0x16, PUFFER_LISTE: 0x17, PUFFER_HOLEN: 0x18, PUFFER_LOESCHEN: 0x19, HOME_VERSION: 0x1a, WACH: 0x1b,
  LISTE: 0x20, HOLEN: 0x21, LOESCHEN: 0x22,      // Datei-Abgleich (Zwilling 2.0): /ist lesen und quittieren,
  SCHR_START: 0x23, SCHR_DATEN: 0x24, SCHR_ENDE: 0x25 };   // /soll schreiben (FW ≥ 0.11.0)

export const BREITE = 800, HOEHE = 480;
export const BILD_BYTES = BREITE / 8 * HOEHE; // 48000

const CRC_TAB = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TAB[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** RGBA-Pixel (ImageData.data) → 1 bpp, Zeilen à 100 Byte, MSB zuerst, 1 = schwarz. */
export function rgbaZu1bpp(rgba, breite = BREITE, hoehe = HOEHE, schwelle = 128) {
  const zeile = breite / 8;
  const out = new Uint8Array(zeile * hoehe);
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      const i = (y * breite + x) * 4;
      const hell = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
      const a = rgba[i + 3] / 255;
      const wert = hell * a + 255 * (1 - a); // transparent = weiß
      if (wert < schwelle) out[y * zeile + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

const le = (arr, off, wert, n) => { for (let i = 0; i < n; i++) arr[off + i] = (wert >>> (8 * i)) & 0xff; };

/** BILD_START; mit bereich {x, y, w, h} ein Teilbild (x und w Vielfache von 8). */
export function rahmenStart(bild, bereich = null) {
  const b = new Uint8Array(bereich ? 18 : 14);
  b[0] = OP.BILD_START;
  b[1] = 0; // Format 0 = 1 bpp
  le(b, 2, bereich ? bereich.w : BREITE, 2);
  le(b, 4, bereich ? bereich.h : HOEHE, 2);
  le(b, 6, bild.length, 4);
  le(b, 10, crc32(bild), 4);
  if (bereich) { le(b, 14, bereich.x, 2); le(b, 16, bereich.y, 2); }
  return b;
}

/** Zerlegt das Bild in DATEN-Rahmen; nutzlast = Bytes Bild pro Rahmen. */
/** SCHREIBEN: Start (Größe, CRC, Pfad), Daten in Stücken (wie BILD_DATEN), Ende */
export const rahmenSchreibStart = (daten, pfad) => {
  const t = new TextEncoder().encode(pfad);
  const r = new Uint8Array(9 + t.length);
  r[0] = OP.SCHR_START;
  le(r, 1, daten.length, 4);
  le(r, 5, crc32(daten), 4);
  r.set(t, 9);
  return r;
};
export const rahmenSchreibDaten = (daten, nutzlast) => rahmenDaten(daten, nutzlast, OP.SCHR_DATEN);
export const rahmenSchreibEnde = () => Uint8Array.of(OP.SCHR_ENDE);
/** Alles Persönliche auf dem Sticky löschen (FW ≥ 0.31.6): Kennwort im Rahmen, danach startet er neu */
export const rahmenLeeren = () => Uint8Array.of(0x26, ...new TextEncoder().encode('LEEREN'));

/** Teilbild-Datei für die Offline-Rückmeldung: x, y, w, h (je u16) + 1 bpp, wie die Firmware sie liest */
export function rueckDatei(bytes, bereich) {
  const r = new Uint8Array(8 + bytes.length);
  le(r, 0, bereich.x, 2); le(r, 2, bereich.y, 2); le(r, 4, bereich.w, 2); le(r, 6, bereich.h, 2);
  r.set(bytes, 8);
  return r;
}

export function rahmenDaten(bild, nutzlast, op = OP.BILD_DATEN) {
  const rahmen = [];
  for (let off = 0; off < bild.length; off += nutzlast) {
    const teil = bild.subarray(off, Math.min(off + nutzlast, bild.length));
    const r = new Uint8Array(5 + teil.length);
    r[0] = op;
    le(r, 1, off, 4);
    r.set(teil, 5);
    rahmen.push(r);
  }
  return rahmen;
}

export const rahmenEnde = (schnell) => Uint8Array.of(OP.BILD_ENDE, schnell ? 1 : 0);
/** BILD_ENDE Modus 3: nicht zeigen, als Bordbuch-Seite n im Flash speichern */
export const rahmenSpeichern = (n) => Uint8Array.of(OP.BILD_ENDE, 3, n);
/** Bordbuch-Index als Text: „seiten=N“, „toc=K“, „e x0 y0 x1 y1 seite“ */
export const rahmenBbIndex = (text) => { const t = new TextEncoder().encode(text); const r = new Uint8Array(1 + t.length); r[0] = OP.BB_INDEX; r.set(t, 1); return r; };
/** BILD_ENDE Modus 4: Teilbild als Offline-Rückmeldung slot speichern (0–4 Knöpfe, 5 Diktat, 6 Aufnahme läuft) */
export const rahmenRueck = (slot) => Uint8Array.of(OP.BILD_ENDE, 4, slot);
const textRahmen = (op, text) => { const t = new TextEncoder().encode(text); const r = new Uint8Array(1 + t.length); r[0] = op; r.set(t, 1); return r; };
/** BILD_ENDE Modus 5: als Home-Bild n speichern (0 Karte, 1 Notiz-Seite, 2 Ziffernblatt) */
export const rahmenHome = (n) => Uint8Array.of(OP.BILD_ENDE, 5, n);
export const rahmenHomeVersion = (text) => textRahmen(OP.HOME_VERSION, text);
/** Modus am Sticky: 0 Home, 1 Bordbuch, 2 Notiz */
export const rahmenModus = (m, seite = null) => (seite == null ? Uint8Array.of(OP.BB_MODUS, m) : Uint8Array.of(OP.BB_MODUS, m, seite));
export const rahmenZeit = (ms = Date.now()) => { const r = new Uint8Array(9); r[0] = OP.ZEIT; let v = BigInt(ms); for (let i = 0; i < 8; i++) { r[1 + i] = Number(v & 0xffn); v >>= 8n; } return r; };
export const rahmenFahrtLayout = (text) => textRahmen(OP.FAHRT_LAYOUT, text);
export const rahmenPufferListe = () => Uint8Array.of(OP.PUFFER_LISTE);
/** Ein Stück (bis 480 Byte) der Puffer-Datei ab offset anfordern */
export const rahmenPufferHolen = (name, offset = 0) => {
  const t = new TextEncoder().encode(name);
  const r = new Uint8Array(5 + t.length);
  r[0] = OP.PUFFER_HOLEN;
  le(r, 1, offset, 4);
  r.set(t, 5);
  return r;
};
export const rahmenPufferLoeschen = (name) => textRahmen(OP.PUFFER_LOESCHEN, name);
export const rahmenListe = (pfad) => textRahmen(OP.LISTE, pfad);
/** Ein Stück (bis 480 Byte) einer Datei ab offset anfordern (Antwort auf DATEI wie beim Puffer) */
export const rahmenHolen = (pfad, offset = 0) => {
  const t = new TextEncoder().encode(pfad);
  const r = new Uint8Array(5 + t.length);
  r[0] = OP.HOLEN;
  le(r, 1, offset, 4);
  r.set(t, 5);
  return r;
};
export const rahmenLoeschen = (pfad) => textRahmen(OP.LOESCHEN, pfad);
export const rahmenBbModus = (an, seite = null) => (seite == null ? Uint8Array.of(OP.BB_MODUS, an ? 1 : 0) : Uint8Array.of(OP.BB_MODUS, an ? 1 : 0, seite));
export const rahmenPing = () => Uint8Array.of(OP.PING);
/** „Bleib wach“: zählt am Sticky als Bedienung, er schlummert nicht ein (während der Fahrt, Firmware ≥ 0.8.0) */
export const rahmenWach = () => Uint8Array.of(OP.WACH);
export const rahmenKarte = () => Uint8Array.of(OP.KARTE);

/** Nutzlast pro DATEN-Rahmen aus der ATT-MTU (Kennlinie max. 512 Byte). */
export const nutzlastFuer = (mtu) => Math.min(mtu - 3, 512) - 5;

/** Zerlegt einen Rahmen wieder (für Simulator und Tests). */
export function lies(rahmen) {
  const r32 = (o) => (rahmen[o] | rahmen[o + 1] << 8 | rahmen[o + 2] << 16 | rahmen[o + 3] << 24) >>> 0;
  switch (rahmen[0]) {
    case OP.BILD_START: return { op: 'start', breite: rahmen[2] | rahmen[3] << 8, hoehe: rahmen[4] | rahmen[5] << 8, laenge: r32(6), crc: r32(10),
      x: rahmen.length >= 18 ? rahmen[14] | rahmen[15] << 8 : 0, y: rahmen.length >= 18 ? rahmen[16] | rahmen[17] << 8 : 0 };
    case OP.BILD_DATEN: return { op: 'daten', offset: r32(1), daten: rahmen.subarray(5) };
    case OP.BILD_ENDE: return rahmen[1] === 3 ? { op: 'ende', schnell: false, speichern: rahmen[2] } : { op: 'ende', schnell: rahmen[1] === 1 };
    case OP.BB_INDEX: return { op: 'bbIndex', text: new TextDecoder().decode(rahmen.subarray(1)) };
    case OP.PUFFER_LISTE: return { op: 'pufferListe' };
    case OP.LISTE: return { op: 'liste', pfad: new TextDecoder().decode(rahmen.subarray(1)) };
    case OP.HOLEN: return { op: 'holen', offset: r32(1), pfad: new TextDecoder().decode(rahmen.subarray(5)) };
    case OP.LOESCHEN: return { op: 'loeschen', pfad: new TextDecoder().decode(rahmen.subarray(1)) };
    case OP.SCHR_START: return { op: 'schreibStart', laenge: r32(1), crc: r32(5), pfad: new TextDecoder().decode(rahmen.subarray(9)) };
    case OP.SCHR_DATEN: return { op: 'schreibDaten', offset: r32(1), daten: rahmen.subarray(5) };
    case OP.SCHR_ENDE: return { op: 'schreibEnde' };
    case OP.BB_MODUS: return { op: 'bbModus', m: rahmen[1], an: rahmen[1] === 1, seite: rahmen.length > 2 ? rahmen[2] : null };
    case OP.PING: return { op: 'ping' };
    case OP.KARTE: return { op: 'karte' };
    default: return { op: 'unbekannt' };
  }
}
