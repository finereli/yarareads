import { tokenize, isWord, normalize, classify, unreadable, forStory, letters, CATALOG_GROUPS } from './phonics.js';
import { ICONS, STAR, LOGO, cover } from './art.js';

const app = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const BRAND = `<div class="brand">${LOGO}<span class="name">Yara <em>Reads</em></span></div>`;

// ---------- API ----------

class NeedPin extends Error {}

async function api(path, options = {}) {
  const res = await fetch('/api/' + path, {
    ...options,
    headers: { 'content-type': 'application/json' },
    body: options.body && JSON.stringify(options.body),
  });
  if (res.status === 401) throw new NeedPin();
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function log(type, data = {}) {
  api('events', { method: 'POST', body: { type, ...data } }).catch(() => {});
}

// Books and the sounds list are cached while she reads, and dropped every time the library shows,
// so new books, pictures and inventory changes appear without reinstalling or reloading.
let inventory;
const getInventory = async () => inventory || (inventory = await api('inventory'));
let storyCache = {};
const getStory = async (id) => storyCache[id] || (storyCache[id] = await api('stories/' + id));
const forgetContent = () => {
  inventory = null;
  storyCache = {};
};

// ---------- Speech (single words only) ----------

let voice;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  voice =
    voices.find((v) => v.lang === 'en-GB' && /female|libby|sonia|serena|kate|martha/i.test(v.name)) ||
    voices.find((v) => v.lang === 'en-GB') ||
    voices.find((v) => v.lang.startsWith('en'));
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

// iOS only lets a page speak if speech starts inside a tap. Sounding out says the word seconds
// after the tap (from a timer), so the tap first speaks a silent utterance to unlock speech.
function primeSpeech() {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice ? voice.lang : 'en-GB';
  u.rate = 0.7;
  speechSynthesis.speak(u);
}

// ---------- Updates ----------
// The installed app (home screen) has no reload button, so it checks for a new deploy whenever it
// comes back to the foreground, and every 15 minutes while open. Files are served must-revalidate,
// so a reload is all an update takes; the hash route keeps her place.

let version;
async function latestVersion() {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    return res.ok ? (await res.json()).version : null;
  } catch {
    return null; // offline: keep going
  }
}
async function checkForUpdate() {
  const latest = await latestVersion();
  if (version && latest && latest !== version) location.reload();
  return latest;
}
latestVersion().then((v) => (version = v));
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  await checkForUpdate();
  // Back from the background on the library: show it fresh (new books, pictures).
  if (!location.hash.startsWith('#/read') && !location.hash.startsWith('#/grownups')) route();
});
setInterval(checkForUpdate, 15 * 60 * 1000);

// ---------- Router ----------

// Passed the gate this session (survives the grown-ups "Refresh now" reload).
const session = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
};
let grownUp = session.get('grownUp') === '1';

