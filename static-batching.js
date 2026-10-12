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
 const inverse=root.matrixWorld.clone().invert(),separate=new Set(separateNames),groups=new Map();
 const stats={sourceMeshes:0,separateMeshes:0,alphaSortedMeshes:0,unsupportedMeshes:0,batchedSourceMeshes:0,batches:0,drawSubmissionsBefore:0,drawSubmissionsAfter:0};
 const kept=[];
 const isSeparate=object=>{for(let o=object;o&&o!==root;o=o.parent)if(separate.has(o.name))return true;return false;};
 root.traverse(object=>{
  if(!object.isMesh)return;stats.sourceMeshes++;
  const material=object.material,geometry=object.geometry;
  const submissions=Array.isArray(material)?geometry.groups.length||material.length:1;stats.drawSubmissionsBefore+=submissions;
  const keep=reason=>{stats[reason]++;kept.push(object);stats.drawSubmissionsAfter+=submissions;};
  if(isSeparate(object)){keep('separateMeshes');return;}
  if(Array.isArray(material)||object.isSkinnedMesh||object.morphTargetInfluences||geometry.groups.length>1||geometry.drawRange.start!==0||Number.isFinite(geometry.drawRange.count)){keep('unsupportedMeshes');return;}
  if(material.transparent&&!(material.transmission>0&&material.opacity===1)){keep('alphaSortedMeshes');return;}
  let visible=true;for(let o=object;o&&o!==root;o=o.parent)visible&&=o.visible;
  const matrix=inverse.clone().multiply(object.matrixWorld);
  if(!visible||matrix.determinant()<=0||object.layers.mask!==1){keep('unsupportedMeshes');return;}
  const attributes=Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([name,a])=>`${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).join('|');
  const key=[material.uuid,attributes,!!geometry.index,object.castShadow,object.receiveShadow,object.renderOrder].join('|');
  if(!groups.has(key))groups.set(key,{material,objects:[],geometries:[],castShadow:object.castShadow,receiveShadow:object.receiveShadow,renderOrder:object.renderOrder});
  const group=groups.get(key);group.objects.push(object);group.geometries.push(geometry.clone().applyMatrix4(matrix));
 });
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
 stats.drawSubmissionsAfter+=stats.batches;
 stats.submissionReductionPercent=100*(1-stats.drawSubmissionsAfter/stats.drawSubmissionsBefore);
 root.userData.batching=stats;return stats;
}
