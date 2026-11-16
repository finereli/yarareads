// Makes the little words (LITTLE_WORDS) for the word voices ahead of time: each said after a lead-in and cut to the word
// (src/lead-in.js), stored in R2 as tts3/<voice>/<word>.wav, where /api/say looks first. Up to five takes per word;
// the first one Whisper hears as the word wins, else the first clean cut. Whisper is a rough judge of single words
// (it never hears Luna's "the" right), so listen to the results too.
//
//   node tools/lead-in.mjs [voice ...] [--local] [--only the,at]     (voices as in VOICES: luna mars; default both)
//
// Needs CLOUDFLARE_API_TOKEN (Workers AI) and wrangler (R2).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leadIn, lastWord } from '../src/lead-in.js';
import { LITTLE_WORDS } from '../public/phonics.js';

const ACCOUNT = '7485eb8ab648601f411b650cd794bce3';
const args = process.argv.slice(2);
const where = args.includes('--local') ? '--local' : '--remote';
const only = args.find((a) => a.startsWith('--only'))?.split('=')[1] ?? (args.includes('--only') ? args[args.indexOf('--only') + 1] : null);
const voices = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--only');
const words = only ? only.split(',') : LITTLE_WORDS;
const SAME = { to: ['too', 'two'], i: ['eye', 'aye'], onto: ['on to'], into: ['in to'] }; // what Whisper may write
const dir = mkdtempSync(join(tmpdir(), 'lead-in-'));

const run = (model, body) => fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${model}`, {
  method: 'POST', headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': body instanceof Uint8Array ? 'application/octet-stream' : 'application/json' },
  body: body instanceof Uint8Array ? body : JSON.stringify(body),
});
const heard = async (wav) => ((await (await run('@cf/openai/whisper', wav)).json()).result?.text || '').toLowerCase().replace(/[^a-z ]/g, '').trim();

async function make(voice, word) {
  let first = null;
  for (let take = 1; take <= 5; take++) {
    const res = await run('@cf/deepgram/aura-2-en', { text: leadIn(word), speaker: voice, encoding: 'linear16', container: 'wav' });
    const cut = lastWord(new Uint8Array(await res.arrayBuffer()));
    if (!cut) continue;
    first ||= cut;
    const h = await heard(cut);
    if ([word, ...(SAME[word] || [])].includes(h)) return { cut, note: `take ${take}, heard "${h}"` };
  }
  return first ? { cut: first, note: 'no take heard right: kept the first clean cut' } : null;
}

for (const voice of voices.length ? voices : ['luna', 'mars']) {
  const made = await Promise.all(words.map(async (word) => ({ word, ...(await make(voice, word)) })));
  for (const { word, cut, note } of made) {
    if (!cut) { console.log(`${voice} ${word}: no clean cut in 5 takes, stays as before`); continue; }
    const file = join(dir, `${voice}-${word}.wav`);
    writeFileSync(file, cut);
    execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `yara-reads-pictures/tts3/aura-2-${voice}/${encodeURIComponent(word)}.wav`,
      where, '--file', file, '--content-type', 'audio/wav'], { stdio: 'ignore' });
    console.log(`${voice} ${word}: ${note}`);
  }
}
console.log(`files kept in ${dir}`);
