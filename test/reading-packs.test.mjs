import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import { unstable_startWorker } from 'wrangler';
import { chromium } from 'playwright';
import { packWordAsset } from '../public/reading-packs.js';
import { packHash, crc32, storyFingerprint, pageFingerprint, coverageOf, readPackZip, zipStream, mediaType, validatePack, verifyPackAsset, PACK_SOUND_IDS } from '../public/reading-pack-format.js';
// Encoded 100 ms synthetic tone (no family voice), generated once with:
// ffmpeg -f lavfi -i sine=frequency=440:sample_rate=16000:duration=0.1 -ac 1 -codec:a libmp3lame -b:a 32k -write_xing 0 -map_metadata -1 -f mp3 tone.mp3
const mp3 = new Uint8Array(Buffer.from('SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYzLjEuMTAxAAAAAAAAAAAAAAD/80jEABx4jmwVWDAAJVr1TqnVOqdU6p13sTa+sIiYXIToaOATm2JzibSmgRgAWYLwKCMQciHJYTJgMBgMLJpg4CAIAg6Jwf5R050+c5fznL+7p92UBMHz6w+CAYlAGD75MEDmXf3cuD4Pg+HwQBAEAQAYPg+D4fBAEAQckTg+IAkggQBoEGBYHb5/mDIVAQH/80jEESCh9mwtnaAAnQyAPoOmIxPmuyVGDRVGxB6mEYvHDIwgYuCBoB4GGFgYpiCgsnAMliAaDF0NmC0YLQhSP+JREFRyhcwub/yZHNHNJoixFv/yZIqQEyIsRYx//y6XTIvF5Eul1L//8vF5Eul0GgqCrP/lgqGi3///9VqqIAI/v//eGAGgxHmBvgF3mA7/80jEERxAbiDBn/AAAMqYMCU+mU+m5xhmwKibhMDPggqwMUVNjzItIGMbwBIwLQAzDXTlMFoH0QgGGS8DgY6YBQYDAiihplYkVCIoQ25zPvVROopdt67c/XpbXoZ6WzV86L78qsr3TrW///dqCAAeImF4uFw3G4FAH/dvoSUZvpLDwLnTGQTnxEDBk2B4KFT/80jEIyVqdpm/mqAA0SkITRBEwN+vBRgLjDVweiLM8pls0MAbBICQAYHEEvnjcvpGgWdDIAuEMvCe/zRFNNJAnhlR8Go5xK/0FumpkD5FSUYniin/1umpkFumRUpIE8UVk6Ulf/qZBbuq25sYnTUyOGxiYnkjL//pCYCIjTJEbQC5fhYSeOY0lFHP0W0TVCn/80jEEBQAnkgfzzAASmioYuWE5S4xy+k5OmIxIcrmbCQCCqc0ijskQ0IgaUDUFToldDvKyvpiWJeo90ee/+s7etnCvX7OV6j3////6ExBTUU0LjBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=', 'base64'));
const root = new URL('..', import.meta.url).pathname;
const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const story = { id: 'pack-test-story', title: 'A cat', series: 'Test', number: 1, words: {a:[['AH0']],cat:[['K','AE1','T']]}, pages: [{ text: 'A cat.' }] };
let state, config, server, worker, issuer, privateKey, tokenA, tokenB, manifest, assetBytes, packId;
const q = value => `'${String(value).replace(/'/g, "''")}'`;
function cli(args) { return execFileSync(resolve(root, 'node_modules/.bin/wrangler'), args, { cwd: root, stdio: 'pipe', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' } }); }
const sql = command => cli(['d1', 'execute', 'yara-reads', '--local', '--persist-to', state, '-c', config, '--command', command, '--json']);
function token(sub) { const head = b64({ alg: 'ES256', kid: 'reading-pack-test' }), body = b64({ iss: issuer, aud: 'http://localhost:8787', sub, email: `${sub}@example.test`, email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 }); return `${head}.${body}.${sign('sha256', Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`; }
async function call(path, { method = 'GET', body, token = tokenA, headers = {} } = {}) {
  const binary = body instanceof Uint8Array;
  const res = await worker.fetch(`http://localhost:8787${path}`, { method, headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body != null && { 'content-type': binary ? 'application/octet-stream' : 'application/json' }), ...headers }, ...(body != null && { body: binary ? body : JSON.stringify(body) }) });
  return { status: res.status, headers: res.headers, data: (res.headers.get('content-type') || '').includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
}
function wav(frequency) { const bytes = new Uint8Array(3244), v = new DataView(bytes.buffer), label = (offset, str) => [...str].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0))); label(0, 'RIFF'); v.setUint32(4, bytes.length - 8, true); label(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); label(36, 'data'); v.setUint32(40, 3200, true); for (let n = 0; n < 1600; n++) v.setInt16(44 + 2 * n, Math.sin(n * frequency / 16000 * 2 * Math.PI) * 1000, true); return bytes; }
before(async () => {
  state = mkdtempSync(join(tmpdir(), 'yara-reading-pack-')); config = join(state, 'wrangler.json');
  const keys = generateKeyPairSync('ec', { namedCurve: 'P-256' }); privateKey = keys.privateKey;
  const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'reading-pack-test', alg: 'ES256', use: 'sig' };
  server = createServer((_request, response) => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [jwk] })));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); issuer = `http://127.0.0.1:${server.address().port}`;
  writeFileSync(config, JSON.stringify({ name: 'yara-reading-pack-test', main: resolve(root, 'src/worker.js'), compatibility_date: '2025-09-01', assets: { directory: resolve(root, 'public'), binding: 'ASSETS' }, d1_databases: [{ binding: 'DB', database_name: 'yara-reads', database_id: '00000000-0000-0000-0000-000000000001', migrations_dir: resolve(root, 'migrations') }], r2_buckets: [{ binding: 'PICTURES', bucket_name: 'reading-pack-test' }], vars: { LOGIN_ORIGIN: issuer, PUBLIC_HOST: 'public.example.test' } }));
  cli(['d1', 'migrations', 'apply', 'yara-reads', '--local', '--persist-to', state, '-c', config]);
  sql(`INSERT INTO stories(id,series,number,title,body,owner) VALUES(${q(story.id)},'Test',1,'A cat',${q(JSON.stringify(story))},NULL); INSERT INTO account_inventory(sub,body) VALUES('account-a','{"graphemes":[],"tricky":[],"names":[]}');`);
  worker = await unstable_startWorker({ config, dev: { server: { port: 0 }, inspector: false, persist: state, logLevel: 'error', watch: false } }); await worker.ready;
  tokenA = token('account-a'); tokenB = token('account-b'); assetBytes = new Map();
  const page = wav(440), audioHash = await packHash(page), timing = new TextEncoder().encode(JSON.stringify({ duration: 1, audioHash, timings: [{ start: 0, end: .2 }, { start: .3, end: .5 }] }));
  manifest = { format: 'phonix-reading-pack', version: 1, id: 'portable-test', createdAt: '2026-11-06T00:00:00Z', voice: { id: 'eli', label: 'Eli', revision: 'accepted-reference' }, stories: [{ id: story.id, title: story.title, fingerprint: await storyFingerprint(story), pages: [{ index: 0, fingerprint: await pageFingerprint(story.pages[0].text), words: [{ word: 'a', key: 'a' }, { word: 'cat', key: 'cat' }] }] }], assets: [], missing: PACK_SOUND_IDS.filter(sound => sound !== 's').map(sound => ({id:`sound:${sound}`,kind:'sound',sound,reason:'not_available'})) };
  for (const [descriptor, data, contentType] of [[{ id: 'sound:s', kind: 'sound', sound: 's' }, wav(220), 'audio/wav'], [{ id: 'word:a', kind: 'word', word: 'a', key: 'a' }, wav(330), 'audio/wav'], [{ id: 'word:cat', kind: 'word', word: 'cat', key: 'cat' }, wav(550), 'audio/wav'], [{ id: `page:${story.id}:0`, kind: 'page', storyId: story.id, page: 0 }, page, 'audio/wav'], [{ id: `timing:${story.id}:0`, kind: 'timing', storyId: story.id, page: 0 }, timing, 'application/json']]) {
    const sha256 = await packHash(data); assetBytes.set(sha256, data); manifest.assets.push({ ...descriptor, sha256, size: data.length, crc32: crc32(data), contentType, path: `assets/${sha256}.${contentType === 'application/json' ? 'json' : 'wav'}` });
  }
  manifest.coverage = coverageOf(manifest.assets, manifest.missing); packId = await packHash(JSON.stringify(manifest));
});
after(async () => { await worker?.dispose(); server?.close(); if (state) rmSync(state, { recursive: true, force: true }); });
test('import preview is signed in, reports exact content matching, and does not modify Stories or Inventory', async () => {
  assert.equal((await call('/api/reading-packs/preview', { method: 'POST', body: manifest, token: null })).status, 401);
  assert.equal((await worker.fetch('http://public.example.test/api/reading-packs',{headers:{authorization:`Bearer ${tokenA}`}})).status,401);
  const previewToken='yrp_reading_pack_test';sql(`INSERT INTO agent_tokens(hash,sub,label,kind,expires_at) VALUES('${await packHash(previewToken)}','account-a','test','preview',datetime('now','+1 hour'));`);
  assert.equal((await call('/api/reading-packs/preview',{method:'POST',body:manifest,token:previewToken})).status,403);
  const preview = await call('/api/reading-packs/preview', { method: 'POST', body: manifest }); assert.equal(preview.status, 200); assert.equal(preview.data.matches[0].matched, true);
  const mismatch = structuredClone(manifest); mismatch.stories[0].fingerprint = '0'.repeat(64);
  assert.equal((await call('/api/reading-packs/imports', { method: 'POST', body: mismatch })).status, 409);
  const forgedWords = structuredClone(manifest); forgedWords.stories[0].pages[0].words[0].word = 'cat';
  assert.equal((await call('/api/reading-packs/preview', { method: 'POST', body: forgedWords })).status, 400);
  assert.deepEqual((await call('/api/inventory')).data, { graphemes: [], tricky: [], names: [] });
  assert.deepEqual((await call(`/api/stories/${story.id}`)).data, story);
});
test('private import refuses metadata-only MP3 even when declared hashes and checksums match', async () => {
  const bad=structuredClone(manifest),bytes=mp3.subarray(0,10),sha256=await packHash(bytes);
  Object.assign(bad.assets[0],{sha256,size:bytes.length,crc32:crc32(bytes),contentType:'audio/mpeg',path:`assets/${sha256}.mp3`});
  const staged=await call('/api/reading-packs/imports',{method:'POST',body:bad});assert.equal(staged.status,201);
  assert.equal((await call(`/api/reading-packs/${staged.data.id}/assets/${sha256}`,{method:'PUT',body:bytes})).status,400);
  assert.equal((await call(`/api/reading-packs/${staged.data.id}/commit`,{method:'POST'})).status,409);
  assert.equal((await call(`/api/reading-packs/${staged.data.id}`,{method:'DELETE'})).status,200);
});
test('private staged assets require validated bytes and all receipts before atomic, idempotent import', async () => {
  const begin = await call('/api/reading-packs/imports', { method: 'POST', body: manifest }); assert.equal(begin.status, 201); assert.equal(begin.data.id, packId);
  const first = manifest.assets[0], assetPath = `/api/reading-packs/${packId}/assets/${first.sha256}`;
  assert.equal((await call(assetPath)).status, 404, 'staged audio is not readable');
  assert.equal((await call(assetPath, { method: 'PUT', body: assetBytes.get(first.sha256), token: tokenB })).status, 404);
  assert.equal((await call(assetPath, { method: 'PUT', body: new Uint8Array([1, 2]) })).status, 400);
  assert.equal((await call(`/api/reading-packs/${packId}/commit`, { method: 'POST' })).status, 409);
  for (const asset of manifest.assets) assert.equal((await call(`/api/reading-packs/${packId}/assets/${asset.sha256}`, { method: 'PUT', body: assetBytes.get(asset.sha256) })).status, 200);
  const committed = await call(`/api/reading-packs/${packId}/commit`, { method: 'POST' }); assert.equal(committed.status, 200); assert.equal(committed.data.status, 'ready');
  assert.equal((await call('/api/reading-packs/imports', { method: 'POST', body: manifest })).data.status, 'ready');
  assert.equal((await call(`/api/reading-packs/${packId}/commit`, { method: 'POST' })).data.repeated, true);
  const active = await call(`/api/reading-packs/for-story/${story.id}`); assert.equal(active.data.id, packId); assert.deepEqual(active.data.manifest, manifest);
  const audio = await call(assetPath); assert.deepEqual(audio.data, assetBytes.get(first.sha256)); assert.equal(audio.headers.get('cache-control'), 'private, no-store');
  assert.equal((await call(assetPath,{token:null,headers:{cookie:`yr_token=${tokenA}`}})).status,200);
  assert.equal((await call('/api/reading-packs/imports',{method:'POST',body:manifest,token:null,headers:{cookie:`yr_token=${tokenA}`}})).status,401);
  for (const token of [tokenB, null]) assert.ok([401, 404].includes((await call(assetPath, { token })).status));
  assert.equal((await call(`/api/sounds/private-reading-packs/${await packHash('account-a')}/${packId}/${first.sha256}`)).status, 404);
  assert.deepEqual((await call('/api/inventory')).data, { graphemes: [], tricky: [], names: [] });
});
test('signed-in grown-up ZIP preview, idempotent import and reader playback run in the real browser', async () => {
  const browser = await chromium.launch({headless:true}), page = await browser.newPage({viewport:{width:393,height:852}}), errors = [], externalAudio = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/\/api\/(say|sounds\/)/.test(request.url())) externalAudio.push(request.url()); });
  try {
    await page.addInitScript(({token}) => { localStorage.setItem('yr.login',JSON.stringify({token,user:{email:'account-a@example.test',name:'Test parent'},expiresAt:Date.now()+3600000,refreshedAt:Date.now()}));sessionStorage.setItem('grownUp','1'); },{token:tokenA});
    const url=String(await worker.url).replace(/\/$/,'');
    await page.goto(url+'/#/grownups/packs'); await page.getByRole('heading',{name:'Reading Packs',exact:true}).waitFor();
    const metadata=new TextEncoder().encode(JSON.stringify(manifest)), entries=[{name:'manifest.json',size:metadata.length,crc32:crc32(metadata),open:async()=>new Blob([metadata]).stream()},...manifest.assets.map(asset=>({name:asset.path,size:asset.size,crc32:asset.crc32,open:async()=>new Blob([assetBytes.get(asset.sha256)]).stream()}))];
    const archive=Buffer.from(await new Response(zipStream(entries)).arrayBuffer());
    await page.locator('[data-pack-file]').setInputFiles({name:'test-reading-pack.zip',mimeType:'application/zip',buffer:archive});
    await page.getByRole('button',{name:'Import private audio'}).waitFor(); assert.ok(await page.getByText('matches existing pages').count());
    if(process.env.READING_PACK_SCREENSHOTS){mkdirSync(process.env.READING_PACK_SCREENSHOTS,{recursive:true});await page.screenshot({path:join(process.env.READING_PACK_SCREENSHOTS,'phone-pack-preview.png'),fullPage:true});}
    await page.getByRole('button',{name:'Import private audio'}).click(); await page.getByText('Reading Pack imported. Matching Stories can use this voice.').waitFor();
    await page.goto(url+`/#/read/${story.id}/0`); await page.locator('.w[data-word="cat"]').click(); await page.locator('.pop').waitFor();
    assert.equal(await page.getByText('Eli Reading Pack',{exact:true}).count(),1);
    await page.locator('.pop [data-a=sound]').click(); await page.locator('.pop .chip').first().click(); await page.getByText('This phonics recording is missing from the Reading Pack',{exact:true}).waitFor();
    if(process.env.READING_PACK_SCREENSHOTS){await page.screenshot({path:join(process.env.READING_PACK_SCREENSHOTS,'phone-word-card.png'),fullPage:true});await page.setViewportSize({width:1024,height:768});await page.goto(url+'/#/grownups/packs');await page.getByRole('heading',{name:'Reading Packs',exact:true}).waitFor();await page.screenshot({path:join(process.env.READING_PACK_SCREENSHOTS,'tablet-packs.png'),fullPage:true});}
    assert.deepEqual(errors,[]); assert.deepEqual(externalAudio,[],'imported voice never silently falls back to global phonics or TTS');
  } finally {await browser.close();}
});
test('changed content detaches imported audio; account deletion removes private registry and objects', async () => {
  sql(`UPDATE stories SET body=${q(JSON.stringify({ ...story, pages: [{ text: 'A dog.' }] }))} WHERE id=${q(story.id)};`);
  assert.equal((await call(`/api/reading-packs/for-story/${story.id}`)).data, null);
  assert.equal((await call(`/api/reading-packs/${packId}`, { method: 'DELETE', token: tokenB })).status, 404);
  assert.equal((await call('/api/account', { method: 'DELETE' })).status, 200);
  assert.deepEqual((await call('/api/reading-packs')).data, []);
  assert.equal((await call(`/api/reading-packs/${packId}/assets/${manifest.assets[0].sha256}`)).status, 404);
});
test('portable STORE ZIP rejects corrupt files and unsafe paths without extraction', async () => {
  const data = new TextEncoder().encode(JSON.stringify(manifest)), entries = [{ name: 'manifest.json', size: data.length, crc32: crc32(data), open: async () => new Blob([data]).stream() }, ...manifest.assets.map(asset => ({ name: asset.path, size: asset.size, crc32: asset.crc32, open: async () => new Blob([assetBytes.get(asset.sha256)]).stream() }))];
  const archive = new Uint8Array(await new Response(zipStream(entries)).arrayBuffer()); assert.equal((await readPackZip(new Blob([archive]))).manifest.voice.label, 'Eli');
  archive[43] ^= 1; await assert.rejects(readPackZip(new Blob([archive])), /checksum/);
});

