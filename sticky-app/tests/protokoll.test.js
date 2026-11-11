import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, rgbaZu1bpp, rahmenStart, rahmenDaten, rahmenEnde, lies, nutzlastFuer, BILD_BYTES, BREITE, HOEHE } from '../src/protokoll.js';

test('crc32 wie zlib', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('1 bpp: schwarz = 1, MSB zuerst, Zeile 100 Byte', () => {
  const rgba = new Uint8ClampedArray(BREITE * HOEHE * 4).fill(255);
  const schwarz = (x, y) => { const i = (y * BREITE + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 0; };
  schwarz(0, 0); schwarz(9, 0); schwarz(799, 479);
  const b = rgbaZu1bpp(rgba);
  assert.equal(b.length, BILD_BYTES);
  assert.equal(b[0], 0x80);
  assert.equal(b[1], 0x40);
  assert.equal(b[BILD_BYTES - 1], 0x01);
});

test('Rahmen ergeben zusammengesetzt wieder das Bild', () => {
  const bild = new Uint8Array(BILD_BYTES).map((_, i) => (i * 31) & 0xff);
  const s = lies(rahmenStart(bild));
  assert.deepEqual([s.op, s.breite, s.hoehe, s.laenge, s.crc], ['start', 800, 480, BILD_BYTES, crc32(bild)]);
  const n = nutzlastFuer(517);
  assert.equal(n, 507);
  const zurueck = new Uint8Array(BILD_BYTES);
  const rahmen = rahmenDaten(bild, n);
  assert.equal(rahmen.length, Math.ceil(BILD_BYTES / n));
  for (const r of rahmen) {
    assert.ok(r.length <= 512);
    const d = lies(r);
    zurueck.set(d.daten, d.offset);
  }
  assert.equal(crc32(zurueck), crc32(bild));
  assert.deepEqual(lies(rahmenEnde(true)), { op: 'ende', schnell: true });
});

test('Nutzlast bei kleiner MTU', () => {
  assert.equal(nutzlastFuer(23), 15);
  assert.equal(nutzlastFuer(247), 239);
});
