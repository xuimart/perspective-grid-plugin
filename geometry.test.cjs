const assert = require('node:assert/strict');
const {test} = require('node:test');
const G = require('./geometry.js');

test('camera rotation and composition offset affect grid and cube together', () => {
  const state=G.normalize(), a=G.camera(state,1600,1000), b=G.camera({...state,panX:12,panY:-9},1600,1000);
  for(const p of [[0,0,0],[1,1,1],[-2,-1,-4]]){
    const pa=G.project(p,a),pb=G.project(p,b);
    assert.ok(Math.abs(pb[0]-pa[0]-192)<1e-7);
    assert.ok(Math.abs(pb[1]-pa[1]+90)<1e-7);
  }
  const rotated=G.camera({...state,yaw:state.yaw+40},1600,1000);
  assert.notDeepEqual(G.project([1,1,1],a),G.project([1,1,1],rotated));
  assert.notDeepEqual(G.project([-4,-1,-4],a),G.project([-4,-1,-4],rotated));
  assert.deepEqual(G.camera(state,320,180,true).right,a.right);
  assert.deepEqual(G.camera(state,320,180,true).up,a.up);
});
test('parallel world lines converge to the corresponding vanishing point',()=>{
  const cam=G.camera(G.normalize(),1600,1000);
  const vp=G.vanishingPoints(cam).find(p=>p.axis==='x');
  for(const yz of [[-1,-3],[1,2],[4,-6]]){
    const a=G.project([-2,...yz],cam),b=G.project([2,...yz],cam);
    const cross=(b[0]-a[0])*(vp.y-a[1])-(b[1]-a[1])*(vp.x-a[0]);
    assert.ok(Math.abs(cross)<1e-7);
  }
});
test('near-plane clipping remains finite at extreme angles and zoom',()=>{
  for(const yaw of [-180,-90,-30,0,90,180])for(const pitch of [-180,-90,-75,0,75,90,180])for(const roll of [-180,0,90]){
    const s=G.normalize({yaw,pitch,roll,distance:4,density:48});
    const lines=G.projectedLines(s,1600,1000);
    for(const line of lines)for(const [x,y] of line.points){
      assert.ok(Number.isFinite(x)&&Number.isFinite(y));
      assert.ok(x>=-1e-6&&x<=1600+1e-6&&y>=-1e-6&&y<=1000+1e-6);
    }
  }
});
test('perspective presets have the expected finite vanishing points',()=>{
  const one=G.camera(G.normalize({yaw:0,pitch:0}),1600,1000);
  const two=G.camera(G.normalize({yaw:34,pitch:0}),1600,1000);
  const three=G.camera(G.normalize({yaw:34,pitch:23}),1600,1000);
  assert.equal(G.vanishingPoints(one).length,1);
  assert.equal(G.vanishingPoints(two).length,2);
  assert.equal(G.vanishingPoints(three).length,3);
  assert.equal(G.vanishingPoints(G.camera(G.normalize({projection:'ortho'}),1600,1000)).length,0);
});
test('orthographic parallel directions stay parallel at different depths',()=>{
  const cam=G.camera(G.normalize({projection:'ortho'}),1000,1000);
  const a=G.project([0,0,0],cam),b=G.project([1,0,0],cam),c=G.project([0,3,4],cam),d=G.project([1,3,4],cam);
  assert.ok(Math.abs((b[0]-a[0])-(d[0]-c[0]))<1e-9);
  assert.ok(Math.abs((b[1]-a[1])-(d[1]-c[1]))<1e-9);
});
test('SVG export is transparent, scaled consistently, and respects visibility',()=>{
  const s=G.normalize();const svg=G.svg(s);assert.match(svg,/width="2400" height="1500"/);assert.doesNotMatch(svg,/<rect|<image|NaN|Infinity/);
  const a=G.projectedLines(s,1600,1000),b=G.projectedLines(s,2400,1500);
  assert.equal(a.length,b.length);
  for(let i=0;i<a.length;i++)for(let p=0;p<2;p++)for(let k=0;k<2;k++)assert.ok(Math.abs(a[i].points[p][k]*1.5-b[i].points[p][k])<1e-6);
  assert.equal(G.projectedLines({...s,showGrid:false},1600,1000).length,0);
  assert.equal(G.projectedLines({...s,xLines:false,yLines:false,zLines:false,showHorizon:false},1600,1000).length,0);
});
test('invalid persisted values cannot poison the projection',()=>{
  const s=G.normalize({yaw:NaN,pitch:999,fov:0,color:'javascript:bad',aspect:-1,density:0});
  assert.equal(s.yaw,G.defaults.yaw);assert.equal(s.pitch,180);assert.equal(s.fov,20);assert.equal(s.aspect,1.6);assert.equal(s.density,8);
});
test('every open guide reaches the image edges and converges to its true vanishing point',()=>{
  for(const gridStyle of ['space','rays']){
    const s=G.normalize({gridStyle}),cam=G.camera(s,1600,1000),vps=G.vanishingPoints(cam);
    for(const line of G.projectedLines(s,1600,1000).filter(l=>l.axis)){
      const [a,b]=line.points,vp=vps.find(p=>p.axis===line.axis);
      const cross=(b[0]-a[0])*(vp.y-a[1])-(b[1]-a[1])*(vp.x-a[0]);
      assert.ok(Math.abs(cross)/Math.hypot(b[0]-a[0],b[1]-a[1])<1e-7);
      for(const p of [a,b])assert.ok(Math.min(Math.abs(p[0]),Math.abs(p[1]),Math.abs(p[0]-1600),Math.abs(p[1]-1000))<1e-6);
    }
  }
});
test('horizon color and numbered vanishing points are retained in transparent exports',()=>{
  const s=G.normalize({horizonColor:'#ee7711'}),svg=G.svg(s);
  assert.match(svg,/#ee7711/);assert.match(svg,/>HORIZONTE</);assert.match(svg,/>1PF fora</);assert.match(svg,/>2PF fora</);assert.match(svg,/>3PF fora</);
  assert.equal(s.showCube,false);
  const clean=G.svg({...s,showHorizon:false,showVps:false});assert.doesNotMatch(clean,/<text|<circle/);
  const one=G.annotations(G.normalize({yaw:0,pitch:0}),1600,1000);
  assert.deepEqual(one.filter(m=>m.text&&/PF/.test(m.text)).map(m=>m.text),['1PF']);
});

test('guides use one width and opacity without major lines or distance fading',()=>{
  for(const gridStyle of ['space','rays']){
    const s=G.normalize({gridStyle,lineWidth:2.3,opacity:67});
    const lines=G.projectedLines(s,1600,1000);
    assert.ok(lines.length>20);
    for(const line of lines){
      assert.equal(line.width,2.3);assert.equal(line.opacity,.67);
      if(line.axis)assert.deepEqual(line.dash,[]);
    }
    const widths=[...G.svg(s).matchAll(/<line[^>]*stroke-width="([^"]+)"/g)].map(m=>Number(m[1]));
    assert.ok(widths.every(width=>Math.abs(width-3.45)<1e-8));
  }
});

test('each family has its requested count with finite, distant and infinite vanishing points',()=>{
  for(const gridStyle of ['space','rays'])for(const projection of ['perspective','ortho']){
    for(const [yaw,pitch] of [[43,5],[0,0],[90,0],[0,90],[.001,-.001],[120,-70]]){
      for(const axis of ['x','y','z'])for(const count of [1,7,32,64]){
        const s=G.normalize({gridStyle,projection,yaw,pitch,xLines:false,yLines:false,zLines:false,[axis+'Lines']:true,[axis+'Count']:count,showHorizon:false});
        const lines=G.projectedLines(s,1600,1000);
        const cam=G.camera(s,1600,1000),index={x:0,y:1,z:2}[axis];
        const edgeOn=projection==='ortho'&&Math.hypot(cam.right[index],cam.up[index])<1e-8;
        assert.equal(lines.length,edgeOn?0:count,`${gridStyle} ${projection} ${yaw}/${pitch} ${axis} ${count}`);
        const vp=G.vanishingPoints(cam).find(v=>v.axis===axis);
        if(vp)for(const {points:[a,b]} of lines){
          const distance=Math.abs((b[0]-a[0])*(vp.y-a[1])-(b[1]-a[1])*(vp.x-a[0]))/Math.hypot(b[0]-a[0],b[1]-a[1]);
          assert.ok(distance<.001);
        }
      }
    }
  }
});

test('old density migrates to integer per-axis counts and box size is bounded',()=>{
  const legacy=G.normalize({density:23,depthFade:true});
  assert.equal(legacy.xCount,23);assert.equal(legacy.yCount,23);assert.equal(legacy.zCount,23);
  const s=G.normalize({density:23,xCount:7.4,yCount:999,zCount:0,boxSize:99});
  assert.equal(s.xCount,7);assert.equal(s.yCount,64);assert.equal(s.zCount,1);assert.equal(s.boxSize,2.5);
  assert.equal(G.normalize({xCount:NaN}).xCount,G.defaults.xCount);
});

test('reference box size changes the box but never its camera or guide geometry',()=>{
  const s=G.normalize(),cam=G.camera(s,1600,1000);
  const small=G.cubeFaces(cam,.5),large=G.cubeFaces(cam,2);
  assert.notDeepEqual(small.find(f=>f.key==='front').points,large.find(f=>f.key==='front').points);
  // The ray-fan/space grids are independent of the model box size.
  const r=G.normalize({gridStyle:'rays'});
  assert.deepEqual(G.projectedLines(r,1600,1000),G.projectedLines({...r,showCube:true,boxSize:2},1600,1000));
  assert.equal(G.svg(r),G.svg({...r,showCube:true,boxSize:2}));
});

test('floor grid is anchored to the model: it scales with boxSize and follows the model',()=>{
  const s=G.normalize({gridStyle:'floor',showCube:true,yaw:31,pitch:17});
  // Cell size follows boxSize, so the projected grid must differ.
  assert.notDeepEqual(G.projectedLines(s,1600,1000),G.projectedLines({...s,boxSize:2.5},1600,1000));
  // Moving the model shifts the anchored floor grid too.
  const moved=G.moveModel(s,60,-30,1600,1000);
  assert.notDeepEqual(G.projectedLines(moved,1600,1000),G.projectedLines(s,1600,1000));
  // Every floor line is finite and inside the frame.
  for(const l of G.projectedLines(s,1600,1000)) for(const p of l.points) assert.ok(p.every(Number.isFinite));
});

test('locked perspective modes retain exactly their vanishing-point count through drags',()=>{
  for(const [preset,expected] of [['one',1],['two',2],['three',3]]){
    let s=G.normalize({preset,yaw:43,pitch:20});
    for(const [dx,dy] of [[40,20],[-90,100],[600,-400],[-1200,200],[0,-300]]){
      s=G.orbit(s,dx,dy,1600,1000,.65);
      assert.equal(s.preset,preset);
      assert.equal(G.vanishingPoints(G.camera(s,1600,1000)).length,expected);
      assert.equal(s.roll,0);
    }
  }
});

test('scene zoom never acts as a lens: perspective zoom dollies and keeps the vanishing points',()=>{
  const cube=[];for(const x of [-1.5,1.5])for(const y of [-1.5,1.5])for(const z of [-1.5,1.5])cube.push([x,y,z]);
  for(const preset of ['free','one','two','three']){
    const s=G.normalize({preset,focalLength:35,viewZoom:100,yaw:31,pitch:17});
    const zoomed=G.normalize({...s,viewZoom:250});
    const a=G.camera(s,1600,1000),b=G.camera(zoomed,1600,1000);
    assert.equal(b.width,a.width);assert.equal(b.height,a.height);
    assert.equal(zoomed.focalLength,s.focalLength);assert.equal(b.focal,a.focal);
    assert.ok(Math.abs(b.distance-a.distance/2.5)<1e-9,`${preset}: dolly in`);
    const va=G.vanishingPoints(a),vb=G.vanishingPoints(b);
    assert.equal(vb.length,va.length);
    va.forEach((v,i)=>assert.ok(Math.hypot(v.x-vb[i].x,v.y-vb[i].y)<1e-6,`${preset}: PF ${i+1}`));
    assert.deepEqual(G.projectedLines({...zoomed,gridStyle:'rays'},1600,1000),G.projectedLines({...s,gridStyle:'rays'},1600,1000));
    assert.ok(G.framingSize(zoomed,cube)>G.framingSize(s,cube)*1.5,`${preset}: model comes closer`);
    assert.deepEqual(G.camera(s,300,180,true),G.camera(zoomed,300,180,true));
    assert.equal(G.normalize({...zoomed,focalLength:85,distortion:40}).viewZoom,250);
  }
  // Orthographic has no lens and fisheye guides are directions only: there the
  // zoom is a uniform magnification about the center, with the lens untouched.
  for(const preset of ['ortho','five']){
    const o=G.normalize({preset,focalLength:12,viewZoom:100}),oz=G.normalize({...o,viewZoom:250});
    const a=G.camera(o,1600,1000),b=G.camera(oz,1600,1000);
    assert.equal(b.distance,a.distance);assert.equal(oz.focalLength,o.focalLength);
    const p=G.project([1,.5,0],a),q=G.project([1,.5,0],b);
    assert.ok(Math.abs((q[0]-b.cx)/(p[0]-a.cx)-2.5)<1e-8,`${preset}: magnifies`);
  }
});

test('lens changes preserve model framing by dollying, without changing zoom or mode',()=>{
  const points=[];for(const x of [-1.5,1.5])for(const y of [-1.5,1.5])for(const z of [-1.5,1.5])points.push([x,y,z]);
  for(const preset of ['one','two','three','five']){
    let s=G.normalize({preset,focalLength:35,distance:20,viewZoom:140});
    const size=G.framingSize(s,points);
    for(const focalLength of [10,50,300,35]){
      const next=G.normalize({...s,focalLength});
      next.distance=G.framingDistance(s,next,points);
      assert.ok(Math.abs(G.framingSize(next,points)-size)<1e-7,`${preset}: ${focalLength}mm`);
      assert.equal(next.viewZoom,140);assert.equal(next.preset,preset);
      s=next;
    }
  }
});

test('fisheye distortion preserves model framing and distance compensation respects limits',()=>{
  const points=[[-3,-2,-2],[3,2,2],[-3,2,2],[3,-2,-2]];
  const s=G.normalize({preset:'five',focalLength:10,distance:12});
  const next={...s,distortion:0};next.distance=G.framingDistance(s,next,points);
  assert.ok(Math.abs(G.framingSize(s,points)-G.framingSize(next,points))<1e-7);
  const limited=G.framingDistance({...s,focalLength:300,distance:4},s,points);
  assert.ok(limited>=4&&limited<=500);
  assert.equal(G.framingDistance(s,next,[]),next.distance);
});

test('model translation follows screen drags in 3D while camera and grid remain fixed',()=>{
  for(const preset of ['free','one','two','three','five','ortho'])for(const viewZoom of [50,150,300]){
    const s=G.normalize({preset,viewZoom,showCube:true,gridStyle:'rays',focalLength:24,yaw:31,pitch:17,panX:7,panY:-3});
    const cam=G.camera(s,1600,1000),p=s.modelPositions.box,q=G.project(p,cam);
    const moved=G.moveModel(s,40,-25,1600,1000),next=moved.modelPositions.box,r=G.project(next,cam);
    assert.ok(Math.abs(r[0]-q[0]-40)<1e-6,`${preset}: horizontal drag`);
    assert.ok(Math.abs(r[1]-q[1]+25)<1e-6,`${preset}: vertical drag`);
    assert.ok(Math.abs(G.cameraPoint(next,cam)[2]-G.cameraPoint(p,cam)[2])<1e-8);
    assert.deepEqual(G.camera(moved,1600,1000),cam);
    assert.equal(G.svg(moved),G.svg(s));assert.equal(moved.preset,s.preset);
    assert.deepEqual(s.modelPositions.box,[0,0,0]);
    assert.deepEqual(moved.modelPositions.table,[0,0,0]);
    const back=G.moveModel(moved,-40,25,1600,1000);
    assert.ok(back.modelPositions.box.every(v=>Math.abs(v)<1e-7));
  }
});

test('model positions are independent, sanitized and persisted without shared mutable defaults',()=>{
  const s=G.normalize({modelPositions:{box:[5,NaN,-200],table:[Infinity,8,2],room:'invalid'}});
  assert.deepEqual(s.modelPositions,{box:[5,0,-100],table:[0,8,2],room:[0,0,0],person:[0,0,0]});
  const moved=G.moveModel(G.normalize({showCube:true,referenceModel:'table'}),80,20,1600,1000);
  assert.notDeepEqual(moved.modelPositions.table,[0,0,0]);
  assert.deepEqual(moved.modelPositions.box,[0,0,0]);
  assert.deepEqual(G.normalize(JSON.parse(JSON.stringify(moved))),moved);
  moved.modelPositions.box[0]=50;assert.deepEqual(G.normalize().modelPositions.box,[0,0,0]);
});

test('hidden models do not move and large fisheye drags stay finite',()=>{
  const hidden=G.normalize();assert.deepEqual(G.moveModel(hidden,100,100,1600,1000),hidden);
  for(const distortion of [0,50,100]){
    const s=G.normalize({preset:'five',showCube:true,distortion,focalLength:10});
    const moved=G.moveModel(s,1e6,-1e6,1600,1000);
    assert.ok(moved.modelPositions.box.every(v=>Number.isFinite(v)&&Math.abs(v)<=100));
    const cam=G.camera(moved,1600,1000),q=G.project(moved.modelPositions.box,cam);
    assert.ok(Math.hypot(q[0]-cam.cx,q[1]-cam.cy)<=cam.focal*.981);
  }
});

test('lens framing compensation accounts for translated model geometry',()=>{
  const s=G.moveModel(G.normalize({preset:'three',showCube:true,distance:24}),100,40,1600,1000);
  const points=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])points.push([x,y,z].map((v,i)=>v+s.modelPositions.box[i]));
  const next={...s,focalLength:85};next.distance=G.framingDistance(s,next,points);
  assert.ok(Math.abs(G.framingSize(next,points)-G.framingSize(s,points))<1e-7);
});

