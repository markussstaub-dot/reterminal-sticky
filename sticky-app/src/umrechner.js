// Einheiten-Umrechner für die App-Seite (SPEC „Widgets ohne ständiges Flashen“): reine Logik, ohne Abhängigkeiten.
// Paare in beide Richtungen; Auswahl passt zu Microlino, Werkstatt und den USA-Jahren.
import { format } from './rechner.js';

const lin = (f) => ({ hin: (x) => x * f, zurueck: (y) => y / f });

export const PAARE = [
  { name: 'Länge', a: 'km', b: 'mi', ...lin(0.621371) },
  { name: 'Länge', a: 'm', b: 'ft', ...lin(3.28084) },
  { name: 'Länge', a: 'cm', b: 'in', ...lin(0.393701) },
  { name: 'Tempo', a: 'km/h', b: 'mph', ...lin(0.621371) },
  { name: 'Temperatur', a: '°C', b: '°F', hin: (c) => c * 9 / 5 + 32, zurueck: (f) => (f - 32) * 5 / 9 },
  { name: 'Gewicht', a: 'kg', b: 'lb', ...lin(2.20462) },
  { name: 'Volumen', a: 'l', b: 'gal', ...lin(0.264172) },
  { name: 'Druck', a: 'bar', b: 'psi', ...lin(14.5038) },
];

export class Umrechner {
  constructor() { this.paar = 0; this.umgedreht = false; this.eingabe = '0'; this.neu = false; }

  get von() { const p = PAARE[this.paar]; return this.umgedreht ? p.b : p.a; }
  get nach() { const p = PAARE[this.paar]; return this.umgedreht ? p.a : p.b; }

  get ergebnis() {
    const x = parseFloat(this.eingabe.replace(',', '.'));
    if (!Number.isFinite(x)) return 'Fehler';
    const p = PAARE[this.paar];
    const y = this.umgedreht ? p.zurueck(x) : p.hin(x);
    return format(Math.round(y * 100) / 100);
  }

  waehle(i) { if (i >= 0 && i < PAARE.length) { this.paar = i; this.umgedreht = false; } }

  taste(t) {
    if (this.neu && (/^\d$/.test(t) || t === ',')) { this.eingabe = '0'; this.neu = false; }   // nach ⇄ neu beginnen
    if (t !== '⇄') this.neu = false;
    if (/^\d$/.test(t)) {
      if (this.eingabe === '0') this.eingabe = t;
      else if (this.eingabe.replace(/[-,]/g, '').length < 9) this.eingabe += t;
    } else if (t === ',') {
      if (!this.eingabe.includes(',')) this.eingabe += ',';
    } else if (t === '⌫') {
      this.eingabe = this.eingabe.length > 1 && this.eingabe !== '-0' ? this.eingabe.slice(0, -1).replace(/^-$/, '0') : '0';
    } else if (t === 'C') {
      this.eingabe = '0';
    } else if (t === '±') {
      if (this.eingabe !== '0') this.eingabe = this.eingabe.startsWith('-') ? this.eingabe.slice(1) : `-${this.eingabe}`;
    } else if (t === '⇄') {
      // Richtung tauschen, das Ergebnis wird zur neuen Eingabe
      const e = this.ergebnis;
      this.umgedreht = !this.umgedreht;
      if (e !== 'Fehler') this.eingabe = e;
      this.neu = true;
    }
  }
}
