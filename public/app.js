import { tokenize, isWord, normalize, classify, unreadable, forStory, CATALOG_GROUPS } from './phonics.js';
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

let inventory;
const getInventory = async () => inventory || (inventory = await api('inventory'));
const storyCache = {};
const getStory = async (id) => storyCache[id] || (storyCache[id] = await api('stories/' + id));

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

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice ? voice.lang : 'en-GB';
  u.rate = 0.7;
  speechSynthesis.speak(u);
}

// ---------- Router ----------

let grownUp = false; // passed the gate this session

async function route() {
  closePop();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const [, view, id, page] = location.hash.split('/');
  try {
    if (view === 'read' && id) await showReader(id, Number(page) || 0);
    else if (view === 'grownups') grownUp ? await showGrownups() : showGate();
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
      route();
      return true;
    },
  });
}

// ---------- Library ----------

async function showLibrary() {
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
  if (info.kind === 'decodable') {
    pop.innerHTML = `
      <div class="chips">${info.parts.map((p) => `<div class="chip ${chipClass(p)}">${esc(p.text)}<span class="mark"></span></div>`).join('')}</div>
      <div class="actions">
        <button class="press" data-a="sound">${ICONS.sound} Sound it out</button>
        <button class="press" data-a="say" aria-label="Say it">${ICONS.speaker}</button>
      </div>`;
  } else {
    const badge = { tricky: `${STAR(true)} Tricky word`, name: 'A name', unknown: 'New word' }[info.kind];
    pop.innerHTML = `
      <div class="whole">${esc(word)}</div>
      ${badge ? `<div class="badge">${badge}</div>` : ''}
      <div class="actions"><button class="press" data-a="say">${ICONS.speaker} Say it</button></div>`;
  }
  document.body.appendChild(pop);
  if (info.kind === 'decodable') drawLinks(pop, info.parts);
  place(pop, el);

  pop.querySelector('[data-a=say]').onclick = () => speak(word);
  const sound = pop.querySelector('[data-a=sound]');
  if (sound) sound.onclick = () => soundOut(pop, word, info.parts);
}

// Sound buttons: a dot for one letter, a bar for letters making one sound,
// and for silent e an arc joining the vowel to its e (drawn by drawLinks).
function chipClass(p) {
  if (p.g !== p.text) return 'split';
  return p.text.length > 1 ? 'many' : 'one';
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
    if (part.g === part.text || part.silent) return '';
    const a = chips[i], b = chips[partner(parts, i)];
    const x1 = centre(a), x2 = centre(b), y = a.offsetTop + a.offsetHeight - 6;
    return `<path d="M${x1} ${y} Q${(x1 + x2) / 2} ${y + 30} ${x2} ${y}"/>`;
  }).join('');
  row.insertAdjacentHTML('beforeend', `<svg class="links" width="${row.offsetWidth}" height="${row.offsetHeight + 24}">${paths}</svg>`);
}

// Light up each sound in turn (a silent-e vowel lights with its e), then blend: say the whole word.
function soundOut(p, word, parts) {
  const chips = [...p.querySelectorAll('.chip')];
  const steps = parts.map((_, i) => i).filter((i) => !parts[i].silent);
  steps.forEach((i, n) => setTimeout(() => {
    chips.forEach((x) => x.classList.remove('lit'));
    chips[i].classList.add('lit');
    if (parts[i].g !== parts[i].text) chips[partner(parts, i)].classList.add('lit');
  }, n * 650));
  setTimeout(() => {
    chips.forEach((c) => c.classList.add('lit'));
    speak(word);
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
    `<button class="tile ${inv.graphemes.includes(g) ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('');
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

function toast(text) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${ICONS.check} ${esc(text)}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1400);
}

route();
