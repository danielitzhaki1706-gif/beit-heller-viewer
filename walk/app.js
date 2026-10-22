import * as THREE from 'three';
import {createWalkingPhysics} from './physics.js';
import {applySurfaceFinish} from '../surface-finish.js';
import {applyMaterialDetail} from '../material-detail.js?v=20261013-r4-final';
import {applyFurnitureRefinement} from '../furniture-refinement.js?v=20261013-r4-final';
import {createContextLayer} from '../context-layer.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {configureModelLoader} from '../model-loader.js?v=20261022-r7';
import {navigators,doorSegments} from './route.js';
import {batchStatic} from './batching.js';
import {createLighting} from '../lighting.js?v=20261013-r4-final';
import {createVisualPipeline} from '../visual-pipeline.js?v=20261013-r4-final';
import {createMap,routePoints,exteriorRoute,zone} from './wayfinding.js';
const $=id=>document.getElementById(id),viewport=$('viewport');
const response=await fetch('./assets/navigation.json');
if(!response.ok)throw Error('Navigation data unavailable');
const data=await response.json(),nav=navigators(data),door=data.ground.door;
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
viewport.append(renderer.domElement);
let visualRevision=0;
const scene=new THREE.Scene(),lighting=createLighting(renderer,scene,{onReady:()=>visualRevision++});
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.05,500);
camera.rotation.order='YXZ';
const visual=createVisualPipeline(renderer,scene,camera),shadowTarget=new THREE.Vector3(),lookDirection=new THREE.Vector3();
lighting.setQuality(visual.snapshot().effectiveQuality);
renderer.localClippingEnabled=true;
function finishModel(root){root.traverse(o=>{if(!o.isMesh)return;const materials=Array.isArray(o.material)?o.material:[o.material];o.castShadow=materials.every(m=>!(m.transmission>.05||m.opacity<.95));o.receiveShadow=true;});}
const loader=configureModelLoader(THREE,new GLTFLoader()),models={},meshes={},physics={},doorParts=[];
let siteContext=null,visualContext=null;
const map=createMap(data,$('minimap')),path=routePoints(data);
let mode='ground',position=[...data.ground.spawn],feet=0,yaw=0,pitch=0,ready=false,loading=false;
let doorProgress=0,doorTarget=0,tour=null,lookPointer=null,stickId=null,lastPointer=[0,0];
const keys=new Set(),stick=[0,0];
let noticeTimer,lastHud=0;
function notice(text){$('notice').textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').textContent='',3200);}
function stopTour(){tour=null;$('exterior-tour').textContent='הקפה חיצונית';$('exterior-tour').setAttribute('aria-pressed','false');$('guided').textContent='מסלול כניסה מודרך';$('guided').setAttribute('aria-pressed','false');}
function clearInput(){keys.clear();stick.fill(0);lookPointer=null;stickId=null;$('stick').style.transform='';stopTour();}
async function load(which){
 if(models[which])return;
 const viewerConfig=which==='ground'?await (await fetch('../assets/viewer.json')).json():null;
 const modelUrl=which==='ground'?'../'+viewerConfig.exterior.model.replace(/^\.\//,''):'../assets/models/interior.glb';
 const gltf=await loader.loadAsync(modelUrl,e=>{
 if(e.total)$('load-text').textContent=e.loaded>e.total?'טוענים את המודל ומכינים לתצוגה…':'טוענים את המודל · '+Math.round(100*e.loaded/e.total)+'%';
 });
 if(which==='ground')await applySurfaceFinish(gltf.scene,THREE);
 applyFurnitureRefinement(gltf.scene,THREE);
 await applyMaterialDetail(gltf.scene,THREE,{kind:which==='ground'?'building':'interior'});
 finishModel(gltf.scene);
 const replacements=new Set();
 let context=null;
 if(which==='ground'){
  const response=await fetch('../assets/context/manifest.json');
  if(!response.ok)throw Error('Site context manifest unavailable');
  const manifest=await response.json();
  if(manifest.accepted!==true||manifest.nearfield!=='./assets/context/nearfield.glb')throw Error('Unaccepted site context');
  context=(await loader.loadAsync('../assets/context/nearfield.glb')).scene;
  await applySurfaceFinish(context,THREE,manifest.surfaceMaterials);
  applyFurnitureRefinement(context,THREE);
  await applyMaterialDetail(context,THREE,{kind:'context'});
  for(const name of manifest.replacesNodes){
   const node=gltf.scene.getObjectByName(name);if(!node)throw Error('Missing site replacement');
   node.visible=false;node.traverse(o=>{if(o.isMesh)replacements.add(o);});
  }
  context.traverse(o=>{if(o.isMesh){o.receiveShadow=true;const mats=Array.isArray(o.material)?o.material:[o.material];o.castShadow=mats.every(m=>!(m.transmission>.05||m.opacity<.95));}});
 }
 models[which]=gltf.scene;meshes[which]=[];
 gltf.scene.traverse(o=>{if(o.isMesh&&!replacements.has(o))meshes[which].push(o);});
 scene.add(gltf.scene);gltf.scene.updateMatrixWorld(true);
 const batching=batchStatic(gltf.scene,which==='ground'?[...door.leafNames,door.meetingName]:[]);
 viewport.dataset[which+'Batches']=batching.batches;viewport.dataset[which+'Originals']=batching.originals;
 if(which==='ground')for(const [name,sign]of [[door.leafNames[0],-1],[door.leafNames[1],1],[door.meetingName,-1]]){
  const object=gltf.scene.getObjectByName(name);if(!object)throw Error('Door source geometry missing');
  doorParts.push({object,sign,rest:object.position.clone()});
 }
 let floorMeshes=[...meshes[which]];
 if(context){
  context.updateMatrixWorld(true);
  context.traverse(o=>{if(o.isMesh){meshes[which].push(o);if(!o.name.startsWith('Nearfield_geometry_'))floorMeshes.push(o);}});
  batchStatic(context);scene.add(context);siteContext=context;context.visible=false;
 }
 physics[which]=createWalkingPhysics(THREE,{meshes:meshes[which],floorMeshes,dynamicMeshes:doorParts.map(p=>p.object),navigator:nav[which],radius:data.radius});
 if(which==='ground'){
  // The surveyed walking support remains separate from the visual surroundings.
  // Reuse the main viewer's accepted context and material handling so the two
  // experiences do not show different streets or stale neighbour buildings.
  visualContext=createContextLayer(THREE,scene,{loadAsync:path=>loader.loadAsync('../'+path.replace(/^\.\//,''))},new THREE.Object3D(),{
   fetcher:path=>fetch('../'+path.replace(/^\.\//,'')),
   prepareNearfield:async(object,manifest)=>{if(manifest.surfaceMaterials?.length)await applySurfaceFinish(object,THREE,manifest.surfaceMaterials);applyFurnitureRefinement(object,THREE);await applyMaterialDetail(object,THREE,{kind:'context'});finishModel(object);batchStatic(object);},
   onChange:status=>{visualRevision++;if(siteContext)siteContext.visible=mode==='ground'&&!status.ready;renderer.shadowMap.needsUpdate=true;}
  });
  visualContext.setBuilding(gltf.scene);await visualContext.load();
 }
 gltf.scene.visible=false;
}

function reset(){
 clearInput();position=[...data[mode].spawn];
 if(!nav[mode].canOccupy(position))throw Error('Starting position failed clearance validation');
 feet=mode==='office'?data.office.floor:0;const floor=physics[mode].supportAt(position,feet);if(floor===null)throw Error('Starting floor support unavailable');feet=floor;
 const target=data[mode].look;yaw=Math.atan2(-(target[0]-position[0]),-(target[1]-position[1]));pitch=0;
 if(mode==='ground')doorTarget=0;
}
async function switchMode(which){
 if(loading)return;clearInput();document.exitPointerLock?.();loading=true;ready=false;
 $('loading').hidden=false;$('error').hidden=true;
 try{
 await load(which);mode=which;
 for(const [key,obj]of Object.entries(models))obj.visible=key===mode;
 if(siteContext)siteContext.visible=mode==='ground'&&!visualContext?.getState().ready;visualContext?.setMode(mode==='ground'?'exterior':'floor');lighting.setMode(mode==='ground'?'exterior':'interior');visual.setMode(mode==='ground'?'exterior':'interior');visualRevision++;reset();
 $('ground-mode').setAttribute('aria-pressed',mode==='ground');

 $('scope-note').textContent=mode==='ground'?'מסלול מוגבל · חלק מהבניין פתוח לסיור':'עיצוב פנים מוצע · אינו תכנית מאושרת';
 $('guided').hidden=mode!=='ground';$('exterior-tour').hidden=mode!=='ground';$('loading').hidden=true;ready=true;viewport.focus();
 renderer.shadowMap.needsUpdate=true;
 }catch(error){$('loading').hidden=true;$('error').hidden=false;$('error-text').textContent=error.message;}
 finally{loading=false;}
}
function toggleDoor(){
 if(mode!=='ground'||Math.hypot(position[0]-door.center[0],position[1]-door.center[1])>2.7)return;
 if(doorTarget&&Math.hypot(position[0]-door.center[0],position[1]-door.center[1])<1.9){notice('התרחק מעט מהדלת כדי לסגור אותה');return;}
 stopTour();doorTarget=1-doorTarget;
}
function animateDoor(dt){
 const old=doorProgress;
 doorProgress=THREE.MathUtils.clamp(doorProgress+Math.sign(doorTarget-doorProgress)*Math.min(dt/.9,Math.abs(doorTarget-doorProgress)),0,1);
 if(old===doorProgress)return;
 for(const {object,rest,sign}of doorParts){
 object.position.copy(rest);object.position.x+=sign*door.tangent[0]*door.travel*doorProgress;
 object.position.z+=sign*door.tangent[1]*door.travel*doorProgress;
 }
 models.ground?.updateMatrixWorld(true);renderer.shadowMap.needsUpdate=true;
}
function walk(delta){
 const result=physics[mode].move(position,feet,delta,mode==='ground'?doorSegments(door,doorProgress):[]);
 position=result.position;feet=result.feet;return result;
}
function startTour(kind='entrance'){
 if(!ready||mode!=='ground')return;
 if(tour){stopTour();notice('המסלול הושהה · אפשר להמשיך ללכת חופשי');return;}
 reset();doorTarget=kind==='outside'?0:1;tour={index:1,phase:'in',kind,path:kind==='outside'?exteriorRoute(data):path};
 if(kind==='outside'){$('exterior-tour').textContent='עצירת ההקפה';$('exterior-tour').setAttribute('aria-pressed','true');}
 else {$('guided').textContent='עצירת המסלול';$('guided').setAttribute('aria-pressed','true');}
 viewport.focus();notice(kind==='outside'?'הקפה סביב המבנה · כל תנועה ידנית עוצרת את ההדרכה.':'הדלת נפתחת · הליכה פנימה וחזרה. כל תנועה ידנית עוצרת את ההדרכה.');
}
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',clearInput);
const movement=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
document.addEventListener('keydown',event=>{
 if(event.code==='Escape'){clearInput();document.exitPointerLock?.();return;}
 if($('help').open||!ready||/INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName))return;
 if(movement.includes(event.code)){event.preventDefault();stopTour();keys.add(event.code);}
 if(event.code==='KeyE'&&!event.repeat)toggleDoor();
});
document.addEventListener('keyup',event=>keys.delete(event.code));
viewport.addEventListener('pointerdown',e=>{
 if(e.button!==0||!ready||$('help').open)return;
 stopTour();viewport.focus();lookPointer=e.pointerId;lastPointer=[e.clientX,e.clientY];viewport.setPointerCapture(e.pointerId);
});
viewport.addEventListener('pointermove',e=>{
 let dx,dy;
 if(document.pointerLockElement===viewport){dx=e.movementX;dy=e.movementY;}
 else if(e.pointerId===lookPointer){dx=e.clientX-lastPointer[0];dy=e.clientY-lastPointer[1];lastPointer=[e.clientX,e.clientY];}
 else return;
 yaw-=dx*.003;pitch=THREE.MathUtils.clamp(pitch-dy*.003,-1.35,1.35);
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(event,()=>lookPointer=null);
const joystick=$('touch-move');let stickCenter=[0,0];
function moveStick(e){
 let x=(e.clientX-stickCenter[0])/38,z=(e.clientY-stickCenter[1])/38,l=Math.max(1,Math.hypot(x,z));
 stick[0]=x/l;stick[1]=z/l;$('stick').style.transform='translate('+stick[0]*30+'px,'+stick[1]*30+'px)';
}
joystick.addEventListener('pointerdown',e=>{
 if(!ready||$('help').open||stickId!==null)return;
 e.preventDefault();stopTour();stickId=e.pointerId;joystick.setPointerCapture(e.pointerId);
 const box=joystick.getBoundingClientRect();stickCenter=[box.left+box.width/2,box.top+box.height/2];moveStick(e);
});
joystick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)moveStick(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,e=>{
 if(e.pointerId!==stickId)return;stickId=null;stick.fill(0);$('stick').style.transform='';
});
$('ground-mode').onclick=()=>switchMode('ground');

$('reset').onclick=()=>{reset();viewport.focus();};
$('door-button').onclick=()=>{toggleDoor();viewport.focus();};
$('guided').onclick=()=>startTour('entrance');$('exterior-tour').onclick=()=>startTour('outside');$('reload').onclick=()=>location.reload();
$('help-button').onclick=()=>{clearInput();document.exitPointerLock?.();$('help').showModal();};
$('close-help').onclick=()=>$('help').close();
$('help').addEventListener('close',()=>viewport.focus());
$('look-lock').onclick=async()=>{try{stopTour();await viewport.requestPointerLock();viewport.focus();}catch{notice('אפשר לגרור את המבט עם העכבר');}};
document.addEventListener('pointerlockerror',()=>notice('אפשר לגרור את המבט עם העכבר'));
let highQuality=visual.snapshot().effectiveQuality!=='low';
$('quality').textContent=highQuality?'תצוגה: מפורטת':'תצוגה: קלה';
$('quality').onclick=()=>{highQuality=!highQuality;renderer.setPixelRatio(Math.min(devicePixelRatio||1,highQuality?1.5:1));renderer.setSize(innerWidth,innerHeight);const effective=visual.setQuality(highQuality?'balanced':'low');visual.resize(innerWidth,innerHeight);lighting.setQuality(effective);visualRevision++;$('quality').textContent=highQuality?'תצוגה: מפורטת':'תצוגה: קלה';renderer.shadowMap.needsUpdate=true;viewport.focus();};
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);visual.resize(innerWidth,innerHeight);visualRevision++;});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;clearInput();$('error').hidden=false;$('error-text').textContent='התצוגה נעצרה. יש לטעון מחדש.';});
renderer.shadowMap.autoUpdate=false;
let last=performance.now(),blockedAt=0,frameCount=0,fpsAt=last,lastRenderState='';
renderer.setAnimationLoop(now=>{
 const dt=Math.min(.05,(now-last)/1000);last=now;if(!ready||document.hidden)return;
 animateDoor(dt);
 if(now-fpsAt>1000){viewport.dataset.fps=(1000*frameCount/(now-fpsAt)).toFixed(1);frameCount=0;fpsAt=now;}
 if(!$('help').open){
 let delta=[0,0];
 if(tour&&(tour.kind==='outside'||doorProgress>=.999)){
 const target=tour.path[tour.index],dx=target[0]-position[0],dz=target[1]-position[1],distance=Math.hypot(dx,dz);
 if(distance<.06){
 if(tour.kind==='outside'&&tour.index===tour.path.length-1){stopTour();notice('ההקפה הסתיימה · אפשר להמשיך ללכת בחופשיות');}
 else if(tour.phase==='in'&&tour.index===tour.path.length-1){tour.phase='out';tour.index--;notice('בתוך החלל המסחרי · חוזרים דרך אותה דלת');}
 else if(tour.phase==='out'&&tour.index===0){stopTour();notice('הסיור הושלם · אפשר להמשיך ללכת חופשי');}
 else tour.index+=tour.phase==='in'?1:-1;
 }else{
 const targetYaw=Math.atan2(-dx,-dz),angle=Math.atan2(Math.sin(targetYaw-yaw),Math.cos(targetYaw-yaw));
 yaw+=angle*Math.min(1,dt*5);pitch*=Math.max(0,1-dt*5);
 const step=Math.min(distance,dt*1.05);delta=[dx/distance*step,dz/distance*step];
 }
 }else if(!tour){
 let forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-stick[1];
 let right=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+stick[0];
 const length=Math.max(1,Math.hypot(forward,right));forward/=length;right/=length;
 delta=[(-Math.sin(yaw)*forward+Math.cos(yaw)*right)*dt*1.6,(-Math.cos(yaw)*forward-Math.sin(yaw)*right)*dt*1.6];
 }
 if(Math.hypot(...delta)>0){
 const result=walk(delta);
 if(result.blocked){if(tour){stopTour();notice('המסלול נעצר מול חסימה · אפשר לאפס או להמשיך ידנית');}
 else if(now-blockedAt>3000){notice('המעבר חסום או מחוץ לאזור הסיור');blockedAt=now;}}
 }
 }
 camera.position.set(position[0],feet+data.eyeHeight,position[1]);camera.rotation.set(pitch,yaw,0);
 const distance=Math.hypot(position[0]-door.center[0],position[1]-door.center[1]),near=mode==='ground'&&distance<2.7;
 $('door-prompt').hidden=!near;$('door-button').textContent=doorTarget?'סגירת דלת · E':'פתיחת דלת · E';
 if(now-lastHud>150){
 lastHud=now;map.draw(mode,position,yaw,doorProgress);
 $('zone-label').textContent=zone(data,mode,position);
 $('location-detail').textContent=mode==='ground'?distance.toFixed(1)+' מ׳ מהכניסה · גובה עיניים 1.65 מ׳':'גובה עיניים 1.65 מ׳ · עיצוב מוצע';
 // Read-only, local QA observability; not a camera-control or teleport interface.
 viewport.dataset.position=position.map(v=>v.toFixed(3)).join(',');
 viewport.dataset.feet=feet.toFixed(3);viewport.dataset.mode=mode;viewport.dataset.door=doorProgress.toFixed(3);
 viewport.dataset.tour=tour?tour.phase:'off';
 }
 // Continue physics/input at animation cadence, but leave the GPU idle when
 // the camera, doors, scene, quality and HDR have not changed.
 const renderState=[mode,...camera.position.toArray(),yaw,pitch,doorProgress,visualRevision].join('|');
 if(renderState===lastRenderState){viewport.dataset.renderState='idle';return;}
 lastRenderState=renderState;viewport.dataset.renderState='active';frameCount++;
 camera.getWorldDirection(lookDirection);shadowTarget.copy(camera.position).addScaledVector(lookDirection,12);shadowTarget.y=feet+1;lighting.update(camera,shadowTarget);
 visual.render();
});
await switchMode('ground');
