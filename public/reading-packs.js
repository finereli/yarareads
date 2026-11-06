import { readPackZip, verifyPackAsset, PACK_LIMITS } from './reading-pack-format.js';
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderReadingPacks(container, { token, onChanged = () => {} }) {
  const credential = token();
  const request = async (path, { method = 'GET', body, binary = false } = {}) => {
    const res = await fetch('/api/reading-packs' + path, { method, headers: { authorization: `Bearer ${credential}`, 'content-type': binary ? 'application/octet-stream' : 'application/json' }, ...(body != null && { body: binary ? body : JSON.stringify(body) }) });
    const result = await res.json(); if (!res.ok) throw Error(result.error || 'The Reading Pack request failed.'); return result;
  };
  container.innerHTML = `<section class="panel reading-packs"><h2>Reading Packs</h2><p>Import accepted phonics sounds and reading audio from Phonix. Audio stays private to this signed-in account. Only existing Stories with exactly matching pages receive audio; books, known sounds and progress stay as they are.</p><label>Choose a Reading Pack ZIP<input type="file" accept=".zip,application/zip" data-pack-file></label><p class="muted">One voice per pack. Up to ${PACK_LIMITS.archive / 1024 / 1024} MB. Page recordings are retained for portability; this reader plays phonics and words.</p><div data-pack-review></div><p role="status" aria-live="polite" data-pack-status></p><h3>Imported packs</h3><div data-pack-list>Loading…</div></section>`;
  const status = container.querySelector('[data-pack-status]'), review = container.querySelector('[data-pack-review]'), list = container.querySelector('[data-pack-list]'), chooser = container.querySelector('[data-pack-file]');
  let busy = false;
  const refresh = async () => {
    const packs = await request(''); list.replaceChildren();
    if (!packs.length) { list.textContent = 'No Reading Packs imported.'; return; }
    for (const pack of packs) {
      const row = document.createElement('div'); row.className = 'bookrow';
      row.innerHTML = `<div><b>${escape(pack.voice.label)}</b><p>${pack.coverage.available} available recordings · ${pack.coverage.missing} missing</p></div>`;
      const remove = document.createElement('button'); remove.className = 'press check'; remove.textContent = 'Remove';
      remove.onclick = async () => { if (busy || !confirm(`Remove ${pack.voice.label} Reading Pack and its private audio?`)) return; try { busy = true; remove.disabled = true; await request('/' + pack.id, { method: 'DELETE' }); onChanged(); await refresh(); status.textContent = 'Reading Pack removed.'; } catch (e) { status.textContent = e.message; } finally { busy = false; remove.disabled = false; } };
      row.append(remove); list.append(row);
    }
  };
  chooser.onchange = async () => {
    if (busy) return; const file = chooser.files?.[0]; if (!file) return; review.replaceChildren(); status.textContent = 'Checking the Reading Pack…'; busy = true; chooser.disabled = true;
    try {
      const archive = await readPackZip(file); let count = 0;
      for (const asset of archive.manifest.assets) { const data = await archive.read(asset.path); await verifyPackAsset(archive.manifest, asset, data); status.textContent = `Checking recordings ${++count} of ${archive.manifest.assets.length}…`; }
      const preview = await request('/preview', { method: 'POST', body: archive.manifest });
      review.innerHTML = `<h3>${escape(preview.voice.label)}</h3><p>${preview.coverage.available} available recordings · ${preview.coverage.missing} missing</p><ul>${preview.matches.map(m => `<li>${escape(m.title)} — ${m.matched ? 'matches existing pages' : m.reason === 'not_in_library' ? 'not in this library' : 'pages differ; audio will not attach'}</li>`).join('')}</ul><p>Missing recordings remain unavailable for these Stories. Another voice will not be substituted.</p>`;
      const button = document.createElement('button'); button.className = 'press check'; button.textContent = 'Import private audio'; button.disabled = !preview.matches.some(m => m.matched); review.append(button); status.textContent = 'Review the matches and coverage, then import.';
      button.onclick = async () => {
        if (busy) return; busy = true; chooser.disabled = true; button.disabled = true; let started;
        try {
          started = await request('/imports', { method: 'POST', body: archive.manifest });
          if (started.status !== 'ready') {
            let uploaded = 0; const unique = new Map(archive.manifest.assets.map(asset => [asset.sha256, asset]));
            for (const asset of unique.values()) { status.textContent = `Uploading private recording ${++uploaded} of ${unique.size}…`; await request(`/${started.id}/assets/${asset.sha256}`, { method: 'PUT', body: await archive.read(asset.path), binary: true }); }
            await request(`/${started.id}/commit`, { method: 'POST' });
          }
          onChanged(); review.replaceChildren(); chooser.value = ''; await refresh(); status.textContent = 'Reading Pack imported. Matching Stories can use this voice.';
        } catch (error) {
          status.textContent = `${error.message} Choose the same ZIP to retry. Completed uploads can be sent again safely.`; button.disabled = false;
        } finally { busy = false; chooser.disabled = false; }
      };
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; chooser.disabled = false; }
  };
  try { await refresh(); } catch (error) { status.textContent = error.message; list.textContent = 'Packs could not be loaded.'; }
}
export const packAssetURL = (pack, asset) => `/api/reading-packs/${pack.id}/assets/${asset.sha256}`;
export function packWordAsset(pack, storyId, page, index, word) {
  const source = pack?.manifest.stories.find(s => s.id === storyId)?.pages[page]?.words[index];
  const normalized = word.toLowerCase().replace(/’/g, "'").replace(/[^a-z' -]/g, '').trim().slice(0,40);
  return source?.word === normalized ? pack.manifest.assets.find(a => a.kind === 'word' && a.key === source.key && a.word === normalized) : null;
}