test('depth drag translates a rigid model along camera forward without changing optics or grid',()=>{
  for(const preset of ['free','one','two','three','five','ortho']){
    const s=G.normalize({preset,showCube:true,gridStyle:'rays',focalLength:35,yaw:31,pitch:17,modelPositions:{box:[2,1,0]}});
    const cam=G.camera(s,1600,1000),p=G.cameraPoint(s.modelPositions.box,cam);
    const far=G.moveModelDepth(s,-200,1000,3),q=G.cameraPoint(far.modelPositions.box,cam);
    assert.ok(q[2]>p[2]);assert.ok(Math.abs(q[0]-p[0])<1e-9);assert.ok(Math.abs(q[1]-p[1])<1e-9);
    assert.equal(far.boxSize,s.boxSize);assert.equal(G.svg(far),G.svg(s));
    assert.deepEqual(G.camera(far,1600,1000),cam);
    const near=G.moveModelDepth(far,200,1000,3);
    assert.ok(near.modelPositions.box.every((v,i)=>Math.abs(v-s.modelPositions.box[i])<1e-9));
    assert.deepEqual(far.modelPositions.table,s.modelPositions.table);
  }
});

test('doubling depth halves a front-facing face, rather than stretching its mesh',()=>{
  const s=G.normalize({preset:'one',showCube:true,distance:16,focalLength:10,modelPositions:{box:[-12,0,0]}});
  const far=G.moveModelDepth(s,-Math.log(2)*1000/3,1000,3),cam=G.camera(s,1600,1000);
  const vertices=[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]];
  const before=vertices.map(p=>G.project(p.map((v,i)=>v+s.modelPositions.box[i]),cam));
  const after=vertices.map(p=>G.project(p.map((v,i)=>v+far.modelPositions.box[i]),cam));
  for(let i=0;i<4;i++){
    const j=(i+1)%4,a=Math.hypot(...before[i].map((v,k)=>v-before[j][k])),b=Math.hypot(...after[i].map((v,k)=>v-after[j][k]));
    assert.ok(Math.abs(b/a-.5)<1e-9);
  }
  const center=G.project(s.modelPositions.box,cam),farCenter=G.project(far.modelPositions.box,cam);
  assert.ok(Math.abs((farCenter[0]-cam.cx)/(center[0]-cam.cx)-.5)<1e-9);
});

