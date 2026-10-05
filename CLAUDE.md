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
CMU is a US dictionary, so a few UK-normal words fail ("from" has a US vowel). Rewrite the sentence; don't loosen the inventory.

## Layout

- `content/inventory.json`: what Yara knows. Graphemes map to ARPAbet sounds. **Still a placeholder** (Letters and Sounds phases 2-4) until Eli sends TYM screenshots.
- `content/stories/*.json`: `{ id, series, number, title, pages: [{ text, picture }] }`. `picture` is a scene description for future image generation.
- `public/`: the app (no build step). `phonics.js` is shared with the Node tools.
- `src/worker.js`: API. `/api/login`, `/api/stories`, `/api/stories/:id`, `/api/events`, `/api/progress`.
- `migrations/`: D1 schema. Stories are stored compiled (with per-word breakdowns) in `stories.body`.
- Events (open, page, tap, finish) go to the `events` table. Taps are the signal for which words to practise.

## Commands

- `npm run check`: check all stories against the inventory.
- `node tools/push.mjs`: push the inventory + stories to remote D1 (`--local` for dev).
- `npx wrangler deploy`: deploy the app. Secrets: `PIN`, `SESSION_SECRET` (never write the PIN into the repo).
- Local dev: `.dev.vars` with PIN and SESSION_SECRET, `npx wrangler d1 migrations apply yara-reads --local`, `node tools/push.mjs --local`, `npx wrangler dev`.

Content changes need only `tools/push.mjs`, no deploy.

## Roadmap

1. ~~v0: reader, tap-a-word sound buttons, sound-it-out, first series (Yara and Fizz, 5 books), checker, progress.~~
2. Real inventory from TYM screenshots, then more stories: AI writes, the checker validates, and we loop until clean.
3. Pictures: generate per page from `picture`, keeping characters consistent; store in R2.
4. Real phoneme audio: Eli records each sound, so the sound buttons speak (TTS can't say a clean /t/).
5. Import books they own: report which graphemes/tricky words she's missing for each, and highlight those words in the text.
6. Parent view: grow "For grown-ups" into a proper practise list driven by taps.

Not here: whole-page read-aloud. Browser TTS was too weak and it's a shortcut around reading. A proper version (OpenAI TTS with word timings for highlighting) is a separate project.
