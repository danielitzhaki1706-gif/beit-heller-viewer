import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// Merge only draw submissions. Preserve source meshes on a non-camera layer for collision and auditing.
export function batchStatic(root,dynamicNames=[]){
 root.updateMatrixWorld(true);
 const inverse=root.matrixWorld.clone().invert(),groups=new Map(),dynamic=new Set(dynamicNames);
 let originals=0;
 root.traverse(o=>{
 if(!o.isMesh||!o.visible||dynamic.has(o.name)||Array.isArray(o.material)||o.isSkinnedMesh||o.morphTargetInfluences)return;
 const matrix=inverse.clone().multiply(o.matrixWorld);
 // Mirrored objects retain their original render transform and winding.
 if(matrix.determinant()<0)return;
 const g=o.geometry.clone().applyMatrix4(matrix);
 const key=o.material.uuid+'|'+Object.keys(g.attributes).sort().join(',')+'|'+!!g.index;
 if(!groups.has(key))groups.set(key,{material:o.material,geometries:[]});
 groups.get(key).geometries.push(g);o.layers.set(1);originals++;
 });
 let batches=0;
 for(const {material,geometries}of groups.values()){
 const g=mergeGeometries(geometries,false);
 if(!g)throw Error('Static geometry batching failed');
 const m=new THREE.Mesh(g,material);m.name='Presentation_batch_'+batches++;
 m.receiveShadow=true;m.castShadow=!(material.transmission>.1)&&!material.transparent;root.add(m);
 geometries.forEach(g=>g.dispose());
 }
 return {originals,batches};
}
