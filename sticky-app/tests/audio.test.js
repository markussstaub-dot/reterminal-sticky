import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kodiere, dekodiere, Aufnahme, wav, SAMPLES_JE_PAKET } from '../src/audio.js';

const ton = (n, start = 0) => Int16Array.from({ length: n }, (_, i) => Math.round(8000 * Math.sin(2 * Math.PI * 440 * (start + i) / 16000)));

test('ADPCM hin und zurück bleibt nah am Original', () => {
  const pcm = ton(SAMPLES_JE_PAKET);
  const { seq, pcm: zurueck } = dekodiere(kodiere(pcm, 7));
  assert.equal(seq, 7);
  let fehler = 0;
  for (let i = 50; i < pcm.length; i++) fehler = Math.max(fehler, Math.abs(pcm[i] - zurueck[i]));
  assert.ok(fehler < 800, `max. Abweichung ${fehler}`);
});

test('Paket trägt den Zustand: Fortsetzung dekodiert ohne Vorgänger', () => {
  const z = { pred: 0, index: 0 };
  kodiere(ton(SAMPLES_JE_PAKET), 0, z);
  const zweites = kodiere(ton(SAMPLES_JE_PAKET, SAMPLES_JE_PAKET), 1, z);
  const { pcm } = dekodiere(zweites);
  const soll = ton(SAMPLES_JE_PAKET, SAMPLES_JE_PAKET);
  assert.ok(Math.abs(pcm[0] - soll[0]) < 800);
});

test('Aufnahme füllt Lücken mit Stille und zählt sie', () => {
  const a = new Aufnahme();
  const z = { pred: 0, index: 0 };
  for (let s = 0; s < 5; s++) {
    const p = kodiere(ton(SAMPLES_JE_PAKET, s * SAMPLES_JE_PAKET), s, z);
    if (s !== 2) a.paket(p, s * 30);
  }
  const e = a.ergebnis();
  assert.equal(e.pakete, 4);
  assert.equal(e.fehlend, 1);
  assert.equal(e.pcm.length, 5 * SAMPLES_JE_PAKET);
  assert.equal(e.dauerMs, 150);
  assert.ok(e.pcm.subarray(2 * SAMPLES_JE_PAKET, 3 * SAMPLES_JE_PAKET).every((v) => v === 0));
});

test('WAV-Kopf stimmt', () => {
  const w = wav(new Int16Array(16000));
  const t = new TextDecoder().decode(w.subarray(0, 4));
  assert.equal(t, 'RIFF');
  assert.equal(w.length, 44 + 32000);
  assert.equal(new DataView(w.buffer).getUint32(24, true), 16000);
});

test('Wächter: kurz, leise, Rauschen, Sprache', async () => {
  const { sprachPruefung, nurWortliste } = await import('../src/audio.js');
  const rauschen = (n, a) => Int16Array.from({ length: n }, () => Math.round((Math.random() * 2 - 1) * a));
  assert.equal(sprachPruefung(rauschen(14400, 3000)).grund, 'zu kurz');                 // 0,9 s
  assert.equal(sprachPruefung(rauschen(32000, 200)).grund, 'zu leise');                 // 2 s fast still
  assert.equal(sprachPruefung(rauschen(32000, 3000)).grund, 'keine klare Sprache');     // gleichmäßiges Rauschen
  const sprache = rauschen(32000, 1500);                                                 // Grundrauschen …
  for (let i = 8000; i < 24000; i++) sprache[i] = Math.round(12000 * Math.sin(i / 7)); // … plus lauter Abschnitt
  assert.equal(sprachPruefung(sprache).ok, true);
  assert.equal(nurWortliste('Kreisel. Kreisel.', 'Microlino, Kreisel, Ampel'), true);
  assert.equal(nurWortliste('Tanke am Kreisel hat zu', 'Microlino, Kreisel, Tanke'), false);
});

import { dekodiereDatei, stuecke, mitMerkern, zeitmarke } from '../src/audio.js';

test('Aufnahme zählt über den seq-Überlauf (Recorder > 33 min)', () => {
  const a = new Aufnahme();
  const leer = new Int16Array(SAMPLES_JE_PAKET);
  for (const s of [65534, 65535, 0, 1]) a.paket(kodiere(leer, s));
  const e = a.ergebnis();
  assert.equal(e.pakete, 4);
  assert.equal(e.pcm.length, (65536 + 2) * SAMPLES_JE_PAKET);   // Lücke vorn = Stille, aber nichts überschrieben
});

test('dekodiereDatei liest Pakete der Reihe nach, unabhängig von seq', () => {
  const z = { pred: 0, index: 0 };
  const p1 = kodiere(ton(SAMPLES_JE_PAKET), 65535, z), p2 = kodiere(ton(SAMPLES_JE_PAKET, SAMPLES_JE_PAKET), 0, z);
  const datei = new Uint8Array(p1.length * 2 + 7);   // angehängter Rest wird ignoriert
  datei.set(p1, 0); datei.set(p2, p1.length);
  assert.equal(dekodiereDatei(datei).length, 2 * SAMPLES_JE_PAKET);
});

test('stuecke schneidet an der leisesten Stelle, höchstens 29 s je Stück', () => {
  const rate = 16000, pcm = new Int16Array(70 * rate).fill(3000);
  pcm.fill(0, 24 * rate, 24 * rate + 960);                        // Pause bei 24 s
  const s = stuecke(pcm);
  assert.ok(s.length >= 3);
  assert.ok(Math.abs(s[0][1] - 24 * rate) < 960, `Schnitt bei ${s[0][1] / rate} s`);
  for (const [a, b] of s) assert.ok(b - a <= 29 * rate);
  assert.equal(s.at(-1)[1], pcm.length);
  assert.deepEqual(stuecke(new Int16Array(10 * rate)), [[0, 10 * rate]]);
});

test('Merker landen vor dem Stück, in dem sie liegen', () => {
  const teile = [{ von: 0, bis: 16000 * 20, text: 'erstes' }, { von: 16000 * 20, bis: 16000 * 40, text: 'zweites' }];
  assert.equal(mitMerkern(teile, [25000, 5000, 99000]), '⚑ 00:05 erstes ⚑ 00:25 zweites ⚑ 01:39');
  assert.equal(zeitmarke(3723000), '1:02:03');
});
