# Illustrating books

How the pictures for Julia and Toby were made (Oct 2026), and how to do it again for more chapters
or a new series. Tool: `tools/illustrate.mjs`. Everything it needs is in the repo.

## The short version

1. Write the art direction: `content/art/<series-slug>.json` (style + cast).
2. Draw character-sheet candidates, pick one per cast member, copy it to `content/art/<series-slug>/<cast>.jpg`.
3. Draw the pages: each page's `picture` description becomes a prompt, with the approved sheets of whoever
   appears passed in as reference images. That's what keeps Toby looking like Toby on every page.
4. Upload (`node tools/push.mjs --images`), then review in the app and redraw the misses.

```
node tools/illustrate.mjs sheet "Julia and Toby" toby 4     # 4 candidates -> content/art/julia-and-toby/candidates/
cp content/art/julia-and-toby/candidates/toby-2.jpg content/art/julia-and-toby/toby.jpg
node tools/illustrate.mjs pages toby-3                      # every page of chapter 3
node tools/illustrate.mjs pages toby-3 5 7                  # just pages 5 and 7 (redraws)
node tools/illustrate.mjs cover toby-3 5                    # page 5's picture as the library cover
node tools/push.mjs --images                                # upload to R2 and publish
```

## The model

- **FLUX.2 [dev]** on **Cloudflare Workers AI**: `@cf/black-forest-labs/flux-2-dev`. Runs on Eli's Cloudflare
  account with `CLOUDFLARE_API_TOKEN`; no other API key needed. About 7-10 seconds per picture.
- Chosen because it accepts **reference images** (up to 4), which is the whole consistency strategy.
  flux-1-schnell (also on the account) makes nice single pictures but can't take references.
- Call: `POST https://api.cloudflare.com/client/v4/accounts/<account>/ai/run/@cf/black-forest-labs/flux-2-dev`,
  **multipart form**: `prompt`, `width`, `height`, optional `seed`, and `input_image_0` ... `input_image_3` as files.
  The response is JSON: `result.image` is a base64 JPEG.
- Other image models on the account (for reference): flux-2-klein-4b/9b, SDXL, Leonardo phoenix and lucid-origin.
- Cost: check Workers AI pricing before a big run. Around 60 pictures for six chapters is small either way.

## Art direction file

`content/art/julia-and-toby.json`:

- `style`: one paragraph appended to every prompt. Ours: soft watercolor with colored-pencil lines, warm light,
  rounded friendly shapes, simple backgrounds, expressive faces; cozy, a little magical.
  **Always end with "No text, no letters, no words anywhere in the image."** Text in a picture would compete
  with the words she's reading, and models love adding signs and labels.
- `size`: `[1024, 768]`, 4:3 landscape. Right for the reader: about half the iPad screen in landscape at 2x,
  full width on a phone. Character sheets are drawn portrait at 768x1024.
- `cast`: one entry per recurring character or object:
  - `look`: a precise visual description (hair, clothes, colours, size). This goes into both the sheet prompt
    and every page prompt that uses the sheet, so write it once and reuse it.
  - `match`: lowercase words that mean "this cast member is in the page" (see cast detection below).
  - `object: true` for things, not characters (the playhouse). Changes the sheet prompt to "the object alone,
    empty, no people or animals". Without it, the playhouse sheets all came with a child standing in front.

### Julia and Toby's cast (approved sheets in content/art/julia-and-toby/)

| Cast | Look | Picked |
|---|---|---|
| julia | 6, curly brown hair in two puffs, freckles, yellow t-shirt, blue denim dungarees, red sneakers | candidate 2 |
| toby | small young dragon (big-dog size), pure white scales shimmering with tiny pink, green and blue sparkles, round friendly face, big dark eyes, small wings, soft rounded spikes, long tail | candidate 2 |
| playhouse | small plastic playhouse, pink walls, window and door, green roof | candidate 2 (object) |

Julia's look is ours, not Tom's; he can change it (edit `look`, redraw her sheet, then redraw the pages she's in).
All candidates are kept in `candidates/` so a different pick is just a copy.

## Prompts

**Sheet:** `<style> Character reference sheet: <look> Shown full body, standing, facing three-quarters toward the
viewer, on a plain warm off-white background. One single figure, centered.` Seeds 1001-1004 for the 4 candidates.

**Page:** `<style> Image 1 is the reference for <look of cast 1> Keep this exact design, colours and outfit.
Image 2 is ... Scene: <page.picture>. The words on this page of the story are: "<page.text>"`

- The scene comes from the page's `picture` field in the story JSON. Write it as a short visual description
  (who, doing what, where, mood): "the dragon looking down guiltily". It's the main lever for a better picture.
- The page text is included for context (emotion, objects mentioned).
- References are passed in cast order, at most 4.

## Cast detection (who's on a page)

A cast member is included when one of its `match` words appears as a whole word in the page's `picture` or
`text` (lowercased, possessive 's stripped). Julia matches julia/girl/she/her; Toby matches toby/dragon;
the playhouse matches "play house"/"playhouse".

Lessons:
- **A missed match draws a generic character.** "patting the dragon's nose" missed Toby (before possessives were
  stripped) and produced a green dragon. If a page shows the wrong-looking character, check its `picture` text
  mentions them by a match word.
- Over-matching is mostly harmless (an extra reference rarely adds a stray character), but watch pronouns:
  "she" also matches Julia when "she" is someone else (a dragon mum). Add an explicit word to the scene instead.
- Scenes with only incidental characters (the cat, the dog, the big dragon on the peak) get no reference;
  they'll vary between pages. If one recurs, give it a cast entry and a sheet.

## After drawing

- **Compression.** FLUX returns near-lossless JPEGs (~400 KB). `illustrate.mjs` re-saves at quality 80 with
  mozjpeg (via `sharp`): ~60 KB, visually identical at reading size. `node tools/shrink.mjs` does the same for
  pictures added another way. 48 pictures went from 17 MB to 2.8 MB.
- Files: `content/pictures/<story-id>/<page>.jpg`, and the tool sets `page.image` = `"<story-id>/<page>.jpg"`
  in the story JSON. Committed to git (the repo is private).
- Upload: `node tools/push.mjs --images` uploads every referenced picture to the R2 bucket `yara-reads-pictures`
  and republishes the stories. Served at `/api/pictures/<key>` behind the PIN.
- Covers: `illustrate.mjs cover <story> <page>` sets `coverImage`; otherwise the library shows the drawn motif.
- The app picks up new pictures whenever the library opens; no deploy needed.

## Review and redraws

Eli and Tom review in the app. To redraw a page: improve its `picture` description if the problem is content
(wrong action, missing object), then `node tools/illustrate.mjs pages <story> <page>` (a new random seed each
time) and `node tools/push.mjs --images`. If a character drifts off-model, strengthen their `look` or redraw
their sheet; changing a sheet means redrawing every page they appear in.

## Status (Oct 2026)

- Julia and Toby chapters 1-5: all pages drawn and live. Chapter 6: pages 1-3 drawn; pages 4-10 still to do.
- Covers: still the drawn motifs; switch to page pictures once favourites are chosen.
- Mittu and the Yellow Mango: pictures are scans from the book (see CLAUDE.md, books from home), not generated.

## A new series

1. Write `content/art/<series-slug>.json` (slug of the story's `series` field): style (reuse ours for a matching
   library, or change it), and a cast entry per recurring character/object.
2. Draw 4 sheet candidates each, review them side by side, copy the picks.
3. Test 3-4 pages that mix the cast differently before drawing everything: consistency problems show up there.
4. Draw all pages, upload, review in the app.
