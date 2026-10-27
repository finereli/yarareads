// Shared by the app (word breakdown, grown-ups section) and tools/ (decodability check).
//
// An inventory is { graphemes: [...], tricky: [...], names: [...] }: what Yara knows.
// CATALOG gives the sounds each grapheme makes, as ARPAbet without stress ("igh": ["AY"], "x": ["K S"]).
// A pronunciation is an ARPAbet array with stress digits, e.g. ["N", "AY1", "T"].

// Grouped as the grown-ups section shows them; TYM's own order within the first group.
export const CATALOG_GROUPS = [
  ['From Teach Your Monster to Read', [
    ['s', ['S', 'Z']], ['a', ['AE']], ['t', ['T']], ['p', ['P']], ['i', ['IH']], ['n', ['N', 'NG']],
    ['m', ['M']], ['d', ['D']], ['g', ['G']], ['o', ['AA', 'AO']], ['c', ['K']], ['k', ['K']],
    ['ck', ['K']], ['e', ['EH']], ['u', ['AH']], ['r', ['R']], ['h', ['HH']], ['b', ['B']],
    ['f', ['F']], ['ff', ['F']], ['l', ['L']], ['ll', ['L']], ['ss', ['S']], ['j', ['JH']],
    ['qu', ['K W']], ['v', ['V']], ['w', ['W']], ['x', ['K S']], ['y', ['Y']], ['z', ['Z']],
    ['zz', ['Z']], ['ch', ['CH']], ['sh', ['SH']], ['th', ['TH', 'DH']], ['ng', ['NG']],
    ['ai', ['EY']], ['ee', ['IY']], ['igh', ['AY']], ['oa', ['OW']], ['oo', ['UW', 'UH']],
    ['ar', ['AA R']], ['or', ['AO R']], ['ur', ['ER']], ['ow', ['AW']], ['oi', ['OY']], ['ear', ['IH R']],
    ['air', ['EH R']], ['ure', ['Y UH R', 'UH R']], ['er', ['ER']], ['ay', ['EY']], ['ou', ['AW']], ['ie', ['AY']],
    ['ea', ['IY']], ['oy', ['OY']], ['ir', ['ER']], ['ue', ['UW', 'Y UW']], ['aw', ['AO']], ['wh', ['W']],
    ['ph', ['F']],
  ]],
  // Split digraphs: the vowel and a final e make one long sound around a consonant (m-a_e-k: make).
  ['Silent e', [
    ['a_e', ['EY']], ['e_e', ['IY']], ['i_e', ['AY']], ['o_e', ['OW']], ['u_e', ['UW', 'Y UW']],
  ]],
  // Phonics after TYM. An id with a space is another sound for letters she may already know:
  // "ow (snow)" is the letters ow saying "oa". Used to break down words she can't read yet.
  ['Coming later', [
    ['ew', ['UW', 'Y UW']], ['oe', ['OW']], ['au', ['AO']], ['ey', ['EY', 'IY']],
    ['a (acorn)', ['EY']], ['a (what)', ['AA', 'AO']], ['e (he)', ['IY']], ['i (find)', ['AY']],
    ['o (go)', ['OW']], ['o (mother)', ['AH']], ['u (put)', ['UH']], ['u (unicorn)', ['Y UW', 'UW']],
    ['y (very)', ['IY']], ['y (by)', ['AY']], ['ow (snow)', ['OW']], ['ie (field)', ['IY']],
    ['ea (head)', ['EH']], ['ou (you)', ['UW']], ['ch (school)', ['K']], ['ch (chef)', ['SH']],
    ['c (city)', ['S']], ['g (giant)', ['JH']], ['ce (voice)', ['S']], ['se (house)', ['S', 'Z']], ['le (little)', ['AH L', 'L']],
    ['ed (jumped)', ['T']], ['d (liked)', ['T']], ['ed (lived)', ['D']], ['ed (wanted)', ['IH D', 'AH D']],
    ['are (care)', ['EH R']], ['ore (more)', ['AO R']], ['tch', ['CH']], ['dge', ['JH']],
    ['kn', ['N']], ['wr', ['R']], ['mb', ['M']],
    // The spellings that unlocked the most words Dragon Masters 1 couldn't break down at all (Oct 23).
    ['or (word)', ['ER']], ['ar (wizard)', ['ER']], ['ear (learn)', ['ER']], ['urr (purr)', ['ER']], ['ou (touch)', ['AH']],
    ['ve (love)', ['V']], ['a (any)', ['EH']], ['o (do)', ['UW']], ['gu (guard)', ['G']], ['ture', ['CH ER']],
    ['oor (door)', ['AO R']], ['ough (thought)', ['AO']], ['al (talk)', ['AO']], ['all (ball)', ['AO L']], ['oul (could)', ['UH']], ['ge (village)', ['JH']],
    ['bb', ['B']], ['dd', ['D']], ['gg', ['G']], ['mm', ['M']], ['nn', ['N']], ['pp', ['P']], ['rr', ['R']], ['tt', ['T']],
  ]],
];
export const CATALOG = CATALOG_GROUPS.flatMap(([, entries]) => entries);
const ENDINGS = ['ed (jumped)', 'd (liked)', 'ed (lived)', 'ed (wanted)'];
const SOUNDS = Object.fromEntries(CATALOG);

