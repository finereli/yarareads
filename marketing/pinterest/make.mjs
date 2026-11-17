// Pinterest pins (1000x1500, 2:3) from the book's own pictures, in the app's fonts and colours.
// node marketing/pinterest/make.mjs [id prefixes]  ->  marketing/pinterest/pins/*.jpg
// The copy for each pin (title, description, link) is in pins.json; src/ holds app screenshots.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const pins = JSON.parse(readFileSync(`${here}pins.json`, 'utf8'));
const uri = (path, type) => `data:${type};base64,${readFileSync(path).toString('base64')}`;
const font = (f) => uri(`${root}public/fonts/${f}`, 'font/woff2');
const logo = readFileSync(`${root}public/icon.svg`, 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const css = `
@font-face { font-family: Fredoka; src: url(${font('fredoka.woff2')}); font-weight: 300 700; }
@font-face { font-family: Andika; src: url(${font('andika-400.woff2')}); }
* { margin: 0; box-sizing: border-box; }
body { width: 1000px; height: 1500px; background: #fbf5ea; color: #2a2440; font-family: Fredoka; display: flex; flex-direction: column;
  background-image: radial-gradient(circle at 85% 8%, #fde9b8 0, transparent 38%), radial-gradient(circle at 5% 95%, #fbe2da 0, transparent 40%); }
header { padding: 78px 70px 0; }
.kicker { font-size: 30px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #e0533a; margin-bottom: 18px; }
h1 { font-size: 78px; line-height: 1.04; font-weight: 700; letter-spacing: -.01em; }
.sub { font-size: 36px; line-height: 1.3; color: #6e6585; margin-top: 22px; font-weight: 500; }
.pic { margin: 48px 60px 0; border-radius: 36px; overflow: hidden; box-shadow: 0 18px 40px rgba(42,36,64,.18); flex: 1 1 auto; min-height: 0; background: #f2e7d3; }
.pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pic.shot { flex: 0 1 auto; margin: 40px auto 0; width: 700px; border: 10px solid #2a2440; border-radius: 48px; }
.pic.shot img { object-fit: cover; object-position: top; }
.strip { margin: 40px 50px 0; display: flex; flex-direction: column; gap: 26px; flex: 1 1 auto; }
.spread { display: flex; background: #fffdf8; border-radius: 28px; overflow: hidden; box-shadow: 0 12px 30px rgba(42,36,64,.14); height: 330px; }
.spread img { width: 440px; height: 100%; object-fit: cover; flex: none; }
.spread p { font-family: Andika; font-size: 34px; line-height: 1.38; padding: 0 34px; align-self: center; }
.points { margin: 34px 70px 0; padding-left: 44px; font-size: 38px; line-height: 1.3; font-weight: 500; }
.points li { margin-bottom: 14px; }
.line { font-family: Andika; font-size: 40px; line-height: 1.35; margin: 34px 70px 0; }
footer { display: flex; align-items: center; gap: 18px; padding: 34px 70px 56px; font-size: 34px; font-weight: 600; }
footer svg { width: 64px; height: 64px; }
footer .url { color: #6e6585; font-weight: 500; margin-left: auto; font-size: 30px; }
`;

const page = (p) => `<!doctype html><meta charset="utf-8"><style>${css}</style>
<header>${p.kicker ? `<div class="kicker">${esc(p.kicker)}</div>` : ''}<h1>${esc(p.headline)}</h1>${p.sub ? `<div class="sub">${esc(p.sub)}</div>` : ''}</header>
${p.pages ? `<div class="strip">${p.pages.map((g) => `<div class="spread"><img src="${uri(`${root}${g.image}`, 'image/jpeg')}"><p>${esc(g.text)}</p></div>`).join('')}</div>`
  : `<div class="pic${p.shot ? ' shot' : ''}"><img src="${uri(`${root}${p.image}`, p.image.endsWith('.png') ? 'image/png' : 'image/jpeg')}"></div>`}
${p.line ? `<p class="line">${esc(p.line)}</p>` : ''}
${p.points ? `<ul class="points">${p.points.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
<footer>${logo}<span>Read it free</span><span class="url">yarareads.finereli.com</span></footer>`;

mkdirSync(`${here}pins`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const tab = await browser.newPage({ viewport: { width: 1000, height: 1500 } });
const only = process.argv.slice(2);
for (const p of pins) {
  if (p.video) continue; // made by video.sh
  if (only.length && !only.some((o) => p.id.startsWith(o))) continue;
  await tab.setContent(page(p), { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  const png = await tab.screenshot({ type: 'png' });
  await sharp(png).jpeg({ quality: 88, mozjpeg: true }).toFile(`${here}pins/${p.id}.jpg`);
  console.log(p.id);
}
await browser.close();
writeFileSync(`${here}pins.md`, `# Pinterest pins\n\nMade by make.mjs from pins.json (the video by video.sh). Upload pins/<id> with the title, description, link and board below.\n\n` +
  `The positioning they follow: finereli/claude-skills, promote/apps/yarareads/positioning.md. Story first, American English, no "decodable" or "app" in headlines (those words live in descriptions, for search).\n\n` +
  `The posting order is the queue in posted.json (the scheduled task posts two every couple of days). Two boards: "${pins[0].board}" and "${pins[1].board}".\n\n` +
  pins.map((p) => `## ${p.id}\n\n**Title:** ${p.title}\n\n**Description:** ${p.description}\n\n**Link:** ${p.link}\n\n**Board:** ${p.board}\n`).join('\n') +
  `\n## 20-video (video.sh)\n\n**Title:** Julia and Toby, book 1: a dragon story new readers can read themselves\n\n` +
  `**Description:** Page through book 1 of Julia and Toby, a fantasy series for kids who have just learned to read. Julia finds a runaway dragon crying under a tree, and a new reader can read every word. Stuck on one? Tap it and its sounds appear. Free to read on any tablet, phone or computer. No ads, no account.\n\n` +
  `**Link:** https://yarareads.finereli.com/?from=pinterest#/read/toby-1/0\n\n**Board:** ${pins[0].board}\n`);
