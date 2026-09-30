import { BoxGeometry, BufferGeometry, PerspectiveCamera, OrthographicCamera, Matrix4, Box3, Color, EdgesGeometry, Float32BufferAttribute, Group, LineSegments, Mesh, Scene, ShaderMaterial, Vector3, WebGLRenderer } from 'three';

const models=new Map();
const uniforms={
  uRight:{value:new Vector3()},uUp:{value:new Vector3()},uForward:{value:new Vector3()},
  uWidth:{value:1},uHeight:{value:1},uCx:{value:0},uCy:{value:0},uDistance:{value:16},
  uFocal:{value:1},uScale:{value:1},uOrtho:{value:0},uFish:{value:0},uDistortion:{value:1}
};
// The same projection as geometry.js, with a real depth buffer for occlusion.
const vertexShader=`
  uniform vec3 uRight,uUp,uForward;
  uniform float uWidth,uHeight,uCx,uCy,uDistance,uFocal,uScale,uOrtho,uFish,uDistortion,uShaded;
  varying vec3 vNormal;
  void main(){
    vec3 world=(modelMatrix*vec4(position,1.0)).xyz;
    vec3 p=vec3(dot(world,uRight),dot(world,uUp),uDistance+dot(world,uForward));
    float z=max(p.z,0.00001);
    vec2 q=p.xy*(uOrtho>0.5?uScale:uFocal/z);
    if(uFish>0.5){
      float len=length(p.xy),theta=atan(len,z);
      float u=sin(theta);
      float r=uFocal*(u+0.5*(1.0-uDistortion)*u*u*u*(1.0-u*u));
      q=len<0.00001?vec2(0.0):r*p.xy/len;
    }
    vec2 ndc=vec2(2.0*(uCx+q.x)/uWidth-1.0,1.0-2.0*(uCy-q.y)/uHeight);
    float nearPlane=0.12,farPlane=2000.0;
    float depth=(farPlane+nearPlane)/(farPlane-nearPlane)-2.0*farPlane*nearPlane/((farPlane-nearPlane)*z);
    gl_Position=uOrtho>0.5?vec4(ndc,2.0*(p.z-nearPlane)/(farPlane-nearPlane)-1.0,1.0):vec4(ndc*z,depth*z,z);
    if(p.z<0.0)gl_Position=vec4(0.0,0.0,-2.0,1.0);
    if(uFish<0.5)gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
    vNormal=uShaded>0.5?normalize(mat3(modelMatrix)*normal):vec3(0.0,1.0,0.0);
  }
`;
const fragmentShader=`
  uniform vec3 uColor;
  uniform float uShaded;
  varying vec3 vNormal;
  void main(){
    float light=uShaded>0.5?0.72+0.28*max(0.0,dot(normalize(vNormal),normalize(vec3(0.3,0.8,0.5)))):1.0;
    gl_FragColor=vec4(uColor*light,1.0);
    #include <colorspace_fragment>
  }
`;
function material(color,shaded){
  return new ShaderMaterial({uniforms:{...uniforms,uColor:{value:new Color(color)},uShaded:{value:shaded?1:0}},vertexShader,fragmentShader,polygonOffset:shaded,polygonOffsetFactor:1,polygonOffsetUnits:1});
}
function makeModel(name){
  const group=new Group();
  function box(size,position,color){
    const mesh=new Mesh(new BoxGeometry(...size,16,16,16),material(color,true));
    mesh.position.set(...position);mesh.frustumCulled=false;group.add(mesh);
    const basic=new BoxGeometry(...size),edges=new EdgesGeometry(basic),source=edges.attributes.position,positions=[];
    for(let i=0;i<source.count;i+=2){
      const a=new Vector3().fromBufferAttribute(source,i),b=new Vector3().fromBufferAttribute(source,i+1);
      for(let j=0;j<16;j++)for(const t of [j/16,(j+1)/16])positions.push(...a.clone().lerp(b,t).toArray());
    }
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
    const outline=new LineSegments(geometry,material('#455962',false));outline.frustumCulled=false;mesh.add(outline);
    basic.dispose();edges.dispose();
  }
  function table(x=0,y=0,z=0,scale=1){
    box([3.2*scale,.18*scale,1.9*scale],[x,y,z],'#b2c9cc');
    for(const dx of [-1.3,1.3])for(const dz of [-.68,.68])box([.16*scale,1.8*scale,.16*scale],[x+dx*scale,y-.96*scale,z+dz*scale],'#667c85');
  }
  if(name==='box')box([2,2,2],[0,0,0],'#b3c4cb');
  if(name==='table'){
    table(0,-.6,0);
    box([.65,.08,.45],[-.65,-.47,.05],'#d4b685');
    box([.26,.4,.26],[.7,-.32,-.35],'#dcdddd');
  }
  if(name==='room'){
    box([6,.16,5],[0,-1.8,0],'#b7c0bd');
    box([6,3.3,.12],[0,-.08,-2.5],'#ccd5d6');
    box([.12,3.3,5],[-3,-.08,0],'#c1cdd1');
    box([1.75,.45,3.1],[-1.55,-1.42,-.3],'#6f9096');
    box([1.75,.18,3.1],[-1.55,-1.11,-.3],'#e6e8df');
    box([1.3,.16,.6],[-1.55,-.94,-1.35],'#f0ebe2');
    table(1.35,-.35,-1.45,.63);
    box([.75,.08,.5],[1.2,-.23,-1.5],'#d4b685');
    box([.7,.65,.7],[1.4,-1.4,.2],'#bb9e87');
    box([.7,.75,.1],[1.4,-.85,.55],'#bb9e87');
    box([1.2,.9,.08],[.5,.7,-2.39],'#8babad');
  }
  return group;
}
function model(state){
  if(!models.has(state.referenceModel))models.set(state.referenceModel,makeModel(state.referenceModel));
  const group=models.get(state.referenceModel);
  group.scale.setScalar(state.boxSize);group.position.fromArray(state.modelPositions?.[state.referenceModel]||[0,0,0]);
  group.updateMatrixWorld(true);return group;
}
let renderer;
const scene=new Scene(),perspectiveCamera=new PerspectiveCamera(),orthographicCamera=new OrthographicCamera();
function nativeCamera(cam){
  const camera=cam.ortho?orthographicCamera:perspectiveCamera;
  camera.near=cam.near;camera.far=2000;
  if(cam.ortho){
    camera.left=-cam.cx/cam.scale;camera.right=(cam.width-cam.cx)/cam.scale;
    camera.top=cam.cy/cam.scale;camera.bottom=-(cam.height-cam.cy)/cam.scale;
  }else{
    camera.fov=2*Math.atan(cam.height/(2*cam.focal))*180/Math.PI;camera.aspect=cam.width/cam.height;
  }
  camera.updateProjectionMatrix();
  if(!cam.ortho){
    camera.projectionMatrix.elements[8]=1-2*cam.cx/cam.width;
    camera.projectionMatrix.elements[9]=2*cam.cy/cam.height-1;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  const basis=new Matrix4().makeBasis(new Vector3(...cam.right),new Vector3(...cam.up),new Vector3(...cam.forward).negate());
  camera.position.fromArray(cam.eye);camera.quaternion.setFromRotationMatrix(basis);camera.updateMatrixWorld(true);
  return camera;
}
export function inspectModel(state,cam){
  const group=model(state),bounds=new Box3().setFromObject(group),size=bounds.getSize(new Vector3());
  const parts=[];
  group.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const bounds=new Box3().setFromObject(mesh);
    parts.push({size:bounds.getSize(new Vector3()).toArray(),center:bounds.getCenter(new Vector3()).toArray()});
  });
  return {size:size.toArray(),scale:group.scale.toArray(),parts,cameraType:nativeCamera(cam).type};
}
export function projectNative(points,cam){
  const camera=nativeCamera(cam);
  return points.map(p=>{const q=new Vector3(...p).project(camera);return [(q.x+1)*cam.width/2,(1-q.y)*cam.height/2];});
}
export function render(state,cam,dpr=1){
  if(!renderer){
    renderer=new WebGLRenderer({alpha:true,antialias:true});renderer.setClearColor(0,0);
    renderer.domElement.addEventListener('webglcontextrestored',()=>window.dispatchEvent(new Event('perspective-renderer-restored')));
    renderer.domElement.addEventListener('webglcontextlost',()=>window.dispatchEvent(new Event('perspective-renderer-lost')));
  }
  if(renderer.getContext().isContextLost())throw new Error('WebGL context lost');
  const width=Math.round(cam.width*dpr),height=Math.round(cam.height*dpr);
  if(renderer.domElement.width!==width||renderer.domElement.height!==height)renderer.setSize(width,height,false);
  uniforms.uRight.value.fromArray(cam.right);uniforms.uUp.value.fromArray(cam.up);uniforms.uForward.value.fromArray(cam.forward);
  for(const [key,value] of Object.entries({Width:cam.width,Height:cam.height,Cx:cam.cx,Cy:cam.cy,Distance:cam.distance,Focal:cam.focal,Scale:cam.scale,Ortho:cam.ortho?1:0,Fish:cam.fisheye?1:0,Distortion:cam.distortion}))uniforms['u'+key].value=value;
  scene.clear();scene.add(model(state));renderer.render(scene,nativeCamera(cam));return renderer.domElement;
}
export function framingPoints(state){
  const points=[];
  model(state).traverse(mesh=>{
    if(!mesh.isMesh)return;
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    const {min,max}=mesh.geometry.boundingBox;
    // Sample edges as well as corners: curvilinear extrema may lie between corners.
    for(let axis=0;axis<3;axis++)for(const a of [0,1])for(const b of [0,1])for(let i=0;i<=8;i++){
      const t=[0,0,0];t[axis]=i/8;t[(axis+1)%3]=a;t[(axis+2)%3]=b;
      points.push(new Vector3(...t.map((v,k)=>min.getComponent(k)+(max.getComponent(k)-min.getComponent(k))*v)).applyMatrix4(mesh.matrixWorld).toArray());
    }
  });
  return points;
}
export function preserveFraming(before,after,G){
  return G.framingDistance(before,after,framingPoints(before),minimumDistance(after,G));
}
function clearance(state){return Math.max(.25,state.boxSize*.5);}
export function minimumDistance(state,G){
  const cam=G.camera(state,1600,1600/state.aspect);
  return Math.max(4,...framingPoints(state).map(p=>cam.near+clearance(state)-G.dot(p,cam.forward)));
}
export function stabilize(state,G){
  if(!state.showCube)return state;
  const distance=Math.max(state.distance,minimumDistance(state,G));
  return distance>state.distance+1e-7?G.normalize({...state,distance}):state;
}
export function moveDepth(state,dy,height,G){
  const cam=G.camera(state,1600,1600/state.aspect),position=state.modelPositions[state.referenceModel];
  const localNear=Math.min(...framingPoints(state).map(p=>G.dot(p.map((v,i)=>v-position[i]),cam.forward)));
  return G.moveModelDepth(state,dy,height,cam.near+clearance(state)-localNear);
}
export function moveAlongAxis(state,axis,target,width,height,G){
  const cam=G.camera(state,width,height),position=state.modelPositions[state.referenceModel];
  const localNear=Math.min(...framingPoints(state).map(p=>G.dot(p.map((v,i)=>v-position[i]),cam.forward)));
  return G.moveModelOnAxis(state,axis,target,width,height,cam.near+clearance(state)-localNear);
}
export function fitDistance(state,G){
  return fitState(state,G).distance;
}
export function fitState(state,G){
  const points=framingPoints(state);
  let lo=minimumDistance(state,G),hi=500;
  const frame=distance=>{
    const next={...state,distance,panX:0,panY:0},cam=G.camera(next,1600,1600/state.aspect);
    const projected=points.map(p=>G.project(p,cam));
    if(projected.some(p=>!p))return {fits:false};
    const xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]);
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    const panX=(800-(left+right)/2)/16,panY=(cam.height/2-(top+bottom)/2)/cam.height*100;
    return {panX,panY,fits:right-left<=1280&&bottom-top<=cam.height*.8&&Math.abs(panX)<=100&&Math.abs(panY)<=100};
  };
  for(let i=0;i<24;i++){
    const distance=(lo+hi)/2;
    if(frame(distance).fits)hi=distance;else lo=distance;
  }
  const fitted=frame(hi);
  return G.normalize({...state,distance:hi,panX:fitted.panX||0,panY:fitted.panY||0,showCube:true});
}
