import { test } from 'node:test';
import assert from 'node:assert/strict';
import { karten, KARTEN_STANDARD } from '../src/karten.js';

test('Karten: Titel, QR-Inhalt, Zusatzzeilen; ohne qr wird übersprungen', () => {
  const k = karten('## Lidl Plus\nqr: ABC123\nKunden-Nr. 42\n\n## Leer\nnur Text\n\n## Payback\nQR: 999');
  assert.deepEqual(k.map((x) => [x.titel, x.qr, x.zeilen]), [['Lidl Plus', 'ABC123', ['Kunden-Nr. 42']], ['Payback', '999', []]]);
  assert.equal(karten(KARTEN_STANDARD)[0].titel, 'Lidl Plus');
});
