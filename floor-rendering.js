// A reversible display stage for existing, source-aligned floor models.
// No walls, rooms, connections, levels or floor areas are invented here.
const VERSION='r6-floor-stage-1';
const protectedFinish=/\bwater\b|reservoir.*surface|identity.stripe|level.band|signage|label|marking|road.paint|traffic|luminaire|diffuser|light.strip|emergency|exit.sign/i;
const glassFinish=/glass|glazing|glazed|transparent.storefront/i;

function contactTexture(THREE){
 const size=128,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=Math.abs((x+.5)/size*2-1),v=Math.abs((y+.5)/size*2-1);
  // A restrained soft footprint grounds the model without pretending to be
  // calculated occlusion; actual geometry also receives/casts normal shadows.
  const edge=Math.max(u,v),falloff=Math.max(0,1-edge*edge);
  const i=(y*size+x)*4;data[i]=48;data[i+1]=54;data[i+2]=50;data[i+3]=Math.round(255*.085*falloff*falloff);
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
 texture.name='R6 illustrative stage contact';texture.colorSpace=THREE.SRGBColorSpace;
 texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}

function finishRole(material){
 const name=material.name||'';
 if(material.isMeshBasicMaterial||material.alphaTest>0||material.alphaMap||material.emissiveIntensity>1||protectedFinish.test(name))return null;
 if(glassFinish.test(name))return 'glass';
 if(/sanitary|porcelain|ceramic|wall.tile|basin/i.test(name))return 'ceramic';
 if(/timber|wood|oak|teak|bamboo/i.test(name))return 'timber';
 if(/terrazzo|limestone|paving|stone/i.test(name))return 'mineral';
 if(/concrete/i.test(name))return 'concrete';
 if(/plaster|mineral.paint|pale.render/i.test(name))return 'plaster';
 if(/upholstery|fabric|carpet/i.test(name))return 'textile';
 if(/steel|metal|alumini|aluminu|hardware/i.test(name))return 'metal';
 return null;
}

function finishMaterial(source,role){
 // clone() retains the existing material-detail and clear-pane shader hooks.
 const material=source.clone();material.name=source.name;
 material.userData={...source.userData,r6FloorFinish:{version:VERSION,role}};
 const mapped=!!material.roughnessMap;
 if(role==='glass'){
  // Preserve transmission, opacity, alpha test, side and depth behavior. In
  // particular, a door inset or source water mask must never become opaque.
  material.roughness=Math.min(source.roughness,mapped?.95:.035);
  material.envMapIntensity=.92;
 }else if(role==='ceramic'){
  material.roughness=mapped?.40:.24;material.envMapIntensity=.78;
  material.normalScale?.multiplyScalar(.20);
 }else if(role==='timber'){
  material.roughness=mapped?.92:.47;material.envMapIntensity=.75;
 }else if(role==='mineral'){
  material.roughness=mapped?.92:.55;material.envMapIntensity=.72;
 }else if(role==='concrete'){
  material.roughness=mapped?1:.82;material.envMapIntensity=.55;
 }else if(role==='plaster'){
  material.roughness=mapped?1:.88;material.envMapIntensity=.50;
 }else if(role==='textile'){
  material.envMapIntensity=.55;
 }else if(role==='metal'){
  material.envMapIntensity=.78;
 }
 material.needsUpdate=true;return material;
}

function coherentSlab(THREE,mesh){
 const name=mesh.name.replace(/_/g,' ');
 if(!/^SOURCE FLOOR \| (registered floor slab|slab bottom)$/.test(name))return null;
 const source=mesh.geometry,position=source.getAttribute('position');if(!position)return null;
 source.computeBoundingBox();const size=source.boundingBox.getSize(new THREE.Vector3());
 // This correction is for the existing flat display slabs, never ramps,
 // walls, balcony finishes, terrain or source architectural coordinates.
 if(size.y>.0001||size.x<2||size.z<2)return null;
 const direction=/bottom$/.test(name)?-1:1,geometry=source.clone();
 const indices=source.index?Array.from(source.index.array):Array.from({length:position.count},(_,i)=>i);
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();let reversed=0;
 for(let i=0;i<indices.length;i+=3){
  a.fromBufferAttribute(position,indices[i]).applyMatrix4(mesh.matrixWorld);b.fromBufferAttribute(position,indices[i+1]).applyMatrix4(mesh.matrixWorld);c.fromBufferAttribute(position,indices[i+2]).applyMatrix4(mesh.matrixWorld);
  if(ab.subVectors(b,a).cross(ac.subVectors(c,a)).y*direction<0){[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];reversed++;}
 }
 geometry.setIndex(indices);
 const normal=new THREE.Vector3(0,direction,0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld).invert());
 const normals=new Float32Array(position.count*3);for(let i=0;i<position.count;i++)normal.toArray(normals,i*3);
 geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
 geometry.userData={...source.userData,r6FloorOrientation:{direction,reversed,positionsChanged:false,triangleFootprintsChanged:false}};
 return {mesh,original:source,display:geometry,reversed,direction};
}