test('near plane and world bounds stop depth translation without changing model proportions',()=>{
  let s=G.normalize({preset:'three',showCube:true});
  for(let i=0;i<50;i++)s=G.moveModelDepth(s,1000,1000,4);
  let cam=G.camera(s,1600,1000);
  assert.ok(G.cameraPoint(s.modelPositions.box,cam)[2]>=4-1e-9);
  for(let i=0;i<50;i++)s=G.moveModelDepth(s,-1000,1000,4);
  assert.ok(s.modelPositions.box.every(v=>Number.isFinite(v)&&Math.abs(v)<=100));
  assert.equal(s.boxSize,G.defaults.boxSize);
  const hidden=G.normalize();assert.deepEqual(G.moveModelDepth(hidden,-100,1000,4),hidden);
});

test('pointed vanishing-point guides select the corresponding world axes and labels',()=>{
  for(const preset of ['one','two','three','five','ortho']){
    const s=G.normalize({preset,showCube:true,focalLength:14,yaw:43,pitch:20,modelPositions:{box:[2,1,0]}});
    const axes=G.modelAxes(s,1600,1000);
    for(const a of axes){
      const distance=Math.hypot(a.x-a.origin[0],a.y-a.origin[1]);
      const pointer=a.points.length>2?a.points[Math.floor(a.points.length*.65)]:a.origin.map((v,i)=>v+([a.x,a.y][i]-v)*40/distance);
      const chosen=G.pickModelAxis(s,pointer,1600,1000);
      assert.equal(chosen?.axis,a.axis,`${preset}: ${a.label}`);
      assert.ok(a.points.every(p=>p.every(Number.isFinite)));
    }
    if(preset==='three')assert.deepEqual(axes.map(a=>[a.label,a.axis]),[['1PF','x'],['2PF','z'],['3PF','y']]);
  }
});

