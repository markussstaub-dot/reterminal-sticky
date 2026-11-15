import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, fuerSticky, istEn, lang, zahlText, stickyEnSetzen } from '../src/uebersetzen.js';
import { HILFE } from '../src/hilfe.js';
import { wetterZeile } from '../src/wetter.js';
import { zettelListe } from '../src/zettel.js';
import { LAGE_NAMEN } from '../src/lage.js';
import { SORTEN } from '../src/sorte.js';
import { Burgduell } from '../src/burgduell.js';

// en = true/false legt die Sprache fest, unabhängig von der Sprache des Rechners, auf dem die Tests laufen
const en = (fn) => fuerSticky(fn, true);
const de = (fn) => fuerSticky(fn, false);

test('T in fuerSticky nimmt die Sprache des Sticky, danach wieder die der App', () => {
  const app = istEn();
  assert.equal(en(() => T('Hallo', 'Hello')), 'Hello');
  assert.equal(de(() => T('Hallo', 'Hello')), 'Hallo');
  assert.equal(en(() => lang()), 'en-GB');
  assert.equal(istEn(), app);
  // gemeldete Sprache des Sticky gilt in fuerSticky ohne festes Gerät
  stickyEnSetzen(true);
  assert.equal(fuerSticky(() => T('ja', 'yes')), 'yes');
  stickyEnSetzen(false);
  assert.equal(fuerSticky(() => T('ja', 'yes')), 'ja');
  stickyEnSetzen(null);
  // verschachtelt: das innere Gerät gilt, danach wieder das äußere
  assert.equal(en(() => de(() => T('a', 'b')) + T('a', 'b')), 'ab');
});

test('fuerSticky mit Promise gilt bis zu dessen Ende', async () => {
  const app = istEn();
  const r = await fuerSticky(async () => { await new Promise((ok) => setTimeout(ok, 5)); return T('spät', 'late'); }, true);
  assert.equal(r, 'late');
  assert.equal(istEn(), app);
});

test('zahlText: Englisch mit Punkt und „Error“, Deutsch unverändert', () => {
  assert.equal(en(() => zahlText('88,8')), '88.8');
  assert.equal(en(() => zahlText('Fehler')), 'Error');
  assert.equal(de(() => zahlText('88,8')), '88,8');
});

test('Tastenhilfe: Getter bauen beim Zugriff in der wirksamen Sprache', () => {
  const titelDe = de(() => Object.entries(HILFE).map(([, s]) => s.titel));
  const titelEn = en(() => Object.entries(HILFE).map(([, s]) => s.titel));
  assert.equal(titelDe.length, titelEn.length);
  assert.ok(titelDe.includes('Hilfe · Home') && titelEn.includes('Help · Home'));
  assert.equal(en(() => HILFE['w-wecker'].titel), 'Help · Alarm');
  assert.equal(en(() => HILFE.home.fuss), '▲+▼ = Help');
  assert.ok(en(() => HILFE['w-lineal-us'].zeilen).some((z) => z.includes('inches')));
  assert.ok(de(() => HILFE['w-lineal-us'].zeilen).some((z) => z.includes('Zoll')));
  assert.ok(de(() => HILFE['w-einstellungen'].zeilen).includes('!Sprache'));
  // jede Seite hat in beiden Sprachen Zeilen, englisch ohne Umlaute aus dem Deutschen
  for (const [modus, s] of en(() => Object.entries(HILFE))) assert.ok(s.zeilen.length && !s.zeilen.some((z) => /[äöüß]/.test(z)), modus);
});

test('Wetter, Zettel, Namenslisten und Spiel folgen der Sprache', () => {
  const w = { code: 3, temp: 12, min: 4, max: 14, regen: 20 };
  assert.equal(de(() => wetterZeile(w)), 'bewölkt 12° · 4–14° · Regen 20 %');
  assert.equal(en(() => wetterZeile(w)), 'cloudy 12° · 4–14° · rain 20 %');
  assert.deepEqual(en(() => zettelListe('## Gäste\nwlan: Hütte | geheim\n')[0].zeilen), ['Wi-Fi: Hütte', 'Password: geheim']);
  assert.equal(en(() => LAGE_NAMEN.wecker), 'Alarm');
  assert.equal(de(() => LAGE_NAMEN.wecker), 'Wecker');
  assert.deepEqual(Object.keys(LAGE_NAMEN), ['menue', 'timer', 'wecker', 'weltzeit', 'waage', 'rechner', 'umrechner', 'app', 'kritzel', 'recorder']);
  assert.equal(en(() => SORTEN.eingang.name), 'Inbox');
  const b = new Burgduell(false);
  assert.match(de(() => b.text), /^West beginnt/);
  assert.match(en(() => b.text), /^West starts/);
  b.duell(['A', 'B']);
  assert.match(en(() => b.text), /^Duel on two Stickys: A vs B/);
});