async function route() {
  closePop();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const [, view, id, page] = location.hash.split('/');
  try {
    if (view === 'read' && id) await showReader(id, Number(page) || 0);
    else if (view === 'grownups') grownUp ? await showGrownups() : showGate();
    else if (view === 'sounds') grownUp ? await showSoundLab() : showGate();
    else await showLibrary();
  } catch (e) {
    if (e instanceof NeedPin) showPin();
    else app.innerHTML = `<div class="end"><h1 class="big">Oops!</h1><p class="said">${esc(e.message)}</p></div>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// ---------- Keypad (PIN and grown-ups gate) ----------

function keypad({ title, hint, digits = 4, boxes = false, onCancel, onDone }) {
  let entered = '';
  app.innerHTML = `
    <div class="keyscreen">
      ${BRAND}
      <h2>${title}</h2>
      ${hint ? `<p>${hint}</p>` : ''}
      <div class="slots ${boxes ? 'digits' : ''}">${'<span></span>'.repeat(digits)}</div>
      <div class="keys">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="press" data-k="${n}">${n}</button>`).join('')}
        <span></span>
        <button class="press" data-k="0">0</button>
        <button class="press erase" data-k="back" aria-label="Delete">${ICONS.erase}</button>
      </div>
      ${onCancel ? '<button class="link" data-act="cancel">Back to the books</button>' : ''}
    </div>`;
  const slots = app.querySelector('.slots');
  const paint = () => slots.querySelectorAll('span').forEach((s, i) => {
    s.classList.toggle('on', i < entered.length);
    if (boxes) s.textContent = entered[i] || '';
  });
  const fail = () => {
    entered = '';
    slots.classList.add('shake');
    setTimeout(() => { slots.classList.remove('shake'); paint(); }, 400);
  };
  app.querySelector('.keys').addEventListener('click', async (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (!k) return;
    entered = k === 'back' ? entered.slice(0, -1) : (entered + k).slice(0, digits);
    paint();
    if (entered.length === digits) (await onDone(entered)) || fail();
  });
  if (onCancel) app.querySelector('[data-act=cancel]').onclick = onCancel;
}

function showPin() {
  keypad({
    title: 'Enter the secret number',
    onDone: async (pin) => {
      const res = await fetch('/api/login', { method: 'POST', body: JSON.stringify({ pin }) });
      if (res.ok) route();
      return res.ok;
    },
  });
}

// Like TYM: grown-ups prove it by typing a birth year that makes them an adult.
function showGate() {
  keypad({
    title: 'Grown-ups only',
    hint: 'What year were you born?',
    boxes: true,
    onCancel: () => (location.hash = '#/'),
    onDone: (year) => {
      const age = new Date().getFullYear() - Number(year);
      if (age < 18 || age > 100) return false;
      grownUp = true;
      session.set('grownUp', '1');
      route();
      return true;
    },
  });
}

// ---------- Library ----------

async function showLibrary() {
  forgetContent();
  const stories = await api('stories');
  const series = [...new Set(stories.map((s) => s.series))];
  const nextUp = stories.find((s) => !s.finished && s.kind !== 'book');
  app.innerHTML = `
    <div class="library">
      <header>${BRAND}</header>
      ${series.map((name) => `
        <h2 class="series-title">${esc(name)}</h2>
        <div class="shelf">
          ${stories.filter((s) => s.series === name).map((s) => `
            <button class="book press ${s === nextUp ? 'next' : ''}" data-id="${esc(s.id)}">
              ${s === nextUp ? '<span class="tag">Read me next</span>' : ''}
              ${s.coverImage
                ? `<span class="art photo"><img src="${pictureUrl(s.coverImage)}" alt=""></span>`
                : `<span class="art" style="background: var(--cover-${esc(s.cover || 'egg')})">${cover(s.cover)}</span>`}
              <span class="meta">
                <span class="num">${s.kind === 'book' ? 'From home' : `Book ${s.number}`}</span>
                <span class="title">${esc(s.title)}</span>
                <span class="stars">${[0, 1, 2].map((i) => STAR(i < s.finished)).join('')}</span>
              </span>
            </button>`).join('')}
        </div>`).join('')}
      <p style="text-align:center; margin-top:40px">
        <button class="grownups-btn" data-act="grownups">${ICONS.lock} Grown-ups</button>
      </p>
    </div>`;
  app.querySelectorAll('.book').forEach((b) => (b.onclick = () => (location.hash = `#/read/${b.dataset.id}/0`)));
  app.querySelector('[data-act=grownups]').onclick = () => (location.hash = '#/grownups');
}

// ---------- Reader ----------

async function showReader(id, pageIndex) {
  const [story, all] = await Promise.all([getStory(id), getInventory()]);
  const inv = forStory(all, story);
  if (pageIndex >= story.pages.length) return showEnd(story);
  if (pageIndex === 0) log('open', { storyId: id });
  log('page', { storyId: id, page: pageIndex });

  const page = story.pages[pageIndex];
  // Words she can't read yet (only in books from home) get a quiet dotted underline.
  const known = (t) => classify(t, inv, story.words?.[normalize(t)] || []).kind !== 'unknown';
  const words = tokenize(page.text).map((t) =>
    isWord(t) ? `<span class="w ${known(t) ? '' : 'new'}" data-word="${esc(t)}">${esc(t)}</span>` : esc(t),
  );
  const next = story.pages[pageIndex + 1];
  if (next?.image) new Image().src = pictureUrl(next.image);
  const last = pageIndex === story.pages.length - 1;

  app.innerHTML = `
    <div class="reader">
      <div class="topbar">
        <button class="round press" data-act="home" aria-label="All books">${ICONS.home}</button>
        <div class="title">${esc(story.title)}</div>
        <span class="spacer"></span>
      </div>
      <div class="sheet ${page.image ? 'with-picture' : ''}">
        ${page.image ? `<div class="picture"><img src="${pictureUrl(page.image)}" alt=""></div>` : ''}
        <div class="text">${words.join('')}</div>
      </div>
      <div class="nav">
        <button class="round press" data-act="prev" ${pageIndex === 0 ? 'disabled' : ''} aria-label="Back">${ICONS.prev}</button>
        <div class="progress">${story.pages.map((_, i) => `<span class="${i <= pageIndex ? 'on' : ''}"></span>`).join('')}</div>
        <button class="round press ${last ? 'ember' : ''}" data-act="next" aria-label="Next">${ICONS.next}</button>
      </div>
    </div>`;

  fitPage();
  app.querySelector('.picture img')?.addEventListener('load', fitPage);

  const go = (i) => (location.hash = `#/read/${id}/${i}`);
  app.querySelector('[data-act=home]').onclick = () => (location.hash = '#/');
  app.querySelector('[data-act=prev]').onclick = () => pageIndex > 0 && go(pageIndex - 1);
  app.querySelector('[data-act=next]').onclick = () => go(pageIndex + 1);
  app.querySelectorAll('.w').forEach((el) => (el.onclick = (e) => {
    e.stopPropagation();
    openPop(el, story, inv);
  }));
}

const pictureUrl = (key) => `/api/pictures/${key}`;

// Keep the page on one screen: CSS lets the picture shrink first; if the text still
// overflows the sheet, step its size down (never below 20px).
function fitPage() {
  const sheet = app.querySelector('.sheet'), text = app.querySelector('.text');
  if (!sheet || !text) return;
  text.style.fontSize = '';
  let size = parseFloat(getComputedStyle(text).fontSize);
  while (sheet.scrollHeight > sheet.clientHeight + 1 && size > 20) {
    size -= 2;
    text.style.fontSize = `${size}px`;
  }
}
addEventListener('resize', fitPage);
document.fonts?.ready.then(fitPage);

// ---------- Word card: the hint lives right on the word ----------

let pop;
function closePop() {
  if (pop) pop.remove();
  pop = null;
  document.querySelectorAll('.w.active').forEach((w) => w.classList.remove('active'));
}
document.addEventListener('click', (e) => pop && !pop.contains(e.target) && closePop());

function openPop(el, story, inv) {
  closePop();
  const word = el.dataset.word;
  const info = classify(word, inv, story.words?.[normalize(word)] || []);
  el.classList.add('active');
  log('tap', { storyId: story.id, word: normalize(word) });

  pop = document.createElement('div');
  pop.className = 'pop';
  // Anything that can be sounded out gets sound buttons: her words, names, and new words
  // (whose unfamiliar sounds are marked). Only tricky words and the truly irregular stay whole.
  const badge = {
    name: 'A name',
    unknown: info.parts?.some((p) => p.new) ? 'New sounds' : 'New word',
  }[info.kind];
  if (info.parts) {
    pop.innerHTML = `
      <div class="chips">${info.parts.map((p) => `<div class="chip ${chipClass(p)}">${esc(p.text)}<span class="mark"></span></div>`).join('')}</div>
      ${badge ? `<div class="badge ${info.kind === 'unknown' ? 'new' : ''}">${badge}</div>` : ''}
      <div class="actions">
        <button class="press speak" data-a="sound" aria-label="Sound it out">${ICONS.speaker}</button>
      </div>`;
  } else {
    const badge = { tricky: `${STAR(true)} Tricky word`, name: 'A name', unknown: 'New word' }[info.kind];
    pop.innerHTML = `
      <div class="whole">${esc(word)}</div>
      ${badge ? `<div class="badge">${badge}</div>` : ''}
      <div class="actions"><button class="press speak" data-a="say" aria-label="Say it">${ICONS.speaker}</button></div>`;
  }
  document.body.appendChild(pop);
  fitPop(pop);
  if (info.parts) drawLinks(pop, info.parts);
  place(pop, el);

  // One speaker button. If the word can be sounded out, it always is (tiles light in turn) before
  // the word is said, so the voice never reads a word for her without the sounding out.
  pop.querySelector('[data-a=say]')?.addEventListener('click', () => speak(word));
  const sound = pop.querySelector('[data-a=sound]');
  if (sound) sound.onclick = () => {
    primeSpeech();
    soundOut(pop, word, info.parts);
  };
}

// Long words: shrink the tiles until the card fits the screen width.
function fitPop(p) {
  const max = innerWidth - 16;
  let size = 46;
  while (p.offsetWidth > max && size > 20) {
    size -= 2;
    p.style.setProperty('--chip', `${size}px`);
  }
}

// Sound buttons: a dot for one letter, a bar for letters making one sound,
// and for silent e an arc joining the vowel to its e (drawn by drawLinks).
// A sound she hasn't learned yet gets the plum "new" look on top.
const isSplit = (p) => p.g.length === 3 && p.g[1] === '_';
function chipClass(p) {
  const shape = isSplit(p) ? 'split' : p.text.length > 1 ? 'many' : 'one';
  return p.new ? `${shape} new` : shape;
}

// The silent e partner of the vowel at index i: the next silent part with the same grapheme.
const partner = (parts, i) => parts.findIndex((p, k) => k > i && p.silent && p.g === parts[i].g);

function drawLinks(p, parts) {
  if (!parts.some((part) => part.silent)) return;
  const row = p.querySelector('.chips');
  row.classList.add('linked'); // position: relative, so chip offsets are relative to the row
  const chips = row.querySelectorAll('.chip');
  // Layout offsets, not getBoundingClientRect: the card is mid scale-in animation right now.
  const centre = (c) => c.offsetLeft + c.offsetWidth / 2;
  const paths = parts.map((part, i) => {
    if (!isSplit(part) || part.silent) return '';
    const a = chips[i], b = chips[partner(parts, i)];
    const x1 = centre(a), x2 = centre(b), y = a.offsetTop + a.offsetHeight - 6;
    return `<path class="${part.new ? 'new' : ''}" d="M${x1} ${y} Q${(x1 + x2) / 2} ${y + 30} ${x2} ${y}"/>`;
  }).join('');
  row.insertAdjacentHTML('beforeend', `<svg class="links" width="${row.offsetWidth}" height="${row.offsetHeight + 24}">${paths}</svg>`);
}

// Light up each sound in turn (a silent-e vowel lights with its e), then blend: say the whole word.
function soundOut(p, word, parts) {
  if (p.dataset.busy) return; // one sounding-out at a time
  p.dataset.busy = '1';
  const chips = [...p.querySelectorAll('.chip')];
  const steps = parts.map((_, i) => i).filter((i) => !parts[i].silent);
  steps.forEach((i, n) => setTimeout(() => {
    chips.forEach((x) => x.classList.remove('lit'));
    chips[i].classList.add('lit');
    if (isSplit(parts[i])) chips[partner(parts, i)].classList.add('lit');
  }, n * 650));
  setTimeout(() => {
    chips.forEach((c) => c.classList.add('lit'));
    speak(word);
    delete p.dataset.busy;
  }, steps.length * 650);
}

function place(p, el) {
  const r = el.getBoundingClientRect();
  const w = p.offsetWidth, h = p.offsetHeight, m = 8;
  const left = Math.max(m, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - m));
  let top = r.top - h - 14;
  if (top < m) top = r.bottom + 14;
  p.style.left = left + 'px';
  p.style.top = top + 'px';
}

