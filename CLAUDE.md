# Yara Reads

A reading app for Yara (Eli's daughter), who is finishing Teach Your Monster to Read (TYM).
Live at https://yarareads.finereli.com (PIN-gated). Cloudflare Worker + static assets + D1.

## Why it exists

TYM was the best thing they found, and she still struggled with it:
- The reading hints were buried in other menus. Here the hint lives on the word: tap it, and its sound buttons pop up in place.
- The stories were repetitive and dull. Here stories are a serialized adventure (Beast Quest / Dragon Masters style, but shorter), written only with phonics and tricky words she already knows.

## The one rule for content

Every word in a story must be readable by Yara: decodable with her graphemes, a tricky word she knows, or a name.
`npm run check` enforces this, and `tools/push.mjs` refuses to upload a story that fails.

The check uses pronunciation, not just spelling. `public/phonics.js#decode` aligns each word's CMU dictionary
pronunciation (`data/cmudict.dict`) with the sounds she knows for each grapheme (`content/inventory.json`).
That's what rejects "cake" (c-a-k-e spells, but the a isn't /a/) and "dry". Unstressed single vowels may be schwa (the o in "dragon").
Weak forms with no stressed syllable are ignored (otherwise "into" sneaks through as IH0 N T AH0); one-letter words like "a" are special-cased.
CMU is a US dictionary. `data/extra.dict` adds British pronunciations next to CMU's (from, been, parrot) and names CMU lacks (Yara, Mittu);
add to it when a word fails only because of American English. Words in neither dictionary are built from their stem (pecked = peck + T).
Never loosen the inventory to make a story pass.

## Layout

- **The live inventory is in D1**, edited by Eli in the grown-ups section (gate: type a birth year that makes you an adult, like TYM).
  `content/inventory.json` is the seed: her TYM sounds and tricky words from his screenshots (Oct 2026), plus "egg" and "house".
  Run `node tools/pull.mjs` before writing stories, so you check against what she knows now.
- `public/phonics.js#CATALOG_GROUPS`: every grapheme with its ARPAbet sounds, grouped (TYM, Silent e, Coming later). The inventory lists only grapheme names.
  Silent e is a split digraph (a_e, i_e...): `decode` returns parts in spelling order, `{ text, g }`, so "make" is m, a (g a_e), k, e (g a_e, silent).
  The word card links the vowel and its e with an arc under the consonant, as taught in class, and sounds them out together.
  "Coming later" includes alternative sounds for letters she knows, with ids like "ow (snow)" (`letters(id)` gives the letters).
  Names and words she can't read yet are still broken down, using the whole catalog: tiles for sounds she hasn't learned are plum (`part.new`).
  Only tricky words and words no catalog sound can explain show as one block.
