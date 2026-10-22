// Camera-aware architectural reveal. Geometry is retained; only presentation
// materials/layers change. Floors and contents are deliberately protected.
import {batchCutawayContents} from './cutaway-batching.js';
const contentWords=/(proposed traffic|pump (motor|body|plinth)|pump_\d|equip|vessel|tank_(leg|foot|vessel|bottom|top|connect|isol)|panel_|control (cabinet|panel)|pipe|conduit|cable|discharge|suction|valve|gauge|extinguisher|motor|chair|desk|table|sofa|seat|bench|cabinet|cupboard|drawer|shelf|shelv|worktop|sink|tap |refrigerator|fridge|microwave|dispenser|display|counter|plant|tree|leaf|pot|toilet|basin|urinal|wc fixture|sanitary|luminaire|diffuser|light_|downlight|handrail|tread|riser|ladder|rung|parking (mark|line|bay|number)|marking|stripe|arrow|road paint|floor joint)/i;
const floorWords=/(\bfloor\b|paving|pavement|ground|slab (edge|underside)|slab_edge|roof pad|roof deck|roof finish|raised concrete|pit bottom|platform|landing|step|threshold|water surface|water volume|underlay)/i;
const ceilingWords=/(ceiling|soffit|roof slab|roof.*(massing|overrun)|canopy|slab.*roof)/i;
const wallWords=/(wall|partition|enclosure|structur|facade|frontage|glazing|glazed|window|mullion|transom|spandrel|crown|parapet|louver|louvre|vent.*(blade|frame|screen|grille)|grille|jamb|lintel|door|coving|skirting|core.*(vertical|shelter|massing)|screen)/i;
const waterWords=/\bwater\b.*\b(?:depth\d*|volume|surface)|\b(?:volume|surface)\b.*\bwater\b/i;

export function classifyOccluder({name='',materialNames='',size,minY,maxY,focusY=0,normalVerticalFraction=0}){
 const n=name.replace(/_/g,' ');
 // Keep the complete source-aligned tenant door assembly together. Its frame
 // and inset must not vanish while the leaf and handle remain visible.
 if(/^R3 (?:SOURCE OPENING|PROPOSED ROOM).*\bdoor\b/i.test(n))return 'content';
 if(/identity stripe|level band|wall finish|backsplash tile|front frame/i.test(n))return 'wall';
 // Semantics of the object win over a generic material shared with furniture.
 if(contentWords.test(name)||contentWords.test(n)||/door pull/i.test(n))return 'content';
 // Deep water has tall vertical sides but is room content, not an enclosure.
 // B04 exports "SOURCE WATER DEPTH4m | volume"; checking only the adjacent
 // words "water volume" made both water solids eligible for wall clipping.
 if(waterWords.test(n)||waterWords.test(materialNames.replace(/_/g,' ')))return 'floor';
 if(ceilingWords.test(n))return 'ceiling';
 if(floorWords.test(n))return 'floor';
 const long=Math.max(size.x,size.z),short=Math.min(size.x,size.z);
 // The source exports some columns under SOURCE_WALL. Retaining compact
 // columns makes the cutaway legible; a wall reveal must not erase its grid.
 if(/column/i.test(n)||( /source wall|structur|^(building part|floor\d|node )/i.test(n)&&size.y>1.55&&short>.30&&long<1.35&&long/short<2.05))return 'column';
 if(wallWords.test(n))return 'wall';
 // Anonymous source exports (node_0104, Building_part_...) need geometry.
 // A desk, chair, tread or compact machine cannot pass these dimensions.
 if(size.y<.5&&long>2&&short>1.4)return minY>focusY+.7?'ceiling':'floor';
 if(size.y>1.55&&long>1.25&&(short<.65||normalVerticalFraction>.72))return 'wall';
 if(size.y>2.4&&long>2.5&&normalVerticalFraction>.45)return 'wall';
 return 'content';
}

