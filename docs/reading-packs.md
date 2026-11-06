# Private Reading Packs

A Reading Pack attaches accepted phonics and word audio from Phonix to existing
Stories. It does not import or replace Stories, Inventory, settings or progress.
Page audio and timing files remain portable assets; this change does not add page
narration to Yara Reads.

After Google sign-in, open **Grown-ups → Reading Packs** and choose the ZIP.
The browser verifies the archive, every hash and media type before showing the
matching Stories and missing coverage. **Import private audio** uploads verified
assets into account-owned staging and commits the registry atomically. Repeating
an import is safe. Remove a pack from the same screen to delete its private
registry and media. Account deletion also removes all imported packs.

Only exact existing Story/page content receives audio. Changing a Story's pages
detaches its pack on the next read. The newest imported matching pack supplies
that Story's word and tile recordings. Missing imported audio is reported; it does
not silently play another voice. Stories without a matching pack retain the
existing reader behavior.

## Reading Pack v1

The archive is a UTF-8-named, uncompressed (STORE) ZIP with `manifest.json` and
`assets/<sha256>.<wav|mp3|json>`. Compressed/encrypted ZIPs, descriptors, ZIP64,
comments, extra fields, duplicate/unsafe paths and unlisted entries are rejected.
Limits are 512 MiB per archive, 16 MiB per asset, 2 MiB per manifest, 10,000 assets,
100 source Stories and 1,000 pages. The parser reads individual Blob slices rather
than loading or expanding the entire ZIP in memory.

`public/reading-pack-format.js` is the shared portable contract. The manifest
identifies one voice revision, source Story/page SHA-256 fingerprints, ordered
word occurrence keys (including pronunciation IDs where supplied), available
asset hashes, sizes, CRCs and actual media types, plus explicit missing coverage.
Source Story fingerprints hash JSON of the ordered page texts; page fingerprints
hash the exact text. No raw takes, voice references, ASR transcripts, credentials
or reading history belong in this format. Timing receipts contain only validated
word timings, duration, render version and the associated page-audio hash.

The authenticated API is `/api/reading-packs`: POST `/preview` validates metadata
and reports matching content without writing; POST `/imports` starts/reuses staging;
PUT `/:id/assets/:sha256` verifies and stores one bounded asset; POST `/:id/commit`
requires all receipts and matching current content. GET `/for-story/:storyId`
resolves a matching committed pack. GET `/:id/assets/:sha256` authorizes both
account and ready-pack ownership before reading R2. DELETE `/:id` removes the pack.
Writes require the bearer account, never a read-only preview or read cookie.
Staging expires after 24 hours and is cleaned on the account's next import.

Private objects use `private-reading-packs/<hash-of-account>/<pack-hash>/...`;
these keys are never put in Stories, global `sounds/` paths, shared TTS caches or
public static assets. Media responses use `private, no-store`. Public-host and
signed-out requests are denied, and another signed-in account cannot guess a pack
or asset ID to read it.

## Verification and delivery

Run `npm ci`, then `npm test`. Tests start a local Worker with isolated D1/R2 and
an ephemeral signing-key stub; they do not use Cloudflare credentials or remote
AI. They cover matching/unchanged domain data, staged integrity and complete
commit, repeated import, account/public denial, content changes, deletion and ZIP
corruption. The browser test performs ZIP preview/import and imported word/tile
playback in the production reader; it asserts no global sound/TTS fallback.
Set `READING_PACK_SCREENSHOTS=/absolute/path` to save phone/tablet QA images.
Test audio is a synthetic WAV fixture, not evidence of voice likeness.

Apply migration `0012_reading_packs.sql` with the repository's normal reviewed
D1 migration process before deploying the Worker. This patch is intended for Eli's
review; its preparation and local tests do not merge or deploy his service.