- `docs/stories/`: one brief per series (Tom's briefs, decisions, chapter outline). Read it before writing the next chapter.
- `docs/vocabulary.md`: coverage findings and the queue of what to teach or add next. `node tools/coverage.mjs` re-measures.
- `content/stories/*.json`: `{ id, series, number, title, cover, names?, pages: [{ text, picture, image? }] }`. `cover` is a motif in `public/art.js#COVERS`
  (egg, tear, bog, sun, moon, sparkle, wheel, crash, whoa, feelings, float; add new ones there with a `--cover-<name>` color in style.css). `picture` is a scene description for image generation;
  `image` is an R2 key ("fizz-1/1.jpg") for the page's actual picture, with the file in `content/pictures/<key>`. `names` are characters known only in that story.
- **Books from home** (`kind: "book"`): real books the family owns, e.g. Mittu and the Yellow Mango. They live in `content/home/<id>/book.json` plus
  their page images, and that folder is **gitignored: the repo is public and these are other people's books**. D1 and R2 hold the real copies.
  They're exempt from the readability rule; the checker reports what share she can read, and the reader underlines words she can't read yet.
  To add one: extract text and pictures (for PDFs, `pdftohtml -xml` gives each illustration's tile positions; render with `pdftoppm -aaVector no`
  or tile seams show), split into short pages, set `coverImage`, then `node tools/push.mjs --images`.
- Page pictures: **read docs/illustration.md** before making any. `node tools/illustrate.mjs` (FLUX.2 on Workers AI, approved
  character sheets in content/art/ as references) writes web-quality JPEGs (~60 KB); `node tools/shrink.mjs` for others.
- Page pictures are served from R2 (bucket `yara-reads-pictures`) at `/api/pictures/<key>`, behind the PIN.
- `public/`: the app (no build step). `art.js` holds the icons, logo and cover motifs; `fonts/` are self-hosted Andika (reading) and Fredoka (UI).
- `src/worker.js`: API. `/api/login`, `/api/stories`, `/api/stories/:id`, `/api/pictures/<key>`, `/api/inventory` (GET/PUT), `/api/events`, `/api/progress`.
- `migrations/`: D1 schema. Stories are stored with each word's pronunciations (`story.words`), so the app classifies words against the live inventory at read time.
- Events (open, page, tap, finish) go to the `events` table. Taps are the signal for which words to practise.

## Commands

- `npm run check`: check all stories against the inventory.
- `node tools/pull.mjs`: copy the live inventory from D1 into content/inventory.json.
- `node tools/push.mjs`: push stories to remote D1 (`--local` for dev). `--inventory` also overwrites the live inventory: only after a pull.
  `--images` uploads every page picture to R2.
- `npm run deploy`: check, stamp `public/version.json`, deploy. Commit first so the version names a real commit.
  Secrets: `PIN`, `SESSION_SECRET` (never write the PIN into the repo).
  The installed app (home screen PWA) checks version.json on returning to the foreground and every 15 minutes, and reloads
  when it changed. There's deliberately no service worker: assets are served must-revalidate, so a reload is the whole update.
  Content (books, pictures, inventory) isn't versioned: the app drops its cached books and inventory whenever the library
  shows, and re-renders the library on returning to the foreground. Grown-ups has "Refresh now" (a full reload).
- Icons: `public/icons/*.svg` are the sources; the PNGs are rendered from them (Playwright screenshot at each size).
- Local dev: `.dev.vars` with PIN and SESSION_SECRET, `npx wrangler d1 migrations apply yara-reads --local`, `node tools/push.mjs --local --inventory`, `npx wrangler dev`.

## Design

Storybook at dusk: warm paper, plum ink, dragon ember and gold (tokens at the top of style.css). Chunky `.press` buttons that sink when tapped,
one SVG icon set in art.js (24px grid, 2.5 stroke, round caps), illustrated cover motifs. No emoji in the UI.
Sound buttons follow classroom convention: a dot under a single letter, a bar under a digraph/trigraph.
The reader is exactly one screen tall: the picture shrinks first, then `fitPage` steps the text down (min 20px).
Word cards shrink their tiles (`--chip`) for long words instead of scrolling, so the whole word stays visible.
Word cards have **one speaker button**. If the word has tiles, it always sounds it out first (tiles light in turn) and only
then says the word: Eli doesn't want the voice reading words for her without the sounding out. Tricky words just get said.
iOS only allows speech started inside a tap, so the tap speaks a silent utterance first (`primeSpeech`) to unlock the delayed word.

Content changes need only `tools/push.mjs`, no deploy.

## Roadmap

1. ~~v0: reader, tap-a-word sound buttons, sound-it-out, first series (Yara and Fizz, 5 books), checker, progress.~~
2. ~~Real inventory from TYM, grown-ups section, visual design, books 2-5 rewritten with the full TYM set.~~
   ~~Silent e (split digraphs), coverage tool.~~
   Next: more stories. AI writes, the checker validates, and we loop until clean. Vocabulary queue: docs/vocabulary.md.
3. Pictures: generate per page from `picture`, keeping characters consistent; store in R2.
4. Real phoneme audio. In progress: `tools/sounds.mjs` generates TTS candidates per sound (Deepgram Aura-2 "pandora", Aura-1
   "athena", MeloTTS; several spellings each) into R2 `sounds/candidates/`; the grown-ups **Sound lab** (`#/sounds`) plays them
   and stores Eli's pick per sound in D1 `sound_picks`. Sounds no voice gets right will need Eli's own recordings.
   Speech recognition (Whisper) can't pre-screen: it hallucinates on isolated sounds.
5. ~~Books from home, with pictures (first: Mittu and the Yellow Mango).~~ Next: show which *sounds* a book needs, not just words.
6. Practise: grow the grown-ups "Practise" panel into something Eli can work through with her.

Not here: whole-page read-aloud. Browser TTS was too weak and it's a shortcut around reading. A proper version (OpenAI TTS with word timings for highlighting) is a separate project.
