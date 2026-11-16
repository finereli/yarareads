// Little words said after a lead-in (Oct 30). Aura can't say "the" or "at" on their own (Luna's "the" came out as "yeah"
// or "duh", Mars's "at" as "that"), but it says them well at the end of a sentence. So we ask for "The word is: the."
// as 16-bit WAV and keep only the last word: everything after the last pause of 150 ms or more. Eli compared three
// lead-ins by ear ("This is the word:", "The word is:", "Say it with me.") and picked "The word is:".
// Shared by the worker and tools/lead-in.mjs (which makes them ahead of time).

export const leadIn = (word) => `The word is: ${word}.`;

// The PCM samples and sample rate of a WAV file, or null if it isn't one we understand.
function readWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let rate = 0, bits = 0, channels = 0;
  for (let o = 12; o + 8 <= bytes.length;) {
    const id = tag(o), size = v.getUint32(o + 4, true);
    if (id === 'fmt ') { channels = v.getUint16(o + 10, true); rate = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true); }
    if (id === 'data') {
      if (bits !== 16 || channels !== 1) return null;
      const n = Math.min(size, bytes.length - o - 8) >> 1;
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = v.getInt16(o + 8 + 2 * i, true) / 32768;
      return { x, rate };
    }
    o += 8 + size + (size & 1);
  }
  return null;
}

function writeWav(x, rate) {
  const out = new Uint8Array(44 + x.length * 2), v = new DataView(out.buffer);
  const tag = (o, s) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  tag(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); tag(36, 'data'); v.setUint32(40, x.length * 2, true);
  x.forEach((s, i) => v.setInt16(44 + 2 * i, Math.max(-32768, Math.min(32767, Math.round(s * 32767))), true));
  return out;
}

// The last word of a WAV, as a WAV, or null if there's no clear pause before it (then try another take).
// Loudness in 10 ms frames; a frame counts as quiet 25 dB under the loudest, not at a fixed level: Mars has a noisy floor.
// A stop's closure inside a word ("at") is shorter than 150 ms, so it doesn't count as the pause.
export function lastWord(bytes, { min = 120 } = {}) {
  const wav = readWav(bytes);
  if (!wav) return null;
  const { x, rate } = wav, W = Math.round(rate / 100), db = [];
  for (let i = 0; i + W <= x.length; i += W) {
    let s = 0;
    for (let j = i; j < i + W; j++) s += x[j] * x[j];
    db.push(10 * Math.log10(s / W + 1e-12));
  }
  const top = Math.max(...db), loud = db.map((d) => d > top - 25);
  const end = loud.lastIndexOf(true);
  let gap = 0, start = -1;
  for (let i = end; i >= 0; i--) {
    if (loud[i]) { if (gap >= 15) { start = i + gap + 1; break; } gap = 0; } else gap++;
  }
  if (start < 0) return null;
  const ms = (end - start + 1) * 10;
  if (ms < min || ms > 1200) return null; // not one word: the cut went wrong
  const a = Math.max(0, start - 4) * W, b = Math.min(x.length, (end + 6) * W); // 40 ms before, 60 ms after
  const y = x.slice(a, b), fi = Math.round(rate * 0.02), fo = Math.round(rate * 0.04);
  for (let i = 0; i < y.length; i++) y[i] *= Math.min(1, i / fi, (y.length - i) / fo);
  return writeWav(y, rate);
}
