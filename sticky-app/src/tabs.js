// Untere Tab-Leiste: zeigt eine Seite, merkt sich die zuletzt offene (nur Anordnung, keine Logik)
const SCHLUESSEL = 'sticky.tab';

export function tabsEinrichten() {
  const knoepfe = [...document.querySelectorAll('#tabs [data-ziel]')];
  const zeige = (ziel) => {
    if (!document.querySelector(`.tab[data-tab="${ziel}"]`)) ziel = 'sticky';
    for (const t of document.querySelectorAll('.tab')) t.hidden = t.dataset.tab !== ziel;
    for (const k of knoepfe) k.classList.toggle('an', k.dataset.ziel === ziel);
    try { localStorage.setItem(SCHLUESSEL, ziel); } catch { /* egal */ }
    window.scrollTo(0, 0);
  };
  for (const k of knoepfe) k.addEventListener('click', () => zeige(k.dataset.ziel));
  let start = 'sticky';
  try { start = localStorage.getItem(SCHLUESSEL) || 'sticky'; } catch { /* egal */ }
  zeige(start);
  return zeige;
}