test('axis drag changes only one world coordinate and retains the rigid model and grid',()=>{
  for(const preset of ['one','two','three','five','ortho']){
    const s=G.normalize({preset,showCube:true,gridStyle:'rays',focalLength:14,yaw:43,pitch:20,modelPositions:{box:[2,1,0]}});
    const cam=G.camera(s,1600,1000);
    for(const a of G.modelAxes(s,1600,1000)){
      const i=['x','y','z'].indexOf(a.axis),expected=[...s.modelPositions.box];expected[i]+=3;
      const target=G.project(expected,cam),moved=G.moveModelOnAxis(s,a.axis,target,1600,1000,3);
      assert.ok(moved.modelPositions.box.every((v,k)=>Math.abs(v-expected[k])<1e-4),`${preset}/${a.axis}`);
      assert.equal(G.svg(moved),G.svg(s));assert.equal(moved.boxSize,s.boxSize);
      const back=G.moveModelOnAxis(moved,a.axis,G.project(s.modelPositions.box,cam),1600,1000,3);
      assert.ok(back.modelPositions.box.every((v,k)=>Math.abs(v-s.modelPositions.box[k])<1e-4));
    }
  }
});

test('end-on axis retains a usable depth gesture and near-plane bounds',()=>{
  const s=G.normalize({preset:'one',showCube:true}),a=G.modelAxes(s,1600,1000)[0];
  assert.equal(a.label,'1PF');assert.equal(a.endOn,true);
  const far=G.moveModelOnAxis(s,'z',[800,400],1600,1000,2);
  assert.ok(G.cameraPoint(far.modelPositions.box,G.camera(s,1600,1000))[2]>s.distance);
  const near=G.moveModelOnAxis(s,'z',[800,1e5],1600,1000,2);
  assert.ok(G.cameraPoint(near.modelPositions.box,G.camera(s,1600,1000))[2]>=2-1e-8);
});