test('pronunciation-specific occurrence mapping never substitutes another reading of the same spelling', () => {
  const first='p'+'1'.repeat(20),second='p'+'2'.repeat(20),pack={id:'test',manifest:{stories:[{id:'homographs',pages:[{words:[{word:'read',key:first},{word:'read',key:second}]}]}],assets:[{kind:'word',word:'read',key:first,sha256:'first'},{kind:'word',word:'read',key:second,sha256:'second'}]}};
  assert.equal(packWordAsset(pack,'homographs',0,0,'read').sha256,'first');assert.equal(packWordAsset(pack,'homographs',0,1,'read').sha256,'second');assert.equal(packWordAsset(pack,'homographs',0,0,'reed'),null);
});

async function pack() {
  const hash = await packHash(mp3), manifest = { format: 'phonix-reading-pack', version: 1, id: 'export-test', createdAt: '2026-11-06T00:00:00Z', voice: { id: 'eli', label: 'Eli', revision: 'accepted' }, stories: [{ id: 'toby-1', title: 'Toby', fingerprint: await storyFingerprint({ pages: [{ text: 'A cat.' }] }), pages: [{ index: 0, fingerprint: await pageFingerprint('A cat.'), words: [{ word: 'a', key: 'a' }, { word: 'cat', key: 'cat' }] }] }], assets: [{ id: 'word:cat', kind: 'word', word: 'cat', key: 'cat', path: `assets/${hash}.mp3`, sha256: hash, size: mp3.length, crc32: crc32(mp3), contentType: 'audio/mpeg' }], missing: [{ id: 'word:a', kind: 'word', word: 'a', key: 'a', reason: 'not_available' }] };
  manifest.missing.push(...PACK_SOUND_IDS.map(sound => ({ id: `sound:${sound}`, kind: 'sound', sound, reason: 'not_available' })), ...['page','timing'].map(kind => ({ id: `${kind}:toby-1:0`, kind, storyId: 'toby-1', page: 0, reason: 'not_available' })));
  manifest.coverage = coverageOf(manifest.assets, manifest.missing); return manifest;
}