// ---------- The End ----------

async function showEnd(story) {
  log('finish', { storyId: story.id });
  const stories = await api('stories');
  const next = stories.find((s) => s.series === story.series && s.number === story.number + 1);
  app.innerHTML = `
    <div class="end">
      <h1 class="big">The End</h1>
      <div class="stars">${STAR(true).repeat(3)}</div>
      <p class="said">You read <b>${esc(story.title)}</b>!</p>
      ${next ? `<button class="next press ember">Next: ${esc(next.title)} ${ICONS.next}</button>` : ''}
      <button class="link" data-act="home">All books</button>
    </div>`;
  if (next) app.querySelector('.next').onclick = () => (location.hash = `#/read/${next.id}/0`);
  app.querySelector('[data-act=home]').onclick = () => (location.hash = '#/');
}

// ---------- Grown-ups ----------

async function showGrownups() {
  const [inv, list, progress] = await Promise.all([getInventory(), api('stories'), api('progress')]);
  const stories = await Promise.all(list.map((s) => getStory(s.id)));

  const tiles = (entries) => entries.map(([g]) =>
    `<button class="tile ${inv.graphemes.includes(g) ? 'on' : ''}" data-g="${esc(g)}">${esc(letters(g))}${
      g.includes(' (') ? `<small>${esc(g.slice(g.indexOf('(') + 1, -1))}</small>` : ''}</button>`).join('');
  const words = (key) => inv[key].map((w) =>
    `<span class="wordchip">${esc(w)}<button data-remove="${key}" data-w="${esc(w)}" aria-label="Remove ${esc(w)}">${ICONS.close}</button></span>`).join('');
  const adder = (key, placeholder) => `
    <form class="adder" data-add="${key}">
      <input name="w" placeholder="${placeholder}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="press">${ICONS.plus} Add</button>
    </form>`;

  app.innerHTML = `
    <div class="admin">
      <header>
        <h1>Grown-ups</h1>
        <button class="done press" data-act="done">${ICONS.check} Done</button>
      </header>

      <section class="panel">
        <h2>Sounds she knows <small>${inv.graphemes.length} on</small></h2>
        <p>Tap a sound to switch it on or off. Books only use sounds that are on, and a word with a sound that's off stops being one she can sound out.</p>
        ${CATALOG_GROUPS.map(([title, entries]) => `<h3>${esc(title)}</h3><div class="tiles">${tiles(entries)}</div>`).join('')}
      </section>

      <section class="panel">
        <h2>Tricky words <small>${inv.tricky.length}</small></h2>
        <p>Words she reads on sight, without sounding out.</p>
        <div class="wordlist">${words('tricky')}</div>
        ${adder('tricky', 'Add a tricky word')}
      </section>

      <section class="panel">
        <h2>Names <small>${inv.names.length}</small></h2>
        <p>Characters' names. She can read these anywhere.</p>
        <div class="wordlist">${words('names')}</div>
        ${adder('names', 'Add a name')}
      </section>

      <section class="panel">
        <h2>Books</h2>
        <p>Whether each book is still readable with what she knows.</p>
        ${stories.map((s) => {
          const missing = unreadable(s, inv);
          if (s.kind === 'book') {
            const tokens = s.pages.flatMap((p) => tokenize(p.text).filter(isWord)).map(normalize);
            const share = Math.round((100 * tokens.filter((w) => !missing.includes(w)).length) / tokens.length);
            return `<div class="bookrow">
              <span class="dot home">${share}</span>
              <div><b>${esc(s.title)}</b> <span class="muted">from home</span>
                <div>She can read ${share}% of it. Not yet: ${missing.map(esc).join(', ')}</div>
              </div>
            </div>`;
          }
          return `<div class="bookrow">
            <span class="dot ${missing.length ? 'bad' : 'ok'}">${missing.length ? '!' : ICONS.check}</span>
            <div><b>Book ${s.number}: ${esc(s.title)}</b>
              <div>${missing.length ? `Words she can't read yet: ${missing.map(esc).join(', ')}` : 'Every word is one she can read.'}</div>
            </div>
          </div>`;
        }).join('')}
      </section>

      <section class="panel">
        <h2>Sound lab</h2>
        <p>Recordings of each phonics sound for the sound buttons. Listen to the candidates and pick the ones that sound right.</p>
        <button class="press check" data-act="lab">Open the sound lab</button>
      </section>

      <section class="panel">
        <h2>App <small>version ${esc(version || 'unknown')}</small></h2>
        <p>The app updates itself, and new books and pictures appear whenever the library opens. If something still looks out of date:</p>
        <button class="press check" data-act="update">Refresh now</button>
      </section>

      <section class="panel">
        <h2>Practise</h2>
        <p>The words she taps most for help. These are the ones to practise together.</p>
        <div class="wordlist">${progress.taps.map((t) => `<span class="wordchip plain">${esc(t.word)}<span class="count">×${t.taps}</span></span>`).join('') || '<span class="days">Nothing yet.</span>'}</div>
        <h3>Recent days</h3>
        <div class="days">${progress.days.map((d) => `${esc(d.day)}: ${d.pages} pages, ${d.stories} books`).join('<br>') || 'Nothing yet.'}</div>
      </section>
    </div>`;

  const save = async () => {
    await api('inventory', { method: 'PUT', body: inv });
    toast('Saved');
    const y = scrollY;
    await showGrownups();
    scrollTo(0, y);
  };
  app.querySelector('[data-act=done]').onclick = () => (location.hash = '#/');
  app.querySelector('[data-act=lab]').onclick = () => (location.hash = '#/sounds');
  // A full reload: fresh code, books, pictures and sounds. Lands back here in grown-ups.
  app.querySelector('[data-act=update]').onclick = () => location.reload();
  app.querySelectorAll('.tile').forEach((t) => (t.onclick = () => {
    const g = t.dataset.g;
    inv.graphemes = inv.graphemes.includes(g) ? inv.graphemes.filter((x) => x !== g) : [...inv.graphemes, g];
    save();
  }));
  app.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = () => {
    inv[b.dataset.remove] = inv[b.dataset.remove].filter((w) => w !== b.dataset.w);
    save();
  }));
  app.querySelectorAll('[data-add]').forEach((f) => (f.onsubmit = (e) => {
    e.preventDefault();
    const w = f.w.value.trim();
    if (!w || inv[f.dataset.add].includes(w)) return;
    inv[f.dataset.add] = [...inv[f.dataset.add], w];
    save();
  }));
}

