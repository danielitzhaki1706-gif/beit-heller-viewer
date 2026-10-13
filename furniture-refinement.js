// Presentation-only rounding of explicitly proposed furniture. Source GLBs,
// architectural geometry, mesh transforms and exact local bounds are retained.
// Rounded-box construction derived from three.js r180, Copyright (c) 2010-2025
// three.js authors, MIT license: ./vendor/three/LICENSE.
const VERSION='r4-furniture-1';
const roots=new WeakMap(),geometries=new Map();

export function classifyFurnitureRefinement(mesh){
 const name=(mesh.name||'').toLowerCase().replace(/_/g,' ').replace(/\.?\d{3,}$/,'');
 if(/^proposed chair \| (upholstered seat|back)$/.test(name))return 'chairCushion';
 if(/^r3 proposed lounge \| sofa (base|back)$/.test(name))return 'sofaCushion';
 if(/^proposed workstation \| oak desk$/.test(name)||/^r3 proposed (meeting|library|lounge) \| (timber table|reading table|coffee table)$/.test(name))return 'tabletop';
 if(/^balcony f\d+ (north|south) \| proposed balcony chair (seat|back)$/.test(name))return 'timberSeat';
 return null;
}

function provenCuboid(geometry,THREE){
 const p=geometry.getAttribute('position');if(!p||p.count<8||p.count>36)return null;
 if(geometry.morphAttributes.position?.length||geometry.getAttribute('skinIndex')||geometry.getAttribute('color'))return null;
 const indices=geometry.index,count=indices?indices.count:p.count;if(count!==36)return null;
 const bounds=new THREE.Box3().setFromBufferAttribute(p),size=bounds.getSize(new THREE.Vector3());
 if(Math.min(size.x,size.y,size.z)<.002)return null;
 const tolerance=Math.max(size.length()*1e-6,1e-6),corners=new Set();
 for(let i=0;i<p.count;i++){
  let corner=0;for(let axis=0;axis<3;axis++){
   const value=p.getComponent(i,axis),min=bounds.min.getComponent(axis),max=bounds.max.getComponent(axis);
   if(Math.abs(value-min)<=tolerance){}else if(Math.abs(value-max)<=tolerance)corner|=1<<axis;else return null;
  }corners.add(corner);
 }
 if(corners.size!==8)return null;
 const faces=[0,0,0,0,0,0];let area=0;
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
 for(let t=0;t<36;t+=3){
  a.fromBufferAttribute(p,indices?indices.getX(t):t);b.fromBufferAttribute(p,indices?indices.getX(t+1):t+1);c.fromBufferAttribute(p,indices?indices.getX(t+2):t+2);
  let face=-1;
  for(let axis=0;axis<3;axis++)for(let side=0;side<2;side++){
   const value=(side?bounds.max:bounds.min).getComponent(axis);
   if([a,b,c].every(v=>Math.abs(v.getComponent(axis)-value)<=tolerance))face=axis*2+side;
  }
  if(face<0)return null;faces[face]++;area+=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()/2;
 }
 if(faces.some(count=>count!==2)||Math.abs(area-2*(size.x*size.y+size.x*size.z+size.y*size.z))>Math.max(1e-6,area*1e-5))return null;
 return {bounds,size,center:bounds.getCenter(new THREE.Vector3())};
}

function roundedCuboid(box,scale,radius,THREE){
 const key=[...box.size.toArray(),...box.center.toArray(),...scale.toArray(),radius].map(n=>n.toFixed(6)).join('/');
 if(geometries.has(key))return geometries.get(key);
 // Odd subdivisions leave a broad, flat centre and two segments per curved
 // corner. The offset-sphere construction follows Three's RoundedBoxGeometry
 // r180 (MIT), using indexed buffers and preserving the source local centre.
 const segments=5,geometry=new THREE.BoxGeometry(1,1,1,segments,segments,segments),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
 const half=box.size.clone().multiply(scale).multiplyScalar(.5).addScalar(-radius),offset=.5/segments;
 const v=new THREE.Vector3(),normal=new THREE.Vector3();
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i);normal.set(v.x-Math.sign(v.x)*offset,v.y-Math.sign(v.y)*offset,v.z-Math.sign(v.z)*offset).normalize();
  p.setXYZ(i,(Math.sign(v.x)*half.x+normal.x*radius)/scale.x+box.center.x,(Math.sign(v.y)*half.y+normal.y*radius)/scale.y+box.center.y,(Math.sign(v.z)*half.z+normal.z*radius)/scale.z+box.center.z);
  // Normal inverse transform for the pre-scaled metric construction.
  normal.multiply(scale).normalize();n.setXYZ(i,normal.x,normal.y,normal.z);
 }
 geometry.clearGroups();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.name='R4 presentation rounded furniture';geometry.userData={r4FurnitureGeometry:VERSION};geometries.set(key,geometry);return geometry;
}

export function applyFurnitureRefinement(root,THREE){
 if(roots.has(root))return {...roots.get(root),cached:true};root.updateMatrixWorld(true);
 const stats={version:VERSION,meshes:0,candidates:0,refined:0,rejectedNonCuboid:0,rejectedMaterial:0,roles:{},trianglesBefore:0,trianglesAfter:0,maxLocalBoundsDelta:0,sourceAssetsModified:false,architecturalGeometryChanged:false,propGeometryChanged:false,transformsChanged:false};
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;stats.meshes++;const role=classifyFurnitureRefinement(mesh);if(!role)return;stats.candidates++;
  if(Array.isArray(mesh.material)||mesh.material.map||mesh.material.alphaTest>0||mesh.material.userData?.r4MaterialDetail||mesh.isSkinnedMesh){stats.rejectedMaterial++;return;}
  const box=provenCuboid(mesh.geometry,THREE);if(!box){stats.rejectedNonCuboid++;return;}
  const scale=new THREE.Vector3();mesh.getWorldScale(scale);scale.set(Math.abs(scale.x),Math.abs(scale.y),Math.abs(scale.z));if(Math.min(scale.x,scale.y,scale.z)<1e-6){stats.rejectedNonCuboid++;return;}
  const metric=box.size.clone().multiply(scale),requested={chairCushion:.025,sofaCushion:.055,tabletop:.006,timberSeat:.004}[role],radius=Math.min(requested,Math.min(metric.x,metric.y,metric.z)*.42);
  const geometry=roundedCuboid(box,scale,radius,THREE),delta=Math.max(box.bounds.min.distanceTo(geometry.boundingBox.min),box.bounds.max.distanceTo(geometry.boundingBox.max));
  if(delta>1e-5){stats.rejectedNonCuboid++;return;}
  const source=mesh.geometry;mesh.geometry=geometry;mesh.userData={...mesh.userData,r4FurnitureRefinement:{version:VERSION,role,radiusMetres:radius,localBoundsUnchanged:true,sourceGeometry:source.uuid}};
  stats.refined++;stats.roles[role]=(stats.roles[role]||0)+1;stats.trianglesBefore+=12;stats.trianglesAfter+=geometry.index.count/3;stats.maxLocalBoundsDelta=Math.max(stats.maxLocalBoundsDelta,delta);
 });
 stats.propGeometryChanged=stats.refined>0;root.userData.furnitureRefinement={...stats};roots.set(root,stats);return stats;
}