function officeCeiling(THREE,record){
 if(!/^office-\d+$/.test(record.floor?.id||'')||!Number.isFinite(record.floor.base))return null;
 let slab=null;record.root.traverse(m=>{if(m.isMesh&&m.name.replace(/_/g,' ')==='SOURCE FLOOR | registered floor slab')slab=m;});
 if(!slab)return null;
 // The registered upper surface already excludes balcony polygons and
 // source shafts. It supplies the silhouette, not a new architectural plan.
 const group=new THREE.Group();group.name='R6 illustrative office ceiling';group.userData.presentationOnly=true;
 const y=record.floor.base+3.05,geometry=slab.geometry.clone();geometry.applyMatrix4(slab.matrixWorld);
 const p=geometry.getAttribute('position'),n=new Float32Array(p.count*3),indices=geometry.index?Array.from(geometry.index.array):Array.from({length:p.count},(_,i)=>i);
 for(let i=0;i<p.count;i++){p.setY(i,y);n[i*3+1]=-1;}
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();for(let i=0;i<indices.length;i+=3){a.fromBufferAttribute(p,indices[i]);b.fromBufferAttribute(p,indices[i+1]);c.fromBufferAttribute(p,indices[i+2]);if(b.sub(a).cross(c.sub(a)).y>0)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];}
 geometry.setIndex(indices);geometry.setAttribute('normal',new THREE.BufferAttribute(n,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 // A local bounce approximation keeps the downward face warm white. It
 // affects this illustrative finish only, without lifting the scene exposure.
 const finish=new THREE.MeshStandardMaterial({name:'R6 illustrative suspended ceiling finish',color:0xd3d5ce,roughness:.94,metalness:0,emissive:0xdddcd3,emissiveIntensity:.40});
 const ceiling=new THREE.Mesh(geometry,finish);ceiling.name='R6 proposed ceiling following registered floor silhouette';ceiling.receiveShadow=true;ceiling.castShadow=false;group.add(ceiling);
 // A small instanced set provides scale and orientation with two draw calls.
 // No added dynamic lights or shadow maps; illumination stays on the floor rig.
 const points=[],workstations=[],ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),origin=new THREE.Vector3();
 ray.layers.mask=slab.layers.mask; // Original slab can be hidden in a content batch's source layer.
 record.root.traverse(m=>{if(!m.isMesh||!/workstation|desk/i.test(m.name))return;const box=new THREE.Box3().setFromObject(m),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());if(size.y<.16&&Math.max(size.x,size.z)>1&&center.y>record.floor.base+.5&&center.y<record.floor.base+1.15)workstations.push(center);});
 workstations.sort((a,b)=>a.x-b.x||a.z-b.z);
 for(const point of workstations){const {x,z}=point;if(points.length>=5)break;if(points.some(p=>Math.hypot(p[0]-x,p[2]-z)<7))continue;
  let fits=true;for(const dx of [-1.05,0,1.05]){origin.set(x+dx,record.floor.base+1,z);ray.set(origin,down);if(!ray.intersectObject(slab,false).length){fits=false;break;}}
  if(fits)points.push([x,y-.04,z]);
 }
 const housingGeometry=new THREE.BoxGeometry(2.1,.065,.12),diffuserGeometry=new THREE.BoxGeometry(1.98,.012,.065),housingMaterial=new THREE.MeshStandardMaterial({name:'R6 proposed ceiling luminaire housing',color:0x59605d,roughness:.55,metalness:.3}),diffuserMaterial=new THREE.MeshStandardMaterial({name:'R6 proposed ceiling luminaire diffuser',color:0xfff9e9,emissive:0xffefd3,emissiveIntensity:.8,roughness:.6});
 const housing=new THREE.InstancedMesh(housingGeometry,housingMaterial,points.length),diffusers=new THREE.InstancedMesh(diffuserGeometry,diffuserMaterial,points.length),matrix=new THREE.Matrix4();
 points.forEach(([x,cy,z],i)=>{housing.setMatrixAt(i,matrix.makeTranslation(x,cy,z));diffusers.setMatrixAt(i,matrix.makeTranslation(x,cy-.038,z));});housing.name='R6 illustrative ceiling linear housings';diffusers.name='R6 illustrative ceiling luminous strips';group.add(housing,diffusers);group.visible=false;
 const ownedGeometry=[geometry,housingGeometry,diffuserGeometry],ownedMaterials=[finish,housingMaterial,diffuserMaterial];
 return {group,y,fixtures:points.length,ownedGeometry,ownedMaterials,basis:'Illustrative suspended ceiling at base+3.05; outline copied from registered slab with its existing balcony and shaft openings. Not a source ceiling plan.'};
}