// ---------- Sound lab (grown-ups) ----------
// Candidate recordings of each pure phonics sound (tools/sounds.mjs). Eli taps to listen and stars
// the one that sounds right; picks are saved, and the sound buttons will play them.

const EXAMPLES = {
  s: 'sun', m: 'map', f: 'fan', sh: 'ship', n: 'net', l: 'leg', z: 'zip', v: 'van', t: 'top', p: 'pig', k: 'kit',
  b: 'bat', d: 'dog', g: 'got', a: 'ant', e: 'egg', i: 'ink', o: 'on', u: 'up', ai: 'rain', ee: 'see',
  igh: 'night', oa: 'boat', oo: 'moon', ar: 'car', or: 'fork', ur: 'fur', ow: 'cow', oi: 'coin', ch: 'chip', th: 'thin',
};
const VOICE_NAMES = { pandora: 'Voice 1', athena: 'Voice 2', melo: 'Voice 3' };
let labAudio;

async function showSoundLab() {
  const [manifest, picks] = await Promise.all([
    fetch('/api/sounds/candidates.json').then((r) => (r.ok ? r.json() : [])),
    api('sound-picks'),
  ]);
  const picked = Object.keys(picks).length;
  app.innerHTML = `
    <div class="admin lab">
      <header>
        <h1>Sound lab</h1>
        <button class="done press" data-act="back">${ICONS.back} Grown-ups</button>
      </header>
      <section class="panel">
        <p>Tap a take to hear it. Star the one that sounds like the pure sound from class: "sss", not "suh",
          and a short clipped "t". Leave a sound unstarred if none are right; those will need recording.</p>
        <p class="muted">${picked} of ${manifest.length} sounds picked. Each take is labelled with how it was spelled for the voice.</p>
      </section>
      ${manifest.map(({ sound, takes }) => `
        <section class="panel labrow">
          <div class="labsound"><span class="tile on">${esc(sound)}</span><span class="muted">${esc(EXAMPLES[sound] || '')}</span></div>
          <div class="labtakes">
            ${Object.keys(VOICE_NAMES).map((v) => `
              <div class="labvoice"><span class="muted">${VOICE_NAMES[v]}</span>
                ${takes.filter((t) => t.voice === v).map((t) => `
                  <span class="take ${picks[sound] === t.key ? 'picked' : ''}">
                    <button class="press play" data-key="${esc(t.key)}">${ICONS.speaker} ${esc(t.text)}</button>
                    <button class="star-btn" data-sound="${esc(sound)}" data-key="${esc(t.key)}" aria-label="Pick">${STAR(picks[sound] === t.key)}</button>
                  </span>`).join('')}
              </div>`).join('')}
          </div>
        </section>`).join('') || '<section class="panel"><p>No candidates yet: run node tools/sounds.mjs.</p></section>'}
    </div>`;
  app.querySelector('[data-act=back]').onclick = () => (location.hash = '#/grownups');
  app.querySelectorAll('.play').forEach((b) => (b.onclick = () => {
    labAudio?.pause();
    labAudio = new Audio(`/api/sounds/${b.dataset.key}`);
    labAudio.play();
  }));
  app.querySelectorAll('.star-btn').forEach((b) => (b.onclick = async () => {
    const { sound, key } = b.dataset;
    await api('sound-picks', { method: 'PUT', body: { sound, key: picks[sound] === key ? null : key } });
    const y = scrollY;
    await showSoundLab();
    scrollTo(0, y);
  }));
}

function toast(text) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${ICONS.check} ${esc(text)}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1400);
}

route();
