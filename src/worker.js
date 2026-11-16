// API for Yara Reads. Static files are served from public/; everything under /api/ lands here.

import publicInventory from '../content/inventory.json';
import { verifyLoginToken } from './verify-login.js';
import { handleMcp, sha256 } from './mcp.js';
import { oauthRoute, listClients, revoke } from './mcp-auth.js';
import { leadIn, lastWord } from './lead-in.js';
import { LITTLE_WORDS } from '../public/phonics.js';

// Tokens from login.finereli.com are made for one origin; these are ours (wrangler dev serves on 8787).
const AUDIENCE = ['https://yarareads.finereli.com', 'http://localhost:8787'];
// What existed before accounts is held by this account, until env.FAMILY_EMAIL (a secret: Yara's Google account) first
// signs in and adopts it. Its books, inventory, settings and progress then belong to her.
const FAMILY = 'family';
const INVENTORY_SEED = () => { const { _note, ...inv } = publicInventory; return { ...inv, names: [] }; };

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...init.headers } });

function cookie(request, name) {
  const match = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match && match[1];
}

// Voices for words, from Cloudflare Workers AI. Ids are "<model>:<speaker>"; the grown-ups Voice tab lists these.
// Aura is Deepgram's (mp3); MeloTTS returns base64 WAV in JSON.
const VOICES = {
  'aura-2:luna': { model: '@cf/deepgram/aura-2-en', speaker: 'luna', label: 'Luna', about: 'American woman' },
  'aura-2:asteria': { model: '@cf/deepgram/aura-2-en', speaker: 'asteria', label: 'Asteria', about: 'American woman' },
  'aura-2:arcas': { model: '@cf/deepgram/aura-2-en', speaker: 'arcas', label: 'Arcas', about: 'American man' },
  'aura-2:aries': { model: '@cf/deepgram/aura-2-en', speaker: 'aries', label: 'Aries', about: 'American man' },
  'aura-2:hermes': { model: '@cf/deepgram/aura-2-en', speaker: 'hermes', label: 'Hermes', about: 'American man' },
  'aura-2:jupiter': { model: '@cf/deepgram/aura-2-en', speaker: 'jupiter', label: 'Jupiter', about: 'American man' },
  'aura-2:mars': { model: '@cf/deepgram/aura-2-en', speaker: 'mars', label: 'Mars', about: 'American man' },
  'aura-2:orion': { model: '@cf/deepgram/aura-2-en', speaker: 'orion', label: 'Orion', about: 'American man' },
  'aura-2:orpheus': { model: '@cf/deepgram/aura-2-en', speaker: 'orpheus', label: 'Orpheus', about: 'American man' },
  'aura-2:saturn': { model: '@cf/deepgram/aura-2-en', speaker: 'saturn', label: 'Saturn', about: 'American man' },
};
const DEFAULT_VOICE = 'aura-2:luna'; // Eli's pick (Oct 23; Hyperion before)

// Say one word in a voice: from the R2 cache (tts2/<voice>/<word>.<ext>), or generated once and stored.
// The word goes in as a sentence ("playing."): as a bare word Aura stops mid-sound and clips the end
// (Hyperion's "playing" ended at full volume, mid "ng"); with the full stop it fades out naturally.
// tts/ holds the old, sometimes clipped bare-word audio; tts2/ is the fixed set.
// Little words ("the", "at": LITTLE_WORDS) are said after a lead-in and cut to the word (lead-in.js), as WAV under tts3/.
// tools/lead-in.mjs makes them ahead of time, choosing among takes; this makes one the first time it's asked for.
const LITTLE = new Set(LITTLE_WORDS);
const littleKey = (voiceId, word) => `tts3/${voiceId.replace(':', '-')}/${encodeURIComponent(word)}.wav`;
async function sayLittle(env, voiceId, word) {
  const key = littleKey(voiceId, word);
  const cached = await env.PICTURES.get(key);
  if (cached) return { body: cached.body, type: 'audio/wav' };
  const voice = VOICES[voiceId];
  for (let take = 0; take < 3; take++) {
    const out = await env.AI.run(voice.model, { text: leadIn(word), speaker: voice.speaker, encoding: 'linear16', container: 'wav' });
    const bytes = new Uint8Array(out instanceof ReadableStream ? await new Response(out).arrayBuffer() : out);
    const cut = lastWord(bytes);
    if (!cut) continue; // no clear pause before the word: another take
    await env.PICTURES.put(key, cut, { httpMetadata: { contentType: 'audio/wav' } });
    return { body: cut, type: 'audio/wav' };
  }
  return null; // said on its own, as before
}

