import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zustandAus, wortliste, umschalten, blockSchieben, gliedSchieben } from '../src/karussellListe.js';

const E = ['home', 'widget timer', 'widget waage', 'widget lineal', 'notiz', 'bordbuch', 'app'];

test('Blöcke folgen dem Karussell, Ausgeschaltetes hinten im Block', () => {
  const z = zustandAus(E);
  assert.deepEqual(z.bloecke.slice(0, 4).map((b) => b.id), ['home', 'zeit', 'messen', 'schreiben']);
  assert.deepEqual(z.bloecke[1].glieder, ['timer', 'wecker', 'weltzeit']);
  assert.ok(!z.an.has('wecker'));
  assert.equal(wortliste(z), 'home, timer, waage, lineal, notiz, bordbuch, spiel');
});

test('Häkchen, Gruppe verschieben, Glied verschieben', () => {
  let z = zustandAus(E);
  z = umschalten(z, 'recorder');
  assert.equal(wortliste(z), 'home, timer, waage, lineal, notiz, recorder, bordbuch, spiel');
  z = blockSchieben(z, 'messen', -1);
  assert.equal(wortliste(z), 'home, waage, lineal, timer, notiz, recorder, bordbuch, spiel');
  z = gliedSchieben(z, 'lineal', -1);
  assert.equal(wortliste(z), 'home, lineal, waage, timer, notiz, recorder, bordbuch, spiel');
  assert.equal(wortliste(umschalten(z, 'home')), wortliste(z));          // Home bleibt an
  assert.equal(wortliste(blockSchieben(z, 'messen', -1)), wortliste(z)); // nicht über Home
});
