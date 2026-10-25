// Renders catalogue.html to a print PDF plus PNG previews of every page.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 1200 }, deviceScaleFactor: 2 });
  await page.goto('file://' + path.join(root, 'catalogue.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(root, 'Creative-Threads-Catalogue.pdf'), width: '960px', height: '1200px', printBackground: true });

  const out = path.join(root, 'build', 'preview');
  fs.mkdirSync(out, { recursive: true });
  const pages = await page.$$('section.page');
  for (let i = 0; i < pages.length; i++) {
    await pages[i].screenshot({ path: path.join(out, `p${String(i + 1).padStart(2, '0')}.png`) });
  }
  await browser.close();
  console.log('pages:', pages.length);
})();
