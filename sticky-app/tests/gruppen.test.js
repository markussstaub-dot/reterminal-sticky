import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menueKacheln, kachelAktion, reiterFuer } from '../src/gruppen.js';

const STANDARD = ['home', 'widget timer', 'widget wecker', 'widget weltzeit', 'widget waage', 'widget lineal', 'notiz', 'widget recorder',
  'kritzel', 'schrift', 'widget rechner', 'widget umrechner', 'bordbuch', 'zettel', 'app', 'widget einstellungen'];

test('Standard-Karussell ergibt 8 Kacheln in Karussell-Reihenfolge', () => {
  const k = menueKacheln(STANDARD);
  assert.equal(k.length, 8);
  assert.deepEqual(k.map((x) => x.gruppe?.id ?? x.glieder[0].e),
    ['home', 'zeit', 'messen', 'schreiben', 'rechnen', 'nachschlagen', 'app', 'widget einstellungen']);
});

test('Gruppenkachel trägt eine Bitmaske der Karussell-Indizes', () => {
  const messen = menueKacheln(STANDARD).find((x) => x.gruppe?.id === 'messen');
  assert.equal(kachelAktion(messen), `gruppe ${(1 << 4) | (1 << 5)}`);
  const home = menueKacheln(STANDARD)[0];
  assert.equal(kachelAktion(home), 'gehe 0');
});

test('Gruppe mit nur einem vorhandenen Glied wird Einzelkachel', () => {
  const k = menueKacheln(['home', 'widget waage', 'notiz']);
  assert.deepEqual(k.map(kachelAktion), ['gehe 0', 'gehe 1', 'gehe 2']);
});

test('Gruppe erscheint dort, wo ihr erstes Glied im Karussell steht', () => {
  const k = menueKacheln(['home', 'widget lineal', 'notiz', 'widget waage']);
  assert.equal(k[1].gruppe.id, 'messen');
  assert.deepEqual(k[1].glieder.map((x) => x.i), [3, 1]);   // Reihenfolge der Gruppe, Indizes aus dem Karussell
  assert.equal(k.length, 3);
});

test('Reiter: Glieder mit Index, aktives Glied, Varianten -us/-h', () => {
  const r = reiterFuer('lineal-us', STANDARD);
  assert.deepEqual(r.glieder.map((x) => x.i), [4, 5]);
  assert.equal(r.aktiv, 1);
  assert.equal(reiterFuer('waage-h', STANDARD).aktiv, 0);
  assert.equal(reiterFuer('einstellungen', STANDARD), null);
  assert.equal(reiterFuer('waage', ['home', 'widget waage']), null);
});