async function sayWord(env, voiceId, word) {
  if (LITTLE.has(word) && VOICES[voiceId].speaker) {
    const little = await sayLittle(env, voiceId, word);
    if (little) return little;
  }
  const voice = VOICES[voiceId];
  const ext = 'mp3';
  const type = 'audio/mpeg';
  const key = `tts2/${voiceId.replace(':', '-')}/${encodeURIComponent(word)}.${ext}`;
  const cached = await env.PICTURES.get(key);
  if (cached) return { body: cached.body, type };
  const out = voice.speaker
    ? await env.AI.run(voice.model, { text: `${word}.`, speaker: voice.speaker, encoding: 'mp3' })
    : await env.AI.run(voice.model, { prompt: `${word}.`, lang: 'en' });
  let bytes;
  if (out instanceof ReadableStream) bytes = await new Response(out).arrayBuffer();
  else if (out?.audio) bytes = Uint8Array.from(atob(out.audio), (c) => c.charCodeAt(0));
  else bytes = out;
  await env.PICTURES.put(key, bytes, { httpMetadata: { contentType: type } });
  return { body: bytes, type };
}

// The public site: the same app on another hostname (env.PUBLIC_HOST), with no sign-in. It only ever shows our
// own stories, never books from home (other people's books), and never touches Yara's data: her inventory,
// settings and events need a sign-in. Parents keep their child's sounds and progress on their own device.
const isPublic = (url, env) => !!env.PUBLIC_HOST && url.hostname === env.PUBLIC_HOST;
// Ours: not a book from home, and not a book an account's own agent added (those have an owner).
const OUR_STORIES = "coalesce(json_extract(body, '$.kind'), 'story') != 'book' AND owner IS NULL";

async function setting(env, sub, key, fallback) {
  const row = await env.DB.prepare('SELECT value FROM account_settings WHERE sub = ? AND key = ?').bind(sub, key).first();
  return row ? row.value : fallback;
}

