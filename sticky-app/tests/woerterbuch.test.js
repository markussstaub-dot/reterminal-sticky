import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paareLesen, anwenden, zahlenPruefen, korrigiere, lernen, einpflegen, WOERTERBUCH_STANDARD } from '../src/woerterbuch.js';

test('Paare lesen: Pfeil, ASCII-Pfeil, Gleichheitszeichen, Unsinn wird übersprungen', () => {
  assert.deepEqual(paareLesen('Mikrolino → Microlino\nBabel -> Bubble\nfoo = bar\nkeine Regel\nx → X'),
    [{ falsch: 'Mikrolino', richtig: 'Microlino' }, { falsch: 'Babel', richtig: 'Bubble' }, { falsch: 'foo', richtig: 'bar' }]);
});

test('Ersetzen nur ganze Wörter, ohne Rücksicht auf Groß/klein, längere Folgen zuerst', () => {
  const p = paareLesen(WOERTERBUCH_STANDARD);
  assert.equal(anwenden('Der mikrolino steht. Micro Lino lädt.', p), 'Der Microlino steht. Microlino lädt.');
  assert.equal(anwenden('Mikrolinos', p), 'Mikrolinos');   // kein halbes Wort
  assert.equal(anwenden('ein Herzzuschlag-Knopf', p), 'ein Heizzuschlag-Knopf');
});

test('Prozente über 100 werden markiert, normale nicht', () => {
  assert.equal(zahlenPruefen('Bubble Log hat 770% geschätzt, Micro 76 %'), 'Bubble Log hat 770 %(?) geschätzt, Micro 76 %');
  assert.equal(zahlenPruefen('120 Prozent'), '120 Prozent(?)');
  assert.equal(korrigiere('Mikrolino bei 770 %', paareLesen(WOERTERBUCH_STANDARD)), 'Microlino bei 770 %(?)');
});

test('Lernen: geschützte Wörter und Zahlen werden nicht gelernt', () => {
  assert.deepEqual(lernen('Der Sticky Akku hat 770 %', 'Der Micro Akku hat 77 %', ['Microlino', 'Sticky']), []);
  assert.deepEqual(lernen('Mikrolino lädt', 'Microlino lädt', ['Microlino', 'Sticky']), [{ falsch: 'Mikrolino', richtig: 'Microlino' }]);
  assert.deepEqual(lernen('2% Sticky, Mikrohogen, 2%', '2% Micro hat 2%', ['Sticky']), []);
});

test('Lernen: ersetzte Wörter werden Paare, Ergänzungen nicht', () => {
  assert.deepEqual(lernen('Der Sticky Akku zeigt 84 %', 'Der Micro Akku zeigt 84 %'), [{ falsch: 'Sticky', richtig: 'Micro' }]);
  assert.deepEqual(lernen('Mikrohogen 2 % verloren', 'Micro hat 2 % verloren'), [{ falsch: 'Mikrohogen', richtig: 'Micro hat' }]);
  assert.deepEqual(lernen('Milch kaufen', 'Milch und Brot kaufen'), []);
  assert.deepEqual(lernen('gleich', 'gleich'), []);
});

test('Einpflegen überschreibt gleiches „falsch“', () => {
  const p = einpflegen([{ falsch: 'a', richtig: 'b' }, { falsch: 'c', richtig: 'd' }], [{ falsch: 'A', richtig: 'e' }]);
  assert.deepEqual(p, [{ falsch: 'c', richtig: 'd' }, { falsch: 'A', richtig: 'e' }]);
});
