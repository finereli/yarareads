// The app's drawn vocabulary: icons (24px grid, 2.5 stroke, round caps), the logo, and book cover motifs.

const icon = (body, extra = '') =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS = {
  home: icon('<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/><path d="M10 19v-5h4v5"/>'),
  prev: icon('<path d="M15 5 8 12l7 7"/>'),
  next: icon('<path d="M9 5l7 7-7 7"/>'),
  speaker: icon('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  sound: icon('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M17 12h3"/>'),
  close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  check: icon('<path d="M5 12.5 10 17l9-10"/>'),
  lock: icon('<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  back: icon('<path d="M10 7 5 12l5 5"/><path d="M5 12h14"/>'),
  erase: icon('<path d="M9 6h10v12H9l-5-6z"/><path d="m12 10 4 4M16 10l-4 4"/>'),
};

export const STAR = (filled) =>
  `<svg class="star ${filled ? 'on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z" stroke-linejoin="round"/></svg>`;

// An open book with a small flame rising out of it: reading, with a dragon in it.
export const LOGO = `
<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M32 18c3-6 6.5-8.5 6.5-13 4 3 6 7.5 5 12 1.5-1 2.5-2.5 3-4.5 2 4 2 9-1.5 12.5H22.5c-3-3-3.5-7.5-1.5-11 .5 2 1.5 3.5 3 4.5-.5-4 1.5-7.5 4-9.5.5 3.5 2 6 4 9z" fill="var(--ember)"/>
  <path d="M32 21c1.2-2.4 2.8-3.6 3-5.6 1.8 1.6 2.6 4 1.8 6.6" fill="var(--gold)"/>
  <path d="M6 26c9-3 18-2 26 3v28c-8-5-17-6-26-3z" fill="var(--paper)" stroke="var(--ink)" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M58 26c-9-3-18-2-26 3v28c8-5 17-6 26-3z" fill="var(--paper-2)" stroke="var(--ink)" stroke-width="3.5" stroke-linejoin="round"/>
</svg>`;

// Cover motifs, drawn on a 120x120 canvas over the cover's own color.
export const COVERS = {
  egg: `
    <ellipse cx="60" cy="104" rx="34" ry="6" fill="rgba(0,0,0,.15)"/>
    <path d="M60 18c18 0 32 30 32 52 0 20-14 34-32 34S28 90 28 70c0-22 14-52 32-52z" fill="#fff4e6"/>
    <path d="M60 18c18 0 32 30 32 52 0 20-14 34-32 34" fill="none" stroke="rgba(0,0,0,.08)" stroke-width="10"/>
    <circle cx="47" cy="52" r="6" fill="var(--ember)"/><circle cx="70" cy="74" r="8" fill="var(--ember)"/><circle cx="50" cy="84" r="4.5" fill="var(--ember)"/><circle cx="72" cy="44" r="4" fill="var(--ember)"/>
    <path d="M38 64l8 6 6-9 7 8 6-7 7 7 9-6" fill="none" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  tear: `
    <path d="M16 108c10-26 26-40 44-40s34 14 44 40z" fill="rgba(255,255,255,.18)"/>
    <path d="M36 108c8-16 16-24 24-24s16 8 24 24z" fill="rgba(255,255,255,.28)"/>
    <path d="M60 14c0 0-26 30-26 48a26 26 0 0 0 52 0c0-18-26-48-26-48z" fill="#bfe0f5"/>
    <path d="M48 60a12 12 0 0 0 8 14" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,
  bog: `
    <path d="M0 74c16-8 28 4 42-2s26-10 40-4 26 6 38 0v52H0z" fill="#3c6e52"/>
    <path d="M0 90c18-6 30 4 46 0s28-8 44-2 20 4 30 0v32H0z" fill="#2f5a43"/>
    <circle cx="44" cy="64" r="10" fill="#fff4e6"/><circle cx="74" cy="64" r="10" fill="#fff4e6"/>
    <circle cx="46" cy="66" r="4.5" fill="var(--ink)"/><circle cx="72" cy="66" r="4.5" fill="var(--ink)"/>
    <circle cx="28" cy="40" r="6" fill="none" stroke="#bfe3c9" stroke-width="3.5"/><circle cx="92" cy="30" r="9" fill="none" stroke="#bfe3c9" stroke-width="3.5"/><circle cx="76" cy="16" r="4" fill="none" stroke="#bfe3c9" stroke-width="3"/>`,
  sun: `
    <g stroke="#fff4e6" stroke-width="5" stroke-linecap="round">
      <path d="M60 10v12M60 74v-6M24 46h12M84 46h12M34 20l8 8M86 20l-8 8"/>
    </g>
    <circle cx="60" cy="46" r="18" fill="#fff4e6"/>
    <path d="M10 108c4-22 22-34 50-34s46 12 50 34z" fill="#8a5a3c"/>
    <path d="M22 92c12-8 24-10 38-10" fill="none" stroke="#a87250" stroke-width="5" stroke-linecap="round"/>`,
  moon: `
    <circle cx="20" cy="22" r="2.5" fill="#fff4e6"/><circle cx="100" cy="16" r="2" fill="#fff4e6"/><circle cx="88" cy="48" r="2.5" fill="#fff4e6"/><circle cx="30" cy="56" r="2" fill="#fff4e6"/>
    <path d="M70 18a28 28 0 1 0 22 44 24 24 0 1 1-22-44z" fill="var(--gold)"/>
    <path d="M0 108l30-34 18 16 22-30 50 48z" fill="#1d1838"/>`,
};

export function cover(motif) {
  return `<svg class="motif" viewBox="0 0 120 120" aria-hidden="true">${COVERS[motif] || COVERS.egg}</svg>`;
}
