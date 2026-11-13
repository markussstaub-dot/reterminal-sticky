import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rechner, format } from '../src/rechner.js';

const tippe = (r, folge) => { for (const t of folge) r.taste(t); return r.anzeige; };

test('Grundrechenarten mit Komma', () => {
  assert.equal(tippe(new Rechner(), ['1', '2', '+', '3', '=']), '15');
  assert.equal(tippe(new Rechner(), ['7', '÷', '2', '=']), '3,5');
  assert.equal(tippe(new Rechner(), ['0', ',', '1', '+', '0', ',', '2', '=']), '0,3');
  assert.equal(tippe(new Rechner(), ['6', '×', '7', '=']), '42');
});

test('Kette ohne „=“ rechnet laufend, Operator ersetzt Operator', () => {
  assert.equal(tippe(new Rechner(), ['2', '+', '3', '×', '4', '=']), '20');
  assert.equal(tippe(new Rechner(), ['9', '+', '−', '4', '=']), '5');
});

test('Sondertasten', () => {
  assert.equal(tippe(new Rechner(), ['5', '0', '%']), '0,5');
  assert.equal(tippe(new Rechner(), ['9', '√']), '3');
  assert.equal(tippe(new Rechner(), ['1', '2', '3', '⌫']), '12');
  assert.equal(tippe(new Rechner(), ['4', '±']), '-4');
  assert.equal(tippe(new Rechner(), ['1', '÷', '0', '=']), 'Fehler');
  assert.equal(tippe(new Rechner(), ['1', '÷', '0', '=', '5']), '5');
  assert.equal(tippe(new Rechner(), ['8', 'C']), '0');
});

test('Prozent wie beim Braun (Rückseite des BNE001)', () => {
  assert.equal(tippe(new Rechner(), ['8', '0', '×', '1', '1', '%']), '8,8');
  assert.equal(tippe(new Rechner(), ['8', '0', '+', '1', '1', '%']), '88,8');
  assert.equal(tippe(new Rechner(), ['8', '0', '−', '1', '1', '%']), '71,2');
});

test('Speicher wie beim Braun', () => {
  const r = new Rechner();
  assert.equal(tippe(r, ['8', '0', '×', '2', '0', 'M+']), '1600');
  assert.equal(r.mem, 1600);
  tippe(r, ['8', '0', '×', '5', 'M−']);
  assert.equal(r.mem, 1200);
  assert.equal(tippe(r, ['C', 'MR']), '1200');
  tippe(r, ['MC']);
  assert.equal(r.mem, 0);
});

test('Anzeige bleibt kurz', () => {
  assert.equal(format(1 / 3), '0,3333333333');
  assert.equal(format(1e15), '1,000000e+15');
});