function surfaceVerticalFraction(THREE,mesh){
 const g=mesh.geometry,p=g.attributes.position,index=g.index;
 if(!p)return 0;
 // Area weighted normals recognize curved enclosure shells and broad slabs.
 const a=new THREE.Vector3(),b=a.clone(),c=a.clone(),ab=a.clone(),ac=a.clone();
 const matrix=mesh.matrixWorld,triangles=(index?index.count:p.count)/3,step=Math.max(1,Math.floor(triangles/1200));let vertical=0,total=0;
 for(let t=0;t<triangles;t+=step){const j=t*3; a.fromBufferAttribute(p,index?index.getX(j):j).applyMatrix4(matrix);b.fromBufferAttribute(p,index?index.getX(j+1):j+1).applyMatrix4(matrix);c.fromBufferAttribute(p,index?index.getX(j+2):j+2).applyMatrix4(matrix);ab.subVectors(b,a);ac.subVectors(c,a);ab.cross(ac);const area=ab.length();total+=area;if(Math.abs(ab.y)<area*.35)vertical+=area;}
 return total?vertical/total:0;
}

export function createAdaptiveCutaway(THREE,{camera,controls,invalidate=()=>{},host=null,mergeGeometries=null}={}){
 const cached=new WeakMap(),ray=new THREE.Ray(),hit=new THREE.Vector3(),dir=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3(),end=new THREE.Vector3(),centre=new THREE.Vector3(),frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
 const revealPlane=new THREE.Plane(),stubPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),0),wallDirection=new THREE.Vector3(0,0,1);
 let prepared=null,enabled=false,mode='auto',modelId='',floorBase=null,clipRange=null,lastKey=null,latest={active:false,mode:'auto',revealed:0};
 let panel,select,note,diagnostics;
 if(host&&typeof document!=='undefined'){
  const link=document.createElement('link');link.rel='stylesheet';link.href='./adaptive-cutaway.css?v=2';document.head.append(link);
  panel=document.createElement('div');panel.className='cutaway-control';panel.hidden=true;
  const label=document.createElement('label');label.textContent='חשיפת פנים';select=document.createElement('select');select.id='cutaway-mode';select.setAttribute('aria-label','חשיפת קירות ותקרות');
  for(const [value,text]of [['auto','אוטומטית עם הסיבוב'],['open','פתיחה מלאה'],['solid','קירות מלאים']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}label.append(select);
  note=document.createElement('small');note.textContent='המעטפת הקרובה נפתחת כדי לראות פנימה';
  diagnostics=document.createElement('output');diagnostics.id='cutaway-diagnostics';diagnostics.hidden=true;
  panel.append(label,note,diagnostics);host.append(panel);select.onchange=()=>{mode=select.value;update();invalidate();};
 }
 function prepare(root){
  if(cached.has(root))return cached.get(root);
  root.updateMatrixWorld(true);const entries=[],batches=[],sources=[];
  root.traverse(mesh=>{
   if(!mesh.isMesh)return;
   if(mesh.userData.presentationBatch){batches.push({mesh,visible:mesh.visible});return;}
   const original=mesh.material,ms=Array.isArray(original)?original:[original];
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
   const box=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),size=box.getSize(new THREE.Vector3());
   if(box.isEmpty())return;
   const names=[mesh.name];for(let parent=mesh.parent;parent&&parent!==root;parent=parent.parent)if(parent.name)names.unshift(parent.name);
   const entry={mesh,box,size,original,clones:null,visible:mesh.visible,layers:mesh.layers.mask,kind:'',normalVerticalFraction:surfaceVerticalFraction(THREE,mesh),name:names.join(' / '),materialNames:ms.map(m=>m.name).join(' '),revealed:false};
   entries.push(entry);if(mesh.layers.mask===2)sources.push(entry);
  });
  const value={root,entries,batches,sources,bounds:new THREE.Box3().setFromObject(root)};cached.set(root,value);return value;
 }
 function restore(){
  if(!prepared)return;
  for(const e of prepared.entries){e.mesh.material=e.original;e.mesh.visible=e.visible;e.mesh.layers.mask=e.layers;e.revealed=false;}
  for(const b of prepared.batches)b.mesh.visible=b.visible;
  for(const b of prepared.contentBatches||[])b.mesh.visible=false;
 }
 function configure({root,active=false,id='',base=null,range=null,heightHint=null,defaultMode=null}={}){
  if(defaultMode){if(!['auto','open','solid'].includes(defaultMode))throw Error('Invalid default reveal mode');mode=defaultMode;if(select)select.value=mode;}
  restore();prepared=root?prepare(root):null;enabled=active;modelId=id;floorBase=base;clipRange=range;lastKey=null;
  if(panel)panel.hidden=!enabled;
  if(enabled&&prepared){
   for(const b of prepared.batches)b.mesh.visible=false;
   for(const e of prepared.sources)e.mesh.layers.set(0);
   const focusY=base??heightHint??controls.target.y;
   for(const e of prepared.entries)e.kind=classifyOccluder({...e,minY:e.box.min.y,maxY:e.box.max.y,focusY});
   // Wall-mounted colour bands follow their host, avoiding floating stripes
   // when a wall opens while keeping bands on preserved columns.
   const hosts=prepared.entries.filter(e=>['wall','column'].includes(e.kind)&&! /identity.stripe|level.band/i.test(e.name));
   for(const e of prepared.entries.filter(e=>/identity.stripe|level.band/i.test(e.name))){
    const p=e.box.getCenter(new THREE.Vector3());let nearest=null,distance=.22;
    for(const h of hosts){const d=h.box.distanceToPoint(p);if(d<distance){nearest=h;distance=d;}}
    if(nearest)e.kind=nearest.kind==='column'?'content':'wall';
   }
   if(!range){
    batchCutawayContents(THREE,mergeGeometries,prepared);
    for(const b of prepared.contentBatches||[]){b.mesh.visible=true;for(const e of b.entries)e.mesh.layers.set(1);}
   }
  }
  update();invalidate();
 }
 function present(e,plane,hide=false){
  if(!e.clones)e.clones=(Array.isArray(e.original)?e.original:[e.original]).map(m=>{const c=m.clone();c.name=m.name+' | adaptive reveal';return c;});
  const originals=Array.isArray(e.original)?e.original:[e.original];
  for(let i=0;i<e.clones.length;i++){const m=e.clones[i],base=originals[i].clippingPlanes||[];m.clippingPlanes=[...base,plane];m.clipShadows=true;}
  e.mesh.material=Array.isArray(e.original)?e.clones:e.clones[0];e.mesh.visible=inFloor(e)&&!hide;e.revealed=true;
 }
 function inFloor(e){return e.visible&&(!clipRange||!(e.box.max.y<clipRange[0]||e.box.min.y>clipRange[1]));}
 function update(){
  if(!prepared)return;
  const focus=controls.target;
  // Solid or disabled presentation does not depend on the camera. Report a
  // change once, so the shadow map is not re-rendered on every orbit frame.
  const fixed=!enabled||mode==='solid';
  const key=fixed?['fixed',enabled,mode,modelId,clipRange?.join(',')].join('|'):[enabled,mode,modelId,...camera.position.toArray(),...camera.quaternion.toArray(),camera.fov,camera.aspect,...focus.toArray()].join('|');
  if(key===lastKey)return false;lastKey=key;
  if(fixed){
   // Keep the unbatched source architecture while examining a floor; restore
   // normal batching only when leaving the interior/floor context.
   for(const e of prepared.entries){e.mesh.material=e.original;e.mesh.visible=enabled?inFloor(e):e.visible;e.revealed=false;}
   latest={active:enabled,mode,model:modelId,revealed:0,preservedContents:prepared.entries.filter(e=>e.kind==='content').length};publish();return true;
  }
  dir.subVectors(camera.position,focus).normalize();
  // The reveal is an architectural vertical section, not the camera's tilted
  // focus plane. Camera pitch must never turn a full-height wall into a large
  // triangular shard. At the orbit pole retain the previous azimuth instead
  // of normalizing a zero horizontal vector.
  if(dir.x*dir.x+dir.z*dir.z>1e-8)wallDirection.set(dir.x,0,dir.z).normalize();
  revealPlane.normal.copy(wallDirection).negate();
  camera.updateMatrixWorld();frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const extent=prepared.bounds.getSize(new THREE.Vector3()),distance=camera.position.distanceTo(focus);
  const halfHeight=Math.min(Math.tan(camera.fov*Math.PI/360)*distance,Math.max(1.5,extent.length()*.40));
  const halfWidth=halfHeight*camera.aspect;
  // A pitched view includes surfaces behind the target's horizontal position.
  // Move the vertical section back by the projected half-height of this room
  // (or selected floor), instead of tilting it through the walls. This clears
  // the occupied focus zone while leaving distant walls as spatial context.
  const roomHeight=clipRange?clipRange[1]-clipRange[0]:extent.y;
  const focusDepth=Math.min(halfHeight,Math.max(1.2,roomHeight*.5))*Math.abs(dir.y);
  revealPlane.constant=wallDirection.dot(focus)-focusDepth+.025;
  right.set(1,0,0).applyQuaternion(camera.quaternion);up.set(0,1,0).applyQuaternion(camera.quaternion);
  // Broad rays sample the whole viewport, not just the target point. This
  // includes off-centre rooms and narrow louver slats. Segment ends are on the
  // focus plane, so far walls are retained as spatial context.
  const rays=[];
  for(const x of [-.95,-.63,-.32,0,.32,.63,.95])for(const y of [-.90,-.45,0,.45,.90]){
   end.copy(focus).addScaledVector(right,x*halfWidth).addScaledVector(up,y*halfHeight);
   const delta=end.clone().sub(camera.position);rays.push({direction:delta.normalize(),length:camera.position.distanceTo(end)});
  }
  const base=floorBase??prepared.bounds.min.y;stubPlane.constant=base+.45;
  let revealed=0,ceilings=0;const names=[];
  for(const e of prepared.entries){
   let opening=false,hide=false;
   const structural=e.kind==='wall'||e.kind==='ceiling';
   const inRange=!clipRange||!(e.box.max.y<clipRange[0]||e.box.min.y>clipRange[1]);
   if(structural&&e.visible&&inRange){
    if(mode==='open'){opening=true;hide=e.kind==='ceiling';}
    else{
     // Ray/box uses the immutable world bounds; hidden objects never disappear
     // from the test and cannot flicker back as the orbit passes a boundary.
     for(const r of rays){ray.set(camera.position,r.direction);if(ray.intersectBox(e.box,hit)&&hit.distanceTo(camera.position)<r.length-.03){opening=true;break;}}
     // Thin slats and mullions can fall between every ray. The full frustum
     // closes those gaps; the clipping plane still retains their far halves.
     e.box.getCenter(centre);const projectedRadius=(Math.abs(dir.x)*e.size.x+Math.abs(dir.y)*e.size.y+Math.abs(dir.z)*e.size.z)/2;
     if(dir.dot(centre.sub(focus))+projectedRadius>.025&&frustum.intersectsBox(e.box))opening=true;
     // Ceilings obstructing the view are lifted as complete pieces. Applying
     // the wall section to them leaves hovering half-slabs across the room.
     hide=opening&&e.kind==='ceiling';
    }
   }
   if(opening){present(e,mode==='open'?stubPlane:revealPlane,hide);revealed++;ceilings+=Number(e.kind==='ceiling');names.push(e.name);}
   else {if(e.revealed)e.mesh.material=e.original;e.mesh.visible=inFloor(e);e.revealed=false;}
  }
  latest={active:true,mode,model:modelId,revealed,ceilings,candidates:prepared.entries.filter(e=>e.kind==='wall'||e.kind==='ceiling').length,preservedContents:prepared.entries.filter(e=>e.kind==='content').length,batching:prepared.root.userData.cutawayBatching||null,names};publish();return true;
 }
 function publish(){if(diagnostics){diagnostics.value=JSON.stringify(latest);diagnostics.dataset.revealed=String(latest.revealed);diagnostics.dataset.model=modelId;diagnostics.dataset.mode=mode;}if(note)note.textContent=mode==='solid'?'כל הקירות מוצגים · אפשר להחזיר חשיפה אוטומטית':mode==='open'?'החללים פתוחים; נשארת מסגרת קיר נמוכה':'המעטפת הקרובה נפתחת כדי לראות פנימה';}
 function release(root){const record=cached.get(root);if(!record)return;if(prepared===record){restore();prepared=null;enabled=false;}for(const e of record.entries)for(const m of e.clones||[])m.dispose();cached.delete(root);}
 return {configure,restore,update,release,setMode(value){if(!['auto','open','solid'].includes(value))throw Error('Invalid reveal mode');mode=value;if(select)select.value=value;update();invalidate();},snapshot(){return structuredClone(latest);},inspect(){return prepared?.entries.map(e=>({name:e.name,kind:e.kind,box:e.box.clone(),size:e.size.clone(),mesh:e.mesh,revealed:e.revealed}))||[];}};
}
