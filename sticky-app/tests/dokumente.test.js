import { test } from 'node:test';
import assert from 'node:assert/strict';
import { karten, kartenDerSzene, alleMarken, kartenAnhaengen, ordnerName, inhaltLesen, inhaltText, dokIndex, spickIndex, bibIndex,
  listenFenster, umbenennenPlan, karussellOhneBordbuch } from '../src/dokumente.js';

const TEXT = `Vorrede bleibt draußen
## Reifendruck #micro #notfall
!Reifendruck (Ladeklappe)
Stahlfelge 13": 1,8 bar

## Sicherungen #micro
FSH1 7,5 A Hupe
## Lab bedienen
Strom an`;

test('Karten mit Szenen-Marken, Text vor der ersten Karte zählt nicht', () => {
  const k = karten(TEXT);
  assert.deepEqual(k.map((x) => x.titel), ['Reifendruck', 'Sicherungen', 'Lab bedienen']);
  assert.deepEqual(k[0].marken, ['micro', 'notfall']);
  assert.deepEqual(k[0].zeilen, ['!Reifendruck (Ladeklappe)', 'Stahlfelge 13": 1,8 bar']);
  assert.deepEqual(k[2].marken, []);
});

test('Szene wählt aus, Karten ohne Marke sind überall', () => {
  const k = karten(TEXT);
  assert.deepEqual(kartenDerSzene(k, 'notfall').map((x) => x.titel), ['Reifendruck', 'Lab bedienen']);
  assert.equal(kartenDerSzene(k, '').length, 3);
  assert.deepEqual(alleMarken(k).slice(0, 5), ['micro', 'werkstatt', 'lab', 'notfall', 'unterwegs']);
});

test('Handgriffe werden Karten, gleiche Titel nicht doppelt', () => {
  const neu = kartenAnhaengen(TEXT, '## Sicherungen\nanders\n\n## Bose koppeln\nTaste halten\n');
  const k = karten(neu);
  assert.deepEqual(k.map((x) => x.titel), ['Reifendruck', 'Sicherungen', 'Lab bedienen', 'Bose koppeln']);
  assert.equal(kartenAnhaengen(TEXT, '## Lab bedienen\nx'), TEXT);
});

test('Ordnername: ASCII, kurz, eindeutig', () => {
  assert.equal(ordnerName('Microlino'), 'microlino');
  assert.equal(ordnerName('Bambu X1C – Düse'), 'bambu-x1c-duese');
  assert.equal(ordnerName('Microlino', ['microlino']), 'microlino-2');
  assert.equal(ordnerName('???'), 'dokument');
  assert.ok(ordnerName('Ein sehr langer Name für ein Handbuch').length <= 20);
});

test('Inhaltsverzeichnis als Text hin und zurück', () => {
  const l = inhaltLesen('Sicherheit | 4\nquatsch\nPflege und Wartung | 87\n');
  assert.deepEqual(l, [{ titel: 'Sicherheit', seite: 4 }, { titel: 'Pflege und Wartung', seite: 87 }]);
  assert.deepEqual(inhaltLesen(inhaltText(l)), l);
});

test('Index-Dateien für die Firmware', () => {
  const t = dokIndex({ seiten: 3, pdf: [0, 1, 1], felder: [{ x0: 16, y0: 96, x1: 784, y1: 144, ziel: 2 }], lz: { x0: 440, y0: 48, x1: 792, y1: 86 },
    reiter: [{ x0: 146, y0: 0, x1: 284, y1: 44, ziel: 13 }] });
  assert.equal(t, 'seiten=3\ntoc=0\npdf=0,1,1\nf 0 16 96 784 144 2\ng 0 146 0 284 44 13\nlz 440 48 792 86\n');
  assert.equal(spickIndex(2, [[{ x0: 8, y0: 52, x1: 308, y1: 120, ziel: 1 }], []], []), 'seiten=2\ntoc=-1\nf 0 8 52 308 120 1\n');
  assert.equal(bibIndex([{ x0: 1, y0: 2, x1: 3, y1: 4, name: 'microlino' }]), 'd 1 2 3 4 microlino\n');
});

test('Titel-Liste: Fenster um die gewählte Karte', () => {
  assert.deepEqual(listenFenster(4, 3), { start: 0, ende: 4 });
  assert.deepEqual(listenFenster(20, 0), { start: 0, ende: 6 });
  assert.deepEqual(listenFenster(20, 10), { start: 8, ende: 14 });
  assert.deepEqual(listenFenster(20, 19), { start: 14, ende: 20 });
});

test('Umbenennen: verschobene Seiten wandern, statt neu übertragen zu werden', () => {
  // altes Bordbuch: 00 Inhalt, 01–02 Spickzettel, 03–04 PDF · neu: 00 Inhalt (neu), 01–02 PDF
  const alt = { '00.bin': 'i0', '01.bin': 's1', '02.bin': 's2', '03.bin': 'p1', '04.bin': 'p2', 'index.txt': 'x', 'stand.txt': 'zz' };
  const neu = [{ n: '00.bin', crc: 'i9' }, { n: '01.bin', crc: 'p1' }, { n: '02.bin', crc: 'p2' }, { n: 'index.txt', crc: 'y' }];
  assert.deepEqual(umbenennenPlan(alt, neu), [['03.bin', '01.bin'], ['04.bin', '02.bin']]);
  // was schon richtig liegt, bleibt; gleiche Inhalte zweimal: nur eine Quelle je Ziel
  assert.deepEqual(umbenennenPlan({ 'a.bin': 'c', 'b.bin': 'c' }, [{ n: 'a.bin', crc: 'c' }, { n: 'x.bin', crc: 'c' }, { n: 'y.bin', crc: 'c' }]), [['b.bin', 'x.bin']]);
});

test('Karussell: Bordbuch wird einmalig Handbuch, Spickzettel', () => {
  assert.equal(karussellOhneBordbuch('Home, Timer, Bordbuch, Zettel'), 'Home, Timer, Handbuch, Spickzettel, Zettel');
  assert.equal(karussellOhneBordbuch('Home, Logbook, List', true), 'Home, Manual, Cheat sheets, List');
  assert.equal(karussellOhneBordbuch('Home, Zettel'), 'Home, Zettel');
  assert.equal(karussellOhneBordbuch('Home, Spickzettel, Bordbuch'), 'Home, Spickzettel, Handbuch');
});