export function normalize(word) {
  return word.toLowerCase().replace(/[^a-z]/g, '');
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
// Unstressed single vowels collapse to a schwa: the "o" in dragon, the "a" in asleep.
const SCHWA = new Set(['AH0', 'IH0']);

// The letters a catalog id stands for: "ow (snow)" is written ow.
export const letters = (g) => g.split(' ')[0];
const isSplit = (g) => g.length === 3 && g[1] === '_';
const isConsonant = (g) => !/[aeiouy_]/.test(letters(g));

// Split a word into graphemes Yara knows such that each grapheme makes one of its
// sounds, matching a real pronunciation. Returns null if impossible.
//
// The result is in spelling order: [{ text, g }], where text is the letters and g the grapheme.
// A silent-e pair spans the consonant between: make is m, a (g: a_e), k, e (g: a_e, silent).
export function decode(word, graphemes, pronunciation) {
  const w = normalize(word);
  const known = graphemes.filter((g) => SOUNDS[g]);
  // Longest letters first; for equal letters, the order given (so graphemes she knows win).
  const keys = known.filter((g) => !isSplit(g)).sort((a, b) => letters(b).length - letters(a).length);
  const splits = known.filter(isSplit);
  const consonants = keys.filter(isConsonant);
  const plain = pronunciation.map((p) => p.replace(/\d/g, ''));
  const matches = (g, j) => {
    const options = SOUNDS[g].map((s) => s.split(' '));
    if (VOWELS.has(letters(g)) && SCHWA.has(pronunciation[j])) options.push([plain[j]]);
    return options.filter((seq) => seq.every((p, k) => plain[j + k] === p)).map((seq) => seq.length);
  };
  // The sound a part makes in this word, as ARPAbet ("Z" for the s in "is"): the word card plays its recording.
  const said = (j, n) => plain.slice(j, j + n).join(' ');
  const memo = new Map();

  function go(i, j) {
    if (i === w.length) return j === plain.length ? [] : null;
    const key = i * 100 + j;
    if (memo.has(key)) return memo.get(key);
    let found = null;
    // Silent e first: vowel, one consonant grapheme, then e (a_e in "make", i_e in "white").
    for (const g of splits) {
      if (found || w[i] !== g[0]) continue;
      for (const c of consonants) {
        const e = i + 1 + letters(c).length;
        if (found || !w.startsWith(letters(c), i + 1) || w[e] !== 'e') continue;
        for (const n of matches(g, j)) {
          for (const m of matches(c, j + n)) {
            const rest = go(e + 1, j + n + m);
            if (rest) {
              found = [{ text: g[0], g, sound: said(j, n) }, { text: letters(c), g: c, sound: said(j + n, m) },
                { text: 'e', g, silent: true }, ...rest];
              break;
            }
          }
          if (found) break;
        }
      }
    }
    for (const g of keys) {
      if (found || !w.startsWith(letters(g), i)) continue;
      // le (little), se (house), ce (voice) end a word (or a word plus s, d): not the le in "learn", the se in "searched"
      if (['le', 'se', 'ce'].includes(letters(g)) && !['', 's', 'd'].includes(w.slice(i + 2))) continue;
      // -ed endings (jumped, lived, wanted, liked) only at a word's end: not the ed in "edge" or "red".
      if (ENDINGS.includes(g) && i + letters(g).length !== w.length) continue;
      for (const n of matches(g, j)) {
        const rest = go(i + letters(g).length, j + n);
        if (rest) { found = [{ text: letters(g), g, sound: said(j, n) }, ...rest]; break; }
      }
    }
    memo.set(key, found);
    return found;
  }
  return go(0, 0);
}

// Break a word down with the given graphemes, from its first stressed pronunciation that works.
// Weak forms with no stressed syllable ("into" as IH0 N T AH0) aren't how she'd sound it out.
function breakdown(w, graphemes, pronunciations) {
  for (const p of pronunciations.filter((p) => p.some((ph) => ph.endsWith('1')))) {
    const parts = decode(w, graphemes, p);
    if (parts) return parts;
  }
  return null;
}

// Every grapheme in the catalog, hers first so a breakdown uses what she knows when it can.
const ALL = (inv) => [...inv.graphemes, ...CATALOG.map(([g]) => g).filter((g) => !inv.graphemes.includes(g))];

// The same word broken down with every sound we know of; sounds she hasn't learned are marked new.
function stretch(w, inv, pronunciations) {
  const parts = breakdown(w, ALL(inv), pronunciations);
  return parts && parts.map((p) => (inv.graphemes.includes(p.g) ? p : { ...p, new: true }));
}

// How Yara should approach a word:
//   decodable  she can sound it out (parts)
//   tricky     she knows it on sight
//   name       a character; parts if it can be sounded out at all
//   unknown    she can't read it yet; parts (some marked new) if it can be sounded out at all
// pronunciations is a list of possible pronunciations for the word (may be empty).
// Words sounded out a particular way, chosen by Eli (Oct 16): [letters, sound] per sound button. They get sound buttons even
// if they're on her tricky list. "they": th-e-y, the e and the consonant y gliding into its /ai/ (ey isn't hers yet).
// "again" and "said": ai says "eh" (as many people say "again"). "looked" and "liked" end in ed saying /t/ (liked has no
// silent-e arc here: its e is inside the ed). Letters she hasn't learned would show plum.
export const SOUNDED = {
  they: [['th', 'DH'], ['e', 'EH'], ['y', 'Y']],
  again: [['a', 'AH'], ['g', 'G'], ['ai', 'EH'], ['n', 'N']],
  said: [['s', 'S'], ['ai', 'EH'], ['d', 'D']],
  looked: [['l', 'L'], ['oo', 'UH'], ['k', 'K'], ['ed', 'T']],
  liked: [['l', 'L'], ['i', 'AY'], ['k', 'K'], ['ed', 'T']],
};

// A t and s ending a word (cats, its) show as one "ts" button with one sound, the way x is "ks" (Eli, Oct 27).
// Only on the word card: what counts as readable is still t + s.
function joinTs(parts) {
  const [t, s] = parts?.slice(-2) || [];
  if (!t || t.text !== 't' || t.sound !== 'T' || s.text !== 's' || s.sound !== 'S') return parts;
  return [...parts.slice(0, -2), { text: 'ts', g: 't', sound: 'T S', ...(t.new || s.new ? { new: true } : {}) }];
}

export function classify(word, inv, pronunciations = []) {
  const c = classifyParts(word, inv, pronunciations);
  return c.parts ? { ...c, parts: joinTs(c.parts) } : c;
}

function classifyParts(word, inv, pronunciations) {
  const w = normalize(word);
  const base = normalize(word.replace(/[’']s$/, ''));
  const names = inv.names.map(normalize);
  // Possessives: "Yara's" arrives as "yaras" once stored without the apostrophe.
  if (names.includes(base) || (w.endsWith('s') && names.includes(w.slice(0, -1)))) {
    return { kind: 'name', parts: stretch(w, inv, pronunciations) };
  }
  if (SOUNDED[w]) {
    return { kind: 'decodable', parts: SOUNDED[w].map(([text, sound]) => ({ text, g: text, sound, ...(inv.graphemes.includes(text) ? {} : { new: true }) })) };
  }
  if (inv.tricky.map(normalize).includes(w)) return { kind: 'tricky' };
  if (w === 'a' && inv.graphemes.includes('a')) return { kind: 'decodable', parts: [{ text: 'a', g: 'a', sound: 'AE' }] }; // "a" is taught as decodable
  const parts = breakdown(w, inv.graphemes, pronunciations);
  if (parts) return { kind: 'decodable', parts };
  return { kind: 'unknown', parts: stretch(w, inv, pronunciations) };
}

// Break page text into tokens: words (tappable) and the spaces/punctuation between them.
export function tokenize(text) {
  return text.match(/[A-Za-z’']+|[^A-Za-z’']+/g) || [];
}

export function isWord(token) {
  return /[A-Za-z]/.test(token);
}

// The inventory as it applies inside one story: plus that story's own characters' names.
export function forStory(inv, story) {
  return story.names ? { ...inv, names: [...inv.names, ...story.names] } : inv;
}

// Words in a compiled story that Yara can't read with this inventory.
export function unreadable(story, inv) {
  const local = forStory(inv, story);
  return Object.entries(story.words)
    .filter(([w, prons]) => classify(w, local, prons).kind === 'unknown')
    .map(([w]) => w);
}