test('central fisheye vanishing point supports depth movement without a missing guide',()=>{
  const s=G.normalize({preset:'five',showCube:true,yaw:0,pitch:0});
  const a=G.modelAxes(s,1600,1000).find(a=>a.label==='1PF');
  assert.equal(a.axis,'z');assert.equal(a.endOn,true);
  assert.equal(G.pickModelAxis(s,[800,500],1600,1000).axis,'z');
  const moved=G.moveModelOnAxis(s,'z',[800,400],1600,1000,2);
  assert.ok(moved.modelPositions.box[2]<0);
});

test('lateral world boundary stops the whole translation, retaining camera depth',()=>{
  for(const preset of ['three','five','ortho']){
    const s=G.normalize({preset,showCube:true,yaw:31,pitch:17,modelPositions:{box:[98,-94,-85]}});
    const cam=G.camera(s,1600,1000),depth=G.cameraPoint(s.modelPositions.box,cam)[2];
    const next=G.moveModel(s,1e5,-1e5,1600,1000);
    assert.ok(Math.abs(G.cameraPoint(next.modelPositions.box,cam)[2]-depth)<1e-8);
    assert.ok(next.modelPositions.box.every(v=>Math.abs(v)<=100));
  }
});

test('axis movement rejects invisible origins and malformed input without exceptions',()=>{
  const s=G.normalize({showCube:true,preset:'one',modelPositions:{box:[0,0,50]}});
  assert.deepEqual(G.moveModelOnAxis(s,'z',[800,300],1600,1000),s);
  for(const target of [null,[],[4],[4,NaN],'invalid'])assert.deepEqual(G.moveModelOnAxis(s,'z',target,1600,1000),s);
});

