import { tokenize, isWord, normalize } from './phonics.js';

const app = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- API ----------

class NeedPin extends Error {}

async function api(path, options = {}) {
  const res = await fetch('/api/' + path, {
    ...options,
    headers: { 'content-type': 'application/json' },
    body: options.body && JSON.stringify(options.body),
  });
  if (res.status === 401) throw new NeedPin();
  return res.json();
}

function log(type, data = {}) {
  api('events', { method: 'POST', body: { type, ...data } }).catch(() => {});
}

// ---------- Speech ----------

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

function speak(text, { rate = 0.8, onBoundary, onEnd } = {}) {
  if (!('speechSynthesis' in window)) return onEnd && onEnd();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice ? voice.lang : 'en-GB';
  u.rate = rate;
  if (onBoundary) u.onboundary = (e) => e.name !== 'sentence' && onBoundary(e.charIndex);
  if (onEnd) u.onend = u.onerror = onEnd;
  speechSynthesis.speak(u);
}

// ---------- Router ----------

async function route() {
  closePop();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const [, view, id, page] = location.hash.split('/');
  try {
    if (view === 'read' && id) await showReader(id, Number(page) || 0);
    else await showLibrary();
  } catch (e) {
    if (e instanceof NeedPin) showPin();
    else app.innerHTML = `<div class="end"><div class="big">Oops!</div><p>${esc(e.message)}</p></div>`;
  }
}
window.addEventListener('hashchange', route);

// ---------- PIN ----------

function showPin() {
  let entered = '';
  app.innerHTML = `
    <div class="pin">
      <h1>Yara Reads</h1>
      <div class="dots">${'<span></span>'.repeat(4)}</div>
      <div class="keys">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
        <span></span><button data-k="0">0</button><button data-k="back">⌫</button>
      </div>
    </div>`;
  const dots = app.querySelector('.dots');
  const paint = () => dots.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i < entered.length));
  app.querySelector('.keys').addEventListener('click', async (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    entered = k === 'back' ? entered.slice(0, -1) : (entered + k).slice(0, 4);
    paint();
    if (entered.length < 4) return;
    const res = await fetch('/api/login', { method: 'POST', body: JSON.stringify({ pin: entered }) });
    if (res.ok) return route();
    entered = '';
    dots.classList.add('shake');
    setTimeout(() => { dots.classList.remove('shake'); paint(); }, 400);
  });
}

// ---------- Library ----------

async function showLibrary() {
  const stories = await api('stories');
  const series = [...new Set(stories.map((s) => s.series))];
  app.innerHTML = `
    <div class="library">
      <h1>Yara Reads</h1>
      ${series.map((name) => `
        <h2>${esc(name)}</h2>
        <div class="shelf">
          ${stories.filter((s) => s.series === name).map((s) => `
            <button class="book" data-id="${esc(s.id)}">
              <span class="num">Book ${s.number}</span>
              <span class="title">${esc(s.title)}</span>
              <span class="stars">${'⭐'.repeat(Math.min(s.finished, 3))}</span>
            </button>`).join('')}
        </div>`).join('')}
      <details class="grownups"><summary>For grown-ups</summary><div class="grownup-body">Loading…</div></details>
    </div>`;
  app.querySelectorAll('.book').forEach((b) => (b.onclick = () => (location.hash = `#/read/${b.dataset.id}/0`)));
  app.querySelector('.grownups').addEventListener('toggle', showGrownups, { once: true });
}

async function showGrownups() {
  const { taps, days } = await api('progress');
  app.querySelector('.grownup-body').innerHTML = `
    <p><b>Words she tapped most</b> (the ones to practise):</p>
    <div class="chips">${taps.map((t) => `<span>${esc(t.word)} ×${t.taps}</span>`).join('') || 'None yet.'}</div>
    <p><b>Recent days</b></p>
    <div>${days.map((d) => `${d.day}: ${d.pages} pages, ${d.stories} stories`).join('<br>') || 'Nothing yet.'}</div>`;
}

// ---------- Reader ----------

const storyCache = {};

