import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUCHSTABEN, ZIFFERN, GESTEN, erkenne, schreibe, alphabetDatei, nachziehen, N } from '../src/strichschrift.js';

// Zufall mit festem Samen, damit der Test reproduzierbar ist
let samen = 42;
const zufall = () => { samen = (samen * 1103515245 + 12345) % 2147483648; return samen / 2147483648; };
const um = (a) => (zufall() * 2 - 1) * a;

/** Vorlage als „gemalter“ Strich: 160–220 px groß, verzerrt, leicht gedreht, zittrig, dichte Punkte wie vom Touch */
function gemalt(vorlage) {
  const gr = 160 + zufall() * 60, sx = 1 + um(0.2), sy = 1 + um(0.2), w = um(0.15), sch = um(0.12);
  const dicht = nachziehen(vorlage, 60);
  return dicht.map(([x, y]) => {
    let px = (x - 0.5) * sx + sch * (y - 0.5), py = (y - 0.5) * sy;
    [px, py] = [px * Math.cos(w) - py * Math.sin(w), px * Math.sin(w) + py * Math.cos(w)];
    return [300 + px * gr + um(3), 240 + py * gr + um(3)];
  });
}

function trefferquote(vorlagen, feld, runden = 200) {
  const fehler = {};
  let gut = 0, alle = 0;
  for (const [z, v] of Object.entries(vorlagen)) {
    for (let i = 0; i < runden; i++) {
      const e = erkenne(gemalt(v), feld).zeichen;
      alle++;
      if (e === z) gut++;
      else fehler[`${z}→${e}`] = (fehler[`${z}→${e}`] ?? 0) + 1;
    }
  }
  return { quote: gut / alle, fehler };
}

test('Buchstaben trotz Wackeln sicher erkannt (≥ 97 %)', () => {
  const { quote, fehler } = trefferquote({ ...BUCHSTABEN, ...GESTEN }, 'links');
  if (quote < 0.97) console.log('Verwechslungen:', fehler);
  assert.ok(quote >= 0.97, `nur ${(quote * 100).toFixed(1)} %`);
});

test('Ziffern trotz Wackeln sicher erkannt (≥ 97 %)', () => {
  const { quote, fehler } = trefferquote({ ...ZIFFERN, ...GESTEN }, 'rechts');
  if (quote < 0.97) console.log('Verwechslungen:', fehler);
  assert.ok(quote >= 0.97, `nur ${(quote * 100).toFixed(1)} %`);
});

test('Gekritzel wird abgelehnt statt geraten', () => {
  const krakel = Array.from({ length: 40 }, (_, i) => [300 + Math.sin(i * 1.7) * 90 + i * 2, 240 + Math.cos(i * 2.3) * 90]);
  assert.equal(erkenne(krakel, 'links').zeichen, null);
});

test('Schreiben: Löschen, Leerzeichen, Tipp = Umlaut bzw. Punkt', () => {
  let t = '';
  for (const z of ['M', 'A', 'tipp', 'H', ' ', 'X', '⌫', '1', 'tipp']) t = schreibe(t, z);
  assert.equal(t, 'MÄH 1.');
});

test('Alphabet-Datei für die Karte', () => {
  const zeilen = new TextDecoder().decode(alphabetDatei()).trim().split('\n');
  assert.equal(zeilen[0], `n ${N}`);
  assert.ok(zeilen.some((z) => z.startsWith('links A ')));
  assert.ok(zeilen.some((z) => z.startsWith('rechts 7 ')));
  assert.equal(zeilen.find((z) => z.startsWith('links A ')).split(' ').length, 2 + N);
});
