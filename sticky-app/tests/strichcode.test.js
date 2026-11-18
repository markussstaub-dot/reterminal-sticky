import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE128_TABELLE, ean13Module, code128Module, strichFormat, strichNummer, strichAusHelligkeit, istEan13 } from '../src/strichcode.js';

test('Code128-Tabelle: 107 Muster, je 11 Module (Stopp 13)', () => {
  assert.equal(CODE128_TABELLE.length, 107);
  CODE128_TABELLE.forEach((m, i) => assert.equal([...m].reduce((s, c) => s + Number(c), 0), i === 106 ? 13 : 11, `Wert ${i}`));
  assert.equal(new Set(CODE128_TABELLE).size, 107);
});

test('EAN-13: Module und Prüfziffer', () => {
  const m = ean13Module('4006381333931');   // bekanntes Beispiel (Stabilo)
  assert.equal(m.length, 95);
  assert.ok(m.startsWith('101') && m.endsWith('101'));
  assert.equal(ean13Module('400638133393'), m);   // Prüfziffer ergänzt
  assert.ok(istEan13('4006381333931'));
  assert.ok(!istEan13('4006381333932'));
  assert.equal(strichFormat('4006381333931'), 'EAN13');
  assert.equal(strichFormat('ABC-123'), 'CODE128');
  assert.equal(strichNummer({ format: 'EAN13', code: '4006381333931' }), '4 006381 333931');
});

test('Code128: bekanntes Muster „Wikipedia“', () => {
  // Start B (211214), … Stopp (2331112); Länge = 11 × (Zeichen + 3) + 2
  const m = code128Module('Wikipedia');
  assert.equal(m.length, 11 * (9 + 3) + 2);
  assert.ok(m.startsWith('11010010000'));   // Start B
  assert.ok(m.endsWith('1100011101011'));    // Stopp
});

/** Module als Foto-Ersatz: Ruhezone, Breite je Modul, etwas Unschärfe und Rauschen, ungleichmäßiges Licht */
function foto(module, { modul = 3, hoch = 60, rand = 30, kippen = false } = {}) {
  const w = module.length * modul + 2 * rand, h = hoch;
  let r = 12345;
  const zufall = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const hell = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = Math.floor((x - rand) / modul);
    const dunkel = i >= 0 && i < module.length && module[i] === '1';
    const licht = 0.7 + 0.3 * (x / w);   // Schatten links
    hell[y * w + x] = (dunkel ? 40 : 230) * licht + (zufall() - 0.5) * 30;
  }
  if (!kippen) return { hell, w, h };
  const k = new Uint8ClampedArray(w * h);   // um 90° gedreht
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) k[x * h + y] = hell[y * w + x];
  return { hell: k, w: h, h: w };
}

test('Lesen: EAN-13, Code128 B und C, auch verkehrt herum und hochkant', () => {
  for (const [code, format] of [['4006381333931', 'EAN13'], ['0012345678905', 'EAN13'], ['Wikipedia', 'CODE128'], ['PB-1234 x', 'CODE128'], ['123456789012', 'CODE128']]) {
    const module = format === 'EAN13' ? ean13Module(code) : code128Module(code);
    const f = foto(module);
    assert.deepEqual(strichAusHelligkeit(f.hell, f.w, f.h), { format, code }, code);
    const rueck = foto([...module].reverse().join(''), { modul: 2 });
    assert.deepEqual(strichAusHelligkeit(rueck.hell, rueck.w, rueck.h), { format, code }, `${code} verkehrt`);
    const hk = foto(module, { modul: 4, kippen: true });
    assert.deepEqual(strichAusHelligkeit(hk.hell, hk.w, hk.h), { format, code }, `${code} hochkant`);
  }
});

test('Lesen: leeres Bild → null', () => {
  const hell = new Uint8ClampedArray(200 * 50).fill(200);
  assert.equal(strichAusHelligkeit(hell, 200, 50), null);
});
