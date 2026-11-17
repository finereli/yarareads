// Screenshots of the live reader paging through a chapter, for video.sh.
// node marketing/pinterest/video-frames.mjs <dir> [story] [pages, 0-based, comma-separated] [word to tap on the first page]
// Defaults: chapter 1, with "scooter" tapped (the 20-video).
import { chromium } from 'playwright';
const [out, story = 'toby-1', pageList = '0,1,3,4,5,6,8', tap = story === 'toby-1' ? 'scooter' : ''] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 });
let n = 0;
const shot = async () => p.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}.png` });
const pages = pageList.split(',').map(Number);
for (const i of pages) {
  await p.goto(`https://yarareads.finereli.com/#/read/${story}/${i}`); await p.reload(); await p.waitForTimeout(2500);
  await shot();
  if (i === pages[0] && tap) {
    await p.click(`.w[data-word="${tap}"]`); await p.waitForTimeout(1200);
    await p.evaluate(() => {
      const pop = document.querySelector('.pop'), first = document.querySelector('.w').getBoundingClientRect(), w = document.querySelector('.w.active').getBoundingClientRect();
      pop.style.top = (first.top - pop.offsetHeight - 28) + 'px'; pop.style.left = (w.left + w.width / 2 - pop.offsetWidth / 2) + 'px';
    });
    await p.waitForTimeout(300); await shot();
  }
}
await b.close();
console.log(n);
