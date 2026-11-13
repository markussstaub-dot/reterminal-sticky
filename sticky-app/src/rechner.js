// Taschenrechner für die App-Seite am Sticky (SPEC „Widgets ohne ständiges Flashen“): reine Logik, ohne Abhängigkeiten.
// Bedienung wie ein einfacher Tischrechner: Zahl, Operator, Zahl, „=“; Operator direkt nach Operator ersetzt ihn.

export const TASTEN = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['C', '0', ',', '+'],
  ['±', '⌫', '%', '='],
];

const rechne = (a, op, b) => (op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : op === '÷' ? (b === 0 ? NaN : a / b) : b);

/** Zahl für die Anzeige: deutsch mit Komma, höchstens 12 Stellen, sonst wissenschaftlich */
export function format(z) {
  if (!Number.isFinite(z)) return 'Fehler';
  const r = Math.round(z * 1e10) / 1e10;
  let t = String(r);
  if (t.replace('-', '').replace('.', '').length > 12) t = r.toExponential(6);
  return t.replace('.', ',');
}

export class Rechner {
  constructor() { this.loeschen(); }

  loeschen() { this.anzeige = '0'; this.speicher = null; this.op = null; this.neu = true; this.zeile = ''; }

  get wert() { return parseFloat(this.anzeige.replace(',', '.')); }

  taste(t) {
    if (this.anzeige === 'Fehler' && t !== 'C') this.loeschen();
    if (/^\d$/.test(t)) {
      if (this.neu || this.anzeige === '0') { this.anzeige = t; this.neu = false; }
      else if (this.anzeige.replace(/[-,]/g, '').length < 12) this.anzeige += t;
    } else if (t === ',') {
      if (this.neu) { this.anzeige = '0,'; this.neu = false; }
      else if (!this.anzeige.includes(',')) this.anzeige += ',';
    } else if (t === 'C') {
      this.loeschen();
    } else if (t === '⌫') {
      if (!this.neu) this.anzeige = this.anzeige.length > 1 && this.anzeige !== '-0' ? this.anzeige.slice(0, -1).replace(/^-$/, '0') : '0';
    } else if (t === '±') {
      if (this.anzeige !== '0') this.anzeige = this.anzeige.startsWith('-') ? this.anzeige.slice(1) : `-${this.anzeige}`;
    } else if (t === '%') {
      this.anzeige = format(this.speicher != null && (this.op === '+' || this.op === '−') ? this.speicher * this.wert / 100 : this.wert / 100);
      this.neu = true;
    } else if (['+', '−', '×', '÷'].includes(t)) {
      if (this.op && !this.neu) { this.speicher = rechne(this.speicher, this.op, this.wert); this.anzeige = format(this.speicher); }
      else if (!this.op) this.speicher = this.wert;
      this.op = t;
      this.neu = true;
      this.zeile = `${format(this.speicher)} ${t}`;
    } else if (t === '=') {
      if (this.op) {
        const b = this.wert;
        this.zeile = `${format(this.speicher)} ${this.op} ${format(b)} =`;
        this.anzeige = format(rechne(this.speicher, this.op, b));
        this.speicher = null; this.op = null; this.neu = true;
      }
    }
    return this.anzeige;
  }
}