async function showReader(id, pageIndex) {
  const story = storyCache[id] || (storyCache[id] = await api('stories/' + id));
  if (pageIndex >= story.pages.length) return showEnd(story);
  if (pageIndex === 0) log('open', { storyId: id });
  log('page', { storyId: id, page: pageIndex });

  const page = story.pages[pageIndex];
  let offset = 0;
  const words = tokenize(page.text).map((t) => {
    const start = offset;
    offset += t.length;
    return isWord(t) ? `<span class="w" data-start="${start}" data-word="${esc(t)}">${esc(t)}</span>` : esc(t);
  });

  app.innerHTML = `
    <div class="reader">
      <div class="topbar">
        <button class="round" data-act="home" aria-label="Home">🏠</button>
        <div class="title">${esc(story.title)}</div>
        <button class="round" data-act="read" aria-label="Read to me">🔊</button>
      </div>
      <div class="page"><div class="text">${words.join('')}</div></div>
      <div class="nav">
        <button class="round" data-act="prev" ${pageIndex === 0 ? 'disabled' : ''} aria-label="Back">◀</button>
        <div class="progress">${story.pages.map((_, i) => `<span class="${i <= pageIndex ? 'on' : ''}"></span>`).join('')}</div>
        <button class="round" data-act="next" aria-label="Next">▶</button>
      </div>
    </div>`;

  const go = (i) => (location.hash = `#/read/${id}/${i}`);
  app.querySelector('[data-act=home]').onclick = () => (location.hash = '#/');
  app.querySelector('[data-act=prev]').onclick = () => pageIndex > 0 && go(pageIndex - 1);
  app.querySelector('[data-act=next]').onclick = () => go(pageIndex + 1);
  app.querySelector('[data-act=read]').onclick = (e) => readAloud(page.text, e.currentTarget, id, pageIndex);
  app.querySelectorAll('.w').forEach((el) => (el.onclick = (e) => {
    e.stopPropagation();
    openPop(el, story);
  }));
}

function readAloud(text, button, storyId, page) {
  if (button.classList.contains('playing')) {
    speechSynthesis.cancel();
    return;
  }
  closePop();
  log('read_aloud', { storyId, page });
  const spans = [...app.querySelectorAll('.w')];
  const clear = () => spans.forEach((s) => s.classList.remove('spoken'));
  button.classList.add('playing');
  speak(text, {
    rate: 0.75,
    onBoundary: (i) => {
      clear();
      const hit = spans.filter((s) => Number(s.dataset.start) <= i).pop();
      if (hit) hit.classList.add('spoken');
    },
    onEnd: () => { clear(); button.classList.remove('playing'); },
  });
}

// ---------- Word popover: the hint lives right on the word ----------

let pop;
function closePop() {
  if (pop) pop.remove();
  pop = null;
  document.querySelectorAll('.w.active').forEach((w) => w.classList.remove('active'));
}
document.addEventListener('click', (e) => pop && !pop.contains(e.target) && closePop());

function openPop(el, story) {
  closePop();
  const word = el.dataset.word;
  const info = story.words?.[normalize(word)] || { kind: 'unknown' };
  const parts = info.parts;
  el.classList.add('active');
  log('tap', { storyId: story.id, word: normalize(word) });

  pop = document.createElement('div');
  pop.className = 'pop';
  if (info.kind === 'decodable' && parts) {
    pop.innerHTML = `
      <div class="chips">${parts.map((g) => `<div class="chip ${g.length > 1 ? 'many' : 'one'}">${esc(g)}<span class="mark"></span></div>`).join('')}</div>
      <div class="actions"><button data-a="sound">👆 Sound it out</button><button data-a="say">🔊</button></div>`;
  } else {
    const label = info.kind === 'tricky' ? '⭐ Tricky word' : info.kind === 'name' ? '🙂 A name' : '';
    pop.innerHTML = `
      <div class="whole">${esc(word)}</div>
      ${label ? `<div class="badge">${label}</div>` : ''}
      <div class="actions"><button data-a="say">🔊 Say it</button></div>`;
  }
  document.body.appendChild(pop);
  place(pop, el);

  pop.querySelector('[data-a=say]').onclick = () => speak(word, { rate: 0.7 });
  const sound = pop.querySelector('[data-a=sound]');
  if (sound) sound.onclick = () => soundOut(pop, word);
}

// Light up each sound button in turn, then blend: say the whole word.
function soundOut(p, word) {
  const chips = [...p.querySelectorAll('.chip')];
  chips.forEach((c) => c.classList.remove('lit'));
  chips.forEach((c, i) => setTimeout(() => {
    chips.forEach((x) => x.classList.remove('lit'));
    c.classList.add('lit');
  }, i * 650));
  setTimeout(() => {
    chips.forEach((c) => c.classList.add('lit'));
    speak(word, { rate: 0.7 });
  }, chips.length * 650);
}

function place(p, el) {
  const r = el.getBoundingClientRect();
  const w = p.offsetWidth, h = p.offsetHeight, m = 8;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(m, Math.min(left, innerWidth - w - m));
  let top = r.top - h - 12;
  if (top < m) top = r.bottom + 12;
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
      <div class="big">The End</div>
      <div class="stars">⭐⭐⭐</div>
      <div style="font-size:28px">You read <b>${esc(story.title)}</b>!</div>
      ${next ? `<button class="next">Next: ${esc(next.title)} ▶</button>` : ''}
      <button class="home">🏠 All books</button>
    </div>`;
  if (next) app.querySelector('.next').onclick = () => (location.hash = `#/read/${next.id}/0`);
  app.querySelector('.home').onclick = () => (location.hash = '#/');
}

route();
