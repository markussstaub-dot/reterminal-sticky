import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meldeRegeln, meldePakete, meldungErlaubt, meldungDazu, meldungWeg, MELDUNG_DAUER_MS, orteLesen, ortFinden, zielLesen,
  ortZeile, fahrtSchritt, homeZeilen } from '../src/kontext.js';

test('Positivliste: Pakete, „nur von“ und Kommentare', () => {
  const r = meldeRegeln('app.bubblelog.microlino\n# Kommentar\ncom.whatsapp: Anna, Ben\nkaputt paket\n');
  assert.deepEqual(meldePakete(r), ['app.bubblelog.microlino', 'com.whatsapp']);
  assert.ok(meldungErlaubt(r, 'app.bubblelog.microlino', 'Laden fertig'));
  assert.ok(meldungErlaubt(r, 'com.whatsapp', 'Anna'));
  assert.ok(!meldungErlaubt(r, 'com.whatsapp', 'Werbung GmbH'));
  assert.ok(!meldungErlaubt(r, 'com.example', 'Anna'));
});

test('Meldungen: höchstens drei, gleicher Schlüssel ersetzt, nach 12 h weg, wegwischen', () => {
  let l = [];
  for (let i = 0; i < 4; i++) l = meldungDazu(l, { key: `k${i}`, app: 'DHL', titel: `Paket ${i}`, t: 1000 + i }, 2000);
  assert.deepEqual(l.map((x) => x.key), ['k3', 'k2', 'k1']);
  l = meldungDazu(l, { key: 'k1', app: 'DHL', titel: 'neu', t: 1500 }, 2000);
  assert.deepEqual(l.map((x) => x.key), ['k1', 'k3', 'k2']);
  assert.equal(meldungWeg(l, 'k3').length, 2);
  assert.equal(meldungDazu(l, { key: 'x', app: 'A', titel: 'B', t: 1000 + MELDUNG_DAUER_MS + 5 }, 1000 + MELDUNG_DAUER_MS + 5).length, 2);
});

test('Orte lesen, Ziele, Hier-merken-Zeile', () => {
  const o = orteLesen('Supermarkt; 47.1, 8.2; Zettel 2\nDaheim; 47.2, 8.3; Home; 300 m\nfalsch ohne Koordinaten\n');
  assert.equal(o.length, 2);
  assert.deepEqual(o[0].ziel, { modus: 3, seite: 1 });
  assert.equal(o[1].umkreis, 300);
  assert.deepEqual(zielLesen('Notiz'), { modus: 2 });
  assert.deepEqual(zielLesen('Zettel'), { modus: 3, seite: 0 });
  assert.deepEqual(zielLesen('Quatsch'), { modus: 0 });
  assert.equal(ortZeile('Neu', { lat: 47.123456, lon: 8.5 }), 'Neu; 47.12346, 8.50000; Home');
  assert.equal(orteLesen(ortZeile('Neu', { lat: 47.1, lon: 8.5 }, 'Zettel 1'))[0].ziel.modus, 3);
});

test('Ort finden mit Hysterese und Genauigkeit', () => {
  const orte = orteLesen('A; 47.0, 8.0; Home');
  const bei = (m) => ({ lat: 47 + m / 111200, lon: 8, gen: 10 });
  assert.equal(ortFinden(orte, bei(100)), 'A');
  assert.equal(ortFinden(orte, bei(200)), null);
  assert.equal(ortFinden(orte, bei(200), 'A'), 'A');          // bleibt bis 225 m
  assert.equal(ortFinden(orte, bei(300), 'A'), null);
  assert.equal(ortFinden(orte, { ...bei(10), gen: 500 }, null), null);   // ungenau: nichts ändern
});

test('Fahrt-Ende: zweimal Stillstand nach einer Fahrt', () => {
  let z = null, r;
  r = fahrtSchritt(z, 0); assert.equal(r.ende, false); z = r.zustand;      // ohne Fahrt nie Ende
  r = fahrtSchritt(z, 0); assert.equal(r.ende, false); z = r.zustand;
  r = fahrtSchritt(z, 8); z = r.zustand;
  r = fahrtSchritt(z, 0.2); assert.equal(r.ende, false); z = r.zustand;
  r = fahrtSchritt(z, 5); z = r.zustand;                                    // Ampel: weiter
  r = fahrtSchritt(z, 0); assert.equal(r.ende, false); z = r.zustand;
  r = fahrtSchritt(z, null); assert.equal(r.ende, true); z = r.zustand;
  r = fahrtSchritt(z, 0); assert.equal(r.ende, false);
});

test('Home-Zeilen: Ort, Parkplatz, Meldungen', () => {
  const uhrzeit = (t) => `U${t}`;
  const z = homeZeilen({ ort: 'Daheim', parkplatz: { t: 5 }, meldungen: [{ key: 'a', app: 'DHL', titel: 'Paket', t: 7 }] }, { uhrzeit, jetzt: 10 });
  assert.deepEqual(z, ['Ort: Daheim', 'Geparkt um U5', 'U7  DHL · Paket']);
  assert.deepEqual(homeZeilen({ parkplatz: { t: 0 } }, { jetzt: 25 * 3600 * 1000 }), []);
});
