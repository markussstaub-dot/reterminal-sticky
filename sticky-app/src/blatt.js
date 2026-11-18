// Blatt über dem Reiter (18.11.2026): für die Hilfe („?“) und die Zettel-Karten. Zurück (Android/Browser), ✕ oder
// Tippen daneben schließt es. Immer nur ein Blatt; ein neues ersetzt das offene.
let offen = null;   // { huelle, beimSchliessen }

function schliessenJetzt() {
  if (!offen) return;
  const { huelle, beimSchliessen } = offen;
  offen = null;
  huelle.remove();
  document.body.classList.remove('blattoffen');
  beimSchliessen?.();
}

if (typeof window !== 'undefined') window.addEventListener('popstate', () => { if (offen) schliessenJetzt(); });

/** Blatt zeigen: titel, inhalt (Elemente), { beimSchliessen, kopfRechts } → { schliessen, inhalt (Element) } */
export function blattOeffnen(titel, inhalt, { beimSchliessen = null, klasse = '' } = {}) {
  const ersetzt = !!offen;
  if (offen) { const alt = offen; offen = null; alt.huelle.remove(); alt.beimSchliessen?.(); }
  const huelle = document.createElement('div');
  huelle.className = 'blatthuelle';
  const blatt = document.createElement('div');
  blatt.className = `blatt ${klasse}`.trim();
  blatt.setAttribute('role', 'dialog');
  const kopf = document.createElement('div');
  kopf.className = 'blattkopf';
  const h = document.createElement('h3');
  h.textContent = titel;
  const zu = document.createElement('button');
  zu.className = 'blattzu';
  zu.textContent = '✕';
  zu.setAttribute('aria-label', 'schließen');
  kopf.append(h, zu);
  const koerper = document.createElement('div');
  koerper.className = 'blattinhalt';
  koerper.append(...inhalt);
  blatt.append(kopf, koerper);
  huelle.append(blatt);
  document.body.append(huelle);
  document.body.classList.add('blattoffen');
  offen = { huelle, beimSchliessen };
  if (!ersetzt) { try { history.pushState({ blatt: true }, ''); } catch { /* egal */ } }
  const schliessen = () => { if (offen?.huelle !== huelle) return; if (history.state?.blatt) history.back(); else schliessenJetzt(); };
  zu.onclick = schliessen;
  huelle.addEventListener('click', (e) => { if (e.target === huelle) schliessen(); });
  return { schliessen, inhalt: koerper, titelSetzen: (t) => { h.textContent = t; } };
}

export const blattIstOffen = () => !!offen;

/** kleines Helferlein: Element mit Eigenschaften und Kindern */
export function el(tag, eigen = {}, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(eigen)) {
    if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...kinder.filter((k) => k != null && k !== false));
  return e;
}
