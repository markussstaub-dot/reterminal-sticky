import { test } from 'node:test';
import assert from 'node:assert/strict';
import qrcode from 'qrcode-generator';
import { deuteQr, qrAusPixeln } from '../src/qrlesen.js';

test('eigene Codes: Art und Werte', () => {
  assert.deepEqual(deuteQr('sticky:hauslurch?adresse=zenbook&schluessel=a%2Bb_c-1'), { art: 'hauslurch', adresse: 'zenbook', schluessel: 'a+b_c-1' });
  assert.deepEqual(deuteQr('https://example.org'), { art: 'text', text: 'https://example.org' });
  assert.equal(deuteQr('STICKY:Orte').art, 'orte');
});

/** QR als RGBA-Bild malen (optional hell auf dunkel wie in der Konsole) */
function male(text, { invers = false, zelle = 6, rand = 4 } = {}) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), seite = (n + 2 * rand) * zelle;
  const px = new Uint8ClampedArray(seite * seite * 4);
  for (let y = 0; y < seite; y++) for (let x = 0; x < seite; x++) {
    const r = Math.floor(y / zelle) - rand, c = Math.floor(x / zelle) - rand;
    const dunkel = r >= 0 && c >= 0 && r < n && c < n && q.isDark(r, c);
    const v = (dunkel !== invers) ? 0 : 255;
    px.set([v, v, v, 255], (y * seite + x) * 4);
  }
  return { px, seite };
}

test('liest QR, auch hell auf dunkel', () => {
  const inhalt = 'sticky:hauslurch?adresse=zenbook&schluessel=Xy_9-abc';
  for (const invers of [false, true]) {
    const { px, seite } = male(inhalt, { invers });
    assert.equal(qrAusPixeln(px, seite, seite), inhalt);
  }
});
