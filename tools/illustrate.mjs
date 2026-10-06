// Illustrations with FLUX.2 on Cloudflare Workers AI (no extra API key: uses CLOUDFLARE_API_TOKEN).
//
// Consistency comes from character sheets: each cast member gets an approved reference image,
// passed to every page that shows them. Art direction lives in content/art/<series>.json.
//
//   node tools/illustrate.mjs sheet <series> <cast> [n]     draw n candidate sheets (default 4)
//                                                            -> content/art/<series>/candidates/<cast>-<i>.jpg
//   (pick one: copy it to content/art/<series>/<cast>.jpg)
//   node tools/illustrate.mjs pages <story-id> [page ...]   draw pages (1-based), set page.image
//                                                            -> content/pictures/<story-id>/<page>.jpg
//   node tools/illustrate.mjs cover <story-id> <page>       use that page's picture as the cover
//
// Then `node tools/push.mjs --images` uploads them.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const root = new URL('..', import.meta.url).pathname;
const ACCOUNT = '7485eb8ab648601f411b650cd794bce3';
const MODEL = '@cf/black-forest-labs/flux-2-dev';
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// FLUX returns near-lossless JPEGs (~400 KB). Quality 80 is visually identical at reading size and ~5x smaller.
export const webJpeg = (buf) => sharp(buf).jpeg({ quality: 80, progressive: true, mozjpeg: true }).toBuffer();

async function draw(prompt, refs = [], [width, height] = [1024, 768], seed) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', String(width));
  form.append('height', String(height));
  if (seed !== undefined) form.append('seed', String(seed));
  refs.forEach((file, i) => form.append(`input_image_${i}`, new Blob([readFileSync(file)], { type: 'image/jpeg' }), `ref${i}.jpg`));
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) return Buffer.from(data.result.image, 'base64');
    if (attempt >= 3) throw new Error(`FLUX failed: ${res.status} ${JSON.stringify(data.errors || data).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

function loadArt(series) {
  const file = join(root, 'content/art', `${slug(series)}.json`);
  return { art: JSON.parse(readFileSync(file, 'utf8')), dir: join(root, 'content/art', slug(series)) };
}

// Who's in a page: cast members whose match words appear in the scene description or the text.
function castFor(page, art) {
  const words = ` ${`${page.picture || ''} ${page.text}`.toLowerCase().replace(/['’]s\b/g, '').replace(/[^a-z ]/g, ' ')} `;
  return Object.entries(art.cast)
    .filter(([, c]) => c.match.some((m) => words.includes(` ${m} `)))
    .map(([id]) => id);
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'sheet') {
  const [series, id, n = 4] = args;
  const { art, dir } = loadArt(series);
  const c = art.cast[id];
  mkdirSync(join(dir, 'candidates'), { recursive: true });
  const prompt = c.object
    ? `${art.style} Reference sheet: ${c.look} The object alone, empty, no people or animals, three-quarter view, on a plain warm off-white background, centered.`
    : `${art.style} Character reference sheet: ${c.look} Shown full body, standing, facing three-quarters toward the viewer, on a plain warm off-white background. One single figure, centered.`;
  for (let i = 1; i <= Number(n); i++) {
    const img = await draw(prompt, [], [768, 1024], 1000 + i);
    writeFileSync(join(dir, 'candidates', `${id}-${i}.jpg`), img);
    console.log(`candidate ${id}-${i}`);
  }
} else if (cmd === 'pages') {
  const [id, ...which] = args;
  const file = join(root, 'content/stories', `${id}.json`);
  const story = JSON.parse(readFileSync(file, 'utf8'));
  const { art, dir } = loadArt(story.series);
  const out = join(root, 'content/pictures', id);
  mkdirSync(out, { recursive: true });
  const pages = which.length ? which.map(Number) : story.pages.map((_, i) => i + 1);
  for (const n of pages) {
    const page = story.pages[n - 1];
    const cast = castFor(page, art).filter((c) => existsSync(join(dir, `${c}.jpg`))).slice(0, 4);
    const refs = cast.map((c) => join(dir, `${c}.jpg`));
    const who = cast.map((c, i) => `Image ${i + 1} is the reference for ${art.cast[c].look} Keep this exact design, colours and outfit.`).join(' ');
    const prompt = `${art.style} ${who} Scene: ${page.picture}. The words on this page of the story are: "${page.text}"`;
    writeFileSync(join(out, `${n}.jpg`), await webJpeg(await draw(prompt, refs, art.size)));
    page.image = `${id}/${n}.jpg`;
    writeFileSync(file, JSON.stringify(story, null, 2) + '\n');
    console.log(`${id} page ${n}  [${cast.join(', ') || 'no cast'}]`);
  }
} else if (cmd === 'cover') {
  const [id, n] = args;
  const file = join(root, 'content/stories', `${id}.json`);
  const story = JSON.parse(readFileSync(file, 'utf8'));
  story.coverImage = `${id}/${n}.jpg`;
  writeFileSync(file, JSON.stringify(story, null, 2) + '\n');
  console.log(`${id} cover = page ${n}`);
} else {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 15).join('\n'));
}
