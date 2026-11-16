import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adresseNormal, kurzAntwort, anHauslurch, hauslurchStatus, stimmeZiel, weitereSaetze, istUnterwegs, zenbookHoeren } from '../src/hauslurch.js';

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

test('Stimme: automatisch zu Hause Zenbook, unterwegs Fold', () => {
  const orte = [{ name: 'Zuhause' }, { name: 'Supermarkt' }];
  assert.equal(stimmeZiel('auto', { orte, aktuellerOrt: 'Zuhause' }), 'zenbook');
  assert.equal(stimmeZiel('auto', { orte, aktuellerOrt: 'Supermarkt' }), 'fold');
  assert.equal(stimmeZiel('auto', { orte, aktuellerOrt: null }), 'fold');
  assert.equal(stimmeZiel('auto', { orte: [{ name: 'Supermarkt' }], aktuellerOrt: null }), 'zenbook');
  assert.equal(stimmeZiel('beide', { orte }), 'beide');
});

test('Wunsch „Stimme aufs Fold“ geht mit, Ton kommt zurück', async () => {
  let daten;
  const post = async (url, kopf, d) => { daten = d; return { status: 200, data: { antwort: 'Es ist 15 Uhr.', ton: 'UklGRg==' } }; };
  const r = await anHauslurch('Uhrzeit', { adresse: 'zenbook', schluessel: 'k', stimme: 'fold' }, post);
  assert.deepEqual(daten, { text: 'Uhrzeit', stimme: 'fold' });
  assert.equal(r.ton, 'UklGRg==');
  await anHauslurch('Uhrzeit', { adresse: 'zenbook', schluessel: 'k' }, post);
  assert.deepEqual(daten, { text: 'Uhrzeit' });
});

test('Folgesätze nacheinander abholen', async () => {
  const fach = [{ satz: 'Zwei.', ton: 'B', weiter: 'x' }, { satz: 'Drei.', weiter: 'x' }, { fertig: true }];
  const get = async (url) => { assert.match(url, /\/weiter\?id=x$/); return { status: 200, data: fach.shift() }; };
  const saetze = [];
  await weitereSaetze('x', { adresse: 'zenbook', schluessel: 'k' }, get, (s) => saetze.push(s));
  assert.deepEqual(saetze, [{ satz: 'Zwei.', ton: 'B' }, { satz: 'Drei.' }]);
});

test('unterwegs nur, wenn „Zuhause“ bekannt ist', () => {
  assert.equal(istUnterwegs({ orte: [{ name: 'Zuhause' }], aktuellerOrt: null }), true);
  assert.equal(istUnterwegs({ orte: [{ name: 'Zuhause' }], aktuellerOrt: 'Zuhause' }), false);
  assert.equal(istUnterwegs({ orte: [], aktuellerOrt: null }), false);
});

test('Vergleich: Ton ans Zenbook, Text zurück', async () => {
  let gesendet;
  const post = async (url, kopf, d) => { gesendet = { url, d }; return { status: 200, data: { text: 'Stell einen Timer', ms: 2400, modell: 'small' } }; };
  const r = await zenbookHoeren('AAAA', { fold: 'Stell einen Time', foldMs: 900 }, { adresse: 'zenbook', schluessel: 'k' }, post);
  assert.equal(gesendet.url, 'http://zenbook:8765/hoeren');
  assert.deepEqual(gesendet.d, { pcm: 'AAAA', fold: 'Stell einen Time', fold_ms: 900, hinweis: '' });
  assert.deepEqual(r, { text: 'Stell einen Timer', ms: 2400, modell: 'small' });
  await assert.rejects(zenbookHoeren('A', {}, { adresse: '', schluessel: '' }, post), /nicht eingerichtet/);
});