test('camera frame offsets are bounded after loading legacy extreme framing',()=>{
  const s=G.normalize({panX:-2000,panY:2000,preserveShape:true});
  assert.equal(s.panX,-100);assert.equal(s.panY,100);
  assert.equal('preserveShape' in s,false);
});

test('model shares grid camera and every depth edge converges to the global vanishing point',()=>{
  for(const position of [[-10.4,19.6,0],[-20,0,0],[0,20,0],[15,-12,0]]){
    const s=G.normalize({preset:'one',focalLength:10,distance:8.5,panY:90,modelPositions:{box:position}});
    const cam=G.camera(s,1600,1000);
    const points=[];for(const x of [-1.5,1.5])for(const y of [-1.5,1.5])for(const z of [-1.5,1.5])points.push(G.project([x,y,z].map((v,i)=>v+position[i]),cam));
    const vp=G.vanishingPoints(cam)[0];
    for(let i=0;i<8;i+=2){
      const a=points[i],b=points[i+1];
      const cross=(b[0]-a[0])*(vp.y-a[1])-(b[1]-a[1])*(vp.x-a[0]);
      assert.ok(Math.abs(cross)<1e-6);
    }
    assert.equal(G.svg(s),G.svg({...s,preserveShape:false}));
    assert.deepEqual(G.camera({...s,preserveShape:true},1600,1000),cam);
  }
  assert.equal(G.normalize({preserveShape:true}).preserveShape,undefined);
});

