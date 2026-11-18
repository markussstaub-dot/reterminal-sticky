// Mehr-Tab als Menü mit Unterseiten (18.11.2026, VORSCHLAEGE-2026-11-18.md Nr. 5). Nur Anordnung, keine Logik:
// alle Felder bleiben im DOM, nur ihre Unterseite ist versteckt.

export function mehrEinrichten() {
  const menue = document.getElementById('mehrMenue');
  const seiten = [...document.querySelectorAll('.mehrseite')];
  let offen = null;
  const zeige = (name, merken = true) => {
    if (name && !seiten.some((s) => s.dataset.seite === name)) name = null;
    menue.hidden = !!name;
    for (const s of seiten) s.hidden = s.dataset.seite !== name;
    // Zurück-Taste von Android/Browser schließt die Unterseite statt die App
    if (name && !offen && merken) { try { history.pushState({ mehr: name }, ''); } catch { /* egal */ } }
    offen = name;
    window.scrollTo(0, 0);
  };
  for (const k of menue.querySelectorAll('[data-seite]')) k.addEventListener('click', () => zeige(k.dataset.seite));
  for (const k of document.querySelectorAll('.mehrseite .zurueck')) k.addEventListener('click', () => (offen ? history.back() : zeige(null)));
  // Zurück aus einem Blatt (Hilfe) landet wieder auf dieser Unterseite: dann offen lassen
  window.addEventListener('popstate', (e) => { if (offen && e.state?.mehr !== offen) zeige(null, false); });
  // Tipp auf den Mehr-Tab zeigt immer das Menü
  document.querySelector('#tabs [data-ziel="mehr"]')?.addEventListener('click', () => { if (offen) zeige(null, false); });
  zeige(null, false);
  return zeige;
}
