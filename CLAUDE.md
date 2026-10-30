# Yara Reads

A reading app for Yara (Eli's daughter), who is finishing Teach Your Monster to Read (TYM).
Live at https://yarareads.finereli.com (free without an account; Google sign-in is optional). Cloudflare Worker + static assets + D1.
The repo is public: README.md is the pitch and how to run your own; stories and pictures are CC BY 4.0, code is MIT (LICENSE, content/LICENSE.md, NOTICE.md).

## Why it exists

TYM was the best thing they found, and she still struggled with it:
- The reading hints were buried in other menus. Here the hint lives on the word: tap it, and its sound buttons pop up in place.
- The stories were repetitive and dull. Here stories are a serialized adventure (Beast Quest / Dragon Masters style, but shorter), written only with phonics and sight words she already knows.

**Positioning (Oct 23, chosen with Tom):** "A fantasy book series for kids who've just learned to read, wrapped in an app that helps
them sound out the words they get stuck on, so they can get lost in a story by themselves." Lead with the story and market through
it, not the app. Tom is writing the full serial. The full document is in finereli/claude-skills, `promote/apps/yarareads/positioning.md`.

## The one rule for content

Every word in a story must be readable by Yara: decodable with her graphemes, a sight word she knows, or a name.
`npm run check` enforces this, and `tools/push.mjs` refuses to upload a story that fails.

The check uses pronunciation, not just spelling. `public/phonics.js#decode` aligns each word's CMU dictionary
pronunciation (`data/cmudict.dict`) with the sounds she knows for each grapheme (`content/inventory.json`).
That's what rejects "cake" (c-a-k-e spells, but the a isn't /a/) and "dry". Unstressed single vowels may be schwa (the o in "dragon").
Weak forms with no stressed syllable are ignored (otherwise "into" sneaks through as IH0 N T AH0); one-letter words like "a" are special-cased.
CMU is a US dictionary, and the app is **American English** throughout (Eli, Oct 23: the voices are American too; the British
pronunciations and voices are gone). `data/extra.dict` adds names and words CMU lacks (Yara, Mittu, tingly) and the odd other
American pronunciation ("frahm" for from). Words in neither dictionary are built from their stem (pecked = peck + T).
Never loosen the inventory to make a story pass.

## Layout

- **Accounts** (Oct 19). Sign-in is finereli-login (login.finereli.com, Google): `public/login.js` is the kit client ported to plain JS,
  `src/verify-login.js` checks the Bearer token in the worker (`AUDIENCE` in worker.js: the prod origin and localhost:8787).
  `account()` in worker.js resolves every private request to the Google id (`sub`). There is no PIN any more, and no invites.
  Inventory (`account_inventory`), settings (`account_settings`), events (`events.sub`) and books from home (`stories.owner`) are per
  account; our own series has `owner` NULL and is visible to everyone signed in. Pictures are served only if a story the account can see
  uses them. A new account starts with the TYM seed inventory. Every library load records the account in `accounts` (sub, email).
  Everything that existed before accounts is held by the placeholder account `'family'`; the secret `FAMILY_EMAIL` (Yara's Google
  account, kept out of the public repo) makes the worker hand it all over the first time that account signs in (`adoptFamily`).
  `push.mjs` / `pull.mjs` take `--owner <email or id>` (or `$OWNER_EMAIL`); the account must have signed in once so it's in `accounts`.
  A book from home has one owner but can be shared with the rest of the family: `story_readers` (story_id, sub) rows,
  written by `push.mjs --share <email or id,...>` (Oct 23). Both books from home are Yara's, shared with Eli's account.
  A book with no owner is visible to every signed-in account, so a book from home must always have one.
  The public site (PUBLIC_HOST) is unchanged: no login, state on the device.
