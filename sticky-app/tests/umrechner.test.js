import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Umrechner, PAARE } from '../src/umrechner.js';

const mit = (paar, folge) => { const u = new Umrechner(); u.waehle(paar); for (const t of folge) u.taste(t); return u; };
const idx = (a) => PAARE.findIndex((p) => p.a === a);

test('Grundumrechnungen', () => {
  assert.equal(mit(idx('km'), ['1', '0', '0']).ergebnis, '62,14');
  assert.equal(mit(idx('°C'), ['2', '0']).ergebnis, '68');
  assert.equal(mit(idx('°C'), ['-', '4', '0', '±'].filter((t) => t !== '-')).ergebnis, '-40');
  assert.equal(mit(idx('bar'), ['2', ',', '2']).ergebnis, '31,91');
  assert.equal(mit(idx('kg'), ['8', '0']).ergebnis, '176,37');
});

test('Richtung tauschen übernimmt das Ergebnis', () => {
  const u = mit(idx('km'), ['1', '0']);
  u.taste('⇄');
  assert.equal(u.von, 'mi');
  assert.equal(u.eingabe, '6,21');
  assert.equal(u.ergebnis, '9,99');
  assert.equal(mit(idx('°C'), ['⇄', '9', '8', ',', '6']).ergebnis, '37');
});

test('Eingabe: Löschen, Komma nur einmal, Länge begrenzt', () => {
  assert.equal(mit(0, ['1', '2', '⌫']).eingabe, '1');
  assert.equal(mit(0, ['1', ',', ',', '5']).eingabe, '1,5');
  assert.equal(mit(0, ['5', 'C']).eingabe, '0');
  assert.equal(mit(0, Array(15).fill('9')).eingabe.length, 9);
});
