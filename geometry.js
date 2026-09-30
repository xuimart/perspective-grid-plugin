(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PerspectiveGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const radians = Math.PI / 180;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const bounds = {
    yaw: [-180, 180], pitch: [-180, 180], roll: [-180, 180],
    fov: [1, 140], focalLength: [10, 300], distortion: [0, 100], viewZoom: [25, 300], distance: [4, 500], panX: [-100, 100], panY: [-100, 100],
    density: [8, 48], xCount: [1, 64], yCount: [1, 64], zCount: [1, 64],
    boxSize: [.5, 2.5], opacity: [10, 100], lineWidth: [.5, 4]
  };
  const defaults = {
    yaw: 43, pitch: 5, roll: 0, fov: 35.638, focalLength: 35, distortion: 100, viewZoom: 100, distance: 16, panX: 0, panY: 0,
    projection: 'perspective', preset: 'free', density: 20, opacity: 80,
    lineWidth: 1.5, color: '#414447', horizonColor: '#b77728', aspect: 1.6, gridStyle:'rays',
    xCount: 16, yCount: 12, zCount: 16, boxSize: 1.5, referenceModel: 'box',
    modelPositions: {box:[0,0,0],table:[0,0,0],room:[0,0,0]},
    xLines: true, yLines: true, zLines: true,
    showGrid: true, showCube: false, showHorizon: true, showAxes: false, showVps: true
  };
  function normalize(input) {
    const state = { ...defaults };
    if (!input || typeof input !== 'object') input = {};
    for (const [key, limits] of Object.entries(bounds)) {
      if (typeof input[key] === 'number' && Number.isFinite(input[key])) state[key] = clamp(input[key], ...limits);
    }
    for (const axis of ['x','y','z']) {
      const key = axis + 'Count';
      if (!(typeof input[key] === 'number' && Number.isFinite(input[key])) && Number.isFinite(input.density)) state[key] = clamp(input.density, ...bounds[key]);
      state[key] = Math.round(state[key]);
    }
    for (const key of Object.keys(defaults)) {
      if (typeof defaults[key] === 'boolean' && typeof input[key] === 'boolean') state[key] = input[key];
    }
    if (/^#[0-9a-f]{6}$/i.test(input.color || '')) state.color = input.color;
    if (/^#[0-9a-f]{6}$/i.test(input.horizonColor || '')) state.horizonColor = input.horizonColor;
    if (['space','rays'].includes(input.gridStyle)) state.gridStyle=input.gridStyle;
    if ([1.6, 1, .75].includes(input.aspect)) state.aspect = input.aspect;
    if (!Number.isFinite(input.focalLength) && Number.isFinite(input.fov)) {
      state.focalLength = clamp(18 * Math.min(1, 1/state.aspect) / Math.tan(clamp(input.fov,20,100)*radians/2), 10, 300);
    }
    state.fov = 2 * Math.atan(18*Math.min(1,1/state.aspect)/state.focalLength)/radians;
    if (input.projection === 'ortho') state.projection = 'ortho';
    if (['free', 'one', 'two', 'three', 'five', 'ortho'].includes(input.preset)) state.preset = input.preset;
    if(state.preset==='five'){
      if(!Number.isFinite(input.yaw))state.yaw=0;
      if(!Number.isFinite(input.pitch))state.pitch=0;
    }
    if (['box','table','room'].includes(input.referenceModel)) state.referenceModel=input.referenceModel;
    state.modelPositions={};
    for(const name of ['box','table','room']){
      const position=input.modelPositions?.[name];
      state.modelPositions[name]=[0,1,2].map(i=>Array.isArray(position)&&Number.isFinite(position[i])?clamp(position[i],-100,100):0);
    }
    if (state.preset === 'ortho') state.projection='ortho';
    if (['one','two','three','five'].includes(state.preset)) {
      state.projection=state.preset==='five'?'fisheye':'perspective';
      state.roll=0;
      if (state.preset==='one') state.yaw=state.pitch=0;
      else if(state.preset!=='five') {
        const nearest=Math.round(state.yaw/90)*90;
        if(Math.abs(state.yaw-nearest)<.01)state.yaw=nearest+(state.yaw<nearest?-.01:.01);
        if(state.yaw>180)state.yaw-=360;
        state.pitch=state.preset==='two'?0:clamp(state.pitch,-85,85);
        if(state.preset==='three'&&Math.abs(state.pitch)<.1)state.pitch=state.pitch<0?-.1:.1;
      }
    }
    return state;
  }
  function orbit(state, dx, dy, width, height, sensitivity=.25) {
    const wrap=value=>((value+180)%360+360)%360-180;
    if(state.preset==='one')return normalize({...state,panX:state.panX+dx/width*100,panY:state.panY+dy/height*100});
    if(state.preset==='two')return normalize({...state,yaw:wrap(state.yaw+dx*sensitivity),panY:state.panY+dy/height*100});
    return normalize({...state,yaw:wrap(state.yaw+dx*sensitivity),pitch:state.preset==='three'?state.pitch+dy*sensitivity:wrap(state.pitch+dy*sensitivity)});
  }
  function camera(state, width, height, gizmo = false) {
    state=normalize(state);
    const yaw = state.yaw * radians, pitch = state.pitch * radians, roll = state.roll * radians;
    const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const r0 = [cy, 0, -sy], u0 = [-sy * sp, cp, -cy * sp];
    const right = r0.map((v, i) => v * cr + u0[i] * sr);
    const up = u0.map((v, i) => v * cr - r0[i] * sr);
    const forward = [-sy * cp, -sp, -cy * cp];
    const distance = gizmo ? 16 : state.distance;
    return {
      width, height, right, up, forward, distance,
      eye: forward.map(v => -v * distance),
      cx: width * (.5 + (gizmo ? 0 : state.panX / 100)),
      cy: height * ((gizmo ? .46 : .5) + (gizmo ? 0 : state.panY / 100)),
      focal: width * state.focalLength / 36 * (gizmo ? 1 : state.viewZoom / 100),
      scale: gizmo ? Math.min(width, height) * .265 : Math.min(width, height) / state.distance * state.viewZoom / 100,
      ortho: gizmo || state.projection === 'ortho', fisheye: !gizmo && state.projection==='fisheye',
      distortion: state.distortion/100, near: .12
    };
  }
  function cameraPoint(p, cam) {
    const relative=p.map((v,i)=>v-cam.eye[i]);
    return [dot(relative, cam.right), dot(relative, cam.up), dot(relative, cam.forward)];
  }
  function fromCamera(p, cam) {
    if(cam.fisheye){
      const length=Math.hypot(p[0],p[1]);
      if(length<1e-12)return [cam.cx,cam.cy];
      const theta=Math.atan2(length,p[2]);
      const u=Math.sin(theta);
      const radius=cam.focal*(u+.5*(1-cam.distortion)*u*u*u*(1-u*u));
      return [cam.cx+radius*p[0]/length,cam.cy-radius*p[1]/length];
    }
    const scale = cam.ortho ? cam.scale : cam.focal / p[2];
    return [cam.cx + p[0] * scale, cam.cy - p[1] * scale];
  }
  function project(p, cam) {
    const v = cameraPoint(p, cam);
    if (!cam.ortho && v[2] < cam.near) return null;
    return fromCamera(v, cam);
  }
  function moveModel(state, dx, dy, width, height) {
    state=normalize(state);
    if(!state.showCube||!Number.isFinite(dx)||!Number.isFinite(dy)||width<=0||height<=0)return state;
    const position=state.modelPositions[state.referenceModel],cam=camera(state,width,height);
    const p=cameraPoint(position,cam);
    if(!cam.ortho&&p[2]<cam.near)return state;
    const screen=fromCamera(p,cam);
    let x=screen[0]+dx-cam.cx,y=cam.cy-screen[1]-dy;
    if(cam.fisheye){
      // Invert the radial projection on a camera-parallel plane at the model's depth.
      const length=Math.hypot(x,y),radius=Math.min(length/cam.focal,.98);
      let lo=0,hi=1;
      for(let i=0;i<40;i++){
        const u=(lo+hi)/2,r=u+.5*(1-cam.distortion)*u*u*u*(1-u*u);
        if(r<radius)lo=u;else hi=u;
      }
      const u=(lo+hi)/2,scale=length>1e-10?p[2]*u/Math.sqrt(1-u*u)/length:0;
      x*=scale;y*=scale;
    }else{
      const scale=cam.ortho?cam.scale:cam.focal/p[2];x/=scale;y/=scale;
    }
    const delta=position.map((v,i)=>(x-p[0])*cam.right[i]+(y-p[1])*cam.up[i]);
    let fraction=1;
    for(let i=0;i<3;i++)if(Math.abs(delta[i])>1e-12){
      fraction=Math.min(fraction,((delta[i]>0?100:-100)-position[i])/delta[i]);
    }
    const moved=position.map((v,i)=>v+delta[i]*Math.max(0,fraction));
    return normalize({...state,modelPositions:{...state.modelPositions,[state.referenceModel]:moved}});
  }
  function framingSize(state, points) {
    const cam=camera({...state,panX:0,panY:0},1600,1600/state.aspect);
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(const p of points){
      const q=project(p,cam);if(!q)return Infinity;
      left=Math.min(left,q[0]);right=Math.max(right,q[0]);
      top=Math.min(top,q[1]);bottom=Math.max(bottom,q[1]);
    }
    return Math.max((right-left)/cam.width,(bottom-top)/cam.height);
  }
  function moveModelDepth(state, dy, height, minimumDepth=.2) {
    state=normalize(state);
    if(!state.showCube||!Number.isFinite(dy)||!Number.isFinite(height)||height<=0||!Number.isFinite(minimumDepth))return state;
    const position=state.modelPositions[state.referenceModel],cam=camera(state,1600,1600/state.aspect);
    const depth=cameraPoint(position,cam)[2],near=Math.max(cam.near+.01,minimumDepth);
    const target=Math.max(near,Math.max(depth,near)*Math.exp(clamp(-dy/height*3,-2,2)));
    const delta=cam.forward.map(v=>v*(target-depth));
    // Stop the whole translation at a world bound; never clamp axes independently.
    let fraction=1;
    for(let i=0;i<3;i++)if(Math.abs(delta[i])>1e-12){
      fraction=Math.min(fraction,((delta[i]>0?100:-100)-position[i])/delta[i]);
    }
    const moved=position.map((v,i)=>v+delta[i]*Math.max(0,fraction));
    return normalize({...state,modelPositions:{...state.modelPositions,[state.referenceModel]:moved}});
  }
  function modelAxes(state,width,height){
    const cam=camera(state,width,height),position=state.modelPositions[state.referenceModel];
    const origin=project(position,cam);if(!origin)return [];
    const vps=vanishingPoints(cam);
    if(!cam.fisheye)vps.sort((a,b)=>['x','z','y'].indexOf(a.axis)-['x','z','y'].indexOf(b.axis));
    if(cam.ortho)for(const [i,axis] of ['x','y','z'].entries()){
      if(Math.hypot(cam.right[i],cam.up[i])>1e-5)vps.push({axis,label:axis.toUpperCase(),color:axisColors[axis],x:origin[0]+cam.right[i]*1000,y:origin[1]-cam.up[i]*1000});
    }
    return vps.map((vp,index)=>{
      const i=['x','y','z'].indexOf(vp.axis),p=cameraPoint(position,cam);
      let points;
      if(cam.fisheye){
        const a=[0,0,0];a[i]=1;
        const v=position.map((value,k)=>value-cam.eye[k]);v[i]=0;
        const length=Math.hypot(...v);
        points=length<1e-8?null:hemisphereCurve(cam,a,v.map(value=>value/length));
      }else{
        const dx=cam.ortho?cam.right[i]:cam.right[i]*p[2]-p[0]*cam.forward[i];
        const dy=cam.ortho?-cam.up[i]:-cam.up[i]*p[2]+p[1]*cam.forward[i];
        points=clipInfinite(-dy,dx,dy*origin[0]-dx*origin[1],width,height);
      }
      const endOn=!points&&Math.hypot(vp.x-origin[0],vp.y-origin[1])<1e-6;
      return points||endOn?{...vp,label:vp.label||`${index+1}PF`,origin,points:points||[origin,origin],endOn}:null;
    }).filter(Boolean);
  }
  function pickModelAxis(state,pointer,width,height){
    let best=null,score=Infinity;
    for(const candidate of modelAxes(state,width,height)){
      if(!candidate.endOn&&Math.hypot(pointer[0]-candidate.origin[0],pointer[1]-candidate.origin[1])<12)continue;
      let distance=Infinity;
      for(let i=1;i<candidate.points.length;i++){
        const a=candidate.points[i-1],b=candidate.points[i],dx=b[0]-a[0],dy=b[1]-a[1];
        const t=clamp(((pointer[0]-a[0])*dx+(pointer[1]-a[1])*dy)/(dx*dx+dy*dy||1),0,1);
        distance=Math.min(distance,Math.hypot(pointer[0]-a[0]-t*dx,pointer[1]-a[1]-t*dy));
      }
      // Opposite fisheye endpoints share one world axis; prefer the pointed side.
      if((pointer[0]-candidate.origin[0])*(candidate.x-candidate.origin[0])+(pointer[1]-candidate.origin[1])*(candidate.y-candidate.origin[1])<0)distance+=.1;
      if(distance<score){score=distance;best=candidate;}
    }
    return best;
  }
  function moveModelOnAxis(state,axis,target,width,height,minimumDepth=.2){
    state=normalize(state);
    const i=['x','y','z'].indexOf(axis);
    if(!state.showCube||i<0||!Array.isArray(target)||target.length!==2||!target.every(Number.isFinite)||width<=0||height<=0||!Number.isFinite(minimumDepth))return state;
    const cam=camera(state,width,height),position=state.modelPositions[state.referenceModel],depth=cameraPoint(position,cam)[2];
    let lo=-100-position[i],hi=100-position[i];
    if(Math.abs(cam.forward[i])>1e-10){
      const limit=(minimumDepth-depth)/cam.forward[i];
      if(cam.forward[i]>0)lo=Math.max(lo,limit);else hi=Math.min(hi,limit);
    }else if(depth<minimumDepth)return state;
    if(lo>hi)return state;
    const p=cameraPoint(position,cam),origin=project(position,cam);
    if(!origin)return state;
    if(!cam.ortho&&Math.hypot(cam.right[i]*p[2]-p[0]*cam.forward[i],cam.up[i]*p[2]-p[1]*cam.forward[i])<1e-8){
      const t=clamp((depth*Math.exp(clamp(-(target[1]-origin[1])/height*3,-2,2))-depth)/cam.forward[i],lo,hi);
      const moved=[...position];moved[i]+=t;
      return normalize({...state,modelPositions:{...state.modelPositions,[state.referenceModel]:moved}});
    }
    const error=t=>{
      const p=[...position];p[i]+=t;const q=project(p,cam);
      return q?(q[0]-target[0])**2+(q[1]-target[1])**2:Infinity;
    };
    // Bracket the nearest point on the projected axis, including curvilinear axes.
    const step=(hi-lo)/64;
    let best=0,value=Infinity;
    for(let j=0;j<=64;j++){const e=error(lo+j*step);if(e<value){value=e;best=j;}}
    let a=lo+Math.max(0,best-1)*step,b=lo+Math.min(64,best+1)*step;
    for(let j=0;j<40;j++){
      const t1=a+(b-a)/3,t2=b-(b-a)/3;
      if(error(t1)<error(t2))b=t2;else a=t1;
    }
    const moved=[...position];moved[i]+=(a+b)/2;
    return normalize({...state,modelPositions:{...state.modelPositions,[state.referenceModel]:moved}});
  }
  function framingDistance(before, after, points, minimumDistance=4) {
    if(!points.length)return after.distance;
    const target=framingSize(before,points);
    if(!Number.isFinite(target)||target<=0)return after.distance;
    const cam=camera(after,1600,1600/after.aspect);
    // Keep the complete model ahead of the near plane during the dolly adjustment.
    let lo=Math.max(bounds.distance[0],minimumDistance,...points.map(p=>cam.near-dot(p,cam.forward)+.001));
    let hi=bounds.distance[1];lo=Math.min(lo,hi);
    for(let i=0;i<32;i++){
      const distance=(lo+hi)/2;
      if(framingSize({...after,distance},points)>target)lo=distance;else hi=distance;
    }
    return (lo+hi)/2;
  }
  // Liang-Barsky clipping keeps near-horizon segments finite and inside the image.
  function clip2d(a, b, width, height) {
    let start = 0, end = 1;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const p = [-dx, dx, -dy, dy], q = [a[0], width - a[0], a[1], height - a[1]];
    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-10) { if (q[i] < 0) return null; }
      else {
        const t = q[i] / p[i];
        if (p[i] < 0) start = Math.max(start, t);
        else end = Math.min(end, t);
        if (start > end) return null;
      }
    }
    return [[a[0] + start * dx, a[1] + start * dy], [a[0] + end * dx, a[1] + end * dy]];
  }
  function segment(a, b, cam) {
    let ca = cameraPoint(a, cam), cb = cameraPoint(b, cam);
    if (!cam.ortho) {
      if (ca[2] < cam.near && cb[2] < cam.near) return null;
      if (ca[2] < cam.near) ca = mix(ca, cb, (cam.near - ca[2]) / (cb[2] - ca[2]));
      if (cb[2] < cam.near) cb = mix(cb, ca, (cam.near - cb[2]) / (ca[2] - cb[2]));
    }
    return clip2d(fromCamera(ca, cam), fromCamera(cb, cam), cam.width, cam.height);
  }
  // Intersect the infinite 2D line ax + by + c = 0 with the composition.
  // Homogeneous coefficients avoid division by a vanishing point at infinity.
  function clipInfinite(a, b, c, width, height) {
    const length = Math.hypot(a,b); if(length < 1e-12) return null;
    a/=length; b/=length; c/=length;
    const hits=[];
    const add=(x,y)=>{
      if(Number.isFinite(x)&&Number.isFinite(y)&&x>=-1e-7&&x<=width+1e-7&&y>=-1e-7&&y<=height+1e-7&&!hits.some(p=>Math.hypot(x-p[0],y-p[1])<1e-6))hits.push([clamp(x,0,width),clamp(y,0,height)]);
    };
    if(Math.abs(b)>1e-10){add(0,-c/b);add(width,-(a*width+c)/b);}
    if(Math.abs(a)>1e-10){add(-c/a,0);add(-(b*height+c)/a,height);}
    if(hits.length<2)return null;
    return [hits[0],hits[1]];
  }
  const axisColors = { x: '#cb6562', y: '#669965', z: '#608cb0' };
  function hemisphereCurve(cam,a,b) {
    const transform=p=>[dot(p,cam.right),dot(p,cam.up),dot(p,cam.forward)];
    const u=transform(a),v=transform(b),edgeOn=Math.hypot(u[2],v[2])<1e-10;
    const center=Math.atan2(v[2],u[2]),start=edgeOn?0:center-Math.PI/2,span=edgeOn?2*Math.PI:Math.PI;
    const points=[];
    for(let k=0;k<=192;k++){
      const t=start+k*span/192,p=u.map((value,i)=>value*Math.cos(t)+v[i]*Math.sin(t));
      p[2]=Math.max(0,p[2]);points.push(fromCamera(p,cam));
    }
    return points;
  }
  function fisheyeLines(state, cam) {
    if(!state.showGrid)return [];
    const lines=[],seen=new Set();
    for(const axis of ['x','z','y']){
      if(!state[axis+'Lines'])continue;
      const count=state[axis+'Count'];
      for(let j=0;j<count;j++){
        const angle=(j+.5)*Math.PI/count-Math.PI/2;
        const axisVector={x:[1,0,0],y:[0,1,0],z:[0,0,-1]}[axis];
        const transverse=axis==='x'?[0,Math.sin(angle),-Math.cos(angle)]:axis==='y'?[Math.sin(angle),0,-Math.cos(angle)]:[Math.cos(angle),Math.sin(angle),0];
        const points=hemisphereCurve(cam,axisVector,transverse);
        const a=points[0],b=points.at(-1),mid=points[96];
        const straight=Math.abs((b[0]-a[0])*(mid[1]-a[1])-(b[1]-a[1])*(mid[0]-a[0]))<1e-7;
        const key=lineKey([a,b],cam.width,cam.height)+(straight?'':','+mid.map(v=>v/cam.width).join(','));
        if(!seen.has(key)&&points.some((p,i)=>i&&clip2d(points[i-1],p,cam.width,cam.height))){
          seen.add(key);lines.push({points,axis,color:state.showAxes?axisColors[axis]:state.color,opacity:state.opacity/100,width:state.lineWidth,dash:[]});
        }
      }
    }
    if(state.showHorizon){
      const points=hemisphereCurve(cam,[1,0,0],[0,0,-1]);
      if(points.some((p,i)=>i&&clip2d(points[i-1],p,cam.width,cam.height)))lines.push({points,color:state.horizonColor,opacity:state.opacity/100,width:state.lineWidth,dash:[8,5],horizon:true});
    }
    return lines;
  }
  function lineKey(points, width, height) {
    return [...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]).flatMap(p=>[p[0]/width,p[1]/height]).map(v=>v.toFixed(8)).join(',');
  }
  // Sample only the visible angular interval, so off-canvas vanishing points
  // do not silently reduce the requested number of guides.
  function regularGuides(cam, index, count) {
    const {width,height}=cam, corners=[[0,0],[width,0],[width,height],[0,height]], result=[];
    const depth=cam.ortho?0:cam.forward[index];
    if(Math.abs(depth)<1e-8){
      const dx=cam.right[index],dy=-cam.up[index],length=Math.hypot(dx,dy);
      if(length<1e-8)return result;
      const a=-dy/length,b=dx/length,offsets=corners.map(p=>a*p[0]+b*p[1]);
      const lo=Math.min(...offsets),hi=Math.max(...offsets),spacing=(hi-lo)/count;
      const phase=(((a*(cam.cx-width/2)+b*(cam.cy-height/2))/spacing+.5)%1+1)%1;
      for(let j=0;j<count;j++){
        const offset=lo+(j+.05+.9*phase)*spacing;
        const points=clipInfinite(a,b,-offset,width,height);if(points)result.push(points);
      }
      return result;
    }
    const x=cam.cx+cam.focal*cam.right[index]/depth,y=cam.cy-cam.focal*cam.up[index]/depth;
    const centerAngle=Math.atan2(height/2-y,width/2-x);
    let start=0,end=Math.PI;
    if(x<=0||x>=width||y<=0||y>=height){
      const angles=corners.filter(p=>Math.hypot(p[0]-x,p[1]-y)>1e-8).map(p=>{
        const angle=Math.atan2(p[1]-y,p[0]-x)-centerAngle;
        return Math.atan2(Math.sin(angle),Math.cos(angle));
      });
      start=centerAngle+Math.min(...angles);end=centerAngle+Math.max(...angles);
    }
    for(let j=0;j<count;j++){
      const angle=start+(j+.5)*(end-start)/count,a=-Math.sin(angle),b=Math.cos(angle);
      const points=clipInfinite(a,b,-a*x-b*y,width,height);if(points)result.push(points);
    }
    return result;
  }
  function projectedLines(state, width, height) {
    const cam = camera(state, width, height);
    if(cam.fisheye)return fisheyeLines(state,cam);
    const lines=[], seen=new Set();
    const add=(points,axis)=>{
      if(!points)return;
      const key=lineKey(points,width,height);
      if(seen.has(key))return;seen.add(key);
      lines.push({points,color:state.showAxes?axisColors[axis]:state.color,opacity:state.opacity/100,width:state.lineWidth,dash:[],axis});
    };
    if(state.showGrid)['x','z','y'].forEach(axis=>{
      if(!state[axis+'Lines'])return;
      const index={x:0,y:1,z:2}[axis],count=state[axis+'Count'];
      if(!cam.ortho&&state.gridStyle==='space'){
        // An open 3D lattice: lines extend through the entire composition.
        // Two transverse world coordinates define each infinite axis line.
        const basis={x:[1,2],y:[0,2],z:[0,1]}[axis],step=4;
        const centers=basis.map(i=>Math.round(cam.eye[i]/step));
        const direction=[0,0,0],candidates=[],keys=new Set();direction[index]=1;
        const collect=points=>{
          if(!points)return;
          const key=lineKey(points,width,height);
          if(!keys.has(key)){keys.add(key);candidates.push(points);}
        };
        for(let j=-7;j<=7;j++)for(let k=-7;k<=7;k++){
          const p=[0,0,0];p[basis[0]]=(centers[0]+j)*step;p[basis[1]]=(centers[1]+k)*step;
          const v=p.map((value,i)=>value-cam.eye[i]);
          const n=[direction[1]*v[2]-direction[2]*v[1],direction[2]*v[0]-direction[0]*v[2],direction[0]*v[1]-direction[1]*v[0]];
          const a=dot(n,cam.right)/cam.focal,b=-dot(n,cam.up)/cam.focal,c=dot(n,cam.forward)-a*cam.cx-b*cam.cy;
          collect(clipInfinite(a,b,c,width,height));
        }
        if(candidates.length<count)regularGuides(cam,index,count).forEach(collect);
        candidates.sort((a,b)=>Math.atan2(a[1][1]-a[0][1],a[1][0]-a[0][0])-Math.atan2(b[1][1]-b[0][1],b[1][0]-b[0][0])||a[0][0]-b[0][0]||a[0][1]-b[0][1]);
        const take=Math.min(count,candidates.length);
        for(let j=0;j<take;j++)add(candidates[Math.floor((j+.5)*candidates.length/take)],axis);
      }else{
        regularGuides(cam,index,count).forEach(points=>add(points,axis));
      }
    });
    if (state.showGrid && state.showHorizon && !cam.ortho) {
      const a = cam.right[1], b = cam.up[1], c = cam.forward[1];
      let points = null;
      if (Math.abs(b) > 1e-6) {
        const y = x => cam.cy + (a * (x - cam.cx) + c * cam.focal) / b;
        points = clip2d([0, y(0)], [width, y(width)], width, height);
      } else if (Math.abs(a) > 1e-6) {
        const x = cam.cx - c * cam.focal / a;
        points = clip2d([x, 0], [x, height], width, height);
      }
      if (points) lines.push({ points, color: state.horizonColor, opacity: state.opacity/100, width: state.lineWidth, dash: [8, 5], horizon: true });
    }
    return lines;
  }
  const vertices = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const faces = [
    { key:'back', label:'TRÁS', ids:[1,0,3,2], normal:[0,0,-1], light:'#d8e2db', dark:'#4b5f63' },
    { key:'front', label:'FRENTE', ids:[4,5,6,7], normal:[0,0,1], light:'#d6e0e6', dark:'#466574' },
    { key:'left', label:'ESQUERDA', ids:[0,4,7,3], normal:[-1,0,0], light:'#d7ddcf', dark:'#657456' },
    { key:'right', label:'DIREITA', ids:[5,1,2,6], normal:[1,0,0], light:'#dfdad0', dark:'#786458' },
    { key:'top', label:'TOPO', ids:[3,7,6,2], normal:[0,1,0], light:'#edf0e3', dark:'#78816d' },
    { key:'bottom', label:'BASE', ids:[0,1,5,4], normal:[0,-1,0], light:'#c8d4d4', dark:'#4b5d64' }
  ];
  function cubeFaces(cam, size = 1) {
    return faces.filter(face => {
      const towardsEye = cam.ortho ? cam.forward.map(v => -v) : cam.eye.map((v, i) => v - face.normal[i]*size);
      return dot(face.normal, towardsEye) > .001;
    }).map(face => {
      const points = face.ids.map(i => project(vertices[i].map(v=>v*size), cam));
      return { ...face, points, depth: face.ids.reduce((sum, i) => sum + cameraPoint(vertices[i].map(v=>v*size), cam)[2], 0) / 4 };
    }).filter(f => f.points.every(Boolean)).sort((a, b) => b.depth - a.depth);
  }
  function vanishingPoints(cam) {
    if (cam.ortho) return [];
    if(cam.fisheye)return [
      {axis:'z',direction:[0,0,-1]}, {axis:'z',direction:[0,0,1]},
      {axis:'x',direction:[-1,0,0]}, {axis:'x',direction:[1,0,0]},
      {axis:'y',direction:[0,1,0]}, {axis:'y',direction:[0,-1,0]}
    ].map(v=>({...v,cameraDirection:[dot(v.direction,cam.right),dot(v.direction,cam.up),dot(v.direction,cam.forward)]}))
      .filter(v=>v.cameraDirection[2]>=-1e-10)
      .map((v,i)=>{const [x,y]=fromCamera([v.cameraDirection[0],v.cameraDirection[1],Math.max(0,v.cameraDirection[2])],cam);return {...v,label:`${i+1}PF`,x,y,color:axisColors[v.axis]};});
    return ['x', 'y', 'z'].map((axis, i) => {
      const depth = cam.forward[i];
      if (Math.abs(depth) < 1e-5) return null;
      return { axis, color: axisColors[axis], x: cam.cx + cam.focal * cam.right[i] / depth, y: cam.cy - cam.focal * cam.up[i] / depth };
    }).filter(Boolean);
  }
  function annotations(state,width,height,scale=width/1600) {
    if(!state.showGrid)return [];
    const result=[],cam=camera(state,width,height);
    if(state.showHorizon){
      const horizon=projectedLines(state,width,height).find(line=>line.horizon);
      if(horizon){
        const [a,b]=horizon.points;
        const [x,y]=horizon.points.length>2?horizon.points[Math.round((horizon.points.length-1)*.12)]:[a[0]*.88+b[0]*.12,a[1]*.88+b[1]*.12];
        if(x>8*scale && x<width-80*scale && y>14*scale && y<height-12*scale)result.push({type:'label',x,y:y-7*scale,text:'HORIZONTE',color:state.horizonColor,align:'left'});
      }
    }
    if(state.showVps){
      const points=vanishingPoints(cam);
      if(!cam.fisheye)points.sort((a,b)=>['x','z','y'].indexOf(a.axis)-['x','z','y'].indexOf(b.axis));
      for(const [index,vp] of points.entries()){
        if(!state[vp.axis+'Lines'])continue;
        const text=vp.label||`${index+1}PF`;
        if(vp.x>=0&&vp.x<=width&&vp.y>=0&&vp.y<=height){
          result.push({type:'circle',x:vp.x,y:vp.y,color:vp.color});
          result.push({type:'label',x:clamp(vp.x+9*scale,5*scale,width-37*scale),y:clamp(vp.y-9*scale,12*scale,height-4*scale),text,color:vp.color,align:'left'});
        }else{
          const dx=vp.x-width/2,dy=vp.y-height/2,t=Math.min((width/2-17*scale)/Math.max(Math.abs(dx),.0001),(height/2-17*scale)/Math.max(Math.abs(dy),.0001));
          const x=width/2+dx*t,y=height/2+dy*t;
          result.push({type:'arrow',x,y,angle:Math.atan2(dy,dx),color:vp.color});
          result.push({type:'label',x:x+(x>width/2?-10:10)*scale,y:y+(y>height-35*scale?-8:14)*scale,text:`${text} fora`,color:vp.color,align:x>width/2?'right':'left'});
        }
      }
    }
    const placed=[];
    const labels=result.filter(mark=>mark.type==='label').sort((a,b)=>(a.text==='HORIZONTE')-(b.text==='HORIZONTE'));
    for(const label of labels){
      const textWidth=label.text.length*6*scale,left=label.align==='right'?label.x-textWidth:label.x;
      const initialY=label.y;
      for(const offset of [0,16,-16,32,-32,48,-48]){
        const y=clamp(initialY+offset*scale,12*scale,height-4*scale);
        const bounds={left,right:left+textWidth,top:y-11*scale,bottom:y+3*scale};
        if(!placed.some(p=>bounds.left<p.right&&bounds.right>p.left&&bounds.top<p.bottom&&bounds.bottom>p.top)){
          label.y=y;placed.push(bounds);break;
        }
      }
    }
    return result;
  }
  function svg(state, width = 2400) {
    const height = Math.round(width / state.aspect), scale = width / 1600;
    const lines = projectedLines(state, width, height);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n<title>Grade de perspectiva</title>\n` +
      lines.map(l => {
        const shape=l.points.length>2?`polyline points="${l.points.map(p=>p.map(v=>v.toFixed(3)).join(',')).join(' ')}" fill="none"`:`line x1="${l.points[0][0].toFixed(3)}" y1="${l.points[0][1].toFixed(3)}" x2="${l.points[1][0].toFixed(3)}" y2="${l.points[1][1].toFixed(3)}"`;
        return `<${shape} stroke="${l.color}" stroke-opacity="${l.opacity.toFixed(3)}" stroke-width="${(l.width * scale).toFixed(3)}"${l.dash.length ? ` stroke-dasharray="${l.dash.map(d => d * scale).join(' ')}"` : ''}/>`;
      }).join('\n') + '\n' +
      annotations(state,width,height,scale).map(mark=>{
        if(mark.type==='label')return `<text x="${mark.x.toFixed(3)}" y="${mark.y.toFixed(3)}" fill="${mark.color}" font-size="${10*scale}" font-family="Segoe UI,Arial,sans-serif" text-anchor="${mark.align==='right'?'end':'start'}">${mark.text}</text>`;
        if(mark.type==='circle')return `<circle cx="${mark.x.toFixed(3)}" cy="${mark.y.toFixed(3)}" r="${5*scale}" stroke="${mark.color}" fill="none" stroke-width="${1.3*scale}"/>`;
        return `<path d="M ${-6*scale} ${-4*scale} L 0 0 L ${-6*scale} ${4*scale}" transform="translate(${mark.x.toFixed(3)} ${mark.y.toFixed(3)}) rotate(${mark.angle/radians})" stroke="${mark.color}" fill="none" stroke-width="${1.3*scale}"/>`;
      }).join('\n')+'\n</svg>';
  }
  return { defaults, bounds, normalize, orbit, clamp, dot, camera, cameraPoint, fromCamera, project, moveModel, moveModelDepth, modelAxes, pickModelAxis, moveModelOnAxis, framingSize, framingDistance, segment, clip2d, clipInfinite, projectedLines, cubeFaces, vanishingPoints, annotations, svg, axisColors };
});
