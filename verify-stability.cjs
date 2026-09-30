const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs/promises');
const url=pathToFileURL(path.join(__dirname,'index.html')).href;
const key='perspective-grid-prototype-v3';

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(({key})=>{
      if(window.name.startsWith('fixture:')){localStorage.setItem(key,window.name.slice(8));window.name='';}
    },{key});
    await page.goto(url);await page.waitForTimeout(250);
    async function load(patch){
      await page.evaluate(p=>window.name='fixture:'+JSON.stringify(PerspectiveGeometry.normalize({showCube:true,...p})),patch);
      await page.reload();await page.waitForTimeout(230);
    }
    async function saved(){await page.waitForTimeout(240);return page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);}
    const raster=await page.evaluate(()=>{
      const G=PerspectiveGeometry,R=PerspectiveReference,records=[];
      const out=document.createElement('canvas'),ctx=out.getContext('2d',{willReadFrequently:true});
      out.width=640;out.height=400;
      for(const preset of ['free','one','two','three','five','ortho'])for(const referenceModel of ['box','table','room'])for(const focalLength of [10,35,300])for(const viewZoom of [50,300]){
        const initial=G.normalize({preset,referenceModel,focalLength,viewZoom,showCube:true,yaw:38,pitch:22,distance:16,modelPositions:{[referenceModel]:[2,-1,-2]}});
        const s=R.fitState(initial,G),cam=G.camera(s,640,400),points=R.framingPoints(s),projected=points.map(p=>G.project(p,cam));
        if(projected.some(p=>!p))throw new Error('Clipped fitted model');
        const model=R.inspectModel(s,cam);
        const original=R.inspectModel(G.normalize({...initial,modelPositions:{}}),cam);
        if(model.parts.some((part,i)=>part.size.some((v,k)=>Math.abs(v-original.parts[i].size[k])>1e-6)))throw new Error('Non-rigid mesh');
        let nativeError=0;
        if(!cam.fisheye){
          const native=R.projectNative(points,cam);
          projected.forEach((p,i)=>p.forEach((v,k)=>nativeError=Math.max(nativeError,Math.abs(v-native[i][k]))));
        }
        ctx.clearRect(0,0,640,400);ctx.drawImage(R.render(s,cam),0,0);
        const pixels=ctx.getImageData(0,0,640,400).data;
        let left=640,top=400,right=-1,bottom=-1,n=0;
        for(let y=0;y<400;y++)for(let x=0;x<640;x++)if(pixels[(y*640+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);n++;}
        const expected=[Math.min(...projected.map(p=>p[0])),Math.min(...projected.map(p=>p[1])),Math.max(...projected.map(p=>p[0])),Math.max(...projected.map(p=>p[1]))];
        const actual=[left,top,right,bottom];
        records.push({preset,referenceModel,focalLength,viewZoom,n,nativeError,error:Math.max(...expected.map((v,i)=>Math.abs(v-actual[i])))});
      }
      return records;
    });
    for(const record of raster){
      assert.ok(record.n>300,JSON.stringify(record));
      assert.ok(record.nativeError<1e-7,JSON.stringify(record));
      assert.ok(record.error<3,JSON.stringify(record));
    }
    console.log(`Raster oracle: ${raster.length} combinations, maximum boundary error ${Math.max(...raster.map(r=>r.error)).toFixed(3)} px`);

    const safety=await page.evaluate(()=>{
      const G=PerspectiveGeometry,R=PerspectiveReference;let count=0,minDepth=Infinity,maxShapeError=0;
      for(const preset of ['free','one','two','three','five','ortho'])for(const referenceModel of ['box','table','room'])for(const yaw of [-180,-90,0,90,180])for(const pitch of [-90,0,90]){
        const s=R.stabilize(G.normalize({preset,referenceModel,showCube:true,yaw,pitch,distance:4,boxSize:2.5,modelPositions:{[referenceModel]:[20,-9,18]}}),G);
        const cam=G.camera(s,640,400),points=R.framingPoints(s);
        minDepth=Math.min(minDepth,...points.map(p=>G.cameraPoint(p,cam)[2]));
        if(referenceModel==='box')for(const v of R.inspectModel(s,cam).size)maxShapeError=Math.max(maxShapeError,Math.abs(v-5));
        for(const axis of ['x','y','z']){
          const moved=R.moveAlongAxis(s,axis,[1e6,-1e6],640,400,G);
          minDepth=Math.min(minDepth,...R.framingPoints(moved).map(p=>G.cameraPoint(p,cam)[2]));
          for(let k=0;k<3;k++)if(k!==['x','y','z'].indexOf(axis)&&moved.modelPositions[referenceModel][k]!==s.modelPositions[referenceModel][k])throw new Error('Axis drift');
        }
        count++;
      }
      return {count,minDepth,maxShapeError};
    });
    assert.ok(safety.minDepth>.12);assert.ok(safety.maxShapeError<1e-7);console.log({safety});

    for(const referenceModel of ['box','table','room']){
      await load({preset:'three',referenceModel,boxSize:2.5,focalLength:10,distance:4,panX:100,panY:-100,viewZoom:300,modelPositions:{box:[100,-100,100],table:[100,-100,100],room:[100,-100,100]}});
      await page.locator('#resetBtn').click();const s=await saved();
      assert.deepEqual(s.modelPositions,{box:[0,0,0],table:[0,0,0],room:[0,0,0]});
      assert.equal(s.viewZoom,100);assert.equal(s.boxSize,1.5);assert.equal(s.preset,'three');
      const visible=await page.evaluate(s=>{
        const G=PerspectiveGeometry,R=PerspectiveReference,cam=G.camera(s,640,400);
        return R.framingPoints(s).every(p=>{const q=G.project(p,cam);return q&&q[0]>0&&q[0]<640&&q[1]>0&&q[1]<400;});
      },s);assert.equal(visible,true);
    }
    // Fit changes camera framing, never an object's position or lens/zoom.
    await load({referenceModel:'table',modelPositions:{table:[-12,5,-3]},viewZoom:170});
    const fitBefore=await saved();await page.locator('#fitBtn').click();const fitAfter=await saved();
    assert.deepEqual(fitAfter.modelPositions,fitBefore.modelPositions);
    assert.equal(fitAfter.focalLength,fitBefore.focalLength);assert.equal(fitAfter.viewZoom,fitBefore.viewZoom);

    async function startDrag(){
      const r=await page.locator('#scene').boundingBox();
      await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
      await page.mouse.move(r.x+r.width/2+65,r.y+r.height/2+20,{steps:6});
    }
    for(const cancel of ['escape','blur','pointercancel','resize']){
      await load({preset:'three'});const initial=await saved();
      await page.keyboard.down('Shift');await startDrag();
      if(cancel==='escape')await page.keyboard.press('Escape');
      if(cancel==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      if(cancel==='pointercancel')await page.locator('#scene').dispatchEvent('pointercancel',{pointerId:1});
      if(cancel==='resize')await page.setViewportSize({width:1300,height:900});
      await page.mouse.up();await page.keyboard.up('Shift');
      assert.deepEqual((await saved()).modelPositions,initial.modelPositions,cancel);
      await startDrag();await page.mouse.up();assert.notEqual((await saved()).yaw,initial.yaw,cancel);
      await page.setViewportSize({width:1440,height:1000});
    }
    // Exactly frontal fisheye: Ctrl+Shift selects the central depth axis.
    await load({preset:'five',yaw:0,pitch:0,focalLength:10});const initial=await saved();
    await page.keyboard.down('Control');await page.keyboard.down('Shift');await startDrag();
    await page.mouse.up();await page.keyboard.up('Shift');await page.keyboard.up('Control');
    const central=await saved();assert.notEqual(central.modelPositions.box[2],0);
    assert.equal(central.modelPositions.box[0],0);assert.equal(central.modelPositions.box[1],0);
    assert.equal(central.distance,initial.distance);

    await load({preset:'three',showGrid:true,showAxes:true});
    await page.locator('#exportFormat').selectOption('png');
    const pending=page.waitForEvent('download');await page.locator('#exportBtn').click();const download=await pending;
    const png=await fs.readFile(await download.path());
    const alpha=await page.evaluate(async data=>{
      const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
      const pixels=ctx.getImageData(0,0,c.width,c.height).data;let transparent=0,ink=0;
      for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;else ink++;}
      return {transparent,ink,width:c.width,height:c.height};
    },png.toString('base64'));
    assert.equal(alpha.width,2400);assert.equal(alpha.height,1500);assert.ok(alpha.transparent>alpha.ink*4);assert.ok(alpha.ink>1000);
    await page.locator('#imageFile').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:png});
    await page.waitForTimeout(150);assert.equal(await page.locator('#referenceChip').isVisible(),true);
    await page.locator('#removeImage').click();assert.equal(await page.locator('#referenceChip').isHidden(),true);

    await page.evaluate(()=>{
      const s=PerspectiveGeometry.normalize({showCube:true});
      const canvas=PerspectiveReference.render(s,PerspectiveGeometry.camera(s,640,400));
      window.testContext=canvas.getContext('webgl2').getExtension('WEBGL_lose_context');window.testContext.loseContext();
    });
    await page.waitForTimeout(200);assert.equal(await page.locator('#renderError').isVisible(),true);
    await page.evaluate(()=>window.testContext.restoreContext());await page.waitForTimeout(600);
    assert.equal(await page.locator('#renderError').isHidden(),true);

    const migration=await browser.newPage();
    const old={preset:'one',panX:2000,panY:2000,modelPositions:{box:[100,100,100]},color:'#123456',xCount:7,preserveShape:true};
    await migration.addInitScript(({old,key})=>{localStorage.removeItem(key);localStorage.setItem('perspective-grid-prototype-v2',JSON.stringify(old));},{old,key});
    await migration.goto(url);await migration.waitForTimeout(300);
    const stored=await migration.evaluate(key=>({old:JSON.parse(localStorage.getItem('perspective-grid-prototype-v2')),next:JSON.parse(localStorage.getItem(key))}),key);
    assert.deepEqual(stored.old,old);assert.equal(stored.next.color,'#123456');assert.equal(stored.next.xCount,7);
    assert.equal(stored.next.panX,0);assert.deepEqual(stored.next.modelPositions.box,[0,0,0]);
    await migration.close();
    for(const value of ['{invalid','null','[]','42']){
      await page.evaluate(v=>window.name='fixture:'+v,value);await page.reload();
      assert.equal((await saved()).distance,16);assert.equal(await page.locator('#renderError').isHidden(),true);
    }
    const blocked=await browser.newPage();blocked.on('pageerror',e=>errors.push(e.message));
    await blocked.addInitScript(()=>{Storage.prototype.getItem=Storage.prototype.setItem=function(){throw new Error('Storage disabled');};});
    await blocked.goto(url);await blocked.locator('#resetBtn').click();await blocked.waitForTimeout(300);
    assert.equal(await blocked.locator('#renderError').isHidden(),true);await blocked.close();

    await load({preset:'three',referenceModel:'box',showAxes:true});
    for(const [width,height] of [[1920,1080],[1024,768],[375,812],[320,740]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(200);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const rect=await page.locator('#scene').boundingBox();assert.ok(rect.width>150&&rect.height>100);
      await page.screenshot({path:path.join(os.tmpdir(),`perspective-v12-${width}.png`),fullPage:true});
    }
    const retina=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
    retina.on('pageerror',e=>errors.push(e.message));await retina.goto(url);await retina.waitForTimeout(250);
    assert.ok(await retina.locator('#scene').evaluate(c=>Math.abs(c.width/c.getBoundingClientRect().width-2)<.01));
    await retina.screenshot({path:path.join(os.tmpdir(),'perspective-v12-retina.png')});await retina.close();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({rasterCases:raster.length,safety,gestures:'escape, blur, cancellation, resize, central fisheye',recovery:'all models; migration; invalid and unavailable storage; WebGL context restored',png:alpha,responsive:[1920,1024,375,320],dpr:2,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
