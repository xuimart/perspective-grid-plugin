/* A single camera state drives the controller cube, document cube, and grid. */
(function () {
  'use strict';
  const G = window.PerspectiveGeometry, $ = id => document.getElementById(id);
  const storageKey = 'perspective-grid-prototype-v3';
  let state, migrated=false;
  try {
    const stored=JSON.parse(localStorage.getItem(storageKey));
    if(stored&&typeof stored==='object'&&!Array.isArray(stored))state=G.normalize(stored);
    else{
      const legacy=JSON.parse(localStorage.getItem('perspective-grid-prototype-v2'));
      const grid={};
      if(legacy&&typeof legacy==='object'){
        const clean=G.normalize(legacy);
        for(const key of ['aspect','gridStyle','xCount','yCount','zCount','lineWidth','opacity','color','horizonColor','xLines','yLines','zLines','showGrid','showHorizon','showAxes','showVps'])grid[key]=clean[key];
        migrated=true;
      }
      state=G.normalize({...grid,showCube:true});
    }
  } catch (_) { state = G.normalize({showCube:true}); }
  state=PerspectiveReference.stabilize(state,G);
  let reference = null, objectUrl = null, tool = 'orbit', hoverFace = null, faceHits = [];
  let scheduled = false, persistTimer, toastTimer, drag = null, imageSequence = 0;
  let axisGuide=null,lastPointer=null;
  const scene = $('scene'), cube = $('cube'), stage = $('stage'), board = $('artboard');
  const context = scene.getContext('2d'), cubeContext = cube.getContext('2d');
  const cameraKeys = ['yaw', 'pitch', 'roll', 'focalLength', 'distortion', 'distance', 'panX', 'panY', 'viewZoom', 'boxSize'];
  const gridBase = { gridStyle:'rays', showGrid:true, xLines:true, yLines:true, zLines:true };
  const gridProfiles = {
    clean: { ...gridBase, showHorizon:true, showVps:true, showAxes:false },
    study: { ...gridBase, showHorizon:true, showVps:true, showAxes:true },
    lines: { ...gridBase, showHorizon:false, showVps:false, showAxes:false }
  };
  const controls = [
    { key:'yaw', label:'Rotação horizontal', unit:'°', min:-180, max:180, step:1, group:'cameraSliders' },
    { key:'pitch', label:'Inclinação vertical', unit:'°', min:-180, max:180, step:.1, group:'cameraSliders' },
    { key:'roll', label:'Inclinação do quadro', unit:'°', min:-180, max:180, step:1, group:'cameraSliders' },
    { key:'focalLength', label:'Distância focal', unit:'mm', min:10, max:300, step:1, group:'lensSliders' },
    { key:'distortion', label:'Distorção', unit:'%', min:0, max:100, step:1, group:'fishSliders' },
    { key:'distance', label:'Distância da câmera', unit:'', min:4, max:500, step:.1, group:'cameraSliders' },
    { key:'xCount', label:'Guias X', unit:'', min:1, max:64, step:1, group:'guideSliders' },
    { key:'zCount', label:'Guias Z', unit:'', min:1, max:64, step:1, group:'guideSliders' },
    { key:'yCount', label:'Guias Y', unit:'', min:1, max:64, step:1, group:'guideSliders' },
    { key:'opacity', label:'Opacidade', unit:'%', min:10, max:100, step:1, group:'gridSliders' },
    { key:'lineWidth', label:'Espessura', unit:'px', min:.5, max:4, step:.1, group:'gridSliders' }
  ];
  for (const c of controls) {
    const wrapper = document.createElement('div'); wrapper.className = 'slider-control';
    wrapper.innerHTML = `<div class="slider-heading"><label for="${c.key}Range">${c.label}</label><span class="number-wrap"><input id="${c.key}Number" data-key="${c.key}" type="number" min="${c.min}" max="${c.max}" step="${c.step}" aria-label="${c.label}, valor"><small>${c.unit}</small></span></div><input id="${c.key}Range" data-key="${c.key}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" aria-label="${c.label}">`;
    $(c.group).appendChild(wrapper);
  }
  function notify(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3300);
  }
  function save() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) {} }, 180);
  }
  function sync() {
    document.querySelectorAll('[data-key]').forEach(el => {
      const value = state[el.dataset.key];
      if (el.type === 'checkbox') el.checked = value;
      else {
        if (document.activeElement !== el || el.type === 'range') el.value = Number(value.toFixed(2));
        if (el.type === 'range') el.style.setProperty('--fill', `${(value - Number(el.min)) / (Number(el.max) - Number(el.min)) * 100}%`);
      }
    });
    $('preset').value = state.preset; $('aspect').value = state.aspect; $('gridColor').value = state.color;
    $('horizonColor').value=state.horizonColor;$('gridStyle').value=state.gridStyle;
    document.querySelectorAll('[data-grid-preset]').forEach(button => {
      const active = Object.entries(gridProfiles[button.dataset.gridPreset]).every(([key, value]) => state[key] === value);
      button.setAttribute('aria-pressed', String(active));
    });
    const ortho=state.projection==='ortho',fish=state.preset==='five',locked=['one','two','three','five'].includes(state.preset);
    $('focalLengthRange').disabled = $('focalLengthNumber').disabled = $('lensPreset').disabled = ortho;
    $('fishSliders').hidden=!fish;
    $('gridStyle').disabled=fish;
    $('referenceModel').value=state.referenceModel;
    $('lensPreset').value=['10','14','24','35','50','85','135','200','300'].includes(String(state.focalLength))?String(state.focalLength):'';
    $('lensInfo').textContent=ortho?'Projeção paralela':fish?'Sensor 36 mm · projeção curvilínea':`Sensor 36 mm · horizontal ${(2*Math.atan(18/state.focalLength)*180/Math.PI).toFixed(1)}°`;
    ['yaw','pitch','roll'].forEach(key=>{
      const disabled=key==='roll'?locked:key==='pitch'?['one','two'].includes(state.preset):state.preset==='one';
      $(key+'Range').disabled=$(key+'Number').disabled=disabled;
      $(key+'Range').title=$(key+'Number').title=disabled?'Este eixo é mantido pelo modo de perspectiva selecionado':'';
    });
    document.querySelectorAll('[data-view]').forEach(button=>{
      button.disabled=(state.preset==='one'&&button.dataset.view!=='front')||(['two','three'].includes(state.preset)&&button.dataset.view==='top');
    });
    $('boxSize').disabled = !state.showCube;
    $('centerModelBtn').disabled = state.modelPositions[state.referenceModel].every(v=>Math.abs(v)<1e-8);
    ['x','y','z'].forEach(axis => {
      $(axis+'CountRange').disabled = $(axis+'CountNumber').disabled = !state[axis+'Lines'];
    });
    const names = { free:'Perspectiva livre', one:'1 ponto de fuga · fixo', two:'2 pontos de fuga · fixos', three:'3 pontos de fuga · fixos', five:'Olho de peixe', ortho:'Projeção ortográfica' };
    $('projectionStatus').textContent = names[state.preset];
    const frameOnly=state.preset==='one';
    document.querySelector('.orientation-caption').textContent=frameOnly?'Enquadramento · orientação fixa':state.preset==='two'?'Rotação horizontal · verticais paralelas':'Orientação da câmera';
    $('cube').setAttribute('aria-label',frameOnly?'Controle de enquadramento. Arraste para deslocar sem alterar o modo.':'Cubo de orientação. Arraste respeitando o modo de perspectiva selecionado.');
    $('cameraStatus').textContent = `Rotação ${state.yaw.toFixed(0)}° · Inclinação ${state.pitch.toFixed(0)}°`;
    $('dimensions').textContent = `1600 × ${Math.round(1600 / state.aspect)}`;
  }
  function change(patch) {
    let next = G.normalize({ ...state, ...patch });
    if (!('preset' in patch) && !('distance' in patch) && next.projection !== 'ortho' &&
        (next.focalLength !== state.focalLength || next.distortion !== state.distortion)) {
      next = G.normalize({...next,distance:PerspectiveReference.preserveFraming(state,next,G)});
    }
    state = PerspectiveReference.stabilize(next,G);
    sync(); renderSoon(); save();
  }
  function renderSoon() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; resize(); drawScene(); drawCube(); });
  }
  function sizeCanvas(canvas, width, height) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }
  let documentSize = { width: 800, height: 500 }, controllerSize = { width:320, height:163 };
  function resize() {
    const style = getComputedStyle(stage);
    const availableW = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableH = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const width = Math.max(1, Math.min(availableW, availableH * state.aspect));
    const height = width / state.aspect;
    board.style.width = `${width}px`; board.style.height = `${height}px`;
    documentSize = sizeCanvas(scene, width, height);
    const rect = cube.getBoundingClientRect();
    controllerSize = sizeCanvas(cube, rect.width, rect.height);
  }
  function path(ctx, points) {
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
  }
  function strokeGrid(ctx, width, height, forExport = false) {
    const lines = G.projectedLines(state, width, height);
    const scale = width / 1600;
    ctx.save(); ctx.lineCap = 'butt';
    for (const line of lines) {
      ctx.strokeStyle = line.color; ctx.globalAlpha = line.opacity;
      ctx.lineWidth = line.width * scale;
      ctx.setLineDash(line.dash.map(v => v * scale));
      path(ctx, line.points); ctx.stroke();
    }
    ctx.restore(); return lines;
  }
  function paintFaces(ctx, cam, dark) {
    const faces = G.cubeFaces(cam, dark ? 1 : state.boxSize);
    ctx.save(); ctx.lineJoin = 'round';
    for (const face of faces) {
      path(ctx, face.points); ctx.closePath();
      ctx.globalAlpha = dark ? 1 : .72;
      ctx.fillStyle = dark ? (hoverFace === face.key ? '#91a17c' : face.dark) : face.light; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = dark ? '#b8c9cacc' : '#455962'; ctx.lineWidth = dark ? 1.1 : 1.2; ctx.stroke();
      if (dark) {
        const c = face.points.reduce((out,p) => [out[0]+p[0]/4, out[1]+p[1]/4], [0,0]);
        const area = Math.abs(face.points.reduce((a,p,i) => { const q = face.points[(i+1)%4]; return a+p[0]*q[1]-q[0]*p[1]; },0)/2);
        if (area > 500) {
          ctx.font = '600 9px "Segoe UI", sans-serif';
          const crossings=[];
          for(let i=0;i<4;i++){
            const a=face.points[i],b=face.points[(i+1)%4];
            if((a[1]<=c[1] && b[1]>c[1]) || (b[1]<=c[1] && a[1]>c[1]))crossings.push(a[0]+(b[0]-a[0])*(c[1]-a[1])/(b[1]-a[1]));
          }
          const available=crossings.length>=2?Math.max(...crossings)-Math.min(...crossings):0;
          if(available>ctx.measureText(face.label).width+8){
            ctx.fillStyle = '#f0f4ed'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(face.label, c[0], c[1]);
          }
        }
      }
    }
    ctx.restore(); return faces;
  }
  function drawScene() {
    const { width:w, height:h } = documentSize, ctx = context;
    ctx.clearRect(0,0,w,h); ctx.fillStyle = '#dedfdf'; ctx.fillRect(0,0,w,h);
    if (reference) {
      const scale = Math.min(w/reference.naturalWidth, h/reference.naturalHeight);
      const rw=reference.naturalWidth*scale, rh=reference.naturalHeight*scale;
      ctx.drawImage(reference,(w-rw)/2,(h-rh)/2,rw,rh);
    }
    const cam = G.camera(state,w,h);
    const lines = strokeGrid(ctx,w,h);
    $('guideCount').textContent = `${lines.filter(line=>line.axis).length} guias visíveis`;
    $('renderError').hidden=true;
    if (state.showCube) {
      try{
        const rendered=PerspectiveReference.render(state,cam,Math.min(window.devicePixelRatio||1,2));
        ctx.drawImage(rendered,0,0,w,h);
      }catch(_){$('renderError').hidden=false;}
    }
    drawAnnotations(ctx,w,h);
    drawAxisGuide(ctx,w,h);
  }
  function drawAxisGuide(ctx,w,h){
    $('axisStatus').hidden=!axisGuide;
    if(!axisGuide)return;
    const guide=G.modelAxes(state,w,h).find(a=>a.axis===axisGuide.axis&&a.label===axisGuide.label);
    if(!guide)return;
    $('axisStatus').textContent=`${guide.label} · ${guide.axis.toUpperCase()}`;
    ctx.save();ctx.strokeStyle=guide.color;ctx.fillStyle=guide.color;ctx.lineWidth=2;
    ctx.setLineDash([7,4]);path(ctx,guide.points);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(...guide.origin,6,0,Math.PI*2);ctx.stroke();
    const x=G.clamp(guide.x,12,w-12),y=G.clamp(guide.y,12,h-12);
    ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  function previewAxis(e){
    if(drag)return;
    axisGuide=e.ctrlKey&&e.shiftKey&&state.showCube&&lastPointer?G.pickModelAxis(state,lastPointer,documentSize.width,documentSize.height):null;
    renderSoon();
  }
  function drawAnnotations(ctx,w,h,forExport=false){
    const scale=forExport?w/1600:1;
    ctx.save();ctx.lineWidth=1.3*scale;ctx.font=`${10*scale}px "Segoe UI",sans-serif`;
    for(const mark of G.annotations(state,w,h,scale)){
      ctx.fillStyle=mark.color;ctx.strokeStyle=mark.color;
      if(mark.type==='label'){ctx.textAlign=mark.align;ctx.fillText(mark.text,mark.x,mark.y);}
      if(mark.type==='circle'){ctx.beginPath();ctx.arc(mark.x,mark.y,5*scale,0,Math.PI*2);ctx.stroke();}
      if(mark.type==='arrow'){ctx.save();ctx.translate(mark.x,mark.y);ctx.rotate(mark.angle);path(ctx,[[-6*scale,-4*scale],[0,0],[-6*scale,4*scale]]);ctx.stroke();ctx.restore();}
    }
    ctx.restore();
  }
  function drawCube() {
    const { width:w, height:h } = controllerSize, ctx=cubeContext;
    ctx.clearRect(0,0,w,h);
    const cam=G.camera(state,w,h,true);
    // The cube uses an orthographic indicator with exactly the document's orientation.
    ctx.save();ctx.strokeStyle='#899ba3';ctx.globalAlpha=.12;ctx.lineWidth=.65;
    for(let i=-3;i<=3;i++) {
      for(const ends of [[[i,-1.03,-3],[i,-1.03,3]],[[-3,-1.03,i],[3,-1.03,i]]]) {
        const seg=G.segment(ends[0],ends[1],cam);if(seg){path(ctx,seg);ctx.stroke();}
      }
    }
    ctx.restore();
    faceHits=paintFaces(ctx,cam,true);
    const origin=[w-31,29], len=17;
    ['x','y','z'].forEach((axis,i)=>{
      const end=[origin[0]+cam.right[i]*len,origin[1]-cam.up[i]*len];
      ctx.save();ctx.strokeStyle=G.axisColors[axis];ctx.fillStyle=G.axisColors[axis];ctx.lineWidth=1.5;
      path(ctx,[origin,end]);ctx.stroke();ctx.font='bold 9px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.fillText(axis.toUpperCase(),end[0]+cam.right[i]*8,end[1]-cam.up[i]*8+3);ctx.restore();
    });
  }
  document.querySelectorAll('[data-key]').forEach(el=>{
    el.addEventListener('input',()=>{
      const key=el.dataset.key;
      if(el.type==='checkbox') change({[key]:el.checked});
      else {
        if(el.value==='' || !Number.isFinite(el.valueAsNumber)) return;
        const value=G.clamp(el.valueAsNumber,...G.bounds[key]);
        change({[key]:value});
      }
    });
    el.addEventListener('change',()=>{if(el.type==='number')el.value=Number(state[el.dataset.key].toFixed(2));});
    el.addEventListener('blur',sync);
  });
  $('gridColor').addEventListener('input',e=>change({color:e.target.value}));
  $('horizonColor').addEventListener('input',e=>change({horizonColor:e.target.value}));
  $('gridStyle').addEventListener('change',e=>change({gridStyle:e.target.value}));
  document.querySelectorAll('[data-grid-preset]').forEach(button => {
    button.addEventListener('click', () => change(gridProfiles[button.dataset.gridPreset]));
  });
  $('aspect').addEventListener('change',e=>change({aspect:Number(e.target.value)}));
  $('fitViewBtn').addEventListener('click',()=>change({viewZoom:100}));
  $('lensPreset').addEventListener('change',e=>{if(e.target.value)change({focalLength:Number(e.target.value)});});
  $('referenceModel').addEventListener('change',e=>change({referenceModel:e.target.value,showCube:true}));
  $('centerModelBtn').addEventListener('click',()=>change({modelPositions:{...state.modelPositions,[state.referenceModel]:[0,0,0]}}));
  $('fitBtn').addEventListener('click',()=>change(PerspectiveReference.fitState(state,G)));
  const presetValues={
    free:{projection:'perspective'},
    one:{yaw:0,pitch:0,roll:0,projection:'perspective'},
    two:{yaw:43,pitch:0,roll:0,projection:'perspective'},
    three:{yaw:43,pitch:20,roll:0,projection:'perspective'},
    five:{yaw:0,pitch:0,roll:0,projection:'fisheye',focalLength:10,distortion:100,panX:0,panY:0},
    ortho:{projection:'ortho'}
  };
  $('preset').addEventListener('change',e=>change({...presetValues[e.target.value],preset:e.target.value}));
  function resetCamera(){
    cancelDrag();
    const p={};cameraKeys.forEach(k=>p[k]=G.defaults[k]);
    let next=G.normalize({...state,...p,...presetValues[state.preset],modelPositions:G.defaults.modelPositions});
    if(next.showCube&&next.referenceModel!=='box')next=PerspectiveReference.fitState(next,G);
    change(next);notify('Cena restaurada: câmera, zoom, tamanho e posições.');
  }
  $('resetBtn').addEventListener('click',resetCamera);
  function setView(view){
    const views={front:[0,0],back:[180,0],right:[90,0],left:[-90,0],top:[0,90],bottom:[0,-90],iso:[43,20]};
    const [yaw,pitch]=views[view]||views.iso;
    change({yaw,pitch,roll:0});
  }
  document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
  function selectTool(next){tool=next;['orbit','pan'].forEach(t=>{$(t+'Btn').classList.toggle('active',t===tool);$(t+'Btn').setAttribute('aria-pressed',String(t===tool));});board.classList.toggle('moving',tool==='pan');}
  $('orbitBtn').addEventListener('click',()=>selectTool('orbit'));$('panBtn').addEventListener('click',()=>selectTool('pan'));
  function hitFace(x,y){
    for(const face of [...faceHits].reverse()){
      let inside=false;const points=face.points;
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const a=points[i],b=points[j];
        if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
      }
      if(inside)return face.key;
    }return null;
  }
  function bindDrag(canvas,isCube){
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=>{
      if(drag || ![0,1,2].includes(e.button))return;
      if(e.shiftKey&&!state.showCube){notify('Ative Modelo 3D para mover a referência.');return;}
      e.preventDefault();canvas.setPointerCapture(e.pointerId);
      drag={id:e.pointerId,canvas,isCube,initial:state,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,model:e.shiftKey,depth:e.shiftKey&&e.ctrlKey,pan:e.button===2||e.button===1||tool==='pan'};
      if(drag.depth){
        drag.axisState=state;drag.axisStart=[e.clientX,e.clientY];
        drag.axisOrigin=G.project(state.modelPositions[state.referenceModel],G.camera(state,documentSize.width,documentSize.height));
        const rect=canvas.getBoundingClientRect();
        if(!isCube)drag.axis=G.pickModelAxis(state,[(e.clientX-rect.left)/rect.width*documentSize.width,(e.clientY-rect.top)/rect.height*documentSize.height],documentSize.width,documentSize.height);
        axisGuide=drag.axis||null;renderSoon();
      }
    });
    canvas.addEventListener('pointermove',e=>{
      const rect=canvas.getBoundingClientRect();
      lastPointer=[(e.clientX-rect.left)/rect.width*documentSize.width,(e.clientY-rect.top)/rect.height*documentSize.height];
      if(drag && drag.canvas===canvas && drag.id===e.pointerId){
        const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
        if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>3)drag.moved=true;
        if(!drag.moved)return;
        if(drag.depth){
          if(!drag.axisState){
            drag.axisState=state;drag.axisStart=[e.clientX-dx,e.clientY-dy];
            drag.axisOrigin=G.project(state.modelPositions[state.referenceModel],G.camera(state,documentSize.width,documentSize.height));
          }
          if(!drag.axisOrigin)return;
          const target=[drag.axisOrigin[0]+e.clientX-drag.axisStart[0],drag.axisOrigin[1]+e.clientY-drag.axisStart[1]];
          if(!drag.axis)drag.axis=G.pickModelAxis(drag.axisState,target,documentSize.width,documentSize.height);
          axisGuide=drag.axis||null;
          if(drag.axis)change({modelPositions:PerspectiveReference.moveAlongAxis(drag.axisState,drag.axis.axis,target,documentSize.width,documentSize.height,G).modelPositions});
        }
        else if(drag.model)change({modelPositions:G.moveModel(state,dx,dy,documentSize.width,documentSize.height).modelPositions});
        else if(drag.pan)change({panX:state.panX+dx/documentSize.width*100,panY:state.panY+dy/documentSize.height*100});
        else{
          change(G.orbit(state,dx,dy,documentSize.width,documentSize.height,isCube?.65:.25));
        }
      }else{
        previewAxis(e);
        if(isCube){const next=hitFace(e.clientX-rect.left,e.clientY-rect.top);if(next!==hoverFace){hoverFace=next;renderSoon();}}
      }
    });
    function end(e){
      if(!drag || drag.canvas!==canvas || drag.id!==e.pointerId)return;
      if(e.type==='pointerup' && isCube && !drag.moved && !drag.pan && !drag.model){const rect=cube.getBoundingClientRect(),face=hitFace(e.clientX-rect.left,e.clientY-rect.top);if(face)setView(face);}
      cancelDrag(e.type!=='pointerup');
    }
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
    canvas.addEventListener('lostpointercapture',end);
    canvas.addEventListener('pointerleave',()=>{if(!drag){hoverFace=null;lastPointer=null;axisGuide=null;renderSoon();}});
    canvas.addEventListener('wheel',e=>{e.preventDefault();if(drag)return;const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?documentSize.height:1);change({viewZoom:state.viewZoom*Math.exp(-G.clamp(delta,-200,200)*.0015)});},{passive:false});
  }
  function cancelDrag(restore=false){
    const previous=drag;drag=null;axisGuide=null;lastPointer=null;
    if(previous){
      if(restore){state=previous.initial;sync();}
      if(previous.canvas.hasPointerCapture(previous.id))previous.canvas.releasePointerCapture(previous.id);
      save();
    }
    renderSoon();
  }
  bindDrag(scene,false);bindDrag(cube,true);
  document.addEventListener('keydown',previewAxis);document.addEventListener('keyup',previewAxis);
  window.addEventListener('blur',()=>cancelDrag(true));
  window.addEventListener('perspective-renderer-restored',renderSoon);
  window.addEventListener('perspective-renderer-lost',renderSoon);
  function openTab(name){
    ['camera','grid'].forEach(n=>{$(n+'Tab').setAttribute('aria-selected',String(n===name));$(n+'Tab').tabIndex=n===name?0:-1;$(n+'Panel').hidden=n!==name;});
  }
  ['camera','grid'].forEach(name=>{
    $(name+'Tab').addEventListener('click',()=>openTab(name));
    $(name+'Tab').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'camera':e.key==='End'?'grid':name==='camera'?'grid':'camera';openTab(next);$(next+'Tab').focus();}});
  });
  $('helpBtn').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').addEventListener('click',()=>$('helpDialog').close());
  $('helpDialog').addEventListener('click',e=>{if(e.target===$('helpDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&drag){cancelDrag(true);return;}
    if(drag)return;
    if(e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,select,textarea')||$('helpDialog').open)return;
    const key=e.key.toLowerCase();
    if(key==='r')resetCamera();if(key==='1')selectTool('orbit');if(key==='2')selectTool('pan');if(key==='g')change({showGrid:!state.showGrid});if(key==='c')change({showCube:!state.showCube});if(key==='?')$('helpDialog').showModal();
  });
  $('imageBtn').addEventListener('click',()=>$('imageFile').click());
  function loadReference(file){
    if(!file)return;if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)){notify('Escolha uma imagem PNG, JPG, WebP ou GIF.');return;}
    const seq=++imageSequence,newUrl=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{if(seq!==imageSequence){URL.revokeObjectURL(newUrl);return;}if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=newUrl;reference=img;$('referenceName').textContent=file.name;$('referenceChip').hidden=false;renderSoon();notify('Referência carregada. A grade continua ajustável.');};
    img.onerror=()=>{URL.revokeObjectURL(newUrl);if(seq===imageSequence)notify('Não foi possível abrir essa imagem.');};img.src=newUrl;
  }
  $('imageFile').addEventListener('change',e=>{loadReference(e.target.files[0]);e.target.value='';});
  $('removeImage').addEventListener('click',()=>{imageSequence++;reference=null;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;$('referenceChip').hidden=true;renderSoon();});
  stage.addEventListener('dragover',e=>{e.preventDefault();});stage.addEventListener('drop',e=>{e.preventDefault();loadReference(e.dataTransfer.files[0]);});
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  $('exportBtn').addEventListener('click',()=>{
    if(!G.projectedLines(state,2400,Math.round(2400/state.aspect)).length){notify('Ative a grade e pelo menos uma direção visível para exportar.');return;}
    const format=$('exportFormat').value;
    if(format==='svg'){download(new Blob([G.svg(state)],{type:'image/svg+xml'}),'perspective-grid.svg');notify('Grade vetorial exportada em SVG.');}
    else{
      const out=document.createElement('canvas');out.width=2400;out.height=Math.round(2400/state.aspect);
      strokeGrid(out.getContext('2d'),out.width,out.height,true);
      drawAnnotations(out.getContext('2d'),out.width,out.height,true);
      out.toBlob(blob=>{if(blob){download(blob,'perspective-grid.png');notify('PNG transparente exportado. Abra ou arraste para o Photoshop.');}else notify('Não foi possível exportar a imagem.');},'image/png');
    }
  });
  new ResizeObserver(renderSoon).observe(stage);new ResizeObserver(renderSoon).observe(cube);
  window.addEventListener('resize',()=>{cancelDrag(true);renderSoon();});
  window.addEventListener('pagehide',()=>{try{localStorage.setItem(storageKey,JSON.stringify(state));}catch(_){}});
  sync();openTab('camera');renderSoon();save();
  if(migrated)notify('Revisão 12: cena reiniciada; configurações da grade preservadas.');
})();
