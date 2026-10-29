// Recorded phonics sounds: slice a recording of the recording sheet into one file per sound. The sheet (claude.ai artifact
// "Yara Reads Sound Recording", https://claude.ai/artifact/6ugcAzsrpm9rbePAVRzGzA; American, 48 sounds since Oct 27: zh, aw and ts added,
// r sounds with their r; then 26 little words since Oct 29) is read top to bottom, usually as one file (`all`):
// each sound, a pause, its example word, a pause ("sss ... sun ... mmm ... map ..."). One file per part.
//
//   node tools/sounds-record.mjs <recording> <part 1-5 | all> [who] [--local]     (all: the whole sheet in one file)
//
// The recording is cut at its silences, each piece is transcribed (Whisper), and each example word is found in order;
// the sound is the piece just before it. Stray taps and noises at either end don't matter, and a fumbled sound said
// again is fine (the take just before the word wins). Each sound is trimmed, faded, levelled, encoded as MP3, and
// uploaded to R2 as sounds/recorded/<who>/<id>.mp3, its word as sounds/recorded/<who>/words/<word>.mp3.
// Local copies go to content/sounds/recorded/<who>/ (in git, public: Eli's call, Oct 23).
// Ids are the sound in lower-case ARPAbet-ish names (s, sh, th, dh, ng, ...).
// Part 5 (Oct 29) is little words with no sound before them ("the ... and ... up ..."): the AI voices can't say them
// alone (LITTLE_WORDS in phonics.js), so the word card plays these instead. Each goes to sounds/recorded/<who>/say/<word>.mp3.
import { execFileSync } from 'node:child_process';
import { LITTLE_WORDS } from '../public/phonics.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const ACCOUNT = '7485eb8ab648601f411b650cd794bce3';
export const PARTS = {
  1: [['s', 'sun'], ['m', 'map'], ['f', 'fan'], ['n', 'net'], ['l', 'leg'], ['r', 'rat'], ['v', 'van'], ['z', 'zip'],
    ['sh', 'ship'], ['zh', 'treasure'], ['th', 'thin'], ['dh', 'this'], ['ng', 'ring']],
  2: [['t', 'tap'], ['p', 'pan'], ['k', 'cat'], ['b', 'bat'], ['d', 'dog'], ['g', 'got'], ['h', 'hat'], ['j', 'jam'],
    ['w', 'wet'], ['y', 'yes'], ['ch', 'chip'], ['x', 'box'], ['ts', 'cats'], ['qu', 'queen']],
  3: [['a', 'ant'], ['e', 'egg'], ['i', 'ink'], ['o', 'on'], ['u', 'up'], ['oo-short', 'book']],
  4: [['ai', 'rain'], ['ee', 'see'], ['igh', 'night'], ['oa', 'boat'], ['oo', 'moon'], ['aw', 'saw'], ['ow', 'cow'], ['oi', 'coin'],
    ['ue', 'cue'], ['ar', 'car'], ['or', 'fork'], ['ur', 'fur'], ['ear', 'near'], ['air', 'hair'], ['ure', 'cure']],
  5: LITTLE_WORDS.map((word) => [null, word]), // a word on its own, no sound before it
};

const [file, partArg, whoArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const where = process.argv.includes('--local') ? '--local' : '--remote';
const who = whoArg || 'eli';
const part = partArg === 'all' ? Object.values(PARTS).flat() : PARTS[partArg];
const takes = (n) => (n ? 2 : 1); // a sound and its word, or a little word alone
if (!file || !part) {
  console.log('usage: node tools/sounds-record.mjs <recording> <part 1-5 | all> [who] [--local]');
  process.exit(1);
}

// Decode to 24 kHz mono 16-bit PCM.
const SR = 24000;
const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { maxBuffer: 1 << 30 });
const x = Float32Array.from(new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2), (v) => v / 32768);
const db = (a) => 20 * Math.log10(Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length) + 1e-9);