// A page picture from R2. Stories link pictures as <key>?v=<content hash>, so a versioned URL never changes and can be
// kept for good; an unversioned request (an old copy of the app) revalidates every time.
// ?w=640 or ?w=1600 asks for a copy at most that wide (never enlarged), as WebP (JPEG for a browser that can't take WebP),
// made once by the Images binding and kept in R2 under sized/<g>/<width>/<key>.<etag of the original>, so replacing a picture
// makes a new copy, and bumping PICTURE_GEN (app.js, sent as ?g=) remakes them all. Pictures can arrive at any size (agents upload their own), so the app asks for what it shows:
// 1600 on a page (a 10.9" iPad in portrait shows the picture about 1560 pixels wide; ours are 1024 and stay so),
// 640 for a cover in the library (about 250 points wide at 2x).
const PICTURE_WIDTHS = [640, 1600];
// D1 and R2 live in eastern North America and the worker runs at the edge near the reader (Sofia for Eli, ~130 ms
// each way), so every storage call on this path costs a round trip (Oct 23: a new picture took ~1.75 s). Sized copies
// are keyed by the picture's version (v, the file hash push.mjs puts in its URL), so there's no lookup of the original
// first; push.mjs makes them ahead of time; and copies are stored after the response, not before it.
async function servePicture(env, request, key, url, scope, ctx) {
  const cacheControl = url.searchParams.has('v') ? `${scope}, max-age=31536000, immutable` : `${scope}, no-cache`;
  const width = Number(url.searchParams.get('w'));
  if (PICTURE_WIDTHS.includes(width) && env.IMAGES) {
    const webp = /image\/webp/.test(request.headers.get('accept') || '');
    let type = webp ? 'image/webp' : 'image/jpeg';
    // Cloudflare's edge cache in front of R2 (per data centre; the sign-in check before this still runs every time).
    // Keyed by the URL's v and g, so a redrawn picture or a PICTURE_GEN bump misses it.
    const edgeKey = new Request(`${url.origin}/__edge/${key}?v=${url.searchParams.get('v')}&w=${width}&g=${url.searchParams.get('g')}&${webp ? 'webp' : 'jpg'}`);
    const edge = url.searchParams.has('v') && (await caches.default.match(edgeKey).catch(() => null));
    if (edge) return new Response(edge.body, { headers: { 'content-type': edge.headers.get('content-type'), 'cache-control': cacheControl, etag: edge.headers.get('etag') || '', vary: 'accept' } });
    const gen = (url.searchParams.get('g') || '0').replace(/\D/g, '').slice(0, 4) || '0'; // PICTURE_GEN in app.js
    const v = (url.searchParams.get('v') || '').replace(/\W/g, '').slice(0, 20);
    const version = v || (await env.PICTURES.head(key))?.etag; // an unversioned URL (rare) costs one more lookup
    if (!version) return json({ error: 'not found' }, { status: 404 });
    const sizedKey = `sized/${gen}/${width}/${key}.${version}.${webp ? 'webp' : 'jpg'}`;
    let bytes;
    const sized = await env.PICTURES.get(sizedKey);
    if (sized) {
      type = sized.httpMetadata?.contentType || type;
      bytes = await sized.arrayBuffer();
    } else {
      const source = await env.PICTURES.get(key);
      if (!source) return json({ error: 'not found' }, { status: 404 });
      const original = await source.arrayBuffer();
      try {
        const out = await env.IMAGES.input(new Response(original).body).transform({ width, fit: 'scale-down' }).output({ format: type, quality: 78 });
        bytes = await out.response().arrayBuffer();
      } catch (e) {
        console.log('picture resize failed', key, e.message);
      }
      if (!bytes || bytes.byteLength >= original.byteLength) { // already small (or no resize): the original, same type
        bytes = original;
        type = source.httpMetadata?.contentType || 'image/jpeg';
      }
      ctx.waitUntil(env.PICTURES.put(sizedKey, bytes, { httpMetadata: { contentType: type } }));
    }
    const etag = `"${width}-${version}"`;
    if (url.searchParams.has('v')) ctx.waitUntil(caches.default.put(edgeKey, new Response(bytes, { headers: { 'content-type': type, etag, 'cache-control': 'public, max-age=2592000' } })).catch(() => {}));
    return new Response(bytes, { headers: { 'content-type': type, 'cache-control': cacheControl, etag, vary: 'accept' } });
  }
  const obj = await env.PICTURES.get(key);
  if (!obj) return json({ error: 'not found' }, { status: 404 });
  return new Response(obj.body, {
    headers: { 'content-type': obj.httpMetadata?.contentType || 'image/jpeg', 'cache-control': cacheControl, etag: obj.httpEtag },
  });
}

// Who is asking. The app sends the Google sign-in token from login.finereli.com as a Bearer header. Page pictures are
// plain <img> requests, which can't carry a header, so the same token also sits in a cookie (POST /api/session), honoured
// for reads only. A preview token (made by an agent's preview_url) is a one-hour read-only view of an account.
// env.LOGIN_ORIGIN points tests at a local key server. Returns { sub, email, name, readOnly? } or null.
const loginOptions = (env) => ({ audience: AUDIENCE, ...(env.LOGIN_ORIGIN && { issuer: env.LOGIN_ORIGIN }) });