export function createFloorRendering(THREE,{scene,renderer,lighting,invalidate=()=>{}}={}){
 if(!scene)throw Error('Floor rendering needs a scene');
 const records=new WeakMap(),liveRecords=new Set(),stage=new THREE.Group();stage.name='R6 floor presentation stage';stage.visible=false;
 stage.userData.presentationOnly=true;scene.add(stage);
 const planeGeometry=new THREE.PlaneGeometry(1,1);
 // A shadow catcher leaves the backdrop independent of key-light angle.
 // No depth write: the output pass keeps the flat backdrop's display colour.
 const groundMaterial=new THREE.ShadowMaterial({color:0x28332d,opacity:.19,depthWrite:false,toneMapped:false});
 groundMaterial.name='R6 studio surface · not site geometry';
 const ground=new THREE.Mesh(planeGeometry,groundMaterial);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;stage.add(ground);
 const contact=contactTexture(THREE),contactMaterial=new THREE.MeshBasicMaterial({map:contact,transparent:true,depthWrite:false,toneMapped:false});
 const shadow=new THREE.Mesh(planeGeometry,contactMaterial);shadow.rotation.x=-Math.PI/2;shadow.renderOrder=1;stage.add(shadow);
 let current=null,enabled=false,presentation='overview',cutawayMode='auto',disposed=false;

 function updateCeiling(){
  for(const record of liveRecords)if(record.ceiling)record.ceiling.group.visible=record===current&&enabled&&presentation==='inside'&&cutawayMode!=='open';
 }

 function sourceBounds(root){
  root.updateMatrixWorld(true);const bounds=new THREE.Box3();
  root.traverse(mesh=>{if(!mesh.isMesh||!mesh.geometry?.getAttribute('position'))return;
   // Source sheets and optional display extras must not enlarge the stage,
   // including a tag placed on their containing group instead of each mesh.
   for(let node=mesh;node;node=node.parent)if(node.userData.presentationOnly||node.userData.floorSourceUnderlay)return;
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
   bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  });
  if(bounds.isEmpty())throw Error('Floor model has no renderable bounds');return bounds;
 }
 function apply(record){
  if(record.applied)return; // Do not replace active adaptive-cutaway clones.
  for(const entry of record.entries)entry.mesh.material=entry.display;
  for(const entry of record.geometryEntries)entry.mesh.geometry=entry.display;
  record.applied=true;
 }
 function restore(record){
  if(!record?.applied)return;
  for(const entry of record.entries)entry.mesh.material=entry.original;
  for(const entry of record.geometryEntries)entry.mesh.geometry=entry.original;
  record.applied=false;
 }
 function prepare(root,{floor=null,mode='',region=null}={}){
  if(!root)throw Error('Floor rendering needs a root');
  let record=records.get(root);
  if(record){record.floor=floor;record.region=region;record.mode=mode||record.mode;return record.summary;}
  const bounds=sourceBounds(root),cache=new Map(),entries=[],geometryEntries=[],roles={};let protectedMaterials=0;
  // Exterior geometry remains exclusively under the established R5 path.
  if(mode!=='exterior')root.traverse(mesh=>{
   if(!mesh.isMesh)return;
   const orientation=coherentSlab(THREE,mesh);if(orientation)geometryEntries.push(orientation);
   const original=mesh.material,mats=Array.isArray(original)?original:[original];
   const refined=mats.map(source=>{
    if(cache.has(source))return cache.get(source);
    const role=finishRole(source);if(!role){cache.set(source,source);protectedMaterials++;return source;}
    const material=finishMaterial(source,role);cache.set(source,material);roles[role]=(roles[role]||0)+1;return material;
   });
   if(refined.some((m,i)=>m!==mats[i]))entries.push({mesh,original,display:Array.isArray(original)?refined:refined[0]});
  });
  record={root,floor,mode,region,bounds,entries,geometryEntries,materials:cache,applied:false,summary:{version:VERSION,mode,meshes:entries.length,materials:[...cache].filter(([a,b])=>a!==b).length,roles,protectedMaterials,geometryChanged:geometryEntries.length>0,positionsChanged:false,triangleFootprintsChanged:false,slabOrientation:geometryEntries.map(e=>({name:e.mesh.name,reversedTriangles:e.reversed,direction:e.direction})),transparencyChanged:false,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}}};
  records.set(root,record);liveRecords.add(record);
  // Preparation is intentionally before the first adaptive-cutaway cache.
  apply(record);return record.summary;
 }
 function setView({root,floor=null,region=null,presentation:next='overview'}={}){
  if(disposed)return;
  if(!['overview','plan','inside'].includes(next))throw Error('Invalid floor presentation');
  if(current&&current.root!==root)restore(current);
  const mode=region?.mode||(region?.kind==='interior'?'interior':'');
  if(!records.has(root))prepare(root,{floor,region,mode});
  current=records.get(root);current.floor=floor;current.region=region;presentation=next;apply(current);
  if(root.userData.dynamicFloorBounds)current.bounds=sourceBounds(root);
  if(next==='inside'&&!current.ceiling){current.ceiling=officeCeiling(THREE,current);if(current.ceiling)scene.add(current.ceiling.group);}
  updateCeiling();
  const {bounds}=current,size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  // Use actual deepest geometry, including B04 pits and water volumes. A
  // nominal floor elevation would slice off reservoirs or graded parking.
  const gap=Math.max(.045,Math.min(.12,size.length()*.0015)),baseY=bounds.min.y-gap;
  stage.position.set(center.x,baseY,center.z);
  const extent=Math.max(160,size.length()*7);ground.scale.set(extent,extent,1);
  shadow.position.y=.006;shadow.scale.set(Math.max(2,size.x*1.12),Math.max(2,size.z*1.12),1);
  shadow.visible=next!=='inside';stage.visible=enabled&&current.mode!=='exterior'&&next!=='inside';
  groundMaterial.opacity=current.mode==='basement-stack'?.10:.19;
  current.stageY=baseY;current.groundClearance=gap;
  lighting?.setMode(current.mode==='exterior'?'exterior':next==='inside'?'floor-inside':'floor-overview');
  if(renderer?.shadowMap)renderer.shadowMap.needsUpdate=true;invalidate();return snapshot();
 }
 function setVisible(value){enabled=!!value;if(current){if(enabled)apply(current);else restore(current);}stage.visible=enabled&&!!current&&current.mode!=='exterior'&&presentation!=='inside';updateCeiling();invalidate();}
 function setCutawayMode(value){if(cutawayMode===value)return;cutawayMode=value;updateCeiling();invalidate();}
 function snapshot(){return {version:VERSION,enabled,presentation,stageVisible:stage.visible,preparedRoots:liveRecords.size,mode:current?.mode||null,floor:current?.floor?.id||null,region:current?.region?.id||null,stageY:current?.stageY??null,modelMinY:current?.bounds.min.y??null,groundClearance:current?.groundClearance??null,materials:current?.summary||null,ceiling:current?.ceiling?{visible:current.ceiling.group.visible,y:current.ceiling.y,fixtures:current.ceiling.fixtures,basis:current.ceiling.basis}:null,artisticStage:true};}
 // Optional cleanup hook for a bounded model cache. Display clones are local
 // to this module; source materials and globally shared detail maps survive.
 function release(root){
  const record=records.get(root);if(!record)return;
  // A later cutaway.restore() may have reapplied its cached display material
  // after this module restored the source. Eviction must restore regardless
  // of the local applied flag, including materials on added content batches.
  for(const entry of record.entries)entry.mesh.material=entry.original;
  const originalGeometries=new Map(record.geometryEntries.map(e=>[e.display,e.original]));
  for(const entry of record.geometryEntries)entry.mesh.geometry=entry.original;
  record.applied=false;const originals=new Map([...record.materials].filter(([a,b])=>a!==b).map(([a,b])=>[b,a]));
  root.traverse(mesh=>{if(!mesh.isMesh)return;mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>originals.get(m)||m):originals.get(mesh.material)||mesh.material;if(originalGeometries.has(mesh.geometry))mesh.geometry=originalGeometries.get(mesh.geometry);});
  for(const material of originals.keys())material.dispose();
  for(const geometry of originalGeometries.keys())geometry.dispose();
  if(record.ceiling){scene.remove(record.ceiling.group);for(const g of record.ceiling.ownedGeometry)g.dispose();for(const m of record.ceiling.ownedMaterials)m.dispose();record.ceiling=null;}
  records.delete(root);liveRecords.delete(record);if(current===record){current=null;stage.visible=false;}
 }
 function dispose(){if(disposed)return;disposed=true;for(const record of [...liveRecords])release(record.root);scene.remove(stage);planeGeometry.dispose();groundMaterial.dispose();contactMaterial.dispose();contact.dispose();current=null;}
 return {prepare,setView,setVisible,setCutawayMode,snapshot,release,dispose};
}