// Pieces: runs of 10 ms windows louder than -45 dBFS, joined across gaps under 250 ms, ignoring blips under 80 ms.
const W = SR / 100;
const loud = [];
for (let i = 0; i + W <= x.length; i += W) loud.push(db(x.subarray(i, i + W)) > -45);
const pieces = [];
let start = null, last = null;
loud.forEach((l, i) => {
  if (!l) return;
  if (start === null) start = i;
  else if (i - last > 25) { pieces.push([start, last]); start = i; }
  last = i;
});
if (start !== null) pieces.push([start, last]);
const kept = pieces.filter(([s, e]) => e - s >= 8).map(([s, e]) => [Math.max(0, (s - 5) * W), Math.min(x.length, (e + 8) * W)]);

const wav = (samples) => {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
};
async function whisper(samples) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/openai/whisper`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/octet-stream' }, body: wav(samples),
  });
  return ((await res.json()).result?.text || '').trim().toLowerCase().replace(/[^a-z ]/g, '');
}
const heard = [];
for (const [a, b] of kept) heard.push(await whisper(x.subarray(a, b)));

// Find each word in order (a close-enough transcript); its sound is the piece just before it.
const close = (said, word) => {
  const s = said.split(' ')[0] || '';
  if (s === word || s.startsWith(word) || word.startsWith(s) && s.length >= 2) return true;
  let same = 0; // letters in place, for Whisper's near misses ("shit" for ship, "vam" for van)
  for (let i = 0; i < Math.min(s.length, word.length); i++) same += s[i] === word[i];
  return same >= Math.max(2, word.length - 1);
};
const SAME = { to: ['too', 'two'], i: ['eye', 'aye'], onto: ['on to'], into: ['in to'] }; // what Whisper may write
// A clean take has exactly two pieces per sound (sound, word) and one per little word, so they simply pair up in order;
// Whisper is then only a check (it mishears single words: "yeah" for hat, "end" for ant). Otherwise, find each word to
// skip stray pieces.
const found = [];
if (kept.length === part.reduce((n, [id]) => n + takes(id), 0)) {
  let k = 0, agree = 0;
  for (const [id, word] of part) {
    if (id) found.push({ id, word, sound: kept[k], said: kept[k + 1] });
    else found.push({ word, said: kept[k] });
    k += takes(id);
    agree += close(heard[k - 1], word);
  }
  console.log(`${kept.length} pieces: paired in order (Whisper agrees on ${agree} of ${part.length} words)`);
}
let at = 0; // the first piece not used yet
for (const [id, word] of found.length ? [] : part) {
  let k = at + takes(id) - 1; // a sound needs a piece before its word
  // A little word must match exactly, and close by: "in" is close to "into", and these are short enough that a loose
  // match far ahead would throw off every word after it.
  const end = id ? kept.length : Math.min(kept.length, at + 3);
  const same = (said) => [word, ...(SAME[word] || [])].some((w) => said === w || said.split(' ')[0] === w);
  while (k < end && !(id ? close(heard[k], word) : same(heard[k]))) k++;
  if (k >= end && !id) { // a little word left out just stays with the AI voice (the app falls back)
    console.log(`couldn't find "${word}" after piece ${at + 1}: skipped`);
    at++; // it most likely took a piece of its own
    continue;
  }
  if (k >= kept.length) {
    console.log(heard.map((h, i) => `${i + 1}: ${(kept[i][1] - kept[i][0]) / SR}s "${h.slice(0, 40)}"`).join('\n'));
    throw new Error(`couldn't find "${word}" after piece ${at + 1}: check the list above`);
  }
  found.push(id ? { id, word, sound: kept[k - 1], said: kept[k] } : { word, said: kept[k] });
  at = k + 1;
}