test('fisheye distortion preserves the hemisphere radius and central magnification',()=>{
  for(const distortion of [0,25,50,75,100]){
    const cam=G.camera(G.normalize({preset:'five',focalLength:10,distortion}),1600,1000);
    const edge=G.fromCamera([1,0,0],cam),center=G.fromCamera([1e-6,0,1],cam);
    assert.ok(Math.abs(edge[0]-cam.cx-cam.focal)<1e-8);
    assert.ok(Math.abs((center[0]-cam.cx)/1e-6-cam.focal)<.001);
  }
});

test('fisheye orbits rotate scene, curves and visible vanishing directions together',()=>{
  const s=G.normalize({preset:'five',focalLength:10});
  const rotated=G.orbit(s,80,35,1600,1000);
  assert.equal(rotated.preset,'five');assert.equal(rotated.projection,'fisheye');
  assert.notEqual(rotated.yaw,s.yaw);assert.notEqual(rotated.pitch,s.pitch);
  assert.equal(rotated.panX,s.panX);assert.equal(rotated.panY,s.panY);
  assert.notDeepEqual(G.projectedLines(s,1600,1000),G.projectedLines(rotated,1600,1000));
  const cam=G.camera(rotated,1600,1000),vps=G.vanishingPoints(cam);
  assert.equal(vps.length,3);
  for(const vp of vps){
    const [x,y]=G.fromCamera(vp.cameraDirection,cam);assert.equal(vp.x,x);assert.equal(vp.y,y);
    for(const line of G.projectedLines(rotated,1600,1000).filter(l=>l.axis===vp.axis)){
      let closest=Infinity;
      for(let i=1;i<line.points.length;i++){
        const a=line.points[i-1],b=line.points[i],dx=b[0]-a[0],dy=b[1]-a[1];
        const t=G.clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy),0,1);
        closest=Math.min(closest,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
      }
      assert.ok(closest<.1,`curve misses ${vp.axis} vanishing direction: ${closest}`);
    }
  }
});

test('two-point vertical drags shift framing without tilting or adding a vertical vanishing point',()=>{
  const before=G.normalize({preset:'two'}),after=G.orbit(before,0,80,1600,1000);
  assert.equal(after.pitch,0);assert.equal(after.yaw,before.yaw);assert.equal(after.panY,8);
  const cam=G.camera(after,1600,1000),vps=G.vanishingPoints(cam);
  assert.equal(vps.length,2);assert.ok(vps.some(v=>v.x<cam.cx)&&vps.some(v=>v.x>cam.cx));
  for(const line of G.projectedLines(after,1600,1000).filter(l=>l.axis==='y'))assert.ok(Math.abs(line.points[0][0]-line.points[1][0])<1e-7);
  const one=G.orbit(G.normalize({preset:'one'}),40,80,1600,1000);
  assert.equal(one.yaw,0);assert.equal(one.pitch,0);assert.equal(one.panX,2.5);assert.equal(one.panY,8);
});

test('axis-aligned shortcuts and saved values cannot escape constrained modes',()=>{
  for(const preset of ['one','two','three'])for(const yaw of [-180,-90,0,90,180])for(const pitch of [-180,0,90,180]){
    const s=G.normalize({preset,yaw,pitch,roll:66}),cam=G.camera(s,1600,1000);
    assert.equal(G.vanishingPoints(cam).length,{one:1,two:2,three:3}[preset]);
  }
  const left=G.orbit(G.normalize({preset:'two',yaw:89.9}),1,0,1600,1000);
  assert.ok(left.yaw>90,'drag must be able to cross a cardinal orientation');
});

test('10-300mm uses a 36mm-wide sensor and preserves legacy framing',()=>{
  const a=G.camera(G.normalize({preset:'one',focalLength:10}),1600,1000);
  const b=G.camera(G.normalize({preset:'one',focalLength:300}),1600,1000);
  assert.ok(Math.abs(b.focal/a.focal-30)<1e-9);
  assert.ok(Math.abs((G.project([1,0,0],b)[0]-b.cx)/(G.project([1,0,0],a)[0]-a.cx)-30)<1e-9);
  const legacy=G.normalize({fov:55,aspect:1.6});
  assert.ok(Math.abs(G.camera(legacy,1600,1000).focal-1000/(2*Math.tan(55*Math.PI/360)))<1e-8);
  assert.equal(G.normalize({focalLength:999}).focalLength,300);
});