async function tokenAccount(token, env) {
  if (token.startsWith('yrp_')) {
    const row = await env.DB.prepare("SELECT sub FROM agent_tokens WHERE hash = ? AND kind = 'preview' AND expires_at > datetime('now')")
      .bind(await sha256(token)).first();
    return row && { sub: row.sub, email: 'preview', name: 'preview', readOnly: true };
  }
  const claims = await verifyLoginToken(token, loginOptions(env));
  if (!claims) return null;
  if (env.FAMILY_EMAIL && claims.email_verified && claims.email.toLowerCase() === env.FAMILY_EMAIL.toLowerCase()) {
    await adoptFamily(env, claims.sub);
  }
  return { sub: claims.sub, email: claims.email, name: claims.name };
}

async function account(request, env) {
  const bearer = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (bearer) return tokenAccount(bearer, env);
  const reads = request.method === 'GET' || request.method === 'HEAD';
  const token = reads && cookie(request, 'yr_token');
  return token ? tokenAccount(token, env) : null;
}

// Hand what existed before accounts to this account. Safe to run twice at once (the app makes several requests at
// startup): each step copies from 'family' and then empties it, in one transaction, so the second run finds nothing.
async function adoptFamily(env, sub) {
  if (!(await env.DB.prepare('SELECT 1 FROM account_inventory WHERE sub = ?').bind(FAMILY).first())) return;
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO account_inventory (sub, body, updated_at) SELECT ?, body, updated_at FROM account_inventory WHERE sub = ?').bind(sub, FAMILY),
    env.DB.prepare('DELETE FROM account_inventory WHERE sub = ?').bind(FAMILY),
    env.DB.prepare('INSERT OR REPLACE INTO account_settings (sub, key, value, updated_at) SELECT ?, key, value, updated_at FROM account_settings WHERE sub = ?').bind(sub, FAMILY),
    env.DB.prepare('DELETE FROM account_settings WHERE sub = ?').bind(FAMILY),
    env.DB.prepare('UPDATE events SET sub = ? WHERE sub = ?').bind(sub, FAMILY),
    env.DB.prepare('UPDATE stories SET owner = ? WHERE owner = ?').bind(sub, FAMILY),
  ]);
}

// A story this account may see: the shared library, or its own books.
// An account sees our stories (no owner), its own books, and books shared with it (story_readers). Binds sub twice.
const VISIBLE = '(owner IS NULL OR owner = ? OR id IN (SELECT story_id FROM story_readers WHERE sub = ?))';

