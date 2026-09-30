const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Browser-only Spectrum stand-ins. Native UXP widgets still require host QA.
  await page.addInitScript(()=>{
   class Slider extends HTMLElement{
    constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>:host{color:#afb8bc;font:11px Segoe UI}label{display:flex;justify-content:space-between;padding:4px 0}input{width:100%;margin:5px 0;accent-color:#aaa}</style><label><slot name="label"></slot><output></output></label><input type="range">';}
    connectedCallback(){const i=this.shadowRoot.querySelector('input');for(const k of ['min','max','step'])i[k]=this.getAttribute(k)||'';if(this._value===undefined)this.value=Number(this.getAttribute('value')||i.min);i.oninput=()=>{this.value=Number(i.value);this.dispatchEvent(new Event('input'));};i.onchange=()=>this.dispatchEvent(new Event('change'));}
    get value(){return this._value;}set value(v){this._value=v;this.shadowRoot.querySelector('input').value=v;this.shadowRoot.querySelector('output').textContent=v;}
   }
   class Dropdown extends HTMLElement{
    constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>select{width:100%;height:100%;min-height:28px;background:#1b1d1e;color:#ddd;border:1px solid #495055;border-radius:3px;font:11px Segoe UI;padding:0 5px}</style><select></select>';}
    connectedCallback(){this.update();this.observer=new MutationObserver(()=>this.update());this.observer.observe(this,{childList:true,subtree:true});this.shadowRoot.querySelector('select').onchange=e=>{this._selected=e.target.selectedIndex;this.dispatchEvent(new Event('change'));};}
    disconnectedCallback(){this.observer.disconnect();}
    update(){const s=this.shadowRoot.querySelector('select');s.innerHTML=[...this.querySelectorAll('sp-menu-item')].map(e=>`<option>${e.textContent}</option>`).join('');s.selectedIndex=this._selected||0;}
    get selectedIndex(){return this._selected||0;}set selectedIndex(v){this._selected=v;this.shadowRoot.querySelector('select').selectedIndex=v;}
   }
   class Checkbox extends HTMLElement{
    constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>label{display:flex;align-items:center;font:11px Segoe UI;color:#aab5bb;white-space:nowrap}input{margin:4px 5px 4px 0;accent-color:#aaa}</style><label><input type="checkbox"><slot></slot></label>';}
    connectedCallback(){if(this._checked===undefined)this.checked=this.hasAttribute('checked');this.shadowRoot.querySelector('input').onchange=e=>{this.checked=e.target.checked;this.dispatchEvent(new Event('change'));};}
    get checked(){return this._checked;}set checked(v){this._checked=v;this.shadowRoot.querySelector('input').checked=v;}
   }
   customElements.define('sp-slider',Slider);customElements.define('sp-dropdown',Dropdown);customElements.define('sp-checkbox',Checkbox);
  });
  const url=pathToFileURL(path.resolve(__dirname,'../uxp/index.html')).href;
  let cases=0;
  for(const [width,height] of [[320,420],[340,640],[480,900]]){
   await page.setViewportSize({width,height});await page.goto(url);await page.waitForFunction(()=>document.querySelector('#preview').naturalWidth>0);
   for(const tab of ['camera','grid','model']){
    await page.click(`[data-tab=${tab}]`);
    const result=await page.evaluate(()=>{const a=document.querySelector('.actions').getBoundingClientRect(),s=document.querySelector('.tab-scroll').getBoundingClientRect();return {one:document.querySelectorAll('[data-tabbody]').length===1,footer:a.bottom<=innerHeight+1,scroll:s.bottom<=a.top+1,overflow:document.documentElement.scrollWidth>innerWidth};});
    assert.deepEqual(result,{one:true,footer:true,scroll:true,overflow:false});cases++;
    await page.screenshot({path:path.join(__dirname,`uxp-layout-${width}-${tab}.png`)});
   }
  }
  async function dd(id,value){await page.evaluate(({id,value})=>{const e=document.getElementById(id);e.selectedIndex=[...e.querySelectorAll('sp-menu-item')].findIndex(x=>x.getAttribute('value')===value);e.dispatchEvent(new Event('change'));},{id,value});}
  await page.click('[data-tab=camera]');await dd('preset','two');assert(await page.locator('#pitchDeg').isDisabled());
  await dd('lensPreset','85');assert.equal(await page.locator('#focalLength').evaluate(e=>e.value),85);
  assert.equal(await page.locator('#viewZoom').evaluate(e=>e.value),100);
  await dd('preset','five');assert(await page.locator('#distortion').isVisible());
  await page.click('[data-tab=grid]');await page.fill('#xCountNum','27');await page.locator('#xCountNum').dispatchEvent('change');
  await page.click('[data-tab=model]');await page.click('#modelAdvancedBtn');assert(await page.locator('#posX').isVisible());
  await dd('moveMode','depth');assert(await page.locator('#depthAxisRow').isVisible());
  await page.locator('#modelOpacity').evaluate(e=>{e.value=44;e.dispatchEvent(new Event('change'));});
  await page.click('[data-tab=grid]');assert.equal(await page.inputValue('#xCountNum'),'27');
  await page.click('[data-tab=model]');assert.equal(await page.locator('#modelOpacity').evaluate(e=>e.value),44);
  assert(await page.locator('#depthAxisRow').isVisible());assert(await page.locator('#applyBtn').isDisabled());
  assert.deepEqual(errors,[]);console.log(`${cases} layout checks passed; tabs, lens, counts, opacity and depth passed. Browser Spectrum stand-ins only; Photoshop not tested.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