test('five-point fisheye has a center and four curved-family endpoints under every distortion',()=>{
  for(const distortion of [0,35,70,100]){
    const s=G.normalize({preset:'five',focalLength:10,distortion}),cam=G.camera(s,1600,1000);
    const vps=G.vanishingPoints(cam),lines=G.projectedLines(s,1600,1000);
    assert.equal(vps.length,5);assert.equal(vps[0].x,cam.cx);assert.equal(vps[0].y,cam.cy);
    assert.ok(vps[1].x<cam.cx&&vps[2].x>cam.cx&&vps[3].y<cam.cy&&vps[4].y>cam.cy);
    for(const line of lines){
      for(const p of line.points)assert.ok(p.every(Number.isFinite));
      if(line.axis==='x'||line.axis==='y'){
        const [a,b]=[line.points[0],line.points.at(-1)],targets=vps.filter(v=>v.axis===line.axis);
        for(const p of [a,b])assert.ok(targets.some(v=>Math.hypot(v.x-p[0],v.y-p[1])<1e-7));
      }
    }
    assert.match(G.svg(s),/<polyline/);assert.doesNotMatch(G.svg(s),/NaN|Infinity/);
  }
  const s=G.normalize({preset:'five',focalLength:10});
  assert.notDeepEqual(G.projectedLines(s,1600,1000)[0].points,G.projectedLines({...s,distortion:0},1600,1000)[0].points);
  const svg=G.svg(s);for(let i=1;i<=5;i++)assert.match(svg,new RegExp('>'+i+'PF( fora)?<'));
  assert.match(svg,/>1PF</); // o centro sempre fica dentro do quadro
});

test('fisheye is full-frame: the 180-degree circle always covers the whole frame',()=>{
  const covers=(s,w,h)=>{
    const cam=G.camera(s,w,h),z=cam.zoom,cx=w/2+(cam.cx-w/2)*z,cy=h/2+(cam.cy-h/2)*z;
    return [[0,0],[w,0],[0,h],[w,h]].every(([x,y])=>Math.hypot(x-cx,y-cy)<=cam.focal*z+1e-6);
  };
  for(const [w,h] of [[1600,1000],[1000,1600],[3840,2160],[345,216]])
    for(const focalLength of [10,24,85])for(const viewZoom of [25,100,300])for(const [panX,panY] of [[0,0],[12,-8]]){
      const s=G.normalize({preset:'five',focalLength,viewZoom,panX,panY});
      assert.ok(covers(s,w,h),`${w}x${h} ${focalLength}mm ${viewZoom}% pan ${panX},${panY}`);
    }
  // 10 mm encosta o círculo no canto; mm maiores ampliam; o zoom para trás para no limite.
  const a=G.camera(G.normalize({preset:'five',focalLength:10}),1600,1000),b=G.camera(G.normalize({preset:'five',focalLength:20}),1600,1000);
  assert.ok(Math.abs(a.focal*a.zoom-Math.hypot(800,500))<1e-6);
  assert.ok(Math.abs(b.focal*b.zoom/(a.focal*a.zoom)-2)<1e-9);
  assert.equal(G.camera(G.normalize({preset:'five',focalLength:20,viewZoom:25}),1600,1000).zoom,.5);
});

test('fisheye labels remain inside small viewports and do not falsely report interior points as outside',()=>{
  const s=G.normalize({preset:'five',focalLength:10}),labels=G.annotations(s,345,345/1.6,1).filter(m=>m.type==='label');
  assert.equal(labels.filter(m=>/PF/.test(m.text)).length,5);
  // Full-frame: só os pontos de fuga que estão de fato fora do quadro dizem "fora".
  const cam=G.camera(s,345,345/1.6),vps=G.vanishingPoints(cam);
  const outside=vps.filter(v=>v.x<0||v.x>345||v.y<0||v.y>345/1.6).length;
  assert.equal(labels.filter(m=>m.text.includes('fora')).length,outside);
  assert.ok(outside<5);
  const boxes=labels.map(m=>({left:m.align==='right'?m.x-m.text.length*6:m.x,right:m.align==='right'?m.x:m.x+m.text.length*6,top:m.y-11,bottom:m.y+3}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];assert.ok(!(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));
  }
});
