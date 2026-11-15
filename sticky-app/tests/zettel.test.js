import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zettelListe, wlanQr, zettelUmzug, MAX_ZETTEL } from '../src/zettel.js';
import { fuerSticky } from '../src/uebersetzen.js';

test('Bestellzettel und QR-Karten gemischt, Reihenfolge wie im Text', () => {
  const l = zettelListe('## Bäcker\n2 Brötchen\n\n## Karte\nqr: ABC-123\nNr. 123\n\n## Café\n1 Cappuccino\n');
  assert.deepEqual(l.map((z) => z.titel), ['Bäcker', 'Karte', 'Café']);
  assert.equal(l[0].qr, '');
  assert.equal(l[1].qr, 'ABC-123');
  assert.deepEqual(l[1].zeilen, ['Nr. 123']);
});

test('WLAN-Kurzform', () => {
  const [z] = fuerSticky(() => zettelListe('## Gäste\nwlan: Hütte | ge;heim\n'), false);   // Deutsch, egal wie der Rechner steht
  assert.equal(z.qr, 'WIFI:T:WPA;S:Hütte;P:ge\\;heim;;');
  assert.deepEqual(z.zeilen, ['WLAN: Hütte', 'Passwort: ge;heim']);
  assert.equal(wlanQr('Offen', ''), 'WIFI:T:nopass;S:Offen;;');
});

test('Link-Kurzform', () => {
  const [z] = zettelListe('## Doku\nlink: https://example.org/x\n');
  assert.equal(z.qr, 'https://example.org/x');
  assert.deepEqual(z.zeilen, ['example.org/x']);
});

test('höchstens 6, leere Blöcke fallen weg', () => {
  const text = Array.from({ length: 9 }, (_, i) => `## Z${i}\nzeile`).join('\n') + '\n## Leer\n';
  assert.equal(zettelListe(text).length, MAX_ZETTEL);
});

test('Umzug aus den alten Feldern, Platzhalter fällt weg', () => {
  const platz = '## Lidl Plus\nqr: DUMMY\n';
  assert.equal(zettelUmzug('## A\n1\n', platz, platz), '## A\n1\n');
  assert.equal(zettelUmzug('## A\n1\n', '## K\nqr: X\n', platz), '## A\n1\n\n## K\nqr: X\n');
});
