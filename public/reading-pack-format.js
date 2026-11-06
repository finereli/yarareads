// Reading Pack v1: a bounded, STORE-only ZIP. Shared by exporter and receiving reader.
// Files are read individually; neither endpoint needs the whole archive in memory.
export const PACK_FORMAT = 'phonix-reading-pack';
export const PACK_VERSION = 1;
export const PACK_LIMITS = Object.freeze({ archive: 512 * 1024 * 1024, asset: 16 * 1024 * 1024, manifest: 2 * 1024 * 1024, files: 10001, stories: 100, pages: 1000 });
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
export const packHash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof bytes === 'string' ? encoder.encode(bytes) : bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
export const pageFingerprint = text => packHash(String(text));
export const storyFingerprint = story => packHash(JSON.stringify(story.pages.map(page => page.text)));
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
export function crc32(bytes) { let n = 0xffffffff; for (const byte of bytes) n = CRC_TABLE[(n ^ byte) & 255] ^ (n >>> 8); return (n ^ 0xffffffff) >>> 0; }
const fail = message => { throw new Error(message); };
const text = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max;
const hash = value => /^[a-f0-9]{64}$/.test(value || '');
const only = (value, allowed) => { if (!value || typeof value !== 'object' || Object.keys(value).some(key => !allowed.includes(key))) fail('Unexpected Reading Pack field'); };
const kinds = new Set(['sound', 'word', 'page', 'timing']);
// The v1 recording catalog is part of the wire contract: unavailable sounds must be explicit.
export const PACK_SOUND_IDS = Object.freeze(['s','m','f','n','l','r','v','z','sh','th','dh','ng','t','p','k','b','d','g','h','j','w','y','ch','x','qu','a','e','i','o','u','oo-short','ai','ee','igh','oa','oo','ar','or','ur','ow','oi','ear','air','ure','ue']);
export function coverageOf(assets, missing) {
  const byKind = Object.fromEntries([...kinds].map(kind => [kind, { available: assets.filter(a => a.kind === kind).length, missing: missing.filter(a => a.kind === kind).length }]));
  return { available: assets.length, missing: missing.length, byKind };
}
// Validate complete containers/frames, rather than treating a metadata signature as audio.
const labelAt = (bytes, at, label) => [...label].every((letter, i) => bytes[at + i] === letter.charCodeAt(0));
function validWav(bytes) {
  if (bytes.length < 44 || !labelAt(bytes, 0, 'RIFF') || !labelAt(bytes, 8, 'WAVE')) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== bytes.length - 8) return false;
  let at = 12, format = null, data = false;
  while (at < bytes.length) {
    if (at + 8 > bytes.length) return false;
    const size = view.getUint32(at + 4, true), start = at + 8, end = start + size, padded = end + (size & 1);
    if (padded > bytes.length) return false;
    if (labelAt(bytes, at, 'fmt ')) {
      if (format || size < 16 || (size !== 16 && (size < 18 || view.getUint16(start + 16, true) !== size - 18))) return false;
      let encoding = view.getUint16(start, true);
      const channels = view.getUint16(start + 2, true), rate = view.getUint32(start + 4, true), byteRate = view.getUint32(start + 8, true), align = view.getUint16(start + 12, true), bits = view.getUint16(start + 14, true);
      if (encoding === 0xfffe) {
        // WAVE_FORMAT_EXTENSIBLE with a PCM or IEEE-float subtype GUID.
        if (size !== 40 || !view.getUint16(start + 18, true) || view.getUint16(start + 18, true) > bits || ![1, 3].includes(view.getUint32(start + 24, true)) || ![0,0,16,0,128,0,0,170,0,56,155,113].every((b,i) => bytes[start + 28 + i] === b)) return false;
        encoding = view.getUint32(start + 24, true);
      } else if (size > 18) return false;
      if (![1,3].includes(encoding) || !(encoding === 1 ? [8,16,24,32] : [32,64]).includes(bits) || !channels || !rate || align !== channels * bits / 8 || byteRate !== rate * align) return false;
      format = { align };
    } else if (labelAt(bytes, at, 'data')) {
      if (!format || data || !size || size % format.align) return false;
      data = true;
    }
    at = padded;
  }
  return Boolean(format && data);
}
function validMp3(bytes) {
  let at = 0, end = bytes.length;
  if (labelAt(bytes, 0, 'ID3')) {
    if (end < 10 || ![2,3,4].includes(bytes[3]) || bytes[4] === 255 || (bytes[5] & (bytes[3] === 2 ? 0x3f : bytes[3] === 3 ? 0x1f : 0x0f)) || bytes.subarray(6,10).some(b => b & 128)) return false;
    const size = bytes.subarray(6,10).reduce((n,b) => n * 128 + b, 0), footer = bytes[3] === 4 && (bytes[5] & 16) ? 10 : 0;
    at = 10 + size + footer;
    if (at > end || (footer && (!labelAt(bytes, at - 10, '3DI') || !bytes.subarray(3,10).every((b,i) => bytes[at - 7 + i] === b)))) return false;
  }
  if (end - at >= 128 && labelAt(bytes, end - 128, 'TAG')) end -= 128;
  let frames = 0, stream = null, reservoir = 0;
  while (at < end) {
    if (at + 4 > end || bytes[at] !== 255 || (bytes[at + 1] & 224) !== 224) return false;
    const version = (bytes[at + 1] >> 3) & 3, layer = (bytes[at + 1] >> 1) & 3, bitrateIndex = bytes[at + 2] >> 4, rateIndex = (bytes[at + 2] >> 2) & 3, channels = (bytes[at + 3] >> 6) === 3 ? 1 : 2;
    if (version === 1 || layer !== 1 || !bitrateIndex || bitrateIndex === 15 || rateIndex === 3 || (bytes[at + 3] & 3) === 2) return false;
    const rate = [44100,48000,32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4), bitrate = (version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bitrateIndex];
    const length = Math.floor((version === 3 ? 144000 : 72000) * bitrate / rate) + ((bytes[at + 2] >> 1) & 1), sideStart = at + 4 + ((bytes[at + 1] & 1) ? 0 : 2), sideLength = version === 3 ? (channels === 1 ? 17 : 32) : (channels === 1 ? 9 : 17);
    if (at + length > end || length <= sideStart - at + sideLength) return false;
    const identity = `${version}:${rate}:${channels}`;
    if (stream && stream !== identity) return false;
    stream = identity;
    const back = version === 3 ? (bytes[sideStart] << 1) | (bytes[sideStart + 1] >> 7) : bytes[sideStart];
    if (back > reservoir) return false;
    reservoir = Math.min(version === 3 ? 511 : 255, reservoir + length - (sideStart - at) - sideLength);
    at += length; frames++;
  }
  // Multiple complete consecutive frames rule out ID3-only and isolated sync/header probes.
  return frames >= 2;
}
export function mediaType(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > PACK_LIMITS.asset) return null;
  if (validWav(bytes)) return 'audio/wav';
  return validMp3(bytes) ? 'audio/mpeg' : null;
}
export function validateTiming(bytes, count) {
  let value; try { value = JSON.parse(decoder.decode(bytes)); only(value, ['renderVersion','duration','audioHash','timings']); if (Array.isArray(value.timings)) value.timings.forEach(t => only(t, ['start','end'])); } catch { return false; }
  if (!Number.isFinite(value.duration) || value.duration <= 0 || !Array.isArray(value.timings) || value.timings.length !== count || !hash(value.audioHash)) return false;
  let end = 0;
  return value.timings.every(t => { const valid = Number.isFinite(t?.start) && Number.isFinite(t?.end) && t.start >= end - 0.001 && t.end > t.start && t.end <= value.duration + 0.02; end = t?.end; return valid; });
}
export function packZipSize(manifest) {
  const metadata = encoder.encode(JSON.stringify(manifest)), files = [['manifest.json',metadata.length], ...new Map(manifest.assets.map(a => [a.path,a.size])).entries()];
  return 22 + files.reduce((size,[name,length]) => size + length + 76 + 2 * encoder.encode(name).length, 0);
}
export function validatePack(manifest) {
  only(manifest, ['format','version','id','createdAt','voice','stories','assets','missing','coverage']);
  only(manifest.voice, ['id','label','revision']);
  if (manifest?.format !== PACK_FORMAT || manifest.version !== PACK_VERSION) fail('Unsupported Reading Pack version');
  if (!text(manifest.id, 80) || !Number.isFinite(Date.parse(manifest.createdAt)) || !text(manifest.voice?.id, 80) || !text(manifest.voice?.label, 80) || !text(manifest.voice?.revision, 255)) fail('Invalid pack identity');
  if (!Array.isArray(manifest.stories) || !manifest.stories.length || manifest.stories.length > PACK_LIMITS.stories) fail('Invalid story selection');
  const stories = new Map(), expected = new Map(PACK_SOUND_IDS.map(sound => [`sound:${sound}`, { kind: 'sound', sound }])); let pageCount = 0;
  const expect = (id, descriptor) => {
    const existing = expected.get(id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(descriptor)) fail('Conflicting source word identity');
    expected.set(id, descriptor);
  };
  for (const story of manifest.stories) {
    only(story, ['id','title','fingerprint','pages']);
    if (!text(story.id, 100) || !text(story.title, 200) || !hash(story.fingerprint) || stories.has(story.id) || !Array.isArray(story.pages) || !story.pages.length) fail('Invalid source story');
    stories.set(story.id, story); pageCount += story.pages.length;
    for (const [index, page] of story.pages.entries()) {
      only(page, ['index','fingerprint','words']);
      if (page.index !== index || !hash(page.fingerprint) || !Array.isArray(page.words) || page.words.length > 2000) fail('Invalid source page');
      for (const word of page.words) {
        only(word, ['word','key','pronunciation']);
        if (!text(word.word, 40) || !text(word.key, 100) || (word.pronunciation != null && !/^p[a-f0-9]{20}$/.test(word.pronunciation))) fail('Invalid source word');
        expect(`word:${word.key}`, { kind: 'word', word: word.word, key: word.key, ...(word.pronunciation != null && { pronunciation: word.pronunciation }) });
      }
      for (const kind of ['page','timing']) expect(`${kind}:${story.id}:${index}`, { kind, storyId: story.id, page: index });
    }
  }
  if (pageCount > PACK_LIMITS.pages || !Array.isArray(manifest.assets) || !Array.isArray(manifest.missing) || manifest.assets.length + manifest.missing.length > PACK_LIMITS.files - 1) fail('Reading Pack exceeds limits');
  const ids = new Set(), paths = new Map(); let total = 0;
  const validDescriptor = item => {
    const descriptor = expected.get(item.id);
    if (!descriptor || ids.has(item.id) || ['kind','sound','word','key','pronunciation','storyId','page'].some(key => item[key] !== descriptor[key])) fail('Invalid or duplicate canonical asset identity');
    ids.add(item.id);
  };
  for (const asset of manifest.assets) {
    only(asset, ['id','kind','sound','word','key','pronunciation','storyId','page','path','sha256','size','crc32','contentType']);
    validDescriptor(asset);
    const extension = { 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'application/json': 'json' }[asset.contentType];
    if (!hash(asset.sha256) || !extension || asset.path !== `assets/${asset.sha256}.${extension}` || !Number.isInteger(asset.size) || asset.size <= 0 || asset.size > PACK_LIMITS.asset || !Number.isInteger(asset.crc32) || asset.crc32 < 0 || asset.crc32 > 0xffffffff || (asset.kind === 'timing') !== (asset.contentType === 'application/json')) fail('Invalid asset metadata');
    const existing = paths.get(asset.path); if (existing && JSON.stringify([existing.sha256, existing.size, existing.contentType, existing.crc32]) !== JSON.stringify([asset.sha256, asset.size, asset.contentType, asset.crc32])) fail('Conflicting asset path');
    if (!existing) total += asset.size; paths.set(asset.path, asset);
  }
  for (const missing of manifest.missing) { only(missing, ['id','kind','sound','word','key','pronunciation','storyId','page','reason']); validDescriptor(missing); if (!text(missing.reason, 100)) fail('Missing coverage needs a reason'); }
  if (ids.size !== expected.size) fail('Incomplete Reading Pack coverage: every sound, source word, page and timing needs an asset or missing entry');
  if (total > PACK_LIMITS.archive || encoder.encode(JSON.stringify(manifest)).length > PACK_LIMITS.manifest) fail('Reading Pack exceeds limits');
  only(manifest.coverage, ['available','missing','byKind']); only(manifest.coverage.byKind,[...kinds]);
  const expectedCoverage=coverageOf(manifest.assets,manifest.missing);
  if(manifest.coverage.available!==expectedCoverage.available || manifest.coverage.missing!==expectedCoverage.missing) fail('Coverage does not match assets');
  for(const kind of kinds){only(manifest.coverage.byKind[kind],['available','missing']);if(manifest.coverage.byKind[kind].available!==expectedCoverage.byKind[kind].available || manifest.coverage.byKind[kind].missing!==expectedCoverage.byKind[kind].missing)fail('Coverage does not match assets');}
  if (packZipSize(manifest) > PACK_LIMITS.archive) fail('Reading Pack archive exceeds limits');
  return manifest;
}
export async function verifyPackAsset(manifest, asset, bytes) {
  if (bytes.length !== asset.size || await packHash(bytes) !== asset.sha256 || crc32(bytes) !== asset.crc32) fail('Asset integrity check failed');
  if (asset.kind === 'timing') {
    if (!validateTiming(bytes, manifest.stories.find(s => s.id === asset.storyId).pages[asset.page].words.length)) fail('Invalid page timing');
    const receipt = JSON.parse(decoder.decode(bytes)), audio = manifest.assets.find(a => a.kind === 'page' && a.storyId === asset.storyId && a.page === asset.page);
    if (!audio || receipt.audioHash !== audio.sha256) fail('Timing does not match page audio');
  }
  else if (mediaType(bytes) !== asset.contentType) fail('Audio media type does not match bytes');
  return bytes;
}
const safeName = name => name === 'manifest.json' || /^assets\/[a-f0-9]{64}\.(?:mp3|wav|json)$/.test(name);
// Accept only our explicit v1 STORE layout. Compressed, encrypted, descriptor and ZIP64 variants are rejected.
export async function readPackZip(blob) {
  if (!blob || blob.size < 22 || blob.size > PACK_LIMITS.archive) fail('Reading Pack archive size is invalid');
  const tail = new Uint8Array(await blob.slice(-22).arrayBuffer()), end = new DataView(tail.buffer);
  if (end.getUint32(0, true) !== 0x06054b50 || end.getUint16(4, true) || end.getUint16(6, true) || end.getUint16(20, true)) fail('Unsupported ZIP layout');
  const count = end.getUint16(10, true), length = end.getUint32(12, true), start = end.getUint32(16, true);
  if (!count || count > PACK_LIMITS.files || count !== end.getUint16(8, true) || length > PACK_LIMITS.manifest || start + length !== blob.size - 22) fail('Invalid ZIP directory');
  const bytes = new Uint8Array(await blob.slice(start, start + length).arrayBuffer()), view = new DataView(bytes.buffer), entries = new Map(); let at = 0, expectedOffset = 0, total = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) fail('Invalid ZIP entry');
    const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true), crc = view.getUint32(at + 16, true), compressed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true), nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true), offset = view.getUint32(at + 42, true);
    if (at + 46 + nameLength + extra + comment > bytes.length || flags !== 0 || method !== 0 || compressed !== size || extra || comment || view.getUint16(at + 34, true) || view.getUint32(at + 38, true) || offset !== expectedOffset) fail('Unsupported or overlapping ZIP entry');
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (!safeName(name) || entries.has(name) || size <= 0 || size > (name === 'manifest.json' ? PACK_LIMITS.manifest : PACK_LIMITS.asset)) fail('Unsafe or oversized ZIP entry');
    const local = new Uint8Array(await blob.slice(offset, offset + 30 + nameLength).arrayBuffer()), head = new DataView(local.buffer);
    if (local.length !== 30 + nameLength || head.getUint32(0, true) !== 0x04034b50 || head.getUint16(6, true) !== flags || head.getUint16(8, true) !== method || head.getUint32(14, true) !== crc || head.getUint32(18, true) !== size || head.getUint32(22, true) !== size || head.getUint16(26, true) !== nameLength || head.getUint16(28, true) || decoder.decode(local.subarray(30)) !== name) fail('ZIP header mismatch');
    const dataOffset = offset + local.length; expectedOffset = dataOffset + size; if (expectedOffset > start) fail('Overlapping ZIP data'); total += size;
    entries.set(name, { name, size, crc32: crc, dataOffset }); at += 46 + nameLength;
  }
  if (at !== bytes.length || expectedOffset !== start || total > PACK_LIMITS.archive || !entries.has('manifest.json')) fail('Incomplete ZIP archive');
  const read = async name => { const entry = entries.get(name); if (!entry) fail('Missing archive entry'); const data = new Uint8Array(await blob.slice(entry.dataOffset, entry.dataOffset + entry.size).arrayBuffer()); if (crc32(data) !== entry.crc32) fail('ZIP checksum mismatch'); return data; };
  let manifest; try { manifest = validatePack(JSON.parse(decoder.decode(await read('manifest.json')))); } catch (error) { fail(`Invalid Reading Pack: ${error.message}`); }
  const expected = new Set(['manifest.json', ...manifest.assets.map(a => a.path)]); if (expected.size !== entries.size || [...expected].some(name => !entries.has(name))) fail('Archive files do not match manifest');
  for (const asset of manifest.assets) if (entries.get(asset.path).size !== asset.size || entries.get(asset.path).crc32 !== asset.crc32) fail('Asset directory does not match manifest');
  return { manifest, entries, read };
}
function header(length) { const bytes = new Uint8Array(length); return { bytes, view: new DataView(bytes.buffer) }; }
export function zipStream(entries) {
  let offset = 0; const central = [];
  async function* chunks() {
    for (const entry of entries) {
      if (!safeName(entry.name) || !Number.isInteger(entry.size) || entry.size <= 0) fail('Invalid ZIP output');
      const name = encoder.encode(entry.name), local = header(30 + name.length), v = local.view;
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint32(14, entry.crc32, true); v.setUint32(18, entry.size, true); v.setUint32(22, entry.size, true); v.setUint16(26, name.length, true); local.bytes.set(name, 30); yield local.bytes;
      const dir = header(46 + name.length), d = dir.view; d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint32(16, entry.crc32, true); d.setUint32(20, entry.size, true); d.setUint32(24, entry.size, true); d.setUint16(28, name.length, true); d.setUint32(42, offset, true); dir.bytes.set(name, 46); central.push(dir.bytes); offset += local.bytes.length + entry.size;
      const stream = await entry.open(), reader = stream.getReader(); let size = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > entry.size) fail('Snapshot asset changed'); yield next.value; } } finally { reader.releaseLock(); }
      if (size !== entry.size) fail('Snapshot asset missing');
    }
    const start = offset; for (const item of central) { yield item; offset += item.length; }
    const end = header(22), v = end.view; v.setUint32(0, 0x06054b50, true); v.setUint16(8, entries.length, true); v.setUint16(10, entries.length, true); v.setUint32(12, offset - start, true); v.setUint32(16, start, true); yield end.bytes;
  }
  const iterator = chunks(); return new ReadableStream({ async pull(controller) { try { const value = await iterator.next(); if (value.done) controller.close(); else controller.enqueue(value.value); } catch (error) { controller.error(error); } }, async cancel() { await iterator.return(); } });
}
