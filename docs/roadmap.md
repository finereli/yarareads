# Roadmap: from Yara's app to a public release

Revised Oct 19 2026 after review. The first goal is to publish and find out whether any parents want this at all. Everything is split into what launch needs and what can wait.

## Launch

### 1. Clean up grown-ups (done Oct 19, not yet deployed)

- Drop the "words she taps most" stats from Practise. Remove the tab until progress (see Progress) gives it something to show.
- Voice tab: remove the experiments (the old Aura 1 and Melo voices, the try-a-word box). Keep the choice of voice.
- Sounds tab: say what the toggles do. For existing books they only control what's highlighted as new (dotted underline, plum tiles, the "can't read yet" lists). They're a real constraint only when an agent writes a new story. Rename the tab to match.
- Retire the Sound lab (`#/sounds`). It's experiment leftovers.

### 2. Sounds

- Every sound in the catalog plays one of the 45 recordings, but some play phoneme by phoneme (le, ed), and words outside the catalog have phonemes with no recording. Measure the gaps across all books, then record those.
- Ship with Eli's voice. AI is bad at pure phonics sounds (tried). A different set can replace it later.

### 3. Accounts (built Oct 19, not yet deployed or tested; no PIN, no invites)

- Log in with finereli-login, like every other app. One account owns its inventory, settings, books and progress.
- Accounts matter because Yara needs copyrighted books we own (Mittu) that must never be public. Home books belong to an account.
- Keep the free tier: no login, state on the device, as the public site works today.

### 4. Progress (built Oct 19: read N times, resume where you left off)

- Replace the stars with "read N times". The End screen stops showing three fixed stars.
- Store only books finished and the current spot in each book. Nothing else.

### 5. MCP for books (built Oct 19, not yet deployed or tried with a real agent)

- An MCP server so an agent can manage an account's books: create, upload page images, push, check. It replaces a how-to doc for agents, and it's what lets Tom use his own Claude to write books for Yara.
- Agents connect with OAuth 2.1 (the Accountant's pattern): the parent approves with Google, and the agent's tokens belong to that account.
- Agents need to check their work in the real UI. Add a private preview key that lets an agent open the app as an account without going through login.
- Until it exists, adding a book stays the paragraph in CLAUDE.md.

### 6. Publish

See the publish-app skill: positioning, name, icon, privacy (children's data), hosting cost of TTS, launch channels.

## After launch

### 7. Optional sync without losing progress

- Logged-out readers can log in later and keep their progress. TYM loses it on the switch, so ours must merge the device's state into the account.

### 8. Multiple kids

- Several kid profiles under one parent account on one device, as TYM does.

### 9. Far future

- People writing and sharing stories on the platform, maybe a marketplace. Only worth thinking about if parents show up.

## Later

- Long words split into the words inside them on the word card: sub-marine, every-where, under-water (Eli, Nov 24: "not yet").
  UX: one card, the tiles grouped by part with a gap between, a small speaker per part, the big speaker for the whole word.
  Each part follows its own rules (a sight word part shows whole). Teachers' move: cover half the word, read it, then the rest.
- Then syllables (sub-ma-rine) on the same card. Too many for Eli to record; two ways to make them, to try on ~20 book words
  with a Whisper check and Eli's ear: (1) the word voice with the "The word is:" lead-in, respelling syllables that aren't
  words ("reen"); (2) the whole word said once, cut at syllable starts found by a forced aligner (same take, same voice;
  the likelier one). Syllables from CMU by maximal onset, mapped to letters by decode.
  **Gate (Eli, Nov 24):** only after she recognizes many more short words on sight without sounding them out.

## Not important

- An Indian English voice. Workers AI has none, and Deepgram's Flux TTS would need its own API key and a second code path. Revisit only if it matters.
