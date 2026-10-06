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
  // Julia and Toby
  sparkle: `
    <path d="M60 16 92 52 60 104 28 52z" fill="#fffdf8"/>
    <path d="M60 16 92 52H28z" fill="#ffffff"/>
    <path d="M60 30 76 52 60 84 44 52z" fill="#f6eefc"/>
    <path d="M24 22l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#f59ac0"/>
    <path d="M96 70l2.5 6.5 6.5 2.5-6.5 2.5-2.5 6.5-2.5-6.5-6.5-2.5 6.5-2.5z" fill="#8fd6a4"/>
    <path d="M94 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#bfe0f5"/>
    <path d="M22 80l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="var(--gold)"/>`,
  wheel: `
    <path d="M14 40h14M10 56h16M16 72h12" stroke="#fff4e6" stroke-width="5" stroke-linecap="round"/>
    <circle cx="68" cy="60" r="34" fill="#2a2440"/>
    <circle cx="68" cy="60" r="22" fill="#fff4e6"/>
    <path d="M68 60 68 38M68 60l18 12M68 60l-13 20" stroke="#2a2440" stroke-width="5" stroke-linecap="round"/>
    <path d="M68 60l-20-8" stroke="var(--ember)" stroke-width="5" stroke-linecap="round"/>
    <path d="M48 52l-6 8 4 2" fill="none" stroke="var(--ember)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="68" cy="60" r="6" fill="var(--gold)"/>`,
  crash: `
    <path d="M60 18l8 22 22-10-10 22 24 8-24 8 10 22-22-10-8 22-8-22-22 10 10-22-24-8 24-8-10-22 22 10z" fill="#fff4e6"/>
    <circle cx="44" cy="54" r="12" fill="#f59ac0"/><path d="M40 64q2 12-2 16" stroke="#f59ac0" stroke-width="6" stroke-linecap="round" fill="none"/>
    <circle cx="74" cy="48" r="10" fill="#7fb6e8"/><path d="M78 56q4 8 0 14" stroke="#7fb6e8" stroke-width="5" stroke-linecap="round" fill="none"/>
    <circle cx="66" cy="76" r="9" fill="var(--gold)"/>`,
  whoa: `
    <path d="M30 96V62M30 62l-8 9M30 62l8 9" stroke="#fff4e6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
    <path d="M90 100V58M90 58l-8 9M90 58l8 9" stroke="#fff4e6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
    <path d="M44 30h32l-5 34H49z" fill="#fff4e6"/><path d="M42 30h36" stroke="#2a2440" stroke-width="5" stroke-linecap="round"/>
    <path d="M60 76v18M60 76l-9 10M60 76l9 10" stroke="var(--gold)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M22 26l2.5 6.5 6.5 2.5-6.5 2.5-2.5 6.5-2.5-6.5-6.5-2.5 6.5-2.5z" fill="var(--gold)"/>
    <path d="M98 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="var(--gold)"/>`,
  feelings: `
    <path d="M10 98h100" stroke="#2f5a43" stroke-width="6" stroke-linecap="round"/>
    <circle cx="28" cy="80" r="10" fill="#bfe0f5"/><path d="M14 86q6-4 12 0t12 0" stroke="#bfe0f5" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
    <circle cx="62" cy="26" r="10" fill="var(--ember)"/><path d="M62 40v16M54 44v10M70 44v10" stroke="#f9b4a6" stroke-width="4" stroke-linecap="round"/>
    <circle cx="94" cy="88" r="10" fill="var(--gold)"/>
    <path d="M89 87q5 5 10 0" stroke="#2a2440" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  float: `
    <circle cx="22" cy="20" r="2.5" fill="#fff4e6"/><circle cx="98" cy="28" r="2" fill="#fff4e6"/><circle cx="88" cy="12" r="2.5" fill="#fff4e6"/>
    <path d="M30 70a14 14 0 0 1 12-18 18 18 0 0 1 34-4 14 14 0 0 1 14 22z" fill="#fff4e6"/>
    <path d="M0 108c20-10 40-12 60-8s40 2 60-6v26H0z" fill="#29234f"/>
    <path d="M56 84v10M64 84v10" stroke="#fff4e6" stroke-width="4" stroke-linecap="round" opacity=".6"/>
    <path d="M20 46l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="var(--gold)"/>`,
};

export function cover(motif) {
  return `<svg class="motif" viewBox="0 0 120 120" aria-hidden="true">${COVERS[motif] || COVERS.egg}</svg>`;
}
