const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const os=require('node:os');

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
    const results=await page.evaluate(()=>{
      const G=PerspectiveGeometry,R=PerspectiveReference,tiles=[];
      for(const referenceModel of ['box','table','room'])for(const [yaw,pitch] of [[43,20],[0,0],[80,45],[130,-35]]){
        const s=G.normalize({showCube:true,referenceModel,yaw,pitch,distance:20});
        const c=document.createElement('canvas');c.width=480;c.height=320;
        const ctx=c.getContext('2d');ctx.fillStyle='#dedfdf';ctx.fillRect(0,0,480,320);
        const cam=G.camera(s,480,300);ctx.drawImage(R.render(s,cam),0,0);
        ctx.fillStyle='#111';ctx.font='14px sans-serif';ctx.fillText(`${referenceModel} ${yaw} / ${pitch}`,12,314);
        tiles.push(c);
      }
      const out=document.createElement('canvas');out.width=1920;out.height=960;
      tiles.forEach((c,i)=>out.getContext('2d').drawImage(c,i%4*480,Math.floor(i/4)*320));
      document.body.replaceChildren(out);document.body.style.margin='0';
      return {tiles:tiles.length};
    });
    await page.setViewportSize({width:1920,height:960});
    const file=path.join(os.tmpdir(),'perspective-audit-models.png');
    await page.screenshot({path:file});console.log(JSON.stringify({...results,file}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
