import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trefferKnopf, zuHochkant } from '../src/fahrtseite.js';

// Display quer (USB oben rechts), Sticky im Uhrzeigersinn gedreht: Tasten oben rechts, USB unten
test('Display-Ecke oben links (quer) ist hochkant oben rechts', () => {
  assert.deepEqual(zuHochkant(0, 0), { x: 479, y: 0 });
  assert.deepEqual(zuHochkant(799, 0), { x: 479, y: 799 });   // USB-Ecke → hochkant unten rechts
});

test('Streifen werden von oben nach unten getroffen', () => {
  // Mitte von Streifen i hochkant: x = 240, y = 84 + i*120 + 54 → Display x = y_h, y = 479 − x_h
  for (let i = 0; i < 5; i++) assert.equal(trefferKnopf(84 + i * 120 + 54, 239), i);
  assert.equal(trefferKnopf(30, 239), -1);    // Kopfzeile
  assert.equal(trefferKnopf(750, 239), -1);   // Rückmeldefeld
});
