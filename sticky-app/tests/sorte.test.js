import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortiere, naechsteSorte } from '../src/sorte.js';

test('Stichwort am Anfang geht vor und wird abgeschnitten', () => {
  assert.deepEqual(sortiere('Einkauf: Milch und Schrauben M4'), { sorte: 'erledigung', grund: 'Stichwort', text: 'Milch und Schrauben M4' });
  assert.equal(sortiere('Idee, ein Heizzuschlag-Knopf in Bubble Log').sorte, 'idee');
  assert.equal(sortiere('Erinnere mich um 17 Uhr Mami anrufen').text, 'Um 17 Uhr Mami anrufen');
  assert.equal(sortiere('Fahrt: Ampel zu spät erkannt', { tempo: 0 }).sorte, 'fahrt');
});

test('ohne Stichwort: Inhalt und Lage', () => {
  assert.equal(sortiere('Morgen um 9 Uhr Termin beim Zahnarzt').sorte, 'erinnerung');
  assert.equal(sortiere('2. Test Brot kaufen').sorte, 'erledigung');
  assert.equal(sortiere('Das wäre cool als Widget').sorte, 'idee');
  assert.equal(sortiere('Jetzt läuft auch die Heizung im Micro mit.').sorte, 'fahrt');
  assert.equal(sortiere('Komisches Geräusch hinten links', { tempo: 12 }).sorte, 'fahrt');
  assert.equal(sortiere('Komisches Geräusch hinten links', { tempo: 0 }).sorte, 'eingang');
});

test('lange Diktate: Erzählung, während der Fahrt aber Fahrt', () => {
  assert.equal(sortiere('Damals in Tokio bei Mercedes', { dauerMs: 40000 }).sorte, 'erzaehlung');
  assert.equal(sortiere('So, ich bin wieder zu Hause, der Akku hat nur noch 76 %', { dauerMs: 29000 }).sorte, 'fahrt');
});

test('Sorte weiterschalten läuft rundum', () => {
  assert.equal(naechsteSorte('fahrt'), 'erledigung');
  assert.equal(naechsteSorte('eingang'), 'fahrt');
});
