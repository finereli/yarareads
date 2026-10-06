// API for Yara Reads. Static files are served from public/; everything under /api/ lands here.

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...init.headers } });

async function sessionToken(env) {
  const bytes = new TextEncoder().encode(`${env.PIN}:${env.SESSION_SECRET}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cookie(request, name) {
  const match = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match && match[1];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/login' && request.method === 'POST') {
      const { pin } = await request.json().catch(() => ({}));
      if (String(pin) !== String(env.PIN)) return json({ ok: false }, { status: 401 });
      const token = await sessionToken(env);
      return json({ ok: true }, {
        headers: { 'set-cookie': `yr=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax` },
      });
    }

    if (cookie(request, 'yr') !== (await sessionToken(env))) return json({ error: 'pin' }, { status: 401 });

    if (path === '/api/stories' && request.method === 'GET') {
      const { results: stories } = await env.DB.prepare(
        `SELECT id, series, number, title, json_extract(body, '$.cover') AS cover,
           json_extract(body, '$.coverImage') AS coverImage, coalesce(json_extract(body, '$.kind'), 'story') AS kind
         FROM stories ORDER BY kind = 'book', series, number`,
      ).all();
      const { results: done } = await env.DB.prepare(
        "SELECT story_id, COUNT(*) AS times FROM events WHERE type = 'finish' GROUP BY story_id",
      ).all();
      const times = Object.fromEntries(done.map((d) => [d.story_id, d.times]));
      return json(stories.map((s) => ({ ...s, finished: times[s.id] || 0 })));
    }

    const storyMatch = path.match(/^\/api\/stories\/([\w-]+)$/);
    if (storyMatch && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT body FROM stories WHERE id = ?').bind(storyMatch[1]).first();
      if (!row) return json({ error: 'not found' }, { status: 404 });
      return new Response(row.body, { headers: { 'content-type': 'application/json' } });
    }

    // Page pictures live in R2, behind the PIN like everything else: some are scans of books we own.
    const picture = path.match(/^\/api\/pictures\/([\w-]+\/[\w.-]+)$/);
    if (picture && request.method === 'GET') {
      const obj = await env.PICTURES.get(picture[1]);
      if (!obj) return json({ error: 'not found' }, { status: 404 });
      return new Response(obj.body, {
        headers: {
          'content-type': obj.httpMetadata?.contentType || 'image/jpeg',
          'cache-control': 'private, max-age=604800',
          etag: obj.httpEtag,
        },
      });
    }

    // What Yara knows. Edited from the grown-ups section.
    if (path === '/api/inventory' && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT body FROM inventory WHERE id = 1').first();
      return new Response(row ? row.body : '{"graphemes":[],"tricky":[],"names":[]}', {
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
        'INSERT OR REPLACE INTO inventory (id, body, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)',
      ).bind(body).run();
      return json({ ok: true });
    }

    if (path === '/api/events' && request.method === 'POST') {
      const e = await request.json();
      await env.DB.prepare('INSERT INTO events (type, story_id, page, word) VALUES (?, ?, ?, ?)')
        .bind(String(e.type).slice(0, 32), e.storyId ?? null, e.page ?? null, e.word ?? null)
        .run();
      return json({ ok: true });
    }

    // For grown-ups: which words she taps most, i.e. what to practise next.
    if (path === '/api/progress' && request.method === 'GET') {
      const { results: taps } = await env.DB.prepare(
        "SELECT word, COUNT(*) AS taps FROM events WHERE type = 'tap' GROUP BY word ORDER BY taps DESC LIMIT 40",
      ).all();
      const { results: days } = await env.DB.prepare(
        "SELECT date(ts) AS day, COUNT(DISTINCT story_id) AS stories, SUM(type = 'page') AS pages FROM events GROUP BY day ORDER BY day DESC LIMIT 14",
      ).all();
      return json({ taps, days });
    }

    return json({ error: 'not found' }, { status: 404 });
  },
};