- **Agents (MCP)** (Oct 19). The reusable pattern is the `mcp-server` skill and the pwa kit item `mcp`; this app is a reference implementation of it. A parent's own agent (Claude, ChatGPT...) adds books to their account through `/mcp` (`src/mcp.js`,
  Streamable HTTP with JSON replies). Auth is OAuth 2.1 as the MCP spec asks, ported from the Accountant's `functions/_mcp-auth.ts`
  (`src/mcp-auth.js`): discovery under `/.well-known/`, dynamic client registration, authorization code with PKCE (S256), rotating
  refresh tokens, tokens hashed in `mcp_tokens`. Approving = signing in with Google through login.finereli.com; unlike the
  Accountant (one owner) the tokens carry the approver's `sub`, so the agent works in that account. Grown-ups > Agents shows the
  address and lists/revokes approved agents (`/api/agents`). Tools: `guide`, `get_sounds`, `check_text`, `save_book`, `set_image`,
  `list_books`, `get_book`, `delete_book`, `preview_url`. The agent's how-to is `src/agent-guide.txt` (the `guide` tool returns it,
  and so does the MCP prompt `write_a_book`): edit that, not a docs page. It carries what we learned for agents too: writing (tense,
  word banks, names), pictures (4:3, crop-safe middle, boards, checking for age and anatomy, covers) and checking at iPad sizes.
  When a lesson here changes (illustration.md, a story brief), put the agent's version of it in the guide. Books an agent saves have `stories.owner` = the account, so they're private (`OUR_STORIES` excludes
  owned stories from the public site); ids are `u<6 hex of the account>-<slug>` and pictures `R2 <id>/<page|cover>.<ext>`. A `story`
  is compiled in the worker against the account's inventory and refused if any word is unreadable; a `book` isn't checked. The worker
  compiles with the CMU dictionary served as the static asset `public/lexicon.dict` (git-ignored; `tools/lexicon-asset.mjs` writes
  it, `npm run deploy` runs that first; run it before `wrangler dev` too). `src/lexicon-core.js` and `src/compile.js` are shared with tools/.
  `preview_url` makes a one-hour `yrp_` token (`agent_tokens`): `/?preview=<token>#/read/<id>/<page>` opens the app read-only as the
  account (so an agent with a browser can check its work); it can't save and leaves no reading history.
- **Signed-in requests** carry the Google token as a Bearer header; pictures are plain `<img>` requests, so `POST /api/session` also
  puts the token in a read-only cookie (`yr_token`, honoured for GET only). Test signed-in behaviour without Google: put
  `LOGIN_ORIGIN=http://localhost:8788` in `.dev.vars`, run `node tools/dev-login.mjs` (prints a token, serves the JWKS and a
  `/exchange` that accepts any code, enough to walk the MCP approval), `npx wrangler dev`.
- **Progress** is books finished ("Read N times" in the library) and the page to pick a book up from (`spot`): the free version keeps both in localStorage.
- **The live inventory is in D1**, edited by Eli in the grown-ups section (gate: type a birth year that makes you an adult, like TYM).
  `content/inventory.json` is the seed: her TYM sounds and sight words from his screenshots (Oct 2026), plus "egg" and "house".
  Run `node tools/pull.mjs` before writing stories, so you check against what she knows now.