// Level by how loud each sound *sounds*, matched to the word voice: K-weighted loudness (the ITU BS.1770 filters, as
// in LUFS) over the part where the sound is happening (50 ms windows within 20 dB of the loudest), set to -23, the
// median of Hyperion's words. Plain RMS over the whole clip (Oct 14-16) counted the silence around short sounds and
// ignored that hiss sounds louder than it measures: ch, x, s and sh came out ~5 dB louder than m, n and v. Peaks stay
// under -1 dBFS. Then fade 10 ms in and 40 ms out, high-pass, MP3.
const TARGET_LUFS = -23;
// Per-sound corrections on top of the LUFS level (dB). LUFS underrates broadband hiss, so Eli heard f, s and h as far too
// loud (Oct 16). These come from Zwicker loudness (ISO 532-1, the standard model of how loud a sound seems; N5 in sones,
// MoSQITo), bringing every sound to the recordings' median (z, which Eli said sounds right, barely moves), plus 2.5 dB
// off the unvoiced hisses (s sh f th h ch x) by ear: small speakers push their high end.
const ADJUST = { a: -1, ai: -1.5, air: -2, b: 3.5, ch: -4, d: 1, dh: 0.5, e: -1.5, ear: -1, ee: 2, f: -10.5, g: 2, h: -9, i: 1.5, igh: -0.5, j: -3.5, k: -2.5, l: 4, m: 3, n: 3, ng: 2.5, o: 2, oa: 0.5, oi: -0.5, oo: 2, 'oo-short': 3.5, or: 1, qu: 3, r: 4.5, s: -4, sh: -6.5, t: -1.5, th: -8.5, u: 1, ur: 0.5, v: -1.5, w: 2, x: -6, y: 1, z: -0.5 };
const biquad = (s, [b0, b1, b2], [a0, a1, a2]) => {
  const y = new Float32Array(s.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < s.length; i++) {
    const o = (b0 * s[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = s[i]; y2 = y1; y1 = o; y[i] = o;
  }
  return y;
};
function loudness(s) {
  const A = 10 ** (4 / 40), r = Math.sqrt(A);
  let w = 2 * Math.PI * 1500 / SR, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2;
  let k = biquad(s, [A * ((A + 1) + (A - 1) * c + 2 * r * al), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - 2 * r * al)],
    [(A + 1) - (A - 1) * c + 2 * r * al, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - 2 * r * al]);
  w = 2 * Math.PI * 38 / SR; c = Math.cos(w); al = Math.sin(w);
  k = biquad(k, [(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al]);
  const W = SR / 20, ms = [];
  for (let i = 0; i + W <= k.length; i += W / 2) ms.push(k.subarray(i, i + W).reduce((t, v) => t + v * v, 0) / W);
  const top = Math.max(...ms), keep = ms.filter((m) => m > top / 100);
  return -0.691 + 10 * Math.log10(keep.reduce((t, m) => t + m, 0) / keep.length + 1e-12);
}
const dir = join(root, 'content/sounds/recorded', who);
mkdirSync(join(dir, 'words'), { recursive: true });
mkdirSync(join(dir, 'say'), { recursive: true });
const clip = (a, b, out, adjust = 0) => {
  const s = Float32Array.from(x.subarray(a, b));
  const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const g = Math.min(10 ** ((TARGET_LUFS + adjust - loudness(s)) / 20), 10 ** ((-1 - 20 * Math.log10(peak + 1e-9)) / 20));
  const fi = SR / 100, fo = SR / 25;
  s.forEach((v, i) => (s[i] = v * g * Math.min(1, i / fi, (s.length - i) / fo)));
  const tmp = `${out}.wav`;
  writeFileSync(tmp, wav(s));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-af', 'highpass=f=70', '-c:a', 'libmp3lame', '-b:a', '64k', out]);
  execFileSync('rm', [tmp]);
};
// A little word is levelled like the AI voice's words (TARGET_LUFS), since it plays in their place.
const outFile = (f) => (f.id ? join('words', `${f.word}.mp3`) : join('say', `${f.word}.mp3`));
for (const f of found) {
  if (f.id) clip(...f.sound, join(dir, `${f.id}.mp3`), ADJUST[f.id] || 0);
  clip(...f.said, join(dir, outFile(f)));
  const [a, b] = f.sound || f.said;
  console.log(`${(f.id || '(word)').padEnd(9)} ${((b - a) / SR).toFixed(2)}s   word "${f.word}"`);
}

// Upload each sound and its example word to R2.
const put = (key, path, type) => execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `yara-reads-pictures/sounds/${key}`,
  where, '--file', path, '--content-type', type], { stdio: 'ignore' });
for (const f of found) {
  if (f.id) put(`recorded/${who}/${f.id}.mp3`, join(dir, `${f.id}.mp3`), 'audio/mpeg');
  put(`recorded/${who}/${outFile(f)}`, join(dir, outFile(f)), 'audio/mpeg');
}
console.log(`${found.length} sounds and words from part ${partArg} uploaded (${where})`);
