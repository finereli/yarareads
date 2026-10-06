# Julia and Toby (series brief)

Written by Tom (Yara's brother), Oct 2026. Our job is to turn it into decodable chapters
Yara can read, keeping Tom's story and spirit. Chapters 1-6 come first; the brief is meant to grow.

## Tom's brief (as given)

Julia is a 6-year old girl that was playing in her backyard when she heard yelping, she climbed up the
fence and jumped down. Then she ran towards the sound. There she finds Toby the dragon. Toby is
white-scaled and covered with rainbow shimmering sparkles, he ran away from his home because most of the
dragons in the cave-village up on top of High-High Super High Mountain (this part is flexible, such as
simply Very High Mountain) because of his uncontrolled levitation powers.

Julia hides Toby in her Playhouse (those things with the plastic walls that are like a teeny house that
girls play in) and goes to eat breakfast. When she comes back, her scooter's wheel doesn't work. Toby
confesses and says that it floated and broke while he was in the house. Julia gets mad and storms off.
Toby gets sad.

The first few relations are like this. Toby breaks something and Julia gets mad, but eventually she sees
it happen and goes "wooooooaaaaah that's sooooooo coool!! do it on me!!!" and Toby says he can't. This is
where Julia starts to teach Toby how to use his levitation. She never had the power before but she
imagines it's like emotions (which is the magic system, different emotions correspond to different types
of floating) and tries helping him, both to get her floating up and to simply help Toby, probably more of
the former.

After this part of the story, it could go anywhere.

## Writing it for Yara

Every word has to pass `npm run check`. What that means for this story, measured against her
inventory (TYM + silent e, Oct 2026):

- **Present tense.** -ed endings aren't hers yet (jumped, floated), so chapters are told in the present,
  like the Fizz books: "Julia hears a yelp."
- **Works:** float, floats, scooter, dragon, cave, peak, wheel, broke, yelp, backyard, shine, white, spin,
  zoom, cool, whoa, and the feelings glad, mad, sad, fear, joy, cross.
- **Doesn't, so we say it another way:** mountain (use "peak"), rainbow, sparkles, playhouse, breakfast,
  scared, calm, happy, fence, village, hover.
- **Names:** Julia, Toby, Super and Tall are the series' `names` (in every chapter's JSON), with
  pronunciations for Julia and Toby in data/extra.dict. The word card still breaks names into sounds.

## Decisions

- **Mountain:** Super-Tall Peak (Tom). "Super" and "tall" aren't readable for her yet, so they're names:
  allowed anywhere, broken into sounds on the word card, new sounds in plum.
- **Toby's look, in her words:** white, and his scales shine pink and green and blue.
- **The magic system (Tom):** Toby's feelings make things float, the way a porcupine's spikes show how it feels
  (in the text: "His spikes stick up" when he's cross).
  - Sad: things float low and slow; several things hover a little. In her words: lift up just a bit, drift, bob.
  - Cross/mad: things shoot up high and quick, uncontrolled, then crash down hard. In her words: zoom up high, crash, smash.
  - Happy: nothing floats. That's because of how Toby *thinks* about his feelings: he believes feeling good
    keeps him from breaking things. **This will change later; it's part of the plot. Don't resolve it yet.**
- **Chapter 6 ending (ours):** Julia floats for the first time, but only because Toby is sad (homesick);
  when he grins she sinks back down ("That is not fair!"), which seeds the happy-floating change. Last line hooks
  the next arc: a big dragon on Super-Tall Peak is looking for Toby.
- **Length:** like the Fizz books: 9-10 pages, about 120 words.

## Chapters

| # | Title | Covers |
|---|---|---|
| 1 | Julia Meets Toby | Scooter in the backyard, a yelp, up the gate and down, Toby under a tree; Super-Tall Peak; the dragons sent him away; "You can stay with me." |
| 2 | The Bent Wheel | Hidden in the play house; toast and jam; bent scooter wheel; Toby admits it; Julia stomps off; sad float (cups and dolls bob). |
| 3 | Crash! | Julia paints Toby, goes in for a drink; the cat jumps on his tail; cross float: paint pots zoom up and smash onto her painting; Julia furious; sad drift. |
| 4 | Whoa! | A big dog barks; Toby's spikes stick up; bucket, rake and pot zoom up and crash; Julia sees it: "Whoa! That is so cool! Make me float!"; "When I am glad, not a thing floats."; "I will teach you!" |
| 5 | Float Lessons | Floating is like feelings; Toby explains sad and cross floats; glad = nothing; Julia tests it (a frog on his nose: cross, the frog zooms into a tree); "Sad floats are soft." |
| 6 | Julia Floats | Dusk; Toby misses his mum; Julia floats, soft as a cloud; Toby grins and she sinks: "That is not fair!"; a big dragon on Super-Tall Peak is looking for Toby. |

Story files: `content/stories/toby-1.json` ... `toby-6.json`. Covers: sparkle, wheel, crash, whoa, feelings, float.

## Open threads for the next arc

- Who is the big dragon looking for Toby? (His mum? A cross elder?)
- Learning that glad feelings can float too: the plot change Tom planned.
- Fixing Julia's scooter wheel (with a careful float?).
