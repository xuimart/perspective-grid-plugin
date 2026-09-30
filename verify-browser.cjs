const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const os=require('node:os');

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    // Apply fixtures after pagehide has persisted the outgoing page's state.
    await page.addInitScript(()=>{
      if(window.name.startsWith('fixture:')){
        localStorage.setItem('perspective-grid-prototype-v3',window.name.slice(8));window.name='';
      }
    });
    await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
    async function load(patch){
      await page.evaluate(p=>window.name='fixture:'+JSON.stringify(PerspectiveGeometry.normalize({...PerspectiveGeometry.defaults,showCube:true,showGrid:false,showHorizon:false,showVps:false,...p})),patch);
      await page.reload();await page.waitForTimeout(180);
    }
    async function input(id,value){
      await page.locator('#'+id).fill(String(value));await page.locator('#'+id).dispatchEvent('input');
      await page.locator('#'+id).blur();await page.waitForTimeout(220);
    }
    async function metrics(){return page.evaluate(()=>{
      const c=document.getElementById('scene'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let l=c.width,r=0,t=c.height,b=0,n=0;
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
        const i=(y*c.width+x)*4;
        if(Math.abs(d[i]-222)+Math.abs(d[i+1]-223)+Math.abs(d[i+2]-223)>30){
          l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);n++;
        }
      }
      return {span:Math.max((r-l+1)/c.width,(b-t+1)/c.height),shapeRatio:(b-t+1)/(r-l+1),n,width:c.width,height:c.height,pixels:c.toDataURL()};
    });}
    const results=[];
    for(const preset of ['one','two','three','five','ortho']){
      await load({preset,focalLength:35,distance:24});const a=await metrics(),rect=await page.locator('#scene').boundingBox();
      await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.wheel(0,-120);await page.waitForTimeout(220);
      const b=await metrics();
      assert.equal(await page.locator('#focalLengthNumber').inputValue(),'35');
      assert.equal(await page.locator('#distanceNumber').inputValue(),'24');
      assert.equal(b.width,a.width);assert.equal(b.height,a.height);assert.ok(b.span>a.span*1.15);assert.ok(b.n>100);
      const cube=await page.locator('#cube').boundingBox();
      await page.mouse.move(cube.x+cube.width/2,cube.y+cube.height/2);await page.mouse.wheel(0,80);await page.waitForTimeout(220);
      assert.equal(await page.locator('#focalLengthNumber').inputValue(),'35');
      results.push({preset,zoomScale:b.span/a.span,canvas:[b.width,b.height]});
    }
    for(const referenceModel of ['box','table','room'])for(const preset of ['three','five']){
      await load({preset,referenceModel,focalLength:35,distance:24,viewZoom:120,yaw:25,pitch:15});const before=await metrics();
      for(const mm of [10,300,35]){
        await input('focalLengthNumber',mm);const after=await metrics();
        assert.equal(await page.locator('#viewZoom').inputValue(),'120');
        assert.ok(Math.abs(after.span-before.span)<.018,`${referenceModel}/${preset}/${mm}: ${before.span} -> ${after.span}`);
        if(mm!==35)assert.notEqual(before.pixels,after.pixels);
        results.push({referenceModel,preset,mm,span:after.span,distance:await page.locator('#distanceNumber').inputValue()});
      }
      if(preset==='five'){
        await input('distortionNumber',15);const after=await metrics();
        assert.ok(Math.abs(after.span-before.span)<.018);assert.equal(await page.locator('#viewZoom').inputValue(),'120');
      }
    }
    const native=await page.evaluate(()=>{
      const G=PerspectiveGeometry,points=[[-2,-1,-3],[2,1,3],[0,0,0]];let error=0;
      for(const preset of ['one','two','three','ortho'])for(const focalLength of [10,35,300]){
        const s=G.normalize({preset,focalLength,panX:17,panY:-9,viewZoom:140}),cam=G.camera(s,1036,648);
        const native=PerspectiveReference.projectNative(points,cam);
        for(let i=0;i<points.length;i++)error=Math.max(error,...native[i].map((v,k)=>Math.abs(v-G.project(points[i],cam)[k])));
      }
      const s=G.normalize({showCube:true,modelPositions:{box:[-15,4,7]}});
      return {error,model:PerspectiveReference.inspectModel(s,G.camera(s,1600,1000))};
    });
    assert.ok(native.error<1e-7);assert.deepEqual(native.model.size,[3,3,3]);assert.deepEqual(native.model.scale,[1.5,1.5,1.5]);
    results.push({nativeCamera:native});
    assert.equal(await page.locator('#naturalFrameBtn').count(),0);
    assert.equal(await page.locator('[data-key="preserveShape"]').count(),0);
    const shared=await page.evaluate(()=>{
      const G=PerspectiveGeometry,s=G.normalize({preset:'one',preserveShape:true,modelPositions:{box:[-10,19,0]}}),cam=G.camera(s,1600,1000);
      const actual=PerspectiveReference.projectNative([[-11,18,-1],[-11,18,1]],cam),vp=G.vanishingPoints(cam)[0];
      const [a,b]=actual;
      return Math.abs((b[0]-a[0])*(vp.y-a[1])-(b[1]-a[1])*(vp.x-a[0]));
    });assert.ok(shared<1e-6);
    for(const preset of ['one','two','three','five','ortho']){
      const fixture={preset,referenceModel:'box',focalLength:14,distance:24,yaw:43,pitch:20,modelPositions:{box:[2,1,0]}};
      await load(fixture);
      const axes=await page.evaluate(()=>PerspectiveGeometry.modelAxes(JSON.parse(localStorage.getItem('perspective-grid-prototype-v3')),1036,648).map(a=>({axis:a.axis,label:a.label})));
      for(const axis of axes){
        await load(fixture);const before=await saved(),first=await metrics(),rect=await page.locator('#scene').boundingBox();
        const move=await page.evaluate(({s,axis,w,h})=>{
          const G=PerspectiveGeometry,cam=G.camera(s,w,h),a=G.modelAxes(s,w,h).find(a=>a.label===axis.label);
          let aim;
          if(cam.fisheye){
            aim=a.points.filter(p=>p[0]>10&&p[0]<w-10&&p[1]>10&&p[1]<h-10&&Math.hypot(p[0]-a.origin[0],p[1]-a.origin[1])>30)
              .sort((p,q)=>Math.hypot(p[0]-a.x,p[1]-a.y)-Math.hypot(q[0]-a.x,q[1]-a.y))[0];
          }else{
            const len=Math.hypot(a.x-a.origin[0],a.y-a.origin[1]);
            aim=a.origin.map((v,i)=>v+([a.x,a.y][i]-v)*Math.min(1,70/len));
          }
          const i=['x','y','z'].indexOf(a.axis),expected=[...s.modelPositions.box];expected[i]+=Math.sign(cam.forward[i]||1)*8;
          const q=G.project(expected,cam);
          return {aim,delta:q.map((v,i)=>v-a.origin[i]),expected};
        },{s:before,axis,w:rect.width,h:rect.height});
        assert.ok(move.aim,`${preset}/${axis.label}: visible guide`);
        await page.keyboard.down('Control');await page.keyboard.down('Shift');
        await page.mouse.move(rect.x+move.aim[0],rect.y+move.aim[1]);await page.waitForTimeout(80);
        assert.ok((await page.locator('#axisStatus').textContent()).includes(axis.axis.toUpperCase()));
        await page.mouse.down();await page.mouse.move(rect.x+move.aim[0]+move.delta[0],rect.y+move.aim[1]+move.delta[1],{steps:8});
        if(preset==='three'&&axis.label==='2PF')await page.screenshot({path:path.join(os.tmpdir(),'perspective-v12-axis.png'),fullPage:true});
        await page.mouse.up();await page.keyboard.up('Shift');await page.keyboard.up('Control');
        const after=await saved();
        assert.ok(after.modelPositions.box.every((v,i)=>Math.abs(v-move.expected[i])<.06),`${preset}/${axis.label}: ${after.modelPositions.box} != ${move.expected}`);
        assert.notEqual((await metrics()).pixels,first.pixels);
        for(const key of ['yaw','pitch','roll','panX','panY','viewZoom','focalLength','distance','distortion','boxSize'])assert.equal(after[key],before[key]);
        assert.equal(await page.evaluate(s=>PerspectiveGeometry.svg(s),before),await page.evaluate(s=>PerspectiveGeometry.svg(s),after));
        assert.equal(await page.locator('#axisStatus').isHidden(),true);
        await page.reload();assert.deepEqual((await saved()).modelPositions,after.modelPositions);
        results.push({preset,axis,position:after.modelPositions.box});
      }
    }
    await load({preset:'five',referenceModel:'room',focalLength:10,distance:16});
    await page.locator('#fitBtn').click();await page.waitForTimeout(200);
    async function drag(selector,dx,dy,shift=false,ctrl=false){
      if(ctrl)await page.keyboard.down('Control');
      const r=await page.locator(selector).boundingBox();if(shift)await page.keyboard.down('Shift');
      await page.mouse.move(r.x+r.width*.55,r.y+r.height*.5);await page.mouse.down();
      await page.mouse.move(r.x+r.width*.55+dx,r.y+r.height*.5+dy,{steps:6});await page.mouse.up();
      if(shift)await page.keyboard.up('Shift');if(ctrl)await page.keyboard.up('Control');await page.waitForTimeout(180);
    }
    const start=await metrics();await drag('#cube',40,18);assert.notEqual((await metrics()).pixels,start.pixels);
    assert.equal(await page.locator('#preset').inputValue(),'five');
    const yaw=await page.locator('#yawNumber').inputValue();await page.locator('#panBtn').click();
    await drag('#scene',35,10);await drag('#cube',20,8);assert.equal(await page.locator('#yawNumber').inputValue(),yaw);
    await page.locator('#orbitBtn').click();
    async function saved(){await page.waitForTimeout(240);return page.evaluate(()=>JSON.parse(localStorage.getItem('perspective-grid-prototype-v3')));}
    for(const referenceModel of ['box','table','room']){
      await page.locator('#referenceModel').selectOption(referenceModel);
      const before=await saved(),pixels=(await metrics()).pixels;
      const svgBefore=await page.evaluate(s=>PerspectiveGeometry.svg(s),before);
      await drag('#scene',25,-12,true);await drag('#cube',10,5,true);
      const after=await saved();assert.notEqual((await metrics()).pixels,pixels);
      assert.notDeepEqual(after.modelPositions[referenceModel],before.modelPositions[referenceModel]);
      assert.equal(await page.evaluate(s=>PerspectiveGeometry.svg(s),after),svgBefore);
      for(const key of ['yaw','pitch','roll','panX','panY','viewZoom','focalLength','distance','distortion'])assert.equal(after[key],before[key],key);
      for(const name of ['box','table','room'])if(name!==referenceModel)assert.deepEqual(after.modelPositions[name],before.modelPositions[name]);
      await page.reload();assert.deepEqual((await saved()).modelPositions,after.modelPositions);
      await page.locator('#centerModelBtn').click();assert.deepEqual((await saved()).modelPositions[referenceModel],[0,0,0]);
    }
    const beforeHidden=await saved();
    await page.locator('[data-key="showCube"]').uncheck();await drag('#scene',20,10,true);
    const afterHidden=await saved();assert.deepEqual(afterHidden.modelPositions,beforeHidden.modelPositions);
    assert.equal(afterHidden.panX,beforeHidden.panX);assert.equal(afterHidden.yaw,beforeHidden.yaw);
    await page.locator('[data-key="showCube"]').check();
    await input('viewZoom',140);await page.reload();await page.waitForTimeout(200);
    assert.equal(await page.locator('#viewZoom').inputValue(),'140');
    await page.evaluate(()=>{
      for(const key of ['showGrid','showHorizon','showVps']){
        const el=document.querySelector(`[data-key="${key}"]`);el.checked=true;el.dispatchEvent(new Event('input'));
      }
    });
    await page.locator('#exportFormat').selectOption('svg');
    const pending=page.waitForEvent('download');await page.locator('#exportBtn').click();const download=await pending;
    const svg=await require('node:fs/promises').readFile(await download.path(),'utf8');
    // Wait for the UI's debounced state persistence before comparing the export.
    await page.waitForTimeout(220);
    const current=await page.evaluate(()=>PerspectiveGeometry.svg(JSON.parse(localStorage.getItem('perspective-grid-prototype-v3'))));
    assert.equal(svg,current);assert.match(svg,/<polyline/);assert.doesNotMatch(svg,/NaN|Infinity/);
    await input('viewZoom',100);
    const unzoomed=await page.evaluate(()=>PerspectiveGeometry.svg(JSON.parse(localStorage.getItem('perspective-grid-prototype-v3'))));
    assert.notEqual(svg,unzoomed);await input('viewZoom',140);
    await page.waitForTimeout(3400);
    await page.screenshot({path:path.join(os.tmpdir(),'perspective-v12-desktop.png'),fullPage:true});
    await page.setViewportSize({width:375,height:812});await page.waitForTimeout(250);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok((await metrics()).n>100);
    await page.screenshot({path:path.join(os.tmpdir(),'perspective-v12-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({results,axisMovement:'Ctrl+Shift selects PF axis; guide visible; only chosen world coordinate changes; native Three camera verified',fishMovement:'orbit and Move passed',modelMovement:'Shift on scene and cube; all models; grid and camera fixed; reset and hidden state passed',persistence:'passed',errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
