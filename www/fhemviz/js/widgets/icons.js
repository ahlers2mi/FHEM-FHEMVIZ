/*
 * FHEMVIZ - gemeinsame Stroke-Icons (24x24, ab v0.39.0).
 * Genutzt vom Symbol-Modus der Schalter-Kachel und - neu - von Sensor- und
 * Text-Kacheln (attr vizIcon): dort steht das Symbol links neben dem
 * Hauptwert und traegt dessen Farbe (vizStates ok/warn/bad/accent).
 * Gezeichnet mit stroke="currentColor", stroke-width 1.6, round caps.
 */

export const ICONS = {
  lampe: `<path d="M9 18 h6"/><path d="M10 21 h4"/><path d="M8.5 14.5 C6.5 13 5.5 11 5.5 9 A6.5 6.5 0 0 1 18.5 9 C18.5 11 17.5 13 15.5 14.5 L15 18 H9 L8.5 14.5 Z" fill="none"/>`,
  steckdose: `<circle cx="12" cy="12" r="8"/><circle cx="9.2" cy="12" r="1"/><circle cx="14.8" cy="12" r="1"/>`,
  lautsprecher: `<rect x="7" y="4" width="10" height="16" rx="2"/><circle cx="12" cy="9" r="1.4"/><circle cx="12" cy="15" r="2.6"/>`,
  luefter: `<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2 C12 6 15 5 16.5 6.5 C18 8 16 10.5 12 10.2 Z"/><path d="M13.6 13 C17.2 15 16.8 18.2 14.8 18.8 C12.8 19.4 11.6 16.4 13.6 13 Z"/><path d="M10.4 13 C6.8 15 7.2 18.2 9.2 18.8 C11.2 19.4 12.4 16.4 10.4 13 Z" transform="rotate(120 12 12)"/>`,
  pumpe: `<circle cx="12" cy="13" r="6"/><path d="M12 13 L15.5 9.5"/><path d="M9 4 h6 M12 4 v3"/>`,
  tv: `<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M9 20 h6"/>`,
  heizung: `<line x1="6" y1="6" x2="6" y2="19"/><line x1="10" y1="6" x2="10" y2="19"/><line x1="14" y1="6" x2="14" y2="19"/><line x1="18" y1="6" x2="18" y2="19"/><path d="M4 10 h16"/>`,
  power: `<circle cx="12" cy="13" r="8"/><line x1="12" y1="3" x2="12" y2="11"/>`,
  // ab v0.39.0 (Lage-Seite: Zustaende auf einen Blick)
  frost: `<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5L12 6.5l2.5-2M9.5 19.5L12 17.5l2.5 2M4.7 10.3l2.8-.4-1-2.9M19.3 13.7l-2.8.4 1 2.9M4.7 13.7l2.8.4-1 2.9M19.3 10.3l-2.8-.4 1-2.9"/>`,
  batterie: `<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3"/><path d="M6.5 10v4M9.5 10v4"/>`,
  tonne: `<path d="M4.5 6.5h15"/><path d="M9.5 6.5V4.5h5v2"/><path d="M6 6.5l1.2 13h9.6L18 6.5"/><path d="M10 10v6.5M14 10v6.5"/>`,
  waesche: `<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 7h16"/><circle cx="12" cy="14" r="4.5"/><circle cx="7" cy="5" r=".6"/><path d="M9.2 14.6c1-1 2-1 2.8 0s1.8 1 2.8 0"/>`,
  roboter: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M8 5.5h8"/>`,
  maeher: `<path d="M3 15h13l2-4h3"/><path d="M5 15V11h9l2 4"/><circle cx="7" cy="17.5" r="2"/><circle cx="16" cy="17.5" r="2"/><path d="M3 21h18" stroke-dasharray="1.5 2"/>`,
  fenster: `<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18M5 12h14"/>`,
  tuer: `<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M4 21h16"/><circle cx="15" cy="12.5" r=".8"/>`,
  alarm: `<path d="M6 17V11a6 6 0 0 1 12 0v6"/><path d="M4 17h16"/><path d="M10 20h4"/><path d="M12 2v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4"/>`,
  wasser: `<path d="M12 3.5C9 7.5 6.5 10.5 6.5 14a5.5 5.5 0 0 0 11 0c0-3.5-2.5-6.5-5.5-10.5z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>`,
  gast: `<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.6-3.8 3.3-6 6.5-6s5.9 2.2 6.5 6"/><path d="M19 8v6M16 11h6"/>`,
};

/** Schluessel aus attr vizIcon (klein, getrimmt) oder null, wenn unbekannt. */
export function iconKey(attr) {
  const v = String((attr || {}).vizIcon || "").trim().toLowerCase();
  return v && ICONS[v] ? v : null;
}

/** Fertiges <svg> fuer einen Schluessel (aria-hidden, Farbe = currentColor). */
export function iconSvg(key, cls = "vicon") {
  if (!ICONS[key]) return "";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${ICONS[key]}</svg>`;
}

/**
 * CSS fuer das Symbol neben einem Wert (Sensor-/Text-Kachel). Das Symbol sitzt
 * IM Wert-Element und skaliert so mit dessen Schriftgroesse (Kachelgroesse,
 * TV-Modus) mit; Farbe = Wertfarbe (currentColor).
 */
export const ICON_VALUE_CSS = `
  <style>
    .vwi { display: flex; align-items: center; gap: 0.4em; min-width: 0; }
    .vwi > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .vwi .vicon { flex: none; margin: 0; width: max(1.25em, 1.9rem); height: max(1.25em, 1.9rem); }
    .tiw { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
    .tiw .vicon { flex: none; margin: 0; width: 2.2rem; height: 2.2rem; color: var(--viz-muted, #77808c); }
    .tiw > div { min-width: 0; }
  </style>`;
