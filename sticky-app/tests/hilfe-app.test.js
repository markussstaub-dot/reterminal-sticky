import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appHilfe } from '../src/hilfe-app.js';
import { fuerSticky } from '../src/uebersetzen.js';

test('jeder Reiter und jede Mehr-Unterseite hat eine Hilfe, Deutsch und Englisch gleich lang', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tabs = [...html.matchAll(/class="tab" data-tab="([a-z]+)"/g)].map((m) => m[1]);
  const seiten = [...html.matchAll(/class="mehrseite" data-seite="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(tabs.length >= 5 && seiten.length >= 5);
  const de = fuerSticky(() => appHilfe(), false), en = fuerSticky(() => appHilfe(), true);
  for (const k of [...tabs, ...seiten]) {
    assert.ok(de[k], `Hilfe fehlt: ${k}`);
    assert.equal(de[k].zeilen.length, en[k].zeilen.length, `Zeilen DE/EN: ${k}`);
    assert.notEqual(de[k].titel, '');
    de[k].zeilen.forEach((z, i) => assert.equal(z.startsWith('!'), en[k].zeilen[i].startsWith('!'), `Fett DE/EN: ${k} ${i}`));
  }
});
