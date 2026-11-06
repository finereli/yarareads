import { validatePack, verifyPackAsset, packHash, storyFingerprint, pageFingerprint, PACK_LIMITS } from '../public/reading-pack-format.js';
import { tokenize, isWord } from '../public/phonics.js';
const wordKey = word => word.toLowerCase().replace(/’/g, "'").replace(/[^a-z' -]/g, '').trim().slice(0,40);
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'private, no-store' } });
const idPattern = /^[a-f0-9]{64}$/;
const visible = '(owner IS NULL OR owner = ? OR id IN (SELECT story_id FROM story_readers WHERE sub = ?))';
const prefix = async (sub, id) => `private-reading-packs/${await packHash(sub)}/${id}/`;
export async function packMatches(env, sub, manifest) {
  const matches = [];
  for (const source of manifest.stories) {
    const row = await env.DB.prepare(`SELECT body FROM stories WHERE id = ? AND ${visible}`).bind(source.id, sub, sub).first();
    const story = row && JSON.parse(row.body);
    let matched = !!story && await storyFingerprint(story) === source.fingerprint && story.pages.length === source.pages.length;
    if (matched) for (const [index, page] of story.pages.entries()) {
      const words = tokenize(page.text).filter(isWord).map(wordKey), supplied = source.pages[index];
      if (await pageFingerprint(page.text) !== supplied.fingerprint || words.length !== supplied.words.length || words.some((word, i) => supplied.words[i].word !== word)) { matched = false; break; }
    }
    matches.push({ id: source.id, title: source.title, matched, reason: !story ? 'not_in_library' : matched ? null : 'content_changed' });
  }
  return matches;
}
async function removeObjects(env, key) {
  for (;;) { const list = await env.PICTURES.list({ prefix: key, limit: 500 }); if (!list.objects.length) break; await env.PICTURES.delete(list.objects.map(o => o.key)); }
}
async function deletePack(env, sub, id) {
  // Remove all capabilities first; no concurrent reader or upload may publish them again.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reading_pack_stories WHERE sub = ? AND pack_id = ?').bind(sub, id),
    env.DB.prepare('DELETE FROM reading_pack_assets WHERE sub = ? AND pack_id = ?').bind(sub, id),
    env.DB.prepare('DELETE FROM reading_pack_imports WHERE sub = ? AND id = ?').bind(sub, id),
  ]);
  await removeObjects(env, await prefix(sub, id));
}
export async function deleteAccountPacks(env, sub) {
  const { results } = await env.DB.prepare('SELECT id FROM reading_pack_imports WHERE sub = ?').bind(sub).all();
  for (const row of results) await deletePack(env, sub, row.id);
}
async function purgeExpired(env, sub) {
  const { results } = await env.DB.prepare("SELECT id FROM reading_pack_imports WHERE sub = ? AND status = 'staging' AND created_at < datetime('now', '-1 day')").bind(sub).all();
  for (const row of results) await deletePack(env, sub, row.id);
}
async function boundedBody(request, limit) {
  if (!request.body || Number(request.headers.get('content-length')) > limit) throw Error('Upload exceeds limit');
  const reader = request.body.getReader(), parts = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw Error('Upload exceeds limit'); } parts.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let n = 0; for (const part of parts) { bytes.set(part, n); n += part.length; } return bytes;
}
async function manifestBody(request) { return validatePack(JSON.parse(new TextDecoder().decode(await boundedBody(request, PACK_LIMITS.manifest)))); }
async function ownPack(env, sub, id, ready = false) {
  if (!idPattern.test(id)) return null;
  return env.DB.prepare(`SELECT * FROM reading_pack_imports WHERE sub = ? AND id = ?${ready ? " AND status = 'ready'" : " AND (status = 'ready' OR created_at >= datetime('now', '-1 day'))"}`).bind(sub, id).first();
}
export async function readingPackRoute(request, env, who, path) {
  if (!path.startsWith('/api/reading-packs')) return null;
  if (!who || who.readOnly && !['GET', 'HEAD'].includes(request.method)) return json({ error: 'Sign in with a writable account to import a Reading Pack.' }, 403);
  const sub = who.sub, method = request.method;
  try {
    if (path === '/api/reading-packs/preview' && method === 'POST') {
      const manifest = await manifestBody(request), matches = await packMatches(env, sub, manifest);
      return json({ id: await packHash(JSON.stringify(manifest)), voice: manifest.voice, coverage: manifest.coverage, matches });
    }
    if (path === '/api/reading-packs/imports' && method === 'POST') {
      await purgeExpired(env, sub); const manifest = await manifestBody(request), id = await packHash(JSON.stringify(manifest)), matches = await packMatches(env, sub, manifest);
      if (!matches.some(m => m.matched)) return json({ error: 'No existing Stories match this Reading Pack.', matches }, 409);
      await env.DB.prepare("INSERT OR IGNORE INTO reading_pack_imports (sub,id,manifest) VALUES (?,?,?)").bind(sub, id, JSON.stringify(manifest)).run();
      const row = await ownPack(env, sub, id); return json({ id, status: row.status, matches }, row.status === 'ready' ? 200 : 201);
    }
    if (path === '/api/reading-packs' && method === 'GET') {
      const { results } = await env.DB.prepare("SELECT id,manifest,imported_at FROM reading_pack_imports WHERE sub = ? AND status = 'ready' ORDER BY imported_at DESC,id").bind(sub).all();
      return json(results.map(row => { const manifest = JSON.parse(row.manifest); return { id: row.id, voice: manifest.voice, coverage: manifest.coverage, importedAt: row.imported_at }; }));
    }
    const forStory = path.match(/^\/api\/reading-packs\/for-story\/([\w-]+)$/);
    if (forStory && method === 'GET') {
      const { results } = await env.DB.prepare("SELECT p.* FROM reading_pack_imports p JOIN reading_pack_stories s ON s.sub=p.sub AND s.pack_id=p.id WHERE p.sub=? AND s.story_id=? AND p.status='ready' ORDER BY p.imported_at DESC,p.id DESC").bind(sub, forStory[1]).all();
      for (const row of results) { const manifest = JSON.parse(row.manifest); if ((await packMatches(env, sub, manifest)).find(m => m.id === forStory[1])?.matched) return json({ id: row.id, manifest }); }
      return json(null);
    }
    const match = path.match(/^\/api\/reading-packs\/([a-f0-9]{64})(?:\/(commit|assets\/([a-f0-9]{64})))?$/); if (!match) return json({ error: 'Not found' }, 404);
    const row = await ownPack(env, sub, match[1], method === 'GET'); if (!row) return json({ error: 'Not found' }, 404);
    const manifest = JSON.parse(row.manifest);
    if (match[2]?.startsWith('assets/')) {
      const asset = manifest.assets.find(a => a.sha256 === match[3]); if (!asset) return json({ error: 'Not found' }, 404);
      if (method === 'PUT') {
        if (row.status !== 'staging') return json({ error: 'This pack is already committed.' }, 409);
        const bytes = await boundedBody(request, asset.size); for (const descriptor of manifest.assets.filter(a => a.sha256 === asset.sha256)) await verifyPackAsset(manifest, descriptor, bytes);
        const key = await prefix(sub, row.id) + asset.sha256 + '-' + crypto.randomUUID();
        await env.PICTURES.put(key, bytes, { httpMetadata: { contentType: asset.contentType } });
        const receipt = await env.DB.prepare("INSERT OR IGNORE INTO reading_pack_assets (sub,pack_id,sha256,size,content_type,object_key) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM reading_pack_imports WHERE sub=? AND id=? AND status='staging' AND created_at >= datetime('now','-1 day'))").bind(sub, row.id, asset.sha256, asset.size, asset.contentType, key, sub, row.id).run();
        if (!receipt.meta.changes) {
          await env.PICTURES.delete(key);
          const accepted = await env.DB.prepare('SELECT size,content_type FROM reading_pack_assets WHERE sub=? AND pack_id=? AND sha256=?').bind(sub,row.id,asset.sha256).first();
          if (accepted?.size === asset.size && accepted.content_type === asset.contentType) return json({accepted:true,repeated:true});
          return json({ error: 'Import was cancelled.' }, 409);
        }
        return json({ accepted: true });
      }
      if (method === 'GET') {
        const stored = await env.DB.prepare('SELECT object_key FROM reading_pack_assets WHERE sub=? AND pack_id=? AND sha256=?').bind(sub, row.id, asset.sha256).first();
        const object = stored && await env.PICTURES.get(stored.object_key); if (!object) return json({ error: 'Not found' }, 404);
        return new Response(object.body, { headers: { 'content-type': asset.contentType, 'content-length': String(asset.size), 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
      }
    }
    if (match[2] === 'commit' && method === 'POST') {
      if (row.status === 'ready') return json({ id: row.id, status: 'ready', repeated: true });
      const matches = await packMatches(env, sub, manifest), matched = matches.filter(m => m.matched);
      if (!matched.length) return json({ error: 'The Stories changed. Preview this pack again.', matches }, 409);
      const { results } = await env.DB.prepare('SELECT sha256,size,content_type FROM reading_pack_assets WHERE sub=? AND pack_id=?').bind(sub, row.id).all();
      const receipts = new Map(results.map(a => [a.sha256, a]));
      if (manifest.assets.some(a => receipts.get(a.sha256)?.size !== a.size || receipts.get(a.sha256)?.content_type !== a.contentType)) return json({ error: 'Upload every verified asset before importing.' }, 409);
      await env.DB.batch([
        ...matched.map(m => env.DB.prepare("INSERT OR IGNORE INTO reading_pack_stories (sub,pack_id,story_id,fingerprint) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM reading_pack_imports WHERE sub=? AND id=? AND status='staging')").bind(sub, row.id, m.id, manifest.stories.find(s => s.id === m.id).fingerprint, sub, row.id)),
        env.DB.prepare("UPDATE reading_pack_imports SET status='ready',imported_at=CURRENT_TIMESTAMP WHERE sub=? AND id=? AND status='staging'").bind(sub, row.id),
      ]);
      const committed = await ownPack(env, sub, row.id, true); return committed ? json({ id: row.id, status: 'ready', matches }) : json({ error: 'Import was cancelled.' }, 409);
    }
    if (!match[2] && method === 'DELETE') { await deletePack(env, sub, row.id); return json({ deleted: true }); }
    return json({ error: 'Not found' }, 404);
  } catch (error) { return json({ error: error.message || 'Invalid Reading Pack.' }, 400); }
}
