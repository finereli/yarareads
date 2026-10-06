# Vocabulary: what Yara can read, and what to add next

Living notes on growing Yara's reading inventory. Re-measure with `node tools/coverage.mjs`
after any change to what she knows (pull the live inventory first: `node tools/pull.mjs`).

## How we measure

`tools/coverage.mjs` runs ten public-domain early readers from Project Gutenberg through the same
checker the stories use: two McGuffey primers, five Beatrix Potter tales, The Aesop for Children
and The Golden Goose Book (~51,000 words). It reports the share of words she can read, why the rest
fail, and the most common words she can't read yet, counting only words that appear in at least half
the books (so character names drop out).

The books are a century old, so absolute numbers run low. Use them to compare options, not as a grade.

## Coverage so far (Oct 2026)

| Inventory | She can read |
|---|---|
| Teach Your Monster to Read: 59 graphemes, 41 tricky words, + egg, house | 70.7% |
| + "of", "into" as tricky words | 72.7% |
| + silent e (a_e, e_e, i_e, o_e, u_e) | 76.3% |

Silent e was the largest single gain available: +3.6 points, against +2.7 for all 16 of the best
tricky words below combined (measured from the 72.7% baseline). It also generalises: she can then read
silent-e words she's never seen, which tricky words can't do. TYM stops just before it, so it's the
natural next step in her phonics anyway.

## Findings

1. **Patterns beat word lists.** After silent e, the remaining gap by cause:
   y at the end of a word as "ee" or "igh" (very, happy, by, fly) 3.6%; -ed endings (lived, jumped, wanted) 2.3%;
   doubled consonants before an ending (running, sitting) 0.4%; a long tail of single words ~15%.
   Each of those patterns, once taught, unlocks many words at once. Single tricky words add ~0.1-0.4% each.
2. **The tricky-word tail is flat.** The top 80 single words together add only ~8 points.
   Pick tricky words for what they let stories *say*, not just frequency.
3. **Some failures come from the US dictionary, not from Yara.** "from" and "been" sound out
   with what she knows in British English (f-r-o-m, b-ee-n) but fail against CMU's American pronunciations.
   Fix: a small UK override file for the lexicon (tools/lexicon.mjs), not tricky words.

## Future tricky words (not added yet)

Common in early readers, irregular, and useful for storytelling. In order of frequency:

> very, by, would, who, could, two, mother, where, should, once, other, water, put, here, any, because

- "could / would / should" unlock a lot of story ("could Fizz fly?"). Teach as a family.
- "very" and "by" stop being tricky once y-as-ee and y-as-igh are taught; prefer teaching the pattern.
- Also frequent but better solved by patterns: old, more, over, only (o as "oa"), know (kn + ow as "oa").

## Next candidates, in rough order of value

1. UK pronunciation overrides (from, been, and any others the checker flags that shouldn't fail).
2. y at the end: as "ee" (very, happy, funny) and as "igh" (by, my, fly, try).
3. -ed endings: the three sounds (t in jumped, d in lived, id in wanted).
4. The tricky words above, when stories need them.
5. Alternative pronunciations of known graphemes (ow as "oa" in snow; ea as "e" in head; ie as "ee" in field).
