import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adresseNormal, kurzAntwort, anHauslurch, hauslurchStatus } from '../src/hauslurch.js';

test('Adresse: Schema und Standardport ergänzen', () => {
  assert.equal(adresseNormal('192.168.2.61'), 'http://192.168.2.61:8765');
  assert.equal(adresseNormal(' 192.168.2.61:9000/ '), 'http://192.168.2.61:9000');
  assert.equal(adresseNormal('zenbook.tail1234.ts.net'), 'http://zenbook.tail1234.ts.net:8765');
  assert.equal(adresseNormal('https://zenbook.tail1234.ts.net'), 'https://zenbook.tail1234.ts.net');
  assert.equal(adresseNormal(''), '');
});

test('kurze Antwort für den Sticky', () => {
  assert.equal(kurzAntwort('Timer über eine Minute läuft.'), 'Timer über eine Minute läuft.');
  const k = kurzAntwort('Ich bin der Hauslurch, ein etwas mürrischer, aber immer hilfsbereiter Hausgeist.');
  assert.ok(k.length <= 44 && k.endsWith('…'), k);
});

test('Text hin, Antwort zurück; nur Text geht raus', async () => {
  let gesendet;
  const post = async (url, kopf, daten) => { gesendet = { url, kopf, daten }; return { status: 200, data: { antwort: 'Timer über eine Minute läuft.', grantelt: false, timer: [60] } }; };
  const r = await anHauslurch('stell einen Timer auf eine Minute', { adresse: '192.168.2.61', schluessel: 'geheim' }, post);
  assert.equal(r.antwort, 'Timer über eine Minute läuft.');
  assert.deepEqual(r.timer, [60]);
  assert.equal(gesendet.url, 'http://192.168.2.61:8765/befehl');
  assert.equal(gesendet.kopf['X-Hauslurch-Schluessel'], 'geheim');
  assert.deepEqual(Object.keys(gesendet.daten), ['text']);
});

test('verständliche Fehler', async () => {
  const mit = (status) => async () => ({ status, data: {} });
  await assert.rejects(anHauslurch('x', { adresse: 'a', schluessel: 'k' }, mit(401)), /falscher Schlüssel/);
  await assert.rejects(anHauslurch('x', { adresse: 'a', schluessel: 'k' }, mit(403)), /Heimnetz/);
  await assert.rejects(anHauslurch('x', { adresse: '', schluessel: 'k' }, mit(200)), /keine Adresse/);
  await assert.rejects(anHauslurch('x', { adresse: 'a', schluessel: '' }, mit(200)), /kein Schlüssel/);
  await assert.rejects(anHauslurch('x', { adresse: 'a', schluessel: 'k' }, async () => { throw new Error('Timeout'); }), /nicht erreichbar \(Timeout\)/);
  assert.deepEqual(await hauslurchStatus({ adresse: 'a', schluessel: 'k' }, async () => ({ status: 200, data: '{"ok":true}' })), { ok: true });
});
