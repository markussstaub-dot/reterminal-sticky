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
