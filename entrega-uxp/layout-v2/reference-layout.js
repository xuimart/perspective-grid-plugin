/* Visual prototype only. Host actions intentionally do not claim success. */
(() => {
  const $ = id => document.getElementById(id);
  const panel = document.querySelector('.panel');
  const sceneWrap = document.createElement('div');
  sceneWrap.className = 'scene-wrap';
  sceneWrap.innerHTML = '<canvas class="scene" width="960" height="540" aria-label="Prévia da perspectiva"></canvas><span class="scene-caption">Untitled-1 · 3840 × 2160</span>';
  panel.insertBefore(sceneWrap, document.querySelector('.tabs'));
  const scene = sceneWrap.querySelector('canvas');
  const camera = $('camera');
  const lens = document.createElement('div'); lens.className = 'row';
  lens.innerHTML = '<label for="lens-menu">Lente</label><select id="lens-menu"><option value="">Personalizada</option>'+[10,14,24,35,50,85,135,200,300].map(n=>`<option value="${n}">${n} mm</option>`).join('')+'</select>';
  camera.insertBefore(lens, camera.children[1]);
  const angles = document.createElement('div'); angles.className = 'camera-angles';
  camera.insertBefore(angles, $('lens-control'));
  angles.append($('yaw-control'),$('pitch-control'));
  $('yaw-control').querySelector('label').textContent = 'Rotação';
  $('pitch-control').querySelector('label').textContent = 'Inclinação';
  const view = document.createElement('div'); view.className='view-control';
  view.innerHTML='<label for="view-menu">Vista</label><select id="view-menu"><option value="iso">Isométrica</option><option value="front">Frente</option><option value="side">Lado</option><option value="top">Topo</option></select>'; angles.append(view);
  $('lens-control').querySelector('label').textContent='Distância focal';
  $('roll-control').querySelector('label').textContent='Roll (inclinação)';
  function details(parent,label,nodes){const d=document.createElement('details');d.className='advanced';const summary=document.createElement('summary');summary.textContent=label;d.append(summary);nodes.forEach(n=>d.append(n));parent.append(d);return d;}
  details(camera,'Distância e deslocamento',[$('distance-control'),$('panx-control'),$('pany-control')]);
  camera.append($('reset')); $('reset').textContent='Restaurar cena';
  const grid=$('grid');
  const style=document.createElement('div');style.className='row grid-style';style.innerHTML='<label for="style-menu">Estilo</label><select id="style-menu"><option value="1">Linhas coloridas</option><option value="0">Cor única</option><option value="2">Só linhas</option></select>';
  const construction=grid.querySelector('.row');construction.insertAdjacentHTML('afterbegin','<label for="construction-menu">Construção</label>');construction.querySelector('select').id='construction-menu';construction.after(style);
  const counts=document.createElement('div');counts.className='grid-counts';style.after(counts);
  ['gx','gz','gy'].forEach(key=>{const c=$(key+'-control');counts.append(c);c.querySelector('label').textContent=key.slice(1).toUpperCase();c.querySelector('.control-head').append(document.querySelector(`[data-axis=${key}]`));});
  details(grid,'Cores e horizonte',[...grid.querySelectorAll('.color-row'),$('horizon').parentNode,$('axisColors').parentNode]);
  const marks=document.createElement('div');marks.className='inline-checks';grid.insertBefore(marks,grid.querySelector('.advanced'));marks.append($('vps').parentNode,grid.querySelector('.legend .check'));grid.querySelector('.legend').remove();
  const model=$('model');const modelTop=document.createElement('div');modelTop.className='model-top';model.prepend(modelTop);modelTop.append($('showmodel').parentNode,$('modeltype').parentNode);
  $('scale-control').querySelector('label').textContent='Tamanho';
  const opacity=document.createElement('div');opacity.className='control';opacity.innerHTML='<div class="control-head"><label for="model-opacity">Opacidade do modelo</label><span id="model-opacity-val">100%</span></div><input id="model-opacity" aria-label="Opacidade do modelo" type="range" min="0" max="100" value="100">';$('scale-control').after(opacity);
  const actions=$('center').parentNode;actions.classList.add('model-primary-actions');opacity.after(actions);
  details(model,'Posição e profundidade',[model.querySelector('.xyz'),$('movement'),$('axis').parentNode,model.querySelector('.depth-buttons')]);
  const footer=document.querySelector('.footer');const fa=document.createElement('div');fa.className='footer-actions';footer.prepend(fa);fa.append($('apply'));$('apply').textContent='Aplicar na camada';const update=document.createElement('button');update.id='update';update.textContent='Atualizar malha';fa.append(update);
  update.onclick=()=>{renderScene();$('status').textContent='Prévia atualizada · sem conexão com Photoshop';};
  $('modeltype').selectedIndex=2;$('perspective').value='ortho';values.yaw=42;values.pitch=22;values.distance=16;values.gx=values.gy=values.gz=12;restrictions();
  $('lens-menu').onchange=e=>{if(e.target.value){values.lens=Number(e.target.value);sync();renderScene();}};
  $('view-menu').onchange=e=>{const p={iso:[42,22],front:[0,0],side:[90,0],top:[0,85]}[e.target.value];values.yaw=p[0];values.pitch=p[1];restrictions();renderScene();};
  function renderScene(){
    const G=window.PerspectiveGeometry; const ctx=scene.getContext('2d'),w=scene.width,h=scene.height;
    const preset={fish:'five'}[$('perspective').value]||$('perspective').value;
    const modelName=['box','table','room'][$('modeltype').selectedIndex];
    const pos=[...document.querySelectorAll('.xyz input')].map(n=>Number(n.value));
    const state=G.normalize({preset,projection:preset==='ortho'?'ortho':preset==='five'?'fisheye':'perspective',yaw:values.yaw,pitch:values.pitch,roll:values.roll,focalLength:values.lens,viewZoom:values.zoom,distance:values.distance,panX:values.panx,panY:values.pany,distortion:values.distortion,gridStyle:$('construction-menu').selectedIndex?'space':'rays',showAxes:$('style-menu').value==='1',showVps:$('vps').checked,showHorizon:$('horizon').checked,xCount:values.gx,yCount:values.gy,zCount:values.gz,xLines:document.querySelector('[data-axis=gx]').checked,yLines:document.querySelector('[data-axis=gy]').checked,zLines:document.querySelector('[data-axis=gz]').checked,opacity:values.opacity,lineWidth:values.width,color:$('linecolor').value,referenceModel:modelName,showCube:$('showmodel').checked,boxSize:values.scale,modelPositions:{box:pos,table:pos,room:pos}});
    ctx.fillStyle='#fafbf9';ctx.fillRect(0,0,w,h);
    state.showGrid = marks.querySelectorAll('input')[1].checked;
    for(const face of ReferenceModels.modelFaces(G,state,w,h)){ctx.globalAlpha=Number($('model-opacity').value)/100;ctx.beginPath();face.points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=Array.isArray(face.color)?`rgb(${face.color.join(',')})`:face.color;ctx.fill();ctx.strokeStyle='#74878a';ctx.lineWidth=.7;ctx.stroke();}
    for(const line of G.projectedLines(state,w,h)){ctx.globalAlpha=line.opacity*.65;ctx.strokeStyle=line.color;ctx.lineWidth=Math.max(.7,line.width);ctx.beginPath();line.points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();}
    ctx.globalAlpha=1;
  }
  document.addEventListener('input',()=>{ $('model-opacity-val').textContent=$('model-opacity').value+'%';renderScene();});document.addEventListener('change',renderScene);document.addEventListener('click',renderScene);
  let start=null;scene.onpointerdown=e=>{start=[e.clientX,e.clientY];scene.setPointerCapture(e.pointerId);};scene.onpointermove=e=>{if(!start)return;values.yaw+=e.clientX-start[0];values.pitch=Math.max(-85,Math.min(85,values.pitch+e.clientY-start[1]));start=[e.clientX,e.clientY];restrictions();renderScene();};scene.onpointerup=scene.onpointercancel=()=>start=null;
  renderScene();
})();
