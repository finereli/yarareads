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
- **Toby has no idea how his powers work (Tom, rewrite).** He never explains them, and he hides them: in chapter 1
  he won't say why he ran away. Nobody, not Julia and not the reader, sees anything float until chapter 4. It's a twist.
- **The breakages (Tom):** Toby breaks four things of Julia's. He never blames anyone or explains; he just gets very sad.
  Julia isn't very mad, just annoyed: she huffs, stomps off, and is back to play a few minutes later.
  The fourth time she sees it happen ("Whoa! Do it on me!"), which starts the lessons.
- **Timeline (Tom):** Julia goes to class; they meet and practise in the afternoon, sneaking off to the wood every day.
  ("School" isn't readable for her yet; the text says "class".)
- **The lessons (Tom):** about two weeks, over two chapters. They go horribly: when Toby gets upset, cans and sticks
  go flying. The breakthrough is an accident, like all learning breakthroughs: he isn't even trying, and a branch
  floats softly into Julia's open hand. They practise once more, then Julia floats.
- **Julia floating (Tom):** should be awesome: a few pages of her gliding around, Toby steering her, Julia overjoyed.
  We kept Toby calm and focused rather than happy while she floats, since happy means nothing floats (for now).
- **The ending:** a properly ominous dragon (Tom): a big black dragon wakes in a dark cave on Super-Tall Peak,
  claws scraping, smoke curling: "Toby. I can feel you. You can not hide from me."
- **Length:** 8-12 pages per chapter; the floating chapter is longer (12).

## Chapters (rewrite, Oct 2026)

| # | Title | Covers |
|---|---|---|
| 1 | Julia Meets Toby | Backyard, a yelp, up the gate and down, Toby crying under a tree. He ran away from his cave on Super-Tall Peak, but won't say why. Julia hides him in her play house: "Mum must not see you." |
| 2 | The Bent Wheel | Julia goes to class. After lunch she runs back: her scooter wheel is bent (break 1). Toby just looks sad. She huffs and stomps off, but can't stay cross; back with her kite. |
| 3 | The Painting | She paints Toby, goes in for a drink; comes back to paint everywhere and her painting ruined (break 2). Toby's tail droops. She sulks on the step, then he has a pink nose and they're friends again. |
| 4 | Whoa! | Her best cup in bits (break 3). Then she peeks into the play house: a bee buzzes, Toby gets cross, spikes up, and her dolls, drum and tea set zoom sky-high and crash (break 4). The twist. "Do it on me! Make me float!" "I can not help it." "Then we will fix it." |
| 5 | Float Lessons | Every afternoon they sneak to the wood. "I bet floating is like feelings." A tin can lands in a tree; a stick bonks Julia's chin. "I am no good at this." Day after day, nothing floats the right way. |
| 6 | Day After Day | Day six: a log in the pond. Day nine: a branch on the play house. Day ten: "I give up." At dusk, not even trying, Toby looks at Julia, and a branch drifts down soft as a leaf into her hand. "You did it!" "But how?" |
| 7 | Julia Floats | They do it again: branch, stick, can. "Now me." Her feet lift; higher than the gate, the play house; gliding past treetops with the birds, looping the loop, dipping to the pond. "This is the best day!" Then: far away, a big black dragon wakes. "Toby. I can feel you." |

Story files: `content/stories/toby-1.json` ... `toby-7.json`. Pictures kept from the first draft live under
`content/pictures/toby-v1-*`; new ones under `content/pictures/toby-N/`.

## Open threads for the next arc

- Who is the big dragon looking for Toby? (His mum? A cross elder?)
- Learning that glad feelings can float too: the plot change Tom planned.
- How did Toby float Julia when he wasn't cross or sad? Calm/focused might be its own feeling; Tom decides.
- Fixing Julia's scooter wheel (with a careful float?).
