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
  assert.equal(tippe(new Rechner(), ['2', '0', '0', '+', '1', '0', '%']), '20');
  assert.equal(tippe(new Rechner(), ['1', '2', '3', '⌫']), '12');
  assert.equal(tippe(new Rechner(), ['4', '±']), '-4');
  assert.equal(tippe(new Rechner(), ['1', '÷', '0', '=']), 'Fehler');
  assert.equal(tippe(new Rechner(), ['1', '÷', '0', '=', '5']), '5');
  assert.equal(tippe(new Rechner(), ['8', 'C']), '0');
});

test('Anzeige bleibt kurz', () => {
  assert.equal(format(1 / 3), '0,3333333333');
  assert.equal(format(1e15), '1,000000e+15');
});