test('media validation requires complete MPEG frames and well-formed WAV chunks', async () => {
  assert.equal(mediaType(mp3), 'audio/mpeg');
  const tagSize = mp3.subarray(6,10).reduce((n,b) => n * 128 + b,0), audio = mp3.subarray(10 + tagSize);
  assert.equal(mediaType(audio), 'audio/mpeg', 'ID3 is optional');
  const tagged = new Uint8Array(audio.length + 128); tagged.set(audio); tagged.set(new TextEncoder().encode('TAG'),audio.length);
  assert.equal(mediaType(tagged), 'audio/mpeg', 'bounded ID3v1 footer is allowed');
  for (const invalid of [mp3.subarray(0,10),mp3.subarray(0,10 + tagSize),mp3.subarray(0,mp3.length - 1),audio.subarray(0,144),new Uint8Array([...mp3,0]),new Uint8Array([255,251,144,0,0,0,0,0,0,0])]) assert.equal(mediaType(invalid), null);
  for (const [offset,value] of [[6,128],[9,127],[10 + tagSize + 1,0],[10 + tagSize + 2,255],[10 + tagSize + 145,0]]) { const invalid=mp3.slice();invalid[offset]=value;assert.equal(mediaType(invalid),null); }
  const wav = new Uint8Array(48), view = new DataView(wav.buffer), label = (at,text) => wav.set(new TextEncoder().encode(text),at);
  label(0,'RIFF');view.setUint32(4,40,true);label(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,4,true);
  assert.equal(mediaType(wav),'audio/wav');
  // Unknown chunks are legal, including their mandatory odd-size pad byte.
  const padded=new Uint8Array(wav.length+10);padded.set(wav.subarray(0,36));padded.set(new TextEncoder().encode('JUNK'),36);padded[40]=1;padded[44]=7;padded.set(wav.subarray(36),46);new DataView(padded.buffer).setUint32(4,padded.length-8,true);assert.equal(mediaType(padded),'audio/wav');
  for (const [offset,value,size] of [[4,39,4],[28,123,4],[32,1,2],[34,7,2],[40,3,4],[16,17,4]]) {const invalid=wav.slice(),v=new DataView(invalid.buffer);size===4?v.setUint32(offset,value,true):v.setUint16(offset,value,true);assert.equal(mediaType(invalid),null);}
  const trailing=new Uint8Array([...wav,0]);new DataView(trailing.buffer).setUint32(4,trailing.length-8,true);assert.equal(mediaType(trailing),null);
  const incompletePad=padded.subarray(0,45).slice();new DataView(incompletePad.buffer).setUint32(4,incompletePad.length-8,true);assert.equal(mediaType(incompletePad),null);
  const invalidAsset=structuredClone((await pack()).assets[0]), invalidBytes=mp3.subarray(0,10+tagSize);Object.assign(invalidAsset,{sha256:await packHash(invalidBytes),size:invalidBytes.length,crc32:crc32(invalidBytes)});
  await assert.rejects(verifyPackAsset(await pack(),invalidAsset,invalidBytes),/media type/);
});
test('coverage accounts for every unique source word, page, timing and v1 phonics sound exactly once', async () => {
  const manifest=await pack();assert.equal(validatePack(manifest),manifest);assert.equal(PACK_SOUND_IDS.length,45);assert.equal(manifest.coverage.byKind.sound.missing,45);
  manifest.stories[0].pages[0].words.push({...manifest.stories[0].pages[0].words[1]});assert.equal(validatePack(manifest),manifest,'repeated occurrences share one word derivative');
  const check = (mutate,pattern=/coverage|identity/i) => {const broken=structuredClone(manifest);mutate(broken);broken.coverage=coverageOf(broken.assets,broken.missing);assert.throws(()=>validatePack(broken),pattern);};
  check(m=>{m.assets=[];m.missing=[];});
  for(const kind of ['word','page','timing','sound']) check(m=>{const at=m.missing.findIndex(item=>item.kind===kind);m.missing.splice(at,1);});
  for(const mutate of [
    m=>{m.assets[0].id='word:alias';},
    m=>{m.missing.push({...m.assets[0],id:'word:other',reason:'not_available'});delete m.missing.at(-1).path;delete m.missing.at(-1).sha256;delete m.missing.at(-1).size;delete m.missing.at(-1).crc32;delete m.missing.at(-1).contentType;},
    m=>{m.missing.find(item=>item.kind==='page').id='page:elsewhere:0';},
    m=>{m.missing.find(item=>item.kind==='timing').page=1;},
    m=>{m.missing.find(item=>item.kind==='sound').sound='invented';},
    m=>{m.assets[0].pronunciation='p'+'1'.repeat(20);},
    m=>{m.assets[0].storyId='toby-1';},
    m=>{m.stories[0].pages[0].words.push({word:'different',key:'cat'});},
  ]) check(mutate);
  const specific=structuredClone(manifest),pronunciation='p'+'1'.repeat(20);for(const word of specific.stories[0].pages[0].words)if(word.key==='cat'){word.key=pronunciation;word.pronunciation=pronunciation;}Object.assign(specific.assets[0],{id:`word:${pronunciation}`,key:pronunciation,pronunciation});assert.equal(validatePack(specific),specific);
});
