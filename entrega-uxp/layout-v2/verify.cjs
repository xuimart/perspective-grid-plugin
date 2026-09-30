const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    let cases = 0;
    for (const [width, height] of [[320,420],[340,640],[360,700],[480,900]]) {
      await page.setViewportSize({width,height});
      await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
      for (const tab of ['camera','grid','model']) {
        await page.click(`[data-tab=${tab}]`);
        const layout = await page.evaluate(() => {
          const footer = document.querySelector('.footer').getBoundingClientRect();
          const scroll = document.querySelector('.scroll').getBoundingClientRect();
          const rows = [...document.querySelector('.page:not([hidden])').children].filter(e=>!e.hidden&&e.getBoundingClientRect().height>0).map(e=>e.getBoundingClientRect());
          return {footer:footer.bottom<=innerHeight, separated:scroll.bottom<=footer.top+1,
            overflow:document.documentElement.scrollWidth>innerWidth,
            overlap:rows.some((r,i)=>i>0&&r.top<rows[i-1].bottom-1),
            image:document.querySelector('header img').naturalWidth>0,
            cube:document.querySelector('canvas').getContext('2d').getImageData(0,0,176,176).data.some((v,i)=>i%4===3&&v>0)};
        });
        assert.deepEqual(layout,{footer:true,separated:true,overflow:false,overlap:false,image:true,cube:true});
        await page.screenshot({path:path.join(__dirname,`preview-${width}-${height}-${tab}.png`)});
        cases++;
      }
    }
    await page.click('[data-tab=camera]');
    await page.selectOption('#perspective','fish');
    assert(await page.locator('#distortion-control').isVisible());
    await page.fill('#lens-n','100'); await page.locator('#lens-n').dispatchEvent('input');
    assert.equal(await page.inputValue('#zoom-n'),'100');
    await page.selectOption('#perspective','two');
    assert(await page.locator('#pitch-n').isDisabled());
    await page.click('[data-tab=model]'); await page.click('#model summary'); await page.click('#back');
    assert.equal(await page.locator('.xyz input').first().inputValue(),'1');
    await page.click('#center'); assert.equal(await page.locator('.xyz input').first().inputValue(),'0');
    await page.click('#apply'); assert((await page.locator('#status').textContent()).includes('exige'));
    assert.deepEqual(errors,[]);
    console.log(`${cases} layout cases passed; controls passed; no page errors.`);
  } finally { await browser.close(); }
})();
