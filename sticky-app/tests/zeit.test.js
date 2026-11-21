import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datumFenster, datumKopf, wetterDatei, tagZahl } from '../src/zeit.js';

test('Datumsfenster: vom Monatsersten bis Ende des übernächsten Monats, lückenlos', () => {
  const tage = datumFenster(new Date(2026, 10, 21, 10, 30));   // 21.11.2026
  assert.equal(tagZahl(tage[0]), '20261101');
  assert.equal(tagZahl(tage.at(-1)), '20270131');
  assert.equal(tage.length, 30 + 31 + 31);
  assert.equal(tagZahl(tage[20]), '20261121');   // Streifen 20 = heute, so rechnet auch die Firmware
});

test('Datumsfenster reicht am Monatsletzten noch mindestens 59 Tage', () => {
  for (const heute of [new Date(2027, 0, 31), new Date(2026, 11, 31), new Date(2028, 1, 29), new Date(2027, 2, 28, 3)]) {
    const tage = datumFenster(heute);
    const i = tage.findIndex((d) => tagZahl(d) === tagZahl(heute));
    assert.ok(i >= 0);
    assert.ok(tage.length - 1 - i >= 59, `${tagZahl(heute)}: ${tage.length - 1 - i}`);
    assert.equal(new Set(tage.map(tagZahl)).size, tage.length);   // Sommerzeit: kein Tag doppelt oder ausgelassen
  }
});

test('Kopf von datum.bin', () => {
  const k = datumKopf(new Date(2026, 10, 1, 12), 92, 2400);
  assert.deepEqual([...k], [0x44, 0x41, 0x54, 0x31, 0xea, 0x07, 11, 1, 92, 0, 0x60, 0x09, 0, 0, 0, 0]);
});

test('wetter.txt nennt den Tag der Vorhersage, ohne Wetter 0', () => {
  const text = (w) => new TextDecoder().decode(wetterDatei(w));
  assert.equal(text({ zeit: new Date(2026, 10, 20, 11, 5).getTime() }), 'tag 20261120\n');
  assert.equal(text(null), 'tag 0\n');
});