- **Sight words** (the UK says "tricky words"; the app says sight words since Oct 23, American English; the data key stays `tricky`): words on her sight word list stay whole (we tried breaking them down, t-o and h-e sounded odd),
  and so does a word nothing in the catalog explains: both are labelled "Sight word" (there's no "New word" any more).
  The list stays; adjust it as she reads. "Coming later" gained the 15 spellings that unlocked the most of Dragon Masters' unbreakable words
  (or in word, ar in wizard, ou in touch, ve, a in any, o in do, gu, ture, oor, ough, al, all, oul, ge, urr; about 75
  words); rarer ones (eigh, stle, eau...) are left as sight words. le / se / ce only count at a word's end.
- **-ed endings** (Oct 24, Eli): `ed (jumped)` /t/, `ed (lived)` /d/, `ed (wanted)` /id/ and `d (liked)` /t/ are switched on in the seed
  inventory (and so on the public site and for new accounts). They only count at a word's end (`ENDINGS` in phonics.js), not
  the ed in "red" or "bedtime". First use: "Her best cup is smashed on the grass" (book 4). The stories are still told in the present tense.
- `public/phonics.js#CATALOG_GROUPS`: every grapheme with its ARPAbet sounds, grouped (TYM, Silent e, Coming later). The inventory lists only grapheme names.
  Silent e is a split digraph (a_e, i_e...): `decode` returns parts in spelling order, `{ text, g }`, so "make" is m, a (g a_e), k, e (g a_e, silent).
  The word card links the vowel and its e with an arc under the consonant, as taught in class, and sounds them out together.
  "Coming later" includes alternative sounds for letters she knows, with ids like "ow (snow)" (`letters(id)` gives the letters).
  Names and words she can't read yet are still broken down, using the whole catalog: tiles for sounds she hasn't learned are plum (`part.new`).
  Only sight words and words no catalog sound can explain show as one block.
  `SOUNDED` in phonics.js lists words sounded out a particular way, by Eli's choice, as [letters, sound] per button, ahead of
  the sight word list: "they" is th-e-y (the e and consonant y glide into its /ai/), "again" and "said" play their ai as "eh", "looked" and "liked" end in ed as /t/ (Oct 19).
  Add to it one word at a time; it changes only the word card, not what counts as readable.
  A t and s ending a word (cats, its) show as one "ts" button with one sound (`joinTs`, Eli, Oct 27), like x is ks: also card-only.
- `docs/stories/`: one brief per series (Tom's briefs, decisions, chapter outline). Read it before writing the next chapter.
- `docs/vocabulary.md`: coverage findings and the queue of what to teach or add next. `node tools/coverage.mjs` re-measures.
- `content/stories/*.json`: `{ id, series, number, title, cover, names?, pages: [{ text, picture, image? }] }`. `cover` is a motif in `public/art.js#COVERS`
  (egg, tear, bog, sun, moon, sparkle, wheel, crash, whoa, feelings, float; add new ones there with a `--cover-<name>` color in style.css). `picture` is a scene description for image generation;
  `image` is an R2 key ("fizz-1/1.jpg") for the page's actual picture, with the file in `content/pictures/<key>`. `names` are characters known only in that story.
- **Books from home** (`kind: "book"`): real books the family owns, e.g. Mittu and the Yellow Mango. They live in `content/home/<id>/book.json` plus
  their page images. **The repo is public and these are other people's books**: the folder is in git **encrypted with git-crypt**
  (`.gitattributes`, Oct 23; before that it was gitignored and purged from history). The key is the shared git-crypt key in
  1Password (Private vault, Document "git-crypt"): on a fresh clone `op document get git-crypt --out-file <tmp>`, `git-crypt unlock <tmp>`,
  delete the tmp file. Kindle captures (`raw/`), bake-offs and trial boards stay out (.gitignore). D1 and R2 hold the served copies.
  They're exempt from the readability rule; the checker reports what share she can read, and the reader underlines words she can't read yet.
  To add one: extract text and pictures (for PDFs, `pdftohtml -xml` gives each illustration's tile positions; render with `pdftoppm -aaVector no`
  or tile seams show), split into short pages, set `coverImage`, then `node tools/push.mjs --images`.
  Kindle books (Dragon Masters 1, Oct 22): open the book in Kindle Cloud Reader in Brave, page with the right arrow and
  `screencapture -l <window id>` each screen into `content/home/<id>/raw/` (the window must be on screen and the Mac
  unlocked: keep it awake with `caffeinate`). `tools/kindle/extract.py` OCRs each capture (Apple Vision, `ocr.swift`) and crops
  its drawing with the text painted out; `assemble.py` reflows the text into ~40-word pages using a `meta.json` (chapter
  titles, the drop caps OCR misses, text fixes) and writes book.json. Push one book with `push.mjs --only <id>`.
  Picture keys must be `<book>/<file>`: `/api/pictures` takes one slash.
- **Chapters** (Oct 23). A long book is read a chapter at a time: the page a chapter starts on has `chapter: "<title>"`
  (numbered in order). The reader shows the title above that page's text (tappable, like the rest), the dots count only
  the chapter's pages, a list button opens the chapters, and finishing a chapter shows "End of Chapter N" with the next
  one (event `chapter`, its page is where the next starts, so the library picks up there and says "On chapter N").
  A book with no `chapter` on any page reads as before.
- **Title page** (Oct 23): a book from home opens on `#/cover/<id>` (from the library when there's no place to pick up from, and
  back from page 1): the whole cover (`coverImage`, contained, never cropped), the series and number (`bookSeries`/`bookNumber`
  , which also label the library card), the title (tappable) and
  `author` / `illustrator`.
- **One text size per book** (`fit: "book"`, Oct 23): for books we cut into pages ourselves (Kindle imports), `fitPage`
  measures the six longest pages once per screen size (in a stand-in, with a 4:3 picture) and shows every page at the
  size the fullest one needs; a page may still crop its picture a bit more (`.tight`). Without it each page is fitted on
  its own, which suits books kept page for page (Mittu). `assemble.py` cuts each chapter into even pages (~200
  characters, a DP over sentence breaks that prefers paragraph ends), so one long page doesn't shrink the whole book. Julia and Toby stay separate books for now; later the first
  seven may become chapters of one book.
- Page pictures: **read docs/illustration.md** before making any. Check every picture before pushing it: age appropriate for any
  five-year-old (no fangs or horror) and correct anatomy (count limbs, joints bend the right way). `node tools/illustrate.mjs` (gpt-image-2 via OpenRouter; a chapter is drawn as one 4x4 board as the plan, a panel chosen per page, then **each page redrawn on its own
  from its panel** (`redraw`, `use`: board panels are too small for good anatomy, Oct 25); approved character sheets in content/art/ as references) writes web-quality JPEGs (~60 KB); `node tools/shrink.mjs` for others.
- Page pictures are served from R2 (bucket `yara-reads-pictures`) at `/api/pictures/<key>`: our own stories' pictures to anyone, an account's private pictures only to that account.
  `push.mjs` stores each picture in the story as `<key>?v=<hash of the file>`, and versioned URLs are cached for a year
  (immutable): a redrawn picture keeps its R2 key but gets a new URL, so every device shows the new one. Always re-push
  stories after changing a picture (`push.mjs --images` does both).
  The app asks for a sized copy (`?w=1600` on a page, `?w=640` for a library cover): `servePicture` in worker.js makes it once
  with the Images binding (WebP, or JPEG for a browser without WebP; never enlarged; the original if that's smaller) and keeps it
  in R2 under `sized/`. 1600 because a 10.9" iPad in portrait shows a page picture about 1560 pixels wide: ours are 1024 and stay
  so, agents' uploads can be bigger. To reset every picture cache (devices and R2 copies), bump `PICTURE_GEN` in app.js and deploy.
  **D1 and R2 are in eastern North America** (ENAM) and the worker runs at the edge near the reader (Sofia for Eli,
  ~130 ms a round trip): a picture nobody had viewed took ~1.75 s (Oct 23). So sized copies are keyed by the URL's
  `v` (`sized/<g>/<w>/<key>.<v>.<webp|jpg>`, no lookup of the original), `push.mjs --images` makes them ahead of time
  with sharp, the worker stores a copy it had to make after responding (`ctx.waitUntil`), and the reader fetches the
  next two pages' pictures while she reads.
  The browser keeps each for a year, and the worker keeps sized copies in Cloudflare's edge cache (`caches.default`, keyed by
  v and g, after the sign-in check), so a repeat request skips the R2 reads: ~0.2 s, like a static file (was ~0.45 s).
- `public/`: the app (no build step). `art.js` holds the icons, logo and cover motifs; `fonts/` are self-hosted Andika (reading) and Fredoka (UI).
- `src/worker.js`: API. `/api/login`, `/api/stories`, `/api/stories/:id`, `/api/pictures/<key>`, `/api/inventory` (GET/PUT), `/api/events`,
  `/api/say?word=&voice=` (a spoken word), `/api/settings` (GET/PUT: the voice), `/api/sounds/<key>` (the recorded phonics sounds).
- `migrations/`: D1 schema. Stories are stored with each word's pronunciations (`story.words`), so the app classifies words against the live inventory at read time.
- Events (open, page, tap, finish) go to the `events` table. Taps are the signal for which words to practise.

## Commands

- `npm run check`: check all stories against the inventory.
- `node tools/pull.mjs`: copy the live inventory from D1 into content/inventory.json.
- `node tools/push.mjs`: push stories to remote D1 (`--local` for dev). `--inventory` also overwrites the live inventory: only after a pull.
  `--images` uploads every page picture to R2.
- `npm run deploy`: check, stamp `public/version.json`, deploy. Commit first so the version names a real commit.
  Secrets: `FAMILY_EMAIL` (see Accounts).
  The installed app (home screen PWA) checks version.json on returning to the foreground and every 15 minutes, and reloads
  when it changed. There's deliberately no service worker: assets are served must-revalidate, so a reload is the whole update.
  Content (books, pictures, inventory) isn't versioned: the app drops its cached books and inventory whenever the library
  shows, and re-renders the library on returning to the foreground. Grown-ups has "Refresh now" (a full reload).
- Icons: `public/icons/*.svg` are the sources; the PNGs are rendered from them (Playwright screenshot at each size).
- Local dev: `node tools/lexicon-asset.mjs` (the dictionary the worker needs), `npx wrangler d1 migrations apply yara-reads --local`, `node tools/push.mjs --local --inventory`,
  `node tools/sounds-upload.mjs eli --local` (the recorded sounds), `npx wrangler dev`.

## Design

Storybook at dusk: warm paper, plum ink, dragon ember and gold (tokens at the top of style.css). Chunky `.press` buttons that sink when tapped,
one SVG icon set in art.js (24px grid, 2.5 stroke, round caps), illustrated cover motifs. No emoji in the UI.
Sound buttons follow classroom convention: a dot under a single letter, a bar under a digraph/trigraph.
The reader is exactly one screen tall: the picture shrinks first, then `fitPage` steps the text down (min 20px).
Page pictures run edge to edge in the card and fill the space the text leaves (`object-fit: cover`): on top when the
screen is tall, on the left in landscape. The picture box follows the picture's own shape (`--ia`, set when it loads), so
cover crops at most ~20% off any side; in landscape the box is the card's height times that shape, capped at 60% of the
card. Text she can read comes first: `fitPage` shrinks it to 34px, then lets the picture crop up to about a third
(`.tight`), and only then shrinks the text further (min 20px). Checked on every page at 10.2" and 10.9" iPad sizes (Oct 9):
a plain half-card box in landscape had cut a third off every picture. No inner dashed border.
Word cards shrink their tiles (`--chip`) for long words instead of scrolling, so the whole word stays visible.
Double-tap zoom is off (`touch-action: manipulation` on everything): quick taps on words kept zooming the iPad.
Word cards have **one speaker button**: it says the word (the sound buttons light). Tapping a sound button plays that
sound (a silent e plays its vowel). The speaker used to sound the word out first (the `soundOut` setting); Eli dropped it
on Oct 23: his recorded sounds then the AI voice saying the word sounded odd together.
**Recorded sounds** (Eli's, R2 `sounds/recorded/eli/<id>.mp3`, `RECORDED` in app.js).
`decode` gives every part its `sound` in ARPAbet ("Z" for the s in "is", "K S" for x), and `SOUND_FILES` maps it to a
recording (a sequence with no recording of its own plays phoneme by phoneme). Recordings load when the card opens.
The public site serves these 45 recordings too (Eli's call, Oct 16), but not the recorded example words.
Recordings are levelled to -23 LUFS over the active part of each clip (the median of Hyperion's words), then corrected per
sound (`ADJUST` in tools/sounds-record.mjs) from Zwicker loudness (ISO 532-1, sones, via MoSQITo), which unlike LUFS hears
broadband hiss as loud as people do; plus 2.5 dB off the unvoiced hisses by Eli's ear (f, s, h were "extremely loud").

**Word voice.** Words are spoken by a Cloudflare Workers AI voice (Deepgram Aura 2, American voices only: Luna, Asteria and 8 men; `VOICES` in worker.js, chosen in grown-ups > Voice,
stored in D1 `settings`; default Luna since Oct 23, Hyperion before). `/api/say` generates a word once and caches it in R2 under `tts2/<voice>/<word>.mp3` (~0.5-1 s new, ~10 ms cached).
The word is sent as a sentence (`playing.`): a bare word gets its end clipped.
The word card starts fetching the word when it opens, so it's usually ready by the tap; if not,
the speaker button shows a spinner. Audio plays through Web Audio: iOS only allows sound started inside a tap, so the tap
resumes the AudioContext (`unlockAudio`) and the word can play later from a timer. Browser speech is only the fallback.
Words are made on demand the first time they're said (the free, signed-out version only plays words already made). Cost is negligible (Aura ~$0.03 per 1k characters).
Aura still clips a word's end now and then; fix those one at a time (Eli: one-off issues are fine). Generate a few takes,
pick the clean one (last 50 ms quiet), and put it over the cached file in R2: Hyperion's "the" was replaced this way (Oct 13).
`unlockAudio` resumes the AudioContext from any state but running (iOS goes 'interrupted' after the screen locks) and
plays a silent buffer inside the tap.

The grown-ups section is tabbed (`#/grownups/<tab>`: Sounds, Words, Books, Voice, App). `gdata` holds everything the tabs show,
loaded once per visit; edits change it, re-render at once, and save in the background (nothing waits on the network).
Wording in settings uses no pronouns: it's for any child.

Content changes need only `tools/push.mjs`, no deploy.

## Roadmap

1. ~~v0: reader, tap-a-word sound buttons, sound-it-out, first series (Yara and Fizz, 5 books), checker, progress.~~
2. ~~Real inventory from TYM, grown-ups section, visual design, books 2-5 rewritten with the full TYM set.~~
   ~~Silent e (split digraphs), coverage tool.~~
   Next: more stories. AI writes, the checker validates, and we loop until clean. Vocabulary queue: docs/vocabulary.md.
3. Pictures: generate per page from `picture`, keeping characters consistent; store in R2.
4. Real phoneme audio. ~~Word voice (Cloudflare TTS, cached).~~ AI can't make pure phonics sounds well (tried TTS spellings like "sss" and
   gpt-audio descriptions, Oct 7), so the sounds are **recorded by Eli** from a recording sheet, then cut into one file per sound.
   Recording: one file per part of the sheet, each sound then its example word, a pause between ("sss ... sun ... mmm ... map").
   `node tools/sounds-record.mjs <file> <part> [who]` slices at the silences, finds each example word with Whisper (in order;
   the sound is the piece just before it, so stray noises and redos don't matter), levels and fades each clip, and uploads it to R2
   `sounds/recorded/<who>/<id>.mp3` (+ `words/`). Local copies in content/sounds/recorded/
   are in git, public (Eli's call, Oct 23: the app doesn't work well without them).
   **Re-recording (Oct 27):** the sheet is now American and has 48 sounds (zh in treasure, aw in saw, ts in cats added; ar, or,
   ur, ear, air, ure said with their r). Tom found it hard, so Eli records it again (Oct 30), and the plan is to re-voice his
   recording with a speech-to-speech model into each word voice, so sounds, little words and words all sound like one voice.
   That's why the voices get cut to one woman and one man (Oct 30). Whisper on 36 short words, two takes each: Asteria 73%,
   Saturn 69%, Luna 68%, Orion 63%, ... Mars 40% (last; the family's pick until now). Eli picks by ear (artifact "Yara Reads
   Voice Pick"). The `ADJUST` levels get re-measured for the new recording. Until then `FALLBACK` in app.js plays o for aw and t, s for ts.
   **Little words (Oct 29):** the AI voices can't say short function words alone (Luna's "the" came out as "yeah"/"duh",
   Mars's "at" as "bad", and Mars puts a consonant before vowel-first words: "bit", "dintu"). Rewording the input
   ("the!", quotes, "the...") didn't help over 520 takes. So part 5 of the sheet is 26 little words (`LITTLE_WORDS` in
   phonics.js), each said alone with no sound before it; the tool saves them to `sounds/recorded/<who>/say/<word>.mp3`,
   levelled like the AI words, and skips one it can't find (it stays with the AI voice). Once recorded, set `SAID_BY` in
   app.js to the recorder: the word card then plays the recording in every voice (falling back to the AI voice if a file
   is missing). Accepted trade-off: a human voice says these words, the chosen AI voice says the rest.
   `node tools/sounds-upload.mjs eli --local` puts them in the local R2 so sounding out works under `wrangler dev`. All 45 recorded by Eli in one take (Oct 16, `all`): with exactly
   two pieces per sound the tool pairs them in order, since Whisper mishears single words ("yeah" for hat).
   ~~The tiles play each sound as they light.~~
   **AI voices can't say lone phonics sounds** (Oct 23): Azure with IPA `<phoneme>` lost the voicing (v as f, z as s, b as p).
   What does work is **voice conversion**: `tools/sounds-convert.py` (Seed-VC, on the Mac) re-voices a recorded sheet into any voice,
   so one good human recording gives every AI word voice matching sounds. First try (Eli into Luna) kept every sound but came out
   strained; parked, settings to try are in the script. A cleaner American recording (Tom?) is the other half.
5. ~~Books from home, with pictures (first: Mittu and the Yellow Mango).~~ Next: show which *sounds* a book needs, not just words.
6. Release plan: docs/roadmap.md.

Not here: whole-page read-aloud. Browser TTS was too weak and it's a shortcut around reading. A proper version (OpenAI TTS with word timings for highlighting) is a separate project.
