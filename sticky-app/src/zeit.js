// Uhrzeit-Format einheitlich (Markus, 13.11.2026): 12 oder 24 h folgt der Einstellung des Handys; der Sticky übernimmt
// das als Standard (einstellungen/zeit.txt) und kann es auf seiner Einstellungs-Seite selbst überstimmen.

/** true, wenn das Handy 12 h (AM/PM) zeigt */
export const HANDY_12H = (() => {
  try { return !!new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12; } catch { return false; }
})();

/** Uhrzeit für die App-Anzeige im Format des Handys, deutsch beschriftet */
export function uhrzeit(d, mitSekunden = false) {
  return new Date(d).toLocaleTimeString('de-DE', { hour: HANDY_12H ? 'numeric' : '2-digit', minute: '2-digit', ...(mitSekunden ? { second: '2-digit' } : {}), hour12: HANDY_12H });
}

/** Datei für den Sticky: „format 12“ oder „format 24“ */
export const zeitDatei = () => new TextEncoder().encode(`format ${HANDY_12H ? 12 : 24}\n`);
