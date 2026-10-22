import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Derived from the walking viewer's verified static batcher. Only render
// submissions change; originals stay on the audit layer with their geometry.
// Conventional alpha blending stays separate so Three.js can sort each mesh.
export const EXTERIOR_SEPARATE_NODES=Object.freeze([
 'Building_part_0754', // P01 paving, replaced only when accepted context is on
 'Building_part_0735', // P01 neutral display base
 'Building_part_0101','Building_part_0102','Building_part_0105','Building_part_0107' // door leaves and sliding meeting piece
]);
export function batchExterior(root,separateNames=EXTERIOR_SEPARATE_NODES){
 root.updateMatrixWorld(true);
 const inverse=root.matrixWorld.clone().invert(),separate=new Set(separateNames),groups=new Map(),candidates=[];
 const stats={sourceMeshes:0,separateMeshes:0,alphaSortedMeshes:0,unsupportedMeshes:0,batchedSourceMeshes:0,batches:0,instancedSourceMeshes:0,instanceBatches:0,drawSubmissionsBefore:0,drawSubmissionsAfter:0};
 const kept=[];
 const isSeparate=object=>{for(let o=object;o&&o!==root;o=o.parent)if(separate.has(o.name))return true;return false;};
 root.traverse(object=>{
  if(!object.isMesh)return;stats.sourceMeshes++;
  const material=object.material,geometry=object.geometry;
  const submissions=Array.isArray(material)?geometry.groups.length||material.length:1;stats.drawSubmissionsBefore+=submissions;
  const keep=reason=>{stats[reason]++;kept.push(object);stats.drawSubmissionsAfter+=submissions;};
  if(isSeparate(object)){keep('separateMeshes');return;}
  if(Array.isArray(material)||object.isSkinnedMesh||object.isInstancedMesh||object.morphTargetInfluences||geometry.groups.length>1||geometry.drawRange.start!==0||Number.isFinite(geometry.drawRange.count)){keep('unsupportedMeshes');return;}
  if(material.transparent&&!(material.transmission>0&&material.opacity===1)){keep('alphaSortedMeshes');return;}
  let visible=true;for(let o=object;o&&o!==root;o=o.parent)visible&&=o.visible;
  const matrix=inverse.clone().multiply(object.matrixWorld);
  if(!visible||matrix.determinant()<=0||object.layers.mask!==1){keep('unsupportedMeshes');return;}
  candidates.push({object,matrix});
 });
 // Heavy geometry placed many times (trees) is drawn with GPU
 // instancing instead of being copied into a merged buffer: same single draw,
 // a fraction of the memory, and no long merge on the main thread.
 const shared=new Map();
 for(const c of candidates){const o=c.object,key=[o.geometry.uuid,o.material.uuid,o.castShadow,o.receiveShadow,o.renderOrder].join('|');if(!shared.has(key))shared.set(key,[]);shared.get(key).push(c);}
 const instanced=[];
 const triangles=g=>(g.index?g.index.count:g.attributes.position.count)/3;
 for(const list of shared.values()){
  // Light repeated parts still merge: per-material merges keep draw calls lowest.
  if(list.length<4||triangles(list[0].object.geometry)<1500)continue;
  const reference=list[0].object,mesh=new THREE.InstancedMesh(reference.geometry,reference.material,list.length);
  list.forEach((c,i)=>{mesh.setMatrixAt(i,c.matrix);c.instanced=true;});
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.computeBoundingBox();
  mesh.name='Exterior_instances_'+instanced.length;mesh.castShadow=reference.castShadow;mesh.receiveShadow=reference.receiveShadow;mesh.renderOrder=reference.renderOrder;
  mesh.userData.sourceNames=list.map(c=>c.object.name);mesh.userData.sourceUUIDs=list.map(c=>c.object.uuid);mesh.userData.presentationBatch=true;
  instanced.push({mesh,objects:list.map(c=>c.object)});
 }
 for(const {object,matrix,instanced:isInstanced}of candidates){
  if(isInstanced)continue;
  const material=object.material,geometry=object.geometry;
  const attributes=Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([name,a])=>`${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).join('|');
  const key=[material.uuid,attributes,!!geometry.index,object.castShadow,object.receiveShadow,object.renderOrder].join('|');
  if(!groups.has(key))groups.set(key,{material,objects:[],geometries:[],castShadow:object.castShadow,receiveShadow:object.receiveShadow,renderOrder:object.renderOrder});
  const group=groups.get(key);group.objects.push(object);group.geometries.push(geometry.clone().applyMatrix4(matrix));
 }
 // Build everything before changing source visibility, so a merge failure
 // leaves the source model renderable.
 const completed=[];
 try{for(const group of groups.values()){
  const geometry=mergeGeometries(group.geometries,false);if(!geometry)throw Error('Exterior batch geometry could not merge');
  const mesh=new THREE.Mesh(geometry,group.material);mesh.name='Exterior_batch_'+completed.length;
  mesh.castShadow=group.castShadow;mesh.receiveShadow=group.receiveShadow;mesh.renderOrder=group.renderOrder;
  mesh.userData.sourceNames=group.objects.map(o=>o.name);mesh.userData.sourceUUIDs=group.objects.map(o=>o.uuid);mesh.userData.presentationBatch=true;
  completed.push({mesh,objects:group.objects});
 }}catch(error){completed.forEach(({mesh})=>mesh.geometry.dispose());throw error;}
 finally{for(const group of groups.values())group.geometries.forEach(g=>g.dispose());}
 for(const {mesh,objects}of completed){for(const object of objects){object.layers.set(1);stats.batchedSourceMeshes++;}root.add(mesh);stats.batches++;}
 for(const {mesh,objects}of instanced){for(const object of objects){object.layers.set(1);stats.instancedSourceMeshes++;}root.add(mesh);stats.instanceBatches++;}
 stats.drawSubmissionsAfter+=stats.batches+stats.instanceBatches;
 stats.submissionReductionPercent=100*(1-stats.drawSubmissionsAfter/stats.drawSubmissionsBefore);
 root.userData.batching=stats;return stats;
}
