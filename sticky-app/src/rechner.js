// Taschenrechner für die App-Seite am Sticky (SPEC „Widgets ohne ständiges Flashen“): reine Logik, ohne Abhängigkeiten.
// Bedienung wie ein einfacher Tischrechner: Zahl, Operator, Zahl, „=“; Operator direkt nach Operator ersetzt ihn.
// Tastenbild und Logik nach dem Braun BNE001 (ET66, Lubs/Rams; 13.11.2026): 5er-Raster, Speicher, Wurzel,
// % schließt die Rechnung ab (80 × 11 % = 8,8 · 80 + 11 % = 88,8 · 80 − 11 % = 71,2), M+/M− buchen das Ergebnis.

export const TASTEN = [
  ['M+', 'M−', 'MR', 'MC', '±'],
  ['√', '7', '8', '9', '÷'],
  ['%', '4', '5', '6', '×'],
  ['⌫', '1', '2', '3', '−'],
  ['C', ',', '0', '=', '+'],   // 0 unten in der Mitte wie im gemeinsamen Ziffernfeld (SPEC „ein Ziffernfeld für alles“)
];
/** Rolle im Braun-Stil (braun.js): Ziffern wahl (schwarz), = haupt (gelb), Speicher und ± neben (grün), Rest werkzeug (braun) */
export const ROLLE = (t) => (/^[\d,]$/.test(t) ? 'wahl' : t === '=' || t === '⇄' || t === 'OK' ? 'haupt' : /^M/.test(t) || t === '±' ? 'neben' : 'werkzeug');

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

  loeschen() { this.anzeige = '0'; this.speicher = null; this.op = null; this.neu = true; this.zeile = ''; this.mem ??= 0; }

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
    } else if (t === '%') {   // wie Braun: Ergebnis sofort, Aufschlag und Rabatt in einem Schritt
      const a = this.speicher, b = this.wert;
      const r = !this.op ? b / 100 : this.op === '×' ? a * b / 100 : this.op === '+' ? a + a * b / 100 : this.op === '−' ? a - a * b / 100 : a / b * 100;
      if (this.op) this.zeile = `${format(a)} ${this.op} ${format(b)} %`;
      this.anzeige = format(r);
      this.speicher = null; this.op = null; this.neu = true;
    } else if (t === '√') {
      this.anzeige = format(this.wert < 0 ? NaN : Math.sqrt(this.wert));
      this.neu = true;
    } else if (t === 'M+' || t === 'M−') {   // laufende Rechnung abschließen, Ergebnis in den Speicher
      if (this.op) this.taste('=');
      this.mem += t === 'M+' ? this.wert : -this.wert;
      this.neu = true;
    } else if (t === 'MR') {
      this.anzeige = format(this.mem);
      this.neu = true;
    } else if (t === 'MC') {
      this.mem = 0;
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
