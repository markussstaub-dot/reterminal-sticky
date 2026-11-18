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

// ---- Karten (18.11.2026) ----
import { zettelKarten, zettelText, zettelArt, punkte, strichLesen, haekchenUebernehmen, kurzinfo, titelVorschlag, qrZeilen, eindeutig } from '../src/zettel.js';

const ALT = '## Bäcker\n2 Brötchen\n\n## Karte\nqr: ABC-123\nNr. 123\n\n## Café\n1 Cappuccino\n';

test('alter Text bleibt beim Hin und Zurück erhalten', () => {
  assert.equal(zettelText(zettelKarten(ALT)), ALT);
  const d = zettelKarten(ALT);
  assert.deepEqual(d.karten.map((k) => k.art), ['text', 'qr', 'text']);
  assert.ok(d.karten.every((k) => k.aufSticky));
});

test('Arten erkennen', () => {
  assert.equal(zettelArt(['strich: 4006381333931']), 'strich');
  assert.equal(zettelArt(['wlan: X | y']), 'wlan');
  assert.equal(zettelArt(['link: https://a.b']), 'link');
  assert.equal(zettelArt(['[ ] Milch', 'Brot']), 'liste');
  assert.equal(zettelArt(['1 Kaffee']), 'text');
});

test('sticky: aus – bleibt in der App, die nächsten rücken nach', () => {
  const t = '## A\n1\n\n## B\nsticky: aus\n2\n\n## C\n3\n';
  const d = zettelKarten(t);
  assert.equal(d.karten[1].aufSticky, false);
  assert.deepEqual(d.karten[1].zeilen, ['2']);
  assert.equal(zettelText(d), t);
  assert.deepEqual(zettelListe(t).map((z) => z.titel), ['A', 'C']);
  // 9 Zettel, zwei aus: die ersten 6 eingeschalteten
  const viele = Array.from({ length: 9 }, (_, i) => `## Z${i}\n${i === 1 || i === 2 ? 'sticky: aus\n' : ''}x`).join('\n');
  assert.deepEqual(zettelListe(viele).map((z) => z.titel), ['Z0', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7']);
});

test('Strichcode und Liste für den Sticky', () => {
  const [s, l] = zettelListe('## Payback\nstrich: 4006381333931\nKarte 7\n\n## Einkauf\n[ ] Milch\n[x] Brot\nEier\n');
  assert.deepEqual(s.strich, { format: 'EAN13', code: '4006381333931' });
  assert.deepEqual(s.zeilen, ['Karte 7']);
  assert.equal(s.qr, '');
  assert.equal(l.art, 'liste');
  assert.deepEqual(l.punkte.map((p) => [p.text, p.ab]), [['Milch', false], ['Brot', true], ['Eier', false]]);
  assert.deepEqual(strichLesen('CODE128 4006381333931'), { format: 'CODE128', code: '4006381333931' });
  assert.deepEqual(strichLesen('EAN-13 4006 3813 3393 1'), { format: 'EAN13', code: '4006381333931' });
});

test('Häkchen vom Sticky übernehmen', () => {
  const t = '## Einkauf\n[ ] Milch\n[x] Brot\nEier\n\n## Bäcker\n2 Brötchen\n';
  assert.equal(haekchenUebernehmen(t, 'Einkauf\n101\n'), '## Einkauf\n[x] Milch\n[ ] Brot\n[x] Eier\n\n## Bäcker\n2 Brötchen\n');
  assert.equal(haekchenUebernehmen(t, 'Einkauf\n10\n'), t);      // Anzahl passt nicht mehr: nichts tun
  assert.equal(haekchenUebernehmen(t, 'Weg\n101\n'), t);         // Zettel gibt es nicht mehr
  assert.equal(haekchenUebernehmen(t, 'Einkauf\n010\n'), t);     // schon so
});

test('Kurzinfo, Titel-Vorschlag, QR-Inhalt, eindeutige Namen', () => {
  fuerSticky(() => {
    const [l, q] = zettelKarten('## E\n[ ] a\n[x] b\n\n## Q\nqr: 0123456789012345678\n').karten;
    assert.equal(kurzinfo(l), 'Liste · 2 Punkte, 1 abgehakt');
    assert.equal(kurzinfo(q), 'QR · 0123456789012…');
    assert.equal(titelVorschlag('https://www.lidl.de/plus', 'qr'), 'Lidl');
    assert.equal(titelVorschlag('WIFI:T:WPA;S:Hütte;P:x;;', 'qr'), 'Hütte');
    assert.equal(titelVorschlag('123', 'strich'), 'Strichcode');
  }, false);
  assert.deepEqual(qrZeilen('WIFI:T:WPA;S:Hütte;P:ge\\;heim;;'), ['wlan: Hütte | ge;heim']);
  assert.deepEqual(qrZeilen('https://example.org/x'), ['link: https://example.org/x']);
  assert.deepEqual(qrZeilen('KD-4711'), ['qr: KD-4711']);
  assert.equal(eindeutig('Einkauf', ['einkauf', 'Einkauf 2']), 'Einkauf 3');
  assert.equal(eindeutig('Neu', ['A']), 'Neu');
  assert.deepEqual(punkte(['[ ] a', '', 'b']).map((p) => p.zeile), [0, 2]);
});

test('Feld-Datei fürs Abhaken am Sticky', async () => {
  const { zettelFelder } = await import('../src/zettelBild.js');
  const f = { ab: true, x0: 16, y0: 66, x1: 800, y1: 150, box: [29, 92, 63, 126], strich: [75, 106, 200, 110] };
  assert.equal(zettelFelder([{ platz: 3, titel: 'Einkauf groß', felder: [f, { ...f, ab: false }] }]),
    'z 3 2 Einkauf groß\nh 3 0 1 16 66 800 150 29 92 63 126 75 106 200 110\nh 3 1 0 16 66 800 150 29 92 63 126 75 106 200 110\n');
  assert.equal(zettelFelder([]), '\n');
});
