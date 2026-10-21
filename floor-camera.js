import * as THREE from 'three';

// Camera bounds are presentation envelopes, never room footprints or areas.
const memo=new WeakMap();
export function modelParts(root){
 if(memo.has(root))return memo.get(root);
 root.updateMatrixWorld(true);const parts=[];
 root.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.presentationBatch||mesh.userData.cutawayContentBatch||mesh.userData.floorPresentation||mesh.userData.floorSourceUnderlay)return;
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  const box=mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld);
  if(!box||box.isEmpty())return;
  const framePoints=[],size=box.getSize(new THREE.Vector3());
  if(Math.max(size.x,size.z)>8){const position=mesh.geometry.attributes.position;for(let i=0;i<position.count;i++)framePoints.push(new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld));}
  else for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])framePoints.push(new THREE.Vector3(x,y,z));
  parts.push({mesh,name:mesh.name,semantic:mesh.name.replace(/_/g,' '),box,framePoints,center:box.getCenter(new THREE.Vector3())});
 });memo.set(root,parts);return parts;
}
export function floorBounds(root,{range=null,excludeUnderlay=false}={}){
 const bounds=new THREE.Box3(),points=[];
 for(const p of modelParts(root)){
  if(excludeUnderlay&&/underlay|source plan|source drawing/i.test(p.name))continue;
  const b=p.box.clone();
  if(range){if(b.max.y<range[0]||b.min.y>range[1])continue;b.min.y=Math.max(b.min.y,range[0]);b.max.y=Math.min(b.max.y,range[1]);}
  bounds.union(b);
  for(const q of p.framePoints)points.push(range?new THREE.Vector3(q.x,THREE.MathUtils.clamp(q.y,range[0],range[1]),q.z):q);
 }
 if(bounds.isEmpty())return new THREE.Box3().setFromObject(root);bounds.framePoints=points;return bounds;
}
const officeMatchers={
 'north-balcony':p=>/BALCONY_.*_NORTH/i.test(p.name),
 'south-balcony':p=>/BALCONY_.*_SOUTH/i.test(p.name),
 'services':p=>/SOURCE ROOM.*(?:toilet floor|archive)/i.test(p.semantic),
 'core-full':p=>/SOURCE TRACED PARTITION.*service corridor|SOURCE ROOM.*toilet floor/i.test(p.semantic),
 'meeting-full':p=>/PROPOSED shelter use/i.test(p.semantic),
 'curved-front':p=>/PROPOSED workstation/i.test(p.semantic)&&p.center.x>20,
 'west-wing':p=>/PROPOSED.*(?:chair|lounge|library|collaboration|sofa|table|desk)/i.test(p.name)&&p.center.x<10&&p.center.z>0
};
export function regionBounds(root,{floor,region,wholeMode,mode,view,range=null}){
 const whole=floorBounds(root,{range});
 if(region.id==='overview')return {bounds:whole,basis:'model-bounds',count:modelParts(root).length};
 const matcher=floor.id.startsWith('office-')?officeMatchers[region.id]:null;
 if(matcher&&mode===wholeMode){
  const parts=modelParts(root).filter(matcher),bounds=new THREE.Box3();parts.forEach(p=>bounds.union(p.box));
  if(parts.length){bounds.min.y=Math.min(bounds.min.y,floor.base);bounds.max.y=Math.max(bounds.max.y,floor.base+2.4);bounds.expandByScalar(.55);return{bounds,basis:'named-model-elements',count:parts.length};}
 }
 if(mode!==wholeMode&&mode!=='exterior')return{bounds:whole,basis:'detail-model-bounds',count:modelParts(root).length};
 // Original views may frame a cluster without a named room. The envelope is
 // explicitly a camera crop; it is not exposed as a verified spatial anchor.
 const target=view?.target||region.target;
 if(target){
  const center=new THREE.Vector3(...target),radius=region.id==='refuse'?10:region.id==='systems-full'?12:region.id==='deck'?10:7;
  const bounds=new THREE.Box3(center.clone().add(new THREE.Vector3(-radius,-4,-radius)),center.clone().add(new THREE.Vector3(radius,5,radius))).intersect(whole);
  if(!bounds.isEmpty())return{bounds,basis:'camera-envelope-only',count:0};
 }
 return {bounds:whole,basis:'model-bounds',count:0};
}
export function composeFloor(bounds,camera,{presentation='overview',direction=null,padding=.90}={}){
 const target=bounds.getCenter(new THREE.Vector3());
 const d=new THREE.Vector3(...(direction||(presentation==='plan'?[0,1,.0001]:[.85,1.1,1.22]))).normalize();
 const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),d).normalize();
 const up=new THREE.Vector3().crossVectors(d,right).normalize();
 const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*camera.aspect;
 let distance=1;
 const points=bounds.framePoints?.length?bounds.framePoints:[];
 if(!points.length)for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])points.push(new THREE.Vector3(x,y,z));
 // A curved footprint does not fill its axis-aligned bounding box. Recenter
 // the projected silhouette, then fit its real points, instead of leaving a
 // large empty corner and pushing the useful architecture below the center.
 for(let pass=0;pass<3;pass++){
  distance=1;
  for(const point of points){const q=point.clone().sub(target),depth=q.dot(d);distance=Math.max(distance,Math.abs(q.dot(right))/(tanH*padding)+depth,Math.abs(q.dot(up))/(tanV*padding)+depth);}
  if(pass===2)break;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const point of points){const q=point.clone().sub(target),depth=Math.max(.1,distance-q.dot(d)),x=q.dot(right)/depth,y=q.dot(up)/depth;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  target.addScaledVector(right,(minX+maxX)*distance*.5).addScaledVector(up,(minY+maxY)*distance*.5);
 }
 return {position:target.clone().addScaledVector(d,distance),target};
}
export function createFloorAnchors(root,{floor,config,modelIndex}){
 const overview=floor.regions.find(r=>r.id==='overview'),wholeMode=overview.mode,whole=floorBounds(root),result=[];
 for(const region of floor.regions){
  if(region.id==='overview')continue;
  const mode=region.mode||'exterior';let bounds,basis;
  if(floor.id.startsWith('office-')&&officeMatchers[region.id]){
   const focus=regionBounds(root,{floor,region,mode:wholeMode,wholeMode,view:config[wholeMode]?.views?.[region.view||0]});
   if(focus.basis==='named-model-elements'){bounds=focus.bounds;basis=focus.basis;}
  }else if(mode!==wholeMode&&mode!=='exterior'&&floor.regions.filter(r=>r.mode===mode).length===1){
   const m=modelIndex?.[mode];
   if(m){bounds=new THREE.Box3(new THREE.Vector3(...m.min),new THREE.Vector3(...m.max));basis='detail-model-bounds';}
  }
  if(!bounds||bounds.isEmpty())continue;
  const point=bounds.getCenter(new THREE.Vector3());
  // Detail models share registered coordinates. Do not mark a disconnected
  // scene outside the primary model's horizontal extent as a room within it.
  if(point.x<whole.min.x-1||point.x>whole.max.x+1||point.z<whole.min.z-1||point.z>whole.max.z+1)continue;
  point.y=Math.min(Math.max(floor.base+.7,point.y),floor.base+2.9);
  result.push({id:region.id,label:region.label,position:point,basis});
 }
 return result;
}
export function projectFloorAnchors(anchors,camera,viewport,stage,{selected=null,max=6}={}){
 const projected=anchors.map(a=>{const p=a.position.clone().project(camera);return{...a,x:viewport.left-stage.left+(p.x+1)*viewport.width/2,y:viewport.top-stage.top+(1-p.y)*viewport.height/2,visible:p.z>=-1&&p.z<=1&&Math.abs(p.x)<.93&&Math.abs(p.y)<.88,selected:a.id===selected};});
 const placed=[];
 for(const p of [...projected].sort((a,b)=>Number(b.selected)-Number(a.selected))){
  if(!p.visible)continue;
  if(placed.length>=max||placed.some(q=>Math.abs(p.x-q.x)<138&&Math.abs(p.y-q.y)<43)){p.visible=false;continue;}placed.push(p);
 }
 return projected;
}
