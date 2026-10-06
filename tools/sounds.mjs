// Phoneme audio experiment: can Cloudflare's TTS voices say pure phonics sounds if we spell them cleverly?
// Generates candidates per sound x spelling x voice, uploads them to R2 (sounds/candidates/...), and writes
// the manifest the grown-ups "Sound lab" reads. Eli listens there and stars the good ones.
//
//   node tools/sounds.mjs [--local]
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const ACCOUNT = '7485eb8ab648601f411b650cd794bce3';
const where = process.argv.includes('--local') ? '--local' : '--remote';

// Pure sounds, as taught: stretch the continuants (sss, mmm), clip the stops (t not "tuh").
// Each sound gets a few spellings to see which one a TTS voice turns into the right noise.
export const SOUNDS = [
  ['s', ['sss', 'ssss.']], ['m', ['mmm', 'mmmm.']], ['f', ['fff', 'ffff.']], ['sh', ['shhh', 'sh!']],
  ['n', ['nnn', 'nnnn.']], ['l', ['lll', 'llll.']], ['z', ['zzz', 'bzzz']], ['v', ['vvv', 'vvvv.']],
  ['t', ['t', 'tuh', 't!']], ['p', ['p', 'puh', 'p!']], ['k', ['k', 'kuh', 'k!']], ['b', ['b', 'buh']],
  ['d', ['d', 'duh']], ['g', ['g', 'guh']],
  ['a', ['a', 'ah', 'æ']], ['e', ['eh', 'e']], ['i', ['ih', 'i']], ['o', ['o', 'aw', 'ah']], ['u', ['uh', 'u']],
  ['ai', ['ay', 'aye']], ['ee', ['ee', 'eee']], ['igh', ['eye', 'igh']], ['oa', ['oh', 'oa']],
  ['oo', ['oo', 'ooo']], ['ar', ['ar', 'ah']], ['or', ['or', 'aw']], ['ur', ['ur', 'er']],
  ['ow', ['ow', 'ouch']], ['oi', ['oy', 'oi']], ['ch', ['ch', 'chuh']], ['th', ['th', 'thh']],
];

const VOICES = {
  pandora: (text) => ({ model: '@cf/deepgram/aura-2-en', body: { text, speaker: 'pandora', encoding: 'mp3' } }),
  athena: (text) => ({ model: '@cf/deepgram/aura-1', body: { text, speaker: 'athena', encoding: 'mp3' } }),
  melo: (text) => ({ model: '@cf/myshell-ai/melotts', body: { prompt: text, lang: 'en' } }),
};
// MeloTTS says MP3 but returns WAV.
const EXT = { pandora: 'mp3', athena: 'mp3', melo: 'wav' };
const TYPE = { mp3: 'audio/mpeg', wav: 'audio/wav' };

async function tts(voice, text) {
  const { model, body } = VOICES[voice](text);
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${model}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const type = res.headers.get('content-type') || '';
  if (type.includes('json')) {
    const data = await res.json();
    if (!data.success) throw new Error(`${voice} "${text}": ${JSON.stringify(data.errors).slice(0, 200)}`);
    return Buffer.from(data.result.audio, 'base64');
  }
  if (!res.ok) throw new Error(`${voice} "${text}": ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const dir = join(root, 'content/sounds/candidates');
const manifest = [];
for (const [sound, spellings] of SOUNDS) {
  mkdirSync(join(dir, sound), { recursive: true });
  const takes = [];
  for (const voice of Object.keys(VOICES)) {
    for (const [n, text] of spellings.entries()) {
      const key = `candidates/${sound}/${voice}-${n + 1}.${EXT[voice]}`;
      const file = join(root, 'content/sounds', key);
      if (!existsSync(file)) writeFileSync(file, await tts(voice, text));
      takes.push({ key, voice, text });
    }
  }
  manifest.push({ sound, takes });
  process.stdout.write(`${sound} `);
}
writeFileSync(join(root, 'content/sounds/candidates.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`\n${manifest.reduce((n, s) => n + s.takes.length, 0)} takes`);

// Upload: every take plus the manifest, under sounds/ in the pictures bucket.
const put = (key, file, type) => execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `yara-reads-pictures/sounds/${key}`,
  where, '--file', file, '--content-type', type], { stdio: 'ignore' });
put('candidates.json', join(root, 'content/sounds/candidates.json'), 'application/json');
for (const s of manifest) for (const t of s.takes) put(t.key, join(root, 'content/sounds', t.key), TYPE[t.key.split('.').pop()]);
console.log(`uploaded (${where})`);