// The public site's API: the reader's routes, limited to our stories. Everything else (grown-ups' tools,
// Yara's settings and progress) is refused.
async function publicApi(request, env, url, path, ctx) {
  const get = request.method === 'GET';
  if (path === '/api/stories' && get) {
    const { results } = await env.DB.prepare(
      `SELECT id, series, number, title, json_extract(body, '$.cover') AS cover,
         json_extract(body, '$.coverImage') AS coverImage, 'story' AS kind, 0 AS finished
       FROM stories WHERE ${OUR_STORIES} ORDER BY series, number`,
    ).all();
    return json(results);
  }
  const storyMatch = path.match(/^\/api\/stories\/([\w-]+)$/);
  if (storyMatch && get) {
    const row = await env.DB.prepare(`SELECT body FROM stories WHERE id = ? AND ${OUR_STORIES}`).bind(storyMatch[1]).first();
    if (!row) return json({ error: 'not found' }, { status: 404 });
    return new Response(row.body, { headers: { 'content-type': 'application/json' } });
  }
  // Only pictures that one of our stories uses.
  const picture = path.match(/^\/api\/pictures\/([\w-]+\/[\w.-]+)$/);
  if (picture && get) {
    const used = await env.DB.prepare(`SELECT 1 FROM stories WHERE ${OUR_STORIES} AND instr(body, ?) > 0 LIMIT 1`)
      .bind(`"${picture[1]}`).first();
    if (!used) return json({ error: 'not found' }, { status: 404 });
    return servePicture(env, request, picture[1], url, 'public', ctx);
  }
  // The phonics sounds the tiles play (Eli's recordings; he chose to share them, Oct 16). Only those: not the
  // AI takes, nor the example words recorded with them. Also the little words recorded for the word card (say/).
  const recorded = path.match(/^\/api\/sounds\/(recorded\/[a-z]+\/(?:say\/)?[a-z-]+\.mp3)$/);
  if (recorded && get) {
    const obj = await env.PICTURES.get(`sounds/${recorded[1]}`);
    if (!obj) return json({ error: 'not found' }, { status: 404 });
    return new Response(obj.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=3600' } });
  }
  // Words already made for the books, in the chosen voice. Never generates new audio (that costs money);
  // a missing word falls back to the browser's voice.
  if (path === '/api/say' && get) {
    const word = (url.searchParams.get('word') || '').toLowerCase().replace(/[^a-z' -]/g, '').trim().slice(0, 40);
    const voiceId = DEFAULT_VOICE;
    const little = word && LITTLE.has(word) && (await env.PICTURES.get(littleKey(voiceId, word)));
    if (little) return new Response(little.body, { headers: { 'content-type': 'audio/wav', 'cache-control': 'public, max-age=86400' } });
    const obj = word && (await env.PICTURES.get(`tts2/${voiceId.replace(':', '-')}/${encodeURIComponent(word)}.mp3`));
    if (!obj) return json({ error: 'not ready' }, { status: 404 });
    return new Response(obj.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=86400' } });
  }
  if (path === '/api/settings' && get) {
    return json({ voice: DEFAULT_VOICE, voices: {}, public: true });
  }
  // The starting sounds: Teach Your Monster to Read's, which the stories are written for. Edits stay on the device.
  if (path === '/api/inventory' && get) {
    const { _note, ...inv } = publicInventory;
    return json({ ...inv, names: [] });
  }
  if (path === '/api/events' && request.method === 'POST') {
    const e = await request.json().catch(() => ({}));
    if (['open', 'page', 'finish'].includes(e.type)) {
      const source = typeof e.from === 'string' && /^[a-z]{1,20}$/.test(e.from) ? e.from : null; // ?from= on the first visit
      await env.DB.prepare('INSERT INTO public_events (type, story_id, page, source) VALUES (?, ?, ?, ?)')
        .bind(e.type, typeof e.storyId === 'string' ? e.storyId.slice(0, 40) : null, Number.isInteger(e.page) ? e.page : null, source).run();
    }
    return json({ ok: true });
  }
  return json({ error: 'not on the public site' }, { status: 403 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const pub = isPublic(url, env);

    // Crawlers: indexable once env.PUBLIC_INDEX is '1' (the signed-out app is the public site), except the API and the agent endpoints.
    const indexable = env.PUBLIC_INDEX === '1';
    if (path === '/robots.txt') {
      return new Response(indexable ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /oauth/\nDisallow: /mcp\n\nSitemap: https://${url.hostname}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n',
        { headers: { 'content-type': 'text/plain' } });
    }
    if (path === '/sitemap.xml') {
      if (!indexable) return new Response('Not found', { status: 404 });
      const loc = (p) => `<url><loc>https://${url.hostname}${p}</loc></url>`;
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${
        ['/about', '/privacy', '/terms', '/', '/llms.txt'].map(loc).join('')}</urlset>\n`, { headers: { 'content-type': 'application/xml' } });
    }

    // An agent's connection (MCP) and the OAuth that lets a parent approve it; see src/mcp.js and src/mcp-auth.js.
    const oauth = await oauthRoute(request, env, url, AUDIENCE);
    if (oauth) return oauth;
    if (path === '/mcp') return handleMcp(request, env, url, { seed: INVENTORY_SEED });

    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (pub) {
      return publicApi(request, env, url, path, ctx);
    }

    // Sign-in leaves its token in a cookie too, for pictures. Signing out clears it.
    if (path === '/api/session') {
      const base = 'Path=/; HttpOnly; Secure; SameSite=Lax';
      if (request.method === 'DELETE') return json({ ok: true }, { headers: { 'set-cookie': `yr_token=; Max-Age=0; ${base}` } });
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
      if (request.method !== 'POST' || !token || !(await tokenAccount(token, env))) return json({ error: 'sign in' }, { status: 401 });
      // A sign-in token is a JWT that says when it ends; a preview token lasts an hour at most.
      const exp = token.startsWith('yrp_') ? 3600 : Math.max(0, JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp - Math.floor(Date.now() / 1000));
      return json({ ok: true }, { headers: { 'set-cookie': `yr_token=${token}; Max-Age=${exp}; ${base}` } });
    }

    const who = await account(request, env);
    // Not signed in: the free version, the same as the public site (our own books; progress stays on the device).
    if (!who) return publicApi(request, env, url, path, ctx);
    const sub = who.sub;
    // A preview looks and nothing else: no saving, and it leaves no reading history.
    if (who.readOnly && request.method !== 'GET') {
      return path === '/api/events' ? json({ ok: true }) : json({ error: 'preview is read-only' }, { status: 403 });
    }

    if (path === '/api/stories' && request.method === 'GET') {
      await env.DB.prepare(
        'INSERT INTO accounts (sub, email, name) VALUES (?, ?, ?) ON CONFLICT (sub) DO UPDATE SET email = excluded.email, name = excluded.name, seen_at = CURRENT_TIMESTAMP',
      ).bind(sub, who.email, who.name ?? null).run();
      const { results: stories } = await env.DB.prepare(
        `SELECT id, series, number, title, json_extract(body, '$.cover') AS cover,
           json_extract(body, '$.coverImage') AS coverImage, coalesce(json_extract(body, '$.kind'), 'story') AS kind,
           json_extract(body, '$.bookSeries') AS bookSeries, json_extract(body, '$.bookNumber') AS bookNumber,
           (SELECT json_group_array(key) FROM json_each(body, '$.pages') WHERE json_extract(value, '$.chapter') IS NOT NULL) AS chapters
         FROM stories WHERE ${VISIBLE} ORDER BY kind = 'book', series, number`,
      ).bind(sub, sub).all();
      const { results: done } = await env.DB.prepare(
        "SELECT story_id, COUNT(*) AS times FROM events WHERE type = 'finish' AND sub = ? GROUP BY story_id",
      ).bind(sub).all();
      const times = Object.fromEntries(done.map((d) => [d.story_id, d.times]));
      // Where to pick a book up again: the page of the latest page event, unless the latest event is finishing it.
      // Finishing a chapter ('chapter', its page is where the next one starts) picks up at the next chapter.
      const { results: last } = await env.DB.prepare(
        `SELECT story_id, type, page FROM events WHERE sub = ? AND type IN ('page', 'chapter', 'finish')
           AND id IN (SELECT MAX(id) FROM events WHERE sub = ? AND type IN ('page', 'chapter', 'finish') GROUP BY story_id)`,
      ).bind(sub, sub).all();
      const spot = Object.fromEntries(last.filter((l) => l.type !== 'finish' && l.page > 0).map((l) => [l.story_id, l.page]));
      // chapters: the page each chapter starts on, for a book in chapters (null otherwise)
      return json(stories.map(({ chapters, ...s }) => ({ ...s, chapters: JSON.parse(chapters || '[]').length ? JSON.parse(chapters) : null,
        finished: times[s.id] || 0, spot: spot[s.id] || 0 })));
    }

    const storyMatch = path.match(/^\/api\/stories\/([\w-]+)$/);
    if (storyMatch && request.method === 'GET') {
      const row = await env.DB.prepare(`SELECT body FROM stories WHERE id = ? AND ${VISIBLE}`).bind(storyMatch[1], sub, sub).first();
      if (!row) return json({ error: 'not found' }, { status: 404 });
      return new Response(row.body, { headers: { 'content-type': 'application/json' } });
    }

    // Page pictures live in R2, behind sign-in: some are scans of books we own, so only a picture used by a story
    // this account can see is served.
    const picture = path.match(/^\/api\/pictures\/([\w-]+\/[\w.-]+)$/);
    if (picture && request.method === 'GET') {
      const used = await env.DB.prepare(`SELECT 1 FROM stories WHERE ${VISIBLE} AND instr(body, ?) > 0 LIMIT 1`)
        .bind(sub, sub, `"${picture[1]}`).first();
      if (!used) return json({ error: 'not found' }, { status: 404 });
      return servePicture(env, request, picture[1], url, 'private', ctx);
    }

    // Phonics sound audio (recordings), also in R2, under sounds/.
    const sound = path.match(/^\/api\/sounds\/([\w./-]+)$/);
    if (sound && request.method === 'GET' && !sound[1].includes('..')) {
      const obj = await env.PICTURES.get(`sounds/${sound[1]}`);
      if (!obj) return json({ error: 'not found' }, { status: 404 });
      return new Response(obj.body, {
        headers: { 'content-type': obj.httpMetadata?.contentType || 'audio/mpeg', 'cache-control': 'private, max-age=3600' },
      });
    }

    // A word, spoken. The voice is the grown-ups' choice unless ?voice= asks for another (the Voice tab's test).
    if (path === '/api/say' && request.method === 'GET') {
      const word = (url.searchParams.get('word') || '').toLowerCase().replace(/[^a-z' -]/g, '').trim().slice(0, 40);
      if (!word) return json({ error: 'no word' }, { status: 400 });
      const asked = url.searchParams.get('voice');
      const voiceId = VOICES[asked] ? asked : await setting(env, sub, 'voice', DEFAULT_VOICE);
      try {
        const { body, type } = await sayWord(env, VOICES[voiceId] ? voiceId : DEFAULT_VOICE, word);
        return new Response(body, { headers: { 'content-type': type, 'cache-control': 'private, max-age=86400' } });
      } catch (e) {
        return json({ error: String(e.message || e).slice(0, 200) }, { status: 502 });
      }
    }

    if (path === '/api/settings' && request.method === 'GET') {
      return json({ voice: await setting(env, sub, 'voice', DEFAULT_VOICE), voices: VOICES });
    }
    if (path === '/api/settings' && request.method === 'PUT') {
      const body = await request.json();
      const set = (k, v) => env.DB.prepare('INSERT OR REPLACE INTO account_settings (sub, key, value, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').bind(sub, k, v).run();
      if ('voice' in body) {
        if (!VOICES[body.voice]) return json({ error: 'bad voice' }, { status: 400 });
        await set('voice', body.voice);
      }
      return json({ ok: true });
    }

    // What Yara knows. Edited from the grown-ups section.
    if (path === '/api/inventory' && request.method === 'GET') {
      // A new account starts with the Teach Your Monster to Read sounds, which the shared library is written for.
      const row = await env.DB.prepare('SELECT body FROM account_inventory WHERE sub = ?').bind(sub).first();
      return new Response(row ? row.body : JSON.stringify(INVENTORY_SEED()), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (path === '/api/inventory' && request.method === 'PUT') {
      const inv = await request.json();
      const strings = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string' && x.length < 40);
      if (!strings(inv.graphemes) || !strings(inv.tricky) || !strings(inv.names)) {
        return json({ error: 'bad inventory' }, { status: 400 });
      }
      const body = JSON.stringify({ graphemes: inv.graphemes, tricky: inv.tricky, names: inv.names });
      await env.DB.prepare(
        'INSERT OR REPLACE INTO account_inventory (sub, body, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      ).bind(sub, body).run();
      return json({ ok: true });
    }

    if (path === '/api/events' && request.method === 'POST') {
      const e = await request.json();
      await env.DB.prepare('INSERT INTO events (type, story_id, page, word, detail, sub) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(String(e.type).slice(0, 32), e.storyId ?? null, e.page ?? null, e.word ?? null, e.detail ? String(e.detail).slice(0, 200) : null, sub)
        .run();
      return json({ ok: true });
    }

    // A copy of everything held about this account, and deleting all of it. Not for a preview link.
    if (path === '/api/account/export' && request.method === 'GET') {
      if (who.readOnly) return json({ error: 'not for a preview' }, { status: 403 });
      const all = (sql) => env.DB.prepare(sql).bind(sub).all().then((r) => r.results);
      const books = (await all('SELECT body FROM stories WHERE owner = ?')).map((r) => JSON.parse(r.body));
      const data = {
        exported: new Date().toISOString(),
        account: { email: who.email, name: who.name },
        inventory: JSON.parse((await env.DB.prepare('SELECT body FROM account_inventory WHERE sub = ?').bind(sub).first())?.body || 'null'),
        settings: Object.fromEntries((await all('SELECT key, value FROM account_settings WHERE sub = ?')).map((r) => [r.key, r.value])),
        reading: await all('SELECT ts, type, story_id, page, word FROM events WHERE sub = ? AND type != \'say\' ORDER BY id'),
        books,
      };
      return new Response(JSON.stringify(data, null, 2), {
        headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="yara-reads-my-data.json"' },
      });
    }
    if (path === '/api/account' && request.method === 'DELETE') {
      if (who.readOnly) return json({ error: 'not for a preview' }, { status: 403 });
      const { results: own } = await env.DB.prepare('SELECT id FROM stories WHERE owner = ?').bind(sub).all();
      for (const { id } of own) {
        for (let list = await env.PICTURES.list({ prefix: `${id}/` }); ; list = await env.PICTURES.list({ prefix: `${id}/`, cursor: list.cursor })) {
          if (list.objects.length) await env.PICTURES.delete(list.objects.map((o) => o.key));
          if (!list.truncated) break;
        }
      }
      await env.DB.batch([
        env.DB.prepare('DELETE FROM story_readers WHERE sub = ? OR story_id IN (SELECT id FROM stories WHERE owner = ?)').bind(sub, sub),
        env.DB.prepare('DELETE FROM stories WHERE owner = ?').bind(sub),
        env.DB.prepare('DELETE FROM account_inventory WHERE sub = ?').bind(sub),
        env.DB.prepare('DELETE FROM account_settings WHERE sub = ?').bind(sub),
        env.DB.prepare('DELETE FROM events WHERE sub = ?').bind(sub),
        env.DB.prepare('DELETE FROM mcp_tokens WHERE sub = ?').bind(sub),
        env.DB.prepare('DELETE FROM agent_tokens WHERE sub = ?').bind(sub),
        env.DB.prepare('DELETE FROM accounts WHERE sub = ?').bind(sub),
      ]);
      return json({ ok: true }, { headers: { 'set-cookie': 'yr_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax' } });
    }

    // The agents this account has approved (Grown-ups > Agents), and taking one back.
    if (path === '/api/agents' && request.method === 'GET') return json(await listClients(env.DB, sub));
    const agentMatch = path.match(/^\/api\/agents\/([\w-]+)$/);
    if (agentMatch && request.method === 'DELETE') {
      await revoke(env.DB, agentMatch[1], sub);
      return json({ ok: true });
    }

    return json({ error: 'not found' }, { status: 404 });
  },
};
